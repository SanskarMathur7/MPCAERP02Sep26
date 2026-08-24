"""Iter 128 · Player Correction Request workflow — backend tests.

Uses the sysadmin JWT which resolves to body_code=MPCA + SysAdmin role, so
request-correction is authorised. Also verifies the public no-auth endpoints
and boundary conditions (bad flags, approved reg, 410 after resubmit).
"""
import os
import time
import pytest
import requests

def _load_frontend_env_url():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        return ""
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env_url()).rstrip("/")
API = f"{BASE_URL}/api"
TEST_RID_SUBMITTED = "c5c7897e36a04f6b983cdce48077a5d1"  # Correction_Requested; code allows re-request

# module-level shared state (pytest namespace tricks aren't reliable)
_state = {}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "sysadmin@mpca.in", "password": "mpca@2026"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def approved_rid(hdr):
    r = requests.get(f"{API}/player-registrations?limit=200", headers=hdr)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    for x in items:
        if x.get("status") == "Approved":
            return x["id"]
    pytest.skip("No approved registration available")


def _payload(note="Please correct these items — thanks.", fields=None, docs=None):
    return {
        "actor_name": "Test Reviewer",
        "overall_note": note,
        "field_flags": fields if fields is not None else [
            {"key": "aadhaar_no", "label": "Aadhaar No", "remark": "Number does not match card"},
        ],
        "document_flags": docs if docs is not None else [
            {"key": "aadhaar_url", "label": "Aadhaar card", "remark": "Blurry scan", "is_new": False},
        ],
        "origin": "http://localhost:3000",
    }


class TestCorrectionCreate:
    def test_happy_create(self, hdr):
        r = requests.post(
            f"{API}/player-registrations/{TEST_RID_SUBMITTED}/request-correction",
            headers=hdr, json=_payload())
        assert r.status_code == 200, r.text
        body = r.json()
        assert "request" in body and "link" in body
        req = body["request"]
        assert req["status"] == "Pending"
        assert req["registration_id"] == TEST_RID_SUBMITTED
        assert body["link"].endswith(f"/register/player/correct/{req['token']}")
        # notification result present (mocked)
        assert req.get("notification_result") is not None
        # Persist for later tests
        _state["req"] = req
        _state["link"] = body["link"]
        # Registration status flipped
        g = requests.get(f"{API}/player-registrations/{TEST_RID_SUBMITTED}", headers=hdr)
        assert g.status_code == 200
        assert g.json().get("status") == "Correction_Requested"
        # NB: latest_correction_id is persisted but stripped by PlayerRegistration
        # response_model — see backend_issues.minor in the iter report.

    def test_reject_empty_note(self, hdr):
        r = requests.post(
            f"{API}/player-registrations/{TEST_RID_SUBMITTED}/request-correction",
            headers=hdr, json=_payload(note="   "))
        assert r.status_code == 400, r.text

    def test_reject_no_flags(self, hdr):
        r = requests.post(
            f"{API}/player-registrations/{TEST_RID_SUBMITTED}/request-correction",
            headers=hdr, json=_payload(fields=[], docs=[]))
        assert r.status_code == 400, r.text

    def test_reject_unknown_field_key(self, hdr):
        r = requests.post(
            f"{API}/player-registrations/{TEST_RID_SUBMITTED}/request-correction",
            headers=hdr, json=_payload(fields=[
                {"key": "totally_bogus_key_xyz", "label": "X", "remark": "Y"}
            ]))
        assert r.status_code == 400, r.text

    def test_approved_cannot_be_requested(self, hdr, approved_rid):
        r = requests.post(
            f"{API}/player-registrations/{approved_rid}/request-correction",
            headers=hdr, json=_payload())
        assert r.status_code == 400, r.text
        assert "approved" in r.text.lower()


class TestPublicCorrection:
    def test_public_get(self):
        req = _state["req"]
        r = requests.get(f"{API}/public/player-registrations/correction/{req['token']}")
        assert r.status_code == 200, r.text
        body = r.json()
        # No reviewer identity leaks
        for leaky in ("requested_by_name", "requested_by_body", "requested_by_role", "notification_result", "token"):
            assert leaky not in body, f"{leaky} leaked in public payload"
        assert body["registration_id"] == TEST_RID_SUBMITTED
        assert "player_data" in body
        assert body["overall_note"] == req["overall_note"]

    def test_public_submit_rejects_unflagged(self):
        req = _state["req"]
        # send an unflagged key
        r = requests.post(
            f"{API}/public/player-registrations/correction/{req['token']}/submit",
            json={"patch": {"first_name": "Malicious"}})
        assert r.status_code == 400, r.text
        assert "flagged" in r.text.lower()

    def test_public_submit_ok(self):
        req = _state["req"]
        # Use a unique value each run to guarantee a real diff (else code short-circuits to no_change)
        unique = str(int(time.time() * 1000))[-12:]
        r = requests.post(
            f"{API}/public/player-registrations/correction/{req['token']}/submit",
            json={"patch": {"aadhaar_no": unique}})
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "ok"

    def test_public_submit_twice_returns_410(self):
        req = _state["req"]
        r = requests.post(
            f"{API}/public/player-registrations/correction/{req['token']}/submit",
            json={"patch": {"aadhaar_no": "111122223333"}})
        assert r.status_code == 410, r.text

    def test_public_get_after_resubmit(self):
        req = _state["req"]
        r = requests.get(f"{API}/public/player-registrations/correction/{req['token']}")
        assert r.status_code == 200
        assert r.json().get("already_resubmitted") is True

    def test_bogus_token(self):
        r = requests.get(f"{API}/public/player-registrations/correction/bogus_token_xyz")
        assert r.status_code == 404


class TestCorrectionHistoryAndCancel:
    def test_registration_flipped_back_to_submitted(self, hdr):
        g = requests.get(f"{API}/player-registrations/{TEST_RID_SUBMITTED}", headers=hdr)
        assert g.status_code == 200
        assert g.json().get("status") == "Submitted"

    def test_history_strips_token(self, hdr):
        r = requests.get(f"{API}/player-registrations/{TEST_RID_SUBMITTED}/corrections", headers=hdr)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        for it in items:
            assert "token" not in it, "token must not be returned in history"

    def test_cancel_flow(self, hdr):
        # Create a new correction, then cancel it
        r = requests.post(
            f"{API}/player-registrations/{TEST_RID_SUBMITTED}/request-correction",
            headers=hdr, json=_payload(note="Round two — please fix bank."))
        assert r.status_code == 200, r.text
        cid = r.json()["request"]["id"]
        # Cancel
        c = requests.post(
            f"{API}/player-registrations/{TEST_RID_SUBMITTED}/cancel-correction/{cid}",
            headers=hdr)
        assert c.status_code == 200, c.text
        # Reg back to Submitted
        g = requests.get(f"{API}/player-registrations/{TEST_RID_SUBMITTED}", headers=hdr)
        assert g.json().get("status") == "Submitted"
        # correction row now Cancelled — confirm via list
        r2 = requests.get(f"{API}/player-registrations/{TEST_RID_SUBMITTED}/corrections", headers=hdr)
        statuses = {row["id"]: row["status"] for row in r2.json()}
        assert statuses.get(cid) == "Cancelled"

    def test_non_owner_forbidden(self, approved_rid):
        # Login as a Division user of a different body? We don't have one easily.
        # Use no-auth (missing header) to exercise 401/403 path — the endpoint requires auth.
        r = requests.post(
            f"{API}/player-registrations/{approved_rid}/request-correction",
            json=_payload())
        assert r.status_code in (401, 403), r.text
