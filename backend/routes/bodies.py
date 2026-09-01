"""Routes · Org Structure (Multi-Tenant)"""
from datetime import datetime, timezone

from fastapi import HTTPException, Request

from core.helpers import SLA_HOURS_BY_STATUS
from core.infra import api_router, db
from models import Body, BodyCreate, BodyType

# ---------------- Routes: Org Structure (Multi-Tenant) ----------------


@api_router.get("/bodies", response_model=list[Body])
async def list_bodies(body_type: BodyType | None = None, parent_code: str | None = None):
    query: dict = {}
    if body_type:
        query["body_type"] = body_type
    if parent_code:
        query["parent_code"] = parent_code
    docs = await db.bodies.find(query, {"_id": 0}).sort("code", 1).to_list(200)
    return docs


@api_router.get("/bodies/tree")
async def bodies_tree():
    """Returns the entire MPCA org tree shaped for UI consumption."""
    docs = await db.bodies.find({}, {"_id": 0}).sort("code", 1).to_list(200)
    by_parent: dict = {}
    for d in docs:
        by_parent.setdefault(d.get("parent_code") or "ROOT", []).append(d)

    def build(parent_code: str):
        children = by_parent.get(parent_code, [])
        return [{**c, "children": build(c["code"])} for c in children]

    return build("ROOT")


@api_router.get("/bodies/{code}", response_model=Body)
async def get_body(code: str):
    doc = await db.bodies.find_one({"code": code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Body not found")
    return doc


@api_router.get("/bodies/{code}/summary")
async def body_summary(code: str):
    """Aggregates a body's footprint: children count, district count under it, total grant budget, etc."""
    doc = await db.bodies.find_one({"code": code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Body not found")

    direct_children = await db.bodies.find({"parent_code": code}, {"_id": 0}).to_list(200)
    # Descendant district count for divisions
    district_count = 0
    if doc["body_type"] == "Division":
        district_count = await db.bodies.count_documents({"parent_code": code, "body_type": "District"})
    elif doc["body_type"] == "State":
        district_count = await db.bodies.count_documents({"body_type": "District"})
    division_count = 0
    if doc["body_type"] == "State":
        division_count = await db.bodies.count_documents({"body_type": "Division"})

    total_annual_grant = sum(c.get("annual_grant_inr", 0) for c in direct_children)

    return {
        "body": doc,
        "direct_children_count": len(direct_children),
        "division_count": division_count,
        "district_count": district_count,
        "total_annual_grant_inr_to_children": total_annual_grant,
    }


@api_router.get("/bodies/{code}/children-activity")
async def body_children_activity(code: str, request: Request):
    """For drill-down ERP dashboard cards: returns per-child summary
    (members count, claims pending, claims overdue, disbursed-YTD, last activity).

    Iter 108 (SEC-004): Division callers can only inspect their own body's
    children; District/Match Official callers get 403.  State personas
    (President / Secretary / Treasurer) retain full visibility.
    """
    from lib.authz import get_principal, require_scope
    principal = get_principal(request)
    if principal.is_district or principal.is_official:
        raise HTTPException(403, "Not permitted to drill-down at this level")
    if not principal.is_state:
        require_scope(principal, code)

    parent = await db.bodies.find_one({"code": code}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Body not found")

    direct_children = await db.bodies.find(
        {"parent_code": code}, {"_id": 0}
    ).sort("name", 1).to_list(200)

    cards = []
    for child in direct_children:
        child_code = child["code"]
        # Members count — counts both `members` (registered adult members
        # like Presidents/Secretaries) and `players` (active cricketers).
        # Feb-2026 · Prior code only summed `db.members`, which meant every
        # body showed 0 — the KPI is really about people the body has on
        # record so we combine both collections.
        members_q = {"body_id": child_code}
        members_count = await db.members.count_documents(members_q)
        active_members = await db.members.count_documents({**members_q, "status": "Active"})
        players_q_scope = {"body_id": {"$in": [child_code]}}
        active_players = await db.players.count_documents({**players_q_scope, "status": "Active"})
        members_count += await db.players.count_documents(players_q_scope)
        active_members += active_players

        # Aggregate scope: for a Division card, include all its descendant Districts too
        scope_codes = [child_code]
        if child.get("body_type") == "Division":
            descendant_dists = await db.bodies.find(
                {"parent_code": child_code, "body_type": "District"}, {"_id": 0, "code": 1}
            ).to_list(200)
            scope_codes.extend([d["code"] for d in descendant_dists])

        claim_q_base = {"body_id": {"$in": scope_codes}}
        claims_pending = await db.claims.count_documents({
            **claim_q_base,
            "status": {"$in": ["Submitted", "Division_Recommended", "MPCA_Sanctioned", "Returned"]},
        })

        # Overdue = pending AND (now > derived due_at).  We don't store due_at; compute on the fly with the SLA table.
        from datetime import timedelta as _td
        now = datetime.now(timezone.utc)
        overdue_count = 0
        pending_docs = await db.claims.find(
            {**claim_q_base, "status": {"$in": list(SLA_HOURS_BY_STATUS.keys())}},
            {"_id": 0, "status": 1, "approval_chain": 1, "created_at": 1},
        ).to_list(500)
        for cl in pending_docs:
            sla_h = SLA_HOURS_BY_STATUS.get(cl.get("status"))
            if not sla_h:
                continue
            chain = cl.get("approval_chain") or []
            anchor = chain[-1].get("timestamp") if chain else cl.get("created_at")
            if not anchor:
                continue
            try:
                anchor_dt = datetime.fromisoformat(anchor.replace("Z", "+00:00"))
            except Exception:
                continue
            if now > anchor_dt + _td(hours=sla_h):
                overdue_count += 1

        # YTD disbursed — Feb-2026 · fiscal_cycle no longer hard-coded to
        # 2025-26; it now follows the active season configured in the
        # schemes route so KPIs stay in sync across the app.
        from routes.reimbursement_schemes import CURRENT_FISCAL_CYCLE
        cycle = CURRENT_FISCAL_CYCLE
        disbursed_docs = await db.claims.find(
            {**claim_q_base, "status": "Disbursed", "fiscal_cycle": cycle},
            {"_id": 0, "amount_inr": 1, "approved_amount_inr": 1, "updated_at": 1},
        ).to_list(500)
        disbursed_total = 0.0
        last_activity = None
        for d in disbursed_docs:
            amt = d.get("approved_amount_inr")
            if amt is None:
                amt = d.get("amount_inr") or 0
            disbursed_total += float(amt or 0)
            if d.get("updated_at") and (not last_activity or d["updated_at"] > last_activity):
                last_activity = d["updated_at"]

        cards.append({
            "code": child_code,
            "name": child.get("name"),
            "body_type": child.get("body_type"),
            "annual_grant_inr": child.get("annual_grant_inr"),
            "members_count": members_count,
            "active_members": active_members,
            "claims_pending": claims_pending,
            "claims_overdue": overdue_count,
            "disbursed_ytd_inr": round(disbursed_total, 2),
            "last_activity": last_activity,
        })

    return {"parent": parent, "children": cards}


# ============================================================
# Division Performance Leaderboard (Feb 2026)
# Scores each Division on Financial + Corporate Governance axes.
# Used by the State-persona dashboard for top/bottom rankings.
# ============================================================


@api_router.post("/bodies", response_model=Body)
async def create_body(payload: BodyCreate):
    if await db.bodies.find_one({"code": payload.code}):
        raise HTTPException(400, f"Body with code {payload.code} already exists")
    body = Body(**payload.model_dump())
    await db.bodies.insert_one(body.model_dump())
    return body


