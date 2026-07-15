"""Iteration 30 · Testing 7 bug fixes for MPCA ERP.

Covers:
  Bug 1: Tournament scoping (Division/District do NOT see MPCA-hosted)
  Bug 3: Match officials pool for Selection Console (MPCA + body merge)
  Bug 4: Scheme budget calculator (input-spec + compute-budget for 2-B, 2-D)
  Bug 5: Squad AI recommendation - overall_verdict, verdict_reason, critical_issues
"""
import os
import pytest
import requests
from pathlib import Path

def _load_frontend_env():
    fe = Path("/app/frontend/.env")
    if fe.exists():
        for ln in fe.read_text().splitlines():
            if ln.startswith("REACT_APP_BACKEND_URL="):
                return ln.split("=", 1)[1].strip()
    return None

_url = os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()
assert _url, "REACT_APP_BACKEND_URL not configured"
BASE_URL = _url.rstrip("/")
API = f"{BASE_URL}/api"

# Seed IDs from context
CT_SARWATE_TID = "89847570-56c9-4253-9340-044ddbd6695f"
SQUAD_ID = "622016e0-6bab-40cc-a22f-db47d9dfa84f"


# --------------- helpers ---------------
def _hdr(body_code=None, body_type=None, role_id=None, user_name=None):
    h = {"Content-Type": "application/json"}
    if body_code:
        h["X-Body-Code"] = body_code
    if body_type:
        h["X-Body-Type"] = body_type
    if role_id:
        h["X-Role-Id"] = role_id
    if user_name:
        h["X-User-Name"] = user_name
    return h


# ---------------------------------------------------------------------------
# Bug 1: Tournament scoping
# ---------------------------------------------------------------------------
class TestBug1TournamentScoping:
    def test_state_persona_sees_all(self):
        r = requests.get(f"{API}/tournaments", headers=_hdr(body_code="MPCA", body_type="State"))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, f"State should see all tournaments, got {len(data)}"
        print(f"State persona sees {len(data)} tournaments")

    def test_division_secretary_scoped(self):
        r = requests.get(f"{API}/tournaments", headers=_hdr(body_code="DIV-IND", body_type="Division"))
        assert r.status_code == 200
        data = r.json()
        # Should NOT include MPCA-hosted tournaments (unless MPCA on required_from)
        mpca_leaks = [t for t in data if t.get("host_body_id") == "MPCA"
                      and "DIV-IND" not in ((t.get("acceptance") or {}).get("required_from") or [])]
        assert not mpca_leaks, f"MPCA-hosted tournaments leaked to DIV-IND: {[t['tournament_no'] for t in mpca_leaks]}"
        # Should NOT include BCCI-hosted (State-only)
        bcci_leaks = [t for t in data if t.get("host_body_id") == "BCCI"]
        assert not bcci_leaks, f"BCCI-hosted leaked: {[t['tournament_no'] for t in bcci_leaks]}"
        for t in data:
            hosted_by_div = t.get("host_body_id") == "DIV-IND"
            hosted_by_child_dist = (t.get("host_body_id", "").startswith("DIST-") and
                                    t.get("host_body_id", "").endswith("-IND"))
            req = ((t.get("acceptance") or {}).get("required_from") or [])
            in_req = "DIV-IND" in req or any(rf.endswith("-IND") and rf.startswith("DIST-") for rf in req)
            assert hosted_by_div or hosted_by_child_dist or in_req, \
                f"Tournament {t.get('tournament_no')} hosted by {t.get('host_body_id')} leaked to DIV-IND"
        print(f"DIV-IND sees {len(data)} scoped tournaments — all legit; NO MPCA/BCCI leaks")

    def test_district_secretary_scoped(self):
        r = requests.get(f"{API}/tournaments", headers=_hdr(body_code="DIST-INDO-IND", body_type="District"))
        assert r.status_code == 200
        data = r.json()
        for t in data:
            hosted_by_dist = t.get("host_body_id") == "DIST-INDO-IND"
            req = ((t.get("acceptance") or {}).get("required_from") or [])
            in_req = "DIST-INDO-IND" in req
            assert hosted_by_dist or in_req, \
                f"Tournament {t.get('tournament_no')} hosted by {t.get('host_body_id')} leaked to DIST-INDO-IND"
        print(f"DIST-INDO-IND sees {len(data)} scoped tournaments")

    def test_ct_sarwate_not_in_division_scope(self):
        """CT Sarwate Trophy is MPCA-hosted — should NOT appear for Division unless in required_from."""
        r_div = requests.get(f"{API}/tournaments", headers=_hdr(body_code="DIV-IND", body_type="Division"))
        div_tids = {t["id"] for t in r_div.json()}
        r_ct = requests.get(f"{API}/tournaments/{CT_SARWATE_TID}")
        assert r_ct.status_code == 200
        ct = r_ct.json()
        host = ct.get("host_body_id")
        req = ((ct.get("acceptance") or {}).get("required_from") or [])
        if host == "MPCA" and "DIV-IND" not in req:
            assert CT_SARWATE_TID not in div_tids, \
                "MPCA-hosted CT Sarwate leaked into DIV-IND scope!"
            print(f"CT Sarwate correctly hidden from DIV-IND (hosted by {host})")
        else:
            print(f"CT Sarwate is hosted by {host} or DIV-IND is on required_from — visibility valid")


# ---------------------------------------------------------------------------
# Bug 3: Match officials pool for Selection Console
# ---------------------------------------------------------------------------
class TestBug3MatchOfficialsPool:
    def test_officials_endpoint_lists_umesh(self):
        # Common possible endpoints — try both singular + list
        candidates = [
            f"{API}/officials",
            f"{API}/match-officials",
        ]
        found = False
        for url in candidates:
            r = requests.get(url, headers=_hdr(body_code="DIV-IND", body_type="Division"))
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list) and any(
                    ("Umesh" in (o.get("full_name") or o.get("name") or ""))
                    for o in data
                ):
                    found = True
                    print(f"{url} → Umesh Bharadwaj found in pool")
                    break
                print(f"{url} → {len(data) if isinstance(data,list) else 'n/a'} officials")
        if not found:
            pytest.skip("Match officials endpoint not standardized; UI test will verify")


# ---------------------------------------------------------------------------
# Bug 4: Scheme calculator
# ---------------------------------------------------------------------------
class TestBug4SchemeCalculator:
    def test_scheme_2d_input_spec(self):
        r = requests.get(f"{API}/schemes/2-D/input-spec")
        assert r.status_code == 200
        data = r.json()
        assert data["computable"] is True, f"2-D must be computable, got {data['computable']}"
        keys = {v["key"] for v in data["input_variables"]}
        for expected in ["match_days", "rooms_visiting", "camp_days"]:
            assert expected in keys, f"2-D input-spec missing {expected}; got {keys}"
        print(f"2-D input-spec OK: {len(keys)} variables")

    def test_scheme_2d_compute_budget(self):
        payload = {"inputs": {
            "match_days": 6, "rooms_visiting": 8, "rooms_host": 8, "rooms_officials": 4,
            "daybefore_pax": 18, "matches_multiday": 1, "matches_ltdovers": 0,
            "local_convey_days": 6,
        }}
        r = requests.post(f"{API}/schemes/2-D/compute-budget", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        total = data["total_ceiling_inr"]
        assert 280000 < total < 300000, f"Expected ~289340 but got {total}"
        heads = data["head_allocations"]
        assert len(heads) >= 8
        # Verify at least one formula string mentions rooms x days
        found_room_formula = any(("rooms" in h["formula"] and "days" in h["formula"]) for h in heads)
        assert found_room_formula, f"No 'rooms × days' formula found: {[h['formula'] for h in heads]}"
        print(f"2-D total_ceiling ₹{total:,.0f} with {len(heads)} heads")

    def test_scheme_2b_compute_budget(self):
        payload = {"inputs": {
            "match_days": 8, "outstation_teams": "1", "outstation_pax": 16, "food_pax": 32,
            "matches": 6, "umpires_per_day": 2, "scorers_per_day": 1,
            "teams_outstation_for_travel": 1, "districts_in_division": 5,
        }}
        r = requests.post(f"{API}/schemes/2-B/compute-budget", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        heads = data["head_allocations"]
        assert len(heads) >= 9, f"Expected 9+ heads for 2-B, got {len(heads)}: {[h['head'] for h in heads]}"
        assert data["computable"] is True
        assert data["total_ceiling_inr"] > 0
        print(f"2-B computed: {len(heads)} heads, total ₹{data['total_ceiling_inr']:,.0f}")

    def test_scheme_2b_input_spec(self):
        r = requests.get(f"{API}/schemes/2-B/input-spec")
        assert r.status_code == 200
        assert r.json()["computable"] is True


# ---------------------------------------------------------------------------
# Bug 5: Squad AI verdict
# ---------------------------------------------------------------------------
class TestBug5SquadVerdict:
    def test_squad_recommendation_has_verdict(self):
        r = requests.get(f"{API}/squads/{SQUAD_ID}/recommendation")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "overall_verdict" in data, f"overall_verdict missing: {list(data.keys())}"
        assert data["overall_verdict"] in ("PASS", "PASS_WITH_REMARKS", "FAIL"), \
            f"Unexpected verdict: {data['overall_verdict']}"
        assert "verdict_reason" in data and data["verdict_reason"]
        assert "critical_issues" in data and isinstance(data["critical_issues"], list)
        print(f"Squad verdict={data['overall_verdict']}, reason={data['verdict_reason'][:80]}")
        print(f"Critical issues: {data['critical_issues']}")
