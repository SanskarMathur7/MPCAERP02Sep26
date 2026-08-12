"""Sprint T-RIM · Multi-head Tournament Invoice allocations · backend tests.

Covers:
- Create with allocations summing to total → 200
- Create with mismatched sum → 422
- Per-head eligibility compute (over-budget on one head only)
- Legacy single-head path still works when `allocations` is empty
- Budget tracker sums allocations + legacy without double counting
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

# Seeded fixtures (see iteration_86 context) — Madhavrao Scindia Trophy · DIV-IND · Approved budget
TOURNAMENT_ID = "1c8e8e70-9338-4387-93a4-8f229462f2fa"
BODY_ID = "DIV-IND"
BUDGET_ID = "12c0398b-1815-4c77-af92-7ded83942c62"


@pytest.fixture(scope="module")
def budget_heads():
    r = requests.get(f"{BASE_URL}/api/tournament-budgets/{BUDGET_ID}", timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    heads = b.get("approved_head_allocations") or b.get("head_allocations") or []
    assert len(heads) >= 3, "Need >=3 heads for split tests"
    return heads


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


created_invoice_ids = []


def _cleanup(iid):
    try:
        requests.delete(f"{BASE_URL}/api/tournament-invoices/{iid}", timeout=10)
    except Exception:
        pass


# ─────────────── Multi-head create · sum matches ───────────────
def test_create_multi_head_invoice_sum_matches(api, budget_heads):
    h1, h2 = budget_heads[0], budget_heads[1]
    payload = {
        "tournament_id": TOURNAMENT_ID,
        "body_id": BODY_ID,
        "budget_id": BUDGET_ID,
        "vendor_name": f"TEST_TRIM_Vendor_{uuid.uuid4().hex[:6]}",
        "invoice_no": f"TEST-TRIM-{uuid.uuid4().hex[:6]}",
        "invoice_date": "2026-01-15",
        "amount_inr": 8000.0,
        "gst_inr": 0.0,
        "total_inr": 8000.0,
        "allocations": [
            {"head_code": "OTHER", "head_label": h1.get("head"), "amount_inr": 5000.0},
            {"head_code": "OTHER", "head_label": h2.get("head"), "amount_inr": 3000.0},
        ],
    }
    r = api.post(f"{BASE_URL}/api/tournament-invoices", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    inv = r.json()
    created_invoice_ids.append(inv["id"])
    assert len(inv["allocations"]) == 2
    assert inv["allocations"][0]["head_label"] == h1.get("head")
    assert abs(sum(a["amount_inr"] for a in inv["allocations"]) - 8000.0) < 0.01

    # GET back to verify persistence
    g = api.get(f"{BASE_URL}/api/tournament-invoices/{inv['id']}", timeout=10)
    assert g.status_code == 200
    assert len(g.json()["allocations"]) == 2


# ─────────────── Sum mismatch → 422 ───────────────
def test_create_mismatched_sum_returns_422(api, budget_heads):
    h1 = budget_heads[0]
    payload = {
        "tournament_id": TOURNAMENT_ID,
        "body_id": BODY_ID,
        "budget_id": BUDGET_ID,
        "vendor_name": "TEST_TRIM_Mismatch",
        "invoice_no": f"TEST-MM-{uuid.uuid4().hex[:6]}",
        "invoice_date": "2026-01-15",
        "amount_inr": 10000.0,
        "gst_inr": 0.0,
        "total_inr": 10000.0,
        "allocations": [
            {"head_code": "OTHER", "head_label": h1.get("head"), "amount_inr": 5000.0},
        ],
    }
    r = api.post(f"{BASE_URL}/api/tournament-invoices", json=payload, timeout=20)
    assert r.status_code == 422, r.text
    detail = r.json().get("detail", "")
    assert "allocation" in detail.lower() or "total" in detail.lower()


# ─────────────── Per-head eligibility (one head over-budget) ───────────────
def test_multi_head_eligibility_per_head(api, budget_heads):
    """Pick a small head (limit 5000) and over-spend it while another is within limit."""
    # Find a head with limit_inr = 5000 (Man of the Match multi-day)
    small = next((h for h in budget_heads if float(h.get("limit_inr") or 0) == 5000.0), None)
    big = next((h for h in budget_heads if float(h.get("limit_inr") or 0) >= 100000.0), None)
    assert small and big, "Need one small (₹5000) and one big head"

    payload = {
        "tournament_id": TOURNAMENT_ID,
        "body_id": BODY_ID,
        "budget_id": BUDGET_ID,
        "vendor_name": "TEST_TRIM_OverBudget",
        "invoice_no": f"TEST-OB-{uuid.uuid4().hex[:6]}",
        "invoice_date": "2026-01-15",
        "amount_inr": 15000.0,
        "gst_inr": 0.0,
        "total_inr": 15000.0,
        "allocations": [
            # small head: 7000 vs 5000 limit → 2000 over
            {"head_code": "OTHER", "head_label": small.get("head"), "amount_inr": 7000.0},
            # big head: 8000 vs 100000+ limit → fully eligible
            {"head_code": "OTHER", "head_label": big.get("head"), "amount_inr": 8000.0},
        ],
    }
    r = api.post(f"{BASE_URL}/api/tournament-invoices", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    inv = r.json()
    created_invoice_ids.append(inv["id"])
    # 2000 ineligible expected from small head only
    assert abs(inv["ineligible_for_grant_inr"] - 2000.0) < 1.0, inv
    assert abs(inv["over_budget_amount_inr"] - 2000.0) < 1.0, inv
    assert abs(inv["eligible_for_grant_inr"] - 13000.0) < 1.0, inv


# ─────────────── Legacy single-head path still works ───────────────
def test_legacy_single_head_still_works(api, budget_heads):
    payload = {
        "tournament_id": TOURNAMENT_ID,
        "body_id": BODY_ID,
        "budget_id": BUDGET_ID,
        "budget_head_code": "GROUND_FEES",
        "vendor_name": "TEST_TRIM_Legacy",
        "invoice_no": f"TEST-LG-{uuid.uuid4().hex[:6]}",
        "invoice_date": "2026-01-15",
        "amount_inr": 2000.0,
        "gst_inr": 0.0,
        "total_inr": 2000.0,
        "allocations": [],
    }
    r = api.post(f"{BASE_URL}/api/tournament-invoices", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    inv = r.json()
    created_invoice_ids.append(inv["id"])
    assert inv["budget_head_code"] == "GROUND_FEES"
    assert inv["allocations"] == []


# ─────────────── Tracker sums no double-count ───────────────
def test_tracker_sums_allocations_and_legacy_no_double_count(api, budget_heads):
    r = api.get(f"{BASE_URL}/api/tournament-budgets/{BUDGET_ID}/tracker", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "heads" in data and "totals" in data
    # Grand spent must not exceed sum of individual head spents (basic sanity)
    per_head = sum(h["spent_inr"] for h in data["heads"])
    grand = data["totals"]["spent_inr"]
    assert abs(per_head - grand) < 1.0, (per_head, grand)


# ─────────────── Cleanup (module scope) ───────────────
def test_zzz_cleanup():
    for iid in created_invoice_ids:
        _cleanup(iid)
