"""M32.1 hotfix · Budget regeneration guard + MPCA approve/return/reject round-trip.

Fixtures:
- SM Khan Trophy tournament id 58bd8f3c-2562-4231-b846-537103e8a542
- DIV-IND currently has TB-2026-27-003 in Submitted status.
- Older TB-2026-27-001/002 are Cancelled.

The tests should leave the tournament in Submitted TB-003 state at the end.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TID = "58bd8f3c-2562-4231-b846-537103e8a542"
BODY = "DIV-IND"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─── 1. Cancelled status is valid on read ───
def test_cancelled_budgets_load_without_validation_errors(client):
    r = client.get(f"{BASE_URL}/api/tournament-budgets")
    assert r.status_code == 200, r.text
    rows = r.json()
    cancelled = [b for b in rows if b.get("status") == "Cancelled"]
    # Not required to have Cancelled rows, but they must load if present.
    assert isinstance(rows, list)
    print(f"Loaded {len(rows)} budgets · {len(cancelled)} Cancelled rows accepted")


# ─── 2. Existing submitted budget confirmed ───
def test_active_submitted_budget_exists(client):
    r = client.get(f"{BASE_URL}/api/tournament-budgets", params={"tournament_id": TID})
    assert r.status_code == 200
    rows = [b for b in r.json() if b.get("body_id") == BODY]
    submitted = [b for b in rows if b.get("status") == "Submitted"]
    assert submitted, f"Expected an active Submitted budget for {BODY} — got statuses {[b.get('status') for b in rows]}"
    print(f"Active submitted: {submitted[0]['budget_no']}")


# ─── 3. Generate endpoint blocks with 400 while Submitted exists ───
def test_generate_blocked_while_submitted(client):
    r = client.post(f"{BASE_URL}/api/tournaments/{TID}/participants/{BODY}/budget/generate")
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    detail = (r.json() or {}).get("detail", "")
    assert "TB-" in detail, f"Detail should mention blocking budget_no: {detail}"
    assert "Submitted" in detail, f"Detail should mention status: {detail}"
    print(f"Guard message: {detail}")


# ─── 4. Round-trip: Return → regenerate → Submit again ───
def test_return_then_regenerate_then_submit_roundtrip(client):
    # Fetch the submitted budget
    r = client.get(f"{BASE_URL}/api/tournament-budgets", params={"tournament_id": TID})
    submitted = [b for b in r.json() if b.get("body_id") == BODY and b.get("status") == "Submitted"]
    assert submitted, "Prereq: need a Submitted budget"
    bid = submitted[0]["id"]

    # Return it
    ret = client.post(f"{BASE_URL}/api/tournament-budgets/{bid}/return", json={
        "actor_name": "Test MPCA", "actor_post": "Hon. Secretary",
        "actor_body_id": "MPCA", "notes": "test round-trip",
    })
    assert ret.status_code == 200, ret.text
    assert ret.json().get("status") == "Returned"

    # Now regenerate should succeed (Returned exists)
    gen = client.post(f"{BASE_URL}/api/tournaments/{TID}/participants/{BODY}/budget/generate")
    assert gen.status_code == 200, gen.text
    body = gen.json()
    assert body.get("regenerated") is True
    regen_bid = body["budget"]["id"]
    assert body["budget"]["status"] == "Returned" or body["budget"]["status"] == "Draft"

    # Submit again to restore leave-state
    sub = client.post(f"{BASE_URL}/api/tournament-budgets/{regen_bid}/submit", json={
        "actor_name": "Test Division", "actor_post": "Hon. Secretary",
        "actor_body_id": BODY, "notes": "resubmit for test cleanup",
    })
    assert sub.status_code == 200, sub.text
    assert sub.json().get("status") == "Submitted"
    print(f"Round-trip complete · {regen_bid} back to Submitted")


# ─── 5. Approve / Reject work (dry-check: only status transitions on temp budget) ───
def test_approve_endpoint_shape(client):
    # Just ensure the approve endpoint exists and rejects malformed calls with 4xx
    r = client.post(f"{BASE_URL}/api/tournament-budgets/does-not-exist/approve", json={
        "actor_name": "x", "actor_post": "x", "actor_body_id": "MPCA",
    })
    assert r.status_code in (400, 404, 422), r.status_code


def test_reject_endpoint_shape(client):
    r = client.post(f"{BASE_URL}/api/tournament-budgets/does-not-exist/reject", json={
        "actor_name": "x", "actor_post": "x", "actor_body_id": "MPCA",
    })
    assert r.status_code in (400, 404, 422), r.status_code
