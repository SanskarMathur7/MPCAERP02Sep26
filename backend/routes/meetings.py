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


# MPCA-113 · Curated sub-committee registry. Names + descriptions are
# constants (light-weight; can be moved to a collection later if needed).
# When the client picks a code in the New Meeting form, we auto-resolve
# every member whose `positions[].committee` matches the code's `label`.
SUB_COMMITTEES = [
    {"code": "SELECTION", "label": "Selection", "description": "Selection Committee — squad picks, trial reviews, age-group teams."},
    {"code": "FINANCE",   "label": "Finance",   "description": "Finance Committee — budgets, audits, scheme approvals."},
    {"code": "INFRA",     "label": "Infrastructure", "description": "Infrastructure & Grounds — stadium upgrades, ground certification."},
    {"code": "DISCIPLINARY", "label": "Disciplinary", "description": "Disciplinary Committee — code-of-conduct, sanctions."},
    {"code": "UMPIRING",  "label": "Umpiring",  "description": "Umpires & Match Officials Panel Committee."},
    {"code": "COACHING",  "label": "Coaching",  "description": "Coaching & Age-Group Development Committee."},
    {"code": "WOMENS",    "label": "Womens Cricket", "description": "Women's Cricket & Girls Development."},
    {"code": "MEDIA",     "label": "Media & PR", "description": "Media, communications & sponsorship."},
]


@api_router.get("/sub-committees")
async def list_sub_committees():
    """MPCA-113 · Return the sub-committee registry enriched with member
    counts so the New Meeting form can preview how many people will be
    auto-invited before the user hits Save."""
    out = []
    for c in SUB_COMMITTEES:
        cnt = await db.members.count_documents({"positions.committee": c["label"]})
        out.append({**c, "member_count": cnt})
    return out


@api_router.get("/sub-committees/{code}/members")
async def get_sub_committee_members(code: str):
    """List members belonging to a sub-committee — used by MeetingNew to
    render a preview + populate the attendees list on save."""
    match = next((c for c in SUB_COMMITTEES if c["code"] == code), None)
    if not match:
        raise HTTPException(404, f"Sub-committee {code} not found")
    label = match["label"]
    members = await db.members.find(
        {"positions.committee": label},
        {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "positions": 1},
    ).to_list(200)
    return {"code": code, "label": label, "count": len(members), "members": members}


@api_router.post("/meetings", response_model=Meeting)
async def create_meeting(payload: MeetingCreate):
    count = await db.meetings.count_documents({"meeting_type": payload.meeting_type})
    meeting_no = _next_meeting_no(payload.meeting_type, count)
    data = payload.model_dump()
    # MPCA-113 · If sub-committee picked, auto-add its members to attendees.
    if data.get("sub_committee_code"):
        label_match = next((c for c in SUB_COMMITTEES if c["code"] == data["sub_committee_code"]), None)
        if label_match:
            member_ids = [
                m["id"] for m in await db.members.find(
                    {"positions.committee": label_match["label"]},
                    {"_id": 0, "id": 1},
                ).to_list(200)
            ]
            existing = set(data.get("attendees") or [])
            for mid in member_ids:
                existing.add(mid)
            data["attendees"] = sorted(existing)
    meeting = Meeting(meeting_no=meeting_no, **data)
    await db.meetings.insert_one(meeting.model_dump())
    # MPCA-118 · Send invitation email if high-priority meeting.
    try:
        from core.email_notifications import send_meeting_invitation
        await send_meeting_invitation(meeting)
    except Exception as e:  # noqa: BLE001
        # Non-fatal — email is best-effort. Log via infra later.
        import logging
        logging.getLogger("meetings").warning("Meeting invite email failed: %s", e)
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


