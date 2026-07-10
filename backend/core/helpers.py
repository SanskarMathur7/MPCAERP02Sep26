"""Shared helpers: notifications, claim decorators, scoring, ID generators."""
from datetime import datetime, timezone, timedelta
from datetime import timedelta as _td  # alias used by _decorate_claim + fairplay scoring
from typing import List, Optional
from fastapi import HTTPException
from core.infra import db
from models import (
    Notification, ApprovalStep, MemberCategory,
    ProcurementMethod, ClaimStatus, PlayerCreate,
)

CATEGORY_PREFIX = {
    "Individual": "IND",
    "Institutional": "INS",
    "Honorary": "HON",
    "Patron": "PAT",
}


async def next_uid(category: MemberCategory) -> str:
    prefix = CATEGORY_PREFIX[category]
    count = await db.members.count_documents({"category": category})
    return f"MPCA-{prefix}-{count + 1:04d}"


# MoM (Feb 2026) — TAT agreed at 2 days (48 hours) uniformly across stages.
# Earlier provisional ladder (14/7/5/3/5 days) replaced.
SLA_HOURS_BY_STATUS: dict = {
    "Draft": 2 * 24,
    "Submitted": 2 * 24,
    "Division_Recommended": 2 * 24,
    "MPCA_Sanctioned": 2 * 24,
    "Returned": 2 * 24,
}


async def _create_notification(
    recipient_role_id: str,
    recipient_body_id: str,
    title: str,
    message: str,
    *,
    link: Optional[str] = None,
    related_type: Optional[str] = None,
    related_id: Optional[str] = None,
    severity: str = "info",
    kind: str = "claim_event",
) -> None:
    n = Notification(
        recipient_role_id=recipient_role_id,
        recipient_body_id=recipient_body_id,
        title=title,
        message=message,
        link=link,
        related_type=related_type,
        related_id=related_id,
        severity=severity,
        kind=kind,
    )
    await db.notifications.insert_one(n.model_dump())


# ---- _procurement_method_for ----
def _procurement_method_for(amount: float) -> ProcurementMethod:
    if amount < 100_000:
        return "Direct"
    if amount <= 1_000_000:
        return "Three_Quote"
    if amount <= 7_500_000:
        return "Three_Quote"          # 3 quotes still required, plus committee approval
    return "QCBS"                     # >75L


# ---- _next_meeting_no ----
def _next_meeting_no(meeting_type: str, count: int) -> str:
    year = datetime.now(timezone.utc).year
    prefix = {"AGM": "AGM", "SGM": "SGM", "Committee": "MC", "Sub_Committee": "SC"}[meeting_type]
    return f"{prefix}-{year}-{count + 1:03d}"



# ---- _next_invoice_no ----
async def _next_invoice_no() -> str:
    year = datetime.now(timezone.utc).year
    count = await db.fee_invoices.count_documents({})
    return f"MPCA-FEE-{year}-{count + 1:04d}"



# ---- _next_claim_no ----
async def _next_claim_no(cycle: str) -> str:
    count = await db.claims.count_documents({"fiscal_cycle": cycle})
    return f"CLM-{cycle}-{count + 1:03d}"



# ---- _resolve_parent_body ----
async def _resolve_parent_body(body_id: str) -> Optional[str]:
    body = await db.bodies.find_one({"code": body_id}, {"_id": 0, "parent_code": 1})
    return body.get("parent_code") if body else None



# ---- _append_step ----
def _append_step(claim_doc: dict, step: ApprovalStep, new_status: ClaimStatus) -> dict:
    chain = claim_doc.get("approval_chain", []) or []
    chain.append(step.model_dump())
    return {
        "approval_chain": chain,
        "status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

# ---- fairplay scoring helpers ----
def _utilization_score(disbursed: float, allocation: float) -> float:
    """0–100. Sweet spot is 60–90 % utilization.
    Below 60 → linear penalty (0 % → 0 score).
    Above 90 → linear penalty (110 %+ → 0 score)."""
    if not allocation or allocation <= 0:
        return 0.0
    ratio = (disbursed / allocation) * 100
    if 60 <= ratio <= 90:
        return 100.0
    if ratio < 60:
        return max(0.0, (ratio / 60.0) * 100.0)
    # ratio > 90
    if ratio >= 110:
        return 0.0
    return max(0.0, ((110 - ratio) / 20.0) * 100.0)


async def _division_score(division: dict) -> dict:
    div_code = division["code"]

    # ---- Scope = the division itself + all its child districts ----
    descendant_dists = await db.bodies.find(
        {"parent_code": div_code, "body_type": "District"},
        {"_id": 0, "code": 1},
    ).to_list(200)
    scope_codes = [div_code] + [d["code"] for d in descendant_dists]
    claim_q = {"body_id": {"$in": scope_codes}}

    # ---- Financial signals ----
    all_claims = await db.claims.find(claim_q, {"_id": 0}).to_list(1000)
    disbursed_total = 0.0
    overdue_count = 0
    ai_rejected = 0
    ai_evaluated = 0
    now = datetime.now(timezone.utc)
    from datetime import timedelta as _td
    for c in all_claims:
        if c.get("status") == "Disbursed":
            disbursed_total += float(c.get("approved_amount_inr") if c.get("approved_amount_inr") is not None else c.get("amount_inr") or 0)
        if c.get("ai_decision"):
            ai_evaluated += 1
            if c["ai_decision"] == "AUTO_REJECT":
                ai_rejected += 1
        sla_h = SLA_HOURS_BY_STATUS.get(c.get("status"))
        if sla_h:
            chain = c.get("approval_chain") or []
            anchor = chain[-1].get("timestamp") if chain else c.get("created_at")
            if anchor:
                try:
                    anchor_dt = datetime.fromisoformat(anchor.replace("Z", "+00:00"))
                    if now > anchor_dt + _td(hours=sla_h):
                        overdue_count += 1
                except Exception:
                    pass

    allocation = float(division.get("annual_grant_inr") or 0)
    util_score = _utilization_score(disbursed_total, allocation)
    overdue_penalty = min(45, overdue_count * 15)
    reject_rate = (ai_rejected / ai_evaluated * 100) if ai_evaluated > 0 else 0
    reject_penalty = 20 if reject_rate > 30 else 0
    financial_score = max(0.0, util_score - overdue_penalty - reject_penalty)

    # ---- Governance signals (scope = division-level meetings/elections/disclosures only) ----
    eighteen_months_ago = (now - _td(days=18 * 30)).isoformat()
    five_years_ago = (now - _td(days=5 * 365)).isoformat()
    cycle_start = "2025-04-01T00:00:00+00:00"

    agm_recent = await db.meetings.count_documents({
        "body_id": div_code,
        "meeting_type": {"$in": ["AGM", "Annual_General_Meeting"]},
        "scheduled_at": {"$gte": eighteen_months_ago},
    })
    election_recent = await db.elections.count_documents({
        "body_id": div_code,
        "concluded_at": {"$gte": five_years_ago},
    })
    disclosures_this_cycle = await db.disclosures.count_documents({
        "body_id": div_code,
        "created_at": {"$gte": cycle_start},
    })
    active_members = await db.members.count_documents({"body_id": div_code, "status": "Active"})

    agm_score = 35 if agm_recent > 0 else 0
    election_score = 25 if election_recent > 0 else 0
    disclosure_score = min(20, disclosures_this_cycle * 7)
    member_score = 20 if active_members >= 25 else int((active_members / 25) * 20)
    governance_score = float(agm_score + election_score + disclosure_score + member_score)

    total_score = round((financial_score + governance_score) / 2, 1)

    return {
        "code": div_code,
        "name": division.get("name"),
        "annual_grant_inr": allocation,
        "disbursed_ytd_inr": round(disbursed_total, 2),
        "utilization_pct": round((disbursed_total / allocation * 100) if allocation else 0, 1),
        "overdue_count": overdue_count,
        "ai_evaluated": ai_evaluated,
        "ai_rejected": ai_rejected,
        "agm_recent": agm_recent,
        "election_recent": election_recent,
        "disclosures_this_cycle": disclosures_this_cycle,
        "active_members": active_members,
        "financial_score": round(financial_score, 1),
        "governance_score": round(governance_score, 1),
        # Player performance — reserved for future axis (M3/M4/Players will populate this).
        "player_performance_score": None,
        "fairplay_score": total_score,
        "total_score": total_score,   # alias, kept for backwards-compat with older clients
        "components": {
            "utilization": round(util_score, 1),
            "overdue_penalty": overdue_penalty,
            "reject_penalty": reject_penalty,
            "agm": agm_score,
            "election": election_score,
            "disclosure": disclosure_score,
            "members": member_score,
        },
    }



# ---- notify helpers (claim / procurement / transfer) ----
def _recipient_for_new_status(claim_doc: dict, new_status: str):
    """Maps a claim transition to (recipient_role_id, recipient_body_id)."""
    body_id = claim_doc.get("body_id")
    parent_id = claim_doc.get("parent_body_id")
    if new_status == "Submitted":
        # If the submitter is a District, the parent (Division) sees it.
        # If the submitter is the State itself, treasurer at MPCA sees it.
        if parent_id and parent_id != "MPCA":
            return ("division-secretary", parent_id)
        return ("treasurer", "MPCA")
    if new_status == "Division_Recommended":
        return ("treasurer", "MPCA")
    if new_status == "MPCA_Sanctioned":
        return ("treasurer", "MPCA")     # self-reminder to disburse
    if new_status in ("Disbursed", "Rejected", "Returned"):
        return ("district-secretary", body_id)
    return None


async def _notify_for_claim(claim_doc: dict, new_status: str, actor_name: Optional[str]) -> None:
    target = _recipient_for_new_status(claim_doc, new_status)
    if not target:
        return
    role_id, body_id = target
    title_map = {
        "Submitted": f"New claim from {claim_doc.get('body_id')} awaits your recommendation",
        "Division_Recommended": "Claim recommended by Division — awaits MPCA sanction",
        "MPCA_Sanctioned": "Claim sanctioned — pending disbursement",
        "Disbursed": "Your claim has been disbursed",
        "Rejected": "Your claim was rejected",
        "Returned": "Your claim was returned for clarification",
    }
    severity_map = {"Rejected": "critical", "Returned": "warning"}
    msg = (
        f"{claim_doc.get('claim_no')} · {claim_doc.get('title')} · "
        f"₹{(claim_doc.get('amount_inr') or 0):,.0f}"
    )
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=body_id,
        title=title_map.get(new_status, new_status),
        message=msg,
        link="/claims",
        related_type="claim",
        related_id=claim_doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )


# ---- Step 2b · Notifications for Procurement (Phase III.8 module)
def _recipient_for_procurement(pr_doc: dict, new_status: str):
    body_id = pr_doc.get("body_id") or "MPCA"
    if new_status == "Awarded":
        # Vendor selected — notify Treasurer (so they expect a claim shortly)
        return ("treasurer", "MPCA")
    if new_status == "Linked_To_Claim":
        return ("treasurer", "MPCA")
    if new_status in ("Closed", "Cancelled"):
        # Originator (Secretary at the procuring body) hears the outcome
        prefix = body_id.split("-", 1)[0]
        if prefix == "DIST":
            return ("district-secretary", body_id)
        if prefix == "DIV":
            return ("division-secretary", body_id)
        return ("secretary", "MPCA")
    return None


async def _notify_for_procurement(pr_doc: dict, new_status: str, actor_name: Optional[str]) -> None:
    target = _recipient_for_procurement(pr_doc, new_status)
    if not target:
        return
    role_id, target_body = target
    title_map = {
        "Awarded": f"Procurement awarded by {pr_doc.get('body_id')} — claim expected",
        "Linked_To_Claim": "Procurement linked to a Grant Claim",
        "Closed": "Procurement closed",
        "Cancelled": "Procurement cancelled",
    }
    severity_map = {"Cancelled": "warning"}
    msg = (
        f"{pr_doc.get('pr_no')} · {pr_doc.get('title')} · "
        f"₹{(pr_doc.get('awarded_amount_inr') or pr_doc.get('estimated_amount_inr') or 0):,.0f}"
    )
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=target_body,
        title=title_map.get(new_status, f"Procurement: {new_status}"),
        message=msg,
        link="/procurement",
        related_type="procurement",
        related_id=pr_doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )


# ---- Step 2b · Notifications for Player Transfer NOC
def _recipient_for_transfer(tr_doc: dict, new_status: str):
    """Each NOC stage hands off to a different body's secretary."""
    from_body = tr_doc.get("from_body_id")
    to_body = tr_doc.get("to_body_id")

    def _role(body_id: Optional[str]):
        if not body_id:
            return None
        prefix = body_id.split("-", 1)[0]
        if prefix == "DIST":
            return ("district-secretary", body_id)
        if prefix == "DIV":
            return ("division-secretary", body_id)
        return ("secretary", body_id)

    if new_status == "From_Body_Approved":
        # Releasing body signed → notify receiving body
        return _role(to_body)
    if new_status == "To_Body_Approved":
        # Receiving body signed → notify MPCA secretary for final
        return ("secretary", "MPCA")
    if new_status == "MPCA_Approved":
        # MPCA signed → notify both bodies (we'll send 1 — to receiving body)
        return _role(to_body)
    if new_status == "Completed":
        return _role(from_body)
    if new_status == "Rejected":
        return _role(from_body)
    return None


async def _notify_for_transfer(tr_doc: dict, new_status: str, actor_name: Optional[str]) -> None:
    target = _recipient_for_transfer(tr_doc, new_status)
    if not target:
        return
    role_id, target_body = target
    title_map = {
        "From_Body_Approved": f"Player NOC released by {tr_doc.get('from_body_id')} — awaits your acceptance",
        "To_Body_Approved": "Player NOC accepted by receiving body — awaits MPCA approval",
        "MPCA_Approved": "Player NOC approved by MPCA — pending completion",
        "Completed": f"Player transfer to {tr_doc.get('to_body_id')} is complete",
        "Rejected": "Player NOC was rejected",
    }
    severity_map = {"Rejected": "critical"}
    msg = f"{tr_doc.get('noc_no')} · Reason: {(tr_doc.get('reason') or '')[:60]}"
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=target_body,
        title=title_map.get(new_status, new_status),
        message=msg,
        link="/players",
        related_type="transfer",
        related_id=tr_doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )



# ---- _decorate_claim ----
def _decorate_claim(doc: dict) -> dict:
    """Add derived `due_at` and `is_overdue` based on SLA + last action timestamp."""
    if not doc:
        return doc
    status = doc.get("status")
    sla_h = SLA_HOURS_BY_STATUS.get(status)
    if not sla_h or status in ("Disbursed", "Rejected"):
        doc["due_at"] = None
        doc["is_overdue"] = False
        return doc
    chain = doc.get("approval_chain") or []
    anchor = chain[-1].get("timestamp") if chain else doc.get("created_at")
    anchor_dt = None
    if anchor:
        try:
            anchor_dt = datetime.fromisoformat(anchor.replace("Z", "+00:00"))
        except Exception:
            anchor_dt = None
    if not anchor_dt:
        doc["due_at"] = None
        doc["is_overdue"] = False
        return doc
    due_dt = anchor_dt + _td(hours=sla_h)
    doc["due_at"] = due_dt.isoformat()
    doc["is_overdue"] = datetime.now(timezone.utc) > due_dt
    return doc



# ---- _next_pr_no ----
async def _next_pr_no(cycle: str) -> str:
    count = await db.procurement_requests.count_documents({"fiscal_cycle": cycle})
    return f"PR-{cycle}-{count + 1:03d}"


# ---- player helpers ----
async def _next_player_id() -> str:
    """Format: MPCA/YYYY/SERIAL (6-digit, zero-padded). Legacy internal id."""
    year = datetime.now(timezone.utc).year
    count = await db.players.count_documents({"player_id": {"$regex": f"^MPCA/{year}/"}})
    return f"MPCA/{year}/{count + 1:06d}"


def _new_player_display_id(dob_iso: str, first_reg_year: int, serial: int) -> str:
    """M1-A player display id — YYYY/DD-MM-YY/SERIAL.
    YYYY = year of first registration.
    DD-MM-YY = date-of-birth in dd-mm-yy.
    SERIAL = zero-padded 4-digit sequence.
    """
    try:
        d = datetime.strptime(dob_iso, "%Y-%m-%d")
        dob_slug = d.strftime("%d-%m-%y")
    except Exception:
        dob_slug = "00-00-00"
    return f"{first_reg_year}/{dob_slug}/{serial:04d}"


async def _next_player_display_serial(first_reg_year: int) -> int:
    """Serial counter within a first-registration year."""
    count = await db.players.count_documents({"first_registration_year": first_reg_year})
    return count + 1


def _derive_division_folder(body_id: str) -> Optional[str]:
    """DIST-XXX-YYY  ⇒  DIV-YYY.  For a DIV-YYY already, returns as-is."""
    if not body_id:
        return None
    if body_id.startswith("DIV-"):
        return body_id
    if body_id.startswith("DIST-"):
        # last 3 chars after final dash → DIV code
        return f"DIV-{body_id.split('-')[-1]}"
    return None


def _age_years(dob: str) -> int:
    """Compute integer age from ISO date string (YYYY-MM-DD)."""
    try:
        d = datetime.strptime(dob, "%Y-%m-%d")
    except Exception:
        return 0
    today = datetime.now(timezone.utc)
    yrs = today.year - d.year
    if (today.month, today.day) < (d.month, d.day):
        yrs -= 1
    return yrs


def _validate_eligibility(p: PlayerCreate) -> tuple[bool, List[str]]:
    """Encodes the Player Rules tab. Returns (ok, [notes])."""
    notes: List[str] = []
    age = _age_years(p.date_of_birth)
    notes.append(f"Computed age: {age} years.")
    if age < 12:
        notes.append("Below the MPCA minimum playing age of 12 — registration permitted but eligibility for senior categories restricted.")
    if age > 60:
        notes.append("Above 60 — registration permitted for veterans/coaches stream only.")

    # Residency window (M1-B): 3 months if MP-local, 1 year if out-of-MP.
    if getattr(p, "residency_since", None):
        try:
            since = datetime.strptime(p.residency_since, "%Y-%m-%d")
            days = (datetime.now(timezone.utc) - since.replace(tzinfo=timezone.utc)).days
            required = 90 if (p.domicile_state or "").lower() == "madhya pradesh" else 365
            notes.append(f"Residency since {p.residency_since} → {days} days (min {required} required).")
            if days < required:
                notes.append(f"⚠ Residency below minimum ({days}/{required} days).")
        except Exception:
            notes.append("⚠ residency_since could not be parsed.")

    # Category-specific
    if p.category == "Local_MP":
        if p.domicile_state and p.domicile_state.lower() != "madhya pradesh":
            return False, notes + [
                f"Category 'Local_MP' requires MP domicile, but domicile_state is '{p.domicile_state}'. "
                "Switch category to 'Born_Outside' or update domicile."
            ]
        notes.append("Local-MP — full eligibility across MPCA tournaments.")
    elif p.category == "Born_Outside":
        notes.append("Born-Outside MP — eligible after 5 years of continuous MP residency (Plan §Player Rules).")
        if not p.address_district:
            notes.append("⚠ Address district missing — required to evidence residency.")
    else:  # Guest
        if not p.tw3_verified:
            return False, notes + [
                "Guest players require TW3 maturity verification (Plan §Player Rules). "
                "Set tw3_verified=true once the panel has cleared the player."
            ]
        # M1-C: enforce guest_subtype + disclosure
        sub = getattr(p, "guest_subtype", None)
        if not sub:
            return False, notes + ["Guest category requires guest_subtype (Education / MP_Domicile_Junior / MP_Domicile_Senior / Out_Of_MP_Senior)."]
        if not getattr(p, "guest_disclosure_signed", False):
            return False, notes + ["Guest disclosure form must be signed before registration is accepted."]
        notes.append(f"Guest ({sub}) — eligible only for guest-permitting tournaments; team quota applies.")

    # M1-A: court order flag — advisory only
    if getattr(p, "court_order_flag", False):
        notes.append(f"⚑ Court-order participation flag set (ref: {p.court_order_ref or '—'}).")

    # Identity essentials
    if not p.contact_phone and not p.guardian_phone:
        notes.append("⚠ Neither contact_phone nor guardian_phone provided — registration accepted but please update.")

    return True, notes


# ---- _next_noc_no ----
async def _next_noc_no(cycle: str) -> str:
    count = await db.transfer_requests.count_documents({"fiscal_cycle": cycle})
    return f"NOC-{cycle}-{count + 1:03d}"



# ---- _next_tournament_no ----
async def _next_tournament_no(cycle: str) -> str:
    count = await db.tournaments.count_documents({"fiscal_cycle": cycle})
    return f"TRN-{cycle}-{count + 1:03d}"



# ---- _check_player_against_tournament ----
# M1-C guest quotas per squad:
GUEST_QUOTA_PER_SQUAD = {
    "Education":              {"total": 1},  # max 1 per team
    "MP_Domicile_Junior":     {"total": 3},
    "MP_Domicile_Senior":     {"total": 2},
    "Out_Of_MP_Senior":       {"total": 1},
}


def _check_player_against_tournament(player: dict, t: dict, existing_squad_members: Optional[List[dict]] = None) -> tuple[bool, List[str]]:
    """Returns (ok, [warnings]).
    If `existing_squad_members` is provided, M1-C guest sub-type quotas are enforced.
    """
    warnings: List[str] = []
    age = _age_years(player.get("date_of_birth") or "")
    if t.get("age_cap_years") and age > t["age_cap_years"]:
        return False, [f"Player age {age} exceeds tournament cap of U-{t['age_cap_years']}."]
    if t.get("age_floor_years") and age < t["age_floor_years"]:
        return False, [f"Player age {age} below tournament floor of {t['age_floor_years']}."]
    if player.get("category") == "Guest" and not t.get("allows_guests"):
        return False, [f"Tournament '{t['name']}' does not permit Guest-category players."]
    if player.get("status") in ("Suspended", "Banned"):
        return False, [f"Player is currently {player['status']} and cannot be selected."]
    if player.get("status") in ("Pending", "Under_Division_Review", "Discrepancy_Raised"):
        warnings.append(f"Player status is {player['status']} — should be Division/MPCA approved before match.")

    # M1-C · Guest sub-type team quotas
    if player.get("category") == "Guest" and existing_squad_members is not None:
        sub = player.get("guest_subtype")
        if not sub:
            return False, ["Guest player is missing guest_subtype — cannot enforce quota."]
        # count existing guests already in squad by sub-type
        already = [m for m in existing_squad_members if m.get("guest_subtype") == sub]
        quota = GUEST_QUOTA_PER_SQUAD.get(sub, {}).get("total", 0)
        if len(already) >= quota:
            return False, [f"Guest quota exceeded for '{sub}' — max {quota} per squad."]
    return True, warnings


# ---- fixture helpers ----
async def _next_fixture_no(cycle: str) -> str:
    count = await db.fixtures.count_documents({"fixture_no": {"$regex": f"^FX-{cycle}-"}})
    return f"FX-{cycle}-{count + 1:04d}"


