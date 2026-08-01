"""M39r · Tournament Finance Console — MPCA-owned budget flow.

Replaces the old "Division writes budget first, MPCA approves" model with a
cleaner MPCA-owned flow that matters more for a state cricket association:

  1. MPCA (state office) enters input variables ONCE for the tournament.
  2. MPCA hits Prepare — the system generates one Host budget (full scheme
     allocation) and one Visitor budget per accepted visiting body (travel +
     DA + stay + contingency). Both are private Drafts on MPCA's console.
  3. MPCA hits Send — every Draft budget flips to Sent_To_Division. Divisions
     see an Action Centre card ("Budget received · needs your acceptance").
  4. Division taps Accept → status Accepted_By_Division.
     Or taps Request Revision (with a reason) → status Revision_Requested,
     back to MPCA for edits and re-send.
  5. MPCA taps Sanction on an Accepted_By_Division budget → status Approved
     (this is the terminal state; invoices/DA/claim spending unlocks).

State machine:
    Draft ─send─▶ Sent_To_Division ─div-accept─▶ Accepted_By_Division ─mpca-sanction─▶ Approved
                                  └─request-revision─▶ Revision_Requested ─(re-send)─▶ Sent_To_Division

The old submit/approve/return/reject endpoints are preserved for backward
compatibility (existing tournaments in flight keep working); this console
layer is used by the new UI.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Header
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router
from models import (
    ApprovalStep,
    BudgetHeadAllocation,
    TournamentBudget,
)


# ─────────────────────── Helpers ───────────────────────

# Keyword-based classifier borrowed from the old auto-split logic. Any head
# label that mentions travel/DA/food/stay/etc. is treated as a visitor head;
# everything else lives with the host.
_VISITOR_HEAD_KEYWORDS = (
    "travel", " ta ", " da ", "food", "stay", "hotel", "lodging",
    "boarding", "meal", "conveyance", "transport", "contingency",
)


def _is_visitor_head(label: str) -> bool:
    l = f" {(label or '').lower()} "
    return any(k in l for k in _VISITOR_HEAD_KEYWORDS)


async def _next_budget_no(cycle: str) -> str:
    count = await db.tournament_budgets.count_documents({"fiscal_cycle": cycle})
    return f"TB-{cycle}-{count + 1:03d}"


def _append_chain(doc: dict, step: ApprovalStep, new_status: str) -> Dict[str, Any]:
    chain = list(doc.get("approval_chain") or []) + [step.model_dump()]
    return {
        "status": new_status,
        "approval_chain": chain,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def _push_notification(*, recipient_body_id: str, recipient_role_id: str,
                             title: str, message: str, link: str,
                             related_type: str, related_id: str,
                             severity: str = "info", kind: str = "info") -> None:
    """Minimal notify — the Action Centre reads state directly, but push a
    notification for the bell/toast side too."""
    try:
        from routes.notifications import add_notification
        await add_notification(
            recipient_role_id=recipient_role_id,
            recipient_body_id=recipient_body_id,
            title=title, message=message, link=link,
            related_type=related_type, related_id=related_id,
            severity=severity, kind=kind,
        )
    except Exception:  # noqa
        return


# ─────────────────────── Payloads ───────────────────────

class PreparePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    input_variables: Optional[Dict[str, Any]] = None   # if provided, saved to tournament first
    prepared_by_name: Optional[str] = None


class SendPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: Optional[str] = None
    actor_post: Optional[str] = None
    only_budget_ids: Optional[List[str]] = None        # if provided, send only these; else all Draft/Revision_Requested for this tid


class DivisionAcceptPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_post: Optional[str] = None
    actor_body_id: Optional[str] = None
    notes: Optional[str] = None


class RevisionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_post: Optional[str] = None
    actor_body_id: Optional[str] = None
    reason: str = Field(..., min_length=3)


class SanctionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_post: Optional[str] = None
    actor_body_id: str = "MPCA"
    approved_total_inr: Optional[float] = None
    approved_head_allocations: Optional[List[BudgetHeadAllocation]] = None
    notes: Optional[str] = None


# ─────────────────────── Endpoints ───────────────────────

@api_router.post("/tournaments/{tid}/finance/prepare-budgets")
async def prepare_budgets(tid: str, payload: PreparePayload):
    """MPCA one-shot: build the Host budget + one Visitor budget per accepted
    participant. Anything already Draft (or Revision_Requested) for a body is
    replaced; Sent/Accepted/Approved budgets are preserved."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    # Save master IVs if the caller sent them
    if payload.input_variables:
        await db.tournaments.update_one(
            {"id": tid}, {"$set": {"input_variables": payload.input_variables}},
        )
        t["input_variables"] = payload.input_variables

    input_vars = t.get("input_variables") or {}
    if not input_vars:
        raise HTTPException(400, "Set the tournament's input variables before preparing budgets.")

    scheme_code = t.get("scheme_code")
    if not scheme_code:
        raise HTTPException(400, "Pick a reimbursement scheme on the tournament before preparing budgets.")
    cycle = t.get("fiscal_cycle") or "2025-26"

    # Compute the full allocation once
    from routes.scheme_calc import compute_budget, ComputeRequest
    preview = await compute_budget(scheme_code, ComputeRequest(inputs=input_vars))
    full_heads = preview.get("head_allocations") or []
    if not full_heads:
        raise HTTPException(422, "Scheme returned no heads for these input variables. Check inputs.")

    visitor_heads = [h for h in full_heads if _is_visitor_head(h["head"])]
    if not visitor_heads:
        visitor_heads = [{
            "head": "Team Travel Subsidy",
            "limit_inr": round(preview.get("total_ceiling_inr", 0) * 0.20, 2),
            "formula": "20% of total ceiling (fallback)",
        }]

    # Fetch participants (accepted or pending, not removed)
    participants = await db.tournament_participations.find({
        "tournament_id": tid,
        "removed_at": None,
        "acceptance_status": {"$in": ["Accepted", "Pending"]},
    }, {"_id": 0}).to_list(500)
    if not participants:
        raise HTTPException(400, "Add participants (Host + Visitors) before preparing budgets.")

    created: List[Dict[str, Any]] = []
    replaced: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for p in participants:
        body_code = p.get("body_code")
        role = p.get("role", "Visitor")

        # If a live (post-Draft) budget exists, DON'T replace — preserve the flow
        live = await db.tournament_budgets.find_one({
            "tournament_id": tid,
            "body_id": body_code,
            "fiscal_cycle": cycle,
            "status": {"$in": [
                "Submitted", "Approved", "Sent_To_Division",
                "Accepted_By_Division",
            ]},
        }, {"_id": 0})
        if live:
            skipped.append({
                "body_code": body_code, "role": role,
                "budget_no": live.get("budget_no"),
                "reason": f"already {live.get('status')}",
            })
            continue

        # Kill any pre-existing Draft / Revision_Requested for this body so we
        # can rebuild cleanly from the fresh IVs
        old_draft = await db.tournament_budgets.find_one({
            "tournament_id": tid,
            "body_id": body_code,
            "fiscal_cycle": cycle,
            "status": {"$in": ["Draft", "Revision_Requested", "Returned"]},
        }, {"_id": 0})
        if old_draft:
            await db.tournament_budgets.delete_one({"id": old_draft["id"]})
            replaced.append({"body_code": body_code, "budget_no": old_draft.get("budget_no")})

        heads_for_this = full_heads if role == "Host" else visitor_heads
        head_allocs = [BudgetHeadAllocation(
            head=h["head"], limit_inr=float(h["limit_inr"]),
            notes=h.get("formula"),
        ) for h in heads_for_this]
        total = round(sum(h.limit_inr for h in head_allocs), 2)

        body = await db.bodies.find_one({"code": body_code}, {"_id": 0})
        tb = TournamentBudget(
            budget_no=await _next_budget_no(cycle),
            tournament_id=tid,
            tournament_name=t.get("name"),
            body_id=body_code,
            body_name=(body or {}).get("name", body_code),
            fiscal_cycle=cycle,
            head_allocations=[h.model_dump() for h in head_allocs],
            total_ceiling_inr=total,
            status="Draft",                                   # MPCA is still preparing
            notes=(f"MPCA prepared · {role} allocation · {scheme_code} · "
                   f"{len(head_allocs)} heads · ₹{total:,.0f}"),
            participant_body_code=body_code,
            input_variables_snapshot=input_vars,
            prepared_by_name=payload.prepared_by_name,
            role_flavour="Host" if role == "Host" else "Visitor",
        )
        await db.tournament_budgets.insert_one(tb.model_dump())
        # Link to participant row for cross-nav
        try:
            from routes.tournament_participations import link_budget_to_participant
            await link_budget_to_participant(tid, body_code, tb.id)
        except Exception:  # noqa
            pass
        created.append({
            "budget_id": tb.id, "budget_no": tb.budget_no,
            "body_code": body_code, "role": role,
            "total_inr": total, "heads_count": len(head_allocs),
        })

    return {
        "tournament_id": tid, "scheme_code": scheme_code,
        "created": created, "replaced": replaced, "skipped": skipped,
        "created_count": len(created), "replaced_count": len(replaced),
        "skipped_count": len(skipped),
    }


@api_router.post("/tournaments/{tid}/finance/send-budgets")
async def send_budgets(tid: str, payload: SendPayload):
    """MPCA flips prepared Drafts to Sent_To_Division. Also handles the
    'send-again' case for Revision_Requested rows."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    q: Dict[str, Any] = {
        "tournament_id": tid,
        "status": {"$in": ["Draft", "Revision_Requested"]},
    }
    if payload.only_budget_ids:
        q["id"] = {"$in": payload.only_budget_ids}
    docs = await db.tournament_budgets.find(q, {"_id": 0}).to_list(500)
    if not docs:
        raise HTTPException(400, "No draft budgets to send. Prepare budgets first.")

    now = datetime.now(timezone.utc).isoformat()
    sent: List[Dict[str, Any]] = []
    for d in docs:
        step = ApprovalStep(
            stage="Sent_To_Division",
            actor_post=payload.actor_post or "MPCA_Secretary",
            actor_name=payload.actor_name,
            actor_body_id="MPCA",
            decision="Submitted",
            notes=(f"Prepared ₹{d.get('total_ceiling_inr', 0):,.0f} for "
                   f"{d.get('body_id')} — awaiting Division acceptance."),
        )
        upd = _append_chain(d, step, "Sent_To_Division")
        upd["sent_at"] = now
        await db.tournament_budgets.update_one({"id": d["id"]}, {"$set": upd})
        sent.append({
            "budget_id": d["id"], "budget_no": d.get("budget_no"),
            "body_code": d.get("body_id"), "total_inr": d.get("total_ceiling_inr"),
        })
        # Notify the Division
        await _push_notification(
            recipient_body_id=d["body_id"],
            recipient_role_id="secretary",
            title=f"Budget received · {t.get('name')}",
            message=(f"MPCA has sent ₹{d.get('total_ceiling_inr', 0):,.0f} "
                     f"for your acceptance. Open Action Centre to accept or "
                     f"request revision."),
            link=f"/tournament-budgets/{d['id']}",
            related_type="tournament_budget", related_id=d["id"],
            severity="info", kind="info",
        )

    return {
        "tournament_id": tid, "sent": sent, "sent_count": len(sent),
    }


@api_router.post("/tournament-budgets/{bid}/division-accept", response_model=TournamentBudget)
async def division_accept(bid: str, payload: DivisionAcceptPayload,
                          x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code")):
    """Division taps Accept on the MPCA-sent budget."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Budget not found")
    if doc["status"] != "Sent_To_Division":
        raise HTTPException(409, f"Cannot accept a budget in status '{doc['status']}'. Only Sent_To_Division is acceptable.")

    # Scope guard: only the target Division (or MPCA on behalf) may accept
    body_id = doc.get("body_id")
    if x_user_body_code and x_user_body_code not in (body_id, "MPCA"):
        raise HTTPException(403, f"Only {body_id} can accept this budget.")

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Accepted_By_Division",
        actor_post=payload.actor_post or "Division_Secretary",
        actor_name=payload.actor_name,
        actor_body_id=payload.actor_body_id or body_id,
        decision="Recommended",
        notes=payload.notes,
    )
    upd = _append_chain(doc, step, "Accepted_By_Division")
    upd["division_accepted_by"] = payload.actor_name
    upd["division_accepted_at"] = now
    await db.tournament_budgets.update_one({"id": bid}, {"$set": upd})

    # Notify MPCA — waiting for final sanction
    await _push_notification(
        recipient_body_id="MPCA",
        recipient_role_id="secretary",
        title=f"Budget accepted by {body_id}",
        message=(f"{doc.get('body_name') or body_id} accepted the budget for "
                 f"'{doc.get('tournament_name')}'. Awaiting your final sanction."),
        link=f"/tournament-budgets/{bid}",
        related_type="tournament_budget", related_id=bid,
        severity="info", kind="info",
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


@api_router.post("/tournament-budgets/{bid}/request-revision", response_model=TournamentBudget)
async def request_revision(bid: str, payload: RevisionPayload,
                           x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code")):
    """Division asks MPCA to revise the sent budget."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Budget not found")
    if doc["status"] != "Sent_To_Division":
        raise HTTPException(409, f"Cannot request revision on a budget in status '{doc['status']}'.")
    body_id = doc.get("body_id")
    if x_user_body_code and x_user_body_code not in (body_id, "MPCA"):
        raise HTTPException(403, f"Only {body_id} can request revision on this budget.")

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Revision_Requested",
        actor_post=payload.actor_post or "Division_Secretary",
        actor_name=payload.actor_name,
        actor_body_id=payload.actor_body_id or body_id,
        decision="Returned",
        notes=payload.reason,
    )
    upd = _append_chain(doc, step, "Revision_Requested")
    upd["revision_requested_by"] = payload.actor_name
    upd["revision_requested_at"] = now
    upd["revision_reason"] = payload.reason
    await db.tournament_budgets.update_one({"id": bid}, {"$set": upd})

    await _push_notification(
        recipient_body_id="MPCA",
        recipient_role_id="secretary",
        title=f"Budget revision requested · {body_id}",
        message=f"{doc.get('body_name') or body_id}: {payload.reason[:180]}",
        link=f"/tournament-budgets/{bid}",
        related_type="tournament_budget", related_id=bid,
        severity="warning", kind="warning",
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


@api_router.post("/tournament-budgets/{bid}/sanction", response_model=TournamentBudget)
async def sanction(bid: str, payload: SanctionPayload):
    """MPCA final sanction. Terminal state — spending unlocks."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Budget not found")
    if doc["status"] != "Accepted_By_Division":
        raise HTTPException(409, f"Cannot sanction a budget in status '{doc['status']}'. Division must accept first.")

    approved_total = (payload.approved_total_inr if payload.approved_total_inr is not None
                      else doc["total_ceiling_inr"])
    if approved_total > doc["total_ceiling_inr"]:
        raise HTTPException(422, "Approved total cannot exceed proposed total.")

    approved_heads = payload.approved_head_allocations
    if approved_heads is None:
        approved_heads = [BudgetHeadAllocation(**h) for h in (doc.get("head_allocations") or [])]
    head_sum = sum(h.limit_inr for h in approved_heads)
    if head_sum > approved_total:
        raise HTTPException(422, f"Head limits (₹{head_sum:,.0f}) exceed approved total (₹{approved_total:,.0f}).")

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Approved",
        actor_post=payload.actor_post or "MPCA_Secretary",
        actor_name=payload.actor_name,
        actor_body_id=payload.actor_body_id,
        decision="Sanctioned",
        notes=payload.notes or f"Sanctioned ₹{approved_total:,.0f}.",
    )
    upd = _append_chain(doc, step, "Approved")
    upd["approved_total_inr"] = float(approved_total)
    upd["approved_head_allocations"] = [h.model_dump() for h in approved_heads]
    upd["sanctioned_by"] = payload.actor_name
    upd["sanctioned_at"] = now
    await db.tournament_budgets.update_one({"id": bid}, {"$set": upd})

    await _push_notification(
        recipient_body_id=doc["body_id"],
        recipient_role_id="secretary",
        title=f"Budget SANCTIONED · {doc.get('tournament_name')}",
        message=f"₹{approved_total:,.0f} approved by MPCA. You may now upload invoices.",
        link=f"/tournament-budgets/{bid}",
        related_type="tournament_budget", related_id=bid,
        severity="info", kind="info",
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


# ─────────────────────── Status matrix (per-tournament) ───────────────────────

@api_router.get("/tournaments/{tid}/finance/matrix")
async def finance_matrix(tid: str):
    """One-row-per-body matrix for the MPCA console. Renders:
       body · role · budget_status · totals · division response · MPCA action ·
       spending totals · claim status."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    parts = await db.tournament_participations.find({
        "tournament_id": tid, "removed_at": None,
    }, {"_id": 0}).to_list(500)

    rows: List[Dict[str, Any]] = []
    for p in parts:
        body_code = p.get("body_code")
        role = p.get("role", "Visitor")
        body = await db.bodies.find_one({"code": body_code}, {"_id": 0})

        # Latest budget for this (tournament, body) — prefer live over dead
        budget = await db.tournament_budgets.find_one(
            {"tournament_id": tid, "body_id": body_code},
            {"_id": 0}, sort=[("created_at", -1)],
        )

        # Spending: sum invoices + extras + DA (approved/submitted)
        inv_agg = await db.tournament_invoices.aggregate([
            {"$match": {
                "tournament_id": tid, "body_id": body_code,
                "status": {"$in": ["Approved", "Submitted"]},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$total_inr"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        inv_total = float((inv_agg[0].get("total") if inv_agg else 0) or 0)
        inv_count = int((inv_agg[0].get("count") if inv_agg else 0) or 0)

        extras_agg = await db.extra_expense_requests.aggregate([
            {"$match": {
                "tournament_id": tid, "body_id": body_code, "status": "Approved",
            }},
            {"$group": {"_id": None, "total": {"$sum": "$approved_amount_inr"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        extras_total = float((extras_agg[0].get("total") if extras_agg else 0) or 0)

        da_agg = await db.match_official_da.aggregate([
            {"$match": {
                "tournament_id": tid, "status": "Approved",
            }},
            {"$group": {"_id": None, "total": {"$sum": "$total_inr"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        # DA totals belong to the host by convention, but reflect on all rows as info
        da_total = float((da_agg[0].get("total") if da_agg else 0) or 0)

        # Reimbursement claim
        claim = await db.tournament_reimbursement_claims.find_one(
            {"tournament_id": tid, "body_id": body_code},
            {"_id": 0}, sort=[("created_at", -1)],
        )

        rows.append({
            "body_code": body_code,
            "body_name": (body or {}).get("name", body_code),
            "role": role,
            "iv_set": bool(t.get("input_variables")),
            "budget_id": (budget or {}).get("id"),
            "budget_no": (budget or {}).get("budget_no"),
            "budget_status": (budget or {}).get("status"),
            "budget_total_inr": float((budget or {}).get("total_ceiling_inr") or 0),
            "approved_total_inr": (budget or {}).get("approved_total_inr"),
            "sent_at": (budget or {}).get("sent_at"),
            "division_accepted_at": (budget or {}).get("division_accepted_at"),
            "revision_reason": (budget or {}).get("revision_reason"),
            "sanctioned_at": (budget or {}).get("sanctioned_at"),
            "role_flavour": (budget or {}).get("role_flavour"),
            "invoice_count": inv_count,
            "invoice_total_inr": inv_total,
            "extras_total_inr": extras_total,
            "da_total_inr": da_total if role == "Host" else 0.0,
            "claim_id": (claim or {}).get("id"),
            "claim_ref": (claim or {}).get("claim_ref"),
            "claim_status": (claim or {}).get("status"),
            "claim_approved_inr": (claim or {}).get("approved_amount_inr"),
            # Derived hint for the UI: what should this row's owner do next?
            "next_action_for": _next_action_hint((budget or {}), (claim or {}), role),
        })

    return {
        "tournament_id": tid,
        "tournament_name": t.get("name"),
        "scheme_code": t.get("scheme_code"),
        "fiscal_cycle": t.get("fiscal_cycle") or "2025-26",
        "input_variables": t.get("input_variables") or {},
        "input_vars_set": bool(t.get("input_variables")),
        "rows": rows,
        "row_count": len(rows),
    }


def _next_action_hint(budget: dict, claim: dict, role: str) -> Dict[str, str]:
    """Returns {waiting_on, action} — a UI-friendly cue for who needs to act."""
    bs = (budget or {}).get("status")
    if not budget:
        return {"waiting_on": "MPCA", "action": "Prepare budget"}
    if bs == "Draft":
        return {"waiting_on": "MPCA", "action": "Send to Division"}
    if bs == "Sent_To_Division":
        return {"waiting_on": (budget or {}).get("body_id", "Division"),
                "action": "Accept / Request revision"}
    if bs == "Revision_Requested":
        return {"waiting_on": "MPCA", "action": "Revise & re-send"}
    if bs == "Accepted_By_Division":
        return {"waiting_on": "MPCA", "action": "Final sanction"}
    if bs in ("Approved",):
        # After sanction, look at claim
        cs = (claim or {}).get("status")
        if not claim:
            return {"waiting_on": (budget or {}).get("body_id", "Division"),
                    "action": "Upload invoices"}
        if cs in ("Draft", "Rejected"):
            return {"waiting_on": (budget or {}).get("body_id", "Division"),
                    "action": "Submit reimbursement claim"}
        if cs == "Submitted":
            return {"waiting_on": "MPCA", "action": "Review claim"}
        if cs == "Under_Review":
            return {"waiting_on": "MPCA", "action": "Approve / Reject claim"}
        if cs == "Approved":
            return {"waiting_on": "MPCA", "action": "Disburse & record receipt"}
    if bs == "Rejected":
        return {"waiting_on": "MPCA", "action": "Re-prepare"}
    return {"waiting_on": "MPCA", "action": "Review"}
