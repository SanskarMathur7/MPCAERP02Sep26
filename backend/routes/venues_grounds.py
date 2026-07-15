"""Routes · Phase C — Venue + Ground Master + Ground Expenses (MoM 3+4)

Three lightweight modules:
  1. Venues (CRUD) — stadiums / sports complexes with BCCI categorisation
  2. Grounds (CRUD) — playable fields inside a venue, with ground-staff salary register
  3. Ground Expenses — sub-ledger tracking salaries, maintenance, utilities per ground
     Workflow: Draft → Submitted → Approved → Paid
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException

from core.infra import db, api_router
from core.scoping import get_scope, body_scope
from core.helpers import _create_notification
from models import (
    Venue, VenueCreate, VenueCategory,
    Ground, GroundCreate, GroundStaffMember, GroundType,
    GroundExpense, GroundExpenseCreate, GroundExpenseAction,
    GroundExpenseType, GroundExpenseStatus,
    TournamentFormat, ApprovalStep,
)
from fastapi import Request


# ──────────────────── Helpers ────────────────────

async def _next_venue_no() -> str:
    year = datetime.now(timezone.utc).year
    count = await db.venues.count_documents({})
    return f"VEN-{year}-{count + 1:03d}"


async def _next_ground_no(venue_code: str) -> str:
    count = await db.grounds.count_documents({})
    return f"GRD-{venue_code[:6].upper()}-{count + 1:03d}"


async def _next_ge_no(cycle: str) -> str:
    count = await db.ground_expenses.count_documents({"fiscal_cycle": cycle})
    return f"GE-{cycle}-{count + 1:03d}"


# ──────────────────── Venues ────────────────────

@api_router.get("/venues", response_model=List[Venue])
async def list_venues(
    request: Request,
    category: Optional[VenueCategory] = None,
    body_id: Optional[str] = None,
    owner_body_id: Optional[str] = None,
    managed_by_body_id: Optional[str] = None,
    bcci_approval: Optional[str] = None,
    city: Optional[str] = None,
):
    q: dict = {}
    if category:
        q["category"] = category
    if body_id:
        # Legacy filter — kept for back-compat. Matches either owner or (legacy) body_id.
        q["$or"] = [{"body_id": body_id}, {"owner_body_id": body_id}]
    elif owner_body_id or managed_by_body_id:
        # explicit body-owner filter
        if owner_body_id:
            q["owner_body_id"] = owner_body_id
        if managed_by_body_id:
            q["managed_by_body_id"] = managed_by_body_id
    else:
        # Sprint M13: auto-scope by persona body — a Division/District sees only venues
        # they own or manage; MPCA sees all.
        scope = get_scope(request)
        owner_q = body_scope(scope, field="owner_body_id")
        mgr_q = body_scope(scope, field="managed_by_body_id")
        if owner_q or mgr_q:
            # OR the two scopes together
            parts = []
            for sq in (owner_q, mgr_q):
                if not sq:
                    continue
                if "$or" in sq:
                    parts.extend(sq["$or"])
                else:
                    parts.append(sq)
            if parts:
                q["$or"] = parts
    if bcci_approval:
        q["bcci_approval"] = bcci_approval
    if city:
        q["city"] = {"$regex": city, "$options": "i"}
    return await db.venues.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


def _normalise_venue_payload(data: dict) -> dict:
    """M9 · owner_body_id is the source of truth. body_id (legacy) always mirrors owner.
    Managing body defaults to owner if not set. bcci_calendar_eligible mirrors bcci_approval."""
    owner = data.get("owner_body_id") or data.get("body_id") or "MPCA"
    data["owner_body_id"] = owner
    data["body_id"] = owner  # force-sync — legacy field always matches owner
    if data.get("bcci_approval") and data["bcci_approval"] != "None":
        data["bcci_calendar_eligible"] = True
    elif data.get("bcci_approval") == "None":
        data["bcci_calendar_eligible"] = False
    return data


@api_router.post("/venues", response_model=Venue)
async def create_venue(payload: VenueCreate):
    # M9 · Detect which of body_id / owner_body_id was explicitly set by the client
    # via exclude_unset — Pydantic defaults would otherwise mask the intent.
    explicit = payload.model_dump(exclude_unset=True)
    data = payload.model_dump()
    if "owner_body_id" in explicit:
        data["owner_body_id"] = explicit["owner_body_id"]
        data["body_id"] = explicit["owner_body_id"]
    elif "body_id" in explicit:
        data["owner_body_id"] = explicit["body_id"]
        data["body_id"] = explicit["body_id"]
    # else both defaulted → both stay 'MPCA'
    data = _normalise_venue_payload(data)
    owner = await db.bodies.find_one({"code": data["owner_body_id"]}, {"_id": 0})
    if not owner:
        raise HTTPException(400, f"Owner body {data['owner_body_id']} does not exist")
    if data.get("managed_by_body_id"):
        mgr = await db.bodies.find_one({"code": data["managed_by_body_id"]}, {"_id": 0})
        if not mgr:
            raise HTTPException(400, f"Managing body {data['managed_by_body_id']} does not exist")
    venue_no = await _next_venue_no()
    venue = Venue(venue_no=venue_no, **data)
    await db.venues.insert_one(venue.model_dump())
    return venue


@api_router.get("/venues/{vid}", response_model=Venue)
async def get_venue(vid: str):
    doc = await db.venues.find_one({"id": vid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Venue not found")
    return doc


@api_router.patch("/venues/{vid}", response_model=Venue)
async def update_venue(vid: str, payload: VenueCreate):
    existing = await db.venues.find_one({"id": vid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Venue not found")
    explicit = payload.model_dump(exclude_unset=True)
    data = payload.model_dump()
    if "owner_body_id" in explicit:
        data["owner_body_id"] = explicit["owner_body_id"]
        data["body_id"] = explicit["owner_body_id"]
    elif "body_id" in explicit:
        data["owner_body_id"] = explicit["body_id"]
        data["body_id"] = explicit["body_id"]
    data = _normalise_venue_payload(data)
    if data.get("owner_body_id"):
        owner = await db.bodies.find_one({"code": data["owner_body_id"]}, {"_id": 0})
        if not owner:
            raise HTTPException(400, f"Owner body {data['owner_body_id']} does not exist")
    if data.get("managed_by_body_id"):
        mgr = await db.bodies.find_one({"code": data["managed_by_body_id"]}, {"_id": 0})
        if not mgr:
            raise HTTPException(400, f"Managing body {data['managed_by_body_id']} does not exist")
    await db.venues.update_one({"id": vid}, {"$set": data})
    return await db.venues.find_one({"id": vid}, {"_id": 0})


@api_router.delete("/venues/{vid}")
async def delete_venue(vid: str):
    ground_count = await db.grounds.count_documents({"venue_id": vid})
    if ground_count > 0:
        raise HTTPException(409, f"Cannot delete venue — {ground_count} ground(s) linked. Delete grounds first.")
    res = await db.venues.delete_one({"id": vid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Venue not found")
    return {"ok": True}


# ──────────────────── Grounds ────────────────────

@api_router.get("/grounds", response_model=List[Ground])
async def list_grounds(venue_id: Optional[str] = None, type: Optional[GroundType] = None, format: Optional[TournamentFormat] = None):
    q: dict = {}
    if venue_id:
        q["venue_id"] = venue_id
    if type:
        q["type"] = type
    if format:
        q["suitable_formats"] = format
    return await db.grounds.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


@api_router.post("/grounds", response_model=Ground)
async def create_ground(payload: GroundCreate):
    venue = await db.venues.find_one({"id": payload.venue_id}, {"_id": 0})
    if not venue:
        raise HTTPException(404, "Venue not found")
    ground_no = await _next_ground_no(venue.get("city") or venue.get("venue_no", "GEN"))
    g = Ground(
        ground_no=ground_no,
        venue_name=venue.get("name"),
        **payload.model_dump(),
    )
    await db.grounds.insert_one(g.model_dump())
    return g


@api_router.get("/grounds/{gid}", response_model=Ground)
async def get_ground(gid: str):
    doc = await db.grounds.find_one({"id": gid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground not found")
    return doc


@api_router.patch("/grounds/{gid}", response_model=Ground)
async def update_ground(gid: str, payload: GroundCreate):
    existing = await db.grounds.find_one({"id": gid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Ground not found")
    update = payload.model_dump()
    # If venue changed, re-snapshot venue_name
    if update.get("venue_id") and update["venue_id"] != existing.get("venue_id"):
        venue = await db.venues.find_one({"id": update["venue_id"]}, {"_id": 0})
        if venue:
            update["venue_name"] = venue.get("name")
    await db.grounds.update_one({"id": gid}, {"$set": update})
    return await db.grounds.find_one({"id": gid}, {"_id": 0})


@api_router.post("/grounds/{gid}/staff", response_model=Ground)
async def add_ground_staff(gid: str, staff: GroundStaffMember):
    doc = await db.grounds.find_one({"id": gid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground not found")
    new_staff = (doc.get("ground_staff") or []) + [staff.model_dump()]
    await db.grounds.update_one({"id": gid}, {"$set": {"ground_staff": new_staff}})
    return await db.grounds.find_one({"id": gid}, {"_id": 0})


@api_router.delete("/grounds/{gid}/staff/{sid}", response_model=Ground)
async def remove_ground_staff(gid: str, sid: str):
    doc = await db.grounds.find_one({"id": gid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground not found")
    new_staff = [s for s in (doc.get("ground_staff") or []) if s.get("id") != sid]
    await db.grounds.update_one({"id": gid}, {"$set": {"ground_staff": new_staff}})
    return await db.grounds.find_one({"id": gid}, {"_id": 0})


@api_router.delete("/grounds/{gid}")
async def delete_ground(gid: str):
    exp_count = await db.ground_expenses.count_documents({"ground_id": gid})
    if exp_count > 0:
        raise HTTPException(409, f"Cannot delete ground — {exp_count} expense(s) linked.")
    res = await db.grounds.delete_one({"id": gid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Ground not found")
    return {"ok": True}


# ──────────────────── Ground Expenses ────────────────────

@api_router.get("/ground-expenses", response_model=List[GroundExpense])
async def list_ground_expenses(
    ground_id: Optional[str] = None,
    body_id: Optional[str] = None,
    status: Optional[GroundExpenseStatus] = None,
    expense_type: Optional[GroundExpenseType] = None,
    tournament_id: Optional[str] = None,
    fiscal_cycle: Optional[str] = None,
):
    q: dict = {}
    if ground_id:
        q["ground_id"] = ground_id
    if body_id:
        q["body_id"] = body_id
    if status:
        q["status"] = status
    if expense_type:
        q["expense_type"] = expense_type
    if tournament_id:
        q["tournament_id"] = tournament_id
    if fiscal_cycle:
        q["fiscal_cycle"] = fiscal_cycle
    return await db.ground_expenses.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api_router.post("/ground-expenses", response_model=GroundExpense)
async def create_ground_expense(payload: GroundExpenseCreate):
    ground = await db.grounds.find_one({"id": payload.ground_id}, {"_id": 0})
    if not ground:
        raise HTTPException(404, "Ground not found")
    venue = await db.venues.find_one({"id": ground.get("venue_id")}, {"_id": 0})
    expense_no = await _next_ge_no(payload.fiscal_cycle)
    exp = GroundExpense(
        expense_no=expense_no,
        venue_name=(venue or {}).get("name"),
        ground_name=ground.get("name"),
        **payload.model_dump(),
    )
    await db.ground_expenses.insert_one(exp.model_dump())
    return exp


@api_router.post("/ground-expenses/{eid}/submit", response_model=GroundExpense)
async def submit_ground_expense(eid: str, action: GroundExpenseAction):
    doc = await db.ground_expenses.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground expense not found")
    if doc["status"] != "Draft":
        raise HTTPException(409, f"Cannot submit a ground expense in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Submitted", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Submitted", notes=action.notes,
    )
    update = {
        "status": "Submitted",
        "approval_chain": (doc.get("approval_chain") or []) + [step.model_dump()],
    }
    await db.ground_expenses.update_one({"id": eid}, {"$set": update})
    await _create_notification(
        recipient_role_id="treasurer", recipient_body_id="MPCA",
        title="Ground expense submitted for approval",
        message=f"{doc['expense_no']} · {doc.get('ground_name')} · ₹{doc['amount_inr']:,.0f}",
        link="/ground-expenses", related_type="ground_expense", related_id=eid,
    )
    return await db.ground_expenses.find_one({"id": eid}, {"_id": 0})


@api_router.post("/ground-expenses/{eid}/approve", response_model=GroundExpense)
async def approve_ground_expense(eid: str, action: GroundExpenseAction):
    doc = await db.ground_expenses.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground expense not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, f"Cannot approve a ground expense in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Approved", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Sanctioned", notes=action.notes,
    )
    update = {
        "status": "Approved",
        "approval_chain": (doc.get("approval_chain") or []) + [step.model_dump()],
    }
    await db.ground_expenses.update_one({"id": eid}, {"$set": update})
    return await db.ground_expenses.find_one({"id": eid}, {"_id": 0})


@api_router.post("/ground-expenses/{eid}/reject", response_model=GroundExpense)
async def reject_ground_expense(eid: str, action: GroundExpenseAction):
    doc = await db.ground_expenses.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground expense not found")
    if doc["status"] in ("Paid", "Rejected"):
        raise HTTPException(409, f"Cannot reject a ground expense in status '{doc['status']}'.")
    step = ApprovalStep(
        stage="Rejected", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Rejected", notes=action.notes,
    )
    update = {
        "status": "Rejected",
        "approval_chain": (doc.get("approval_chain") or []) + [step.model_dump()],
    }
    await db.ground_expenses.update_one({"id": eid}, {"$set": update})
    return await db.ground_expenses.find_one({"id": eid}, {"_id": 0})


@api_router.delete("/ground-expenses/{eid}")
async def delete_ground_expense(eid: str):
    doc = await db.ground_expenses.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground expense not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, f"Cannot delete a ground expense in status '{doc['status']}'.")
    await db.ground_expenses.delete_one({"id": eid})
    return {"ok": True}


@api_router.get("/ground-expenses-stats/summary")
async def ground_expenses_stats(ground_id: Optional[str] = None, fiscal_cycle: Optional[str] = None):
    q: dict = {}
    if ground_id:
        q["ground_id"] = ground_id
    if fiscal_cycle:
        q["fiscal_cycle"] = fiscal_cycle
    docs = await db.ground_expenses.find(q, {"_id": 0}).to_list(5000)

    def _sum(items, key):
        return float(sum(i.get(key) or 0 for i in items))

    paid = [d for d in docs if d["status"] == "Paid"]
    approved = [d for d in docs if d["status"] == "Approved"]
    pending = [d for d in docs if d["status"] in ("Draft", "Submitted")]

    by_type: dict = {}
    for d in docs:
        t = d.get("expense_type", "Miscellaneous")
        by_type[t] = by_type.get(t, 0.0) + float(d.get("amount_inr") or 0)

    return {
        "total_expenses": len(docs),
        "paid_count": len(paid),
        "approved_count": len(approved),
        "pending_count": len(pending),
        "amount_paid_inr": _sum(paid, "amount_inr"),
        "amount_approved_inr": _sum(approved, "amount_inr"),
        "amount_pending_inr": _sum(pending, "amount_inr"),
        "by_type": by_type,
    }


@api_router.get("/grounds/{gid}/payroll-summary")
async def ground_payroll_summary(gid: str):
    """Returns monthly payroll for a ground based on its staff register."""
    doc = await db.grounds.find_one({"id": gid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ground not found")
    staff = doc.get("ground_staff") or []
    monthly_total = sum(float(s.get("monthly_salary_inr") or 0) for s in staff)
    by_role: dict = {}
    for s in staff:
        r = s.get("role", "Other")
        by_role[r] = by_role.get(r, 0.0) + float(s.get("monthly_salary_inr") or 0)
    return {
        "ground_id": gid,
        "ground_name": doc.get("name"),
        "venue_name": doc.get("venue_name"),
        "staff_count": len(staff),
        "monthly_total_inr": monthly_total,
        "annual_total_inr": monthly_total * 12,
        "by_role": by_role,
    }
