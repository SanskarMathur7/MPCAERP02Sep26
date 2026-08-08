"""M39b · Event Calendar + Birthday Reminders
──────────────────────────────────────────────────────────────────────────────
A single MPCA-owned calendar that all authenticated members (MPCA + every
Division / District) can view. Only MPCA (State body) may create / edit /
delete events. Non-MPCA callers get 403 on write endpoints.

Birthdays are derived from `members.date_of_birth`. Any caller can query
today's birthdays; results include members across every body so MPCA and
Division users all see who to wish today.

Email blast at 9 AM: MOCKED for now — payload is logged. A cron / scheduler
will replace the log line once SMTP creds are wired in.
"""
from datetime import datetime, timezone, date
from typing import Optional, List
import uuid
import logging

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router
from core.scoping import get_scope


logger = logging.getLogger("events")


EventType = str  # "meeting" | "tournament" | "announcement" | "holiday" | "other"


class EventBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    description: Optional[str] = None
    event_date: str                         # ISO YYYY-MM-DD
    end_date: Optional[str] = None          # ISO — for multi-day events
    start_time: Optional[str] = None        # "10:30"
    end_time: Optional[str] = None
    location: Optional[str] = None
    event_type: EventType = "announcement"


class Event(EventBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by_name: Optional[str] = None
    created_by_body_code: Optional[str] = "MPCA"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────
def _require_mpca(scope) -> None:
    """MPCA (State body) is the sole editor. Raises 403 otherwise."""
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA (State body) may modify the Event Calendar.")


# ── Event CRUD ────────────────────────────────────────────────────────────
@api_router.get("/events", response_model=List[Event])
async def list_events(
    request: Request,
    month: Optional[str] = None,          # "YYYY-MM" — filter to a specific month
    from_date: Optional[str] = None,      # "YYYY-MM-DD"
    to_date: Optional[str] = None,
):
    """Every authenticated user sees the same MPCA-wide calendar."""
    _ = get_scope(request)  # auth handled at frontend for now
    q: dict = {}
    if month:
        q["event_date"] = {"$regex": f"^{month}"}
    elif from_date or to_date:
        rng: dict = {}
        if from_date:
            rng["$gte"] = from_date
        if to_date:
            rng["$lte"] = to_date
        q["event_date"] = rng
    rows = await db.events.find(q, {"_id": 0}).sort("event_date", 1).to_list(500)
    return rows


@api_router.post("/events", response_model=Event)
async def create_event(payload: EventBase, request: Request):
    scope = get_scope(request)
    _require_mpca(scope)
    doc = Event(
        **payload.model_dump(),
        created_by_name=scope.name,
        created_by_body_code=scope.body_code or "MPCA",
    ).model_dump()
    await db.events.insert_one(doc)
    return doc


@api_router.patch("/events/{eid}", response_model=Event)
async def update_event(eid: str, patch: dict, request: Request):
    scope = get_scope(request)
    _require_mpca(scope)
    doc = await db.events.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Event not found")
    allowed = {"title", "description", "event_date", "end_date", "start_time",
               "end_time", "location", "event_type"}
    updates = {k: v for k, v in (patch or {}).items() if k in allowed}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.events.update_one({"id": eid}, {"$set": updates})
    return await db.events.find_one({"id": eid}, {"_id": 0})


@api_router.delete("/events/{eid}")
async def delete_event(eid: str, request: Request):
    scope = get_scope(request)
    _require_mpca(scope)
    res = await db.events.delete_one({"id": eid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Event not found")
    return {"deleted": True}


# ── Birthdays ────────────────────────────────────────────────────────────
@api_router.get("/events/birthdays/today")
async def birthdays_today():
    """Members whose DOB day + month matches today. Body-agnostic — MPCA
    and every Division user sees the same all-body roster so no one misses
    a birthday wish."""
    today = date.today()
    mm = f"{today.month:02d}"
    dd = f"{today.day:02d}"
    # date_of_birth stored as ISO YYYY-MM-DD — match on suffix "-MM-DD"
    suffix = f"-{mm}-{dd}"
    rows = await db.members.find(
        {"date_of_birth": {"$regex": f"{suffix}$"}},
        {"_id": 0, "id": 1, "uid": 1, "name": 1, "email": 1, "phone": 1,
         "body_id": 1, "date_of_birth": 1, "role": 1, "member_type": 1, "photo_url": 1},
    ).to_list(500)
    # Compute turning-age
    for r in rows:
        try:
            dob = datetime.strptime(r["date_of_birth"], "%Y-%m-%d").date()
            r["age"] = today.year - dob.year
        except Exception:
            r["age"] = None
    return {"date": today.isoformat(), "count": len(rows), "members": rows}


@api_router.get("/events/birthdays/upcoming")
async def birthdays_upcoming(days: int = 30):
    """Members with a birthday in the next `days` days (inclusive of today)."""
    from datetime import timedelta
    today = date.today()
    horizon = today + timedelta(days=max(1, min(days, 90)))
    # Collect month-day patterns to search
    patterns: list[str] = []
    cur = today
    for _ in range(0, (horizon - today).days + 1):
        patterns.append(f"-{cur.month:02d}-{cur.day:02d}$")
        cur = cur + timedelta(days=1)
    if not patterns:
        return {"count": 0, "members": []}
    or_clauses = [{"date_of_birth": {"$regex": p}} for p in patterns]
    rows = await db.members.find(
        {"$or": or_clauses},
        {"_id": 0, "id": 1, "uid": 1, "name": 1, "email": 1, "body_id": 1,
         "date_of_birth": 1, "role": 1, "photo_url": 1},
    ).to_list(500)
    # Compute this-year birthday to sort ascending
    def _this_year_bday(iso: str) -> str:
        try:
            dob = datetime.strptime(iso, "%Y-%m-%d").date()
            return f"{today.year}-{dob.month:02d}-{dob.day:02d}"
        except Exception:
            return "9999-12-31"
    for r in rows:
        r["upcoming_date"] = _this_year_bday(r.get("date_of_birth", ""))
    rows.sort(key=lambda r: r.get("upcoming_date") or "")
    return {"from": today.isoformat(), "to": horizon.isoformat(),
            "count": len(rows), "members": rows}


@api_router.post("/events/birthdays/send-daily-emails")
async def send_daily_birthday_emails():
    """MPCA-118 · Daily birthday emails.

    Uses `core.email_notifications.send_birthday_greeting` which dispatches
    via configured SMTP (env: `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`)
    or logs as MOCKED when SMTP isn't wired — no code change needed later.
    """
    from core.email_notifications import send_birthday_greeting
    result = await birthdays_today()
    sent = []
    mocked = 0
    for m in result.get("members", []):
        if not m.get("email"):
            continue
        r = await send_birthday_greeting({"email": m["email"], "full_name": m.get("name")})
        sent.append({"to": m["email"], "name": m.get("name"), "status": r.get("status")})
        if r.get("status") == "mocked":
            mocked += 1
    return {"date": result["date"], "attempted": len(sent), "sent": sent, "mocked": mocked > 0}


# ── Scheme season activation (M39c) ──────────────────────────────────────
class SchemeActivationPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    fiscal_cycle: str                          # e.g. "2025-26"
    signed_pdf_url: str                        # /api/uploads/<id>
    signed_by: Optional[str] = None            # office bearer name (fallback: scope.name)
    notes: Optional[str] = None


@api_router.get("/schemes/season-activation")
async def get_scheme_activation(fiscal_cycle: str):
    """Fetch activation status for a given season. Returns `is_active=false`
    if no doc yet exists (i.e. MPCA has not uploaded the signed PDF yet)."""
    doc = await db.scheme_activation_seasons.find_one(
        {"fiscal_cycle": fiscal_cycle}, {"_id": 0}
    )
    if not doc:
        return {
            "fiscal_cycle": fiscal_cycle,
            "is_active": False,
            "signed_pdf_url": None,
            "signed_by": None,
            "signed_at": None,
            "notes": None,
        }
    return doc


@api_router.post("/schemes/season-activation")
async def upload_scheme_activation(payload: SchemeActivationPayload, request: Request):
    """MPCA uploads the signed master PDF → all schemes become claimable for
    the given fiscal cycle. Overwrites any prior activation doc (allows
    re-uploading a corrected copy)."""
    scope = get_scope(request)
    _require_mpca(scope)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "fiscal_cycle": payload.fiscal_cycle,
        "is_active": True,
        "signed_pdf_url": payload.signed_pdf_url,
        "signed_by": payload.signed_by or scope.name,
        "signed_by_body_code": scope.body_code or "MPCA",
        "signed_at": now,
        "notes": payload.notes,
        "updated_at": now,
    }
    await db.scheme_activation_seasons.update_one(
        {"fiscal_cycle": payload.fiscal_cycle},
        {"$set": doc},
        upsert=True,
    )
    return doc


@api_router.post("/schemes/season-activation/reset")
async def reset_scheme_activation(fiscal_cycle: str, request: Request):
    """MPCA can rescind activation (e.g. errors on signed doc). Sets
    is_active=false; new claims / tournaments are blocked until MPCA
    re-uploads."""
    scope = get_scope(request)
    _require_mpca(scope)
    now = datetime.now(timezone.utc).isoformat()
    await db.scheme_activation_seasons.update_one(
        {"fiscal_cycle": fiscal_cycle},
        {"$set": {"is_active": False, "reset_at": now, "reset_by": scope.name}},
    )
    return {"fiscal_cycle": fiscal_cycle, "is_active": False}


async def is_season_activated(fiscal_cycle: str) -> bool:
    """Helper used by tournaments / grant_claims to gate creation."""
    doc = await db.scheme_activation_seasons.find_one(
        {"fiscal_cycle": fiscal_cycle, "is_active": True}, {"_id": 0, "is_active": 1}
    )
    return bool(doc and doc.get("is_active"))
