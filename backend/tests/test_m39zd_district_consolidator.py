"""M39z.d · District Consolidator backend tests.

Tests cover:
- Tournament read-access for District via parent Division participation
- Submit routes: District→Division, Division→MPCA
- Approve/Reject route-authority guard (403 on wrong Division; MPCA overrides)
- Consolidate endpoint: creates master, links children, idempotent, 409/422/403 edge cases
- Preview consolidator endpoint
- list_claims filters (route_to_body_id, is_master, exclude_consolidated)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
TID = "bb71efd9-58be-436d-b04a-0aca48aa4f43"      # MY Memorial Trophy
FISCAL = "2026-27"
DIST_CODE = "DIST-INDO-IND"
DIV_IND = "DIV-IND"
DIV_BPL = "DIV-BPL"


def _h(body_code, body_type):
    return {"X-Body-Code": body_code, "X-Body-Type": body_type, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tournament_ok():
    r = requests.get(f"{BASE_URL}/api/tournaments/{TID}")
    assert r.status_code == 200, f"seed tournament missing: {r.status_code}"
    return r.json()


# ─────────────── Tournament visibility ───────────────

def test_district_can_read_tournament_via_parent_division(tournament_ok):
    r = requests.get(f"{BASE_URL}/api/tournaments/{TID}", headers=_h(DIST_CODE, "District"))
    assert r.status_code == 200, r.text
    assert r.json()["id"] == TID


# ─────────────── Fixture: ensure participant + budget for DIST body & DIV-IND ───────────────

@pytest.fixture(scope="module")
def dist_draft_claim(tournament_ok):
    """Create a Draft District claim with a signed_pdf preloaded."""
    # cleanup any prior TEST claims for this district on this tournament
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                     params={"tournament_id": TID, "body_id": DIST_CODE, "fiscal_cycle": FISCAL})
    if r.status_code == 200:
        for c in r.json():
            if c["status"] == "Draft":
                requests.delete(f"{BASE_URL}/api/reimbursement-claims/{c['id']}")

    payload = {"tournament_id": TID, "body_id": DIST_CODE, "fiscal_cycle": FISCAL,
               "notes": "TEST_dist_claim"}
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims", json=payload)
    if r.status_code == 409:
        # existing non-Draft claim — pull it
        r2 = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                         params={"tournament_id": TID, "body_id": DIST_CODE, "fiscal_cycle": FISCAL})
        for c in r2.json():
            if c["status"] in ("Draft", "Submitted", "Approved"):
                return c
    assert r.status_code == 200, r.text
    claim = r.json()
    # attach signed PDF so we can submit
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{claim['id']}/signed-pdf",
                      json={"signed_pdf_url": "https://test/signed.pdf", "uploaded_by": "TEST"})
    assert r.status_code == 200, r.text
    return r.json()


def test_district_submit_routes_to_parent_division(dist_draft_claim):
    cid = dist_draft_claim["id"]
    if dist_draft_claim["status"] != "Draft":
        pytest.skip(f"Claim in status {dist_draft_claim['status']}, cannot re-submit")
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/submit",
                      json={"actor_name": "TEST_DistSec", "actor_role": "district-secretary",
                            "actor_body_id": DIST_CODE, "notes": "TEST submit"})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["route_to_body_id"] == DIV_IND
    assert doc["review_stage"] == "Division"
    assert doc["status"] == "Submitted"
    last_step = doc["approval_chain"][-1]
    assert DIV_IND in (last_step.get("notes") or ""), f"missing route note: {last_step}"


# ─────────────── Approve authority guard ───────────────

def test_wrong_division_cannot_approve_district_claim(dist_draft_claim):
    cid = dist_draft_claim["id"]
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/approve",
                      json={"actor_name": "TEST_WrongDiv", "actor_role": "division-secretary", "actor_body_id": DIV_BPL},
                      headers=_h(DIV_BPL, "Division"))
    assert r.status_code == 403, r.text
    assert DIV_IND in r.text


def test_wrong_division_cannot_reject_district_claim(dist_draft_claim):
    cid = dist_draft_claim["id"]
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/reject",
                      json={"actor_name": "TEST_WrongDiv", "actor_role": "division-secretary", "actor_body_id": DIV_BPL, "notes": "TEST wrong-div reject"},
                      headers=_h(DIV_BPL, "Division"))
    assert r.status_code == 403, r.text


def test_correct_division_can_approve_district_claim(dist_draft_claim):
    cid = dist_draft_claim["id"]
    # refresh current state
    doc = requests.get(f"{BASE_URL}/api/reimbursement-claims/{cid}").json()
    if doc["status"] not in ("Submitted", "Under_Review"):
        pytest.skip(f"claim already in status {doc['status']}")
    eligible = float((doc.get("summary") or {}).get("eligible_total_inr") or 0)
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/approve",
                      json={"actor_name": "TEST_DivSec", "actor_role": "division-secretary", "actor_body_id": DIV_IND, "approved_amount_inr": eligible},
                      headers=_h(DIV_IND, "Division"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Approved"


# ─────────────── Preview consolidator ───────────────

def test_preview_consolidator_lists_approved_child():
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims/consolidator/preview",
                     params={"tournament_id": TID, "division_body_id": DIV_IND,
                             "fiscal_cycle": FISCAL})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["approved_child_count"] >= 1
    child_body_ids = [c["body_id"] for c in body["child_claims"]]
    assert DIST_CODE in child_body_ids
    assert body["roll_up_total_inr"] >= 0


# ─────────────── Consolidate — happy path + idempotency + 403/422 ───────────────

def test_consolidate_creates_master_and_links_children():
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/consolidate",
                      json={"tournament_id": TID, "division_body_id": DIV_IND,
                            "fiscal_cycle": FISCAL, "actor_name": "TEST_DivSec",
                            "actor_role": "division-secretary"},
                      headers=_h(DIV_IND, "Division"))
    assert r.status_code == 200, r.text
    master = r.json()
    assert master["is_master"] is True
    assert master["body_id"] == DIV_IND
    assert len(master["child_claim_ids"]) >= 1
    assert master["status"] == "Draft"
    # verify children linked
    for cid in master["child_claim_ids"]:
        child = requests.get(f"{BASE_URL}/api/reimbursement-claims/{cid}").json()
        assert child["parent_claim_id"] == master["id"]
    return master


def test_consolidate_idempotent_no_new_children():
    # second call with no new approved children should return 409
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/consolidate",
                      json={"tournament_id": TID, "division_body_id": DIV_IND,
                            "fiscal_cycle": FISCAL, "actor_name": "TEST_DivSec"},
                      headers=_h(DIV_IND, "Division"))
    assert r.status_code == 409, r.text
    assert "no approved" in r.text.lower() or "consolidate" in r.text.lower()


def test_consolidate_wrong_division_403():
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/consolidate",
                      json={"tournament_id": TID, "division_body_id": DIV_IND,
                            "fiscal_cycle": FISCAL, "actor_name": "TEST_WrongDiv"},
                      headers=_h(DIV_BPL, "Division"))
    assert r.status_code == 403, r.text


def test_consolidate_non_division_body_422():
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/consolidate",
                      json={"tournament_id": TID, "division_body_id": DIST_CODE,
                            "fiscal_cycle": FISCAL, "actor_name": "TEST_DistSec"},
                      headers=_h("MPCA", "State"))  # MPCA can bypass scope guard
    assert r.status_code == 422, r.text


# ─────────────── List filters ───────────────

def test_list_claims_filter_is_master_true():
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                     params={"tournament_id": TID, "is_master": "true"},
                     headers=_h("MPCA", "State"))
    assert r.status_code == 200, r.text
    for c in r.json():
        assert c.get("is_master") is True


def test_list_claims_filter_route_to_mpca_masters(dist_draft_claim):
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                     params={"route_to_body_id": DIV_IND},
                     headers=_h("MPCA", "State"))
    assert r.status_code == 200, r.text
    # dist_draft_claim should appear
    ids = [c["id"] for c in r.json()]
    assert dist_draft_claim["id"] in ids


def test_list_claims_exclude_consolidated_hides_children():
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims",
                     params={"tournament_id": TID, "exclude_consolidated": "true"},
                     headers=_h("MPCA", "State"))
    assert r.status_code == 200, r.text
    for c in r.json():
        assert c.get("parent_claim_id") in (None, "")


# ─────────────── MPCA override on approve ───────────────

def test_mpca_can_approve_any_claim():
    # Create a fresh district draft & submit to test MPCA override
    payload = {"tournament_id": TID, "body_id": DIST_CODE, "fiscal_cycle": FISCAL,
               "notes": "TEST_mpca_override"}
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims", json=payload)
    if r.status_code != 200:
        pytest.skip(f"Cannot create fresh claim: {r.status_code} {r.text}")
    cid = r.json()["id"]
    requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/signed-pdf",
                  json={"signed_pdf_url": "https://test/2.pdf", "uploaded_by": "TEST"})
    sub = requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/submit",
                       json={"actor_name": "TEST", "actor_role": "district-secretary", "actor_body_id": DIST_CODE})
    assert sub.status_code == 200, sub.text
    # MPCA approves District→DIV routed claim
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/approve",
                      json={"actor_name": "TEST_MPCA", "actor_role": "secretary", "actor_body_id": "MPCA", "approved_amount_inr": 0},
                      headers=_h("MPCA", "State"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Approved"
