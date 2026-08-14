"""
Iteration 92 backend tests: Unified Budget prepare-budgets-unified endpoint,
compute endpoint head_allocations emission, and scope guard.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nice-aryabhata-4.preview.emergentagent.com').rstrip('/')

MY_MEMORIAL_TID = "8cf98196-86b0-4030-a2b6-2564eb9da23c"
SM_KHAN_TID = "5a54bd10-3b17-49d8-8486-167c2b19db65"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----- Compute endpoint: head_allocations -----
class TestComputeHeadAllocations:
    def test_compute_emits_by_body_totals_with_head_allocations(self, client):
        r = client.post(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/unified-budget/compute", json={})
        assert r.status_code == 200, r.text
        data = r.json()
        budget = data.get("budget", data)
        by_body = budget.get("by_body_totals", [])
        assert len(by_body) == 4, f"Expected 4 body rows, got {len(by_body)}: {by_body}"

        codes = {row.get("body_code") or row.get("code"): row for row in by_body}
        for expected in ["DIV-BPL", "DIV-JBP", "DIV-GWL", "DIV-RWA"]:
            assert expected in codes, f"Missing body row {expected}. Got {list(codes.keys())}"

        # DIV-BPL host row
        bpl = codes["DIV-BPL"]
        heads = bpl.get("head_allocations", [])
        assert len(heads) == 17, f"DIV-BPL should have 17 head_allocations, got {len(heads)}"
        total = sum(float(h.get("limit_inr", h.get("amount", 0))) for h in heads)
        assert 1500000 <= total <= 1600000, f"DIV-BPL heads total ~15.23L expected, got {total}"

        # Visitor rows: single Travel Grant entry
        for vcode in ["DIV-GWL", "DIV-JBP", "DIV-RWA"]:
            row = codes[vcode]
            vheads = row.get("head_allocations", [])
            assert len(vheads) == 1, f"{vcode} should have 1 head_allocation (Travel Grant), got {len(vheads)}: {vheads}"
            name = (vheads[0].get("head") or vheads[0].get("head_name") or vheads[0].get("name") or "").lower()
            assert "travel" in name, f"{vcode} head should be Travel Grant, got {vheads[0]}"
            owner = (vheads[0].get("owner") or "").lower()
            assert owner == "visitor", f"{vcode} Travel Grant owner should be Visitor, got {owner}"


# ----- prepare-budgets-unified -----
class TestPrepareBudgetsUnified:
    def test_prepare_unified_on_sm_khan(self, client):
        r = client.post(f"{BASE_URL}/api/tournaments/{SM_KHAN_TID}/finance/prepare-budgets-unified", json={})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("engine") == "unified_budget", f"engine mismatch: {data}"
        src = data.get("source", "")
        assert src == "live" or src.startswith("locked-v"), f"source mismatch: {src}"
        # counts present
        assert "created" in data or "replaced" in data or "skipped" in data, data

    def test_prepare_unified_idempotent(self, client):
        # first call
        r1 = client.post(f"{BASE_URL}/api/tournaments/{SM_KHAN_TID}/finance/prepare-budgets-unified", json={})
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        budget_nos_1 = {row["budget_no"] for row in (d1.get("created", []) + d1.get("replaced", []))}
        # second call — should NOT double create
        r2 = client.post(f"{BASE_URL}/api/tournaments/{SM_KHAN_TID}/finance/prepare-budgets-unified", json={})
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        # On second call: existing Draft rows must be replaced (not additionally created)
        replaced_count = d2.get("replaced_count", len(d2.get("replaced", [])))
        assert replaced_count >= 1, f"Second call should REPLACE existing Draft rows, got {d2}"
        # budget_no stability = same slot reused (idempotent)
        budget_nos_2 = {row["budget_no"] for row in (d2.get("created", []) + d2.get("replaced", []))}
        assert budget_nos_1 == budget_nos_2, f"Budget numbers must be stable across calls: {budget_nos_1} vs {budget_nos_2}"


# ----- Scope guard -----
class TestScopeGuard:
    def test_scope_guard_rejects_non_unified_scope(self, client):
        # find a tournament with scope Inter_School or Inter_Club
        r = client.get(f"{BASE_URL}/api/tournaments?fiscal_cycle=2026-27")
        assert r.status_code == 200, r.text
        tournaments = r.json()
        if isinstance(tournaments, dict):
            tournaments = tournaments.get("tournaments", tournaments.get("items", []))
        target = None
        for t in tournaments:
            scope = (t.get("scope") or "").strip()
            if scope in ("Inter_School", "Inter_Club"):
                target = t
                break
        if not target:
            pytest.skip("No Inter_School or Inter_Club tournament seeded — N/A")
        tid = target.get("id") or target.get("_id")
        r2 = client.post(f"{BASE_URL}/api/tournaments/{tid}/finance/prepare-budgets-unified", json={})
        assert r2.status_code == 400, f"Expected 400 for scope guard, got {r2.status_code}: {r2.text}"
        body = r2.text.lower()
        assert "not covered by the unified budget" in body, f"Expected guard message, got: {r2.text}"
