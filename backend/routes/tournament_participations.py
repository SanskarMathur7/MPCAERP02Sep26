"""
Sprint M26 · Tournament Participations (Multi-Division Ledger)
──────────────────────────────────────────────────────────────
Per-participant lifecycle rows for Inter_Divisional / Inter_District tournaments.

For every tournament with `setup_meta.division_pools`, this module keeps a row
per participating body (Division or District) that tracks:
    role          — Host | Visitor
    pool_name     — Pool A / Pool B / …
    acceptance    — Pending | Accepted | Declined | Not_Required
    budget_id     — optional link to tournament_budgets row (per-participant sub-budget)
    claim_id      — optional link to reimbursement_claims row (per-participant claim)
    invoice_total — derived aggregate over tournament_invoices for this participant
    receipt_total — derived aggregate over tournament_receipts for this participant

Auto-seeding runs whenever `setup_meta.division_pools` is written via
PATCH /api/tournaments/{tid}/setup-meta (see hook in tournament_workspace.py).
Existing rows no longer in the current pools are soft-deleted (removed_at set)
and re-activated automatically if the division is re-added.
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import copy
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router


# ─── Phase E · Notification helper ───
async def _notify_participation(
    body_code: str,
    body_type: str,
    tournament: Optional[Dict[str, Any]],
    title: str,
    message: str,
    *, severity: str = "info", link: Optional[str] = None,
) -> None:
    """Fire a notification to the *Secretary* of the participating body (Division /
    District). Wrapped in try/except so a notification failure never blocks the
    core participation flow."""
    try:
        from core.helpers import _create_notification
        role_id = "district-secretary" if body_type == "District" else "division-secretary"
        await _create_notification(
            recipient_role_id=role_id,
            recipient_body_id=body_code,
            title=title,
            message=message,
            link=link or (f"/tournaments/{tournament.get('id')}" if tournament else None),
            related_type="tournament_participation",
            related_id=tournament.get("id") if tournament else None,
            severity=severity,
            kind="claim_event",
        )
    except Exception:  # pragma: no cover — non-blocking best-effort
        pass


async def _notify_mpca(
    tournament: Optional[Dict[str, Any]],
    title: str,
    message: str,
    *, severity: str = "info", link: Optional[str] = None,
) -> None:
    """Fire a notification to the MPCA Secretary (State-level) about a
    participant lifecycle transition."""
    try:
        from core.helpers import _create_notification
        await _create_notification(
            recipient_role_id="secretary",
            recipient_body_id="MPCA",
            title=title,
            message=message,
            link=link or (f"/tournaments/{tournament.get('id')}" if tournament else None),
            related_type="tournament_participation",
            related_id=tournament.get("id") if tournament else None,
            severity=severity,
            kind="claim_event",
        )
    except Exception:  # pragma: no cover
        pass


# ─────────────────────────── Models ───────────────────────────

class TournamentParticipation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tournament_id: str
    body_code: str
    body_type: str = "Division"                 # Division | District
    body_name: Optional[str] = None
    role: str = "Visitor"                       # Host | Visitor
    pool_id: Optional[str] = None
    pool_name: Optional[str] = None
    acceptance_status: str = "Pending"          # Pending | Accepted | Declined | Not_Required
    acceptance_note: Optional[str] = None
    acceptance_at: Optional[str] = None
    acceptance_by_name: Optional[str] = None
    budget_id: Optional[str] = None
    claim_id: Optional[str] = None
    notes: Optional[str] = None
    # M32 · Per-participant input variables (starts as copy of tournament master,
    # then Division/District can edit their own draft that drives their sub-budget).
    input_variables: Optional[Dict[str, Any]] = None
    input_variables_updated_at: Optional[str] = None
    input_variables_updated_by: Optional[str] = None
    removed_at: Optional[str] = None            # soft-delete marker
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ParticipationPatch(BaseModel):
    acceptance_status: Optional[str] = None
    acceptance_note: Optional[str] = None
    acceptance_by_name: Optional[str] = None
    notes: Optional[str] = None


class InputVariablesPatch(BaseModel):
    """M32 · Payload for Division/District to save their local input variables."""
    input_variables: Dict[str, Any]
    updated_by: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


# ───────────────────────── Sync helper ─────────────────────────

async def sync_participants_from_pools(
    tid: str,
    division_pools: Optional[List[Dict[str, Any]]] = None,
    district_pools: Optional[List[Dict[str, Any]]] = None,
):
    """Idempotent — upserts one row per (tournament_id, body_code) based on the
    supplied division_pools + district_pools. Bodies dropped from the pools are
    soft-deleted. Called from tournament_workspace.patch_setup_meta after every save.

    Phase C · handles both Inter_Divisional (division_pools with Division codes)
    and Inter_District (district_pools with District codes) uniformly.
    """
    # If neither list is provided (e.g. non-inter-body tournament), no-op.
    if division_pools is None and district_pools is None:
        return

    merged_pools: List[Dict[str, Any]] = []
    for p in (division_pools or []):
        merged_pools.append({**p, "_default_body_type": "Division"})
    for p in (district_pools or []):
        merged_pools.append({**p, "_default_body_type": "District"})

    # Cache body names for display
    codes_in_pools = {c for p in merged_pools for c in (p.get("division_codes") or p.get("district_codes") or [])}
    body_docs: Dict[str, Dict[str, Any]] = {}
    if codes_in_pools:
        async for b in db.bodies.find({"code": {"$in": list(codes_in_pools)}}, {"_id": 0, "code": 1, "name": 1, "body_type": 1}):
            body_docs[b["code"]] = b

    now_iso = datetime.now(timezone.utc).isoformat()
    kept_codes: set = set()
    newly_added: List[Dict[str, Any]] = []

    # M32 · Snapshot the tournament's master input_variables so new participants
    # inherit a working copy they can edit.
    _t = await db.tournaments.find_one({"id": tid}, {"_id": 0, "input_variables": 1})
    master_iv = (_t or {}).get("input_variables") or {}

    for pool in merged_pools:
        pool_id = pool.get("id")
        pool_name = pool.get("name")
        host_code = pool.get("host_division_code") or pool.get("host_district_code")
        # Support both keys — division_codes for old data, district_codes for Phase C
        member_codes = pool.get("division_codes") or pool.get("district_codes") or []
        for code in member_codes:
            kept_codes.add(code)
            body = body_docs.get(code, {})
            role = "Host" if code == host_code else "Visitor"
            existing = await db.tournament_participations.find_one(
                {"tournament_id": tid, "body_code": code}, {"_id": 0}
            )
            update_doc = {
                "tournament_id": tid,
                "body_code": code,
                "body_type": body.get("body_type") or pool.get("_default_body_type") or "Division",
                "body_name": body.get("name") or code,
                "role": role,
                "pool_id": pool_id,
                "pool_name": pool_name,
                "removed_at": None,
                "updated_at": now_iso,
            }
            if existing:
                await db.tournament_participations.update_one(
                    {"tournament_id": tid, "body_code": code},
                    {"$set": update_doc},
                )
            else:
                row = TournamentParticipation(
                    **update_doc,
                    input_variables=copy.deepcopy(master_iv) if master_iv else None,
                )
                await db.tournament_participations.insert_one(row.model_dump())
                newly_added.append({
                    "body_code": code, "body_name": row.body_name,
                    "body_type": row.body_type, "role": row.role, "pool_name": pool_name,
                })

    # Soft-delete rows that fell out of the pools
    await db.tournament_participations.update_many(
        {
            "tournament_id": tid,
            "body_code": {"$nin": list(kept_codes)},
            "removed_at": None,
        },
        {"$set": {"removed_at": now_iso, "updated_at": now_iso}},
    )

    # Phase E · Send acceptance-request notifications for every newly-added row
    if newly_added:
        tournament = await db.tournaments.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1})
        for np in newly_added:
            role_line = "as HOST" if np["role"] == "Host" else "as visitor"
            await _notify_participation(
                body_code=np["body_code"],
                body_type=np["body_type"],
                tournament=tournament,
                title=f"Invited to {tournament.get('name') if tournament else 'tournament'}",
                message=(
                    f"Your {np['body_type'].lower()} has been allocated to {np['pool_name']} "
                    f"{role_line}. Please open the Tournament Participants page and record your "
                    f"acceptance so budget/claim workflows unlock."
                ),
                severity="warning",
            )


# ───────────────────────── Derivations ─────────────────────────

async def _totals_for_participant(tid: str, body_code: str) -> Dict[str, float]:
    inv_total = 0.0
    inv_count = 0
    async for inv in db.tournament_invoices.find(
        {"tournament_id": tid, "participant_body_code": body_code},
        {"total_inr": 1, "_id": 0},
    ):
        inv_total += float(inv.get("total_inr") or 0)
        inv_count += 1

    rct_total = 0.0
    async for r in db.tournament_receipts.find(
        {"tournament_id": tid, "participant_body_code": body_code},
        {"amount_inr": 1, "_id": 0},
    ):
        rct_total += float(r.get("amount_inr") or 0)

    budget_total = 0.0
    budget_status = None
    b = await db.tournament_budgets.find_one(
        {"tournament_id": tid, "participant_body_code": body_code},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if b:
        budget_total = float(b.get("approved_total_inr") or b.get("total_ceiling_inr") or 0)
        budget_status = b.get("status")

    claim_status = None
    claim_requested = 0.0
    claim_approved = 0.0
    c = await db.tournament_reimbursement_claims.find_one(
        {"tournament_id": tid, "participant_body_code": body_code},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if c:
        claim_status = c.get("status")
        claim_requested = float(c.get("total_requested_inr") or c.get("total_claimed_inr") or (c.get("summary") or {}).get("eligible_total_inr") or 0)
        claim_approved = float(c.get("approved_amount_inr") or 0)

    return {
        "invoice_total_inr": inv_total,
        "invoice_count": inv_count,
        "receipt_total_inr": rct_total,
        "budget_total_inr": budget_total,
        "budget_status": budget_status,
        "claim_status": claim_status,
        "claim_requested_inr": claim_requested,
        "claim_approved_inr": claim_approved,
        "outstanding_inr": max(0.0, claim_approved - rct_total),
    }


# ───────────────────────── Routes ─────────────────────────

@api_router.get("/tournaments/{tid}/participants")
async def list_tournament_participants(tid: str, include_removed: bool = False):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 1})
    if not t:
        raise HTTPException(404, "Tournament not found")
    q: Dict[str, Any] = {"tournament_id": tid}
    if not include_removed:
        q["removed_at"] = None
    rows: List[Dict[str, Any]] = []
    async for row in db.tournament_participations.find(q, {"_id": 0}).sort([("role", -1), ("body_name", 1)]):
        totals = await _totals_for_participant(tid, row["body_code"])
        rows.append({**row, **totals})
    return rows


@api_router.get("/tournaments/{tid}/participants/{body_code}")
async def get_tournament_participant(tid: str, body_code: str):
    row = await db.tournament_participations.find_one(
        {"tournament_id": tid, "body_code": body_code}, {"_id": 0}
    )
    if not row:
        raise HTTPException(404, "Participant not found")
    totals = await _totals_for_participant(tid, body_code)
    return {**row, **totals}



# ─────────────── Shared helpers for downstream modules (M26 · Phase B) ───────────────

async def resolve_participant_body_code(tid: str, body_code: Optional[str]) -> Optional[str]:
    """If an active participant row exists for (tournament, body_code), returns
    body_code — used by Budget/Invoice/Claim create endpoints to auto-tag the
    row so ParticipantsMatrix lights up. Returns None otherwise (no forced link)."""
    if not body_code:
        return None
    row = await db.tournament_participations.find_one(
        {"tournament_id": tid, "body_code": body_code, "removed_at": None},
        {"_id": 0, "body_code": 1},
    )
    return row["body_code"] if row else None


async def link_budget_to_participant(tid: str, body_code: Optional[str], budget_id: str):
    if not body_code:
        return
    await db.tournament_participations.update_one(
        {"tournament_id": tid, "body_code": body_code, "removed_at": None, "budget_id": None},
        {"$set": {"budget_id": budget_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


async def link_claim_to_participant(tid: str, body_code: Optional[str], claim_id: str):
    if not body_code:
        return
    await db.tournament_participations.update_one(
        {"tournament_id": tid, "body_code": body_code, "removed_at": None, "claim_id": None},
        {"$set": {"claim_id": claim_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


# ─────────────── Drill-down: per-participant finance snapshot ───────────────

@api_router.get("/tournaments/{tid}/participants/{body_code}/finance")
async def participant_finance_snapshot(tid: str, body_code: str):
    """Returns the full financial trail for a single participant: budget,
    invoice list, claim, receipts. Used by the participant drill-down UI."""
    row = await db.tournament_participations.find_one(
        {"tournament_id": tid, "body_code": body_code}, {"_id": 0}
    )
    if not row:
        raise HTTPException(404, "Participant not found")

    budget = await db.tournament_budgets.find_one(
        {"tournament_id": tid, "participant_body_code": body_code},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    invoices: List[Dict[str, Any]] = []
    async for inv in db.tournament_invoices.find(
        {"tournament_id": tid, "participant_body_code": body_code}, {"_id": 0}
    ).sort([("created_at", -1)]):
        invoices.append(inv)
    claim = await db.tournament_reimbursement_claims.find_one(
        {"tournament_id": tid, "participant_body_code": body_code},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    receipts: List[Dict[str, Any]] = []
    async for r in db.tournament_receipts.find(
        {"tournament_id": tid, "participant_body_code": body_code}, {"_id": 0}
    ).sort([("receipt_date", -1)]):
        receipts.append(r)

    # M28 · Squad linked to this participant (by participant_body_code fallback to body_id).
    squad = await db.squads.find_one(
        {"tournament_id": tid, "$or": [
            {"participant_body_code": body_code},
            {"body_id": body_code},
        ]},
        {"_id": 0}, sort=[("created_at", -1)],
    )

    return {
        "participant": row,
        "budget": budget,
        "invoices": invoices,
        "claim": claim,
        "receipts": receipts,
        "squad": squad,
    }

@api_router.patch("/tournaments/{tid}/participants/{body_code}")
async def patch_tournament_participant(tid: str, body_code: str, patch: ParticipationPatch):
    updates: Dict[str, Any] = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(400, "No fields to update")
    now_iso = datetime.now(timezone.utc).isoformat()
    if "acceptance_status" in updates:
        if updates["acceptance_status"] not in {"Pending", "Accepted", "Declined", "Not_Required"}:
            raise HTTPException(400, "Invalid acceptance_status")
        updates["acceptance_at"] = now_iso
    updates["updated_at"] = now_iso
    r = await db.tournament_participations.update_one(
        {"tournament_id": tid, "body_code": body_code, "removed_at": None},
        {"$set": updates},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Participant not found or already removed")
    row = await db.tournament_participations.find_one(
        {"tournament_id": tid, "body_code": body_code}, {"_id": 0}
    )
    # Phase E · Notify MPCA when a participant flips Accepted / Declined
    if updates.get("acceptance_status") in {"Accepted", "Declined"}:
        tournament = await db.tournaments.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1})
        actor = updates.get("acceptance_by_name") or "the participant secretary"
        verb = updates["acceptance_status"].lower()
        await _notify_mpca(
            tournament=tournament,
            title=f"{row.get('body_name') or body_code} {verb} · {tournament.get('name') if tournament else 'tournament'}",
            message=f"{row.get('body_name') or body_code} ({row.get('role')}) has {verb} the invite (by {actor}).",
            severity=("info" if updates["acceptance_status"] == "Accepted" else "warning"),
        )
    totals = await _totals_for_participant(tid, body_code)
    return {**row, **totals}


# ─────────────── M32 · Per-participant Input Variables + Budget generate ───────────────

@api_router.patch("/tournaments/{tid}/participants/{body_code}/input-variables")
async def patch_participant_input_variables(
    tid: str,
    body_code: str,
    payload: InputVariablesPatch,
):
    """Division/District secretary saves their local input-variables draft.

    The values do NOT overwrite the tournament master (which stays MPCA-owned).
    They only shape THIS participant's downstream sub-budget."""
    now_iso = datetime.now(timezone.utc).isoformat()
    r = await db.tournament_participations.update_one(
        {"tournament_id": tid, "body_code": body_code, "removed_at": None},
        {"$set": {
            "input_variables": payload.input_variables,
            "input_variables_updated_at": now_iso,
            "input_variables_updated_by": payload.updated_by,
            "updated_at": now_iso,
        }},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Participant not found or already removed")
    row = await db.tournament_participations.find_one(
        {"tournament_id": tid, "body_code": body_code}, {"_id": 0}
    )
    return row


@api_router.post("/tournaments/{tid}/participants/{body_code}/budget/generate")
async def generate_participant_budget(tid: str, body_code: str):
    """Generate (or update) THIS participant's draft budget from their local
    input_variables. Host role → full hosting scheme; Visitor role → travel + DA
    subsidy subset. If a live budget already exists, its head allocations are
    OVERWRITTEN with the freshly computed values while status/notes stay put."""
    from models import TournamentBudget
    from routes.scheme_calc import compute_budget, ComputeRequest
    from routes.tournament_workspace import _is_visitor_head

    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    part = await db.tournament_participations.find_one(
        {"tournament_id": tid, "body_code": body_code, "removed_at": None}, {"_id": 0}
    )
    if not part:
        raise HTTPException(404, "Participant not found")

    iv = part.get("input_variables") or t.get("input_variables") or {}
    if not iv:
        raise HTTPException(400, "No input variables set for this participant yet. Save the panel first.")
    scheme_code = t.get("scheme_code")
    if not scheme_code:
        raise HTTPException(400, "Tournament has no scheme_code — cannot auto-compute a budget.")

    preview = await compute_budget(scheme_code, ComputeRequest(inputs=iv))
    full_heads = preview.get("head_allocations") or []
    if not full_heads:
        raise HTTPException(422, "Scheme returned zero heads.")

    role = part.get("role", "Visitor")
    if role == "Host":
        heads_for_this = full_heads
    else:
        heads_for_this = [h for h in full_heads if _is_visitor_head(h["head"])] or [{
            "head": "Team Travel Subsidy",
            "limit_inr": round(preview.get("total_ceiling_inr", 0) * 0.20, 2),
            "formula": "20% of total ceiling (fallback)",
        }]

    head_allocs = [{
        "head": h["head"],
        "limit_inr": float(h["limit_inr"]),
        "spent_inr": 0.0,
        "notes": h.get("formula"),
    } for h in heads_for_this]
    total = round(sum(h["limit_inr"] for h in head_allocs), 2)
    cycle = t.get("fiscal_cycle") or "2025-26"

    existing = await db.tournament_budgets.find_one({
        "tournament_id": tid,
        "body_id": body_code,
        "fiscal_cycle": cycle,
        "status": {"$in": ["Draft", "Returned"]},
    }, {"_id": 0})

    if existing:
        await db.tournament_budgets.update_one(
            {"id": existing["id"]},
            {"$set": {
                "head_allocations": head_allocs,
                "total_ceiling_inr": total,
                "input_variables_snapshot": dict(iv),
                "notes": (existing.get("notes") or "") + f"\n[Regenerated {datetime.now(timezone.utc).isoformat()}]",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        budget = await db.tournament_budgets.find_one({"id": existing["id"]}, {"_id": 0})
        return {"budget": budget, "generated": False, "regenerated": True}

    # Fresh budget
    body = await db.bodies.find_one({"code": body_code}, {"_id": 0})
    count = await db.tournament_budgets.count_documents({"fiscal_cycle": cycle})
    tb = TournamentBudget(
        budget_no=f"TB-{cycle}-{count + 1:03d}",
        tournament_id=tid,
        tournament_name=t.get("name"),
        body_id=body_code,
        body_name=(body or {}).get("name", body_code),
        fiscal_cycle=cycle,
        head_allocations=head_allocs,
        total_ceiling_inr=total,
        status="Draft",
        notes=f"Generated by {body_code} · {role} allocation · {scheme_code}",
        participant_body_code=body_code,
        input_variables_snapshot=dict(iv),
    )
    doc = tb.model_dump()
    await db.tournament_budgets.insert_one(doc)
    await link_budget_to_participant(tid, body_code, tb.id)
    return {"budget": doc, "generated": True, "regenerated": False}




@api_router.post("/tournaments/{tid}/participants/resync")
async def resync_participants(tid: str):
    """Manual re-sync trigger — pulls current setup_meta pools and reconciles."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0, "setup_meta": 1})
    if not t:
        raise HTTPException(404, "Tournament not found")
    meta = t.get("setup_meta") or {}
    div_pools = meta.get("division_pools") or []
    dist_pools = meta.get("district_pools") or []
    await sync_participants_from_pools(tid, div_pools, dist_pools)
    return {"resynced": True, "pool_count": len(div_pools) + len(dist_pools)}


# ─────────────── Phase D · Roll-ups & Bulk NEFT ───────────────

from fastapi import Body
from fastapi.responses import PlainTextResponse
import csv
import io


@api_router.get("/tournaments/{tid}/neft-batch")
async def neft_batch_preview(tid: str):
    """Returns participants with outstanding_inr > 0 along with their default
    bank account so the Treasurer can preview a bulk NEFT batch before export."""
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")

    rows: List[Dict[str, Any]] = []
    async for p in db.tournament_participations.find({"tournament_id": tid, "removed_at": None}, {"_id": 0}):
        totals = await _totals_for_participant(tid, p["body_code"])
        if totals["outstanding_inr"] <= 0:
            continue
        bank = await db.bank_accounts.find_one(
            {"body_id": p["body_code"]}, {"_id": 0}, sort=[("created_at", -1)]
        )
        rows.append({
            **p, **totals,
            "bank_account": bank,
            "ready_for_neft": bool(bank and bank.get("account_no") and bank.get("ifsc")),
        })
    return {
        "tournament_id": tid,
        "batch_count": len(rows),
        "total_outstanding_inr": sum(r["outstanding_inr"] for r in rows),
        "participants": rows,
    }


@api_router.post("/tournaments/{tid}/neft-export", response_class=PlainTextResponse)
async def neft_export(
    tid: str,
    body_codes: List[str] = Body(..., embed=True),
    recorded_by_name: Optional[str] = Body(None, embed=True),
    remarks: Optional[str] = Body(None, embed=True),
    dry_run: bool = Body(False, embed=True),
):
    """Generates a bank-ready NEFT CSV for the supplied participant body_codes.
    Columns follow the standard SBI bulk-NEFT template. When dry_run=false, a
    Tournament Receipt is created for each participant to mark the payment as
    dispatched (mode='NEFT_Batch', reference_no=`NEFT-<tid6>-<batchseq>`)."""
    tournament = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not tournament:
        raise HTTPException(404, "Tournament not found")
    if not body_codes:
        raise HTTPException(400, "body_codes cannot be empty")

    from routes.tournament_workspace import TournamentReceipt as _TR

    # Batch sequence
    batch_seq = (await db.tournament_receipts.count_documents({"tournament_id": tid, "mode": "NEFT_Batch"})) + 1
    batch_ref = f"NEFT-{tid[:6].upper()}-B{batch_seq:03d}"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf)
    writer.writerow([
        "SL_NO", "BODY_CODE", "BENEFICIARY_NAME", "ACCOUNT_NO", "IFSC",
        "AMOUNT_INR", "PAYMENT_REF", "REMARKS",
    ])

    receipts_created = 0
    skipped: List[Dict[str, str]] = []
    for i, code in enumerate(body_codes, start=1):
        p = await db.tournament_participations.find_one(
            {"tournament_id": tid, "body_code": code, "removed_at": None}, {"_id": 0}
        )
        if not p:
            skipped.append({"body_code": code, "reason": "participant not found"})
            continue
        totals = await _totals_for_participant(tid, code)
        outstanding = totals["outstanding_inr"]
        if outstanding <= 0:
            skipped.append({"body_code": code, "reason": "no outstanding balance"})
            continue
        bank = await db.bank_accounts.find_one({"body_id": code}, {"_id": 0}, sort=[("created_at", -1)])
        if not bank or not bank.get("account_no") or not bank.get("ifsc"):
            skipped.append({"body_code": code, "reason": "missing bank account/IFSC"})
            continue

        writer.writerow([
            i,
            code,
            (p.get("body_name") or code),
            bank["account_no"],
            bank["ifsc"],
            f"{outstanding:.2f}",
            f"{batch_ref}/{i:03d}",
            remarks or f"MPCA reimbursement · {tournament.get('name','tournament')}",
        ])

        if not dry_run:
            claim = None
            if p.get("claim_id"):
                claim = await db.tournament_reimbursement_claims.find_one({"id": p["claim_id"]}, {"_id": 0, "id": 1})
            receipt = _TR(
                tournament_id=tid,
                participant_body_code=code,
                receipt_no=f"MPCA-RCT-{batch_ref}-{i:03d}",
                receipt_date=today,
                amount_inr=outstanding,
                mode="NEFT_Batch",
                reference_no=batch_ref,
                linked_claim_id=(claim or {}).get("id"),
                remarks=(remarks or "MPCA bulk NEFT payment"),
                recorded_by_name=recorded_by_name or "MPCA Treasurer",
                recorded_at=now_iso,
            )
            await db.tournament_receipts.insert_one(receipt.model_dump())
            receipts_created += 1

    return PlainTextResponse(
        content=csv_buf.getvalue(),
        headers={
            "Content-Disposition": f'attachment; filename="{batch_ref}.csv"',
            "X-Batch-Ref": batch_ref,
            "X-Rows-Exported": str(len(body_codes) - len(skipped)),
            "X-Receipts-Created": str(receipts_created),
            "X-Rows-Skipped": str(len(skipped)),
        },
        media_type="text/csv",
    )


# ─────────────── Phase D · Closure Guard ───────────────

@api_router.get("/tournaments/{tid}/closure-readiness")
async def closure_readiness(tid: str):
    """Reports whether every active participant is settled (outstanding_inr == 0).
    Consumed by the closure-letter workflow to gate issuance."""
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    total_active = 0
    unsettled: List[Dict[str, Any]] = []
    async for p in db.tournament_participations.find({"tournament_id": tid, "removed_at": None}, {"_id": 0}):
        total_active += 1
        totals = await _totals_for_participant(tid, p["body_code"])
        if totals["outstanding_inr"] > 0.01:
            unsettled.append({
                "body_code": p["body_code"],
                "body_name": p.get("body_name"),
                "role": p["role"],
                "outstanding_inr": totals["outstanding_inr"],
                "acceptance_status": p["acceptance_status"],
            })
    return {
        "tournament_id": tid,
        "total_active": total_active,
        "unsettled_count": len(unsettled),
        "unsettled": unsettled,
        "ready_for_closure": len(unsettled) == 0,
    }


# ─────────────── Phase E · Reminders (pull-based) ───────────────

@api_router.get("/tournaments/{tid}/participation-reminders")
async def participation_reminders(tid: str):
    """Computes overdue lifecycle actions per participant.

    Returns a list where each entry is { body_code, body_name, role, reasons: [str] }.
    Reasons include: 'awaiting_acceptance' (Pending > 7d), 'no_budget'
    (Accepted but no budget row), 'no_claim_after_end' (tournament end passed &
    no claim), 'unsettled' (approved claim > receipts)."""
    from datetime import datetime as _dt
    t = await db.tournaments.find_one(
        {"id": tid}, {"_id": 0, "id": 1, "name": 1, "end_date": 1, "start_date": 1}
    )
    if not t:
        raise HTTPException(404, "Tournament not found")

    now = _dt.now(timezone.utc)
    end_date_str = t.get("end_date")
    end_date = None
    if end_date_str:
        try:
            end_date = _dt.fromisoformat(end_date_str.replace("Z", "+00:00"))
            if end_date.tzinfo is None:
                end_date = end_date.replace(tzinfo=timezone.utc)
        except Exception:
            end_date = None

    reminders: List[Dict[str, Any]] = []
    async for p in db.tournament_participations.find({"tournament_id": tid, "removed_at": None}, {"_id": 0}):
        reasons: List[str] = []
        # 1 · Pending acceptance for > 7 days
        if p.get("acceptance_status") == "Pending":
            created = p.get("created_at")
            try:
                created_dt = _dt.fromisoformat(created.replace("Z", "+00:00")) if created else None
                if created_dt and created_dt.tzinfo is None:
                    created_dt = created_dt.replace(tzinfo=timezone.utc)
                age_days = (now - created_dt).days if created_dt else 0
                if age_days >= 7:
                    reasons.append("awaiting_acceptance")
            except Exception:
                pass
        # 2 · Accepted but no budget row
        if p.get("acceptance_status") == "Accepted" and not p.get("budget_id"):
            reasons.append("no_budget")
        # 3 · Tournament ended, still no claim
        if end_date and now > end_date and not p.get("claim_id"):
            reasons.append("no_claim_after_end")
        # 4 · Unsettled outstanding
        totals = await _totals_for_participant(tid, p["body_code"])
        if totals["outstanding_inr"] > 0.01:
            reasons.append("unsettled")

        if reasons:
            reminders.append({
                "body_code": p["body_code"],
                "body_name": p.get("body_name"),
                "body_type": p.get("body_type"),
                "role": p.get("role"),
                "acceptance_status": p.get("acceptance_status"),
                "outstanding_inr": totals["outstanding_inr"],
                "reasons": reasons,
            })
    return {
        "tournament_id": tid,
        "tournament_name": t.get("name"),
        "generated_at": now.isoformat(),
        "reminder_count": len(reminders),
        "reminders": reminders,
    }


@api_router.post("/tournaments/{tid}/participation-reminders/dispatch")
async def dispatch_participation_reminders(tid: str):
    """Fires an in-app notification for every overdue reason. Idempotent — the
    Treasurer / Secretary can hit this manually or a nightly job can hit it.
    Returns { dispatched_count, deduped_count }.

    Phase F · dedup — skips any notification whose (recipient, title) already
    exists in the past 10 minutes, so a Treasurer double-clicking the Reminders
    button does not spam the inbox."""
    from datetime import timedelta
    data = await participation_reminders(tid)
    tournament = await db.tournaments.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1})
    dispatched = 0
    deduped = 0
    dedup_after = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    reason_titles = {
        "awaiting_acceptance": ("Acceptance overdue", "warning"),
        "no_budget": ("Budget not filed", "warning"),
        "no_claim_after_end": ("Claim overdue", "critical"),
        "unsettled": ("Outstanding balance", "info"),
    }
    for r in data["reminders"]:
        for reason in r["reasons"]:
            title, severity = reason_titles.get(reason, (reason, "info"))
            if reason == "unsettled":
                full_title = f"{title} · {r['body_name']}"
                recipient_role, recipient_body = "secretary", "MPCA"
                message = (
                    f"₹{r['outstanding_inr']:.0f} outstanding to {r['body_name']} for "
                    f"{tournament.get('name') if tournament else 'this tournament'}."
                )
            else:
                full_title = f"{title} · {tournament.get('name') if tournament else 'tournament'}"
                recipient_role = "district-secretary" if r["body_type"] == "District" else "division-secretary"
                recipient_body = r["body_code"]
                message = f"Action required — reason: {reason.replace('_', ' ')}."

            # Dedup check
            recent = await db.notifications.find_one({
                "recipient_role_id": recipient_role,
                "recipient_body_id": recipient_body,
                "title": full_title,
                "related_type": "tournament_participation",
                "related_id": tid,
                "created_at": {"$gt": dedup_after},
            }, {"_id": 1})
            if recent:
                deduped += 1
                continue

            if reason == "unsettled":
                await _notify_mpca(
                    tournament=tournament, title=full_title, message=message, severity=severity,
                )
            else:
                await _notify_participation(
                    body_code=r["body_code"], body_type=r["body_type"] or "Division",
                    tournament=tournament, title=full_title, message=message, severity=severity,
                )
            dispatched += 1
    return {
        "dispatched_count": dispatched,
        "deduped_count": deduped,
        "reminder_count": data["reminder_count"],
    }


# ─────────────── Phase F · CSV / Excel export & Variance ───────────────

@api_router.get("/tournaments/{tid}/participants.csv", response_class=PlainTextResponse)
async def export_participants_csv(tid: str):
    """Exports the Participants Matrix as a governance-ready CSV so MPCA can
    attach it to closure documentation or share with an auditor."""
    tournament = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not tournament:
        raise HTTPException(404, "Tournament not found")

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["MPCA · Tournament Participants Matrix"])
    writer.writerow([f"Tournament: {tournament.get('name', tid)} · Scope: {tournament.get('scope', '—')} · Cycle: {tournament.get('fiscal_cycle', '—')}"])
    writer.writerow([f"Generated: {datetime.now(timezone.utc).isoformat()}"])
    writer.writerow([])
    writer.writerow([
        "BODY_CODE", "BODY_NAME", "BODY_TYPE", "ROLE", "POOL",
        "ACCEPTANCE", "ACCEPTED_AT", "ACCEPTED_BY",
        "BUDGET_INR", "BUDGET_STATUS",
        "INVOICES_INR", "INVOICE_COUNT",
        "CLAIM_INR", "CLAIM_STATUS",
        "RECEIVED_INR", "OUTSTANDING_INR", "VARIANCE_INR",
        "REMOVED_AT",
    ])

    grand_budget = 0.0
    grand_inv = 0.0
    grand_claim = 0.0
    grand_recv = 0.0
    grand_out = 0.0

    async for p in db.tournament_participations.find({"tournament_id": tid}, {"_id": 0}).sort([("removed_at", 1), ("role", -1), ("body_name", 1)]):
        totals = await _totals_for_participant(tid, p["body_code"])
        variance = totals["budget_total_inr"] - totals["invoice_total_inr"]
        writer.writerow([
            p["body_code"], p.get("body_name") or "", p.get("body_type") or "", p.get("role") or "",
            p.get("pool_name") or "",
            p.get("acceptance_status") or "", p.get("acceptance_at") or "", p.get("acceptance_by_name") or "",
            f"{totals['budget_total_inr']:.2f}", totals.get("budget_status") or "",
            f"{totals['invoice_total_inr']:.2f}", str(totals["invoice_count"]),
            f"{totals['claim_requested_inr']:.2f}", totals.get("claim_status") or "",
            f"{totals['receipt_total_inr']:.2f}", f"{totals['outstanding_inr']:.2f}", f"{variance:.2f}",
            p.get("removed_at") or "",
        ])
        if not p.get("removed_at"):
            grand_budget += totals["budget_total_inr"]
            grand_inv += totals["invoice_total_inr"]
            grand_claim += totals["claim_requested_inr"]
            grand_recv += totals["receipt_total_inr"]
            grand_out += totals["outstanding_inr"]

    writer.writerow([])
    writer.writerow([
        "TOTALS", "", "", "", "", "", "", "",
        f"{grand_budget:.2f}", "",
        f"{grand_inv:.2f}", "",
        f"{grand_claim:.2f}", "",
        f"{grand_recv:.2f}", f"{grand_out:.2f}", f"{grand_budget - grand_inv:.2f}",
        "",
    ])

    fname = f"MPCA-Participants-{tid[:6].upper()}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return PlainTextResponse(
        content=buf.getvalue(),
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        media_type="text/csv",
    )


@api_router.get("/tournaments/{tid}/variance-summary")
async def participants_variance_summary(tid: str):
    """Returns per-participant variance analytics for the Financial Summary view."""
    if not await db.tournaments.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tournament not found")
    rows: List[Dict[str, Any]] = []
    async for p in db.tournament_participations.find({"tournament_id": tid, "removed_at": None}, {"_id": 0}):
        t = await _totals_for_participant(tid, p["body_code"])
        budget = t["budget_total_inr"]
        invoices = t["invoice_total_inr"]
        variance = budget - invoices
        utilisation = (invoices / budget * 100) if budget > 0 else 0.0
        rows.append({
            "body_code": p["body_code"], "body_name": p.get("body_name"), "role": p["role"],
            "budget_inr": budget, "invoice_inr": invoices,
            "variance_inr": variance, "utilisation_pct": round(utilisation, 1),
            "over_budget": variance < 0,
        })
    totals = {
        "budget_inr": sum(r["budget_inr"] for r in rows),
        "invoice_inr": sum(r["invoice_inr"] for r in rows),
    }
    totals["variance_inr"] = totals["budget_inr"] - totals["invoice_inr"]
    totals["utilisation_pct"] = round(
        (totals["invoice_inr"] / totals["budget_inr"] * 100) if totals["budget_inr"] > 0 else 0.0, 1
    )
    return {"tournament_id": tid, "participants": rows, "totals": totals}
