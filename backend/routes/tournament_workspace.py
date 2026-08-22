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

from fastapi import HTTPException, Header, Depends, Request
from lib.authz import principal_body_code, principal_role_id, principal_body_type, principal_persona_id
from fastapi import Depends
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
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
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
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
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
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
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


# ─────────────────────────── Iter 126 · Body-wise financial summary ───────────

@api_router.get("/tournaments/{tid}/finance-summary-by-body")
async def finance_summary_by_body(tid: str):
    """Iter 126 · Division-wise financial summary for the Finance Console.

    For each participating body (Division/District/Club) shows:
      - claim_status          (Draft/Submitted/Approved/Rejected/—)
      - eligible_amount_inr   sum of `eligible_for_grant_inr` on Approved invoices
                              + Approved extras (spent-that-passes-budget)
      - claim_amount_inr      the Division's claim amount, if a claim exists
      - mpca_approved_inr     `approved_amount_inr` from the reimbursement claim
                              (source of truth once MPCA has decided).
      - paid_amount_inr       sum of `tournament_receipts.amount_inr` scoped to
                              this body (via participant_body_code)
      - advance_before_claim  paid_amount that predates the claim's approval
                              (i.e. a genuine advance)
      - remaining_amount_inr  outstanding = (mpca_approved OR eligible) - paid
                              (never negative — surplus surfaced as overpaid).
      - overpaid_amount_inr   only set when paid > approved (rare but possible
                              when advances exceed final sanction).
    """
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")

    # Load all supporting docs in parallel-ish (sequential is fine at this scale).
    invoices = await db.tournament_invoices.find({"tournament_id": tid}, {"_id": 0}).to_list(1000)
    extras = await db.extra_expense_requests.find({"tournament_id": tid}, {"_id": 0}).to_list(1000)
    claims = await db.tournament_reimbursement_claims.find({"tournament_id": tid}, {"_id": 0}).to_list(200)
    receipts = await db.tournament_receipts.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    participants = await db.tournament_participations.find({"tournament_id": tid}, {"_id": 0}).to_list(200)

    # Body-name lookup so the UI can render "Gwalior Division (DIV-GWL)".
    body_codes = {p.get("body_code") for p in participants if p.get("body_code")}
    body_codes |= {inv.get("body_id") for inv in invoices if inv.get("body_id")}
    body_codes |= {c.get("body_id") for c in claims if c.get("body_id")}
    body_codes = {b for b in body_codes if b}
    body_docs = await db.bodies.find({"code": {"$in": list(body_codes)}}, {"_id": 0, "code": 1, "name": 1}).to_list(len(body_codes) + 1) if body_codes else []
    body_name_by_code = {b["code"]: b.get("name") for b in body_docs}

    def _bucket_key(code):
        return code or "UNKNOWN"

    rows: Dict[str, dict] = {}

    def _get(code):
        k = _bucket_key(code)
        if k not in rows:
            rows[k] = {
                "body_code": code,
                "body_name": body_name_by_code.get(code) or code,
                "claim_status": None,
                "claim_ref": None,
                "claim_id": None,
                "claim_amount_inr": 0.0,
                "eligible_amount_inr": 0.0,
                "mpca_approved_inr": None,
                "paid_amount_inr": 0.0,
                "advance_before_claim": 0.0,
                "remaining_amount_inr": 0.0,
                "overpaid_amount_inr": 0.0,
                "receipts_count": 0,
                "invoices_count": 0,
                "extras_count": 0,
            }
        return rows[k]

    # Seed rows from participations so bodies with no invoices still show.
    for p in participants:
        code = p.get("body_code")
        if code:
            _get(code)

    # Invoices — only "Approved" are eligible for reimbursement.
    for inv in invoices:
        r = _get(inv.get("body_id"))
        r["invoices_count"] += 1
        if inv.get("status") == "Approved":
            r["eligible_amount_inr"] += float(inv.get("eligible_for_grant_inr") or 0)

    # Extras — Approved extras count toward eligibility.
    for e in extras:
        r = _get(e.get("body_id") or e.get("requesting_body_code"))
        r["extras_count"] += 1
        if e.get("status") == "Approved":
            # Prefer eligible_amount_inr if present, else approved_amount_inr, else amount_inr.
            amt = e.get("eligible_amount_inr") or e.get("approved_amount_inr") or e.get("amount_inr") or 0
            r["eligible_amount_inr"] += float(amt)

    # Claims — the source of truth once MPCA has decided.
    for c in claims:
        r = _get(c.get("body_id"))
        r["claim_status"] = c.get("status")
        r["claim_ref"] = c.get("claim_ref")
        r["claim_id"] = c.get("id")
        r["claim_amount_inr"] = float(c.get("total_claim_inr") or c.get("claimed_amount_inr") or 0)
        if c.get("status") == "Approved":
            r["mpca_approved_inr"] = float(c.get("approved_amount_inr") or c.get("total_claim_inr") or 0)

    # Receipts — MPCA payments back to Divisions (advances + reimbursements).
    approved_at_by_body: Dict[str, str] = {c.get("body_id"): c.get("approved_at") or "" for c in claims if c.get("status") == "Approved"}
    for r_doc in receipts:
        code = r_doc.get("participant_body_code")
        # Skip receipts with no body attribution (legacy) so we don't inflate.
        if not code:
            continue
        row = _get(code)
        amt = float(r_doc.get("amount_inr") or 0)
        row["paid_amount_inr"] += amt
        row["receipts_count"] += 1
        # If the receipt predates claim approval → it's an advance.
        approved_at = approved_at_by_body.get(code) or ""
        receipt_ts = (r_doc.get("receipt_date") or "") + "T00:00:00"
        if not approved_at or receipt_ts < approved_at:
            row["advance_before_claim"] += amt

    # Finalise per-row math + totals.
    totals = {
        "eligible_amount_inr": 0.0, "mpca_approved_inr": 0.0,
        "paid_amount_inr": 0.0, "advance_before_claim": 0.0,
        "remaining_amount_inr": 0.0, "overpaid_amount_inr": 0.0,
    }
    for r in rows.values():
        # Source of truth = MPCA-approved amount when claim is Approved; else
        # the internally computed eligible amount.
        source = r["mpca_approved_inr"] if r["mpca_approved_inr"] is not None else r["eligible_amount_inr"]
        remaining = round(source - r["paid_amount_inr"], 2)
        if remaining < 0:
            r["overpaid_amount_inr"] = round(-remaining, 2)
            r["remaining_amount_inr"] = 0.0
        else:
            r["remaining_amount_inr"] = remaining
            r["overpaid_amount_inr"] = 0.0
        # Round every number to 2 dp.
        for k in ("eligible_amount_inr", "claim_amount_inr", "paid_amount_inr",
                  "advance_before_claim", "remaining_amount_inr", "overpaid_amount_inr"):
            r[k] = round(r[k], 2)
        if r["mpca_approved_inr"] is not None:
            r["mpca_approved_inr"] = round(r["mpca_approved_inr"], 2)
            totals["mpca_approved_inr"] += r["mpca_approved_inr"]
        totals["eligible_amount_inr"] += r["eligible_amount_inr"]
        totals["paid_amount_inr"] += r["paid_amount_inr"]
        totals["advance_before_claim"] += r["advance_before_claim"]
        totals["remaining_amount_inr"] += r["remaining_amount_inr"]
        totals["overpaid_amount_inr"] += r["overpaid_amount_inr"]
    for k in totals:
        totals[k] = round(totals[k], 2)

    return {
        "tournament_id": tid,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rows": sorted(rows.values(), key=lambda x: (x["body_code"] or "")),
        "totals": totals,
    }


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
    # M26 · Sync per-body participation ledger when pools change
    meta = payload.setup_meta if isinstance(payload.setup_meta, dict) else {}
    div_pools = meta.get("division_pools")
    dist_pools = meta.get("district_pools")

    # MPCA-260 · Ship P1 — Enforce "one host body per pool" for BCCI-family
    # tournaments (wiring cell pool_basics.text = "HOST division only, one
    # selectable"). Validation is server-side so it can't be bypassed.
    from core.wiring_guard import resolve_wiring_cell
    pool_cell = await resolve_wiring_cell(tid, "pool_basics")
    if pool_cell and pool_cell.get("mode") == "Auto_Compute":
        def _member_codes(p):
            # Support both member shapes: list of strings, or list of {code}/{body_code}.
            m = p.get("members") or p.get("bodies") or p.get("teams") or []
            out = []
            for it in m:
                if isinstance(it, str): out.append(it)
                elif isinstance(it, dict): out.append(it.get("code") or it.get("body_code") or it.get("body_id"))
            return [c for c in out if c]
        for p in (div_pools or []) + (dist_pools or []):
            if len(_member_codes(p)) > 1:
                raise HTTPException(
                    409,
                    "Wiring violation: BCCI-family tournaments allow only ONE host body per pool. "
                    "Please split into separate pools (opposing teams are free-text in the Match Calendar, not part of the pool).",
                )

    r = await db.tournaments.update_one({"id": tid}, {"$set": {"setup_meta": payload.setup_meta}})
    if r.matched_count == 0:
        raise HTTPException(404, "Tournament not found")
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
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
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


# ─────────────── MPCA-246 · Rich multi-section PDF ───────────────

@api_router.get("/tournaments/{tid}/closure-letter/pdf")
async def get_closure_letter_pdf(tid: str):
    """Generate a rich multi-section closure PDF with pool tables, calendar,
    officials, squad summary, budget rollup, invoices, deductions, financial
    summary, payments, and links to signed artifacts.

    Returns application/pdf. Falls back gracefully if any section has no data.
    """
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    import io

    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    fs = await tournament_financial_summary(tid)

    # Determine owner (MPCA vs Division) so header + issuer flip appropriately
    try:
        from core.wiring_guard import resolve_wiring_cell
        fc_cell = await resolve_wiring_cell(tid, "finance_console")
        owner = (fc_cell or {}).get("owner") or "MPCA"
    except Exception:
        owner = "MPCA"

    header_org = "MADHYA PRADESH CRICKET ASSOCIATION"
    if owner in ("Division", "District"):
        host_body = await db.bodies.find_one({"code": t.get("host_body_id")}, {"_id": 0}) or {}
        if host_body.get("name"):
            header_org = host_body["name"].upper()

    # ─── Data aggregation ───
    pools = await db.pools.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    participations = await db.tournament_participations.find(
        {"tournament_id": tid, "removed_at": None}, {"_id": 0}).to_list(500)
    matches = await db.tournament_matches.find(
        {"tournament_id": tid}, {"_id": 0}).sort([("match_date", 1), ("match_no", 1)]).to_list(2000)
    officials = await db.tournament_match_officials.find(
        {"tournament_id": tid}, {"_id": 0}).to_list(500)
    squads = await db.squads.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    invoices = await db.tournament_invoices.find(
        {"tournament_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    budgets = await db.tournament_budgets.find(
        {"tournament_id": tid}, {"_id": 0}).to_list(500)
    receipts = await db.reimbursement_receipts.find(
        {"tournament_id": tid}, {"_id": 0}).to_list(500) if hasattr(db, "reimbursement_receipts") else []

    # Unique venues from matches
    venues = sorted({m.get("venue_name") or m.get("venue_id") for m in matches if (m.get("venue_name") or m.get("venue_id"))})

    # ─── Build PDF ───
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        title=f"Tournament Closure · {t.get('tournament_no', tid)}",
    )
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontSize=15, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=11, spaceBefore=10, spaceAfter=4,
                        textColor=colors.HexColor("#3b5540"))
    body = ParagraphStyle("body", parent=ss["BodyText"], fontSize=9, leading=11)
    small = ParagraphStyle("small", parent=ss["BodyText"], fontSize=8, textColor=colors.grey)

    def _tbl(data, col_widths=None, header=True):
        tbl = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
        style = [
            ("BOX",        (0, 0), (-1, -1), 0.5, colors.grey),
            ("INNERGRID",  (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ("FONTSIZE",   (0, 0), (-1, -1), 8),
            ("VALIGN",     (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]
        if header:
            style += [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3b5540")),
                ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        tbl.setStyle(TableStyle(style))
        return tbl

    story = []

    # ─── § 1 · Header ───
    story.append(Paragraph(f"<b>{header_org}</b>", h1))
    story.append(Paragraph("TOURNAMENT CLOSURE CERTIFICATE", h1))
    story.append(Paragraph(
        f"Ref: <b>{t.get('tournament_no', tid)}</b> &nbsp;&nbsp; "
        f"Date: {datetime.now(timezone.utc).strftime('%d %B, %Y')}",
        small,
    ))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "This is to certify that the tournament described below has been concluded "
        "and all financial obligations have been settled.", body))
    story.append(Spacer(1, 8))

    # ─── § 2 · Tournament basics ───
    story.append(Paragraph("Tournament Details", h2))
    basics = [
        ["Name",         t.get("name") or ""],
        ["Type",         t.get("tournament_type_code") or t.get("tournament_type") or ""],
        ["Format",       t.get("format") or ""],
        ["Season",       t.get("fiscal_cycle") or ""],
        ["Host body",    t.get("host_body_id") or ""],
        ["Dates",        f"{t.get('start_date') or '—'} to {t.get('end_date') or '—'}"],
        ["Matches",      str(len(matches))],
        ["Participants", str(len(participations))],
    ]
    story.append(_tbl(basics, col_widths=[4*cm, 13*cm], header=False))

    # ─── § 3 · Pools & Participating Bodies ───
    if participations or pools:
        story.append(Paragraph("Pools & Participating Bodies", h2))
        rows = [["#", "Body", "Role", "Pool", "IV Set"]]
        for i, p in enumerate(participations, 1):
            rows.append([
                str(i),
                p.get("body_name") or p.get("body_code") or "",
                p.get("role") or "Participant",
                p.get("pool_name") or p.get("pool_id") or "—",
                p.get("iv_set") or "—",
            ])
        if len(rows) > 1:
            story.append(_tbl(rows, col_widths=[0.8*cm, 6*cm, 3*cm, 4.5*cm, 2.7*cm]))

    # ─── § 4 · Grounds / Venues ───
    if venues:
        story.append(Paragraph("Grounds / Venues", h2))
        vrows = [["#", "Venue"]] + [[str(i), v] for i, v in enumerate(venues, 1)]
        story.append(_tbl(vrows, col_widths=[0.8*cm, 16.2*cm]))

    # ─── § 5 · Match Calendar ───
    if matches:
        story.append(PageBreak())
        story.append(Paragraph(f"Match Calendar ({len(matches)} matches)", h2))
        mrows = [["#", "Date", "Home", "Away", "Venue", "Result"]]
        for m in matches:
            mrows.append([
                str(m.get("match_no") or ""),
                m.get("match_date") or "—",
                (m.get("home_team") or "")[:22],
                (m.get("away_team") or "")[:22],
                (m.get("venue_name") or m.get("venue_id") or "—")[:20],
                (m.get("result_summary") or m.get("status") or "—")[:22],
            ])
        story.append(_tbl(mrows, col_widths=[0.8*cm, 2.2*cm, 4*cm, 4*cm, 3.5*cm, 3.5*cm]))

    # ─── § 6 · Match Officials ───
    if officials:
        story.append(Paragraph(f"Match Officials ({len(officials)} assignments)", h2))
        orows = [["Match#", "Role", "Grade", "Name", "Body"]]
        for o in officials[:100]:  # cap huge lists
            orows.append([
                str(o.get("match_no") or o.get("fixture_no") or "—"),
                o.get("role") or "—",
                o.get("grade") or "—",
                (o.get("official_name") or "—")[:22],
                (o.get("official_body_code") or "—")[:12],
            ])
        story.append(_tbl(orows, col_widths=[1.5*cm, 2.5*cm, 2*cm, 6*cm, 5*cm]))

    # ─── § 7 · Squad Summary ───
    if squads:
        story.append(Paragraph(f"Squad Summary ({len(squads)} squads)", h2))
        srows = [["Body", "Team", "Players", "Status", "Signed?"]]
        for sq in squads:
            srows.append([
                (sq.get("body_id") or "—")[:14],
                (sq.get("team_name") or "—")[:20],
                str(len(sq.get("members") or [])),
                (sq.get("submission_status") or "Draft").replace("_", " "),
                "Yes" if sq.get("signed_copy_url") else "—",
            ])
        story.append(_tbl(srows, col_widths=[3.5*cm, 5*cm, 2*cm, 3.5*cm, 3*cm]))

    # ─── § 8 · Unified Budget Rollup ───
    if budgets:
        story.append(PageBreak())
        story.append(Paragraph("Unified Budget Rollup", h2))
        brows = [["Body", "Scope", "Status", "Allocated ₹", "Approved ₹"]]
        total_alloc = total_appr = 0
        for b in budgets:
            alloc = float(b.get("total_inr") or 0)
            appr  = float(b.get("approved_total_inr") or 0)
            total_alloc += alloc; total_appr += appr
            brows.append([
                (b.get("body_id") or "—")[:14],
                (b.get("scope") or "—")[:14],
                (b.get("status") or "—").replace("_", " "),
                f"{alloc:,.0f}",
                f"{appr:,.0f}",
            ])
        brows.append(["", "", "TOTAL", f"{total_alloc:,.0f}", f"{total_appr:,.0f}"])
        story.append(_tbl(brows, col_widths=[3*cm, 3*cm, 4*cm, 3.5*cm, 3.5*cm]))

    # ─── § 9 · Invoices ───
    if invoices:
        story.append(Paragraph(f"Invoices ({len(invoices)} rows)", h2))
        irows = [["#", "Ref", "Vendor / Head", "Date", "Amount ₹", "Status"]]
        total_inv = 0
        for i, inv in enumerate(invoices, 1):
            amt = float(inv.get("total_inr") or 0)
            total_inv += amt
            irows.append([
                str(i),
                (inv.get("invoice_ref") or inv.get("invoice_no") or "—")[:14],
                (inv.get("vendor_name") or inv.get("head_key") or "—")[:22],
                inv.get("invoice_date") or "—",
                f"{amt:,.0f}",
                (inv.get("status") or "—").replace("_", " "),
            ])
        irows.append(["", "", "", "TOTAL", f"{total_inv:,.0f}", ""])
        story.append(_tbl(irows, col_widths=[0.8*cm, 3*cm, 5*cm, 2.5*cm, 3*cm, 2.7*cm]))

    # ─── § 10 · MPCA Deductions / Adjustments ───
    # Read the deduction rows from the tournament's unified_budget_snapshot if present
    snap = t.get("unified_budget_snapshot") or {}
    ded_items = []
    for row in snap.get("body_rows") or []:
        for d in row.get("deductions") or []:
            ded_items.append((row.get("body_id") or "—", d))
    if ded_items:
        story.append(Paragraph("MPCA Deductions / Adjustments", h2))
        drows = [["Body", "Reason", "Amount ₹"]]
        total_ded = 0
        for body_code, d in ded_items:
            amt = float(d.get("amount_inr") or 0)
            total_ded += amt
            drows.append([body_code[:14], (d.get("reason") or "—")[:40], f"{amt:,.0f}"])
        drows.append(["", "TOTAL", f"{total_ded:,.0f}"])
        story.append(_tbl(drows, col_widths=[3*cm, 11*cm, 3*cm]))

    # ─── § 11 · Financial Summary ───
    story.append(PageBreak())
    story.append(Paragraph("Financial Summary", h2))
    fsr = [
        ["Approved budget",             f"{fs['budget']['total_inr']:,.0f}"],
        ["Actual invoices",             f"{fs['actuals']['invoices_inr']:,.0f}"],
        ["Extra expenses approved",     f"{fs['actuals']['extras_inr']:,.0f}"],
        ["Match officials' DA",         f"{fs['actuals']['match_officials_da_inr']:,.0f}"],
        ["Total actual spend",          f"{fs['actuals']['total_spend_inr']:,.0f}"],
        ["Variance vs budget",          f"{fs['variance_inr']:,.0f}"],
        ["Claim requested",             f"{fs['claim']['requested_inr']:,.0f}"],
        [f"Claim approved by {'MPCA' if owner == 'MPCA' else owner}",  f"{fs['claim']['approved_inr']:,.0f}"],
        ["Payment received",            f"{fs['receipts']['total_inr']:,.0f}"],
        ["Outstanding",                 f"{fs['receipts']['outstanding_inr']:,.0f}"],
    ]
    fs_tbl = Table(fsr, colWidths=[10*cm, 7*cm])
    fs_tbl.setStyle(TableStyle([
        ("BOX",         (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID",   (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("FONTSIZE",    (0, 0), (-1, -1), 9),
        ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
        ("BACKGROUND",  (0, 0), (0, -1), colors.HexColor("#f4ede0")),
        ("ALIGN",       (1, 0), (1, -1), "RIGHT"),
    ]))
    story.append(fs_tbl)

    # ─── § 12 · Payment Log ───
    if receipts:
        story.append(Paragraph(f"Payments Received ({len(receipts)} entries)", h2))
        prows = [["#", "Date", "UTR / Ref", "Amount ₹", "Note"]]
        for i, r in enumerate(receipts, 1):
            prows.append([
                str(i),
                r.get("receipt_date") or "—",
                (r.get("utr") or r.get("reference") or "—")[:20],
                f"{float(r.get('amount_inr') or 0):,.0f}",
                (r.get("notes") or "—")[:30],
            ])
        story.append(_tbl(prows, col_widths=[0.8*cm, 2.2*cm, 4.5*cm, 3*cm, 6.5*cm]))

    # ─── § 13 · Signed Artifact Links ───
    signed_links = []
    # Squad signed PDFs
    for sq in squads:
        if sq.get("signed_copy_url"):
            signed_links.append((f"Squad · {sq.get('body_id')}", sq["signed_copy_url"]))
    # Closure signed URL
    if t.get("closure_signed_url"):
        signed_links.append(("Signed closure PDF", t["closure_signed_url"]))
    if signed_links:
        story.append(Paragraph("Signed Artifacts on File", h2))
        for label, url in signed_links:
            story.append(Paragraph(
                f"• {label}: <a href='{url}' color='#7a1e2b'>{url[:70]}{'…' if len(url) > 70 else ''}</a>",
                body,
            ))

    # ─── § 14 · Issuer footer ───
    story.append(Spacer(1, 24))
    footer_org = "MPCA Secretariat" if owner == "MPCA" else header_org.title()
    story.append(Paragraph(f"Issued by: <b>{footer_org}</b>", body))
    story.append(Paragraph(f"Post: Hon. Secretary, {footer_org}", body))
    story.append(Spacer(1, 24))
    sig = Table([
        ["Hon. Secretary", "Hon. Treasurer"],
        ["", ""],
        ["", ""],
        ["___________________", "___________________"],
        ["Signature & Seal",   "Signature & Seal"],
    ], colWidths=[8*cm, 8*cm])
    sig.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 0), (-1, -1), 8),
        ("ALIGN",     (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(sig)

    pdf.build(story)
    buf.seek(0)

    # MPCA-249 · Optional appendix merge — download-only variant appends
    # each linked signed PDF (squad signed sheets + closure signed PDF).
    # Passed as ?merge_signed=1. Silently skips URLs that don't fetch as
    # PDFs (private drives, dead links, image-only signed sheets) so the
    # base certificate always renders.
    if signed_links:
        try:
            import requests as _req
            from pypdf import PdfWriter, PdfReader
            writer = PdfWriter()
            writer.append(fileobj=io.BytesIO(buf.getvalue()))
            fetched = 0
            for label, url in signed_links:
                try:
                    r = _req.get(url, timeout=8, allow_redirects=True)
                    if r.status_code != 200 or not r.content.startswith(b"%PDF"):
                        continue
                    writer.append(fileobj=io.BytesIO(r.content))
                    fetched += 1
                except Exception:
                    continue
            if fetched:
                out = io.BytesIO()
                writer.write(out)
                out.seek(0)
                buf = out
        except Exception:
            pass  # fall through — base PDF still valid

    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'inline; filename="closure-{t.get("tournament_no", tid)}.pdf"',
        },
    )


# ─────────────── MPCA-244 · Signed closure upload + close ───────────────

class ClosureSignedUploadPayload(BaseModel):
    signed_url: str


@api_router.post("/tournaments/{tid}/closure-signed-upload")
async def upload_signed_closure(
    tid: str, payload: ClosureSignedUploadPayload,
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
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
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
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
