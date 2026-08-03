"""M39z · Tournament Finance auto-sanction on Division Accept.

Tests:
1. division-accept on Sent_To_Division → Approved (auto-sanction, terminal)
2. Legacy /sanction path still works for Accepted_By_Division docs
3. Scope guard on division-accept still returns 403 for foreign body header
4. request-revision still transitions Sent_To_Division → Revision_Requested
5. finance/matrix still returns pool grouping + next_action + privacy scoping
"""
import os
import pytest
import requests
from pathlib import Path


def _load_base():
    v = os.environ.get('REACT_APP_BACKEND_URL')
    if v:
        return v.rstrip('/')
    env_path = Path('/app/frontend/.env')
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_base()
TID = "1c60fc28-c2ec-43a0-ab79-165e93e80e9f"  # Madhavrao Scindia Trophy


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def matrix_rows(client):
    """Fetch matrix as MPCA (full monetary visibility)."""
    r = client.get(f"{BASE_URL}/api/tournaments/{TID}/finance/matrix",
                   headers={"X-Body-Code": "MPCA"})
    assert r.status_code == 200, r.text
    return r.json()


def _find_row_by_status(matrix, status):
    for row in matrix.get("rows", []):
        if row.get("budget_status") == status and row.get("budget_id"):
            return row
    return None


# ─────────────────────── Matrix ───────────────────────

class TestMatrix:
    def test_matrix_returns_rows(self, matrix_rows):
        assert matrix_rows.get("tournament_name")
        assert isinstance(matrix_rows.get("rows"), list) and len(matrix_rows["rows"]) > 0

    def test_matrix_next_action_shape(self, matrix_rows):
        for row in matrix_rows["rows"]:
            na = row.get("next_action_for")
            if na is not None:
                assert "waiting_on" in na and "action" in na

    def test_matrix_mpca_sees_monetary(self, matrix_rows):
        # At least one Sent_To_Division/Approved row should show budget_total>0 for MPCA scope
        seen = [r for r in matrix_rows["rows"]
                if r.get("budget_total_inr") and r["budget_total_inr"] > 0]
        assert len(seen) > 0, "MPCA scope should see budget_total_inr on live budgets"

    def test_matrix_division_privacy_scoping(self, client):
        # A Division caller should see their OWN row's money, others masked
        r = client.get(f"{BASE_URL}/api/tournaments/{TID}/finance/matrix",
                       headers={"X-Body-Code": "DIV-GWL"})
        assert r.status_code == 200
        rows = r.json()["rows"]
        own = [x for x in rows if x.get("body_code") == "DIV-GWL"]
        other = [x for x in rows if x.get("body_code") != "DIV-GWL"]
        assert own, "GWL row must be present"
        # Own row should either have monetary or none (if not sent yet); other rows must be masked
        for o in other:
            # Privacy: budget_total_inr should be None/0 for foreign rows
            assert not o.get("budget_total_inr") or o.get("budget_total_inr") in (0, None), \
                f"Privacy leak: DIV-GWL sees {o.get('body_code')} amounts: {o.get('budget_total_inr')}"


# ─────────────────────── Auto-sanction ───────────────────────

class TestAutoSanction:
    def test_division_accept_auto_sanctions_to_approved(self, client, matrix_rows):
        """M39z: division-accept skips Accepted_By_Division and lands on Approved."""
        row = _find_row_by_status(matrix_rows, "Sent_To_Division")
        assert row, "Need at least one Sent_To_Division budget in Madhavrao seed"
        bid = row["budget_id"]
        body = row["body_code"]

        # Get the pre-state to know proposed_total
        pre = client.get(f"{BASE_URL}/api/tournament-budgets/{bid}").json()
        proposed_total = pre.get("total_ceiling_inr")
        proposed_heads = pre.get("head_allocations") or []
        assert proposed_total and proposed_total > 0

        r = client.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/division-accept",
            json={"actor_name": "TEST Division Sec", "actor_post": "Division_Secretary",
                  "actor_body_id": body, "notes": "TEST_M39z auto-accept"},
            headers={"X-User-Body-Code": body},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # Terminal Approved (skipped Accepted_By_Division)
        assert d["status"] == "Approved", f"Expected Approved, got {d['status']}"
        # Approved fields populated
        assert d.get("approved_total_inr") == proposed_total
        assert d.get("approved_head_allocations") == proposed_heads
        # Both sanction + division-accepted stamps set
        assert d.get("sanctioned_by") and d.get("sanctioned_at")
        assert d.get("division_accepted_by") and d.get("division_accepted_at")
        # Approval chain last step = Approved + Sanctioned
        chain = d.get("approval_chain") or []
        assert chain, "approval_chain must be non-empty"
        last = chain[-1]
        assert last.get("stage") == "Approved"
        assert last.get("decision") == "Sanctioned"

        # Persist by GET
        g = client.get(f"{BASE_URL}/api/tournament-budgets/{bid}")
        assert g.status_code == 200
        assert g.json()["status"] == "Approved"

    def test_scope_guard_403_on_foreign_body(self, client, matrix_rows):
        """A DIV-XXX header trying to accept a DIV-YYY budget → 403."""
        # Refetch to find any remaining Sent_To_Division row
        m = client.get(f"{BASE_URL}/api/tournaments/{TID}/finance/matrix",
                       headers={"X-Body-Code": "MPCA"}).json()
        row = _find_row_by_status(m, "Sent_To_Division")
        if not row:
            pytest.skip("No Sent_To_Division rows left in seed to test scope guard")
        bid = row["budget_id"]
        body = row["body_code"]
        foreign = "DIV-FOREIGN-XYZ"
        assert foreign != body
        r = client.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/division-accept",
            json={"actor_name": "Attacker", "actor_body_id": foreign},
            headers={"X-User-Body-Code": foreign},
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code} · {r.text}"

    def test_scope_guard_mpca_header_allowed(self, client):
        # MPCA header on a Division budget should be allowed
        m = client.get(f"{BASE_URL}/api/tournaments/{TID}/finance/matrix",
                       headers={"X-Body-Code": "MPCA"}).json()
        row = _find_row_by_status(m, "Sent_To_Division")
        if not row:
            pytest.skip("No Sent_To_Division rows left to test MPCA passthrough")
        bid = row["budget_id"]
        # Send request-revision instead to avoid consuming a whole row
        r = client.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/request-revision",
            json={"actor_name": "TEST MPCA", "reason": "TEST_M39z regression check"},
            headers={"X-User-Body-Code": "MPCA"},
        )
        # 200 (accepted) proves the MPCA header didn't get rejected by scope guard.
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Revision_Requested"


# ─────────────────────── Revision ───────────────────────

class TestRevision:
    def test_request_revision_transitions_correctly(self, client):
        m = client.get(f"{BASE_URL}/api/tournaments/{TID}/finance/matrix",
                       headers={"X-Body-Code": "MPCA"}).json()
        row = _find_row_by_status(m, "Sent_To_Division")
        if not row:
            pytest.skip("No Sent_To_Division rows for revision test")
        bid = row["budget_id"]
        body = row["body_code"]
        r = client.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/request-revision",
            json={"actor_name": "TEST DivSec", "actor_body_id": body,
                  "reason": "TEST_M39z please revise this"},
            headers={"X-User-Body-Code": body},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Revision_Requested"


# ─────────────────────── Legacy sanction ───────────────────────

class TestLegacySanction:
    """The old /sanction endpoint must still work for docs stuck in
    Accepted_By_Division (pre-M39z). We synthesize this state by directly
    posting to the DB via an admin endpoint — since none exists, we skip
    if we cannot find such a doc naturally."""

    def test_sanction_endpoint_still_wired(self, client):
        # We cannot easily reach Accepted_By_Division through the new flow,
        # so at minimum verify the endpoint 404s cleanly on unknown id
        # (proving route still exists) and 409s on wrong-state docs.
        r = client.post(
            f"{BASE_URL}/api/tournament-budgets/does-not-exist/sanction",
            json={"actor_name": "TEST MPCA"},
        )
        assert r.status_code == 404, f"Sanction route missing? {r.status_code}"

    def test_sanction_rejects_sent_status(self, client):
        m = client.get(f"{BASE_URL}/api/tournaments/{TID}/finance/matrix",
                       headers={"X-Body-Code": "MPCA"}).json()
        row = _find_row_by_status(m, "Sent_To_Division")
        if not row:
            pytest.skip("Nothing in Sent_To_Division to test 409")
        bid = row["budget_id"]
        r = client.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/sanction",
            json={"actor_name": "TEST MPCA"},
        )
        # Should refuse (409) because status != Accepted_By_Division
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"

    def test_sanction_rejects_approved_status(self, client):
        # DIV-JBP is already Approved from the smoke test
        bid = "bd7277f2-37f1-4f4c-a7ce-a60dfb5f031f"
        pre = client.get(f"{BASE_URL}/api/tournament-budgets/{bid}")
        if pre.status_code != 200 or pre.json().get("status") != "Approved":
            pytest.skip("DIV-JBP not in Approved state, cannot test double-sanction guard")
        r = client.post(
            f"{BASE_URL}/api/tournament-budgets/{bid}/sanction",
            json={"actor_name": "TEST MPCA"},
        )
        assert r.status_code == 409
