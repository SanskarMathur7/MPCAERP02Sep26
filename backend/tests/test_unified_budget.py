"""MPCA-216 · Sprint 2 · Unified Budget Compute Engine tests.

Purpose: assert the Python compute engine returns numbers identical to the
MPCA Inter-Division Utility HTML (v20). We avoid hitting the FastAPI layer
where possible and directly call the pure functions from
`routes.unified_budget`.
"""
import os
import sys
import pytest

# Ensure /app/backend is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routes.unified_budget import (   # noqa: E402
    span_days,
    match_days,
    shortfall_days,
    gap_map,
    effective_nmd,
    host_away_pax,
    officials_count,
    driver_qty,
    derived_qty,
    compute_tournament_budget,
    compute_travel_grant,
    _format_group_from_tournament,
    _tournament_type_key,
)


# ─────────────────── Fixtures: sample rate card ───────────────────

def _default_rates_multi():
    """Same values as the HTML utility's DEFAULT_RATES / multi format."""
    return {
        "budget_rates": {
            "hotel_team":  {"md": 1800, "nmd": 1800},
            "hotel_off":   {"md": 1800, "nmd": 1800},
            "food_on":     {"md": 500,  "nmd": 0},
            "food_off":    {"md": 300,  "nmd": 0},
            "food_nmd":    {"md": 0,    "nmd": 630},
            "tent":        {"md": 4500, "nmd": 4500},
            "conv_team":   {"md": 1500, "nmd": 1500},
            "conv_off":    {"md": 6000, "nmd": 6000},
            "labour":      {"md": 2500, "nmd": 2500},
            "local_mgr":   {"md": 2600, "nmd": 2600},
            "doctor":      {"md": 2500, "nmd": 0},
            "ambulance":   {"md": 2000, "nmd": 0},
            "coach_mgr":   {"md": 4250, "nmd": 4250},
            "scoreboard":  {"md": 500,  "nmd": 500},
            "water":       {"md": 3500, "nmd": 0},
            "drinks":      {"md": 250,  "nmd": 0},
            "mom":         {"md": 5000, "nmd": 0},
        },
        "travel_rates": {
            "travel_rt":         {"md": 2800, "nmd": 0},
            "coach":             {"md": 3000, "nmd": 1500},
            "manager":           {"md": 2000, "nmd": 1000},
            "trainer":           {"md": 2000, "nmd": 1000},
            "local_conveyance":  {"md": 1500, "nmd": 0},
            "medical":           {"md": 2000, "nmd": 0},
            "misc_journey":      {"md": 2500, "nmd": 0},
            "other":             {"md": 1000, "nmd": 0},
        },
        "tournament_type": "Inter_Divisional",
        "format_group": "multi_day",
    }


# ─────────────────── Days engine ───────────────────

def test_span_days_simple():
    assert span_days({"from_date": "2026-11-01", "to_date": "2026-11-04"}) == 4

def test_span_days_reversed_is_zero():
    assert span_days({"from_date": "2026-11-05", "to_date": "2026-11-01"}) == 0

def test_span_days_missing_returns_zero():
    assert span_days({}) == 0

def test_match_days_default_equals_span():
    m = {"from_date": "2026-11-01", "to_date": "2026-11-04"}
    assert match_days(m) == 4

def test_match_days_actual_days_early_end():
    m = {"from_date": "2026-11-01", "to_date": "2026-11-04", "actual_days": 2}
    assert match_days(m) == 2
    assert shortfall_days(m) == 2

def test_match_days_actual_days_ignored_if_over_span():
    m = {"from_date": "2026-11-01", "to_date": "2026-11-04", "actual_days": 99}
    assert match_days(m) == 4

def test_gap_map_first_match_arrival_day():
    matches = [
        {"id": "m1", "from_date": "2026-11-01", "to_date": "2026-11-03"},
    ]
    gm = gap_map(matches)
    assert gm["m1"] == 1

def test_gap_map_consecutive_no_gap():
    matches = [
        {"id": "m1", "from_date": "2026-11-01", "to_date": "2026-11-03"},
        {"id": "m2", "from_date": "2026-11-04", "to_date": "2026-11-06"},
    ]
    gm = gap_map(matches)
    assert gm["m1"] == 1
    assert gm["m2"] == 0

def test_gap_map_gap_between_rounds():
    matches = [
        {"id": "m1", "from_date": "2026-11-01", "to_date": "2026-11-03"},
        {"id": "m2", "from_date": "2026-11-08", "to_date": "2026-11-10"},
    ]
    gm = gap_map(matches)
    assert gm["m1"] == 1
    assert gm["m2"] == 4  # days 4,5,6,7 between

def test_effective_nmd_gap_plus_shortfall():
    matches = [
        {"id": "m1", "from_date": "2026-11-01", "to_date": "2026-11-04", "actual_days": 2},
    ]
    gm = gap_map(matches)
    assert effective_nmd(matches[0], gm) == 1 + 2  # 1 arrival + 2 shortfall

def test_effective_nmd_manual_override():
    matches = [
        {"id": "m1", "from_date": "2026-11-01", "to_date": "2026-11-03", "nmd_manual": 5},
    ]
    gm = gap_map(matches)
    # manual 5 + shortfall 0
    assert effective_nmd(matches[0], gm) == 5


# ─────────────────── Drivers ───────────────────

def test_host_away_pax_host_playing():
    pool = {"id": "p1", "host_division_code": "DIV-BPL"}
    m = {"team_a": "DIV-BPL", "team_b": "DIV-IND"}
    pax = host_away_pax(m, pool, default_squad=18)
    assert pax["host"] == 18
    assert pax["away"] == 18
    assert pax["host_playing"] is True
    assert pax["n"] == 2
    assert pax["host_count"] == 1

def test_host_away_pax_host_not_playing():
    pool = {"id": "p1", "host_division_code": "DIV-BPL"}
    m = {"team_a": "DIV-IND", "team_b": "DIV-GWL"}
    pax = host_away_pax(m, pool, default_squad=18)
    assert pax["host"] == 0
    assert pax["away"] == 36
    assert pax["host_playing"] is False
    assert pax["host_count"] == 0

def test_officials_count_sum_of_roles():
    m = {"officials": {"umpires": ["u1", "u2"], "scorers": ["s1"], "selectors": [], "observers": ["o1"]}}
    assert officials_count(m) == 4

def test_driver_qty_all_pax_includes_other_pax():
    pool = {"host_division_code": "DIV-BPL"}
    m = {
        "team_a": "DIV-BPL", "team_b": "DIV-IND",
        "officials": {"umpires": ["u1", "u2"], "scorers": ["s1"]},
        "other_pax": 5,
    }
    # host=18, away=18, off=3, other=5 → 44
    assert driver_qty(m, "AllPax", pool, 18) == 44

def test_derived_qty_rooms_ceils():
    pool = {"host_division_code": "DIV-BPL"}
    m = {"team_a": "DIV-BPL", "team_b": "DIV-IND"}   # away = 18
    # hotel_team head: driver=AwayTeamPax, rooms=true → ceil(18/2)=9
    head = {"key": "hotel_team", "driver": "AwayTeamPax", "rooms": True, "basis": "MatchDays"}
    assert derived_qty(m, head, pool, 18) == 9

def test_derived_qty_odd_pax_rounds_up():
    pool = {"host_division_code": "DIV-BPL"}
    # host away=17 by manual squad override
    m = {"team_a": "DIV-BPL", "team_b": "DIV-IND", "squad": 17}
    head = {"key": "hotel_team", "driver": "AwayTeamPax", "rooms": True, "basis": "MatchDays"}
    assert derived_qty(m, head, pool, 18) == 9  # ceil(17/2)


# ─────────────────── End-to-end compute ───────────────────

def test_compute_one_match_smoke():
    """Sanity: single-match, host playing, no officials, no other_pax."""
    rc = _default_rates_multi()
    pool = {"id": "p1", "name": "Pool A", "host_division_code": "DIV-BPL"}
    m = {
        "id": "m1", "label": "SF", "pool_id": "p1",
        "team_a": "DIV-BPL", "team_b": "DIV-IND",
        "from_date": "2026-11-01", "to_date": "2026-11-04",
        "officials": {"umpires": ["u1", "u2"], "scorers": ["s1"]},
        "other_pax": 0,
    }
    out = compute_tournament_budget([m], [pool], rc, default_squad=18)
    # 1 match, MD=4, NMD=1 (first match arrival day)
    assert out["match_count"] == 1
    assert out["match_rows"][0]["match_days"] == 4
    assert out["match_rows"][0]["non_match_days"] == 1
    # MOM = 5000 × 1 (once)
    mom_row = [h for h in out["head_totals"] if h["key"] == "mom"][0]
    assert mom_row["md_amount"] == 5000
    # hotel_team = 1800 × ceil(18/2)=9 × 4 MD + 1800 × 9 × 1 NMD
    ht = [h for h in out["head_totals"] if h["key"] == "hotel_team"][0]
    assert ht["md_amount"] == 1800 * 9 * 4
    assert ht["nmd_amount"] == 1800 * 9 * 1
    # hotel_off = 1800 × ceil(3/2)=2 × 4 + 1800 × 2 × 1
    ho = [h for h in out["head_totals"] if h["key"] == "hotel_off"][0]
    assert ho["md_amount"] == 1800 * 2 * 4
    assert ho["nmd_amount"] == 1800 * 2 * 1


def test_compute_grand_total_matches_hand_calc():
    """Hand-computed grand total for a well-known configuration.

    Setup: 1 match, host playing (18 host + 18 away), 3 officials (2 ump + 1 sc),
    otherPax=0. Format multi. MD=4, NMD=1.

    Per-head totals for this match (values chosen so a mistake is obvious):
      hotel_team:  1800×9×4 + 1800×9×1  = 81,000
      hotel_off:   1800×2×4 + 1800×2×1  = 18,000
      food_on:     500×(18+18+3+0)=500×39; ×4 MD + 500×39×0 NMD = 78,000
      food_off:    300×18×4 + 300×18×0 = 21,600
      food_nmd:    0×18×4 + 630×18×1   = 11,340
      tent:        4500×1×4 + 4500×1×1 = 22,500
      conv_team:   1500×2×4 + 1500×2×1 = 15,000   (TeamCount=n=2)
      conv_off:    6000×1×4 + 6000×1×1 = 30,000
      labour:      2500×1×4 + 2500×1×1 = 12,500
      local_mgr:   2600×1×4 + 2600×1×1 = 13,000
      doctor:      2500×1×4 + 0        = 10,000
      ambulance:   2000×1×4 + 0        =  8,000
      coach_mgr:   4250×1×4 + 4250×1×1 = 21,250   (HostTeamCount=1)
      scoreboard:  500×1×4 + 500×1×1   =  2,500
      water:       3500×1×4 + 0        = 14,000
      drinks:      250×1×4 + 0         =  1,000
      mom:         5000×1×1            =  5,000

      Grand total = 364,690
    """
    rc = _default_rates_multi()
    pool = {"id": "p1", "name": "Pool A", "host_division_code": "DIV-BPL"}
    m = {
        "id": "m1", "label": "F", "pool_id": "p1",
        "team_a": "DIV-BPL", "team_b": "DIV-IND",
        "from_date": "2026-11-01", "to_date": "2026-11-04",
        "officials": {"umpires": ["u1", "u2"], "scorers": ["s1"]},
        "other_pax": 0,
    }
    out = compute_tournament_budget([m], [pool], rc, default_squad=18)
    assert out["grand_total"] == 364690.0


def test_compute_pool_rollup_and_match_rows():
    """Two-match tournament: both in Pool A, host DIV-BPL."""
    rc = _default_rates_multi()
    pool = {"id": "p1", "name": "Pool A", "host_division_code": "DIV-BPL"}
    matches = [
        {"id": "m1", "pool_id": "p1", "team_a": "DIV-BPL", "team_b": "DIV-IND",
         "from_date": "2026-11-01", "to_date": "2026-11-03",
         "officials": {"umpires": ["u1", "u2"], "scorers": ["s1"]}},
        {"id": "m2", "pool_id": "p1", "team_a": "DIV-BPL", "team_b": "DIV-GWL",
         "from_date": "2026-11-04", "to_date": "2026-11-06",
         "officials": {"umpires": ["u1", "u2"], "scorers": ["s1"]}},
    ]
    out = compute_tournament_budget(matches, [pool], rc, default_squad=18)
    assert out["match_count"] == 2
    assert len(out["match_rows"]) == 2
    assert len(out["pool_totals"]) == 1
    ptot = out["pool_totals"][0]
    assert ptot["match_count"] == 2
    # NMD for m1 = 1 (arrival), NMD for m2 = 0 (consecutive)
    assert out["match_rows"][0]["non_match_days"] == 1
    assert out["match_rows"][1]["non_match_days"] == 0
    # Pool grand = sum of match rows
    assert abs(ptot["total"] - (out["match_rows"][0]["total"] + out["match_rows"][1]["total"])) < 0.01


# ─────────────────── Travel grant ───────────────────

def test_travel_grant_host_no_travel():
    """The host of the pool should not have a trip."""
    rc = _default_rates_multi()
    pool = {"id": "p1", "name": "Pool A", "host_division_code": "DIV-BPL"}
    matches = [
        {"id": "m1", "pool_id": "p1", "team_a": "DIV-BPL", "team_b": "DIV-IND",
         "from_date": "2026-11-01", "to_date": "2026-11-03"},
    ]
    out = compute_travel_grant(matches, [pool], rc, default_squad=18)
    assert len(out["trips"]) == 1
    assert out["trips"][0]["division"] == "DIV-IND"
    # travel_rt = 2800 × 18 = 50,400 for the trip's per-pax RT head
    assert out["trips"][0]["heads"]["travel_rt"] == 50400.0


def test_travel_grant_multi_visiting_multi_trip():
    """Two visiting divisions each get a trip."""
    rc = _default_rates_multi()
    pool = {"id": "p1", "name": "Pool A", "host_division_code": "DIV-BPL"}
    matches = [
        {"id": "m1", "pool_id": "p1", "team_a": "DIV-BPL", "team_b": "DIV-IND",
         "from_date": "2026-11-01", "to_date": "2026-11-03"},
        {"id": "m2", "pool_id": "p1", "team_a": "DIV-BPL", "team_b": "DIV-GWL",
         "from_date": "2026-11-04", "to_date": "2026-11-06"},
    ]
    out = compute_travel_grant(matches, [pool], rc, default_squad=18)
    assert {t["division"] for t in out["trips"]} == {"DIV-IND", "DIV-GWL"}
    by_div = {d["division"]: d for d in out["by_division"]}
    assert by_div["DIV-IND"]["trips"] == 1
    assert by_div["DIV-GWL"]["trips"] == 1


# ─────────────────── Format-group + type mapping ───────────────────

def test_format_group_mapping_multi():
    assert _format_group_from_tournament({"format": "Multi_Day"}) == "multi_day"
    assert _format_group_from_tournament({"format": "FourDay_Senior"}) == "multi_day"
    assert _format_group_from_tournament({"format": "Pink_Ball"}) == "multi_day"


def test_format_group_mapping_ltd():
    assert _format_group_from_tournament({"format": "T20"}) == "ltd_overs"
    assert _format_group_from_tournament({"format": "OneDay_U19"}) == "ltd_overs"
    assert _format_group_from_tournament({"format": "One_Day"}) == "ltd_overs"


def test_tournament_type_key():
    assert _tournament_type_key({"scope": "Inter_Divisional"}) == "Inter_Divisional"
    assert _tournament_type_key({"scope": "Inter_District"}) == "Inter_District"
    assert _tournament_type_key({"scope": "Championship"}) == "Championship"
    assert _tournament_type_key({"tournament_type": "BCCI"}) == "BCCI"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
