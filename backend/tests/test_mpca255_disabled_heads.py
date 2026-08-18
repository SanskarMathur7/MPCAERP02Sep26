"""MPCA-255 · Rate card `disabled_head_keys` — per-tournament-type head filter.

Contract:
  1. compute_tournament_budget() skips heads listed in
     rate_card["disabled_head_keys"] — no rows in head_totals, no amount
     in per-match totals.
  2. Custom heads can also be disabled by the same list.
  3. Empty / missing list = every head applies (backward-compatible).
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routes.unified_budget import compute_tournament_budget   # noqa: E402


def _rate_card(**overrides):
    """Minimal rate card with 3 of the 17 defaults + 1 custom head."""
    card = {
        "budget_rates": {
            "hotel_team": {"md": 1000, "nmd": 1000},
            "food_on":    {"md": 500,  "nmd": 0},
            "tent":       {"md": 4500, "nmd": 4500},
            "custom_x":   {"md": 100,  "nmd": 0},
        },
        "custom_heads": [
            {"key": "custom_x", "name": "VIP hospitality", "driver": None,
             "rooms": False, "basis": "MatchDays", "owner": "Host"},
        ],
        "disabled_head_keys": [],
    }
    card.update(overrides)
    return card


def _matches():
    return [{
        "id": "m1", "match_no": 1, "match_date": "2026-03-01",
        "to_date": "2026-03-01", "days": 1, "actual_days": None,
        "home_team": "A", "away_team": "B",
        "pool_id": None, "format": "ltd_overs", "other_pax": 0,
    }]


def _pools():
    return [{"id": "P1", "teams": ["A", "B"], "host": "A", "matches_per_team": 1}]


# ─────────── Test 1 · nothing disabled = every head appears ───────────
def test_nothing_disabled_all_heads_present():
    result = compute_tournament_budget(_matches(), _pools(), _rate_card())
    keys = {h["key"] for h in result["head_totals"]}
    assert "hotel_team" in keys
    assert "food_on" in keys
    assert "tent" in keys
    assert "custom_x" in keys


# ─────────── Test 2 · disable a default head → it disappears ───────────
def test_disabled_default_head_skipped():
    card = _rate_card(disabled_head_keys=["hotel_team"])
    result = compute_tournament_budget(_matches(), _pools(), card)
    keys = {h["key"] for h in result["head_totals"]}
    assert "hotel_team" not in keys, "Disabled default head must not appear in head_totals"
    assert "food_on" in keys
    assert "tent" in keys
    assert "custom_x" in keys


# ─────────── Test 3 · disable a custom head → it disappears ───────────
def test_disabled_custom_head_skipped():
    card = _rate_card(disabled_head_keys=["custom_x"])
    result = compute_tournament_budget(_matches(), _pools(), card)
    keys = {h["key"] for h in result["head_totals"]}
    assert "custom_x" not in keys
    assert "hotel_team" in keys


# ─────────── Test 4 · disabling multiple heads shrinks grand total ───────────
def test_disabling_heads_reduces_grand_total():
    all_on = compute_tournament_budget(_matches(), _pools(), _rate_card())
    partial = compute_tournament_budget(
        _matches(), _pools(),
        _rate_card(disabled_head_keys=["tent", "food_on"]),
    )
    assert partial["grand_total"] < all_on["grand_total"], \
        "Disabling heads must reduce grand total"


# ─────────── Test 5 · unknown key in disabled list is harmless ───────────
def test_unknown_disabled_key_is_ignored():
    card = _rate_card(disabled_head_keys=["not_a_real_head_key"])
    result = compute_tournament_budget(_matches(), _pools(), card)
    keys = {h["key"] for h in result["head_totals"]}
    assert "hotel_team" in keys and "tent" in keys and "custom_x" in keys, \
        "Unknown disabled key must not accidentally remove real heads"
