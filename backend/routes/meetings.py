"""Routes · Meetings + Resolutions"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Meeting, MeetingCreate, MeetingType, MeetingStatus, Resolution, ResolutionCreate
from core.helpers import _next_meeting_no
from core.scoping import get_scope
from core.ai_signed_docs import summarise_signed_minutes


@api_router.get("/meetings", response_model=List[Meeting])
async def list_meetings(meeting_type: Optional[MeetingType] = None, status: Optional[MeetingStatus] = None):
    query = {}
    if meeting_type:
        query["meeting_type"] = meeting_type
    if status:
        query["status"] = status
    docs = await db.meetings.find(query, {"_id": 0}).sort("scheduled_date", -1).to_list(500)
    return docs


@api_router.get("/meetings/{meeting_id}", response_model=Meeting)
async def get_meeting(meeting_id: str):
    doc = await db.meetings.find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meeting not found")
    return doc


@api_router.post("/meetings", response_model=Meeting)
async def create_meeting(payload: MeetingCreate):
    count = await db.meetings.count_documents({"meeting_type": payload.meeting_type})
    meeting_no = _next_meeting_no(payload.meeting_type, count)
    meeting = Meeting(meeting_no=meeting_no, **payload.model_dump())
    await db.meetings.insert_one(meeting.model_dump())
    return meeting


@api_router.patch("/meetings/{meeting_id}", response_model=Meeting)
async def update_meeting(meeting_id: str, payload: MeetingCreate):
    doc = await db.meetings.find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meeting not found")
    update = payload.model_dump(exclude_unset=True)
    await db.meetings.update_one({"id": meeting_id}, {"$set": update})
    return await db.meetings.find_one({"id": meeting_id}, {"_id": 0})


@api_router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str):
    result = await db.meetings.delete_one({"id": meeting_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Meeting not found")
    await db.resolutions.delete_many({"meeting_id": meeting_id})
    return {"deleted": True}


@api_router.get("/meetings/{meeting_id}/resolutions", response_model=List[Resolution])
async def list_resolutions(meeting_id: str):
    docs = await db.resolutions.find({"meeting_id": meeting_id}, {"_id": 0}).sort("number", 1).to_list(200)
    return docs


@api_router.post("/meetings/{meeting_id}/resolutions", response_model=Resolution)
async def add_resolution(meeting_id: str, payload: ResolutionCreate):
    payload_data = payload.model_dump()
    payload_data["meeting_id"] = meeting_id
    res = Resolution(**payload_data)
    await db.resolutions.insert_one(res.model_dump())
    return res


# ─── M39f · Signed minutes upload + AI summary ────────────────────────────
class SignedMinutesUpload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    signed_minutes_url: str
    uploaded_by: Optional[str] = None


@api_router.post("/meetings/{meeting_id}/signed-minutes", response_model=Meeting)
async def upload_signed_minutes(meeting_id: str, payload: SignedMinutesUpload, request: Request):
    """MPCA uploads the signed minutes PDF/image URL (from /api/uploads) and
    kicks off a Gemini-powered summarisation that writes one Resolution per
    identified agenda item."""
    scope = get_scope(request)
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA (State body) may upload signed meeting minutes.")
    doc = await db.meetings.find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meeting not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.meetings.update_one({"id": meeting_id}, {"$set": {
        "signed_minutes_url": payload.signed_minutes_url,
        "signed_minutes_uploaded_at": now,
        "signed_minutes_uploaded_by": payload.uploaded_by or scope.name,
        "ai_summary_status": "Pending",
    }})
    return await db.meetings.find_one({"id": meeting_id}, {"_id": 0})


@api_router.post("/meetings/{meeting_id}/ai-summary", response_model=Meeting)
async def run_meeting_ai_summary(meeting_id: str, request: Request):
    """Run (or re-run) Gemini over the previously-uploaded signed minutes and
    materialise resolutions. Old AI-generated resolutions are cleared first;
    human-entered ones (ai_generated=False) are preserved."""
    scope = get_scope(request)
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA (State body) may run the AI minutes summariser.")
    doc = await db.meetings.find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meeting not found")
    if not doc.get("signed_minutes_url"):
        raise HTTPException(400, "Upload the signed minutes PDF first (POST /meetings/{id}/signed-minutes).")

    result = await summarise_signed_minutes(doc)
    now = datetime.now(timezone.utc).isoformat()

    if result.get("warnings") and not result.get("summary") and not result.get("resolutions"):
        await db.meetings.update_one({"id": meeting_id}, {"$set": {
            "ai_summary_status": "Failed",
            "ai_summary_text": "; ".join(result["warnings"]),
            "ai_summary_generated_at": now,
        }})
        return await db.meetings.find_one({"id": meeting_id}, {"_id": 0})

    # Purge previous AI resolutions
    await db.resolutions.delete_many({"meeting_id": meeting_id, "ai_generated": True})
    # Determine starting number so AI resolutions don't collide with human ones
    existing = await db.resolutions.count_documents({"meeting_id": meeting_id})
    for i, r in enumerate(result.get("resolutions") or []):
        res_doc = Resolution(
            meeting_id=meeting_id,
            number=existing + i + 1,
            title=r.get("title") or "(untitled)",
            text=r.get("text") or "",
            status=r.get("status") or "Proposed",
            ai_generated=True,
            ai_source_agenda_no=r.get("agenda_no"),
        ).model_dump()
        await db.resolutions.insert_one(res_doc)

    await db.meetings.update_one({"id": meeting_id}, {"$set": {
        "ai_summary_status": "Completed",
        "ai_summary_text": result.get("summary") or "",
        "ai_summary_generated_at": now,
    }})
    return await db.meetings.find_one({"id": meeting_id}, {"_id": 0})


# ---------------- Routes: Elections ----------------


