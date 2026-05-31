"""Routes · Player Transfer NOC Workflow"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import TransferRequest, TransferCreate, TransferStatus, ClaimAction, ApprovalStep, Player
from core.helpers import _next_noc_no, _notify_for_transfer


# ---------------- Routes: Player Transfers (NOC Workflow) ----------------


async def _next_noc_no(cycle: str) -> str:
    count = await db.transfer_requests.count_documents({"fiscal_cycle": cycle})
    return f"NOC-{cycle}-{count + 1:03d}"


@api_router.get("/transfers", response_model=List[TransferRequest])
async def list_transfers(
    player_id: Optional[str] = None,
    from_body_id: Optional[str] = None,
    to_body_id: Optional[str] = None,
    status: Optional[TransferStatus] = None,
):
    query: dict = {}
    if player_id:
        query["player_id"] = player_id
    if from_body_id:
        query["from_body_id"] = from_body_id
    if to_body_id:
        query["to_body_id"] = to_body_id
    if status:
        query["status"] = status
    docs = await db.transfer_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.post("/transfers", response_model=TransferRequest)
async def create_transfer(payload: TransferCreate):
    player = await db.players.find_one({"id": payload.player_id}, {"_id": 0})
    if not player:
        raise HTTPException(404, "Player not found")
    if payload.from_body_id != player["body_id"]:
        raise HTTPException(400, f"Player is registered with {player['body_id']}, not {payload.from_body_id}")
    if payload.from_body_id == payload.to_body_id:
        raise HTTPException(400, "from_body_id and to_body_id must differ")
    from_body = await db.bodies.find_one({"code": payload.from_body_id}, {"_id": 0})
    to_body = await db.bodies.find_one({"code": payload.to_body_id}, {"_id": 0})
    if not from_body or not to_body:
        raise HTTPException(400, "from_body_id or to_body_id does not exist")
    noc_no = await _next_noc_no(payload.fiscal_cycle)
    tr = TransferRequest(noc_no=noc_no, **payload.model_dump())
    await db.transfer_requests.insert_one(tr.model_dump())
    return tr


async def _transfer_action(tr_id: str, new_status: TransferStatus, allowed_from: tuple, step: ApprovalStep):
    doc = await db.transfer_requests.find_one({"id": tr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Transfer request not found")
    if doc["status"] not in allowed_from:
        raise HTTPException(400, f"Cannot move from status {doc['status']} to {new_status}")
    chain = doc.get("approval_chain", []) or []
    chain.append(step.model_dump())
    update = {
        "status": new_status,
        "approval_chain": chain,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transfer_requests.update_one({"id": tr_id}, {"$set": update})
    updated = await db.transfer_requests.find_one({"id": tr_id}, {"_id": 0})
    await _notify_for_transfer(updated, new_status, step.actor_name)
    return updated


@api_router.post("/transfers/{tr_id}/approve-from", response_model=TransferRequest)
async def approve_from(tr_id: str, action: ClaimAction):
    """Releasing body (from_body_id) signs off."""
    step = ApprovalStep(stage="From_Body_Approved", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Recommended", notes=action.notes)
    return await _transfer_action(tr_id, "From_Body_Approved", ("Draft",), step)


@api_router.post("/transfers/{tr_id}/approve-to", response_model=TransferRequest)
async def approve_to(tr_id: str, action: ClaimAction):
    """Accepting body (to_body_id) confirms acceptance."""
    step = ApprovalStep(stage="To_Body_Approved", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Recommended", notes=action.notes)
    return await _transfer_action(tr_id, "To_Body_Approved", ("From_Body_Approved",), step)


@api_router.post("/transfers/{tr_id}/approve-mpca", response_model=TransferRequest)
async def approve_mpca_transfer(tr_id: str, action: ClaimAction):
    """MPCA final sign-off."""
    step = ApprovalStep(stage="MPCA_Approved", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Sanctioned", notes=action.notes)
    return await _transfer_action(tr_id, "MPCA_Approved", ("To_Body_Approved",), step)


@api_router.post("/transfers/{tr_id}/complete", response_model=TransferRequest)
async def complete_transfer(tr_id: str, action: ClaimAction):
    """Final action — moves the player's body_id and sets status='Transferred' on the previous record."""
    doc = await db.transfer_requests.find_one({"id": tr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Transfer request not found")
    if doc["status"] != "MPCA_Approved":
        raise HTTPException(400, "Transfer must be MPCA-approved before completion")
    # Move the player
    await db.players.update_one(
        {"id": doc["player_id"]},
        {"$set": {"body_id": doc["to_body_id"]}},
    )
    step = ApprovalStep(stage="Completed", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Disbursed", notes=action.notes)
    return await _transfer_action(tr_id, "Completed", ("MPCA_Approved",), step)


@api_router.post("/transfers/{tr_id}/reject", response_model=TransferRequest)
async def reject_transfer(tr_id: str, action: ClaimAction):
    step = ApprovalStep(stage="Rejected", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Rejected", notes=action.notes)
    return await _transfer_action(tr_id, "Rejected", ("Draft", "From_Body_Approved", "To_Body_Approved", "MPCA_Approved"), step)


