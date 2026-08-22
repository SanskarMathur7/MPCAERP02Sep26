"""
Iter 124 — Per-invoice AI diff chip + Tournament AI audit endpoint tests.
Backend endpoints:
  - POST /api/tournament-invoices/{iid}/verify-ai
  - POST /api/tournaments/{tid}/invoices/ai-audit?body_id=...
Also regression checks that the invoices list still works.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
TOURNAMENT_ID = "99a96938-06cc-4c2a-8ab0-9413f62dc7ed"  # Madhavrao Scindia Trophy
EMAIL = "sysadmin@mpca.in"
PASSWORD = "mpca@2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def invoices(client):
    r = client.get(f"{BASE_URL}/api/tournament-invoices",
                   params={"tournament_id": TOURNAMENT_ID}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    # Response could be list or {invoices: [...]}
    if isinstance(data, dict):
        data = data.get("invoices", data.get("items", []))
    return data


def test_invoices_list_regression(invoices):
    assert isinstance(invoices, list)
    assert len(invoices) >= 9
    # ai_diff field should exist (may be None)
    sample = invoices[0]
    assert "id" in sample
    # ai_diff key should be present in schema (None or dict)
    assert "ai_diff" in sample, f"Missing ai_diff key on invoice; keys={list(sample.keys())}"


def test_verify_ai_on_invoice_with_file(client, invoices):
    # Pick a non-Draft invoice that has an attached file
    candidates = [inv for inv in invoices
                  if inv.get("status") != "Draft"
                  and (inv.get("file_url") or inv.get("file_id") or inv.get("attachment_url") or inv.get("attachments"))]
    if not candidates:
        # fall back to any non-Draft
        candidates = [inv for inv in invoices if inv.get("status") != "Draft"]
    assert candidates, "No non-Draft invoices found to verify"
    inv = candidates[0]
    iid = inv["id"]

    # Gemini can be slow / occasionally 502 → retry once with extended timeout
    last = None
    for _ in range(2):
        r = client.post(f"{BASE_URL}/api/tournament-invoices/{iid}/verify-ai",
                        timeout=120)
        last = r
        if r.status_code == 200:
            break
    assert last.status_code == 200, f"verify-ai failed: {last.status_code} {last.text[:400]}"
    body = last.json()
    ai = body.get("ai_diff") or {}
    assert ai, f"ai_diff missing/empty in response: {body}"
    assert ai.get("status") in ("green", "amber", "error", "skipped"), \
        f"unexpected ai_diff.status={ai.get('status')}"
    # For invoices with files we expect the match keys present
    if ai.get("status") in ("green", "amber"):
        for key in ("vendor_match", "date_match", "amount_match"):
            assert key in ai, f"{key} missing in ai_diff"
        assert "confidence" in ai


def test_ai_audit_tournament(client):
    last = None
    for _ in range(2):
        r = client.post(f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/invoices/ai-audit",
                        timeout=180)
        last = r
        if r.status_code == 200:
            break
    assert last.status_code == 200, f"ai-audit failed: {last.status_code} {last.text[:400]}"
    body = last.json()
    assert "totals" in body and "flagged" in body
    totals = body["totals"]
    for key in ("count", "approved", "rejected", "needs_review", "eligible_reimbursement_inr"):
        assert key in totals, f"totals missing {key}: {totals}"
    assert totals["count"] == 9, f"expected count=9, got {totals}"
    assert isinstance(body["flagged"], list)
    # audited_at should be present
    assert "audited_at" in body


def test_ai_audit_scoped_by_body(client):
    r = client.post(f"{BASE_URL}/api/tournaments/{TOURNAMENT_ID}/invoices/ai-audit",
                    params={"body_id": "DIV-GWL"}, timeout=180)
    assert r.status_code == 200, f"scoped audit failed: {r.status_code} {r.text[:400]}"
    body = r.json()
    assert "totals" in body
    # DIV-GWL scoped count must be less than or equal to full 9
    assert body["totals"]["count"] <= 9
