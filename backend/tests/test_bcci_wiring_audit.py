"""BCCI Tournament Wiring Audit — MPCA-235 governance conformance.

For each of the 10 wiring steps, compare the wiring cell values (owner, mode,
visibility, flag) against the actual API-observed behavior for a BCCI-family
tournament. This is an AUDIT test suite — it does NOT fix anything, it only
records PASS / FAIL / PARTIAL verdicts in the pytest JUnit XML.

Existing BCCI-family tournaments in the fresh DB:
  • Duleep Trophy (tournament_type_code=bcci_staging, host=MPCA)
  • ZR Irani Cup  (tournament_type_code=bcci_staging, host=MPCA)

Headers used to simulate personas (per how the backend guards read them):
  MPCA:      X-Body-Type=State,   X-User-Body-Code=MPCA
  Division:  X-Body-Type=Division, X-User-Body-Code=DIV-IND
  District:  X-Body-Type=District, X-User-Body-Code=DIST-INDO-IND
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")

H_MPCA = {"X-Body-Type": "State",    "X-User-Body-Code": "MPCA",     "X-Persona-Name": "President MPCA"}
H_DIV  = {"X-Body-Type": "Division", "X-User-Body-Code": "DIV-IND",  "X-Persona-Name": "Division Sec Indore"}
H_DIST = {"X-Body-Type": "District", "X-User-Body-Code": "DIST-INDO-IND", "X-Persona-Name": "District Sec Indore"}


@pytest.fixture(scope="module")
def wiring():
    r = requests.get(f"{BASE_URL}/api/tournament-wiring", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def bcci_tournament():
    r = requests.get(f"{BASE_URL}/api/tournaments", timeout=15)
    assert r.status_code == 200
    tours = r.json()
    # pick first BCCI-family tournament
    for t in tours:
        code = (t.get("tournament_type_code") or "").lower()
        if code.startswith(("bcci", "ranji", "vijay", "duleep", "irani", "nayudu", "syed")):
            return t
    pytest.skip("No BCCI-family tournament available for audit")


@pytest.fixture(scope="module")
def status_doc(bcci_tournament):
    r = requests.get(f"{BASE_URL}/api/tournaments/{bcci_tournament['id']}/wiring-status", timeout=15)
    assert r.status_code == 200
    return r.json()


def _cell(wiring, step):
    return wiring["cells"]["bcci"][step]


# ────────────────── Step 1 · tournament_creation ──────────────────
class TestStep1TournamentCreation:
    def test_wiring_cell_bcci(self, wiring):
        c = _cell(wiring, "tournament_creation")
        assert c["flag"] == "M"
        assert c["owner"] == "MPCA"

    def test_division_cannot_create_bcci_tournament(self, wiring):
        """Wiring says only MPCA can create. Division POST /tournaments should 403."""
        payload = {
            "name": "AUDIT_TEST_BCCI_by_Division",
            "tournament_type": "BCCI",
            "tournament_type_code": "bcci_staging",
            "format": "FourDay_Senior",
            "scope": "Championship",
            "fiscal_cycle": "2026-27",
            "host_body_id": "DIV-IND",
            "start_date": "2026-05-01",
            "end_date":   "2026-05-10",
            "created_by_body_code": "DIV-IND",
        }
        r = requests.post(f"{BASE_URL}/api/tournaments", json=payload, headers=H_DIV, timeout=15)
        created_tid = None
        if r.status_code == 200:
            created_tid = r.json().get("id")
        # Direct DB cleanup best-effort (no DELETE endpoint exists)
        try:
            if created_tid:
                import sys as _sys, asyncio as _asyncio
                _sys.path.insert(0, "/app/backend")
                from core.infra import db as _db  # type: ignore
                _asyncio.get_event_loop().run_until_complete(
                    _db.tournaments.delete_one({"id": created_tid})
                )
        except Exception:
            pass
        assert r.status_code == 403, (
            f"BUG — Division persona created a BCCI tournament (status={r.status_code}). "
            f"Wiring owner=MPCA is NOT enforced on POST /api/tournaments. body={r.text[:200]}"
        )


# ────────────────── Step 2 · pool_basics ──────────────────
class TestStep2PoolBasics:
    def test_wiring_cell(self, wiring):
        c = _cell(wiring, "pool_basics")
        assert c["flag"] == "M"
        assert c["owner"] == "MPCA"

    def test_participants_readable(self, bcci_tournament):
        r = requests.get(f"{BASE_URL}/api/tournaments/{bcci_tournament['id']}/participants", timeout=15)
        assert r.status_code == 200


# ────────────────── Step 3 · match_official_posting ──────────────────
class TestStep3MatchOfficials:
    def test_wiring_cell(self, wiring):
        c = _cell(wiring, "match_official_posting")
        assert c["owner"] == "MPCA"

    def test_division_cannot_post_official(self, bcci_tournament):
        payload = {"tournament_id": bcci_tournament["id"], "official_id": "AUDIT_FAKE", "role": "Umpire"}
        r = requests.post(f"{BASE_URL}/api/tournament-match-officials",
                          json=payload, headers=H_DIV, timeout=15)
        # We expect 403 (wiring block) or 404 (endpoint variant) — NOT 200 or 201.
        assert r.status_code != 200 and r.status_code != 201, (
            f"BUG — Division could post match official for BCCI (status={r.status_code})"
        )


# ────────────────── Step 4 · squad ──────────────────
class TestStep4Squad:
    def test_wiring_cell_manual_pdf(self, wiring):
        c = _cell(wiring, "squad")
        assert c["mode"] == "Manual_PDF", f"BCCI squad mode should be Manual_PDF, got {c['mode']}"
        assert c["owner"] == "MPCA"

    def test_status_note_reflects_manual_pdf(self, status_doc):
        step = next(s for s in status_doc["steps"] if s["key"] == "squad")
        assert step["mode"] == "Manual_PDF"


# ────────────────── Step 5 · squad_approval ──────────────────
class TestStep5SquadApproval:
    def test_wiring_cell_na(self, wiring):
        c = _cell(wiring, "squad_approval")
        assert c["flag"] == "NA", f"BCCI squad_approval should be NA (MPCA uploads directly), got {c['flag']}"

    def test_status_step_is_na(self, status_doc):
        step = next(s for s in status_doc["steps"] if s["key"] == "squad_approval")
        assert step["status"] == "na"


# ────────────────── Step 6 · match_calendar (CORE USER-REPORTED BUG) ──────────────────
class TestStep6MatchCalendar:
    """User reports UI shows dropdowns for Team A/Team B instead of free-text.
    Backend accepts free-text — but frontend MatchFixtureCard.jsx forces <select>.
    """
    def test_wiring_cell_manual_pdf(self, wiring):
        c = _cell(wiring, "match_calendar")
        assert c["mode"] == "Manual_PDF"
        assert c["owner"] == "MPCA"

    def test_mpca_can_create_freetext_match(self, bcci_tournament):
        """Backend must accept free-text home_team/away_team like 'Kerala', 'Karnataka'."""
        payload = {
            "match_no": 999,
            "stage": "League",
            "match_date": "2026-05-05",
            "start_time": "09:30",
            "home_team": "Karnataka",
            "away_team": "Kerala",
            "venue_name": "Holkar Stadium",
            "notes": "AUDIT_TEST_FREETEXT",
        }
        r = requests.post(
            f"{BASE_URL}/api/tournaments/{bcci_tournament['id']}/matches",
            json=payload, headers=H_MPCA, timeout=20,
        )
        created_id = None
        try:
            assert r.status_code == 200, f"MPCA free-text match create failed: {r.status_code} {r.text[:300]}"
            data = r.json()
            assert data["home_team"] == "Karnataka"
            assert data["away_team"] == "Kerala"
            created_id = data.get("id")
        finally:
            if created_id:
                requests.delete(
                    f"{BASE_URL}/api/tournaments/{bcci_tournament['id']}/matches/{created_id}",
                    headers=H_MPCA, timeout=10,
                )

    def test_division_cannot_create_match_for_bcci(self, bcci_tournament):
        payload = {
            "match_no": 998, "stage": "League", "match_date": "2026-05-06", "start_time": "09:30",
            "home_team": "Assam", "away_team": "Bengal", "venue_name": "Holkar",
        }
        r = requests.post(
            f"{BASE_URL}/api/tournaments/{bcci_tournament['id']}/matches",
            json=payload, headers=H_DIV, timeout=20,
        )
        assert r.status_code == 403, (
            f"BUG — Division could create BCCI match (status={r.status_code})"
        )


# ────────────────── Step 7 · unified_budget ──────────────────
class TestStep7UnifiedBudget:
    def test_wiring_cell(self, wiring):
        c = _cell(wiring, "unified_budget")
        assert c["owner"] == "MPCA"
        assert c["mode"] == "Auto_Compute"


# ────────────────── Step 8 · finance_console ──────────────────
class TestStep8FinanceConsole:
    def test_wiring_cell(self, wiring):
        c = _cell(wiring, "finance_console")
        assert c["owner"] == "MPCA"
        assert c["approver"] == "MPCA"


# ────────────────── Step 9 · tournament_closure ──────────────────
class TestStep9TournamentClosure:
    def test_wiring_cell(self, wiring):
        c = _cell(wiring, "tournament_closure")
        assert c["owner"] == "MPCA"
        assert c["mode"] == "Manual_PDF"

    def test_division_cannot_close_bcci_tournament(self, bcci_tournament):
        r = requests.post(
            f"{BASE_URL}/api/tournaments/{bcci_tournament['id']}/close",
            headers=H_DIV, timeout=15,
        )
        assert r.status_code == 403, f"BUG — Division could close BCCI tournament (status={r.status_code})"


# ────────────────── Step 10 · mpca_visibility ──────────────────
class TestStep10MpcaVisibility:
    def test_wiring_cell_realtime(self, wiring):
        c = _cell(wiring, "mpca_visibility")
        assert c["visibility"] == "Realtime"
        assert c["flag"] == "INFO"
