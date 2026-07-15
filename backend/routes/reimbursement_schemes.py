"""Routes · Sprint T-RIM — Read-only Reimbursement Schemes (from MPCA Master Document HTML).

Schemes are seeded from /app/backend/data/reimbursement_schemes.json on startup.
Users cannot edit; MPCA updates by re-uploading the JSON file and re-running seed.
"""
import json
from pathlib import Path
from typing import List, Optional
from fastapi import HTTPException

from core.infra import db, api_router
from models import ReimbursementScheme


SCHEMES_JSON_PATH = Path(__file__).parent.parent / "data" / "reimbursement_schemes.json"


async def seed_reimbursement_schemes() -> int:
    """Idempotent seeder — loads schemes from JSON, upserts by scheme_code."""
    if not SCHEMES_JSON_PATH.exists():
        return 0
    payload = json.loads(SCHEMES_JSON_PATH.read_text())
    schemes = payload.get("schemes", [])
    count = 0
    for s in schemes:
        scheme = ReimbursementScheme(**s)
        await db.reimbursement_schemes.update_one(
            {"scheme_code": scheme.scheme_code},
            {"$set": scheme.model_dump()},
            upsert=True,
        )
        count += 1
    return count


@api_router.get("/reimbursement-schemes", response_model=List[ReimbursementScheme])
async def list_schemes(active_only: bool = True):
    q: dict = {}
    if active_only:
        q["is_active"] = True
    docs = await db.reimbursement_schemes.find(q, {"_id": 0}).sort("scheme_code", 1).to_list(200)
    return docs


@api_router.get("/reimbursement-schemes/{scheme_code}", response_model=ReimbursementScheme)
async def get_scheme(scheme_code: str):
    doc = await db.reimbursement_schemes.find_one({"scheme_code": scheme_code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Scheme not found")
    return doc


@api_router.post("/reimbursement-schemes/reseed")
async def reseed_schemes():
    """MPCA-only: force re-load schemes from data/reimbursement_schemes.json."""
    count = await seed_reimbursement_schemes()
    return {"seeded": count}
