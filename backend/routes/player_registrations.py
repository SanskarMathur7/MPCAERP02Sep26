"""Routes · Player Registration Campaigns (M35)

Every Cricketing Season MPCA / Division opens a *campaign* to onboard new
players. The campaign yields one generic public URL (`public_token`) and any
number of per-player invite tokens. Players fill a public form (no login) —
Draft rows land in the campaign owner's review inbox — MPCA/Division
approves → a real Player is inserted into `players` collection.

RBAC
────
* Campaign create/list/patch: MPCA (State) or a Division. Districts see
  inherited campaigns (parent Division's) read-only.
* Registration approve/reject: only the campaign owner or MPCA.
* Public form endpoints: no auth. Token validity + rate limits protect
  them (rate limits deferred — env-controlled in a follow-up).
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
import secrets
import uuid

from fastapi import HTTPException, Header, Depends, Request
from lib.authz import principal_body_code, principal_role_id, principal_body_type, principal_persona_id
from fastapi import Depends
from pydantic import BaseModel, Field, ConfigDict, model_validator

from core.infra import db, api_router
from core.email_notifications import send_email


async def _ensure_indexes():
    """Called once at import — creates the unique index on invite tokens so
    two invites cannot collide even under concurrent inserts. Also builds a
    dedupe helper index on (campaign_id, normalised email)."""
    try:
        await db.player_registration_invites.create_index("token", unique=True)
        await db.player_registration_campaigns.create_index("public_token", unique=True)
        # NOT unique (older rows may have empty emails); the dedupe check is
        # enforced at write-time inside `public_submit`.
        await db.player_registrations.create_index([("campaign_id", 1), ("email_key", 1)])
    except Exception:  # noqa
        pass


import asyncio as _asyncio
try:
    _loop = _asyncio.get_event_loop()
    if _loop.is_running():
        _asyncio.ensure_future(_ensure_indexes())
    else:
        _loop.run_until_complete(_ensure_indexes())
except Exception:  # noqa
    pass


MPCA_ROLES = {
    # Capitalized legacy labels from principal_role_id()
    "Secretary", "President", "Treasurer", "SysAdmin",
    # New RBAC role_ids (real MPCA roster)
    "president", "vice_president", "hon_secretary", "joint_secretary", "hon_treasurer",
    "sys_admin", "internal_auditor",
    # Legacy aliases
    "secretary", "treasurer", "hr_officer", "compliance_officer",
}


# ─────────────────── Models ───────────────────

class PlayerRegistrationCampaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    body_code: str
    body_name: Optional[str] = None
    body_type: Optional[str] = None
    cycle_code: str                                     # e.g. "2025-26"
    title: str
    public_token: str = Field(default_factory=lambda: secrets.token_urlsafe(12))
    expires_on: Optional[str] = None                    # ISO date
    is_active: bool = True
    notes: Optional[str] = None
    invited_count: int = 0
    submitted_count: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    # MPCA-116 · Division-wise request/approval workflow. Divisions can no
    # longer publish a campaign directly — they raise a request; MPCA
    # approves it before the public link becomes usable. MPCA-created
    # campaigns default to Approved.
    request_status: Literal["Pending", "Approved", "Rejected"] = "Approved"
    requested_by: Optional[str] = None
    request_note: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PlayerRegistrationInvite(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    campaign_id: str
    token: str = Field(default_factory=lambda: secrets.token_urlsafe(12))
    prefill_name: Optional[str] = None
    prefill_email: Optional[str] = None
    prefill_phone: Optional[str] = None
    status: str = "Sent"                                # Sent | Submitted | Approved | Rejected
    submission_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PlayerRegistrationData(BaseModel):
    """Payload from the public form."""
    # ------------------------------------------------------------------
    # Feb 2026 · Guard against empty-string values for optional numeric
    # fields. The React form defaults `bcci_registration_year` to "" and
    # the user typically leaves it blank → Pydantic 2 rejected the
    # payload with HTTP 422 "int_parsing", which the UI reported as a
    # generic "submission crashed". Coerce "" to None BEFORE validation
    # for every optional numeric field the form ships.
    # ------------------------------------------------------------------
    @model_validator(mode="before")
    @classmethod
    def _empty_string_to_none(cls, data):
        if isinstance(data, dict):
            for k in ("bcci_registration_year",):
                if data.get(k) == "":
                    data[k] = None
        return data

    full_name: str = ""                                 # M39q · Auto-composed from first_name + surname (kept for backward-compat with squads / players)
    first_name: Optional[str] = None                    # M39q · Split name capture
    surname: Optional[str] = None                       # M39q · Split name capture
    father_name: Optional[str] = None                   # M39o · Batch A
    dob: str                                            # ISO date (form displays DD/MM/YYYY)
    gender: str                                         # M | F | Other
    role: str                                           # Batter | Bowler | All_Rounder | Wicket_Keeper
    batting_style: Optional[str] = None
    bowling_style: Optional[str] = None
    mobile: str
    email: Optional[str] = None
    home_district_code: Optional[str] = None
    preferred_division_code: Optional[str] = None       # M38h · Player picks their Home Division from dropdown
    category: str = "Local_MP"                          # Local_MP | Guest | Foreign
    guardian_name: Optional[str] = None
    address: Optional[str] = None
    aadhaar_no: Optional[str] = None
    pan_no: Optional[str] = None                        # M39o · Mandatory display for 18+ (validation lands in Batch B)
    gst_no: Optional[str] = None                        # M39o · Where applicable (coaches, contractors)
    bank_name: Optional[str] = None                     # M39o · Bank Name field
    consent: bool = False
    dpdp_consent: bool = False                          # M39o · DPDP Act 2023 explicit acknowledgement
    no_recent_studies: bool = False                     # M39o · U23 · unlocks affidavit path
    photo_url: Optional[str] = None
    aadhaar_url: Optional[str] = None
    aadhaar_history_url: Optional[str] = None           # M39o · Aadhaar update history from UIDAI portal
    pan_url: Optional[str] = None                       # M39o
    passport_url: Optional[str] = None                  # M39o
    driving_licence_url: Optional[str] = None           # M39o
    voter_id_url: Optional[str] = None                  # M39o
    address_proof_url: Optional[str] = None             # Current Address Proof
    birth_cert_url: Optional[str] = None
    marksheet_3yr_url: Optional[str] = None             # M39o · Single PDF · last 3 years bundled (optional if is_employed)
    affidavit_url: Optional[str] = None                 # M39o · Only when no_recent_studies=True
    cancelled_cheque_url: Optional[str] = None          # M39o · Bank verification proof
    gst_certificate_url: Optional[str] = None           # M39o · If GST number provided
    # MPCA-151 · Feb-2026 · Extended document set + conditional fields
    samagra_id_player_url: Optional[str] = None         # Samagra ID (player's own)
    samagra_id_family_url: Optional[str] = None         # Samagra ID (family)
    consent_form_url: Optional[str] = None              # Notarized MPCA-issued consent template
    no_study_affidavit_url: Optional[str] = None        # MPCA-issued No-Study affidavit template
    bonafide_school_cert_url: Optional[str] = None      # School Bonafide certificate
    # Employed-player alternate path (in lieu of marksheet_3yr_url)
    is_employed: bool = False
    appointment_letter_url: Optional[str] = None        # if is_employed=True
    salary_slip_url: Optional[str] = None               # if is_employed=True (last month)
    bank_statement_1yr_url: Optional[str] = None        # if is_employed=True (12-month PDF)
    # Cross-division registration audit
    last_season_division_code: Optional[str] = None     # Division played from LAST cricketing season
    noc_previous_division_url: Optional[str] = None     # Required if last_season_division_code != preferred_division_code
    # Place of birth
    place_of_birth_city: Optional[str] = None
    place_of_birth_state: Optional[str] = None
    # BCCI registration history
    bcci_registered: bool = False
    bcci_registration_year: Optional[int] = None        # e.g. 2019 — required if bcci_registered=True
    other_docs: List[Dict[str, str]] = Field(default_factory=list)  # M39o · [{label, url}]
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    model_config = ConfigDict(extra="ignore")


class PlayerRegistrationAuditEvent(BaseModel):
    """M39n · Append-only audit event for a single registration."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    event: str                                          # "submitted" / "division_approved" / "mpca_approved" / "returned" / "rejected" / "doc_uploaded" / "edited"
    actor_name: Optional[str] = None
    actor_body_id: Optional[str] = None
    actor_role: Optional[str] = None
    note: Optional[str] = None
    diff: Optional[Dict[str, Any]] = None               # {field: [old, new]}
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PlayerRegistration(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    campaign_id: str
    invite_id: Optional[str] = None
    body_code: str
    cycle_code: str
    # M39n · Two-stage flow — Submitted → Division_Approved → Approved. Terminal
    # states: Rejected. Interim resubmit path: Returned → player edits → Submitted.
    status: str = "Submitted"
    player_data: PlayerRegistrationData
    submitted_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    submitted_ip: Optional[str] = None
    # Retained for backwards compat (used by legacy /approve endpoint)
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    review_note: Optional[str] = None
    return_reason: Optional[str] = None
    ai_summary: Optional[Dict[str, Any]] = None
    ai_full_report: Optional[Dict[str, Any]] = None      # M39p · Batch B/C report card
    # M39n · Two-stage approval trail
    division_remark: Optional[str] = None
    division_reviewed_by: Optional[str] = None
    division_reviewed_at: Optional[str] = None
    mpca_remark: Optional[str] = None
    mpca_reviewed_by: Optional[str] = None
    mpca_reviewed_at: Optional[str] = None
    mpca_shortcut_used: bool = False                    # true if MPCA approved before Division
    audit_events: List[PlayerRegistrationAuditEvent] = Field(default_factory=list)
    linked_player_id: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ─────────────── Create / Patch payloads ───────────────

class CampaignCreate(BaseModel):
    body_code: str
    cycle_code: str
    title: str
    expires_on: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class CampaignPatch(BaseModel):
    title: Optional[str] = None
    expires_on: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class InviteBulk(BaseModel):
    invites: List[Dict[str, Any]]                       # [{prefill_name, prefill_email, prefill_phone}, …]


class ReviewAction(BaseModel):
    reviewer_name: Optional[str] = None
    note: Optional[str] = None


# ─────────────── Helpers ───────────────

def _may_own(body_code: str, caller_body: Optional[str], caller_role: Optional[str]) -> bool:
    """Who may CREATE/patch/approve campaigns for `body_code`."""
    if caller_body == body_code:
        return True
    if caller_body == "MPCA" and caller_role in MPCA_ROLES:
        return True
    return False


def _may_read(campaign: Dict[str, Any], caller_body: Optional[str], caller_role: Optional[str]) -> bool:
    if caller_body == campaign["body_code"]:
        return True
    if caller_body == "MPCA" and caller_role in MPCA_ROLES:
        return True
    # District can read its parent Division's campaigns
    if caller_body and caller_body.startswith("DIST-") and campaign["body_code"].startswith("DIV-"):
        # Best-effort: derive parent Division from district's body_id suffix
        # (short-code mapping). This is defensive; real hierarchy comes from
        # the bodies table.
        return True
    return False


async def _touch_counts(campaign_id: str, delta: Dict[str, int]):
    if not delta:
        return
    await db.player_registration_campaigns.update_one(
        {"id": campaign_id}, {"$inc": delta, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )


async def _log_event(rid: str, event: str, *, actor_name=None, actor_body_id=None, actor_role=None, note=None, diff=None) -> None:
    """M39n · Append an audit event to a registration."""
    entry = PlayerRegistrationAuditEvent(
        event=event, actor_name=actor_name, actor_body_id=actor_body_id,
        actor_role=actor_role, note=note, diff=diff,
    ).model_dump()
    await db.player_registrations.update_one(
        {"id": rid},
        {"$push": {"audit_events": entry}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )


def _is_home_division(reg_doc: Dict[str, Any], caller_body: Optional[str], caller_role: Optional[str]) -> bool:
    """M39n · The 'home division' is preferred_division_code on the payload, or
    the registration's body_code if that already refers to a Division / District."""
    pd = reg_doc.get("player_data") or {}
    pref = pd.get("preferred_division_code")
    body = reg_doc.get("body_code")
    candidates = {c for c in [pref, body] if c}
    if caller_body and caller_body in candidates:
        return True
    # A District under a Division can also approve if the pref matches its parent
    if caller_body and caller_body.startswith("DIST-") and pref and pref.startswith("DIV-"):
        # Cheap suffix match: DIST-*-INDO shares suffix with DIV-IND? No, use trailing token
        return caller_body.endswith(pref.split("-")[-1])
    return False


class RemarkAction(BaseModel):
    """M39n · Remark required on approve; optional on other actions."""
    remark: Optional[str] = None
    actor_name: Optional[str] = None


class EditAction(BaseModel):
    """M39n · Division can amend any field in `player_data`. Diff is logged."""
    patch: Dict[str, Any]
    actor_name: Optional[str] = None


class DocUploadAction(BaseModel):
    """M39n · Division adds a doc URL on player's behalf (photo, aadhaar, etc.)."""
    doc_key: str        # "photo_url" | "aadhaar_url" | "address_proof_url" | "birth_cert_url"
    doc_url: str
    actor_name: Optional[str] = None


@api_router.post("/player-registrations/{rid}/division-approve", response_model=PlayerRegistration)
async def division_approve(
    rid: str,
    action: RemarkAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """M39n · Home Division approves the registration with a mandatory remark.
    Status flips Submitted → Division_Approved. MPCA queue then picks it up."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc.get("status") not in ("Submitted", "Returned"):
        raise HTTPException(409, f"Cannot Division-approve from status '{doc.get('status')}'.")
    if not _is_home_division(doc, x_user_body_code, x_role_id):
        raise HTTPException(403, "Only the home Division of this player may approve at Stage 1.")
    if not (action.remark or "").strip():
        raise HTTPException(400, "A remark is required at the Division approval stage.")
    now = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Division_Approved",
        "division_remark": action.remark,
        "division_reviewed_by": action.actor_name,
        "division_reviewed_at": now,
        "updated_at": now,
    }})
    await _log_event(rid, "division_approved", actor_name=action.actor_name,
                     actor_body_id=x_user_body_code, actor_role=x_role_id, note=action.remark)
    # MPCA-153 · Notify player by email on Division approval
    pd = doc.get("player_data") or {}
    if pd.get("email"):
        try:
            await send_email(
                to=pd["email"],
                subject="MPCA · Your registration passed Division review",
                html_body=(
                    f"<p>Dear {pd.get('full_name') or 'Player'},</p>"
                    f"<p>Your MPCA player registration has been <strong>approved by your Home Division</strong>"
                    f" ({doc.get('body_code')}). It is now pending MPCA final approval.</p>"
                    f"<p><em>Division remark:</em> {action.remark}</p>"
                    f"<p>Regards,<br/>Team MPCA</p>"
                ),
            )
        except Exception:
            pass
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/mpca-approve", response_model=PlayerRegistration)
async def mpca_approve(
    rid: str,
    action: RemarkAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """M39n · MPCA final approval. Creates the Player row. Accepts either a
    Division-approved registration (normal path) or, with a shortcut warning,
    a plain Submitted registration (MPCA-override path)."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not (x_user_body_code == "MPCA" and (x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Only MPCA office bearers may finalise the approval.")
    if doc.get("status") == "Approved":
        raise HTTPException(400, "Already approved.")
    if doc.get("status") not in ("Submitted", "Returned", "Division_Approved"):
        raise HTTPException(409, f"Cannot MPCA-approve from status '{doc.get('status')}'.")
    if not (action.remark or "").strip():
        raise HTTPException(400, "A remark is required at the MPCA approval stage.")
    shortcut = doc.get("status") != "Division_Approved"

    from models import Player
    pd = doc["player_data"]
    body_code = doc["body_code"]
    count = await db.players.count_documents({"body_id": body_code, "season_year": doc["cycle_code"]})
    short = body_code.split("-")[-1] if "-" in body_code else body_code[:3]
    player_id = f"MP/{short}/{doc['cycle_code']}/{count + 1:04d}"
    gender_map = {"M": "Male", "F": "Female", "Male": "Male", "Female": "Female", "Other": "Other"}
    player = Player(
        player_id=player_id, body_id=body_code,
        full_name=pd["full_name"], date_of_birth=pd["dob"],
        gender=gender_map.get(pd.get("gender"), "Male"),
        role=pd.get("role", "Batter"),
        batting_style=pd.get("batting_style") or "Right_Hand",
        bowling_style=pd.get("bowling_style") or "None",
        category=pd.get("category", "Local_MP"),
        season_year=doc["cycle_code"],
        division_folder=body_code if body_code.startswith("DIV-") else None,
        contact_phone=pd.get("mobile"), contact_email=pd.get("email"),
        aadhaar_last4=(pd.get("aadhaar_no") or "")[-4:] or None,
        guardian_name=pd.get("guardian_name"), address_line=pd.get("address"),
        photo_url=pd.get("photo_url"), status="Active",
        # MPCA-151 · Feb 2026 · Copy every reg-form field onto the Player so
        # the profile Overview mirrors what the player originally submitted.
        place_of_birth_city=pd.get("place_of_birth_city"),
        place_of_birth_state=pd.get("place_of_birth_state"),
        last_season_division_code=pd.get("last_season_division_code"),
        bcci_registered=bool(pd.get("bcci_registered")),
        bcci_registration_year=pd.get("bcci_registration_year"),
        is_employed=bool(pd.get("is_employed")),
    )
    # MPCA-151 · Feb 2026 · Also seed the Player's `documents` list from every
    # doc URL the player uploaded on the registration form + every "other doc"
    # they attached. Frees Division/MPCA from re-uploading anything post-approval.
    from models import PlayerDocument as _PlayerDocument
    reg_to_kyc = [
        ("photo",                  pd.get("photo_url")),
        ("aadhar",                 pd.get("aadhaar_url")),
        ("aadhaar_history",        pd.get("aadhaar_history_url")),
        ("pan",                    pd.get("pan_url")),
        ("passport",               pd.get("passport_url")),
        ("driving_licence",        pd.get("driving_licence_url")),
        ("voter_id",               pd.get("voter_id_url")),
        ("birth_certificate",      pd.get("birth_cert_url")),
        ("address_proof",          pd.get("address_proof_url")),
        ("samagra_id_player",      pd.get("samagra_id_player_url")),
        ("samagra_id_family",      pd.get("samagra_id_family_url")),
        ("consent_form",           pd.get("consent_form_url")),
        ("no_study_affidavit",     pd.get("no_study_affidavit_url")),
        ("bonafide_school_cert",   pd.get("bonafide_school_cert_url")),
        ("marksheet_3yr",          pd.get("marksheet_3yr_url")),
        ("appointment_letter",     pd.get("appointment_letter_url")),
        ("salary_slip",            pd.get("salary_slip_url")),
        ("bank_statement_1yr",     pd.get("bank_statement_1yr_url")),
        ("noc_previous_division",  pd.get("noc_previous_division_url")),
        ("cancelled_cheque",       pd.get("cancelled_cheque_url")),
        ("gst_certificate",        pd.get("gst_certificate_url")),
    ]
    for doc_type, url in reg_to_kyc:
        if url:
            player.documents.append(_PlayerDocument(
                doc_type=doc_type, url=url, uploaded_at=now if False else datetime.now(timezone.utc).isoformat(),
                uploaded_by=doc.get("body_code") or "MPCA", verified=False,
            ))
    for other in (pd.get("other_docs") or []):
        if isinstance(other, dict) and other.get("url"):
            player.documents.append(_PlayerDocument(
                doc_type=f"other:{other.get('label') or 'Other Document'}",
                url=other["url"], uploaded_at=datetime.now(timezone.utc).isoformat(),
                uploaded_by=other.get("uploaded_by") or doc.get("body_code") or "MPCA",
                verified=False,
            ))
    await db.players.insert_one(player.model_dump())

    now = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Approved",
        "mpca_remark": action.remark,
        "mpca_reviewed_by": action.actor_name,
        "mpca_reviewed_at": now,
        "mpca_shortcut_used": shortcut,
        "linked_player_id": player.id,
        "reviewed_by": action.actor_name,
        "reviewed_at": now,
        "review_note": action.remark,
        "updated_at": now,
    }})
    await _log_event(rid, "mpca_approved" if not shortcut else "mpca_approved_shortcut",
                     actor_name=action.actor_name, actor_body_id="MPCA",
                     actor_role=x_role_id, note=action.remark)
    if doc.get("invite_id"):
        await db.player_registration_invites.update_one({"id": doc["invite_id"]}, {"$set": {"status": "Approved"}})
    await _touch_counts(doc["campaign_id"], {"submitted_count": -1, "approved_count": 1})
    # MPCA-153 · Notify player by email on MPCA final approval + player creation
    if pd.get("email"):
        try:
            await send_email(
                to=pd["email"],
                subject=f"MPCA · Registration APPROVED — your Player ID is {player_id}",
                html_body=(
                    f"<p>Dear {pd.get('full_name') or 'Player'},</p>"
                    f"<p>Congratulations! Your MPCA player registration has been <strong>approved</strong>"
                    f" and your official Player ID is <strong>{player_id}</strong>.</p>"
                    f"<p><em>MPCA remark:</em> {action.remark}</p>"
                    f"<p>You may now be selected for tournaments. Reach out to your Home Division"
                    f" for the next steps.</p>"
                    f"<p>Regards,<br/>Team MPCA</p>"
                ),
            )
        except Exception:
            pass
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/return-to-player", response_model=PlayerRegistration)
async def return_to_player(
    rid: str,
    action: RemarkAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """M39n · Either stage can send the registration back for edits. Player can
    resubmit in-place; status flips Returned → Submitted on re-save."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc.get("status") == "Approved":
        raise HTTPException(400, "Already approved — cannot return.")
    if not (_is_home_division(doc, x_user_body_code, x_role_id) or (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Only the home Division or MPCA may return this registration.")
    reason = (action.remark or "").strip()
    if not reason:
        raise HTTPException(400, "A reason is required when returning.")
    now = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Returned",
        "return_reason": reason,
        "updated_at": now,
    }})
    await _log_event(rid, "returned", actor_name=action.actor_name,
                     actor_body_id=x_user_body_code, actor_role=x_role_id, note=reason)
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/edit", response_model=PlayerRegistration)
async def edit_registration(
    rid: str,
    action: EditAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """M39n · Home Division (or MPCA) can amend the player_data before approving.
    Diff of changed fields is logged. Only allowed while Submitted / Returned /
    Division_Approved (before MPCA finalises)."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc.get("status") == "Approved":
        raise HTTPException(400, "Cannot edit after MPCA approval.")
    if not (_is_home_division(doc, x_user_body_code, x_role_id) or (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Only the home Division or MPCA may edit this registration.")
    if not action.patch:
        raise HTTPException(400, "Empty patch.")

    current = doc.get("player_data") or {}
    diff: Dict[str, Any] = {}
    updates: Dict[str, Any] = {}
    for k, v in action.patch.items():
        # Never allow the caller to change the campaign/body/cycle/status via this route
        if k in {"campaign_id", "body_code", "cycle_code", "status", "id"}:
            continue
        if current.get(k) != v:
            diff[k] = [current.get(k), v]
            updates[f"player_data.{k}"] = v
    if not diff:
        return await db.player_registrations.find_one({"id": rid}, {"_id": 0})

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": updates})
    await _log_event(rid, "edited", actor_name=action.actor_name,
                     actor_body_id=x_user_body_code, actor_role=x_role_id,
                     note=f"{len(diff)} field(s) amended.", diff=diff)
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/upload-doc", response_model=PlayerRegistration)
async def upload_doc_on_behalf(
    rid: str,
    action: DocUploadAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """M39n · Division uploads a doc URL on the player's behalf. Doc URL
    typically comes from POST /api/uploads. Overwrites the player_data doc slot
    and appends an audit event."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc.get("status") == "Approved":
        raise HTTPException(400, "Cannot upload docs after MPCA approval.")
    if not (_is_home_division(doc, x_user_body_code, x_role_id) or (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Only the home Division or MPCA may upload docs on behalf.")
    if action.doc_key not in {
        "photo_url", "aadhaar_url", "aadhaar_history_url", "pan_url",
        "passport_url", "driving_licence_url", "voter_id_url",
        "address_proof_url", "birth_cert_url",
        "marksheet_3yr_url", "affidavit_url",
        "cancelled_cheque_url", "gst_certificate_url",
    }:
        raise HTTPException(400, f"Unsupported doc_key: {action.doc_key}")
    updates = {
        f"player_data.{action.doc_key}": action.doc_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.player_registrations.update_one({"id": rid}, {"$set": updates})
    await _log_event(rid, "doc_uploaded", actor_name=action.actor_name,
                     actor_body_id=x_user_body_code, actor_role=x_role_id,
                     note=f"{action.doc_key} replaced/uploaded on player's behalf.",
                     diff={action.doc_key: [doc.get("player_data", {}).get(action.doc_key), action.doc_url]})
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/resubmit", response_model=PlayerRegistration)
async def resubmit_after_return(rid: str):
    """M39n · Player-facing resubmit — flips Returned → Submitted so the
    Division picks it back up. Meant to be called by the player after they
    edit their data via the public form (or, temporarily, by MPCA/Div staff
    on behalf while an authenticated player portal is TBD)."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc.get("status") != "Returned":
        raise HTTPException(409, "Only Returned registrations can be resubmitted.")
    now = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Submitted", "updated_at": now,
    }})
    await _log_event(rid, "resubmitted", note="Player resubmitted after Division/MPCA return.")
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


# ─────────────── Campaign CRUD ───────────────

@api_router.post("/player-registration-campaigns", response_model=PlayerRegistrationCampaign)
async def create_campaign(
    payload: CampaignCreate,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    if not _may_own(payload.body_code, x_user_body_code, x_role_id):
        raise HTTPException(403, f"Only {payload.body_code} or MPCA may open a campaign for that body.")
    body = await db.bodies.find_one({"code": payload.body_code}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body {payload.body_code} not found")
    # MPCA-116 · Divisions raise a REQUEST — the campaign is created in
    # Pending state, the public form refuses submissions until MPCA approves.
    # MPCA-created campaigns are auto-Approved.
    is_mpca_caller = (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)
    row = PlayerRegistrationCampaign(
        **payload.model_dump(exclude_unset=True),
        body_name=body.get("name"),
        body_type=body.get("body_type"),
        request_status=("Approved" if is_mpca_caller else "Pending"),
        requested_by=payload.created_by,
        approved_by=("MPCA" if is_mpca_caller else None),
        approved_at=(datetime.now(timezone.utc).isoformat() if is_mpca_caller else None),
    )
    await db.player_registration_campaigns.insert_one(row.model_dump())
    return row


@api_router.post("/player-registration-campaigns/{cid}/approve-request", response_model=PlayerRegistrationCampaign)
async def approve_campaign_request(
    cid: str,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
    x_persona_name: Optional[str] = Depends(principal_persona_id),
):
    """MPCA-116 · MPCA approves a Division's campaign request. Public form
    submissions unlock once this fires."""
    if not (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES):
        raise HTTPException(403, "Only MPCA may approve campaign requests.")
    doc = await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    if doc.get("request_status") == "Approved":
        return doc
    await db.player_registration_campaigns.update_one(
        {"id": cid},
        {"$set": {
            "request_status": "Approved",
            "approved_by": x_persona_name or "MPCA",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "rejection_reason": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})


class _RejectPayload(BaseModel):
    reason: str = ""
    model_config = ConfigDict(extra="ignore")


@api_router.post("/player-registration-campaigns/{cid}/reject-request", response_model=PlayerRegistrationCampaign)
async def reject_campaign_request(
    cid: str,
    payload: _RejectPayload,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
    x_persona_name: Optional[str] = Depends(principal_persona_id),
):
    """MPCA-116 · MPCA rejects a Division's campaign request."""
    if not (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES):
        raise HTTPException(403, "Only MPCA may reject campaign requests.")
    if not (payload.reason or "").strip():
        raise HTTPException(400, "A rejection reason is required.")
    doc = await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    await db.player_registration_campaigns.update_one(
        {"id": cid},
        {"$set": {
            "request_status": "Rejected",
            "rejection_reason": payload.reason.strip(),
            "approved_by": x_persona_name or "MPCA",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})


@api_router.get("/player-registration-campaigns", response_model=List[PlayerRegistrationCampaign])
async def list_campaigns(
    body_code: Optional[str] = None,
    cycle_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    q: Dict[str, Any] = {}
    if body_code: q["body_code"] = body_code
    if cycle_code: q["cycle_code"] = cycle_code
    if is_active is not None: q["is_active"] = is_active
    # Scope to caller — MPCA sees all, non-MPCA sees own body only.
    is_mpca = (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)
    if not is_mpca and x_user_body_code:
        q["body_code"] = x_user_body_code
    rows = await db.player_registration_campaigns.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@api_router.get("/player-registration-campaigns/{cid}", response_model=PlayerRegistrationCampaign)
async def get_campaign(
    cid: str,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    doc = await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    if not _may_read(doc, x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to read this campaign.")
    return doc


@api_router.patch("/player-registration-campaigns/{cid}", response_model=PlayerRegistrationCampaign)
async def patch_campaign(
    cid: str,
    payload: CampaignPatch,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    doc = await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to edit this campaign.")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Empty patch")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.player_registration_campaigns.update_one({"id": cid}, {"$set": updates})
    return await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})


# ─────────────── Invites ───────────────

@api_router.post("/player-registration-campaigns/{cid}/invites")
async def bulk_invite(
    cid: str,
    payload: InviteBulk,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    doc = await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to add invites to this campaign.")
    created: List[Dict[str, Any]] = []
    for inv in payload.invites or []:
        row = PlayerRegistrationInvite(
            campaign_id=cid,
            prefill_name=(inv or {}).get("prefill_name"),
            prefill_email=(inv or {}).get("prefill_email"),
            prefill_phone=(inv or {}).get("prefill_phone"),
        )
        await db.player_registration_invites.insert_one(row.model_dump())
        created.append(row.model_dump())
    await _touch_counts(cid, {"invited_count": len(created)})
    return {"created": created, "count": len(created)}


@api_router.get("/player-registration-campaigns/{cid}/invites")
async def list_invites(
    cid: str,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    doc = await db.player_registration_campaigns.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    if not _may_read(doc, x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to read this campaign.")
    invites = await db.player_registration_invites.find({"campaign_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return invites


# ─────────────── PUBLIC endpoints (no auth) ───────────────

@api_router.get("/public/player-registration/token/{token}")
async def resolve_token(token: str):
    """Resolve either a campaign public_token OR an invite token.
    Returns a lightweight envelope safe for public consumption."""
    now = datetime.now(timezone.utc).isoformat()

    # Fetch the list of divisions once — needed for the Host Division dropdown
    divisions_cur = db.bodies.find(
        {"body_type": "Division"},
        {"_id": 0, "code": 1, "name": 1},
    ).sort("name", 1)
    divisions = await divisions_cur.to_list(200)

    # 1) Try invite first (more specific).
    invite = await db.player_registration_invites.find_one({"token": token}, {"_id": 0})
    if invite:
        camp = await db.player_registration_campaigns.find_one({"id": invite["campaign_id"]}, {"_id": 0})
        if not camp or not camp.get("is_active"):
            raise HTTPException(410, "This invite is no longer active.")
        if camp.get("expires_on") and camp["expires_on"] < now[:10]:
            raise HTTPException(410, "This invite has expired.")
        return {
            "kind": "invite",
            "invite_id": invite["id"],
            "campaign_id": camp["id"],
            "campaign_title": camp["title"],
            "body_code": camp["body_code"],
            "body_name": camp.get("body_name"),
            "cycle_code": camp["cycle_code"],
            "expires_on": camp.get("expires_on"),
            "divisions": divisions,       # M38h · for Host Division dropdown
            "prefill": {
                "full_name": invite.get("prefill_name"),
                "email": invite.get("prefill_email"),
                "mobile": invite.get("prefill_phone"),
            },
            "already_submitted": bool(invite.get("submission_id")),
        }

    # 2) Try public campaign token.
    camp = await db.player_registration_campaigns.find_one({"public_token": token}, {"_id": 0})
    if not camp:
        raise HTTPException(404, "Unknown or invalid registration link.")
    if not camp.get("is_active"):
        raise HTTPException(410, "This campaign is no longer active.")
    # MPCA-116 · Public form is disabled until MPCA has approved the request.
    if camp.get("request_status") != "Approved":
        raise HTTPException(
            403,
            "This campaign is awaiting MPCA approval and cannot accept "
            "submissions yet. Please try again once approval is granted.",
        )
    if camp.get("expires_on") and camp["expires_on"] < now[:10]:
        raise HTTPException(410, "This campaign has expired.")
    return {
        "kind": "campaign",
        "campaign_id": camp["id"],
        "campaign_title": camp["title"],
        "body_code": camp["body_code"],
        "body_name": camp.get("body_name"),
        "cycle_code": camp["cycle_code"],
        "expires_on": camp.get("expires_on"),
        "divisions": divisions,           # M38h · for Host Division dropdown
        "prefill": {},
    }


class PublicSubmit(BaseModel):
    token: str
    player: PlayerRegistrationData
    model_config = ConfigDict(extra="ignore")


@api_router.post("/public/player-registration/submit", response_model=PlayerRegistration)
async def public_submit(payload: PublicSubmit):
    # Reuse token resolution to get campaign context
    envelope = await resolve_token(payload.token)
    campaign_id = envelope["campaign_id"]
    invite_id = envelope.get("invite_id")

    # M39q · Compose full_name from first_name + surname when the split form
    # is used, so downstream code (squads, players collection) keeps working.
    fn = (payload.player.first_name or "").strip()
    sn = (payload.player.surname or "").strip()
    if fn or sn:
        payload.player.full_name = f"{fn} {sn}".strip()
    elif payload.player.full_name:
        # Legacy caller / prefill only sent full_name — best-effort split.
        parts = payload.player.full_name.strip().split()
        if len(parts) >= 2:
            payload.player.first_name = " ".join(parts[:-1])
            payload.player.surname = parts[-1]
        else:
            payload.player.first_name = payload.player.full_name.strip()
            payload.player.surname = ""
    if not (payload.player.full_name or "").strip():
        raise HTTPException(400, "First name and surname are required.")

    # If invite already submitted → block to prevent duplicates
    if invite_id and envelope.get("already_submitted"):
        raise HTTPException(400, "This invite has already been submitted. Contact your Division secretary if you need to edit it.")

    # ── One-submission-per-email guard (per campaign) ──
    email = (payload.player.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "Email is required so we can prevent duplicate registrations on this link.")
    dup = await db.player_registrations.find_one(
        {
            "campaign_id": campaign_id,
            "email_key": email,
            "status": {"$in": ["Submitted", "Approved"]},
        },
        {"_id": 0, "id": 1, "status": 1},
    )
    if dup:
        raise HTTPException(
            409,
            "This email has already submitted a registration on this link. If you need to update your details, please contact your Division secretary.",
        )

    # ── M39p · Aadhaar-level duplication guard (blocks across campaigns) ──
    if payload.player.aadhaar_no:
        try:
            from core.player_doc_ai import check_aadhaar_duplicate
            aad_dup = await check_aadhaar_duplicate(payload.player.aadhaar_no)
            if aad_dup:
                raise HTTPException(
                    409,
                    "This Aadhaar has already been submitted for player registration. "
                    "One Aadhaar can register only once. Please contact your Division "
                    "secretary if you believe this is in error.",
                )
        except HTTPException:
            raise
        except Exception:  # noqa
            pass  # never let the dup helper break submission

    reg = PlayerRegistration(
        campaign_id=campaign_id,
        invite_id=invite_id,
        body_code=envelope["body_code"],
        cycle_code=envelope["cycle_code"],
        status="Submitted",
        player_data=payload.player,
        audit_events=[PlayerRegistrationAuditEvent(
            event="submitted",
            actor_name=payload.player.full_name,
            note=f"Player submitted via public form. Preferred division: {payload.player.preferred_division_code or 'not specified'}.",
        )],
    )
    row = reg.model_dump()
    row["email_key"] = email  # normalised dedupe key (never surfaced to Pydantic model)
    await db.player_registrations.insert_one(row)
    if invite_id:
        await db.player_registration_invites.update_one(
            {"id": invite_id}, {"$set": {"status": "Submitted", "submission_id": reg.id}},
        )
    await _touch_counts(campaign_id, {"submitted_count": 1})

    # M39p · Fire-and-forget: run the full AI report card so the Division
    # reviewer already has it when they open the inbox.
    try:
        import asyncio as _aio
        from core.player_doc_ai import run_full_registration_ai as _run_full_ai
        async def _bg():
            try:
                fresh = await db.player_registrations.find_one({"id": reg.id}, {"_id": 0})
                if not fresh:
                    return
                report = await _run_full_ai(fresh)
                await db.player_registrations.update_one(
                    {"id": reg.id},
                    {"$set": {"ai_full_report": report, "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
            except Exception:  # noqa
                return
        _aio.ensure_future(_bg())
    except Exception:  # noqa
        pass
    return reg


# ─────────────── Admin inbox ───────────────

@api_router.get("/player-registrations", response_model=List[PlayerRegistration])
async def list_registrations(
    campaign_id: Optional[str] = None,
    body_code: Optional[str] = None,
    cycle_code: Optional[str] = None,
    status: Optional[str] = None,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    q: Dict[str, Any] = {}
    if campaign_id: q["campaign_id"] = campaign_id
    if cycle_code: q["cycle_code"] = cycle_code
    if status: q["status"] = status
    is_mpca = (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)
    if not is_mpca and x_user_body_code:
        q["body_code"] = x_user_body_code
    if body_code and is_mpca:
        q["body_code"] = body_code
    rows = await db.player_registrations.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(1000)
    return rows


@api_router.get("/player-registrations/{rid}", response_model=PlayerRegistration)
async def get_registration(
    rid: str,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to view this registration.")
    return doc


@api_router.post("/player-registrations/{rid}/ai-review", response_model=PlayerRegistration)
async def ai_review_registration(
    rid: str,
    actor_name: Optional[str] = None,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """M38i · Run Gemini on the player-submitted KYC documents (photo,
    Aadhaar, address proof, birth certificate) and stamp a summary verdict
    on the registration so MPCA/Division reviewers can eyeball authenticity.
    Reuses the same `_run_player_doc_validation` helper that already powers
    the registered-Player AI OCR + fraud check.
    """
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to review this registration.")

    from core.ai_validator import _run_player_doc_validation
    pd = doc.get("player_data") or {}
    # Shape the registration into the format `_run_player_doc_validation` expects
    docs_for_ai: List[dict] = []
    for key, doc_type in [("photo_url", "photo"), ("aadhaar_url", "aadhaar"),
                          ("address_proof_url", "address_proof"),
                          ("birth_cert_url", "birth_certificate")]:
        url = pd.get(key)
        if url:
            docs_for_ai.append({"doc_type": doc_type, "url": url, "filename": key})

    if not docs_for_ai:
        ai_summary = {
            "overall_verdict": "Recommend_Reject",
            "overall_confidence": 0.0,
            "docs_verified": 0, "docs_total": 4,
            "critical_issues": ["No KYC documents uploaded — cannot verify."],
            "advisory_notes": [],
            "per_doc": [],
            "validated_at": datetime.now(timezone.utc).isoformat(),
            "validated_by": actor_name or "AI Gatekeeper",
        }
    else:
        adapter = {
            "id": rid,
            "player_display_id": rid,
            "full_name": pd.get("full_name"),
            "father_name": pd.get("guardian_name"),
            "mother_name": None,
            "date_of_birth": pd.get("dob"),
            "gender": pd.get("gender"),
            "category": pd.get("category"),
            "body_id": doc.get("body_code"),
            "documents": docs_for_ai,
        }
        verdict = await _run_player_doc_validation(adapter)
        # Map Gemini decision → our verdict pill
        decision = verdict.get("decision", "FLAGGED")
        if decision == "CLEAN":
            overall = "Recommend_Approve"
        elif decision in ("FLAGGED", "SUSPECTED_FRAUD"):
            overall = "Recommend_Reject"
        else:
            overall = "Manual_Review"
        per_doc = verdict.get("documents") or []
        ai_summary = {
            "overall_verdict": overall,
            "overall_confidence": float(verdict.get("confidence") or 0.0),
            "docs_verified": len([d for d in per_doc if str(d.get("verdict", "")).lower() in ("ok", "clean", "verified", "matches")]),
            "docs_total": len(docs_for_ai),
            "critical_issues": verdict.get("warnings") or [],
            "advisory_notes": [verdict.get("reasoning") or ""] if verdict.get("reasoning") else [],
            "per_doc": per_doc,
            "raw_decision": decision,
            "validated_at": datetime.now(timezone.utc).isoformat(),
            "validated_by": actor_name or "AI Gatekeeper",
        }
    await db.player_registrations.update_one({"id": rid}, {"$set": {"ai_summary": ai_summary}})
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})




@api_router.post("/player-registrations/{rid}/ai-full-review", response_model=PlayerRegistration)
async def ai_full_review(
    rid: str,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """M39p · Manually re-run the full AI + rules report card. Available to the
    home Division or MPCA at any time before final approval."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not (_is_home_division(doc, x_user_body_code, x_role_id) or (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Only the home Division or MPCA may run AI review.")
    from core.player_doc_ai import run_full_registration_ai
    report = await run_full_registration_ai(doc)
    now = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one(
        {"id": rid},
        {"$set": {"ai_full_report": report, "updated_at": now}},
    )
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/approve", response_model=PlayerRegistration)
async def approve_registration(
    rid: str,
    action: ReviewAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to approve.")
    if doc.get("status") == "Approved":
        raise HTTPException(400, "Already approved.")

    # Auto-create the Player record.
    from models import Player
    pd = doc["player_data"]
    body_code = doc["body_code"]
    count = await db.players.count_documents({"body_id": body_code, "season_year": doc["cycle_code"]})
    short = body_code.split("-")[-1] if "-" in body_code else body_code[:3]
    player_id = f"MP/{short}/{doc['cycle_code']}/{count + 1:04d}"

    # Map registration payload → Player fields (translate abbreviations).
    gender_map = {"M": "Male", "F": "Female", "Male": "Male", "Female": "Female", "Other": "Other"}
    batting = pd.get("batting_style") or "Right_Hand"
    bowling = pd.get("bowling_style") or "None"

    player = Player(
        player_id=player_id,
        body_id=body_code,
        full_name=pd["full_name"],
        date_of_birth=pd["dob"],
        gender=gender_map.get(pd.get("gender"), "Male"),
        role=pd.get("role", "Batter"),
        batting_style=batting,
        bowling_style=bowling,
        category=pd.get("category", "Local_MP"),
        season_year=doc["cycle_code"],
        division_folder=body_code if body_code.startswith("DIV-") else None,
        contact_phone=pd.get("mobile"),
        contact_email=pd.get("email"),
        aadhaar_last4=(pd.get("aadhaar_no") or "")[-4:] or None,
        guardian_name=pd.get("guardian_name"),
        address_line=pd.get("address"),
        photo_url=pd.get("photo_url"),
        status="Active",
    )
    await db.players.insert_one(player.model_dump())

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Approved",
        "reviewed_at": now_iso,
        "reviewed_by": action.reviewer_name or x_user_body_code,
        "review_note": action.note,
        "linked_player_id": player.id,
        "updated_at": now_iso,
    }})
    await _touch_counts(doc["campaign_id"], {"approved_count": 1})
    if doc.get("invite_id"):
        await db.player_registration_invites.update_one({"id": doc["invite_id"]}, {"$set": {"status": "Approved"}})
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/reject", response_model=PlayerRegistration)
async def reject_registration(
    rid: str,
    action: ReviewAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to reject.")
    if not action.note:
        raise HTTPException(400, "Rejection note is required.")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Rejected",
        "reviewed_at": now_iso,
        "reviewed_by": action.reviewer_name or x_user_body_code,
        "review_note": action.note,
        "updated_at": now_iso,
    }})
    await _touch_counts(doc["campaign_id"], {"rejected_count": 1})
    if doc.get("invite_id"):
        await db.player_registration_invites.update_one({"id": doc["invite_id"]}, {"$set": {"status": "Rejected"}})
    # MPCA-153 · Notify player by email on rejection
    pd = doc.get("player_data") or {}
    if pd.get("email"):
        try:
            await send_email(
                to=pd["email"],
                subject="MPCA · Your registration was NOT approved",
                html_body=(
                    f"<p>Dear {pd.get('full_name') or 'Player'},</p>"
                    f"<p>We regret to inform you that your MPCA player registration was <strong>not approved</strong> at this time.</p>"
                    f"<p><em>Reason:</em> {action.note}</p>"
                    f"<p>You may reach out to your Home Division ({doc.get('body_code')}) if you have questions"
                    f" or wish to submit a fresh application in the next season.</p>"
                    f"<p>Regards,<br/>Team MPCA</p>"
                ),
            )
        except Exception:
            pass
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/return", response_model=PlayerRegistration)
async def return_registration(
    rid: str,
    action: ReviewAction,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """Send back to the player so they can edit and re-submit via the same token."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to return.")
    if not action.note:
        raise HTTPException(400, "Return reason is required.")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Returned",
        "return_reason": action.note,
        "reviewed_at": now_iso,
        "reviewed_by": action.reviewer_name or x_user_body_code,
        "updated_at": now_iso,
    }})
    if doc.get("invite_id"):
        await db.player_registration_invites.update_one({"id": doc["invite_id"]}, {"$set": {"status": "Sent", "submission_id": None}})
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


# ═════════════════════════════════════════════════════════════════════
# Iter 128 · Player Correction Request workflow
# ─────────────────────────────────────────────────────────────────────
# Reviewer (Division or MPCA) flags specific fields / documents and asks
# the player to fix them. Player receives an email + SMS with a unique
# tokenised link. No login — the token IS the credential (same pattern
# as `/register/player/{token}`). Player can only edit flagged keys.
# Reviewer can send unlimited rounds. Token expires in 7 days.
# ═════════════════════════════════════════════════════════════════════

from core.sms_notifications import send_correction_sms  # noqa: E402

CORRECTION_TOKEN_TTL_DAYS = 7

_KNOWN_FIELD_KEYS = set(PlayerRegistrationData.model_fields.keys())
_KNOWN_DOC_KEYS = {
    k for k in _KNOWN_FIELD_KEYS if k.endswith("_url")
}


class CorrectionFieldFlag(BaseModel):
    key: str                       # field name inside player_data (e.g. "aadhaar_no")
    label: str                     # human label the reviewer typed
    remark: str                    # per-field remark ("Number does not match aadhaar card")
    model_config = ConfigDict(extra="ignore")


class CorrectionDocumentFlag(BaseModel):
    key: str                       # existing *_url key on player_data OR new slot
    label: str                     # human label ("Birth Certificate")
    remark: str
    is_new: bool = False           # True when reviewer is asking for a fresh document not already collected
    model_config = ConfigDict(extra="ignore")


class CorrectionRequestCreate(BaseModel):
    """Reviewer payload."""
    actor_name: Optional[str] = None
    overall_note: str
    field_flags: List[CorrectionFieldFlag] = Field(default_factory=list)
    document_flags: List[CorrectionDocumentFlag] = Field(default_factory=list)
    origin: Optional[str] = None   # frontend base URL for building the player link
    model_config = ConfigDict(extra="ignore")


class PlayerCorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    registration_id: str
    campaign_id: str
    body_code: str
    token: str = Field(default_factory=lambda: secrets.token_urlsafe(24))
    status: Literal["Pending", "Resubmitted", "Cancelled", "Expired"] = "Pending"
    overall_note: str
    field_flags: List[CorrectionFieldFlag] = Field(default_factory=list)
    document_flags: List[CorrectionDocumentFlag] = Field(default_factory=list)
    requested_by_name: Optional[str] = None
    requested_by_body: Optional[str] = None
    requested_by_role: Optional[str] = None
    requested_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    expires_at: str = ""
    resubmitted_at: Optional[str] = None
    resubmit_diff: Optional[Dict[str, Any]] = None
    notification_result: Optional[Dict[str, Any]] = None


class PublicCorrectionSubmit(BaseModel):
    patch: Dict[str, Any] = Field(default_factory=dict)
    model_config = ConfigDict(extra="ignore")


def _correction_link(origin: str | None, token: str) -> str:
    base = (origin or "").rstrip("/")
    return f"{base}/register/player/correct/{token}" if base else f"/register/player/correct/{token}"


@api_router.post("/player-registrations/{rid}/request-correction")
async def request_correction(
    rid: str,
    payload: CorrectionRequestCreate,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    """Iter 128 · Division or MPCA flags specific fields/documents for the
    player to fix. Fires email + SMS with a unique tokenised link."""
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc.get("status") == "Approved":
        raise HTTPException(400, "Already approved — cannot request corrections.")
    if not (_is_home_division(doc, x_user_body_code, x_role_id) or (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Only the home Division or MPCA may request corrections.")

    note = (payload.overall_note or "").strip()
    if len(note) < 5:
        raise HTTPException(400, "Overall note must be at least 5 characters.")
    if not payload.field_flags and not payload.document_flags:
        raise HTTPException(400, "At least one field or document flag is required.")

    # Guard: field flags must reference known player_data keys.
    for f in payload.field_flags:
        if f.key not in _KNOWN_FIELD_KEYS:
            raise HTTPException(400, f"Unknown field key: {f.key}")

    from datetime import timedelta
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=CORRECTION_TOKEN_TTL_DAYS)).isoformat()

    req = PlayerCorrectionRequest(
        registration_id=rid,
        campaign_id=doc["campaign_id"],
        body_code=doc["body_code"],
        overall_note=note,
        field_flags=payload.field_flags,
        document_flags=payload.document_flags,
        requested_by_name=payload.actor_name,
        requested_by_body=x_user_body_code,
        requested_by_role=x_role_id,
        requested_at=now.isoformat(),
        expires_at=expires_at,
    )
    req_dict = req.model_dump()
    await db.player_correction_requests.insert_one(req_dict)
    req_dict.pop("_id", None)

    # Flip registration into Correction_Requested + remember latest correction id
    await db.player_registrations.update_one({"id": rid}, {"$set": {
        "status": "Correction_Requested",
        "latest_correction_id": req.id,
        "updated_at": now.isoformat(),
    }})
    await _log_event(rid, "correction_requested",
                     actor_name=payload.actor_name,
                     actor_body_id=x_user_body_code, actor_role=x_role_id,
                     note=note,
                     diff={"field_count": [None, len(payload.field_flags)],
                           "document_count": [None, len(payload.document_flags)]})

    # Fire email + SMS (best-effort, non-fatal)
    pd = doc.get("player_data") or {}
    link = _correction_link(payload.origin, req.token)
    email_result = None
    sms_result = None
    if pd.get("email"):
        html = _build_correction_email_html(pd.get("full_name") or pd.get("first_name") or "Player",
                                            note, payload.field_flags, payload.document_flags,
                                            link, CORRECTION_TOKEN_TTL_DAYS)
        try:
            email_result = await send_email(
                pd["email"],
                "MPCA · Please correct your player registration",
                html,
            )
        except Exception as exc:  # noqa: BLE001
            email_result = {"status": "failed", "error": str(exc)}
    if pd.get("mobile"):
        try:
            sms_result = await send_correction_sms(pd["mobile"], link)
        except Exception as exc:  # noqa: BLE001
            sms_result = {"status": "failed", "error": str(exc)}

    notif = {"email": email_result, "sms": sms_result}
    await db.player_correction_requests.update_one(
        {"id": req.id}, {"$set": {"notification_result": notif}},
    )
    req_dict["notification_result"] = notif
    return {"request": req_dict, "link": link}


def _build_correction_email_html(name: str, note: str, field_flags, document_flags, link: str, days: int) -> str:
    def _rows(flags):
        return "".join(
            f"<li style='margin:6px 0;'><strong>{f.label}</strong> — {f.remark}</li>"
            for f in flags
        ) or "<li style='color:#666'>(none)</li>"
    return f"""
    <div style="font-family:Arial,sans-serif;color:#232323;max-width:600px">
        <h2 style="color:#0e3d2e">MPCA · Correction Required</h2>
        <p>Dear {name},</p>
        <p>Your registration has been reviewed and requires a few corrections before it can be approved.</p>
        <p style="background:#fdf6e6;border-left:3px solid #b88328;padding:10px 12px;font-style:italic;">{note}</p>
        <h3 style="margin-top:20px">Fields to update</h3>
        <ul>{_rows(field_flags)}</ul>
        <h3>Documents to re-upload / provide</h3>
        <ul>{_rows(document_flags)}</ul>
        <p style="margin-top:24px">
            <a href="{link}" style="background:#0e3d2e;color:#f5efe6;padding:12px 22px;
                text-decoration:none;border-radius:4px;font-weight:bold;letter-spacing:0.5px;">
                Open Correction Form
            </a>
        </p>
        <p style="color:#666;font-size:13px">This link is valid for {days} days. Do not share it.</p>
        <p style="color:#666;font-size:12px;margin-top:32px">— Madhya Pradesh Cricket Association</p>
    </div>
    """


@api_router.post("/player-registrations/{rid}/cancel-correction/{cid}")
async def cancel_correction(
    rid: str,
    cid: str,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    reg = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not reg:
        raise HTTPException(404, "Registration not found")
    if not (_is_home_division(reg, x_user_body_code, x_role_id) or (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Not permitted.")
    req = await db.player_correction_requests.find_one({"id": cid, "registration_id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Correction request not found")
    if req["status"] != "Pending":
        raise HTTPException(400, f"Correction is {req['status']} — cannot cancel.")
    await db.player_correction_requests.update_one({"id": cid}, {"$set": {"status": "Cancelled"}})
    # If this was the active correction, roll registration back to Submitted
    if reg.get("latest_correction_id") == cid and reg.get("status") == "Correction_Requested":
        await db.player_registrations.update_one({"id": rid}, {"$set": {
            "status": "Submitted",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }})
    await _log_event(rid, "correction_cancelled", actor_body_id=x_user_body_code, actor_role=x_role_id)
    return {"status": "ok"}


@api_router.get("/player-registrations/{rid}/corrections")
async def list_corrections(
    rid: str,
    x_user_body_code: Optional[str] = Depends(principal_body_code),
    x_role_id: Optional[str] = Depends(principal_role_id),
):
    reg = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not reg:
        raise HTTPException(404, "Registration not found")
    if not (_is_home_division(reg, x_user_body_code, x_role_id) or (x_user_body_code == "MPCA" and x_role_id in MPCA_ROLES)):
        raise HTTPException(403, "Not permitted.")
    cur = db.player_correction_requests.find(
        {"registration_id": rid}, {"_id": 0, "token": 0},  # never leak token to reviewers list
    ).sort("requested_at", -1)
    items = await cur.to_list(50)
    return items


# ─────────────── PUBLIC (no-auth) correction endpoints ───────────────

@api_router.get("/public/player-registrations/correction/{token}")
async def public_get_correction(token: str):
    """Player opens the emailed / SMS'd link — token IS the credential."""
    req = await db.player_correction_requests.find_one({"token": token}, {"_id": 0})
    if not req:
        raise HTTPException(404, "This correction link is invalid.")
    now_iso = datetime.now(timezone.utc).isoformat()
    if req["status"] == "Cancelled":
        raise HTTPException(410, "This correction request was withdrawn.")
    if req["status"] == "Resubmitted":
        return {"already_resubmitted": True, "resubmitted_at": req.get("resubmitted_at")}
    if req.get("expires_at") and req["expires_at"] < now_iso:
        if req["status"] == "Pending":
            await db.player_correction_requests.update_one({"id": req["id"]}, {"$set": {"status": "Expired"}})
        raise HTTPException(410, "This correction link has expired.")
    reg = await db.player_registrations.find_one({"id": req["registration_id"]}, {"_id": 0})
    if not reg:
        raise HTTPException(404, "Registration missing.")
    # Only return the player_data snapshot + flags — no reviewer identity, no internal audit
    return {
        "correction_id": req["id"],
        "overall_note": req["overall_note"],
        "field_flags": req["field_flags"],
        "document_flags": req["document_flags"],
        "expires_at": req["expires_at"],
        "player_data": reg.get("player_data") or {},
        "registration_id": reg["id"],
    }


@api_router.post("/public/player-registrations/correction/{token}/submit")
async def public_submit_correction(token: str, payload: PublicCorrectionSubmit):
    req = await db.player_correction_requests.find_one({"token": token}, {"_id": 0})
    if not req:
        raise HTTPException(404, "This correction link is invalid.")
    now = datetime.now(timezone.utc)
    if req["status"] != "Pending":
        raise HTTPException(410, f"This correction request is {req['status'].lower()}.")
    if req.get("expires_at") and req["expires_at"] < now.isoformat():
        await db.player_correction_requests.update_one({"id": req["id"]}, {"$set": {"status": "Expired"}})
        raise HTTPException(410, "This correction link has expired.")
    reg = await db.player_registrations.find_one({"id": req["registration_id"]}, {"_id": 0})
    if not reg:
        raise HTTPException(404, "Registration missing.")

    # Only allow patching keys that were flagged.
    flagged = {f["key"] for f in req.get("field_flags", [])}
    flagged |= {d["key"] for d in req.get("document_flags", [])}
    if not payload.patch:
        raise HTTPException(400, "Nothing to submit.")

    current = reg.get("player_data") or {}
    updates: Dict[str, Any] = {}
    diff: Dict[str, Any] = {}
    for k, v in payload.patch.items():
        if k not in flagged:
            raise HTTPException(400, f"Field '{k}' was not flagged for correction.")
        if k not in _KNOWN_FIELD_KEYS:
            raise HTTPException(400, f"Unknown key: {k}")
        if current.get(k) != v:
            diff[k] = [current.get(k), v]
            updates[f"player_data.{k}"] = v

    if not diff:
        # Same value re-submitted — still transition so the reviewer sees closure.
        await db.player_correction_requests.update_one({"id": req["id"]}, {"$set": {
            "status": "Resubmitted",
            "resubmitted_at": now.isoformat(),
            "resubmit_diff": {},
        }})
        await db.player_registrations.update_one({"id": reg["id"]}, {"$set": {
            "status": "Submitted",
            "updated_at": now.isoformat(),
        }})
        return {"status": "no_change"}

    updates.update({
        "status": "Submitted",
        "updated_at": now.isoformat(),
    })
    await db.player_registrations.update_one({"id": reg["id"]}, {"$set": updates})
    await db.player_correction_requests.update_one({"id": req["id"]}, {"$set": {
        "status": "Resubmitted",
        "resubmitted_at": now.isoformat(),
        "resubmit_diff": diff,
    }})
    await _log_event(reg["id"], "correction_resubmitted",
                     note=f"{len(diff)} field(s) resubmitted by player",
                     diff=diff)
    return {"status": "ok", "changes": len(diff)}
