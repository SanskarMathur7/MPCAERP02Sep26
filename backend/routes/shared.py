"""Routes · Sprint 0 shared services — CODE generator, workflow configs, audit log.
Read-only endpoints for now; the engine is called from module routes.
"""
from typing import List, Optional
from fastapi import HTTPException
from core.infra import db, api_router
from core.shared_services import (
    next_code, indian_fy, ENTITY_PREFIXES,
    get_audit_trail, upsert_workflow_config, WorkflowConfig,
    CANONICAL_ROLES, DEFAULT_ANNUAL_DISTRICT_GRANT_INR,
)


@api_router.get("/shared/next-code")
async def api_next_code(entity: str, org_short: str = "MPCA", fy: Optional[str] = None):
    if entity not in ENTITY_PREFIXES:
        raise HTTPException(400, f"Unknown entity '{entity}'. Known: {list(ENTITY_PREFIXES.keys())}")
    code = await next_code(entity, org_short=org_short, fy=fy)
    return {"code": code, "fy": fy or indian_fy(), "entity": entity}


@api_router.get("/shared/fy")
async def api_current_fy():
    return {"fy": indian_fy()}


@api_router.get("/shared/roles")
async def api_canonical_roles():
    return [{"role_key": k, "role_label": l} for k, l in CANONICAL_ROLES]


@api_router.get("/shared/constants")
async def api_playbook_constants():
    return {
        "default_annual_district_grant_inr": DEFAULT_ANNUAL_DISTRICT_GRANT_INR,
        "fy": indian_fy(),
        "entity_prefixes": ENTITY_PREFIXES,
    }


@api_router.get("/shared/workflows")
async def list_workflows():
    docs = await db.workflow_configs.find({}, {"_id": 0}).to_list(100)
    return docs


@api_router.get("/shared/workflows/{workflow_key}")
async def get_workflow(workflow_key: str):
    doc = await db.workflow_configs.find_one({"workflow_key": workflow_key}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Workflow not found")
    return doc


@api_router.post("/shared/workflows")
async def upsert_workflow(cfg: WorkflowConfig):
    return await upsert_workflow_config(cfg)


@api_router.get("/shared/audit-log")
async def api_audit_log(module: Optional[str] = None, record_id: Optional[str] = None, limit: int = 100):
    return await get_audit_trail(module=module, record_id=record_id, limit=limit)
