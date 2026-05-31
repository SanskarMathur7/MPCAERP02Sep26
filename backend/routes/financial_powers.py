"""Routes · Financial Powers + Member Profile"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import FeeInvoice, Meeting, Member, Resolution
from core.helpers import next_uid as _
from models import SANCTION_THRESHOLDS


# ---------------- Phase 3: Financial Powers ----------------

FINANCIAL_POWERS = [
    {
        "post": "President",
        "single_txn_limit": 500000,
        "approval_required": "None — within budget",
        "scope": "All heads, within sanctioned budget",
    },
    {
        "post": "Honorary Secretary",
        "single_txn_limit": 200000,
        "approval_required": "Joint with Hon. Treasurer above ₹50,000",
        "scope": "Administrative & operational expenditure",
    },
    {
        "post": "Honorary Treasurer",
        "single_txn_limit": 200000,
        "approval_required": "Joint with Hon. Secretary above ₹50,000",
        "scope": "All financial heads; bank signatory",
    },
    {
        "post": "Joint Secretary",
        "single_txn_limit": 25000,
        "approval_required": "Hon. Secretary",
        "scope": "Petty cash, office expenses",
    },
    {
        "post": "Managing Committee (Resolution)",
        "single_txn_limit": 5000000,
        "approval_required": "Resolution at duly-convened meeting",
        "scope": "Capital expenditure, grants, sanctions",
    },
    {
        "post": "Annual General Meeting (Resolution)",
        "single_txn_limit": None,
        "approval_required": "GBM Resolution",
        "scope": "Constitutional amendments, large capex, asset disposal",
    },
]


@api_router.get("/financial-powers")
async def get_financial_powers():
    return {"powers": FINANCIAL_POWERS}


# ---------------- Public: Member Profile + Pay Dues ----------------


@api_router.get("/member-profile/{uid}")
async def member_profile(uid: str):
    """Public profile for a member — includes outstanding invoices for self-service pay."""
    m = await db.members.find_one({"uid": uid}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Member not found")
    invoices = await db.fee_invoices.find(
        {"member_uid": uid}, {"_id": 0}
    ).sort("due_date", -1).to_list(500)
    today_str = datetime.now(timezone.utc).date().isoformat()
    for inv in invoices:
        if inv["status"] == "Pending" and inv["due_date"] < today_str:
            inv["status"] = "Overdue"
    total_outstanding = sum(
        i["amount"] + i.get("late_fee", 0)
        for i in invoices
        if i["status"] in ("Pending", "Overdue")
    )
    # Return minimal member info (don't expose phone/email publicly)
    return {
        "member": {
            "uid": m["uid"],
            "name": m["name"],
            "category": m["category"],
            "sub_category": m.get("sub_category"),
            "membership_date": m.get("membership_date"),
            "effectiveness": m.get("effectiveness"),
            "status": m["status"],
            "photo_url": m.get("photo_url"),
        },
        "invoices": invoices,
        "total_outstanding": total_outstanding,
    }


