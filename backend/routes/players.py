"""Routes · Player Module (M1)."""
import re
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, Request
from fastapi.responses import Response

from core.infra import db, api_router
from core.scoping import get_scope, body_scope
from models import (
    Player, PlayerCreate, DisqualificationFlag, PlayerStatus, PlayerCategory,
    PlayerDocument, PlayerAuditEvent, PlayerReviewAction, PLAYER_DOC_TYPES,
)
from core.helpers import (
    _next_player_id, _new_player_display_id, _next_player_display_serial,
    _derive_division_folder, _age_years, _validate_eligibility, _create_notification,
)
from pydantic import BaseModel, ConfigDict, Field
from core.ai_validator import _run_player_doc_validation


# ---------------- Routes: Player Module (Phase IV — M1) ----------------


async def _append_audit(player_id: str, event: PlayerAuditEvent) -> None:
    """Append an event to the player's audit trail."""
    await db.players.update_one(
        {"id": player_id},
        {"$push": {"audit_trail": event.model_dump()}},
    )


@api_router.get("/players", response_model=List[Player])
async def list_players(
    request: Request,
    body_id: Optional[str] = None,
    category: Optional[PlayerCategory] = None,
    status: Optional[PlayerStatus] = None,
    search: Optional[str] = None,
    division_folder: Optional[str] = None,
    season_year: Optional[str] = None,
    court_order_only: Optional[bool] = None,
    skip: int = 0,
    limit: int = 2000,
):
    scope = get_scope(request)
    query: dict = {}
    # Explicit body_id filter wins (used by admin/service calls)
    if body_id:
        query["body_id"] = body_id
    else:
        # Sprint M13: auto-scope by persona body
        query.update(body_scope(scope))
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    if division_folder:
        query["division_folder"] = division_folder
    if season_year:
        query["season_year"] = season_year
    if court_order_only:
        query["court_order_flag"] = True
    if search:
        search_or = [
            {"full_name": {"$regex": re.escape(search), "$options": "i"}},
            {"player_id": {"$regex": re.escape(search), "$options": "i"}},
            {"player_display_id": {"$regex": re.escape(search), "$options": "i"}},
            {"contact_email": {"$regex": re.escape(search), "$options": "i"}},
        ]
        # If scope already put an $or (Division scope), $and them together
        if "$or" in query:
            existing_or = query.pop("$or")
            query["$and"] = [{"$or": existing_or}, {"$or": search_or}]
        else:
            query["$or"] = search_or
    docs = await db.players.find(query, {"_id": 0}).sort("registered_on", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    return docs


@api_router.get("/players/lookup")
async def lookup_player(display_id: Optional[str] = None, player_id: Optional[str] = None):
    """Safe lookup by player_display_id (which contains '/') or player_id (MPCA/…).
    Use this instead of GET /players/{id} when the identifier has slashes.
    """
    if not display_id and not player_id:
        raise HTTPException(400, "Provide either display_id or player_id")
    query = {}
    if display_id:
        query["player_display_id"] = display_id
    elif player_id:
        query["player_id"] = player_id
    doc = await db.players.find_one(query, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    return doc


@api_router.get("/players/{pid}", response_model=Player)
async def get_player(pid: str):
    """Fetch by either id (uuid), player_id (MPCA/...), or new display id."""
    doc = await db.players.find_one(
        {"$or": [{"id": pid}, {"player_id": pid}, {"player_display_id": pid}]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Player not found")
    return doc


@api_router.post("/players/check-eligibility")
async def check_eligibility(payload: PlayerCreate):
    """Dry-run eligibility validator. Returns ok + notes without inserting."""
    ok, notes = _validate_eligibility(payload)
    return {
        "ok": ok,
        "age_years": _age_years(payload.date_of_birth),
        "notes": notes,
    }


@api_router.post("/players", response_model=Player)
async def create_player(payload: PlayerCreate):
    """Register a new player. Runs eligibility validator first (hard-fails on category errors)."""
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    ok, notes = _validate_eligibility(payload)
    if not ok:
        raise HTTPException(400, " · ".join(notes))
    pid = await _next_player_id()
    year = datetime.now(timezone.utc).year
    serial = await _next_player_display_serial(year)
    display_id = _new_player_display_id(payload.date_of_birth, year, serial)
    division_folder = _derive_division_folder(payload.body_id)
    season_year = "2025-26"
    player = Player(
        player_id=pid,
        player_display_id=display_id,
        first_registration_year=year,
        season_year=season_year,
        division_folder=division_folder,
        eligibility_notes=notes,
        status="Pending",
        submission_locked=True,
        **payload.model_dump(),
    )
    # Seed audit
    player.audit_trail.append(PlayerAuditEvent(
        event="created", notes=f"Registered under {payload.body_id}",
    ))
    # Persist optional documents supplied at portal registration
    if payload.documents:
        player.documents = list(payload.documents)
    await db.players.insert_one(player.model_dump())
    # Notify Division reviewer
    if division_folder:
        await _create_notification(
            recipient_role_id="division-secretary",
            recipient_body_id=division_folder,
            title="New player registration — needs review",
            message=f"{player.player_display_id} · {player.full_name} · {payload.body_id}",
            link="/players",
            related_type="player",
            related_id=player.id,
            severity="info",
            kind="info",
        )
    return player


# --------- M1-B · Division/MPCA review workflow ---------


@api_router.post("/players/{pid}/start-review", response_model=Player)
async def start_review(pid: str, action: PlayerReviewAction):
    """Division picks up a Pending file → Under_Division_Review."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] not in ("Pending",):
        raise HTTPException(400, f"Cannot start review from status {doc['status']}")
    await db.players.update_one({"id": pid}, {"$set": {"status": "Under_Division_Review"}})
    await _append_audit(pid, PlayerAuditEvent(
        event="review_started", actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, actor_post=action.actor_post,
        notes=action.notes,
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/raise-discrepancy", response_model=Player)
async def raise_discrepancy(pid: str, action: PlayerReviewAction):
    """Division marks a discrepancy → asks for re-submission."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] not in ("Pending", "Under_Division_Review"):
        raise HTTPException(400, f"Cannot raise discrepancy from status {doc['status']}")
    if not action.notes:
        raise HTTPException(400, "Discrepancy notes are required.")
    notes = doc.get("review_notes", []) or []
    notes.append(f"[{action.actor_name} · {datetime.now(timezone.utc).strftime('%Y-%m-%d')}] {action.notes}")
    await db.players.update_one(
        {"id": pid},
        {"$set": {
            "status": "Discrepancy_Raised",
            "review_notes": notes,
            "submission_locked": False,   # allow re-submission
        }},
    )
    await _append_audit(pid, PlayerAuditEvent(
        event="discrepancy", actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, actor_post=action.actor_post,
        notes=action.notes,
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/resubmit", response_model=Player)
async def resubmit_player(pid: str, action: PlayerReviewAction):
    """Registrant re-submits after discrepancy → back to Pending, locked again."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] != "Discrepancy_Raised":
        raise HTTPException(400, f"Only discrepant registrations can be resubmitted (current: {doc['status']}).")
    await db.players.update_one(
        {"id": pid},
        {"$set": {"status": "Pending", "submission_locked": True}},
    )
    await _append_audit(pid, PlayerAuditEvent(
        event="resubmitted", actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, actor_post=action.actor_post,
        notes=action.notes,
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/division-approve", response_model=Player)
async def division_approve(pid: str, action: PlayerReviewAction):
    """Division clears → Division_Approved (awaits MPCA final)."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] not in ("Pending", "Under_Division_Review"):
        raise HTTPException(400, f"Cannot division-approve from status {doc['status']}")
    await db.players.update_one({"id": pid}, {"$set": {"status": "Division_Approved"}})
    await _append_audit(pid, PlayerAuditEvent(
        event="division_approved", actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, actor_post=action.actor_post,
        notes=action.notes,
    ))
    # Notify MPCA registrar
    await _create_notification(
        recipient_role_id="secretary", recipient_body_id="MPCA",
        title="Player approved by Division — needs MPCA sign-off",
        message=f"{doc.get('player_display_id') or doc.get('player_id')} · {doc.get('full_name')}",
        link="/players", related_type="player", related_id=pid, severity="info", kind="info",
    )
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/approve", response_model=Player)
async def approve_player(pid: str, action: Optional[PlayerReviewAction] = None):
    """MPCA/Division-shortcut approves → Active. Accepts either Pending or Division_Approved."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] not in ("Pending", "Under_Division_Review", "Division_Approved"):
        raise HTTPException(400, f"Cannot approve a player in status {doc['status']}")
    await db.players.update_one({"id": pid}, {"$set": {"status": "Active"}})
    await _append_audit(pid, PlayerAuditEvent(
        event="approved", actor_name=(action.actor_name if action else None),
        actor_body_id=(action.actor_body_id if action else None),
        actor_post=(action.actor_post if action else None),
        notes=(action.notes if action else "Approved by MPCA."),
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/reopen", response_model=Player)
async def reopen_player(pid: str, action: PlayerReviewAction):
    """MPCA/Division unlocks a player record so the applicant can edit."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    await db.players.update_one({"id": pid}, {"$set": {"submission_locked": False}})
    await _append_audit(pid, PlayerAuditEvent(
        event="reopened", actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, actor_post=action.actor_post,
        notes=action.notes,
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.patch("/players/{pid}", response_model=Player)
async def update_player(pid: str, patch: dict):
    """Applicant/Division edits — refused when submission_locked=True."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc.get("submission_locked"):
        raise HTTPException(400, "Player record is locked. Ask Division/MPCA to reopen it first.")
    # Whitelist safe fields
    allowed = {
        "mother_name", "sibling_names", "gender", "proficiency", "club_academy",
        "father_name", "place_of_birth", "address_district", "address_line",
        "residency_since", "employment", "education",
        "role", "batting_style", "bowling_style", "height_cm", "weight_kg",
        "photo_url", "aadhaar_last4", "contact_phone", "contact_email",
        "guardian_name", "guardian_phone", "guest_subtype", "guest_disclosure_signed",
        "court_order_flag", "court_order_ref", "documents",
        # MPCA-Feb2026 · Registration-form fields hoisted onto the Player.
        "place_of_birth_city", "place_of_birth_state", "last_season_division_code",
        "bcci_registered", "bcci_registration_year", "is_employed",
        "extra_info",
    }
    diff = {}
    to_set = {}
    for k, v in patch.items():
        if k in allowed and doc.get(k) != v:
            diff[k] = [doc.get(k), v]
            to_set[k] = v
    if not to_set:
        return doc
    await db.players.update_one({"id": pid}, {"$set": to_set})
    await _append_audit(pid, PlayerAuditEvent(
        event="updated", diff=diff, notes=f"{len(diff)} field(s) updated.",
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/documents", response_model=Player)
async def add_document(pid: str, doc_type: str, url: str, filename: Optional[str] = None):
    """Attach an uploaded document to the player."""
    # Feb-2026 · Free-form "other:*" docs bypass the fixed whitelist so
    # MPCA/Division can attach any extra document with a custom label.
    if not doc_type.startswith("other:") and doc_type not in PLAYER_DOC_TYPES:
        raise HTTPException(400, f"Unknown doc_type '{doc_type}'. Allowed: {PLAYER_DOC_TYPES} or prefix with 'other:'")
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc.get("submission_locked") and doc["status"] not in ("Discrepancy_Raised",):
        raise HTTPException(400, "Record is locked — reopen or raise a discrepancy first.")
    entry = PlayerDocument(doc_type=doc_type, url=url, filename=filename)
    docs = list(doc.get("documents", []) or [])
    # Replace same doc_type if present
    docs = [d for d in docs if d.get("doc_type") != doc_type] + [entry.model_dump()]
    await db.players.update_one({"id": pid}, {"$set": {"documents": docs}})
    await _append_audit(pid, PlayerAuditEvent(event="doc_uploaded", notes=f"{doc_type} · {filename or url}"))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/documents/{doc_type}/verify", response_model=Player)
async def verify_document(pid: str, doc_type: str, action: PlayerReviewAction):
    """Division marks a specific document as verified."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    docs = list(doc.get("documents", []) or [])
    hit = False
    for d in docs:
        if d.get("doc_type") == doc_type:
            d["verified"] = True
            d["verified_by"] = action.actor_name
            d["verified_at"] = datetime.now(timezone.utc).isoformat()
            hit = True
    if not hit:
        raise HTTPException(404, f"No document '{doc_type}' found on player.")
    await db.players.update_one({"id": pid}, {"$set": {"documents": docs}})
    await _append_audit(pid, PlayerAuditEvent(
        event="doc_verified", actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, notes=doc_type,
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


# --------- Disqualification engine (M1-C) ---------


@api_router.post("/players/{pid}/disqualify", response_model=Player)
async def disqualify_player(pid: str, flag: DisqualificationFlag):
    """Append a disqualification flag. Auto-detects repeat-offender → lifetime ban.
    Broadcasts notifications to MPCA + BCCI + all state associations.
    """
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    flags = doc.get("disqualifications", []) or []
    prior_count = int(doc.get("disqualification_count") or len(flags))
    effective = flag.model_dump()
    # Repeat-offender promotion: 2nd time-bound ban ⇒ lifetime
    if flag.kind == "Two_Year_Ban" and prior_count >= 1:
        effective["kind"] = "Lifetime_Ban"
        effective["notes"] = (effective.get("notes") or "") + " · Auto-promoted to lifetime ban (repeat offender)."
    # Division penalty default ₹50,000 per plan
    if effective["kind"] == "Division_Penalty" and not effective.get("penalty_inr"):
        effective["penalty_inr"] = 50000.0
    flags.append(effective)
    new_count = prior_count + 1
    new_status = "Banned" if effective["kind"] == "Lifetime_Ban" else "Suspended"
    await db.players.update_one(
        {"id": pid},
        {"$set": {"disqualifications": flags, "status": new_status, "disqualification_count": new_count}},
    )
    await _append_audit(pid, PlayerAuditEvent(
        event="disqualified",
        actor_body_id=flag.imposed_by,
        notes=f"{effective['kind']} · {flag.reason}",
    ))
    # Broadcast: MPCA + BCCI + all state associations
    for rid, bid in [("secretary", "MPCA"), ("secretary", "BCCI")]:
        await _create_notification(
            recipient_role_id=rid, recipient_body_id=bid,
            title=f"Player disqualified — {effective['kind'].replace('_', ' ')}",
            message=f"{doc.get('player_display_id') or doc.get('player_id')} · {doc.get('full_name')} · {flag.reason}",
            link="/players", related_type="player", related_id=pid,
            severity="critical", kind="info",
        )
    # Notify all sibling state associations if this is Lifetime / Fake Document
    if effective["kind"] in ("Lifetime_Ban", "Fake_Document"):
        # Broadcast to a canonical "STATE_ASSOCIATIONS" fan-out record (in-app only)
        await _create_notification(
            recipient_role_id="state-secretary", recipient_body_id="ALL_STATE_ASSOCIATIONS",
            title=f"BCCI Circular — Player {effective['kind'].replace('_', ' ')}",
            message=f"MPCA notifies all state associations: {doc.get('full_name')} ({doc.get('player_display_id')}) has been permanently disqualified.",
            link="/players", related_type="player", related_id=pid,
            severity="critical", kind="info",
        )
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/reinstate", response_model=Player)
async def reinstate_player(pid: str):
    """Reinstate a Suspended player back to Active."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] not in ("Suspended",):
        raise HTTPException(400, f"Cannot reinstate from status {doc['status']}")
    await db.players.update_one({"id": pid}, {"$set": {"status": "Active"}})
    await _append_audit(pid, PlayerAuditEvent(event="reinstated", notes="Back to Active status."))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/ai-validate-documents", response_model=Player)
async def ai_validate_player_documents(pid: str):
    """Run Gemini 3 Flash OCR + fraud check on this player's uploaded KYC documents.
    Stores the verdict on the player record and appends an audit event.
    """
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    verdict = await _run_player_doc_validation(doc)
    now = datetime.now(timezone.utc).isoformat()
    await db.players.update_one(
        {"id": pid},
        {"$set": {
            "ai_document_validation": verdict,
            "ai_validated_at": now,
        }},
    )
    await _append_audit(pid, PlayerAuditEvent(
        event="ai_validated",
        actor_name="Gemini 3 Flash",
        notes=f"{verdict.get('decision')} · {verdict.get('reasoning', '')[:180]}",
    ))
    # If AI flags suspected fraud, notify MPCA
    if verdict.get("decision") == "SUSPECTED_FRAUD":
        await _create_notification(
            recipient_role_id="secretary",
            recipient_body_id="MPCA",
            title=f"AI flagged possible fraud on player {doc.get('player_display_id') or doc.get('player_id')}",
            message=(verdict.get("reasoning") or "")[:180],
            link=f"/players/{pid}",
            related_type="player",
            related_id=pid,
            severity="critical",
            kind="info",
        )
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.get("/players-stats/summary")
async def players_stats(request: Request):
    """Iter 108 (SEC-004): stats scoped to caller's body.  State personas see
    every player; Division/District see only their own scope's rows."""
    from lib.authz import get_principal, scope_filter
    principal = get_principal(request)
    sf = scope_filter(principal, field="body_id")
    total = await db.players.count_documents(sf)
    active = await db.players.count_documents({"status": "Active", **sf})
    pending = await db.players.count_documents({"status": {"$in": ["Pending", "Under_Division_Review", "Discrepancy_Raised", "Division_Approved"]}, **sf})
    suspended = await db.players.count_documents({"status": {"$in": ["Suspended", "Banned"]}, **sf})
    by_cat = {}
    for cat in ("Local_MP", "Born_Outside", "Guest"):
        by_cat[cat] = await db.players.count_documents({"category": cat, **sf})
    court_orders = await db.players.count_documents({"court_order_flag": True, **sf})
    return {
        "total_players": total,
        "active_players": active,
        "pending_players": pending,
        "suspended_players": suspended,
        "by_category": by_cat,
        "court_order_count": court_orders,
        "scope": principal.body_code or "MPCA",   # transparency for the UI
    }


# ── MPCA-209 · Eligibility Tag Compute (from MPCA_Eligibility_Checks doc) ────
def _months_between(iso_from: Optional[str], iso_to: Optional[str] = None) -> float:
    """Rough month delta (30-day months) — good enough for eligibility windows."""
    if not iso_from:
        return 0.0
    try:
        d_from = datetime.fromisoformat(iso_from[:10])
        d_to = datetime.fromisoformat((iso_to or "")[:10]) if iso_to else datetime.now(timezone.utc)
        return (d_to - d_from).days / 30.0
    except Exception:
        return 0.0


async def _resolve_division_of_district(district_body_id: Optional[str]) -> Optional[str]:
    """Given a district body-code, return its parent Division code (or None)."""
    if not district_body_id:
        return None
    body = await db.bodies.find_one({"code": district_body_id}, {"_id": 0, "parent_code": 1, "body_type": 1})
    if not body:
        return None
    if body.get("body_type") == "Division":
        return district_body_id
    return body.get("parent_code")


# ── Iter 125 · Eligibility Rules Config (SysAdmin editable, season-scoped) ──
_DEFAULT_ELIGIBILITY_RULES = {
    "residency_min_months":       3,   # Local/Residence + Employment
    "education_min_months_local": 3,   # Local/Education
    "education_min_months_guest": 12,  # Guest/Education (≥ 1 academic year)
    "guest_prior_years_min":      2,   # Guest/Out-of-MP prior domestic play
    "age_of_majority_for_parent": 21,  # Local/Employment via parent
    "medical_required_by_default": True,
    "season": "2026-27",
}


async def _load_eligibility_rules(season: Optional[str] = None) -> dict:
    """Fetch the season's rule config from Mongo; falls back to defaults."""
    query = {"season": season} if season else {}
    doc = await db.eligibility_rules_config.find_one(query, {"_id": 0}, sort=[("updated_at", -1)])
    if not doc:
        return dict(_DEFAULT_ELIGIBILITY_RULES)
    merged = dict(_DEFAULT_ELIGIBILITY_RULES)
    merged.update(doc)
    return merged


@api_router.post("/players/{pid}/eligibility-tag/compute", response_model=Player)
async def compute_eligibility_tag(pid: str):
    """Runs the sequential decision tree from MPCA_Eligibility_Checks.docx
    (season configurable via /eligibility-rules) and stores the resulting
    tag on the player along with a full per-tag verification trail.
    """
    p = await db.players.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Player not found")

    rules = await _load_eligibility_rules(p.get("season_year") or "2026-27")
    trace: List[dict] = []
    reasons: List[str] = []
    tag: Optional[str] = None

    def _add(tag_name: str, passed: bool, why: str, source_field: str = "", source_value: str = ""):
        trace.append({
            "tag": tag_name, "passed": passed, "why": why,
            "source_field": source_field, "source_value": str(source_value) if source_value is not None else "",
        })

    # Resolve the parent Division of the player's target body
    target_division = await _resolve_division_of_district(p.get("body_id"))
    birth_division = p.get("place_of_birth_division") or None
    birth_state = (p.get("place_of_birth_state") or "").strip()
    is_mp_born = birth_state.lower() in ("mp", "madhya pradesh")
    if not birth_division and p.get("place_of_birth_city"):
        d = await db.bodies.find_one(
            {"body_type": "District", "$or": [
                {"name": {"$regex": f"{p['place_of_birth_city']}", "$options": "i"}},
                {"seat": {"$regex": f"^{p['place_of_birth_city']}$", "$options": "i"}},
            ]}, {"_id": 0, "code": 1, "parent_code": 1},
        )
        if d:
            birth_division = d.get("parent_code")

    # ── LOCAL TESTS ─────────────────────────────────────────────────────────
    # 1. Local/Birth
    if target_division and birth_division and birth_division == target_division:
        tag = "Local/Birth"
        why = f"Born within {target_division} jurisdiction (birth division = {birth_division})."
        reasons.append(why)
        _add("Local/Birth", True, why, "place_of_birth_division", birth_division)
    else:
        if not birth_division:
            _add("Local/Birth", False, "place_of_birth_division not on file — cannot verify birth", "place_of_birth_division", "")
        elif birth_division != target_division:
            _add("Local/Birth", False, f"Birth division ({birth_division}) does not match target division ({target_division})", "place_of_birth_division", birth_division)

    # 2. Local/Residence — bonafide resident ≥ N months
    residency_min = float(rules.get("residency_min_months") or 3)
    if not tag:
        months_resident = _months_between(p.get("residency_since"))
        if not p.get("residency_since"):
            _add("Local/Residence", False, "residency_since not on file — no proof of residence", "residency_since", "")
        elif months_resident >= residency_min:
            tag = "Local/Residence"
            why = f"Resident in Division for {months_resident:.1f} months (≥ {residency_min:.0f} required)."
            reasons.append(why)
            _add("Local/Residence", True, why, "residency_since", p.get("residency_since"))
        else:
            why = f"Residency insufficient ({months_resident:.1f} months; ≥ {residency_min:.0f} required)."
            reasons.append(why)
            _add("Local/Residence", False, why, "residency_since", p.get("residency_since"))

    # 3. Local/Employment — bonafide employment (self or parent if ≤21) + residency
    if not tag:
        if not p.get("is_employed") or not p.get("employment"):
            _add("Local/Employment", False, "Employment (self or parent) not on file", "employment", p.get("employment") or "")
        else:
            months_resident = _months_between(p.get("residency_since"))
            if months_resident >= residency_min:
                tag = "Local/Employment"
                why = f"Employed at {p['employment']} ({months_resident:.1f} months resident)."
                reasons.append(why)
                _add("Local/Employment", True, why, "employment", p.get("employment"))
            else:
                _add("Local/Employment", False, f"Employment present but residency short ({months_resident:.1f}/{residency_min:.0f} months)", "employment", p.get("employment"))

    # 4. Local/Education — N months + not distance learning
    education_min_local = float(rules.get("education_min_months_local") or 3)
    if not tag:
        if not p.get("education"):
            _add("Local/Education", False, "Education record not on file", "education", "")
        else:
            months_resident = _months_between(p.get("residency_since"))
            is_distance = "distance" in (p.get("education") or "").lower()
            if months_resident >= education_min_local and not is_distance:
                tag = "Local/Education"
                why = f"Studying at {p['education']} ({months_resident:.1f} months in Division)."
                reasons.append(why)
                _add("Local/Education", True, why, "education", p.get("education"))
            elif is_distance:
                _add("Local/Education", False, "Course is distance-learning (excluded)", "education", p.get("education"))
            else:
                _add("Local/Education", False, f"Course present but residency < {education_min_local:.0f} months ({months_resident:.1f})", "education", p.get("education"))

    # ── GUEST TESTS ─────────────────────────────────────────────────────────
    # 5. Guest/MP-Domicile
    if not tag:
        if is_mp_born and target_division and birth_division and birth_division != target_division:
            tag = "Guest/MP-Domicile"
            why = f"Born in MP ({birth_division}) but registering with {target_division} — MP-Domicile Guest."
            reasons.append(why)
            _add("Guest/MP-Domicile", True, why, "place_of_birth_division", birth_division)
        else:
            if not is_mp_born:
                _add("Guest/MP-Domicile", False, f"Not MP-born (place_of_birth_state='{birth_state or '—'}')", "place_of_birth_state", birth_state)
            elif not birth_division:
                _add("Guest/MP-Domicile", False, "MP-born but birth division unknown", "place_of_birth_division", "")

    # 6. Guest/Education
    education_min_guest = float(rules.get("education_min_months_guest") or 12)
    if not tag and not is_mp_born:
        if not p.get("education"):
            _add("Guest/Education", False, "Non-MP-born and no education record", "education", "")
        else:
            months_studying = _months_between(p.get("residency_since"))
            is_distance = "distance" in (p.get("education") or "").lower()
            if months_studying >= education_min_guest and not is_distance:
                tag = "Guest/Education"
                why = f"Born + resident out of MP, studying in MP for {months_studying:.1f} months (≥ {education_min_guest:.0f})."
                reasons.append(why)
                _add("Guest/Education", True, why, "education", p.get("education"))
            elif is_distance:
                _add("Guest/Education", False, "Course is distance-learning (excluded)", "education", p.get("education"))
            else:
                _add("Guest/Education", False, f"Education present but only {months_studying:.1f} months (≥ {education_min_guest:.0f} needed)", "residency_since", p.get("residency_since"))

    # 7. Guest/Out-of-MP
    guest_prior_min = float(rules.get("guest_prior_years_min") or 2)
    if not tag and not is_mp_born:
        prior_years = 1 if p.get("bcci_registered") else 0
        if p.get("bcci_registration_year"):
            try:
                prior_years = max(prior_years, datetime.now(timezone.utc).year - int(p["bcci_registration_year"]))
            except Exception:
                pass
        if prior_years >= guest_prior_min:
            tag = "Guest/Out-of-MP"
            why = f"Not MP-born; prior domestic participation ≈ {prior_years} yrs (≥ {guest_prior_min:.0f} required)."
            reasons.append(why)
            _add("Guest/Out-of-MP", True, why, "bcci_registration_year", p.get("bcci_registration_year") or "")
        else:
            why = f"Not MP-born and prior domestic participation {prior_years} yrs (< {guest_prior_min:.0f} required) — fails 3.3."
            reasons.append(why)
            _add("Guest/Out-of-MP", False, why, "bcci_registration_year", p.get("bcci_registration_year") or "")

    if not tag:
        tag = "Ineligible"
        reasons.append("None of the tags matched — player does not qualify under the current data on file.")

    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "eligibility_tag": tag,
        "eligibility_reasons": reasons,
        "eligibility_check_trace": trace,
        "eligibility_computed_at": now,
    }
    if tag == "Ineligible":
        auto_note = f"[Eligibility] {now[:10]} · Auto-flagged as Ineligible — Division must correct place-of-birth / residency / employment / education records and recompute."
        existing_notes = set(p.get("review_notes") or [])
        if auto_note not in existing_notes:
            updates["$push_review_note"] = auto_note
    upd_query = {"$set": {k: v for k, v in updates.items() if k != "$push_review_note"}}
    if updates.get("$push_review_note"):
        upd_query["$push"] = {"review_notes": updates["$push_review_note"]}
    await db.players.update_one({"id": pid}, upd_query)
    return await db.players.find_one({"id": pid}, {"_id": 0})


class EligibilityTagOverride(BaseModel):
    model_config = ConfigDict(extra="ignore")
    eligibility_tag: str = Field(..., description="Local/Birth · Local/Residence · Local/Employment · Local/Education · Guest/MP-Domicile · Guest/Education · Guest/Out-of-MP · Ineligible")
    reason: str = Field(..., min_length=3)
    actor_name: Optional[str] = None
    actor_body_id: Optional[str] = None
    # Iter 125 · Signed override — the evidence document supporting the override.
    signed_doc_url: Optional[str] = None
    signed_doc_filename: Optional[str] = None


@api_router.post("/players/{pid}/eligibility-tag/override", response_model=Player)
async def override_eligibility_tag(pid: str, payload: EligibilityTagOverride):
    """MPCA-210 · Manual tag override — Divisions/MPCA may adjust the auto-tag
    (e.g. after producing offline proof of employment/residence).
    Iter 125 · Overrides are now signed: caller must attach a signed evidence
    document (or a strong written reason ≥ 20 chars) before we accept the
    override; the full override history is retained on the player.
    """
    p = await db.players.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Player not found")
    valid = {
        "Local/Birth", "Local/Residence", "Local/Employment", "Local/Education",
        "Guest/MP-Domicile", "Guest/Education", "Guest/Out-of-MP", "Ineligible",
    }
    if payload.eligibility_tag not in valid:
        raise HTTPException(422, f"Invalid tag. Allowed: {sorted(valid)}")
    # Signed-override guard — either an evidence doc OR a full-body reason.
    reason = payload.reason.strip()
    if not payload.signed_doc_url and len(reason) < 20:
        raise HTTPException(
            422,
            "Override rejected — either upload a signed evidence document OR provide a reason of at least 20 characters describing the supporting proof.",
        )
    now = datetime.now(timezone.utc).isoformat()
    stamped = f"[Manual · {now[:10]} · {payload.actor_name or payload.actor_body_id or 'user'}] {payload.eligibility_tag} — {reason}"
    reasons = list(p.get("eligibility_reasons") or [])
    reasons.append(stamped)
    override_entry = {
        "tag": payload.eligibility_tag,
        "reason": reason,
        "actor_name": payload.actor_name,
        "actor_body_id": payload.actor_body_id,
        "signed_doc_url": payload.signed_doc_url,
        "signed_doc_filename": payload.signed_doc_filename,
        "at": now,
    }
    history = list(p.get("eligibility_override_history") or [])
    history.append(override_entry)
    await db.players.update_one({"id": pid}, {"$set": {
        "eligibility_tag": payload.eligibility_tag,
        "eligibility_reasons": reasons,
        "eligibility_computed_at": now,
        "eligibility_override": override_entry,
        "eligibility_override_history": history,
    }})
    await _append_audit(pid, PlayerAuditEvent(
        actor_name=payload.actor_name or "system",
        actor_role="Eligibility Override",
        actor_body_id=payload.actor_body_id,
        event=f"Eligibility tag manually set → {payload.eligibility_tag}",
        details=f"{reason}"
                + (f" · signed doc: {payload.signed_doc_filename}" if payload.signed_doc_filename else ""),
    ))
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/eligibility-tag/clear-override", response_model=Player)
async def clear_eligibility_override(pid: str):
    """Iter 125 · Clear the active override so the next `/compute` call takes
    effect. History is retained for audit."""
    p = await db.players.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Player not found")
    await db.players.update_one({"id": pid}, {"$set": {"eligibility_override": None}})
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/eligibility-tag/recompute-all")
async def bulk_recompute_eligibility(request: Request, body_id: Optional[str] = None):
    """MPCA-210 · Bulk recompute for the whole player register in scope.
    - MPCA: retags every active player across MPCA.
    - Division scope: retags only players registered with that Division/District.
    """
    q: dict = {}
    if body_id:
        q["body_id"] = body_id
    else:
        q.update(body_scope(get_scope(request)))
    docs = await db.players.find(q, {"_id": 0, "id": 1}).to_list(5000)
    stats = {"total": len(docs), "tagged": 0, "ineligible": 0, "errors": 0, "by_tag": {}}
    for d in docs:
        try:
            updated = await compute_eligibility_tag(d["id"])   # reuse the single-player logic
            stats["tagged"] += 1
            t = updated.get("eligibility_tag") or "Unknown"
            stats["by_tag"][t] = stats["by_tag"].get(t, 0) + 1
            if t == "Ineligible":
                stats["ineligible"] += 1
        except Exception:
            stats["errors"] += 1
    return stats
