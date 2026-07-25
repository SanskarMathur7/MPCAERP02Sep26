"""Routes · Tournament Budget Builder (Phase A · Auto Budget)

Workflow:
  Draft (Division Sec captures budget) → Submitted (sent to MPCA) →
    Approved (MPCA may revise total + head limits)
    OR Returned (with structured reason; division can re-submit)
    OR Rejected (terminal)

Variable items have their own approve/reject sub-workflow that MPCA can run
independently of the overall budget approval.
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, Request

from core.infra import db, api_router
from core.shared_services import next_seq  # H6 · atomic sequence
from core.scoping import get_scope, body_scope
from core.helpers import _create_notification
from models import (
    TournamentBudget, TournamentBudgetCreate, TournamentBudgetAction,
    TournamentBudgetStatus, VariableItemDecision, BudgetHeadAllocation,
    VariableBudgetItem, ApprovalStep,
)


# ─────────────── Helpers ───────────────

async def _next_tb_no(cycle: str) -> str:
    seq = await next_seq(f"tbudget:{cycle}", lambda: db.tournament_budgets.count_documents({"fiscal_cycle": cycle}))
    return f"TB-{cycle}-{seq:03d}"


def _append_tb_step(doc: dict, step: ApprovalStep, new_status: str) -> dict:
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    return {
        "approval_chain": chain,
        "status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def _tb_recipient(doc: dict, new_status: str):
    body_id = doc.get("body_id") or "MPCA"
    if new_status == "Submitted":
        return ("treasurer", "MPCA")   # MPCA Treasurer reviews tournament budgets
    if new_status in ("Approved", "Rejected", "Returned"):
        # Send back to originating division secretary
        return ("division-secretary", body_id)
    return None


async def _notify_for_tb(doc: dict, new_status: str, actor_name: Optional[str]) -> None:
    target = _tb_recipient(doc, new_status)
    if not target:
        return
    role_id, body_id = target
    title_map = {
        "Submitted": "Tournament budget submitted — awaiting MPCA approval",
        "Approved": "Tournament budget APPROVED by MPCA",
        "Rejected": "Tournament budget rejected",
        "Returned": "Tournament budget returned for revision",
    }
    severity_map = {"Rejected": "critical", "Returned": "warning"}
    msg = (
        f"{doc.get('budget_no')} · {doc.get('tournament_name')} · "
        f"{doc.get('body_name')} · proposed ₹{(doc.get('total_ceiling_inr') or 0):,.0f}"
    )
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=body_id,
        title=title_map.get(new_status, new_status),
        message=msg,
        link="/tournament-budgets",
        related_type="tournament_budget",
        related_id=doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )


# ─────────────── Read endpoints ───────────────

@api_router.get("/tournament-budgets", response_model=List[TournamentBudget])
async def list_tournament_budgets(
    request: Request,
    tournament_id: Optional[str] = None,
    body_id: Optional[str] = None,
    status: Optional[TournamentBudgetStatus] = None,
    fiscal_cycle: Optional[str] = None,
):
    q: dict = {}
    if tournament_id:
        q["tournament_id"] = tournament_id
    if body_id:
        q["body_id"] = body_id
    else:
        # Sprint M13: auto-scope
        q.update(body_scope(get_scope(request)))
    if status:
        q["status"] = status
    if fiscal_cycle:
        q["fiscal_cycle"] = fiscal_cycle
    docs = await db.tournament_budgets.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return docs


@api_router.get("/tournament-budgets/{bid}", response_model=TournamentBudget)
async def get_tournament_budget(bid: str):
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    return doc


@api_router.get("/tournament-budgets-stats/summary")
async def tb_stats(body_id: Optional[str] = None, fiscal_cycle: Optional[str] = None):
    q: dict = {}
    if body_id:
        q["body_id"] = body_id
    if fiscal_cycle:
        q["fiscal_cycle"] = fiscal_cycle
    docs = await db.tournament_budgets.find(q, {"_id": 0}).to_list(5000)

    def _sum(items, key):
        return float(sum(i.get(key) or 0 for i in items))

    approved = [d for d in docs if d["status"] == "Approved"]
    pending = [d for d in docs if d["status"] in ("Draft", "Submitted", "Returned")]
    rejected = [d for d in docs if d["status"] == "Rejected"]
    return {
        "total_budgets": len(docs),
        "approved_budgets": len(approved),
        "pending_budgets": len(pending),
        "rejected_budgets": len(rejected),
        "proposed_inr": _sum(docs, "total_ceiling_inr"),
        "approved_inr": float(sum(d.get("approved_total_inr") or 0 for d in approved)),
        "by_body": {},
    }


# ─────────────── Create (Draft) ───────────────

@api_router.post("/tournament-budgets", response_model=TournamentBudget)
async def create_tournament_budget(payload: TournamentBudgetCreate):
    # Resolve tournament + body snapshots
    tournament = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not tournament:
        raise HTTPException(404, "Tournament not found")
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body '{payload.body_id}' not found")
    # One pending/approved budget per (tournament, body) per cycle
    existing = await db.tournament_budgets.find_one({
        "tournament_id": payload.tournament_id,
        "body_id": payload.body_id,
        "fiscal_cycle": payload.fiscal_cycle,
        "status": {"$in": ["Draft", "Submitted", "Approved", "Returned"]},
    })
    if existing:
        raise HTTPException(
            409,
            f"A {existing['status']} budget already exists for this tournament + body. Edit that one or wait for it to be rejected.",
        )

    # Sanity: head allocations cannot exceed total
    head_total = sum(h.limit_inr for h in payload.head_allocations)
    if head_total > payload.total_ceiling_inr:
        raise HTTPException(
            422,
            f"Sum of head limits (₹{head_total:,.0f}) exceeds total ceiling (₹{payload.total_ceiling_inr:,.0f}).",
        )

    budget_no = await _next_tb_no(payload.fiscal_cycle)
    body_dump = payload.model_dump()
    # M26 Phase B · auto-link to participant row if one exists for this (tournament, body)
    if not body_dump.get("participant_body_code"):
        from routes.tournament_participations import resolve_participant_body_code
        body_dump["participant_body_code"] = await resolve_participant_body_code(
            payload.tournament_id, payload.body_id
        )
    budget = TournamentBudget(
        budget_no=budget_no,
        tournament_name=tournament.get("name"),
        body_name=body.get("name"),
        **body_dump,
    )
    await db.tournament_budgets.insert_one(budget.model_dump())
    if budget.participant_body_code:
        from routes.tournament_participations import link_budget_to_participant
        await link_budget_to_participant(payload.tournament_id, budget.participant_body_code, budget.id)
    return budget


@api_router.patch("/tournament-budgets/{bid}", response_model=TournamentBudget)
async def update_tournament_budget(bid: str, payload: TournamentBudgetCreate):
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    if doc["status"] not in ("Draft", "Returned"):
        raise HTTPException(409, f"Cannot edit a budget in status '{doc['status']}'. Only Draft / Returned are editable.")
    head_total = sum(h.limit_inr for h in payload.head_allocations)
    if head_total > payload.total_ceiling_inr:
        raise HTTPException(422, f"Sum of head limits (₹{head_total:,.0f}) exceeds total ceiling (₹{payload.total_ceiling_inr:,.0f}).")

    update = payload.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tournament_budgets.update_one({"id": bid}, {"$set": update})
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


# ─────────────── Workflow transitions ───────────────

@api_router.post("/tournament-budgets/{bid}/submit", response_model=TournamentBudget)
async def submit_tournament_budget(bid: str, action: TournamentBudgetAction):
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    if doc["status"] not in ("Draft", "Returned"):
        raise HTTPException(409, f"Cannot submit a budget in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Submitted", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Submitted", notes=action.notes,
    )
    update = _append_tb_step(doc, step, "Submitted")
    await db.tournament_budgets.update_one({"id": bid}, {"$set": update})
    updated = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    await _notify_for_tb(updated, "Submitted", action.actor_name)
    return updated


@api_router.post("/tournament-budgets/{bid}/approve", response_model=TournamentBudget)
async def approve_tournament_budget(bid: str, action: TournamentBudgetAction):
    """MPCA approves — may set a revised approved_total_inr and approved_head_allocations."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, f"Cannot approve a budget in status '{doc['status']}'.")

    approved_total = action.approved_total_inr if action.approved_total_inr is not None else doc["total_ceiling_inr"]
    if approved_total > doc["total_ceiling_inr"]:
        raise HTTPException(422, "Approved total cannot exceed proposed total ceiling.")

    approved_heads = action.approved_head_allocations
    if approved_heads is None:
        approved_heads = [BudgetHeadAllocation(**h) for h in (doc.get("head_allocations") or [])]
    head_sum = sum(h.limit_inr for h in approved_heads)
    if head_sum > approved_total:
        raise HTTPException(422, f"Approved head limits (₹{head_sum:,.0f}) exceed approved total (₹{approved_total:,.0f}).")

    notes = action.notes or ""
    if approved_total != doc["total_ceiling_inr"]:
        notes = f"[Approved ₹{approved_total:,.0f} of ₹{doc['total_ceiling_inr']:,.0f} proposed] {notes}".strip()

    step = ApprovalStep(
        stage="Approved", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Sanctioned", notes=notes,
    )
    update = _append_tb_step(doc, step, "Approved")
    update["approved_total_inr"] = approved_total
    update["approved_head_allocations"] = [h.model_dump() for h in approved_heads]
    await db.tournament_budgets.update_one({"id": bid}, {"$set": update})
    updated = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    await _notify_for_tb(updated, "Approved", action.actor_name)
    return updated


@api_router.post("/tournament-budgets/{bid}/return", response_model=TournamentBudget)
async def return_tournament_budget(bid: str, action: TournamentBudgetAction):
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, f"Cannot return a budget in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Returned", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Returned",
        notes=f"[{action.return_reason_code or 'OTHER'}] {action.return_reason_detail or action.notes or ''}".strip(),
    )
    update = _append_tb_step(doc, step, "Returned")
    update["return_reason_code"] = action.return_reason_code
    update["return_reason_detail"] = action.return_reason_detail
    await db.tournament_budgets.update_one({"id": bid}, {"$set": update})
    updated = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    await _notify_for_tb(updated, "Returned", action.actor_name)
    return updated


@api_router.post("/tournament-budgets/{bid}/reject", response_model=TournamentBudget)
async def reject_tournament_budget(bid: str, action: TournamentBudgetAction):
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    if doc["status"] in ("Approved", "Rejected"):
        raise HTTPException(409, f"Cannot reject a budget in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Rejected", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Rejected", notes=action.notes,
    )
    update = _append_tb_step(doc, step, "Rejected")
    await db.tournament_budgets.update_one({"id": bid}, {"$set": update})
    updated = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    await _notify_for_tb(updated, "Rejected", action.actor_name)
    return updated


# ─────────────── Variable Items sub-workflow ───────────────

@api_router.post("/tournament-budgets/{bid}/variables", response_model=TournamentBudget)
async def add_variable_item(bid: str, item: VariableBudgetItem):
    """Division (or MPCA) adds a new variable line item to an existing budget."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    if doc["status"] in ("Rejected",):
        raise HTTPException(409, "Cannot add items to a rejected budget.")
    items = (doc.get("variable_items") or []) + [item.model_dump()]
    await db.tournament_budgets.update_one(
        {"id": bid},
        {"$set": {"variable_items": items, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


@api_router.post("/tournament-budgets/{bid}/variables/{iid}/decide", response_model=TournamentBudget)
async def decide_variable_item(bid: str, iid: str, payload: VariableItemDecision):
    """MPCA approves or rejects a single variable item."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    items = list(doc.get("variable_items") or [])
    found = False
    for it in items:
        if it.get("id") == iid:
            if it.get("status") != "Pending":
                raise HTTPException(409, f"Variable item already decided ({it.get('status')}).")
            it["status"] = payload.decision
            it["decided_by"] = payload.decided_by
            it["decision_notes"] = payload.decision_notes
            it["decided_at"] = datetime.now(timezone.utc).isoformat()
            if payload.decision == "Approved":
                it["approved_amount_inr"] = payload.approved_amount_inr or it.get("proposed_amount_inr")
            found = True
            break
    if not found:
        raise HTTPException(404, f"Variable item '{iid}' not found")
    await db.tournament_budgets.update_one(
        {"id": bid},
        {"$set": {"variable_items": items, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


@api_router.delete("/tournament-budgets/{bid}")
async def delete_tournament_budget(bid: str):
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament budget not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, f"Cannot delete a budget in status '{doc['status']}'. Only Draft / Rejected are deletable.")
    await db.tournament_budgets.delete_one({"id": bid})
    return {"ok": True}
