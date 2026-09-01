"""Routes · Procurement (Three-Quote / QCBS)"""
from datetime import datetime, timezone

from fastapi import HTTPException

from core.helpers import _next_pr_no, _notify_for_procurement, _procurement_method_for
from core.infra import api_router, db
from core.shared_services import next_seq  # H6 · atomic sequence
from models import (
    AwardPayload,
    ProcurementMethod,
    ProcurementRequest,
    ProcurementRequestCreate,
    ProcurementStatus,
    Quotation,
)

# ---------------- Routes: Procurement (Phase III.8) ----------------
# Local `_next_pr_no` removed — imported from `core.helpers` (F811).


@api_router.get("/procurement", response_model=list[ProcurementRequest])
async def list_procurement(
    body_id: str | None = None,
    status: ProcurementStatus | None = None,
    method: ProcurementMethod | None = None,
    fiscal_cycle: str | None = None,
    skip: int = 0,
    limit: int = 500,
):
    query: dict = {}
    if body_id:
        query["body_id"] = body_id
    if status:
        query["status"] = status
    if method:
        query["method"] = method
    if fiscal_cycle:
        query["fiscal_cycle"] = fiscal_cycle
    docs = await db.procurement_requests.find(query, {"_id": 0}).sort("created_at", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    return docs


@api_router.get("/procurement/{pr_id}", response_model=ProcurementRequest)
async def get_procurement(pr_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    return doc


@api_router.post("/procurement", response_model=ProcurementRequest)
async def create_procurement(payload: ProcurementRequestCreate):
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    method = _procurement_method_for(payload.estimated_amount_inr)
    pr_no = await _next_pr_no(payload.fiscal_cycle)
    pr = ProcurementRequest(
        pr_no=pr_no,
        method=method,
        **payload.model_dump(),
    )
    await db.procurement_requests.insert_one(pr.model_dump())
    return pr


@api_router.post("/procurement/{pr_id}/quotations", response_model=ProcurementRequest)
async def add_quotation(pr_id: str, quote: Quotation):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] not in ("Draft", "Quotes_Collected"):
        raise HTTPException(400, f"Cannot add quotation in status {doc['status']}")
    quotations = doc.get("quotations", []) or []
    quotations.append(quote.model_dump())
    update = {
        "quotations": quotations,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # If this is the 3rd+ quote and method requires it, transition to Quotes_Collected
    if len(quotations) >= 3 and doc["method"] in ("Three_Quote", "QCBS") or doc["method"] == "Direct" and len(quotations) >= 1:
        update["status"] = "Quotes_Collected"
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    return await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})


@api_router.post("/procurement/{pr_id}/award", response_model=ProcurementRequest)
async def award_procurement(pr_id: str, payload: AwardPayload):
    """Award the contract — enforces 3-quote rule, QCBS rule, and L1-or-justify."""
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] not in ("Draft", "Quotes_Collected"):
        raise HTTPException(400, f"Cannot award in status {doc['status']}")

    quotations = doc.get("quotations", []) or []
    method = doc["method"]
    if method in ("Three_Quote", "QCBS") and len(quotations) < 3:
        raise HTTPException(
            400,
            f"Procurement method '{method}' requires at least 3 quotations "
            f"(currently {len(quotations)}). Please attach more quotations.",
        )

    # Verify awarded vendor is one of the quoted vendors
    quoted_vendors = {q["vendor_name"]: q for q in quotations}
    if payload.awarded_vendor not in quoted_vendors:
        raise HTTPException(400, f"Awarded vendor '{payload.awarded_vendor}' is not among the quoted vendors.")

    # L1 check — if awarded is not the lowest quote, demand a justification note
    lowest = min(quotations, key=lambda q: q["quote_amount_inr"])
    if payload.awarded_vendor != lowest["vendor_name"]:
        if not (payload.notes and len(payload.notes.strip()) > 10):
            raise HTTPException(
                400,
                f"Awarding to '{payload.awarded_vendor}' over L1 ('{lowest['vendor_name']}' "
                f"at ₹{lowest['quote_amount_inr']:,.0f}) requires a justification note "
                "(min 10 chars) recorded in `notes`.",
            )

    update = {
        "awarded_vendor": payload.awarded_vendor,
        "awarded_amount_inr": payload.awarded_amount_inr,
        "security_deposit_inr": payload.security_deposit_inr,
        "status": "Awarded",
        "notes": payload.notes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Awarded", None)
    return updated


@api_router.post("/procurement/{pr_id}/link-claim/{claim_id}", response_model=ProcurementRequest)
async def link_procurement_claim(pr_id: str, claim_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    claim = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "Awarded":
        raise HTTPException(400, "Only Awarded procurement requests may be linked to a claim")
    update = {
        "linked_claim_id": claim_id,
        "status": "Linked_To_Claim",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Linked_To_Claim", None)
    return updated


@api_router.post("/procurement/{pr_id}/close", response_model=ProcurementRequest)
async def close_procurement(pr_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] not in ("Awarded", "Linked_To_Claim"):
        raise HTTPException(400, f"Cannot close a procurement request in status {doc['status']}")
    update = {
        "status": "Closed",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Closed", None)
    return updated


@api_router.post("/procurement/{pr_id}/cancel", response_model=ProcurementRequest)
async def cancel_procurement(pr_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] in ("Closed", "Cancelled"):
        raise HTTPException(400, f"Cannot cancel a procurement request in status {doc['status']}")
    update = {
        "status": "Cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Cancelled", None)
    return updated


# ---------------- Routes: ABC Expenditure Analysis (Phase III.8) ----------------


@api_router.get("/finance/abc-analysis")
async def abc_analysis(fiscal_cycle: str = "2025-26"):
    """Pareto-style ABC bucketing of disbursed expenditure.
    A = top ~70% of value · B = next ~20% · C = trailing ~10%.

    Returns per-claim row with bucket + cumulative %, plus bucket totals."""
    pipeline = [
        {"$match": {"status": "Disbursed", "fiscal_cycle": fiscal_cycle}},
        {"$sort": {"amount_inr": -1}},
    ]
    rows: list[dict] = []
    async for c in db.claims.aggregate(pipeline):
        rows.append({
            "claim_id": c["id"],
            "claim_no": c["claim_no"],
            "title": c["title"],
            "category": c["category"],
            "body_id": c["body_id"],
            "amount_inr": c["amount_inr"],
        })
    total = sum(r["amount_inr"] for r in rows) or 1.0
    cumulative = 0.0
    out_rows = []
    buckets = {"A": {"count": 0, "total_inr": 0.0}, "B": {"count": 0, "total_inr": 0.0}, "C": {"count": 0, "total_inr": 0.0}}
    for r in rows:
        prev_cum_pct = cumulative / total * 100
        cumulative += r["amount_inr"]
        cum_pct = cumulative / total * 100
        # Bucket = the bucket the item crossed *into* (so the item that
        # pushes you past 70% is still an A-item; ABC pareto convention).
        if prev_cum_pct < 70:
            bucket = "A"
        elif prev_cum_pct < 90:
            bucket = "B"
        else:
            bucket = "C"
        r["bucket"] = bucket
        r["cum_pct"] = round(cum_pct, 1)
        r["share_pct"] = round(r["amount_inr"] / total * 100, 1)
        buckets[bucket]["count"] += 1
        buckets[bucket]["total_inr"] += r["amount_inr"]
        out_rows.append(r)
    return {
        "fiscal_cycle": fiscal_cycle,
        "total_disbursed_inr": total if rows else 0,
        "buckets": buckets,
        "rows": out_rows,
    }


