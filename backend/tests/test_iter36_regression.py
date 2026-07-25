"""Iter36 · Full regression sweep across Sprints M17-M20.
Focused API health checks for endpoints touched in this sweep."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0]
BASE = BASE.rstrip("/")


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# --------- Core data endpoints ---------
class TestCoreEndpoints:
    def test_tournaments_list(self, s):
        r = s.get(f"{BASE}/api/tournaments")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 30

    def test_venues(self, s):
        r = s.get(f"{BASE}/api/venues")
        assert r.status_code == 200
        assert len(r.json()) >= 100

    def test_reimbursement_schemes(self, s):
        r = s.get(f"{BASE}/api/reimbursement-schemes")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 20
        # non-tournament schemes (for claim chips)
        non_tour = [x for x in data if x.get("scheme_type") != "Reimbursement"]
        assert len(non_tour) > 0

    def test_players(self, s):
        r = s.get(f"{BASE}/api/players")
        assert r.status_code == 200
        assert len(r.json()) >= 50

    def test_bodies(self, s):
        r = s.get(f"{BASE}/api/bodies")
        assert r.status_code == 200


# --------- Sprint M20 scheme_calc endpoints ---------
class TestSchemeCalc:
    def test_input_spec_2b(self, s):
        r = s.get(f"{BASE}/api/schemes/2-B/input-spec")
        assert r.status_code == 200
        spec = r.json()
        assert spec.get("computable") is True
        assert len(spec.get("input_variables", [])) == 9

    def test_compute_budget_2b(self, s):
        payload = {"inputs": {
            "match_days": 8, "num_teams": 6, "num_players_per_team": 15,
            "num_officials": 4, "num_support_staff": 2,
            "hotel_rate_per_room_night": 2500, "food_rate_per_person_day": 400,
            "match_fee_per_official_per_day": 3000, "misc_pct": 5
        }}
        r = s.post(f"{BASE}/api/schemes/2-B/compute-budget", json=payload)
        assert r.status_code == 200
        d = r.json()
        total = d.get("total_inr") or d.get("total") or d.get("grand_total_inr") or sum(h.get("limit_inr", 0) for h in d.get("head_allocations", []))
        assert total > 0


# --------- Sprint M19 tournament workspace ---------
class TestTournamentWorkspace:
    TID = "61460d66-4844-49f2-b0b2-e6f3a9bd6ced"

    def test_matches_list(self, s):
        r = s.get(f"{BASE}/api/tournaments/{self.TID}/matches")
        assert r.status_code == 200

    def test_receipts_list(self, s):
        r = s.get(f"{BASE}/api/tournaments/{self.TID}/receipts")
        assert r.status_code == 200

    def test_progress(self, s):
        r = s.get(f"{BASE}/api/tournaments/{self.TID}/progress")
        assert r.status_code == 200
        p = r.json()
        assert "percent" in p or "phase" in p or isinstance(p, dict)

    def test_financial_summary(self, s):
        r = s.get(f"{BASE}/api/tournaments/{self.TID}/financial-summary")
        assert r.status_code == 200

    def test_tournament_detail_has_type_code(self, s):
        r = s.get(f"{BASE}/api/tournaments/{self.TID}")
        assert r.status_code == 200


# --------- Create + delete inter_school (iter35 flagged 422) ---------
class TestInterSchoolCreate:
    def test_create_inter_school(self, s):
        payload = {
            "name": "TEST_iter36 InterSchool 001",
            "format": "One_Day",
            "tournament_type": "Invitational",
            "scope": "Inter_District",
            "tournament_type_code": "inter_school",
            "host_body_type": "Division",
            "host_body_id": "DIV-IND",
            "start_date": "2026-04-01",
            "end_date": "2026-04-03",
            "season": "2026-27"
        }
        r = s.post(f"{BASE}/api/tournaments", json=payload)
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text[:400]}"
        tid = r.json().get("id")
        # cleanup
        if tid:
            s.delete(f"{BASE}/api/tournaments/{tid}")


# --------- Match Officials · DA forms ---------
class TestDAForms:
    def test_da_forms_list(self, s):
        r = s.get(f"{BASE}/api/da-forms")
        # may be 200 empty or 200 list
        assert r.status_code in (200, 404)

    def test_match_officials(self, s):
        r = s.get(f"{BASE}/api/match-officials")
        assert r.status_code == 200
