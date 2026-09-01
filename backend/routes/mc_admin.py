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

from fastapi import Body, HTTPException, Request
from pydantic import BaseModel

from core.infra import api_router, db
from lib.authz import Permission, get_principal


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
    description: str | None = ""
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
    """Iter 113 · SINGLE source of truth for both /access-control and the
    Maker-Checker configurator: `db.rbac_roles`.  Any role added / renamed
    there flows automatically here (and vice-versa via the RBAC seed).
    """
    _require_admin(request)
    seen: set[tuple[str, str]] = set()
    posts: list[dict] = []
    # Primary source: RBAC role catalog (db.roles)
    cur = db.roles.find({}, {"_id": 0, "name": 1, "body_scope": 1})
    async for r in cur:
        pt = (r.get("name") or "").strip()
        bt = (r.get("body_scope") or "Any").strip()
        if not pt:
            continue
        key = (bt, pt)
        if key in seen:
            continue
        seen.add(key)
        posts.append({"body_scope": bt, "post_title": pt})
    # Fallback: users collection posts (covers seeded personas that predate rbac_roles)
    cur = db.users.find(
        {"post_title": {"$exists": True, "$ne": ""}},
        {"_id": 0, "post_title": 1, "body_type": 1},
    )
    async for u in cur:
        pt = (u.get("post_title") or "").strip()
        bt = (u.get("body_type") or "").strip()
        if not pt or not bt:
            continue
        key = (bt, pt)
        if key in seen:
            continue
        seen.add(key)
        posts.append({"body_scope": bt, "post_title": pt})
    # Deterministic ordering: State → Division → District → Any → Official
    order = {"State": 0, "Division": 1, "District": 2, "Any": 3, "Official": 4}
    posts.sort(key=lambda p: (order.get(p["body_scope"], 99), p["post_title"]))
    return {"posts": posts}


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
