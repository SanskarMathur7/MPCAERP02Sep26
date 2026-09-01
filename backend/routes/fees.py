"""Routes · Fee Invoices"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from core.helpers import _next_invoice_no
from core.infra import api_router, db
from models import FeeInvoice, FeeInvoiceCreate, FeeStatus


@api_router.get("/fees", response_model=list[FeeInvoice])
async def list_fee_invoices(status: FeeStatus | None = None, cycle: str | None = None, member_uid: str | None = None):
    query = {}
    if status:
        query["status"] = status
    if cycle:
        query["cycle"] = cycle
    if member_uid:
        query["member_uid"] = member_uid
    docs = await db.fee_invoices.find(query, {"_id": 0}).sort("due_date", -1).to_list(2000)
    # Auto-flag Overdue (does not mutate DB)
    today_str = datetime.now(timezone.utc).date().isoformat()
    for d in docs:
        if d["status"] == "Pending" and d["due_date"] < today_str:
            d["status"] = "Overdue"
    return docs


@api_router.post("/fees", response_model=FeeInvoice)
async def create_fee_invoice(payload: FeeInvoiceCreate):
    member = await db.members.find_one({"uid": payload.member_uid}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member UID not found")
    data = payload.model_dump()
    data["member_name"] = member["name"]
    invoice_no = await _next_invoice_no()
    inv = FeeInvoice(invoice_no=invoice_no, **data)
    await db.fee_invoices.insert_one(inv.model_dump())
    return inv


@api_router.post("/fees/generate")
async def generate_invoices(cycle: str, amount: float = 3000.0, due_date: str | None = None):
    """Bulk-generate invoices for the given cycle for every active Individual + Institutional member."""
    if not due_date:
        due_date = "2025-12-31"
    active = await db.members.find({"status": "Active", "category": {"$in": ["Individual", "Institutional"]}}, {"_id": 0}).to_list(2000)
    created = 0
    for m in active:
        existing = await db.fee_invoices.find_one({"member_uid": m["uid"], "cycle": cycle})
        if existing:
            continue
        # Use category-appropriate amount
        amt = 15000.0 if m["category"] == "Institutional" else amount
        invoice_no = await _next_invoice_no()
        inv = FeeInvoice(
            invoice_no=invoice_no,
            member_uid=m["uid"],
            member_name=m["name"],
            cycle=cycle,
            description=f"Subscription · {cycle}",
            amount=amt,
            due_date=due_date,
            status="Pending",
        )
        await db.fee_invoices.insert_one(inv.model_dump())
        created += 1
    return {"created": created, "cycle": cycle}


@api_router.post("/fees/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, payment_ref: str | None = None):
    """Mock payment — marks invoice as Paid. In real life this would be Stripe/Razorpay."""
    inv = await db.fee_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] == "Paid":
        return {"already_paid": True, "invoice": inv}
    ref = payment_ref or f"MOCK-PAY-{uuid.uuid4().hex[:10].upper()}"
    paid_date = datetime.now(timezone.utc).date().isoformat()
    await db.fee_invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": "Paid", "paid_date": paid_date, "payment_ref": ref}},
    )
    updated = await db.fee_invoices.find_one({"id": invoice_id}, {"_id": 0})
    return {"ok": True, "invoice": updated, "receipt_no": ref}


@api_router.get("/fees/{invoice_id}", response_model=FeeInvoice)
async def get_invoice(invoice_id: str):
    doc = await db.fee_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    return doc


# ---------------- Phase 3: Bank Operations ----------------

