"""Phase III.6 — Claims & Grant Workflow + body_id migration regression tests."""

import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEED_CLAIM_NOS = {"CLM-2025-26-001", "CLM-2025-26-002", "CLM-2025-26-003", "CLM-2025-26-004"}


# ---------------- helpers ----------------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _make_claim(session, body_id="DIST-UJJA-UJN", title=None, amount=12345.0):
    """Create a TEST_ prefixed draft claim against the given submitting body."""
    payload = {
        "body_id": body_id,
        "title": f"TEST_{title or uuid.uuid4().hex[:8]}",
        "description": "automated test claim",
        "category": "Tournament_Expense",
        "amount_inr": amount,
        "fiscal_cycle": "2025-26",
    }
    r = session.post(f"{API}/claims", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _action(actor_post="Hon. Secretary", actor_body_id="DIST-UJJA-UJN", notes="ok"):
    return {
        "actor_post": actor_post,
        "actor_name": "Test Actor",
        "actor_body_id": actor_body_id,
        "notes": notes,
    }


# ---------------- root / version ----------------

class TestVersion:
    def test_root_version_3_6_0(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert data["version"] == "3.6.0"
        assert data["app"] == "MPCA ERP"
        assert data["status"] == "ok"


# ---------------- body_id migration ----------------

class TestBodyIdMigration:
    """All Phase I/II/III collections must have body_id field after migration."""

    @pytest.mark.parametrize(
        "endpoint",
        [
            "/members",
            "/disclosures",
            "/meetings",
            "/elections",
            "/fees",
            "/bank/accounts",
            "/bank/transactions",
        ],
    )
    def test_body_id_present_on_every_record(self, session, endpoint):
        r = session.get(f"{API}{endpoint}")
        assert r.status_code == 200, f"{endpoint} failed: {r.status_code} {r.text}"
        items = r.json()
        assert isinstance(items, list)
        if not items:
            pytest.skip(f"no items in {endpoint}")
        for it in items:
            assert "body_id" in it, f"{endpoint} missing body_id in {it.get('id')}"
            assert it["body_id"], f"{endpoint} blank body_id in {it.get('id')}"

    def test_members_filter_by_body_id_mpca(self, session):
        r = session.get(f"{API}/members", params={"body_id": "MPCA"})
        assert r.status_code == 200
        items = r.json()
        # every returned member should be MPCA
        for it in items:
            assert it.get("body_id") == "MPCA"


# ---------------- claims read endpoints ----------------

class TestClaimsRead:
    def test_list_claims_returns_seeded_four(self, session):
        r = session.get(f"{API}/claims")
        assert r.status_code == 200
        items = r.json()
        # at minimum the 4 seeds (we may also have TEST_ from this run)
        seed_nos = {c["claim_no"] for c in items if c["claim_no"] in SEED_CLAIM_NOS}
        assert seed_nos == SEED_CLAIM_NOS, f"missing seeds: {SEED_CLAIM_NOS - seed_nos}"

    def test_seed_statuses_span_lifecycle(self, session):
        r = session.get(f"{API}/claims")
        items = r.json()
        statuses = {c["claim_no"]: c["status"] for c in items if c["claim_no"] in SEED_CLAIM_NOS}
        # spec says: Draft, Submitted, Division_Recommended, Disbursed
        expected = {"Draft", "Submitted", "Division_Recommended", "Disbursed"}
        assert set(statuses.values()) >= expected, f"got: {statuses}"

    def test_filter_status_submitted(self, session):
        r = session.get(f"{API}/claims", params={"status": "Submitted"})
        assert r.status_code == 200
        for c in r.json():
            assert c["status"] == "Submitted"

    def test_filter_body_id(self, session):
        r = session.get(f"{API}/claims", params={"body_id": "DIST-UJJA-UJN"})
        assert r.status_code == 200
        for c in r.json():
            assert c["body_id"] == "DIST-UJJA-UJN"

    def test_filter_parent_body_id_mpca(self, session):
        r = session.get(f"{API}/claims", params={"parent_body_id": "MPCA"})
        assert r.status_code == 200
        for c in r.json():
            assert c.get("parent_body_id") == "MPCA"

    def test_filter_fiscal_cycle(self, session):
        r = session.get(f"{API}/claims", params={"fiscal_cycle": "2025-26"})
        assert r.status_code == 200
        for c in r.json():
            assert c["fiscal_cycle"] == "2025-26"

    def test_get_claim_by_id(self, session):
        listing = session.get(f"{API}/claims").json()
        first = listing[0]
        r = session.get(f"{API}/claims/{first['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == first["id"]

    def test_get_claim_invalid_id_404(self, session):
        r = session.get(f"{API}/claims/nonexistent-{uuid.uuid4().hex}")
        assert r.status_code == 404


# ---------------- claims stats ----------------

class TestClaimsStats:
    def test_summary_has_all_keys(self, session):
        r = session.get(f"{API}/claims-stats/summary")
        assert r.status_code == 200
        d = r.json()
        for k in [
            "total_claims",
            "pending_claims",
            "disbursed_claims",
            "rejected_claims",
            "amount_disbursed_inr",
            "amount_in_flight_inr",
        ]:
            assert k in d, f"missing key {k}"
        assert d["total_claims"] >= 4
        assert d["amount_disbursed_inr"] >= 0
        assert d["amount_in_flight_inr"] >= 0


# ---------------- claim create ----------------

class TestClaimCreate:
    def test_create_draft_claim_ok(self, session):
        c = _make_claim(session, title="create_ok")
        assert c["status"] == "Draft"
        assert c["body_id"] == "DIST-UJJA-UJN"
        # parent computed from bodies tree (district → division UJN)
        assert c["parent_body_id"] == "DIV-UJN"
        assert c["claim_no"].startswith("CLM-2025-26-")
        assert c["approval_chain"] == []

    def test_create_with_bogus_body_id_400(self, session):
        payload = {
            "body_id": "FAKE-BODY-XYZ",
            "title": "TEST_bogus",
            "category": "Tournament_Expense",
            "amount_inr": 100.0,
            "fiscal_cycle": "2025-26",
        }
        r = session.post(f"{API}/claims", json=payload)
        assert r.status_code == 400


# ---------------- full happy-path workflow ----------------

class TestWorkflowHappyPath:
    def test_full_lifecycle(self, session):
        c = _make_claim(session, title="happy_path")
        cid = c["id"]

        # submit
        r = session.post(f"{API}/claims/{cid}/submit", json=_action())
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Submitted"
        assert len(d["approval_chain"]) == 1
        # district -> division UJN
        assert d["parent_body_id"] == "DIV-UJN"

        # recommend
        r = session.post(f"{API}/claims/{cid}/recommend",
                         json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN"))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Division_Recommended"
        assert len(d["approval_chain"]) == 2
        assert d["parent_body_id"] == "MPCA"

        # sanction
        r = session.post(f"{API}/claims/{cid}/sanction",
                         json=_action(actor_post="Hon. Treasurer", actor_body_id="MPCA"))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "MPCA_Sanctioned"
        assert len(d["approval_chain"]) == 3

        # disburse
        r = session.post(f"{API}/claims/{cid}/disburse",
                         json=_action(actor_post="Hon. Treasurer", actor_body_id="MPCA"))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Disbursed"
        assert len(d["approval_chain"]) == 4


# ---------------- workflow guards ----------------

class TestWorkflowGuards:
    def test_cannot_recommend_draft(self, session):
        c = _make_claim(session, title="guard_recommend_draft")
        r = session.post(f"{API}/claims/{c['id']}/recommend", json=_action())
        assert r.status_code == 400

    def test_cannot_sanction_draft(self, session):
        c = _make_claim(session, title="guard_sanction_draft")
        r = session.post(f"{API}/claims/{c['id']}/sanction", json=_action())
        assert r.status_code == 400

    def test_cannot_disburse_draft(self, session):
        c = _make_claim(session, title="guard_disburse_draft")
        r = session.post(f"{API}/claims/{c['id']}/disburse", json=_action())
        assert r.status_code == 400

    def test_cannot_submit_twice(self, session):
        c = _make_claim(session, title="guard_submit_twice")
        r1 = session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        assert r1.status_code == 200
        r2 = session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        assert r2.status_code == 400

    def test_cannot_sanction_submitted(self, session):
        c = _make_claim(session, title="guard_sanction_submitted")
        session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        r = session.post(f"{API}/claims/{c['id']}/sanction", json=_action())
        assert r.status_code == 400

    def test_cannot_disburse_recommended(self, session):
        c = _make_claim(session, title="guard_disburse_recommended")
        session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        session.post(f"{API}/claims/{c['id']}/recommend",
                     json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN"))
        r = session.post(f"{API}/claims/{c['id']}/disburse", json=_action())
        assert r.status_code == 400

    def test_cannot_reject_disbursed(self, session):
        c = _make_claim(session, title="guard_reject_disbursed")
        session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        session.post(f"{API}/claims/{c['id']}/recommend",
                     json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN"))
        session.post(f"{API}/claims/{c['id']}/sanction",
                     json=_action(actor_post="Hon. Treasurer", actor_body_id="MPCA"))
        session.post(f"{API}/claims/{c['id']}/disburse",
                     json=_action(actor_post="Hon. Treasurer", actor_body_id="MPCA"))
        r = session.post(f"{API}/claims/{c['id']}/reject", json=_action())
        assert r.status_code == 400


# ---------------- return ----------------

class TestReturn:
    def test_return_on_submitted_resets_parent_to_division(self, session):
        c = _make_claim(session, title="return_submitted")
        cid = c["id"]
        session.post(f"{API}/claims/{cid}/submit", json=_action())
        r = session.post(f"{API}/claims/{cid}/return",
                         json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN", notes="need bills"))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Returned"
        # parent should be reset to originating body's parent => DIV-UJN
        assert d["parent_body_id"] == "DIV-UJN"

    def test_resubmit_after_return(self, session):
        c = _make_claim(session, title="resubmit_after_return")
        cid = c["id"]
        session.post(f"{API}/claims/{cid}/submit", json=_action())
        session.post(f"{API}/claims/{cid}/return",
                     json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN"))
        # Returned → submit allowed again per server code
        r = session.post(f"{API}/claims/{cid}/submit", json=_action())
        assert r.status_code == 200
        assert r.json()["status"] == "Submitted"

    def test_cannot_return_draft(self, session):
        c = _make_claim(session, title="cannot_return_draft")
        r = session.post(f"{API}/claims/{c['id']}/return", json=_action())
        assert r.status_code == 400


# ---------------- reject at multiple stages ----------------

class TestReject:
    def test_reject_at_submitted(self, session):
        c = _make_claim(session, title="reject_submitted")
        session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        r = session.post(f"{API}/claims/{c['id']}/reject",
                         json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN", notes="invalid"))
        assert r.status_code == 200
        assert r.json()["status"] == "Rejected"

    def test_reject_at_recommended(self, session):
        c = _make_claim(session, title="reject_recommended")
        session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        session.post(f"{API}/claims/{c['id']}/recommend",
                     json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN"))
        r = session.post(f"{API}/claims/{c['id']}/reject",
                         json=_action(actor_post="Hon. Treasurer", actor_body_id="MPCA"))
        assert r.status_code == 200
        assert r.json()["status"] == "Rejected"

    def test_reject_at_sanctioned(self, session):
        c = _make_claim(session, title="reject_sanctioned")
        session.post(f"{API}/claims/{c['id']}/submit", json=_action())
        session.post(f"{API}/claims/{c['id']}/recommend",
                     json=_action(actor_post="Division Secretary", actor_body_id="DIV-UJN"))
        session.post(f"{API}/claims/{c['id']}/sanction",
                     json=_action(actor_post="Hon. Treasurer", actor_body_id="MPCA"))
        r = session.post(f"{API}/claims/{c['id']}/reject",
                         json=_action(actor_post="President", actor_body_id="MPCA"))
        assert r.status_code == 200
        assert r.json()["status"] == "Rejected"


# ---------------- Phase I-III.5 regression ----------------

class TestRegression:
    @pytest.mark.parametrize(
        "path",
        [
            "/bodies",
            "/bodies/tree",
            "/members",
            "/disclosures",
            "/meetings",
            "/elections",
            "/fees",
            "/bank/accounts",
            "/bank/transactions",
            "/financial-powers",
            "/dashboard/stats",
        ],
    )
    def test_endpoint_still_200(self, session, path):
        r = session.get(f"{API}{path}")
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"

    def test_verify_uid(self, session):
        members = session.get(f"{API}/members").json()
        if not members:
            pytest.skip("no members")
        uid = members[0].get("uid") or members[0].get("id")
        r = session.get(f"{API}/verify/{uid}")
        assert r.status_code in (200, 404)

    def test_member_profile_uid(self, session):
        members = session.get(f"{API}/members").json()
        if not members:
            pytest.skip("no members")
        uid = members[0].get("uid") or members[0].get("id")
        r = session.get(f"{API}/member-profile/{uid}")
        assert r.status_code in (200, 404)
