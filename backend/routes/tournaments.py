"""Routes · Tournaments + Squads"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Tournament, TournamentCreate, TournamentStatus, Squad, SquadCreate, SquadAddPlayer, SquadMember, Body, Player, TournamentFormat, TournamentScope
from core.helpers import _next_tournament_no, _check_player_against_tournament, _age_years


# ---------------- Routes: Tournaments (Phase IV.2 — M2) ----------------


async def _next_tournament_no(cycle: str) -> str:
    count = await db.tournaments.count_documents({"fiscal_cycle": cycle})
    return f"TRN-{cycle}-{count + 1:03d}"


@api_router.get("/tournaments", response_model=List[Tournament])
async def list_tournaments(
    status: Optional[TournamentStatus] = None,
    scope: Optional[TournamentScope] = None,
    fiscal_cycle: Optional[str] = None,
    format: Optional[TournamentFormat] = None,
):
    query: dict = {}
    if status:
        query["status"] = status
    if scope:
        query["scope"] = scope
    if fiscal_cycle:
        query["fiscal_cycle"] = fiscal_cycle
    if format:
        query["format"] = format
    docs = await db.tournaments.find(query, {"_id": 0}).sort("start_date", 1).to_list(200)
    return docs


@api_router.get("/tournaments/{tid}", response_model=Tournament)
async def get_tournament(tid: str):
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    return doc


@api_router.post("/tournaments", response_model=Tournament)
async def create_tournament(payload: TournamentCreate):
    host = await db.bodies.find_one({"code": payload.host_body_id}, {"_id": 0})
    if not host:
        raise HTTPException(400, f"Host body {payload.host_body_id} does not exist")
    if payload.age_floor_years and payload.age_cap_years and payload.age_floor_years > payload.age_cap_years:
        raise HTTPException(400, "age_floor_years cannot exceed age_cap_years")
    t = Tournament(
        tournament_no=await _next_tournament_no(payload.fiscal_cycle),
        status="Draft",
        **payload.model_dump(),
    )
    await db.tournaments.insert_one(t.model_dump())
    return t


@api_router.post("/tournaments/{tid}/submit-for-approval", response_model=Tournament)
async def submit_tournament(tid: str, actor_name: str, actor_body_id: str, actor_post: str = "Secretary", notes: Optional[str] = None):
    """Draft → Awaiting_Approval."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(400, f"Cannot submit for approval from status {doc['status']}")
    from models import ApprovalStep
    step = ApprovalStep(stage="Awaiting_Approval", actor_post=actor_post, actor_name=actor_name, actor_body_id=actor_body_id, decision="Submitted", notes=notes)
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": "Awaiting_Approval"}, "$push": {"approval_chain": step.model_dump()}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/approve", response_model=Tournament)
async def approve_tournament(tid: str, actor_name: str, actor_body_id: str = "MPCA", actor_post: str = "Hon. Secretary", notes: Optional[str] = None):
    """Awaiting_Approval → Upcoming (approved & live)."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    if doc["status"] not in ("Awaiting_Approval", "Draft"):
        raise HTTPException(400, f"Cannot approve from status {doc['status']}")
    from models import ApprovalStep
    step = ApprovalStep(stage="Approved", actor_post=actor_post, actor_name=actor_name, actor_body_id=actor_body_id, decision="Sanctioned", notes=notes)
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": "Upcoming"}, "$push": {"approval_chain": step.model_dump()}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/reject", response_model=Tournament)
async def reject_tournament(tid: str, actor_name: str, actor_body_id: str = "MPCA", actor_post: str = "Hon. Secretary", notes: Optional[str] = None):
    """Reject a tournament proposal."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    if doc["status"] not in ("Awaiting_Approval", "Draft"):
        raise HTTPException(400, f"Cannot reject from status {doc['status']}")
    from models import ApprovalStep
    step = ApprovalStep(stage="Rejected", actor_post=actor_post, actor_name=actor_name, actor_body_id=actor_body_id, decision="Rejected", notes=notes)
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": "Rejected"}, "$push": {"approval_chain": step.model_dump()}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/status/{new_status}", response_model=Tournament)
async def set_tournament_status(tid: str, new_status: TournamentStatus):
    """Manually transition a tournament between Upcoming → Squad_Selection → In_Progress → Completed (or Cancelled)."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    allowed = {
        "Draft": ["Awaiting_Approval", "Cancelled"],
        "Awaiting_Approval": ["Upcoming", "Rejected", "Cancelled"],
        "Rejected": ["Draft", "Cancelled"],
        "Upcoming": ["Squad_Selection", "Cancelled"],
        "Squad_Selection": ["In_Progress", "Upcoming", "Cancelled"],
        "In_Progress": ["Completed", "Cancelled"],
        "Completed": [],
        "Cancelled": [],
    }
    if new_status not in allowed.get(doc["status"], []):
        raise HTTPException(400, f"Cannot move tournament from {doc['status']} to {new_status}")
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": new_status}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


# ---------------- Routes: Squads ----------------


@api_router.get("/tournaments/{tid}/squads", response_model=List[Squad])
async def list_squads(tid: str):
    docs = await db.squads.find({"tournament_id": tid}, {"_id": 0}).sort("team_name", 1).to_list(100)
    return docs


@api_router.post("/squads", response_model=Squad)
async def create_squad(payload: SquadCreate):
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    # Disallow duplicate squad per tournament × body
    existing = await db.squads.find_one({"tournament_id": payload.tournament_id, "body_id": payload.body_id})
    if existing:
        raise HTTPException(400, f"A squad for {payload.body_id} already exists in this tournament")
    squad = Squad(**payload.model_dump())
    await db.squads.insert_one(squad.model_dump())
    return squad



@api_router.post("/squads/{squad_id}/players", response_model=Squad)
async def add_player_to_squad(squad_id: str, payload: SquadAddPlayer):
    squad = await db.squads.find_one({"id": squad_id}, {"_id": 0})
    if not squad:
        raise HTTPException(404, "Squad not found")
    t = await db.tournaments.find_one({"id": squad["tournament_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if t["status"] not in ("Upcoming", "Squad_Selection"):
        raise HTTPException(400, f"Cannot modify squad once tournament is {t['status']}")
    player = await db.players.find_one({"id": payload.player_id}, {"_id": 0})
    if not player:
        raise HTTPException(404, "Player not found")

    # Player must belong to the same body as the squad (or a descendant district under a Division squad)
    if squad["body_id"].startswith("DIV-"):
        # Division squad: any district under it is fine
        div_short = squad["body_id"][-3:]
        if not (player["body_id"] == squad["body_id"] or player["body_id"].endswith(div_short)):
            raise HTTPException(400, f"Player {player['player_id']} (body {player['body_id']}) does not belong to {squad['body_id']} or its districts.")
    elif squad["body_id"].startswith("DIST-"):
        if player["body_id"] != squad["body_id"]:
            raise HTTPException(400, f"Player {player['player_id']} (body {player['body_id']}) does not belong to {squad['body_id']}.")

    # Already in squad?
    if any(m["player_id"] == player["id"] for m in squad.get("members", [])):
        raise HTTPException(400, "Player is already in this squad")
    # Capacity check
    if len(squad.get("members", [])) >= t.get("max_squad_size", 18):
        raise HTTPException(400, f"Squad is full (max {t['max_squad_size']} members)")
    # Eligibility against tournament rules (with M1-C guest quotas)
    ok, warns = _check_player_against_tournament(player, t, squad.get("members", []))
    if not ok:
        raise HTTPException(400, " · ".join(warns))

    # Captain uniqueness
    if payload.is_captain:
        for m in squad.get("members", []):
            m["is_captain"] = False

    new_member = SquadMember(
        player_id=player["id"],
        player_no=player["player_id"],
        full_name=player["full_name"],
        role=player["role"],
        guest_subtype=player.get("guest_subtype"),
        is_captain=payload.is_captain,
        is_keeper=payload.is_keeper or player["role"] == "Wicket_Keeper",
    )
    members = (squad.get("members") or []) + [new_member.model_dump()]
    warnings = list(squad.get("eligibility_warnings", []) or [])
    if warns:
        warnings.append(f"{player['player_id']} · " + " · ".join(warns))
    await db.squads.update_one(
        {"id": squad_id},
        {"$set": {"members": members, "eligibility_warnings": warnings}},
    )
    return await db.squads.find_one({"id": squad_id}, {"_id": 0})


@api_router.delete("/squads/{squad_id}/players/{player_id}", response_model=Squad)
async def remove_player_from_squad(squad_id: str, player_id: str):
    squad = await db.squads.find_one({"id": squad_id}, {"_id": 0})
    if not squad:
        raise HTTPException(404, "Squad not found")
    t = await db.tournaments.find_one({"id": squad["tournament_id"]}, {"_id": 0})
    if t and t["status"] not in ("Upcoming", "Squad_Selection"):
        raise HTTPException(400, f"Cannot modify squad once tournament is {t['status']}")
    members = [m for m in (squad.get("members") or []) if m["player_id"] != player_id]
    if len(members) == len(squad.get("members") or []):
        raise HTTPException(404, "Player is not in this squad")
    await db.squads.update_one({"id": squad_id}, {"$set": {"members": members}})
    return await db.squads.find_one({"id": squad_id}, {"_id": 0})


@api_router.get("/tournaments-stats/summary")
async def tournament_stats():
    total = await db.tournaments.count_documents({})
    upcoming = await db.tournaments.count_documents({"status": "Upcoming"})
    selection = await db.tournaments.count_documents({"status": "Squad_Selection"})
    in_progress = await db.tournaments.count_documents({"status": "In_Progress"})
    completed = await db.tournaments.count_documents({"status": "Completed"})
    squads = await db.squads.count_documents({})
    # selected players (sum of member counts via aggregation)
    pipeline = [{"$project": {"sz": {"$size": {"$ifNull": ["$members", []]}}}}, {"$group": {"_id": None, "total": {"$sum": "$sz"}}}]
    selected = 0
    async for row in db.squads.aggregate(pipeline):
        selected = row.get("total", 0)
    return {
        "total_tournaments": total,
        "upcoming": upcoming,
        "in_selection": selection,
        "in_progress": in_progress,
        "completed": completed,
        "total_squads": squads,
        "total_players_selected": selected,
    }

