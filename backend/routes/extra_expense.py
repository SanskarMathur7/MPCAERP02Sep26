"""Routes · Phase T5 — Extra Expense Approval Requests.

Division can request MPCA approval for expenses not covered by the auto-budget.
Every action is logged on tournament.expense_events (append-only ApprovalStep list).
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException

from core.infra import db, api_router
from core.helpers import _create_notification
from core.shared_services import write_audit_log, next_code
from models import (
    ExtraExpenseRequest, ExtraExpenseCreate, ExtraExpenseAction, ExtraExpenseStatus,
    ApprovalStep, BudgetHeadAllocation,
)


async def _next_eer_ref(cycle: str) -> str:
    # Sprint 0: use shared CODE generator (was: local counter).
    return await next_code("extra_expense", org_short="MPCA", fy=cycle)


async def _log_expense_event(tid: str, step: ApprovalStep) -> None:
    """Append an event to tournament.expense_events."""
    await db.tournaments.update_one(
        {"id": tid},
        {"$push": {"expense_events": step.model_dump()}},
    )


@api_router.get("/extra-expense-requests", response_model=List[ExtraExpenseRequest])
async def list_extra_expense_requests(
    tournament_id: Optional[str] = None,
    body_id: Optional[str] = None,
    status: Optional[ExtraExpenseStatus] = None,
):
    q: dict = {}
    if tournament_id: q["tournament_id"] = tournament_id
    if body_id: q["body_id"] = body_id
    if status: q["status"] = status
    docs = await db.extra_expense_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.get("/extra-expense-requests/{rid}", response_model=ExtraExpenseRequest)
async def get_extra_expense_request(rid: str):
    doc = await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Extra expense request not found")
    return doc


@api_router.post("/extra-expense-requests", response_model=ExtraExpenseRequest)
async def create_extra_expense_request(payload: ExtraExpenseCreate):
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if payload.amount_inr <= 0:
        raise HTTPException(422, "Amount must be positive")
    if not payload.justification or len(payload.justification.strip()) < 10:
        raise HTTPException(422, "Justification (min 10 chars) is required")
    cycle = t.get("fiscal_cycle") or "2025-26"
    req = ExtraExpenseRequest(
        request_ref=await _next_eer_ref(cycle),
        **payload.model_dump(),
    )
    await db.extra_expense_requests.insert_one(req.model_dump())
    return req


@api_router.patch("/extra-expense-requests/{rid}", response_model=ExtraExpenseRequest)
async def update_extra_expense_request(rid: str, patch: dict):
    doc = await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Extra expense request not found")
    if doc["status"] not in ("Draft", "Info_Requested"):
        raise HTTPException(409, f"Cannot edit in status {doc['status']}")
    allowed = {"head_code","head_label","is_new_head","amount_inr","justification","linked_invoice_id","linked_invoice_ref","supporting_file_url"}
    updates = {k: v for k, v in patch.items() if k in allowed}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    # If applicant re-edited after info request, move back to Draft
    if doc["status"] == "Info_Requested":
        updates["status"] = "Draft"
    await db.extra_expense_requests.update_one({"id": rid}, {"$set": updates})
    return await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})


@api_router.post("/extra-expense-requests/{rid}/submit", response_model=ExtraExpenseRequest)
async def submit_extra_expense_request(rid: str, action: ExtraExpenseAction):
    doc = await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Extra expense request not found")
    if doc["status"] not in ("Draft", "Info_Requested"):
        raise HTTPException(409, f"Cannot submit from status {doc['status']}")
    step = ApprovalStep(
        stage="Extra_Expense_Submitted",
        actor_post=action.actor_post or "Division Secretary",
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Submitted",
        notes=f"{doc['head_label']} · ₹{doc['amount_inr']:,.0f} · {action.notes or doc['justification'][:80]}",
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.extra_expense_requests.update_one({"id": rid}, {"$set": {
        "status": "Submitted",
        "approval_chain": chain,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    await _log_expense_event(doc["tournament_id"], step)
    # Sprint 0: also to global audit log
    await write_audit_log(
        module="extra_expense", record_id=rid, action="submit",
        actor={"name": action.actor_name, "role": action.actor_post, "body_id": action.actor_body_id},
        details={"head": doc["head_label"], "amount_inr": doc["amount_inr"]},
    )
    # Notify MPCA
    await _create_notification(
        recipient_role_id="secretary", recipient_body_id="MPCA",
        title=f"Extra expense approval requested · ₹{doc['amount_inr']:,.0f}",
        message=f"{doc['request_ref']} · {doc['head_label']} · {doc['body_id']} · {doc['justification'][:120]}",
        link=f"/tournaments/{doc['tournament_id']}",
        related_type="extra_expense_request", related_id=rid,
        severity="warning", kind="info",
    )
    return await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})


@api_router.post("/extra-expense-requests/{rid}/approve", response_model=ExtraExpenseRequest)
async def approve_extra_expense_request(rid: str, action: ExtraExpenseAction):
    """MPCA approves — adds/increases the head in the tournament budget."""
    doc = await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Extra expense request not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, f"Only submitted requests can be approved (got {doc['status']}).")

    approved = float(action.approved_amount_inr if action.approved_amount_inr is not None else doc["amount_inr"])
    if approved <= 0:
        raise HTTPException(422, "Approved amount must be positive")

    # Locate the tournament budget and update head allocation
    t = await db.tournaments.find_one({"id": doc["tournament_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    budget_id = t.get("auto_budget_id")
    if not budget_id:
        raise HTTPException(409, "No tournament budget to update — approve the plan first.")
    tb = await db.tournament_budgets.find_one({"id": budget_id}, {"_id": 0})
    if not tb:
        raise HTTPException(404, "Tournament budget not found")

    head_label = doc["head_label"]
    existing_heads = list(tb.get("approved_head_allocations") or tb.get("head_allocations") or [])
    hit = False
    for h in existing_heads:
        if h.get("head") == head_label:
            h["limit_inr"] = float(h.get("limit_inr") or 0) + approved
            hit = True
            break
    if not hit:
        # New head altogether
        existing_heads.append({"head": head_label, "limit_inr": approved, "notes": f"Added via {doc['request_ref']}"})

    new_ceiling = round(float(tb.get("approved_total_inr") or tb.get("total_ceiling_inr") or 0) + approved, 2)
    await db.tournament_budgets.update_one(
        {"id": budget_id},
        {"$set": {
            "approved_head_allocations": existing_heads,
            "head_allocations": existing_heads,
            "approved_total_inr": new_ceiling,
            "total_ceiling_inr": new_ceiling,
        }},
    )

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Extra_Expense_Approved",
        actor_post=action.actor_post or "Hon. Secretary",
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id or "MPCA",
        decision="Sanctioned",
        notes=f"{doc['head_label']} · sanctioned ₹{approved:,.0f} (requested ₹{doc['amount_inr']:,.0f}). Budget ceiling now ₹{new_ceiling:,.0f}. {action.notes or ''}",
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.extra_expense_requests.update_one({"id": rid}, {"$set": {
        "status": "Approved",
        "approved_amount_inr": approved,
        "approved_by": action.actor_name,
        "approved_at": now,
        "approval_chain": chain,
        "updated_at": now,
    }})
    await _log_expense_event(doc["tournament_id"], step)
    await write_audit_log(
        module="extra_expense", record_id=rid, action="approve",
        actor={"name": action.actor_name, "role": action.actor_post, "body_id": action.actor_body_id or "MPCA"},
        details={"head": doc["head_label"], "requested_inr": doc["amount_inr"], "approved_inr": approved, "new_ceiling_inr": new_ceiling},
    )

    # Notify Division
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=doc["body_id"],
        title=f"Extra expense APPROVED · ₹{approved:,.0f}",
        message=f"{doc['request_ref']} · {doc['head_label']} · sanctioned by {action.actor_name}",
        link=f"/tournaments/{doc['tournament_id']}",
        related_type="extra_expense_request", related_id=rid,
        severity="info", kind="info",
    )
    return await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})


@api_router.post("/extra-expense-requests/{rid}/reject", response_model=ExtraExpenseRequest)
async def reject_extra_expense_request(rid: str, action: ExtraExpenseAction):
    doc = await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Extra expense request not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, "Only submitted requests can be rejected.")
    if not action.notes:
        raise HTTPException(400, "Rejection reason required in notes.")
    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Extra_Expense_Rejected",
        actor_post=action.actor_post or "Hon. Secretary",
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id or "MPCA",
        decision="Rejected",
        notes=action.notes,
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.extra_expense_requests.update_one({"id": rid}, {"$set": {
        "status": "Rejected",
        "rejection_reason": action.notes,
        "approved_by": action.actor_name,
        "approved_at": now,
        "approval_chain": chain,
        "updated_at": now,
    }})
    await _log_expense_event(doc["tournament_id"], step)
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=doc["body_id"],
        title=f"Extra expense REJECTED · {doc['request_ref']}",
        message=action.notes or "See tournament expense log for details.",
        link=f"/tournaments/{doc['tournament_id']}",
        related_type="extra_expense_request", related_id=rid,
        severity="warning", kind="info",
    )
    return await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})


@api_router.post("/extra-expense-requests/{rid}/request-info", response_model=ExtraExpenseRequest)
async def request_info_on_extra_expense(rid: str, action: ExtraExpenseAction):
    """MPCA asks Division to supply more information / edit the request."""
    doc = await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Extra expense request not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, "Only submitted requests can be sent back for info.")
    if not action.notes:
        raise HTTPException(400, "Info-request notes required.")
    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Extra_Expense_Info_Requested",
        actor_post=action.actor_post or "Hon. Secretary",
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id or "MPCA",
        decision="Info_Requested",
        notes=action.notes,
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.extra_expense_requests.update_one({"id": rid}, {"$set": {
        "status": "Info_Requested",
        "info_request_notes": action.notes,
        "approval_chain": chain,
        "updated_at": now,
    }})
    await _log_expense_event(doc["tournament_id"], step)
    return await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})


@api_router.get("/tournaments/{tid}/expense-events")
async def get_tournament_expense_events(tid: str):
    """Return the full audit log of extra-expense requests on this tournament."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    return {
        "tournament_id": tid,
        "tournament_name": t.get("name"),
        "events": t.get("expense_events") or [],
    }
