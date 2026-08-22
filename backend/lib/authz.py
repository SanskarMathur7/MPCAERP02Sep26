"""lib/authz.py — Iter 108 · JWT-embedded RBAC + body-scope authorization.

Replaces the spoofable X-Body-* / X-Persona-* header scheme with server-side
enforcement rooted in the signed JWT.  Every request goes through
`auth_middleware` (see server.py) which decodes the Bearer token, looks up the
user, derives their role, and attaches a `RequestPrincipal` to
`request.state.principal`.  Downstream code reads scope + permission from
there — never from client-controlled headers.

Public API
──────────
    class Role(str, Enum) ..............  6 canonical roles
    class Permission(str, Enum) ........  action verbs · single source of truth
    class RequestPrincipal .............  what lives on `request.state.principal`
    role_of(user) -> Role ...............  derives Role from user dict
    has_permission(role, perm) -> bool ..  RBAC check
    require_permission(perm) ...........  FastAPI dependency factory
    scope_filter(principal, field) .....  Mongo query fragment for row-scoping
    require_scope(principal, target_body)  raises 403 if out-of-scope
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from fastapi import Depends, HTTPException, Request


# ═══════════════════════════════════════════════════════════════════════
# Roles & Permissions (single source of truth)
# ═══════════════════════════════════════════════════════════════════════

class Role(str, Enum):
    SYS_ADMIN           = "sys_admin"
    MPCA_PRESIDENT      = "mpca_president"
    MPCA_SECRETARY      = "mpca_secretary"
    MPCA_TREASURER      = "mpca_treasurer"
    DIVISION_SECRETARY  = "division_secretary"
    DISTRICT_SECRETARY  = "district_secretary"
    MATCH_OFFICIAL      = "match_official"
    ANON                = "anon"   # never granted; sentinel for unauth


class Permission(str, Enum):
    # Dashboard tabs — feature toggles
    DASHBOARD_SEASON_VIEW   = "dashboard.season.view"
    DASHBOARD_PLAYERS_VIEW  = "dashboard.players.view"
    DASHBOARD_GRANTS_VIEW   = "dashboard.grants.view"
    DASHBOARD_BUDGET_VIEW   = "dashboard.budget.view"
    DASHBOARD_STATEWIDE     = "dashboard.statewide"   # can see unfiltered aggregates

    # Data reads
    PLAYERS_READ_ALL        = "players.read.all"
    PLAYERS_READ_SCOPED     = "players.read.scoped"
    TOURNAMENTS_READ_ALL    = "tournaments.read.all"
    TOURNAMENTS_READ_SCOPED = "tournaments.read.scoped"
    GRANTS_READ_ALL         = "grants.read.all"
    GRANTS_READ_SCOPED      = "grants.read.scoped"
    BUDGETS_READ_ALL        = "budgets.read.all"
    BUDGETS_READ_SCOPED     = "budgets.read.scoped"

    # Writes / workflow transitions
    PLAYERS_APPROVE         = "players.approve"
    PLAYERS_DISQUALIFY      = "players.disqualify"
    GRANTS_APPROVE          = "grants.approve"
    GRANTS_RECOMMEND        = "grants.recommend"
    GRANTS_SUBMIT           = "grants.submit"
    BUDGETS_APPROVE         = "budgets.approve"

    # Admin — masters/config, only SYS_ADMIN gets these
    RBAC_MANAGE             = "rbac.manage"
    USERS_MANAGE            = "users.manage"
    SYSTEM_CONFIG           = "system.config"   # rate cards, tournament master, wiring, rulebook
    WORKFLOW_MANAGE         = "workflow.manage"  # M&C workflow admin


# Role → permission bag ------------------------------------------------
_ALL_PERMS = set(Permission)

ROLE_MATRIX: dict[Role, set[Permission]] = {
    # SYS_ADMIN gets everything — tech-layer controls belong here alone
    Role.SYS_ADMIN: _ALL_PERMS,
    Role.MPCA_PRESIDENT: {
        Permission.DASHBOARD_SEASON_VIEW,  Permission.DASHBOARD_PLAYERS_VIEW,
        Permission.DASHBOARD_GRANTS_VIEW,  Permission.DASHBOARD_BUDGET_VIEW,
        Permission.DASHBOARD_STATEWIDE,
        Permission.PLAYERS_READ_ALL,       Permission.TOURNAMENTS_READ_ALL,
        Permission.GRANTS_READ_ALL,        Permission.BUDGETS_READ_ALL,
        Permission.GRANTS_APPROVE,         Permission.BUDGETS_APPROVE,
        Permission.PLAYERS_APPROVE,
    },
    Role.MPCA_SECRETARY: {
        Permission.DASHBOARD_SEASON_VIEW,  Permission.DASHBOARD_PLAYERS_VIEW,
        Permission.DASHBOARD_GRANTS_VIEW,  Permission.DASHBOARD_BUDGET_VIEW,
        Permission.DASHBOARD_STATEWIDE,
        Permission.PLAYERS_READ_ALL,       Permission.TOURNAMENTS_READ_ALL,
        Permission.GRANTS_READ_ALL,        Permission.BUDGETS_READ_ALL,
        Permission.PLAYERS_APPROVE,        Permission.GRANTS_APPROVE,
        Permission.PLAYERS_DISQUALIFY,     Permission.BUDGETS_APPROVE,
        # NOTE: RBAC_MANAGE + USERS_MANAGE + SYSTEM_CONFIG + WORKFLOW_MANAGE
        # moved to SYS_ADMIN only (Iter 110). Secretary retains READ on masters.
    },
    Role.MPCA_TREASURER: {
        Permission.DASHBOARD_SEASON_VIEW,  Permission.DASHBOARD_PLAYERS_VIEW,
        Permission.DASHBOARD_GRANTS_VIEW,  Permission.DASHBOARD_BUDGET_VIEW,
        Permission.DASHBOARD_STATEWIDE,
        Permission.PLAYERS_READ_ALL,       Permission.TOURNAMENTS_READ_ALL,
        Permission.GRANTS_READ_ALL,        Permission.BUDGETS_READ_ALL,
        Permission.GRANTS_APPROVE,         Permission.BUDGETS_APPROVE,
    },
    Role.DIVISION_SECRETARY: {
        Permission.DASHBOARD_SEASON_VIEW,  Permission.DASHBOARD_PLAYERS_VIEW,
        Permission.DASHBOARD_GRANTS_VIEW,  Permission.DASHBOARD_BUDGET_VIEW,
        Permission.PLAYERS_READ_SCOPED,    Permission.TOURNAMENTS_READ_SCOPED,
        Permission.GRANTS_READ_SCOPED,     Permission.BUDGETS_READ_SCOPED,
        Permission.GRANTS_RECOMMEND,       Permission.PLAYERS_APPROVE,
    },
    Role.DISTRICT_SECRETARY: {
        Permission.DASHBOARD_SEASON_VIEW,  Permission.DASHBOARD_PLAYERS_VIEW,
        Permission.DASHBOARD_GRANTS_VIEW,
        Permission.PLAYERS_READ_SCOPED,    Permission.TOURNAMENTS_READ_SCOPED,
        Permission.GRANTS_READ_SCOPED,
        Permission.GRANTS_SUBMIT,
    },
    Role.MATCH_OFFICIAL: {
        # Very narrow — sees own postings and claims only. No dashboard tabs.
        Permission.GRANTS_SUBMIT,
    },
    Role.ANON: set(),
}


# ═══════════════════════════════════════════════════════════════════════
# Role derivation
# ═══════════════════════════════════════════════════════════════════════

def role_of(user: dict) -> Role:
    """Derive the RBAC role from an already-loaded user dict.  The mapping is
    (body_type, post) → Role.  All lookups lowercased & tolerant of casing."""
    if not user:
        return Role.ANON
    # 1) Explicit override on the user doc wins (future rbac.py can set this)
    explicit = (user.get("role") or "").strip()
    if explicit:
        try:
            return Role(explicit)
        except ValueError:
            pass
    body_type = (user.get("body_type") or "").lower()
    post = (user.get("post") or "").lower()
    post_title = (user.get("post_title") or "").lower()
    # Iter 110 · System Administrator persona — technical/masters custodian.
    if "system administrator" in post_title or "system administrator" in post or "sys_admin" in (user.get("id") or ""):
        return Role.SYS_ADMIN
    if body_type == "state":
        if "president"   in post: return Role.MPCA_PRESIDENT
        if "treasurer"   in post: return Role.MPCA_TREASURER
        # Default MPCA-HQ staff to Secretary (widest safe read set)
        return Role.MPCA_SECRETARY
    if body_type == "division": return Role.DIVISION_SECRETARY
    if body_type == "district": return Role.DISTRICT_SECRETARY
    if body_type in {"official", "match_official"}: return Role.MATCH_OFFICIAL
    return Role.ANON


def has_permission(role: Role, perm: Permission) -> bool:
    return perm in ROLE_MATRIX.get(role, set())


# ═══════════════════════════════════════════════════════════════════════
# RequestPrincipal — the resolved identity on request.state
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class RequestPrincipal:
    user_id: str
    email: str
    name: str
    role: Role
    body_type: str        # "State" | "Division" | "District" | "Official" | ""
    body_code: str        # "MPCA" | "DIV-IND" | "DIST-INDO-IND" | ""
    body_name: str
    post: str
    post_title: str = ""  # Iter 109 · normalized post title (e.g. "President", "Hon. Secretary")
    raw_user: dict = None  # full user doc for consumers that still need it

    @property
    def is_state(self) -> bool:    return self.body_type.lower() == "state"
    @property
    def is_division(self) -> bool: return self.body_type.lower() == "division"
    @property
    def is_district(self) -> bool: return self.body_type.lower() == "district"
    @property
    def is_official(self) -> bool: return self.body_type.lower() in {"official", "match_official"}

    @property
    def division_suffix(self) -> str:
        return (self.body_code or "").replace("DIV-", "").upper()

    def can(self, perm: Permission) -> bool:
        return has_permission(self.role, perm)


def principal_from_user(user: dict) -> RequestPrincipal:
    return RequestPrincipal(
        user_id=user.get("id", ""),
        email=user.get("email", ""),
        name=user.get("name", ""),
        role=role_of(user),
        body_type=user.get("body_type", "") or "",
        body_code=user.get("body_code", "") or "",
        body_name=user.get("body_name", "") or "",
        post=user.get("post", "") or "",
        post_title=user.get("post_title", "") or "",
        raw_user=user,
    )


# ═══════════════════════════════════════════════════════════════════════
# Retrieval + FastAPI dependencies
# ═══════════════════════════════════════════════════════════════════════

def get_principal(request: Request) -> RequestPrincipal:
    """Reads the resolved principal from request.state (set by middleware).
    Raises 401 if middleware did not populate it (fail-closed).  Public
    endpoints (/api/auth/*, /api/health) never call this."""
    p = getattr(request.state, "principal", None)
    if p is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return p


def require_permission(perm: Permission):
    """FastAPI dependency factory.  Usage:

        from lib.authz import require_permission, Permission
        @router.get("/", dependencies=[Depends(require_permission(Permission.GRANTS_READ_ALL))])
    """
    def _dep(request: Request):
        p = get_principal(request)
        if not p.can(perm):
            raise HTTPException(status_code=403, detail=f"Missing permission: {perm.value}")
        return p
    return _dep


def require_any_permission(*perms: Permission):
    def _dep(request: Request):
        p = get_principal(request)
        if not any(p.can(x) for x in perms):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return p
    return _dep


def require_role(*roles: Role):
    def _dep(request: Request):
        p = get_principal(request)
        if p.role not in roles:
            raise HTTPException(status_code=403, detail="Role not permitted")
        return p
    return _dep


# ═══════════════════════════════════════════════════════════════════════
# Row-level scoping — the "which rows can I see" gate
# ═══════════════════════════════════════════════════════════════════════

def scope_filter(principal: RequestPrincipal, field: str = "body_id") -> dict:
    """Return a Mongo query fragment restricting reads to this principal's scope.

    Iter 108b — Statewide visibility is a PERMISSION, not a body_type.  Only
    roles carrying `DASHBOARD_STATEWIDE` (Sec + Treasurer today) get the
    empty filter; everyone else — including the MPCA President — is scoped
    to their own body_code (and, for a Division, their child districts).

        · Statewide grant           →  {}                     (see everything)
        · State without statewide   →  {field: "MPCA"}        (HQ-owned rows only)
        · Division persona          →  own DIV + child DIST-* (regex on suffix)
        · District persona          →  own DIST only
        · Match Official            →  {} (their filter is by official_name)
    """
    # 1) Statewide-permission short-circuit
    if principal.can(Permission.DASHBOARD_STATEWIDE):
        return {}
    # 2) Fail-closed when scope data is missing
    if not principal.body_code or not principal.body_type:
        return {"_scope_deny": True}
    # 3) State body without statewide permission (e.g. President) → own body only
    if principal.is_state:
        return {field: principal.body_code}
    # 4) Division → own DIV + child DIST-*-{SUFFIX}
    if principal.is_division:
        suffix = principal.division_suffix
        return {
            "$or": [
                {field: principal.body_code},
                {field: {"$regex": f"^DIST-.+-{suffix}$"}},
            ]
        }
    # 5) District → own DIST only
    if principal.is_district:
        return {field: principal.body_code}
    # 6) Match Official — their filter is by official_id / official_name, not body
    if principal.is_official:
        return {}
    return {"_scope_deny": True}


def require_scope(principal: RequestPrincipal, target_body_code: str) -> None:
    """Raise 403 if principal cannot access the given body_code."""
    if principal.is_state or not target_body_code:
        return
    if principal.is_division:
        # allowed: own DIV + any DIST-*-{SUFFIX}
        if target_body_code == principal.body_code:
            return
        suffix = principal.division_suffix
        if target_body_code.startswith("DIST-") and target_body_code.endswith(f"-{suffix}"):
            return
        raise HTTPException(status_code=403, detail="Body out of scope")
    if principal.is_district:
        if target_body_code == principal.body_code:
            return
        raise HTTPException(status_code=403, detail="Body out of scope")
    raise HTTPException(status_code=403, detail="Body out of scope")


# Convenience for legacy callers that used core.scoping.get_scope(request)
CurrentPrincipal = Depends(get_principal)
