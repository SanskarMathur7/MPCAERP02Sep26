"""Sprint M13 · Body-scope helper for read-side RBAC.

Reads X-Persona-*/X-Body-* headers set by the frontend axios interceptor and
returns a MongoDB query fragment for the requested collection's body field.

Rules
─────
• State (MPCA/BCCI)        → no filter (sees everything)
• Division (e.g. DIV-IND)  → own DIV code + all DIST-*-{SUFFIX} children (uses $or)
• District                 → own DIST code only
• Match Official           → routes filter by official_name (not body)

Usage
─────
    from core.scoping import get_scope, body_scope

    @api_router.get("/members")
    async def list_members(request: Request):
        scope = get_scope(request)
        q = {"is_active": True, **body_scope(scope)}
        return await db.members.find(q, {"_id": 0}).to_list(2000)
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
    """Convenience: list of body codes visible to this scope.
    Returns None for State (means "no filter"). For Division includes DIV code +
    a lightweight prefix match will be applied on collection use — callers should
    prefer body_scope() over this."""
    if scope.is_state or not scope.body_code:
        return None
    if scope.is_district:
        return [scope.body_code]
    if scope.is_division:
        return [scope.body_code]  # child DIST-*-{suffix} handled via regex in body_scope
    return [scope.body_code]
