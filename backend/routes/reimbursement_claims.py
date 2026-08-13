"""Routes · Sprint T-RIM — Tournament Reimbursement Claims.

Division submits a claim at tournament completion. The system auto-generates a summary
sheet aggregating all approved invoices vs budget heads. MPCA Secretary reviews, adds
comments, approves (with optional lowered amount) or rejects.
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict

from core.infra import db, api_router
from core.shared_services import next_seq  # H6 · atomic sequence
from core.scoping import get_scope, body_scope
from core.helpers import _create_notification
from models import (
    TournamentReimbursementClaim, TournamentReimbursementCreate,
    TournamentReimbursementAction, TournamentReimbursementStatus,
    ReimbursementComment, ApprovalStep,
)


# ═══════════════════ Helpers ═══════════════════

async def _next_claim_ref(cycle: str) -> str:
    seq = await next_seq(f"treimb:{cycle}", lambda: db.tournament_reimbursement_claims.count_documents({"fiscal_cycle": cycle}))
    return f"TRC-{cycle}-{seq:04d}"


async def _compute_summary(tournament_id: str, body_id: str) -> dict:
    """Build the summary sheet: all invoices + extra-expense approvals for this
    tournament + body, aggregated per budget head."""
    tournament = await db.tournaments.find_one({"id": tournament_id}, {"_id": 0})
    budget_id = (tournament or {}).get("auto_budget_id")
    tb = None
    if budget_id:
        tb = await db.tournament_budgets.find_one({"id": budget_id}, {"_id": 0})
    if not tb:
        # Fallback: latest Approved budget for this tournament+body
        tb = await db.tournament_budgets.find_one(
            {"tournament_id": tournament_id, "body_id": body_id, "status": "Approved"},
            {"_id": 0}, sort=[("created_at", -1)],
        )
    if not tb:
        # Second fallback: latest budget of any status
        tb = await db.tournament_budgets.find_one(
            {"tournament_id": tournament_id, "body_id": body_id},
            {"_id": 0}, sort=[("created_at", -1)],
        )

    invoices = await db.tournament_invoices.find({
        "tournament_id": tournament_id,
        "body_id": body_id,
        "status": {"$in": ["Approved", "Submitted"]},
    }, {"_id": 0}).to_list(500)

    extras = await db.extra_expense_requests.find({
        "tournament_id": tournament_id,
        "body_id": body_id,
        "status": "Approved",
    }, {"_id": 0}).to_list(200)

    # M37 · Approved DA forms for this tournament — bundled into the Division's claim
    # (No separate MPCA approval for DA; Division-approved DAs auto-attach here)
    da_forms = await db.match_official_da.find({
        "tournament_id": tournament_id,
        "status": "Approved",
    }, {"_id": 0}).to_list(500)
    da_total = float(sum((d.get("total_inr") or 0) for d in da_forms))

    heads_ref = (tb or {}).get("approved_head_allocations") or (tb or {}).get("head_allocations") or []
    head_index = {h.get("head"): float(h.get("limit_inr") or 0) for h in heads_ref}

    spent_by_head: dict = {}
    invoiced_total = 0.0
    for inv in invoices:
        invoiced_total += float(inv.get("total_inr") or 0)
        allocs = inv.get("allocations") or []
        if allocs:
            for a in allocs:
                lbl = a.get("head_label") or a.get("head_code") or "Unallocated"
                spent_by_head[lbl] = spent_by_head.get(lbl, 0.0) + float(a.get("amount_inr") or 0)
        else:
            # legacy invoice — fall back to single head
            lbl = inv.get("budget_head_code") or "Unallocated"
            spent_by_head[lbl] = spent_by_head.get(lbl, 0.0) + float(inv.get("total_inr") or 0)

    extra_approved_total = float(sum((e.get("approved_amount_inr") or 0) for e in extras))

    rows = []
    grand_over = 0.0
    grand_eligible = 0.0
    for h in heads_ref:
        label = h.get("head")
        limit = float(h.get("limit_inr") or 0)
        spent = spent_by_head.get(label, 0.0)
        over = max(0.0, spent - limit)
        eligible = min(spent, limit) if limit > 0 else spent
        grand_over += over
        grand_eligible += eligible
        rows.append({
            "head": label,
            "limit_inr": round(limit, 2),
            "spent_inr": round(spent, 2),
            "over_inr": round(over, 2),
            "eligible_inr": round(eligible, 2),
            "utilisation_pct": round(spent * 100.0 / limit, 1) if limit > 0 else 0.0,
        })
    # Unmatched heads (spent without limit)
    for label, spent in spent_by_head.items():
        if label not in head_index:
            grand_eligible += spent  # no limit → all eligible under contingency
            rows.append({
                "head": label,
                "limit_inr": 0.0,
                "spent_inr": round(spent, 2),
                "over_inr": 0.0,
                "eligible_inr": round(spent, 2),
                "utilisation_pct": 0.0,
                "unmatched": True,
            })

    budget_total = float((tb or {}).get("approved_total_inr") or (tb or {}).get("total_ceiling_inr") or 0)
    return {
        "budget_total_inr": round(budget_total, 2),
        "invoiced_total_inr": round(invoiced_total, 2),
        "eligible_total_inr": round(grand_eligible + da_total, 2),
        "over_budget_inr": round(grand_over, 2),
        "extra_expense_approved_inr": round(extra_approved_total, 2),
        "invoice_count": len(invoices),
        "extra_expense_count": len(extras),
        # M37 · DA (Match Officials) rollup
        "da_total_inr": round(da_total, 2),
        "da_form_count": len(da_forms),
        "heads": rows,
    }


# ═══════════════════ Read ═══════════════════

@api_router.get("/tournaments/{tid}/spent-by-head")
async def spent_by_head(tid: str, body_id: str, request: Request):
    """M39z.c · Live per-head spend tally for a Division on a tournament.

    Runs the same aggregation shape as `_compute_summary` but is
    (a) lightweight, (b) claim-independent, (c) counts every invoice that
    isn't Rejected (so Divisions see budget consumption LIVE as they upload
    Draft bills — not only after MPCA approves them).

    Scope guard: Divisions/Districts can only pull their own body's numbers;
    MPCA (State) can pull any body's numbers for audit.
    """
    scope = get_scope(request)
    if not scope.is_state and scope.body_code and scope.body_code != body_id:
        raise HTTPException(403, "You can only view your own body's spend.")

    tb = await db.tournament_budgets.find_one(
        {"tournament_id": tid, "body_id": body_id,
         "status": {"$in": ["Approved", "Accepted_By_Division", "Sent_To_Division"]}},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if not tb:
        tb = await db.tournament_budgets.find_one(
            {"tournament_id": tid, "body_id": body_id},
            {"_id": 0}, sort=[("created_at", -1)],
        )
    heads_ref = (tb or {}).get("approved_head_allocations") or (tb or {}).get("head_allocations") or []
    head_index = {h.get("head"): float(h.get("limit_inr") or 0) for h in heads_ref}

    invoices = await db.tournament_invoices.find({
        "tournament_id": tid, "body_id": body_id,
        "status": {"$in": ["Draft", "Submitted", "Approved"]},  # M39z.c · live tally
    }, {"_id": 0}).to_list(500)

    spent_by_head_map: dict = {}
    invoiced_total = 0.0
    for inv in invoices:
        invoiced_total += float(inv.get("total_inr") or inv.get("amount_inr") or 0)
        allocs = inv.get("allocations") or []
        if allocs:
            for a in allocs:
                lbl = a.get("head_label") or a.get("head_code") or "Unallocated"
                spent_by_head_map[lbl] = spent_by_head_map.get(lbl, 0.0) + float(a.get("amount_inr") or 0)
        else:
            lbl = inv.get("budget_head_code") or "Unallocated"
            spent_by_head_map[lbl] = spent_by_head_map.get(lbl, 0.0) + float(inv.get("total_inr") or inv.get("amount_inr") or 0)

    rows = []
    grand_over = 0.0
    grand_eligible = 0.0
    for h in heads_ref:
        label = h.get("head")
        limit = float(h.get("limit_inr") or 0)
        spent = spent_by_head_map.get(label, 0.0)
        over = max(0.0, spent - limit)
        eligible = min(spent, limit) if limit > 0 else spent
        grand_over += over
        grand_eligible += eligible
        rows.append({
            "head": label,
            "limit_inr": round(limit, 2),
            "spent_inr": round(spent, 2),
            "over_inr": round(over, 2),
            "eligible_inr": round(eligible, 2),
            "utilisation_pct": round(spent * 100.0 / limit, 1) if limit > 0 else 0.0,
        })
    for label, spent in spent_by_head_map.items():
        if label not in head_index:
            grand_eligible += spent
            rows.append({
                "head": label, "limit_inr": 0.0, "spent_inr": round(spent, 2),
                "over_inr": 0.0, "eligible_inr": round(spent, 2),
                "utilisation_pct": 0.0, "unmatched": True,
            })

    budget_total = float((tb or {}).get("approved_total_inr") or (tb or {}).get("total_ceiling_inr") or 0)
    return {
        "tournament_id": tid, "body_id": body_id,
        "budget_total_inr": round(budget_total, 2),
        "invoiced_total_inr": round(invoiced_total, 2),
        "eligible_total_inr": round(grand_eligible, 2),
        "over_budget_inr": round(grand_over, 2),
        "heads": rows,
    }


@api_router.get("/reimbursement-claims", response_model=List[TournamentReimbursementClaim])
async def list_claims(
    request: Request,
    tournament_id: Optional[str] = None,
    body_id: Optional[str] = None,
    status: Optional[TournamentReimbursementStatus] = None,
    fiscal_cycle: Optional[str] = None,
    route_to_body_id: Optional[str] = None,    # M39z.d · filter by review destination
    is_master: Optional[bool] = None,          # M39z.d · true = only Division master claims
    exclude_consolidated: Optional[bool] = None,  # M39z.d · hide child District claims that are already rolled into a master
    skip: int = 0,
    limit: int = 500,
):
    q: dict = {}
    if tournament_id: q["tournament_id"] = tournament_id
    scope = get_scope(request)
    if body_id:
        q["body_id"] = body_id
    elif route_to_body_id and scope.body_code and route_to_body_id == scope.body_code:
        # M39z.e · Reviewer-scope. When the caller asks for claims routed TO
        # themselves, they're acting as reviewer (e.g. Division reviewing
        # District claims). Return claims where body_id belongs to any body
        # AND route_to_body_id == caller.
        # (route_to_body_id filter applied below covers the routing side.)
        pass
    else:
        # M13: MPCA sees all claims (they need to review), lower bodies see their own only
        q.update(body_scope(scope))
    if status: q["status"] = status
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    if route_to_body_id: q["route_to_body_id"] = route_to_body_id
    if is_master is True:
        q["is_master"] = True
    elif is_master is False:
        q["is_master"] = {"$ne": True}
    if exclude_consolidated:
        q["parent_claim_id"] = None
    docs = await db.tournament_reimbursement_claims.find(q, {"_id": 0}).sort("created_at", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    return docs


@api_router.get("/reimbursement-claims/{cid}", response_model=TournamentReimbursementClaim)
async def get_claim(cid: str):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    return doc


@api_router.get("/tournaments/{tid}/reimbursement-preview")
async def preview_reimbursement(tid: str, body_id: str):
    """Live preview of the summary sheet — used before Submit."""
    return {
        "tournament_id": tid,
        "body_id": body_id,
        "summary": await _compute_summary(tid, body_id),
    }


# ═══════════════════ Create / Submit ═══════════════════

@api_router.post("/reimbursement-claims", response_model=TournamentReimbursementClaim)
async def create_claim(payload: TournamentReimbursementCreate):
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body '{payload.body_id}' not found")
    # Idempotency: one Draft/Submitted claim per (tournament, body, cycle)
    existing = await db.tournament_reimbursement_claims.find_one({
        "tournament_id": payload.tournament_id,
        "body_id": payload.body_id,
        "fiscal_cycle": payload.fiscal_cycle,
        "status": {"$in": ["Draft", "Submitted", "Under_Review", "Approved"]},
    }, {"_id": 0})
    if existing:
        raise HTTPException(409, f"A {existing['status']} reimbursement claim already exists for this tournament.")

    claim_ref = await _next_claim_ref(payload.fiscal_cycle)
    payload_dict = payload.model_dump()
    # Prefer explicit scheme_code from payload, then tournament, then fallback
    payload_dict["scheme_code"] = payload.scheme_code or t.get("scheme_code")
    # M26 Phase B · auto-link to participant row
    if not payload_dict.get("participant_body_code"):
        from routes.tournament_participations import resolve_participant_body_code
        payload_dict["participant_body_code"] = await resolve_participant_body_code(
            payload.tournament_id, payload.body_id
        )
    claim = TournamentReimbursementClaim(
        claim_ref=claim_ref,
        tournament_name=t.get("name"),
        body_name=body.get("name"),
        **payload_dict,
    )
    await db.tournament_reimbursement_claims.insert_one(claim.model_dump())
    if claim.participant_body_code:
        from routes.tournament_participations import link_claim_to_participant
        await link_claim_to_participant(payload.tournament_id, claim.participant_body_code, claim.id)
    return claim


@api_router.post("/reimbursement-claims/{cid}/submit", response_model=TournamentReimbursementClaim)
async def submit_claim(cid: str, action: TournamentReimbursementAction):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, f"Cannot submit from status '{doc['status']}'")
    # M39m · Signed-PDF gate — Division must download the summary PDF, sign it,
    # and upload it before final submission to MPCA. Prevents unsigned claims.
    if not doc.get("signed_pdf_url"):
        raise HTTPException(
            412,
            "Please download the claim summary PDF, get it signed by the Hon. "
            "Secretary and Treasurer, and upload the signed copy before "
            "submitting.",
        )

    # M39z.d · Route determination is driven by tournament ownership, not by
    # persona parent-links.
    #   · MPCA-owned tournament (host="MPCA", e.g. Inter-Division):
    #        - only Divisions can claim; they route upward to MPCA.
    #        - Districts CANNOT claim (they don't participate at all).
    #   · Division-owned tournament (host="DIV-XXX", e.g. Inter-District, Clubs):
    #        - Districts under that Division claim → route to host Division.
    #        - Host Division claims their own admin spend (or their consolidated
    #          master) → route upward to MPCA.
    #        - Districts under a *different* Division cannot claim here.
    t = await db.tournaments.find_one({"id": doc["tournament_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    host = t.get("host_body_id") or "MPCA"

    body = await db.bodies.find_one({"code": doc["body_id"]}, {"_id": 0})
    body_type = (body or {}).get("body_type") or "Division"

    if body_type == "District":
        if not host.startswith("DIV-"):
            raise HTTPException(
                422,
                "Districts do not participate in MPCA-owned tournaments. This "
                "tournament is hosted by MPCA — the claim can only be raised "
                "by a Division here.",
            )
        parent_div = (body or {}).get("parent_code")
        if parent_div != host:
            raise HTTPException(
                422,
                f"Districts can only claim on tournaments hosted by their "
                f"parent Division. This tournament is hosted by '{host}' but "
                f"your parent Division is '{parent_div}'.",
            )
        route_to = host                       # host Division is the reviewer
        review_stage = "Division"
        notify_recipient_role = "division-secretary"
        notify_recipient_body = host
    else:
        # Division claim — always routes upward to MPCA whether it's their own
        # (on MPCA-owned) or their consolidated master (on Division-owned).
        route_to = "MPCA"
        review_stage = "MPCA"
        notify_recipient_role = "secretary"
        notify_recipient_body = "MPCA"

    # Compute summary at submit time
    summary = await _compute_summary(doc["tournament_id"], doc["body_id"])
    invoices = await db.tournament_invoices.find({
        "tournament_id": doc["tournament_id"],
        "body_id": doc["body_id"],
        "status": {"$in": ["Approved", "Submitted"]},
    }, {"_id": 0}).to_list(500)
    extras = await db.extra_expense_requests.find({
        "tournament_id": doc["tournament_id"],
        "body_id": doc["body_id"],
        "status": "Approved",
    }, {"_id": 0}).to_list(200)
    da_forms = await db.match_official_da.find({
        "tournament_id": doc["tournament_id"], "status": "Approved",
    }, {"_id": 0}).to_list(500)

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Submitted", actor_post=action.actor_role,
        actor_name=action.actor_name, actor_body_id=action.actor_body_id,
        decision="Submitted",
        notes=f"Routed to {route_to} for review. {action.notes or ''}".strip(),
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "status": "Submitted",
        "route_to_body_id": route_to,
        "review_stage": review_stage,
        "summary": summary,
        "invoice_ids": [i["id"] for i in invoices],
        "extra_expense_ids": [e["id"] for e in extras],
        "da_form_ids": [d["id"] for d in da_forms],
        "submitted_by": action.actor_name,
        "submitted_at": now,
        "approval_chain": chain,
        "updated_at": now,
    }})

    # Notify the reviewing body (Division for District claims, MPCA for Division claims)
    await _create_notification(
        recipient_role_id=notify_recipient_role, recipient_body_id=notify_recipient_body,
        title=f"Reimbursement claim submitted · {doc.get('tournament_name')}",
        message=(f"{doc['claim_ref']} · {doc.get('body_name')} · "
                 f"Eligible ₹{summary['eligible_total_inr']:,.0f}"),
        link=f"/reimbursement-claims/{cid}",
        related_type="reimbursement_claim", related_id=cid,
        severity="info", kind="info",
    )
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/reimbursement-claims/{cid}/signed-pdf", response_model=TournamentReimbursementClaim)
async def upload_signed_pdf(cid: str, payload: dict):
    """M39m · Division uploads the physically-signed claim summary PDF. This
    unlocks the Submit-to-MPCA action. payload = {signed_pdf_url, uploaded_by}"""
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, "Can only attach a signed PDF while the claim is in Draft or Rejected state.")
    url = (payload or {}).get("signed_pdf_url")
    if not url:
        raise HTTPException(400, "signed_pdf_url is required")
    now = datetime.now(timezone.utc).isoformat()
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "signed_pdf_url": url,
        "signed_pdf_uploaded_at": now,
        "signed_pdf_uploaded_by": (payload or {}).get("uploaded_by"),
        "updated_at": now,
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/reimbursement-claims/{cid}/start-review", response_model=TournamentReimbursementClaim)
async def start_review(cid: str, action: TournamentReimbursementAction):
    """MPCA Secretary opens the claim → status Under_Review."""
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted",):
        raise HTTPException(409, f"Cannot start review from status '{doc['status']}'")
    step = ApprovalStep(
        stage="Under_Review", actor_post=action.actor_role,
        actor_name=action.actor_name, actor_body_id=action.actor_body_id,
        decision="Under_Review", notes=action.notes,
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "status": "Under_Review",
        "approval_chain": chain,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


# ═══════════════════ MPCA-168 v2 · Head-Level Deductions ═══════════════════

class DeductionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    head: str
    amount_inr: float
    reason: Optional[str] = None


@api_router.post("/reimbursement-claims/{cid}/deduction", response_model=TournamentReimbursementClaim)
async def add_deduction(cid: str, payload: DeductionPayload, request: Request):
    """MPCA adds a deduction row against a budget head."""
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    scope = get_scope(request)
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA may add deductions.")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Deductions available only on Submitted/Under_Review claims (current: {doc['status']}).")
    if payload.amount_inr <= 0:
        raise HTTPException(422, "Deduction amount must be greater than zero.")
    head = (payload.head or "").strip()
    if not head:
        raise HTTPException(422, "Head is required.")

    # MPCA-168-v3 · No hard cap on deduction amounts. MPCA has full discretion
    # to record deductions against any budgeted or spent head — Accepted display
    # already clamps at zero in the review UI.

    from models import MpcaHeadDeduction
    row = MpcaHeadDeduction(
        head=head,
        amount_inr=round(float(payload.amount_inr), 2),
        reason=(payload.reason or "").strip() or None,
    ).model_dump()
    now = datetime.now(timezone.utc).isoformat()
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {
        "$push": {"mpca_deductions": row},
        "$set": {"status": "Under_Review" if doc["status"] == "Submitted" else doc["status"], "updated_at": now},
    })
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.delete("/reimbursement-claims/{cid}/deduction/{ded_id}", response_model=TournamentReimbursementClaim)
async def remove_deduction(cid: str, ded_id: str, request: Request):
    scope = get_scope(request)
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA may remove deductions.")
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    remaining = [d for d in (doc.get("mpca_deductions") or []) if d.get("id") != ded_id]
    if len(remaining) == len(doc.get("mpca_deductions") or []):
        raise HTTPException(404, "Deduction not found on this claim.")
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "mpca_deductions": remaining,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


# ═══════════════════ MPCA-168 · Line-item review (LEGACY) ═══════════════════

class InvoiceReviewPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    invoice_id: str
    accepted_inr: float
    reason: Optional[str] = None
    reviewed_by: Optional[str] = None


@api_router.post("/reimbursement-claims/{cid}/invoice-review", response_model=TournamentReimbursementClaim)
async def set_invoice_review(cid: str, payload: InvoiceReviewPayload, request: Request):
    """MPCA marks how much they accept from a single invoice on the claim.
    Called repeatedly (one call per invoice) as MPCA walks the review."""
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    scope = get_scope(request)
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA may record invoice acceptance decisions.")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(
            409,
            f"Line-item review is available only on Submitted / Under_Review claims (current: {doc['status']}).",
        )
    if payload.invoice_id not in (doc.get("invoice_ids") or []):
        raise HTTPException(404, "That invoice is not on this claim.")
    if payload.accepted_inr < 0:
        raise HTTPException(422, "Accepted amount cannot be negative.")

    # Cap: MPCA cannot accept more than what the invoice actually totals.
    inv = await db.tournament_invoices.find_one({"id": payload.invoice_id}, {"_id": 0})
    inv_total = float((inv or {}).get("total_inr") or 0)
    if payload.accepted_inr > inv_total + 0.5:
        raise HTTPException(
            422,
            f"Accepted amount ₹{payload.accepted_inr:,.0f} exceeds invoice total ₹{inv_total:,.0f}.",
        )

    now = datetime.now(timezone.utc).isoformat()
    reviews = list(doc.get("mpca_invoice_reviews") or [])
    reviews = [r for r in reviews if r.get("invoice_id") != payload.invoice_id]
    reviews.append({
        "invoice_id": payload.invoice_id,
        "accepted_inr": round(float(payload.accepted_inr), 2),
        "reason": (payload.reason or "").strip() or None,
        "reviewed_by": payload.reviewed_by,
        "reviewed_at": now,
    })
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "mpca_invoice_reviews": reviews,
        "status": "Under_Review" if doc["status"] == "Submitted" else doc["status"],
        "updated_at": now,
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.delete("/reimbursement-claims/{cid}/invoice-review/{invoice_id}", response_model=TournamentReimbursementClaim)
async def clear_invoice_review(cid: str, invoice_id: str, request: Request):
    scope = get_scope(request)
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA may clear invoice acceptance decisions.")
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    reviews = [r for r in (doc.get("mpca_invoice_reviews") or []) if r.get("invoice_id") != invoice_id]
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "mpca_invoice_reviews": reviews,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.get("/reimbursement-claims/{cid}/review-summary")
async def get_review_summary(cid: str):
    """Per-head summary: Budget / Spent by Division / Accepted by MPCA.
    Used by the ClaimsPanel MPCA review table AND the MPCA Review PDF."""
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")

    # Group invoices by head allocation → sum spent + accepted per head
    invoice_ids = doc.get("invoice_ids") or []
    invoices = await db.tournament_invoices.find({"id": {"$in": invoice_ids}}, {"_id": 0}).to_list(500)
    # MPCA-168 fix · When the claim is still Draft (empty invoice_ids), fall
    # back to the tournament's live invoices for this body so the Division PDF
    # + review summary reflect the actual spending shown on the Budget & Extras
    # tracker widget. Once the claim is Submitted, `invoice_ids` is authoritative.
    if not invoices:
        invoices = await db.tournament_invoices.find({
            "tournament_id": doc["tournament_id"],
            "body_id": doc["body_id"],
            "status": {"$in": ["Draft", "Submitted", "Approved"]},
        }, {"_id": 0}).to_list(500)
    reviews_by_iid = {r["invoice_id"]: r for r in (doc.get("mpca_invoice_reviews") or [])}

    per_head: Dict[str, Dict[str, float]] = {}
    def _bump(head_label, spent, accepted):
        row = per_head.setdefault(head_label, {"head": head_label, "budget_inr": 0.0, "spent_inr": 0.0, "accepted_inr": 0.0, "reviewed": True})
        row["spent_inr"] += float(spent or 0)
        row["accepted_inr"] += float(accepted or 0)

    invoice_lines: List[dict] = []
    all_reviewed = True

    # MPCA-168 v2 · Aggregate deductions per head (case/whitespace tolerant).
    ded_by_head: Dict[str, float] = {}
    for d in (doc.get("mpca_deductions") or []):
        key = (d.get("head") or "").strip()
        if not key:
            continue
        ded_by_head[key] = ded_by_head.get(key, 0.0) + float(d.get("amount_inr") or 0)

    for inv in invoices:
        r = reviews_by_iid.get(inv["id"])
        accepted_full = float(r["accepted_inr"]) if r else 0.0
        if not r:
            all_reviewed = False
        allocs = inv.get("allocations") or []
        if allocs:
            inv_total = sum(float(a.get("amount_inr") or 0) for a in allocs) or 1.0
            for a in allocs:
                head_label = a.get("head_label") or a.get("head_code") or "—"
                spent_here = float(a.get("amount_inr") or 0)
                acc_here = round(accepted_full * (spent_here / inv_total), 2) if r else 0.0
                _bump(head_label, spent_here, acc_here)
        else:
            _bump(inv.get("budget_head_code") or "—", inv.get("total_inr"), accepted_full)
        invoice_lines.append({
            "invoice_id": inv["id"],
            "invoice_ref": inv.get("invoice_ref"),
            "vendor_name": inv.get("vendor_name"),
            "invoice_date": inv.get("invoice_date"),
            "total_inr": float(inv.get("total_inr") or 0),
            "eligible_for_grant_inr": float(inv.get("eligible_for_grant_inr") or 0),
            "allocations": allocs,
            "accepted_inr": accepted_full if r else None,
            "reason": (r or {}).get("reason"),
            "reviewed": bool(r),
        })

    # Overlay budget totals per head from the approved budget
    try:
        tb = await db.tournament_budgets.find_one({
            "tournament_id": doc["tournament_id"],
            "body_id": doc["body_id"],
            "status": "Approved",
        }, {"_id": 0}, sort=[("created_at", -1)])
    except Exception:
        tb = None
    for h in ((tb or {}).get("approved_head_allocations") or (tb or {}).get("head_allocations") or []):
        row = per_head.setdefault(h.get("head") or "—", {"head": h.get("head") or "—", "budget_inr": 0.0, "spent_inr": 0.0, "accepted_inr": 0.0})
        row["budget_inr"] = float(h.get("limit_inr") or 0)

    # MPCA-168 v2 · Overlay deductions → recompute accepted_inr per head.
    # New model: accepted = spent − Σ deductions (invoice-level reviews ignored).
    for row in per_head.values():
        deducted = ded_by_head.get(row["head"], 0.0)
        row["deducted_inr"] = round(deducted, 2)
        row["accepted_inr"] = round(max((row.get("spent_inr") or 0) - deducted, 0.0), 2)

    heads = sorted(per_head.values(), key=lambda x: x.get("head") or "")
    # MPCA-168 · Also surface invoice-level totals so the Division PDF's
    # "Summary of Claim" block reflects the LIVE spending on a Draft claim
    # (before the invoice_ids array on the claim doc has been populated).
    live_invoiced_total = round(sum(float(i.get("total_inr") or 0) for i in invoices), 2)
    live_eligible_total = round(sum(float(i.get("eligible_for_grant_inr") or 0) for i in invoices), 2)
    live_over_total = round(sum(float(i.get("ineligible_for_grant_inr") or 0) for i in invoices), 2)

    return {
        "claim_id": cid,
        "claim_ref": doc.get("claim_ref"),
        "tournament_name": doc.get("tournament_name"),
        "body_id": doc.get("body_id"),
        "body_name": doc.get("body_name"),
        "invoice_count": len(invoices),
        "invoices_reviewed": sum(1 for i in invoice_lines if i["reviewed"]),
        "all_reviewed": all_reviewed and bool(invoices),
        "heads": [
            {**h, "difference_inr": round((h.get("budget_inr") or 0) - (h.get("spent_inr") or 0), 2)}
            for h in heads
        ],
        "totals": {
            "budget_inr": round(sum(h.get("budget_inr") or 0 for h in heads), 2),
            "spent_inr": round(sum(h.get("spent_inr") or 0 for h in heads), 2),
            "accepted_inr": round(sum(h.get("accepted_inr") or 0 for h in heads), 2),
        },
        "live_invoice_totals": {
            "invoiced_total_inr": live_invoiced_total,
            "eligible_total_inr": live_eligible_total,
            "over_budget_inr": live_over_total,
            "invoice_count": len(invoices),
        },
        "invoices": invoice_lines,
        "mpca_deductions": doc.get("mpca_deductions") or [],
        "mpca_signed_pdf_url": doc.get("mpca_signed_pdf_url"),
        "division_head_remarks": doc.get("division_head_remarks") or {},
    }


class DivisionHeadRemarkPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    head: str
    remark: Optional[str] = None            # None or "" removes the remark


@api_router.post("/reimbursement-claims/{cid}/head-remark", response_model=TournamentReimbursementClaim)
async def set_division_head_remark(cid: str, payload: DivisionHeadRemarkPayload, request: Request):
    """Division records a free-text remark against one budget head. Any
    persona from the claiming body may write. MPCA can also edit (audit).
    Draft/Submitted/Under_Review claims may edit; Approved/Rejected are frozen."""
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    scope = get_scope(request)
    if not scope.is_state and scope.body_code and scope.body_code != doc.get("body_id"):
        raise HTTPException(403, "You can only add remarks to your own body's claim.")
    if doc["status"] in ("Approved", "Rejected"):
        raise HTTPException(409, f"Remarks cannot be edited on a {doc['status']} claim.")

    remarks = dict(doc.get("division_head_remarks") or {})
    clean = (payload.remark or "").strip()
    if clean:
        remarks[payload.head] = clean
    else:
        remarks.pop(payload.head, None)
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "division_head_remarks": remarks,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


class MpcaSignedPdfPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    signed_pdf_url: str
    uploaded_by: Optional[str] = None


@api_router.post("/reimbursement-claims/{cid}/mpca-signed-pdf", response_model=TournamentReimbursementClaim)
async def upload_mpca_signed_pdf(cid: str, payload: MpcaSignedPdfPayload, request: Request):
    scope = get_scope(request)
    if not scope.is_state:
        raise HTTPException(403, "Only MPCA may upload the MPCA-signed decision PDF.")
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot upload MPCA-signed PDF from status '{doc['status']}'")
    now = datetime.now(timezone.utc).isoformat()
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "mpca_signed_pdf_url": payload.signed_pdf_url,
        "mpca_signed_pdf_uploaded_at": now,
        "mpca_signed_pdf_uploaded_by": payload.uploaded_by,
        "status": "Under_Review" if doc["status"] == "Submitted" else doc["status"],
        "updated_at": now,
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/reimbursement-claims/{cid}/approve", response_model=TournamentReimbursementClaim)
async def approve_claim(cid: str, action: TournamentReimbursementAction, request: Request):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot approve from status '{doc['status']}'")

    # M39z.d · Route-authority guard. Only the routed body may approve:
    #   · District claim (route_to_body_id = parent Division) → only that
    #     Division (or MPCA as fallback) may approve.
    #   · Division claim (route_to_body_id = "MPCA") → only MPCA.
    route_to = doc.get("route_to_body_id") or "MPCA"
    scope = get_scope(request)
    if scope.body_code and scope.body_code != route_to and not scope.is_state:
        raise HTTPException(
            403,
            f"This claim is routed to {route_to} for review. "
            f"You are scoped to {scope.body_code} and cannot approve it.",
        )

    # MPCA-168 v3 · MPCA has full discretion on the approved amount. If they
    # supply an explicit `approved_amount_inr` we use it; otherwise we default
    # to Spent − Σ Deductions (or the legacy invoice-review sum, or eligible).
    eligible = float((doc.get("summary") or {}).get("eligible_total_inr") or 0)
    deductions = doc.get("mpca_deductions") or []
    invoice_reviews = doc.get("mpca_invoice_reviews") or []
    if deductions and route_to == "MPCA":
        # Compute total spent live from invoices
        invoices = await db.tournament_invoices.find({
            "tournament_id": doc["tournament_id"],
            "body_id": doc["body_id"],
            "status": {"$in": ["Draft", "Submitted", "Approved"]},
        }, {"_id": 0}).to_list(500)
        total_spent = round(sum(float(i.get("total_inr") or 0) for i in invoices), 2)
        total_deducted = round(sum(float(d.get("amount_inr") or 0) for d in deductions), 2)
        default_approved = round(max(total_spent - total_deducted, 0.0), 2)
        approved = float(action.approved_amount_inr) if action.approved_amount_inr is not None else default_approved
        if not doc.get("mpca_signed_pdf_url"):
            raise HTTPException(400, "Please sign the MPCA Review PDF and upload it back before approving.")
    elif invoice_reviews and route_to == "MPCA":
        # Legacy path — kept for backward compat with earlier claims.
        invoice_ids = set(doc.get("invoice_ids") or [])
        reviewed_ids = {r.get("invoice_id") for r in invoice_reviews}
        missing = invoice_ids - reviewed_ids
        if missing:
            raise HTTPException(400, f"{len(missing)} invoice(s) still need MPCA acceptance before the claim can be approved.")
        if not doc.get("mpca_signed_pdf_url"):
            raise HTTPException(400, "Please sign the MPCA Review PDF and upload it back before approving.")
        default_approved = round(sum(float(r.get("accepted_inr") or 0) for r in invoice_reviews), 2)
        approved = float(action.approved_amount_inr) if action.approved_amount_inr is not None else default_approved
    else:
        approved = float(action.approved_amount_inr) if action.approved_amount_inr is not None else eligible

    if approved < 0:
        raise HTTPException(422, "Approved amount cannot be negative")
    # MPCA-168-v3 · No hard eligible cap. MPCA may approve any amount (deductions
    # are the formal reduction mechanism now). Only guard against negatives.

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Approved", actor_post=action.actor_role,
        actor_name=action.actor_name, actor_body_id=action.actor_body_id,
        decision="Sanctioned",
        notes=f"Approved ₹{approved:,.0f} of eligible ₹{eligible:,.0f}. {action.notes or ''}".strip(),
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "status": "Approved",
        "approved_amount_inr": approved,
        "reviewed_by": action.actor_name,
        "reviewed_at": now,
        "approval_chain": chain,
        "updated_at": now,
    }})

    # Notify the submitting body (Division for District claim, Division for its own)
    await _create_notification(
        recipient_role_id="division-secretary" if (doc.get("review_stage") == "MPCA") else "district-secretary",
        recipient_body_id=doc["body_id"],
        title=f"Reimbursement APPROVED · {doc['claim_ref']}",
        message=f"₹{approved:,.0f} approved by {action.actor_name} for {doc.get('tournament_name')}",
        link=f"/reimbursement-claims/{cid}",
        related_type="reimbursement_claim", related_id=cid,
        severity="info", kind="info",
    )
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/reimbursement-claims/{cid}/reject", response_model=TournamentReimbursementClaim)
async def reject_claim(cid: str, action: TournamentReimbursementAction, request: Request):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot reject from status '{doc['status']}'")
    if not action.notes:
        raise HTTPException(400, "Rejection reason required in notes")

    # M39z.d · Same route-authority guard as approve
    route_to = doc.get("route_to_body_id") or "MPCA"
    scope = get_scope(request)
    if scope.body_code and scope.body_code != route_to and not scope.is_state:
        raise HTTPException(
            403,
            f"This claim is routed to {route_to} for review. "
            f"You are scoped to {scope.body_code} and cannot reject it.",
        )

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Rejected", actor_post=action.actor_role,
        actor_name=action.actor_name, actor_body_id=action.actor_body_id,
        decision="Rejected", notes=action.notes,
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "status": "Rejected",
        "rejection_reason": action.notes,
        "reviewed_by": action.actor_name,
        "reviewed_at": now,
        "approval_chain": chain,
        "updated_at": now,
    }})
    await _create_notification(
        recipient_role_id="division-secretary" if (doc.get("review_stage") == "MPCA") else "district-secretary",
        recipient_body_id=doc["body_id"],
        title=f"Reimbursement REJECTED · {doc['claim_ref']}",
        message=action.notes,
        link=f"/reimbursement-claims/{cid}",
        related_type="reimbursement_claim", related_id=cid,
        severity="warning", kind="info",
    )
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


# ═══════════════════ Consolidator (M39z.d) ═══════════════════

class ConsolidatePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    division_body_id: str
    fiscal_cycle: str = "2025-26"
    actor_name: str
    actor_role: Optional[str] = None


@api_router.get("/reimbursement-claims/consolidator/preview")
async def preview_consolidator(tournament_id: str, division_body_id: str, fiscal_cycle: str = "2025-26"):
    """M39z.d · Preview what a Division consolidation will roll up.

    Returns every Approved District claim (parent_code == division_body_id)
    that has not yet been consolidated + the Division's own claim (if any).
    The Division uses this to decide when to finalise the master.
    """
    districts = await db.bodies.find({
        "body_type": "District", "parent_code": division_body_id,
    }, {"_id": 0}).to_list(200)
    dist_codes = [d["code"] for d in districts]
    child_docs = await db.tournament_reimbursement_claims.find({
        "tournament_id": tournament_id,
        "fiscal_cycle": fiscal_cycle,
        "body_id": {"$in": dist_codes},
        "route_to_body_id": division_body_id,
        "status": "Approved",
        "parent_claim_id": None,
    }, {"_id": 0}).to_list(500)

    own = await db.tournament_reimbursement_claims.find_one({
        "tournament_id": tournament_id,
        "body_id": division_body_id,
        "fiscal_cycle": fiscal_cycle,
    }, {"_id": 0}, sort=[("created_at", -1)])

    return {
        "tournament_id": tournament_id,
        "division_body_id": division_body_id,
        "approved_child_count": len(child_docs),
        "child_claims": [{
            "id": c["id"], "claim_ref": c["claim_ref"], "body_id": c["body_id"],
            "body_name": c.get("body_name"),
            "approved_amount_inr": c.get("approved_amount_inr") or 0,
            "eligible_total_inr": (c.get("summary") or {}).get("eligible_total_inr") or 0,
        } for c in child_docs],
        "roll_up_total_inr": sum(float(c.get("approved_amount_inr") or 0) for c in child_docs),
        "own_claim_id": (own or {}).get("id"),
        "own_claim_ref": (own or {}).get("claim_ref"),
        "own_claim_status": (own or {}).get("status"),
    }


@api_router.post("/reimbursement-claims/consolidate", response_model=TournamentReimbursementClaim)
async def consolidate_district_claims(payload: ConsolidatePayload, request: Request):
    """M39z.d · Division rolls up every Approved District claim under it into a
    single "master" Division claim. The master aggregates head-wise summaries,
    total approved amount and links every child. Master claim starts in Draft —
    Division still needs to upload signed PDF and submit to MPCA using the
    standard `/submit` endpoint (which auto-routes to MPCA for Divisions)."""
    scope = get_scope(request)
    if scope.body_code and scope.body_code != payload.division_body_id and not scope.is_state:
        raise HTTPException(403, "Only the owning Division (or MPCA) may consolidate District claims.")

    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    # M39z.e · Consolidation is only meaningful when the Division actually
    # hosts (owns) the tournament — that's when Districts participate under
    # them. On MPCA-owned tournaments Districts don't submit at all, so a
    # Division has no children to consolidate.
    if (t.get("host_body_id") or "MPCA") != payload.division_body_id:
        raise HTTPException(
            422,
            f"You can only consolidate on tournaments your Division hosts. "
            f"This tournament is hosted by '{t.get('host_body_id')}', not '{payload.division_body_id}'.",
        )
    div = await db.bodies.find_one({"code": payload.division_body_id}, {"_id": 0})
    if not div or div.get("body_type") != "Division":
        raise HTTPException(422, f"'{payload.division_body_id}' is not a Division body.")

    districts = await db.bodies.find({
        "body_type": "District", "parent_code": payload.division_body_id,
    }, {"_id": 0}).to_list(200)
    dist_codes = [d["code"] for d in districts]

    child_docs = await db.tournament_reimbursement_claims.find({
        "tournament_id": payload.tournament_id,
        "fiscal_cycle": payload.fiscal_cycle,
        "body_id": {"$in": dist_codes},
        "route_to_body_id": payload.division_body_id,
        "status": "Approved",
        "parent_claim_id": None,
    }, {"_id": 0}).to_list(500)
    if not child_docs:
        raise HTTPException(
            409,
            "No Approved District claims are ready to consolidate. "
            "Approve at least one District claim first.",
        )

    # Find or create the Division's own master (idempotent per tournament+cycle)
    master = await db.tournament_reimbursement_claims.find_one({
        "tournament_id": payload.tournament_id,
        "body_id": payload.division_body_id,
        "fiscal_cycle": payload.fiscal_cycle,
        "status": {"$in": ["Draft", "Rejected"]},
    }, {"_id": 0})
    if not master:
        claim_ref = await _next_claim_ref(payload.fiscal_cycle)
        master_obj = TournamentReimbursementClaim(
            claim_ref=claim_ref,
            tournament_id=payload.tournament_id,
            tournament_name=t.get("name"),
            body_id=payload.division_body_id,
            body_name=div.get("name"),
            fiscal_cycle=payload.fiscal_cycle,
            scheme_code=t.get("scheme_code"),
            is_master=True,
            notes=(f"Consolidated by {payload.actor_name} from "
                   f"{len(child_docs)} Approved District claim(s)."),
        )
        master = master_obj.model_dump()
        await db.tournament_reimbursement_claims.insert_one(master)

    # Aggregate head-wise summaries across own + every child
    own_summary = await _compute_summary(payload.tournament_id, payload.division_body_id)
    heads_map: dict = {}

    def _fold(rows, source):
        for r in (rows or []):
            k = r.get("head") or "Unallocated"
            row = heads_map.setdefault(k, {
                "head": k, "limit_inr": 0.0, "spent_inr": 0.0,
                "over_inr": 0.0, "eligible_inr": 0.0, "sources": [],
            })
            row["limit_inr"] = max(row["limit_inr"], float(r.get("limit_inr") or 0))
            row["spent_inr"] += float(r.get("spent_inr") or 0)
            row["over_inr"] += float(r.get("over_inr") or 0)
            row["eligible_inr"] += float(r.get("eligible_inr") or 0)
            if source not in row["sources"]:
                row["sources"].append(source)

    _fold(own_summary.get("heads") or [], payload.division_body_id)
    for c in child_docs:
        _fold((c.get("summary") or {}).get("heads") or [], c["body_id"])

    child_approved_total = sum(float(c.get("approved_amount_inr") or 0) for c in child_docs)
    own_eligible = float(own_summary.get("eligible_total_inr") or 0)
    consolidated_summary = {
        "budget_total_inr": float(own_summary.get("budget_total_inr") or 0),
        "invoiced_total_inr": float(own_summary.get("invoiced_total_inr") or 0)
            + sum(float((c.get("summary") or {}).get("invoiced_total_inr") or 0) for c in child_docs),
        "eligible_total_inr": own_eligible
            + sum(float((c.get("summary") or {}).get("eligible_total_inr") or 0) for c in child_docs),
        "over_budget_inr": float(own_summary.get("over_budget_inr") or 0)
            + sum(float((c.get("summary") or {}).get("over_budget_inr") or 0) for c in child_docs),
        "invoice_count": (own_summary.get("invoice_count") or 0)
            + sum((c.get("summary") or {}).get("invoice_count") or 0 for c in child_docs),
        "heads": list(heads_map.values()),
        "child_approved_total_inr": child_approved_total,
        "own_eligible_inr": own_eligible,
    }

    child_ids = [c["id"] for c in child_docs]
    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Consolidated",
        actor_post=payload.actor_role or "Division_Secretary",
        actor_name=payload.actor_name,
        actor_body_id=payload.division_body_id,
        decision="Recommended",
        notes=f"Consolidated {len(child_ids)} District claim(s) totalling ₹{child_approved_total:,.0f}.",
    )
    chain = (master.get("approval_chain") or []) + [step.model_dump()]
    await db.tournament_reimbursement_claims.update_one({"id": master["id"]}, {"$set": {
        "is_master": True,
        "child_claim_ids": list(set((master.get("child_claim_ids") or []) + child_ids)),
        "summary": consolidated_summary,
        "approval_chain": chain,
        "updated_at": now,
    }})
    await db.tournament_reimbursement_claims.update_many(
        {"id": {"$in": child_ids}},
        {"$set": {"parent_claim_id": master["id"], "updated_at": now}},
    )
    return await db.tournament_reimbursement_claims.find_one({"id": master["id"]}, {"_id": 0})



@api_router.post("/reimbursement-claims/{cid}/comment", response_model=TournamentReimbursementClaim)
async def add_comment(cid: str, action: TournamentReimbursementAction):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if not action.comment_text:
        raise HTTPException(400, "comment_text required")
    c = ReimbursementComment(
        author_name=action.actor_name,
        author_role=action.actor_role,
        author_body_id=action.actor_body_id,
        text=action.comment_text,
    )
    comments = (doc.get("comments") or []) + [c.model_dump()]
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "comments": comments,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.delete("/reimbursement-claims/{cid}")
async def delete_claim(cid: str):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "Draft":
        raise HTTPException(409, f"Cannot delete claim in status '{doc['status']}' — only Draft is deletable")
    await db.tournament_reimbursement_claims.delete_one({"id": cid})
    return {"ok": True}


# ═══════════════════ Stats ═══════════════════

@api_router.get("/reimbursement-claims-stats/summary")
async def claims_stats(body_id: Optional[str] = None, fiscal_cycle: Optional[str] = None):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.tournament_reimbursement_claims.find(q, {"_id": 0}).to_list(5000)
    return {
        "total_claims": len(docs),
        "draft": len([d for d in docs if d["status"] == "Draft"]),
        "submitted": len([d for d in docs if d["status"] == "Submitted"]),
        "under_review": len([d for d in docs if d["status"] == "Under_Review"]),
        "approved": len([d for d in docs if d["status"] == "Approved"]),
        "rejected": len([d for d in docs if d["status"] == "Rejected"]),
        "eligible_total_inr": float(sum((d.get("summary") or {}).get("eligible_total_inr") or 0 for d in docs)),
        "approved_total_inr": float(sum(d.get("approved_amount_inr") or 0 for d in docs if d["status"] == "Approved")),
    }
