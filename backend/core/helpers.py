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
    """Format: MPCA/YYYY/SERIAL (6-digit, zero-padded)."""
    year = datetime.now(timezone.utc).year
    count = await db.players.count_documents({"player_id": {"$regex": f"^MPCA/{year}/"}})
    return f"MPCA/{year}/{count + 1:06d}"


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
        notes.append("Guest — eligible only for guest-permitting tournaments; per-tournament cap applies.")

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
def _check_player_against_tournament(player: dict, t: dict) -> tuple[bool, List[str]]:
    """Returns (ok, [warnings])."""
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
    if player.get("status") == "Pending":
        warnings.append("Player registration is still Pending — should be approved before tournament.")
    return True, warnings


