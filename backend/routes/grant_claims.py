"""Routes · Sprint M14 — Grant Claims + AI Document Verification + AI Assistant.

Non-tournament schemes (Annual Grants 1-A, Coaching Grants 3-E.x, Awards 4-x,
Infrastructure 5-B, Office 6-A, Ground 6-B, Welfare 7-A) all use this generic
claim workflow: Division/District picks a scheme → uploads required documents
one-by-one (each AI-verified) → submits to MPCA → MPCA reviews & approves.

Also exposes an AI Assistant chat endpoint (Gemini) for divisions/districts to
ask "which grants am I eligible for?" and get scheme-aware answers.
"""
import os
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal
from fastapi import HTTPException, Request, Header, Depends
from lib.authz import principal_body_code, principal_role_id, principal_body_type, principal_persona_id
from fastapi import Depends
from pydantic import BaseModel, ConfigDict, Field

import asyncio
from core.infra import db, api_router
from core.shared_services import next_seq  # H6 · atomic sequence
from core.scoping import get_scope, body_scope
from core.helpers import _create_notification


GrantClaimStatus = Literal["Draft", "Documents_Pending", "Submitted", "Under_Review", "Approved", "Rejected", "Sanctioned", "Payment_Made"]


class GrantClaimDoc(BaseModel):
    model_config = ConfigDict(extra="ignore")
    doc_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    required_label: str                              # matches scheme.required_documents[i]
    filename: Optional[str] = None
    file_url: Optional[str] = None
    uploaded_at: Optional[str] = None
    ai_verified: bool = False
    ai_confidence: float = 0.0                       # 0-1
    ai_notes: Optional[str] = None
    ai_extracted: dict = Field(default_factory=dict)  # amounts, dates, party names etc.
    from_vault: bool = False                         # M33 · true when attached from Body Data Warehouse
    vault_doc_id: Optional[str] = None


class GrantClaimExtraDoc(BaseModel):
    """MPCA-250 · Optional supporting document (not required by the scheme).
    Division uploads any number of these to strengthen their claim.
    Iter 125 · Now carries the same AI verification fields as required docs
    so `ai_review_claim` can validate optional evidence too."""
    model_config = ConfigDict(extra="ignore")
    doc_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str                                 # short label filled by Division
    filename: Optional[str] = None
    file_url: Optional[str] = None
    uploaded_at: Optional[str] = None
    uploaded_by: Optional[str] = None
    # Iter 125 · AI verdict (mirrors GrantClaimDoc)
    ai_verified: Optional[bool] = None
    ai_confidence: Optional[float] = None
    ai_notes: Optional[str] = None
    ai_extracted: dict = Field(default_factory=dict)
    signature_detected: Optional[bool] = None
    stamp_detected: Optional[bool] = None
    signed_by: Optional[str] = None


class GrantClaimBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scheme_code: str
    body_id: str
    fiscal_cycle: str = "2025-26"
    claimed_amount_inr: float = 0.0
    notes: Optional[str] = None
    purpose_of_claim: Optional[str] = None           # MPCA-250 · long-text purpose


class GrantClaimAiSummary(BaseModel):
    """M38 · Claim-level AI verdict rolled up from per-doc AI results + a
    cross-doc consistency check that compares extracted amounts against
    the claimed amount and flags any anomalies (missing docs, mismatched
    dates, low-confidence signals, duplicated invoices, etc.)."""
    model_config = ConfigDict(extra="ignore")
    overall_verdict: Literal["Recommend_Approve", "Manual_Review", "Recommend_Reject"] = "Manual_Review"
    overall_confidence: float = 0.0                  # avg of per-doc confidences (0..1)
    docs_verified: int = 0                           # count with ai_verified=True
    docs_total: int = 0
    extras_verified: int = 0                         # Iter 125 · optional supporting docs verified
    extras_total: int = 0
    amount_match_note: Optional[str] = None          # e.g. "Claimed ₹1L vs Detected ₹1L (match)"
    critical_issues: List[str] = []                  # explicit red flags
    advisory_notes: List[str] = []                   # softer signals
    validated_at: Optional[str] = None
    validated_by: Optional[str] = None


class GrantClaim(GrantClaimBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    claim_ref: str
    scheme_name: Optional[str] = None
    body_name: Optional[str] = None
    status: GrantClaimStatus = "Draft"
    documents: List[GrantClaimDoc] = []
    extra_documents: List[GrantClaimExtraDoc] = []   # MPCA-250 · supporting docs
    submitted_by: Optional[str] = None
    submitted_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_amount_inr: Optional[float] = None
    mpca_comments: List[dict] = Field(default_factory=list)
    ai_summary: Optional[GrantClaimAiSummary] = None    # M38 · Claim-level AI verdict
    # MPCA-245 · Signed-artifact workflow (matches Squad flow)
    signed_submission_url: Optional[str] = None
    signed_submission_at: Optional[str] = None
    signed_submission_by: Optional[str] = None
    signed_approval_url:   Optional[str] = None
    signed_approval_at:    Optional[str] = None
    signed_approval_by:    Optional[str] = None
    # MPCA-245 · Payment_Made stage
    payment_utr:         Optional[str] = None
    payment_amount_inr:  Optional[float] = None
    payment_date:        Optional[str] = None
    payment_receipt_url: Optional[str] = None
    payment_made_by:     Optional[str] = None
    payment_made_at:     Optional[str] = None
    # Feb 2026 · Fix E · Camp reimbursement linkage
    # When a claim is auto-materialised from a Division-owned tournament's
    # locked budget + invoices, these fields link back so MPCA can see the
    # source camp and the bundled invoice evidence.
    attached_tournament_id:        Optional[str] = None
    attached_tournament_budget_id: Optional[str] = None
    attached_invoice_ids:          List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class GrantClaimCreate(GrantClaimBase): pass


async def _next_claim_ref(cycle: str) -> str:
    seq = await next_seq(f"grant_claim:{cycle}", lambda: db.grant_claims.count_documents({"fiscal_cycle": cycle}))
    return f"GRC-{cycle}-{seq:04d}"


# ═══════════════════ CRUD ═══════════════════

@api_router.get("/grant-claims", response_model=List[GrantClaim])
async def list_grant_claims(request: Request, scheme_code: Optional[str] = None, body_id: Optional[str] = None, status: Optional[GrantClaimStatus] = None, skip: int = 0, limit: int = 500):
    q: dict = {}
    if scheme_code: q["scheme_code"] = scheme_code
    if body_id: q["body_id"] = body_id
    else: q.update(body_scope(get_scope(request)))
    if status: q["status"] = status
    docs = await db.grant_claims.find(q, {"_id": 0}).sort("created_at", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    return docs


@api_router.get("/grant-claims/{cid}", response_model=GrantClaim)
async def get_grant_claim(cid: str):
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Grant claim not found")
    return doc


@api_router.post("/grant-claims", response_model=GrantClaim)
async def create_grant_claim(payload: GrantClaimCreate):
    # M39c · Block new claims until MPCA has activated the schemes for the
    # requested fiscal cycle by uploading the signed master PDF.
    from routes.events import is_season_activated
    if not await is_season_activated(payload.fiscal_cycle):
        raise HTTPException(
            403,
            f"Schemes for {payload.fiscal_cycle} are not yet activated. Please wait "
            "until MPCA uploads the signed Schemes PDF for this season under the "
            "MPCA Schemes Register.",
        )
    scheme = await db.reimbursement_schemes.find_one({"scheme_code": payload.scheme_code}, {"_id": 0})
    if not scheme:
        raise HTTPException(404, f"Scheme {payload.scheme_code} not found")
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body {payload.body_id} not found")
    # Idempotency: reject if there's an active claim for same body+scheme+cycle
    existing = await db.grant_claims.find_one({
        "scheme_code": payload.scheme_code, "body_id": payload.body_id,
        "fiscal_cycle": payload.fiscal_cycle,
        "status": {"$in": ["Draft", "Documents_Pending", "Submitted", "Under_Review", "Approved"]},
    }, {"_id": 0})
    if existing:
        raise HTTPException(409, f"An active grant claim ({existing['status']}) already exists for this scheme in this cycle.")
    ref = await _next_claim_ref(payload.fiscal_cycle)
    # Pre-seed doc slots from scheme.required_documents
    docs = [GrantClaimDoc(required_label=lbl).model_dump() for lbl in (scheme.get("required_documents") or [])]
    claim = GrantClaim(
        claim_ref=ref, scheme_name=scheme.get("name"), body_name=body.get("name"),
        status="Documents_Pending" if docs else "Draft", documents=docs,
        **payload.model_dump(),
    )
    await db.grant_claims.insert_one(claim.model_dump())
    return claim


@api_router.post("/grant-claims/{cid}/document/{doc_id}")
async def attach_document(cid: str, doc_id: str, file_url: str, filename: str, from_vault: bool = False, vault_doc_id: Optional[str] = None):
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    now = datetime.now(timezone.utc).isoformat()
    docs = doc.get("documents", [])
    updated = False
    for d in docs:
        if d.get("doc_id") == doc_id:
            d["file_url"] = file_url
            d["filename"] = filename
            d["uploaded_at"] = now
            d["from_vault"] = from_vault
            d["vault_doc_id"] = vault_doc_id
            updated = True
            break
    if not updated:
        raise HTTPException(404, "Document slot not found")
    await db.grant_claims.update_one({"id": cid}, {"$set": {"documents": docs, "updated_at": now}})
    # Auto-run AI verification
    ai_result = await _ai_verify_document(next(d for d in docs if d["doc_id"] == doc_id))
    for d in docs:
        if d.get("doc_id") == doc_id:
            d.update(ai_result)
    await db.grant_claims.update_one({"id": cid}, {"$set": {"documents": docs}})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


async def _ai_verify_document(doc: dict) -> dict:
    """Use Gemini to verify uploaded document matches the required label."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType  # type: ignore
        import mimetypes
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return {"ai_verified": False, "ai_confidence": 0.0, "ai_notes": "EMERGENT_LLM_KEY not set"}

        # Build local file path from /api/uploads/{id} URL
        file_url = doc.get("file_url") or ""
        if file_url.startswith("/api/uploads/"):
            upload_id = file_url.rsplit("/", 1)[-1]
            up = await db.uploads.find_one({"id": upload_id})   # need full doc incl. _path
            if not up:
                return {"ai_verified": False, "ai_confidence": 0.0, "ai_notes": "Upload record not found"}
            local_path = up.get("_path") or up.get("storage_path")
            if not local_path:
                return {"ai_verified": False, "ai_confidence": 0.0, "ai_notes": "Upload path missing on record"}
            mime = up.get("mime_type") or mimetypes.guess_type(up.get("original_name") or "")[0] or "application/pdf"
        else:
            return {"ai_verified": False, "ai_confidence": 0.0, "ai_notes": "Unrecognised file URL"}

        chat = LlmChat(api_key=key, session_id=f"doc-verify-{doc['doc_id']}",
                       system_message="You are an MPCA compliance document verifier. Respond in strict JSON only.")
        chat = chat.with_model("gemini", "gemini-3.6-flash")
        # Iter 125 · Also supports extra_documents (uses `description` when
        # `required_label` is absent — description is Division-authored, e.g.
        # "Quotation 1", "Vendor Quote — Kit").
        expected_label = doc.get("required_label") or doc.get("description") or "Supporting document"
        prompt = f"""Verify if the attached document matches the EXPECTED DOCUMENT TYPE.

EXPECTED: {expected_label}

Return ONLY a JSON object (no prose, no code fences) with keys:
{{
  "matches": true/false,
  "confidence": 0.0-1.0,
  "document_type_detected": "...",
  "key_details": {{"date": "...", "amount": "...", "party": "...", "any_other_signal": "..."}},
  "signature_detected": true/false,
  "stamp_detected": true/false,
  "signed_by": "name and designation of the signatory if visible, else empty string",
  "issues": ["issue1", "issue2"],
  "verdict_note": "one line summary"
}}
Note: `signature_detected` means a handwritten or scanned signature is visible on the page.
`stamp_detected` means an official rubber stamp / seal is visible."""
        file_content = FileContentWithMimeType(file_path=local_path, mime_type=mime)
        resp = await asyncio.wait_for(  # H4 · timeout guard
            chat.send_message(UserMessage(text=prompt, file_contents=[file_content])), timeout=45)
        txt = str(resp).strip()
        # Strip markdown code fences
        if txt.startswith("```"):
            txt = txt.split("```")[1] if len(txt.split("```")) > 1 else txt
            if txt.startswith("json"):
                txt = txt[4:].strip()
        data = json.loads(txt)
        return {
            "ai_verified": bool(data.get("matches")),
            "ai_confidence": float(data.get("confidence") or 0),
            "ai_notes": data.get("verdict_note") or "",
            "signature_detected": bool(data.get("signature_detected")),
            "stamp_detected": bool(data.get("stamp_detected")),
            "signed_by": (data.get("signed_by") or "").strip() or None,
            "ai_extracted": {
                "document_type_detected": data.get("document_type_detected"),
                "key_details": data.get("key_details") or {},
                "issues": data.get("issues") or [],
            },
        }
    except Exception as e:
        return {"ai_verified": False, "ai_confidence": 0.0, "ai_notes": f"AI verification error: {e}"}


@api_router.post("/grant-claims/{cid}/submit", response_model=GrantClaim)
async def submit_grant_claim(cid: str, actor_name: Optional[str] = None):
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Draft", "Documents_Pending", "Rejected"):
        raise HTTPException(409, f"Cannot submit from status {doc['status']}")
    # All documents must have a file uploaded (AI verification not strictly required — MPCA may re-verify)
    missing = [d["required_label"] for d in doc.get("documents", []) if not d.get("file_url")]
    if missing:
        raise HTTPException(422, f"Missing required documents: {', '.join(missing)}")
    # MPCA-245 · Signed submission summary PDF is mandatory before submission.
    if not doc.get("signed_submission_url"):
        raise HTTPException(
            400,
            "Signed submission summary is required. Download the summary PDF from "
            "'/grant-claims/{cid}/summary-pdf', get it signed, then upload via "
            "'/grant-claims/{cid}/signed-upload' before submitting.",
        )
    now = datetime.now(timezone.utc).isoformat()
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "status": "Submitted", "submitted_by": actor_name, "submitted_at": now, "updated_at": now,
    }})
    await _create_notification(
        recipient_role_id="secretary", recipient_body_id="MPCA",
        title=f"Grant Claim submitted · {doc['claim_ref']}",
        message=f"{doc.get('body_name')} · Scheme {doc['scheme_code']} · Claim ₹{doc.get('claimed_amount_inr', 0):,.0f}",
        link=f"/grant-claims/{cid}", related_type="grant_claim", related_id=cid,
        severity="info", kind="info",
    )
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/grant-claims/{cid}/documents/{doc_id}/re-verify", response_model=GrantClaim)
async def re_verify_document(cid: str, doc_id: str):
    """M38 · Manually re-run AI verification on a single document.

    Useful when the first pass returned low confidence or an intermittent
    error (LLM timeout, missing key, etc.). Doesn't touch the file — just
    replays the Gemini prompt and merges the new verdict back in.
    """
    claim = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    target = next((d for d in claim.get("documents", []) if d.get("doc_id") == doc_id), None)
    if not target:
        raise HTTPException(404, "Document slot not found")
    if not target.get("file_url"):
        raise HTTPException(400, "Cannot re-verify — no file has been uploaded on this slot yet.")
    ai_result = await _ai_verify_document(target)
    docs = claim.get("documents", [])
    for d in docs:
        if d.get("doc_id") == doc_id:
            d.update(ai_result)
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "documents": docs, "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/grant-claims/{cid}/ai-review", response_model=GrantClaim)
async def ai_review_claim(cid: str, actor_name: Optional[str] = None):
    """M38 · Full-claim AI review — re-verifies any docs that failed or have
    low confidence, runs a cross-doc consistency check (amounts vs claimed,
    dates vs fiscal cycle, duplicate detection), and stamps a rolled-up
    `ai_summary` on the claim so MPCA reviewers see one advisory verdict
    (Recommend Approve · Manual Review · Recommend Reject) before deciding.
    """
    claim = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    docs = claim.get("documents", [])
    extras = claim.get("extra_documents", []) or []
    if not docs and not extras:
        raise HTTPException(400, "No documents on this claim to review.")

    # 1) Re-run per-doc AI for anything missing OR below 0.6 confidence
    for d in docs:
        if not d.get("file_url"):
            continue
        conf = float(d.get("ai_confidence") or 0)
        if not d.get("ai_verified") or conf < 0.6:
            verdict = await _ai_verify_document(d)
            d.update(verdict)

    # Iter 125 · Also verify optional supporting docs (extra_documents) so
    # MPCA sees whether Quotations / additional evidence are genuine.
    for d in extras:
        if not d.get("file_url"):
            continue
        conf = float(d.get("ai_confidence") or 0)
        if not d.get("ai_verified") or conf < 0.6:
            verdict = await _ai_verify_document(d)
            d.update(verdict)

    # 2) Roll up + cross-checks
    filled = [d for d in docs if d.get("file_url")]
    verified = [d for d in filled if d.get("ai_verified")]
    filled_extras = [d for d in extras if d.get("file_url")]
    verified_extras = [d for d in filled_extras if d.get("ai_verified")]
    total_docs = len(docs)
    filled_count = len(filled)
    verified_count = len(verified)
    # Confidence includes filled extras so approvers see the overall signal.
    all_filled = filled + filled_extras
    avg_conf = round(sum(float(d.get("ai_confidence") or 0) for d in all_filled) / max(len(all_filled), 1), 3)

    critical: List[str] = []
    advisory: List[str] = []
    amount_note: Optional[str] = None

    if filled_count < total_docs:
        critical.append(f"{total_docs - filled_count} required document(s) missing.")
    if filled_extras:
        advisory.append(f"{verified_extras.__len__()}/{len(filled_extras)} optional supporting document(s) AI-verified.")

    # Cross-doc · amount consistency: sum any 'amount' fields extracted vs claimed
    claimed = float(claim.get("claimed_amount_inr") or 0)
    detected_amounts: List[float] = []
    # Iter 125 · Amount cross-check now also considers optional supporting docs
    # (e.g. Quotation Rs 3,00,000 for infrastructure grant).
    for d in all_filled:
        keys = (d.get("ai_extracted") or {}).get("key_details") or {}
        raw_amt = keys.get("amount") or keys.get("total") or keys.get("value")
        if isinstance(raw_amt, (int, float)):
            detected_amounts.append(float(raw_amt))
        elif isinstance(raw_amt, str):
            # Best-effort parse ("Rs 1,20,000" → 120000)
            import re as _re
            cleaned = _re.sub(r"[^\d.]", "", raw_amt)
            try:
                if cleaned:
                    detected_amounts.append(float(cleaned))
            except ValueError:
                pass
    if claimed > 0 and detected_amounts:
        top_amt = max(detected_amounts)
        drift_pct = abs(top_amt - claimed) / claimed * 100 if claimed else 0
        if drift_pct <= 5:
            amount_note = f"Claimed ₹{claimed:,.0f} matches highest extracted invoice ₹{top_amt:,.0f} (within 5%)."
        elif drift_pct <= 15:
            amount_note = f"Claimed ₹{claimed:,.0f} vs top extracted ₹{top_amt:,.0f} — {drift_pct:.1f}% variance. Please double-check."
            advisory.append(amount_note)
        else:
            amount_note = f"Claimed ₹{claimed:,.0f} vs top extracted ₹{top_amt:,.0f} — {drift_pct:.1f}% variance."
            critical.append(f"Amount mismatch >15% · {amount_note}")
    elif claimed > 0:
        advisory.append("Could not extract any amount from uploaded documents to cross-check.")

    # Cross-doc · fiscal-cycle date sanity
    cycle_year = claim.get("fiscal_cycle", "").split("-")[0]
    if cycle_year and cycle_year.isdigit():
        year_int = int(cycle_year)
        for d in all_filled:
            keys = (d.get("ai_extracted") or {}).get("key_details") or {}
            date_str = keys.get("date") or ""
            if isinstance(date_str, str) and date_str:
                import re as _re
                m = _re.search(r"(20\d{2})", date_str)
                if m:
                    doc_year = int(m.group(1))
                    if doc_year < year_int - 1 or doc_year > year_int + 1:
                        label = d.get("required_label") or d.get("description") or "Document"
                        advisory.append(f"{label} is dated {date_str} — outside fiscal cycle {claim.get('fiscal_cycle')}.")

    # Low confidence signal
    low_conf = [d for d in all_filled if float(d.get("ai_confidence") or 0) < 0.5]
    if low_conf:
        advisory.append(f"{len(low_conf)} document(s) have AI confidence below 50% — manual eyeball recommended.")

    # Roll up verdict
    if critical:
        verdict = "Recommend_Reject"
    elif filled_count == total_docs and verified_count == filled_count and avg_conf >= 0.7 and not advisory:
        verdict = "Recommend_Approve"
    else:
        verdict = "Manual_Review"

    ai_summary = {
        "overall_verdict": verdict,
        "overall_confidence": avg_conf,
        "docs_verified": verified_count,
        "docs_total": total_docs,
        "extras_verified": len(verified_extras),
        "extras_total": len(filled_extras),
        "amount_match_note": amount_note,
        "critical_issues": critical,
        "advisory_notes": advisory,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "validated_by": actor_name or "AI Gatekeeper",
    }
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "documents": docs,
        "extra_documents": extras,
        "ai_summary": ai_summary,
        "updated_at": ai_summary["validated_at"],
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/grant-claims/{cid}/approve", response_model=GrantClaim)
async def approve_grant_claim(cid: str, approved_amount_inr: float, actor_name: str, notes: Optional[str] = None):
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot approve from status {doc['status']}")
    # MPCA-245 · Signed MPCA-approval summary is mandatory before approval.
    if not doc.get("signed_approval_url"):
        raise HTTPException(
            400,
            "Signed approval summary is required. Download the approval summary from "
            "'/grant-claims/{cid}/summary-pdf?variant=approval', get it signed by MPCA "
            "office-bearers, then upload via '/grant-claims/{cid}/mpca-signed-upload' "
            "before approving.",
        )
    now = datetime.now(timezone.utc).isoformat()
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "status": "Approved", "approved_amount_inr": float(approved_amount_inr),
        "reviewed_by": actor_name, "reviewed_at": now, "updated_at": now,
    }})
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=doc["body_id"],
        title=f"Grant Claim APPROVED · {doc['claim_ref']}",
        message=f"₹{approved_amount_inr:,.0f} approved" + (f" · {notes}" if notes else ""),
        link=f"/grant-claims/{cid}", related_type="grant_claim", related_id=cid,
        severity="info", kind="info",
    )
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/grant-claims/{cid}/reject", response_model=GrantClaim)
async def reject_grant_claim(cid: str, actor_name: str, reason: str):
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    # MPCA-112 · MPCA may reject a grant claim even AFTER it was approved
    # (post-approval audit, missing signatures, invoice discrepancies). The
    # claim remains visible in the Approved-by-MPCA list with a Rejected pill
    # + rejection_reason so the Division sees the audit trail.
    if doc["status"] not in ("Submitted", "Under_Review", "Approved"):
        raise HTTPException(409, f"Cannot reject from status {doc['status']}")
    if not reason:
        raise HTTPException(400, "Rejection reason required")
    now = datetime.now(timezone.utc).isoformat()
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "status": "Rejected", "rejection_reason": reason, "reviewed_by": actor_name,
        "reviewed_at": now, "updated_at": now,
    }})
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=doc["body_id"],
        title=f"Grant Claim REJECTED · {doc['claim_ref']}",
        message=reason, link=f"/grant-claims/{cid}", related_type="grant_claim", related_id=cid,
        severity="warning", kind="info",
    )
    # MPCA-118 · Fire SMTP notice on post-approval audit rejection.
    try:
        from core.email_notifications import send_claim_rejection_notice
        await send_claim_rejection_notice(doc, reason)
    except Exception as e:  # noqa: BLE001
        import logging
        logging.getLogger("grant_claims").warning("Rejection email failed: %s", e)
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


# ═══════════════════ MPCA-245 · Signed workflow + Payment + Discussions ═══════════════════

class SignedUploadPayload(BaseModel):
    signed_url: str


class ExtraDocumentPayload(BaseModel):
    description: str
    file_url: str
    filename: Optional[str] = None


class PurposePatchPayload(BaseModel):
    purpose_of_claim: str


class AmountPatchPayload(BaseModel):
    claimed_amount_inr: float


# Iter 123l · MPCA can bounce a Submitted / Under_Review claim back to the
# Division with a request for more / corrected documents. Division sees the
# claim again in `Documents_Pending`, upload widget + amount editor unlock,
# and the message is auto-posted to the Discussion tab so the audit trail
# lives in one place.
class ReopenPayload(BaseModel):
    reason: str
    actor_name: str


class MpcaPaymentPayload(BaseModel):
    utr: str
    amount_inr: float
    payment_date: str
    receipt_url: Optional[str] = None
    notes: Optional[str] = None


class GrantDiscussionCreate(BaseModel):
    author_name: str
    author_body: Optional[str] = None
    author_body_type: Optional[str] = None
    message: str


@api_router.get("/grant-claims/{cid}/summary-pdf")
async def grant_summary_pdf(cid: str, variant: str = "submission"):
    """Generate a signable summary PDF for the grant claim.

    variant=submission → Division-side (claim details, purpose, requested amount, docs list)
    variant=approval   → MPCA-side (adds reviewer notes, approved amount placeholder)
    """
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    import io

    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm,
                            leftMargin=1.5*cm, rightMargin=1.5*cm,
                            title=f"Grant Claim {doc.get('claim_ref')}")
    styles = getSampleStyleSheet()
    story = []

    title = "GRANT CLAIM · MPCA APPROVAL SUMMARY" if variant == "approval" else "GRANT CLAIM · DIVISION SUBMISSION SUMMARY"
    story.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
    story.append(Paragraph(f"Ref: {doc.get('claim_ref')} · Cycle: {doc.get('fiscal_cycle')}",
                           styles["Normal"]))
    story.append(Spacer(1, 12))

    meta = [
        ["Scheme",       doc.get("scheme_code") or ""],
        ["Scheme Name",  doc.get("scheme_name") or ""],
        ["Body",         f"{doc.get('body_name') or ''} ({doc.get('body_id') or ''})"],
        ["Claimed",      f"INR {(doc.get('claimed_amount_inr') or 0):,.0f}"],
        ["Status",       doc.get("status") or ""],
    ]
    if variant == "approval":
        meta.append(["Approved",     f"INR {(doc.get('approved_amount_inr') or 0):,.0f}"])
        meta.append(["Reviewed by",  doc.get("reviewed_by") or "________________"])
    tbl = Table(meta, colWidths=[5*cm, 12*cm])
    tbl.setStyle(TableStyle([
        ("BOX",         (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID",   (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
        ("BACKGROUND",  (0, 0), (0, -1), colors.HexColor("#f4ede0")),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 14))

    if doc.get("notes"):
        story.append(Paragraph("<b>Notes</b>", styles["Heading3"]))
        story.append(Paragraph(doc["notes"], styles["Normal"]))
        story.append(Spacer(1, 10))

    # MPCA-250 · Purpose of claim (long text)
    if doc.get("purpose_of_claim"):
        story.append(Paragraph("<b>Purpose of Claim</b>", styles["Heading3"]))
        story.append(Paragraph(doc["purpose_of_claim"].replace("\n", "<br/>"), styles["Normal"]))
        story.append(Spacer(1, 10))

    # Documents table
    docs = doc.get("documents") or []
    if docs:
        story.append(Paragraph("<b>Documents Attached</b>", styles["Heading3"]))
        rows = [["#", "Required Label", "Filename", "AI Verified"]]
        for i, d in enumerate(docs, 1):
            rows.append([
                str(i),
                d.get("required_label") or "",
                d.get("filename") or "—",
                "✓" if d.get("ai_verified") else ("—" if not d.get("file_url") else "pending"),
            ])
        t2 = Table(rows, colWidths=[1*cm, 7*cm, 7*cm, 2*cm])
        t2.setStyle(TableStyle([
            ("BOX",         (0, 0), (-1, -1), 0.5, colors.grey),
            ("INNERGRID",   (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#3b5540")),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ]))
        story.append(t2)
        story.append(Spacer(1, 14))

    # MPCA-250 · Extra supporting documents (with descriptions)
    extras = doc.get("extra_documents") or []
    if extras:
        story.append(Paragraph("<b>Supporting Documents</b>", styles["Heading3"]))
        erows = [["#", "Description", "Filename"]]
        for i, e in enumerate(extras, 1):
            erows.append([
                str(i),
                (e.get("description") or "")[:60],
                (e.get("filename") or "—")[:40],
            ])
        t3 = Table(erows, colWidths=[1*cm, 10*cm, 6*cm])
        t3.setStyle(TableStyle([
            ("BOX",         (0, 0), (-1, -1), 0.5, colors.grey),
            ("INNERGRID",   (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#7a5c2e")),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ]))
        story.append(t3)
        story.append(Spacer(1, 14))

    # AI verdict (approval variant only)
    if variant == "approval" and doc.get("ai_summary"):
        s = doc["ai_summary"]
        story.append(Paragraph("<b>AI Verdict</b>", styles["Heading3"]))
        story.append(Paragraph(
            f"Verdict: <b>{s.get('overall_verdict')}</b> · "
            f"Confidence: {(s.get('overall_confidence') or 0)*100:.0f}% · "
            f"Docs verified: {s.get('docs_verified')}/{s.get('docs_total')}",
            styles["Normal"],
        ))
        story.append(Spacer(1, 10))

    # Signature block
    story.append(Spacer(1, 24))
    if variant == "approval":
        sig_rows = [
            ["MPCA Secretary", "MPCA Treasurer"],
            ["", ""],
            ["", ""],
            ["_______________________", "_______________________"],
            ["Signature & Date", "Signature & Date"],
        ]
    else:
        sig_rows = [
            ["Division Secretary", "Division Treasurer"],
            ["", ""],
            ["", ""],
            ["_______________________", "_______________________"],
            ["Signature & Date", "Signature & Date"],
        ]
    sig_tbl = Table(sig_rows, colWidths=[8*cm, 8*cm])
    sig_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 8),
    ]))
    story.append(sig_tbl)

    pdf.build(story)
    buf.seek(0)
    return Response(
        content=buf.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc.get("claim_ref")}-{variant}.pdf"'},
    )


@api_router.post("/grant-claims/{cid}/signed-upload", response_model=GrantClaim)
async def upload_division_signed(
    cid: str, payload: SignedUploadPayload,
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """Division uploads the signed submission summary PDF (URL)."""
    if not payload.signed_url:
        raise HTTPException(400, "signed_url is required")
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if x_body_type == "State":
        raise HTTPException(403, "MPCA cannot upload the Division-side signed summary; use /mpca-signed-upload for the approval signature.")
    now = datetime.now(timezone.utc).isoformat()
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "signed_submission_url": payload.signed_url,
        "signed_submission_at":  now,
        "signed_submission_by":  x_user_name or x_body_code,
        "updated_at":            now,
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/grant-claims/{cid}/mpca-signed-upload", response_model=GrantClaim)
async def upload_mpca_signed(
    cid: str, payload: SignedUploadPayload,
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_body_code: Optional[str] = Depends(principal_body_code),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """MPCA uploads the signed approval summary PDF (URL)."""
    if not payload.signed_url:
        raise HTTPException(400, "signed_url is required")
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if (x_body_type or "").lower() != "state":
        raise HTTPException(403, "Only MPCA can upload the approval-side signed summary.")
    now = datetime.now(timezone.utc).isoformat()
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "signed_approval_url": payload.signed_url,
        "signed_approval_at":  now,
        "signed_approval_by":  x_user_name or x_body_code,
        "updated_at":          now,
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/grant-claims/{cid}/payment", response_model=GrantClaim)
async def mark_grant_payment_made(
    cid: str, payload: MpcaPaymentPayload,
    x_body_type: Optional[str] = Depends(principal_body_type),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """MPCA records the payment made against an approved grant claim."""
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if (x_body_type or "").lower() != "state":
        raise HTTPException(403, "Only MPCA can mark payment made.")
    if doc["status"] not in ("Approved", "Sanctioned"):
        raise HTTPException(409, f"Cannot record payment from status {doc['status']}")
    now = datetime.now(timezone.utc).isoformat()
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "status":              "Payment_Made",
        "payment_utr":         payload.utr,
        "payment_amount_inr":  float(payload.amount_inr),
        "payment_date":        payload.payment_date,
        "payment_receipt_url": payload.receipt_url,
        "payment_made_by":     x_user_name,
        "payment_made_at":     now,
        "updated_at":          now,
    }})
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=doc["body_id"],
        title=f"Grant Payment Made · {doc['claim_ref']}",
        message=f"UTR {payload.utr} · ₹{payload.amount_inr:,.0f} · {payload.payment_date}",
        link=f"/grant-claims/{cid}", related_type="grant_claim", related_id=cid,
        severity="info", kind="info",
    )
    # Feb 2026 · Fix E · Propagate payment to camp-linked TournamentBudget.
    # If this claim originated from a Division-owned camp (scheme_code ==
    # "camp_reimbursement" + attached_tournament_budget_id set), flip the
    # source budget to `Reimbursed` and capture the UTR + amount.
    linked_budget_id = doc.get("attached_tournament_budget_id")
    if linked_budget_id and doc.get("scheme_code") == "camp_reimbursement":
        await db.tournament_budgets.update_one(
            {"id": linked_budget_id},
            {"$set": {
                "status": "Reimbursed",
                "reimbursed_at": now,
                "reimbursed_utr": payload.utr,
                "reimbursed_amount_inr": float(payload.amount_inr),
            }},
        )
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


# ─────── MPCA-250 · Supporting docs + purpose ───────

@api_router.patch("/grant-claims/{cid}/purpose", response_model=GrantClaim)
async def patch_purpose(cid: str, payload: PurposePatchPayload):
    if not await db.grant_claims.find_one({"id": cid}, {"_id": 1}):
        raise HTTPException(404, "Claim not found")
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "purpose_of_claim": payload.purpose_of_claim,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


# Iter 123d · Division may edit the claim amount BEFORE submission.
# Once the claim is Submitted / Under_Review / Approved / Payment_Made / Sanctioned
# the amount is frozen and any further changes must go via MPCA's approve/reject
# path (which already carries its own approved_amount_inr).
_AMOUNT_EDITABLE_STATUSES = {"Draft", "Documents_Pending", "Rejected"}


@api_router.patch("/grant-claims/{cid}/amount", response_model=GrantClaim)
async def patch_claim_amount(cid: str, payload: AmountPatchPayload, request: Request):
    claim = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    # Iter 123n · MPCA reviewers may override the claimed amount in Submitted /
    # Under_Review too — before they sign the approval PDF the amount often
    # needs a small adjustment (rate correction, cheque rounding). Division
    # can still edit in the original Draft / Documents_Pending / Rejected
    # states.
    from lib.authz import get_principal
    principal = get_principal(request)
    is_mpca = getattr(principal, "is_state", False) or (getattr(principal, "body_type", "") == "State")
    status_ok = claim.get("status") in _AMOUNT_EDITABLE_STATUSES
    mpca_ok = is_mpca and claim.get("status") in ("Submitted", "Under_Review")
    if not (status_ok or mpca_ok):
        raise HTTPException(400, f"Amount is locked once the claim is {claim.get('status')}.")
    if payload.claimed_amount_inr < 0:
        raise HTTPException(400, "Amount must be zero or positive.")
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "claimed_amount_inr": float(payload.claimed_amount_inr),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


# Iter 123l · MPCA-side "Request more documents" — reopens the claim so the
# Division can upload / correct paperwork. The rejection message is auto-
# posted to the Discussion thread for a single audit-trail source of truth.
@api_router.post("/grant-claims/{cid}/reopen-for-docs", response_model=GrantClaim)
async def reopen_for_docs(cid: str, payload: ReopenPayload):
    claim = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    if claim.get("status") not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot reopen from status {claim.get('status')}. Only Submitted or Under_Review claims can be sent back to the Division.")
    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(400, "A reason is required so the Division knows what to fix.")
    now = datetime.now(timezone.utc).isoformat()
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "status": "Documents_Pending",
        "reopened_at": now,
        "reopened_by": payload.actor_name,
        "reopen_reason": reason,
        "updated_at": now,
    }})
    # Auto-post the reopen note into the Discussion tab so both sides see it.
    await db.grant_claim_discussions.insert_one({
        "id":         str(uuid.uuid4()),
        "claim_id":   cid,
        "author_name": payload.actor_name,
        "author_body": "MPCA",
        "author_body_type": "State",
        "message":    f"[Documents Reopened] {reason}",
        "created_at": now,
        "system_tag": "reopen_for_docs",
    })
    # Notify the Division Secretary in-app.
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=claim["body_id"],
        title=f"Grant Claim Reopened · {claim['claim_ref']}",
        message=f"MPCA has requested additional documents: {reason}",
        link=f"/grant-claims/{cid}", related_type="grant_claim", related_id=cid,
        severity="warning", kind="info",
    )
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.post("/grant-claims/{cid}/extra-document", response_model=GrantClaim)
async def add_extra_document(
    cid: str, payload: ExtraDocumentPayload,
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """Add an arbitrary supporting document (with description) to a claim."""
    claim = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    entry = GrantClaimExtraDoc(
        description=payload.description,
        filename=payload.filename,
        file_url=payload.file_url,
        uploaded_at=datetime.now(timezone.utc).isoformat(),
        uploaded_by=x_user_name,
    ).model_dump()
    extras = claim.get("extra_documents") or []
    extras.append(entry)
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "extra_documents": extras,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


@api_router.delete("/grant-claims/{cid}/extra-document/{doc_id}", response_model=GrantClaim)
async def remove_extra_document(cid: str, doc_id: str):
    claim = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    extras = [e for e in (claim.get("extra_documents") or []) if e.get("doc_id") != doc_id]
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "extra_documents": extras,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


# ─────── Discussions ───────

@api_router.get("/grant-claims/{cid}/discussions")
async def list_discussions(cid: str):
    if not await db.grant_claims.find_one({"id": cid}, {"_id": 1}):
        raise HTTPException(404, "Claim not found")
    rows = await db.grant_claim_discussions.find({"claim_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return rows


@api_router.post("/grant-claims/{cid}/discussions")
async def add_discussion(cid: str, payload: GrantDiscussionCreate):
    claim = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    if not payload.message.strip():
        raise HTTPException(400, "Message is required")
    entry = {
        "id":         str(uuid.uuid4()),
        "claim_id":   cid,
        "author_name": payload.author_name,
        "author_body": payload.author_body,
        "author_body_type": payload.author_body_type,
        "message":    payload.message.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.grant_claim_discussions.insert_one(entry)
    entry.pop("_id", None)  # avoid ObjectId serialization crash

    # Feb 2026 · Discussion notifications
    # Route the ping to the OTHER party: if the author is a State (MPCA)
    # persona, notify the claim's body_id; otherwise notify MPCA reviewers.
    # Kept fire-and-forget — a notification failure never blocks the reply.
    preview = entry["message"][:100] + ("…" if len(entry["message"]) > 100 else "")
    claim_ref = claim.get("claim_ref") or cid[:8]
    try:
        if payload.author_body_type == "State":
            # MPCA → Division / District
            await _create_notification(
                recipient_role_id="division-secretary",
                recipient_body_id=claim.get("body_id"),
                title=f"MPCA replied on Grant Claim · {claim_ref}",
                message=f"{payload.author_name or 'MPCA'}: {preview}",
                link=f"/grant-claims/{cid}", related_type="grant_claim", related_id=cid,
                severity="info", kind="discussion",
            )
        else:
            # Division / District → MPCA (Treasurer + Secretary)
            for role in ("mpca-treasurer", "mpca-secretary"):
                await _create_notification(
                    recipient_role_id=role,
                    recipient_body_id="MPCA",
                    title=f"New reply on Grant Claim · {claim_ref}",
                    message=f"{payload.author_name or payload.author_body or 'Body'}: {preview}",
                    link=f"/grant-claims/{cid}", related_type="grant_claim", related_id=cid,
                    severity="info", kind="discussion",
                )
    except Exception:
        pass  # never let a notification error block the reply

    return entry


# ═══════════════════ AI Eligibility Recommender ═══════════════════

@api_router.get("/schemes-recommendations")
async def scheme_recommendations(request: Request, body_id: Optional[str] = None):
    """Given a body, list eligible schemes with a computed match score + eligibility gaps."""
    scope = get_scope(request)
    target_body_id = body_id or scope.body_code or "MPCA"
    body = await db.bodies.find_one({"code": target_body_id}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body {target_body_id} not found")
    body_type = body.get("body_type") or ("Division" if target_body_id.startswith("DIV-") else "District" if target_body_id.startswith("DIST-") else "State")

    schemes = await db.reimbursement_schemes.find({"is_active": True}, {"_id": 0}).to_list(500)
    existing_claims = await db.grant_claims.find({"body_id": target_body_id, "fiscal_cycle": "2025-26"}, {"_id": 0}).to_list(500)
    claimed_scheme_codes = {c["scheme_code"]: c for c in existing_claims}

    recos = []
    for s in schemes:
        eligible_bodies = s.get("eligible_bodies") or ["All"]
        eligible = "All" in eligible_bodies or body_type in eligible_bodies
        if not eligible:
            continue
        existing = claimed_scheme_codes.get(s["scheme_code"])
        state = "already_claimed" if existing and existing["status"] in ("Submitted", "Under_Review", "Approved") else "not_started"
        # naive potential = sum of head rates
        potential = sum(h.get("rate_inr") or 0 for h in (s.get("heads") or []))
        recos.append({
            "scheme_code": s["scheme_code"],
            "name": s["name"],
            "scheme_type": s.get("scheme_type"),
            "frequency": s.get("frequency"),
            "eligible_bodies": eligible_bodies,
            "potential_amount_inr": potential,
            "state": state,
            "existing_claim_id": existing["id"] if existing else None,
            "existing_status": existing["status"] if existing else None,
            "required_documents_count": len(s.get("required_documents") or []),
            "conditions_count": len(s.get("conditions") or []),
            "recommendation_note": _reco_note(s, body_type, existing),
        })
    # Sort: not_started first, then by potential DESC
    recos.sort(key=lambda x: (0 if x["state"] == "not_started" else 1, -x["potential_amount_inr"]))
    return {"body_id": target_body_id, "body_name": body.get("name"), "body_type": body_type, "recommendations": recos, "total_potential_inr": sum(r["potential_amount_inr"] for r in recos if r["state"] == "not_started")}


def _reco_note(scheme: dict, body_type: str, existing: Optional[dict]) -> str:
    if existing and existing["status"] in ("Submitted", "Under_Review", "Approved"):
        return f"Already claimed this cycle — status {existing['status']}"
    if scheme.get("scheme_type") == "Annual_Grant":
        return "Annual grant — submit within 12 months of previous FY closure"
    if scheme.get("scheme_type") == "Camp":
        return "Camp-based subsidy — plan camp, submit claim on completion"
    if scheme.get("scheme_type") == "Infrastructure":
        return "Infrastructure — one-time / periodic. Verify eligibility window."
    if scheme.get("scheme_type") == "Award":
        return "Award — nomination based, submit performance evidence"
    if scheme.get("scheme_type") == "Welfare":
        return "Welfare scheme — for individual beneficiaries"
    return "Eligible — review conditions before claiming"


# ═══════════════════ AI Assistant Chat ═══════════════════

class AIChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    message: str


@api_router.post("/ai-assistant/chat")
async def ai_chat(payload: AIChatMessage, request: Request):
    """Interactive AI assistant that knows the schemes catalogue + caller's body context."""
    scope = get_scope(request)
    body_id = scope.body_code or "MPCA"
    body = await db.bodies.find_one({"code": body_id}, {"_id": 0}) or {"name": body_id, "body_type": "Unknown"}
    body_type = body.get("body_type") or scope.body_type or "Unknown"

    schemes = await db.reimbursement_schemes.find({"is_active": True}, {"_id": 0}).to_list(500)
    # Filter schemes eligible for this body_type
    eligible_schemes = [s for s in schemes if ("All" in (s.get("eligible_bodies") or [])) or (body_type in (s.get("eligible_bodies") or []))]

    # Fetch this body's existing claims (context)
    my_claims = await db.grant_claims.find({"body_id": body_id, "fiscal_cycle": "2025-26"}, {"_id": 0}).to_list(200)
    claimed = [{"scheme_code": c["scheme_code"], "status": c["status"], "amount_inr": c.get("claimed_amount_inr")} for c in my_claims]

    schemes_summary = "\n".join([
        f"- {s['scheme_code']} · {s['name']} · {s.get('scheme_type')} · Freq: {s.get('frequency')} · Eligible: {', '.join(s.get('eligible_bodies', []))}"
        for s in eligible_schemes
    ])

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return {"reply": "AI Assistant is not configured (EMERGENT_LLM_KEY missing).", "session_id": payload.session_id}

        system_msg = f"""You are the MPCA Grants Assistant — a concise, friendly advisor for Division/District cricket associations navigating MPCA's grants & schemes. Speak in English (or Hindi if user writes in Hindi). Keep replies under 150 words unless the user asks for detail.

The user's context:
• Body: {body.get('name')} ({body_id}) — Type: {body_type}
• Existing FY 2025-26 claims: {claimed if claimed else 'None yet'}

MPCA SCHEMES available to this body type:
{schemes_summary}

Rules:
1. Recommend schemes RELEVANT to the user's question with scheme_code (e.g. "Scheme 1-A", "Scheme 6-A").
2. Flag dependencies (e.g. "3-E.2 requires 1-A to be filed first").
3. If asked "what can I claim?", list top 3 unclaimed schemes with a one-line rationale each.
4. Never invent schemes not in the list above.
5. When you mention required documents, be specific."""

        chat = LlmChat(api_key=key, session_id=payload.session_id, system_message=system_msg)
        chat = chat.with_model("gemini", "gemini-3.6-flash")
        resp = await asyncio.wait_for(  # H4 · timeout guard
            chat.send_message(UserMessage(text=payload.message)), timeout=45)
        return {"reply": str(resp), "session_id": payload.session_id, "body_id": body_id}
    except Exception as e:
        return {"reply": f"AI Assistant error: {e}", "session_id": payload.session_id, "error": True}


# ═══════════════════ Scheme Master (edit) ═══════════════════

@api_router.patch("/reimbursement-schemes/{scheme_code}")
async def update_scheme(scheme_code: str, patch: dict, actor_name: Optional[str] = None):
    """MPCA-only: edit an existing scheme. RBAC enforced at UI level."""
    doc = await db.reimbursement_schemes.find_one({"scheme_code": scheme_code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Scheme not found")
    allowed = {"name", "description", "scheme_type", "eligible_bodies", "categories",
               "heads", "conditions", "required_documents", "frequency", "is_active"}
    updates = {k: v for k, v in (patch or {}).items() if k in allowed}
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.reimbursement_schemes.update_one({"scheme_code": scheme_code}, {"$set": updates})
    return await db.reimbursement_schemes.find_one({"scheme_code": scheme_code}, {"_id": 0})
