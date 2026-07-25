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
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router


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
    removed_at: Optional[str] = None            # soft-delete marker
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ParticipationPatch(BaseModel):
    acceptance_status: Optional[str] = None
    acceptance_note: Optional[str] = None
    acceptance_by_name: Optional[str] = None
    notes: Optional[str] = None


# ───────────────────────── Sync helper ─────────────────────────

async def sync_participants_from_pools(tid: str, division_pools: List[Dict[str, Any]]):
    """Idempotent — upserts one row per (tournament_id, body_code) based on the
    supplied division_pools. Bodies dropped from the pools are soft-deleted.
    Called from tournament_workspace.patch_setup_meta after every save."""
    if not isinstance(division_pools, list):
        return

    # Cache division names for display
    codes_in_pools = {c for p in division_pools for c in (p.get("division_codes") or [])}
    body_docs = {}
    if codes_in_pools:
        async for b in db.bodies.find({"code": {"$in": list(codes_in_pools)}}, {"_id": 0, "code": 1, "name": 1, "body_type": 1}):
            body_docs[b["code"]] = b

    now_iso = datetime.now(timezone.utc).isoformat()
    kept_codes = set()

    for pool in division_pools:
        pool_id = pool.get("id")
        pool_name = pool.get("name")
        host_code = pool.get("host_division_code")
        for code in pool.get("division_codes") or []:
            kept_codes.add(code)
            body = body_docs.get(code, {})
            role = "Host" if code == host_code else "Visitor"
            existing = await db.tournament_participations.find_one(
                {"tournament_id": tid, "body_code": code}, {"_id": 0}
            )
            update_doc = {
                "tournament_id": tid,
                "body_code": code,
                "body_type": body.get("body_type") or "Division",
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
                row = TournamentParticipation(**update_doc)
                await db.tournament_participations.insert_one(row.model_dump())

    # Soft-delete rows that fell out of the pools
    await db.tournament_participations.update_many(
        {
            "tournament_id": tid,
            "body_code": {"$nin": list(kept_codes)},
            "removed_at": None,
        },
        {"$set": {"removed_at": now_iso, "updated_at": now_iso}},
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
    c = await db.reimbursement_claims.find_one(
        {"tournament_id": tid, "participant_body_code": body_code},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if c:
        claim_status = c.get("status")
        claim_requested = float(c.get("total_requested_inr") or c.get("total_claimed_inr") or 0)
        claim_approved = float(c.get("approved_total_inr") or 0)

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
    totals = await _totals_for_participant(tid, body_code)
    return {**row, **totals}


@api_router.post("/tournaments/{tid}/participants/resync")
async def resync_participants(tid: str):
    """Manual re-sync trigger — pulls current setup_meta.division_pools and reconciles."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0, "setup_meta": 1})
    if not t:
        raise HTTPException(404, "Tournament not found")
    pools = ((t.get("setup_meta") or {}).get("division_pools")) or []
    await sync_participants_from_pools(tid, pools)
    return {"resynced": True, "pool_count": len(pools)}
