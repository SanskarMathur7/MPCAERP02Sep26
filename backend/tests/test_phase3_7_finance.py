"""Phase III.7 Finance close-out tests.

Covers:
- Version bump to 3.7.0
- Budget Ledger (list, filter, single fetch, upsert)
- Sanction thresholds reference
- Anti-fragmentation rule and ?force=true override
- Disbursement auto bank-debit and 2-signatory enforcement
- Insufficient-balance guard via TEST bank account
- Regression sweep on Phase I–III.6 endpoints

Cleanup: All claims and bank txns created here use TEST_ fiscal cycles
or TEST-prefixed names so they can be wiped without touching demo data.
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]


@pytest.fixture(scope="session")
def session_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Module: Version / Sanction Thresholds ----------------

class TestVersionAndThresholds:
    def test_root_version_is_3_7_0(self, session_client):
        r = session_client.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert data["version"] == "3.7.0"
        assert data["status"] == "ok"

    def test_sanction_thresholds_shape(self, session_client):
        r = session_client.get(f"{API}/sanction-thresholds")
        assert r.status_code == 200
        data = r.json()
        assert data["two_signatory_threshold_inr"] == 50000
        assert isinstance(data["thresholds"], list)
        assert len(data["thresholds"]) == 6
        posts = [t["post"] for t in data["thresholds"]]
        for expected in [
            "District Secretary",
            "District Committee",
            "Division Secretary",
            "MPCA Hon. Treasurer",
            "MPCA Managing Committee",
            "MPCA AGM",
        ]:
            assert expected in posts


# ---------------- Module: Budget Ledger ----------------

class TestBudgetLedger:
    def test_list_budgets_default_cycle(self, session_client):
        r = session_client.get(f"{API}/budgets")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 60, f"expected ~66 body rows, got {len(rows)}"
        # required keys per row
        sample = rows[0]
        for k in [
            "body_id", "body_name", "body_type", "fiscal_cycle",
            "annual_budget_inr", "committed_inr", "disbursed_inr",
            "available_inr", "utilisation_pct", "claim_count",
        ]:
            assert k in sample
        assert sample["fiscal_cycle"] == "2025-26"

    def test_filter_single_body(self, session_client):
        r = session_client.get(f"{API}/budgets", params={
            "fiscal_cycle": "2025-26", "body_id": "DIST-JABA-JBP",
        })
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        assert rows[0]["body_id"] == "DIST-JABA-JBP"

    def test_single_body_endpoint(self, session_client):
        r = session_client.get(f"{API}/budgets/DIST-JABA-JBP")
        assert r.status_code == 200
        row = r.json()
        assert row["body_id"] == "DIST-JABA-JBP"
        # CLM-2025-26-003 = ₹4,25,000 Division_Recommended → committed
        assert row["committed_inr"] == 425000.0
        assert row["disbursed_inr"] == 0.0
        annual = row["annual_budget_inr"]
        if annual:
            expected_util = round((row["committed_inr"] + row["disbursed_inr"]) / annual * 100, 1)
            assert row["utilisation_pct"] == expected_util

    def test_seho_bpl_disbursed_reconciliation(self, session_client):
        r = session_client.get(f"{API}/budgets/DIST-SEHO-BPL")
        assert r.status_code == 200
        row = r.json()
        # CLM-2025-26-004 = ₹72,000 Disbursed
        assert row["disbursed_inr"] == 72000.0
        assert row["committed_inr"] == 0.0

    def test_single_body_404(self, session_client):
        r = session_client.get(f"{API}/budgets/NOPE-XXX")
        assert r.status_code == 404

    def test_upsert_budget_creates_then_updates(self, session_client):
        cycle = "TEST_BUDG_" + uuid.uuid4().hex[:6]
        body_id = "DIST-UJJA-UJN"
        try:
            r1 = session_client.post(f"{API}/budgets", json={
                "body_id": body_id, "fiscal_cycle": cycle,
                "annual_budget_inr": 100000.0, "note": "TEST initial",
            })
            assert r1.status_code == 200, r1.text
            doc1 = r1.json()
            assert doc1["annual_budget_inr"] == 100000.0
            id1 = doc1["id"]

            # Second POST same body+cycle should UPDATE not duplicate
            r2 = session_client.post(f"{API}/budgets", json={
                "body_id": body_id, "fiscal_cycle": cycle,
                "annual_budget_inr": 250000.0, "note": "TEST updated",
            })
            assert r2.status_code == 200, r2.text
            doc2 = r2.json()
            assert doc2["id"] == id1
            assert doc2["annual_budget_inr"] == 250000.0

            # Confirm only one row in DB
            count = _db.body_budgets.count_documents({"body_id": body_id, "fiscal_cycle": cycle})
            assert count == 1
        finally:
            _db.body_budgets.delete_many({"fiscal_cycle": cycle})

    def test_upsert_budget_validates_body_exists(self, session_client):
        r = session_client.post(f"{API}/budgets", json={
            "body_id": "DOES-NOT-EXIST", "fiscal_cycle": "TEST_X",
            "annual_budget_inr": 1.0,
        })
        assert r.status_code == 400


# ---------------- Module: Anti-fragmentation on /api/claims ----------------

class TestAntiFragmentation:
    def setup_method(self):
        self.cycle = "TEST_AF_" + uuid.uuid4().hex[:6]
        self.body_id = "DIST-UJJA-UJN"
        self.payload = {
            "body_id": self.body_id,
            "fiscal_cycle": self.cycle,
            "title": "TEST_AF kit",
            "purpose": "Testing anti-fragmentation",
            "amount_inr": 24000,
            "category": "Infrastructure",
        }

    def teardown_method(self):
        _db.claims.delete_many({"fiscal_cycle": self.cycle})

    def test_anti_fragmentation_blocks_second_then_force_allows(self, session_client):
        # First claim: 24,000 — under District Secretary's 25k → 200
        r1 = session_client.post(f"{API}/claims", json=self.payload)
        assert r1.status_code == 200, r1.text
        assert r1.json()["amount_inr"] == 24000

        # Second identical claim: cumulative 48,000 — crosses 25k DistSec ceiling → 400
        r2 = session_client.post(f"{API}/claims", json=self.payload)
        assert r2.status_code == 400, r2.text
        detail = r2.json().get("detail", "")
        assert "Anti-fragmentation" in detail
        assert "force=true" in detail

        # force=true override → 200
        r3 = session_client.post(f"{API}/claims?force=true", json=self.payload)
        assert r3.status_code == 200, r3.text
        assert r3.json()["amount_inr"] == 24000


# ---------------- Module: Disbursement (auto-debit + 2-sig + insufficient balance) ----------------

def _walk_to_sanctioned(session_client, body_id: str, amount: float, cycle: str):
    """Create→Submit→Recommend→Sanction. Use ?force=true to bypass anti-frag."""
    payload = {
        "body_id": body_id,
        "fiscal_cycle": cycle,
        "title": f"TEST disburse {amount}",
        "purpose": "Test disbursement workflow",
        "amount_inr": amount,
        "category": "Infrastructure",
    }
    r = session_client.post(f"{API}/claims?force=true", json=payload)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    action = {"actor_post": "TEST", "actor_name": "Tester", "actor_body_id": body_id}
    for step in ("submit", "recommend", "sanction"):
        actor = {**action}
        if step == "recommend":
            actor["actor_body_id"] = "DIV-UJJA"
        elif step == "sanction":
            actor["actor_body_id"] = "MPCA"
            actor["actor_post"] = "MPCA Hon. Treasurer"
        r = session_client.post(f"{API}/claims/{cid}/{step}", json=actor)
        assert r.status_code == 200, f"{step} failed: {r.text}"
    return cid


class TestDisbursement:
    def setup_method(self):
        self.cycles = []

    def teardown_method(self):
        for c in self.cycles:
            _db.claims.delete_many({"fiscal_cycle": c})

    def _fresh_cycle(self):
        c = "TEST_DISB_" + uuid.uuid4().hex[:6]
        self.cycles.append(c)
        return c

    def _mpca_general(self):
        return _db.bank_accounts.find_one(
            {"body_id": "MPCA", "name": {"$regex": "General", "$options": "i"}}, {"_id": 0},
        )

    def test_disburse_under_threshold_auto_debits_bank(self, session_client):
        cycle = self._fresh_cycle()
        amount = 40000.0
        cid = _walk_to_sanctioned(session_client, "DIST-UJJA-UJN", amount, cycle)

        acct_before = self._mpca_general()
        bal_before = acct_before["current_balance"]

        r = session_client.post(f"{API}/claims/{cid}/disburse", json={
            "actor_post": "MPCA Hon. Treasurer",
            "actor_name": "Tester",
            "actor_body_id": "MPCA",
        })
        assert r.status_code == 200, r.text
        claim = r.json()
        assert claim["status"] == "Disbursed"
        assert claim.get("disbursement_txn_id")
        assert claim.get("disbursement_account_id") == acct_before["id"]

        acct_after = self._mpca_general()
        assert round(acct_before["current_balance"] - acct_after["current_balance"], 2) == amount

        # Restore balance for downstream tests (the txn is a TEST debit)
        txn = _db.bank_txns.find_one({"id": claim["disbursement_txn_id"]}, {"_id": 0})
        assert txn is not None
        assert txn["txn_type"] == "Debit"
        assert txn["reference"].startswith("CLAIM/")
        assert txn["amount"] == amount

        # Cleanup the txn & restore balance
        _db.bank_txns.delete_one({"id": txn["id"]})
        _db.bank_accounts.update_one(
            {"id": acct_before["id"]},
            {"$set": {"current_balance": bal_before}},
        )

    def test_disburse_over_threshold_requires_two_signatories(self, session_client):
        cycle = self._fresh_cycle()
        amount = 60000.0  # > 50k threshold
        cid = _walk_to_sanctioned(session_client, "DIST-UJJA-UJN", amount, cycle)

        acct_before = self._mpca_general()
        bal_before = acct_before["current_balance"]

        # WITHOUT co-signatory → 400
        r_no = session_client.post(f"{API}/claims/{cid}/disburse", json={
            "actor_post": "MPCA Hon. Treasurer",
            "actor_name": "Tester",
            "actor_body_id": "MPCA",
        })
        assert r_no.status_code == 400
        assert "two signatories" in r_no.json()["detail"]

        # WITH co-signatory → 200
        r_ok = session_client.post(f"{API}/claims/{cid}/disburse", json={
            "actor_post": "MPCA Hon. Treasurer",
            "actor_name": "Treasurer",
            "actor_body_id": "MPCA",
            "co_signatory_post": "MPCA Hon. Secretary",
            "co_signatory_name": "Secretary",
            "notes": "TEST cosign",
        })
        assert r_ok.status_code == 200, r_ok.text
        claim = r_ok.json()
        assert claim["status"] == "Disbursed"
        # Ensure co-sig note appended in chain
        last = claim["approval_chain"][-1]
        assert last["stage"] == "Disbursed"
        assert "Co-signed by" in (last.get("notes") or "")

        # Cleanup the txn & restore balance
        _db.bank_txns.delete_one({"id": claim["disbursement_txn_id"]})
        _db.bank_accounts.update_one(
            {"id": acct_before["id"]},
            {"$set": {"current_balance": bal_before}},
        )

    def test_insufficient_balance_against_separate_test_account(self, session_client):
        # Create a TEST bank account with only 1000 balance
        acct_r = session_client.post(f"{API}/bank/accounts", json={
            "body_id": "MPCA",
            "name": "TEST_Low_Balance_" + uuid.uuid4().hex[:6],
            "bank": "TEST Bank",
            "account_no": "TEST" + uuid.uuid4().hex[:8],
            "opening_balance": 1000.0,
            "current_balance": 1000.0,
        })
        assert acct_r.status_code == 200, acct_r.text
        acct_id = acct_r.json()["id"]

        try:
            cycle = self._fresh_cycle()
            amount = 40000.0  # > 1000 balance but < 50k threshold
            cid = _walk_to_sanctioned(session_client, "DIST-UJJA-UJN", amount, cycle)

            r = session_client.post(f"{API}/claims/{cid}/disburse", json={
                "actor_post": "MPCA Hon. Treasurer",
                "actor_name": "Tester",
                "actor_body_id": "MPCA",
                "source_account_id": acct_id,
            })
            assert r.status_code == 400
            assert "Insufficient balance" in r.json()["detail"]
        finally:
            _db.bank_accounts.delete_one({"id": acct_id})


# ---------------- Module: Regression sweep (Phase I-III.6) ----------------

class TestRegression:
    @pytest.mark.parametrize("path", [
        "/",
        "/bodies",
        "/bodies/tree",
        "/members",
        "/disclosures",
        "/meetings",
        "/elections",
        "/fees",
        "/bank/accounts",
        "/bank/transactions",
        "/financial-powers",
        "/dashboard/stats",
        "/claims",
        "/claims-stats/summary",
    ])
    def test_endpoint_returns_200(self, session_client, path):
        r = session_client.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_seeded_claims_intact(self, session_client):
        r = session_client.get(f"{API}/claims", params={"fiscal_cycle": "2025-26"})
        assert r.status_code == 200
        claim_nos = {c["claim_no"] for c in r.json()}
        for n in [
            "CLM-2025-26-001",
            "CLM-2025-26-002",
            "CLM-2025-26-003",
            "CLM-2025-26-004",
        ]:
            assert n in claim_nos
