"""Sprint M24 · TournamentBasicsPanel backend tests.

Verifies:
  1. PATCH /api/tournaments/{tid}/setup-meta persists setup_meta.
  2. GET /api/tournaments/{tid}/progress derives basics/teams/grounds sub-steps
     for regular (inter_div) and camp (pre_camp) flavours.
  3. POST /api/tournaments still works for inter_div (MPCA scope) and
     inter_district (Division scope) create flows.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def created_ids():
    return []


def _create(s, code, scope, host, name):
    payload = {
        "name": name,
        "format": "Multi_Day",
        "scope": scope,
        "tournament_type": "MPCA_InterDivisional",
        "tournament_type_code": code,
        "host_body_id": host,
        "fiscal_cycle": "2025-26",
        "start_date": "2026-02-15",
        "end_date": "2026-02-20",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# ── Create flows ──

def test_create_inter_div_mpca(s, created_ids):
    t = _create(s, "inter_div", "Inter_Divisional", "DIV-IND", f"TEST_M24 InterDiv {uuid.uuid4().hex[:6]}")
    assert t["tournament_type_code"] == "inter_div"
    assert t["host_body_id"] == "DIV-IND"
    assert "id" in t
    created_ids.append(t["id"])


def test_create_inter_district_division(s, created_ids):
    t = _create(s, "inter_district", "Inter_District", "DIST-INDO-IND",
                f"TEST_M24 InterDistrict {uuid.uuid4().hex[:6]}")
    assert t["tournament_type_code"] == "inter_district"
    created_ids.append(t["id"])


def test_create_pre_camp(s, created_ids):
    payload = {
        "name": f"TEST_M24 PreCamp {uuid.uuid4().hex[:6]}",
        "format": "One_Day",
        "scope": "Inter_District",
        "tournament_type": "Other",
        "tournament_type_code": "pre_camp",
        "host_body_id": "DIV-IND",
        "fiscal_cycle": "2025-26",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["tournament_type_code"] == "pre_camp"
    created_ids.append(t["id"])


# ── setup-meta persistence ──

def test_setup_meta_patch_and_get(s, created_ids):
    tid = created_ids[0]
    meta = {
        "category": "Senior Men",
        "age_group": "U-25",
        "teams": [
            {"id": 1, "name": "DIV-IND", "pool": "A", "is_host": True},
            {"id": 2, "name": "DIV-BPL", "pool": "A", "is_host": False},
        ],
        "grounds": [{"id": 1, "venue_name": "Holkar Stadium", "ground_name": "Main"}],
    }
    r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": meta})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["setup_meta"]["category"] == "Senior Men"
    assert body["setup_meta"]["age_group"] == "U-25"
    assert len(body["setup_meta"]["teams"]) == 2

    # Confirm via GET tournament
    r2 = s.get(f"{API}/tournaments/{tid}")
    assert r2.status_code == 200
    assert r2.json()["setup_meta"]["teams"][0]["name"] == "DIV-IND"


def test_progress_derivation_after_basics(s, created_ids):
    tid = created_ids[0]
    r = s.get(f"{API}/tournaments/{tid}/progress")
    assert r.status_code == 200
    p = r.json()
    setup_phase = next(ph for ph in p["phases"] if ph["key"] == "setup")
    steps = {s["key"]: s["done"] for s in setup_phase["steps"]}
    assert steps["created"] is True
    assert steps["basics"] is True, "basics should be marked done"
    assert steps["teams"] is True, "teams should be marked done"
    assert steps["grounds"] is True, "grounds should be marked done"
    # NOTE: 40% requires input_vars + accepted + calendar set too. We only save basics here so 4/19 ≈ 21% is expected.
    assert p["percent"] >= 15


def test_camp_progress_player_group_lights_teams(s, created_ids):
    # Last created is the pre_camp
    tid = created_ids[-1]
    meta = {
        "category": "Senior",
        "age_group": "U-25",
        "player_group": "U-25 shortlist",
        "player_count": 22,
        "grounds": [{"id": 1, "venue_name": "Emerald Heights", "ground_name": "A"}],
    }
    r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": meta})
    assert r.status_code == 200

    r2 = s.get(f"{API}/tournaments/{tid}/progress")
    assert r2.status_code == 200
    steps = {s["key"]: s["done"] for s in
             next(ph for ph in r2.json()["phases"] if ph["key"] == "setup")["steps"]}
    assert steps["basics"] is True
    assert steps["teams"] is True, "player_group should mark teams step done"
    assert steps["grounds"] is True


def test_setup_meta_404(s):
    r = s.patch(f"{API}/tournaments/does-not-exist-xyz/setup-meta",
                json={"setup_meta": {"category": "x", "age_group": "y"}})
    assert r.status_code == 404


# ── Cleanup ──

def test_cleanup(s, created_ids):
    for tid in created_ids:
        s.delete(f"{API}/tournaments/{tid}")
    # Best-effort; even if delete not supported, don't fail.
    assert True
