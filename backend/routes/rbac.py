"""
Sprint M21 · Role-Based Access Control (RBAC) — Backend
────────────────────────────────────────────────────────
Delivers:
  • `roles`                      collection (13 seeded roles)
  • `users`                      collection (users mapped to a role + body)
  • `audit_log`                  collection (RBAC + approval events)
  • Permission catalog             — ~55 permissions across 18 modules
  • REST endpoints for the RBAC console (President / Secretary / Sys Admin only)

Enforcement:
  • All endpoints in this module require the caller to hold one of
    {President, Hon. Secretary, System Administrator} — checked via
    `require_rbac_admin` dependency reading persona headers
    (X-Body-Code / X-Persona-Post / X-Persona-Id) or Body State personas
    (Body_Type='State').
  • Existing legacy endpoints retain their AuthContext body-scoping unchanged.

Audit Log:
  • Every write in this module is logged.
  • Callers from other modules can log via `log_audit_event(...)`.
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import uuid

from fastapi import HTTPException, Request, Depends
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router


# ─────────────────────────── Permission Catalog ───────────────────────────
# Format: "module.action". Additions here must also be reflected in the
# frontend permission-matrix UI (PermissionCatalog constant).

MODULES = {
    "members":              ["view", "create", "edit", "deactivate", "export"],
    "tournaments":          ["view", "create", "edit", "cancel", "accept_host"],
    "squads":               ["view", "build", "submit", "approve", "reject", "reopen"],
    "budgets":              ["view", "create", "edit", "submit", "approve", "return", "reject"],
    "invoices":             ["view", "upload", "edit", "approve", "void"],
    "extras":               ["view", "request", "approve", "reject"],
    "reimbursement_claims": ["view", "create", "submit", "approve", "reject", "reduce"],
    "grant_claims":         ["view", "create", "submit", "approve", "reject"],
    "match_officials":      ["view", "empanel", "deactivate", "approve_da"],
    "da_forms":             ["view", "fill", "submit", "approve"],
    "venues":               ["view", "create", "edit", "deactivate"],
    "players":              ["view", "create", "edit", "kyc_verify", "export"],
    "calendar":             ["view", "create", "edit", "lock"],
    "receipts":             ["view", "record", "edit", "delete"],
    "closure":              ["view", "generate", "regenerate"],
    "governance":           ["view", "schedule", "minutes", "resolutions"],
    "schemes":              ["view", "edit"],
    "disclosures":          ["view", "submit", "publish"],
    "rbac":                 ["view", "edit_roles", "assign_users", "audit_log"],
}
ALL_PERMISSIONS: List[str] = [f"{m}.{a}" for m, actions in MODULES.items() for a in actions]


# ─────────────────────────── Default Role → Permissions matrix ───────────────────────────
def _all(*mods) -> List[str]:
    return [p for m in mods for p in [f"{m}.{a}" for a in MODULES[m]]]


DEFAULT_ROLE_MATRIX: Dict[str, Dict[str, Any]] = {
    "president": {
        "name": "President",
        "body_scope": "State",
        "description": "Chairs the Board, signs resolutions, holds ultimate approval power.",
        "permissions": ALL_PERMISSIONS,   # everything except SysAdmin-only edit
    },
    "hon_secretary": {
        "name": "Hon. Secretary",
        "body_scope": "State",
        "description": "Operational chief of MPCA; final approver on operations & governance.",
        "permissions": ALL_PERMISSIONS,
    },
    "hon_treasurer": {
        "name": "Hon. Treasurer",
        "body_scope": "State",
        "description": "Final approver on all finance and receipts.",
        "permissions": [
            *_all("budgets", "invoices", "extras", "reimbursement_claims", "grant_claims", "receipts", "closure"),
            "members.view", "tournaments.view", "squads.view", "da_forms.view", "da_forms.approve",
            "match_officials.view", "match_officials.approve_da", "schemes.view", "schemes.edit",
            "rbac.view", "rbac.audit_log",
        ],
    },
    "joint_secretary": {
        "name": "Joint Secretary",
        "body_scope": "State",
        "description": "Assists Secretary. Can propose/edit but not final-approve major claims.",
        "permissions": [
            "members.view", "members.edit", "members.create",
            "tournaments.view", "tournaments.create", "tournaments.edit",
            "squads.view", "squads.build", "squads.submit",
            "budgets.view", "budgets.create", "budgets.edit", "budgets.submit", "budgets.return",
            "invoices.view", "invoices.upload", "invoices.edit",
            "extras.view", "extras.request",
            "reimbursement_claims.view", "reimbursement_claims.create", "reimbursement_claims.submit",
            "grant_claims.view", "grant_claims.create",
            "match_officials.view", "da_forms.view", "venues.view", "players.view",
            "calendar.view", "receipts.view", "closure.view", "governance.view", "schemes.view",
            "disclosures.view", "rbac.view", "rbac.audit_log",
        ],
    },
    "auditor": {
        "name": "Auditor (Internal)",
        "body_scope": "State",
        "description": "View-only across every body. No writes.",
        "permissions": [p for p in ALL_PERMISSIONS if p.endswith(".view") or p == "rbac.audit_log"],
    },
    "state_selector": {
        "name": "State Selector",
        "body_scope": "State",
        "description": "Reviews state-level squads. Cannot touch finance.",
        "permissions": [
            "tournaments.view", "squads.view", "squads.build", "squads.submit",
            "players.view", "players.edit", "calendar.view", "members.view",
        ],
    },
    "system_administrator": {
        "name": "System Administrator",
        "body_scope": "State",
        "description": "Owns RBAC and master data (schemes, bodies, venues). No claim/budget approvals.",
        "permissions": [
            *_all("rbac"), *_all("schemes"), *_all("venues"), *_all("members"),
            "tournaments.view", "tournaments.edit", "players.view", "players.edit",
            "governance.view", "governance.schedule",
        ],
    },
    "division_secretary": {
        "name": "Division Secretary",
        "body_scope": "Division",
        "description": "Operational chief of a Division. Submits budgets & reimbursement claims.",
        "permissions": [
            "members.view", "members.create", "members.edit",
            "tournaments.view", "tournaments.create", "tournaments.edit", "tournaments.accept_host",
            "squads.view", "squads.build", "squads.submit",
            "budgets.view", "budgets.create", "budgets.edit", "budgets.submit",
            "invoices.view", "invoices.upload", "invoices.edit",
            "extras.view", "extras.request",
            "reimbursement_claims.view", "reimbursement_claims.create", "reimbursement_claims.submit",
            "grant_claims.view", "grant_claims.create", "grant_claims.submit",
            "match_officials.view", "da_forms.view",
            "venues.view", "players.view", "players.edit",
            "calendar.view", "calendar.create", "calendar.edit", "calendar.lock",
            "receipts.view",
            "closure.view",
            "governance.view", "schemes.view", "disclosures.view", "disclosures.submit",
        ],
    },
    "division_treasurer": {
        "name": "Division Treasurer",
        "body_scope": "Division",
        "description": "Signs off on Division finance before it's submitted to MPCA.",
        "permissions": [
            "budgets.view", "budgets.edit", "budgets.submit",
            "invoices.view", "invoices.approve",
            "extras.view", "extras.approve",
            "reimbursement_claims.view", "reimbursement_claims.submit",
            "grant_claims.view", "grant_claims.submit",
            "receipts.view", "receipts.record",
            "members.view", "tournaments.view", "squads.view",
        ],
    },
    "district_secretary": {
        "name": "District Secretary",
        "body_scope": "District",
        "description": "Operational chief of a District. Submits budgets & claims for district tournaments.",
        "permissions": [
            "members.view", "members.create", "members.edit",
            "tournaments.view", "tournaments.create", "tournaments.edit", "tournaments.accept_host",
            "squads.view", "squads.build", "squads.submit",
            "budgets.view", "budgets.create", "budgets.edit", "budgets.submit",
            "invoices.view", "invoices.upload",
            "extras.view", "extras.request",
            "reimbursement_claims.view", "reimbursement_claims.create", "reimbursement_claims.submit",
            "grant_claims.view",
            "match_officials.view", "da_forms.view",
            "venues.view", "players.view",
            "calendar.view", "calendar.create", "calendar.edit",
            "receipts.view", "closure.view",
            "governance.view", "schemes.view", "disclosures.view",
        ],
    },
    "match_official": {
        "name": "Match Official (Umpire/Referee/Scorer)",
        "body_scope": "Any",
        "description": "Fills their own DA/TA forms after officiating a fixture. No other write.",
        "permissions": [
            "da_forms.view", "da_forms.fill", "da_forms.submit",
            "tournaments.view", "calendar.view", "members.view",
        ],
    },
    "coach": {
        "name": "Coach / Physio",
        "body_scope": "Any",
        "description": "Views players and squad data; submits performance notes.",
        "permissions": [
            "players.view", "players.edit", "squads.view", "tournaments.view",
            "calendar.view", "members.view",
        ],
    },
    "data_entry_mpca": {
        "name": "Data Entry Clerk (MPCA)",
        "body_scope": "State",
        "description": "MPCA data-entry: enters raw data (players, invoices, venues). Cannot submit or approve.",
        "permissions": [
            "members.view", "members.create", "members.edit",
            "players.view", "players.create", "players.edit",
            "invoices.view", "invoices.upload",
            "venues.view", "calendar.view", "tournaments.view",
        ],
    },
    "data_entry_division": {
        "name": "Data Entry Clerk (Division)",
        "body_scope": "Division",
        "description": "Division data-entry: enters raw data scoped to the Division. Cannot submit or approve.",
        "permissions": [
            "members.view", "members.create", "members.edit",
            "players.view", "players.create", "players.edit",
            "invoices.view", "invoices.upload",
            "venues.view", "calendar.view", "tournaments.view",
        ],
    },
    # ── Iter 113 · MPCA internal posts (mirrors Maker-Checker post catalog) ──
    "chief_accounts_officer": {
        "name": "Chief Accounts Officer",
        "body_scope": "State",
        "description": "MPCA accounts custodian; prepares claim & budget packets for treasurer sign-off.",
        "permissions": [
            "budgets.view", "budgets.edit", "budgets.submit",
            "invoices.view", "invoices.upload", "invoices.approve",
            "reimbursement_claims.view", "reimbursement_claims.create",
            "grant_claims.view", "grant_claims.create",
            "receipts.view", "receipts.record",
        ],
    },
    "joint_secretary": {
        "name": "Joint Secretary",
        "body_scope": "State",
        "description": "Assists Hon. Secretary; drafts and coordinates but does not final-approve.",
        "permissions": [
            "members.view", "members.edit", "members.create",
            "tournaments.view", "tournaments.edit",
            "governance.view", "governance.schedule",
            "calendar.view", "calendar.create", "calendar.edit",
            "disclosures.view", "disclosures.submit",
        ],
    },
    "manager": {
        "name": "Manager",
        "body_scope": "State",
        "description": "MPCA operations manager; day-to-day admin without approval authority.",
        "permissions": [
            "members.view", "tournaments.view", "tournaments.edit",
            "venues.view", "calendar.view", "calendar.create",
            "match_officials.view", "governance.view",
        ],
    },
    "selection_chairperson": {
        "name": "Selection Chairperson",
        "body_scope": "State",
        "description": "Chair of the Selection Committee; convenes selections but does not touch finance.",
        "permissions": [
            "squads.view", "squads.build", "squads.submit",
            "players.view", "players.edit",
            "tournaments.view", "calendar.view",
        ],
    },
    "cricket_manager": {
        "name": "Cricket Manager",
        "body_scope": "State",
        "description": "Owns cricket operations · fixtures + officials + venues.",
        "permissions": [
            "tournaments.view", "tournaments.create", "tournaments.edit",
            "calendar.view", "calendar.create", "calendar.edit",
            "match_officials.view",
            "venues.view", "players.view",
        ],
    },
}


# ─────────────────────────── Pydantic models ───────────────────────────

class Role(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    body_scope: str                          # State | Division | District | Any
    description: str
    permissions: List[str] = Field(default_factory=list)
    is_system: bool = True                    # seeded roles are system-defined
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RolePatch(BaseModel):
    permissions: Optional[List[str]] = None
    description: Optional[str] = None
    name: Optional[str] = None


class RBACUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    display_name: str
    honorific: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role_id: str                             # single role per user (per user's choice Q2b)
    body_code: str = "MPCA"                  # scope
    body_type: str = "State"                  # State | Division | District | Any
    is_active: bool = True
    persona_id: Optional[str] = None          # if bootstrapped from a fixed persona chip
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RBACUserCreate(BaseModel):
    display_name: str
    honorific: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role_id: str
    body_code: str = "MPCA"
    body_type: str = "State"
    is_active: bool = True
    # Iter 113 · Admin-set-password path (option a in the roll-out plan).
    # If BOTH email + initial_password are provided, the row is written with a
    # bcrypt password_hash so the person can sign in.
    initial_password: Optional[str] = None
    force_password_reset: bool = True


class RBACUserPatch(BaseModel):
    display_name: Optional[str] = None
    honorific: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role_id: Optional[str] = None
    body_code: Optional[str] = None
    body_type: Optional[str] = None
    is_active: Optional[bool] = None


class AuditEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    actor_body: Optional[str] = None
    action: str                              # rbac.role_edited / rbac.user_created / claim.approved etc.
    entity: str                              # role:hon_secretary  /  user:abc  /  claim:xyz
    changes: Dict[str, Any] = Field(default_factory=dict)
    reason: Optional[str] = None


# ─────────────────────────── Utility: extract actor from request headers ───────────────────────────

def _actor_from_request(request: Request) -> Dict[str, Optional[str]]:
    """The frontend AuthContext forwards these headers on every axios call."""
    h = request.headers
    return {
        "actor_name": h.get("x-persona-name"),
        "actor_role": h.get("x-persona-post") or h.get("x-persona-id"),
        "actor_body": h.get("x-body-code"),
    }


# Personas that are allowed into the RBAC console (Q3a)
RBAC_ADMIN_PERSONA_IDS = {"president", "secretary", "system-administrator", "system_administrator"}


async def require_rbac_admin(request: Request) -> Dict[str, Optional[str]]:
    """FastAPI dependency: gate every RBAC endpoint to MPCA President /
    Hon. Secretary.  Iter 108 (SEC-002): auth is now enforced by the global
    AuthMiddleware, so `request.state.principal` is trusted; the no-header
    bootstrap bypass and header-forgery paths are gone.
    """
    from lib.authz import Role  # local import to avoid circulars at import-time
    principal = getattr(request.state, "principal", None)
    if principal is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if principal.role in (Role.SYS_ADMIN, Role.MPCA_PRESIDENT, Role.MPCA_SECRETARY):
        return {
            "actor_name": principal.name,
            "actor_role": principal.post or principal.role.value,
            "actor_body": principal.body_code,
        }

    raise HTTPException(403, "RBAC console is restricted to the President and Hon. Secretary.")


# ─────────────────────────── Audit log helper (used by other modules) ───────────────────────────

async def log_audit_event(
    *, actor_name: Optional[str], actor_role: Optional[str], actor_body: Optional[str],
    action: str, entity: str, changes: Optional[Dict[str, Any]] = None, reason: Optional[str] = None,
) -> None:
    event = AuditEvent(
        actor_name=actor_name, actor_role=actor_role, actor_body=actor_body,
        action=action, entity=entity, changes=changes or {}, reason=reason,
    )
    await db.audit_log.insert_one(event.model_dump())


# ─────────────────────────── Seeding ───────────────────────────

async def seed_roles_and_permissions() -> None:
    """Seed the 13 default roles + bootstrap 6 initial users from personas (Q5 hybrid)."""
    # 1) roles
    for role_id, spec in DEFAULT_ROLE_MATRIX.items():
        existing = await db.roles.find_one({"id": role_id})
        if not existing:
            role = Role(id=role_id, **spec)
            await db.roles.insert_one(role.model_dump())

    # 2) bootstrap users from personas (idempotent)
    bootstrap_users = [
        {"id": "president", "persona_id": "president", "display_name": "Mahanaryaman Scindia", "honorific": "Shri",
         "role_id": "president", "body_code": "MPCA", "body_type": "State"},
        {"id": "secretary", "persona_id": "secretary", "display_name": "Sanjeev Dua", "honorific": "Shri",
         "role_id": "hon_secretary", "body_code": "MPCA", "body_type": "State"},
        {"id": "treasurer", "persona_id": "treasurer", "display_name": "Naveen Mittal", "honorific": "Shri",
         "role_id": "hon_treasurer", "body_code": "MPCA", "body_type": "State"},
        {"id": "division-secretary", "persona_id": "division-secretary", "display_name": "Devashish Nilosey",
         "honorific": "Shri", "role_id": "division_secretary", "body_code": "DIV-IND", "body_type": "Division"},
        {"id": "district-secretary", "persona_id": "district-secretary", "display_name": "Rajesh Kulkarni",
         "honorific": "Shri", "role_id": "district_secretary", "body_code": "DIST-INDO-IND", "body_type": "District"},
        {"id": "match-official", "persona_id": "match-official", "display_name": "Chandrakant Pandit",
         "honorific": "Shri", "role_id": "match_official", "body_code": "MPCA", "body_type": "Any"},
    ]
    for u in bootstrap_users:
        existing = await db.users.find_one({"id": u["id"]})
        if not existing:
            user = RBACUser(**u)
            await db.users.insert_one(user.model_dump())


# ─────────────────────────── ROUTES ───────────────────────────

@api_router.get("/rbac/permission-catalog")
async def get_permission_catalog(_: Dict = Depends(require_rbac_admin)):
    """Returns the entire {module: [action, ...]} catalog for the UI matrix."""
    return {"modules": MODULES, "all_permissions": ALL_PERMISSIONS}


@api_router.get("/rbac/roles", response_model=List[Role])
async def list_roles(_: Dict = Depends(require_rbac_admin)):
    docs = await db.roles.find({}, {"_id": 0}).to_list(500)
    # Ordered: MPCA first, then Division, District, Any
    order = {"State": 0, "Division": 1, "District": 2, "Any": 3}
    docs.sort(key=lambda r: (order.get(r.get("body_scope", "Any"), 9), r["name"]))
    return docs


@api_router.get("/rbac/roles/{role_id}", response_model=Role)
async def get_role(role_id: str, _: Dict = Depends(require_rbac_admin)):
    r = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Role not found")
    return r


@api_router.patch("/rbac/roles/{role_id}", response_model=Role)
async def patch_role(role_id: str, patch: RolePatch, request: Request, actor: Dict = Depends(require_rbac_admin)):
    updates = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(400, "Nothing to update.")

    # Validate every permission actually exists in the catalog
    if "permissions" in updates:
        bad = [p for p in updates["permissions"] if p not in ALL_PERMISSIONS]
        if bad:
            raise HTTPException(400, f"Unknown permissions: {bad}")

    before = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Role not found")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.roles.update_one({"id": role_id}, {"$set": updates})
    after = await db.roles.find_one({"id": role_id}, {"_id": 0})

    await log_audit_event(
        **actor,
        action="rbac.role_edited",
        entity=f"role:{role_id}",
        changes={"before": {k: before.get(k) for k in updates},
                 "after": {k: after.get(k) for k in updates}},
    )
    return after


# ─────── Users ───────

# Iter 113 · Map seeded-persona post titles → RBAC role ids so the seeded
# 15 personas render in the RBAC user table with the correct role badge.
_POST_TITLE_TO_ROLE_ID = {
    "President":                  "president",
    "Hon. Secretary":             "hon_secretary",
    "Hon. Treasurer":             "hon_treasurer",
    "Joint Secretary":            "joint_secretary",
    "Chief Accounts Officer":     "chief_accounts_officer",
    "Manager":                    "manager",
    "Selection Chairperson":      "selection_chairperson",
    "Cricket Manager":            "cricket_manager",
    "System Administrator":       "system_administrator",
    "Division Secretary":         "division_secretary",
    "Division Treasurer":         "division_treasurer",
    "District Secretary":         "district_secretary",
    "Match Official":             "match_official",
    "Data Entry Clerk (MPCA)":    "data_entry_mpca",
    "Data Entry Clerk (Division)": "data_entry_division",
}


def _normalize_persona_row(u: dict) -> dict:
    """Convert a seeded-persona doc into the RBACUser shape so it renders in the table."""
    # Seeded rows have `name` + `post_title`; RBAC rows have `display_name` + `role_id`.
    body_type = u.get("body_type") or "State"
    body_code = u.get("body_code") or "MPCA"
    if u.get("display_name") and u.get("role_id"):
        return u  # already RBAC-shaped
    post_title = (u.get("post_title") or "").strip()
    # Prefer persona.role (seeded rows store the role slug directly for sys_admin)
    role_id = _POST_TITLE_TO_ROLE_ID.get(post_title) or u.get("role") or "hon_secretary"
    # Match sys_admin persona to its role name in db.roles (seeded as system_administrator)
    if post_title == "System Administrator" or (u.get("id") == "system-administrator"):
        role_id = "system_administrator"
    return {
        "id":            u.get("id") or "",
        "display_name":  u.get("name") or u.get("display_name") or "",
        "honorific":     u.get("honorific"),
        "email":         u.get("email"),
        "phone":         u.get("phone"),
        "role_id":       role_id,
        "body_code":     body_code,
        "body_type":     body_type,
        "is_active":     u.get("is_active", True),
        "persona_id":    u.get("persona_id") or u.get("id"),
        "created_at":    u.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "updated_at":    u.get("updated_at") or datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/rbac/users", response_model=List[RBACUser])
async def list_users(_: Dict = Depends(require_rbac_admin)):
    raw = await db.users.find({}, {"_id": 0}).to_list(1000)
    docs = [_normalize_persona_row(u) for u in raw]
    docs.sort(key=lambda u: (0 if u.get("body_type") == "State" else 1 if u.get("body_type") == "Division" else 2,
                             u.get("display_name", "")))
    return docs


@api_router.post("/rbac/users", response_model=RBACUser)
async def create_user(payload: RBACUserCreate, request: Request, actor: Dict = Depends(require_rbac_admin)):
    # Validate role exists
    if not await db.roles.find_one({"id": payload.role_id}, {"_id": 1}):
        raise HTTPException(400, f"Unknown role_id: {payload.role_id}")
    user = RBACUser(**payload.model_dump())
    doc = user.model_dump()
    # Iter 113 · If admin provided an initial password, also seed sign-in credentials.
    # Email is required for login, so we only hash if BOTH email + initial_password are set.
    initial_pw = getattr(payload, "initial_password", None)
    if initial_pw and payload.email:
        import bcrypt as _bcrypt
        doc["password_hash"] = _bcrypt.hashpw(initial_pw.encode("utf-8"), _bcrypt.gensalt(rounds=12)).decode("utf-8")
        doc["force_password_reset"] = bool(getattr(payload, "force_password_reset", True))
        doc["email"] = payload.email.strip().lower()
        # Mirror the seeded-persona shape so this user also appears in login-capable list
        doc["name"] = payload.display_name
        doc["post_title"] = doc.get("post_title") or ""
    await db.users.insert_one(doc)
    await log_audit_event(
        **actor,
        action="rbac.user_created",
        entity=f"user:{user.id}",
        changes={"display_name": user.display_name, "role_id": user.role_id, "body_code": user.body_code,
                 "login_enabled": bool(initial_pw and payload.email)},
    )
    return user


@api_router.post("/rbac/users/{uid}/reset-password")
async def reset_password(uid: str, request: Request, actor: Dict = Depends(require_rbac_admin)):
    """Iter 113 · Admin resets a user's password.
    Body: { "new_password": "...", "force_reset": true }
    """
    body = await request.json()
    new_pw = (body.get("new_password") or "").strip()
    force = bool(body.get("force_reset", True))
    if len(new_pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    if not user.get("email"):
        raise HTTPException(400, "User has no email — cannot enable login")
    import bcrypt as _bcrypt
    pw_hash = _bcrypt.hashpw(new_pw.encode("utf-8"), _bcrypt.gensalt(rounds=12)).decode("utf-8")
    await db.users.update_one({"id": uid}, {"$set": {
        "password_hash": pw_hash,
        "force_password_reset": force,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    await log_audit_event(
        **actor,
        action="rbac.user_password_reset",
        entity=f"user:{uid}",
        changes={"force_reset": force},
    )
    return {"ok": True, "user_id": uid, "force_password_reset": force}


@api_router.patch("/rbac/users/{uid}", response_model=RBACUser)
async def patch_user(uid: str, patch: RBACUserPatch, request: Request, actor: Dict = Depends(require_rbac_admin)):
    updates = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(400, "Nothing to update.")

    if "role_id" in updates:
        if not await db.roles.find_one({"id": updates["role_id"]}, {"_id": 1}):
            raise HTTPException(400, f"Unknown role_id: {updates['role_id']}")

    before = await db.users.find_one({"id": uid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "User not found")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": uid}, {"$set": updates})
    after = await db.users.find_one({"id": uid}, {"_id": 0})

    await log_audit_event(
        **actor,
        action="rbac.user_updated",
        entity=f"user:{uid}",
        changes={"before": {k: before.get(k) for k in updates},
                 "after": {k: after.get(k) for k in updates}},
    )
    return after


@api_router.delete("/rbac/users/{uid}")
async def delete_user(uid: str, request: Request, actor: Dict = Depends(require_rbac_admin)):
    before = await db.users.find_one({"id": uid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "User not found")
    # Guard: seed personas should be deactivated, not deleted.
    if before.get("persona_id"):
        raise HTTPException(400, "Bootstrap persona users cannot be deleted — use Deactivate instead.")
    r = await db.users.delete_one({"id": uid})
    await log_audit_event(**actor, action="rbac.user_deleted", entity=f"user:{uid}",
                          changes={"display_name": before.get("display_name")})
    return {"deleted": r.deleted_count > 0}


# ─────── Audit log ───────

@api_router.get("/rbac/audit-log")
async def get_audit_log(limit: int = 200, since: Optional[str] = None, _: Dict = Depends(require_rbac_admin)):
    q: Dict[str, Any] = {}
    if since:
        q["at"] = {"$gte": since}
    docs = await db.audit_log.find(q, {"_id": 0}).sort("at", -1).limit(min(limit, 1000)).to_list(1000)
    return docs


# ─────── Effective-permissions helper for the current persona (used by the frontend) ───────

@api_router.get("/rbac/whoami")
async def whoami(request: Request):
    """Every persona can call this — returns the user record + effective permissions."""
    persona_id = (request.headers.get("x-persona-id") or "").lower().strip()
    if not persona_id:
        return {"user": None, "role": None, "permissions": []}
    user = await db.users.find_one({"id": persona_id}, {"_id": 0})
    if not user:
        return {"user": None, "role": None, "permissions": []}
    role = await db.roles.find_one({"id": user.get("role_id")}, {"_id": 0}) if user.get("role_id") else None
    return {"user": user, "role": role, "permissions": (role or {}).get("permissions", [])}
