"""MPCA-216 · Sprint 2 · Unified per-match budget compute engine.

Pure Python port of the MPCA Inter-Division Utility HTML (v20). Given a rate
card + pools + matches, returns the exact rollup the utility produces.

Design contract (verbatim from HTML utility):
    span_days(m)          = to - from + 1 (inclusive)
    match_days(m)         = min(actualDays, span_days)  when actualDays valid
    shortfall_days(m)     = span_days - match_days
    gap_map(matches)      = per-match NMD from calendar gap immediately before
                            the match's first day (1 for the first, larger
                            for later rounds).
    effective_nmd(m, gap) = manual override else gap[m.id] + shortfall_days

For each match, for each of the 17 BUDGET_HEADS:
    if head.basis == "Match":
        head_amount = rate.md × qty × 1   (once per match)
    else:
        head_amount = rate.md × qty × MatchDays + rate.nmd × qty × NonMatchDays

Drivers:
    AwayTeamPax        → squad × (teams_playing - host_playing_flag)
    HostTeamPax        → squad × host_playing_flag
    MatchOfficialsPax  → count of assigned officials (umpires + scorers + selectors + observers)
    AllPax             → host_pax + away_pax + officials + other_pax
    TeamCount          → number of teams (default 2 — for conveyance)
    HostTeamCount      → 1 if host plays, else 0 (for coach/manager/trainer)
    None (flat)        → 1

Rooms rule (head.rooms == True): qty = ceil(driver_value / 2).

Travel grant is a separate compute — implemented in `compute_travel_grant`.
"""
from datetime import date
from math import ceil
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from core.infra import api_router, db
from models import BUDGET_HEADS_META, TRAVEL_HEADS_META


# ─────────────────── Date helpers ───────────────────

def _parse_iso(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        y, m, d = s.split("T")[0].split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _day_ordinal(d: Optional[date]) -> Optional[int]:
    if d is None:
        return None
    return d.toordinal()


def _from_date(m: Dict[str, Any]) -> Optional[date]:
    """Read the match start date from any of the supported fixture shapes."""
    return _parse_iso(m.get("from_date") or m.get("from") or m.get("scheduled_date") or m.get("match_date"))


def _to_date(m: Dict[str, Any]) -> Optional[date]:
    """Read the match end date; falls back to `scheduled_date + days - 1`."""
    t = _parse_iso(m.get("to_date") or m.get("to"))
    if t:
        return t
    f = _from_date(m)
    if not f:
        return None
    try:
        d = int(m.get("days") or 1)
    except (TypeError, ValueError):
        d = 1
    if d < 1:
        d = 1
    return date.fromordinal(f.toordinal() + d - 1)


def span_days(m: Dict[str, Any]) -> int:
    """Inclusive day count between from_date and to_date."""
    f = _from_date(m)
    t = _to_date(m)
    if not f or not t or t < f:
        return 0
    return (t - f).days + 1


def match_days(m: Dict[str, Any]) -> int:
    """Actual days played (multi-day matches may end early)."""
    span = span_days(m)
    if not span:
        return 0
    ad = m.get("actual_days")
    if ad is None or ad == "":
        return span
    try:
        adi = int(ad)
    except (TypeError, ValueError):
        return span
    if adi > 0 and adi <= span:
        return adi
    return span


def shortfall_days(m: Dict[str, Any]) -> int:
    return max(span_days(m) - match_days(m), 0)


def gap_map(matches: List[Dict[str, Any]]) -> Dict[str, int]:
    """For each match, NMD gap immediately before its first playing day.

    First match (no earlier playing day) → 1 (arrival day).
    Later matches → `from_day - last_previous_playing_day - 1`.
    """
    valid = [m for m in matches if span_days(m) > 0]
    playing: set = set()
    for m in valid:
        f = _from_date(m)
        t = _to_date(m)
        for x in range(f.toordinal(), t.toordinal() + 1):
            playing.add(x)
    sorted_days = sorted(playing)
    gap: Dict[str, int] = {}
    for m in valid:
        f_ord = _from_date(m).toordinal()
        prev = None
        for p in sorted_days:
            if p < f_ord:
                prev = p
            else:
                break
        gap[m.get("id") or m.get("_id") or str(id(m))] = 1 if prev is None else max(f_ord - prev - 1, 0)
    return gap


def effective_nmd(m: Dict[str, Any], gap: Dict[str, int]) -> int:
    """Manual override (`nmd_manual`) else gap + shortfall."""
    manual = m.get("nmd_manual")
    if manual is not None and manual != "":
        try:
            base = max(int(manual), 0)
        except (TypeError, ValueError):
            base = gap.get(m.get("id") or "", 0)
    else:
        base = gap.get(m.get("id") or "", 0)
    return base + shortfall_days(m)


# ─────────────────── Driver helpers ───────────────────

def _pool_of_match(m: Dict[str, Any], pools: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    pid = m.get("pool_id") or m.get("poolId")
    if not pid:
        return None
    for p in pools:
        if p.get("id") == pid:
            return p
    return None


def _team_pax(m: Dict[str, Any], default_squad: int) -> int:
    """Per-match squad override (`squad`) else tournament default."""
    q = m.get("squad")
    if q is None or q == "":
        return int(default_squad or 18)
    try:
        return max(int(q), 0)
    except (TypeError, ValueError):
        return int(default_squad or 18)


def host_away_pax(m: Dict[str, Any], pool: Optional[Dict[str, Any]], default_squad: int) -> Dict[str, Any]:
    """Compute host / away pax counts and team-count flags for a match."""
    sq = _team_pax(m, default_squad)
    sides = [s for s in [
        m.get("team_a") or m.get("teamA") or m.get("home_team"),
        m.get("team_b") or m.get("teamB") or m.get("away_team"),
    ] if s]
    n = len(sides) or 2
    host_code = pool.get("host_division_code") or pool.get("host_district_code") if pool else None
    host_playing = bool(host_code and host_code in sides)
    return {
        "host": sq if host_playing else 0,
        "away": sq * (n - 1) if host_playing else sq * n,
        "host_name": host_code,
        "host_playing": host_playing,
        "n": n,
        "host_count": 1 if host_playing else 0,
    }


def officials_count(m: Dict[str, Any]) -> int:
    """Total officials assigned to this match — umpires + scorers + selectors + observers.

    Supports THREE shapes:
      1. `officials`: {umpires: [...], scorers: [...], selectors: [...], observers: [...]}
         — HTML utility shape.
      2. `officials_ids`: same buckets — future frontend shape.
      3. `officials`: [{role: 'Umpire_On_Field_1', name: '...'}, ...]
         — legacy `MatchOfficialAllocation` list (default in ERP fixtures).
    """
    off = m.get("officials") or m.get("officials_ids") or []
    if isinstance(off, dict):
        return sum(len(off.get(k) or []) for k in ("umpires", "scorers", "selectors", "observers"))
    if isinstance(off, list):
        # Count only roles that map to the HTML utility's 4 buckets.
        count = 0
        for row in off:
            role = str(row.get("role") or "").lower()
            if any(role.startswith(prefix) for prefix in ("umpire", "scorer", "selector", "observer", "match_referee")):
                count += 1
        return count
    return 0


def driver_qty(m: Dict[str, Any], driver: Optional[str], pool: Optional[Dict[str, Any]], default_squad: int) -> int:
    """Driver → per-match quantity. Faithful to HTML utility semantics
    (TeamCount uses `n` — matches actually playing)."""
    pax = host_away_pax(m, pool, default_squad)
    off = officials_count(m)
    other = int(m.get("other_pax") or m.get("otherPax") or 0)
    if driver is None:
        return 1
    if driver == "AwayTeamPax":
        return pax["away"]
    if driver == "HostTeamPax":
        return pax["host"]
    if driver == "MatchOfficialsPax":
        return off
    if driver == "AllPax":
        return pax["host"] + pax["away"] + off + other
    if driver == "TeamCount":
        return pax["n"]
    if driver == "HostTeamCount":
        return pax["host_count"]
    return 1


def derived_qty(m: Dict[str, Any], head: Dict[str, Any], pool: Optional[Dict[str, Any]], default_squad: int) -> int:
    if head.get("basis") == "Match":
        return 1
    q = driver_qty(m, head.get("driver"), pool, default_squad)
    if head.get("rooms"):
        q = ceil(q / 2)
    return int(q)


# ─────────────────── Main compute ───────────────────

def compute_tournament_budget(
    matches: List[Dict[str, Any]],
    pools: List[Dict[str, Any]],
    rate_card: Dict[str, Any],
    default_squad: int = 18,
) -> Dict[str, Any]:
    """Roll up head totals + per-match totals + host/pool totals + grand.

    `rate_card` is expected to be a `RateCard` dict with `budget_rates` shape:
        {"hotel_team": {"md": 1800, "nmd": 1800}, ...}
    """
    budget_rates = rate_card.get("budget_rates") or {}
    valid_matches = [m for m in matches if match_days(m) > 0]
    gap = gap_map(valid_matches)

    head_totals: Dict[str, Dict[str, float]] = {h["key"]: {"md_amount": 0.0, "nmd_amount": 0.0} for h in BUDGET_HEADS_META}
    match_rows: List[Dict[str, Any]] = []
    pool_totals: Dict[str, Dict[str, float]] = {}

    for m in valid_matches:
        md = match_days(m)
        nmd = effective_nmd(m, gap)
        pool = _pool_of_match(m, pools)
        m_md_amt = 0.0
        m_nmd_amt = 0.0
        per_head_this_match: Dict[str, Dict[str, float]] = {}
        for h in BUDGET_HEADS_META:
            r = budget_rates.get(h["key"]) or {"md": 0, "nmd": 0}
            qty = derived_qty(m, h, pool, default_squad)
            if h.get("basis") == "Match":
                md_amt = float(r.get("md", 0) or 0) * qty
                nmd_amt = 0.0
            else:
                md_amt = float(r.get("md", 0) or 0) * qty * md
                nmd_amt = float(r.get("nmd", 0) or 0) * qty * nmd
            head_totals[h["key"]]["md_amount"] += md_amt
            head_totals[h["key"]]["nmd_amount"] += nmd_amt
            m_md_amt += md_amt
            m_nmd_amt += nmd_amt
            per_head_this_match[h["key"]] = {"qty": qty, "md_amount": md_amt, "nmd_amount": nmd_amt}

        row = {
            "id": m.get("id"),
            "label": m.get("label") or m.get("round") or m.get("match_no"),
            "type": m.get("type") or m.get("match_type"),
            "team_a": m.get("team_a") or m.get("teamA") or m.get("home_team"),
            "team_b": m.get("team_b") or m.get("teamB") or m.get("away_team"),
            "pool_id": m.get("pool_id") or m.get("poolId"),
            "pool_name": pool.get("name") if pool else None,
            "from_date": (_from_date(m).isoformat() if _from_date(m) else None),
            "to_date": (_to_date(m).isoformat() if _to_date(m) else None),
            "match_days": md,
            "non_match_days": nmd,
            "nmd_manual": m.get("nmd_manual"),
            "nmd_auto": gap.get(m.get("id") or "", 0),
            "shortfall_days": shortfall_days(m),
            "officials_count": officials_count(m),
            "other_pax": int(m.get("other_pax") or 0),
            "md_amount": m_md_amt,
            "nmd_amount": m_nmd_amt,
            "total": m_md_amt + m_nmd_amt,
            "per_head": per_head_this_match,
        }
        match_rows.append(row)

        # Pool/host rollup
        pkey = row["pool_id"] or "__no_pool__"
        if pkey not in pool_totals:
            pool_totals[pkey] = {
                "pool_id": row["pool_id"],
                "pool_name": row["pool_name"],
                "host_code": (pool.get("host_division_code") or pool.get("host_district_code")) if pool else None,
                "md_amount": 0.0,
                "nmd_amount": 0.0,
                "match_count": 0,
                "total": 0.0,
            }
        pool_totals[pkey]["md_amount"] += m_md_amt
        pool_totals[pkey]["nmd_amount"] += m_nmd_amt
        pool_totals[pkey]["match_count"] += 1
        pool_totals[pkey]["total"] = pool_totals[pkey]["md_amount"] + pool_totals[pkey]["nmd_amount"]

    tot_md = sum(r["md_amount"] for r in match_rows)
    tot_nmd = sum(r["nmd_amount"] for r in match_rows)

    return {
        "format_group": rate_card.get("format_group"),
        "tournament_type": rate_card.get("tournament_type"),
        "match_count": len(valid_matches),
        "head_totals": [
            {
                "key": h["key"],
                "name": h["name"],
                "owner": h["owner"],
                "md_amount": head_totals[h["key"]]["md_amount"],
                "nmd_amount": head_totals[h["key"]]["nmd_amount"],
                "total": head_totals[h["key"]]["md_amount"] + head_totals[h["key"]]["nmd_amount"],
            }
            for h in BUDGET_HEADS_META
        ],
        "match_rows": match_rows,
        "pool_totals": list(pool_totals.values()),
        "total_md_amount": tot_md,
        "total_nmd_amount": tot_nmd,
        "grand_total": tot_md + tot_nmd,
    }


# ─────────────────── Travel-grant compute ───────────────────

def compute_travel_grant(
    matches: List[Dict[str, Any]],
    pools: List[Dict[str, Any]],
    rate_card: Dict[str, Any],
    default_squad: int = 18,
    trip_overrides: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """One trip per visiting division per pool host. Host of the pool doesn't
    travel to it. Mirrors utility's `computeTravel` behaviour."""
    trip_overrides = trip_overrides or {}
    travel_rates = rate_card.get("travel_rates") or {}
    trips: List[Dict[str, Any]] = []

    for p in pools:
        pool_matches = [m for m in matches if (m.get("pool_id") or m.get("poolId")) == p.get("id")]
        divs: set = set()
        for m in pool_matches:
            a = m.get("team_a") or m.get("teamA") or m.get("home_team")
            b = m.get("team_b") or m.get("teamB") or m.get("away_team")
            if a: divs.add(a)
            if b: divs.add(b)
        host_code = p.get("host_division_code") or p.get("host_district_code")
        for div in divs:
            if div == host_code:
                continue
            dm = [m for m in pool_matches if (m.get("team_a") or m.get("teamA") or m.get("home_team")) == div or (m.get("team_b") or m.get("teamB") or m.get("away_team")) == div]
            dm = [m for m in dm if match_days(m) > 0]
            if not dm:
                continue
            dm.sort(key=lambda m: (_parse_iso(m.get("from_date") or m.get("from")) or date.min).toordinal())
            dm_md = sum(match_days(m) for m in dm)
            # 1 arrival day before first match + gaps between consecutive matches
            dm_nmd = 1
            for i in range(1, len(dm)):
                prev_to = _parse_iso(dm[i-1].get("to_date") or dm[i-1].get("to"))
                curr_from = _parse_iso(dm[i].get("from_date") or dm[i].get("from"))
                if prev_to and curr_from:
                    dm_nmd += max((curr_from - prev_to).days - 1, 0)
            trip_id = f"{div}|{p.get('id')}"
            ov = trip_overrides.get(trip_id) or {}
            pax = int(ov.get("pax") if ov.get("pax") not in (None, "") else default_squad)
            md = int(ov.get("md") if ov.get("md") not in (None, "") else dm_md)
            nmd = int(ov.get("nmd") if ov.get("nmd") not in (None, "") else dm_nmd)
            heads: Dict[str, float] = {}
            total = 0.0
            for h in TRAVEL_HEADS_META:
                r = travel_rates.get(h["key"]) or {"md": 0, "nmd": 0}
                if h["basis"] == "trip_pax":
                    amt = float(r.get("md", 0) or 0) * pax
                elif h["basis"] == "trip":
                    amt = float(r.get("md", 0) or 0)
                else:  # "day"
                    amt = float(r.get("md", 0) or 0) * md + float(r.get("nmd", 0) or 0) * nmd
                heads[h["key"]] = amt
                total += amt
            trips.append({
                "id": trip_id,
                "division": div,
                "pool_id": p.get("id"),
                "pool_name": p.get("name"),
                "host_code": host_code,
                "match_days": md,
                "non_match_days": nmd,
                "pax": pax,
                "matches": len(dm),
                "heads": heads,
                "total": total,
            })

    by_head: Dict[str, float] = {h["key"]: 0.0 for h in TRAVEL_HEADS_META}
    by_division: Dict[str, Dict[str, Any]] = {}
    grand = 0.0
    for tr in trips:
        for k, v in tr["heads"].items():
            by_head[k] += v
        d = tr["division"]
        if d not in by_division:
            by_division[d] = {"division": d, "trips": 0, "total": 0.0}
        by_division[d]["trips"] += 1
        by_division[d]["total"] += tr["total"]
        grand += tr["total"]

    return {
        "trips": trips,
        "by_head": [{"key": k, "total": v} for k, v in by_head.items()],
        "by_division": list(by_division.values()),
        "grand_total": grand,
    }


# ─────────────────── API endpoints ───────────────────

def _format_group_from_tournament(t: Dict[str, Any]) -> str:
    """Collapse the 16 tournament formats down to `ltd_overs` / `multi_day`."""
    fmt = (t.get("format") or "").lower()
    if any(k in fmt for k in ("multi", "fourday", "pink")):
        return "multi_day"
    return "ltd_overs"


def _tournament_type_key(t: Dict[str, Any]) -> str:
    """Best-effort map from Tournament.scope/tournament_type to a rate-card key."""
    scope = t.get("scope") or ""
    if scope == "Inter_Divisional":
        return "Inter_Divisional"
    if scope == "Inter_District":
        return "Inter_District"
    if scope == "Championship":
        return "Championship"
    tt = t.get("tournament_type") or ""
    if "BCCI" in tt:
        return "BCCI"
    if "Camp" in tt or "Pre_Tournament" in tt:
        return "Pre_Tournament_Camp"
    return "Inter_Divisional"


async def _load_rate_card_for_tournament(t: Dict[str, Any]) -> Dict[str, Any]:
    tt = _tournament_type_key(t)
    fg = _format_group_from_tournament(t)
    season = t.get("fiscal_cycle") or "2026-27"
    card = await db.rate_cards.find_one(
        {"tournament_type": tt, "format_group": fg, "season": season},
        {"_id": 0},
    )
    if not card:
        # Fallback to any season if season-specific missing
        card = await db.rate_cards.find_one(
            {"tournament_type": tt, "format_group": fg},
            {"_id": 0},
        )
    if not card:
        raise HTTPException(404, f"No rate card configured for {tt}/{fg}/{season}")
    return card


@api_router.get("/tournaments/{tid}/days-engine")
async def days_engine_for_tournament(tid: str):
    """MPCA-217 · Days-Engine — headless payload for the calendar / MD/NMD tiles.

    Returns:
      • `matches`: one row per fixture with from/to, MD, NMD (auto), shortfall,
        NMD manual override, officials count, other_pax.
      • `calendar`: date → status ("MD" | "NMD" | "idle") for every day of the
        tournament window.
      • `totals`: {match_days, non_match_days_auto, non_match_days_effective, days_span}.
      • `overrides_used`: number of matches with a manual NMD override.

    Read-only — no rate lookup / no rupees. Used by the tab UI.
    """
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    # MPCA-217 · Read from `tournament_matches` (Match Calendar UI) — with a
    # fallback merge of `fixtures` for legacy pre-migration data.
    matches: List[Dict[str, Any]] = []
    async for m in db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(m)
    async for f in db.fixtures.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(f)
    valid = [m for m in matches if span_days(m) > 0]
    gap = gap_map(valid)

    rows: List[Dict[str, Any]] = []
    tot_md = 0
    tot_nmd_auto = 0
    tot_nmd_eff = 0
    overrides = 0
    playing_days: set = set()

    for m in valid:
        md = match_days(m)
        nmd_eff = effective_nmd(m, gap)
        nmd_auto = gap.get(m.get("id") or "", 0) + shortfall_days(m)
        if m.get("nmd_manual") is not None and m.get("nmd_manual") != "":
            overrides += 1
        rows.append({
            "id": m.get("id"),
            "label": m.get("label") or m.get("round") or m.get("match_no"),
            "stage": m.get("stage"),
            "team_a": m.get("home_team") or m.get("team_a"),
            "team_b": m.get("away_team") or m.get("team_b"),
            "pool_id": m.get("pool_id"),
            "from_date": (_from_date(m).isoformat() if _from_date(m) else None),
            "to_date": (_to_date(m).isoformat() if _to_date(m) else None),
            "match_days": md,
            "non_match_days_auto": nmd_auto,
            "non_match_days_effective": nmd_eff,
            "nmd_manual": m.get("nmd_manual"),
            "shortfall_days": shortfall_days(m),
            "officials_count": officials_count(m),
            "other_pax": int(m.get("other_pax") or 0),
        })
        tot_md += md
        tot_nmd_auto += nmd_auto
        tot_nmd_eff += nmd_eff
        f = _from_date(m); ttd = _to_date(m)
        for x in range(f.toordinal(), ttd.toordinal() + 1):
            playing_days.add(x)

    # Calendar strip — all days between earliest and latest match
    calendar: List[Dict[str, Any]] = []
    if playing_days:
        lo = min(playing_days)
        hi = max(playing_days)
        for x in range(lo, hi + 1):
            calendar.append({
                "date": date.fromordinal(x).isoformat(),
                "status": "MD" if x in playing_days else "NMD",
            })

    return {
        "tournament_id": tid,
        "matches": rows,
        "calendar": calendar,
        "totals": {
            "match_days": tot_md,
            "non_match_days_auto": tot_nmd_auto,
            "non_match_days_effective": tot_nmd_eff,
            "days_span": len(calendar),
            "match_count": len(rows),
            "overrides_used": overrides,
        },
    }


@api_router.post("/tournaments/{tid}/unified-budget/compute")
async def compute_unified_budget_for_tournament(tid: str, save: bool = False):
    """Compute the unified per-match budget + travel grant for a tournament.

    Reads fixtures, pools (from setup_meta), and the rate card matching
    (tournament_type × format_group × season). If `save=true`, persists the
    snapshot under `tournaments.unified_budget_snapshot`.
    """
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    setup_meta = t.get("setup_meta") or {}
    pools = list(setup_meta.get("division_pools") or []) + list(setup_meta.get("district_pools") or [])
    # MPCA-217 · Read from tournament_matches (Match Calendar UI) + fixtures (legacy)
    matches: List[Dict[str, Any]] = []
    async for m in db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(m)
    async for f in db.fixtures.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(f)

    card = await _load_rate_card_for_tournament(t)
    default_squad = int(t.get("max_squad_size") or 18)

    trip_overrides = (t.get("trip_overrides") or {}) if isinstance(t.get("trip_overrides"), dict) else {}

    budget = compute_tournament_budget(matches, pools, card, default_squad=default_squad)
    travel = compute_travel_grant(matches, pools, card, default_squad=default_squad, trip_overrides=trip_overrides)

    snapshot = {
        "rate_card_id": card.get("id"),
        "tournament_type": card.get("tournament_type"),
        "format_group": card.get("format_group"),
        "budget": budget,
        "travel_grant": travel,
    }

    if save:
        from datetime import datetime, timezone
        await db.tournaments.update_one(
            {"id": tid},
            {"$set": {
                "unified_budget_snapshot": snapshot,
                "unified_budget_snapshot_at": datetime.now(timezone.utc).isoformat(),
            }},
        )

    return snapshot


@api_router.post("/rate-cards/{card_id}/compute-preview")
async def preview_compute_with_card(card_id: str, payload: Dict[str, Any]):
    """Test-harness — compute a budget with a rate card and a hand-crafted set
    of matches + pools. Used by pytests and the utility-preview UI."""
    card = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not card:
        raise HTTPException(404, "Rate card not found")
    matches = payload.get("matches") or []
    pools = payload.get("pools") or []
    default_squad = int(payload.get("default_squad") or 18)
    trip_overrides = payload.get("trip_overrides") or {}
    return {
        "budget": compute_tournament_budget(matches, pools, card, default_squad=default_squad),
        "travel_grant": compute_travel_grant(matches, pools, card, default_squad=default_squad, trip_overrides=trip_overrides),
    }


# ─────────────────── MPCA-221 · Trip Overrides + Legacy Migration ───────────────────

@api_router.patch("/tournaments/{tid}/travel-trip-overrides")
async def patch_trip_overrides(tid: str, payload: Dict[str, Any]):
    """MPCA-221 · Upsert per-trip override values (pax / md / nmd) on the
    tournament document. `payload` shape: `{ "<trip_id>": {"pax": 20, "md": 4, "nmd": 2} }`.

    Sending `null` for a trip_id clears its override. Sending `{}` for a
    trip_id also clears (all fields blank).
    """
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0, "trip_overrides": 1, "id": 1})
    if t is None:
        raise HTTPException(404, "Tournament not found")
    current = t.get("trip_overrides") or {}
    for trip_id, ov in (payload or {}).items():
        if ov is None or ov == {}:
            current.pop(trip_id, None)
        else:
            clean = {k: v for k, v in ov.items() if v not in (None, "") and k in ("pax", "md", "nmd")}
            if clean:
                current[trip_id] = clean
            else:
                current.pop(trip_id, None)
    await db.tournaments.update_one({"id": tid}, {"$set": {"trip_overrides": current}})
    return {"trip_overrides": current}


@api_router.post("/admin/migrate-legacy-budgets")
async def migrate_legacy_budgets(dry_run: bool = True):
    """MPCA-221 · One-off migration — for every Inter-Divisional and
    Inter-District tournament, run the unified engine and persist the
    snapshot under `unified_budget_snapshot`. Legacy scheme snapshots stay
    untouched under their existing keys (`budget_snapshot`).

    Returns a report so ops can see what would change before `dry_run=false`.
    """
    from datetime import datetime, timezone
    report: List[Dict[str, Any]] = []
    total_grand = 0.0
    q = {"scope": {"$in": ["Inter_Divisional", "Inter_District", "Championship"]}}
    async for t in db.tournaments.find(q, {"_id": 0}):
        try:
            setup_meta = t.get("setup_meta") or {}
            pools = list(setup_meta.get("division_pools") or []) + list(setup_meta.get("district_pools") or [])
            matches: List[Dict[str, Any]] = []
            async for m in db.tournament_matches.find({"tournament_id": t["id"]}, {"_id": 0}):
                matches.append(m)
            if not matches:
                report.append({"id": t["id"], "name": t.get("name"), "status": "skipped", "reason": "no matches"})
                continue
            card = await _load_rate_card_for_tournament(t)
            default_squad = int(t.get("max_squad_size") or 18)
            budget = compute_tournament_budget(matches, pools, card, default_squad=default_squad)
            travel = compute_travel_grant(matches, pools, card, default_squad=default_squad, trip_overrides=t.get("trip_overrides") or {})
            grand = float(budget.get("grand_total") or 0)
            total_grand += grand
            snapshot = {
                "rate_card_id": card.get("id"),
                "tournament_type": card.get("tournament_type"),
                "format_group": card.get("format_group"),
                "budget": budget,
                "travel_grant": travel,
            }
            entry = {"id": t["id"], "name": t.get("name"), "scope": t.get("scope"), "grand_total": grand, "match_count": budget.get("match_count", 0)}
            if not dry_run:
                await db.tournaments.update_one(
                    {"id": t["id"]},
                    {"$set": {
                        "unified_budget_snapshot": snapshot,
                        "unified_budget_snapshot_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                entry["status"] = "migrated"
            else:
                entry["status"] = "would-migrate"
            report.append(entry)
        except HTTPException as he:
            report.append({"id": t["id"], "name": t.get("name"), "status": "error", "reason": he.detail})
        except Exception as e:
            report.append({"id": t["id"], "name": t.get("name"), "status": "error", "reason": str(e)})
    return {
        "dry_run": dry_run,
        "tournaments_scanned": len(report),
        "would_migrate": sum(1 for r in report if r["status"] in ("would-migrate", "migrated")),
        "total_grand_inr": total_grand,
        "report": report,
    }
