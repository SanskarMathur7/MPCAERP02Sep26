"""Routes · Player Module (M1)."""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException
from fastapi.responses import Response

from core.infra import db, api_router
from models import (
    Player, PlayerCreate, DisqualificationFlag, PlayerStatus, PlayerCategory,
    PlayerDocument, PlayerAuditEvent, PlayerReviewAction, PLAYER_DOC_TYPES,
)
from core.helpers import (
    _next_player_id, _new_player_display_id, _next_player_display_serial,
    _derive_division_folder, _age_years, _validate_eligibility, _create_notification,
)
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
    body_id: Optional[str] = None,
    category: Optional[PlayerCategory] = None,
    status: Optional[PlayerStatus] = None,
    search: Optional[str] = None,
    division_folder: Optional[str] = None,
    season_year: Optional[str] = None,
    court_order_only: Optional[bool] = None,
):
    query: dict = {}
    if body_id:
        query["body_id"] = body_id
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
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"player_id": {"$regex": search, "$options": "i"}},
            {"player_display_id": {"$regex": search, "$options": "i"}},
            {"contact_email": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.players.find(query, {"_id": 0}).sort("registered_on", -1).to_list(2000)
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
    if doc_type not in PLAYER_DOC_TYPES:
        raise HTTPException(400, f"Unknown doc_type '{doc_type}'. Allowed: {PLAYER_DOC_TYPES}")
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
async def players_stats():
    total = await db.players.count_documents({})
    active = await db.players.count_documents({"status": "Active"})
    pending = await db.players.count_documents({"status": {"$in": ["Pending", "Under_Division_Review", "Discrepancy_Raised", "Division_Approved"]}})
    suspended = await db.players.count_documents({"status": {"$in": ["Suspended", "Banned"]}})
    by_cat = {}
    for cat in ("Local_MP", "Born_Outside", "Guest"):
        by_cat[cat] = await db.players.count_documents({"category": cat})
    court_orders = await db.players.count_documents({"court_order_flag": True})
    return {
        "total_players": total,
        "active_players": active,
        "pending_players": pending,
        "suspended_players": suspended,
        "by_category": by_cat,
        "court_order_count": court_orders,
    }
