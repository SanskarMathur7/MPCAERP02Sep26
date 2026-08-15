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
    # MPCA-222 · Manual driver override takes precedence when present
    overrides = m.get("driver_overrides") or {}
    if head["key"] in overrides and overrides[head["key"]] not in (None, ""):
        try:
            return max(int(overrides[head["key"]]), 0)
        except (TypeError, ValueError):
            pass
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
    # MPCA-224 · Apply head_meta_overrides (name / driver / owner / rooms /
    # basis) to the 17 default heads BEFORE iterating.
    meta_overrides = rate_card.get("head_meta_overrides") or {}
    default_heads_effective = [
        {**h, **{k: v for k, v in (meta_overrides.get(h["key"]) or {}).items() if v is not None or k in ("driver",)}}
        for h in BUDGET_HEADS_META
    ]
    # MPCA-223 · Include custom heads (MPCA-added line items) alongside the
    # 17 default heads. Custom heads are stored on the rate card and follow
    # the same {key, name, driver, rooms, basis, owner} shape.
    all_heads = default_heads_effective + list(rate_card.get("custom_heads") or [])
    valid_matches = [m for m in matches if match_days(m) > 0]
    gap = gap_map(valid_matches)

    head_totals: Dict[str, Dict[str, float]] = {h["key"]: {"md_amount": 0.0, "nmd_amount": 0.0} for h in all_heads}
    match_rows: List[Dict[str, Any]] = []
    pool_totals: Dict[str, Dict[str, float]] = {}

    for m in valid_matches:
        md = match_days(m)
        nmd = effective_nmd(m, gap)
        pool = _pool_of_match(m, pools)
        m_md_amt = 0.0
        m_nmd_amt = 0.0
        per_head_this_match: Dict[str, Dict[str, float]] = {}
        for h in all_heads:
            r = budget_rates.get(h["key"]) or {"md": 0, "nmd": 0}
            qty = derived_qty(m, h, pool, default_squad)
            overrides = m.get("driver_overrides") or {}
            is_override = h["key"] in overrides and overrides[h["key"]] not in (None, "")
            # Auto-computed qty (for the "reset" button on the frontend)
            auto_head = {**h, "key": h["key"]}
            auto_q = 1 if h.get("basis") == "Match" else driver_qty(m, h.get("driver"), pool, default_squad)
            if h.get("rooms") and h.get("basis") != "Match":
                auto_q = ceil(auto_q / 2)
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
            per_head_this_match[h["key"]] = {
                "qty": qty,
                "auto_qty": int(auto_q),
                "is_override": is_override,
                "md_rate": float(r.get("md", 0) or 0),
                "nmd_rate": float(r.get("nmd", 0) or 0),
                "md_amount": md_amt,
                "nmd_amount": nmd_amt,
                "driver": h.get("driver"),
                "rooms": h.get("rooms", False),
                "basis": h.get("basis"),
            }

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

    # MPCA-225/233 · Owner-attributed per-body-per-pool rollup — feeds Finance Console.
    # Attribution rules (evaluated per match, tagged with its pool):
    #   • Host  owner heads   → (host body, pool)
    #   • Officials heads     → (host body, pool)
    #   • Common heads (MOM)  → (MPCA, pool)
    #   • Visitor heads       → (away team, pool)
    # A Division that is Host in one pool AND Visitor in another gets TWO separate
    # rows so Finance Console can materialise TWO independent TournamentBudget docs.
    by_body: Dict[str, Dict[str, Any]] = {}   # key = f"{body_code}|{pool_id or ''}"
    by_body_heads: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def _row_key(code: str, pool_id: Optional[str]) -> str:
        return f"{code}|{pool_id or ''}"

    def _bump(code: str, pool_id: Optional[str], pool_name: Optional[str], role: str, key: str, amt: float):
        if not code:
            return
        rk = _row_key(code, pool_id)
        if rk not in by_body:
            by_body[rk] = {
                "body_code": code, "pool_id": pool_id, "pool_name": pool_name, "role": role,
                "budget": 0.0, "travel_grant": 0.0, "total": 0.0,
            }
        by_body[rk][key] = by_body[rk].get(key, 0.0) + amt
        by_body[rk]["total"] = by_body[rk].get("budget", 0.0) + by_body[rk].get("travel_grant", 0.0)

    def _bump_head(code: str, pool_id: Optional[str], head_key: str, head_name: str, owner: str, amt: float):
        if not code or amt == 0:
            return
        rk = _row_key(code, pool_id)
        by_body_heads.setdefault(rk, {})
        row = by_body_heads[rk].setdefault(head_key, {
            "head_key": head_key, "head": head_name, "owner": owner, "limit_inr": 0.0,
        })
        row["limit_inr"] = float(row.get("limit_inr", 0.0)) + float(amt)

    # Build a match→pool→host cache
    for m in valid_matches:
        pool = _pool_of_match(m, pools)
        host_code = (pool.get("host_division_code") or pool.get("host_district_code")) if pool else None
        pool_id = (pool.get("id") or pool.get("pool_id")) if pool else None
        pool_name = (pool.get("name") or pool.get("pool_name")) if pool else None
        team_a = m.get("team_a") or m.get("teamA") or m.get("home_team")
        team_b = m.get("team_b") or m.get("teamB") or m.get("away_team")
        away_code = team_b if host_code == team_a else team_a
        for h in all_heads:
            per = next((mr["per_head"].get(h["key"]) for mr in match_rows if mr["id"] == m.get("id")), None)
            if not per:
                continue
            amt = float(per.get("md_amount", 0) or 0) + float(per.get("nmd_amount", 0) or 0)
            if amt == 0:
                continue
            owner = h.get("owner", "Common")
            target = None
            role = None
            if owner == "Host":
                target, role = host_code, "Host"
            elif owner == "Officials":
                target, role = host_code, "Host"
            elif owner == "Common":
                target, role = "MPCA", "Common"
            elif owner == "Visitor":
                target, role = away_code, "Visitor"
            if target:
                _bump(target, pool_id, pool_name, role, "budget", amt)
                _bump_head(target, pool_id, h["key"], h["name"], owner, amt)

    # MPCA-226/233 · Attach per-(body,pool) head allocations onto by_body rows
    for rk, row in by_body.items():
        row["head_allocations"] = list(by_body_heads.get(rk, {}).values())

    return {
        "format_group": rate_card.get("format_group"),
        "tournament_type": rate_card.get("tournament_type"),
        "match_count": len(valid_matches),
        "head_totals": [
            {
                "key": h["key"],
                "name": h["name"],
                "owner": h.get("owner", "Common"),
                "is_custom": bool(h.get("is_custom")),
                "md_amount": head_totals[h["key"]]["md_amount"],
                "nmd_amount": head_totals[h["key"]]["nmd_amount"],
                "total": head_totals[h["key"]]["md_amount"] + head_totals[h["key"]]["nmd_amount"],
            }
            for h in all_heads
        ],
        "match_rows": match_rows,
        "pool_totals": list(pool_totals.values()),
        "by_body_totals": list(by_body.values()),   # MPCA-225 · owner-attributed per body
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
            heads: List[Dict[str, Any]] = []
            total = 0.0
            for h in TRAVEL_HEADS_META:
                r = travel_rates.get(h["key"]) or {"md": 0, "nmd": 0}
                md_rate = float(r.get("md", 0) or 0)
                nmd_rate = float(r.get("nmd", 0) or 0)
                if h["basis"] == "trip_pax":
                    amt = md_rate * pax
                    calc = f"₹{md_rate:,.0f} × {pax} pax"
                elif h["basis"] == "trip":
                    amt = md_rate
                    calc = f"₹{md_rate:,.0f} (flat)"
                else:  # "day"
                    amt = md_rate * md + nmd_rate * nmd
                    calc = f"₹{md_rate:,.0f} × {md}md + ₹{nmd_rate:,.0f} × {nmd}nmd"
                heads.append({
                    "key": h["key"],
                    "name": h["name"],
                    "basis": h["basis"],
                    "md_rate": md_rate,
                    "nmd_rate": nmd_rate,
                    "amount": amt,
                    "calc": calc,
                })
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
        for h in tr["heads"]:
            by_head[h["key"]] += h["amount"]
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
            "home_team": m.get("home_team") or m.get("team_a"),
            "away_team": m.get("away_team") or m.get("team_b"),
            "ground_id": m.get("ground_id"),
            "ground_name": m.get("ground_name"),
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

    # MPCA-225/233 · Merge travel-grant per-Division-per-pool into by_body_totals.
    # Use `trips` (not by_division) because trips carry pool_id — critical when
    # a Division is Host in one pool and Visitor in another (they get 2 separate
    # TournamentBudget rows so they can accept/reject independently).
    body_map = {f"{b['body_code']}|{b.get('pool_id') or ''}": b for b in budget.get("by_body_totals") or []}
    for tr in (travel.get("trips") or []):
        code = tr.get("division")
        pool_id = tr.get("pool_id")
        pool_name = tr.get("pool_name")
        amt = float(tr.get("total", 0) or 0)
        rk = f"{code}|{pool_id or ''}"
        row = body_map.get(rk) or {"body_code": code, "pool_id": pool_id, "pool_name": pool_name, "role": "Visitor", "budget": 0.0, "travel_grant": 0.0, "total": 0.0, "head_allocations": []}
        row["travel_grant"] = row.get("travel_grant", 0.0) + amt
        row["total"] = row.get("budget", 0.0) + row.get("travel_grant", 0.0)
        allocs = list(row.get("head_allocations") or [])
        if amt > 0 and not any(a.get("head_key") == "travel_grant" for a in allocs):
            allocs.append({"head_key": "travel_grant", "head": "Travel Grant", "owner": "Visitor", "limit_inr": amt})
        row["head_allocations"] = allocs
        body_map[rk] = row
    budget["by_body_totals"] = list(body_map.values())

    # MPCA-239 · Merge Match Officials fees + DA as two synthetic heads.
    # Fees = per_day_fee_inr × scheduled_days (paid even on early conclusion).
    # DA   = per_day_da_inr  × actual_days   (only when match actually played).
    # Owner=Common → MPCA state books (not a Division claim).
    off_assigns = await db.tournament_match_officials.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    off_by_id = {a["official_id"]: a for a in off_assigns}
    off_fees_total = 0.0
    off_da_total = 0.0
    for m in matches:
        sched = int(m.get("days") or 1)
        actual = m.get("actual_days")
        actual = int(actual) if actual is not None else sched
        oi = m.get("officials_ids") or {}
        for role_key in ("umpires", "scorers", "selectors", "observers"):
            for oid in (oi.get(role_key) or []):
                a = off_by_id.get(oid) or {}
                off_fees_total += float(a.get("per_day_fee_inr") or 0) * sched
                off_da_total += float(a.get("per_day_da_inr") or 0) * actual

    if off_fees_total > 0 or off_da_total > 0:
        heads = budget.get("head_totals") or []
        heads.append({"key": "off_fees", "name": "Match Officials · Fees", "owner": "Common", "is_custom": False,
                       "md_amount": off_fees_total, "nmd_amount": 0.0, "total": off_fees_total})
        heads.append({"key": "off_da", "name": "Match Officials · DA", "owner": "Common", "is_custom": False,
                       "md_amount": off_da_total, "nmd_amount": 0.0, "total": off_da_total})
        budget["head_totals"] = heads
        budget["grand_total"] = float(budget.get("grand_total") or 0) + off_fees_total + off_da_total
        mpca_row = next((b for b in budget["by_body_totals"] if b.get("body_code") == "MPCA" and not b.get("pool_id")), None)
        if not mpca_row:
            mpca_row = {"body_code": "MPCA", "pool_id": None, "pool_name": None, "role": "Common",
                         "budget": 0.0, "travel_grant": 0.0, "total": 0.0, "head_allocations": []}
            budget["by_body_totals"].append(mpca_row)
        mpca_row["budget"] = float(mpca_row.get("budget") or 0) + off_fees_total + off_da_total
        mpca_row["total"] = float(mpca_row.get("budget") or 0) + float(mpca_row.get("travel_grant") or 0)
        allocs = list(mpca_row.get("head_allocations") or [])
        allocs.append({"head_key": "off_fees", "head": "Match Officials · Fees", "owner": "Common", "limit_inr": off_fees_total})
        allocs.append({"head_key": "off_da", "head": "Match Officials · DA", "owner": "Common", "limit_inr": off_da_total})
        mpca_row["head_allocations"] = allocs

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


# ─────────────── MPCA-225 · Budget Freeze workflow ───────────────

@api_router.post("/tournaments/{tid}/unified-budget/lock")
async def lock_unified_budget(tid: str):
    """MPCA-only · Snapshot the current unified budget, freeze it at a new
    version, and block further recomputes from overwriting it."""
    from datetime import datetime, timezone
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if t is None:
        raise HTTPException(404, "Tournament not found")

    setup_meta = t.get("setup_meta") or {}
    pools = list(setup_meta.get("division_pools") or []) + list(setup_meta.get("district_pools") or [])
    matches: List[Dict[str, Any]] = []
    async for m in db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(m)
    async for f in db.fixtures.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(f)

    card = await _load_rate_card_for_tournament(t)
    default_squad = int(t.get("max_squad_size") or 18)
    budget = compute_tournament_budget(matches, pools, card, default_squad=default_squad)
    travel = compute_travel_grant(matches, pools, card, default_squad=default_squad, trip_overrides=t.get("trip_overrides") or {})

    # Merge travel-grant per-(body,pool) with synthetic head_allocations
    body_map = {f"{b['body_code']}|{b.get('pool_id') or ''}": b for b in budget.get("by_body_totals") or []}
    for tr in (travel.get("trips") or []):
        code = tr.get("division")
        pool_id = tr.get("pool_id")
        pool_name = tr.get("pool_name")
        amt = float(tr.get("total", 0) or 0)
        rk = f"{code}|{pool_id or ''}"
        row = body_map.get(rk) or {"body_code": code, "pool_id": pool_id, "pool_name": pool_name, "role": "Visitor", "budget": 0.0, "travel_grant": 0.0, "total": 0.0, "head_allocations": []}
        row["travel_grant"] = row.get("travel_grant", 0.0) + amt
        row["total"] = row.get("budget", 0.0) + row.get("travel_grant", 0.0)
        allocs = list(row.get("head_allocations") or [])
        if amt > 0 and not any(a.get("head_key") == "travel_grant" for a in allocs):
            allocs.append({"head_key": "travel_grant", "head": "Travel Grant", "owner": "Visitor", "limit_inr": amt})
        row["head_allocations"] = allocs
        body_map[rk] = row
    budget["by_body_totals"] = list(body_map.values())

    prev_version = ((t.get("unified_budget_snapshot") or {}).get("locked_version") or 0)
    snapshot = {
        "rate_card_id": card.get("id"),
        "tournament_type": card.get("tournament_type"),
        "format_group": card.get("format_group"),
        "budget": budget,
        "travel_grant": travel,
        "is_locked": True,
        "locked_version": prev_version + 1,
        "locked_at": datetime.now(timezone.utc).isoformat(),
        "locked_by": "MPCA",
    }
    await db.tournaments.update_one({"id": tid}, {"$set": {"unified_budget_snapshot": snapshot}})
    return snapshot


@api_router.post("/tournaments/{tid}/unified-budget/unlock")
async def unlock_unified_budget(tid: str):
    """MPCA-only · Unfreeze the snapshot so Divisions can request re-computes."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0, "unified_budget_snapshot": 1, "id": 1})
    if t is None:
        raise HTTPException(404, "Tournament not found")
    snap = t.get("unified_budget_snapshot") or {}
    if not snap.get("is_locked"):
        return {"already": "unlocked"}
    snap["is_locked"] = False
    await db.tournaments.update_one({"id": tid}, {"$set": {"unified_budget_snapshot": snap}})
    return snap


@api_router.get("/tournaments/{tid}/unified-budget/status")
async def unified_budget_status(tid: str):
    """MPCA-226 follow-up · Compare the LOCKED snapshot against a LIVE recompute
    and flag drift. Feeds Finance Console's blinking 'budget out-of-sync' banner.
    Returns:
        - is_locked, locked_version, locked_at
        - locked_grand_total  (₹ from snapshot at freeze-time)
        - live_grand_total    (₹ from a fresh compute NOW)
        - has_drift           (True if diff > ₹1)
        - live_by_body        (fresh compute's by_body_totals — for pipeline drift row)
    """
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    snap = t.get("unified_budget_snapshot") or {}
    is_locked = bool(snap.get("is_locked"))
    locked_budget_grand = float((snap.get("budget") or {}).get("grand_total") or 0)
    locked_travel_grand = float((snap.get("travel_grant") or {}).get("grand_total") or 0)
    locked_grand = locked_budget_grand + locked_travel_grand

    # Live compute (same code path as compute endpoint)
    setup_meta = t.get("setup_meta") or {}
    pools = list(setup_meta.get("division_pools") or []) + list(setup_meta.get("district_pools") or [])
    matches: List[Dict[str, Any]] = []
    async for m in db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(m)
    async for f in db.fixtures.find({"tournament_id": tid}, {"_id": 0}):
        matches.append(f)
    card = await _load_rate_card_for_tournament(t)
    default_squad = int(t.get("max_squad_size") or 18)
    live_budget = compute_tournament_budget(matches, pools, card, default_squad=default_squad)
    live_travel = compute_travel_grant(matches, pools, card, default_squad=default_squad, trip_overrides=t.get("trip_overrides") or {})
    # Merge travel into live_by_body — per-(body,pool)
    body_map = {f"{b['body_code']}|{b.get('pool_id') or ''}": b for b in live_budget.get("by_body_totals") or []}
    for tr in (live_travel.get("trips") or []):
        code = tr.get("division")
        pool_id = tr.get("pool_id")
        pool_name = tr.get("pool_name")
        amt = float(tr.get("total", 0) or 0)
        rk = f"{code}|{pool_id or ''}"
        row = body_map.get(rk) or {"body_code": code, "pool_id": pool_id, "pool_name": pool_name, "role": "Visitor", "budget": 0.0, "travel_grant": 0.0, "total": 0.0}
        row["travel_grant"] = row.get("travel_grant", 0.0) + amt
        row["total"] = row.get("budget", 0.0) + row.get("travel_grant", 0.0)
        body_map[rk] = row
    live_grand = float(live_budget.get("grand_total") or 0) + float(live_travel.get("grand_total") or 0)

    has_drift = is_locked and abs(live_grand - locked_grand) > 1.0

    return {
        "is_locked": is_locked,
        "locked_version": snap.get("locked_version"),
        "locked_at": snap.get("locked_at"),
        "locked_grand_total": locked_grand,
        "live_grand_total": live_grand,
        "has_drift": has_drift,
        "delta_inr": live_grand - locked_grand,
        "live_by_body": list(body_map.values()),
    }


@api_router.get("/tournaments/{tid}/unified-budget/proposed/{body_code}")
async def proposed_budget_for_body(tid: str, body_code: str):
    """Finance Console linkage — returns the frozen or live "Proposed ₹" for
    a specific body. If the tournament has a locked snapshot, uses that;
    else runs a live compute. Returns `{body_code, budget, travel_grant,
    total, source: "locked" | "live"}`."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if t is None:
        raise HTTPException(404, "Tournament not found")
    snap = t.get("unified_budget_snapshot") or {}
    source = "locked" if snap.get("is_locked") else "live"
    if not snap.get("is_locked"):
        # Do a live compute so callers always get an answer
        setup_meta = t.get("setup_meta") or {}
        pools = list(setup_meta.get("division_pools") or []) + list(setup_meta.get("district_pools") or [])
        matches: List[Dict[str, Any]] = []
        async for m in db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}):
            matches.append(m)
        async for f in db.fixtures.find({"tournament_id": tid}, {"_id": 0}):
            matches.append(f)
        try:
            card = await _load_rate_card_for_tournament(t)
        except HTTPException:
            return {"body_code": body_code, "budget": 0, "travel_grant": 0, "total": 0, "source": "no-rate-card"}
        default_squad = int(t.get("max_squad_size") or 18)
        budget = compute_tournament_budget(matches, pools, card, default_squad=default_squad)
        travel = compute_travel_grant(matches, pools, card, default_squad=default_squad, trip_overrides=t.get("trip_overrides") or {})
        body_map = {b["body_code"]: b for b in budget.get("by_body_totals") or []}
        for d in (travel.get("by_division") or []):
            code = d.get("division")
            row = body_map.get(code) or {"body_code": code, "budget": 0.0, "travel_grant": 0.0, "total": 0.0}
            row["travel_grant"] = row.get("travel_grant", 0.0) + float(d.get("total", 0) or 0)
            row["total"] = row.get("budget", 0.0) + row.get("travel_grant", 0.0)
            body_map[code] = row
        row = body_map.get(body_code) or {"body_code": body_code, "budget": 0, "travel_grant": 0, "total": 0}
    else:
        rows = snap.get("budget", {}).get("by_body_totals") or []
        row = next((r for r in rows if r.get("body_code") == body_code), {"body_code": body_code, "budget": 0, "travel_grant": 0, "total": 0})
    return {**row, "source": source, "locked_version": snap.get("locked_version"), "locked_at": snap.get("locked_at")}
