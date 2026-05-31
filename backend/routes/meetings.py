"""Routes · Meetings + Resolutions"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Meeting, MeetingCreate, MeetingType, MeetingStatus, Resolution, ResolutionCreate
from core.helpers import _next_meeting_no


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


# ---------------- Routes: Elections ----------------


