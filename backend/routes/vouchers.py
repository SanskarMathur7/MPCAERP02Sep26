"""Sprint 1 · P3.5 — Vouchers (auto-generated from disbursements).

Payment / Receipt / Journal vouchers. Auto-created when a Division Grant is
disbursed, but also supports manual entry (Journal Voucher) for adjustments.
Each posted voucher forms one atomic ledger entry that the /ledger endpoint
aggregates into a running-balance statement (P3.6).
"""
from datetime import datetime, timezone
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from core.shared_services import next_code, write_audit_log, indian_fy


VoucherType = Literal["Payment", "Receipt", "Journal"]
VoucherStatus = Literal["Draft", "Posted", "Cancelled"]


class VoucherBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str
    voucher_type: VoucherType
    date: str  # ISO date
    amount_inr: float
    particulars: str
    dr_account: Optional[str] = None  # e.g. "Grants Given — DIV-IND"
    cr_account: Optional[str] = None  # e.g. "MPCA General Bank Account"
    linked_module: Optional[str] = None  # "division_grant" / "claim" / "extra_expense"
    linked_ref_id: Optional[str] = None
    linked_ref_code: Optional[str] = None
    fiscal_cycle: str = Field(default_factory=indian_fy)


class Voucher(VoucherBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    voucher_no: str = ""  # VCH/MPCA/2025-26/00001
    status: VoucherStatus = "Posted"
    created_by_name: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VoucherCreate(VoucherBase):
    created_by_name: Optional[str] = None
    status: VoucherStatus = "Posted"


# ---------------- helpers ----------------

async def create_voucher_for_grant(grant: dict, actor_name: str = "System") -> dict:
    """Build & post a Payment Voucher for a disbursed Division Grant.
    Idempotent — if a voucher with the same linked_ref_id already exists, returns it.
    """
    existing = await db.vouchers.find_one({"linked_module": "division_grant",
                                            "linked_ref_id": grant["id"]}, {"_id": 0})
    if existing:
        return existing
    amount = grant.get("approved_amount_inr") or grant.get("amount_inr") or 0
    v = Voucher(
        body_id="MPCA",
        voucher_type="Payment",
        date=datetime.now(timezone.utc).date().isoformat(),
        amount_inr=float(amount),
        particulars=f"Disbursement of {grant.get('category')} grant to {grant['body_id']} — {grant.get('purpose')}",
        dr_account=f"Grants Given · {grant['body_id']}",
        cr_account="MPCA General Bank Account",
        linked_module="division_grant",
        linked_ref_id=grant["id"],
        linked_ref_code=grant.get("code"),
        fiscal_cycle=grant.get("fiscal_cycle") or indian_fy(),
        created_by_name=actor_name,
        status="Posted",
    )
    v.voucher_no = await next_code("voucher", org_short="MPCA", fy=v.fiscal_cycle)
    await db.vouchers.insert_one(v.model_dump())
    await write_audit_log(
        module="voucher", record_id=v.id, action="auto_create",
        actor={"name": actor_name, "role": "system"},
        details={"voucher_no": v.voucher_no, "amount_inr": amount,
                 "from": "division_grant", "ref_code": grant.get("code")},
    )
    return v.model_dump()


# ---------------- routes ----------------

@api_router.get("/vouchers", response_model=List[Voucher])
async def list_vouchers(body_id: Optional[str] = None,
                        voucher_type: Optional[VoucherType] = None,
                        fiscal_cycle: Optional[str] = None,
                        linked_module: Optional[str] = None):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    if voucher_type: q["voucher_type"] = voucher_type
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    if linked_module: q["linked_module"] = linked_module
    docs = await db.vouchers.find(q, {"_id": 0}).sort("date", -1).to_list(1000)
    return docs


@api_router.get("/vouchers/{vid}", response_model=Voucher)
async def get_voucher(vid: str):
    doc = await db.vouchers.find_one({"id": vid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Voucher not found")
    return doc


@api_router.post("/vouchers", response_model=Voucher)
async def create_voucher(payload: VoucherCreate):
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} not found")
    if payload.amount_inr <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    v = Voucher(**payload.model_dump())
    v.voucher_no = await next_code("voucher", org_short=payload.body_id, fy=v.fiscal_cycle)
    await db.vouchers.insert_one(v.model_dump())
    await write_audit_log(
        module="voucher", record_id=v.id, action="create",
        actor={"name": payload.created_by_name or "Accounts", "role": "mpca_accounts",
               "body_id": payload.body_id},
        details={"voucher_no": v.voucher_no, "type": v.voucher_type, "amount_inr": v.amount_inr},
    )
    return v


@api_router.post("/vouchers/{vid}/cancel", response_model=Voucher)
async def cancel_voucher(vid: str, reason: str = ""):
    v = await db.vouchers.find_one({"id": vid}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Voucher not found")
    if v["status"] == "Cancelled":
        raise HTTPException(400, "Already cancelled")
    if not reason:
        raise HTTPException(400, "Cancellation reason required")
    await db.vouchers.update_one({"id": vid}, {"$set": {"status": "Cancelled"}})
    await write_audit_log(
        module="voucher", record_id=vid, action="cancel",
        actor={"name": "Accounts", "role": "mpca_accounts"},
        details={"voucher_no": v.get("voucher_no"), "reason": reason},
    )
    return await db.vouchers.find_one({"id": vid}, {"_id": 0})


@api_router.get("/vouchers-stats/summary")
async def vouchers_summary(fiscal_cycle: Optional[str] = None):
    q: dict = {"status": "Posted"}
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.vouchers.find(q, {"_id": 0}).to_list(2000)
    total_payment = sum(d["amount_inr"] for d in docs if d["voucher_type"] == "Payment")
    total_receipt = sum(d["amount_inr"] for d in docs if d["voucher_type"] == "Receipt")
    total_journal = sum(d["amount_inr"] for d in docs if d["voucher_type"] == "Journal")
    return {
        "count": len(docs),
        "payment_inr": round(total_payment, 2),
        "receipt_inr": round(total_receipt, 2),
        "journal_inr": round(total_journal, 2),
        "by_type": {"Payment": sum(1 for d in docs if d["voucher_type"] == "Payment"),
                     "Receipt": sum(1 for d in docs if d["voucher_type"] == "Receipt"),
                     "Journal": sum(1 for d in docs if d["voucher_type"] == "Journal")},
    }
