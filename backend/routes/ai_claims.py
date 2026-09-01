"""Routes · AI Re-validate + Attach Docs"""
from datetime import datetime, timezone

from fastapi import HTTPException

from core.ai_validator import _apply_ai_verdict, _run_ai_validation
from core.helpers import _decorate_claim
from core.infra import api_router, db
from models import Claim


@api_router.post("/claims/{claim_id}/attach-docs", response_model=Claim)
async def attach_docs(claim_id: str, payload: dict):
    """Append additional supporting-doc URLs to an existing claim (typically before AI re-validation)."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc.get("status") in ("Disbursed", "Rejected"):
        raise HTTPException(409, "Cannot attach documents to a terminal claim.")
    new_urls = payload.get("urls") or []
    if not isinstance(new_urls, list) or not all(isinstance(u, str) for u in new_urls):
        raise HTTPException(400, "Body must be {urls: string[]}.")
    merged = list(doc.get("supporting_doc_urls") or []) + [u for u in new_urls if u]
    await db.claims.update_one(
        {"id": claim_id},
        {"$set": {
            "supporting_doc_urls": merged,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/ai-validate", response_model=Claim)
async def ai_validate_claim(claim_id: str):
    """On-demand AI re-validation (useful after the originator uploads more docs and resubmits)."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    verdict = await _run_ai_validation(doc)
    updated = await _apply_ai_verdict(doc, verdict, None)
    return _decorate_claim(updated)

