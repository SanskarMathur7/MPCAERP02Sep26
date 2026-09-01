"""Feb 2026 · Tournament Player Eligibility Endpoint

Exposes a single endpoint that filters a body's player pool against the
tournament's `tournament_master` eligibility spec (DOB fenceposts, gender,
medical clearance).

    GET /api/tournaments/{tid}/eligible-players?body_code={CODE}
    → {
        tournament: {id, name, category, gender, age_grp, born_on_or_before,
                     born_on_or_after, medical_required, master_matched},
        counts: {total, eligible, ineligible},
        eligible: [Player, ...],
        ineligible: [{...Player, eligibility_reasons: [str, str, ...]}],
      }

The Squad Picker on `/squads/{sid}` consumes this endpoint to fade out
ineligible players (with a red "❌ over-age / wrong gender / medical
missing" chip) and to block "+ Pick" unless the caller is MPCA-State
(which retains an override).
"""
import re

from fastapi import HTTPException, Request

from core.infra import api_router, db
from core.scoping import body_scope, get_scope
from core.tournament_eligibility import check_player_for_tournament


async def _resolve_master(tournament: dict) -> dict | None:
    """Best-effort match: find the `tournament_master` row that governs this
    tournament's eligibility.

    Strategy (first hit wins):
      1. Exact case-insensitive name match within the tournament's category bucket.
      2. Exact case-insensitive short_name match within the bucket.
      3. Substring match on tournament.name.

    Category bucket is derived from tournament.scope:
      · Inter_Divisional     → tournament_master.category = "Inter_Divisional"
      · Inter_District       → "Inter_District"
      · Championship + BCCI  → "BCCI"
      Others → None (skip enforcement).
    """
    scope = (tournament.get("scope") or tournament.get("tournament_scope") or "").strip()
    t_type = (tournament.get("tournament_type") or "").strip()

    category = None
    if scope == "Inter_Divisional":
        category = "Inter_Divisional"
    elif scope == "Inter_District":
        category = "Inter_District"
    elif t_type == "BCCI":
        category = "BCCI"
    else:
        return None

    name = (tournament.get("name") or "").strip()
    if not name:
        return None

    q_base = {"category": category, "is_active": True}

    # 1. Exact name (case-insensitive)
    row = await db.tournament_master.find_one(
        {**q_base, "name": {"$regex": f"^{name}$", "$options": "i"}},
        {"_id": 0},
    )
    if row:
        return row

    # 2. Exact short_name
    row = await db.tournament_master.find_one(
        {**q_base, "short_name": {"$regex": f"^{name}$", "$options": "i"}},
        {"_id": 0},
    )
    if row:
        return row

    # 3. Substring on name (dropping trailing " · <cycle>" if present)
    trimmed = name.split(" · ")[0].strip()
    if trimmed and trimmed != name:
        row = await db.tournament_master.find_one(
            {**q_base, "name": {"$regex": f"^{trimmed}$", "$options": "i"}},
            {"_id": 0},
        )
        if row:
            return row

    return None


@api_router.get("/tournaments/{tid}/eligibility-spec")
async def eligibility_spec_for_tournament(tid: str):
    """Lightweight companion to /eligible-players — returns just the
    eligibility rules bound to this tournament (no player pool). Consumed
    by the Tournament Detail hero to render a compact "U-15 · Men · born
    on/before 2012-09-01 · medical req" badge before the user opens the
    squad picker.
    """
    tournament = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not tournament:
        raise HTTPException(404, "Tournament not found")
    master = await _resolve_master(tournament)
    return {
        "tournament_id": tid,
        "master_matched": master is not None,
        "master_id": (master or {}).get("id"),
        "master_name": (master or {}).get("name"),
        "gender": (master or {}).get("gender"),
        "age_grp": (master or {}).get("age_grp"),
        "play_type": (master or {}).get("play_type"),
        "born_on_or_before": (master or {}).get("born_on_or_before"),
        "born_on_or_after": (master or {}).get("born_on_or_after"),
        "medical_required": bool((master or {}).get("medical_required")),
        "max_guest_mp_domicile": (master or {}).get("max_guest_mp_domicile"),
        "max_guest_education": (master or {}).get("max_guest_education"),
        "max_guest_out_of_mp": (master or {}).get("max_guest_out_of_mp"),
    }


@api_router.get("/tournaments/{tid}/eligible-players")
async def eligible_players_for_tournament(
    tid: str,
    request: Request,
    body_code: str | None = None,
    limit: int = 5000,
):
    """Return the body's player pool split into eligible / ineligible for
    this tournament based on the linked `tournament_master` row.

    · If no master row can be resolved (e.g. non-InterDiv types), every
      player is returned as eligible with `master_matched: false` — the UI
      then simply skips the eligibility ribbon.
    · When `body_code` is omitted, defaults to the caller's persona body
      (falls back to a State-scope wide list).
    """
    tournament = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not tournament:
        raise HTTPException(404, "Tournament not found")

    master = await _resolve_master(tournament)

    # Build player pool query — respect requested body_code, else use scope.
    query: dict = {}
    if body_code:
        # Match either exact body_id or body_id ending with body_code (division shorthand).
        # Escape the code so regex metachars in an odd body_code don't 500 the endpoint.
        query["$or"] = [{"body_id": body_code}, {"body_id": {"$regex": f"{re.escape(body_code)}$"}}]
    else:
        scope = get_scope(request)
        query.update(body_scope(scope))

    players = await db.players.find(query, {"_id": 0}).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))

    eligible: list = []
    ineligible: list = []
    for p in players:
        ok, reasons = check_player_for_tournament(p, master)
        if ok:
            eligible.append(p)
        else:
            ineligible.append({**p, "eligibility_reasons": reasons})

    return {
        "tournament": {
            "id": tournament.get("id"),
            "name": tournament.get("name"),
            "scope": tournament.get("scope"),
            "tournament_type": tournament.get("tournament_type"),
            "master_matched": master is not None,
            "master_id": (master or {}).get("id"),
            "master_name": (master or {}).get("name"),
            "gender": (master or {}).get("gender"),
            "age_grp": (master or {}).get("age_grp"),
            "born_on_or_before": (master or {}).get("born_on_or_before"),
            "born_on_or_after": (master or {}).get("born_on_or_after"),
            "medical_required": bool((master or {}).get("medical_required")),
        },
        "counts": {
            "total": len(players),
            "eligible": len(eligible),
            "ineligible": len(ineligible),
        },
        "eligible": eligible,
        "ineligible": ineligible,
    }
