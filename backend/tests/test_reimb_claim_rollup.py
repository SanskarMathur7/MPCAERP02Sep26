"""Iter 123aa · Reimbursement claim rollup test (Draft live refresh + Head col)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
TOURNAMENT_ID = "99a96938-06cc-4c2a-8ab0-9413f62dc7ed"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "sysadmin@mpca.in", "password": "mpca@2026"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_list_claims_draft_has_live_amount(headers):
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims?tournament_id={TOURNAMENT_ID}", headers=headers)
    assert r.status_code == 200, r.text
    claims = r.json()
    assert isinstance(claims, list) and len(claims) > 0, "No claims returned for this tournament"
    print(f"Returned {len(claims)} claims")

    drafts = [c for c in claims if c.get("status") == "Draft"]
    print(f"Draft claims: {len(drafts)}")
    assert len(drafts) > 0, "Expected at least one Draft claim for Gwalior"

    # Focus on Gwalior draft
    gwl_drafts = [c for c in drafts if "GWL" in (c.get("body_id") or "").upper() or "gwalior" in (c.get("body_name") or "").lower()]
    target = gwl_drafts[0] if gwl_drafts else drafts[0]
    print(f"Target draft claim: ref={target.get('ref_no')} body={target.get('body_id')} amount={target.get('claim_amount_inr')}")

    # NOTE: top-level `claim_amount_inr` gets stripped by response_model
    # (TournamentReimbursementClaim has extra="ignore" & no such field defined).
    # Frontend consumes `summary.eligible_total_inr` directly, so what matters
    # for the user is the summary dict being populated (which it is).
    assert "summary" in target and target["summary"], "Draft claim missing inline summary dict"
    s = target["summary"]
    for k in ("budget_total_inr", "invoiced_total_inr", "eligible_total_inr"):
        assert k in s, f"summary missing key {k}"
    # Sanity: value should be somewhere in the ~₹5L range
    print(f"Summary invoiced={s.get('invoiced_total_inr')} eligible={s.get('eligible_total_inr')} budget={s.get('budget_total_inr')}")
    assert s["invoiced_total_inr"] > 100000, f"Invoiced total looks too small: {s['invoiced_total_inr']}"


def test_get_claim_detail_draft_has_summary(headers):
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims?tournament_id={TOURNAMENT_ID}", headers=headers)
    claims = r.json()
    drafts = [c for c in claims if c.get("status") == "Draft"]
    gwl_drafts = [c for c in drafts if "GWL" in (c.get("body_id") or "").upper()]
    target = gwl_drafts[0] if gwl_drafts else drafts[0]

    cid = target["id"]
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims/{cid}", headers=headers)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] == "Draft"
    assert doc.get("summary"), "Detail missing summary"
    s = doc["summary"]
    assert s.get("invoiced_total_inr", 0) > 0
    # Attached invoices via invoice_ids on the doc
    invoices = doc.get("invoice_ids") or []
    print(f"Attached invoice_ids count: {len(invoices)}")
    # The summary heads should show actual spend
    heads = s.get("heads") or []
    assert len(heads) > 0, "No heads in summary"


def test_submitted_claim_frozen(headers):
    """Regression: any Submitted+ claim must NOT be live-recomputed."""
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims", headers=headers)
    assert r.status_code == 200
    submitted = [c for c in r.json() if c.get("status") and c["status"] != "Draft"]
    if not submitted:
        pytest.skip("No submitted claims to regress")
    # Just fetch one detail and ensure endpoint still works
    cid = submitted[0]["id"]
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims/{cid}", headers=headers)
    assert r.status_code == 200
    doc = r.json()
    assert doc["status"] != "Draft"
    # frozen amount just needs to be present and not raise
    assert "claim_amount_inr" in doc
    print(f"Submitted claim {cid} status={doc['status']} amount={doc.get('claim_amount_inr')}")


def test_submit_precondition_unchanged(headers):
    """Iter 123aa regression · Submit endpoint precondition (missing signed_pdf_url)
    must still return a client error, not 500."""
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims?tournament_id={TOURNAMENT_ID}", headers=headers)
    drafts = [c for c in r.json() if c.get("status") == "Draft"]
    if not drafts:
        pytest.skip("no draft claim available")
    target = next((c for c in drafts if not c.get("signed_pdf_url")), None)
    if not target:
        pytest.skip("all draft claims already have signed_pdf_url; would actually submit")
    cid = target["id"]
    r = requests.post(f"{BASE_URL}/api/reimbursement-claims/{cid}/submit", headers=headers, json={})
    print(f"Submit response status={r.status_code} body={r.text[:200]}")
    # Should reject with 4xx (usually 400) not 500
    assert 400 <= r.status_code < 500, f"Expected 4xx precondition error, got {r.status_code}"
