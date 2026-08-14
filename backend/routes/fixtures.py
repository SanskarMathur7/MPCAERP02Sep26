"""Routes · Phase M2-B/M2-C — Fixtures, Match Results, Rankings, HR Allocation."""
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict
from fastapi import HTTPException

from core.infra import db, api_router
from models import (
    Fixture, FixtureCreate, FixtureStatus,
    MatchResult, MatchResultCreate, MatchOfficialAllocation, MatchOfficialRole,
    SpecialPerformance,
)
from core.helpers import _next_fixture_no


# ---------------- Fixtures ----------------


@api_router.get("/fixtures", response_model=List[Fixture])
async def list_fixtures(
    tournament_id: Optional[str] = None,
    status: Optional[FixtureStatus] = None,
    ground_id: Optional[str] = None,
):
    q: dict = {}
    if tournament_id:
        q["tournament_id"] = tournament_id
    if status:
        q["status"] = status
    if ground_id:
        q["ground_id"] = ground_id
    docs = await db.fixtures.find(q, {"_id": 0}).sort("scheduled_date", 1).to_list(500)
    return docs


@api_router.get("/fixtures/{fid}", response_model=Fixture)
async def get_fixture(fid: str):
    doc = await db.fixtures.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fixture not found")
    return doc


@api_router.post("/fixtures", response_model=Fixture)
async def create_fixture(payload: FixtureCreate):
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if t["status"] not in ("Upcoming", "Squad_Selection", "In_Progress"):
        raise HTTPException(400, f"Cannot create fixtures for a tournament in status {t['status']}")
    fx_no = await _next_fixture_no(t.get("fiscal_cycle") or "2025-26")
    fx = Fixture(
        fixture_no=fx_no,
        tournament_name=t.get("name"),
        **payload.model_dump(),
    )
    await db.fixtures.insert_one(fx.model_dump())
    return fx


@api_router.post("/fixtures/{fid}/status/{new_status}", response_model=Fixture)
async def set_fixture_status(fid: str, new_status: FixtureStatus):
    doc = await db.fixtures.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fixture not found")
    allowed = {
        "Scheduled": ["In_Progress", "Cancelled", "Abandoned"],
        "In_Progress": ["Completed", "Abandoned"],
        "Completed": [],
        "Abandoned": [],
        "Cancelled": [],
    }
    if new_status not in allowed.get(doc["status"], []):
        raise HTTPException(400, f"Cannot move fixture from {doc['status']} to {new_status}")
    await db.fixtures.update_one({"id": fid}, {"$set": {"status": new_status}})
    # MPCA-202 · Auto-refresh DA counters when a fixture's played-status flips.
    try:
        from routes.tournament_plan import rebuild_da_forms
        await rebuild_da_forms(doc["tournament_id"])
    except Exception:
        pass
    # MPCA-203 · Notify each allocated official when the match is Cancelled or Abandoned.
    if new_status in ("Cancelled", "Abandoned"):
        try:
            await _notify_officials_of_match_disruption(doc, new_status)
        except Exception:
            pass
    return await db.fixtures.find_one({"id": fid}, {"_id": 0})


async def _notify_officials_of_match_disruption(fixture: dict, new_status: str) -> None:
    """MPCA-203 · Ping every allocated official (in-app + email) when a
    fixture flips to Cancelled or Abandoned.

    Business rule reminder for the message body:
        Match Fee stays payable for the scheduled day. DA/TA is not paid
        for a day that was not actually played.
    """
    from core.helpers import _create_notification
    from core.email_notifications import send_email

    tournament = await db.tournaments.find_one({"id": fixture["tournament_id"]}, {"_id": 0, "name": 1})
    t_name = (tournament or {}).get("name") or fixture.get("tournament_id")
    match_label = fixture.get("name") or f"{fixture.get('home_team', 'Home')} vs {fixture.get('away_team', 'Away')}"
    match_date = fixture.get("scheduled_date") or ""
    verb = "cancelled" if new_status == "Cancelled" else "abandoned"

    title = f"Match {verb} · {match_label}"
    message_text = (
        f"The match \"{match_label}\" on {match_date} in tournament {t_name} has been {verb}. "
        f"Your Match-Officials Fee for this scheduled day is still payable. "
        f"DA/TA will not apply for this day since the match was not played."
    )
    html_body = (
        f"<p>Hello,</p>"
        f"<p>The match <strong>{match_label}</strong> on <strong>{match_date}</strong> "
        f"in tournament <em>{t_name}</em> has been <strong>{verb}</strong>.</p>"
        f"<ul>"
        f"<li>Your Match-Officials Fee for this scheduled day is still payable.</li>"
        f"<li>DA/TA will <strong>not</strong> apply for this day since the match was not played.</li>"
        f"</ul>"
        f"<p>Regards,<br/>Madhya Pradesh Cricket Association</p>"
    )

    for o in (fixture.get("officials") or []):
        # In-app notification (best-effort — the role_id is a synthetic tag).
        try:
            await _create_notification(
                recipient_role_id=f"official::{(o.get('name') or '').lower().replace(' ', '-')}",
                recipient_body_id=o.get("body_id") or "MPCA",
                title=title,
                message=message_text,
                link=f"/tournaments/{fixture['tournament_id']}/schedule",
                related_type="fixture",
                related_id=fixture.get("id"),
                severity="warning",
                kind="info",
            )
        except Exception:
            pass
        # Email · look up the official's registered email in the central pool.
        try:
            profile = await db.match_officials.find_one(
                {"full_name": o.get("name"), "role": o.get("role")},
                {"_id": 0, "email": 1},
            ) or await db.match_officials.find_one(
                {"full_name": o.get("name")},
                {"_id": 0, "email": 1},
            )
            email_to = (profile or {}).get("email")
            if email_to:
                await send_email(email_to, title, html_body, text_body=message_text)
        except Exception:
            pass


@api_router.post("/fixtures/{fid}/officials", response_model=Fixture)
async def allocate_official(fid: str, payload: MatchOfficialAllocation):
    """M2-C · Allocate Ground / Umpire / Scorer / HR to a fixture."""
    doc = await db.fixtures.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fixture not found")
    officials = list(doc.get("officials", []) or [])
    # Enforce single occupant per role (except Umpire_Reserve which can repeat)
    if payload.role != "Umpire_Reserve":
        officials = [o for o in officials if o["role"] != payload.role]
    officials.append(payload.model_dump())
    await db.fixtures.update_one({"id": fid}, {"$set": {"officials": officials}})
    return await db.fixtures.find_one({"id": fid}, {"_id": 0})


@api_router.delete("/fixtures/{fid}/officials/{oid}", response_model=Fixture)
async def remove_official(fid: str, oid: str):
    doc = await db.fixtures.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fixture not found")
    officials = [o for o in (doc.get("officials") or []) if o["id"] != oid]
    await db.fixtures.update_one({"id": fid}, {"$set": {"officials": officials}})
    return await db.fixtures.find_one({"id": fid}, {"_id": 0})


@api_router.post("/fixtures/{fid}/log-hours")
async def log_work_hours(fid: str, official_id: str, hours: float, note: Optional[str] = None):
    """M2-C · Log work hours for an allocated HR against a specific fixture."""
    if hours <= 0:
        raise HTTPException(400, "Work hours must be positive.")
    doc = await db.fixtures.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fixture not found")
    officials = list(doc.get("officials", []) or [])
    hit = False
    for o in officials:
        if o["id"] == official_id:
            o["work_hours"] = float(o.get("work_hours") or 0) + hours
            if note:
                o["hours_note"] = ((o.get("hours_note") or "") + f" · {note}").strip(" ·")
            hit = True
    if not hit:
        raise HTTPException(404, "Official not found on this fixture")
    await db.fixtures.update_one({"id": fid}, {"$set": {"officials": officials}})
    return {"ok": True, "officials": officials}


# ---------------- Match Results ----------------


@api_router.post("/match-results", response_model=MatchResult)
async def create_match_result(payload: MatchResultCreate):
    fx = await db.fixtures.find_one({"id": payload.fixture_id}, {"_id": 0})
    if not fx:
        raise HTTPException(404, "Fixture not found")
    if fx.get("result_id"):
        raise HTTPException(400, "Result already exists for this fixture")
    mr = MatchResult(**payload.model_dump())
    await db.match_results.insert_one(mr.model_dump())
    await db.fixtures.update_one(
        {"id": payload.fixture_id},
        {"$set": {"result_id": mr.id, "status": "Completed"}},
    )
    return mr


@api_router.get("/match-results/{rid}", response_model=MatchResult)
async def get_match_result(rid: str):
    doc = await db.match_results.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Result not found")
    return doc


@api_router.get("/match-results", response_model=List[MatchResult])
async def list_match_results(tournament_id: Optional[str] = None):
    q: dict = {}
    if tournament_id:
        q["tournament_id"] = tournament_id
    docs = await db.match_results.find(q, {"_id": 0}).sort("entered_at", -1).to_list(500)
    return docs


# ---------------- Rankings ----------------


@api_router.get("/rankings/batting")
async def batting_rankings(tournament_id: Optional[str] = None, season: Optional[str] = None, limit: int = 20):
    """Aggregate batting rankings by player."""
    match: dict = {}
    if tournament_id:
        match["tournament_id"] = tournament_id
    pipeline: List[dict] = []
    if match:
        pipeline.append({"$match": match})
    pipeline += [
        {"$unwind": "$player_stats"},
        {"$group": {
            "_id": "$player_stats.player_id",
            "player_name": {"$first": "$player_stats.player_name"},
            "team": {"$first": "$player_stats.team"},
            "innings": {"$sum": 1},
            "runs": {"$sum": "$player_stats.runs"},
            "balls": {"$sum": "$player_stats.balls_faced"},
            "fours": {"$sum": "$player_stats.fours"},
            "sixes": {"$sum": "$player_stats.sixes"},
        }},
        {"$addFields": {
            "average": {"$cond": [{"$eq": ["$innings", 0]}, 0, {"$divide": ["$runs", "$innings"]}]},
            "strike_rate": {"$cond": [{"$eq": ["$balls", 0]}, 0, {"$multiply": [{"$divide": ["$runs", "$balls"]}, 100]}]},
        }},
        {"$sort": {"runs": -1}},
        {"$limit": limit},
    ]
    return [row async for row in db.match_results.aggregate(pipeline)]


@api_router.get("/rankings/bowling")
async def bowling_rankings(tournament_id: Optional[str] = None, limit: int = 20):
    match: dict = {}
    if tournament_id:
        match["tournament_id"] = tournament_id
    pipeline: List[dict] = []
    if match:
        pipeline.append({"$match": match})
    pipeline += [
        {"$unwind": "$player_stats"},
        {"$match": {"player_stats.overs_bowled": {"$gt": 0}}},
        {"$group": {
            "_id": "$player_stats.player_id",
            "player_name": {"$first": "$player_stats.player_name"},
            "team": {"$first": "$player_stats.team"},
            "innings": {"$sum": 1},
            "overs": {"$sum": "$player_stats.overs_bowled"},
            "runs_conceded": {"$sum": "$player_stats.runs_conceded"},
            "wickets": {"$sum": "$player_stats.wickets"},
            "maidens": {"$sum": "$player_stats.maidens"},
        }},
        {"$addFields": {
            "average": {"$cond": [{"$eq": ["$wickets", 0]}, None, {"$divide": ["$runs_conceded", "$wickets"]}]},
            "economy": {"$cond": [{"$eq": ["$overs", 0]}, 0, {"$divide": ["$runs_conceded", "$overs"]}]},
        }},
        {"$sort": {"wickets": -1, "average": 1}},
        {"$limit": limit},
    ]
    return [row async for row in db.match_results.aggregate(pipeline)]


@api_router.get("/rankings/special-performances")
async def special_performances(tournament_id: Optional[str] = None, limit: int = 50):
    match: dict = {}
    if tournament_id:
        match["tournament_id"] = tournament_id
    pipeline: List[dict] = []
    if match:
        pipeline.append({"$match": match})
    pipeline += [
        {"$unwind": "$special_performances"},
        {"$sort": {"entered_at": -1}},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "player_id": "$special_performances.player_id",
            "player_name": "$special_performances.player_name",
            "achievement": "$special_performances.achievement",
            "value": "$special_performances.value",
            "innings": "$special_performances.innings",
            "tournament_id": 1,
            "match_id": "$fixture_id",
        }},
    ]
    return [row async for row in db.match_results.aggregate(pipeline)]


@api_router.get("/hr-allocations/work-hours")
async def hr_work_hours(name: Optional[str] = None, role: Optional[MatchOfficialRole] = None, tournament_id: Optional[str] = None):
    """M2-C · aggregated work-hours across fixtures for HR payment."""
    match_q: dict = {}
    if tournament_id:
        match_q["tournament_id"] = tournament_id
    pipeline: List[dict] = [{"$match": match_q}] if match_q else []
    pipeline += [
        {"$unwind": "$officials"},
    ]
    if name:
        pipeline.append({"$match": {"officials.name": {"$regex": re.escape(name), "$options": "i"}}})
    if role:
        pipeline.append({"$match": {"officials.role": role}})
    pipeline += [
        {"$group": {
            "_id": {"name": "$officials.name", "role": "$officials.role"},
            "name": {"$first": "$officials.name"},
            "role": {"$first": "$officials.role"},
            "matches": {"$sum": 1},
            "total_hours": {"$sum": "$officials.work_hours"},
            "total_honorarium_inr": {"$sum": "$officials.honorarium_inr"},
        }},
        {"$sort": {"total_hours": -1}},
    ]
    return [row async for row in db.fixtures.aggregate(pipeline)]


@api_router.get("/fixtures-stats/summary")
async def fixtures_stats(tournament_id: Optional[str] = None):
    q: dict = {}
    if tournament_id:
        q["tournament_id"] = tournament_id
    scheduled = await db.fixtures.count_documents({**q, "status": "Scheduled"})
    in_progress = await db.fixtures.count_documents({**q, "status": "In_Progress"})
    completed = await db.fixtures.count_documents({**q, "status": "Completed"})
    total = await db.fixtures.count_documents(q)
    return {
        "total_fixtures": total,
        "scheduled": scheduled,
        "in_progress": in_progress,
        "completed": completed,
    }
