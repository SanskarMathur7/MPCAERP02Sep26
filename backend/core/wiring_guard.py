"""MPCA-243 · Ship 1 · Shared wiring-driven governance helpers.

Every endpoint that mutates tournament state (fixtures, budgets, closure,
finance, officials) should call `assert_wiring_owner()` instead of
hardcoding role/body_type checks. This is the single enforcement point
for the wiring config's `owner` semantics.

Semantics:
    owner == "MPCA"     → only State personas may act
    owner == "Division" → State OR Division personas may act
    owner == "District" → State, Division OR District personas may act
    owner == "Auto"     → system-managed, no user action allowed (locked)
    owner == "None" / missing → fall back to MPCA-only (safest default)
"""
from typing import Optional, Tuple
from fastapi import HTTPException

from core.infra import db


_OWNER_TO_BODY_TYPES = {
    "MPCA":     {"State"},
    "Division": {"State", "Division"},
    "District": {"State", "Division", "District"},
}


async def resolve_wiring_cell(tid: str, step_key: str) -> dict:
    """Fetch the wiring cell for `step_key` on tournament `tid`.

    Returns `{}` if wiring cannot be resolved so callers can safely
    fall back to MPCA-only defaults.
    """
    try:
        from routes.tournament_wiring_status import _resolve_type_id
        from routes.tournament_wiring import _fetch_or_seed_wiring
    except Exception:
        return {}
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    try:
        type_id = await _resolve_type_id(t)
    except Exception:
        return {}
    wiring = await _fetch_or_seed_wiring()
    return wiring.get("cells", {}).get(type_id, {}).get(step_key) or {}


async def resolve_wiring_cell_by_payload(payload: dict, step_key: str) -> dict:
    """MPCA-260 · Ship P0.2 — payload-based wiring lookup.

    Used at CREATION time when a tournament doesn't exist yet. Reads
    tournament_type_code / tournament_type / scope directly from the
    incoming payload and resolves the wiring cell for `step_key`.

    Returns `{}` if wiring cannot be resolved (safe fallback = MPCA-only).
    """
    try:
        from routes.tournament_wiring_status import _resolve_type_id
        from routes.tournament_wiring import _fetch_or_seed_wiring
    except Exception:
        return {}
    try:
        type_id = await _resolve_type_id(payload or {})
    except Exception:
        return {}
    wiring = await _fetch_or_seed_wiring()
    return wiring.get("cells", {}).get(type_id, {}).get(step_key) or {}


async def assert_creation_owner(
    payload: dict,
    x_body_type: Optional[str],
    *,
    action_label: str = "tournament creation",
) -> Tuple[str, dict]:
    """MPCA-260 · Ship P0.2 — enforce wiring owner at tournament CREATION.

    Because no `tid` exists yet, uses the incoming payload to resolve the
    wiring cell for `tournament_creation`. Raises 403 unless the caller's
    body_type ∈ the owner set for this tournament type. Legacy calls
    (missing X-Body-Type header) are permitted with a safe MPCA fallback.
    """
    cell = await resolve_wiring_cell_by_payload(payload, "tournament_creation")
    owner = (cell.get("owner") if cell else None) or "MPCA"

    # Legacy service-to-service / seed callers without persona headers — allow.
    if x_body_type is None:
        return owner, cell
    if owner == "Auto":
        raise HTTPException(409, f"Cannot {action_label}: this type is system-managed.")
    allowed = _OWNER_TO_BODY_TYPES.get(owner, {"State"})
    if x_body_type not in allowed:
        raise HTTPException(
            403,
            f"Only {' / '.join(sorted(allowed))} personas may perform {action_label} "
            f"for this tournament type (wiring owner = {owner}).",
        )
    return owner, cell


async def assert_wiring_owner(
    tid: str,
    step_key: str,
    x_body_type: Optional[str],
    x_body_code: Optional[str] = None,
    *,
    action_label: Optional[str] = None,
) -> Tuple[str, dict]:
    """Raise 403 unless the caller's `body_type` matches the wiring owner.

    Returns the resolved `(owner, cell)` so callers can stamp attribution
    fields (`locked_by`, `assigned_by`, `issued_by`) using the correct
    body_code without a second lookup.

    Special cases:
        - When body_type is None (unauthenticated / internal call), the
          call is allowed to preserve backward compatibility with legacy
          service-to-service traffic. Guard is defensive-only.
        - When owner is "Auto" the endpoint is off-limits to everyone —
          this indicates the wiring flagged this step as system-managed.
    """
    cell  = await resolve_wiring_cell(tid, step_key)
    owner = cell.get("owner") or "MPCA"

    if owner == "Auto":
        raise HTTPException(
            409,
            f"Step '{step_key}' is wiring-flagged as system-managed for this "
            "tournament type. Manual action is not permitted.",
        )

    if x_body_type is None:
        # Legacy / internal caller — trust the caller. Log-only guard.
        return owner, cell

    allowed = _OWNER_TO_BODY_TYPES.get(owner, {"State"})
    if x_body_type not in allowed:
        verb = action_label or f"{step_key.replace('_', ' ')} action"
        raise HTTPException(
            403,
            f"Only {' / '.join(sorted(allowed))} personas may perform this "
            f"{verb} for this tournament type (wiring owner = {owner}).",
        )
    return owner, cell


def stamp_actor(x_persona_name: Optional[str], x_body_code: Optional[str],
                x_body_type: Optional[str]) -> str:
    """Return a display string for attribution fields (locked_by, assigned_by,
    issued_by). Preserves clarity when the acting persona is a Division /
    District instead of hardcoding "MPCA"."""
    if x_persona_name and x_body_code:
        return f"{x_persona_name} · {x_body_code}"
    if x_body_code:
        return x_body_code
    return "MPCA"



# ─── Feb 2026 · Division-owned Budget Predicate ──────────────────────────────
# Any tournament whose `unified_budget` wiring cell is owned by the Division
# (with no approver step) means MPCA has NO role in the budget preparation /
# acceptance lifecycle. This covers 6 of the 8 tournament types today:
#   • Pre-Tournament Camp
#   • Inter-District
#   • Inter-School
#   • Inter-Club (A-Grade)
#   • Periodical Coaching Camp
#   • Vacation Camp
# Used by (1) selection_console.py action-item generator to suppress
# MPCA-side chips (Send / Accept / Sanction) and (2) finance_console.py
# endpoints to return 400 when MPCA attempts to prepare / send budgets.
# Reads the live wiring config — no hardcoded type list — so any future
# wiring change flexes automatically.

async def is_division_owned_budget(tournament: dict) -> bool:
    """Return True when the wiring cell for `unified_budget` on this
    tournament is `owner=Division` with no approver — meaning MPCA has
    no budget-preparation or acceptance role and the Division owns the
    lifecycle end-to-end until the reimbursement claim submission.

    Falls back to False (safe default — MPCA-owned) on any resolution
    failure so callers never mis-hide MPCA-side actions.
    """
    try:
        from routes.tournament_wiring_status import _resolve_type_id
        from routes.tournament_wiring import _fetch_or_seed_wiring
    except Exception:
        return False
    if not tournament:
        return False
    try:
        type_id = await _resolve_type_id(tournament)
    except Exception:
        return False
    wiring = await _fetch_or_seed_wiring()
    cell = (wiring.get("cells") or {}).get(type_id, {}).get("unified_budget") or {}
    owner = cell.get("owner")
    approver = cell.get("approver")
    # Wiring stores absent approver as either Python None OR the literal
    # string "None" (legacy seed) — normalise both to falsy.
    approver_norm = None if (approver is None or approver == "None" or approver == "") else approver
    return owner == "Division" and approver_norm is None
