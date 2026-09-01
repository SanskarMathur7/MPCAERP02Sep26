"""Routes · Vendor Master + Vendor Bills (F6a)"""
import re
from datetime import datetime, timezone

from fastapi import HTTPException

from core.helpers import _create_notification
from core.infra import api_router, db
from models import (
    ApprovalStep,
    BankTransaction,
    Vendor,
    VendorBill,
    VendorBillAction,
    VendorBillCreate,
    VendorBillStatus,
    VendorCategory,
    VendorCreate,
)

# ──────────────────────── Helpers ────────────────────────

async def _next_vendor_no() -> str:
    year = datetime.now(timezone.utc).year
    count = await db.vendors.count_documents({})
    return f"VEND-{year}-{count + 1:04d}"


async def _next_vb_no(cycle: str) -> str:
    count = await db.vendor_bills.count_documents({"fiscal_cycle": cycle})
    return f"VB-{cycle}-{count + 1:03d}"


def _append_vb_step(bill_doc: dict, step: ApprovalStep, new_status: str) -> dict:
    chain = (bill_doc.get("approval_chain") or []) + [step.model_dump()]
    return {
        "approval_chain": chain,
        "status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def _vb_recipient(bill_doc: dict, new_status: str):
    """Maps a bill transition to (role_id, body_id) for in-app notifications."""
    body_id = bill_doc.get("body_id") or "MPCA"
    if new_status == "Submitted":
        return ("accounts", "MPCA")              # Accounts at MPCA verifies
    if new_status == "Verified":
        return ("treasurer", "MPCA")             # Treasurer sanctions
    if new_status == "Sanctioned":
        return ("treasurer", "MPCA")             # Treasurer pays
    if new_status in ("Paid", "Rejected", "Returned"):
        return ("district-secretary", body_id)   # back to originating body
    return None


async def _notify_for_vb(bill_doc: dict, new_status: str, actor_name: str | None) -> None:
    target = _vb_recipient(bill_doc, new_status)
    if not target:
        return
    role_id, body_id = target
    title_map = {
        "Submitted": "New vendor bill submitted — awaiting verification",
        "Verified": "Bill verified by Accounts — awaiting Treasurer sanction",
        "Sanctioned": "Bill sanctioned — awaiting payment release",
        "Paid": "Vendor bill paid",
        "Rejected": "Vendor bill rejected",
        "Returned": "Vendor bill returned for correction",
    }
    severity_map = {"Rejected": "critical", "Returned": "warning"}
    msg = (
        f"{bill_doc.get('bill_no')} · {bill_doc.get('vendor_name')} · "
        f"₹{(bill_doc.get('total_amount_inr') or 0):,.0f}"
    )
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=body_id,
        title=title_map.get(new_status, new_status),
        message=msg,
        link="/vendor-bills",
        related_type="vendor_bill",
        related_id=bill_doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )


# ──────────────────────── Vendor CRUD ────────────────────────

@api_router.get("/vendors", response_model=list[Vendor])
async def list_vendors(
    category: VendorCategory | None = None,
    body_id: str | None = None,
    search: str | None = None,
    include_blacklisted: bool = True,
    skip: int = 0,
    limit: int = 2000,
):
    q: dict = {}
    if category:
        q["category"] = category
    if body_id:
        q["body_id"] = body_id
    if not include_blacklisted:
        q["is_blacklisted"] = False
    if search:
        q["$or"] = [
            {"name": {"$regex": re.escape(search), "$options": "i"}},
            {"gstin": {"$regex": re.escape(search), "$options": "i"}},
            {"vendor_no": {"$regex": re.escape(search), "$options": "i"}},
        ]
    docs = await db.vendors.find(q, {"_id": 0}).sort("name", 1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    return docs


@api_router.post("/vendors", response_model=Vendor)
async def create_vendor(payload: VendorCreate):
    vendor_no = await _next_vendor_no()
    vendor = Vendor(vendor_no=vendor_no, **payload.model_dump())
    await db.vendors.insert_one(vendor.model_dump())
    return vendor


@api_router.get("/vendors/{vid}", response_model=Vendor)
async def get_vendor(vid: str):
    doc = await db.vendors.find_one({"id": vid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor not found")
    return doc


@api_router.patch("/vendors/{vid}", response_model=Vendor)
async def update_vendor(vid: str, payload: VendorCreate):
    doc = await db.vendors.find_one({"id": vid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor not found")
    await db.vendors.update_one({"id": vid}, {"$set": payload.model_dump()})
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@api_router.post("/vendors/{vid}/blacklist", response_model=Vendor)
async def blacklist_vendor(vid: str, payload: dict):
    """Body: {reason: str}. Sets is_blacklisted=True and stores reason."""
    reason = (payload or {}).get("reason") or "(no reason given)"
    doc = await db.vendors.find_one({"id": vid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor not found")
    await db.vendors.update_one(
        {"id": vid},
        {"$set": {"is_blacklisted": True, "blacklist_reason": reason}},
    )
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@api_router.post("/vendors/{vid}/un-blacklist", response_model=Vendor)
async def unblacklist_vendor(vid: str):
    doc = await db.vendors.find_one({"id": vid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor not found")
    await db.vendors.update_one(
        {"id": vid},
        {"$set": {"is_blacklisted": False, "blacklist_reason": None}},
    )
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@api_router.delete("/vendors/{vid}")
async def delete_vendor(vid: str):
    # Block delete if any bill exists for this vendor
    bill_count = await db.vendor_bills.count_documents({"vendor_id": vid})
    if bill_count > 0:
        raise HTTPException(
            409,
            f"Cannot delete vendor — {bill_count} bill(s) exist. Blacklist the vendor instead.",
        )
    result = await db.vendors.delete_one({"id": vid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Vendor not found")
    return {"ok": True}


# ──────────────────────── Vendor Bills CRUD + workflow ────────────────────────

@api_router.get("/vendor-bills", response_model=list[VendorBill])
async def list_vendor_bills(
    body_id: str | None = None,
    status: VendorBillStatus | None = None,
    category: VendorCategory | None = None,
    vendor_id: str | None = None,
    fiscal_cycle: str | None = None,
    skip: int = 0,
    limit: int = 2000,
):
    q: dict = {}
    if body_id:
        q["body_id"] = body_id
    if status:
        q["status"] = status
    if category:
        q["category"] = category
    if vendor_id:
        q["vendor_id"] = vendor_id
    if fiscal_cycle:
        q["fiscal_cycle"] = fiscal_cycle
    docs = await db.vendor_bills.find(q, {"_id": 0}).sort("created_at", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    return docs


@api_router.get("/vendor-bills/{bid}", response_model=VendorBill)
async def get_vendor_bill(bid: str):
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    return doc


@api_router.post("/vendor-bills", response_model=VendorBill)
async def create_vendor_bill(payload: VendorBillCreate):
    # Resolve vendor (also blocks billing a blacklisted vendor)
    vendor = await db.vendors.find_one({"id": payload.vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if vendor.get("is_blacklisted"):
        raise HTTPException(
            409,
            f"Vendor '{vendor.get('name')}' is BLACKLISTED — bills cannot be raised. Reason: {vendor.get('blacklist_reason')}",
        )
    bill_no = await _next_vb_no(payload.fiscal_cycle)
    body = payload.model_dump()
    body["vendor_name"] = vendor.get("name")
    bill = VendorBill(bill_no=bill_no, **body)
    await db.vendor_bills.insert_one(bill.model_dump())
    return bill


@api_router.post("/vendor-bills/{bid}/submit", response_model=VendorBill)
async def submit_vendor_bill(bid: str, action: VendorBillAction):
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    if doc["status"] not in ("Draft", "Returned"):
        raise HTTPException(409, f"Cannot submit a bill in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Submitted",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Submitted",
        notes=action.notes,
    )
    update = _append_vb_step(doc, step, "Submitted")
    await db.vendor_bills.update_one({"id": bid}, {"$set": update})
    updated = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    await _notify_for_vb(updated, "Submitted", action.actor_name)
    return updated


@api_router.post("/vendor-bills/{bid}/verify", response_model=VendorBill)
async def verify_vendor_bill(bid: str, action: VendorBillAction):
    """Accounts verifies that the bill is mathematically correct + GST is captured."""
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, f"Cannot verify a bill in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Verified",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Recommended",
        notes=action.notes,
    )
    update = _append_vb_step(doc, step, "Verified")
    await db.vendor_bills.update_one({"id": bid}, {"$set": update})
    updated = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    await _notify_for_vb(updated, "Verified", action.actor_name)
    return updated


@api_router.post("/vendor-bills/{bid}/sanction", response_model=VendorBill)
async def sanction_vendor_bill(bid: str, action: VendorBillAction):
    """Treasurer sanctions the verified bill."""
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    if doc["status"] != "Verified":
        raise HTTPException(409, f"Cannot sanction a bill in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Sanctioned",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Sanctioned",
        notes=action.notes,
    )
    update = _append_vb_step(doc, step, "Sanctioned")
    await db.vendor_bills.update_one({"id": bid}, {"$set": update})
    updated = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    await _notify_for_vb(updated, "Sanctioned", action.actor_name)
    return updated


@api_router.post("/vendor-bills/{bid}/pay", response_model=VendorBill)
async def pay_vendor_bill(bid: str, action: VendorBillAction):
    """Treasurer releases payment — books a Debit on the chosen bank account."""
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    if doc["status"] != "Sanctioned":
        raise HTTPException(409, f"Cannot pay a bill in status '{doc['status']}'.")

    # Resolve source bank account
    src_id = action.source_account_id
    if not src_id:
        # default: MPCA General account
        acct = await db.bank_accounts.find_one({"name": {"$regex": "General", "$options": "i"}}, {"_id": 0})
        if not acct:
            acct = await db.bank_accounts.find_one({}, {"_id": 0})
        if not acct:
            raise HTTPException(409, "No bank account configured to draw payment from.")
        src_id = acct["id"]
    else:
        acct = await db.bank_accounts.find_one({"id": src_id}, {"_id": 0})
        if not acct:
            raise HTTPException(404, f"Source account {src_id} not found")

    amount = float(doc.get("total_amount_inr") or 0)
    # H6 · atomic debit — $inc avoids the lost-update race on concurrent payments.
    acct = await db.bank_accounts.find_one_and_update(
        {"id": src_id}, {"$inc": {"current_balance": -amount}}, return_document=True,
    )
    new_balance = round(float(acct.get("current_balance") or 0), 2)

    # Book the debit transaction
    txn = BankTransaction(
        body_id=doc.get("body_id") or "MPCA",
        account_id=src_id,
        date=datetime.now(timezone.utc).date().isoformat(),
        txn_type="Debit",
        amount=amount,
        narration=f"Vendor payment · {doc.get('vendor_name')} · {doc.get('bill_no')}",
        reference=doc.get("bill_no"),
        approved_by=action.actor_post,
        balance_after=new_balance,
    )
    await db.bank_txns.insert_one(txn.model_dump())
    # (balance already applied atomically above via $inc)

    step = ApprovalStep(
        stage="Paid",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Disbursed",
        notes=(action.notes or "") + f" · TXN ref {doc.get('bill_no')} · ₹{amount:,.0f} from {acct.get('name')}",
    )
    update = _append_vb_step(doc, step, "Paid")
    update["paid_via_txn_id"] = txn.id
    update["paid_via_account_id"] = src_id
    await db.vendor_bills.update_one({"id": bid}, {"$set": update})
    updated = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    await _notify_for_vb(updated, "Paid", action.actor_name)
    return updated


@api_router.post("/vendor-bills/{bid}/reject", response_model=VendorBill)
async def reject_vendor_bill(bid: str, action: VendorBillAction):
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    if doc["status"] in ("Paid", "Rejected"):
        raise HTTPException(409, f"Cannot reject a bill in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Rejected",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Rejected",
        notes=action.notes,
    )
    update = _append_vb_step(doc, step, "Rejected")
    await db.vendor_bills.update_one({"id": bid}, {"$set": update})
    updated = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    await _notify_for_vb(updated, "Rejected", action.actor_name)
    return updated


@api_router.post("/vendor-bills/{bid}/return", response_model=VendorBill)
async def return_vendor_bill(bid: str, action: VendorBillAction):
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    if doc["status"] not in ("Submitted", "Verified", "Sanctioned"):
        raise HTTPException(409, f"Cannot return a bill in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Returned",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Returned",
        notes=action.notes,
    )
    update = _append_vb_step(doc, step, "Returned")
    update["return_reason_code"] = action.return_reason_code
    update["return_reason_detail"] = action.return_reason_detail
    await db.vendor_bills.update_one({"id": bid}, {"$set": update})
    updated = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    await _notify_for_vb(updated, "Returned", action.actor_name)
    return updated


@api_router.delete("/vendor-bills/{bid}")
async def delete_vendor_bill(bid: str):
    doc = await db.vendor_bills.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Vendor bill not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, f"Cannot delete a bill in status '{doc['status']}'. Only Draft / Rejected are deletable.")
    await db.vendor_bills.delete_one({"id": bid})
    return {"ok": True}


@api_router.get("/vendor-bills-stats/summary")
async def vendor_bills_stats(body_id: str | None = None, fiscal_cycle: str | None = None):
    q: dict = {}
    if body_id:
        q["body_id"] = body_id
    if fiscal_cycle:
        q["fiscal_cycle"] = fiscal_cycle
    bills = await db.vendor_bills.find(q, {"_id": 0}).to_list(5000)

    def _sum(items, key):
        return float(sum(i.get(key) or 0 for i in items))

    pending_statuses = ("Draft", "Submitted", "Verified", "Sanctioned", "Returned")
    paid = [b for b in bills if b["status"] == "Paid"]
    pending = [b for b in bills if b["status"] in pending_statuses]
    rejected = [b for b in bills if b["status"] == "Rejected"]

    by_category: dict = {}
    for b in bills:
        cat = b.get("category", "Other")
        by_category[cat] = by_category.get(cat, 0.0) + float(b.get("total_amount_inr") or 0)

    return {
        "total_bills": len(bills),
        "paid_bills": len(paid),
        "pending_bills": len(pending),
        "rejected_bills": len(rejected),
        "amount_paid_inr": _sum(paid, "total_amount_inr"),
        "amount_in_flight_inr": _sum(pending, "total_amount_inr"),
        "amount_rejected_inr": _sum(rejected, "total_amount_inr"),
        "by_category": by_category,
    }
