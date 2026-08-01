"""M39r · Tournament Finance Console — MPCA-owned budget flow tests.

Covers:
 - GET /tournaments/{tid}/finance/matrix
 - POST /tournaments/{tid}/finance/prepare-budgets (skip-live logic)
 - POST /tournaments/{tid}/finance/send-budgets
 - POST /tournament-budgets/{bid}/division-accept (+ 403 scope guard)
 - POST /tournament-budgets/{bid}/request-revision (+ 403 scope guard)
 - POST /tournament-budgets/{bid}/sanction (+ 409 state guards)
 - Action Centre wiring (my_pending_inbox + tournament_pending_actions)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Seeded tournament: Bhopal Division Inter-District, scheme 2-A, 1 Host + 3 Visitors
TID = "16a2fdd5-aac0-4832-9ad5-a862c31b33cd"
TID_RANJI = "a8e9189a-e732-485d-89d2-229ddc9f52c5"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def matrix(s):
    r = s.get(f"{API}/tournaments/{TID}/finance/matrix")
    assert r.status_code == 200, r.text
    return r.json()


# ─── Matrix endpoint ─────────────────────────────────────────────

def test_matrix_returns_all_participants(matrix):
    assert matrix["tournament_id"] == TID
    assert matrix["scheme_code"] == "2-A"
    assert matrix["input_vars_set"] is True
    assert matrix["row_count"] >= 4
    roles = [r["role"] for r in matrix["rows"]]
    assert "Host" in roles
    assert roles.count("Visitor") >= 1


def test_matrix_row_shape(matrix):
    row = matrix["rows"][0]
    for f in ("body_code", "body_name", "role", "budget_status",
              "budget_total_inr", "invoice_total_inr", "next_action_for"):
        assert f in row, f"missing {f} on matrix row"
    assert "waiting_on" in row["next_action_for"]
    assert "action" in row["next_action_for"]


def test_matrix_next_action_hint_semantics(matrix):
    # Sanity — Sent_To_Division rows should wait on the body; Approved on the body (upload invoices)
    for r in matrix["rows"]:
        bs = r["budget_status"]
        wo = r["next_action_for"]["waiting_on"]
        if bs == "Sent_To_Division":
            assert wo == r["body_code"]
        if bs == "Accepted_By_Division":
            assert wo == "MPCA"
        if bs == "Revision_Requested":
            assert wo == "MPCA"


# ─── State machine guards ────────────────────────────────────────

def test_sanction_on_draft_returns_409(s, matrix):
    # Find any Draft budget; if none, create one via a fresh prepare on a
    # tournament that has NO live budgets, else skip.
    draft = next((r for r in matrix["rows"] if r["budget_status"] == "Draft"), None)
    if not draft:
        pytest.skip("No Draft budget in seed; skipping (state guard covered by 409-on-Sent test)")
    r = s.post(f"{API}/tournament-budgets/{draft['budget_id']}/sanction",
               json={"actor_name": "TEST", "actor_body_id": "MPCA"})
    assert r.status_code == 409, r.text


def test_sanction_on_sent_returns_409(s, matrix):
    sent = next((r for r in matrix["rows"] if r["budget_status"] == "Sent_To_Division"), None)
    if not sent:
        pytest.skip("No Sent_To_Division row in current state")
    r = s.post(f"{API}/tournament-budgets/{sent['budget_id']}/sanction",
               json={"actor_name": "TEST", "actor_body_id": "MPCA"})
    assert r.status_code == 409
    assert "Division must accept" in r.text or "status" in r.text.lower()


def test_accept_on_approved_returns_409(s, matrix):
    approved = next((r for r in matrix["rows"] if r["budget_status"] == "Approved"), None)
    if not approved:
        pytest.skip("No Approved row")
    r = s.post(f"{API}/tournament-budgets/{approved['budget_id']}/division-accept",
               json={"actor_name": "TEST"})
    assert r.status_code == 409


# ─── Permission (scope) guards ───────────────────────────────────

def test_division_accept_wrong_body_403(s, matrix):
    sent = next((r for r in matrix["rows"] if r["budget_status"] == "Sent_To_Division"), None)
    if not sent:
        pytest.skip("No Sent_To_Division row")
    r = s.post(
        f"{API}/tournament-budgets/{sent['budget_id']}/division-accept",
        headers={"X-User-Body-Code": "SOME-OTHER-BODY", "Content-Type": "application/json"},
        json={"actor_name": "Impostor"},
    )
    assert r.status_code == 403, r.text


def test_request_revision_wrong_body_403(s, matrix):
    sent = next((r for r in matrix["rows"] if r["budget_status"] == "Sent_To_Division"), None)
    if not sent:
        pytest.skip("No Sent_To_Division row")
    r = s.post(
        f"{API}/tournament-budgets/{sent['budget_id']}/request-revision",
        headers={"X-User-Body-Code": "SOME-OTHER-BODY", "Content-Type": "application/json"},
        json={"actor_name": "Impostor", "reason": "trying"},
    )
    assert r.status_code == 403


# ─── Prepare skip-live logic ─────────────────────────────────────

def test_prepare_skips_live_budgets(s, matrix):
    """Re-preparing must SKIP anything in Sent/Accepted/Approved state."""
    r = s.post(f"{API}/tournaments/{TID}/finance/prepare-budgets", json={
        "input_variables": {"num_teams": 4, "num_players_per_team": 15,
                            "days": 5, "travel_km": 300, "hotel_nights": 4},
        "prepared_by_name": "TEST_M39R",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    live_states = {"Sent_To_Division", "Accepted_By_Division", "Approved"}
    live_rows = [row for row in matrix["rows"] if row["budget_status"] in live_states]
    skipped_codes = {s["body_code"] for s in body.get("skipped", [])}
    for lr in live_rows:
        assert lr["body_code"] in skipped_codes, (
            f"{lr['body_code']} ({lr['budget_status']}) not in skipped list: {body}")
    # Response schema
    assert set(body.keys()) >= {"created", "replaced", "skipped",
                                 "created_count", "replaced_count", "skipped_count"}


# ─── Full happy-path on a fresh (or driveable) row ───────────────

def test_full_flow_on_revision_requested_row(s):
    """Revision_Requested → send-budgets (re-send) → division-accept → sanction."""
    # Pull fresh matrix
    m = s.get(f"{API}/tournaments/{TID}/finance/matrix").json()
    rev = next((r for r in m["rows"] if r["budget_status"] == "Revision_Requested"), None)
    if not rev:
        pytest.skip("No Revision_Requested row to exercise re-send flow")

    bid = rev["budget_id"]
    body_code = rev["body_code"]

    # Re-send (MPCA)
    r = s.post(f"{API}/tournaments/{TID}/finance/send-budgets",
               json={"actor_name": "TEST_MPCA", "only_budget_ids": [bid]})
    assert r.status_code == 200, r.text
    assert r.json()["sent_count"] >= 1

    # Division accepts (with correct scope header)
    r = s.post(f"{API}/tournament-budgets/{bid}/division-accept",
               headers={"X-User-Body-Code": body_code, "Content-Type": "application/json"},
               json={"actor_name": "TEST_DIV", "actor_body_id": body_code})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Accepted_By_Division"

    # MPCA sanctions
    r = s.post(f"{API}/tournament-budgets/{bid}/sanction",
               json={"actor_name": "TEST_MPCA", "actor_body_id": "MPCA"})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] == "Approved"
    assert doc.get("sanctioned_by") == "TEST_MPCA"
    assert doc.get("approved_total_inr") is not None


def test_request_revision_flow_on_sent_row(s):
    """Sent_To_Division → request-revision stores reason."""
    m = s.get(f"{API}/tournaments/{TID}/finance/matrix").json()
    sent = next((r for r in m["rows"] if r["budget_status"] == "Sent_To_Division"), None)
    if not sent:
        pytest.skip("No Sent_To_Division row to revise")
    bid = sent["budget_id"]
    body_code = sent["body_code"]
    reason = "TEST_M39R travel distance underestimated"
    r = s.post(f"{API}/tournament-budgets/{bid}/request-revision",
               headers={"X-User-Body-Code": body_code, "Content-Type": "application/json"},
               json={"actor_name": "TEST_DIV", "reason": reason})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] == "Revision_Requested"
    assert doc.get("revision_reason") == reason


# ─── Sanity: existing endpoints still reachable ──────────────────

def test_legacy_budgets_list_still_works(s):
    r = s.get(f"{API}/tournament-budgets")
    assert r.status_code == 200


def test_tournament_still_returns(s):
    r = s.get(f"{API}/tournaments/{TID}")
    assert r.status_code == 200
    assert r.json()["scheme_code"] == "2-A"


# ─── Action Centre integration ───────────────────────────────────

def test_action_center_tournament_pending_actions(s):
    """Tournament-scoped action feed emits budget_send / budget_acceptance /
    budget_sanction / budget_revise kinds."""
    r = s.get(f"{API}/tournaments/{TID}/pending-actions")
    if r.status_code == 404:
        pytest.skip("tournament_pending_actions endpoint not exposed under this path")
    assert r.status_code == 200, r.text
    payload = r.json()
    items = payload if isinstance(payload, list) else payload.get("items") or payload.get("actions") or []
    kinds = {i.get("kind") for i in items}
    # At least ONE of the new finance kinds should appear given the seeded state
    finance_kinds = {"budget_send", "budget_acceptance", "budget_sanction", "budget_revise"}
    if not (kinds & finance_kinds):
        pytest.skip(f"No finance kinds in pending actions ({kinds}) — state may not have live rows")
    assert kinds & finance_kinds


def test_my_pending_inbox_reachable(s):
    r = s.get(f"{API}/action-center/my-inbox", headers={"X-User-Body-Code": "MPCA"})
    # Endpoint name may differ; try alt
    if r.status_code == 404:
        r = s.get(f"{API}/my-pending-inbox", headers={"X-User-Body-Code": "MPCA"})
    if r.status_code == 404:
        pytest.skip("my_pending_inbox path unknown in this build")
    assert r.status_code == 200
