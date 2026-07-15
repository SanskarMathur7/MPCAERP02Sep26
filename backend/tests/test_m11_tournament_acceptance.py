"""M11 · Tournament host-body acceptance workflow tests"""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # Cleanup at end: delete all tournaments we created
    for tid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/tournaments/{tid}")
        except Exception:
            pass


def _make_payload(name, host_body_id, fmt="OneDay_Senior"):
    today = date.today()
    return {
        "name": name,
        "format": fmt,
        "scope": "Inter_District",
        "tournament_type": "MPCA_InterDivisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": host_body_id,
        "start_date": (today + timedelta(days=30)).isoformat(),
        "end_date": (today + timedelta(days=32)).isoformat(),
    }


# ---------- Creation & acceptance auto-seed ----------

class TestTournamentCreationAcceptance:
    def test_create_division_hosted(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 Div-Hosted Test", "DIV-IND"))
        assert r.status_code == 200, r.text
        t = r.json()
        created_ids.append(t["id"])
        assert t["status"] == "Draft"
        acc = t["acceptance"]
        assert acc["required_from"] == ["DIV-IND"]
        assert acc["status"] == "Pending"
        assert acc["entries"] == []

    def test_create_district_hosted(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 Dist-Hosted Test", "DIST-UJJA-UJN"))
        assert r.status_code == 200, r.text
        t = r.json()
        created_ids.append(t["id"])
        assert t["status"] == "Draft"
        acc = t["acceptance"]
        assert set(acc["required_from"]) == {"DIST-UJJA-UJN", "DIV-UJN"}
        assert acc["status"] == "Pending"

    def test_create_state_hosted(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 State-Hosted Test", "MPCA"))
        assert r.status_code == 200, r.text
        t = r.json()
        created_ids.append(t["id"])
        acc = t["acceptance"]
        assert acc["required_from"] == []
        assert acc["status"] == "Not_Required"
        assert t["status"] == "Draft"


# ---------- Acceptance endpoint auth/validation ----------

class TestAcceptanceEndpointAuth:
    def _create_div_hosted(self, api, created_ids, name):
        r = api.post(f"{BASE_URL}/api/tournaments", json=_make_payload(name, "DIV-IND"))
        assert r.status_code == 200
        t = r.json()
        created_ids.append(t["id"])
        return t

    def test_no_role_returns_403(self, api, created_ids):
        t = self._create_div_hosted(api, created_ids, "M11 Auth-NoRole")
        r = requests.post(f"{BASE_URL}/api/tournaments/{t['id']}/acceptance",
                          json={"action": "accept"},
                          headers={"Content-Type": "application/json",
                                   "X-User-Body-Code": "DIV-IND"})
        assert r.status_code == 403, r.text

    def test_role_but_no_body_code_returns_400(self, api, created_ids):
        t = self._create_div_hosted(api, created_ids, "M11 Auth-NoBody")
        r = requests.post(f"{BASE_URL}/api/tournaments/{t['id']}/acceptance",
                          json={"action": "accept"},
                          headers={"Content-Type": "application/json",
                                   "X-Role-Id": "district-secretary"})
        assert r.status_code == 400, r.text

    def test_body_not_in_required_returns_403(self, api, created_ids):
        t = self._create_div_hosted(api, created_ids, "M11 Auth-WrongBody")
        r = requests.post(f"{BASE_URL}/api/tournaments/{t['id']}/acceptance",
                          json={"action": "accept"},
                          headers={"Content-Type": "application/json",
                                   "X-Role-Id": "division-secretary",
                                   "X-User-Body-Code": "DIV-UJN"})  # wrong body
        assert r.status_code == 403, r.text
        detail = r.json().get("detail", "")
        assert "DIV-IND" in detail or "required" in detail.lower()


# ---------- 2-body district acceptance flow ----------

class TestDistrictTwoBodyFlow:
    def test_district_then_division_flow(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 Dist-2Body-Flow", "DIST-UJJA-UJN"))
        assert r.status_code == 200
        t = r.json()
        created_ids.append(t["id"])
        tid = t["id"]

        # First accept: District
        r1 = requests.post(f"{BASE_URL}/api/tournaments/{tid}/acceptance",
                           json={"action": "accept"},
                           headers={"Content-Type": "application/json",
                                    "X-Role-Id": "district-secretary",
                                    "X-User-Body-Code": "DIST-UJJA-UJN",
                                    "X-User-Name": "Anil Sharma"})
        assert r1.status_code == 200, r1.text
        t1 = r1.json()
        assert t1["acceptance"]["status"] == "Pending"
        assert t1["status"] == "Draft"

        # Second accept: parent Division
        r2 = requests.post(f"{BASE_URL}/api/tournaments/{tid}/acceptance",
                           json={"action": "accept"},
                           headers={"Content-Type": "application/json",
                                    "X-Role-Id": "division-secretary",
                                    "X-User-Body-Code": "DIV-UJN",
                                    "X-User-Name": "Ujjain Div Sec"})
        assert r2.status_code == 200, r2.text
        t2 = r2.json()
        assert t2["acceptance"]["status"] == "Accepted"
        assert t2["status"] == "Upcoming"

    def test_idempotency_double_accept(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 Idempotency", "DIV-IND"))
        t = r.json()
        created_ids.append(t["id"])
        tid = t["id"]

        headers = {"Content-Type": "application/json",
                   "X-Role-Id": "division-secretary",
                   "X-User-Body-Code": "DIV-IND"}
        r1 = requests.post(f"{BASE_URL}/api/tournaments/{tid}/acceptance",
                           json={"action": "accept"}, headers=headers)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/tournaments/{tid}/acceptance",
                           json={"action": "accept"}, headers=headers)
        assert r2.status_code == 400
        assert "already accepted" in r2.json().get("detail", "").lower()


# ---------- Reject flow ----------

class TestRejectFlow:
    def test_reject_from_one_body(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 Reject-Flow", "DIST-UJJA-UJN"))
        t = r.json()
        created_ids.append(t["id"])
        tid = t["id"]

        # District rejects
        r1 = requests.post(f"{BASE_URL}/api/tournaments/{tid}/acceptance",
                           json={"action": "reject", "note": "conflicting fixtures"},
                           headers={"Content-Type": "application/json",
                                    "X-Role-Id": "district-secretary",
                                    "X-User-Body-Code": "DIST-UJJA-UJN"})
        assert r1.status_code == 200
        t1 = r1.json()
        assert t1["acceptance"]["status"] == "Rejected"
        assert t1["status"] == "Draft"

        # Parent Div now accepts — status must STAY Rejected (rejection is sticky)
        r2 = requests.post(f"{BASE_URL}/api/tournaments/{tid}/acceptance",
                           json={"action": "accept"},
                           headers={"Content-Type": "application/json",
                                    "X-Role-Id": "division-secretary",
                                    "X-User-Body-Code": "DIV-UJN"})
        assert r2.status_code == 200
        t2 = r2.json()
        assert t2["acceptance"]["status"] == "Rejected"
        assert t2["status"] == "Draft"


# ---------- Pending-acceptance GET ----------

class TestPendingAcceptanceListing:
    def test_route_order_returns_list(self, api):
        # No path-shadowing collision: must return list, not 404
        r = requests.get(f"{BASE_URL}/api/tournaments/pending-acceptance",
                         headers={"X-User-Body-Code": "DIV-IND"})
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_pending_includes_matching(self, api, created_ids):
        # Create a fresh division-hosted tournament
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 Pending-Listing", "DIV-IND"))
        t = r.json()
        created_ids.append(t["id"])
        tid = t["id"]

        # DIV-IND should see it
        r2 = requests.get(f"{BASE_URL}/api/tournaments/pending-acceptance",
                          headers={"X-User-Body-Code": "DIV-IND"})
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert tid in ids

        # Other body should NOT see it
        r3 = requests.get(f"{BASE_URL}/api/tournaments/pending-acceptance",
                          headers={"X-User-Body-Code": "DIV-UJN"})
        ids3 = [x["id"] for x in r3.json()]
        assert tid not in ids3

    def test_pending_excludes_after_action(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/tournaments",
                     json=_make_payload("M11 Pending-AfterAct", "DIV-IND"))
        t = r.json()
        created_ids.append(t["id"])
        tid = t["id"]

        # Act on it
        requests.post(f"{BASE_URL}/api/tournaments/{tid}/acceptance",
                      json={"action": "accept"},
                      headers={"Content-Type": "application/json",
                               "X-Role-Id": "division-secretary",
                               "X-User-Body-Code": "DIV-IND"})

        # Should now be excluded from pending list
        r2 = requests.get(f"{BASE_URL}/api/tournaments/pending-acceptance",
                          headers={"X-User-Body-Code": "DIV-IND"})
        ids = [x["id"] for x in r2.json()]
        assert tid not in ids

    def test_pending_requires_body_code(self):
        r = requests.get(f"{BASE_URL}/api/tournaments/pending-acceptance")
        assert r.status_code == 400
