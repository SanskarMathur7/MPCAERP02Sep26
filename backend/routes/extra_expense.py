"""Routes · Phase T5 — Extra Expense Approval Requests.

Division can request MPCA approval for expenses not covered by the auto-budget.
Every action is logged on tournament.expense_events (append-only ApprovalStep list).
"""
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from core.helpers import _create_notification
from core.infra import api_router, db
from core.scoping import body_scope, get_scope
from core.shared_services import next_code, write_audit_log
from models import (
    ApprovalStep,
    ExtraExpenseAction,
    ExtraExpenseCreate,
    ExtraExpenseRequest,
    ExtraExpenseStatus,
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


@api_router.get("/extra-expense-requests", response_model=list[ExtraExpenseRequest])
async def list_extra_expense_requests(
    request: Request,
    tournament_id: str | None = None,
    body_id: str | None = None,
    status: ExtraExpenseStatus | None = None,
):
    q: dict = {}
    if tournament_id: q["tournament_id"] = tournament_id
    if body_id: q["body_id"] = body_id
    else:
        # M13: auto-scope. MPCA Secretary must ALSO see submitted requests from Divisions.
        scope = get_scope(request)
        if scope.is_state:
            pass  # sees all
        else:
            q.update(body_scope(scope))
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
async def create_extra_expense_request(payload: ExtraExpenseCreate, request: Request):
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if payload.amount_inr <= 0:
        raise HTTPException(422, "Amount must be positive")
    if not payload.justification or len(payload.justification.strip()) < 10:
        raise HTTPException(422, "Justification (min 10 chars) is required")
    # M39z.a · MPCA is the approver, not the requester. Only Division/District
    # personas can raise Extra Expense requests. State personas are blocked.
    scope = get_scope(request)
    if scope.body_type == "State":
        raise HTTPException(
            403,
            "MPCA cannot raise Extra Expense requests — only Divisions and Districts can. "
            "MPCA reviews and sanctions (Approve / Approve-with-variation / Reject) the submissions.",
        )
    cycle = t.get("fiscal_cycle") or "2025-26"
    req = ExtraExpenseRequest(
        request_ref=await _next_eer_ref(cycle),
        **payload.model_dump(),
    )
    await db.extra_expense_requests.insert_one(req.model_dump())
    return req


class ExtraExpensePatch(BaseModel):
    # M3 · typed patch body; extra keys ignored (as before), amount validated >= 0.
    model_config = ConfigDict(extra="ignore")
    head_code: str | None = None
    head_label: str | None = None
    is_new_head: bool | None = None
    amount_inr: float | None = Field(None, ge=0)
    justification: str | None = None
    linked_invoice_id: str | None = None
    linked_invoice_ref: str | None = None
    supporting_file_url: str | None = None


@api_router.patch("/extra-expense-requests/{rid}", response_model=ExtraExpenseRequest)
async def update_extra_expense_request(rid: str, patch: ExtraExpensePatch):
    doc = await db.extra_expense_requests.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Extra expense request not found")
    if doc["status"] not in ("Draft", "Info_Requested"):
        raise HTTPException(409, f"Cannot edit in status {doc['status']}")
    updates = patch.model_dump(exclude_unset=True)  # M3 · only client-provided, validated fields
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
    # M39m · Activity log
    from core.shared_services import log_activity
    await log_activity(
        module="extra_expense", action="Submitted",
        record_id=rid, tournament_id=doc.get("tournament_id"),
        actor_name=action.actor_name, actor_body_id=doc.get("body_id"),
        details={"amount_inr": doc["amount_inr"], "head": doc["head_label"], "ref": doc.get("request_ref")},
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

    # M39w · Locate the *per-body* budget for this Division on this tournament
    # (post-M39r flow), falling back to the legacy singular auto_budget_id for
    # tournaments still on the old flow.
    t = await db.tournaments.find_one({"id": doc["tournament_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    # MPCA-236 · Prefer the explicit budget_id captured on the request (multi-pool
    # tournaments). Fall back to legacy latest-Approved lookup otherwise.
    tb = None
    if doc.get("budget_id"):
        tb = await db.tournament_budgets.find_one({"id": doc["budget_id"]}, {"_id": 0})
    if not tb:
        tb = await db.tournament_budgets.find_one(
            {"tournament_id": doc["tournament_id"], "body_id": doc["body_id"],
             "status": {"$in": ["Approved", "Accepted_By_Division", "Sent_To_Division"]}},
            {"_id": 0}, sort=[("created_at", -1)],
        )
    if not tb and t.get("auto_budget_id"):
        tb = await db.tournament_budgets.find_one({"id": t["auto_budget_id"]}, {"_id": 0})
    if not tb:
        raise HTTPException(
            409,
            f"No approved / accepted budget for {doc['body_id']} on this tournament — "
            "MPCA must sanction the base budget before approving extras.",
        )
    budget_id = tb["id"]

    # Extras get a distinct head label so they show up separately from base heads.
    head_label = f"Extra · {doc['head_label']}"
    existing_heads = list(tb.get("approved_head_allocations") or tb.get("head_allocations") or [])
    hit = False
    for h in existing_heads:
        if h.get("head") == head_label:
            h["limit_inr"] = float(h.get("limit_inr") or 0) + approved
            hit = True
            break
    if not hit:
        # New head altogether
        existing_heads.append({"head": head_label, "limit_inr": approved,
                               "notes": f"Extra sanctioned via {doc['request_ref']}"})

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
        details={"tournament_id": doc["tournament_id"], "head": doc["head_label"], "requested_inr": doc["amount_inr"], "approved_inr": approved, "new_ceiling_inr": new_ceiling},
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


# ── MPCA-201 · Bulk actions ────────────────────────────────────────────────
class BulkExtraAction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ids: list[str] = Field(default_factory=list)
    tournament_id: str | None = None
    body_id: str | None = None
    actor_name: str | None = None
    actor_post: str | None = None
    actor_body_id: str | None = None
    notes: str | None = None


@api_router.post("/extra-expense-requests/bulk-submit")
async def bulk_submit_extras(payload: BulkExtraAction):
    """Division-side · submit every Draft/Info_Requested extra for a
    (tournament, body) or an explicit id list to MPCA."""
    q: dict = {"status": {"$in": ["Draft", "Info_Requested"]}}
    if payload.ids:
        q["id"] = {"$in": payload.ids}
    else:
        if not (payload.tournament_id and payload.body_id):
            raise HTTPException(400, "Provide `ids` or both `tournament_id` and `body_id`.")
        q.update({"tournament_id": payload.tournament_id, "body_id": payload.body_id})
    docs = await db.extra_expense_requests.find(q, {"_id": 0}).to_list(500)
    submitted = []
    for d in docs:
        try:
            await submit_extra_expense_request(d["id"], ExtraExpenseAction(
                actor_name=payload.actor_name, actor_post=payload.actor_post or "Division Secretary",
                actor_body_id=payload.actor_body_id, notes=payload.notes or "Bulk submit",
            ))
            submitted.append(d["id"])
        except HTTPException:
            continue
    return {"submitted_count": len(submitted), "ids": submitted}


@api_router.post("/extra-expense-requests/bulk-approve")
async def bulk_approve_extras(payload: BulkExtraAction):
    """MPCA-side · approve every Submitted extra for a (tournament, body)
    or an explicit id list."""
    q: dict = {"status": "Submitted"}
    if payload.ids:
        q["id"] = {"$in": payload.ids}
    else:
        if not (payload.tournament_id and payload.body_id):
            raise HTTPException(400, "Provide `ids` or both `tournament_id` and `body_id`.")
        q.update({"tournament_id": payload.tournament_id, "body_id": payload.body_id})
    docs = await db.extra_expense_requests.find(q, {"_id": 0}).to_list(500)
    approved = []
    for d in docs:
        try:
            await approve_extra_expense_request(d["id"], ExtraExpenseAction(
                actor_name=payload.actor_name, actor_post=payload.actor_post or "MPCA Secretary",
                actor_body_id=payload.actor_body_id or "MPCA", notes=payload.notes or "Bulk approve",
            ))
            approved.append(d["id"])
        except HTTPException:
            continue
    return {"approved_count": len(approved), "ids": approved}
