"""Sprint M8 · Editable Tournament Calendar + Venues/Grounds validation."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

HEADERS = {"Content-Type": "application/json", "X-Role-Id": "secretary"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


@pytest.fixture(scope="module")
def seed(session):
    venues = session.get(f"{API}/venues").json()
    grounds = session.get(f"{API}/grounds").json()
    bodies = session.get(f"{API}/bodies").json()
    return {"venues": venues, "grounds": grounds, "bodies": bodies}


# ---------- Seed data checks ----------

def test_venues_seeded(seed):
    assert len(seed["venues"]) >= 5, f"expected >=5 venues, got {len(seed['venues'])}"


def test_grounds_seeded(seed):
    assert len(seed["grounds"]) >= 8, f"expected >=8 grounds, got {len(seed['grounds'])}"


def test_bodies_seeded(seed):
    codes = {b["code"] for b in seed["bodies"]}
    assert len(seed["bodies"]) >= 66, f"expected >=66 bodies, got {len(seed['bodies'])}"
    assert "MPCA" in codes
    assert "DIV-IND" in codes


# ---------- POST /api/tournaments happy path ----------

_created_ids = []


def _pick_venue_with_grounds(seed):
    """Return (venue, ground) where ground belongs to the venue."""
    grounds = seed["grounds"]
    for v in seed["venues"]:
        gs = [g for g in grounds if g.get("venue_id") == v["id"]]
        if gs:
            return v, gs[0]
    return None, None


def test_create_tournament_with_venue_and_ground(session, seed):
    v, g = _pick_venue_with_grounds(seed)
    assert v and g, "no venue with grounds found in seed"
    payload = {
        "name": "TEST_M8_Trophy_2026",
        "tournament_type": "MPCA_InterDivisional",
        "format": "Multi_Day",
        "scope": "Inter_Divisional",
        "host_body_id": "DIV-IND",
        "venue_id": v["id"],
        "ground_id": g["id"],
        "start_date": "2026-03-01",
        "end_date": "2026-03-05",
        "fiscal_cycle": "2025-26",
    }
    r = session.post(f"{API}/tournaments", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    _created_ids.append(data["id"])
    assert data["name"] == payload["name"]
    assert data["venue_id"] == v["id"]
    assert data["ground_id"] == g["id"]
    assert data["venue_name_snapshot"] == v["name"], data
    assert data["ground_name_snapshot"] == g["name"], data
    assert data["tournament_no"].startswith("TRN-2025-26-")

    # GET verification: persistence
    r2 = session.get(f"{API}/tournaments/{data['id']}")
    assert r2.status_code == 200
    got = r2.json()
    assert got["venue_name_snapshot"] == v["name"]
    assert got["ground_name_snapshot"] == g["name"]


def test_create_tournament_ground_not_belong_to_venue(session, seed):
    """Pass ground_id that belongs to a DIFFERENT venue → 400."""
    # find two venues each with at least one ground
    grounds = seed["grounds"]
    v_with_g = []
    for v in seed["venues"]:
        gs = [g for g in grounds if g.get("venue_id") == v["id"]]
        if gs:
            v_with_g.append((v, gs[0]))
        if len(v_with_g) == 2:
            break
    assert len(v_with_g) == 2, "need 2 venues with grounds"
    v1, _ = v_with_g[0]
    _, g2 = v_with_g[1]  # ground belongs to v2, not v1

    payload = {
        "name": "TEST_M8_Bad_Ground",
        "tournament_type": "MPCA_InterDivisional",
        "format": "Multi_Day",
        "scope": "Inter_Divisional",
        "host_body_id": "MPCA",
        "venue_id": v1["id"],
        "ground_id": g2["id"],
        "fiscal_cycle": "2025-26",
    }
    r = session.post(f"{API}/tournaments", json=payload)
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "does not belong" in detail.lower(), detail


def test_create_tournament_invalid_host(session):
    payload = {
        "name": "TEST_M8_Bad_Host",
        "tournament_type": "MPCA_InterDivisional",
        "format": "Multi_Day",
        "scope": "Inter_Divisional",
        "host_body_id": "XYZ-999",
        "fiscal_cycle": "2025-26",
    }
    r = session.post(f"{API}/tournaments", json=payload)
    assert r.status_code == 400, r.text
    assert "does not exist" in r.json().get("detail", "").lower()


def test_create_tournament_age_range_invalid(session):
    payload = {
        "name": "TEST_M8_Bad_Age",
        "tournament_type": "MPCA_InterDivisional",
        "format": "Multi_Day",
        "scope": "Inter_Divisional",
        "host_body_id": "MPCA",
        "age_floor_years": 25,
        "age_cap_years": 19,
        "fiscal_cycle": "2025-26",
    }
    r = session.post(f"{API}/tournaments", json=payload)
    assert r.status_code == 400, r.text
    assert "age_floor_years" in r.json().get("detail", "").lower() or "cannot exceed" in r.json().get("detail", "").lower()


def test_cleanup_created(session):
    """Best-effort cleanup: purge test tournaments via direct DB is not exposed;
    tournaments cannot be deleted via API (no DELETE route). Left as list residue.
    We at least verify records exist."""
    for tid in _created_ids:
        r = session.get(f"{API}/tournaments/{tid}")
        assert r.status_code == 200
