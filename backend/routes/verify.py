"""Routes · Public Member Verify (QR endpoint)"""
from datetime import datetime, timezone

from core.infra import api_router, db
from core.shared_services import next_seq  # H6 · atomic sequence


@api_router.get("/verify/{uid}")
async def verify_member(uid: str):
    """Public endpoint — returns minimal verifiable info about a member by UID."""
    member = await db.members.find_one({"uid": uid}, {"_id": 0})
    if not member:
        return {"valid": False, "uid": uid}
    return {
        "valid": True,
        "uid": member["uid"],
        "name": member["name"],
        "category": member["category"],
        "sub_category": member.get("sub_category"),
        "membership_date": member.get("membership_date"),
        "effectiveness": member.get("effectiveness"),
        "status": member["status"],
        "is_active": member["status"] == "Active",
    }


# ---------------- Phase 3: Fees & Subscriptions ----------------


async def _next_invoice_no() -> str:
    year = datetime.now(timezone.utc).year
    seq = await next_seq("fee_invoice:all", lambda: db.fee_invoices.count_documents({}))
    return f"MPCA-FEE-{year}-{seq:04d}"

