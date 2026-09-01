"""Routes · Dashboard summary + Fairplay"""

from core.helpers import _division_score
from core.infra import api_router, db


@api_router.get("/dashboard/stats")
async def dashboard_stats():
    total = await db.members.count_documents({})
    by_cat = {}
    for cat in ["Individual", "Institutional", "Honorary", "Patron"]:
        by_cat[cat] = await db.members.count_documents({"category": cat})
    active = await db.members.count_documents({"status": "Active"})
    pending = await db.members.count_documents({"status": "Pending"})
    disclosures_count = await db.disclosures.count_documents({})
    upcoming = await db.meetings.count_documents({"status": {"$in": ["Scheduled", "Notice_Issued"]}})
    elections_open = await db.elections.count_documents({"status": {"$in": ["Nominations_Open", "Voting_Open"]}})

    # Real fee collection percentage
    total_invoices = await db.fee_invoices.count_documents({})
    paid_invoices = await db.fee_invoices.count_documents({"status": "Paid"})
    fee_pct = round(100 * paid_invoices / total_invoices) if total_invoices else 0

    # Bank balance
    accts = await db.bank_accounts.find({}, {"_id": 0, "current_balance": 1}).to_list(50)
    total_balance = sum(a.get("current_balance", 0) for a in accts)

    return {
        "total_members": total,
        "by_category": by_cat,
        "active_members": active,
        "pending_members": pending,
        "total_disclosures": disclosures_count,
        "upcoming_meetings": upcoming,
        "elections_open": elections_open,
        "pending_grievances": 0,  # placeholder until Phase 4
        "fee_collection_pct": fee_pct,
        "total_invoices": total_invoices,
        "paid_invoices": paid_invoices,
        "total_bank_balance": total_balance,
    }


# ---------------- Routes: Meetings ----------------



@api_router.get("/dashboard/fairplay-rankings")
async def dashboard_fairplay_rankings():
    """Returns a ranked list of all 10 Divisions scored on the Fairplay Index.
    Today's axes: Financial + Corporate Governance.
    Future axis (M3/M4/Players): Player Performance & selection integrity.
    Used by the State-persona dashboard."""
    divisions = await db.bodies.find(
        {"body_type": "Division"}, {"_id": 0}
    ).to_list(50)
    scored = []
    for d in divisions:
        scored.append(await _division_score(d))
    scored.sort(key=lambda x: x["fairplay_score"], reverse=True)
    for i, s in enumerate(scored):
        s["rank"] = i + 1
    return {
        "fiscal_cycle": "2025-26",
        "axes_today": ["financial", "governance"],
        "axes_planned": ["player_performance"],
        "divisions": scored,
        "top": scored[:3],
        "bottom": scored[-3:][::-1],
    }


# Backward-compat alias — old endpoint name still works
@api_router.get("/dashboard/division-performance")
async def dashboard_division_performance_legacy():
    return await dashboard_fairplay_rankings()


