"""MPCA-235 · Ship 2 · Wiring Status derivation for a single tournament.

Reads the wiring config + live tournament state and returns the 9 step
statuses (done / current / pending / na / info) so the frontend can render
the Progression Ribbon without doing its own state derivation.

Everything here is READ-ONLY and non-blocking — Ship 2 is a visibility
layer. No step is gated by another; a user can always click any dot.
"""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from core.infra import api_router, db
from routes.tournament_wiring import _fetch_or_seed_wiring, STEPS_META, TYPES_META


# ─────────────── Tournament → wiring type_id resolver ───────────────

_SCOPE_TO_TYPE = {
    "Inter_Divisional": "interdiv",
    "Inter_District":   "district",
    # 'Championship' + 'Invitational' fall through to master-registry lookup
}

_CATEGORY_TO_TYPE = {
    "BCCI":                     "bcci",
    "Inter_Divisional":         "interdiv",
    "Inter_District":           "district",
    "Inter_School":             "interschool",
    "Inter_Club":               "interclub",
    "Vacation_Camp":            "vacationcamp",
    "Periodical_Coaching_Camp": "coachingcamp",
}


async def _resolve_type_id(t: Dict[str, Any]) -> str:
    """Best-effort mapping from a tournament doc to a wiring type_id."""
    # 1. Try Tournament Master Registry via tournament_type_code
    code = t.get("tournament_type_code")
    if code:
        master = await db.tournament_master.find_one({"id": code}, {"category": 1, "_id": 0})
        if not master:
            # tournament_type_code sometimes stores a slug-like name; try by name too
            master = await db.tournament_master.find_one({"name": code}, {"category": 1, "_id": 0})
        if master and master.get("category") in _CATEGORY_TO_TYPE:
            return _CATEGORY_TO_TYPE[master["category"]]

    # 2. Pre-Tournament Camp — the Camps collection links back to a parent Inter-Div tournament
    if t.get("is_pre_tournament_camp") or t.get("parent_tournament_id"):
        return "camp"

    # 3. Tournament type flag → BCCI shortcut
    if t.get("tournament_type") == "BCCI":
        return "bcci"

    # 4. Scope-based fallback
    scope = t.get("scope") or ""
    return _SCOPE_TO_TYPE.get(scope, "interdiv")


# ─────────────── Live state fetchers (kept small; each ~1 count query) ───────────────

async def _gather_state(tid: str, t: Dict[str, Any]) -> Dict[str, Any]:
    setup_meta = t.get("setup_meta") or {}
    pools = (setup_meta.get("division_pools") or []) + (setup_meta.get("district_pools") or [])
    pools_set = len(pools) > 0 or bool(setup_meta.get("teams")) or bool(setup_meta.get("pools"))

    officials_count = await db.tournament_match_officials.count_documents({"tournament_id": tid})
    officials_set   = officials_count > 0

    squads = await db.squads.find({"tournament_id": tid}, {"submission_status": 1, "members": 1, "_id": 0}).to_list(length=200)
    squads_with_members = [s for s in squads if (s.get("members") or [])]
    squad_started  = bool(squads_with_members)
    squad_approved = bool(squads_with_members) and all(
        (s.get("submission_status") or "Draft") == "Approved" for s in squads_with_members
    )

    match_count     = await db.tournament_matches.count_documents({"tournament_id": tid})
    calendar_set    = match_count > 0 or bool(t.get("calendar_fixed"))

    ub_snap = t.get("unified_budget_snapshot") or {}
    budget_locked = bool(ub_snap.get("is_locked"))
    budget_set    = bool(ub_snap) or budget_locked

    claim = await db.reimbursement_claims.find_one(
        {"tournament_id": tid}, {"status": 1, "_id": 0}, sort=[("created_at", -1)]
    )
    claim_submitted = bool(claim and claim.get("status") in ("Submitted", "Under_Review", "Approved", "Rejected"))
    claim_approved  = bool(claim and claim.get("status") in ("Approved",))
    claim_paid = False
    if claim_approved:
        # any receipt against this tournament indicates payout began
        receipt_hit = await db.tournament_receipts.count_documents({"tournament_id": tid})
        claim_paid = receipt_hit > 0

    status = t.get("status", "Draft")

    return {
        "created":         True,
        "pools_set":       pools_set,
        "officials_set":   officials_set,
        "squad_started":   squad_started,
        "squad_approved":  squad_approved,
        "calendar_set":    calendar_set,
        "budget_set":      budget_set,
        "budget_locked":   budget_locked,
        "claim_submitted": claim_submitted,
        "claim_approved":  claim_approved,
        "claim_paid":      claim_paid,
        "match_count":     match_count,
        "officials_count": officials_count,
        "tournament_status": status,
        "acceptance_status": (t.get("acceptance") or {}).get("status") or "Not_Required",
    }


# ─────────────── Status derivation per step, per type ───────────────

# Each setup box on the Tournament Detail workspace has a data-testid — the
# ribbon dots link to these anchors so clicking a dot scrolls to that box.
_ANCHOR = {
    "tournament_creation":    "trn-header",
    "pool_basics":            "box-basics",
    "match_official_posting": "box-officials",
    "squad":                  "box-squads",
    "squad_approval":         "box-squads",
    "match_calendar":         "box-calendar",
    "unified_budget":         "box-unified-budget",
    "finance_console":        "box-finance",
    "mpca_visibility":        "trn-header",
}


def _derive_status(step_key: str, cell: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    """Return status ∈ {done, current, pending, na, info}, plus a short note."""
    flag = cell.get("flag")
    if flag == "NA":
        return {"status": "na",   "note": cell.get("text") or "Not applicable"}
    if flag == "INFO":
        # Info steps show what MPCA sees — surface visibility rule directly
        vis = cell.get("visibility")
        note = "Realtime to MPCA" if vis == "Realtime" else "Visible on claim submission" if vis == "On_Submit" else "Not shared with MPCA"
        return {"status": "info", "note": note}

    # Mandatory / Optional — derive from live state
    done, current_note = False, None
    if step_key == "tournament_creation":
        done = state["created"]
    elif step_key == "pool_basics":
        done = state["pools_set"]
    elif step_key == "match_official_posting":
        done = state["officials_set"]
        current_note = f"{state['officials_count']} posted" if state["officials_count"] else None
    elif step_key == "squad":
        done = state["squad_started"] or state["squad_approved"]
    elif step_key == "squad_approval":
        done = state["squad_approved"]
    elif step_key == "match_calendar":
        done = state["calendar_set"]
        current_note = f"{state['match_count']} fixtures" if state["match_count"] else None
    elif step_key == "unified_budget":
        done = state["budget_locked"] or state["budget_set"]
        current_note = "Locked" if state["budget_locked"] else ("Draft" if state["budget_set"] else None)
    elif step_key == "finance_console":
        done = state["claim_paid"]
        if state["claim_paid"]:
            current_note = "Paid"
        elif state["claim_approved"]:
            current_note = "Approved · awaiting UTR"
        elif state["claim_submitted"]:
            current_note = "Under MPCA review"

    if done:
        return {"status": "done", "note": current_note or cell.get("text") or "Complete"}
    return {"status": "pending", "note": current_note or cell.get("text") or ""}


def _mark_current(step_infos: List[Dict[str, Any]]) -> None:
    """The first pending Mandatory step becomes 'current' (highlight pulse)."""
    for si in step_infos:
        if si["flag"] == "M" and si["status"] == "pending":
            si["status"] = "current"
            return


# ─────────────── Route ───────────────

@api_router.get("/tournaments/{tid}/wiring-status")
async def get_tournament_wiring_status(tid: str):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    wiring = await _fetch_or_seed_wiring()
    type_id = await _resolve_type_id(t)
    type_meta = next((x for x in wiring["types"] if x["id"] == type_id), wiring["types"][0])

    state = await _gather_state(tid, t)
    cells_for_type = wiring["cells"].get(type_id, {})

    steps_out: List[Dict[str, Any]] = []
    for s in wiring["steps"]:
        cell = cells_for_type.get(s["key"], {})
        derived = _derive_status(s["key"], cell, state)
        steps_out.append({
            "key":         s["key"],
            "label":       s["label"],
            "bucket":      s["bucket"],
            "flag":        cell.get("flag"),
            "owner":       cell.get("owner"),
            "approver":    cell.get("approver"),
            "mode":        cell.get("mode"),
            "visibility":  cell.get("visibility"),
            "blocks_next": cell.get("blocks_next", False),
            "sla_days":    cell.get("sla_days"),
            "text":        cell.get("text"),
            "status":      derived["status"],
            "note":        derived["note"],
            "anchor":      _ANCHOR.get(s["key"], "trn-header"),
        })

    _mark_current(steps_out)

    # Overall progress fraction (Mandatory-only, done+current out of M-count)
    m_steps = [s for s in steps_out if s["flag"] == "M"]
    done_m  = [s for s in m_steps if s["status"] == "done"]
    progress_pct = round(100 * len(done_m) / max(1, len(m_steps)))

    return {
        "tournament_id":   tid,
        "type_id":         type_id,
        "type_name":       type_meta.get("name"),
        "type_sub":        type_meta.get("sub"),
        "wiring_version":  wiring.get("version"),
        "progress_pct":    progress_pct,
        "steps":           steps_out,
    }
