"""MPCA-205 · Master Tournament Registry — canonical name catalogue.

Feeds the create-tournament wizard's name-dropdown (grouped by category),
so users pick from a curated list instead of free-typing. Pre-Tournament
Camps auto-mirror `Inter_Divisional` entries, so this module does not
carry a `Pre_Tournament_Camp` category.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException

from core.infra import api_router, db
from models import (
    TournamentMaster,
    TournamentMasterCreate,
    TournamentMasterPatch,
    TournamentMasterCategory,
)


@api_router.get("/tournament-master", response_model=List[TournamentMaster])
async def list_tournament_master(category: Optional[str] = None, include_inactive: bool = False):
    q: dict = {}
    if category:
        q["category"] = category
    if not include_inactive:
        q["is_active"] = True
    docs = await db.tournament_master.find(q, {"_id": 0}).sort([
        ("category", 1), ("sort_order", 1), ("name", 1),
    ]).to_list(500)
    return docs


@api_router.get("/tournament-master/grouped")
async def list_tournament_master_grouped(include_inactive: bool = False):
    """Return the registry bucketed by category + a virtual `Pre_Tournament_Camp`
    bucket that mirrors the `Inter_Divisional` entries (read-only)."""
    q: dict = {} if include_inactive else {"is_active": True}
    docs = await db.tournament_master.find(q, {"_id": 0}).sort([
        ("category", 1), ("sort_order", 1), ("name", 1),
    ]).to_list(500)
    buckets: dict = {"BCCI": [], "Inter_Divisional": [], "Inter_District": []}
    for d in docs:
        buckets.setdefault(d["category"], []).append(d)
    # Pre-Tournament Camps mirror Inter_Divisional entries (auto-derived).
    buckets["Pre_Tournament_Camp"] = [
        {**d, "mirrored_from_inter_divisional_id": d["id"], "category": "Pre_Tournament_Camp"}
        for d in buckets["Inter_Divisional"]
    ]
    return buckets


@api_router.post("/tournament-master", response_model=TournamentMaster, status_code=201)
async def create_tournament_master(payload: TournamentMasterCreate):
    # Unique per (category, name-lower)
    existing = await db.tournament_master.find_one({
        "category": payload.category,
        "name": {"$regex": f"^{payload.name.strip()}$", "$options": "i"},
    }, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(409, f"'{payload.name}' already exists under {payload.category}.")
    doc = TournamentMaster(**payload.model_dump())
    await db.tournament_master.insert_one(doc.model_dump())
    return doc


@api_router.patch("/tournament-master/{mid}", response_model=TournamentMaster)
async def update_tournament_master(mid: str, patch: TournamentMasterPatch):
    doc = await db.tournament_master.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Master entry not found")
    p = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not p:
        return doc
    if "name" in p:
        # Guard against renaming to a duplicate under the same category
        clash = await db.tournament_master.find_one({
            "id": {"$ne": mid},
            "category": doc["category"],
            "name": {"$regex": f"^{p['name'].strip()}$", "$options": "i"},
        }, {"_id": 0, "id": 1})
        if clash:
            raise HTTPException(409, f"Another '{p['name']}' already exists under {doc['category']}.")
    p["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tournament_master.update_one({"id": mid}, {"$set": p})
    return await db.tournament_master.find_one({"id": mid}, {"_id": 0})


@api_router.delete("/tournament-master/{mid}")
async def delete_tournament_master(mid: str):
    """Soft-delete — flip `is_active` off so historical tournaments still
    reference a valid master row for audit."""
    doc = await db.tournament_master.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Master entry not found")
    await db.tournament_master.update_one({"id": mid}, {"$set": {
        "is_active": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"id": mid, "is_active": False}


# ── Seeder — invoked on startup, idempotent ────────────────────────────────
SEED_BCCI = [
    ("Ranji Trophy", "Ranji", "First-class four-day national championship", "FourDay_Senior", 10),
    ("Vijay Hazare Trophy", "Vijay Hazare", "One-Day domestic national championship", "OneDay_Senior", 20),
    ("Syed Mushtaq Ali Trophy", "SMAT", "Twenty20 domestic national championship", "T20_Senior", 30),
    ("Duleep Trophy", "Duleep", "Zonal first-class trophy", "FourDay_Senior", 40),
    ("Irani Cup", "Irani", "Ranji Champions vs Rest of India", "FourDay_Senior", 50),
    ("Col. CK Nayudu Trophy", "CK Nayudu", "U-23 first-class (four-day)", "FourDay_U23", 60),
    ("Cooch Behar Trophy", "Cooch Behar", "U-19 first-class (four-day)", "FourDay_U19", 70),
    ("Vinoo Mankad Trophy", "Vinoo Mankad", "U-19 one-day national championship", "OneDay_U19", 80),
    ("Vijay Merchant Trophy", "Vijay Merchant", "U-16 first-class (four-day)", None, 90),
    ("U-16 Nagesh Trophy", "Nagesh", "U-16 one-day national championship", None, 100),
    ("Women's Senior One-Day Trophy", "Women's ODI", "Senior Women one-day national championship", "OneDay_Womens", 110),
    ("Women's Senior T20 Trophy", "Women's T20", "Senior Women T20 national championship", "T20_Womens", 120),
]

SEED_INTER_DIV = [
    ("MY Memorial Trophy", "MY Memorial", "Inter-divisional multi-day memorial trophy", 10),
    ("Madhavrao Scindia Trophy", "Scindia", "Inter-divisional multi-day trophy", 20),
    ("JN Bhaya Trophy", "JN Bhaya", "Inter-divisional multi-day trophy", 30),
]

SEED_INTER_DIST = [
    # Left empty as per user request; UI supports add-from-UI.
]


async def seed_tournament_master() -> dict:
    """Idempotent seeder — inserts missing rows only, never modifies edits."""
    created = 0
    for name, short, desc, fmt, order in SEED_BCCI:
        exists = await db.tournament_master.find_one({
            "category": "BCCI",
            "name": {"$regex": f"^{name}$", "$options": "i"},
        }, {"_id": 0, "id": 1})
        if not exists:
            await db.tournament_master.insert_one(TournamentMaster(
                category="BCCI", name=name, short_name=short, description=desc,
                default_format=fmt, sort_order=order,
            ).model_dump())
            created += 1
    for name, short, desc, order in SEED_INTER_DIV:
        exists = await db.tournament_master.find_one({
            "category": "Inter_Divisional",
            "name": {"$regex": f"^{name}$", "$options": "i"},
        }, {"_id": 0, "id": 1})
        if not exists:
            await db.tournament_master.insert_one(TournamentMaster(
                category="Inter_Divisional", name=name, short_name=short,
                description=desc, default_scope="Inter_Divisional", sort_order=order,
            ).model_dump())
            created += 1
    return {"created": created}
