"""MPCA Phase 2 backend regression tests · MPCA-102, 105, 108, 110, 123."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")


MPCA_HEADERS = {
    "X-Body-Code": "MPCA",
    "X-Body-Type": "State",
    "X-Role-Id": "secretary",
    "X-User-Name": "Sanjeev Dua",
    "Content-Type": "application/json",
}


# ───── MPCA-110 · scheme calculator non_match_days input & head ─────
class TestMPCA110SchemeCalc:
    def test_input_spec_2A_contains_non_match_days(self):
        r = requests.get(f"{BASE_URL}/api/schemes/2-A/input-spec")
        assert r.status_code == 200, r.text
        keys = [v["key"] for v in r.json()["input_variables"]]
        assert "non_match_days" in keys

    def test_input_spec_2B_contains_non_match_days(self):
        r = requests.get(f"{BASE_URL}/api/schemes/2-B/input-spec")
        assert r.status_code == 200, r.text
        keys = [v["key"] for v in r.json()["input_variables"]]
        assert "non_match_days" in keys

    def test_compute_2A_with_non_match_days(self):
        r = requests.post(
            f"{BASE_URL}/api/schemes/2-A/compute-budget",
            json={"inputs": {"match_days": 6, "non_match_days": 2, "umpires_per_day": 2, "scorers_per_day": 1, "matches": 12}},
        )
        assert r.status_code == 200, r.text
        heads = r.json()["head_allocations"]
        nmd = [h for h in heads if "Non-match day" in h["head"]]
        assert len(nmd) == 1
        # PER_DAY_GRANT default 5000 * 0.5 * 2 = 5000
        assert nmd[0]["limit_inr"] == 5000.0

    def test_compute_2A_without_non_match_days(self):
        r = requests.post(
            f"{BASE_URL}/api/schemes/2-A/compute-budget",
            json={"inputs": {"match_days": 6, "non_match_days": 0}},
        )
        assert r.status_code == 200
        heads = r.json()["head_allocations"]
        assert not any("Non-match day" in h["head"] for h in heads)

    def test_compute_2B_with_non_match_days(self):
        r = requests.post(
            f"{BASE_URL}/api/schemes/2-B/compute-budget",
            json={"inputs": {"match_days": 8, "non_match_days": 2, "outstation_teams": "1", "outstation_pax": 16, "food_pax": 32, "matches": 6}},
        )
        assert r.status_code == 200, r.text
        heads = r.json()["head_allocations"]
        nmd = [h for h in heads if "Non-match day" in h["head"]]
        assert len(nmd) == 1
        assert nmd[0]["limit_inr"] > 0


# ───── MPCA-102 / MPCA-105 / MPCA-108 · Tournament fields ─────
class TestMPCATournamentFields:
    @pytest.fixture(scope="class")
    def created_tid(self):
        payload = {
            "name": "TEST_MPCA102 Inter-Divisional",
            "tournament_type": "MPCA_Championship",
            "scope": "Inter_Divisional",
            "tournament_type_code": "inter_div",
            "format": "Multi_Day",
            "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA",
            "created_by_body_code": "MPCA",
            "start_date": "2026-02-01",
            "end_date": "2026-02-08",
            "max_squad_size": 20,
            "medical_required": True,
            "is_womens": True,
            "age_cap_years": 19,
        }
        r = requests.post(f"{BASE_URL}/api/tournaments", json=payload, headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        yield tid
        # cleanup: just leave data; TEST_ prefix identifies it

    def test_gender_age_medical_persisted(self, created_tid):
        r = requests.get(f"{BASE_URL}/api/tournaments/{created_tid}", headers=MPCA_HEADERS)
        assert r.status_code == 200
        d = r.json()
        assert d.get("is_womens") is True
        assert d.get("age_cap_years") == 19
        assert d.get("medical_required") is True
        assert d.get("max_squad_size") == 20

    def test_patch_max_squad_and_medical(self, created_tid):
        r = requests.patch(
            f"{BASE_URL}/api/tournaments/{created_tid}",
            json={"max_squad_size": 25, "medical_required": False},
            headers=MPCA_HEADERS,
        )
        assert r.status_code == 200, r.text
        # Verify persisted
        g = requests.get(f"{BASE_URL}/api/tournaments/{created_tid}", headers=MPCA_HEADERS).json()
        assert g["max_squad_size"] == 25
        assert g["medical_required"] is False

    def test_open_age_group_sets_null(self):
        # Create another tournament with age_cap_years=null (Open)
        payload = {
            "name": "TEST_MPCA102 Open Age",
            "tournament_type": "MPCA_Championship",
            "scope": "Inter_Divisional",
            "tournament_type_code": "inter_div",
            "format": "Multi_Day",
            "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA",
            "created_by_body_code": "MPCA",
            "start_date": "2026-03-01",
            "end_date": "2026-03-08",
            "age_cap_years": None,
            "is_womens": False,
        }
        r = requests.post(f"{BASE_URL}/api/tournaments", json=payload, headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("age_cap_years") in (None, 0)
        assert d.get("is_womens") in (False, None)


# ───── MPCA-123 · Regression: creatable types no longer include inter_div_travel ─────
# NOTE: This is a frontend catalog rule (created_by=[]). Backend accepts creation of
# any tournament_type_code, so we test that the catalog file has created_by=[] via
# indirect check — leave to frontend Playwright test.
