"""Sprint M20 · Input Variables → Auto-Budget → Submit flow tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TEST_TID = "61460d66-4844-49f2-b0b2-e6f3a9bd6ced"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── 1. Input Spec fetch (scheme 2-B) ─────────────────────────────────
class TestInputSpec:
    def test_scheme_2B_input_spec(self, api):
        r = api.get(f"{BASE_URL}/api/schemes/2-B/input-spec")
        assert r.status_code == 200
        data = r.json()
        assert data["scheme_code"] == "2-B"
        assert data["computable"] is True
        keys = [v["key"] for v in data["input_variables"]]
        expected = {
            "match_days", "outstation_teams", "outstation_pax", "food_pax",
            "matches", "umpires_per_day", "scorers_per_day",
            "teams_outstation_for_travel", "districts_in_division",
        }
        assert expected.issubset(set(keys)), f"Missing: {expected - set(keys)}"
        assert len(data["input_variables"]) == 9

    def test_scheme_2A_input_spec(self, api):
        r = api.get(f"{BASE_URL}/api/schemes/2-A/input-spec")
        assert r.status_code == 200
        assert r.json()["computable"] is True

    def test_scheme_invalid(self, api):
        r = api.get(f"{BASE_URL}/api/schemes/9-Z/input-spec")
        assert r.status_code == 404


# ── 2. Compute Budget (auto-preview) ─────────────────────────────────
class TestComputeBudget:
    def test_compute_2B_defaults(self, api):
        payload = {"inputs": {
            "match_days": 8, "outstation_teams": "1", "outstation_pax": 16,
            "food_pax": 32, "matches": 6, "umpires_per_day": 2,
            "scorers_per_day": 1, "teams_outstation_for_travel": 1,
            "districts_in_division": 5,
        }}
        r = api.post(f"{BASE_URL}/api/schemes/2-B/compute-budget", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["scheme_code"] == "2-B"
        assert data["total_ceiling_inr"] > 0
        assert len(data["head_allocations"]) >= 5
        # Head rows carry formula text
        for h in data["head_allocations"]:
            assert "head" in h and "limit_inr" in h and "formula" in h

    def test_compute_2B_recompute_on_change(self, api):
        base = {"match_days": 8, "outstation_teams": "1", "outstation_pax": 16,
                "food_pax": 32, "matches": 6, "umpires_per_day": 2,
                "scorers_per_day": 1, "teams_outstation_for_travel": 1,
                "districts_in_division": 5}
        r1 = api.post(f"{BASE_URL}/api/schemes/2-B/compute-budget",
                      json={"inputs": base}).json()
        base["match_days"] = 10
        r2 = api.post(f"{BASE_URL}/api/schemes/2-B/compute-budget",
                      json={"inputs": base}).json()
        assert r2["total_ceiling_inr"] > r1["total_ceiling_inr"]


# ── 3. Persist inputs on tournament (PATCH) ──────────────────────────
class TestInputVariablesPersistence:
    def test_patch_input_variables(self, api):
        vars_ = {
            "match_days": 8, "outstation_teams": "1", "outstation_pax": 16,
            "food_pax": 32, "matches": 6, "umpires_per_day": 2,
            "scorers_per_day": 1, "teams_outstation_for_travel": 1,
            "districts_in_division": 5,
        }
        r = api.patch(
            f"{BASE_URL}/api/tournaments/{TEST_TID}/input-variables",
            json={"input_variables": vars_},
        )
        assert r.status_code == 200
        # GET tournament → verify persisted
        t = api.get(f"{BASE_URL}/api/tournaments/{TEST_TID}").json()
        assert t.get("input_variables", {}).get("match_days") == 8


# ── 4. Budget create + submit + approve flow ─────────────────────────
class TestBudgetLifecycle:

    def test_full_lifecycle(self, api):
        # Reset — delete any prior draft/rejected budgets for this tournament
        prior = api.get(f"{BASE_URL}/api/tournament-budgets",
                        params={"tournament_id": TEST_TID}).json()
        for b in prior:
            if b["status"] in ("Draft", "Rejected"):
                api.delete(f"{BASE_URL}/api/tournament-budgets/{b['id']}")

        # 1) Compute budget preview
        inputs = {"match_days": 8, "outstation_teams": "1",
                  "outstation_pax": 16, "food_pax": 32, "matches": 6,
                  "umpires_per_day": 2, "scorers_per_day": 1,
                  "teams_outstation_for_travel": 1, "districts_in_division": 5}
        preview = api.post(f"{BASE_URL}/api/schemes/2-B/compute-budget",
                           json={"inputs": inputs}).json()
        assert preview["total_ceiling_inr"] > 0

        # 2) Fetch tournament for body_id
        t = api.get(f"{BASE_URL}/api/tournaments/{TEST_TID}").json()

        existing = api.get(f"{BASE_URL}/api/tournament-budgets",
                           params={"tournament_id": TEST_TID}).json()
        if existing:
            pytest.skip(f"Tournament already has a non-draft/rejected budget: "
                        f"{existing[0]['status']}. Skipping lifecycle test.")

        # 3) POST /tournament-budgets (create Draft)
        create_payload = {
            "tournament_id": TEST_TID,
            "body_id": t.get("host_body_id"),
            "fiscal_cycle": t.get("fiscal_cycle"),
            "total_ceiling_inr": preview["total_ceiling_inr"],
            "head_allocations": [
                {"head": h["head"], "limit_inr": h["limit_inr"],
                 "notes": h["formula"]} for h in preview["head_allocations"]
            ],
            "notes": "TEST_M20 auto-computed",
        }
        r = api.post(f"{BASE_URL}/api/tournament-budgets", json=create_payload)
        assert r.status_code == 200, r.text
        budget = r.json()
        assert budget["status"] == "Draft"
        assert budget["total_ceiling_inr"] == preview["total_ceiling_inr"]
        bid = budget["id"]

        # 4) POST /submit → status Submitted
        r = api.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/submit",
            json={"actor_name": "TEST Devashish",
                  "actor_post": "Hon. Secretary",
                  "actor_body_id": t.get("host_body_id"),
                  "notes": "TEST submit"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Submitted"

        # 5) POST /approve → status Approved
        r = api.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/approve",
            json={"actor_name": "TEST MPCA Sec",
                  "actor_post": "Hon. Secretary",
                  "actor_body_id": "MPCA",
                  "notes": "TEST approve"},
        )
        assert r.status_code == 200, r.text
        approved = r.json()
        assert approved["status"] == "Approved"
        assert approved.get("approved_total_inr") == preview["total_ceiling_inr"]

        # 6) PATCH should now be forbidden (409)
        r = api.patch(
            f"{BASE_URL}/api/tournament-budgets/{bid}",
            json=create_payload,
        )
        assert r.status_code == 409

        # Cleanup — cannot delete Approved. Leave in place for progress test.


# ── 5. Progress derivation after budget submitted ────────────────────
class TestProgressDerivation:
    def test_progress_after_budget_present(self, api):
        r = api.get(f"{BASE_URL}/api/tournaments/{TEST_TID}/progress")
        assert r.status_code == 200
        data = r.json()
        # Find phase play
        play_phase = next((p for p in data["phases"] if p["key"] == "play"), None)
        assert play_phase is not None
        # Look for budget_created step
        step = next((s for s in play_phase.get("steps", [])
                     if s["key"] == "budget_created"), None)
        assert step is not None, f"No budget_created step in play phase: {play_phase}"
        assert step["done"] is True, f"budget_created not done: {step}"
