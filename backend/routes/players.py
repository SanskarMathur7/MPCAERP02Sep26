"""Routes · Player Module"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Player, PlayerCreate, DisqualificationFlag, PlayerStatus, PlayerCategory, Body
from core.helpers import _next_player_id, _age_years, _validate_eligibility


# ---------------- Routes: Player Module (Phase IV — M1) ----------------


async def _next_player_id() -> str:
    """Format: MPCA/YYYY/SERIAL (6-digit, zero-padded)."""
    year = datetime.now(timezone.utc).year
    count = await db.players.count_documents({"player_id": {"$regex": f"^MPCA/{year}/"}})
    return f"MPCA/{year}/{count + 1:06d}"


def _age_years(dob: str) -> int:
    """Compute integer age from ISO date string (YYYY-MM-DD)."""
    try:
        d = datetime.strptime(dob, "%Y-%m-%d")
    except Exception:
        return 0
    today = datetime.now(timezone.utc)
    yrs = today.year - d.year
    if (today.month, today.day) < (d.month, d.day):
        yrs -= 1
    return yrs


def _validate_eligibility(p: PlayerCreate) -> tuple[bool, List[str]]:
    """Encodes the Player Rules tab. Returns (ok, [notes])."""
    notes: List[str] = []
    age = _age_years(p.date_of_birth)
    notes.append(f"Computed age: {age} years.")
    if age < 12:
        notes.append("Below the MPCA minimum playing age of 12 — registration permitted but eligibility for senior categories restricted.")
    if age > 60:
        notes.append("Above 60 — registration permitted for veterans/coaches stream only.")

    # Category-specific
    if p.category == "Local_MP":
        if p.domicile_state and p.domicile_state.lower() != "madhya pradesh":
            return False, notes + [
                f"Category 'Local_MP' requires MP domicile, but domicile_state is '{p.domicile_state}'. "
                "Switch category to 'Born_Outside' or update domicile."
            ]
        notes.append("Local-MP — full eligibility across MPCA tournaments.")
    elif p.category == "Born_Outside":
        notes.append("Born-Outside MP — eligible after 5 years of continuous MP residency (Plan §Player Rules).")
        if not p.address_district:
            notes.append("⚠ Address district missing — required to evidence residency.")
    else:  # Guest
        if not p.tw3_verified:
            return False, notes + [
                "Guest players require TW3 maturity verification (Plan §Player Rules). "
                "Set tw3_verified=true once the panel has cleared the player."
            ]
        notes.append("Guest — eligible only for guest-permitting tournaments; per-tournament cap applies.")

    # Identity essentials
    if not p.contact_phone and not p.guardian_phone:
        notes.append("⚠ Neither contact_phone nor guardian_phone provided — registration accepted but please update.")

    return True, notes


@api_router.get("/players", response_model=List[Player])
async def list_players(
    body_id: Optional[str] = None,
    category: Optional[PlayerCategory] = None,
    status: Optional[PlayerStatus] = None,
    search: Optional[str] = None,
):
    query: dict = {}
    if body_id:
        query["body_id"] = body_id
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"player_id": {"$regex": search, "$options": "i"}},
            {"contact_email": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.players.find(query, {"_id": 0}).sort("registered_on", -1).to_list(2000)
    return docs


@api_router.get("/players/{pid}", response_model=Player)
async def get_player(pid: str):
    """Fetch by either id (uuid) or player_id (MPCA/...)."""
    doc = await db.players.find_one({"$or": [{"id": pid}, {"player_id": pid}]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    return doc


@api_router.post("/players/check-eligibility")
async def check_eligibility(payload: PlayerCreate):
    """Dry-run eligibility validator. Returns ok + notes without inserting."""
    ok, notes = _validate_eligibility(payload)
    return {
        "ok": ok,
        "age_years": _age_years(payload.date_of_birth),
        "notes": notes,
    }


@api_router.post("/players", response_model=Player)
async def create_player(payload: PlayerCreate):
    """Register a new player. Runs eligibility validator first (hard-fails on category errors)."""
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    ok, notes = _validate_eligibility(payload)
    if not ok:
        raise HTTPException(400, " · ".join(notes))
    pid = await _next_player_id()
    player = Player(
        player_id=pid,
        eligibility_notes=notes,
        status="Pending",
        **payload.model_dump(),
    )
    await db.players.insert_one(player.model_dump())
    return player


@api_router.post("/players/{pid}/approve", response_model=Player)
async def approve_player(pid: str):
    """District/MPCA approves a Pending registration → Active."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] != "Pending":
        raise HTTPException(400, f"Cannot approve a player in status {doc['status']}")
    await db.players.update_one(
        {"id": pid},
        {"$set": {"status": "Active"}},
    )
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/disqualify", response_model=Player)
async def disqualify_player(pid: str, flag: DisqualificationFlag):
    """Append a disqualification flag (ban/penalty) and update status."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    flags = doc.get("disqualifications", []) or []
    flags.append(flag.model_dump())
    new_status = "Banned" if flag.kind == "Lifetime_Ban" else "Suspended"
    await db.players.update_one(
        {"id": pid},
        {"$set": {"disqualifications": flags, "status": new_status}},
    )
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/reinstate", response_model=Player)
async def reinstate_player(pid: str):
    """Reinstate a Suspended player back to Active."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] not in ("Suspended",):
        raise HTTPException(400, f"Cannot reinstate from status {doc['status']}")
    await db.players.update_one({"id": pid}, {"$set": {"status": "Active"}})
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.get("/players-stats/summary")
async def players_stats():
    total = await db.players.count_documents({})
    active = await db.players.count_documents({"status": "Active"})
    pending = await db.players.count_documents({"status": "Pending"})
    suspended = await db.players.count_documents({"status": "Suspended"})
    by_cat = {}
    for cat in ("Local_MP", "Born_Outside", "Guest"):
        by_cat[cat] = await db.players.count_documents({"category": cat})
    return {
        "total_players": total,
        "active_players": active,
        "pending_players": pending,
        "suspended_players": suspended,
        "by_category": by_cat,
    }


