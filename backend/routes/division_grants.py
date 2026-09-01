"""Sprint 1 · P3.1 — Division Grant flow.

3-step maker-checker (per user choice):
  Division Requester → State Finance Officer → State Secretary (auto Disburse & Voucher).

Reuses shared_services CODE generator + audit_log. Voucher auto-created on Disburse
via routes/vouchers.create_voucher_for_grant() to close the double-entry loop (P3.5).
"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import api_router, db
from core.shared_services import indian_fy, next_code, write_audit_log

DivisionGrantStatus = Literal[
    "Draft", "Submitted", "Finance_Reviewed", "Approved",
    "Disbursed", "Rejected", "Sent_Back",
]
DivisionGrantCategory = Literal[
    "Admin_Grant", "Coaching_Grant", "Tournament_Funding",
    "District_Travel", "MRA_Management", "Infrastructure", "Other",
]


class ApprovalEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stage: str
    action: str
    actor_user_id: str | None = None
    actor_name: str
    actor_role: str | None = None
    note: str | None = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DivisionGrantBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str  # Division code, e.g. DIV-IND
    fiscal_cycle: str = Field(default_factory=indian_fy)
    category: DivisionGrantCategory
    purpose: str
    amount_inr: float


class DivisionGrant(DivisionGrantBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str = ""
    status: DivisionGrantStatus = "Draft"
    current_stage: str = "Division_Request"
    approval_chain: list[ApprovalEntry] = []
    approved_amount_inr: float | None = None
    voucher_id: str | None = None
    disbursement_txn_id: str | None = None
    created_by_user_id: str | None = None
    created_by_name: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str | None = None


class DivisionGrantCreate(DivisionGrantBase):
    created_by_user_id: str | None = None
    created_by_name: str | None = None


class ActionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_user_id: str | None = None
    actor_name: str | None = "System"
    actor_role: str | None = None
    note: str | None = None
    approved_amount_inr: float | None = None


# ---------------- helpers ----------------

STAGES = ["Division_Request", "Finance_Review", "Secretary_Approve", "Disbursed"]
STAGE_LABELS = {
    "Division_Request":  "Division · Request",
    "Finance_Review":    "State Finance Officer · Review",
    "Secretary_Approve": "State Secretary · Approve",
    "Disbursed":         "Disbursed",
}


async def _get(gid: str) -> dict:
    doc = await db.division_grants.find_one({"id": gid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Division Grant not found")
    return doc


async def _apply(gid: str, *, action: str, new_status: str, new_stage: str,
                 payload: ActionPayload, extra_set: dict | None = None) -> dict:
    grant = await _get(gid)
    entry = ApprovalEntry(
        stage=STAGE_LABELS.get(grant["current_stage"], grant["current_stage"]),
        action=action,
        actor_user_id=payload.actor_user_id,
        actor_name=payload.actor_name or "System",
        actor_role=payload.actor_role,
        note=payload.note,
    ).model_dump()
    updates = {
        "status": new_status,
        "current_stage": new_stage,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if extra_set:
        updates.update(extra_set)
    await db.division_grants.update_one(
        {"id": gid},
        {"$push": {"approval_chain": entry}, "$set": updates},
    )
    await write_audit_log(
        module="division_grant", record_id=gid,
        action=action.lower(),
        actor={"user_id": payload.actor_user_id, "name": payload.actor_name,
               "role": payload.actor_role, "body_id": grant["body_id"]},
        details={"code": grant.get("code"), "amount_inr": grant.get("amount_inr"),
                 "new_status": new_status, "note": payload.note},
    )
    return await _get(gid)


# ---------------- routes ----------------

@api_router.get("/division-grants", response_model=list[DivisionGrant])
async def list_division_grants(body_id: str | None = None,
                                status: DivisionGrantStatus | None = None,
                                fiscal_cycle: str | None = None,
                                skip: int = 0,
                                limit: int = 500):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    if status: q["status"] = status
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    return await db.division_grants.find(q, {"_id": 0}).sort("created_at", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))


@api_router.get("/division-grants/{gid}", response_model=DivisionGrant)
async def get_division_grant(gid: str):
    return await _get(gid)


@api_router.post("/division-grants", response_model=DivisionGrant)
async def create_division_grant(payload: DivisionGrantCreate):
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} not found")
    if body["body_type"] not in ("Division",):
        raise HTTPException(400, "Division Grants can only be raised by a Division body")
    if payload.amount_inr <= 0:
        raise HTTPException(400, "Amount must be greater than zero")

    grant = DivisionGrant(
        **payload.model_dump(),
    )
    grant.code = await next_code("grant", org_short=payload.body_id, fy=grant.fiscal_cycle)
    await db.division_grants.insert_one(grant.model_dump())
    await write_audit_log(
        module="division_grant", record_id=grant.id, action="create",
        actor={"user_id": payload.created_by_user_id, "name": payload.created_by_name or "Division",
               "role": "division_checker", "body_id": payload.body_id},
        details={"code": grant.code, "amount_inr": grant.amount_inr, "category": grant.category},
    )
    return grant


@api_router.post("/division-grants/{gid}/submit", response_model=DivisionGrant)
async def submit_grant(gid: str, payload: ActionPayload):
    g = await _get(gid)
    if g["status"] not in ("Draft", "Sent_Back"):
        raise HTTPException(400, f"Cannot submit — current status is {g['status']}")
    return await _apply(gid, action="Submit", new_status="Submitted",
                        new_stage="Finance_Review", payload=payload)


@api_router.post("/division-grants/{gid}/finance-review", response_model=DivisionGrant)
async def finance_review(gid: str, payload: ActionPayload):
    g = await _get(gid)
    if g["status"] != "Submitted":
        raise HTTPException(400, f"Cannot review — current status is {g['status']}")
    return await _apply(gid, action="Review", new_status="Finance_Reviewed",
                        new_stage="Secretary_Approve", payload=payload)


@api_router.post("/division-grants/{gid}/secretary-approve", response_model=DivisionGrant)
async def secretary_approve(gid: str, payload: ActionPayload):
    g = await _get(gid)
    if g["status"] != "Finance_Reviewed":
        raise HTTPException(400, f"Cannot approve — current status is {g['status']}")
    approved = payload.approved_amount_inr if payload.approved_amount_inr is not None else g["amount_inr"]
    if approved <= 0 or approved > g["amount_inr"]:
        raise HTTPException(400, "Approved amount must be > 0 and ≤ requested amount")
    return await _apply(gid, action="Approve", new_status="Approved",
                        new_stage="Disbursed", payload=payload,
                        extra_set={"approved_amount_inr": approved})


@api_router.post("/division-grants/{gid}/disburse", response_model=DivisionGrant)
async def disburse_grant(gid: str, payload: ActionPayload):
    """Marks grant as Disbursed AND auto-creates a Payment Voucher (P3.5)."""
    from routes.vouchers import create_voucher_for_grant
    g = await _get(gid)
    if g["status"] != "Approved":
        raise HTTPException(400, f"Cannot disburse — current status is {g['status']}")
    updated = await _apply(gid, action="Disburse", new_status="Disbursed",
                           new_stage="Disbursed", payload=payload)
    voucher = await create_voucher_for_grant(updated, actor_name=payload.actor_name or "System")
    await db.division_grants.update_one({"id": gid}, {"$set": {"voucher_id": voucher["id"]}})
    return await _get(gid)


@api_router.post("/division-grants/{gid}/send-back", response_model=DivisionGrant)
async def send_back_grant(gid: str, payload: ActionPayload):
    g = await _get(gid)
    if g["status"] in ("Disbursed", "Rejected"):
        raise HTTPException(400, "Cannot send back a closed grant")
    if not payload.note:
        raise HTTPException(400, "Send-Back requires a note")
    return await _apply(gid, action="Send_Back", new_status="Sent_Back",
                        new_stage="Division_Request", payload=payload)


@api_router.post("/division-grants/{gid}/reject", response_model=DivisionGrant)
async def reject_grant(gid: str, payload: ActionPayload):
    g = await _get(gid)
    if g["status"] in ("Disbursed", "Rejected"):
        raise HTTPException(400, f"Cannot reject — current status is {g['status']}")
    if not payload.note:
        raise HTTPException(400, "Reject requires a note")
    return await _apply(gid, action="Reject", new_status="Rejected",
                        new_stage=g["current_stage"], payload=payload)


@api_router.get("/division-grants-stats/summary")
async def division_grants_summary(fiscal_cycle: str | None = None):
    q: dict = {}
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.division_grants.find(q, {"_id": 0}).to_list(1000)
    by_status: dict = {}
    total_requested = 0.0
    total_disbursed = 0.0
    for d in docs:
        by_status[d["status"]] = by_status.get(d["status"], 0) + 1
        total_requested += d.get("amount_inr", 0) or 0
        if d["status"] == "Disbursed":
            total_disbursed += (d.get("approved_amount_inr") or d.get("amount_inr") or 0)
    return {
        "count": len(docs), "by_status": by_status,
        "total_requested_inr": round(total_requested, 2),
        "total_disbursed_inr": round(total_disbursed, 2),
    }
