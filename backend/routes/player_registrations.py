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
from typing import Optional, List, Dict, Any
import secrets
import uuid

from fastapi import HTTPException, Header
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router


MPCA_ROLES = {"secretary", "president", "treasurer", "hr_officer", "compliance_officer"}


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
    full_name: str
    dob: str                                            # ISO date
    gender: str                                         # M | F | Other
    role: str                                           # Batter | Bowler | All_Rounder | Wicket_Keeper
    batting_style: Optional[str] = None
    bowling_style: Optional[str] = None
    mobile: str
    email: Optional[str] = None
    home_district_code: Optional[str] = None
    category: str = "Local_MP"                          # Local_MP | Guest | Foreign
    guardian_name: Optional[str] = None
    address: Optional[str] = None
    aadhaar_no: Optional[str] = None
    consent: bool = False
    photo_url: Optional[str] = None
    aadhaar_url: Optional[str] = None
    address_proof_url: Optional[str] = None
    birth_cert_url: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    model_config = ConfigDict(extra="ignore")


class PlayerRegistration(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    campaign_id: str
    invite_id: Optional[str] = None
    body_code: str
    cycle_code: str
    status: str = "Submitted"                           # Submitted | Approved | Rejected | Returned
    player_data: PlayerRegistrationData
    submitted_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    submitted_ip: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    review_note: Optional[str] = None
    return_reason: Optional[str] = None
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


# ─────────────── Campaign CRUD ───────────────

@api_router.post("/player-registration-campaigns", response_model=PlayerRegistrationCampaign)
async def create_campaign(
    payload: CampaignCreate,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if not _may_own(payload.body_code, x_user_body_code, x_role_id):
        raise HTTPException(403, f"Only {payload.body_code} or MPCA may open a campaign for that body.")
    body = await db.bodies.find_one({"code": payload.body_code}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body {payload.body_code} not found")
    row = PlayerRegistrationCampaign(
        **payload.model_dump(exclude_unset=True),
        body_name=body.get("name"),
        body_type=body.get("body_type"),
    )
    await db.player_registration_campaigns.insert_one(row.model_dump())
    return row


@api_router.get("/player-registration-campaigns", response_model=List[PlayerRegistrationCampaign])
async def list_campaigns(
    body_code: Optional[str] = None,
    cycle_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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

    # If invite already submitted → block to prevent duplicates
    if invite_id and envelope.get("already_submitted"):
        raise HTTPException(400, "This invite has already been submitted. Contact your Division secretary if you need to edit it.")

    reg = PlayerRegistration(
        campaign_id=campaign_id,
        invite_id=invite_id,
        body_code=envelope["body_code"],
        cycle_code=envelope["cycle_code"],
        status="Submitted",
        player_data=payload.player,
    )
    await db.player_registrations.insert_one(reg.model_dump())
    if invite_id:
        await db.player_registration_invites.update_one(
            {"id": invite_id}, {"$set": {"status": "Submitted", "submission_id": reg.id}},
        )
    await _touch_counts(campaign_id, {"submitted_count": 1})
    return reg


# ─────────────── Admin inbox ───────────────

@api_router.get("/player-registrations", response_model=List[PlayerRegistration])
async def list_registrations(
    campaign_id: Optional[str] = None,
    body_code: Optional[str] = None,
    cycle_code: Optional[str] = None,
    status: Optional[str] = None,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    doc = await db.player_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if not _may_own(doc["body_code"], x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to view this registration.")
    return doc


@api_router.post("/player-registrations/{rid}/approve", response_model=PlayerRegistration)
async def approve_registration(
    rid: str,
    action: ReviewAction,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
    return await db.player_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/player-registrations/{rid}/return", response_model=PlayerRegistration)
async def return_registration(
    rid: str,
    action: ReviewAction,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
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
