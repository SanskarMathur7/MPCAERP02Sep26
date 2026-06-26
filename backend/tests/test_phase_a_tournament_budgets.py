"""Phase A · Tournament Budget Builder — pytest suite.
Tests CRUD, workflow transitions, variable item sub-workflow,
and basic regression of pre-existing modules.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def seeded(s):
    r = s.get(f"{API}/tournament-budgets")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def tournament_and_body(s):
    t = s.get(f"{API}/tournaments").json()
    b = s.get(f"{API}/bodies").json()
    div = next((x for x in b if x.get("body_type") == "Division"), None)
    assert t and div
    return t[0], div


# ─────────── READ ───────────

class TestList:
    def test_list_returns_seeded(self, seeded):
        nos = {b["budget_no"] for b in seeded}
        # at least the 4 seeded entries should be present
        assert any("TB-2025-26" in n for n in nos), nos
        assert len(seeded) >= 4

    def test_filter_status(self, s):
        r = s.get(f"{API}/tournament-budgets", params={"status": "Approved"})
        assert r.status_code == 200
        for b in r.json():
            assert b["status"] == "Approved"

    def test_filter_fiscal(self, s):
        r = s.get(f"{API}/tournament-budgets", params={"fiscal_cycle": "2025-26"})
        assert r.status_code == 200
        assert all(b["fiscal_cycle"] == "2025-26" for b in r.json())

    def test_get_one(self, s, seeded):
        r = s.get(f"{API}/tournament-budgets/{seeded[0]['id']}")
        assert r.status_code == 200
        d = r.json()
        for k in ("head_allocations", "variable_items", "approval_chain", "tournament_name", "body_name"):
            assert k in d
        # ObjectId not leaked
        assert "_id" not in d

    def test_get_404(self, s):
        assert s.get(f"{API}/tournament-budgets/no-such").status_code == 404

    def test_stats_shape(self, s):
        r = s.get(f"{API}/tournament-budgets-stats/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("total_budgets", "approved_budgets", "pending_budgets",
                  "rejected_budgets", "proposed_inr", "approved_inr"):
            assert k in d, d
        assert d["total_budgets"] >= 4


# ─────────── CREATE + VALIDATION ───────────

class TestCreate:
    def test_create_draft_ok(self, s, tournament_and_body):
        t, div = tournament_and_body
        payload = {
            "tournament_id": t["id"],
            "body_id": div["code"],
            "fiscal_cycle": f"TEST-{uuid.uuid4().hex[:6]}",
            "total_ceiling_inr": 200000,
            "head_allocations": [
                {"head": "Travel", "limit_inr": 50000},
                {"head": "Hotel", "limit_inr": 50000},
            ],
            "variable_items": [],
            "notes": "TEST_PHASE_A",
            "created_by": "tester",
        }
        r = s.post(f"{API}/tournament-budgets", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["budget_no"].startswith(f"TB-{payload['fiscal_cycle']}-")
        assert d["status"] == "Draft"
        assert d["tournament_name"]
        assert d["body_name"]
        # Cleanup
        s.delete(f"{API}/tournament-budgets/{d['id']}")

    def test_head_sum_exceeds_total_422(self, s, tournament_and_body):
        t, div = tournament_and_body
        payload = {
            "tournament_id": t["id"], "body_id": div["code"],
            "fiscal_cycle": f"TEST-{uuid.uuid4().hex[:6]}",
            "total_ceiling_inr": 10000,
            "head_allocations": [{"head": "Travel", "limit_inr": 99999}],
            "variable_items": [], "notes": "TEST_OVER",
        }
        r = s.post(f"{API}/tournament-budgets", json=payload)
        assert r.status_code == 422, r.text

    def test_duplicate_409(self, s, seeded):
        # Find any existing Draft/Submitted/Approved budget and try to duplicate it
        existing = next((b for b in seeded if b["status"] in ("Draft", "Submitted", "Approved", "Returned")), None)
        assert existing
        payload = {
            "tournament_id": existing["tournament_id"],
            "body_id": existing["body_id"],
            "fiscal_cycle": existing["fiscal_cycle"],
            "total_ceiling_inr": 1000, "head_allocations": [], "variable_items": [],
        }
        r = s.post(f"{API}/tournament-budgets", json=payload)
        assert r.status_code == 409, r.text


# ─────────── WORKFLOW ───────────

class TestWorkflow:
    @pytest.fixture
    def fresh_draft(self, s, tournament_and_body):
        t, div = tournament_and_body
        payload = {
            "tournament_id": t["id"], "body_id": div["code"],
            "fiscal_cycle": f"TEST-{uuid.uuid4().hex[:8]}",
            "total_ceiling_inr": 100000,
            "head_allocations": [{"head": "Travel", "limit_inr": 30000}],
            "variable_items": [], "notes": "TEST_WF",
        }
        r = s.post(f"{API}/tournament-budgets", json=payload)
        assert r.status_code == 200, r.text
        yield r.json()
        # teardown — best effort
        s.delete(f"{API}/tournament-budgets/{r.json()['id']}")

    def action_payload(self):
        return {"actor_post": "Division Secretary", "actor_name": "TEST_Actor",
                "actor_body_id": "DIV-IND", "notes": "auto-test"}

    def test_patch_only_draft_or_returned(self, s, fresh_draft):
        b = fresh_draft
        # PATCH the draft
        upd = {
            "tournament_id": b["tournament_id"], "body_id": b["body_id"],
            "fiscal_cycle": b["fiscal_cycle"], "total_ceiling_inr": 120000,
            "head_allocations": [{"head": "Travel", "limit_inr": 60000}],
            "variable_items": [],
        }
        r = s.patch(f"{API}/tournament-budgets/{b['id']}", json=upd)
        assert r.status_code == 200, r.text
        assert r.json()["total_ceiling_inr"] == 120000

        # Submit it
        r2 = s.post(f"{API}/tournament-budgets/{b['id']}/submit", json=self.action_payload())
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "Submitted"

        # Now PATCH should fail
        r3 = s.patch(f"{API}/tournament-budgets/{b['id']}", json=upd)
        assert r3.status_code == 409, r3.text

    def test_full_lifecycle_submit_approve(self, s, fresh_draft):
        b = fresh_draft
        # submit
        r1 = s.post(f"{API}/tournament-budgets/{b['id']}/submit", json=self.action_payload())
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["status"] == "Submitted"
        assert d1["approval_chain"][-1]["stage"] == "Submitted"

        # approve with revised total
        appr = {
            "actor_post": "Hon. Treasurer", "actor_name": "TEST_Meera",
            "actor_body_id": "MPCA",
            "approved_total_inr": 80000,
            "approved_head_allocations": [{"head": "Travel", "limit_inr": 50000}],
            "notes": "revised down",
        }
        r2 = s.post(f"{API}/tournament-budgets/{b['id']}/approve", json=appr)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["status"] == "Approved"
        assert d2["approved_total_inr"] == 80000
        assert d2["approved_head_allocations"][0]["limit_inr"] == 50000

        # cannot delete approved
        rdel = s.delete(f"{API}/tournament-budgets/{b['id']}")
        assert rdel.status_code == 409

    def test_approve_above_proposed_422(self, s, fresh_draft):
        b = fresh_draft
        s.post(f"{API}/tournament-budgets/{b['id']}/submit", json=self.action_payload())
        appr = {"actor_post": "Treasurer", "actor_body_id": "MPCA",
                "approved_total_inr": 999999}
        r = s.post(f"{API}/tournament-budgets/{b['id']}/approve", json=appr)
        assert r.status_code == 422, r.text

    def test_approve_heads_exceed_approved_total_422(self, s, fresh_draft):
        b = fresh_draft
        s.post(f"{API}/tournament-budgets/{b['id']}/submit", json=self.action_payload())
        appr = {"actor_post": "Treasurer", "actor_body_id": "MPCA",
                "approved_total_inr": 50000,
                "approved_head_allocations": [{"head": "Travel", "limit_inr": 99999}]}
        r = s.post(f"{API}/tournament-budgets/{b['id']}/approve", json=appr)
        assert r.status_code == 422, r.text

    def test_return_then_resubmit(self, s, fresh_draft):
        b = fresh_draft
        s.post(f"{API}/tournament-budgets/{b['id']}/submit", json=self.action_payload())
        ret = {**self.action_payload(), "return_reason_code": "DOCS_MISSING",
               "return_reason_detail": "need invoices"}
        r = s.post(f"{API}/tournament-budgets/{b['id']}/return", json=ret)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Returned"
        assert r.json()["return_reason_code"] == "DOCS_MISSING"
        # re-submit allowed from Returned
        r2 = s.post(f"{API}/tournament-budgets/{b['id']}/submit", json=self.action_payload())
        assert r2.status_code == 200
        assert r2.json()["status"] == "Submitted"

    def test_reject_blocked_after_approved(self, s, seeded):
        approved = next((b for b in seeded if b["status"] == "Approved"), None)
        if not approved:
            pytest.skip("No approved seed budget")
        r = s.post(f"{API}/tournament-budgets/{approved['id']}/reject",
                   json={"actor_post": "Treasurer", "actor_body_id": "MPCA"})
        assert r.status_code == 409

    def test_submit_from_wrong_status_409(self, s, seeded):
        approved = next((b for b in seeded if b["status"] == "Approved"), None)
        if not approved:
            pytest.skip()
        r = s.post(f"{API}/tournament-budgets/{approved['id']}/submit",
                   json=self.action_payload())
        assert r.status_code == 409


# ─────────── VARIABLE ITEMS ───────────

class TestVariableItems:
    def test_add_and_approve(self, s, seeded):
        # Use TB-2025-26-002 (Submitted) per problem statement
        target = next((b for b in seeded if b["budget_no"].endswith("-002")), None)
        if not target:
            pytest.skip()
        item = {"description": "TEST_var insurance",
                "proposed_amount_inr": 1500.0, "head": "Miscellaneous",
                "status": "Pending"}
        r = s.post(f"{API}/tournament-budgets/{target['id']}/variables", json=item)
        assert r.status_code == 200, r.text
        d = r.json()
        new_item = next((v for v in d["variable_items"]
                         if v["description"] == "TEST_var insurance"), None)
        assert new_item, d["variable_items"]
        iid = new_item["id"]

        # decide approve (without explicit amount → should default to proposed)
        dec = {"decision": "Approved", "decided_by": "TEST_Treasurer"}
        r2 = s.post(f"{API}/tournament-budgets/{target['id']}/variables/{iid}/decide", json=dec)
        assert r2.status_code == 200, r2.text
        updated = next((v for v in r2.json()["variable_items"] if v["id"] == iid), None)
        assert updated["status"] == "Approved"
        assert updated["approved_amount_inr"] == 1500.0
        assert updated["decided_at"]

        # double-decide should 409
        r3 = s.post(f"{API}/tournament-budgets/{target['id']}/variables/{iid}/decide", json=dec)
        assert r3.status_code == 409, r3.text


# ─────────── REGRESSION ───────────

class TestRegression:
    @pytest.mark.parametrize("path", [
        "/", "/bodies", "/bodies/tree", "/members", "/disclosures",
        "/meetings", "/elections", "/fees", "/bank/accounts",
        "/financial-powers", "/dashboard/stats", "/claims",
        "/body-budgets", "/procurement", "/players", "/transfers",
        "/tournaments", "/vendors", "/vendor-bills",
    ])
    def test_get_alive(self, s, path):
        r = s.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} → {r.status_code} {r.text[:200]}"

    def test_notifications_growth(self, s):
        r = s.get(f"{API}/notifications", params={"recipient_role_id": "treasurer"})
        assert r.status_code == 200
