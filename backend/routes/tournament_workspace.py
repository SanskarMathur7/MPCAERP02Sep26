"""
Sprint M19 · Tournament Workspace Routes
─────────────────────────────────────────
Consolidates the "Tournament Detail Workspace" APIs:

  • GET/POST/PATCH/DELETE /tournaments/{tid}/matches   — fixture generator
  • GET/POST/DELETE       /tournaments/{tid}/receipts  — MPCA bank receipts logged against a tournament
  • PATCH                 /tournaments/{tid}/input-variables
  • PATCH                 /tournaments/{tid}/calendar-lock
  • GET                   /tournaments/{tid}/progress          (5-phase derivation)
  • GET                   /tournaments/{tid}/financial-summary
  • POST                  /tournaments/{tid}/closure-letter    (generates a plain-text placeholder)
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import uuid

from fastapi import HTTPException, Header
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router
from core.wiring_guard import assert_wiring_owner, stamp_actor


# ─────────────────────────── Match Fixtures ───────────────────────────

class TournamentMatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tournament_id: str
    match_no: int
    stage: str = "League"                       # League | Quarter_Final | Semi_Final | Final | Practice
    match_date: Optional[str] = None            # ISO YYYY-MM-DD — start date (from_date)
    start_time: Optional[str] = None            # HH:MM (24h)
    home_team: str
    away_team: str
    venue_name: Optional[str] = None
    ground_name: Optional[str] = None
    result: Optional[str] = None                # free-text result note when completed
    notes: Optional[str] = None
    ground_id: Optional[str] = None             # MPCA-232 · link to Ground.id (venue picker)
    # MPCA-217 · Days-engine fields — feed the unified budget compute engine.
    days: int = 1                               # scheduled days (span). 1 for LO, 3/4/5 for Multi-Day.
    actual_days: Optional[int] = None           # early-finish override; blank = play the full span
    nmd_manual: Optional[int] = None            # override auto-derived NMD (blank = calendar-derived)
    other_pax: int = 0                          # VIPs / ground staff counted in AllPax driver
    pool_id: Optional[str] = None               # mirrors setup_meta.division_pools/district_pools id
    format: Optional[str] = None                # per-match format override (defaults to tournament.format)
    officials_ids: Optional[Dict[str, List[str]]] = None   # {umpires:[], scorers:[], selectors:[], observers:[]}
    # MPCA-218 · Utility-parity fields — allow inline card editor
    label: Optional[str] = None                 # display label (e.g. "League R1", "SF-1")
    squad: Optional[int] = None                 # per-match squad size override (blank = tournament default)
    to_date: Optional[str] = None               # explicit end date (else derived from match_date + days - 1)
    # MPCA-222 · Editable driver overrides per budget head (utility-parity).
    # Shape: {head_key: qty_override}. Blank/missing = compute from formula.
    driver_overrides: Optional[Dict[str, int]] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentMatchCreate(BaseModel):
    stage: str = "League"
    match_date: Optional[str] = None
    start_time: Optional[str] = None
    home_team: str
    away_team: str
    venue_name: Optional[str] = None
    ground_name: Optional[str] = None
    notes: Optional[str] = None
    ground_id: Optional[str] = None             # MPCA-232 · venue picker
    # MPCA-217 · Days-engine
    days: int = 1
    actual_days: Optional[int] = None
    nmd_manual: Optional[int] = None
    other_pax: int = 0
    pool_id: Optional[str] = None
    format: Optional[str] = None
    officials_ids: Optional[Dict[str, List[str]]] = None
    # MPCA-218 · Utility-parity
    label: Optional[str] = None
    squad: Optional[int] = None
    to_date: Optional[str] = None
    # MPCA-222 · Editable driver overrides per budget head
    driver_overrides: Optional[Dict[str, int]] = None


class TournamentMatchPatch(BaseModel):
    stage: Optional[str] = None
    match_date: Optional[str] = None
    start_time: Optional[str] = None
    home_team: Optional[str] = None
    away_team: Optional[str] = None
    venue_name: Optional[str] = None
    ground_name: Optional[str] = None
    result: Optional[str] = None
    notes: Optional[str] = None
    ground_id: Optional[str] = None             # MPCA-232 · venue picker
    # MPCA-217 · Days-engine
    days: Optional[int] = None
    actual_days: Optional[int] = None
    nmd_manual: Optional[int] = None
    other_pax: Optional[int] = None
    pool_id: Optional[str] = None
    format: Optional[str] = None
    officials_ids: Optional[Dict[str, List[str]]] = None
    # MPCA-218 · Utility-parity
    label: Optional[str] = None
    squad: Optional[int] = None
    to_date: Optional[str] = None
    # MPCA-222 · Editable driver overrides per budget head
    driver_overrides: Optional[Dict[str, int]] = None


@api_router.get("/tournaments/{tid}/matches", response_model=List[TournamentMatch])
async def list_tournament_matches(tid: str):
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    docs = await db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}).sort([("match_date", 1), ("match_no", 1)]).to_list(500)
    return docs


@api_router.get("/matches", response_model=List[TournamentMatch])
async def list_all_matches(
    fiscal_cycle: Optional[str] = None,
    month: Optional[str] = None,        # e.g. "2026-04"
):
    """M38f · Global match feed for the Tournament Calendar tab so individual
    match fixtures added inside a tournament's Match Calendar appear
    alongside the tournament blocks in the org-wide calendar view."""
    q: dict = {}
    if fiscal_cycle:
        # Look up tournaments in this cycle and filter matches by tournament_id
        tids = [t["id"] async for t in db.tournaments.find(
            {"fiscal_cycle": fiscal_cycle}, {"_id": 0, "id": 1},
        )]
        q["tournament_id"] = {"$in": tids}
    if month and len(month) == 7:      # "YYYY-MM"
        q["match_date"] = {"$regex": f"^{month}"}
    docs = await db.tournament_matches.find(q, {"_id": 0}).sort([("match_date", 1), ("start_time", 1)]).to_list(2000)
    return docs




@api_router.post("/tournaments/{tid}/matches", response_model=TournamentMatch)
async def create_tournament_match(
    tid: str,
    payload: TournamentMatchCreate,
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
):
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    # MPCA-243 · Ship 1 · Wiring guard for match calendar authoring.
    await assert_wiring_owner(tid, "match_calendar", x_body_type, x_body_code,
                              action_label="match creation")
    count = await db.tournament_matches.count_documents({"tournament_id": tid})
    m = TournamentMatch(tournament_id=tid, match_no=count + 1, **payload.model_dump())
    await db.tournament_matches.insert_one(m.model_dump())
    return m


@api_router.patch("/tournaments/{tid}/matches/{mid}", response_model=TournamentMatch)
async def patch_tournament_match(
    tid: str, mid: str, patch: TournamentMatchPatch,
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
):
    await assert_wiring_owner(tid, "match_calendar", x_body_type, x_body_code,
                              action_label="match edit")
    updates = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if updates:
        r = await db.tournament_matches.update_one({"id": mid, "tournament_id": tid}, {"$set": updates})
        if r.matched_count == 0:
            raise HTTPException(404, "Match not found")
    return await db.tournament_matches.find_one({"id": mid, "tournament_id": tid}, {"_id": 0})


@api_router.delete("/tournaments/{tid}/matches/{mid}")
async def delete_tournament_match(
    tid: str, mid: str,
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
):
    await assert_wiring_owner(tid, "match_calendar", x_body_type, x_body_code,
                              action_label="match delete")
    r = await db.tournament_matches.delete_one({"id": mid, "tournament_id": tid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Match not found")
    return {"deleted": True}


# ───────────────────────────── Receipts (MPCA → Tournament) ─────────────────────────────

class TournamentReceipt(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tournament_id: str
    participant_body_code: Optional[str] = None  # M26 · attach receipt to a participant row
    receipt_no: str
    receipt_date: str                            # ISO YYYY-MM-DD
    amount_inr: float
    mode: str = "NEFT"                           # NEFT | RTGS | Cheque | Cash
    reference_no: Optional[str] = None           # UTR / cheque no
    linked_claim_id: Optional[str] = None
    remarks: Optional[str] = None
    recorded_by_name: Optional[str] = None
    recorded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentReceiptCreate(BaseModel):
    participant_body_code: Optional[str] = None
    receipt_date: str
    amount_inr: float
    mode: str = "NEFT"
    reference_no: Optional[str] = None
    linked_claim_id: Optional[str] = None
    remarks: Optional[str] = None
    recorded_by_name: Optional[str] = None


@api_router.get("/tournaments/{tid}/receipts", response_model=List[TournamentReceipt])
async def list_tournament_receipts(tid: str):
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    docs = await db.tournament_receipts.find({"tournament_id": tid}, {"_id": 0}).sort([("receipt_date", -1)]).to_list(200)
    return docs


@api_router.post("/tournaments/{tid}/receipts", response_model=TournamentReceipt)
async def create_tournament_receipt(tid: str, payload: TournamentReceiptCreate):
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    count = await db.tournament_receipts.count_documents({"tournament_id": tid})
    body = payload.model_dump()
    # M26 Phase B · derive participant_body_code from linked claim if not supplied
    if not body.get("participant_body_code") and body.get("linked_claim_id"):
        claim = await db.tournament_reimbursement_claims.find_one(
            {"id": body["linked_claim_id"]}, {"_id": 0, "participant_body_code": 1, "body_id": 1}
        )
        if claim:
            body["participant_body_code"] = claim.get("participant_body_code") or claim.get("body_id")
    r = TournamentReceipt(
        tournament_id=tid,
        receipt_no=f"MPCA-RCT-{tid[:6].upper()}-{count + 1:03d}",
        **body,
    )
    await db.tournament_receipts.insert_one(r.model_dump())
    return r


@api_router.delete("/tournaments/{tid}/receipts/{rid}")
async def delete_tournament_receipt(tid: str, rid: str):
    r = await db.tournament_receipts.delete_one({"id": rid, "tournament_id": tid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Receipt not found")
    return {"deleted": True}


# ───────────────────────────── Input Variables + Calendar Lock ─────────────────────────────

class InputVariablesPayload(BaseModel):
    input_variables: Dict[str, Any]


@api_router.patch("/tournaments/{tid}/input-variables")
async def patch_input_variables(tid: str, payload: InputVariablesPayload):
    r = await db.tournaments.update_one({"id": tid}, {"$set": {"input_variables": payload.input_variables}})
    if r.matched_count == 0:
        raise HTTPException(404, "Tournament not found")
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


# ─────────────── M31 · Auto-Split Budget (Host vs Visitor) ───────────────
#
# One-click generator that fans out the tournament's Input Variables into
# per-body draft budgets. Host body → full hosting scheme allocation
# (grounds, kit, officials, players). Visitor bodies → travel + DA + stay
# subsidy only (they don't pay for the ground). Existing draft/approved
# budgets for a (tournament, body) pair are preserved.

_VISITOR_HEAD_KEYWORDS = (
    "travel", " ta ", " da ", "food", "stay", "hotel", "lodging",
    "boarding", "meal", "conveyance", "transport", "contingency",
)


def _is_visitor_head(head_label: str) -> bool:
    label = f" {head_label.lower()} "
    return any(k in label for k in _VISITOR_HEAD_KEYWORDS)


@api_router.post("/tournaments/{tid}/budget/auto-split")
async def auto_split_budget(tid: str):
    from models import TournamentBudget
    from routes.tournament_participations import link_budget_to_participant

    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    input_vars = t.get("input_variables") or {}
    if not input_vars:
        raise HTTPException(400, "Set the Input Variables before running Auto-Split. MPCA action pending.")
    scheme_code = t.get("scheme_code")
    if not scheme_code:
        raise HTTPException(400, "No scheme_code on tournament — Auto-Split requires an auto-budget scheme (not manual actuals).")
    cycle = t.get("fiscal_cycle") or "2025-26"

    # Compute the full scheme allocation once
    from routes.scheme_calc import compute_budget, ComputeRequest
    preview = await compute_budget(scheme_code, ComputeRequest(inputs=input_vars))
    full_heads = preview.get("head_allocations") or []
    if not full_heads:
        raise HTTPException(422, "Scheme returned zero heads — check input variables and rate card.")

    visitor_heads = [h for h in full_heads if _is_visitor_head(h["head"])]
    if not visitor_heads:
        # Fall back — give visitors just the top travel/DA-ish head or a stubbed one
        visitor_heads = [{"head": "Team Travel Subsidy", "limit_inr": round(preview.get("total_ceiling_inr", 0) * 0.20, 2), "formula": "20% of total ceiling (fallback)"}]

    # Fetch participants (accepted only, non-removed)
    participants = await db.tournament_participations.find({
        "tournament_id": tid,
        "removed_at": None,
        "acceptance_status": {"$in": ["Accepted", "Pending"]},  # include Pending so budgets are ready
    }, {"_id": 0}).to_list(200)

    if not participants:
        raise HTTPException(400, "No accepted participants on this tournament. Add participants via the Participants Matrix first.")

    async def _budget_no() -> str:
        count = await db.tournament_budgets.count_documents({"fiscal_cycle": cycle})
        return f"TB-{cycle}-{count + 1:03d}"

    created: List[dict] = []
    skipped: List[dict] = []

    for p in participants:
        body_code = p.get("body_code")
        role = p.get("role", "Visitor")
        # Skip if a live budget already exists for this (tournament, body, cycle)
        existing = await db.tournament_budgets.find_one({
            "tournament_id": tid,
            "body_id": body_code,
            "fiscal_cycle": cycle,
            "status": {"$in": ["Draft", "Submitted", "Approved", "Returned"]},
        }, {"_id": 0})
        if existing:
            skipped.append({"body_code": body_code, "role": role, "budget_no": existing.get("budget_no"), "reason": "budget exists"})
            continue

        heads_for_this = full_heads if role == "Host" else visitor_heads
        head_allocs = [{"head": h["head"], "limit_inr": float(h["limit_inr"]), "spent_inr": 0.0, "notes": h.get("formula")} for h in heads_for_this]
        total = round(sum(h["limit_inr"] for h in head_allocs), 2)

        body = await db.bodies.find_one({"code": body_code}, {"_id": 0})
        tb = TournamentBudget(
            budget_no=await _budget_no(),
            tournament_id=tid,
            tournament_name=t.get("name"),
            body_id=body_code,
            body_name=(body or {}).get("name", body_code),
            fiscal_cycle=cycle,
            head_allocations=head_allocs,
            total_ceiling_inr=total,
            status="Draft",
            notes=(f"Auto-split · {role} allocation · {scheme_code} · {len(head_allocs)} heads · "
                   f"₹{total:,.0f}"),
            participant_body_code=body_code,
        )
        await db.tournament_budgets.insert_one(tb.model_dump())
        await link_budget_to_participant(tid, body_code, tb.id)
        created.append({
            "budget_id": tb.id,
            "budget_no": tb.budget_no,
            "body_code": body_code,
            "role": role,
            "total_inr": total,
            "heads_count": len(head_allocs),
        })

    return {
        "tournament_id": tid,
        "scheme_code": scheme_code,
        "created": created,
        "skipped": skipped,
        "created_count": len(created),
        "skipped_count": len(skipped),
    }



class SetupMetaPayload(BaseModel):
    setup_meta: Dict[str, Any]


@api_router.patch("/tournaments/{tid}/setup-meta")
async def patch_setup_meta(tid: str, payload: SetupMetaPayload):
    r = await db.tournaments.update_one({"id": tid}, {"$set": {"setup_meta": payload.setup_meta}})
    if r.matched_count == 0:
        raise HTTPException(404, "Tournament not found")
    # M26 · Sync per-body participation ledger when pools change
    meta = payload.setup_meta if isinstance(payload.setup_meta, dict) else {}
    div_pools = meta.get("division_pools")
    dist_pools = meta.get("district_pools")
    if div_pools is not None or dist_pools is not None:
        from routes.tournament_participations import sync_participants_from_pools
        await sync_participants_from_pools(tid, div_pools, dist_pools)
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})



@api_router.patch("/tournaments/{tid}/calendar-lock")
async def lock_tournament_calendar(tid: str, locked: bool = True):
    r = await db.tournaments.update_one({"id": tid}, {"$set": {"calendar_fixed": locked}})
    if r.matched_count == 0:
        raise HTTPException(404, "Tournament not found")
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


# ───────────────────────────── Progress (5 phases · derived) ─────────────────────────────

def _step(key: str, label: str, done: bool, note: Optional[str] = None) -> dict:
    return {"key": key, "label": label, "done": done, "note": note}


@api_router.get("/tournaments/{tid}/progress")
async def get_tournament_progress(tid: str):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    # Fetch related state
    squads = await db.squads.find({"tournament_id": tid}, {"_id": 0}).to_list(length=200)
    budget = await db.tournament_budgets.find_one({"tournament_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
    claim = await db.reimbursement_claims.find_one({"tournament_id": tid}, {"_id": 0}, sort=[("created_at", -1)])

    receipt_total = 0.0
    async for r in db.tournament_receipts.find({"tournament_id": tid}, {"amount_inr": 1, "_id": 0}):
        receipt_total += float(r.get("amount_inr", 0) or 0)
    match_count = await db.tournament_matches.count_documents({"tournament_id": tid})

    # ── Derivations ──
    acceptance_status = (t.get("acceptance") or {}).get("status") or "Not_Required"
    accepted = acceptance_status in ("Accepted", "Not_Required")
    status = t.get("status", "Draft")

    # M31 · Multi-body squad progress. Consider a squad "selected" if it has
    # any members; "approved" only when every squad with members has been
    # signed off by MPCA (submission_status='Approved'). This handles both
    # single-body and inter-body tournaments correctly.
    squads_with_members = [s for s in squads if (s.get("members") or [])]
    squad_selected = bool(squads_with_members)
    squad_approved = bool(squads_with_members) and all(
        (s.get("submission_status") or "Draft") == "Approved" for s in squads_with_members
    )

    budget_created = budget is not None
    budget_approved = bool(budget and budget.get("status") == "Approved")

    started = status in ("In_Progress", "Completed")
    in_progress = status in ("In_Progress",)
    completed = status == "Completed"

    claim_started = claim is not None
    claim_submitted = bool(claim and claim.get("status") in ("Submitted", "Under_Review", "Approved", "Rejected"))
    claim_reviewed = bool(claim and claim.get("status") in ("Approved", "Rejected"))

    claim_approved_total = float((claim or {}).get("approved_total_inr") or 0)
    payment_done = claim_reviewed and receipt_total >= claim_approved_total and receipt_total > 0

    input_vars_set = bool(t.get("input_variables"))
    setup_meta = t.get("setup_meta") or {}
    basics_set = bool(setup_meta.get("category") and setup_meta.get("age_group"))
    teams_set = bool(
        setup_meta.get("teams")
        or setup_meta.get("pools")
        or setup_meta.get("division_pools")
        or setup_meta.get("district_pools")
        or setup_meta.get("player_group")
    )
    grounds_set = bool(setup_meta.get("grounds"))
    calendar_fixed = bool(t.get("calendar_fixed"))
    closure_letter = bool(t.get("closure_letter_generated_at"))

    phases = [
        {"key": "setup", "label": "Setup", "steps": [
            _step("created", "Tournament created", True),
            _step("basics", "Category & age group set", basics_set),
            _step("teams", "Teams / pools / player group set", teams_set),
            _step("grounds", "Grounds listed", grounds_set),
            _step("input_vars", "Input variables fixed", input_vars_set),
            _step("accepted", "Accepted by Division", accepted, note=acceptance_status),
            _step("calendar", "Calendar fixed", calendar_fixed, note=f"{match_count} matches added"),
        ]},
        {"key": "squad", "label": "Squad", "steps": [
            _step("squad_selected", "Squad selection by Division", squad_selected),
            _step("squad_approved", "Squad approved by MPCA", squad_approved),
        ]},
        {"key": "play", "label": "Play", "steps": [
            _step("budget_created", "Budget created", budget_created),
            _step("budget_approved", "Budget approved by MPCA", budget_approved),
            _step("started", "Tournament started", started),
            _step("in_progress", "In progress", in_progress),
            _step("completed", "Completed", completed),
        ]},
        {"key": "claim", "label": "Claim", "steps": [
            _step("claim_started", "Claim in progress", claim_started),
            _step("claim_submitted", "Claim submitted", claim_submitted),
            _step("claim_reviewed", "Claim reviewed by MPCA", claim_reviewed),
        ]},
        {"key": "payment", "label": "Payment", "steps": [
            _step("payment_done", "Payment done by MPCA", payment_done,
                  note=f"₹{receipt_total:,.0f} received of ₹{claim_approved_total:,.0f} approved"),
            _step("closure_letter", "Closure letter issued", closure_letter),
        ]},
    ]

    # Percent progress (done / total across all steps)
    total_steps = sum(len(p["steps"]) for p in phases)
    done_steps = sum(1 for p in phases for s in p["steps"] if s["done"])
    percent = round((done_steps / max(1, total_steps)) * 100)

    # Current phase = the first phase with a not-done step
    current_phase_key = None
    for p in phases:
        if any(not s["done"] for s in p["steps"]):
            current_phase_key = p["key"]
            break
    if current_phase_key is None:
        current_phase_key = "payment"

    return {
        "tournament_id": tid,
        "phases": phases,
        "percent": percent,
        "current_phase": current_phase_key,
    }


# ───────────────────────────── Financial Summary ─────────────────────────────

@api_router.get("/tournaments/{tid}/financial-summary")
async def tournament_financial_summary(tid: str):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    budget = await db.tournament_budgets.find_one({"tournament_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
    claim = await db.reimbursement_claims.find_one({"tournament_id": tid}, {"_id": 0}, sort=[("created_at", -1)])

    invoice_total = 0.0
    invoice_count = 0
    async for inv in db.tournament_invoices.find({"tournament_id": tid}, {"total_inr": 1, "_id": 0}):
        invoice_total += float(inv.get("total_inr", 0) or 0)
        invoice_count += 1

    extra_total = 0.0
    async for ex in db.tournament_extra_expenses.find(
        {"tournament_id": tid, "status": "Approved"}, {"approved_amount_inr": 1, "requested_amount_inr": 1, "_id": 0}
    ):
        extra_total += float(ex.get("approved_amount_inr") or ex.get("requested_amount_inr") or 0)

    da_total = 0.0
    async for da in db.match_official_da.find({"tournament_id": tid, "status": "Approved"}, {"total_da_inr": 1, "_id": 0}):
        da_total += float(da.get("total_da_inr", 0) or 0)

    receipt_total = 0.0
    async for r in db.tournament_receipts.find({"tournament_id": tid}, {"amount_inr": 1, "_id": 0}):
        receipt_total += float(r.get("amount_inr", 0) or 0)

    budget_total = float((budget or {}).get("approved_total_inr") or (budget or {}).get("total_ceiling_inr") or 0)
    claim_requested = float((claim or {}).get("total_requested_inr") or (claim or {}).get("total_claimed_inr") or 0)
    claim_approved = float((claim or {}).get("approved_total_inr") or 0)

    actual_spend = invoice_total + extra_total + da_total
    variance = budget_total - actual_spend
    outstanding = max(0.0, claim_approved - receipt_total)

    return {
        "tournament_id": tid,
        "budget": {
            "total_inr": budget_total,
            "status": (budget or {}).get("status", "None"),
            "budget_no": (budget or {}).get("budget_no"),
        },
        "actuals": {
            "invoices_inr": invoice_total,
            "invoice_count": invoice_count,
            "extras_inr": extra_total,
            "match_officials_da_inr": da_total,
            "total_spend_inr": actual_spend,
        },
        "claim": {
            "requested_inr": claim_requested,
            "approved_inr": claim_approved,
            "status": (claim or {}).get("status", "None"),
            "claim_no": (claim or {}).get("claim_no"),
        },
        "receipts": {
            "total_inr": receipt_total,
            "outstanding_inr": outstanding,
        },
        "variance_inr": variance,      # +ve = under budget, -ve = over budget
    }


# ───────────────────────────── Closure Letter ─────────────────────────────

class ClosureLetterPayload(BaseModel):
    issued_by_name: Optional[str] = None
    issued_by_post: Optional[str] = None
    additional_notes: Optional[str] = None
    force: bool = False   # M26 Phase D · bypass closure-readiness guard


@api_router.post("/tournaments/{tid}/closure-letter")
async def generate_closure_letter(
    tid: str,
    payload: ClosureLetterPayload,
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_persona_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    # MPCA-243 · Ship 1 · Wiring-driven owner guard. Closure follows the
    # `finance_console.owner` per the wiring config (BCCI/Inter-Div = MPCA,
    # District/School/Club/Camp = Division).
    owner, _cell = await assert_wiring_owner(
        tid, "finance_console", x_body_type, x_body_code,
        action_label="closure letter generation",
    )
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    # M26 Phase D · Closure guard — require every participant settled unless forced
    active_participants = await db.tournament_participations.count_documents(
        {"tournament_id": tid, "removed_at": None}
    )
    if active_participants > 0 and not getattr(payload, "force", False):
        from routes.tournament_participations import closure_readiness  # local import to avoid cycles
        readiness = await closure_readiness(tid)
        if not readiness["ready_for_closure"]:
            raise HTTPException(
                409,
                {
                    "error": "not_ready_for_closure",
                    "message": (
                        f"{readiness['unsettled_count']} participant(s) still have "
                        f"outstanding balances. Settle them or pass force=true to override."
                    ),
                    "unsettled": readiness["unsettled"],
                },
            )

    # Re-use the financial summary as the body of the letter
    fs = await tournament_financial_summary(tid)
    match_count = await db.tournament_matches.count_documents({"tournament_id": tid})
    now_iso = datetime.now(timezone.utc).isoformat()
    now_display = datetime.now(timezone.utc).strftime("%d %B, %Y")

    # MPCA-243 · Ship 1 · Dynamic issuer header based on wiring owner. For
    # tournaments where `finance_console.owner == "Division"` (District/School/
    # Club/Camp), the issuing authority is the Division / District Secretariat,
    # not MPCA. Fall back to MPCA-issued for owner=MPCA (BCCI/Inter-Div).
    if owner in ("Division", "District"):
        body_doc = await db.bodies.find_one({"code": t.get("host_body_id") or x_body_code}, {"_id": 0}) or {}
        issuer_body_name = body_doc.get("name") or (t.get("host_body_id") or "Division Secretariat")
        header_org      = issuer_body_name.upper()
        default_issuer  = payload.issued_by_name or x_persona_name or f"{issuer_body_name} Secretariat"
        default_post    = payload.issued_by_post or f"Hon. Secretary, {issuer_body_name}"
        approver_line   = f"Claim approved by {issuer_body_name}:"
    else:
        header_org      = "MADHYA PRADESH CRICKET ASSOCIATION"
        default_issuer  = payload.issued_by_name or "MPCA Secretariat"
        default_post    = payload.issued_by_post or "Hon. Secretary, MPCA"
        approver_line   = "Claim approved by MPCA:     "

    letter = f"""{header_org}
─────────────────────────────────────
TOURNAMENT CLOSURE CERTIFICATE

Ref: {t.get('tournament_no', tid)}
Date: {now_display}

This is to certify that the tournament described below has been concluded and all financial obligations have been settled.

TOURNAMENT DETAILS
Name: {t.get('name')}
Type: {t.get('tournament_type_code') or t.get('tournament_type')}
Format: {t.get('format')}
Season: {t.get('fiscal_cycle')}
Host body: {t.get('host_body_id')}
Duration: {t.get('start_date') or '—'} to {t.get('end_date') or '—'}
Matches played: {match_count}

FINANCIAL SUMMARY
Approved budget:            ₹ {fs['budget']['total_inr']:,.0f}
Actual invoices:            ₹ {fs['actuals']['invoices_inr']:,.0f}
Extra expenses approved:    ₹ {fs['actuals']['extras_inr']:,.0f}
Match officials' DA:        ₹ {fs['actuals']['match_officials_da_inr']:,.0f}
Total actual spend:         ₹ {fs['actuals']['total_spend_inr']:,.0f}
Variance vs budget:         ₹ {fs['variance_inr']:,.0f}

REIMBURSEMENT
Claim requested:            ₹ {fs['claim']['requested_inr']:,.0f}
{approver_line}₹ {fs['claim']['approved_inr']:,.0f}
Payment received:           ₹ {fs['receipts']['total_inr']:,.0f}
Outstanding:                ₹ {fs['receipts']['outstanding_inr']:,.0f}

{payload.additional_notes or ''}

Issued by: {default_issuer}
Post:      {default_post}

── End of certificate ──
"""

    # Store the letter body inline (text) — presentation-layer conversion to PDF can be layered later.
    await db.tournament_closure_letters.update_one(
        {"tournament_id": tid},
        {"$set": {"tournament_id": tid, "body_text": letter, "generated_at": now_iso,
                  "issued_by_name": payload.issued_by_name, "issued_by_post": payload.issued_by_post}},
        upsert=True,
    )
    await db.tournaments.update_one({"id": tid}, {"$set": {"closure_letter_generated_at": now_iso}})
    return {"tournament_id": tid, "body_text": letter, "generated_at": now_iso}


@api_router.get("/tournaments/{tid}/closure-letter")
async def get_closure_letter(tid: str):
    doc = await db.tournament_closure_letters.find_one({"tournament_id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No closure letter has been generated yet")
    return doc


# ─────────────── MPCA-244 · Signed closure upload + close ───────────────

class ClosureSignedUploadPayload(BaseModel):
    signed_url: str


@api_router.post("/tournaments/{tid}/closure-signed-upload")
async def upload_signed_closure(
    tid: str, payload: ClosureSignedUploadPayload,
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_persona_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """Owner uploads a signed copy of the closure letter. Wiring-driven — the
    persona must match `tournament_closure.owner` for this tournament type."""
    await assert_wiring_owner(tid, "tournament_closure", x_body_type, x_body_code,
                              action_label="signed closure upload")
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if not payload.signed_url:
        raise HTTPException(400, "signed_url is required")
    now = datetime.now(timezone.utc).isoformat()
    await db.tournaments.update_one({"id": tid}, {"$set": {
        "closure_signed_url": payload.signed_url,
        "closure_signed_at":  now,
        "closure_signed_by":  stamp_actor(x_persona_name, x_body_code, x_body_type),
    }})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/close")
async def close_tournament(
    tid: str,
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_persona_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """Final close — flips tournament.status → Completed. Requires (a) the
    signed closure PDF to be uploaded, (b) the caller's body_type to match
    `tournament_closure.owner` per wiring."""
    await assert_wiring_owner(tid, "tournament_closure", x_body_type, x_body_code,
                              action_label="tournament close")
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if not t.get("closure_signed_url"):
        raise HTTPException(400, "Upload the signed closure letter before closing the tournament.")
    if t.get("status") == "Completed":
        return {"already": "Completed"}
    now = datetime.now(timezone.utc).isoformat()
    await db.tournaments.update_one({"id": tid}, {"$set": {
        "status":       "Completed",
        "closed_at":    now,
        "closed_by":    stamp_actor(x_persona_name, x_body_code, x_body_type),
    }})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})
