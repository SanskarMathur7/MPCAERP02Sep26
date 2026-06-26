"""Phase B · Claims Enhanced Paths + Summary Form + new categories + SLA TAT.
Tests against the public REACT_APP_BACKEND_URL.
"""
import os
import time
import requests
from datetime import datetime

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
CYCLE = "2025-26"
TEST_BODY = "DIV-IND"
APPROVED_TB_NO = "TB-2025-26-001"


def _find_tb(budget_no):
    r = requests.get(f"{API}/tournament-budgets")
    assert r.status_code == 200, r.text
    for b in r.json():
        if b.get("budget_no") == budget_no:
            return b
    return None


def _post_claim(payload, expect=200, force=True):
    url = f"{API}/claims" + ("?force=true" if force else "")
    r = requests.post(url, json=payload)
    assert r.status_code == expect, f"expected {expect} got {r.status_code} · {r.text[:300]}"
    return r


# -------- Regression: pre-existing endpoints --------
def test_regression_endpoints_alive():
    paths = [
        "/claims", "/tournament-budgets", "/vendor-bills", "/procurement",
        "/bodies", "/dashboard/fairplay-rankings", "/notifications",
    ]
    for p in paths:
        r = requests.get(f"{API}{p}")
        assert r.status_code == 200, f"{p} → {r.status_code} :: {r.text[:200]}"


# -------- New grant categories --------
def test_new_categories_accepted():
    cats = ["Admin_Grant", "Coaching_Grant", "Tournament_Funding", "District_Travel", "MRA_Management"]
    for cat in cats:
        payload = {
            "body_id": TEST_BODY, "title": f"TEST_{cat}_phaseB",
            "category": cat, "amount_inr": 12345, "fiscal_cycle": CYCLE,
            "claim_path": "Bulk_Budget",
        }
        r = _post_claim(payload)
        body = r.json()
        assert body["category"] == cat
        assert body["claim_path"] == "Bulk_Budget"


# -------- As_per_Budget validation --------
def test_as_per_budget_missing_tb_id_returns_422():
    payload = {"body_id": TEST_BODY, "title": "TEST_missing_tb",
               "category": "Tournament_Expense", "amount_inr": 50000,
               "fiscal_cycle": CYCLE, "claim_path": "As_per_Budget"}
    r = _post_claim(payload, expect=422)
    assert "tournament_budget_id" in r.text


def test_as_per_budget_non_approved_returns_409():
    submitted = _find_tb("TB-2025-26-002")  # Submitted
    assert submitted is not None
    payload = {"body_id": submitted["body_id"], "title": "TEST_non_approved",
               "category": "Tournament_Expense", "amount_inr": 50000,
               "fiscal_cycle": CYCLE, "claim_path": "As_per_Budget",
               "tournament_budget_id": submitted["id"]}
    r = _post_claim(payload, expect=409)
    assert "Submitted" in r.text or "Approved" in r.text


def test_as_per_budget_wrong_body_returns_409():
    approved = _find_tb(APPROVED_TB_NO)
    assert approved is not None
    payload = {"body_id": "DIV-BPL", "title": "TEST_wrong_body",
               "category": "Tournament_Expense", "amount_inr": 50000,
               "fiscal_cycle": CYCLE, "claim_path": "As_per_Budget",
               "tournament_budget_id": approved["id"]}
    r = _post_claim(payload, expect=409)
    assert "DIV-IND" in r.text or "cannot raise" in r.text.lower()


def test_as_per_budget_within_limits_no_excess():
    approved = _find_tb(APPROVED_TB_NO)
    assert approved is not None
    heads = approved.get("approved_head_allocations") or []
    assert heads, "Approved budget must have approved_head_allocations"
    h0 = heads[0]
    small = max(1.0, float(h0["limit_inr"]) * 0.1)
    payload = {
        "body_id": approved["body_id"], "title": "TEST_within_limits",
        "category": "Tournament_Expense", "amount_inr": small, "fiscal_cycle": CYCLE,
        "claim_path": "As_per_Budget", "tournament_budget_id": approved["id"],
        "sub_bills": [{"head": h0["head"], "description": "Test small", "amount_inr": small}],
    }
    r = _post_claim(payload)
    body = r.json()
    assert body["is_excess"] is False
    assert body["excess_heads"] == []
    assert len(body["sub_bills"]) == 1


def test_as_per_budget_excess_flagged():
    approved = _find_tb(APPROVED_TB_NO)
    heads = approved.get("approved_head_allocations") or []
    h0 = heads[0]
    over = float(h0["limit_inr"]) + 50000
    payload = {
        "body_id": approved["body_id"], "title": "TEST_excess_phaseB",
        "category": "Tournament_Expense", "amount_inr": over, "fiscal_cycle": CYCLE,
        "claim_path": "As_per_Budget", "tournament_budget_id": approved["id"],
        "sub_bills": [{"head": h0["head"], "description": "Over the limit", "amount_inr": over}],
    }
    r = _post_claim(payload)
    body = r.json()
    assert body["is_excess"] is True
    assert len(body["excess_heads"]) >= 1
    e0 = body["excess_heads"][0]
    assert e0["head"] == h0["head"]
    assert e0["claimed_inr"] == over
    assert e0["limit_inr"] == h0["limit_inr"]
    assert abs(e0["excess_inr"] - (over - h0["limit_inr"])) < 0.5


# -------- Bulk path without TB/sub_bills --------
def test_bulk_path_no_tb_works():
    payload = {"body_id": TEST_BODY, "title": "TEST_bulk_no_tb",
               "category": "Annual_Grant", "amount_inr": 9999, "fiscal_cycle": CYCLE,
               "claim_path": "Bulk_Budget"}
    r = _post_claim(payload)
    body = r.json()
    assert body["claim_path"] == "Bulk_Budget"
    assert body.get("tournament_budget_id") in (None, "")
    assert body["sub_bills"] == []
    assert body["is_excess"] is False


# -------- GET /claims surfaces new fields + no _id leak --------
def test_get_claims_has_new_fields_no_idleak():
    r = requests.get(f"{API}/claims")
    assert r.status_code == 200
    claims = r.json()
    assert len(claims) > 0
    for c in claims[:5]:
        assert "_id" not in c
        for k in ("claim_path", "tournament_budget_id", "tournament_id",
                  "sub_bills", "is_excess", "excess_heads"):
            assert k in c, f"Missing key {k}"


# -------- SLA TAT = 48h on non-terminal claims --------
def test_sla_48h_on_non_terminal():
    r = requests.get(f"{API}/claims")
    claims = r.json()
    non_terminal_statuses = {"Draft", "Submitted", "Division_Recommended", "MPCA_Sanctioned", "Returned"}
    checked = 0
    for c in claims:
        if c["status"] not in non_terminal_statuses:
            continue
        if not c.get("due_at"):
            continue
        chain = c.get("approval_chain") or []
        anchor = chain[-1]["timestamp"] if chain else c["created_at"]
        a = datetime.fromisoformat(anchor.replace("Z", "+00:00"))
        d = datetime.fromisoformat(c["due_at"].replace("Z", "+00:00"))
        delta_h = (d - a).total_seconds() / 3600.0
        assert abs(delta_h - 48.0) < 0.1, f"{c['claim_no']} delta={delta_h}h not 48h"
        checked += 1
        if checked >= 8:
            break
    assert checked > 0, "No non-terminal claims to verify"


# -------- Anti-fragmentation --------
def test_anti_fragmentation_blocks_when_cumulative_crosses_threshold():
    body = "DIST-UJJA-UJN"
    unique_cycle = f"TEST-FRAG-{int(time.time())}"
    # Two claims of 600k each — each individually under MPCA Treasurer limit (1M), but cumulative 1.2M crosses it.
    p1 = {"body_id": body, "title": "TEST_frag_1",
          "category": "Annual_Grant", "amount_inr": 600000, "fiscal_cycle": unique_cycle,
          "claim_path": "Bulk_Budget"}
    r1 = requests.post(f"{API}/claims", json=p1)  # no force
    assert r1.status_code == 200, r1.text
    p2 = dict(p1, title="TEST_frag_2")
    r2 = requests.post(f"{API}/claims", json=p2)
    assert r2.status_code == 400, f"expected 400 anti-frag, got {r2.status_code}"
    assert "Anti-fragmentation" in r2.text


# -------- Legacy workflow (Bulk) still works end-to-end --------
def test_bulk_workflow_submit_recommend_sanction():
    # Create a Draft
    payload = {"body_id": "DIST-UJJA-UJN", "title": "TEST_wf_bulk",
               "category": "Annual_Grant", "amount_inr": 15000, "fiscal_cycle": CYCLE,
               "claim_path": "Bulk_Budget"}
    r = _post_claim(payload)
    cid = r.json()["id"]
    a = {"actor_post": "District Secretary", "actor_name": "Tester", "actor_body_id": "DIST-UJJA-UJN"}
    s = requests.post(f"{API}/claims/{cid}/submit", json=a)
    assert s.status_code == 200, s.text
    a2 = {"actor_post": "Division Secretary", "actor_name": "Tester", "actor_body_id": "DIV-IND"}
    rec = requests.post(f"{API}/claims/{cid}/recommend", json=a2)
    assert rec.status_code == 200, rec.text
    a3 = {"actor_post": "MPCA Hon. Treasurer", "actor_name": "Tester", "actor_body_id": "MPCA"}
    sn = requests.post(f"{API}/claims/{cid}/sanction", json=a3)
    assert sn.status_code == 200, sn.text
    assert sn.json()["status"] == "MPCA_Sanctioned"


# -------- claims-stats summary still valid (regression) --------
def test_claims_stats_summary_shape():
    r = requests.get(f"{API}/claims-stats/summary")
    assert r.status_code == 200
    body = r.json()
    for k in ("total_claims", "pending_claims", "disbursed_claims",
              "rejected_claims", "amount_disbursed_inr", "amount_in_flight_inr"):
        assert k in body, f"Missing key {k}"
