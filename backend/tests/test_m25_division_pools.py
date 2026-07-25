"""
Sprint M25 · Division Pools & Host — backend regression
Covers:
  • GET /api/bodies?body_type=Division returns the 10 MP divisions
  • PATCH /api/tournaments/{tid}/setup-meta persists `division_pools`
  • Subsequent GET /api/tournaments/{tid} echoes the pools
  • GET /api/tournaments/{tid}/progress marks setup.teams done when only division_pools present
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def tournament(s):
    """Create an inter-divisional tournament for pool tests."""
    payload = {
        "name": f"TEST_M25 Pool Tournament {uuid.uuid4().hex[:6]}",
        "tournament_type_code": "inter_div",
        "format": "T20",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "start_date": "2026-03-01",
        "end_date": "2026-03-10",
        "scope": "Inter_Divisional",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ─── Divisions catalog ──────────────────────────────
class TestDivisionsCatalog:
    def test_bodies_division_returns_10(self, s):
        r = s.get(f"{API}/bodies", params={"body_type": "Division"})
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) == 10
        codes = {b["code"] for b in rows}
        for c in ["DIV-BPL", "DIV-IND", "DIV-JBP", "DIV-GWL", "DIV-UJN"]:
            assert c in codes, f"missing {c}"


# ─── setup-meta division_pools persistence ────────────
class TestDivisionPoolsPersistence:
    def test_patch_and_reread(self, s, tournament):
        tid = tournament["id"]
        setup_meta = {
            "category": "Senior Men",
            "age_group": "Senior",
            "division_pools": [
                {
                    "id": "pool1",
                    "name": "Pool A",
                    "division_codes": ["DIV-BPL", "DIV-IND"],
                    "host_division_code": "DIV-BPL",
                },
                {
                    "id": "pool2",
                    "name": "Pool B",
                    "division_codes": ["DIV-JBP", "DIV-GWL"],
                    "host_division_code": "DIV-JBP",
                },
            ],
        }
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup_meta})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["setup_meta"]["division_pools"][0]["host_division_code"] == "DIV-BPL"

        # Re-fetch via GET /tournaments/{tid}
        r2 = s.get(f"{API}/tournaments/{tid}")
        assert r2.status_code == 200
        t = r2.json()
        sm = t.get("setup_meta") or {}
        pools = sm.get("division_pools") or []
        assert len(pools) == 2
        assert {p["name"] for p in pools} == {"Pool A", "Pool B"}
        assert pools[0]["division_codes"] == ["DIV-BPL", "DIV-IND"]
        assert pools[0]["host_division_code"] == "DIV-BPL"
        assert pools[1]["host_division_code"] == "DIV-JBP"


# ─── progress derivation for division_pools ───────────
class TestProgressDivisionPools:
    def test_teams_step_done_via_division_pools(self, s):
        # fresh tournament with ONLY division_pools (no teams/pools/player_group)
        payload = {
            "name": f"TEST_M25 Progress {uuid.uuid4().hex[:6]}",
            "tournament_type_code": "inter_div",
            "format": "T20",
            "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND",
            "start_date": "2026-04-01",
            "end_date": "2026-04-05",
            "scope": "Inter_Divisional",
        }
        r = s.post(f"{API}/tournaments", json=payload)
        assert r.status_code in (200, 201)
        tid = r.json()["id"]

        setup_meta = {
            "category": "Senior Men",
            "age_group": "Senior",
            "division_pools": [
                {"id": "p1", "name": "Pool A",
                 "division_codes": ["DIV-BPL"], "host_division_code": "DIV-BPL"}
            ],
        }
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup_meta})
        assert r.status_code == 200

        r = s.get(f"{API}/tournaments/{tid}/progress")
        assert r.status_code == 200
        prog = r.json()
        setup_phase = next(p for p in prog["phases"] if p["key"] == "setup")
        teams_step = next(s for s in setup_phase["steps"] if s["key"] == "teams")
        assert teams_step["done"] is True, f"teams step should be done: {teams_step}"
        # basics also done
        basics_step = next(s for s in setup_phase["steps"] if s["key"] == "basics")
        assert basics_step["done"] is True

    def test_teams_step_not_done_when_empty(self, s):
        payload = {
            "name": f"TEST_M25 Empty {uuid.uuid4().hex[:6]}",
            "tournament_type_code": "inter_div",
            "format": "T20",
            "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND",
            "start_date": "2026-05-01",
            "end_date": "2026-05-05",
            "scope": "Inter_Divisional",
        }
        r = s.post(f"{API}/tournaments", json=payload)
        tid = r.json()["id"]
        r = s.get(f"{API}/tournaments/{tid}/progress")
        assert r.status_code == 200
        setup_phase = next(p for p in r.json()["phases"] if p["key"] == "setup")
        teams_step = next(s for s in setup_phase["steps"] if s["key"] == "teams")
        assert teams_step["done"] is False
