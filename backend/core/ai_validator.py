"""AI Gatekeeper (Gemini 3 Flash) for grant claim validation."""
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
        raw = await chat.send_message(msg)
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
