"""Routes · Sprint T-RIM — Tournament Reimbursement Claims.

Division submits a claim at tournament completion. The system auto-generates a summary
sheet aggregating all approved invoices vs budget heads. MPCA Secretary reviews, adds
comments, approves (with optional lowered amount) or rejects.
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, Request

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

@api_router.get("/reimbursement-claims", response_model=List[TournamentReimbursementClaim])
async def list_claims(
    request: Request,
    tournament_id: Optional[str] = None,
    body_id: Optional[str] = None,
    status: Optional[TournamentReimbursementStatus] = None,
    fiscal_cycle: Optional[str] = None,
    skip: int = 0,
    limit: int = 500,
):
    q: dict = {}
    if tournament_id: q["tournament_id"] = tournament_id
    if body_id: q["body_id"] = body_id
    else:
        # M13: MPCA sees all claims (they need to review), lower bodies see their own only
        q.update(body_scope(get_scope(request)))
    if status: q["status"] = status
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
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
        decision="Submitted", notes=action.notes,
    )
    chain = (doc.get("approval_chain") or []) + [step.model_dump()]
    await db.tournament_reimbursement_claims.update_one({"id": cid}, {"$set": {
        "status": "Submitted",
        "summary": summary,
        "invoice_ids": [i["id"] for i in invoices],
        "extra_expense_ids": [e["id"] for e in extras],
        "da_form_ids": [d["id"] for d in da_forms],
        "submitted_by": action.actor_name,
        "submitted_at": now,
        "approval_chain": chain,
        "updated_at": now,
    }})

    # Notify MPCA Secretary
    await _create_notification(
        recipient_role_id="secretary", recipient_body_id="MPCA",
        title=f"Reimbursement claim submitted · {doc.get('tournament_name')}",
        message=f"{doc['claim_ref']} · {doc.get('body_name')} · Eligible ₹{summary['eligible_total_inr']:,.0f}",
        link=f"/reimbursement-claims/{cid}",
        related_type="reimbursement_claim", related_id=cid,
        severity="info", kind="info",
    )
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


@api_router.post("/reimbursement-claims/{cid}/approve", response_model=TournamentReimbursementClaim)
async def approve_claim(cid: str, action: TournamentReimbursementAction):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot approve from status '{doc['status']}'")

    eligible = float((doc.get("summary") or {}).get("eligible_total_inr") or 0)
    approved = float(action.approved_amount_inr) if action.approved_amount_inr is not None else eligible
    if approved < 0:
        raise HTTPException(422, "Approved amount cannot be negative")
    if approved > eligible:
        raise HTTPException(422, f"Approved amount ₹{approved:,.0f} exceeds eligible ₹{eligible:,.0f}")

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

    # Notify Division
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=doc["body_id"],
        title=f"Reimbursement APPROVED · {doc['claim_ref']}",
        message=f"₹{approved:,.0f} approved by {action.actor_name} for {doc.get('tournament_name')}",
        link=f"/reimbursement-claims/{cid}",
        related_type="reimbursement_claim", related_id=cid,
        severity="info", kind="info",
    )
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/reimbursement-claims/{cid}/reject", response_model=TournamentReimbursementClaim)
async def reject_claim(cid: str, action: TournamentReimbursementAction):
    doc = await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot reject from status '{doc['status']}'")
    if not action.notes:
        raise HTTPException(400, "Rejection reason required in notes")

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
        recipient_role_id="division-secretary", recipient_body_id=doc["body_id"],
        title=f"Reimbursement REJECTED · {doc['claim_ref']}",
        message=action.notes,
        link=f"/reimbursement-claims/{cid}",
        related_type="reimbursement_claim", related_id=cid,
        severity="warning", kind="info",
    )
    return await db.tournament_reimbursement_claims.find_one({"id": cid}, {"_id": 0})


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
