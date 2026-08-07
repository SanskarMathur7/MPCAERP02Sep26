"""MPCA-133 · Central Match-Official Assignment tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TOURNAMENT_ID = "16a2fdd5-aac0-4832-9ad5-a862c31b33cd"  # Bhopal Division Inter-District


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mpca_headers():
    return {
        "X-Body-Type": "State",
        "X-Role-Id": "secretary",
        "X-Persona-Name": "Sanjeev Dua",
    }


@pytest.fixture(scope="module")
def umpire_id(api):
    r = api.get(f"{BASE_URL}/api/match-officials", params={"role": "Umpire", "active_only": True})
    assert r.status_code == 200, r.text
    officials = r.json()
    assert len(officials) > 0, "No umpires seeded"
    return officials[0]["id"]


# ── Rate card ──
def test_get_standard_rates(api):
    r = api.get(f"{BASE_URL}/api/match-officials/rates/standard")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["fee_per_day"] == {"Umpire": 700, "Scorer": 500, "Referee": 1500, "Physio": 1200}
    assert data["da_per_day"] == {"Umpire": 500, "Scorer": 400, "Referee": 700, "Physio": 400}
    assert "note" in data


# ── Assignment (MPCA-only) ──
def test_assign_mpca_ok(api, mpca_headers, umpire_id):
    body = {"official_id": umpire_id, "role": "Umpire", "days": 3, "notes": "TEST_mpca133"}
    r = api.post(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials",
        json=body, headers=mpca_headers,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["role"] == "Umpire"
    assert d["days"] == 3
    assert d["per_day_fee_inr"] == 700
    assert d["per_day_da_inr"] == 500
    assert d["official_name"]
    assert d["assigned_at"]
    # Stash for later tests
    pytest.assigned_id = d["id"]


def test_assign_division_forbidden(api, umpire_id):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials",
        json={"official_id": umpire_id, "role": "Umpire", "days": 2},
        headers={"X-Body-Type": "Division", "X-Role-Id": "division-secretary"},
    )
    assert r.status_code == 403
    assert "MPCA-133" in r.json().get("detail", "")


def test_assign_district_forbidden(api, umpire_id):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials",
        json={"official_id": umpire_id, "role": "Umpire", "days": 2},
        headers={"X-Body-Type": "District", "X-Role-Id": "district-secretary"},
    )
    assert r.status_code == 403


def test_assign_bad_role(api, mpca_headers, umpire_id):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials",
        json={"official_id": umpire_id, "role": "InvalidRole", "days": 2},
        headers=mpca_headers,
    )
    assert r.status_code == 400


def test_assign_missing_official(api, mpca_headers):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials",
        json={"official_id": "does-not-exist", "role": "Umpire", "days": 2},
        headers=mpca_headers,
    )
    assert r.status_code == 404


# ── List & summary ──
def test_list_assignments(api):
    r = api.get(f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    assert any(a.get("id") == getattr(pytest, "assigned_id", None) for a in rows)


def test_summary_math(api):
    r = api.get(f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials/summary")
    assert r.status_code == 200
    s = r.json()
    assert s["paid_by"] == "MPCA (central pool)"
    # Recompute
    rows = api.get(f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials").json()
    expect_fee = sum(a["per_day_fee_inr"] * a["days"] for a in rows)
    expect_da  = sum(a["per_day_da_inr"]  * a["days"] for a in rows)
    assert s["fee_total_inr"] == expect_fee
    assert s["da_total_inr"] == expect_da
    assert s["grand_total_inr"] == expect_fee + expect_da


# ── Patch (MPCA only) ──
def test_patch_days_mpca(api, mpca_headers):
    aid = pytest.assigned_id
    r = api.patch(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials/{aid}",
        json={"days": 5}, headers=mpca_headers,
    )
    assert r.status_code == 200
    assert r.json()["days"] == 5


def test_patch_days_division_forbidden(api):
    aid = pytest.assigned_id
    r = api.patch(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials/{aid}",
        json={"days": 6},
        headers={"X-Body-Type": "Division"},
    )
    assert r.status_code == 403


# ── Delete (MPCA only) ──
def test_delete_division_forbidden(api):
    aid = pytest.assigned_id
    r = api.delete(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials/{aid}",
        headers={"X-Body-Type": "Division"},
    )
    assert r.status_code == 403


def test_delete_mpca_ok(api, mpca_headers):
    aid = pytest.assigned_id
    r = api.delete(
        f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials/{aid}",
        headers=mpca_headers,
    )
    assert r.status_code == 200
    # Verify removed
    rows = api.get(f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/match-officials").json()
    assert not any(a["id"] == aid for a in rows)
