"""Iter 123w · backend tests for invoice pre-GST validator + bulk-submit / bulk-approve for
tournament invoices and extra-expense-requests.

Focus (per Iter 123w review request):
  1. POST /api/tournament-invoices with allocations sum == amount_inr (pre-GST) succeeds.
  2. POST /api/tournament-invoices with allocations sum == total_inr (post-GST != amount_inr)
     is rejected with 422 mentioning pre-GST.
  3. POST /api/tournament-invoices/bulk-submit flips Draft/Rejected -> Submitted.
  4. POST /api/tournament-invoices/bulk-approve flips Submitted -> Approved.
  5. POST /api/extra-expense-requests/bulk-approve works for a body with >=1 Submitted extra.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # local fallback
    BASE_URL = "http://localhost:8001"

SYS_EMAIL = "sysadmin@mpca.in"
SYS_PASS = "mpca@2026"
TOURN_ID = "99a96938-06cc-4c2a-8ab0-9413f62dc7ed"  # Madhavrao Scindia Trophy
BODY_ID = "DIV-GWL"  # Gwalior division


# ─────────────────────── fixtures ───────────────────────
@pytest.fixture(scope="session")
def sys_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SYS_EMAIL, "password": SYS_PASS},
        timeout=15,
    )
    assert r.status_code == 200, f"sysadmin login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture
def api(sys_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {sys_token}",
    })
    return s


# ─────────────────────── helpers ───────────────────────
def _ensure_budget(api):
    """Confirm there's an approved-ish budget for (TOURN_ID, BODY_ID) so create_invoice
    can resolve budget_id. Returns the budget doc or None (test will be skipped)."""
    r = api.get(f"{BASE_URL}/api/tournament-budgets", params={
        "tournament_id": TOURN_ID, "body_id": BODY_ID,
    })
    if r.status_code != 200:
        return None
    docs = r.json() or []
    good = [d for d in docs if d.get("status") in (
        "Approved", "MPCA_Sanctioned", "Division_Sanctioned",
        "Submitted_To_MPCA", "Reimbursed",
    )]
    return good[0] if good else None


def _pick_head_code(budget_doc):
    """Return a (head_code, head_label, cap) from the approved budget so the allocation
    is guaranteed to reference a real head. Falls back to a rate-card head."""
    heads = (budget_doc or {}).get("approved_head_allocations") \
        or (budget_doc or {}).get("head_allocations") or []
    if heads:
        h = heads[0]
        return (
            h.get("head_code") or h.get("head") or "PLAYER_DA_FOOD",
            h.get("head") or h.get("head_code") or "Player DA / Food",
            float(h.get("amount_inr") or h.get("amount") or 100000),
        )
    return ("PLAYER_DA_FOOD", "Player DA / Food", 100000.0)


# ─────────────────────── invoice · pre-GST validator ───────────────────────
class TestInvoicePreGSTValidator:

    def test_create_invoice_pregst_allocation_matches_amount(self, api):
        budget = _ensure_budget(api)
        if not budget:
            pytest.skip("No approved budget for Gwalior on this tournament")
        code, label, _cap = _pick_head_code(budget)
        pre_gst = 5000.0
        gst = 900.0
        payload = {
            "tournament_id": TOURN_ID,
            "body_id": BODY_ID,
            "vendor_name": "TEST_VENDOR_123w_ok",
            "invoice_no": f"TEST-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2026-01-15",
            "amount_inr": pre_gst,          # pre-GST
            "gst_inr": gst,
            "total_inr": pre_gst + gst,     # post-GST
            "allocations": [{
                "head_code": code, "head_label": label,
                "amount_inr": pre_gst,      # matches pre-GST
            }],
            "notes": "TEST_iter123w pre-gst pass",
        }
        r = api.post(f"{BASE_URL}/api/tournament-invoices", json=payload)
        assert r.status_code in (200, 201), f"expected 200/201, got {r.status_code} · {r.text[:300]}"
        inv = r.json()
        assert inv["amount_inr"] == pre_gst
        assert inv["status"] == "Draft"
        assert inv["allocations"][0]["head_code"] == code
        assert inv["allocations"][0]["amount_inr"] == pre_gst
        # persist verification
        g = api.get(f"{BASE_URL}/api/tournament-invoices/{inv['id']}")
        assert g.status_code == 200
        assert g.json()["invoice_ref"] == inv["invoice_ref"]

    def test_create_invoice_postgst_allocation_rejected_422(self, api):
        budget = _ensure_budget(api)
        if not budget:
            pytest.skip("No approved budget for Gwalior on this tournament")
        code, label, _cap = _pick_head_code(budget)
        pre_gst = 5000.0
        gst = 900.0
        total_gst = pre_gst + gst  # 5900
        payload = {
            "tournament_id": TOURN_ID,
            "body_id": BODY_ID,
            "vendor_name": "TEST_VENDOR_123w_bad",
            "invoice_no": f"TEST-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2026-01-15",
            "amount_inr": pre_gst,
            "gst_inr": gst,
            "total_inr": total_gst,
            "allocations": [{
                "head_code": code, "head_label": label,
                "amount_inr": total_gst,   # BAD · = total (post-GST) != pre-GST
            }],
            "notes": "TEST_iter123w post-gst reject",
        }
        r = api.post(f"{BASE_URL}/api/tournament-invoices", json=payload)
        assert r.status_code == 422, f"expected 422, got {r.status_code} · {r.text[:300]}"
        msg = r.text.lower()
        assert "pre-gst" in msg or "pre gst" in msg, f"error should mention pre-GST · got: {r.text[:300]}"


# ─────────────────────── invoice · bulk-submit / bulk-approve ───────────────────────
class TestInvoiceBulkFlow:

    def test_bulk_submit_then_bulk_approve(self, api):
        budget = _ensure_budget(api)
        if not budget:
            pytest.skip("No approved budget for Gwalior on this tournament")
        code, label, _cap = _pick_head_code(budget)
        # Create two Draft invoices for the same (tournament, body).
        created_ids = []
        for i in range(2):
            amt = 1500.0 + i
            p = {
                "tournament_id": TOURN_ID,
                "body_id": BODY_ID,
                "vendor_name": f"TEST_BULK_{i}_{uuid.uuid4().hex[:4]}",
                "invoice_no": f"TB-{uuid.uuid4().hex[:6]}",
                "invoice_date": "2026-01-16",
                "amount_inr": amt,
                "gst_inr": 0.0,
                "total_inr": amt,
                "allocations": [{"head_code": code, "head_label": label, "amount_inr": amt}],
                "notes": "TEST_iter123w bulk",
            }
            r = api.post(f"{BASE_URL}/api/tournament-invoices", json=p)
            assert r.status_code in (200, 201), r.text[:300]
            created_ids.append(r.json()["id"])

        # bulk-submit by ids (deterministic — don't sweep every invoice in the tournament).
        r = api.post(f"{BASE_URL}/api/tournament-invoices/bulk-submit",
                     json={"ids": created_ids})
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("submitted_count") >= 2
        assert set(created_ids).issubset(set(body.get("ids", [])))

        # verify via GET each invoice is now Submitted
        for iid in created_ids:
            g = api.get(f"{BASE_URL}/api/tournament-invoices/{iid}")
            assert g.status_code == 200
            assert g.json()["status"] == "Submitted", f"{iid} not Submitted: {g.json().get('status')}"

        # bulk-approve
        r = api.post(f"{BASE_URL}/api/tournament-invoices/bulk-approve",
                     json={"ids": created_ids})
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("approved_count") >= 2
        for iid in created_ids:
            g = api.get(f"{BASE_URL}/api/tournament-invoices/{iid}")
            assert g.status_code == 200
            assert g.json()["status"] == "Approved", f"{iid} not Approved: {g.json().get('status')}"


# ─────────────────────── extras · bulk-approve ───────────────────────
class TestExtrasBulkApprove:

    def test_extras_bulk_approve_flow(self, api):
        # Look for existing extras on this (tournament, body). If none Submitted,
        # try to submit any Draft/Info_Requested via bulk-submit before approving.
        r = api.get(f"{BASE_URL}/api/extra-expense-requests",
                    params={"tournament_id": TOURN_ID, "body_id": BODY_ID})
        if r.status_code != 200:
            pytest.skip(f"extra-expense-requests list not available: {r.status_code}")
        rows = r.json() or []
        if not rows:
            pytest.skip("No extra-expense requests exist for Gwalior · nothing to bulk-approve")

        # If nothing is Submitted, bulk-submit whatever is Draft first.
        submitted = [x for x in rows if x.get("status") == "Submitted"]
        if not submitted:
            r2 = api.post(
                f"{BASE_URL}/api/extra-expense-requests/bulk-submit",
                json={"tournament_id": TOURN_ID, "body_id": BODY_ID,
                      "actor_name": "TEST_iter123w", "actor_post": "Division Secretary",
                      "actor_body_id": BODY_ID, "notes": "TEST_iter123w bulk submit"},
            )
            # Not strictly required to succeed (may already be Approved/Info_Requested)
            if r2.status_code == 200 and r2.json().get("submitted_count", 0) == 0:
                pytest.skip("No Submitted or submittable extras · nothing to approve")

        # Now bulk-approve.
        r = api.post(
            f"{BASE_URL}/api/extra-expense-requests/bulk-approve",
            json={"tournament_id": TOURN_ID, "body_id": BODY_ID,
                  "actor_name": "TEST_iter123w", "actor_post": "MPCA Secretary",
                  "actor_body_id": "MPCA", "notes": "TEST_iter123w bulk approve"},
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert "approved_count" in body
        # If there was anything to approve, verify at least one moved to Approved
        if body.get("approved_count", 0) > 0:
            for xid in body.get("ids", [])[:3]:
                g = api.get(f"{BASE_URL}/api/extra-expense-requests/{xid}")
                if g.status_code == 200:
                    assert g.json().get("status") == "Approved", g.json().get("status")
