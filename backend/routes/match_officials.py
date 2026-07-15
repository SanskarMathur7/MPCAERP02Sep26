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


@api_router.patch("/match-officials/{oid}", response_model=MatchOfficial)
async def update_official(
    oid: str,
    payload: MatchOfficialBase,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _ADMIN_ROLES:
        raise HTTPException(403, "Only office bearers may edit match officials.")
    doc = await db.match_officials.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Match official not found")
    await db.match_officials.update_one({"id": oid}, {"$set": payload.model_dump(exclude_unset=True)})
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
