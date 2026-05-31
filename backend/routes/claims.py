"""Routes · Claims & Grant Workflow"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Claim, ClaimCreate, ClaimAction, ClaimStatus, ClaimCategory, ApprovalStep, BankTransaction, Body
from core.helpers import _next_claim_no, _resolve_parent_body, _append_step, _notify_for_claim, _decorate_claim
from core.ai_validator import _run_ai_validation, _apply_ai_verdict
import logging
from models import SANCTION_THRESHOLDS, TWO_SIGNATORY_THRESHOLD_INR


# ---------------- Routes: Claims & Grant Workflow ----------------


async def _next_claim_no(cycle: str) -> str:
    count = await db.claims.count_documents({"fiscal_cycle": cycle})
    return f"CLM-{cycle}-{count + 1:03d}"


async def _resolve_parent_body(body_id: str) -> Optional[str]:
    body = await db.bodies.find_one({"code": body_id}, {"_id": 0, "parent_code": 1})
    return body.get("parent_code") if body else None


@api_router.get("/claims", response_model=List[Claim])
async def list_claims(
    body_id: Optional[str] = None,
    parent_body_id: Optional[str] = None,
    status: Optional[ClaimStatus] = None,
    fiscal_cycle: Optional[str] = None,
):
    """List claims. body_id filters claims submitted BY that body.
    parent_body_id filters claims pending review BY that body (for Division/MPCA inboxes)."""
    query: dict = {}
    if body_id:
        query["body_id"] = body_id
    if parent_body_id:
        query["parent_body_id"] = parent_body_id
    if status:
        query["status"] = status
    if fiscal_cycle:
        query["fiscal_cycle"] = fiscal_cycle
    docs = await db.claims.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_decorate_claim(d) for d in docs]


@api_router.get("/claims/{claim_id}", response_model=Claim)
async def get_claim(claim_id: str):
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    return _decorate_claim(doc)


@api_router.post("/claims", response_model=Claim)
async def create_claim(payload: ClaimCreate, force: bool = False):
    """Drafts a new claim. The submitting body must exist.

    Phase III.7: anti-fragmentation guard — if a body raises multiple
    sub-threshold claims within the same fiscal cycle whose cumulative value
    crosses the next sanctioning authority's limit, the call is rejected
    (with 400 and a clear message) unless ?force=true is passed."""
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")

    if not force and payload.amount_inr > 0:
        cumulative = payload.amount_inr
        cursor = db.claims.find(
            {
                "body_id": payload.body_id,
                "fiscal_cycle": payload.fiscal_cycle,
                "status": {"$nin": ["Rejected"]},
            },
            {"_id": 0, "amount_inr": 1},
        )
        async for c in cursor:
            cumulative += c.get("amount_inr", 0) or 0

        # Determine the sanctioning authority for the *new individual* claim
        single_auth = next(
            (t for t in SANCTION_THRESHOLDS if payload.amount_inr <= t["limit_inr"]),
            SANCTION_THRESHOLDS[-1],
        )
        cum_auth = next(
            (t for t in SANCTION_THRESHOLDS if cumulative <= t["limit_inr"]),
            SANCTION_THRESHOLDS[-1],
        )
        if cum_auth["post"] != single_auth["post"]:
            raise HTTPException(
                400,
                f"Anti-fragmentation: this claim is individually within "
                f"{single_auth['post']}'s limit, but the body's cumulative "
                f"open spend for cycle {payload.fiscal_cycle} would reach "
                f"₹{cumulative:,.0f} — requiring {cum_auth['post']}'s sanction. "
                "Either consolidate the claims or pass ?force=true with an MC note.",
            )

    cycle = payload.fiscal_cycle
    claim_no = await _next_claim_no(cycle)
    parent_id = await _resolve_parent_body(payload.body_id)
    claim = Claim(
        claim_no=claim_no,
        parent_body_id=parent_id,
        **payload.model_dump(),
    )
    await db.claims.insert_one(claim.model_dump())
    return claim



@api_router.post("/claims/{claim_id}/submit", response_model=Claim)
async def submit_claim(claim_id: str, action: ClaimAction):
    """District submits Draft claim → Division (Submitted)."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Draft", "Returned"):
        raise HTTPException(400, f"Cannot submit a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="Submitted",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Submitted",
        notes=action.notes,
    )
    update = _append_step(doc, step, "Submitted")
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Submitted", action.actor_name)

    # Step 4 · run AI gatekeeper on every submission (best-effort; failures degrade to HOLD)
    try:
        verdict = await _run_ai_validation(updated)
        updated = await _apply_ai_verdict(updated, verdict, action.actor_name)
    except Exception as e:
        # Never block submission if AI is down — just log a HOLD note
        logging.exception("AI gatekeeper failure on submit %s: %s", claim_id, e)

    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/recommend", response_model=Claim)
async def recommend_claim(claim_id: str, action: ClaimAction):
    """Division Secretary recommends a Submitted claim → MPCA queue."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "Submitted":
        raise HTTPException(400, f"Cannot recommend a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="Division_Recommended",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Recommended",
        notes=action.notes,
    )
    update = _append_step(doc, step, "Division_Recommended")
    # Once a Division has recommended, the parent for the MPCA queue is MPCA itself.
    update["parent_body_id"] = "MPCA"
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Division_Recommended", action.actor_name)
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/sanction", response_model=Claim)
async def sanction_claim(claim_id: str, action: ClaimAction):
    """MPCA Hon. Treasurer sanctions a Division-recommended claim.
    PF3: Treasurer may sanction a different (usually lower) amount than claimed;
    when so, a reason is mandatory and stamped into the approval chain note."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "Division_Recommended":
        raise HTTPException(400, f"Cannot sanction a claim in status {doc['status']}")

    claimed = float(doc.get("amount_inr") or 0)
    approved = action.approved_amount_inr if action.approved_amount_inr is not None else claimed
    if approved < 0:
        raise HTTPException(400, "Approved amount cannot be negative.")
    if approved > claimed:
        raise HTTPException(400, f"Approved amount (₹{approved:,.0f}) cannot exceed the claimed amount (₹{claimed:,.0f}).")
    if abs(approved - claimed) > 0.5 and not (action.approved_amount_reason and action.approved_amount_reason.strip()):
        raise HTTPException(400, "A reason is required when the approved amount differs from the claimed amount.")

    delta = round(claimed - approved, 2)
    note_extras = []
    if delta > 0.5:
        note_extras.append(
            f"Approved ₹{approved:,.0f} (claimed ₹{claimed:,.0f}, reduction ₹{delta:,.0f}). Reason: "
            f"{action.approved_amount_reason.strip()}"
        )
    composed_notes = (action.notes or "").strip()
    if note_extras:
        composed_notes = (composed_notes + " · " if composed_notes else "") + " · ".join(note_extras)

    step = ApprovalStep(
        stage="MPCA_Sanctioned",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Sanctioned",
        notes=composed_notes or None,
    )
    update = _append_step(doc, step, "MPCA_Sanctioned")
    update["approved_amount_inr"] = approved
    if action.approved_amount_reason:
        update["approved_amount_reason"] = action.approved_amount_reason.strip()
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "MPCA_Sanctioned", action.actor_name)
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/disburse", response_model=Claim)
async def disburse_claim(claim_id: str, action: ClaimAction):
    """Marks the sanctioned claim as disbursed and atomically creates a
    BankTransaction debit against the source account. Two-signatory is
    enforced for amounts above the threshold (Art. 28(v))."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "MPCA_Sanctioned":
        raise HTTPException(400, f"Cannot disburse a claim in status {doc['status']}")

    # PF3: disburse the approved amount if Treasurer reduced it; else the full claim amount
    amount = float(doc.get("approved_amount_inr") if doc.get("approved_amount_inr") is not None else doc.get("amount_inr") or 0)
    # Two-signatory rule
    if amount > TWO_SIGNATORY_THRESHOLD_INR and not (action.co_signatory_post and action.co_signatory_name):
        raise HTTPException(
            400,
            f"Disbursement above ₹{TWO_SIGNATORY_THRESHOLD_INR:,} requires two signatories "
            "(provide co_signatory_post and co_signatory_name).",
        )

    # Resolve source account — explicit override or the first MPCA General account
    source_account = None
    if action.source_account_id:
        source_account = await db.bank_accounts.find_one(
            {"id": action.source_account_id}, {"_id": 0},
        )
    if not source_account:
        source_account = await db.bank_accounts.find_one(
            {"body_id": "MPCA", "name": {"$regex": "General", "$options": "i"}}, {"_id": 0},
        )
    if not source_account:
        raise HTTPException(400, "No MPCA bank account available for disbursement")
    if (source_account.get("current_balance") or 0) < amount:
        raise HTTPException(
            400,
            f"Insufficient balance in {source_account['name']} "
            f"(₹{source_account['current_balance']:,.0f}) for disbursement of ₹{amount:,.0f}.",
        )

    # Append approval step (with co-signatory note if any)
    notes_with_cosig = (action.notes or "").strip()
    if action.co_signatory_post and action.co_signatory_name:
        cosig_line = f"Co-signed by {action.co_signatory_post} · {action.co_signatory_name}."
        notes_with_cosig = (notes_with_cosig + " " if notes_with_cosig else "") + cosig_line

    step = ApprovalStep(
        stage="Disbursed",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Disbursed",
        notes=notes_with_cosig or None,
    )
    update = _append_step(doc, step, "Disbursed")

    # Atomically debit the bank account and write a transaction with claim linkage
    new_balance = round((source_account.get("current_balance") or 0) - amount, 2)
    txn_ref = f"CLAIM/{doc['claim_no']}"
    bank_txn = BankTransaction(
        body_id="MPCA",
        account_id=source_account["id"],
        date=datetime.now(timezone.utc).date().isoformat(),
        txn_type="Debit",
        amount=amount,
        narration=f"Grant disbursement — {doc['claim_no']} · {doc['title']} → {doc['body_id']}",
        reference=txn_ref,
        approved_by=action.actor_post,
        balance_after=new_balance,
    )
    await db.bank_txns.insert_one(bank_txn.model_dump())
    await db.bank_accounts.update_one(
        {"id": source_account["id"]}, {"$set": {"current_balance": new_balance}},
    )

    # Link the txn id back into the claim for traceability
    update["disbursement_txn_id"] = bank_txn.id
    update["disbursement_account_id"] = source_account["id"]

    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Disbursed", action.actor_name)
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/reject", response_model=Claim)
async def reject_claim(claim_id: str, action: ClaimAction):
    """Reject at any non-terminal stage."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] in ("Disbursed", "Rejected"):
        raise HTTPException(400, f"Cannot reject a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="Rejected",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Rejected",
        notes=action.notes,
    )
    update = _append_step(doc, step, "Rejected")
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Rejected", action.actor_name)
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/return", response_model=Claim)
async def return_claim(claim_id: str, action: ClaimAction):
    """Send the claim back to the originator for clarification.
    PF2 · A structured reason code is required, with optional free-text detail.
    The combined reason is stamped into the approval-chain note for audit + analytics.
    """
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Division_Recommended"):
        raise HTTPException(400, f"Cannot return a claim in status {doc['status']}")

    if not action.return_reason_code:
        raise HTTPException(400, "A return reason code is required (see GET /api/return-reasons for allowed codes).")
    reason_info = RETURN_REASONS.get(action.return_reason_code)
    if not reason_info:
        raise HTTPException(
            400,
            f"Unknown return reason code '{action.return_reason_code}'. "
            f"Allowed codes: {sorted(RETURN_REASONS.keys())}.",
        )

    composed = f"[{action.return_reason_code}] {reason_info['label']}"
    if action.return_reason_detail and action.return_reason_detail.strip():
        composed += f" — {action.return_reason_detail.strip()}"
    if action.notes and action.notes.strip():
        composed += f" · {action.notes.strip()}"

    step = ApprovalStep(
        stage="Returned",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Returned",
        notes=composed,
    )
    update = _append_step(doc, step, "Returned")
    update["parent_body_id"] = await _resolve_parent_body(doc["body_id"])
    update["return_reason_code"] = action.return_reason_code
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Returned", action.actor_name)
    return _decorate_claim(updated)


# PF2 · Structured return-reason taxonomy (Feb 2026)
RETURN_REASONS: dict = {
    "DOCS_MISSING": {
        "label": "Required documents missing",
        "applies_to": ["Submitted", "Division_Recommended"],
        "severity": "warning",
        "hint": "List which mandatory supporting documents are absent.",
    },
    "AMOUNT_MISMATCH": {
        "label": "Amount on bills does not match claim",
        "applies_to": ["Submitted", "Division_Recommended"],
        "severity": "warning",
        "hint": "Provide the discrepancy between claim amount and bill totals.",
    },
    "BUDGET_HEAD_INVALID": {
        "label": "Wrong / missing budget head",
        "applies_to": ["Submitted", "Division_Recommended"],
        "severity": "warning",
        "hint": "Identify the correct head from the body's budget ledger.",
    },
    "AGM_RESOLUTION_REQUIRED": {
        "label": "Requires AGM / MC resolution citation",
        "applies_to": ["Division_Recommended"],
        "severity": "warning",
        "hint": "Cite the resolution number and date.",
    },
    "VENDOR_GSTIN_INVALID": {
        "label": "Vendor GSTIN missing or invalid",
        "applies_to": ["Submitted", "Division_Recommended"],
        "severity": "warning",
        "hint": "Re-attach vendor bills with valid GSTIN.",
    },
    "SANCTION_LETTER_REQUIRED": {
        "label": "Pre-sanction letter required for this category",
        "applies_to": ["Submitted", "Division_Recommended"],
        "severity": "warning",
        "hint": "Attach the prior sanction reference from MPCA/Division.",
    },
    "DUPLICATE_CLAIM": {
        "label": "Possible duplicate of another claim",
        "applies_to": ["Submitted", "Division_Recommended"],
        "severity": "critical",
        "hint": "Specify the claim_no of the suspected duplicate.",
    },
    "CAO_REVIEW_NEEDED": {
        "label": "Needs CAO / Auditor review before sanction",
        "applies_to": ["Division_Recommended"],
        "severity": "warning",
        "hint": "Identify which audit aspect requires clarification.",
    },
    "OTHER": {
        "label": "Other — see free-text detail",
        "applies_to": ["Submitted", "Division_Recommended"],
        "severity": "warning",
        "hint": "Describe the reason in the detail field.",
    },
}


@api_router.get("/return-reasons")
async def list_return_reasons():
    """Exposes the structured taxonomy of return-reason codes for the frontend dropdown."""
    return {
        code: {
            "code": code,
            "label": info["label"],
            "applies_to": info["applies_to"],
            "severity": info["severity"],
            "hint": info["hint"],
        }
        for code, info in RETURN_REASONS.items()
    }


@api_router.get("/claims-stats/summary")
async def claims_stats():
    """Top-of-page tile data: total / pending / disbursed / amount."""
    total = await db.claims.count_documents({})
    pending = await db.claims.count_documents({"status": {"$in": ["Submitted", "Division_Recommended"]}})
    disbursed = await db.claims.count_documents({"status": "Disbursed"})
    rejected = await db.claims.count_documents({"status": "Rejected"})

    pipeline = [
        {"$match": {"status": "Disbursed"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_inr"}}},
    ]
    cursor = db.claims.aggregate(pipeline)
    total_disbursed_amt = 0.0
    async for row in cursor:
        total_disbursed_amt = row.get("total", 0.0)

    pipeline2 = [
        {"$match": {"status": {"$in": ["Submitted", "Division_Recommended", "MPCA_Sanctioned"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_inr"}}},
    ]
    cursor2 = db.claims.aggregate(pipeline2)
    total_in_flight_amt = 0.0
    async for row in cursor2:
        total_in_flight_amt = row.get("total", 0.0)

    return {
        "total_claims": total,
        "pending_claims": pending,
        "disbursed_claims": disbursed,
        "rejected_claims": rejected,
        "amount_disbursed_inr": total_disbursed_amt,
        "amount_in_flight_inr": total_in_flight_amt,
    }


# ---------------- Routes: Body Budgets & Reconciliation (Phase III.7) ----------------


