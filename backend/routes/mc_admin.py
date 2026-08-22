"""routes/mc_admin.py — Iter 109 · Admin CRUD for M&C workflow configs.

    GET    /api/mc-admin/workflows                  list all
    GET    /api/mc-admin/workflows/{key}            single
    POST   /api/mc-admin/workflows                  create new
    PATCH  /api/mc-admin/workflows/{key}            update meta/steps
    DELETE /api/mc-admin/workflows/{key}            drop it
    GET    /api/mc-admin/posts                      canonical post catalog for the UI

MPCA Secretary is the sole allowed editor (RBAC_MANAGE permission).
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import Body, HTTPException, Request
from pydantic import BaseModel

from core.infra import api_router, db
from lib.authz import get_principal, Permission


def _require_admin(request: Request):
    p = get_principal(request)
    if not p.can(Permission.RBAC_MANAGE):
        raise HTTPException(403, "M&C admin requires rbac.manage permission")
    return p


# ── Post catalog — kept in-code (small + canonical); UI uses it in dropdowns ──
POST_CATALOG = [
    {"body_scope": "State",    "post_title": "President"},
    {"body_scope": "State",    "post_title": "Hon. Secretary"},
    {"body_scope": "State",    "post_title": "Hon. Treasurer"},
    {"body_scope": "State",    "post_title": "Joint Secretary"},
    {"body_scope": "State",    "post_title": "Chief Accounts Officer"},
    {"body_scope": "State",    "post_title": "Manager"},
    {"body_scope": "State",    "post_title": "Selection Chairperson"},
    {"body_scope": "State",    "post_title": "Cricket Manager"},
    {"body_scope": "Division", "post_title": "President"},
    {"body_scope": "Division", "post_title": "Hon. Secretary"},
    {"body_scope": "Division", "post_title": "Hon. Treasurer"},
    {"body_scope": "District", "post_title": "Hon. Secretary"},
    {"body_scope": "Official", "post_title": "Match Official"},
]


class WorkflowIn(BaseModel):
    key: str
    label: str
    category: str
    description: Optional[str] = ""
    collection: str
    id_field: str = "id"
    status_field: str = "mc_status"
    chain_field: str = "mc_chain"
    approvals_field: str = "mc_approvals"
    initial_status: str = "Draft"
    return_to: str = "Draft"
    terminal_statuses: list[str] = []
    steps: list[dict] = []
    enabled: bool = True


@api_router.get("/mc-admin/posts")
async def api_post_catalog(request: Request):
    _require_admin(request)
    return {"posts": POST_CATALOG}


@api_router.get("/mc-admin/workflows")
async def api_admin_list(request: Request):
    _require_admin(request)
    cur = db.mc_workflows.find({}, {"_id": 0}).sort("label", 1)
    docs = await cur.to_list(length=None)
    return {"workflows": docs}


@api_router.get("/mc-admin/workflows/{key}")
async def api_admin_get(key: str, request: Request):
    _require_admin(request)
    wf = await db.mc_workflows.find_one({"key": key}, {"_id": 0})
    if not wf:
        raise HTTPException(404, f"Workflow {key} not found")
    return wf


@api_router.post("/mc-admin/workflows")
async def api_admin_create(request: Request, payload: WorkflowIn = Body(...)):
    _require_admin(request)
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.mc_workflows.find_one({"key": payload.key})
    if existing:
        raise HTTPException(409, f"Workflow '{payload.key}' already exists")
    doc = payload.dict()
    doc["created_at"] = now
    doc["updated_at"] = now
    await db.mc_workflows.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/mc-admin/workflows/{key}")
async def api_admin_update(key: str, request: Request, payload: dict = Body(...)):
    _require_admin(request)
    wf = await db.mc_workflows.find_one({"key": key}, {"_id": 0})
    if not wf:
        raise HTTPException(404, f"Workflow {key} not found")
    payload.pop("key", None)  # key is immutable
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.mc_workflows.update_one({"key": key}, {"$set": payload})
    return await db.mc_workflows.find_one({"key": key}, {"_id": 0})


@api_router.delete("/mc-admin/workflows/{key}")
async def api_admin_delete(key: str, request: Request):
    _require_admin(request)
    r = await db.mc_workflows.delete_one({"key": key})
    if r.deleted_count == 0:
        raise HTTPException(404, f"Workflow {key} not found")
    return {"ok": True}
