"""AI Gatekeeper (Gemini 3 Flash) for grant claim validation."""
import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    FileContentWithMimeType,
)
from core.infra import db, APPROVAL_MATRIX_PATH
from core.helpers import _create_notification, _notify_for_claim, _recipient_for_new_status, _resolve_parent_body
from models import ApprovalStep

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
# H4 · hard ceiling on the LLM call so a hung provider can't pin a request open.
# A timeout raises TimeoutError, caught by the surrounding except -> HOLD_FOR_HUMAN.
AI_CALL_TIMEOUT = float(os.environ.get("AI_CALL_TIMEOUT", "45"))
AI_MODEL_PROVIDER = "gemini"
AI_MODEL_NAME = "gemini-3-flash-preview"

AI_DECISION_CODES = {
    "APPROVE_FAST_TRACK",
    "APPROVE_STANDARD",
    "HOLD_FOR_HUMAN",
    "RETURN_TO_ORIGINATOR",
    "AUTO_REJECT",
}

AI_AUTO_ACTION = {
    "APPROVE_FAST_TRACK": "continue",
    "APPROVE_STANDARD": "continue",
    "HOLD_FOR_HUMAN": "continue",
    "RETURN_TO_ORIGINATOR": "return",
    "AUTO_REJECT": "reject",
}


def _load_approval_matrix() -> str:
    try:
        return APPROVAL_MATRIX_PATH.read_text(encoding="utf-8")
    except Exception:
        return "(Approval matrix file unavailable — apply universal sanity checks only.)"


async def _collect_claim_attachments(claim_doc: dict) -> List[FileContentWithMimeType]:
    """Look up each supporting_doc_url, find the upload record, return FileContentWithMimeType."""
    out: List[FileContentWithMimeType] = []
    for url in claim_doc.get("supporting_doc_urls") or []:
        # Expected shape: "/api/uploads/{id}"
        if not url or "/api/uploads/" not in url:
            continue
        file_id = url.rsplit("/", 1)[-1]
        rec = await db.uploads.find_one({"id": file_id})
        if not rec:
            continue
        path = rec.get("_path")
        mime = rec.get("mime_type") or "application/octet-stream"
        if not path or not Path(path).exists():
            continue
        out.append(FileContentWithMimeType(file_path=path, mime_type=mime))
    return out


def _parse_ai_response(raw: str) -> dict:
    """Pull the JSON object out of Gemini's response (may be wrapped in code-fences or prose)."""
    import json
    import re
    # 1) Try a clean parse
    try:
        return json.loads(raw)
    except Exception:
        pass
    # 2) Strip fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL | re.IGNORECASE)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except Exception:
            pass
    # 3) Last-resort: grab the first {...} block
    brace = re.search(r"(\{[\s\S]*\})", raw)
    if brace:
        try:
            return json.loads(brace.group(1))
        except Exception:
            pass
    # 4) Give up — degrade to HOLD with the raw text in reasoning
    return {
        "decision": "HOLD_FOR_HUMAN",
        "reasoning": f"Could not parse AI verdict cleanly. Raw output: {raw[:400]}",
        "missing_documents": [],
        "warnings": ["AI response parse failure"],
    }


AI_SYSTEM_MESSAGE = """You are the MPCA Grant Approval AI Gatekeeper.

Your job: read a grant claim submitted by a District or Division, evaluate the attached supporting documents against the MPCA Approval Matrix rulebook, and return a structured verdict that decides how the claim is routed.

You NEVER approve disbursement of money. You only set a routing decision that humans then act on. Your decision is auditable.

Always respond with a single JSON object — no prose before or after, no code fences. The JSON shape MUST be:

{
  "decision": "APPROVE_FAST_TRACK" | "APPROVE_STANDARD" | "HOLD_FOR_HUMAN" | "RETURN_TO_ORIGINATOR" | "AUTO_REJECT",
  "reasoning": "<2-6 sentence summary of why>",
  "missing_documents": ["<list of mandatory docs not provided>"],
  "warnings": ["<list of soft concerns>"],
  "amount_check": "ok" | "mismatch" | "unknown",
  "confidence": 0.0..1.0
}

Decision guidance:
- APPROVE_FAST_TRACK: All mandatory docs present, all universal checks pass, amount within District Sec single-claim limit (₹25,000).
- APPROVE_STANDARD: All mandatory docs present, all universal checks pass, normal routing.
- HOLD_FOR_HUMAN: One or more soft warnings (low OCR confidence, missing optional doc, unusual but not invalid amount).
- RETURN_TO_ORIGINATOR: One or more MANDATORY docs missing or invalid — claim is incomplete.
- AUTO_REJECT: Hard violation (wrong body_id consistency, duplicate bills, obvious fraud signal, amount on docs grossly mismatches claim amount).

Be strict but fair. Cite specific document names when explaining.
"""


def _build_ai_user_prompt(claim_doc: dict, matrix_text: str) -> str:
    return f"""APPROVAL MATRIX RULEBOOK (source of truth):

{matrix_text}

---

CLAIM TO EVALUATE:

- Claim No: {claim_doc.get('claim_no')}
- Title: {claim_doc.get('title')}
- Description: {claim_doc.get('description') or '(none)'}
- Category: {claim_doc.get('category')}
- Amount: INR {claim_doc.get('amount_inr'):,.2f}
- Body: {claim_doc.get('body_id')}
- Fiscal Cycle: {claim_doc.get('fiscal_cycle')}
- Created By: {claim_doc.get('created_by') or '(unknown)'}
- Attachments: {len(claim_doc.get('supporting_doc_urls') or [])} file(s) — see attached

Apply the rulebook to the attached documents and return your verdict JSON.
"""


async def _run_ai_validation(claim_doc: dict) -> dict:
    """Calls Gemini, parses the verdict, returns dict with keys: decision, reasoning, missing_documents, raw."""
    if not EMERGENT_LLM_KEY:
        return {
            "decision": "HOLD_FOR_HUMAN",
            "reasoning": "AI gatekeeper unavailable (no EMERGENT_LLM_KEY configured). Routed to human review.",
            "missing_documents": [],
            "warnings": ["AI not configured"],
            "amount_check": "unknown",
            "confidence": 0.0,
        }

    matrix_text = _load_approval_matrix()
    attachments = await _collect_claim_attachments(claim_doc)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"claim-{claim_doc.get('id')}",
        system_message=AI_SYSTEM_MESSAGE,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)

    msg = UserMessage(
        text=_build_ai_user_prompt(claim_doc, matrix_text),
        file_contents=attachments if attachments else None,
    )

    try:
        raw = await asyncio.wait_for(chat.send_message(msg), timeout=AI_CALL_TIMEOUT)
    except Exception as e:
        return {
            "decision": "HOLD_FOR_HUMAN",
            "reasoning": f"AI gatekeeper error — routed to human review. ({type(e).__name__}: {str(e)[:200]})",
            "missing_documents": [],
            "warnings": ["AI call failed"],
            "amount_check": "unknown",
            "confidence": 0.0,
        }

    parsed = _parse_ai_response(raw if isinstance(raw, str) else str(raw))
    if parsed.get("decision") not in AI_DECISION_CODES:
        parsed["decision"] = "HOLD_FOR_HUMAN"
        parsed.setdefault("warnings", []).append("AI returned an unknown decision code; defaulted to HOLD.")
    parsed.setdefault("reasoning", "(no reasoning returned)")
    parsed.setdefault("missing_documents", [])
    parsed.setdefault("warnings", [])
    parsed.setdefault("amount_check", "unknown")
    parsed.setdefault("confidence", 0.0)
    return parsed


async def _apply_ai_verdict(claim_doc: dict, verdict: dict, actor_name: Optional[str]) -> dict:
    """Append the AI verdict to approval_chain and apply auto-action. Returns the updated claim doc."""
    decision = verdict["decision"]
    reasoning = verdict.get("reasoning") or ""
    auto_action = AI_AUTO_ACTION.get(decision, "continue")

    # Always log the AI step
    ai_step = ApprovalStep(
        stage="AI_Validated",
        actor_post="AI Gatekeeper",
        actor_name=f"Gemini · {AI_MODEL_NAME}",
        actor_body_id="MPCA",
        decision=(
            "Recommended" if auto_action == "continue"
            else "Returned" if auto_action == "return"
            else "Rejected"
        ),
        notes=f"[{decision}] {reasoning}",
    )
    chain = (claim_doc.get("approval_chain") or []) + [ai_step.model_dump()]

    update: dict = {
        "approval_chain": chain,
        "ai_decision": decision,
        "ai_reasoning": reasoning,
        "ai_validated_at": datetime.now(timezone.utc).isoformat(),
        "ai_missing_docs": verdict.get("missing_documents") or [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if auto_action == "return":
        update["status"] = "Returned"
        update["parent_body_id"] = await _resolve_parent_body(claim_doc["body_id"])
    elif auto_action == "reject":
        update["status"] = "Rejected"
    # auto-action "continue" keeps whatever status submit() already set (Submitted)

    await db.claims.update_one({"id": claim_doc["id"]}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_doc["id"]}, {"_id": 0})

    # Notify on auto-actions so humans see them in the bell
    if auto_action == "return":
        await _notify_for_claim(updated, "Returned", "AI Gatekeeper")
    elif auto_action == "reject":
        await _notify_for_claim(updated, "Rejected", "AI Gatekeeper")
    elif decision == "HOLD_FOR_HUMAN":
        # Also notify the next approver that AI flagged this for review
        target = _recipient_for_new_status(updated, "Submitted") if updated.get("status") == "Submitted" else None
        if target:
            role_id, body_id = target
            await _create_notification(
                recipient_role_id=role_id,
                recipient_body_id=body_id,
                title=f"AI flagged claim {updated.get('claim_no')} for human review",
                message=(reasoning[:140] + ("…" if len(reasoning) > 140 else "")) or "AI requested human review",
                link="/claims",
                related_type="claim",
                related_id=updated.get("id"),
                severity="warning",
            )

    return updated

# ─── Phase M1-C · AI Player Document Validator ───
# Fraud-prevention layer: OCR each uploaded KYC document (birth cert, Aadhaar,
# PAN, marksheets, Samagra) and cross-check name / DOB / father_name against
# the values entered in the Player Register.

PLAYER_AI_SYSTEM_MESSAGE = """You are the MPCA Player Document Fraud-Prevention AI.

Your job: read the KYC documents attached to a player registration and cross-verify:
  1. Name on each document matches the registered full_name.
  2. Date-of-birth on Birth Certificate / Aadhaar / Marksheet matches the registered DOB.
  3. Father's name (where visible on Aadhaar or affidavit) matches registered father_name.
  4. Any obvious signs of tampering, cut-paste, mismatched fonts, or handwriting inconsistencies.
  5. Iter 129 · Address-proof district cross-check — the address on Aadhaar / bank statement / affidavit MUST place the player inside the home division declared on the record. If the extracted district maps to a DIFFERENT division, flag it as a `district_division_mismatch` warning citing both the extracted district and the declared home division.
  6. Iter 129 · QR-code signals — if the caller has supplied you a pre-computed QR verdict block below the prompt (upstream URLs already resolved), fold that into your reasoning. Treat `qr_found=true AND upstream.ok=true` as a strong authenticity signal for that document; treat `qr_found=true AND upstream.ok=false` as inconclusive (network problem, not a document defect); treat `qr_found=false` on birth certificate as a MINOR issue (some older certs have no QR).

You NEVER approve or reject the player yourself. You only produce a structured verdict that human reviewers act on.

Respond with a SINGLE JSON object — no prose before or after, no code fences. Shape:

{
  "decision": "CLEAN" | "MINOR_ISSUES" | "FLAGGED" | "SUSPECTED_FRAUD",
  "reasoning": "<3-6 sentence summary of the overall assessment>",
  "documents": [
    {
      "doc_type": "<slot key such as birth_certificate | aadhar | pan | marksheet_10 | samagra_id | passport | photo | signature | affidavit | transfer_certificate | hospital_cert | marksheet_12>",
      "extracted_name": "<name as read from doc or null>",
      "extracted_dob": "<YYYY-MM-DD or null>",
      "extracted_father_name": "<or null>",
      "extracted_address_district": "<MP district read from address proof, or null>",
      "name_match": "match" | "partial" | "mismatch" | "not_visible",
      "dob_match": "match" | "mismatch" | "not_visible" | "not_applicable",
      "qr_verdict": "resolved" | "unreadable" | "unreachable" | "not_applicable",
      "issues": ["<any specific issues found on this doc>"],
      "ocr_confidence": 0.0..1.0
    }
  ],
  "warnings": ["<cross-document inconsistencies, tampering signals, missing required docs, district_division_mismatch>"],
  "confidence": 0.0..1.0
}

Decision guidance:
- CLEAN: All documents match, no tampering signals, high OCR confidence, address district maps to the declared home division, QRs (where present) resolved.
- MINOR_ISSUES: Small inconsistencies (partial name match, low OCR confidence on one doc, QR present but unreachable) but nothing suspicious.
- FLAGGED: Meaningful mismatch (DOB differs by > 30 days across docs, name mismatch on 1 primary doc, address district belongs to a different division, one required doc appears blurry/altered).
- SUSPECTED_FRAUD: Clear signals — e.g. tampered date fields, mismatched fonts, spliced photo, or DOB gap of years across primary docs.

Be strict but explain your findings. Always cite the specific document type.
"""


async def _collect_player_documents(player_doc: dict) -> list:
    """Return list of FileContentWithMimeType for every uploaded doc on this player."""
    out: list = []
    for d in player_doc.get("documents", []) or []:
        url = d.get("url") or ""
        if "/api/uploads/" not in url:
            continue
        file_id = url.rsplit("/", 1)[-1]
        rec = await db.uploads.find_one({"id": file_id})
        if not rec:
            continue
        path = rec.get("_path")
        mime = rec.get("mime_type") or "application/octet-stream"
        if not path or not Path(path).exists():
            continue
        out.append(FileContentWithMimeType(file_path=path, mime_type=mime))
    return out


async def _collect_player_docs_with_paths(player_doc: dict) -> list:
    """Iter 129 · like _collect_player_documents but also yields (doc_type, path)
    tuples so the QR / signal helpers can operate on the raw file.

    Feb 2026 · Only the Birth Certificate is scanned for QR/barcodes. Other
    KYC documents (Aadhaar, PAN, Samagra, address proof, photo) do not carry
    a meaningful QR MPCA needs to verify, so we skip them to keep the KYC
    signals table clean.
    """
    BIRTH_CERT_DOC_TYPES = {"birth_cert", "birth_certificate", "birth"}
    out: list = []
    for d in player_doc.get("documents", []) or []:
        doc_type = (d.get("doc_type") or "").lower()
        if doc_type not in BIRTH_CERT_DOC_TYPES:
            continue
        url = d.get("url") or ""
        if "/api/uploads/" not in url:
            continue
        file_id = url.rsplit("/", 1)[-1]
        rec = await db.uploads.find_one({"id": file_id})
        if not rec:
            continue
        path = rec.get("_path")
        if not path or not Path(path).exists():
            continue
        out.append((d.get("doc_type") or "birth_cert", path))
    return out


def _build_player_ai_prompt(player_doc: dict, qr_signals: Optional[list] = None) -> str:
    docs_list = "\n".join(
        f"  - {d.get('doc_type')} -> {d.get('filename') or d.get('url')}"
        for d in (player_doc.get("documents") or [])
    ) or "  (none uploaded)"
    guest_bit = ""
    if player_doc.get("guest_subtype"):
        guest_bit = f" - {player_doc.get('guest_subtype')}"

    # Iter 129 · Address / division context
    from core.kyc_signals import build_district_map_hint, divisions_for_district
    home_div = player_doc.get("body_id") or "(not set)"
    declared_district = player_doc.get("address_district") or "(not on file)"
    declared_div_from_district = divisions_for_district(player_doc.get("address_district")) or "(unmapped)"
    district_map = build_district_map_hint()

    qr_block = ""
    if qr_signals:
        lines = []
        for s in qr_signals:
            if not s.get("qr_found"):
                lines.append(f"  - {s['doc_type']} ({s['file_name']}): NO QR detected")
                continue
            up = s.get("upstream") or []
            up_txt = "; ".join(
                f"{u.get('url','?')[:80]} -> http={u.get('http_status')} ok={u.get('ok')}"
                for u in up
            ) or "(no HTTP URLs in payload)"
            lines.append(f"  - {s['doc_type']} ({s['file_name']}): QR payload(s) -> {up_txt}")
        qr_block = "\nPRE-COMPUTED QR VERDICTS (server has already fetched these URLs):\n" + "\n".join(lines) + "\n"

    return f"""REGISTERED PLAYER RECORD (ground truth):

- Player ID: {player_doc.get('player_display_id') or player_doc.get('player_id')}
- Full Name: {player_doc.get('full_name')}
- Father's Name: {player_doc.get('father_name') or '(not provided)'}
- Mother's Name: {player_doc.get('mother_name') or '(not provided)'}
- Date of Birth: {player_doc.get('date_of_birth')}
- Gender: {player_doc.get('gender')}
- Category: {player_doc.get('category')}{guest_bit}
- Home Division (body_id): {home_div}
- Declared Address District: {declared_district}
- Division that owns declared district (per MPCA mapping): {declared_div_from_district}

MP DISTRICT → DIVISION MAPPING (compare with the district you extract from the address proof — if the extracted district maps to a division OTHER than "{home_div}", raise a `district_division_mismatch` warning):
{district_map}

UPLOADED DOCUMENTS (map doc_type -> filename, then check the attached files IN ORDER):
{docs_list}
{qr_block}
Extract name/DOB/father from each attached document. Extract the address district from any address proof. Compare against the ground-truth values above. Fold in the pre-computed QR verdicts if provided. Return your verdict JSON.
"""


PLAYER_AI_DECISION_CODES = {"CLEAN", "MINOR_ISSUES", "FLAGGED", "SUSPECTED_FRAUD"}


async def _run_player_doc_validation(player_doc: dict) -> dict:
    """OCR + fraud check on player KYC documents. Returns verdict dict."""
    if not EMERGENT_LLM_KEY:
        return {
            "decision": "FLAGGED",
            "reasoning": "AI validator unavailable (no EMERGENT_LLM_KEY configured).",
            "documents": [],
            "warnings": ["AI not configured"],
            "confidence": 0.0,
        }
    if not (player_doc.get("documents") or []):
        return {
            "decision": "FLAGGED",
            "reasoning": "No documents uploaded - cannot validate. Please upload at least Birth Certificate + Aadhaar + Photo.",
            "documents": [],
            "warnings": ["No documents to check"],
            "confidence": 0.0,
        }

    attachments = await _collect_player_documents(player_doc)
    if not attachments:
        return {
            "decision": "FLAGGED",
            "reasoning": "Uploaded documents could not be located on the server. Please re-upload.",
            "documents": [],
            "warnings": ["Attachments missing"],
            "confidence": 0.0,
        }

    # Iter 129 · pre-compute QR verdicts server-side. Best-effort — never fatal.
    from core.kyc_signals import summarise_qr_signals
    qr_signals: list = []
    try:
        typed_paths = await _collect_player_docs_with_paths(player_doc)
        qr_signals = await summarise_qr_signals(typed_paths)
    except Exception:  # noqa: BLE001
        qr_signals = []

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"player-doc-{player_doc.get('id')}",
        system_message=PLAYER_AI_SYSTEM_MESSAGE,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)

    msg = UserMessage(
        text=_build_player_ai_prompt(player_doc, qr_signals=qr_signals),
        file_contents=attachments,
    )

    try:
        raw = await asyncio.wait_for(chat.send_message(msg), timeout=AI_CALL_TIMEOUT)
    except Exception as e:
        return {
            "decision": "FLAGGED",
            "reasoning": f"AI validator error - route to human review. ({type(e).__name__}: {str(e)[:200]})",
            "documents": [],
            "warnings": ["AI call failed"],
            "confidence": 0.0,
        }

    parsed = _parse_ai_response(raw if isinstance(raw, str) else str(raw))
    if parsed.get("decision") not in PLAYER_AI_DECISION_CODES:
        parsed["decision"] = "FLAGGED"
        parsed.setdefault("warnings", []).append("AI returned an unknown decision code; defaulted to FLAGGED.")
    parsed.setdefault("reasoning", "(no reasoning returned)")
    parsed.setdefault("documents", [])
    parsed.setdefault("warnings", [])
    parsed.setdefault("confidence", 0.0)
    # Iter 129 · surface QR signals to reviewers as a first-class field
    parsed["qr_signals"] = qr_signals
    return parsed

