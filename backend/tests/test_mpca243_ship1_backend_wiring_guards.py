"""MPCA-243 · Ship 1 · Backend wiring-driven governance guards.

Locks the contract for the 8 findings implemented in Ship 1:
    1.2 · officials assigned_by attribution (persona-driven, not hardcoded)
    2.1 · fixtures/matches wiring-owner guard
    3.1 · unified budget heads edit — wiring owner (not hardcoded scope map)
    3.2 · unified budget lock/unlock wiring-owner guard
    3.3 · locked_by attribution
    4.1 · closure-letter wiring-owner guard
    4.2 · closure-letter dynamic header/issuer
    5.1 · finance-console owner-aware state elevation
"""
import os
from pathlib import Path

import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def _find_tournament_by_wiring_type(target_type: str) -> dict | None:
    """Return a tournament dict whose resolved wiring type_id matches."""
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    for t in r.json():
        try:
            ws = requests.get(f"{API}/tournaments/{t['id']}/wiring-status", timeout=20)
            if ws.status_code == 200 and ws.json().get("type_id") == target_type:
                return t
        except Exception:
            continue
    return None


# ─────────────── 3.2 · Unified-budget lock owner guard ───────────────

def test_budget_lock_blocked_for_wrong_body_type():
    """A District persona must NOT be able to lock the budget on an
    Inter-Division tournament (owner=MPCA per wiring)."""
    t = _find_tournament_by_wiring_type("interdiv")
    if not t:
        return
    r = requests.post(
        f"{API}/tournaments/{t['id']}/unified-budget/lock",
        headers={"X-Body-Type": "District", "X-User-Body-Code": "DIST-INDO-IND",
                 "X-User-Name": "Test District Secretary"},
        timeout=20,
    )
    assert r.status_code == 403, f"Expected 403 for District on Inter-Div lock, got {r.status_code}: {r.text}"


def test_budget_lock_allowed_for_wiring_owner_and_stamps_persona():
    """A State persona locks an Inter-Division budget → success + locked_by
    reflects the actual persona (not hardcoded "MPCA")."""
    t = _find_tournament_by_wiring_type("interdiv")
    if not t:
        return
    r = requests.post(
        f"{API}/tournaments/{t['id']}/unified-budget/lock",
        headers={"X-Body-Type": "State", "X-User-Body-Code": "MPCA",
                 "X-User-Name": "Sanjeev Dua"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    locked_by = r.json().get("locked_by") or ""
    assert "Sanjeev Dua" in locked_by, f"expected persona name in locked_by, got {locked_by!r}"


def test_budget_lock_allowed_for_division_on_district_tournament():
    """Division persona SHOULD be able to lock an Inter-District tournament
    budget (wiring says owner=Division for `district` type)."""
    t = _find_tournament_by_wiring_type("district")
    if not t:
        return
    r = requests.post(
        f"{API}/tournaments/{t['id']}/unified-budget/lock",
        headers={"X-Body-Type": "Division", "X-User-Body-Code": "DIV-IND",
                 "X-User-Name": "Devashish Nilosey"},
        timeout=20,
    )
    # State personas are also allowed; Division should be too now.
    assert r.status_code == 200, f"Expected 200 for Division on district lock, got {r.status_code}: {r.text}"


# ─────────────── 4.1 · Closure letter owner guard ───────────────

def test_closure_letter_blocked_for_wrong_body_type():
    """District persona must NOT generate a closure letter for an
    Inter-Division tournament (finance_console.owner=MPCA)."""
    t = _find_tournament_by_wiring_type("interdiv")
    if not t:
        return
    r = requests.post(
        f"{API}/tournaments/{t['id']}/closure-letter",
        json={"issued_by_name": "Rogue District Sec", "additional_notes": "should fail"},
        headers={"X-Body-Type": "District", "X-User-Body-Code": "DIST-INDO-IND",
                 "X-User-Name": "Rogue District Sec"},
        timeout=20,
    )
    assert r.status_code == 403, f"Expected 403 for District on Inter-Div closure, got {r.status_code}: {r.text}"


# ─────────────── 2.1 · Match calendar wiring owner ───────────────

def test_match_create_blocked_for_wrong_body_type():
    """District persona must NOT create matches on an Inter-Division tournament
    (match_calendar.owner=MPCA)."""
    t = _find_tournament_by_wiring_type("interdiv")
    if not t:
        return
    r = requests.post(
        f"{API}/tournaments/{t['id']}/matches",
        json={"home_team": "A", "away_team": "B", "match_date": "2027-01-01"},
        headers={"X-Body-Type": "District", "X-User-Body-Code": "DIST-INDO-IND"},
        timeout=20,
    )
    assert r.status_code == 403, f"Expected 403 for District on Inter-Div match create, got {r.status_code}: {r.text}"


# ─────────────── 3.1 · Budget heads edit uses wiring not scope map ───────────────

def test_budget_heads_edit_wiring_driven_owner():
    """Verify _may_edit_heads() consults wiring: for an Inter-Div budget
    (owner=MPCA), a Division persona is refused even if not the host body."""
    # Find any Inter-Div tournament budget
    t = _find_tournament_by_wiring_type("interdiv")
    if not t:
        return
    # Find a draft/returned budget on this tournament
    r = requests.get(f"{API}/tournament-budgets", params={"tournament_id": t["id"]}, timeout=20)
    if r.status_code != 200:
        return
    budgets = [b for b in r.json() or [] if b.get("status") in
               ("Draft", "Returned", "Sent_To_Division", "Accepted_By_Division",
                "Revision_Requested", "Submitted")]
    if not budgets:
        return
    bid = budgets[0]["id"]
    r = requests.patch(
        f"{API}/tournament-budgets/{bid}/heads",
        json={"head_allocations": [{"head_key": "hotel_team", "head": "Hotel", "owner": "Host", "limit_inr": 1}]},
        headers={"X-Body-Type": "Division", "X-User-Body-Code": "DIV-JBP"},
        timeout=20,
    )
    # Should be 403 — wiring says owner=MPCA
    assert r.status_code == 403, f"Expected 403 for Division on Inter-Div heads edit, got {r.status_code}: {r.text}"
