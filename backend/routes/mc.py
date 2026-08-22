"""routes/mc.py — Iter 109 · Runtime endpoints for the M&C engine.

All endpoints require an authenticated user (via AuthMiddleware).

    GET  /api/mc/workflows                        list available workflows
    GET  /api/mc/workflows/{key}                  full config (for timeline UI)
    GET  /api/mc/{key}/{doc_id}/state             runtime state + my next actions
    POST /api/mc/{key}/{doc_id}/transition        run a transition
    GET  /api/mc/inbox/needs-rework               my rework inbox
"""
from typing import Optional
from fastapi import Body, HTTPException, Request
from pydantic import BaseModel

from core.infra import api_router, db
from lib.authz import get_principal
from lib.mc import (
    load_workflow, list_workflows, list_next_actions,
    apply_transition, needs_rework_inbox, build_state_view,
)


class TransitionIn(BaseModel):
    action: str
    note: Optional[str] = None


@api_router.get("/mc/workflows")
async def api_list_workflows(request: Request):
    get_principal(request)  # auth gate
    return {"workflows": await list_workflows(enabled_only=False)}


@api_router.get("/mc/workflows/{key}")
async def api_get_workflow(key: str, request: Request):
    get_principal(request)
    return await load_workflow(key)


@api_router.get("/mc/{key}/{doc_id}/state")
async def api_state(key: str, doc_id: str, request: Request):
    principal = get_principal(request)
    wf = await load_workflow(key)
    coll = db[wf["collection"]]
    doc = await coll.find_one({wf["id_field"]: doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"{wf.get('label') or key}: document not found")
    view = build_state_view(wf, doc)
    view["workflow"] = {"key": wf["key"], "label": wf.get("label"), "category": wf.get("category")}
    view["next_actions"] = await list_next_actions(key, doc, principal)
    view["doc_id"] = doc_id
    return view


@api_router.post("/mc/{key}/{doc_id}/transition")
async def api_transition(key: str, doc_id: str, request: Request, payload: TransitionIn = Body(...)):
    principal = get_principal(request)
    updated = await apply_transition(key, doc_id, payload.action, principal, payload.note)
    return {"ok": True, "doc": updated}


@api_router.get("/mc/inbox/needs-rework")
async def api_rework_inbox(request: Request):
    principal = get_principal(request)
    return await needs_rework_inbox(principal)
