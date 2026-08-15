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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import api_router, db


# ─────────────── Constants (verbatim from HTML wiring artifact) ───────────────

STEP_KEYS: List[str] = [
    "tournament_creation",
    "pool_basics",
    "match_official_posting",
    "squad",
    "squad_approval",
    "match_calendar",
    "unified_budget",
    "finance_console",
    "mpca_visibility",
]

STEPS_META: List[Dict[str, str]] = [
    {"key": "tournament_creation",     "label": "Tournament Creation",   "bucket": "Pre_Tournament"},
    {"key": "pool_basics",             "label": "Pool (Basics)",         "bucket": "Pre_Tournament"},
    {"key": "match_official_posting",  "label": "Match Official Posting","bucket": "Pre_Tournament"},
    {"key": "squad",                   "label": "Squad",                 "bucket": "Pre_Tournament"},
    {"key": "squad_approval",          "label": "Squad Approval by MPCA","bucket": "Pre_Tournament"},
    {"key": "match_calendar",          "label": "Match Calendar",        "bucket": "In_Tournament"},
    {"key": "unified_budget",          "label": "Unified Budget",        "bucket": "In_Tournament"},
    {"key": "finance_console",         "label": "Finance Console",       "bucket": "Post_Tournament"},
    {"key": "mpca_visibility",         "label": "MPCA Visibility",       "bucket": "Post_Tournament"},
]

TYPES_META: List[Dict[str, str]] = [
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
          blocks_next: bool, sla_days: Optional[int], text: str) -> Dict[str, Any]:
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

def _default_cells() -> Dict[str, Dict[str, Dict[str, Any]]]:
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
            "mpca_visibility":        C("INFO","Division","None", "Auto_Compute", "On_Submit", False, None, "On final claim submission only"),
        },
    }


# ─────────────── Pydantic models ───────────────

class WiringCellPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type_id: str
    step_key: str
    flag: Optional[str]        = None
    owner: Optional[str]       = None
    approver: Optional[str]    = None
    mode: Optional[str]        = None
    visibility: Optional[str]  = None
    blocks_next: Optional[bool] = None
    sla_days: Optional[int]    = None
    text: Optional[str]        = None


# ─────────────── Seeder + fetcher ───────────────

async def _fetch_or_seed_wiring() -> Dict[str, Any]:
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


async def seed_tournament_wiring() -> Dict[str, Any]:
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
    updates: Dict[str, Any] = {}
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
