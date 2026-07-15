"""Routes · M12 · Selection Console (post-acceptance squad workflow)."""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, Header
from pydantic import BaseModel, ConfigDict

from core.infra import db, api_router
from models import Squad, SquadMember, MatchOfficials, SquadWaiver

_DIVISION_ROLES = {"division-secretary", "district-secretary", "president", "secretary"}
_MPCA_APPROVER_ROLES = {"secretary", "president"}


async def _tournament_or_404(tid: str) -> dict:
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    return t


async def _ensure_accepted(t: dict):
    acc = t.get("acceptance") or {}
    if acc.get("status") not in ("Accepted", "Not_Required"):
        raise HTTPException(400, f"Squad selection is locked until the host body accepts this tournament (current: {acc.get('status')}).")


@api_router.get("/tournaments/{tid}/selection", response_model=Squad)
async def get_selection(tid: str):
    t = await _tournament_or_404(tid)
    doc = await db.squads.find_one({"tournament_id": tid}, {"_id": 0})
    if doc:
        return doc
    squad = Squad(
        tournament_id=tid,
        body_id=t["host_body_id"],
        team_name=f"{t.get('host_body_id', '')} · {t['name']}",
    )
    await db.squads.insert_one(squad.model_dump())
    return squad.model_dump()


class SelectionPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    shortlist_ids: Optional[List[str]] = None
    votes: Optional[dict] = None
    voters: Optional[List[str]] = None
    members: Optional[List[SquadMember]] = None
    match_officials: Optional[MatchOfficials] = None
    waivers: Optional[List[SquadWaiver]] = None
    notes: Optional[str] = None


@api_router.patch("/tournaments/{tid}/selection", response_model=Squad)
async def patch_selection(
    tid: str,
    payload: SelectionPatch,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    t = await _tournament_or_404(tid)
    await _ensure_accepted(t)
    if x_role_id and x_role_id not in _DIVISION_ROLES:
        raise HTTPException(403, "Only Division / District / MPCA officers may edit the selection.")
    existing = await db.squads.find_one({"tournament_id": tid}, {"_id": 0})
    if not existing:
        squad = Squad(tournament_id=tid, body_id=t["host_body_id"], team_name=f"{t['host_body_id']} · {t['name']}")
        await db.squads.insert_one(squad.model_dump())
        existing = squad.model_dump()
    if existing.get("submission_status") in ("Awaiting_MPCA_Approval", "Approved"):
        raise HTTPException(400, f"Selection is locked (status={existing['submission_status']}). Ask MPCA to reject before editing.")
    update = payload.model_dump(exclude_unset=True)
    if update:
        await db.squads.update_one({"tournament_id": tid}, {"$set": update})
    return await db.squads.find_one({"tournament_id": tid}, {"_id": 0})


class SubmitPayload(BaseModel):
    note: Optional[str] = None


@api_router.post("/tournaments/{tid}/selection/submit", response_model=Squad)
async def submit_selection(
    tid: str,
    payload: SubmitPayload,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    if not x_role_id or x_role_id not in _DIVISION_ROLES:
        raise HTTPException(403, "Only Division / District Secretary may submit the squad to MPCA.")
    t = await _tournament_or_404(tid)
    await _ensure_accepted(t)
    doc = await db.squads.find_one({"tournament_id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No squad drafted yet.")
    if doc.get("submission_status") == "Awaiting_MPCA_Approval":
        raise HTTPException(400, "Squad is already awaiting MPCA approval.")
    if doc.get("submission_status") == "Approved":
        raise HTTPException(400, "Squad is already approved.")

    members = doc.get("members") or []
    if len(members) < 11:
        raise HTTPException(400, f"Squad has {len(members)} players — need at least 11 to submit.")
    if not any(m.get("is_captain") for m in members):
        raise HTTPException(400, "A Captain must be marked before submission.")

    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "submission_status": "Awaiting_MPCA_Approval",
        "submitted_at": now,
        "submitted_by": x_user_name or x_role_id,
        "submitted_by_body": x_body_code,
        "review_note": payload.note,
    }
    await db.squads.update_one({"tournament_id": tid}, {"$set": updates})
    return await db.squads.find_one({"tournament_id": tid}, {"_id": 0})


class ReviewPayload(BaseModel):
    action: str
    note: Optional[str] = None


@api_router.post("/tournaments/{tid}/selection/review", response_model=Squad)
async def review_selection(
    tid: str,
    payload: ReviewPayload,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    if not x_role_id or x_role_id not in _MPCA_APPROVER_ROLES:
        raise HTTPException(403, "Only MPCA Hon. Secretary or President may approve or reject the squad.")
    if payload.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be 'approve' or 'reject'.")
    doc = await db.squads.find_one({"tournament_id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No squad found.")
    if doc.get("submission_status") != "Awaiting_MPCA_Approval":
        raise HTTPException(400, f"Squad is not awaiting approval (status={doc.get('submission_status')}).")
    now = datetime.now(timezone.utc).isoformat()
    new_status = "Approved" if payload.action == "approve" else "Rejected"
    await db.squads.update_one({"tournament_id": tid}, {"$set": {
        "submission_status": new_status,
        "reviewed_at": now,
        "reviewed_by": x_user_name or x_role_id,
        "review_note": payload.note,
    }})
    return await db.squads.find_one({"tournament_id": tid}, {"_id": 0})
