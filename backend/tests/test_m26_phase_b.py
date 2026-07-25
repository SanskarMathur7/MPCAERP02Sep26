"""
Sprint M26 · Phase B — per-participant linkage into Budgets / Invoices / Claims / Receipts
+ drill-down finance endpoint.

Covers backend behaviors:
  1. POST /tournament-budgets auto-sets participant_body_code and links participant.budget_id
  2. POST /tournament-invoices auto-sets participant_body_code → matrix invoice totals reflect
  3. POST /reimbursement-claims auto-sets participant_body_code + participant.claim_id populated
  4. POST /tournaments/{tid}/receipts derives participant_body_code from linked_claim_id
  5. GET /tournaments/{tid}/participants/{code}/finance drill-down endpoint (404 on unknown)
  6. Phase A regression — _totals_for_participant uses correct claim collection name
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def phaseb_tournament(s):
    """Fresh Inter_Divisional tournament with 2 divisions across 1 pool."""
    payload = {
        "name": "TEST_M26_PhaseB",
        "format": "Multi_Day",
        "scope": "Inter_Divisional",
        "tournament_type": "MPCA_InterDivisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "start_date": "2026-09-01",
        "end_date": "2026-09-05",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"Cannot create tournament: {r.status_code} {r.text[:200]}")
    tid = r.json()["id"]
    # Seed pools: DIV-IND (Host) + DIV-BPL (Visitor)
    setup = {"division_pools": [
        {"id": "p1", "name": "Pool A",
         "division_codes": ["DIV-IND", "DIV-BPL"],
         "host_division_code": "DIV-IND"},
    ]}
    r2 = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup})
    assert r2.status_code == 200, r2.text
    # verify participants seeded
    parts = s.get(f"{API}/tournaments/{tid}/participants").json()
    assert {p["body_code"] for p in parts} == {"DIV-IND", "DIV-BPL"}
    yield tid
    # cleanup
    try:
        s.delete(f"{API}/tournaments/{tid}")
    except Exception:
        pass


# ─────────────── 1. Budget auto-link ───────────────

class TestBudgetAutoLink:
    def test_budget_create_auto_sets_participant_code(self, s, phaseb_tournament):
        tid = phaseb_tournament
        payload = {
            "tournament_id": tid,
            "body_id": "DIV-BPL",
            "fiscal_cycle": "2025-26",
            "total_ceiling_inr": 80000,
            "head_allocations": [
                {"head": "Ground Fees", "limit_inr": 30000},
                {"head": "Player DA / Food", "limit_inr": 50000},
            ],
            "notes": "TEST_phaseB budget",
        }
        r = s.post(f"{API}/tournament-budgets", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["participant_body_code"] == "DIV-BPL", "server should auto-set participant_body_code"
        assert data["body_id"] == "DIV-BPL"
        budget_id = data["id"]

        # participant row's budget_id should now be populated
        p = s.get(f"{API}/tournaments/{tid}/participants/DIV-BPL").json()
        assert p["budget_id"] == budget_id
        assert p["budget_total_inr"] == 80000.0
        # store for later tests
        pytest.phaseb_budget_id = budget_id

    def test_budget_no_participant_row_leaves_code_null(self, s, phaseb_tournament):
        """If body_id has no matching participant row, participant_body_code stays None."""
        tid = phaseb_tournament
        payload = {
            "tournament_id": tid,
            "body_id": "DIV-GWL",  # not in pools
            "fiscal_cycle": "2025-26",
            "total_ceiling_inr": 5000,
            "head_allocations": [{"head": "Contingency", "limit_inr": 5000}],
        }
        r = s.post(f"{API}/tournament-budgets", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("participant_body_code") in (None, "")


# ─────────────── 2. Invoice auto-link ───────────────

class TestInvoiceAutoLink:
    def test_invoice_create_auto_sets_participant_and_totals_flow(self, s, phaseb_tournament):
        tid = phaseb_tournament
        payload = {
            "tournament_id": tid,
            "body_id": "DIV-BPL",
            "vendor_name": "TEST_Volvo Buses",
            "invoice_no": "TEST-INV-001",
            "invoice_date": "2026-09-02",
            "amount_inr": 42000,
            "gst_inr": 7560,
            "total_inr": 49560,
            "budget_head_code": "PLAYER_TRAVEL",
        }
        r = s.post(f"{API}/tournament-invoices", json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["participant_body_code"] == "DIV-BPL"

        # Matrix totals reflect invoice
        p = s.get(f"{API}/tournaments/{tid}/participants/DIV-BPL").json()
        assert p["invoice_total_inr"] == 49560.0
        assert p["invoice_count"] == 1


# ─────────────── 3. Claim auto-link ───────────────

class TestClaimAutoLink:
    def test_claim_create_auto_sets_participant_and_populates_claim_id(self, s, phaseb_tournament):
        tid = phaseb_tournament
        payload = {
            "tournament_id": tid,
            "body_id": "DIV-BPL",
            "fiscal_cycle": "2025-26",
            "notes": "TEST_phaseB claim",
        }
        r = s.post(f"{API}/reimbursement-claims", json=payload)
        assert r.status_code == 200, r.text
        claim = r.json()
        assert claim["participant_body_code"] == "DIV-BPL"
        claim_id = claim["id"]

        # participant.claim_id populated
        p = s.get(f"{API}/tournaments/{tid}/participants/DIV-BPL").json()
        assert p["claim_id"] == claim_id
        # Phase A regression — claim_status derived (Draft) via correct collection name
        assert p["claim_status"] == "Draft"
        pytest.phaseb_claim_id = claim_id


# ─────────────── 4. Receipt auto-link via linked_claim_id ───────────────

class TestReceiptAutoLink:
    def test_receipt_derives_participant_from_claim(self, s, phaseb_tournament):
        tid = phaseb_tournament
        claim_id = getattr(pytest, "phaseb_claim_id", None)
        assert claim_id, "claim id from previous test required"
        payload = {
            "receipt_date": "2026-09-15",
            "amount_inr": 40000,
            "mode": "NEFT",
            "reference_no": "TEST-UTR-0001",
            "linked_claim_id": claim_id,
            "recorded_by_name": "TEST_treasurer",
        }
        r = s.post(f"{API}/tournaments/{tid}/receipts", json=payload)
        assert r.status_code == 200, r.text
        rct = r.json()
        assert rct["participant_body_code"] == "DIV-BPL"

        # Matrix totals reflect receipt
        p = s.get(f"{API}/tournaments/{tid}/participants/DIV-BPL").json()
        assert p["receipt_total_inr"] == 40000.0


# ─────────────── 5. Drill-down endpoint ───────────────

class TestFinanceDrilldown:
    def test_drilldown_returns_full_finance_trail(self, s, phaseb_tournament):
        tid = phaseb_tournament
        r = s.get(f"{API}/tournaments/{tid}/participants/DIV-BPL/finance")
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(data.keys()) >= {"participant", "budget", "invoices", "claim", "receipts"}
        assert data["participant"]["body_code"] == "DIV-BPL"
        assert data["budget"] is not None
        assert data["budget"]["participant_body_code"] == "DIV-BPL"
        assert isinstance(data["invoices"], list) and len(data["invoices"]) >= 1
        assert data["invoices"][0]["participant_body_code"] == "DIV-BPL"
        assert data["claim"] is not None
        assert data["claim"]["participant_body_code"] == "DIV-BPL"
        assert isinstance(data["receipts"], list) and len(data["receipts"]) >= 1
        assert data["receipts"][0]["participant_body_code"] == "DIV-BPL"
        # No mongodb _id leakage
        assert "_id" not in data["participant"]
        assert "_id" not in data["budget"]

    def test_drilldown_404_for_unknown_body_code(self, s, phaseb_tournament):
        tid = phaseb_tournament
        r = s.get(f"{API}/tournaments/{tid}/participants/DIV-NOPE/finance")
        assert r.status_code == 404


# ─────────────── 6. Regression — SEEDED tournament DIV-BPL still shows real claim ───────────────

class TestSeededRegression:
    """The dev-seed tournament e2a9ac5c has DIV-BPL with a real budget + invoice + claim wired.
    _totals_for_participant fix means claim_status must not be null when a claim exists."""
    SEEDED_TID = "e2a9ac5c-8e72-4d0a-9aa9-8dae40f482e5"

    def test_bpl_totals_show_claim_status(self, s):
        r = s.get(f"{API}/tournaments/{self.SEEDED_TID}/participants/DIV-BPL")
        if r.status_code == 404:
            pytest.skip("DIV-BPL not present in seeded tournament — skip")
        assert r.status_code == 200, r.text
        data = r.json()
        # There is a real claim TRC-2025-26-0007 in Draft status per dev seed
        # The Phase A bug (wrong collection name) would leave claim_status = None even when a claim exists
        assert data["claim_status"] is not None, (
            "Phase A bug regression: claim_status should be populated. "
            "Check _totals_for_participant uses db.tournament_reimbursement_claims"
        )
