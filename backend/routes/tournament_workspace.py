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

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router


# ─────────────────────────── Match Fixtures ───────────────────────────

class TournamentMatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tournament_id: str
    match_no: int
    stage: str = "League"                       # League | Quarter_Final | Semi_Final | Final | Practice
    match_date: Optional[str] = None            # ISO YYYY-MM-DD
    start_time: Optional[str] = None            # HH:MM (24h)
    home_team: str
    away_team: str
    venue_name: Optional[str] = None
    ground_name: Optional[str] = None
    result: Optional[str] = None                # free-text result note when completed
    notes: Optional[str] = None
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


@api_router.get("/tournaments/{tid}/matches", response_model=List[TournamentMatch])
async def list_tournament_matches(tid: str):
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    docs = await db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}).sort([("match_date", 1), ("match_no", 1)]).to_list(500)
    return docs


@api_router.post("/tournaments/{tid}/matches", response_model=TournamentMatch)
async def create_tournament_match(tid: str, payload: TournamentMatchCreate):
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    count = await db.tournament_matches.count_documents({"tournament_id": tid})
    m = TournamentMatch(tournament_id=tid, match_no=count + 1, **payload.model_dump())
    await db.tournament_matches.insert_one(m.model_dump())
    return m


@api_router.patch("/tournaments/{tid}/matches/{mid}", response_model=TournamentMatch)
async def patch_tournament_match(tid: str, mid: str, patch: TournamentMatchPatch):
    updates = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if updates:
        r = await db.tournament_matches.update_one({"id": mid, "tournament_id": tid}, {"$set": updates})
        if r.matched_count == 0:
            raise HTTPException(404, "Match not found")
    return await db.tournament_matches.find_one({"id": mid, "tournament_id": tid}, {"_id": 0})


@api_router.delete("/tournaments/{tid}/matches/{mid}")
async def delete_tournament_match(tid: str, mid: str):
    r = await db.tournament_matches.delete_one({"id": mid, "tournament_id": tid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Match not found")
    return {"deleted": True}


# ───────────────────────────── Receipts (MPCA → Tournament) ─────────────────────────────

class TournamentReceipt(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tournament_id: str
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
    r = TournamentReceipt(
        tournament_id=tid,
        receipt_no=f"MPCA-RCT-{tid[:6].upper()}-{count + 1:03d}",
        **payload.model_dump(),
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


class SetupMetaPayload(BaseModel):
    setup_meta: Dict[str, Any]


@api_router.patch("/tournaments/{tid}/setup-meta")
async def patch_setup_meta(tid: str, payload: SetupMetaPayload):
    r = await db.tournaments.update_one({"id": tid}, {"$set": {"setup_meta": payload.setup_meta}})
    if r.matched_count == 0:
        raise HTTPException(404, "Tournament not found")
    # M26 · Sync per-division participation ledger when pools change
    pools = payload.setup_meta.get("division_pools") if isinstance(payload.setup_meta, dict) else None
    if pools is not None:
        from routes.tournament_participations import sync_participants_from_pools
        await sync_participants_from_pools(tid, pools)
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
    squad = await db.squads.find_one({"tournament_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
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

    squad_selected = bool(squad and (squad.get("members") or []))
    squad_approved = bool(squad and squad.get("status") == "Approved")

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


@api_router.post("/tournaments/{tid}/closure-letter")
async def generate_closure_letter(tid: str, payload: ClosureLetterPayload):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    # Re-use the financial summary as the body of the letter
    fs = await tournament_financial_summary(tid)
    match_count = await db.tournament_matches.count_documents({"tournament_id": tid})
    now_iso = datetime.now(timezone.utc).isoformat()
    now_display = datetime.now(timezone.utc).strftime("%d %B, %Y")

    letter = f"""MADHYA PRADESH CRICKET ASSOCIATION
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
Claim approved by MPCA:     ₹ {fs['claim']['approved_inr']:,.0f}
Payment received:           ₹ {fs['receipts']['total_inr']:,.0f}
Outstanding:                ₹ {fs['receipts']['outstanding_inr']:,.0f}

{payload.additional_notes or ''}

Issued by: {payload.issued_by_name or 'MPCA Secretariat'}
Post:      {payload.issued_by_post or 'Hon. Secretary, MPCA'}

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
