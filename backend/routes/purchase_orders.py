"""Sprint 2 · Purchase Orders (P4.x).

Workflow: Draft → Submitted → Approved → Issued → Partially_Received →
          Received → Invoiced → Paid (or Cancelled).

Approval chain: PO Creator (Body Accounts) → Head of Body → State Finance Officer
   for POs > ₹1L (threshold), else 2-step (Creator → Head).

Vendor must be KYC_Verified (or non-expired) to be selected. TDS auto-calculated
from vendor.tds_rate_pct at PO creation and included in the burn-down maths.

Burn-down: `invoiced_amount_inr` incremented every time a Vendor Bill is linked;
`paid_amount_inr` when linked bill is Paid. `remaining_amount_inr = total - invoiced`.
"""
from datetime import datetime, timezone
from typing import List, Literal, Optional
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from core.shared_services import next_code, write_audit_log, indian_fy


PoStatus = Literal[
    "Draft", "Submitted", "Approved", "Issued",
    "Partially_Received", "Received", "Invoiced", "Paid",
    "Cancelled", "Sent_Back",
]

TWO_STEP_THRESHOLD_INR = 100_000.0  # >₹1L requires 3-step approval


class POLineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    description: str
    hsn_sac: Optional[str] = None
    quantity: float = Field(gt=0)
    uom: str = "nos"
    unit_price_inr: float = Field(gt=0)
    gst_pct: float = Field(default=18.0, ge=0, le=28)

    @property
    def subtotal(self) -> float:
        return round(self.quantity * self.unit_price_inr, 2)

    @property
    def gst_amount(self) -> float:
        return round(self.subtotal * (self.gst_pct / 100), 2)

    @property
    def total(self) -> float:
        return round(self.subtotal + self.gst_amount, 2)


class ApprovalEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stage: str
    action: str
    actor_user_id: Optional[str] = None
    actor_name: str
    actor_role: Optional[str] = None
    note: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PurchaseOrderBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    vendor_id: str
    vendor_name: Optional[str] = None
    fiscal_cycle: str = Field(default_factory=indian_fy)
    category: str = "General"
    subject: str  # short heading like "Kits · U-19 Team"
    description: Optional[str] = None
    items: List[POLineItem]
    delivery_date: Optional[str] = None
    delivery_address: Optional[str] = None
    payment_terms: str = "Net 30"
    linked_procurement_id: Optional[str] = None


class PurchaseOrder(PurchaseOrderBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    po_no: str = ""  # PO/MPCA/2026-27/00001
    status: PoStatus = "Draft"
    current_stage: str = "Draft"

    # Snapshots computed on save
    subtotal_inr: float = 0.0
    gst_total_inr: float = 0.0
    tds_amount_inr: float = 0.0
    tds_rate_pct: float = 0.0
    total_amount_inr: float = 0.0
    net_payable_inr: float = 0.0  # total - tds

    # Burn-down
    invoiced_amount_inr: float = 0.0
    paid_amount_inr: float = 0.0

    approval_chain: List[ApprovalEntry] = []
    linked_bill_ids: List[str] = []
    approval_required_steps: int = 2  # 2 or 3
    created_by_name: Optional[str] = None
    created_by_user_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase):
    created_by_name: Optional[str] = None
    created_by_user_id: Optional[str] = None


class ActionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_user_id: Optional[str] = None
    actor_name: Optional[str] = "System"
    actor_role: Optional[str] = None
    note: Optional[str] = None
    received_qty_pct: Optional[float] = None  # for partial-receipt


class LinkBillPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    bill_id: str
    amount_inr: float
    actor_name: Optional[str] = "MPCA Accounts"
    is_paid: bool = False  # if bill has been paid, also increment paid_amount_inr


async def _get(pid: str) -> dict:
    doc = await db.purchase_orders.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Purchase Order not found")
    return doc


def _compute_totals(items: List[POLineItem], tds_rate_pct: float) -> dict:
    sub = round(sum(i.subtotal for i in items), 2)
    gst = round(sum(i.gst_amount for i in items), 2)
    total = round(sub + gst, 2)
    tds = round(sub * (tds_rate_pct / 100), 2)  # TDS on base value only
    return {
        "subtotal_inr": sub,
        "gst_total_inr": gst,
        "tds_rate_pct": tds_rate_pct,
        "tds_amount_inr": tds,
        "total_amount_inr": total,
        "net_payable_inr": round(total - tds, 2),
    }


async def _append_chain(pid: str, *, action: str, new_status: str, new_stage: str,
                         payload: ActionPayload, extra_set: Optional[dict] = None) -> dict:
    po = await _get(pid)
    entry = ApprovalEntry(
        stage=po["current_stage"], action=action,
        actor_user_id=payload.actor_user_id,
        actor_name=payload.actor_name or "System",
        actor_role=payload.actor_role,
        note=payload.note,
    ).model_dump()
    updates = {
        "status": new_status, "current_stage": new_stage,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if extra_set:
        updates.update(extra_set)
    await db.purchase_orders.update_one(
        {"id": pid},
        {"$push": {"approval_chain": entry}, "$set": updates},
    )
    await write_audit_log(
        module="purchase_order", record_id=pid, action=action.lower(),
        actor={"user_id": payload.actor_user_id, "name": payload.actor_name,
               "role": payload.actor_role, "body_id": po["body_id"]},
        details={"po_no": po.get("po_no"), "amount_inr": po.get("total_amount_inr"),
                 "new_status": new_status, "note": payload.note},
    )
    return await _get(pid)


# ═══════════════════ CRUD + LISTINGS ═══════════════════

@api_router.get("/purchase-orders", response_model=List[PurchaseOrder])
async def list_pos(body_id: Optional[str] = None,
                    status: Optional[PoStatus] = None,
                    vendor_id: Optional[str] = None,
                    fiscal_cycle: Optional[str] = None):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    if status: q["status"] = status
    if vendor_id: q["vendor_id"] = vendor_id
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    return await db.purchase_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.get("/purchase-orders/{pid}", response_model=PurchaseOrder)
async def get_po(pid: str):
    return await _get(pid)


@api_router.post("/purchase-orders", response_model=PurchaseOrder)
async def create_po(payload: PurchaseOrderCreate):
    vendor = await db.vendors.find_one({"id": payload.vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(400, "Vendor not found")
    if vendor.get("is_blacklisted"):
        raise HTTPException(400, "Cannot raise PO against a blacklisted vendor")
    kyc_status = vendor.get("kyc_status") or "Not_Started"
    if kyc_status != "KYC_Verified":
        raise HTTPException(400, f"Vendor is not KYC verified (current: {kyc_status}). Complete KYC before raising PO.")
    # Reject if the KYC verification has silently lapsed (expiry in the past).
    expiry = vendor.get("kyc_expires_at")
    if expiry:
        try:
            if datetime.fromisoformat(expiry.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                raise HTTPException(400, "Vendor KYC has expired. Re-verify KYC before raising PO.")
        except ValueError:
            pass  # bad ISO — skip the check rather than block

    if not payload.items:
        raise HTTPException(400, "PO must have at least one line item")

    tds_rate = float(vendor.get("tds_rate_pct") or 0.0) if vendor.get("tds_applicable", True) else 0.0
    totals = _compute_totals(payload.items, tds_rate)

    po = PurchaseOrder(
        **payload.model_dump(),
        **totals,
        approval_required_steps=3 if totals["total_amount_inr"] > TWO_STEP_THRESHOLD_INR else 2,
    )
    po.vendor_name = vendor.get("name")
    po.po_no = await next_code("po", org_short=payload.body_id or "MPCA", fy=po.fiscal_cycle)
    await db.purchase_orders.insert_one(po.model_dump())
    await write_audit_log(
        module="purchase_order", record_id=po.id, action="create",
        actor={"user_id": payload.created_by_user_id, "name": payload.created_by_name or "PO Creator",
               "role": "mpca_accounts", "body_id": payload.body_id},
        details={"po_no": po.po_no, "vendor": vendor.get("name"),
                 "total_amount_inr": po.total_amount_inr, "tds_amount_inr": po.tds_amount_inr,
                 "required_steps": po.approval_required_steps},
    )
    return po


# ═══════════════════ WORKFLOW ACTIONS ═══════════════════

@api_router.post("/purchase-orders/{pid}/submit", response_model=PurchaseOrder)
async def submit_po(pid: str, payload: ActionPayload):
    po = await _get(pid)
    if po["status"] not in ("Draft", "Sent_Back"):
        raise HTTPException(400, f"Cannot submit — status is {po['status']}")
    next_stage = "Head_Approval"
    return await _append_chain(pid, action="Submit", new_status="Submitted",
                                new_stage=next_stage, payload=payload)


@api_router.post("/purchase-orders/{pid}/approve", response_model=PurchaseOrder)
async def approve_po(pid: str, payload: ActionPayload):
    po = await _get(pid)
    if po["status"] not in ("Submitted",):
        raise HTTPException(400, f"Cannot approve — status is {po['status']}")
    if po.get("approval_required_steps", 2) >= 3:
        # Count Approvals *since the last Submit* — so a send-back + re-submit resets
        # the head/finance sequence rather than skipping straight past.
        chain = po.get("approval_chain", [])
        last_submit_idx = max((i for i, c in enumerate(chain) if c.get("action") == "Submit"), default=-1)
        approvals_since_submit = [c for c in chain[last_submit_idx + 1:] if c.get("action") == "Approve"]
        if not approvals_since_submit:
            return await _append_chain(pid, action="Approve", new_status="Submitted",
                                        new_stage="Finance_Approval", payload=payload)
    return await _append_chain(pid, action="Approve", new_status="Approved",
                                new_stage="Ready_to_Issue", payload=payload)


@api_router.post("/purchase-orders/{pid}/issue", response_model=PurchaseOrder)
async def issue_po(pid: str, payload: ActionPayload):
    po = await _get(pid)
    if po["status"] != "Approved":
        raise HTTPException(400, f"Cannot issue — status is {po['status']}")
    return await _append_chain(pid, action="Issue", new_status="Issued",
                                new_stage="Awaiting_Delivery", payload=payload,
                                extra_set={"issued_at": datetime.now(timezone.utc).isoformat()})


@api_router.post("/purchase-orders/{pid}/mark-received", response_model=PurchaseOrder)
async def mark_received(pid: str, payload: ActionPayload):
    po = await _get(pid)
    if po["status"] not in ("Issued", "Partially_Received"):
        raise HTTPException(400, f"Cannot mark received — status is {po['status']}")
    pct = payload.received_qty_pct if payload.received_qty_pct is not None else 100.0
    if pct <= 0 or pct > 100:
        raise HTTPException(400, "received_qty_pct must be between 0 and 100")
    new_status = "Received" if pct >= 100 else "Partially_Received"
    new_stage = "Ready_to_Invoice" if pct >= 100 else "Awaiting_Delivery"
    return await _append_chain(pid, action="Receive", new_status=new_status,
                                new_stage=new_stage, payload=payload,
                                extra_set={"received_pct": pct})


@api_router.post("/purchase-orders/{pid}/link-bill", response_model=PurchaseOrder)
async def link_bill(pid: str, payload: LinkBillPayload):
    po = await _get(pid)
    if po["status"] in ("Cancelled", "Paid", "Draft"):
        raise HTTPException(400, f"Cannot link a bill to a PO in status {po['status']}")
    if payload.bill_id in (po.get("linked_bill_ids") or []):
        raise HTTPException(400, f"Bill {payload.bill_id} is already linked to this PO")
    if payload.amount_inr <= 0:
        raise HTTPException(400, "Bill amount must be greater than zero")
    total_available = float(po["total_amount_inr"]) - float(po.get("invoiced_amount_inr") or 0)
    if payload.amount_inr > total_available + 0.01:
        raise HTTPException(400, f"Bill amount ₹{payload.amount_inr:,.2f} exceeds PO remaining ₹{total_available:,.2f}")

    new_invoiced = round(float(po.get("invoiced_amount_inr") or 0) + payload.amount_inr, 2)
    new_paid = round(float(po.get("paid_amount_inr") or 0) + (payload.amount_inr if payload.is_paid else 0), 2)
    total = float(po["total_amount_inr"])
    status = po["status"]
    if new_paid >= total - 0.01:
        status = "Paid"
    elif new_invoiced >= total - 0.01:
        status = "Invoiced"

    now = datetime.now(timezone.utc).isoformat()
    await db.purchase_orders.update_one(
        {"id": pid},
        {"$push": {"linked_bill_ids": payload.bill_id,
                    "approval_chain": ApprovalEntry(
                        stage=po["current_stage"], action="Link_Bill",
                        actor_name=payload.actor_name or "MPCA Accounts",
                        actor_role="mpca_accounts",
                        note=f"Linked bill {payload.bill_id} · ₹{payload.amount_inr:,.2f}" + (" (paid)" if payload.is_paid else ""),
                    ).model_dump()},
          "$set": {"invoiced_amount_inr": new_invoiced,
                   "paid_amount_inr": new_paid, "status": status,
                   "updated_at": now}},
    )
    await write_audit_log(
        module="purchase_order", record_id=pid, action="link_bill",
        actor={"name": payload.actor_name, "role": "mpca_accounts"},
        details={"po_no": po.get("po_no"), "bill_id": payload.bill_id,
                 "amount_inr": payload.amount_inr, "is_paid": payload.is_paid,
                 "new_invoiced": new_invoiced, "new_paid": new_paid, "new_status": status},
    )
    return await _get(pid)


@api_router.post("/purchase-orders/{pid}/send-back", response_model=PurchaseOrder)
async def send_back_po(pid: str, payload: ActionPayload):
    if not payload.note:
        raise HTTPException(400, "Send-back requires a note")
    po = await _get(pid)
    if po["status"] in ("Paid", "Cancelled"):
        raise HTTPException(400, "Cannot send back a closed PO")
    return await _append_chain(pid, action="Send_Back", new_status="Sent_Back",
                                new_stage="Draft", payload=payload)


@api_router.post("/purchase-orders/{pid}/cancel", response_model=PurchaseOrder)
async def cancel_po(pid: str, payload: ActionPayload):
    if not payload.note:
        raise HTTPException(400, "Cancellation requires a note")
    po = await _get(pid)
    if po["status"] in ("Paid", "Cancelled"):
        raise HTTPException(400, f"Cannot cancel PO in status {po['status']}")
    return await _append_chain(pid, action="Cancel", new_status="Cancelled",
                                new_stage="Cancelled", payload=payload)


# ═══════════════════ DASHBOARD ENDPOINTS ═══════════════════

@api_router.get("/purchase-orders/{pid}/burn-down")
async def burn_down(pid: str):
    po = await _get(pid)
    total = float(po["total_amount_inr"])
    invoiced = float(po.get("invoiced_amount_inr") or 0)
    paid = float(po.get("paid_amount_inr") or 0)
    return {
        "po_no": po["po_no"], "vendor_name": po.get("vendor_name"),
        "total_amount_inr": total,
        "invoiced_amount_inr": invoiced,
        "paid_amount_inr": paid,
        "remaining_amount_inr": round(total - invoiced, 2),
        "invoiced_pct": round((invoiced / total) * 100, 1) if total else 0,
        "paid_pct": round((paid / total) * 100, 1) if total else 0,
        "linked_bill_ids": po.get("linked_bill_ids") or [],
        "tds_amount_inr": po.get("tds_amount_inr"),
        "status": po["status"],
    }


@api_router.get("/purchase-orders-stats/summary")
async def po_summary(fiscal_cycle: Optional[str] = None):
    q: dict = {}
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.purchase_orders.find(q, {"_id": 0}).to_list(2000)
    by_status: dict = {}
    total_committed = 0.0
    total_invoiced = 0.0
    total_paid = 0.0
    total_tds = 0.0
    for d in docs:
        by_status[d["status"]] = by_status.get(d["status"], 0) + 1
        if d["status"] not in ("Cancelled", "Draft", "Sent_Back"):
            total_committed += float(d.get("total_amount_inr") or 0)
            total_invoiced += float(d.get("invoiced_amount_inr") or 0)
            total_paid += float(d.get("paid_amount_inr") or 0)
            total_tds += float(d.get("tds_amount_inr") or 0)
    return {
        "count": len(docs), "by_status": by_status,
        "committed_inr": round(total_committed, 2),
        "invoiced_inr": round(total_invoiced, 2),
        "paid_inr": round(total_paid, 2),
        "outstanding_inr": round(total_committed - total_invoiced, 2),
        "tds_accrued_inr": round(total_tds, 2),
    }
