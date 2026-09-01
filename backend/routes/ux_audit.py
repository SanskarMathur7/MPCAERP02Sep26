"""Feb 2026 · UX Audit Report Viewer — backend
Reads the Phase-1 audit JSON from disk and persists your inline decisions
to `db.ux_audit_decisions`. Main agent uses these decisions to plan Round 1.
"""
import json
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

from core.infra import api_router, db

REPORT_PATH = "/app/test_reports/iteration_ux_audit.json"


class DecisionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_key: str          # unique key per audit item — main agent-composed
    decision: str          # KEEP / FIX / DELETE / MERGE / POSTPONE / MOVE_TO_SHOWCASE
    note: str | None = None
    author_name: str | None = None


@api_router.get("/ux-audit/report")
async def ux_audit_report():
    """Return the raw Phase-1 UX audit report + any saved decisions merged in."""
    if not os.path.exists(REPORT_PATH):
        raise HTTPException(404, f"Audit report not found at {REPORT_PATH}")
    with open(REPORT_PATH, "r") as fh:
        report = json.load(fh)
    decisions = {d["item_key"]: d async for d in db.ux_audit_decisions.find({}, {"_id": 0})}
    return {"report": report, "decisions": decisions}


@api_router.post("/ux-audit/decisions")
async def save_decision(payload: DecisionPayload):
    doc = {
        "item_key":    payload.item_key,
        "decision":    payload.decision,
        "note":        payload.note or "",
        "author_name": payload.author_name or "user",
        "updated_at":  datetime.now(timezone.utc).isoformat(),
    }
    await db.ux_audit_decisions.update_one(
        {"item_key": payload.item_key}, {"$set": doc}, upsert=True
    )
    return {"ok": True, "decision": doc}


@api_router.get("/ux-audit/decisions")
async def list_decisions() -> list[dict[str, Any]]:
    return await db.ux_audit_decisions.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
