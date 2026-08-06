"""M39z.e · Correct District-Consolidator scoping to tournament ownership.

Sprint additions verified here (delta over M39z.d):
- District cannot claim on MPCA-owned tournament (422)
- District cannot claim on Division-owned tournament hosted by a Division OTHER
  than their parent (422 parent-Division mismatch)
- District CAN claim on tournament hosted by their parent Division (200; routes
  to that Division)
- Consolidate rejects when payload.division_body_id != tournament.host_body_id
  (422 with both codes mentioned)
- GET /api/tournaments/{tid} returns 403 for District when host != parent Div
- GET /api/tournaments/{tid} returns 200 for District when host == parent Div
- GET /reimbursement-claims with route_to_body_id==caller.body_code returns
  claims routed to them (reviewer-scope) — used for Incoming District Claims
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

TID_MPCA = "bb71efd9-58be-436d-b04a-0aca48aa4f43"    # MPCA-hosted (host=MPCA)
TID_DIVIND = "16a2fdd5-aac0-4832-9ad5-a862c31b33cd"  # DIV-IND-hosted
FISCAL = "2026-27"
DIST_INDO = "DIST-INDO-IND"    # parent = DIV-IND
DIV_IND = "DIV-IND"
DIV_BPL = "DIV-BPL"


def _h(body_code, body_type):
    return {"X-Body-Code": body_code, "X-Body-Type": body_type,
            "Content-Type": "application/json"}


# ─────────────── Tournament GET scope (District) ───────────────

def test_tournament_get_mpca_host_403_for_district():
    r = requests.get(f"{BASE_URL}/api/tournaments/{TID_MPCA}",
                     headers=_h(DIST_INDO, "District"))
    assert r.status_code == 403, r.text
    assert "not hosted by your parent Division" in r.text or "Districts only" in r.text


def test_tournament_get_parent_division_200_for_district():
    r = requests.get(f"{BASE_URL}/api/tournaments/{TID_DIVIND}",
                     headers=_h(DIST_INDO, "District"))
    assert r.status_code == 200, r.text
    assert r.json()["id"] == TID_DIVIND


def test_tournament_get_mpca_host_200_for_mpca():
    r = requests.get(f"{BASE_URL}/api/tournaments/{TID_MPCA}",
                     headers=_h("MPCA", "State"))
    assert r.status_code == 200
    assert (r.json().get("host_body_id") or "MPCA") == "MPCA"


# ─────────────── Submit routing (host_body_id driven) ───────────────

def _fresh_dist_draft(tid, body_id=DIST_INDO):
    # cleanup any existing Draft
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                     params={"tournament_id": tid, "body_id": body_id,
                             "fiscal_cycle": FISCAL})
    if r.status_code == 200:
        for c in r.json():
            if c["status"] == "Draft":
                requests.delete(f"{BASE_URL}/api/reimbursement-claims/{c['id']}")
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims",
                      json={"tournament_id": tid, "body_id": body_id,
                            "fiscal_cycle": FISCAL, "notes": "TEST_m39ze"})
    if r.status_code == 409:
        # Fetch existing non-Draft to reuse
        r2 = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                          params={"tournament_id": tid, "body_id": body_id,
                                  "fiscal_cycle": FISCAL})
        for c in r2.json():
            return c
    assert r.status_code == 200, r.text
    claim = r.json()
    # attach signed pdf so submit is not blocked by 412
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/signed-pdf",
                      json={"signed_pdf_url": "https://test/m39ze.pdf",
                            "uploaded_by": "TEST"})
    assert r.status_code == 200, r.text
    return r.json()


def test_district_submit_on_mpca_tournament_422():
    # Use a District without a pre-existing non-Draft claim on TID_MPCA
    claim = _fresh_dist_draft(TID_MPCA, "DIST-BARW-IND")
    if claim.get("status") != "Draft":
        # Cleanup a stale non-Draft claim so this scenario can run
        pytest.skip(f"claim not in Draft (status={claim.get('status')}) — cannot re-test submit")
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/submit",
                      json={"actor_name": "TEST", "actor_role": "district-secretary",
                            "actor_body_id": DIST_INDO})
    assert r.status_code == 422, r.text
    assert "Districts do not participate" in r.text or "MPCA-owned" in r.text.lower() or "MPCA" in r.text


def test_district_submit_wrong_parent_division_422():
    """DIST-INDO-IND (parent DIV-IND) tries to claim on a tournament hosted by
    a DIFFERENT Division. We reuse TID_DIVIND indirectly — since DIST-INDO's
    parent IS DIV-IND, it matches. To exercise the mismatch we use a district
    from another division against TID_DIVIND."""
    # Find any district whose parent is NOT DIV-IND
    r = requests.get(f"{BASE_URL}/api/bodies", params={"body_type": "District"})
    if r.status_code != 200:
        pytest.skip("bodies list unavailable")
    other_dist = None
    for b in r.json():
        if b.get("body_type") == "District" and b.get("parent_code") and b["parent_code"] != DIV_IND:
            other_dist = b["code"]
            break
    if not other_dist:
        pytest.skip("no District with parent != DIV-IND available")
    claim = _fresh_dist_draft(TID_DIVIND, other_dist)
    if claim.get("status") != "Draft":
        pytest.skip(f"claim not in Draft (status={claim.get('status')})")
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/submit",
                      json={"actor_name": "TEST", "actor_role": "district-secretary",
                            "actor_body_id": other_dist})
    assert r.status_code == 422, r.text
    body = r.text
    assert "parent Division" in body or "hosted by" in body


def test_district_submit_on_parent_division_hosted_routes_correctly():
    claim = _fresh_dist_draft(TID_DIVIND, DIST_INDO)
    if claim.get("status") != "Draft":
        pytest.skip(f"claim not in Draft (status={claim.get('status')})")
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/submit",
                      json={"actor_name": "TEST", "actor_role": "district-secretary",
                            "actor_body_id": DIST_INDO})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["route_to_body_id"] == DIV_IND
    assert doc["review_stage"] == "Division"
    assert doc["status"] == "Submitted"


# ─────────────── Consolidate — host_body_id enforcement ───────────────

def test_consolidate_mismatch_division_and_host_422():
    """DIV-BPL trying to consolidate on a DIV-IND-hosted tournament."""
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/consolidate",
                      json={"tournament_id": TID_DIVIND, "division_body_id": DIV_BPL,
                            "fiscal_cycle": FISCAL, "actor_name": "TEST_MPCA"},
                      headers=_h("MPCA", "State"))  # State bypasses scope, hits host guard
    assert r.status_code == 422, r.text
    body = r.text
    assert DIV_BPL in body
    assert DIV_IND in body or "hosted by" in body


def test_consolidate_on_mpca_hosted_tournament_422():
    """A Division tries to consolidate on a MPCA-hosted tournament (host=MPCA).
    Districts can't submit there, so consolidation is meaningless — should 422."""
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/consolidate",
                      json={"tournament_id": TID_MPCA, "division_body_id": DIV_IND,
                            "fiscal_cycle": FISCAL, "actor_name": "TEST_MPCA"},
                      headers=_h("MPCA", "State"))
    assert r.status_code == 422, r.text
    assert "MPCA" in r.text or "hosted by" in r.text


# ─────────────── Reviewer-scope list_claims ───────────────

def test_division_reviewer_scope_returns_children_routed_to_them():
    """Division caller passes route_to_body_id=own_body_code → returns claims
    routed TO them (used by Incoming District Claims panel)."""
    # Ensure at least one submitted claim routed to DIV-IND on TID_DIVIND
    claim = _fresh_dist_draft(TID_DIVIND, DIST_INDO)
    if claim.get("status") == "Draft":
        requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/submit",
                      json={"actor_name": "TEST", "actor_role": "district-secretary",
                            "actor_body_id": DIST_INDO})
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                     params={"tournament_id": TID_DIVIND, "route_to_body_id": DIV_IND,
                             "fiscal_cycle": FISCAL},
                     headers=_h(DIV_IND, "Division"))
    assert r.status_code == 200, r.text
    rows = r.json()
    # The returned rows must include at least the DIST-INDO claim we just submitted
    body_ids = {c["body_id"] for c in rows}
    assert DIST_INDO in body_ids, f"reviewer scope missed DIST-INDO claim: {body_ids}"
    # AND every row must actually be routed to DIV_IND
    for c in rows:
        assert c.get("route_to_body_id") == DIV_IND


# ─────────────── Regression: MPCA can still approve/reject (State override) ───

def test_mpca_can_still_approve_district_claim_state_override():
    """Regression: MPCA (State scope) can override and approve District claims."""
    claim = _fresh_dist_draft(TID_DIVIND, DIST_INDO)
    if claim.get("status") == "Draft":
        sub = requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/submit",
                            json={"actor_name": "TEST", "actor_role": "district-secretary",
                                  "actor_body_id": DIST_INDO})
        if sub.status_code != 200:
            pytest.skip(f"cannot bring claim to Submitted: {sub.status_code} {sub.text}")
    # If status is now Approved from earlier test we skip
    doc = requests.get(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}").json()
    if doc["status"] not in ("Submitted", "Under_Review"):
        pytest.skip(f"claim status {doc['status']} — cannot approve")
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/approve",
                      json={"actor_name": "TEST_MPCA", "actor_role": "secretary",
                            "actor_body_id": "MPCA", "approved_amount_inr": 0},
                      headers=_h("MPCA", "State"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Approved"
