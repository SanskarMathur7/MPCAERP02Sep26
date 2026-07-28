"""Shared services — Sprint 0 foundations aligned to Emergent Playbook P1-P2.

Three pillars that every module reuses:
1. CODE generator (P1.7) — atomic, gap-free reference numbers.
2. Approval Engine (P2.1-2.2) — configurable maker-checker with append-only chain.
3. Audit Log (P1.11) — immutable who-did-what for every action.

Modules should import from here rather than rolling their own logic.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict
import uuid

from core.infra import db


# ═══════════════════ 1 · CODE Generator (P1.7) ═══════════════════
# Format: [ENTITY]/[ORG-SHORT]/[FY]/[SEQUENCE]
# e.g. GRT/DIST-BPL/2026-27/00042

ENTITY_PREFIXES = {
    "grant": "GRT", "claim": "CLM", "voucher": "VCH", "invoice": "INV",
    "purchase_order": "PO", "document": "DOC", "tournament": "TRN",
    "vendor_bill": "VB", "extra_expense": "EER", "match_official_da": "DA",
    "fixture": "FX", "player": "MPCA", "tournament_budget": "TB",
}


def indian_fy(dt: Optional[datetime] = None) -> str:
    """Indian FY: Apr–Mar. Feb 2026 → '2025-26'."""
    dt = dt or datetime.now(timezone.utc)
    if dt.month >= 4:
        return f"{dt.year}-{str(dt.year + 1)[-2:]}"
    return f"{dt.year - 1}-{str(dt.year)[-2:]}"


async def next_code(entity: str, org_short: str = "MPCA", fy: Optional[str] = None, pad: int = 5) -> str:
    """Atomic, gap-free per entity+org+FY. Uses a counters collection with $inc."""
    prefix = ENTITY_PREFIXES.get(entity, entity.upper()[:3])
    fy = fy or indian_fy()
    key = f"{prefix}/{org_short}/{fy}"
    # Atomic increment via find_one_and_update
    result = await db.code_counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = result["seq"] if result else 1
    return f"{key}/{str(seq).zfill(pad)}"


async def next_seq(key: str, seed=None) -> int:
    """H6 · atomic per-key sequence counter (gap-free, race-safe).

    Replaces the `count_documents(...) + 1` numbering pattern, which returned the
    same value to two concurrent creates (-> duplicate reference numbers). Here the
    number comes from an atomic `$inc`, so concurrent callers always get distinct
    values.

    On first use for a `key`, the counter is lazily seeded so existing data keeps
    its numbering continuous:
      * `seed` may be an int, or a zero-arg callable returning an int/awaitable
        (e.g. `lambda: db.claims.count_documents({...})`).
      * The first returned value equals `seed + 1` -- matching the old `count + 1`.
    """
    existing = await db.code_counters.find_one({"_id": key}, {"seq": 1})
    if existing is None and seed is not None:
        n = seed() if callable(seed) else seed
        if hasattr(n, "__await__"):
            n = await n
        # $setOnInsert is atomic + idempotent: only the first racer seeds it.
        await db.code_counters.update_one(
            {"_id": key}, {"$setOnInsert": {"seq": int(n)}}, upsert=True
        )
    result = await db.code_counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return result["seq"]


# ═══════════════════ 2 · Approval Engine (P2.1-2.2) ═══════════════════
# Generic, ordered stages. Modules configure their own workflows;
# the engine enforces current-stage-only actions and segregation-of-duties.

ApprovalAction = Literal["Submit", "Review", "Approve", "Authorise", "Reject", "Send_Back", "Disburse"]
ApprovalStatus = Literal["Draft", "In_Review", "Approved", "Rejected", "Sent_Back", "Authorised", "Disbursed"]


class WorkflowStage(BaseModel):
    """One stage in a workflow config."""
    model_config = ConfigDict(extra="ignore")
    stage_key: str                       # "district_maker_submit"
    stage_label: str                     # "District Maker · Submit"
    acting_role: str                     # role_id required to act
    action: ApprovalAction
    requires_note: bool = False
    requires_document: bool = False


class WorkflowConfig(BaseModel):
    """A named workflow — an ordered list of stages."""
    model_config = ConfigDict(extra="ignore")
    workflow_key: str                    # "annual_district_grant"
    workflow_label: str
    entity: str                          # "grant" / "claim" / "voucher" etc.
    stages: List[WorkflowStage]


class ChainEntry(BaseModel):
    """Immutable entry appended after each action."""
    model_config = ConfigDict(extra="ignore")
    stage_key: str
    stage_label: str
    action: ApprovalAction
    actor_user_id: Optional[str] = None
    actor_name: str
    actor_role: Optional[str] = None
    actor_body_id: Optional[str] = None
    note: Optional[str] = None
    document_url: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ApprovalError(Exception):
    """Raised when an action violates engine rules."""


async def apply_action(
    *,
    collection: str,
    record_id: str,
    workflow_key: str,
    action: ApprovalAction,
    actor: Dict[str, Any],           # {user_id, name, role, body_id}
    note: Optional[str] = None,
    document_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Central action gate. Rules:
    - Fetch the record + its workflow config.
    - Current stage's `acting_role` must match `actor.role` (unless MPCA super roles).
    - Maker cannot self-approve — actor cannot be the creator on any Approve/Authorise stage.
    - `Send_Back` requires a note.
    - Any action requiring doc must supply one.
    - On success: append to `approval_chain` and advance/close the record.
    - Also writes an immutable audit_log entry.
    Returns the updated record dict.
    """
    wf = await db.workflow_configs.find_one({"workflow_key": workflow_key}, {"_id": 0})
    if not wf:
        raise ApprovalError(f"Workflow config '{workflow_key}' not found")
    rec = await db[collection].find_one({"id": record_id}, {"_id": 0})
    if not rec:
        raise ApprovalError(f"Record not found: {collection}/{record_id}")

    stages = wf["stages"]
    current_idx = rec.get("current_stage_idx", 0)
    if current_idx >= len(stages):
        raise ApprovalError("Record already at terminal stage")
    stage = stages[current_idx]

    if stage["action"] != action and action not in ("Reject", "Send_Back"):
        raise ApprovalError(f"Expected action '{stage['action']}' at this stage, got '{action}'")

    # Role check (super roles bypass)
    actor_role = actor.get("role") or ""
    super_roles = {"super_admin", "secretary", "president"}
    if actor_role not in super_roles and actor_role != stage["acting_role"]:
        raise ApprovalError(f"Role '{actor_role}' cannot act at stage '{stage['stage_label']}' (needs '{stage['acting_role']}')")

    # No-self-approval
    if action in ("Approve", "Authorise") and rec.get("created_by_user_id") == actor.get("user_id"):
        raise ApprovalError("Maker cannot approve their own record (no self-approval)")

    if action == "Send_Back" and not note:
        raise ApprovalError("Send_Back requires a note")
    if stage["requires_document"] and not document_url:
        raise ApprovalError(f"Stage '{stage['stage_label']}' requires a document")
    if stage["requires_note"] and not note:
        raise ApprovalError(f"Stage '{stage['stage_label']}' requires a note")

    # Build chain entry (immutable append)
    entry = ChainEntry(
        stage_key=stage["stage_key"], stage_label=stage["stage_label"], action=action,
        actor_user_id=actor.get("user_id"), actor_name=actor.get("name") or "Unknown",
        actor_role=actor_role, actor_body_id=actor.get("body_id"),
        note=note, document_url=document_url,
    ).model_dump()

    # Determine new status + advance stage
    if action == "Reject":
        new_status = "Rejected"
        new_idx = current_idx
    elif action == "Send_Back":
        new_status = "Sent_Back"
        new_idx = max(0, current_idx - 1)
    elif action == "Submit":
        new_status = "In_Review"
        new_idx = current_idx + 1
    elif action == "Authorise":
        new_status = "Authorised"
        new_idx = current_idx + 1
    elif action == "Disburse":
        new_status = "Disbursed"
        new_idx = current_idx + 1
    else:
        new_idx = current_idx + 1
        new_status = "Approved" if new_idx >= len(stages) else "In_Review"

    await db[collection].update_one(
        {"id": record_id},
        {
            "$push": {"approval_chain": entry},
            "$set": {"status": new_status, "current_stage_idx": new_idx, "updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )

    # Immutable audit log
    await write_audit_log(
        module=wf["entity"], record_id=record_id,
        action=action.lower(), actor=actor,
        details={"workflow_key": workflow_key, "stage": stage["stage_label"], "note": note},
    )

    return await db[collection].find_one({"id": record_id}, {"_id": 0})


async def upsert_workflow_config(cfg: WorkflowConfig) -> Dict[str, Any]:
    """Register or update a workflow (idempotent by workflow_key)."""
    payload = cfg.model_dump()
    await db.workflow_configs.update_one({"workflow_key": cfg.workflow_key}, {"$set": payload}, upsert=True)
    return payload


# ═══════════════════ 3 · Immutable Audit Log (P1.11) ═══════════════════


async def write_audit_log(
    *,
    module: str,
    record_id: str,
    action: str,
    actor: Dict[str, Any],
    details: Optional[Dict[str, Any]] = None,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
) -> None:
    """Append-only. Never edit or delete."""
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "module": module,
        "record_id": record_id,
        "action": action,
        "actor_user_id": actor.get("user_id"),
        "actor_name": actor.get("name") or "System",
        "actor_role": actor.get("role"),
        "actor_body_id": actor.get("body_id"),
        "details": details or {},
        "before": before,
        "after": after,
    }
    await db.audit_log.insert_one(entry)


async def get_audit_trail(*, module: Optional[str] = None, record_id: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    q: dict = {}
    if module: q["module"] = module
    if record_id:
        # M39m · Tournament activity log · match either the exact record_id OR
        # any audit entry whose `details.tournament_id` points at this tournament
        # (covers squad, budget, claim, extra-expense, DA events).
        q = {"$and": [q, {"$or": [
            {"record_id": record_id},
            {"details.tournament_id": record_id},
        ]}]} if q else {"$or": [
            {"record_id": record_id},
            {"details.tournament_id": record_id},
        ]}
    return await db.audit_log.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)


async def log_activity(
    *,
    module: str,
    action: str,
    record_id: str,
    tournament_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    actor_body_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """M39m · Cheap-and-cheerful audit writer. Non-transactional — failure
    silently swallowed so app flows never break because logging failed.
    """
    try:
        entry = {
            "id": str(__import__("uuid").uuid4()),
            "module": module,
            "action": action,
            "record_id": record_id,
            "actor_name": actor_name,
            "actor_body_id": actor_body_id,
            "actor_role": actor_role,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": {**(details or {}), **({"tournament_id": tournament_id} if tournament_id else {})},
        }
        await db.audit_log.insert_one(entry)
    except Exception:
        pass


# ═══════════════════ 4 · Playbook Constants ═══════════════════

DEFAULT_ANNUAL_DISTRICT_GRANT_INR = 110000.0    # ₹1,10,000 per playbook P2.5

CANONICAL_ROLES = [
    ("super_admin",         "Super Admin"),
    ("mpca_secretary",      "MPCA Secretary"),
    ("mpca_treasurer",      "MPCA Treasurer"),
    ("cao",                 "Chief Administrative Officer"),
    ("mpca_internal_auditor", "MPCA Internal Auditor"),
    ("mpca_accounts",       "MPCA Accounts"),
    ("division_checker",    "Division Checker"),
    ("district_maker",      "District Maker"),
    ("viewer",              "Viewer"),
]

# Reference: Annual District Grant workflow (playbook P2.5)
ANNUAL_DISTRICT_GRANT_WORKFLOW = WorkflowConfig(
    workflow_key="annual_district_grant",
    workflow_label="Annual Grant to District Associations",
    entity="grant",
    stages=[
        WorkflowStage(stage_key="district_submit",    stage_label="District Maker · Submit",           acting_role="district_maker",    action="Submit"),
        WorkflowStage(stage_key="division_review",    stage_label="Division Checker · Review",         acting_role="division_checker",  action="Review"),
        WorkflowStage(stage_key="auditor_review",     stage_label="MPCA Internal Auditor · Review",    acting_role="mpca_internal_auditor", action="Review"),
        WorkflowStage(stage_key="cao_approve",        stage_label="CAO · Approve",                     acting_role="cao",               action="Approve"),
        WorkflowStage(stage_key="accounts_disburse",  stage_label="MPCA Accounts · Disburse",          acting_role="mpca_accounts",     action="Disburse", requires_document=True),
        WorkflowStage(stage_key="sec_treas_authorise",stage_label="Secretary + Treasurer · Authorise", acting_role="mpca_secretary",    action="Authorise"),
    ],
)

DIVISION_GRANT_WORKFLOW = WorkflowConfig(
    workflow_key="division_grant",
    workflow_label="Division Grant from MPCA",
    entity="grant",
    stages=[
        WorkflowStage(stage_key="division_request", stage_label="Division · Request",           acting_role="division_checker",     action="Submit"),
        WorkflowStage(stage_key="auditor_review",   stage_label="Internal Auditor · Review",    acting_role="mpca_internal_auditor", action="Review"),
        WorkflowStage(stage_key="cao_approve",      stage_label="CAO · Approve",                acting_role="cao",                   action="Approve"),
        WorkflowStage(stage_key="accounts_disburse",stage_label="Accounts · Disburse",          acting_role="mpca_accounts",         action="Disburse", requires_document=True),
    ],
)

TOURNAMENT_INVOICE_WORKFLOW = WorkflowConfig(
    workflow_key="tournament_invoice",
    workflow_label="Tournament Invoice Submission",
    entity="invoice",
    stages=[
        WorkflowStage(stage_key="division_submit",  stage_label="Division · Upload & Submit",   acting_role="division_checker",  action="Submit", requires_document=True),
        WorkflowStage(stage_key="accounts_review",  stage_label="MPCA Accounts · Review",       acting_role="mpca_accounts",     action="Review"),
        WorkflowStage(stage_key="treasurer_approve",stage_label="Treasurer · Approve",          acting_role="mpca_treasurer",    action="Approve"),
    ],
)

VOUCHER_PAYMENT_WORKFLOW = WorkflowConfig(
    workflow_key="voucher_payment",
    workflow_label="Payment Voucher",
    entity="voucher",
    stages=[
        WorkflowStage(stage_key="accounts_prepare", stage_label="Accounts · Prepare",           acting_role="mpca_accounts",    action="Submit"),
        WorkflowStage(stage_key="cao_verify",       stage_label="CAO · Verify",                 acting_role="cao",              action="Review"),
        WorkflowStage(stage_key="treasurer_sign",   stage_label="Treasurer · Sign",             acting_role="mpca_treasurer",   action="Approve"),
        WorkflowStage(stage_key="secretary_sign",   stage_label="Secretary · Counter-Sign",     acting_role="mpca_secretary",   action="Authorise"),
    ],
)

ALL_REFERENCE_WORKFLOWS = [
    ANNUAL_DISTRICT_GRANT_WORKFLOW,
    DIVISION_GRANT_WORKFLOW,
    TOURNAMENT_INVOICE_WORKFLOW,
    VOUCHER_PAYMENT_WORKFLOW,
]
