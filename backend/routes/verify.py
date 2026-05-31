"""Routes · Public Member Verify (QR endpoint)"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Member
from core.helpers import next_uid as _


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
    count = await db.fee_invoices.count_documents({})
    return f"MPCA-FEE-{year}-{count + 1:04d}"

