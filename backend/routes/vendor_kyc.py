"""Sprint 2 · Vendor KYC workflow.

Extends the existing `vendors` collection with a KYC lifecycle:
  Not_Started → Docs_Submitted → KYC_Verified (Active)
                             ↘  Rejected
KYC verification carries an expiry (default 1yr) after which vendor moves to Expired
and cannot be selected in Purchase Orders until re-verified.

Also carries TDS applicability + rate (default 2% u/s 194C for contractual work),
GST verification flag, and MSME registration flag. This data flows into the PO module.
"""
from datetime import datetime, timezone
from typing import Literal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import api_router, db, logger
from core.shared_services import write_audit_log

KycStatus = Literal["Not_Started", "Docs_Submitted", "KYC_Verified", "Rejected", "Expired"]

REQUIRED_DOCS = ["gst_certificate", "pan_card", "cancelled_cheque", "signed_declaration"]


class KycDoc(BaseModel):
    model_config = ConfigDict(extra="ignore")
    doc_type: str  # gst_certificate / pan_card / cancelled_cheque / signed_declaration / msme_udyam / …
    url: str
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    verified: bool = False
    remarks: str | None = None


class KycSubmitPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    docs: list[KycDoc]
    msme_registered: bool = False
    msme_udyam_no: str | None = None
    actor_name: str | None = "Vendor"


class KycActionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str | None = "MPCA Accounts"
    actor_role: str | None = "mpca_accounts"
    note: str | None = None
    tds_applicable: bool = True
    tds_rate_pct: float = 2.0
    validity_months: int = 12


async def _get_vendor(vid: str) -> dict:
    v = await db.vendors.find_one({"id": vid}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Vendor not found")
    return v


@api_router.post("/vendors/{vid}/kyc/submit-docs")
async def submit_kyc_docs(vid: str, payload: KycSubmitPayload):
    v = await _get_vendor(vid)
    missing = [d for d in REQUIRED_DOCS if not any(x.doc_type == d for x in payload.docs)]
    if missing:
        raise HTTPException(400, f"Missing required KYC documents: {', '.join(missing)}")

    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "kyc_status": "Docs_Submitted",
        "kyc_docs": [d.model_dump() for d in payload.docs],
        "kyc_submitted_at": now,
        "msme_registered": payload.msme_registered,
        "msme_udyam_no": payload.msme_udyam_no,
        "updated_at": now,
    }
    await db.vendors.update_one({"id": vid}, {"$set": updates})
    await write_audit_log(
        module="vendor_kyc", record_id=vid, action="submit_docs",
        actor={"name": payload.actor_name, "role": "vendor"},
        details={"vendor_name": v.get("name"), "doc_count": len(payload.docs)},
    )
    return await _get_vendor(vid)


@api_router.post("/vendors/{vid}/kyc/verify")
async def verify_kyc(vid: str, payload: KycActionPayload):
    v = await _get_vendor(vid)
    if v.get("kyc_status") != "Docs_Submitted":
        raise HTTPException(400, f"Cannot verify — current KYC status is {v.get('kyc_status', 'Not_Started')}")
    now = datetime.now(timezone.utc)
    expiry = (now + relativedelta(months=+payload.validity_months)).isoformat()
    updates = {
        "kyc_status": "KYC_Verified",
        "kyc_verified_at": now.isoformat(),
        "kyc_verified_by": payload.actor_name,
        "kyc_expires_at": expiry,
        "tds_applicable": payload.tds_applicable,
        "tds_rate_pct": payload.tds_rate_pct,
        "kyc_docs": [{**d, "verified": True} for d in (v.get("kyc_docs") or [])],
        "updated_at": now.isoformat(),
    }
    await db.vendors.update_one({"id": vid}, {"$set": updates})
    await write_audit_log(
        module="vendor_kyc", record_id=vid, action="verify",
        actor={"name": payload.actor_name, "role": payload.actor_role},
        details={"vendor_name": v.get("name"), "tds_rate_pct": payload.tds_rate_pct,
                 "kyc_expires_at": expiry, "note": payload.note},
    )
    return await _get_vendor(vid)


@api_router.post("/vendors/{vid}/kyc/reject")
async def reject_kyc(vid: str, payload: KycActionPayload):
    if not payload.note:
        raise HTTPException(400, "Rejection requires a note")
    v = await _get_vendor(vid)
    now = datetime.now(timezone.utc).isoformat()
    await db.vendors.update_one(
        {"id": vid},
        {"$set": {"kyc_status": "Rejected", "kyc_rejected_reason": payload.note,
                  "kyc_rejected_at": now, "updated_at": now}},
    )
    await write_audit_log(
        module="vendor_kyc", record_id=vid, action="reject",
        actor={"name": payload.actor_name, "role": payload.actor_role},
        details={"vendor_name": v.get("name"), "reason": payload.note},
    )
    return await _get_vendor(vid)


@api_router.get("/vendors-kyc/summary")
async def kyc_summary():
    """Cross-body KYC dashboard: counts by status + expiring-soon list."""
    docs = await db.vendors.find({}, {"_id": 0}).to_list(1000)
    now = datetime.now(timezone.utc)
    by_status: dict = {}
    expiring_30d = []
    for v in docs:
        st = v.get("kyc_status") or "Not_Started"
        # Auto-flag expired for read (persistent lazy check)
        if st == "KYC_Verified" and v.get("kyc_expires_at"):
            try:
                exp = datetime.fromisoformat(v["kyc_expires_at"].replace("Z", "+00:00"))
                if exp <= now:
                    st = "Expired"
                elif (exp - now).days <= 30:
                    expiring_30d.append({
                        "id": v["id"], "vendor_no": v.get("vendor_no"),
                        "name": v.get("name"), "kyc_expires_at": v["kyc_expires_at"],
                        "days_left": (exp - now).days,
                    })
            except Exception as e:
                logger.warning("vendor_kyc: unparseable kyc_expires_at %r on vendor %s (%s)", v.get("kyc_expires_at"), v.get("id"), e)
        by_status[st] = by_status.get(st, 0) + 1
    return {
        "total_vendors": len(docs),
        "by_status": by_status,
        "expiring_30d": expiring_30d,
        "ready_for_transactions": by_status.get("KYC_Verified", 0),
    }
