"""Sprint M13 · Body-scope helper for read-side RBAC.

Iter 108 update ────────────────────────────────────────────────────────
Scope is now derived from `request.state.principal` (populated by
lib/auth_middleware.AuthMiddleware from the signed JWT), NOT from
client-controlled `X-Body-*` / `X-Persona-*` headers.  This closes
SEC-001 in the security audit.

Legacy header-based reads are retained ONLY as an unsigned fallback for
public routes (/api/health etc.); for anything gated by the auth
middleware the state-attached principal is authoritative.

Rules
─────
• State (MPCA/BCCI)        → no filter (sees everything)
• Division (e.g. DIV-IND)  → own DIV code + all DIST-*-{SUFFIX} children (uses $or)
• District                 → own DIST code only
• Match Official           → routes filter by official_name (not body)
"""
from typing import Optional
from fastapi import Request
from dataclasses import dataclass


@dataclass
class RequestScope:
    persona_id: Optional[str] = None
    body_code: Optional[str] = None
    body_type: Optional[str] = None
    name: Optional[str] = None

    @property
    def is_state(self) -> bool: return (self.body_type or "").lower() == "state"
    @property
    def is_division(self) -> bool: return (self.body_type or "").lower() == "division"
    @property
    def is_district(self) -> bool: return (self.body_type or "").lower() == "district"
    @property
    def is_official(self) -> bool: return (self.body_type or "").lower() == "official"

    @property
    def division_suffix(self) -> str:
        return (self.body_code or "").replace("DIV-", "").upper()


def get_scope(request: Request) -> RequestScope:
    """JWT-first scope resolution (Iter 108).

    1) If the auth middleware attached a `principal` to `request.state`,
       derive scope from THAT (unspoofable, JWT-signed).
    2) Otherwise fall back to legacy headers — reachable only from public
       routes that bypass the auth middleware.
    """
    principal = getattr(request.state, "principal", None)
    if principal is not None:
        return RequestScope(
            persona_id=principal.user_id,
            body_code=principal.body_code,
            body_type=principal.body_type,
            name=principal.name,
        )
    # Legacy fallback — only for endpoints not covered by AuthMiddleware.
    h = request.headers
    return RequestScope(
        persona_id=h.get("x-persona-id"),
        body_code=h.get("x-body-code"),
        body_type=h.get("x-body-type"),
        name=h.get("x-persona-name"),
    )


def body_scope(scope: RequestScope, field: str = "body_id") -> dict:
    """Return a Mongo query fragment scoping the given body-field.
    Returns {} for State/unauthenticated (no filter).
    """
    if scope.is_state or not scope.body_code or not scope.body_type:
        return {}
    if scope.is_division:
        suffix = scope.division_suffix
        return {
            "$or": [
                {field: scope.body_code},
                {field: {"$regex": f"^DIST-.+-{suffix}$"}},
            ]
        }
    if scope.is_district:
        return {field: scope.body_code}
    if scope.is_official:
        # not a body-based scope
        return {}
    return {}


def in_scope_ids(scope: RequestScope) -> Optional[list]:
    """Convenience: list of body codes visible to this scope."""
    if scope.is_state or not scope.body_code:
        return None
    return [scope.body_code]
