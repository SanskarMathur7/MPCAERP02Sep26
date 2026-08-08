"""MPCA-116 · Player Registration Campaign request/approval workflow tests."""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return (v or "").rstrip("/")

BASE_URL = _load_backend_url()

MPCA_HEADERS = {"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary", "X-Persona-Name": "Sanjeev Dua"}
DIV_IND_HEADERS = {"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary", "X-Persona-Name": "Devashish Nilosey"}
DIV_GWL_HEADERS = {"X-User-Body-Code": "DIV-GWL", "X-Role-Id": "division-secretary", "X-Persona-Name": "Kailash Vijayvargiya"}


def _mk_payload(body_code, title_suffix, cycle="2025-26"):
    return {
        "body_code": body_code,
        "cycle_code": cycle,
        "title": f"TEST_MPCA116_{title_suffix}",
        "is_active": True,
    }


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # cleanup at end
    for cid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/player-registration-campaigns/{cid}", headers=MPCA_HEADERS, timeout=10)
        except Exception:
            pass


# ─── Creation status defaults ──────────────────────────────────────────────
def test_mpca_creates_approved(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("MPCA", "mpca_auto_approved"),
                      headers=MPCA_HEADERS, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["request_status"] == "Approved"
    assert data["approved_by"] == "MPCA"
    assert data["approved_at"] is not None
    created_ids.append(data["id"])


def test_division_creates_pending(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "div_pending"),
                      headers=DIV_IND_HEADERS, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["request_status"] == "Pending"
    assert data["approved_by"] is None
    created_ids.append(data["id"])


# ─── Approve endpoint ──────────────────────────────────────────────────────
def test_approve_by_mpca_success(created_ids):
    # create pending as division
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "to_approve"),
                      headers=DIV_IND_HEADERS, timeout=10)
    cid = r.json()["id"]
    created_ids.append(cid)

    r2 = requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/approve-request",
                       headers=MPCA_HEADERS, timeout=10)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["request_status"] == "Approved"
    assert data["approved_by"] in ("Sanjeev Dua", "MPCA")

    # idempotent
    r3 = requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/approve-request",
                       headers=MPCA_HEADERS, timeout=10)
    assert r3.status_code == 200
    assert r3.json()["request_status"] == "Approved"


def test_approve_by_division_forbidden(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "div_cannot_approve"),
                      headers=DIV_IND_HEADERS, timeout=10)
    cid = r.json()["id"]
    created_ids.append(cid)

    r2 = requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/approve-request",
                       headers=DIV_IND_HEADERS, timeout=10)
    assert r2.status_code == 403


# ─── Reject endpoint ───────────────────────────────────────────────────────
def test_reject_by_mpca_success(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "to_reject"),
                      headers=DIV_IND_HEADERS, timeout=10)
    cid = r.json()["id"]
    created_ids.append(cid)

    r2 = requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/reject-request",
                       json={"reason": "Duplicate cycle"}, headers=MPCA_HEADERS, timeout=10)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["request_status"] == "Rejected"
    assert data["rejection_reason"] == "Duplicate cycle"


def test_reject_by_division_forbidden(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "div_cannot_reject"),
                      headers=DIV_IND_HEADERS, timeout=10)
    cid = r.json()["id"]
    created_ids.append(cid)

    r2 = requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/reject-request",
                       json={"reason": "test"}, headers=DIV_IND_HEADERS, timeout=10)
    assert r2.status_code == 403


def test_reject_empty_reason_400(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "empty_reason"),
                      headers=DIV_IND_HEADERS, timeout=10)
    cid = r.json()["id"]
    created_ids.append(cid)

    r2 = requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/reject-request",
                       json={"reason": "  "}, headers=MPCA_HEADERS, timeout=10)
    assert r2.status_code == 400


# ─── Public form guard ─────────────────────────────────────────────────────
def test_public_token_pending_403(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "pending_public"),
                      headers=DIV_IND_HEADERS, timeout=10)
    camp = r.json()
    created_ids.append(camp["id"])
    token = camp["public_token"]

    r2 = requests.get(f"{BASE_URL}/api/public/player-registration/token/{token}", timeout=10)
    assert r2.status_code == 403
    assert "approval" in r2.text.lower() or "awaiting" in r2.text.lower()


def test_public_token_rejected_403(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "rejected_public"),
                      headers=DIV_IND_HEADERS, timeout=10)
    camp = r.json()
    created_ids.append(camp["id"])
    cid = camp["id"]
    token = camp["public_token"]

    requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/reject-request",
                  json={"reason": "test reject"}, headers=MPCA_HEADERS, timeout=10)

    r2 = requests.get(f"{BASE_URL}/api/public/player-registration/token/{token}", timeout=10)
    assert r2.status_code == 403


def test_public_token_approved_ok(created_ids):
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                      json=_mk_payload("DIV-IND", "approved_public"),
                      headers=DIV_IND_HEADERS, timeout=10)
    camp = r.json()
    created_ids.append(camp["id"])
    cid = camp["id"]
    token = camp["public_token"]

    requests.post(f"{BASE_URL}/api/player-registration-campaigns/{cid}/approve-request",
                  headers=MPCA_HEADERS, timeout=10)

    r2 = requests.get(f"{BASE_URL}/api/public/player-registration/token/{token}", timeout=10)
    assert r2.status_code == 200, r2.text
    env = r2.json()
    assert env["kind"] == "campaign"
    assert env["campaign_id"] == cid


# ─── Scoping regression ────────────────────────────────────────────────────
def test_list_scoping_division_only_sees_own(created_ids):
    # create some data for both divs
    r_ind = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                          json=_mk_payload("DIV-IND", "scope_ind"),
                          headers=DIV_IND_HEADERS, timeout=10)
    r_gwl = requests.post(f"{BASE_URL}/api/player-registration-campaigns",
                          json=_mk_payload("DIV-GWL", "scope_gwl"),
                          headers=DIV_GWL_HEADERS, timeout=10)
    created_ids.append(r_ind.json()["id"])
    created_ids.append(r_gwl.json()["id"])

    r = requests.get(f"{BASE_URL}/api/player-registration-campaigns", headers=DIV_IND_HEADERS, timeout=10)
    assert r.status_code == 200
    for c in r.json():
        assert c["body_code"] == "DIV-IND", f"Div-IND saw foreign campaign: {c['body_code']}"

    # MPCA sees all
    r2 = requests.get(f"{BASE_URL}/api/player-registration-campaigns", headers=MPCA_HEADERS, timeout=10)
    assert r2.status_code == 200
    codes = {c["body_code"] for c in r2.json()}
    assert "DIV-IND" in codes and "DIV-GWL" in codes
