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



# ─────────────── M30 · Per-squad workflow (multi-body squads) ───────────────
#
# The legacy `/tournaments/{tid}/selection/*` endpoints assume a single squad
# per tournament (host-body flow). For inter-district / inter-division
# tournaments each participating body maintains its own squad — these are the
# per-squad variants that identify the squad by its id instead of guessing.
#

class SquadSubmitPayload(BaseModel):
    note: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class SquadReviewPayload(BaseModel):
    action: str  # "approve" | "reject" | "finalize"
    note: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


@api_router.post("/squads/{sid}/submit")
async def submit_squad_to_mpca(
    sid: str,
    payload: SquadSubmitPayload,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """Division/District submits their squad to MPCA for review."""
    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    body_code = doc.get("body_id")
    # RBAC — the caller must belong to this squad's body OR be MPCA
    is_mpca = x_role_id in _MPCA_APPROVER_ROLES
    if not is_mpca and x_body_code != body_code:
        raise HTTPException(403, f"Only {body_code} secretary or MPCA may submit this squad.")

    if doc.get("submission_status") in ("Awaiting_MPCA_Approval", "Approved"):
        raise HTTPException(400, f"Squad is already {doc.get('submission_status').replace('_', ' ').lower()}.")

    members = doc.get("members") or []
    if len(members) < 11:
        raise HTTPException(400, f"Squad has {len(members)} players — need at least 11 to submit.")
    if not any(m.get("is_captain") for m in members):
        raise HTTPException(400, "A Captain must be marked before submission.")

    now = datetime.now(timezone.utc).isoformat()
    await db.squads.update_one({"id": sid}, {"$set": {
        "submission_status": "Awaiting_MPCA_Approval",
        "submitted_at": now,
        "submitted_by": x_user_name or x_role_id,
        "submitted_by_body": x_body_code,
        "review_note": payload.note,
    }})
    return await db.squads.find_one({"id": sid}, {"_id": 0})


@api_router.post("/squads/{sid}/review")
async def review_squad_by_mpca(
    sid: str,
    payload: SquadReviewPayload,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """MPCA approves / rejects / finalizes a squad.

    ─ approve  · Awaiting_MPCA_Approval → Approved (Division may re-open)
    ─ reject   · Awaiting_MPCA_Approval → Rejected (Division may re-submit)
    ─ finalize · any                    → Approved  (MPCA locks the final XV)
    """
    if x_role_id not in _MPCA_APPROVER_ROLES:
        raise HTTPException(403, "Only MPCA Hon. Secretary or President may review a squad.")
    if payload.action not in ("approve", "reject", "finalize"):
        raise HTTPException(400, "action must be one of: approve · reject · finalize")

    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")

    if payload.action == "approve" and doc.get("submission_status") != "Awaiting_MPCA_Approval":
        raise HTTPException(400, f"Squad is not awaiting approval (status={doc.get('submission_status')}).")
    if payload.action == "reject" and doc.get("submission_status") != "Awaiting_MPCA_Approval":
        raise HTTPException(400, f"Squad is not awaiting approval (status={doc.get('submission_status')}).")

    # ── Enforce a valid XV before finalize
    if payload.action == "finalize":
        members = doc.get("members") or []
        if len(members) < 11:
            raise HTTPException(400, f"Cannot finalize — only {len(members)} players in the squad.")
        if not any(m.get("is_captain") for m in members):
            raise HTTPException(400, "Cannot finalize — a Captain must be marked.")

    now = datetime.now(timezone.utc).isoformat()
    new_status = "Approved" if payload.action in ("approve", "finalize") else "Rejected"
    await db.squads.update_one({"id": sid}, {"$set": {
        "submission_status": new_status,
        "reviewed_at": now,
        "reviewed_by": x_user_name or x_role_id,
        "review_note": payload.note,
        "finalized_by_mpca": payload.action == "finalize",
    }})
    return await db.squads.find_one({"id": sid}, {"_id": 0})


@api_router.post("/squads/{sid}/reopen")
async def reopen_squad(
    sid: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    """MPCA unlocks a squad so the Division can amend the roster."""
    if x_role_id not in _MPCA_APPROVER_ROLES:
        raise HTTPException(403, "Only MPCA may reopen a squad.")
    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    await db.squads.update_one({"id": sid}, {"$set": {
        "submission_status": "Draft",
        "finalized_by_mpca": False,
        "reviewed_at": None,
        "reviewed_by": None,
    }})
    return await db.squads.find_one({"id": sid}, {"_id": 0})




# ─────────────── M34 · Match Officials on the Squad ───────────────

class SquadOfficialsPatch(BaseModel):
    """Bag of officials that the Division nominates alongside the XV.
    Every field is a free-text name of a person — future upgrade wires these
    to the /officials or /users collection so DA forms auto-populate."""
    manager: Optional[str] = None
    coach: Optional[str] = None
    trainer: Optional[str] = None
    physio: Optional[str] = None
    umpire_1: Optional[str] = None
    umpire_2: Optional[str] = None
    scorer: Optional[str] = None
    referee: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


@api_router.patch("/squads/{sid}/officials")
async def patch_squad_officials(
    sid: str,
    payload: SquadOfficialsPatch,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
):
    """Division/District secretary sets the manager, coach, umpires, scorer,
    physio and match referee for the tournament. Locked once submitted."""
    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    body_code = doc.get("body_id")
    is_mpca = x_role_id in _MPCA_APPROVER_ROLES
    if not is_mpca and x_body_code != body_code:
        raise HTTPException(403, f"Only {body_code} or MPCA may edit these officials.")
    if not is_mpca and doc.get("submission_status") in ("Awaiting_MPCA_Approval", "Approved"):
        raise HTTPException(
            400,
            f"Squad is {doc['submission_status']} — ask MPCA to reopen it before editing officials."
        )
    updates = {f"match_officials.{k}": v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(400, "Empty payload")
    await db.squads.update_one({"id": sid}, {"$set": {**updates, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return await db.squads.find_one({"id": sid}, {"_id": 0})

# ─────────────── M30 · Tournament pending-actions endpoint ───────────────
@api_router.get("/tournaments/{tid}/pending-actions")
async def tournament_pending_actions(tid: str):
    """Returns a list of items on this tournament that are waiting on some
    party (MPCA / Division / District). Used by the tournament header and the
    MPCA dashboard's 'Pending With Me' panel to give clear next-action cues."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    items: List[dict] = []

    # 1) Tournament approval
    if t.get("status") == "Awaiting_Approval":
        items.append({
            "kind": "tournament_approval",
            "label": "Approve tournament proposal",
            "waiting_on": "MPCA",
            "deep_link": f"/tournaments/{tid}",
            "record_id": tid,
        })
    if t.get("status") == "Draft":
        acc = (t.get("acceptance") or {}).get("status")
        if acc in (None, "Not_Required"):
            items.append({
                "kind": "tournament_submit",
                "label": "Submit tournament for approval",
                "waiting_on": "MPCA",
                "deep_link": f"/tournaments/{tid}",
                "record_id": tid,
            })

    # 2) Squads
    async for sq in db.squads.find({"tournament_id": tid}, {"_id": 0}):
        status = sq.get("submission_status") or "Draft"
        body = sq.get("body_id")
        if status == "Awaiting_MPCA_Approval":
            items.append({
                "kind": "squad_review",
                "label": f"Review squad · {body}",
                "waiting_on": "MPCA",
                "deep_link": f"/squads/{sq['id']}",
                "record_id": sq["id"],
                "body_code": body,
            })
        elif status in ("Draft", "Rejected") and len(sq.get("members") or []) < 11:
            items.append({
                "kind": "squad_pick",
                "label": f"Complete squad · {body} ({len(sq.get('members') or [])} / 15)",
                "waiting_on": body,
                "deep_link": f"/squads/{sq['id']}",
                "record_id": sq["id"],
                "body_code": body,
            })

    # 3) Budgets awaiting approval
    async for b in db.tournament_budgets.find({"tournament_id": tid, "status": "Submitted"}, {"_id": 0}):
        items.append({
            "kind": "budget_approval",
            "label": f"Approve budget · {b.get('budget_no', b['id'][:6])}",
            "waiting_on": "MPCA",
            "deep_link": f"/tournament-budgets/{b['id']}",
            "record_id": b["id"],
            "body_code": b.get("participant_body_code"),
        })

    # 4) Reimbursement claims awaiting review
    async for c in db.reimbursement_claims.find({"tournament_id": tid, "status": "Submitted"}, {"_id": 0}):
        items.append({
            "kind": "claim_review",
            "label": f"Review reimbursement claim · {c.get('claim_no', c['id'][:6])}",
            "waiting_on": "MPCA",
            "deep_link": f"/reimbursement-claims/{c['id']}",
            "record_id": c["id"],
            "body_code": c.get("participant_body_code"),
        })

    # 5) Input variables not set yet (only in Draft, points to MPCA)
    if not t.get("input_variables") and t.get("status") == "Draft":
        items.append({
            "kind": "input_vars",
            "label": "Set tournament input variables",
            "waiting_on": "MPCA",
            "deep_link": f"/tournaments/{tid}",
            "record_id": tid,
        })

    # 6) Closure letter pending (after Completed, no letter yet)
    if t.get("status") == "Completed" and not t.get("closure_letter_generated_at"):
        items.append({
            "kind": "closure_letter",
            "label": "Issue closure letter",
            "waiting_on": "MPCA",
            "deep_link": f"/tournaments/{tid}",
            "record_id": tid,
        })

    return {"tournament_id": tid, "items": items, "count": len(items)}


# ─────────────── M30 · MPCA-wide pending inbox ───────────────
@api_router.get("/pending-actions/mpca")
async def mpca_pending_inbox(limit: int = 50):
    """Aggregates all tournament pending items across the ERP that need MPCA
    action. Used by the state dashboard's 'Pending With Me' panel."""
    inbox: List[dict] = []
    async for t in db.tournaments.find({"status": {"$nin": ["Completed", "Cancelled"]}}, {"_id": 0}):
        # Reuse the per-tournament resolver
        try:
            data = await tournament_pending_actions(t["id"])
        except HTTPException:
            continue
        for item in data.get("items", []):
            if item.get("waiting_on") == "MPCA":
                inbox.append({
                    **item,
                    "tournament_id": t["id"],
                    "tournament_name": t.get("name"),
                    "tournament_no": t.get("tournament_no"),
                })
                if len(inbox) >= limit:
                    break
        if len(inbox) >= limit:
            break
    return {"items": inbox, "count": len(inbox)}
