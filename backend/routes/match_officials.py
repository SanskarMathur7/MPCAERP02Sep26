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

OfficialRole = Literal["Umpire", "Scorer", "Selector", "Observer", "Referee", "Manager", "Coach", "Trainer", "Physio"]
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


# ═══════════════════════════════════════════════════════════════════════════
# MPCA-133 · Central Match-Official Assignment (per-tournament, MPCA-owned)
# ═══════════════════════════════════════════════════════════════════════════
# The old "each Division picks its own umpires for its Squad" flow (which
# lived on `Squad.match_officials`) has been superseded by a central pool:
# MPCA picks umpires / scorers / referees for the whole tournament, applies
# standard per-day fees, and the DA + fees are paid centrally from MPCA
# budgets. Divisions no longer carry these costs.
STANDARD_MO_FEES_INR = {
    "Umpire":   700.0,   # ₹700 / day per BCCI panel norms
    "Scorer":   500.0,
    "Referee":  1500.0,
    "Physio":   1200.0,
}
STANDARD_MO_DA_INR = {   # per-day DA (food + local) — flat rate, MPCA-paid
    "Umpire":   500.0,
    "Scorer":   400.0,
    "Referee":  700.0,
    "Physio":   400.0,
}


class TournamentMatchOfficialBase(BaseModel):
    """MPCA-assigned match official for a full tournament (not per-fixture)."""
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    official_id: str                                   # match_officials.id
    role: str                                          # Umpire / Scorer / Referee / Physio
    days: int = 1
    per_day_fee_inr: float = 0.0                       # standard rate at assignment time
    per_day_da_inr: float = 0.0                        # standard DA at assignment time
    notes: Optional[str] = None


class TournamentMatchOfficial(TournamentMatchOfficialBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    assigned_by: Optional[str] = None
    assigned_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # ── Snapshot for display / audit ──
    official_name: Optional[str] = None
    body_id: Optional[str] = None                      # official's owning body
    # MPCA-133+ · Assignment lifecycle. Officials can Accept / Reject; MPCA
    # can re-post replacement officials for a Rejected slot. Rejected rows are
    # PRESERVED (audit trail) — not deleted.
    acceptance_status: Literal["Pending", "Accepted", "Rejected"] = "Pending"
    rejection_reason: Optional[str] = None
    responded_at: Optional[str] = None
    # Snapshot for the Match Official portal
    tournament_name: Optional[str] = None


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


# ═══════════════════════════════════════════════════════════════════════════
# MPCA-133 · Tournament-level Match-Official Assignments
# ═══════════════════════════════════════════════════════════════════════════
def _mpca_only(x_body_type: Optional[str], x_role_id: Optional[str]):
    """Central assignment is MPCA-only per MPCA-133."""
    if x_body_type and x_body_type != "State":
        raise HTTPException(403, "Only MPCA may assign match officials centrally (MPCA-133).")
    if x_role_id and x_role_id not in _ADMIN_ROLES:
        raise HTTPException(403, "Only MPCA office bearers may assign match officials.")


@api_router.get("/tournaments/{tid}/match-officials", response_model=List[TournamentMatchOfficial])
async def list_tournament_officials(tid: str):
    """MPCA-133 · List all officials assigned to this tournament."""
    if not await db.tournaments.find_one({"id": tid}, {"_id": 0}):
        raise HTTPException(404, "Tournament not found")
    return await db.tournament_match_officials.find(
        {"tournament_id": tid}, {"_id": 0}
    ).sort("assigned_at", -1).to_list(500)


@api_router.get("/match-officials/rates/standard")
async def get_standard_mo_rates():
    """MPCA-133 · Return the flat rate card (fee + DA per role per day)."""
    return {
        "fee_per_day": STANDARD_MO_FEES_INR,
        "da_per_day": STANDARD_MO_DA_INR,
        "note": "Rates are set centrally by MPCA and applied automatically on assignment.",
    }


class _TmoCreate(BaseModel):
    """Payload for POST /tournaments/{tid}/match-officials."""
    model_config = ConfigDict(extra="ignore")
    official_id: str
    role: str                                # Umpire / Scorer / Referee / Physio
    days: int = 1
    per_day_fee_inr: Optional[float] = None  # override; else standard
    per_day_da_inr: Optional[float] = None   # override; else standard
    notes: Optional[str] = None


@api_router.post("/tournaments/{tid}/match-officials", response_model=TournamentMatchOfficial)
async def assign_tournament_official(
    tid: str,
    payload: _TmoCreate,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_persona_name: Optional[str] = Header(None, alias="X-Persona-Name"),
):
    _mpca_only(x_body_type, x_role_id)
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    off = await db.match_officials.find_one({"id": payload.official_id}, {"_id": 0})
    if not off:
        raise HTTPException(404, "Match official not found")
    role = payload.role
    if role not in STANDARD_MO_FEES_INR:
        raise HTTPException(400, f"Unsupported role {role} — expected one of {list(STANDARD_MO_FEES_INR)}")
    # Standard rate resolution — override only if MPCA passes an explicit value.
    fee = payload.per_day_fee_inr if payload.per_day_fee_inr is not None else STANDARD_MO_FEES_INR[role]
    da  = payload.per_day_da_inr  if payload.per_day_da_inr  is not None else STANDARD_MO_DA_INR[role]
    tmo = TournamentMatchOfficial(
        tournament_id=tid,
        official_id=off["id"],
        role=role,
        days=max(1, int(payload.days)),
        per_day_fee_inr=float(fee),
        per_day_da_inr=float(da),
        notes=payload.notes,
        assigned_by=x_persona_name or "MPCA",
        official_name=off.get("full_name"),
        body_id=off.get("body_id"),
        tournament_name=t.get("name"),
    )
    await db.tournament_match_officials.insert_one(tmo.model_dump())
    # Notify the official (in-app) that they have a new assignment awaiting response.
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "recipient_type": "match_official",
            "recipient_id": off["id"],
            "title": f"Match Official assignment · {t.get('name')}",
            "message": f"You have been assigned as {role} for {t.get('name')} · {tmo.days} days. Please Accept or Reject.",
            "link": "/my-assignments",
            "related_type": "tournament_match_official",
            "related_id": tmo.id,
            "severity": "info",
            "kind": "assignment",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # noqa: BLE001
        pass
    return tmo


class _TmoPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    days: Optional[int] = None
    per_day_fee_inr: Optional[float] = None
    per_day_da_inr: Optional[float] = None
    notes: Optional[str] = None


@api_router.patch("/tournaments/{tid}/match-officials/{aid}", response_model=TournamentMatchOfficial)
async def update_tournament_official(
    tid: str,
    aid: str,
    payload: _TmoPatch,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
):
    _mpca_only(x_body_type, x_role_id)
    doc = await db.tournament_match_officials.find_one({"id": aid, "tournament_id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Assignment not found")
    patch = payload.model_dump(exclude_unset=True)
    if "days" in patch:
        patch["days"] = max(1, int(patch["days"]))
    await db.tournament_match_officials.update_one({"id": aid}, {"$set": patch})
    return await db.tournament_match_officials.find_one({"id": aid}, {"_id": 0})


@api_router.delete("/tournaments/{tid}/match-officials/{aid}")
async def remove_tournament_official(
    tid: str,
    aid: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
):
    _mpca_only(x_body_type, x_role_id)
    r = await db.tournament_match_officials.delete_one({"id": aid, "tournament_id": tid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Assignment not found")
    return {"deleted": True}


@api_router.get("/tournaments/{tid}/match-officials/summary")
async def tournament_officials_summary(tid: str):
    """MPCA-133 · Roll-up of central MPCA-paid officiating spend for a tournament.
    Divisions never see this as an expense on their budgets — it is settled
    centrally from MPCA's officiating pool.
    """
    rows = await db.tournament_match_officials.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    fee_total = sum(float(r.get("per_day_fee_inr") or 0) * int(r.get("days") or 0) for r in rows)
    da_total  = sum(float(r.get("per_day_da_inr")  or 0) * int(r.get("days") or 0) for r in rows)
    by_role: dict = {}
    for r in rows:
        rl = r.get("role") or "Other"
        b = by_role.setdefault(rl, {"count": 0, "fee_inr": 0.0, "da_inr": 0.0})
        b["count"] += 1
        b["fee_inr"] += float(r.get("per_day_fee_inr") or 0) * int(r.get("days") or 0)
        b["da_inr"]  += float(r.get("per_day_da_inr")  or 0) * int(r.get("days") or 0)
    return {
        "tournament_id": tid,
        "assignments": len(rows),
        "fee_total_inr": fee_total,
        "da_total_inr": da_total,
        "grand_total_inr": fee_total + da_total,
        "by_role": by_role,
        "paid_by": "MPCA (central pool)",
    }


# ═══════════════════════════════════════════════════════════════════════════
# MPCA-133+ · Match-Official Portal (accept / reject / my assignments)
# ═══════════════════════════════════════════════════════════════════════════
class _RejectReason(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reason: str


def _official_may_respond(
    doc: dict,
    x_persona_name: Optional[str],
    x_role_id: Optional[str],
    x_body_type: Optional[str],
) -> bool:
    """Assignment response allowed only for:
      · MPCA State-scope admins (secretary / president / treasurer with X-Body-Type=State), OR
      · The assigned official themselves (X-Persona-Name matches snapshot).
    Division / District office bearers are explicitly NOT allowed to
    respond on an official's behalf.
    """
    if x_body_type == "State" and x_role_id in {"secretary", "president", "treasurer"}:
        return True
    if x_persona_name and (doc.get("official_name") or "").strip().lower() == x_persona_name.strip().lower():
        return True
    return False


@api_router.post("/tournaments/{tid}/match-officials/{aid}/accept", response_model=TournamentMatchOfficial)
async def accept_tournament_assignment(
    tid: str,
    aid: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_persona_name: Optional[str] = Header(None, alias="X-Persona-Name"),
):
    doc = await db.tournament_match_officials.find_one({"id": aid, "tournament_id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Assignment not found")
    if not _official_may_respond(doc, x_persona_name, x_role_id, x_body_type):
        raise HTTPException(403, "Only the assigned official (or MPCA state-scope admin) may respond to this assignment.")
    await db.tournament_match_officials.update_one({"id": aid}, {"$set": {
        "acceptance_status": "Accepted",
        "responded_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": None,
    }})
    return await db.tournament_match_officials.find_one({"id": aid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/match-officials/{aid}/reject", response_model=TournamentMatchOfficial)
async def reject_tournament_assignment(
    tid: str,
    aid: str,
    payload: _RejectReason,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_persona_name: Optional[str] = Header(None, alias="X-Persona-Name"),
):
    if not (payload.reason or "").strip():
        raise HTTPException(400, "A rejection reason is required.")
    doc = await db.tournament_match_officials.find_one({"id": aid, "tournament_id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Assignment not found")
    if not _official_may_respond(doc, x_persona_name, x_role_id, x_body_type):
        raise HTTPException(403, "Only the assigned official (or MPCA state-scope admin) may respond to this assignment.")
    await db.tournament_match_officials.update_one({"id": aid}, {"$set": {
        "acceptance_status": "Rejected",
        "rejection_reason": payload.reason.strip(),
        "responded_at": datetime.now(timezone.utc).isoformat(),
    }})
    # Notify MPCA so they can re-post a replacement.
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "recipient_type": "role",
            "recipient_id": "secretary",
            "title": f"Match Official rejected assignment · {doc.get('tournament_name') or doc.get('tournament_id')}",
            "message": f"{doc.get('official_name')} rejected the {doc.get('role')} slot. Reason: {payload.reason.strip()}",
            "link": f"/tournaments/{tid}",
            "related_type": "tournament_match_official",
            "related_id": aid,
            "severity": "warning",
            "kind": "info",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # noqa: BLE001
        pass
    return await db.tournament_match_officials.find_one({"id": aid}, {"_id": 0})


@api_router.get("/match-officials/me/assignments")
async def my_official_assignments(
    x_persona_name: Optional[str] = Header(None, alias="X-Persona-Name"),
):
    """Match-Official portal · list every assignment addressed to the caller.
    Match uses the persona name (case-insensitive) against `official_name` snapshot.
    """
    if not x_persona_name:
        raise HTTPException(400, "X-Persona-Name header required.")
    # Case-insensitive equality via regex anchor.
    import re as _re
    name_pat = _re.compile(f"^{_re.escape(x_persona_name.strip())}$", _re.IGNORECASE)
    rows = await db.tournament_match_officials.find(
        {"official_name": {"$regex": name_pat}}, {"_id": 0},
    ).sort("assigned_at", -1).to_list(500)
    # Enrich with computed totals
    for r in rows:
        d = int(r.get("days") or 0)
        r["fee_total_inr"] = float(r.get("per_day_fee_inr") or 0) * d
        r["da_total_inr"] = float(r.get("per_day_da_inr") or 0) * d
        r["grand_total_inr"] = r["fee_total_inr"] + r["da_total_inr"]
    return {"count": len(rows), "assignments": rows}


# ─────────────────── MPCA-219 · Sample roster seeder ───────────────────
# Idempotent: seeds ~24 officials so the tournament assignment picker has a
# realistic selection to demo the flow. Names/grades are illustrative only.

SAMPLE_OFFICIALS = [
    # ── Umpires (State + Division panel) ──
    {"full_name": "Ravi Kulkarni",    "role": "Umpire",  "grade": "BCCI_Panel",     "city": "Indore",   "state": "MP", "years_of_experience": 18},
    {"full_name": "Ashok Mehta",      "role": "Umpire",  "grade": "State_Panel",    "city": "Bhopal",   "state": "MP", "years_of_experience": 12},
    {"full_name": "Ramesh Yadav",     "role": "Umpire",  "grade": "State_Panel",    "city": "Jabalpur", "state": "MP", "years_of_experience": 10},
    {"full_name": "Rakesh Tiwari",    "role": "Umpire",  "grade": "State_Panel",    "city": "Gwalior",  "state": "MP", "years_of_experience": 9},
    {"full_name": "Suresh Malviya",   "role": "Umpire",  "grade": "Division_Panel", "city": "Ujjain",   "state": "MP", "years_of_experience": 7},
    {"full_name": "Vikram Raghuvanshi","role": "Umpire", "grade": "Division_Panel", "city": "Sagar",    "state": "MP", "years_of_experience": 6},
    {"full_name": "Nitin Chouhan",    "role": "Umpire",  "grade": "Division_Panel", "city": "Rewa",     "state": "MP", "years_of_experience": 5},
    {"full_name": "Manish Bhargava",  "role": "Umpire",  "grade": "State_Panel",    "city": "Indore",   "state": "MP", "years_of_experience": 8},
    # ── Scorers ──
    {"full_name": "Prakash Dubey",    "role": "Scorer",  "grade": "State_Panel",    "city": "Bhopal",   "state": "MP", "years_of_experience": 14},
    {"full_name": "Sanjay Verma",     "role": "Scorer",  "grade": "State_Panel",    "city": "Indore",   "state": "MP", "years_of_experience": 11},
    {"full_name": "Deepak Shukla",    "role": "Scorer",  "grade": "Division_Panel", "city": "Jabalpur", "state": "MP", "years_of_experience": 6},
    {"full_name": "Anil Patel",       "role": "Scorer",  "grade": "Division_Panel", "city": "Ujjain",   "state": "MP", "years_of_experience": 4},
    # ── Selectors (senior ex-players / talent-scout panel) ──
    {"full_name": "Vinod Chouhan",    "role": "Selector","grade": "State_Panel",    "city": "Indore",   "state": "MP", "years_of_experience": 20},
    {"full_name": "Naresh Solanki",   "role": "Selector","grade": "State_Panel",    "city": "Bhopal",   "state": "MP", "years_of_experience": 18},
    {"full_name": "Sunil Joshi",      "role": "Selector","grade": "BCCI_Panel",     "city": "Ratlam",   "state": "MP", "years_of_experience": 22},
    # ── Observers (BCCI reps / MPCA senior figures) ──
    {"full_name": "Deepak Jain",      "role": "Observer","grade": "BCCI_Panel",     "city": "Indore",   "state": "MP", "years_of_experience": 25},
    {"full_name": "Amitabh Vijayvargiya","role": "Observer","grade": "State_Panel", "city": "Bhopal",   "state": "MP", "years_of_experience": 19},
    {"full_name": "Rajkumar Sharma",  "role": "Observer","grade": "State_Panel",    "city": "Jabalpur", "state": "MP", "years_of_experience": 15},
    # ── Referees ──
    {"full_name": "Ajay Ratnakar",    "role": "Referee", "grade": "BCCI_Panel",     "city": "Indore",   "state": "MP", "years_of_experience": 21},
    {"full_name": "Mahesh Nagar",     "role": "Referee", "grade": "State_Panel",    "city": "Gwalior",  "state": "MP", "years_of_experience": 13},
    # ── Physios ──
    {"full_name": "Dr. Rahul Agarwal","role": "Physio",  "grade": "State_Panel",    "city": "Bhopal",   "state": "MP", "years_of_experience": 8},
    {"full_name": "Dr. Priya Sinha",  "role": "Physio",  "grade": "State_Panel",    "city": "Indore",   "state": "MP", "years_of_experience": 6},
]


async def seed_match_officials() -> dict:
    """Idempotent · adds sample match officials only if they don't already exist
    (matched by full_name + role). Safe to call on every startup."""
    created = 0
    for row in SAMPLE_OFFICIALS:
        exists = await db.match_officials.find_one(
            {"full_name": row["full_name"], "role": row["role"]},
            {"_id": 0, "id": 1},
        )
        if exists:
            continue
        off = MatchOfficial(**row)
        await db.match_officials.insert_one(off.model_dump())
        created += 1
    return {"created": created, "total_sample": len(SAMPLE_OFFICIALS)}
