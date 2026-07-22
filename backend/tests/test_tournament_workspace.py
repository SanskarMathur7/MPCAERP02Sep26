"""
Sprint M19 · Tournament Workspace end-to-end backend tests
──────────────────────────────────────────────────────────
Covers:
  • Tournament create with tournament_type_code persistence
  • /tournaments/{id}/progress derivation (5-phase)
  • /tournaments/{id}/matches CRUD + calendar-lock
  • /tournaments/{id}/receipts CRUD
  • /tournaments/{id}/financial-summary shape
  • /tournaments/{id}/closure-letter generate + fetch
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading the frontend .env directly for pytest runs.
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def tournament_id(api):
    # Create a tournament with tournament_type_code='inter_div' and DIV-IND host
    payload = {
        "name": f"TEST_M19_Utility_Trophy_{uuid.uuid4().hex[:6]}",
        "tournament_type": "MPCA_InterDivisional",
        "tournament_type_code": "inter_div",
        "format": "Multi_Day",
        "scope": "Inter_Divisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "start_date": "2026-03-10",
        "end_date": "2026-03-15",
        "max_squad_size": 18,
    }
    r = api.post(f"{BASE_URL}/api/tournaments", json=payload)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["name"] == payload["name"]
    assert data.get("tournament_type_code") == "inter_div", "tournament_type_code not persisted"
    tid = data["id"]
    yield tid
    # Cleanup
    try:
        api.delete(f"{BASE_URL}/api/tournaments/{tid}")
    except Exception:
        pass


# ─── Tournament basics ───

class TestTournamentCreate:
    def test_type_code_persisted_on_get(self, api, tournament_id):
        r = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}")
        assert r.status_code == 200
        d = r.json()
        assert d["tournament_type_code"] == "inter_div"
        assert d["host_body_id"] == "DIV-IND"


# ─── Progress ───

class TestProgress:
    def test_progress_shape(self, api, tournament_id):
        r = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/progress")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["tournament_id"] == tournament_id
        assert "percent" in d and isinstance(d["percent"], int)
        assert d["current_phase"] in ["setup", "squad", "play", "claim", "payment"]
        keys = [p["key"] for p in d["phases"]]
        assert keys == ["setup", "squad", "play", "claim", "payment"]

    def test_setup_phase_steps(self, api, tournament_id):
        d = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/progress").json()
        setup = next(p for p in d["phases"] if p["key"] == "setup")
        step_keys = [s["key"] for s in setup["steps"]]
        assert step_keys == ["created", "input_vars", "accepted", "calendar"]
        created = next(s for s in setup["steps"] if s["key"] == "created")
        assert created["done"] is True
        input_vars = next(s for s in setup["steps"] if s["key"] == "input_vars")
        assert input_vars["done"] is False  # new tournament
        # For DIV-IND host this should require acceptance
        accepted = next(s for s in setup["steps"] if s["key"] == "accepted")
        assert accepted["done"] is False


# ─── Matches CRUD + Calendar Lock ───

class TestMatchesAndCalendar:
    def test_matches_full_flow(self, api, tournament_id):
        # Empty initially
        r = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/matches")
        assert r.status_code == 200
        assert r.json() == []

        # Create match 1
        m1 = api.post(f"{BASE_URL}/api/tournaments/{tournament_id}/matches", json={
            "stage": "League",
            "match_date": "2026-03-10",
            "start_time": "10:00",
            "home_team": "Indore XI",
            "away_team": "Bhopal XI",
            "venue_name": "Holkar Stadium",
        })
        assert m1.status_code == 200, m1.text
        m1d = m1.json()
        assert m1d["home_team"] == "Indore XI"
        assert m1d["match_no"] == 1

        # Create match 2
        m2 = api.post(f"{BASE_URL}/api/tournaments/{tournament_id}/matches", json={
            "stage": "League", "match_date": "2026-03-12",
            "home_team": "Gwalior XI", "away_team": "Jabalpur XI",
            "venue_name": "Holkar Stadium",
        })
        assert m2.status_code == 200
        assert m2.json()["match_no"] == 2

        # List
        r = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/matches")
        assert len(r.json()) == 2

        # Lock calendar
        r = api.patch(f"{BASE_URL}/api/tournaments/{tournament_id}/calendar-lock?locked=true")
        assert r.status_code == 200
        assert r.json().get("calendar_fixed") is True

        # Progress step calendar should now be done
        p = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/progress").json()
        setup = next(pp for pp in p["phases"] if pp["key"] == "setup")
        cal_step = next(s for s in setup["steps"] if s["key"] == "calendar")
        assert cal_step["done"] is True

    def test_input_variables_patch(self, api, tournament_id):
        r = api.patch(f"{BASE_URL}/api/tournaments/{tournament_id}/input-variables", json={
            "input_variables": {"days": 5, "teams": 4}
        })
        assert r.status_code == 200
        # Verify by GET tournament
        t = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}").json()
        assert t.get("input_variables", {}).get("days") == 5


# ─── Receipts ───

class TestReceipts:
    def test_receipt_crud(self, api, tournament_id):
        r = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/receipts")
        assert r.status_code == 200
        starting = len(r.json())

        c = api.post(f"{BASE_URL}/api/tournaments/{tournament_id}/receipts", json={
            "receipt_date": "2026-03-16",
            "amount_inr": 50000.0,
            "mode": "NEFT",
            "reference_no": "UTR12345",
        })
        assert c.status_code == 200, c.text
        rid = c.json()["id"]
        assert c.json()["amount_inr"] == 50000.0
        assert c.json()["receipt_no"].startswith("MPCA-RCT-")

        listing = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/receipts").json()
        assert len(listing) == starting + 1

        # Delete
        d = api.delete(f"{BASE_URL}/api/tournaments/{tournament_id}/receipts/{rid}")
        assert d.status_code == 200


# ─── Financial Summary ───

class TestFinancialSummary:
    def test_summary_shape(self, api, tournament_id):
        r = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}/financial-summary")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("budget", "actuals", "claim", "receipts", "variance_inr"):
            assert k in d
        assert "total_inr" in d["budget"]
        assert "total_spend_inr" in d["actuals"]


# ─── Closure Letter ───

class TestClosureLetter:
    def test_generate_and_fetch(self, api, tournament_id):
        r = api.post(f"{BASE_URL}/api/tournaments/{tournament_id}/closure-letter", json={
            "issued_by_name": "Shri Sanjeev Dua",
            "issued_by_post": "Hon. Secretary, MPCA",
            "additional_notes": "TEST closure letter",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        body = d["body_text"]
        assert "MADHYA PRADESH CRICKET ASSOCIATION" in body
        assert "TOURNAMENT CLOSURE CERTIFICATE" in body
        # Tournament name from fixture
        t = requests.get(f"{BASE_URL}/api/tournaments/{r.json()['tournament_id']}").json()
        assert t["name"] in body

        # GET
        r2 = requests.get(f"{BASE_URL}/api/tournaments/{d['tournament_id']}/closure-letter")
        assert r2.status_code == 200
        assert "TOURNAMENT CLOSURE CERTIFICATE" in r2.json()["body_text"]

    def test_closure_flag_on_tournament(self, api, tournament_id):
        t = api.get(f"{BASE_URL}/api/tournaments/{tournament_id}").json()
        assert t.get("closure_letter_generated_at")


# ─── Type picker: catalog is a static frontend constant, but ensure
# the schema accepts all 11 codes on create.
CATALOG_CODES = [
    "inter_div", "inter_district", "inter_div_travel", "pre_camp", "reciprocal",
    "coaching_camp", "vacation_camp", "inter_school", "inter_club",
    "bcci_staging", "away_participation",
]


class TestAllTypeCodesAccepted:
    @pytest.mark.parametrize("code", CATALOG_CODES)
    def test_create_accepts_code(self, api, code):
        payload = {
            "name": f"TEST_types_{code}_{uuid.uuid4().hex[:4]}",
            "tournament_type": "MPCA_InterDivisional" if code != "bcci_staging" and code != "away_participation" else "BCCI",
            "tournament_type_code": code,
            "format": "Multi_Day",
            "scope": "Inter_Divisional",
            "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA",
        }
        r = api.post(f"{BASE_URL}/api/tournaments", json=payload)
        assert r.status_code in (200, 201), f"{code}: {r.status_code} {r.text[:200]}"
        d = r.json()
        assert d.get("tournament_type_code") == code
        api.delete(f"{BASE_URL}/api/tournaments/{d['id']}")
