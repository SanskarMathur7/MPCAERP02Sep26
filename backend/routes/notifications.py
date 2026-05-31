"""Routes · Notifications Bell"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Notification
from core.helpers import next_uid as _


@api_router.get("/")
async def root():
    return {"app": "MPCA ERP", "version": "4.1.0", "status": "ok"}


# ============================================================
# Step 2 · Notification endpoints (G3-a · in-app bell)
# ============================================================

@api_router.get("/notifications", response_model=List[Notification])
async def list_notifications(
    recipient_role_id: str,
    recipient_body_id: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 100,
):
    q: dict = {"recipient_role_id": recipient_role_id}
    if recipient_body_id:
        q["recipient_body_id"] = recipient_body_id
    if unread_only:
        q["read"] = False
    docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.get("/notifications/stats")
async def notifications_stats(
    recipient_role_id: str,
    recipient_body_id: Optional[str] = None,
):
    q: dict = {"recipient_role_id": recipient_role_id, "read": False}
    if recipient_body_id:
        q["recipient_body_id"] = recipient_body_id
    unread = await db.notifications.count_documents(q)
    return {"unread": unread}


@api_router.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str):
    result = await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}


@api_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    recipient_role_id: str,
    recipient_body_id: Optional[str] = None,
):
    q: dict = {"recipient_role_id": recipient_role_id, "read": False}
    if recipient_body_id:
        q["recipient_body_id"] = recipient_body_id
    result = await db.notifications.update_many(q, {"$set": {"read": True}})
    return {"ok": True, "updated": result.modified_count}

