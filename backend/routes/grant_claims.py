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
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

import asyncio
from core.infra import db, api_router
from core.shared_services import next_seq  # H6 · atomic sequence
from core.scoping import get_scope, body_scope
from core.helpers import _create_notification


GrantClaimStatus = Literal["Draft", "Documents_Pending", "Submitted", "Under_Review", "Approved", "Rejected", "Sanctioned"]


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


class GrantClaimBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scheme_code: str
    body_id: str
    fiscal_cycle: str = "2025-26"
    claimed_amount_inr: float = 0.0
    notes: Optional[str] = None


class GrantClaim(GrantClaimBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    claim_ref: str
    scheme_name: Optional[str] = None
    body_name: Optional[str] = None
    status: GrantClaimStatus = "Draft"
    documents: List[GrantClaimDoc] = []
    submitted_by: Optional[str] = None
    submitted_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_amount_inr: Optional[float] = None
    mpca_comments: List[dict] = Field(default_factory=list)
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
        chat = chat.with_model("gemini", "gemini-2.5-flash")
        prompt = f"""Verify if the attached document matches the EXPECTED DOCUMENT TYPE.

EXPECTED: {doc['required_label']}

Return ONLY a JSON object (no prose, no code fences) with keys:
{{
  "matches": true/false,
  "confidence": 0.0-1.0,
  "document_type_detected": "...",
  "key_details": {{"date": "...", "amount": "...", "party": "...", "any_other_signal": "..."}},
  "issues": ["issue1", "issue2"],
  "verdict_note": "one line summary"
}}"""
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


@api_router.post("/grant-claims/{cid}/approve", response_model=GrantClaim)
async def approve_grant_claim(cid: str, approved_amount_inr: float, actor_name: str, notes: Optional[str] = None):
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Under_Review"):
        raise HTTPException(409, f"Cannot approve from status {doc['status']}")
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
    if doc["status"] not in ("Submitted", "Under_Review"):
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
    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})


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
        chat = chat.with_model("gemini", "gemini-2.5-flash")
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
