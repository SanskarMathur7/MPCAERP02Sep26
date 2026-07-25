"""MPCA ERP backend — entry point.

Routes live in /app/backend/routes/*.py — each registers handlers on the
shared APIRouter exposed from core/infra.py. This file just wires them up
on the FastAPI app and runs startup seed.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from core.infra import api_router, client, logger

# Importing each route module triggers its @api_router decorators.
from routes import (  # noqa: F401
    members, disclosures, dashboard, meetings, elections, verify,
    fees, bank, financial_powers, bodies, claims, budgets,
    procurement, players, transfers, tournaments,
    notifications, uploads, ai_claims, rulebook, vendor_bills, tournament_budgets,
    venues_grounds, selection, fixtures, tournament_plan, tournament_invoices, extra_expense, shared,
    division_grants, vouchers, ledger, purchase_orders, vendor_kyc,
    assets, hr_payroll, dms, compliance, audit_pack, selection_console, match_officials,
    reimbursement_schemes, reimbursement_claims, camps, squad_ai, grant_claims, scheme_calc,
    tournament_workspace,
)
from seed import seed_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """M5 · startup/shutdown via lifespan (replaces deprecated @app.on_event)."""
    # ---- startup ----
    from core.indexes import ensure_indexes
    await ensure_indexes()  # H3 · idempotent, non-fatal
    # M5 · seeding is gated so production deploys don't re-run it on every boot.
    # Set SEED_ON_STARTUP=false in production once the database is populated.
    if os.environ.get("SEED_ON_STARTUP", "true").lower() not in ("false", "0", "no"):
        await seed_data()
        # Sprint 0: register playbook workflow configs
        from core.shared_services import upsert_workflow_config, ALL_REFERENCE_WORKFLOWS
        for wf in ALL_REFERENCE_WORKFLOWS:
            await upsert_workflow_config(wf)
        # Sprint T-RIM: seed reimbursement schemes from MPCA Master Document
        from routes.reimbursement_schemes import seed_reimbursement_schemes
        await seed_reimbursement_schemes()
    yield
    # ---- shutdown ----
    client.close()


app = FastAPI(title="MPCA ERP API", version="4.1.0", lifespan=lifespan)


@api_router.get("/")
async def root():
    return {"app": "MPCA ERP", "version": "4.1.0", "status": "ok"}


@api_router.get("/health")
async def health():
    """M12 · readiness probe — verifies DB connectivity, not just process liveness."""
    from starlette.responses import JSONResponse
    try:
        await client.admin.command("ping")
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "degraded", "db": str(e)[:200]})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


