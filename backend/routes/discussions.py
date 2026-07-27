"""M39 · Discussions
──────────────────────────────────────────────────────────────────────────────
Two flavours of chat inside the ERP:

  1. **Tournament discussions**: a single thread auto-scoped to each tournament,
     where MPCA state office bearers and every participating Division/District
     can post updates & questions about that tournament.

  2. **General inbox**: 1-to-1 conversations between MPCA and a Division/District.
     Enforced RBAC:
       - MPCA can start a conversation with any Division / District.
       - A Division / District can only converse with MPCA (no inter-division).
       - Every conversation has a stable `pair_key = sorted([bodyA, bodyB]).join("::")`
         so the same MPCA↔DIV pair reuses one thread.

Every message may carry `@mentions` — a list of `{persona_id, name, body_code}`
handles that the frontend picker resolves before posting.
"""
from datetime import datetime, timezone
from typing import Optional, List, Literal
import uuid

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router
from core.scoping import get_scope


# ── Models ────────────────────────────────────────────────────────────────
Kind = Literal["tournament", "inbox"]


class Mention(BaseModel):
    model_config = ConfigDict(extra="ignore")
    persona_id: Optional[str] = None
    name: str
    body_code: Optional[str] = None


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body: str
    mentions: List[Mention] = Field(default_factory=list)


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    thread_id: str
    body: str
    mentions: List[Mention] = Field(default_factory=list)
    author_name: Optional[str] = None
    author_persona: Optional[str] = None
    author_body_code: Optional[str] = None
    posted_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Thread(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kind: Kind
    tournament_id: Optional[str] = None      # for kind=tournament
    tournament_name: Optional[str] = None
    body_a: Optional[str] = None             # for kind=inbox — sorted pair
    body_b: Optional[str] = None
    pair_key: Optional[str] = None
    title: str
    last_message_at: Optional[str] = None
    message_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Helpers ───────────────────────────────────────────────────────────────
def _pair_key(a: str, b: str) -> str:
    return "::".join(sorted([a, b]))


async def _get_or_create_tournament_thread(tid: str) -> dict:
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1})
    if not t:
        raise HTTPException(404, "Tournament not found")
    doc = await db.discussion_threads.find_one({"kind": "tournament", "tournament_id": tid}, {"_id": 0})
    if doc:
        return doc
    row = Thread(kind="tournament", tournament_id=tid, tournament_name=t.get("name"), title=f"Discussion · {t.get('name')}").model_dump()
    await db.discussion_threads.insert_one(row)
    return row


# ── Endpoints ─────────────────────────────────────────────────────────────
@api_router.get("/discussions/tournament/{tid}", response_model=Thread)
async def get_or_create_tournament_thread(tid: str):
    """Auto-creates one Discussion thread per tournament — first call opens it."""
    return await _get_or_create_tournament_thread(tid)


@api_router.get("/discussions/{thread_id}/messages", response_model=List[Message])
async def list_messages(thread_id: str, limit: int = 200):
    thread = await db.discussion_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    msgs = await db.discussion_messages.find(
        {"thread_id": thread_id}, {"_id": 0},
    ).sort("posted_at", 1).to_list(min(max(limit, 1), 1000))
    return msgs


@api_router.post("/discussions/{thread_id}/messages", response_model=Message)
async def post_message(thread_id: str, payload: MessageIn, request: Request):
    thread = await db.discussion_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    scope = get_scope(request)
    # RBAC · inbox threads — caller's body must be one of the two participants.
    if thread["kind"] == "inbox":
        if not scope.body_code:
            raise HTTPException(403, "Body scope required to post in inbox threads.")
        if scope.body_code not in (thread.get("body_a"), thread.get("body_b")):
            raise HTTPException(403, "You are not a participant in this conversation.")
    if not (payload.body or "").strip():
        raise HTTPException(400, "Message body cannot be empty.")

    msg = Message(
        thread_id=thread_id,
        body=payload.body.strip()[:4000],
        mentions=payload.mentions or [],
        author_name=scope.name,
        author_persona=(request.headers.get("X-Persona-Id") or None),
        author_body_code=scope.body_code,
    )
    await db.discussion_messages.insert_one(msg.model_dump())
    now = datetime.now(timezone.utc).isoformat()
    await db.discussion_threads.update_one(
        {"id": thread_id},
        {"$set": {"last_message_at": now}, "$inc": {"message_count": 1}},
    )

    # M39 · Fire a notification for each @mention so tagged users see it in their inbox
    for m in payload.mentions or []:
        try:
            from core.shared_services import add_notification
            await add_notification(
                recipient_role_id=m.persona_id or "secretary",
                recipient_body_id=m.body_code or "MPCA",
                title=f"You were mentioned by {scope.name or 'someone'}",
                message=payload.body[:120],
                link=(f"/tournaments/{thread.get('tournament_id')}" if thread["kind"] == "tournament" else "/discussions"),
                related_type="discussion_message", related_id=msg.id,
                severity="info", kind="info",
            )
        except Exception:  # noqa
            pass
    return msg


@api_router.get("/discussions/inbox/threads", response_model=List[Thread])
async def list_inbox_threads(request: Request):
    """Returns every inbox thread the caller's body participates in — MPCA
    sees all, a Division/District sees only ones involving them."""
    scope = get_scope(request)
    q: dict = {"kind": "inbox"}
    is_mpca = scope.body_code == "MPCA" or scope.is_state
    if not is_mpca:
        if not scope.body_code:
            return []
        q["$or"] = [{"body_a": scope.body_code}, {"body_b": scope.body_code}]
    rows = await db.discussion_threads.find(q, {"_id": 0}).sort("last_message_at", -1).to_list(200)
    return rows


class OpenInboxPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    other_body_code: str
    initial_message: Optional[str] = None


@api_router.post("/discussions/inbox/open", response_model=Thread)
async def open_or_get_inbox(payload: OpenInboxPayload, request: Request):
    """Open (or reuse) an MPCA ↔ Division inbox thread.

    RBAC:
      - MPCA callers may open with any Division / District.
      - Division / District callers may only open with MPCA (no
        inter-division).
    """
    scope = get_scope(request)
    if not scope.body_code:
        raise HTTPException(403, "Body scope required.")
    my = scope.body_code
    other = payload.other_body_code
    if my == other:
        raise HTTPException(400, "Cannot start a conversation with yourself.")

    is_mpca = my == "MPCA" or scope.is_state
    if not is_mpca and other != "MPCA":
        raise HTTPException(
            403,
            "Divisions and Districts can only communicate with MPCA. No inter-division / inter-district conversations are allowed.",
        )
    # Verify the other body exists
    other_doc = await db.bodies.find_one({"code": other}, {"_id": 0, "code": 1, "name": 1})
    if not other_doc and other != "MPCA":
        raise HTTPException(404, "Recipient body not found.")

    pair = _pair_key(my, other)
    existing = await db.discussion_threads.find_one({"kind": "inbox", "pair_key": pair}, {"_id": 0})
    if existing:
        return existing

    my_doc = await db.bodies.find_one({"code": my}, {"_id": 0, "code": 1, "name": 1})
    title = f"{(my_doc or {}).get('name', my)} ↔ {(other_doc or {}).get('name', other)}"
    thread = Thread(
        kind="inbox",
        body_a=sorted([my, other])[0],
        body_b=sorted([my, other])[1],
        pair_key=pair,
        title=title,
    ).model_dump()
    await db.discussion_threads.insert_one(thread)
    if payload.initial_message:
        await post_message(thread["id"], MessageIn(body=payload.initial_message), request)
        thread = await db.discussion_threads.find_one({"id": thread["id"]}, {"_id": 0})
    return thread


@api_router.get("/discussions/mentions/candidates")
async def list_mention_candidates():
    """Simple picker source — office bearers by post. Frontend can filter by
    body once selected. Kept lightweight (no auth graph traversal needed)."""
    posts = await db.postings.find({"active": True}, {"_id": 0}).limit(500).to_list(500)
    return [
        {
            "persona_id": p.get("post_id") or p.get("post_code") or p.get("post_name", "").lower().replace(" ", "-"),
            "name": p.get("person_name") or "—",
            "post_name": p.get("post_name"),
            "body_code": p.get("body_id"),
        }
        for p in posts if p.get("person_name")
    ]
