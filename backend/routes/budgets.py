"""Routes · Body Budgets"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import BodyBudget, BodyBudgetCreate, Body, TWO_SIGNATORY_THRESHOLD_INR
from core.helpers import next_uid as _
from models import SANCTION_THRESHOLDS


# ---------------- Routes: Body Budgets & Reconciliation (Phase III.7) ----------------


@api_router.get("/budgets")
async def list_budgets(fiscal_cycle: str = "2025-26", body_id: Optional[str] = None):
    """Returns every body's budget for a cycle, reconciled live against claims."""
    bodies_query: dict = {}
    if body_id:
        bodies_query["code"] = body_id
    bodies = await db.bodies.find(bodies_query, {"_id": 0}).sort("code", 1).to_list(200)

    # Pre-load all existing budget overrides
    budget_docs = await db.body_budgets.find(
        {"fiscal_cycle": fiscal_cycle}, {"_id": 0},
    ).to_list(500)
    budgets_by_body = {b["body_id"]: b for b in budget_docs}

    # Aggregate claim totals once
    pipeline = [
        {"$match": {"fiscal_cycle": fiscal_cycle}},
        {"$group": {
            "_id": {"body_id": "$body_id", "status": "$status"},
            "total": {"$sum": "$amount_inr"},
            "count": {"$sum": 1},
        }},
    ]
    sums: dict = {}
    async for row in db.claims.aggregate(pipeline):
        b = row["_id"]["body_id"]
        st = row["_id"]["status"]
        sums.setdefault(b, {}).setdefault(st, {"total": 0.0, "count": 0})
        sums[b][st]["total"] = row["total"]
        sums[b][st]["count"] = row["count"]

    rows = []
    for body in bodies:
        code = body["code"]
        override = budgets_by_body.get(code)
        # Default budget = the body's annual_grant_inr (state/BCCI are sources, not consumers)
        if body["body_type"] in ("BCCI", "State"):
            default_budget = 0.0
        else:
            default_budget = body.get("annual_grant_inr", 0.0)
        annual = override["annual_budget_inr"] if override else default_budget

        body_sums = sums.get(code, {})
        committed = sum(
            (body_sums.get(s, {}).get("total", 0.0))
            for s in ("Draft", "Submitted", "Division_Recommended", "MPCA_Sanctioned")
        )
        disbursed = body_sums.get("Disbursed", {}).get("total", 0.0)
        rejected = body_sums.get("Rejected", {}).get("total", 0.0)
        available = round(annual - committed - disbursed, 2)
        utilisation_pct = round(((committed + disbursed) / annual) * 100, 1) if annual else 0.0

        rows.append({
            "body_id": code,
            "body_name": body["name"],
            "body_type": body["body_type"],
            "fiscal_cycle": fiscal_cycle,
            "annual_budget_inr": annual,
            "committed_inr": round(committed, 2),
            "disbursed_inr": round(disbursed, 2),
            "rejected_inr": round(rejected, 2),
            "available_inr": available,
            "utilisation_pct": utilisation_pct,
            "claim_count": sum(v["count"] for v in body_sums.values()),
        })
    return rows


@api_router.get("/budgets/{body_id}")
async def get_budget(body_id: str, fiscal_cycle: str = "2025-26"):
    all_rows = await list_budgets(fiscal_cycle=fiscal_cycle, body_id=body_id)
    if not all_rows:
        raise HTTPException(404, f"Body {body_id} not found")
    return all_rows[0]


@api_router.post("/budgets", response_model=BodyBudget)
async def upsert_budget(payload: BodyBudgetCreate):
    """Set/override the annual budget for a body × cycle."""
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    existing = await db.body_budgets.find_one(
        {"body_id": payload.body_id, "fiscal_cycle": payload.fiscal_cycle}, {"_id": 0},
    )
    if existing:
        await db.body_budgets.update_one(
            {"id": existing["id"]},
            {"$set": {"annual_budget_inr": payload.annual_budget_inr, "note": payload.note}},
        )
        return await db.body_budgets.find_one({"id": existing["id"]}, {"_id": 0})
    doc = BodyBudget(**payload.model_dump())
    await db.body_budgets.insert_one(doc.model_dump())
    return doc


@api_router.get("/sanction-thresholds")
async def sanction_thresholds():
    """Public reference: Art. 28(v) sanctioning matrix and the 2-signatory threshold."""
    return {
        "thresholds": [{"post": t["post"], "limit_inr": t["limit_inr"] if t["limit_inr"] != float("inf") else None, "scope": t["scope"]} for t in SANCTION_THRESHOLDS],
        "two_signatory_threshold_inr": TWO_SIGNATORY_THRESHOLD_INR,
    }


