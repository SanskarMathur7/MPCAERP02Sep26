"""MPCA-235 · Tournament Wiring Console (Ship 1).

Single source of truth for the tournament progression matrix — 9 steps ×
8 tournament types. Each cell carries 8 configurable attributes so MPCA
can govern the full lifecycle without a code deploy.

Data lives in the `tournament_wiring` collection as ONE document with a
version counter — small (~30 KB), loaded once, cached client-side.

Endpoints
─────────
    GET   /api/tournament-wiring                → full matrix
    PATCH /api/tournament-wiring/cell           → update one cell
    POST  /api/tournament-wiring/reset          → restore defaults
    GET   /api/tournament-wiring/export         → download JSON
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

from core.infra import api_router, db

# ─────────────── Constants (verbatim from HTML wiring artifact) ───────────────

STEP_KEYS: list[str] = [
    "tournament_creation",
    "pool_basics",
    "match_official_posting",
    "squad",
    "squad_approval",
    "match_calendar",
    "unified_budget",
    "finance_console",
    "tournament_closure",
    "mpca_visibility",
]

STEPS_META: list[dict[str, str]] = [
    {"key": "tournament_creation",     "label": "Tournament Creation",   "bucket": "Pre_Tournament"},
    {"key": "pool_basics",             "label": "Pool (Basics)",         "bucket": "Pre_Tournament"},
    {"key": "match_official_posting",  "label": "Match Official Posting","bucket": "Pre_Tournament"},
    {"key": "squad",                   "label": "Squad",                 "bucket": "Pre_Tournament"},
    {"key": "squad_approval",          "label": "Squad Approval by MPCA","bucket": "Pre_Tournament"},
    {"key": "match_calendar",          "label": "Match Calendar",        "bucket": "In_Tournament"},
    {"key": "unified_budget",          "label": "Unified Budget",        "bucket": "In_Tournament"},
    {"key": "finance_console",         "label": "Finance Console",       "bucket": "Post_Tournament"},
    {"key": "tournament_closure",      "label": "Tournament Closure",    "bucket": "Post_Tournament"},
    {"key": "mpca_visibility",         "label": "MPCA Visibility",       "bucket": "Post_Tournament"},
]

TYPES_META: list[dict[str, str]] = [
    {"id": "bcci",         "name": "BCCI",                          "sub": "MPCA-run · created by MPCA"},
    {"id": "interdiv",     "name": "Inter Division",                "sub": "MPCA-run · the full build"},
    {"id": "camp",         "name": "Pre-Tournament Camp",           "sub": "Division-run · linked to an Inter-Division tournament"},
    {"id": "district",     "name": "Inter District",                "sub": "Division-run · division creates"},
    {"id": "interschool",  "name": "Inter-School Tournament",       "sub": "Division-run · allotted to Schools · Scheme p.7"},
    {"id": "interclub",    "name": "Inter-Club Tournament ('A' Grade)", "sub": "Division-run · allotted to 'A' Grade Clubs · Scheme pp.14-15"},
    {"id": "coachingcamp", "name": "Periodical Coaching Camp",      "sub": "Division-run · allotted to District Players · Scheme p.16"},
    {"id": "vacationcamp", "name": "Vacation Camp",                 "sub": "Division-run · allotted to Players · Scheme p.17"},
]

# 8 attributes per cell — the "essentials" agreed with the user.
FLAG_VALUES     = ["M", "O", "NA", "INFO"]           # Mandatory / Optional / Not Applicable / Info only
OWNER_VALUES    = ["MPCA", "Division", "District", "Auto"]
APPROVER_VALUES = ["MPCA", "Division", "None"]
MODE_VALUES     = ["Register_Linked", "Manual_PDF", "Auto_Compute", "NA"]
VIS_VALUES      = ["Realtime", "On_Submit", "Never"]

FLAG_LABELS = {
    "M":    "Mandatory",
    "O":    "Optional",
    "NA":   "Not Applicable",
    "INFO": "Visibility / info",
}


def _cell(flag: str, owner: str, approver: str, mode: str, visibility: str,
          blocks_next: bool, sla_days: int | None, text: str) -> dict[str, Any]:
    return {
        "flag":        flag,
        "owner":       owner,
        "approver":    approver,
        "mode":        mode,
        "visibility":  visibility,
        "blocks_next": blocks_next,
        "sla_days":    sla_days,
        "text":        text,
    }


# ─────────────── DEFAULT MATRIX (from HTML artifact + sensible defaults) ───────────────

def _default_cells() -> dict[str, dict[str, dict[str, Any]]]:
    """8 types × 9 steps = 72 cells. Owner/approver/mode/visibility inferred
    from artifact 'text' and 'mode' fields; SLA days seeded conservatively."""
    C = _cell
    return {
        "bcci": {
            "tournament_creation":    C("M",  "MPCA", "None", "Auto_Compute", "Realtime", True, 30, "Created by MPCA on the platform"),
            "pool_basics":            C("M",  "MPCA", "None", "Auto_Compute", "Realtime", True, 7,  "HOST division only (one selectable); multiple match pools allowed"),
            "match_official_posting": C("M",  "MPCA", "MPCA", "Register_Linked", "Realtime", True, 14, "MPCA posts (same as Inter-Division)"),
            "squad":                  C("M",  "MPCA", "None", "Manual_PDF", "Realtime", True, 10, "MPCA uploads the manual squad list (no register selection)"),
            "squad_approval":         C("NA", "Auto", "None", "NA",           "Realtime", False, None, "No — MPCA uploads it directly"),
            "match_calendar":         C("M",  "MPCA", "None", "Manual_PDF", "Realtime", True, 7,  "MANUAL team names (away = other states)"),
            "unified_budget":         C("M",  "MPCA", "MPCA", "Auto_Compute", "Realtime", True, 5,  "Auto per rate card; budget owned by host. Both teams' full squads = AWAY pax (no home-side exemption)"),
            "finance_console":        C("M",  "MPCA", "MPCA", "Auto_Compute", "Realtime", False, 30, "Normal / full"),
            "tournament_closure":     C("M",  "MPCA",     "MPCA", "Manual_PDF", "Realtime",  True,  15, "MPCA drafts, signs & closes"),
            "mpca_visibility":        C("INFO","MPCA", "None", "Auto_Compute", "Realtime", False, None, "Real time"),
        },
        "interdiv": {
            "tournament_creation":    C("M",  "MPCA",     "None", "Auto_Compute",    "Realtime", True, 30, "Created by MPCA"),
            "pool_basics":            C("M",  "MPCA",     "None", "Auto_Compute",    "Realtime", True, 7,  "FULL pool (all participating divisions)"),
            "match_official_posting": C("M",  "MPCA",     "MPCA", "Register_Linked", "Realtime", True, 14, "MPCA posts"),
            "squad":                  C("M",  "Division", "MPCA", "Register_Linked", "Realtime", True, 10, "All participating divisions do squad SELECTION from register"),
            "squad_approval":         C("M",  "MPCA",     "MPCA", "Register_Linked", "Realtime", True, 5,  "Yes — MPCA approves"),
            "match_calendar":         C("M",  "MPCA",     "None", "Auto_Compute",    "Realtime", True, 7,  "Full / auto (max)"),
            "unified_budget":         C("M",  "MPCA",     "MPCA", "Auto_Compute",    "Realtime", True, 5,  "Normal / full (auto per rate card)"),
            "finance_console":        C("M",  "MPCA",     "MPCA", "Auto_Compute",    "Realtime", False, 30, "Normal / full (same as BCCI)"),
            "tournament_closure":     C("M",  "MPCA",     "MPCA", "Manual_PDF",      "Realtime", True,  15, "MPCA drafts, signs & closes"),
            "mpca_visibility":        C("INFO","MPCA",    "None", "Auto_Compute",    "Realtime", False, None, "Real time"),
        },
        "camp": {
            "tournament_creation":    C("NA", "Auto",     "None", "Auto_Compute", "Realtime",  False, None, "Not a fresh create — AUTO-created & LINKED to an active Inter-Division tournament (division picks which)"),
            "pool_basics":            C("NA", "Auto",     "None", "NA",           "Realtime",  False, None, "Not applicable — single division only"),
            "match_official_posting": C("NA", "Auto",     "None", "NA",           "Realtime",  False, None, "Not applicable"),
            "squad":                  C("M",  "Division", "None", "Register_Linked", "Realtime", True, 7, "Division creates & LOCKS for own reference"),
            "squad_approval":         C("NA", "Auto",     "None", "NA",           "Realtime",  False, None, "No — MPCA does NOT approve"),
            "match_calendar":         C("O",  "Division", "None", "Manual_PDF",   "Realtime",  False, None, "Division may make; of no relevance"),
            "unified_budget":         C("M",  "Division", "None", "Auto_Compute", "On_Submit", True, 15, "Auto per rate card; DIVISION creates & uploads; MPCA has no role"),
            "finance_console":        C("M",  "Division", "MPCA", "Auto_Compute", "On_Submit", False, 30, "Normal — shown to MPCA only on claim submission"),
            "tournament_closure":     C("M",  "Division", "MPCA", "Manual_PDF", "On_Submit", True,  15, "Division drafts, signs & closes; MPCA sees on submission"),
            "mpca_visibility":        C("INFO","Division","None", "Auto_Compute", "On_Submit", False, None, "On final submission of claim"),
        },
        "district": {
            "tournament_creation":    C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 21, "DIVISION creates (not MPCA)"),
            "pool_basics":            C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 7,  "Division sets pools for the Districts"),
            "match_official_posting": C("M",  "Division", "Division", "Register_Linked", "Realtime", True, 14, "DIVISION posts"),
            "squad":                  C("M",  "District", "None", "Manual_PDF",   "Realtime", True, 7, "Division adds manual squad + uploads SIGNED sheet per District"),
            "squad_approval":         C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No — division self-manages"),
            "match_calendar":         C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 7,  "Division makes"),
            "unified_budget":         C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 5,  "Normal (auto per rate card), Division-created"),
            "finance_console":        C("M",  "Division", "MPCA", "Auto_Compute", "On_Submit", False, 30, "Normal / same"),
            "tournament_closure":     C("M",  "Division", "MPCA", "Manual_PDF", "Realtime",  True,  15, "Division drafts, signs & closes"),
            "mpca_visibility":        C("INFO","Division","None", "Auto_Compute", "On_Submit", False, None, "Real-time match calendar visible; tournament shown when Division SUBMITS"),
        },
        "interschool": {
            "tournament_creation":    C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 21, "DIVISION creates"),
            "pool_basics":            C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No pool"),
            "match_official_posting": C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "Not applicable"),
            "squad":                  C("M",  "Division", "None", "Manual_PDF",   "Realtime", True, 7, "Division creates manual squad + uploads SIGNED sheet"),
            "squad_approval":         C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No"),
            "match_calendar":         C("O",  "Division", "None", "Manual_PDF",   "Realtime", False, None, "Division may make, all manual fields"),
            "unified_budget":         C("M",  "Division", "None", "Auto_Compute", "On_Submit", True, 15, "Auto from (players × rate card); no MPCA role; division creates & LOCKS"),
            "finance_console":        C("M",  "Division", "MPCA", "Auto_Compute", "On_Submit", False, 30, "Normal / same — entry fee collected by host, declared with the claim"),
            "tournament_closure":     C("M",  "Division", "MPCA", "Manual_PDF", "On_Submit", True,  15, "Division drafts, signs & closes; MPCA sees on submission"),
            "mpca_visibility":        C("INFO","Division","None", "Auto_Compute", "On_Submit", False, None, "On final claim submission only"),
        },
        "interclub": {
            "tournament_creation":    C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 21, "DIVISION creates"),
            "pool_basics":            C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No pool"),
            "match_official_posting": C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "Not applicable"),
            "squad":                  C("M",  "Division", "None", "Manual_PDF",   "Realtime", True, 7, "Division creates manual squad + uploads SIGNED sheet"),
            "squad_approval":         C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No"),
            "match_calendar":         C("O",  "Division", "None", "Manual_PDF",   "Realtime", False, None, "Division may make, all manual fields"),
            "unified_budget":         C("M",  "Division", "None", "Auto_Compute", "On_Submit", True, 15, "Auto from (players × rate card); no MPCA role; division creates & LOCKS. Only the two-day knockout is reimbursed — one-day / league-cum-knockout formats are not"),
            "finance_console":        C("M",  "Division", "MPCA", "Auto_Compute", "On_Submit", False, 30, "Normal / same"),
            "tournament_closure":     C("M",  "Division", "MPCA", "Manual_PDF", "On_Submit", True,  15, "Division drafts, signs & closes; MPCA sees on submission"),
            "mpca_visibility":        C("INFO","Division","None", "Auto_Compute", "On_Submit", False, None, "On final claim submission only"),
        },
        "coachingcamp": {
            "tournament_creation":    C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 21, "DIVISION creates"),
            "pool_basics":            C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No pool"),
            "match_official_posting": C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "Not applicable"),
            "squad":                  C("M",  "Division", "None", "Manual_PDF",   "Realtime", True, 7, "Division creates manual camp squad + uploads SIGNED sheet"),
            "squad_approval":         C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No"),
            "match_calendar":         C("O",  "Division", "None", "Manual_PDF",   "Realtime", False, None, "Division may make, all manual fields"),
            "unified_budget":         C("M",  "Division", "None", "Auto_Compute", "On_Submit", True, 15, "Auto from (players × rate card); no MPCA role; division creates & LOCKS"),
            "finance_console":        C("M",  "Division", "MPCA", "Auto_Compute", "On_Submit", False, 30, "Normal / same — camp for district/rural players who can't practise at the divisional HQ"),
            "tournament_closure":     C("M",  "Division", "MPCA", "Manual_PDF", "On_Submit", True,  15, "Division drafts, signs & closes; MPCA sees on submission"),
            "mpca_visibility":        C("INFO","Division","None", "Auto_Compute", "On_Submit", False, None, "On final claim submission only"),
        },
        "vacationcamp": {
            "tournament_creation":    C("M",  "Division", "None", "Auto_Compute", "Realtime", True, 21, "DIVISION creates"),
            "pool_basics":            C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No pool"),
            "match_official_posting": C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "Not applicable"),
            "squad":                  C("M",  "Division", "None", "Manual_PDF",   "Realtime", True, 7, "Division creates manual camp squad + uploads SIGNED sheet"),
            "squad_approval":         C("NA", "Auto",     "None", "NA",           "Realtime", False, None, "No"),
            "match_calendar":         C("O",  "Division", "None", "Manual_PDF",   "Realtime", False, None, "Division may make, all manual fields"),
            "unified_budget":         C("M",  "Division", "None", "Auto_Compute", "On_Submit", True, 15, "Auto from (players × rate card); no MPCA role; division creates & LOCKS"),
            "finance_console":        C("M",  "Division", "MPCA", "Auto_Compute", "On_Submit", False, 30, "Normal / same — Divisional Secretary must certify no amount was charged from players"),
            "tournament_closure":     C("M",  "Division", "MPCA", "Manual_PDF", "On_Submit", True,  15, "Division drafts, signs & closes; MPCA sees on submission"),
            "mpca_visibility":        C("INFO","Division","None", "Auto_Compute", "On_Submit", False, None, "On final claim submission only"),
        },
    }


# ─────────────── Pydantic models ───────────────

class WiringCellPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type_id: str
    step_key: str
    flag: str | None        = None
    owner: str | None       = None
    approver: str | None    = None
    mode: str | None        = None
    visibility: str | None  = None
    blocks_next: bool | None = None
    sla_days: int | None    = None
    text: str | None        = None


# ─────────────── Seeder + fetcher ───────────────

async def _fetch_or_seed_wiring() -> dict[str, Any]:
    doc = await db.tournament_wiring.find_one({"id": "singleton"}, {"_id": 0})
    if doc:
        return doc
    now = datetime.now(timezone.utc).isoformat()
    new_doc = {
        "id":         "singleton",
        "version":    1,
        "steps":      STEPS_META,
        "types":      TYPES_META,
        "flags":      FLAG_LABELS,
        "cells":      _default_cells(),
        "updated_at": now,
        "updated_by": "system_seed",
        "created_at": now,
    }
    await db.tournament_wiring.insert_one(new_doc)
    return {k: v for k, v in new_doc.items() if k != "_id"}


async def seed_tournament_wiring() -> dict[str, Any]:
    """Idempotent — creates the singleton on first run."""
    return await _fetch_or_seed_wiring()


# ─────────────── Routes ───────────────

@api_router.get("/tournament-wiring")
async def get_tournament_wiring():
    doc = await _fetch_or_seed_wiring()
    # Also send the enum options so the UI dropdowns stay in lockstep with backend
    doc["enums"] = {
        "flag":       FLAG_VALUES,
        "owner":      OWNER_VALUES,
        "approver":   APPROVER_VALUES,
        "mode":       MODE_VALUES,
        "visibility": VIS_VALUES,
    }
    return doc


@api_router.patch("/tournament-wiring/cell")
async def patch_wiring_cell(patch: WiringCellPatch):
    doc = await _fetch_or_seed_wiring()
    if patch.type_id not in doc["cells"]:
        raise HTTPException(status_code=404, detail=f"Unknown tournament type: {patch.type_id}")
    if patch.step_key not in doc["cells"][patch.type_id]:
        raise HTTPException(status_code=404, detail=f"Unknown step: {patch.step_key}")

    # Validate enum values on the way in
    cell = doc["cells"][patch.type_id][patch.step_key]
    before_snapshot = {k: cell.get(k) for k in ("flag", "owner", "approver", "mode", "visibility", "blocks_next", "sla_days", "text")}
    updates: dict[str, Any] = {}
    if patch.flag is not None:
        if patch.flag not in FLAG_VALUES:
            raise HTTPException(status_code=422, detail=f"flag must be one of {FLAG_VALUES}")
        updates["flag"] = patch.flag
    if patch.owner is not None:
        if patch.owner not in OWNER_VALUES:
            raise HTTPException(status_code=422, detail=f"owner must be one of {OWNER_VALUES}")
        updates["owner"] = patch.owner
    if patch.approver is not None:
        if patch.approver not in APPROVER_VALUES:
            raise HTTPException(status_code=422, detail=f"approver must be one of {APPROVER_VALUES}")
        updates["approver"] = patch.approver
    if patch.mode is not None:
        if patch.mode not in MODE_VALUES:
            raise HTTPException(status_code=422, detail=f"mode must be one of {MODE_VALUES}")
        updates["mode"] = patch.mode
    if patch.visibility is not None:
        if patch.visibility not in VIS_VALUES:
            raise HTTPException(status_code=422, detail=f"visibility must be one of {VIS_VALUES}")
        updates["visibility"] = patch.visibility
    if patch.blocks_next is not None:
        updates["blocks_next"] = bool(patch.blocks_next)
    if patch.sla_days is not None:
        sla = int(patch.sla_days) if patch.sla_days else None
        if sla is not None and sla < 0:
            raise HTTPException(status_code=422, detail="sla_days must be >= 0")
        updates["sla_days"] = sla
    if patch.text is not None:
        updates["text"] = patch.text.strip()

    if not updates:
        raise HTTPException(status_code=400, detail="No updates supplied")

    cell.update(updates)
    now = datetime.now(timezone.utc).isoformat()
    await db.tournament_wiring.update_one(
        {"id": "singleton"},
        {"$set": {
            f"cells.{patch.type_id}.{patch.step_key}": cell,
            "updated_at": now,
            "updated_by": "mpca_console",
        }, "$inc": {"version": 1}},
    )
    fresh = await db.tournament_wiring.find_one({"id": "singleton"}, {"_id": 0})

    # MPCA-235 · Ship B · Write an audit row so every wiring edit is traceable
    after_snapshot = {k: cell.get(k) for k in ("flag", "owner", "approver", "mode", "visibility", "blocks_next", "sla_days", "text")}
    diff = {k: [before_snapshot.get(k), after_snapshot.get(k)]
            for k in after_snapshot if before_snapshot.get(k) != after_snapshot.get(k)}
    await db.tournament_wiring_audit.insert_one({
        "id":          str(uuid.uuid4()),
        "type_id":     patch.type_id,
        "step_key":    patch.step_key,
        "diff":        diff,
        "before":      before_snapshot,
        "after":       after_snapshot,
        "version":     fresh["version"],
        "changed_by":  "mpca_console",
        "changed_at":  now,
    })

    return {
        "ok": True,
        "cell": cell,
        "version": fresh["version"],
        "updated_at": fresh["updated_at"],
    }


@api_router.post("/tournament-wiring/reset")
async def reset_tournament_wiring():
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.tournament_wiring.find_one({"id": "singleton"}, {"_id": 0})
    next_version = (existing.get("version", 0) + 1) if existing else 1
    doc = {
        "id":         "singleton",
        "version":    next_version,
        "steps":      STEPS_META,
        "types":      TYPES_META,
        "flags":      FLAG_LABELS,
        "cells":      _default_cells(),
        "updated_at": now,
        "updated_by": "mpca_reset",
        "created_at": existing.get("created_at", now) if existing else now,
    }
    await db.tournament_wiring.replace_one({"id": "singleton"}, doc, upsert=True)
    # Governance audit trail — reset is a wholesale reversion, log it.
    await db.tournament_wiring_audit.insert_one({
        "id":          str(uuid.uuid4()),
        "type_id":     "*",
        "step_key":    "*",
        "diff":        {"__reset__": ["custom", "defaults"]},
        "before":      {"version_before": existing.get("version") if existing else None},
        "after":       {"version_after":  next_version},
        "version":     next_version,
        "changed_by":  "mpca_reset",
        "changed_at":  now,
    })
    return {"ok": True, "version": doc["version"], "updated_at": now}


@api_router.get("/tournament-wiring/export")
async def export_tournament_wiring():
    """Portable JSON export — for signed archives / regulatory filings."""
    doc = await _fetch_or_seed_wiring()
    return {
        "meta": {
            "title":   "MPCA Tournament Wiring",
            "version": doc.get("version", 1),
            "updated": doc.get("updated_at"),
        },
        "flags": doc.get("flags", FLAG_LABELS),
        "steps": [s["label"] for s in doc.get("steps", STEPS_META)],
        "types": [
            {
                "id":   t["id"],
                "name": t["name"],
                "sub":  t.get("sub", ""),
                "cells": [
                    {
                        "step": s["label"],
                        **doc["cells"][t["id"]][s["key"]],
                    }
                    for s in doc.get("steps", STEPS_META)
                ],
            }
            for t in doc.get("types", TYPES_META)
        ],
    }


# ─────────────── MPCA-235 · Ship B · Audit log + Season freeze ───────────────

@api_router.get("/tournament-wiring/audit")
async def list_wiring_audit(limit: int = 200, type_id: str | None = None, step_key: str | None = None):
    """Chronological trail of wiring cell edits. Optional filters by type_id / step_key."""
    q: dict[str, Any] = {}
    if type_id:
        q["type_id"] = type_id
    if step_key:
        q["step_key"] = step_key
    limit = min(max(limit, 1), 1000)
    rows = await db.tournament_wiring_audit.find(q, {"_id": 0}).sort("changed_at", -1).limit(limit).to_list(limit)
    return {"count": len(rows), "rows": rows}


@api_router.post("/tournament-wiring/freeze-season/{cycle}")
async def freeze_season(cycle: str):
    """Snapshot the current matrix as immutable + versioned. Multiple snapshots
    per season are allowed (revisions). Each snapshot carries its own version and
    can be printed as a signed PDF via the /snapshot/{cycle}/{version} route."""
    doc = await _fetch_or_seed_wiring()
    now = datetime.now(timezone.utc).isoformat()
    # Find prior snapshots for this cycle to compute revision number
    prior_count = await db.tournament_wiring_snapshots.count_documents({"cycle": cycle})
    snap = {
        "id":           str(uuid.uuid4()),
        "cycle":        cycle,
        "revision":     prior_count + 1,
        "wiring_version": doc.get("version"),
        "steps":        doc.get("steps", STEPS_META),
        "types":        doc.get("types", TYPES_META),
        "flags":        doc.get("flags", FLAG_LABELS),
        "cells":        doc.get("cells", {}),
        "frozen_at":    now,
        "frozen_by":    "mpca_secretary",
    }
    await db.tournament_wiring_snapshots.insert_one(snap)
    snap.pop("_id", None)
    return {"ok": True, "snapshot": snap}


@api_router.get("/tournament-wiring/snapshots")
async def list_wiring_snapshots(cycle: str | None = None):
    q: dict[str, Any] = {}
    if cycle:
        q["cycle"] = cycle
    rows = await db.tournament_wiring_snapshots.find(q, {"_id": 0, "cells": 0}).sort("frozen_at", -1).to_list(500)
    return {"count": len(rows), "rows": rows}


@api_router.get("/tournament-wiring/snapshots/{snap_id}")
async def get_wiring_snapshot(snap_id: str):
    snap = await db.tournament_wiring_snapshots.find_one({"id": snap_id}, {"_id": 0})
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap


@api_router.get("/tournament-wiring/lifecycle-pdf")
async def download_lifecycle_pdf():
    """Board-quality PDF · full 9-step lifecycle for all 8 tournament types.

    Regenerated on-demand so it always reflects the currently-committed
    wiring narrative. Returns a stream with Content-Disposition inline so
    the browser opens it in a new tab.
    """
    import subprocess

    from fastapi.responses import FileResponse

    pdf_path = "/app/docs/mpca_tournament_lifecycle_reference.pdf"
    # Rebuild fresh — the generator is deterministic and cheap (< 1s)
    try:
        subprocess.run(
            ["python", "-m", "scripts.build_lifecycle_pdf"],
            cwd="/app/backend",
            check=True,
            timeout=15,
            capture_output=True,
        )
    except Exception:
        # If regeneration fails but a prior PDF exists, still serve it.
        import os
        if not os.path.exists(pdf_path):
            raise HTTPException(status_code=500, detail="PDF generation failed")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename="mpca-tournament-lifecycle-reference.pdf",
        headers={"Content-Disposition": 'inline; filename="mpca-tournament-lifecycle-reference.pdf"'},
    )
