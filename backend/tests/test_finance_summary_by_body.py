"""Iter 126 backend tests: /tournaments/{tid}/finance-summary-by-body + attached invoice file auth."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TID = "99a96938-06cc-4c2a-8ab0-9413f62dc7ed"
CLAIM_ID = "546330a0-a514-43cf-8af5-e29bfda4c705"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "sysadmin@mpca.in", "password": "mpca@2026"
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_finance_summary_by_body_ok(auth):
    r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/finance-summary-by-body", headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "rows" in data
    assert "totals" in data
    rows = data["rows"]
    assert isinstance(rows, list) and len(rows) > 0

    gwl = next((row for row in rows if row.get("body_code") == "DIV-GWL"), None)
    assert gwl is not None, f"No DIV-GWL row. codes={[r.get('body_code') for r in rows]}"
    assert gwl["claim_status"] == "Approved", gwl
    assert gwl["claim_ref"] == "TRC-2026-27-0001", gwl
    assert gwl["eligible_amount_inr"] > 0
    assert abs(gwl["mpca_approved_inr"] - 465131) < 2, gwl["mpca_approved_inr"]
    assert gwl["paid_amount_inr"] > 0, gwl
    assert gwl["advance_before_claim"] > 0, gwl
    # invariant: remaining = max(source - paid, 0)
    source = gwl["mpca_approved_inr"] or gwl["eligible_amount_inr"]
    expected_remaining = max(source - gwl["paid_amount_inr"], 0)
    assert abs(gwl["remaining_amount_inr"] - expected_remaining) < 2, (gwl["remaining_amount_inr"], expected_remaining)
    # overpaid invariant
    if gwl["paid_amount_inr"] > source:
        assert abs(gwl["overpaid_amount_inr"] - (gwl["paid_amount_inr"] - source)) < 2


def test_finance_summary_totals(auth):
    r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/finance-summary-by-body", headers=auth)
    data = r.json()
    rows = data["rows"]
    totals = data["totals"]
    assert abs(totals["remaining_amount_inr"] - sum(row["remaining_amount_inr"] for row in rows)) < 1
    # also sanity for other totals
    for key in ["eligible_amount_inr", "mpca_approved_inr", "paid_amount_inr"]:
        if key in totals and totals[key] is not None:
            expected = sum((row.get(key) or 0) for row in rows)
            assert abs(totals[key] - expected) < 1, (key, totals[key], expected)


def test_finance_summary_404(auth):
    r = requests.get(f"{BASE_URL}/api/tournaments/nonsense-id-xyz/finance-summary-by-body", headers=auth)
    assert r.status_code == 404, r.status_code


def test_attached_invoices_file_url_auth_required(auth):
    """Fetch claim, resolve invoice_ids, and verify /api/uploads/{id} needs auth."""
    r = requests.get(f"{BASE_URL}/api/reimbursement-claims/{CLAIM_ID}", headers=auth)
    assert r.status_code == 200, r.text
    claim = r.json()
    invoice_ids = claim.get("invoice_ids") or []
    assert len(invoice_ids) >= 1, "No invoice_ids on claim"
    # fetch invoices to find one with file_url
    upload_id = None
    for iid in invoice_ids:
        ir = requests.get(f"{BASE_URL}/api/tournament-invoices/{iid}", headers=auth)
        if ir.status_code != 200:
            continue
        inv = ir.json()
        fu = inv.get("file_url") or inv.get("signed_invoice_file_id") or inv.get("file_id")
        if fu:
            if isinstance(fu, str) and "/uploads/" in fu:
                upload_id = fu.rsplit("/", 1)[-1]
            else:
                upload_id = str(fu)
            break
    assert upload_id, "No invoice with file_url found"

    r_noauth = requests.get(f"{BASE_URL}/api/uploads/{upload_id}")
    assert r_noauth.status_code in (401, 403), f"expected 401/403, got {r_noauth.status_code}"

    r_auth = requests.get(f"{BASE_URL}/api/uploads/{upload_id}", headers=auth)
    assert r_auth.status_code == 200, r_auth.status_code
