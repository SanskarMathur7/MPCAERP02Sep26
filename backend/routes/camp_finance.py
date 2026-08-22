"""Feb 2026 · Fixes D + E · Division-owned Camp Finance Flow
────────────────────────────────────────────────────────────
For the 6 Division-run tournament types (Pre-Camp / Inter-District /
Inter-School / Inter-Club A-Grade / Periodical Coaching / Vacation Camp),
the Division owns the budget lifecycle end-to-end. MPCA becomes visible
only at the reimbursement-claim submission step.

Endpoints exposed:
  • POST /tournaments/{tid}/finance/division-prepare-budget
        Division auto-computes the unified budget and materialises a
        Draft `TournamentBudget` for their own body_code. Idempotent —
        replaces any prior Draft on this (tournament, body, pool).

  • POST /tournament-budgets/{bid}/division-self-sanction
        Division locks the Draft into `Division_Sanctioned`. No MPCA
        involvement, no proposal-flow. Locked budgets accept invoices.

  • POST /tournaments/{tid}/finance/submit-reimbursement-claim
        Bundles all `tournament_invoices` on this camp into a single
        `GrantClaim` (scheme `camp_reimbursement`), flips the budget
        to `Submitted_To_MPCA`, and hands over to the existing Grant
        Claim workflow for MPCA review + payment.

  • Existing grant-claim `/payment` handler is patched (in
        grant_claims.py) to propagate a payment on a `camp_reimbursement`
        claim back to `TournamentBudget.status = Reimbursed`.

Guarded by `is_division_owned_budget()` — if the wiring says the tournament
is MPCA-owned, all endpoints return HTTP 400 with a clear rerouting hint.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException, Header, Depends, Request
from lib.authz import principal_body_code, principal_role_id, principal_body_type, principal_persona_id
from fastapi import Depends
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from core.wiring_guard import is_division_owned_budget
from models import (
    TournamentBudget, TournamentBudgetBase, BudgetHeadAllocation,
)


# ═════════════════════ Payloads ════════════════════════

class DivisionPreparePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    prepared_by_name: Optional[str] = None
    notes: Optional[str] = None


class DivisionSelfSanctionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sanctioned_by_name: Optional[str] = None
    notes: Optional[str] = None


class SubmitReimbursementPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    submitted_by_name: Optional[str] = None
    purpose_of_claim: Optional[str] = None
    signed_summary_url: Optional[str] = None


# ═════════════════════ Helpers ═════════════════════════

async def _next_budget_no(cycle: str) -> str:
    from core.shared_services import next_seq
    seq = await next_seq(f"tournament_budget:{cycle}",
                         lambda: db.tournament_budgets.count_documents({"fiscal_cycle": cycle}))
    return f"TB-{cycle}-{seq:03d}"


async def _next_claim_ref(cycle: str) -> str:
    from core.shared_services import next_seq
    seq = await next_seq(f"grant_claim:{cycle}",
                         lambda: db.grant_claims.count_documents({"fiscal_cycle": cycle}))
    return f"GRC-{cycle}-{seq:04d}"


async def _assert_division_owned(tid: str) -> dict:
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if not await is_division_owned_budget(t):
        raise HTTPException(
            400,
            "This tournament is MPCA-owned. Use the MPCA Finance Console "
            "(/api/tournaments/{tid}/finance/prepare-budgets-unified) instead."
        )
    return t


async def _assert_host_division_caller(tournament: dict, x_body_code: Optional[str]) -> str:
    """Only the host Division may run these endpoints. Legacy calls without
    the header (seeders, tests) are allowed for backward compat."""
    host = tournament.get("host_body_id")
    if not x_body_code:
        return host or "SYSTEM"
    if host and x_body_code != host:
        raise HTTPException(403, f"Only the host body ({host}) can act on this tournament's Division finance flow.")
    return x_body_code


async def _compute_unified_budget_for_camp(t: dict) -> dict:
    """Reuse the same compute engine as MPCA prepare — read the live snapshot
    or compute on the fly."""
    from routes.unified_budget import compute_unified_budget_for_tournament
    # Fetch or compute — mirror what prepare-budgets-unified does
    lock = await db.unified_budgets.find_one({"tournament_id": t["id"]}, {"_id": 0})
    if lock and lock.get("budget") and (lock.get("budget") or {}).get("by_body_totals"):
        return {"budget": lock["budget"], "source": "locked"}
    # Compute live via the same handler as the API endpoint
    result = await compute_unified_budget_for_tournament(t["id"], save=False)
    return {"budget": result.get("budget") or {}, "source": "live"}


# ═════════════════════ Fix D · endpoints ═══════════════

@api_router.post("/tournaments/{tid}/finance/division-prepare-budget")
async def division_prepare_budget(
    tid: str,
    payload: DivisionPreparePayload,
    x_body_code: Optional[str] = Depends(principal_body_code),
):
    """Division auto-computes the unified budget for its own camp and
    materialises a Draft `TournamentBudget`. Idempotent — replaces any
    prior Draft on this (tournament, body_code)."""
    t = await _assert_division_owned(tid)
    host_code = await _assert_host_division_caller(t, x_body_code)

    result = await _compute_unified_budget_for_camp(t)
    budget = result["budget"]
    source = result["source"]

    # For Division-owned tournaments the host body owns the entire budget.
    # Find the Division's own by_body_totals row (or aggregate all
    # host-flavoured rows if pools split the budget).
    by_body = budget.get("by_body_totals") or []
    host_rows = [r for r in by_body if r.get("body_code") == host_code]
    if not host_rows:
        # Fall back to summing all non-MPCA rows — treat the whole camp
        # as the Division's ask (typical for a pre-camp with no pools).
        host_rows = [r for r in by_body if r.get("body_code") != "MPCA"]
    if not host_rows:
        raise HTTPException(400, "Compute produced no host-body allocations. Check that the Match Calendar has at least one fixture with a valid ground + teams.")

    # Merge head allocations across all host rows (in case of multiple pools)
    head_map: Dict[str, float] = {}
    for row in host_rows:
        for a in (row.get("head_allocations") or []):
            key = a.get("head") or a.get("head_key") or "Misc"
            try:
                head_map[key] = round(head_map.get(key, 0.0) + float(a.get("limit_inr", 0)), 2)
            except (TypeError, ValueError):
                continue

    head_allocs = [
        BudgetHeadAllocation(
            head=k, limit_inr=v,
            notes=f"Division self-prepared · Unified Budget {source}",
        )
        for k, v in head_map.items() if v > 0
    ]
    if not head_allocs:
        raise HTTPException(400, "No non-zero head allocations produced. Ensure fixtures and rate card are set.")

    total = round(sum(h.limit_inr for h in head_allocs), 2)
    cycle = t.get("fiscal_cycle") or "2026-27"

    # Idempotency — replace any Draft or Revision on (tid, host_code) but
    # refuse if a locked Division_Sanctioned / Submitted / Reimbursed row
    # already exists.
    live_q = {
        "tournament_id": tid,
        "body_id": host_code,
        "status": {"$in": ["Division_Sanctioned", "Submitted_To_MPCA", "Reimbursed"]},
    }
    live = await db.tournament_budgets.find_one(live_q, {"_id": 0})
    if live:
        raise HTTPException(400, f"Budget already {live.get('status')} (record {live.get('budget_no')}). Cannot re-prepare.")

    replaced_no = None
    draft_q = {
        "tournament_id": tid,
        "body_id": host_code,
        "status": {"$in": ["Draft", "Revision_Requested"]},
    }
    old_draft = await db.tournament_budgets.find_one(draft_q, {"_id": 0})
    if old_draft:
        replaced_no = old_draft.get("budget_no")
        await db.tournament_budgets.delete_one({"id": old_draft["id"]})

    body = await db.bodies.find_one({"code": host_code}, {"_id": 0})
    tb = TournamentBudget(
        budget_no=await _next_budget_no(cycle),
        tournament_id=tid,
        tournament_name=t.get("name"),
        body_id=host_code,
        body_name=(body or {}).get("name", host_code),
        fiscal_cycle=cycle,
        head_allocations=[h.model_dump() for h in head_allocs],
        total_ceiling_inr=total,
        status="Draft",
        notes=(payload.notes or
               f"Division self-prepared · {len(head_allocs)} heads · ₹{total:,.0f} · Auto ({source})"),
        participant_body_code=host_code,
        prepared_by_name=payload.prepared_by_name,
        role_flavour="Host",
    )
    await db.tournament_budgets.insert_one(tb.model_dump())
    return {
        "budget_id": tb.id,
        "budget_no": tb.budget_no,
        "body_code": host_code,
        "total_inr": total,
        "heads_count": len(head_allocs),
        "replaced": replaced_no,
        "source": source,
    }


@api_router.post("/tournament-budgets/{bid}/division-self-sanction")
async def division_self_sanction(
    bid: str,
    payload: DivisionSelfSanctionPayload,
    x_body_code: Optional[str] = Depends(principal_body_code),
):
    """Division locks its Draft into `Division_Sanctioned`. Only the host
    Division of a Division-owned tournament may call this."""
    b = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Budget not found")
    if b.get("status") not in ("Draft", "Revision_Requested"):
        raise HTTPException(400, f"Budget is in status {b.get('status')} — only Draft / Revision_Requested may be self-sanctioned.")
    t = await _assert_division_owned(b["tournament_id"])
    host = await _assert_host_division_caller(t, x_body_code)
    if b.get("body_id") != host:
        raise HTTPException(403, "You can only self-sanction your own body's budget.")

    now = datetime.now(timezone.utc).isoformat()
    await db.tournament_budgets.update_one(
        {"id": bid},
        {"$set": {
            "status": "Division_Sanctioned",
            "sanctioned_at": now,
            "sanctioned_by_name": payload.sanctioned_by_name,
            "notes": (b.get("notes") or "") + f" · Locked by {payload.sanctioned_by_name or host} on {now[:10]}",
        }},
    )
    updated = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    return {"budget": updated, "message": "Budget locked. You can now upload invoices against these heads."}


# ═════════════════════ Fix E · endpoint ═════════════════

@api_router.post("/tournaments/{tid}/finance/submit-reimbursement-claim")
async def submit_reimbursement_claim(
    tid: str,
    payload: SubmitReimbursementPayload,
    x_body_code: Optional[str] = Depends(principal_body_code),
):
    """Bundle all tournament_invoices → single GrantClaim → flip
    TournamentBudget to Submitted_To_MPCA. This is the single point where
    MPCA becomes visible for a Division-owned camp."""
    t = await _assert_division_owned(tid)
    host = await _assert_host_division_caller(t, x_body_code)
    cycle = t.get("fiscal_cycle") or "2026-27"

    # Pre-condition: a locked budget must exist for this (tid, host).
    budget = await db.tournament_budgets.find_one(
        {"tournament_id": tid, "body_id": host, "status": "Division_Sanctioned"},
        {"_id": 0}
    )
    if not budget:
        raise HTTPException(400, "Lock the camp budget first (Division_Sanctioned) before submitting a reimbursement claim.")

    # Collect invoices — accept anything from this tournament regardless of budget_id
    # since some invoices may have been logged before the budget was locked.
    invoices = await db.tournament_invoices.find(
        {"tournament_id": tid, "body_id": host},
        {"_id": 0}
    ).to_list(2000)
    if not invoices:
        raise HTTPException(400, "No invoices to bundle. Upload at least one invoice against a budget head before submitting.")

    total_claimed = 0.0
    invoice_ids: List[str] = []
    for inv in invoices:
        invoice_ids.append(inv.get("id"))
        try:
            total_claimed += float(inv.get("amount_inr") or 0)
        except (TypeError, ValueError):
            continue
    total_claimed = round(total_claimed, 2)

    ceiling = float(budget.get("total_ceiling_inr") or 0)
    if ceiling and total_claimed > ceiling * 1.05:
        # 5% cushion for rounding; hard block above that
        raise HTTPException(400, f"Claimed ₹{total_claimed:,.0f} exceeds sanctioned budget ₹{ceiling:,.0f} by more than 5%. Split the claim or request budget revision.")

    # Materialise a GrantClaim
    body = await db.bodies.find_one({"code": host}, {"_id": 0})
    claim_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    initial_status = "Submitted" if payload.signed_summary_url else "Documents_Pending"

    claim_doc = {
        "id": claim_id,
        "claim_ref": await _next_claim_ref(cycle),
        "scheme_code": "camp_reimbursement",
        "scheme_name": f"Camp Reimbursement · {t.get('name')}",
        "body_id": host,
        "body_name": (body or {}).get("name", host),
        "fiscal_cycle": cycle,
        "claimed_amount_inr": total_claimed,
        "status": initial_status,
        "documents": [],
        "extra_documents": [],
        "submitted_by": payload.submitted_by_name,
        "submitted_at": now if initial_status == "Submitted" else None,
        "purpose_of_claim": payload.purpose_of_claim or f"Reimbursement for {t.get('name')}",
        "signed_submission_url": payload.signed_summary_url,
        "signed_submission_at": now if payload.signed_summary_url else None,
        "signed_submission_by": payload.submitted_by_name if payload.signed_summary_url else None,
        "attached_tournament_id": tid,
        "attached_tournament_budget_id": budget.get("id"),
        "attached_invoice_ids": invoice_ids,
        "created_at": now,
        "updated_at": now,
        "mpca_comments": [],
    }
    await db.grant_claims.insert_one(claim_doc)

    # Flip budget
    await db.tournament_budgets.update_one(
        {"id": budget["id"]},
        {"$set": {
            "status": "Submitted_To_MPCA",
            "submitted_to_mpca_at": now,
            "submitted_to_mpca_by_name": payload.submitted_by_name,
            "grant_claim_id": claim_id,
        }},
    )

    return {
        "claim_id": claim_id,
        "claim_ref": claim_doc["claim_ref"],
        "budget_no": budget.get("budget_no"),
        "claimed_amount_inr": total_claimed,
        "invoice_count": len(invoice_ids),
        "status": initial_status,
        "message": "Reimbursement claim submitted. MPCA will now see this under Grant Claims.",
    }
