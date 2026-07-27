"""M13 · Match Officials directory (Umpires, Scorers, Referees, Managers, Coaches, Trainers, Physios).
Each official is scoped to a body (MPCA or a Division/District). Division Secretary
managing a squad picks officials from their own body when submitting to MPCA.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal
from fastapi import HTTPException, Header
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router

OfficialRole = Literal["Umpire", "Scorer", "Referee", "Manager", "Coach", "Trainer", "Physio"]
OfficialGrade = Literal["BCCI_Panel", "State_Panel", "Division_Panel", "District_Panel", "Trainee"]


class MatchOfficialBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    full_name: str
    role: OfficialRole
    grade: OfficialGrade = "State_Panel"
    body_id: str = "MPCA"     # owning body (MPCA / Division / District)
    phone: Optional[str] = None
    email: Optional[str] = None
    accreditation_no: Optional[str] = None
    years_of_experience: int = 0
    fee_per_match_inr: Optional[float] = None
    is_active: bool = True
    notes: Optional[str] = None
    # ── M38g · KYC + Bank profile (editable by MPCA · owning Division · the Official themselves) ──
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    photo_url: Optional[str] = None
    pan_no: Optional[str] = None
    pan_doc_url: Optional[str] = None
    aadhaar_last4: Optional[str] = None
    aadhaar_doc_url: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    bank_cancelled_cheque_url: Optional[str] = None
    kyc_status: Literal["Not_Started", "Docs_Submitted", "KYC_Verified", "Rejected"] = "Not_Started"
    kyc_verified_at: Optional[str] = None
    kyc_verified_by: Optional[str] = None
    kyc_notes: Optional[str] = None


class MatchOfficial(MatchOfficialBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


_ADMIN_ROLES = {"president", "secretary", "division-secretary", "district-secretary", "treasurer"}


@api_router.get("/match-officials", response_model=List[MatchOfficial])
async def list_officials(
    body_id: Optional[str] = None,
    role: Optional[str] = None,
    active_only: bool = False,
):
    q = {}
    if body_id:
        q["body_id"] = body_id
    if role:
        q["role"] = role
    if active_only:
        q["is_active"] = True
    return await db.match_officials.find(q, {"_id": 0}).sort("full_name", 1).to_list(500)


@api_router.post("/match-officials", response_model=MatchOfficial)
async def create_official(
    payload: MatchOfficialBase,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _ADMIN_ROLES:
        raise HTTPException(403, "Only office bearers may add match officials.")
    # body must exist
    if not await db.bodies.find_one({"code": payload.body_id}, {"_id": 0}):
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    off = MatchOfficial(**payload.model_dump())
    await db.match_officials.insert_one(off.model_dump())
    return off


@api_router.get("/match-officials/{oid}", response_model=MatchOfficial)
async def get_official(oid: str):
    """M38g · Detail fetch for the Match Official profile / KYC page."""
    doc = await db.match_officials.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Match official not found")
    return doc


@api_router.patch("/match-officials/{oid}", response_model=MatchOfficial)
async def update_official(
    oid: str,
    payload: MatchOfficialBase,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_persona_name: Optional[str] = Header(None, alias="X-Persona-Name"),
    x_body_code: Optional[str] = Header(None, alias="X-Body-Code"),
):
    doc = await db.match_officials.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Match official not found")
    # M38g · Edit-permission rules:
    #   · MPCA state-level office bearers → always allowed
    #   · Owning Division / District office bearers (body_id match) → allowed
    #   · The official themselves (persona name match) → allowed to edit KYC / bank / address / contact
    is_admin = x_role_id in _ADMIN_ROLES
    is_owning_body = x_body_code and doc.get("body_id") == x_body_code
    is_self = x_persona_name and x_persona_name.strip().lower() == (doc.get("full_name") or "").strip().lower()
    if not (is_admin or is_owning_body or is_self):
        raise HTTPException(403, "You do not have permission to edit this match official.")
    # If self-editing, do NOT allow changing role / grade / body_id / accreditation
    patch_data = payload.model_dump(exclude_unset=True)
    if is_self and not is_admin and not is_owning_body:
        for guard in ("role", "grade", "body_id", "accreditation_no", "is_active", "kyc_status", "kyc_verified_at", "kyc_verified_by"):
            patch_data.pop(guard, None)
    await db.match_officials.update_one({"id": oid}, {"$set": patch_data})
    return await db.match_officials.find_one({"id": oid}, {"_id": 0})


@api_router.delete("/match-officials/{oid}")
async def delete_official(
    oid: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _ADMIN_ROLES:
        raise HTTPException(403, "Only office bearers may remove match officials.")
    r = await db.match_officials.delete_one({"id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Match official not found")
    return {"deleted": True}
