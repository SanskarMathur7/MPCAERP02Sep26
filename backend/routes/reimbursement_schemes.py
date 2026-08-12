"""Routes · MPCA Reimbursement Schemes (season-versioned).

Storage model — MPCA-Feb2026:
    - Documents are keyed by composite (scheme_code, fiscal_cycle).
    - Each cricketing season (e.g. "2025-26", "2026-27") holds its own copy
      of every scheme, so past budgets stay frozen against the rates that
      were live when they were computed.
    - Master JSONs live under /app/backend/data/schemes/{fiscal_cycle}.json.
      A legacy single-file loader at /app/backend/data/reimbursement_schemes.json
      is still honoured for the CURRENT_FISCAL_CYCLE (backwards compatible).
    - MPCA edits schemes IN-APP via PUT — every edit stamps a revision entry
      inside `revision_history` so we retain an audit trail.
"""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict

from core.infra import db, api_router
from core.scoping import get_scope
from models import ReimbursementScheme, ReimbursementSchemeHead


CURRENT_FISCAL_CYCLE = "2026-27"

DATA_DIR = Path(__file__).parent.parent / "data"
SCHEMES_SEASON_DIR = DATA_DIR / "schemes"
LEGACY_SCHEMES_JSON = DATA_DIR / "reimbursement_schemes.json"


def _require_mpca(scope):
    if scope.body_type != "State":
        raise HTTPException(403, "Only MPCA (State) can modify schemes")


async def seed_reimbursement_schemes() -> int:
    """Idempotent seeder — walks `/app/backend/data/schemes/*.json` and
    upserts each scheme keyed by (scheme_code, fiscal_cycle). Falls back to
    the legacy single-file JSON for the current season if the season folder
    is empty (backwards compatibility with pre-Feb-2026 deployments)."""
    count = 0
    loaded_any = False
    if SCHEMES_SEASON_DIR.exists():
        for season_file in sorted(SCHEMES_SEASON_DIR.glob("*.json")):
            payload = json.loads(season_file.read_text())
            fiscal = payload.get("fiscal_cycle") or season_file.stem
            for s in payload.get("schemes", []):
                s.setdefault("fiscal_cycle", fiscal)
                scheme = ReimbursementScheme(**s)
                await db.reimbursement_schemes.update_one(
                    {"scheme_code": scheme.scheme_code, "fiscal_cycle": scheme.fiscal_cycle},
                    {"$set": scheme.model_dump()},
                    upsert=True,
                )
                count += 1
                loaded_any = True
    if not loaded_any and LEGACY_SCHEMES_JSON.exists():
        # Legacy single-file seed → treat as current season.
        payload = json.loads(LEGACY_SCHEMES_JSON.read_text())
        fiscal = payload.get("fiscal_cycle") or CURRENT_FISCAL_CYCLE
        for s in payload.get("schemes", []):
            s.setdefault("fiscal_cycle", fiscal)
            scheme = ReimbursementScheme(**s)
            await db.reimbursement_schemes.update_one(
                {"scheme_code": scheme.scheme_code, "fiscal_cycle": scheme.fiscal_cycle},
                {"$set": scheme.model_dump()},
                upsert=True,
            )
            count += 1
    return count


@api_router.get("/reimbursement-schemes/seasons")
async def list_scheme_seasons():
    """Return every fiscal_cycle known to the schemes collection so the UI
    can render a season selector. Sorted newest-first."""
    cycles = await db.reimbursement_schemes.distinct("fiscal_cycle")
    cycles = [c for c in cycles if c]
    cycles.sort(reverse=True)
    counts = []
    for c in cycles:
        n = await db.reimbursement_schemes.count_documents({"fiscal_cycle": c})
        counts.append({"fiscal_cycle": c, "scheme_count": n})
    return {"current": CURRENT_FISCAL_CYCLE, "seasons": counts}


@api_router.get("/reimbursement-schemes", response_model=List[ReimbursementScheme])
async def list_schemes(active_only: bool = True, fiscal_cycle: Optional[str] = None):
    q: dict = {}
    if active_only:
        q["is_active"] = True
    q["fiscal_cycle"] = fiscal_cycle or CURRENT_FISCAL_CYCLE
    docs = await db.reimbursement_schemes.find(q, {"_id": 0}).sort("scheme_code", 1).to_list(200)
    return docs


@api_router.get("/reimbursement-schemes/{scheme_code}", response_model=ReimbursementScheme)
async def get_scheme(scheme_code: str, fiscal_cycle: Optional[str] = None):
    q = {"scheme_code": scheme_code, "fiscal_cycle": fiscal_cycle or CURRENT_FISCAL_CYCLE}
    doc = await db.reimbursement_schemes.find_one(q, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"Scheme {scheme_code} not found for {q['fiscal_cycle']}")
    return doc


@api_router.post("/reimbursement-schemes/reseed")
async def reseed_schemes():
    """MPCA-only: force re-load schemes from data/schemes/*.json."""
    count = await seed_reimbursement_schemes()
    return {"seeded": count}


# ── Mid-year edit / new-season utilities (MPCA only) ──────────────────────

class SchemeUpdatePayload(BaseModel):
    """Body for PUT — MPCA can rewrite any of the editable fields.
    Every PUT appends a revision entry so we retain history."""
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    description: Optional[str] = None
    heads: Optional[List[ReimbursementSchemeHead]] = None
    conditions: Optional[List[str]] = None
    required_documents: Optional[List[str]] = None
    is_active: Optional[bool] = None
    revision_note: Optional[str] = None    # user-supplied "why this changed"


@api_router.put("/reimbursement-schemes/{scheme_code}", response_model=ReimbursementScheme)
async def update_scheme(
    scheme_code: str,
    payload: SchemeUpdatePayload,
    request: Request,
    fiscal_cycle: Optional[str] = None,
):
    """MPCA inline-edits a scheme (mid-year revision). Every change is
    version-stamped inside `revision_history` for audit."""
    scope = get_scope(request)
    _require_mpca(scope)
    fc = fiscal_cycle or CURRENT_FISCAL_CYCLE
    existing = await db.reimbursement_schemes.find_one(
        {"scheme_code": scheme_code, "fiscal_cycle": fc}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, f"Scheme {scheme_code} not found for {fc}")

    patch = payload.model_dump(exclude_unset=True, exclude_none=True)
    revision_note = patch.pop("revision_note", None)
    if "heads" in patch:
        patch["heads"] = [h.model_dump() if hasattr(h, "model_dump") else h for h in patch["heads"]]

    # Guard · a PUT that only supplied `revision_note` (no actual field
    # change) is a no-op and MUST NOT deactivate the season by accident.
    if not patch:
        raise HTTPException(400, "No editable fields supplied — nothing to revise")

    now = datetime.now(timezone.utc).isoformat()
    prior_history = existing.get("revision_history", []) or []
    version = len(prior_history) + 1
    revision_entry = {
        "version": version,
        "changed_at": now,
        "changed_by": scope.name or "MPCA",
        "changed_by_body_code": scope.body_code or "MPCA",
        "note": revision_note or f"Manual edit — v{version}",
        "changed_fields": sorted(patch.keys()),
    }
    patch["revision_history"] = prior_history + [revision_entry]
    patch["updated_at"] = now

    await db.reimbursement_schemes.update_one(
        {"scheme_code": scheme_code, "fiscal_cycle": fc},
        {"$set": patch},
    )
    # MPCA-Feb2026 · Any mid-year revision AUTO-DEACTIVATES the season.
    # MPCA must then re-download the master PDF, get it re-signed by the
    # office bearers, and re-upload it under /schemes to unblock tournament
    # / grant-claim creation. Existing tournaments already in-flight keep
    # their frozen head_allocations snapshots, so this only gates NEW work.
    await db.scheme_activation_seasons.update_one(
        {"fiscal_cycle": fc},
        {"$set": {
            "is_active": False,
            "deactivated_at": now,
            "deactivation_reason": (
                f"Scheme {scheme_code} revised (v{version}) by "
                f"{scope.name or 'MPCA'} — {revision_note or 'no note supplied'}. "
                "Re-upload the freshly signed master PDF to re-activate."
            ),
            "deactivated_by_revision": {
                "scheme_code": scheme_code,
                "version": version,
                "changed_by": scope.name or "MPCA",
            },
        }},
        upsert=True,
    )
    doc = await db.reimbursement_schemes.find_one(
        {"scheme_code": scheme_code, "fiscal_cycle": fc}, {"_id": 0}
    )
    return doc


class NewSeasonPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    from_cycle: str                # e.g. "2026-27"
    to_cycle: str                  # e.g. "2027-28"


@api_router.post("/reimbursement-schemes/clone-season")
async def clone_season(payload: NewSeasonPayload, request: Request):
    """MPCA prepares next cricketing season by cloning every scheme from
    `from_cycle` into `to_cycle`. UI then lets MPCA edit rates inline. Fails
    if `to_cycle` already has any schemes (no accidental overwrite)."""
    scope = get_scope(request)
    _require_mpca(scope)
    if await db.reimbursement_schemes.count_documents({"fiscal_cycle": payload.to_cycle}) > 0:
        raise HTTPException(409, f"Season {payload.to_cycle} already exists — pick a different target")
    src_count = await db.reimbursement_schemes.count_documents({"fiscal_cycle": payload.from_cycle})
    if src_count == 0:
        raise HTTPException(404, f"No schemes found for source season {payload.from_cycle}")
    now = datetime.now(timezone.utc).isoformat()
    cloned = 0
    async for doc in db.reimbursement_schemes.find({"fiscal_cycle": payload.from_cycle}, {"_id": 0}):
        doc["fiscal_cycle"] = payload.to_cycle
        # Regenerate the primary `id` so the unique index on `id` doesn't
        # collide with the source-season document we just copied from.
        doc["id"] = str(uuid.uuid4())
        doc["revision_history"] = [{
            "version": 1,
            "changed_at": now,
            "changed_by": scope.name or "MPCA",
            "changed_by_body_code": scope.body_code or "MPCA",
            "note": f"Cloned from {payload.from_cycle}",
            "changed_fields": [],
        }]
        doc["updated_at"] = now
        await db.reimbursement_schemes.update_one(
            {"scheme_code": doc["scheme_code"], "fiscal_cycle": payload.to_cycle},
            {"$set": doc},
            upsert=True,
        )
        cloned += 1
    return {"from_cycle": payload.from_cycle, "to_cycle": payload.to_cycle, "cloned": cloned}
