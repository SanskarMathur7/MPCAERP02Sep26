"""Routes · Phase T3 — Tournament Invoices with AI extractor + Budget vs Actual tracker."""
import json
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException, Request

import asyncio
from core.infra import db, api_router
from core.shared_services import next_seq  # H6 · atomic sequence
from core.scoping import get_scope, body_scope
from core.helpers import _create_notification
from models import (
    TournamentInvoice, TournamentInvoiceCreate, TournamentInvoiceStatus,
    AIInvoiceExtraction, InvoiceHeadAllocation,
)

# Reuse LLM plumbing already in ai_validator
from core.ai_validator import (
    EMERGENT_LLM_KEY, AI_MODEL_PROVIDER, AI_MODEL_NAME,
    LlmChat, UserMessage, FileContentWithMimeType, _parse_ai_response,
)


INVOICE_SYSTEM_MESSAGE = """You are the MPCA Tournament Invoice Extractor.

Read the attached invoice/bill (PDF or image) and extract:
  - vendor_name
  - invoice_no
  - invoice_date (YYYY-MM-DD)
  - amount_inr (pre-tax subtotal, INR only)
  - gst_inr (total GST amount, 0 if not mentioned)
  - total_inr (grand total)
  - line_items: [{description, amount}]
  - suggested_head_code (from this list — pick the closest fit):
      MATCH_OFFICIAL_DA, MATCH_OFFICIAL_TRAVEL, PLAYER_DA_FOOD,
      PLAYER_TRAVEL, PLAYER_STAY, GROUND_FEES, KIT_CONSUMABLES,
      UMPIRE_HONORARIUM, SCORER_HONORARIUM, PHYSIO_HONORARIUM,
      CONTINGENCY, OTHER

Return a SINGLE JSON object — no prose, no code fences:
{
  "vendor_name": "<or null>",
  "invoice_no": "<or null>",
  "invoice_date": "<YYYY-MM-DD or null>",
  "amount_inr": <number>,
  "gst_inr": <number>,
  "total_inr": <number>,
  "line_items": [{"description": "...", "amount": <number>}],
  "suggested_head_code": "<one of the codes>",
  "confidence": 0.0..1.0
}

If a field is not visible, use null. Do NOT invent numbers.
"""


# Mapping: rate-card head_code → BudgetHeadAllocation.head (BudgetHead Literal)
HEAD_CODE_TO_LABEL = {
    "MATCH_OFFICIAL_DA":     "Match Official DA",
    "MATCH_OFFICIAL_TRAVEL": "Match Official Travel",
    "PLAYER_DA_FOOD":        "Player DA / Food",
    "PLAYER_TRAVEL":         "Player Travel",
    "PLAYER_STAY":           "Player Stay (Hotel)",
    "GROUND_FEES":           "Ground Fees",
    "KIT_CONSUMABLES":       "Balls / Kit Consumables",
    "UMPIRE_HONORARIUM":     "Umpire Honorarium",
    "SCORER_HONORARIUM":     "Scorer Honorarium",
    "PHYSIO_HONORARIUM":     "Physio Honorarium",
    "CONTINGENCY":           "Contingency",
}
HEAD_LABEL_TO_CODE = {v: k for k, v in HEAD_CODE_TO_LABEL.items()}


async def _next_invoice_ref(cycle: str) -> str:
    seq = await next_seq(f"tinvoice:{cycle}", lambda: db.tournament_invoices.count_documents({"invoice_ref": {"$regex": f"^INV-{cycle}-"}}))
    return f"INV-{cycle}-{seq:04d}"


async def _run_invoice_extraction(file_path: str, mime: str) -> dict:
    """Send invoice file to Gemini and parse extraction JSON."""
    if not EMERGENT_LLM_KEY:
        return {"error": "AI extractor unavailable (no LLM key)", "confidence": 0.0}
    if not Path(file_path).exists():
        return {"error": "File not found on server", "confidence": 0.0}
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"invoice-{datetime.now(timezone.utc).timestamp()}",
        system_message=INVOICE_SYSTEM_MESSAGE,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)
    msg = UserMessage(
        text="Extract the invoice fields per your system spec. Return only JSON.",
        file_contents=[FileContentWithMimeType(file_path=file_path, mime_type=mime)],
    )
    try:
        raw = await asyncio.wait_for(chat.send_message(msg), timeout=45)  # H4 · timeout guard
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:200]}", "confidence": 0.0}
    parsed = _parse_ai_response(raw if isinstance(raw, str) else str(raw))
    parsed["raw"] = (raw if isinstance(raw, str) else str(raw))[:3000]
    return parsed


# ═══════════════════ Extract endpoint (upload → AI) ═══════════════════


@api_router.post("/tournament-invoices/ai-extract")
async def ai_extract_invoice(file_url: str):
    """Run AI extractor on an already-uploaded file. Returns preview payload (unsaved).
    Frontend calls this immediately after upload, then submits the full TournamentInvoice."""
    if "/api/uploads/" not in file_url:
        raise HTTPException(400, "file_url must reference an /api/uploads/ record")
    file_id = file_url.rsplit("/", 1)[-1]
    rec = await db.uploads.find_one({"id": file_id})
    if not rec:
        raise HTTPException(404, "Uploaded file not found")
    result = await _run_invoice_extraction(rec.get("_path") or "", rec.get("mime_type") or "application/octet-stream")
    return {
        "ai_extraction": result,
        "prefill": {
            "vendor_name": result.get("vendor_name"),
            "invoice_no": result.get("invoice_no"),
            "invoice_date": result.get("invoice_date"),
            "amount_inr": result.get("amount_inr") or 0,
            "gst_inr": result.get("gst_inr") or 0,
            "total_inr": result.get("total_inr") or ((result.get("amount_inr") or 0) + (result.get("gst_inr") or 0)),
            "budget_head_code": result.get("suggested_head_code"),
        },
    }


# ═══════════════════ Invoice CRUD ═══════════════════


@api_router.get("/tournament-invoices", response_model=List[TournamentInvoice])
async def list_invoices(
    request: Request,
    tournament_id: Optional[str] = None,
    body_id: Optional[str] = None,
    budget_id: Optional[str] = None,
    status: Optional[TournamentInvoiceStatus] = None,
):
    q: dict = {}
    if tournament_id: q["tournament_id"] = tournament_id
    if body_id: q["body_id"] = body_id
    else:
        # Sprint M13: auto-scope by persona body (invoices tied to spending body)
        q.update(body_scope(get_scope(request)))
    if budget_id: q["budget_id"] = budget_id
    if status: q["status"] = status
    docs = await db.tournament_invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.get("/tournament-invoices/{iid}", response_model=TournamentInvoice)
async def get_invoice(iid: str):
    doc = await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    return doc


@api_router.post("/tournament-invoices", response_model=TournamentInvoice)
async def create_invoice(payload: TournamentInvoiceCreate):
    """Create an invoice. To attach AI extraction, POST /tournament-invoices/ai-extract first,
    then call this with the extracted fields already in the payload."""
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    # MPCA-168 · Phase E · Once the Division has submitted a reimbursement
    # claim for this tournament, no new invoices can be added — the claim
    # must be rejected by MPCA first.
    active_claim = await db.tournament_reimbursement_claims.find_one({
        "tournament_id": payload.tournament_id,
        "body_id": payload.body_id,
        "status": {"$in": ["Submitted", "Under_Review", "Approved"]},
    }, {"_id": 0, "claim_ref": 1, "status": 1})
    if active_claim:
        raise HTTPException(
            409,
            f"Cannot add new invoice — reimbursement claim {active_claim.get('claim_ref')} "
            f"is already {active_claim.get('status').lower().replace('_', ' ')}.",
        )
    cycle = t.get("fiscal_cycle") or "2025-26"
    body = payload.model_dump()

    # Sprint T-RIM · validate multi-head allocations sum to invoice total (₹1 tolerance)
    allocs = body.get("allocations") or []
    if allocs:
        total = round(float(body.get("total_inr") or 0), 2)
        alloc_sum = round(sum(float(a.get("amount_inr") or 0) for a in allocs), 2)
        if abs(alloc_sum - total) > 1.0:
            raise HTTPException(
                422,
                f"Sum of head allocations (₹{alloc_sum:,.2f}) must equal the invoice total (₹{total:,.2f}).",
            )
        # Convenience: keep legacy budget_head_code = first allocation's code
        if not body.get("budget_head_code"):
            body["budget_head_code"] = allocs[0].get("head_code")

    # Resolve budget if not set (single-budget tournaments) — but only when
    # the caller didn't already scope to a specific budget_id.
    if not body.get("budget_id"):
        tb = await db.tournament_budgets.find_one({
            "tournament_id": payload.tournament_id,
            "body_id": payload.body_id,
            "status": "Approved",
        }, {"_id": 0}, sort=[("created_at", -1)])
        if tb:
            body["budget_id"] = tb["id"]
    # M26 Phase B · auto-link to participant row if one exists
    if not body.get("participant_body_code"):
        from routes.tournament_participations import resolve_participant_body_code
        body["participant_body_code"] = await resolve_participant_body_code(
            payload.tournament_id, payload.body_id
        )

    inv = TournamentInvoice(
        invoice_ref=await _next_invoice_ref(cycle),
        **body,
    )
    inv = await _apply_grant_eligibility(inv)
    await db.tournament_invoices.insert_one(inv.model_dump())
    return inv


class TournamentInvoicePatch(BaseModel):
    # M3 · typed patch body. extra="ignore" drops unknown keys exactly like the
    # previous key-whitelist did; money fields are validated as non-negative numbers.
    model_config = ConfigDict(extra="ignore")
    vendor_name: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    amount_inr: Optional[float] = Field(None, ge=0)
    gst_inr: Optional[float] = Field(None, ge=0)
    total_inr: Optional[float] = Field(None, ge=0)
    budget_head_code: Optional[str] = None
    allocations: Optional[List[InvoiceHeadAllocation]] = None  # Sprint T-RIM · multi-head splits
    notes: Optional[str] = None
    manually_overridden: Optional[bool] = None


@api_router.patch("/tournament-invoices/{iid}", response_model=TournamentInvoice)
async def update_invoice(iid: str, patch: TournamentInvoicePatch):
    doc = await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    # MPCA-201 · Divisions can now edit any invoice (Draft, Submitted, Approved,
    # Rejected) until the reimbursement claim is locked with MPCA. The
    # active_claim gate below is the only real freeze.
    # MPCA-168 · Phase E · Post-Submission lock. Once the Division has
    # submitted its reimbursement claim, all attached invoices freeze —
    # otherwise a Division could quietly retouch expenses after MPCA has
    # already opened line-item review.
    active_claim = await db.tournament_reimbursement_claims.find_one({
        "tournament_id": doc["tournament_id"],
        "body_id": doc["body_id"],
        "status": {"$in": ["Submitted", "Under_Review", "Approved"]},
    }, {"_id": 0, "claim_ref": 1, "status": 1})
    if active_claim:
        raise HTTPException(
            409,
            f"This invoice is locked because reimbursement claim {active_claim.get('claim_ref')} "
            f"is already {active_claim.get('status').lower().replace('_', ' ')}. Ask MPCA to reject the claim "
            f"if edits are required.",
        )
    updates = patch.model_dump(exclude_unset=True)  # M3 · only client-provided, validated fields
    if updates:
        updates["manually_overridden"] = True
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        merged = {**doc, **updates}
        inv = TournamentInvoice(**merged)
        inv = await _apply_grant_eligibility(inv)
        # Merge only allowed keys + eligibility fields
        final = {**updates,
                 "over_budget_amount_inr": inv.over_budget_amount_inr,
                 "eligible_for_grant_inr": inv.eligible_for_grant_inr,
                 "ineligible_for_grant_inr": inv.ineligible_for_grant_inr}
        await db.tournament_invoices.update_one({"id": iid}, {"$set": final})
    return await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})


@api_router.post("/tournament-invoices/{iid}/submit", response_model=TournamentInvoice)
async def submit_invoice(iid: str):
    doc = await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, f"Cannot submit from {doc['status']}")
    await db.tournament_invoices.update_one({"id": iid}, {"$set": {"status": "Submitted"}})
    return await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})


@api_router.post("/tournament-invoices/{iid}/approve", response_model=TournamentInvoice)
async def approve_invoice(iid: str):
    doc = await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, "Only submitted invoices can be approved.")
    await db.tournament_invoices.update_one({"id": iid}, {"$set": {"status": "Approved"}})
    return await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})


@api_router.post("/tournament-invoices/{iid}/reject", response_model=TournamentInvoice)
async def reject_invoice(iid: str, reason: str = ""):
    doc = await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    await db.tournament_invoices.update_one({"id": iid}, {"$set": {
        "status": "Rejected", "notes": (doc.get("notes") or "") + f" · Rejected: {reason}",
    }})
    return await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})


# ── MPCA-201 · Bulk actions ────────────────────────────────────────────────
class BulkInvoiceAction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ids: List[str] = Field(default_factory=list)
    tournament_id: Optional[str] = None
    body_id: Optional[str] = None


@api_router.post("/tournament-invoices/bulk-submit")
async def bulk_submit_invoices(payload: BulkInvoiceAction):
    """Division-side · submit every eligible (Draft/Rejected) invoice for a
    (tournament, body) — or an explicit id list — to MPCA in one shot."""
    q: dict = {"status": {"$in": ["Draft", "Rejected"]}}
    if payload.ids:
        q["id"] = {"$in": payload.ids}
    else:
        if not (payload.tournament_id and payload.body_id):
            raise HTTPException(400, "Provide `ids` or both `tournament_id` and `body_id`.")
        q.update({"tournament_id": payload.tournament_id, "body_id": payload.body_id})
    docs = await db.tournament_invoices.find(q, {"_id": 0, "id": 1}).to_list(500)
    ids = [d["id"] for d in docs]
    if ids:
        await db.tournament_invoices.update_many({"id": {"$in": ids}}, {"$set": {"status": "Submitted"}})
    return {"submitted_count": len(ids), "ids": ids}


@api_router.post("/tournament-invoices/bulk-approve")
async def bulk_approve_invoices(payload: BulkInvoiceAction):
    """MPCA-side · approve every Submitted invoice for a (tournament, body)
    or an explicit id list in one shot."""
    q: dict = {"status": "Submitted"}
    if payload.ids:
        q["id"] = {"$in": payload.ids}
    else:
        if not (payload.tournament_id and payload.body_id):
            raise HTTPException(400, "Provide `ids` or both `tournament_id` and `body_id`.")
        q.update({"tournament_id": payload.tournament_id, "body_id": payload.body_id})
    docs = await db.tournament_invoices.find(q, {"_id": 0, "id": 1}).to_list(500)
    ids = [d["id"] for d in docs]
    if ids:
        await db.tournament_invoices.update_many({"id": {"$in": ids}}, {"$set": {"status": "Approved"}})
    return {"approved_count": len(ids), "ids": ids}


@api_router.delete("/tournament-invoices/{iid}")
async def delete_invoice(iid: str):
    doc = await db.tournament_invoices.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    if doc["status"] != "Draft":
        raise HTTPException(409, "Only Draft invoices can be deleted.")
    # MPCA-168 · Phase E · lock deletes too once a claim is Submitted+.
    active_claim = await db.tournament_reimbursement_claims.find_one({
        "tournament_id": doc["tournament_id"],
        "body_id": doc["body_id"],
        "status": {"$in": ["Submitted", "Under_Review", "Approved"]},
    }, {"_id": 0, "claim_ref": 1, "status": 1})
    if active_claim:
        raise HTTPException(
            409,
            f"Invoice locked — reimbursement claim {active_claim.get('claim_ref')} is "
            f"{active_claim.get('status').lower().replace('_', ' ')}.",
        )
    await db.tournament_invoices.delete_one({"id": iid})
    return {"ok": True}


# ═══════════════════ Grant Eligibility Compute ═══════════════════


async def _apply_grant_eligibility(inv: TournamentInvoice) -> TournamentInvoice:
    """Compute over_budget + eligible amounts against remaining head budget.
    Sprint T-RIM · when the invoice has multi-head allocations, eligibility is
    computed per head and aggregated. Legacy single-head invoices continue to work."""
    inv.total_inr = round(float(inv.amount_inr or 0) + float(inv.gst_inr or 0), 2)

    if not inv.budget_id:
        # No budget attached — treat as fully eligible
        inv.eligible_for_grant_inr = inv.total_inr
        inv.ineligible_for_grant_inr = 0.0
        inv.over_budget_amount_inr = 0.0
        return inv
    tb = await db.tournament_budgets.find_one({"id": inv.budget_id}, {"_id": 0})
    if not tb:
        inv.eligible_for_grant_inr = inv.total_inr
        return inv

    heads_ref = tb.get("approved_head_allocations") or tb.get("head_allocations") or []
    # Build a head-label → limit map, and code → label map for legacy lookup
    head_limit_by_label: dict = {}
    for h in heads_ref:
        head_limit_by_label[h.get("head")] = float(h.get("limit_inr") or 0)

    # ─────── Multi-head path ───────
    if inv.allocations:
        # Fetch peer invoices once (perf) — filter per head in memory.
        other_invoices = await db.tournament_invoices.find({
            "budget_id": inv.budget_id,
            "status": {"$in": ["Approved", "Submitted"]},
            "id": {"$ne": inv.id},
        }, {"_id": 0}).to_list(500)
        total_eligible = 0.0
        total_over = 0.0
        for alloc in inv.allocations:
            head_label = alloc.head_label or HEAD_CODE_TO_LABEL.get((alloc.head_code or "").upper(), alloc.head_code)
            head_code = (alloc.head_code or HEAD_LABEL_TO_CODE.get(head_label, "")).upper()
            head_limit = head_limit_by_label.get(head_label, 0.0)
            alloc_amt = float(alloc.amount_inr or 0)
            spent_so_far = 0.0
            for p in other_invoices:
                p_allocs = p.get("allocations") or []
                if p_allocs:
                    for pa in p_allocs:
                        if pa.get("head_label") == head_label or (pa.get("head_code") or "").upper() == head_code:
                            spent_so_far += float(pa.get("amount_inr") or 0)
                else:
                    if (p.get("budget_head_code") or "").upper() == head_code:
                        spent_so_far += float(p.get("total_inr") or 0)
            remaining = max(head_limit - spent_so_far, 0.0)
            if head_limit == 0:
                # unknown head → treat as fully eligible (no budget cap)
                total_eligible += alloc_amt
            elif alloc_amt <= remaining:
                total_eligible += alloc_amt
            else:
                total_eligible += remaining
                total_over += (alloc_amt - remaining)
        inv.eligible_for_grant_inr = round(total_eligible, 2)
        inv.ineligible_for_grant_inr = round(total_over, 2)
        inv.over_budget_amount_inr = round(total_over, 2)
        return inv

    # ─────── Legacy single-head path ───────
    if not inv.budget_head_code:
        inv.eligible_for_grant_inr = inv.total_inr
        inv.ineligible_for_grant_inr = 0.0
        inv.over_budget_amount_inr = 0.0
        return inv
    head_label = HEAD_CODE_TO_LABEL.get(inv.budget_head_code.upper(), inv.budget_head_code)
    head_limit = head_limit_by_label.get(head_label, 0.0)
    # Compute already-spent (approved invoices for same head)
    prev = await db.tournament_invoices.find({
        "budget_id": inv.budget_id,
        "budget_head_code": inv.budget_head_code,
        "status": {"$in": ["Approved", "Submitted"]},
        "id": {"$ne": inv.id},
    }, {"_id": 0}).to_list(200)
    spent_so_far = float(sum((p.get("total_inr") or 0) for p in prev))
    remaining = max(head_limit - spent_so_far, 0.0)
    if inv.total_inr <= remaining or head_limit == 0:
        inv.eligible_for_grant_inr = inv.total_inr
        inv.ineligible_for_grant_inr = 0.0
        inv.over_budget_amount_inr = max(0.0, inv.total_inr - remaining) if head_limit > 0 else 0.0
    else:
        inv.eligible_for_grant_inr = round(remaining, 2)
        inv.ineligible_for_grant_inr = round(inv.total_inr - remaining, 2)
        inv.over_budget_amount_inr = round(inv.total_inr - remaining, 2)
    return inv


# ═══════════════════ Budget vs Actual Tracker ═══════════════════


@api_router.get("/tournament-budgets/{bid}/tracker")
async def budget_tracker(bid: str):
    """Head-wise Approved · Spent · Remaining · Over-Budget · Ineligible-for-grant."""
    tb = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not tb:
        raise HTTPException(404, "Budget not found")
    heads_ref = tb.get("approved_head_allocations") or tb.get("head_allocations") or []
    invoices = await db.tournament_invoices.find({
        "budget_id": bid, "status": {"$in": ["Approved", "Submitted"]},
    }, {"_id": 0}).to_list(500)

    def _code(h):
        return HEAD_LABEL_TO_CODE.get(h.get("head") or "", (h.get("head") or "").upper().replace(" ", "_"))

    rows = []
    grand_approved = 0.0
    grand_spent = 0.0
    grand_over = 0.0
    for h in heads_ref:
        code = _code(h)
        head_label = h.get("head")
        limit = float(h.get("limit_inr") or 0)
        # spent = sum of (a) allocation amounts matching this head + (b) legacy single-head totals matching code
        spent = 0.0
        for i in invoices:
            allocs = i.get("allocations") or []
            if allocs:
                for a in allocs:
                    # match by label first (preferred), otherwise by code — never double-count
                    if a.get("head_label") == head_label:
                        spent += float(a.get("amount_inr") or 0)
                    elif (a.get("head_code") or "").upper() == code:
                        spent += float(a.get("amount_inr") or 0)
            else:
                if (i.get("budget_head_code") or "").upper() == code:
                    spent += float(i.get("total_inr") or 0)
        over = max(0.0, spent - limit)
        eligible = min(spent, limit)
        rows.append({
            "head": h.get("head"),
            "head_code": code,
            "limit_inr": round(limit, 2),
            "spent_inr": round(spent, 2),
            "remaining_inr": round(max(limit - spent, 0), 2),
            "over_budget_inr": round(over, 2),
            "eligible_inr": round(eligible, 2),
            "ineligible_inr": round(over, 2),
            "utilisation_pct": round(spent * 100.0 / limit, 1) if limit > 0 else 0.0,
        })
        grand_approved += limit
        grand_spent += spent
        grand_over += over
    return {
        "budget_id": bid,
        "budget_no": tb.get("budget_no"),
        "tournament_id": tb.get("tournament_id"),
        "tournament_name": tb.get("tournament_name"),
        "heads": rows,
        "totals": {
            "approved_inr": round(grand_approved, 2),
            "spent_inr": round(grand_spent, 2),
            "remaining_inr": round(max(grand_approved - grand_spent, 0), 2),
            "over_budget_inr": round(grand_over, 2),
            "utilisation_pct": round(grand_spent * 100.0 / grand_approved, 1) if grand_approved > 0 else 0.0,
        },
        "invoice_count": len(invoices),
    }
