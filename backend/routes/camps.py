"""Routes · Sprint M13-B — Camps & Coaching module.

Camps are coaching / vacation / pre-tournament camps organised by MPCA schemes
3-A, 3-B, 3-C, 3-D. This module mirrors the Tournament Reimbursement Matrix:
Division creates a camp → picks scheme → auto-budget is created → invoices are
uploaded against camp budget → reimbursement claim is submitted at completion.

The finance pipeline (TournamentBudget + TournamentInvoice + ReimbursementClaim)
is reused by threading `tournament_id = camp_id` (both are UUIDs — the models
don't foreign-key check).
"""
from datetime import datetime, timezone
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router
from core.scoping import get_scope, body_scope


CampType = Literal["Periodical_Coaching", "Vacation_Camp", "Reciprocal_Match", "Pre_Tournament_Camp"]
CampStatus = Literal["Draft", "Scheduled", "Running", "Completed", "Cancelled"]

CAMP_TYPE_TO_SCHEME = {
    "Periodical_Coaching": "3-A",
    "Vacation_Camp": "3-B",
    "Reciprocal_Match": "3-C",
    "Pre_Tournament_Camp": "3-D",
}


class CampBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    camp_type: CampType
    body_id: str                                  # organising Division / District
    scheme_code: Optional[str] = None             # 3-A / 3-B / 3-C / 3-D
    start_date: str
    end_date: str
    venue_hint: Optional[str] = None
    coach_name: Optional[str] = None
    trainer_name: Optional[str] = None
    manager_name: Optional[str] = None
    target_age_group: Optional[str] = None        # "U-18", "U-23" etc.
    planned_participants: int = 0
    notes: Optional[str] = None
    fiscal_cycle: str = "2025-26"


class Camp(CampBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    camp_no: str
    status: CampStatus = "Draft"
    actual_participants: Optional[int] = None
    auto_budget_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CampCreate(CampBase):
    created_by: Optional[str] = None


async def _next_camp_no(cycle: str) -> str:
    count = await db.camps.count_documents({"fiscal_cycle": cycle})
    return f"CMP-{cycle}-{count + 1:03d}"


@api_router.get("/camps", response_model=List[Camp])
async def list_camps(
    request: Request,
    body_id: Optional[str] = None,
    camp_type: Optional[CampType] = None,
    status: Optional[CampStatus] = None,
    fiscal_cycle: Optional[str] = None,
):
    q: dict = {}
    if body_id:
        q["body_id"] = body_id
    else:
        q.update(body_scope(get_scope(request)))
    if camp_type: q["camp_type"] = camp_type
    if status: q["status"] = status
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.camps.find(q, {"_id": 0}).sort("start_date", -1).to_list(500)
    return docs


@api_router.get("/camps/{cid}", response_model=Camp)
async def get_camp(cid: str):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    return doc


@api_router.post("/camps", response_model=Camp)
async def create_camp(payload: CampCreate):
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body '{payload.body_id}' not found")
    scheme_code = payload.scheme_code or CAMP_TYPE_TO_SCHEME.get(payload.camp_type)
    camp_no = await _next_camp_no(payload.fiscal_cycle)
    camp = Camp(camp_no=camp_no, **{**payload.model_dump(), "scheme_code": scheme_code})
    await db.camps.insert_one(camp.model_dump())
    return camp


@api_router.patch("/camps/{cid}", response_model=Camp)
async def patch_camp(cid: str, patch: dict):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    allowed = {"name", "camp_type", "scheme_code", "start_date", "end_date", "venue_hint",
               "coach_name", "trainer_name", "manager_name", "target_age_group",
               "planned_participants", "actual_participants", "notes", "status", "auto_budget_id"}
    updates = {k: v for k, v in (patch or {}).items() if k in allowed}
    if updates:
        await db.camps.update_one({"id": cid}, {"$set": updates})
    return await db.camps.find_one({"id": cid}, {"_id": 0})


@api_router.post("/camps/{cid}/complete", response_model=Camp)
async def complete_camp(cid: str, actual_participants: Optional[int] = None):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    updates: dict = {"status": "Completed"}
    if actual_participants is not None:
        updates["actual_participants"] = int(actual_participants)
    await db.camps.update_one({"id": cid}, {"$set": updates})
    return await db.camps.find_one({"id": cid}, {"_id": 0})


@api_router.delete("/camps/{cid}")
async def delete_camp(cid: str):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    if doc.get("status") not in (None, "Draft"):
        raise HTTPException(409, "Only Draft camps may be deleted")
    await db.camps.delete_one({"id": cid})
    return {"ok": True}


@api_router.get("/camps-stats/summary")
async def camps_stats(request: Request, body_id: Optional[str] = None, fiscal_cycle: Optional[str] = None):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    else: q.update(body_scope(get_scope(request)))
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.camps.find(q, {"_id": 0}).to_list(1000)
    return {
        "total": len(docs),
        "by_status": {s: len([d for d in docs if d["status"] == s]) for s in ["Draft", "Scheduled", "Running", "Completed", "Cancelled"]},
        "by_type": {t: len([d for d in docs if d["camp_type"] == t]) for t in ["Periodical_Coaching", "Vacation_Camp", "Reciprocal_Match", "Pre_Tournament_Camp"]},
        "total_planned_participants": sum(d.get("planned_participants") or 0 for d in docs),
    }
