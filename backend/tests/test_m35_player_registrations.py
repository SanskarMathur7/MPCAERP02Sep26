"""M35 · Player Registration Campaigns backend tests."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

DIV_HDR = {"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary"}
BPL_HDR = {"X-User-Body-Code": "DIV-BPL", "X-Role-Id": "division-secretary"}
MPCA_HDR = {"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary"}


@pytest.fixture(scope="module")
def div_campaign():
    """Create a fresh DIV-IND campaign to run tests against."""
    payload = {
        "body_code": "DIV-IND",
        "cycle_code": "2025-26",
        "title": f"TEST_M35 Campaign {uuid.uuid4().hex[:6]}",
        "expires_on": "2026-12-31",
        "notes": "created by m35 pytest",
    }
    r = requests.post(f"{API}/player-registration-campaigns", json=payload, headers=DIV_HDR)
    assert r.status_code == 200, r.text
    return r.json()


# ============ Campaign Create / Scope ============

class TestCampaignCreate:
    def test_div_creates_own(self, div_campaign):
        assert div_campaign["body_code"] == "DIV-IND"
        assert div_campaign["public_token"] and len(div_campaign["public_token"]) >= 8
        assert div_campaign["is_active"] is True
        assert div_campaign["invited_count"] == 0

    def test_div_cannot_create_for_other_body(self):
        r = requests.post(f"{API}/player-registration-campaigns",
                          json={"body_code": "DIV-BPL", "cycle_code": "2025-26", "title": "nope"},
                          headers=DIV_HDR)
        assert r.status_code == 403

    def test_mpca_can_create_for_any(self):
        r = requests.post(f"{API}/player-registration-campaigns",
                          json={"body_code": "DIV-BPL", "cycle_code": "2025-26",
                                "title": f"TEST_M35 MPCA-for-BPL {uuid.uuid4().hex[:6]}",
                                "expires_on": "2026-12-31"},
                          headers=MPCA_HDR)
        assert r.status_code == 200, r.text
        assert r.json()["body_code"] == "DIV-BPL"


# ============ Campaign List / Scope ============

class TestCampaignList:
    def test_div_sees_only_own(self):
        r = requests.get(f"{API}/player-registration-campaigns", headers=DIV_HDR)
        assert r.status_code == 200
        rows = r.json()
        assert all(c["body_code"] == "DIV-IND" for c in rows), [c["body_code"] for c in rows]

    def test_mpca_sees_all(self):
        r = requests.get(f"{API}/player-registration-campaigns", headers=MPCA_HDR)
        assert r.status_code == 200
        bodies = {c["body_code"] for c in r.json()}
        # Expect at least DIV-IND (fixture seed) and MPCA-created DIV-BPL row from other test
        assert "DIV-IND" in bodies

    def test_filter_body_code(self):
        r = requests.get(f"{API}/player-registration-campaigns?body_code=DIV-IND", headers=MPCA_HDR)
        assert r.status_code == 200
        assert all(c["body_code"] == "DIV-IND" for c in r.json())

    def test_filter_is_active(self):
        r = requests.get(f"{API}/player-registration-campaigns?is_active=true", headers=MPCA_HDR)
        assert r.status_code == 200
        assert all(c["is_active"] for c in r.json())


# ============ Campaign Patch ============

class TestCampaignPatch:
    def test_owner_patches(self, div_campaign):
        r = requests.patch(f"{API}/player-registration-campaigns/{div_campaign['id']}",
                           json={"notes": "updated by test"}, headers=DIV_HDR)
        assert r.status_code == 200
        assert r.json()["notes"] == "updated by test"

    def test_other_body_forbidden(self, div_campaign):
        r = requests.patch(f"{API}/player-registration-campaigns/{div_campaign['id']}",
                           json={"notes": "hack"}, headers=BPL_HDR)
        assert r.status_code == 403

    def test_empty_patch_400(self, div_campaign):
        r = requests.patch(f"{API}/player-registration-campaigns/{div_campaign['id']}",
                           json={}, headers=DIV_HDR)
        assert r.status_code == 400

    def test_mpca_can_patch(self, div_campaign):
        r = requests.patch(f"{API}/player-registration-campaigns/{div_campaign['id']}",
                           json={"title": div_campaign["title"] + " · edited"}, headers=MPCA_HDR)
        assert r.status_code == 200


# ============ Invites ============

class TestInvites:
    def test_bulk_create(self, div_campaign):
        r = requests.post(f"{API}/player-registration-campaigns/{div_campaign['id']}/invites",
                          json={"invites": [
                              {"prefill_name": "TEST_Rohit", "prefill_email": "rohit@example.com"},
                              {"prefill_name": "TEST_Suresh", "prefill_phone": "9876543210"},
                          ]}, headers=DIV_HDR)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 2
        toks = {inv["token"] for inv in data["created"]}
        assert len(toks) == 2
        # counter increments
        c = requests.get(f"{API}/player-registration-campaigns/{div_campaign['id']}", headers=DIV_HDR).json()
        assert c["invited_count"] >= 2
        # stash for later tests
        pytest.invite_token = data["created"][0]["token"]
        pytest.invite_id = data["created"][0]["id"]


# ============ Public resolve ============

class TestPublicResolve:
    def test_resolve_campaign_token(self, div_campaign):
        r = requests.get(f"{API}/public/player-registration/token/{div_campaign['public_token']}")
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == "campaign"
        assert d["campaign_id"] == div_campaign["id"]
        assert d["prefill"] == {}

    def test_resolve_invite_token(self):
        r = requests.get(f"{API}/public/player-registration/token/{pytest.invite_token}")
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == "invite"
        assert d["prefill"]["full_name"] == "TEST_Rohit"

    def test_resolve_unknown_404(self):
        r = requests.get(f"{API}/public/player-registration/token/BADTOKEN_XYZ")
        assert r.status_code == 404

    def test_resolve_inactive_410(self, div_campaign):
        # Pause the campaign
        requests.patch(f"{API}/player-registration-campaigns/{div_campaign['id']}",
                       json={"is_active": False}, headers=DIV_HDR)
        r = requests.get(f"{API}/public/player-registration/token/{div_campaign['public_token']}")
        assert r.status_code == 410
        # restore
        requests.patch(f"{API}/player-registration-campaigns/{div_campaign['id']}",
                       json={"is_active": True}, headers=DIV_HDR)


# ============ Public submit + inbox actions ============

class TestPublicSubmitAndReview:
    def test_submit_via_campaign_token(self, div_campaign):
        payload = {
            "token": div_campaign["public_token"],
            "player": {
                "full_name": "TEST_M35 Player One",
                "dob": "2005-05-15",
                "gender": "M",
                "role": "Batter",
                "mobile": "9999900001",
                "category": "Local_MP",
                "consent": True,
            },
        }
        r = requests.post(f"{API}/public/player-registration/submit", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Submitted"
        assert d["body_code"] == "DIV-IND"
        pytest.reg_id_for_approve = d["id"]

    def test_submit_via_invite(self, div_campaign):
        payload = {
            "token": pytest.invite_token,
            "player": {
                "full_name": "TEST_Rohit From Invite",
                "dob": "2004-01-10",
                "gender": "M",
                "role": "Bowler",
                "mobile": "9999900002",
                "category": "Local_MP",
                "consent": True,
            },
        }
        r = requests.post(f"{API}/public/player-registration/submit", json=payload)
        assert r.status_code == 200
        pytest.reg_id_for_reject = r.json()["id"]

    def test_submit_invite_twice_blocked(self):
        payload = {"token": pytest.invite_token,
                   "player": {"full_name": "dup", "dob": "2000-01-01", "gender": "M",
                              "role": "Batter", "mobile": "9", "category": "Local_MP", "consent": True}}
        r = requests.post(f"{API}/public/player-registration/submit", json=payload)
        assert r.status_code == 400

    def test_inbox_scope_div(self, div_campaign):
        r = requests.get(f"{API}/player-registrations?campaign_id={div_campaign['id']}", headers=DIV_HDR)
        assert r.status_code == 200
        rows = r.json()
        assert all(x["body_code"] == "DIV-IND" for x in rows)
        assert any(x["id"] == pytest.reg_id_for_approve for x in rows)

    def test_inbox_other_body_forbidden(self):
        r = requests.get(f"{API}/player-registrations/{pytest.reg_id_for_approve}", headers=BPL_HDR)
        assert r.status_code == 403

    def test_approve_creates_player(self, div_campaign):
        r = requests.post(f"{API}/player-registrations/{pytest.reg_id_for_approve}/approve",
                          json={"reviewer_name": "Tester", "note": "ok"}, headers=DIV_HDR)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Approved"
        assert d["linked_player_id"]
        # GET the player
        p = requests.get(f"{API}/players/{d['linked_player_id']}", headers=DIV_HDR)
        assert p.status_code == 200, p.text
        pj = p.json()
        assert pj["body_id"] == "DIV-IND"
        assert pj["season_year"] == "2025-26"
        assert pj["status"] == "Active"

    def test_approve_again_400(self):
        r = requests.post(f"{API}/player-registrations/{pytest.reg_id_for_approve}/approve",
                          json={"note": "again"}, headers=DIV_HDR)
        assert r.status_code == 400

    def test_reject_requires_note(self):
        r = requests.post(f"{API}/player-registrations/{pytest.reg_id_for_reject}/reject",
                          json={"note": ""}, headers=DIV_HDR)
        assert r.status_code == 400

    def test_reject_success(self):
        r = requests.post(f"{API}/player-registrations/{pytest.reg_id_for_reject}/reject",
                          json={"note": "incomplete docs"}, headers=DIV_HDR)
        assert r.status_code == 200
        assert r.json()["status"] == "Rejected"

    def test_return_flow_resets_invite(self, div_campaign):
        # Create fresh invite → submit → return → should be re-submittable
        inv_r = requests.post(f"{API}/player-registration-campaigns/{div_campaign['id']}/invites",
                              json={"invites": [{"prefill_name": "TEST_ReturnCase"}]}, headers=DIV_HDR)
        tok = inv_r.json()["created"][0]["token"]
        sub = requests.post(f"{API}/public/player-registration/submit", json={
            "token": tok, "player": {"full_name": "TEST_ReturnCase", "dob": "2006-01-01",
                                     "gender": "M", "role": "Batter", "mobile": "9",
                                     "category": "Local_MP", "consent": True}}).json()
        # empty note → 400
        e = requests.post(f"{API}/player-registrations/{sub['id']}/return",
                          json={"note": ""}, headers=DIV_HDR)
        assert e.status_code == 400
        # with note
        ret = requests.post(f"{API}/player-registrations/{sub['id']}/return",
                            json={"note": "please fix DOB"}, headers=DIV_HDR)
        assert ret.status_code == 200
        assert ret.json()["status"] == "Returned"
        # invite can be re-submitted (submission_id cleared)
        r2 = requests.post(f"{API}/public/player-registration/submit", json={
            "token": tok, "player": {"full_name": "TEST_ReturnCase v2", "dob": "2006-01-01",
                                     "gender": "M", "role": "Batter", "mobile": "9",
                                     "category": "Local_MP", "consent": True}})
        assert r2.status_code == 200, r2.text
