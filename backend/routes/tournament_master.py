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
    # Men's Multi-Day
    ("Ranji Trophy · Elite", "Ranji Elite", "Ranji Trophy · Elite Group (first-class four-day)", "FourDay_Senior", 10),
    ("Ranji Trophy · Plate", "Ranji Plate", "Ranji Trophy · Plate Group (first-class four-day)", "FourDay_Senior", 15),
    ("Duleep Trophy", "Duleep", "Zonal first-class trophy", "FourDay_Senior", 20),
    ("ZR Irani Cup", "Irani", "Ranji Champions vs Rest of India", "FourDay_Senior", 30),
    ("Col CK Nayudu Trophy · Elite", "CK Nayudu Elite", "U-23 first-class · Elite Group", "FourDay_U23", 40),
    ("Col CK Nayudu Trophy · Plate", "CK Nayudu Plate", "U-23 first-class · Plate Group", "FourDay_U23", 45),
    ("Cooch Behar Trophy · Elite", "Cooch Behar Elite", "U-19 first-class · Elite Group", "FourDay_U19", 50),
    ("Cooch Behar Trophy · Plate", "Cooch Behar Plate", "U-19 first-class · Plate Group", "FourDay_U19", 55),
    ("Vijay Merchant Trophy · Elite", "Vijay Merchant Elite", "U-16 first-class · Elite Group", None, 60),
    ("Vijay Merchant Trophy · Plate", "Vijay Merchant Plate", "U-16 first-class · Plate Group", None, 65),
    # Men's Limited Overs
    ("Vijay Hazare Trophy", "Vijay Hazare", "One-Day domestic national championship", "OneDay_Senior", 70),
    ("Syed Mushtaq Ali Trophy", "SMAT", "Twenty20 domestic national championship", "T20_Senior", 80),
    ("Men's U-23 State A One Day Trophy", "U-23 One Day", "U-23 one-day national championship", "OneDay_U23", 90),
    ("Men's U-19 One Day Challenger Trophy", "U-19 Challenger", "U-19 one-day Challenger trophy", "OneDay_U19", 100),
    ("Vinoo Mankad Trophy", "Vinoo Mankad", "U-19 one-day national championship", "OneDay_U19", 110),
    ("Vizzy Trophy", "Vizzy", "U-25 all-India tournament", None, 120),
    ("U-16 Nagesh Trophy", "Nagesh", "U-16 one-day national championship", None, 125),
    # Women's
    ("Sr. Women's Multi-Day Inter-Zonal Trophy", "Women's Multi-Day", "Senior Women multi-day inter-zonal", None, 130),
    ("Sr. Women's One Day Trophy", "Women's ODI", "Senior Women one-day national championship", "OneDay_Womens", 140),
    ("Sr. Women's One Day Inter-Zonal Trophy", "Women's ODI IZ", "Senior Women one-day inter-zonal", "OneDay_Womens", 145),
    ("Sr. Women's T20 Trophy", "Women's T20", "Senior Women T20 national championship", "T20_Womens", 150),
    ("Sr. Women's T20 Inter-Zonal Trophy", "Women's T20 IZ", "Senior Women T20 inter-zonal", "T20_Womens", 155),
    ("Women's U-23 One Day Trophy", "Women U-23 OD", "U-23 Women one-day", None, 160),
    ("Women's U-23 T20 Trophy", "Women U-23 T20", "U-23 Women T20", None, 165),
    ("Women's U-19 One Day Trophy", "Women U-19 OD", "U-19 Women one-day", None, 170),
    ("Women's U-19 T20 Trophy", "Women U-19 T20", "U-19 Women T20", None, 175),
    ("Women's U-15 One Day Trophy", "Women U-15 OD", "U-15 Women one-day", None, 180),
]

SEED_INTER_DIV = [
    ("MY Memorial Trophy", "MY Memorial", "Inter-divisional multi-day memorial trophy · Senior", 10),
    ("Madhavrao Scindia Trophy", "Scindia", "Inter-divisional multi-day trophy · Senior", 20),
    ("JN Bhaya Trophy", "JN Bhaya", "Inter-divisional multi-day trophy · Senior", 30),
    ("H Gaekwad Trophy", "H Gaekwad", "Inter-divisional multi-day trophy · Senior", 40),
    ("SM Khan Trophy", "SM Khan", "Inter-divisional multi-day trophy · Senior", 50),
    ("Parmanandbhai Patel Trophy", "PB Patel", "Inter-divisional multi-day trophy · Senior", 60),
    ("Boys U-22 Limited Over Trophy", "Boys U-22 OD", "Inter-divisional limited-overs trophy · U-22", 70),
    ("MM Jagdale Trophy", "MM Jagdale", "Inter-divisional multi-day trophy · Senior", 80),
    ("AW Kanmadikar Trophy", "AW Kanmadikar", "Inter-divisional multi-day trophy · Senior", 90),
    ("JS Anand Trophy", "JS Anand", "Inter-divisional multi-day trophy · Women's", 100),
    ("Girls U-18 Trophy", "Girls U-18", "Inter-divisional trophy · U-18 (Girls)", 110),
]

SEED_INTER_DIST = [
    ("Indore Division Inter-District Championship",     "Indore Inter-Dist",     "Inter-District championship hosted by Indore Division", 10),
    ("Bhopal Division Inter-District Championship",     "Bhopal Inter-Dist",     "Inter-District championship hosted by Bhopal Division", 20),
    ("Gwalior Division Inter-District Championship",    "Gwalior Inter-Dist",    "Inter-District championship hosted by Gwalior Division", 30),
    ("Jabalpur Division Inter-District Championship",   "Jabalpur Inter-Dist",   "Inter-District championship hosted by Jabalpur Division", 40),
    ("Ujjain Division Inter-District Championship",     "Ujjain Inter-Dist",     "Inter-District championship hosted by Ujjain Division", 50),
    ("Chambal Division Inter-District Championship",    "Chambal Inter-Dist",    "Inter-District championship hosted by Chambal Division", 60),
    ("Sagar Division Inter-District Championship",      "Sagar Inter-Dist",      "Inter-District championship hosted by Sagar Division", 70),
    ("Rewa Division Inter-District Championship",       "Rewa Inter-Dist",       "Inter-District championship hosted by Rewa Division", 80),
    ("Shahdol Division Inter-District Championship",    "Shahdol Inter-Dist",    "Inter-District championship hosted by Shahdol Division", 90),
    ("Narmadapuram Division Inter-District Championship", "Narmadapuram Inter-Dist", "Inter-District championship hosted by Narmadapuram Division", 100),
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
    for name, short, desc, order in SEED_INTER_DIST:
        exists = await db.tournament_master.find_one({
            "category": "Inter_District",
            "name": {"$regex": f"^{name}$", "$options": "i"},
        }, {"_id": 0, "id": 1})
        if not exists:
            await db.tournament_master.insert_one(TournamentMaster(
                category="Inter_District", name=name, short_name=short,
                description=desc, default_scope="Inter_District", sort_order=order,
            ).model_dump())
            created += 1
    return {"created": created}
