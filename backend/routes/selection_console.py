"""Routes · M12 · Selection Console (post-acceptance squad workflow)."""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, Header, Request
from pydantic import BaseModel, ConfigDict

from core.infra import db, api_router
from core.scoping import get_scope
from core.helpers import _create_notification
from models import Squad, SquadMember, MatchOfficials, SquadWaiver, MemberDecision

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


@api_router.get("/squads/{sid}", response_model=Squad)
async def get_squad_by_id(sid: str):
    """M38 · Direct-fetch by squad id (needed by SquadNominationForm printable route)."""
    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    return doc



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
    # MPCA-240 · For Manual_PDF wiring types, the signed PDF IS the roster —
    # so the 11-player / captain gates only apply to Register-linked squads.
    try:
        from routes.tournament_wiring_status import _resolve_type_id
        from routes.tournament_wiring import _fetch_or_seed_wiring
        t = await db.tournaments.find_one({"id": tid}, {"_id": 0}) or {}
        type_id = await _resolve_type_id(t)
        w = await _fetch_or_seed_wiring()
        squad_mode = w["cells"].get(type_id, {}).get("squad", {}).get("mode")
    except Exception:
        squad_mode = "Register_Linked"

    if squad_mode == "Manual_PDF":
        if not doc.get("signed_copy_url"):
            raise HTTPException(400, "Signed squad PDF is required — please upload before submitting.")
    else:
        if len(members) < 11:
            raise HTTPException(400, f"Squad has {len(members)} players — need at least 11 to submit.")
        if not any(m.get("is_captain") for m in members):
            raise HTTPException(400, "A Captain must be marked before submission.")

    now = datetime.now(timezone.utc).isoformat()

    # MPCA-239 · Wiring-driven auto-approve.
    # If the tournament type's wiring says squad_approval.flag == "NA"
    # (BCCI, Inter-District, School, Club, Coaching Camp, Vacation Camp,
    # Pre-Tournament Camp), the squad self-approves on submit — no MPCA
    # step exists per the wiring. Only Inter-Divisional (flag = "M") keeps
    # the Awaiting_MPCA_Approval → MPCA review flow.
    try:
        from routes.tournament_wiring_status import _resolve_type_id
        from routes.tournament_wiring import _fetch_or_seed_wiring
        type_id = await _resolve_type_id(t)
        wiring  = await _fetch_or_seed_wiring()
        squad_approval_flag = wiring["cells"].get(type_id, {}).get("squad_approval", {}).get("flag")
    except Exception:
        squad_approval_flag = "M"   # safe fallback — retain MPCA approval

    if squad_approval_flag == "NA":
        new_status = "Approved"
        updates = {
            "submission_status":  new_status,
            "submitted_at":       now,
            "submitted_by":       x_user_name or x_role_id,
            "submitted_by_body":  x_body_code,
            "review_note":        payload.note,
            "reviewed_at":        now,
            "reviewed_by":        "auto-wiring",
            "review_decision":    "auto_approved_no_mpca_step",
        }
    else:
        updates = {
            "submission_status":  "Awaiting_MPCA_Approval",
            "submitted_at":       now,
            "submitted_by":       x_user_name or x_role_id,
            "submitted_by_body":  x_body_code,
            "review_note":        payload.note,
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
    signed_copy_url: Optional[str] = None       # M37 · Mandatory for Division/District submissions
    model_config = ConfigDict(extra="ignore")


class SquadSignedCopyPayload(BaseModel):
    signed_copy_url: str
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
    # MPCA-240 · Manual_PDF wiring types: PDF is the roster, no 11-player check.
    try:
        from routes.tournament_wiring_status import _resolve_type_id
        from routes.tournament_wiring import _fetch_or_seed_wiring
        t2 = await db.tournaments.find_one({"id": doc.get("tournament_id")}, {"_id": 0}) or {}
        type_id_m = await _resolve_type_id(t2)
        w2 = await _fetch_or_seed_wiring()
        squad_mode_m = w2["cells"].get(type_id_m, {}).get("squad", {}).get("mode")
    except Exception:
        squad_mode_m = "Register_Linked"

    if squad_mode_m != "Manual_PDF":
        if len(members) < 11:
            raise HTTPException(400, f"Squad has {len(members)} players — need at least 11 to submit.")
        if not any(m.get("is_captain") for m in members):
            raise HTTPException(400, "A Captain must be marked before submission.")

    # ── M37 · Signed nomination copy is MANDATORY for Division / District submissions ──
    # MPCA host-body drafts (self-approving) are exempt.
    signed_url = payload.signed_copy_url or doc.get("signed_copy_url")
    if not is_mpca and not signed_url:
        raise HTTPException(
            400,
            "Signed nomination copy is required · Please download the nomination form, get it signed by the Division office bearers, and upload the signed PDF before submitting to MPCA.",
        )

    now = datetime.now(timezone.utc).isoformat()

    # MPCA-239 · Wiring-driven auto-approve (same logic as tournament-level submit).
    try:
        from routes.tournament_wiring_status import _resolve_type_id
        from routes.tournament_wiring import _fetch_or_seed_wiring
        t = await db.tournaments.find_one({"id": doc.get("tournament_id")}, {"_id": 0}) or {}
        type_id = await _resolve_type_id(t) if t else "interdiv"
        wiring  = await _fetch_or_seed_wiring()
        squad_approval_flag = wiring["cells"].get(type_id, {}).get("squad_approval", {}).get("flag")
    except Exception:
        squad_approval_flag = "M"

    if squad_approval_flag == "NA":
        updates = {
            "submission_status":  "Approved",
            "submitted_at":       now,
            "submitted_by":       x_user_name or x_role_id,
            "submitted_by_body":  x_body_code,
            "review_note":        payload.note,
            "reviewed_at":        now,
            "reviewed_by":        "auto-wiring",
            "review_decision":    "auto_approved_no_mpca_step",
        }
    else:
        updates = {
            "submission_status":  "Awaiting_MPCA_Approval",
            "submitted_at":       now,
            "submitted_by":       x_user_name or x_role_id,
            "submitted_by_body":  x_body_code,
            "review_note":        payload.note,
        }
    if payload.signed_copy_url:
        updates["signed_copy_url"] = payload.signed_copy_url
        updates["signed_copy_uploaded_at"] = now
        updates["signed_copy_uploaded_by"] = x_user_name or x_role_id
    await db.squads.update_one({"id": sid}, {"$set": updates})
    return await db.squads.find_one({"id": sid}, {"_id": 0})


@api_router.post("/squads/{sid}/signed-copy")
async def upload_signed_copy(
    sid: str,
    payload: SquadSignedCopyPayload,
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    """M37 · Division/District uploads the signed nomination copy for a squad.
    The URL is stamped on the squad so submission-to-MPCA can proceed.
    M39g · Kicks off an ADVISORY Gemini review of the signed PDF whose
    verdict + comments surface on the MPCA approval screen."""
    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    if not payload.signed_copy_url:
        raise HTTPException(400, "signed_copy_url is required")
    now = datetime.now(timezone.utc).isoformat()
    await db.squads.update_one({"id": sid}, {"$set": {
        "signed_copy_url": payload.signed_copy_url,
        "signed_copy_uploaded_at": now,
        "signed_copy_uploaded_by": x_user_name or x_role_id,
        "ai_review_status": "Pending",
        "ai_review_verdict": None,
        "ai_review_comments": [],
    }})
    # Fire the AI review synchronously — endpoint takes a few seconds but the
    # UI shows a spinner during upload, so this is acceptable. If it fails we
    # still return the updated squad; MPCA can trigger POST /ai-review to retry.
    try:
        squad_now = await db.squads.find_one({"id": sid}, {"_id": 0})
        tournament = await db.tournaments.find_one({"id": squad_now.get("tournament_id")}, {"_id": 0})
        from core.ai_signed_docs import review_signed_squad
        verdict = await review_signed_squad(squad_now, tournament or {})
        await db.squads.update_one({"id": sid}, {"$set": {
            "ai_review_status": "Completed" if not verdict.get("warnings") else "Completed",
            "ai_review_verdict": verdict.get("verdict"),
            "ai_review_comments": verdict.get("comments") or [],
            "ai_review_confidence": verdict.get("confidence"),
            "ai_review_generated_at": datetime.now(timezone.utc).isoformat(),
        }})
    except Exception as e:  # pragma: no cover — best-effort
        await db.squads.update_one({"id": sid}, {"$set": {
            "ai_review_status": "Failed",
            "ai_review_verdict": None,
            "ai_review_comments": [f"AI review failed: {type(e).__name__}: {str(e)[:200]}"],
        }})
    return await db.squads.find_one({"id": sid}, {"_id": 0})


@api_router.post("/squads/{sid}/ai-review")
async def rerun_squad_ai_review(sid: str):
    """M39g · Re-run the AI advisory verdict on the signed squad PDF.
    Useful when the AI errored on upload or MPCA wants a fresh pass."""
    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    if not doc.get("signed_copy_url"):
        raise HTTPException(400, "Upload the signed PDF first before re-running AI review.")
    tournament = await db.tournaments.find_one({"id": doc.get("tournament_id")}, {"_id": 0})
    from core.ai_signed_docs import review_signed_squad
    verdict = await review_signed_squad(doc, tournament or {})
    now = datetime.now(timezone.utc).isoformat()
    await db.squads.update_one({"id": sid}, {"$set": {
        "ai_review_status": "Completed",
        "ai_review_verdict": verdict.get("verdict"),
        "ai_review_comments": verdict.get("comments") or [],
        "ai_review_confidence": verdict.get("confidence"),
        "ai_review_generated_at": now,
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

    # MPCA-140 · Whole-list approval requires a per-player decision on every
    # nominated member. Rejected members are dropped from the roster at
    # Approve-time; the decision log is archived on the squad for audit + PDF.
    dropped_members: List[dict] = []
    if payload.action == "approve":
        members = doc.get("members") or []
        decisions_by_id = {d.get("player_id"): d for d in (doc.get("member_decisions") or [])}
        missing = [m for m in members if m.get("player_id") not in decisions_by_id]
        if missing:
            raise HTTPException(
                400,
                f"{len(missing)} player(s) still need a per-player decision before the "
                f"whole squad can be approved. Please Approve or Reject every nominated "
                f"player first.",
            )
        # Filter down to only Approved members; Rejected members go into an
        # archive on the squad so the MPCA-Review PDF can still enumerate them.
        approved_members = [m for m in members if decisions_by_id[m["player_id"]].get("decision") == "Approved"]
        dropped_members = [m for m in members if decisions_by_id[m["player_id"]].get("decision") == "Rejected"]
        if not approved_members:
            raise HTTPException(400, "At least one player must be Approved to finalise the squad.")

    # ── Enforce a valid XV before finalize
    if payload.action == "finalize":
        members = doc.get("members") or []
        if len(members) < 11:
            raise HTTPException(400, f"Cannot finalize — only {len(members)} players in the squad.")
        if not any(m.get("is_captain") for m in members):
            raise HTTPException(400, "Cannot finalize — a Captain must be marked.")

    now = datetime.now(timezone.utc).isoformat()
    new_status = "Approved" if payload.action in ("approve", "finalize") else "Rejected"
    review_update = {
        "submission_status": new_status,
        "reviewed_at": now,
        "reviewed_by": x_user_name or x_role_id,
        "review_note": payload.note,
        "finalized_by_mpca": payload.action == "finalize",
    }
    if payload.action == "approve" and dropped_members:
        # Persist the pruned roster + archive of rejected members for the PDF.
        review_update["members"] = approved_members
        review_update["dropped_members"] = dropped_members
    await db.squads.update_one({"id": sid}, {"$set": review_update})

    # MPCA-141 · Notify the squad's owning body (Division/District Secretary)
    # so they see the outcome in their action centre + bell.
    try:
        tournament = await db.tournaments.find_one({"id": doc.get("tournament_id")}, {"_id": 0})
        t_name = (tournament or {}).get("name") or doc.get("tournament_id")
        body_code = doc.get("body_id")
        squad_link = f"/squads/{sid}"
        if new_status == "Approved":
            title = f"Squad approved by MPCA · {t_name}"
            message = (
                f"MPCA has approved your {doc.get('team_name')} squad for {t_name}."
                + (f" Note: {payload.note}" if payload.note else "")
            )
            severity = "success"
        else:
            title = f"Squad rejected by MPCA · {t_name}"
            message = (
                f"MPCA has rejected your {doc.get('team_name')} squad for {t_name}."
                + (f" Reason: {payload.note}" if payload.note else "")
                + " Please revise and resubmit."
            )
            severity = "warning"
        # Send to the office bearers of the owning body so at least one sees it.
        # Include Division/District specific role ids in addition to generic ones.
        for role_id in ("secretary", "president", "division-secretary", "district-secretary"):
            await _create_notification(
                recipient_role_id=role_id,
                recipient_body_id=body_code,
                title=title,
                message=message,
                link=squad_link,
                related_type="squad",
                related_id=sid,
                severity=severity,
                kind="squad_review",
            )
    except Exception as e:
        # Log but never let notification failures block the review action.
        import logging
        logging.getLogger("mpca-erp").warning(
            "MPCA-141 · Failed to send squad-review notification for %s: %s",
            sid, e,
        )

    return await db.squads.find_one({"id": sid}, {"_id": 0})


# ─────────────── MPCA-140 · Per-Player Decision ───────────────

class MemberDecisionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    decision: str            # "Approved" | "Rejected"
    reason: Optional[str] = None


@api_router.post("/squads/{sid}/members/{pid}/decision", response_model=Squad)
async def set_member_decision(
    sid: str,
    pid: str,
    payload: MemberDecisionPayload,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """MPCA records an Approved / Rejected verdict on a single nominated player.
    Every player must have a decision before the whole squad can be Approved
    (see review_squad_by_mpca)."""
    if x_role_id not in _MPCA_APPROVER_ROLES:
        raise HTTPException(403, "Only MPCA Hon. Secretary or President may set player decisions.")
    if payload.decision not in ("Approved", "Rejected"):
        raise HTTPException(400, "decision must be 'Approved' or 'Rejected'")

    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    if doc.get("submission_status") != "Awaiting_MPCA_Approval":
        raise HTTPException(
            409,
            f"Per-player decisions can only be recorded on a squad Awaiting MPCA Approval "
            f"(current: {doc.get('submission_status')}).",
        )
    members = doc.get("members") or []
    if not any(m.get("player_id") == pid for m in members):
        raise HTTPException(404, "That player is not on this squad's roster.")

    decisions = list(doc.get("member_decisions") or [])
    decisions = [d for d in decisions if d.get("player_id") != pid]
    decisions.append(MemberDecision(
        player_id=pid,
        decision=payload.decision,
        reason=(payload.reason or "").strip() or None,
        decided_by=x_user_name or x_role_id,
    ).model_dump())
    await db.squads.update_one({"id": sid}, {"$set": {"member_decisions": decisions}})
    return await db.squads.find_one({"id": sid}, {"_id": 0})


@api_router.delete("/squads/{sid}/members/{pid}/decision", response_model=Squad)
async def clear_member_decision(
    sid: str,
    pid: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id not in _MPCA_APPROVER_ROLES:
        raise HTTPException(403, "Only MPCA may clear a player decision.")
    doc = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Squad not found")
    decisions = [d for d in (doc.get("member_decisions") or []) if d.get("player_id") != pid]
    await db.squads.update_one({"id": sid}, {"$set": {"member_decisions": decisions}})
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

    # M39x · Tournament acceptance — every participant with Pending status
    async for p in db.tournament_participations.find(
        {"tournament_id": tid, "acceptance_status": "Pending", "removed_at": None},
        {"_id": 0},
    ):
        items.append({
            "kind": "tournament_acceptance",
            "label": f"Accept tournament allocation · {p.get('pool_name') or 'Main'} · as {p.get('role','Visitor')}",
            "waiting_on": p.get("body_code"),
            "deep_link": f"/tournaments/{tid}",
            "record_id": p.get("id"),
            "body_code": p.get("body_code"),
        })

    # 3) Budgets awaiting approval (legacy flow — Division-submitted first)
    async for b in db.tournament_budgets.find({"tournament_id": tid, "status": "Submitted"}, {"_id": 0}):
        items.append({
            "kind": "budget_approval",
            "label": f"Approve budget · {b.get('budget_no', b['id'][:6])}",
            "waiting_on": "MPCA",
            "deep_link": f"/tournament-budgets/{b['id']}",
            "record_id": b["id"],
            "body_code": b.get("participant_body_code"),
        })

    # 3b) M39r · MPCA-owned budget flow — new console
    async for b in db.tournament_budgets.find(
        {"tournament_id": tid, "status": "Draft"}, {"_id": 0}
    ):
        # A Draft budget with `prepared_by_name` set is MPCA-side awaiting send
        if b.get("prepared_by_name") or b.get("input_variables_snapshot"):
            items.append({
                "kind": "budget_send",
                "label": f"Send budget to {b.get('body_id')} · ₹{b.get('total_ceiling_inr', 0):,.0f}",
                "waiting_on": "MPCA",
                "deep_link": f"/tournaments/{tid}/finance",
                "record_id": b["id"],
                "body_code": b.get("body_id"),
            })
    async for b in db.tournament_budgets.find(
        {"tournament_id": tid, "status": "Sent_To_Division"}, {"_id": 0}
    ):
        items.append({
            "kind": "budget_acceptance",
            "label": f"Accept budget from MPCA · ₹{b.get('total_ceiling_inr', 0):,.0f}",
            "waiting_on": b.get("body_id"),
            "deep_link": f"/tournament-budgets/{b['id']}",
            "record_id": b["id"],
            "body_code": b.get("body_id"),
        })
    async for b in db.tournament_budgets.find(
        {"tournament_id": tid, "status": "Accepted_By_Division"}, {"_id": 0}
    ):
        items.append({
            "kind": "budget_sanction",
            "label": f"Sanction budget · {b.get('body_id')} · ₹{b.get('total_ceiling_inr', 0):,.0f}",
            "waiting_on": "MPCA",
            "deep_link": f"/tournament-budgets/{b['id']}",
            "record_id": b["id"],
            "body_code": b.get("body_id"),
        })
    async for b in db.tournament_budgets.find(
        {"tournament_id": tid, "status": "Revision_Requested"}, {"_id": 0}
    ):
        items.append({
            "kind": "budget_revise",
            "label": f"Revise budget · {b.get('body_id')} requested changes",
            "waiting_on": "MPCA",
            "deep_link": f"/tournaments/{tid}/finance",
            "record_id": b["id"],
            "body_code": b.get("body_id"),
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

    # 4b) M39l · Extra-expense requests awaiting MPCA approval
    async for e in db.extra_expense_requests.find(
        {"tournament_id": tid, "status": {"$in": ["Submitted", "Info_Requested"]}}, {"_id": 0},
    ):
        items.append({
            "kind": "extra_expense",
            "label": f"Approve extra expense · {e.get('request_ref') or e['id'][:6]} · ₹{e.get('amount_inr', 0):,.0f}",
            "waiting_on": "MPCA",
            "deep_link": f"/tournaments/{tid}/finance",
            "record_id": e["id"],
            "body_code": e.get("body_id"),
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


# ─────────────── M39 · Persona-agnostic Action Center feed ───────────────
@api_router.get("/pending-actions/me")
async def my_pending_inbox(
    request: Request,
    kind: Optional[str] = None,          # optional filter by action kind (squad_review, budget_approval, etc.)
    limit: int = 200,
):
    """Returns the list of pending items the current caller's persona should
    action on — the Action Center. Body-scoped:

      · MPCA state office bearers   → everything `waiting_on == "MPCA"`
      · Division / District bodies  → items where `waiting_on == body_code`
                                     OR `waiting_on == "Division"` and body
                                     matches the tournament participation
      · Match Officials             → their own DA-form draft/rejected forms
    """
    scope = get_scope(request)
    inbox: List[dict] = []

    # ── Match Officials: their own DA draft/rejected forms ──
    if scope.is_official and scope.name:
        async for d in db.match_official_da.find(
            {"official_name": scope.name, "status": {"$in": ["Draft", "Rejected"]}},
            {"_id": 0},
        ).limit(limit):
            inbox.append({
                "kind": "da_fill",
                "waiting_on": scope.name,
                "record_id": d["id"],
                "label": ("Fill DA form" if d["status"] == "Draft" else "DA rejected · please revise"),
                "cta": "Open DA",
                "link": f"/tournaments/{d.get('tournament_id')}",
                "tournament_id": d.get("tournament_id"),
                "tournament_name": d.get("tournament_name"),
            })
        return {"items": inbox[:limit], "count": len(inbox), "scope": "official"}

    # MPCA-148 · Pending Registration-Campaign approval requests. Divisions
    # raise a campaign with request_status='Pending' — MPCA must approve
    # before the public link becomes usable. Surface here for MPCA only.
    is_mpca_early = scope.body_code == "MPCA" or scope.is_state
    if is_mpca_early:
        async for c in db.player_registration_campaigns.find(
            {"request_status": "Pending"}, {"_id": 0},
        ).sort("created_at", 1).limit(50):
            if (not kind) or (kind == "registration_campaign_approval"):
                inbox.append({
                    "kind": "registration_campaign_approval",
                    "waiting_on": "MPCA",
                    "record_id": c["id"],
                    "label": f"Approve campaign · {c.get('title') or c['id']}",
                    "cta": "Review",
                    "link": "/player-registrations",
                    "body_code": c.get("body_code"),
                    "body_name": c.get("body_name"),
                    "cycle_code": c.get("cycle_code"),
                    "requested_by": c.get("requested_by"),
                    "request_note": c.get("request_note"),
                    "created_at": c.get("created_at"),
                })
                if len(inbox) >= limit:
                    return {"items": inbox[:limit], "count": len(inbox), "scope": "mpca"}

    # ── State / Division / District: iterate tournaments in scope ──
    from routes.tournaments import _tournament_scope_query
    t_query = _tournament_scope_query(scope) or {}
    t_query["status"] = {"$nin": ["Completed", "Cancelled"]}
    is_mpca = scope.body_code == "MPCA" or scope.is_state
    my_body = scope.body_code

    # M39r · Also collect tournament ids where this body is a participant
    # (Host or Visitor) — finance actions (accept budget etc.) live on those.
    participant_tids: set = set()
    if not is_mpca and my_body:
        async for p in db.tournament_participations.find(
            {"body_code": my_body, "removed_at": None},
            {"_id": 0, "tournament_id": 1},
        ):
            participant_tids.add(p["tournament_id"])

    seen_tids: set = set()

    async def _process(t: dict):
        if t["id"] in seen_tids:
            return
        seen_tids.add(t["id"])
        try:
            data = await tournament_pending_actions(t["id"])
        except HTTPException:
            return
        for item in data.get("items", []):
            waiting = item.get("waiting_on")
            matches = False
            if is_mpca and waiting == "MPCA":
                matches = True
            elif not is_mpca and my_body and (waiting == my_body or waiting == "Division"):
                matches = True
            if matches and (not kind or item.get("kind") == kind):
                inbox.append({
                    **item,
                    "tournament_id": t["id"],
                    "tournament_name": t.get("name"),
                    "tournament_no": t.get("tournament_no"),
                })
                if len(inbox) >= limit:
                    return

    async for t in db.tournaments.find(t_query, {"_id": 0}).sort("created_at", -1):
        await _process(t)
        if len(inbox) >= limit:
            break

    # M39r · Merge in tournaments this body participates in but doesn't host
    if participant_tids and len(inbox) < limit:
        async for t in db.tournaments.find(
            {"id": {"$in": list(participant_tids)}, "status": {"$nin": ["Completed", "Cancelled"]}},
            {"_id": 0},
        ).sort("created_at", -1):
            await _process(t)
            if len(inbox) >= limit:
                break

    return {"items": inbox[:limit], "count": len(inbox), "scope": ("mpca" if is_mpca else my_body or "user")}

