"""MPCA-133+ Match Official portal (accept/reject/me + notifications)."""
import os
import time
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

_MONGO = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_DB = _MONGO[os.environ.get("DB_NAME", "test_database")]


def _find_notifications(query: dict):
    async def _q():
        return await _DB.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(20)
    return asyncio.get_event_loop().run_until_complete(_q())

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MPCA_HEADERS = {
    "X-Body-Type": "State",
    "X-Role-Id": "secretary",
    "X-Persona-Name": "Sanjeev Dua",
}
OFFICIAL_NAME = "Chandrakant Pandit"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def tournament_id(api):
    r = api.get(f"{BASE_URL}/api/tournaments")
    assert r.status_code == 200
    ts = r.json()
    assert ts, "No tournaments seeded"
    return ts[0]["id"]


@pytest.fixture(scope="module")
def umpire_id(api):
    r = api.get(f"{BASE_URL}/api/match-officials", params={"role": "Umpire", "active_only": True})
    assert r.status_code == 200
    officials = r.json()
    # Prefer Chandrakant Pandit
    for o in officials:
        if o["full_name"].lower() == OFFICIAL_NAME.lower():
            return o["id"]
    return officials[0]["id"]


@pytest.fixture(scope="module")
def assignment_id(api, tournament_id, umpire_id):
    body = {"official_id": umpire_id, "role": "Umpire", "days": 3, "notes": "TEST_mpca133plus"}
    r = api.post(
        f"{BASE_URL}/api/tournaments/{tournament_id}/match-officials",
        json=body, headers=MPCA_HEADERS,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["acceptance_status"] == "Pending"
    assert d.get("tournament_name")
    assert d.get("official_name")
    return d["id"]


# ── Notification on assign ──────────────────────────────────────────────────
def test_notification_created_on_assign(api, assignment_id, umpire_id):
    time.sleep(0.3)
    hit = _find_notifications({"related_id": assignment_id, "kind": "assignment"})
    assert hit, f"No assignment notification for {assignment_id}"
    n = hit[0]
    assert n["recipient_type"] == "match_official"
    assert n["recipient_id"] == umpire_id
    assert n["link"] == "/my-assignments"


# ── /me/assignments ─────────────────────────────────────────────────────────
def test_me_assignments_requires_header(api):
    r = api.get(f"{BASE_URL}/api/match-officials/me/assignments")
    assert r.status_code == 400


def test_me_assignments_case_insensitive(api, assignment_id):
    r = api.get(
        f"{BASE_URL}/api/match-officials/me/assignments",
        headers={"X-Persona-Name": OFFICIAL_NAME.upper()},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "count" in data and "assignments" in data
    rows = data["assignments"]
    assert any(r_["id"] == assignment_id for r_ in rows)
    row = next(r_ for r_ in rows if r_["id"] == assignment_id)
    assert row["fee_total_inr"] == row["per_day_fee_inr"] * row["days"]
    assert row["da_total_inr"] == row["per_day_da_inr"] * row["days"]
    assert row["grand_total_inr"] == row["fee_total_inr"] + row["da_total_inr"]


# ── Reject with empty reason ────────────────────────────────────────────────
def test_reject_empty_reason(api, tournament_id, assignment_id):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{tournament_id}/match-officials/{assignment_id}/reject",
        json={"reason": ""},
        headers={"X-Persona-Name": OFFICIAL_NAME},
    )
    assert r.status_code == 400


# ── Reject as random persona ────────────────────────────────────────────────
def test_reject_wrong_persona_forbidden(api, tournament_id, assignment_id):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{tournament_id}/match-officials/{assignment_id}/reject",
        json={"reason": "Conflict"},
        headers={"X-Persona-Name": "Devashish Nilosey", "X-Role-Id": "division-secretary"},
    )
    assert r.status_code == 403


def test_accept_wrong_persona_forbidden(api, tournament_id, assignment_id):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{tournament_id}/match-officials/{assignment_id}/accept",
        headers={"X-Persona-Name": "Random Person", "X-Role-Id": "district-secretary"},
    )
    assert r.status_code == 403


# ── Accept flow ─────────────────────────────────────────────────────────────
def test_accept_by_official(api, tournament_id, assignment_id):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{tournament_id}/match-officials/{assignment_id}/accept",
        headers={"X-Persona-Name": OFFICIAL_NAME.lower()},  # case-insensitive
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["acceptance_status"] == "Accepted"
    assert d["responded_at"]
    assert d.get("rejection_reason") in (None, "")


# ── Reject flow — new assignment ────────────────────────────────────────────
def test_reject_by_official_creates_notification(api, tournament_id, umpire_id):
    body = {"official_id": umpire_id, "role": "Umpire", "days": 2, "notes": "TEST_reject_row"}
    r = api.post(
        f"{BASE_URL}/api/tournaments/{tournament_id}/match-officials",
        json=body, headers=MPCA_HEADERS,
    )
    assert r.status_code == 200
    aid = r.json()["id"]
    reason = "Conflict on 2026-08-12"
    r2 = api.post(
        f"{BASE_URL}/api/tournaments/{tournament_id}/match-officials/{aid}/reject",
        json={"reason": reason},
        headers={"X-Persona-Name": OFFICIAL_NAME},
    )
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["acceptance_status"] == "Rejected"
    assert d["rejection_reason"] == reason
    assert d["responded_at"]
    # Notification to MPCA secretary
    time.sleep(0.3)
    hit = _find_notifications({"related_id": aid, "recipient_id": "secretary"})
    assert hit, "No reject notification to secretary"
    assert hit[0].get("severity") == "warning"
    assert hit[0].get("recipient_type") == "role"


# ── Create tournament → notification to secretary ───────────────────────────
def test_create_tournament_notifies_secretary(api):
    payload = {
        "name": "TEST_MPCA133 Tournament Notify",
        "format": "Multi_Day",
        "scope": "Inter_District",
        "tournament_type": "MPCA_InterDivisional",
        "tournament_type_code": "inter_district",
        "fiscal_cycle": "2026-27",
        "host_body_id": "MPCA",
        "max_squad_size": 18,
    }
    r = api.post(f"{BASE_URL}/api/tournaments", json=payload, headers=MPCA_HEADERS)
    if r.status_code == 403:
        pytest.skip(f"Season not activated: {r.text}")
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    time.sleep(0.3)
    hit = _find_notifications({"related_id": tid, "related_type": "tournament",
                               "recipient_id": "secretary", "kind": "reminder"})
    assert hit, "No tournament-created reminder for secretary"
    assert "post match officials" in hit[0].get("title", "").lower()
    assert hit[0].get("link", "").startswith(f"/tournaments/{tid}")
