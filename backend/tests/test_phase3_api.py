"""Phase 3 backend tests — Fees, Bank, Financial Powers, Member Profile."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend/.env at runtime
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# -------- Fees --------

def test_list_fees(s):
    r = s.get(f"{API}/fees")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # all should have invoice_no with format MPCA-FEE-YYYY-
    for inv in data:
        assert inv["invoice_no"].startswith("MPCA-FEE-")
        assert inv["status"] in ("Pending", "Paid", "Overdue", "Waived")


def test_overdue_auto_flag(s):
    """Past-due pending invoices should auto-show as Overdue."""
    r = s.get(f"{API}/fees")
    assert r.status_code == 200
    # seed sets due_date=2025-12-31 - in Jan 2026 this is overdue → Overdue
    overdue = [i for i in r.json() if i["status"] == "Overdue"]
    assert len(overdue) >= 1, "Expected at least one Overdue invoice (past due_date)"


def test_fees_filter_status(s):
    r = s.get(f"{API}/fees", params={"status": "Paid"})
    assert r.status_code == 200
    for inv in r.json():
        assert inv["status"] == "Paid"


def test_fees_filter_cycle(s):
    r = s.get(f"{API}/fees", params={"cycle": "2025-26"})
    assert r.status_code == 200
    for inv in r.json():
        assert inv["cycle"] == "2025-26"


def test_fees_filter_member_uid(s):
    r = s.get(f"{API}/fees", params={"member_uid": "MPCA-IND-0001"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    for inv in data:
        assert inv["member_uid"] == "MPCA-IND-0001"


def test_create_fee_invalid_member(s):
    r = s.post(f"{API}/fees", json={
        "member_uid": "MPCA-XXX-9999",
        "cycle": "2025-26",
        "amount": 1000,
        "due_date": "2026-06-30",
    })
    assert r.status_code == 404


def test_create_fee_invoice(s):
    r = s.post(f"{API}/fees", json={
        "member_uid": "MPCA-IND-0001",
        "cycle": "2099-00",
        "amount": 500.0,
        "due_date": "2099-12-31",
        "description": "TEST_extra invoice",
    })
    assert r.status_code == 200
    inv = r.json()
    assert inv["invoice_no"].startswith("MPCA-FEE-")
    assert inv["member_uid"] == "MPCA-IND-0001"
    assert inv["status"] == "Pending"


def test_generate_cycle_idempotent(s):
    r1 = s.post(f"{API}/fees/generate", params={"cycle": "2026-27"})
    assert r1.status_code == 200
    created1 = r1.json()["created"]
    # Re-run — should create 0 since invoices exist
    r2 = s.post(f"{API}/fees/generate", params={"cycle": "2026-27"})
    assert r2.status_code == 200
    assert r2.json()["created"] == 0
    # Validate that institutional members got 15000 and individuals 3000
    r3 = s.get(f"{API}/fees", params={"cycle": "2026-27"})
    invoices = r3.json()
    if invoices:
        for inv in invoices:
            if inv["member_uid"].startswith("MPCA-INS"):
                assert inv["amount"] == 15000.0
            elif inv["member_uid"].startswith("MPCA-IND"):
                assert inv["amount"] == 3000.0
    assert created1 >= 1


def test_pay_invoice_and_already_paid(s):
    # Find a pending/overdue invoice
    r = s.get(f"{API}/fees")
    pending = [i for i in r.json() if i["status"] in ("Pending", "Overdue")]
    assert pending, "Need at least one unpaid invoice"
    inv_id = pending[0]["id"]
    p = s.post(f"{API}/fees/{inv_id}/pay")
    assert p.status_code == 200
    body = p.json()
    assert body.get("ok") is True
    assert body["invoice"]["status"] == "Paid"
    assert body["invoice"]["payment_ref"].startswith("MOCK-PAY-") or body["invoice"]["payment_ref"]
    assert "receipt_no" in body

    # Pay again — should return already_paid
    p2 = s.post(f"{API}/fees/{inv_id}/pay")
    assert p2.status_code == 200
    assert p2.json().get("already_paid") is True


# -------- Bank --------

def test_list_bank_accounts(s):
    r = s.get(f"{API}/bank/accounts")
    assert r.status_code == 200
    accts = r.json()
    assert len(accts) >= 2
    names = [a["name"] for a in accts]
    assert any("General" in n for n in names)
    assert any("Tournament" in n for n in names)


def test_get_bank_account(s):
    accts = s.get(f"{API}/bank/accounts").json()
    a = accts[0]
    r = s.get(f"{API}/bank/accounts/{a['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == a["id"]


def test_create_bank_account(s):
    r = s.post(f"{API}/bank/accounts", json={
        "name": "TEST_AcctPhase3",
        "bank": "Test Bank",
        "account_no": "TST123",
        "account_type": "Current",
        "opening_balance": 1000.0,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["current_balance"] == 1000.0


def test_list_transactions_seeded(s):
    r = s.get(f"{API}/bank/transactions")
    assert r.status_code == 200
    txns = r.json()
    assert len(txns) >= 5


def test_transactions_filter_by_account(s):
    accts = s.get(f"{API}/bank/accounts").json()
    general = next(a for a in accts if "General" in a["name"])
    r = s.get(f"{API}/bank/transactions", params={"account_id": general["id"]})
    assert r.status_code == 200
    txns = r.json()
    assert len(txns) >= 5
    for t in txns:
        assert t["account_id"] == general["id"]


def test_add_transaction_updates_balance(s):
    accts = s.get(f"{API}/bank/accounts").json()
    general = next(a for a in accts if "General" in a["name"])
    before = general["current_balance"]

    # Credit 1000
    r = s.post(f"{API}/bank/transactions", json={
        "account_id": general["id"],
        "date": "2026-01-15",
        "txn_type": "Credit",
        "amount": 1000.0,
        "narration": "TEST_credit",
    })
    assert r.status_code == 200
    txn = r.json()
    assert txn["balance_after"] == round(before + 1000.0, 2)

    # Debit 500
    r2 = s.post(f"{API}/bank/transactions", json={
        "account_id": general["id"],
        "date": "2026-01-15",
        "txn_type": "Debit",
        "amount": 500.0,
        "narration": "TEST_debit",
    })
    assert r2.status_code == 200
    assert r2.json()["balance_after"] == round(before + 1000.0 - 500.0, 2)

    # Verify account balance is updated
    acct_now = s.get(f"{API}/bank/accounts/{general['id']}").json()
    assert acct_now["current_balance"] == round(before + 500.0, 2)


# -------- Financial Powers --------

def test_financial_powers(s):
    r = s.get(f"{API}/financial-powers")
    assert r.status_code == 200
    powers = r.json()["powers"]
    assert len(powers) == 6
    for p in powers:
        assert "post" in p
        assert "single_txn_limit" in p
        assert "approval_required" in p
        assert "scope" in p


# -------- Member Profile --------

def test_member_profile_ind_0001(s):
    r = s.get(f"{API}/member-profile/MPCA-IND-0001")
    assert r.status_code == 200
    body = r.json()
    assert body["member"]["uid"] == "MPCA-IND-0001"
    assert "invoices" in body
    assert "total_outstanding" in body
    # phone/email should not be exposed
    assert "phone" not in body["member"]
    assert "email" not in body["member"]
    # outstanding = sum of pending/overdue amounts
    expected = sum(i["amount"] + i.get("late_fee", 0)
                   for i in body["invoices"]
                   if i["status"] in ("Pending", "Overdue"))
    assert body["total_outstanding"] == expected


def test_member_profile_not_found(s):
    r = s.get(f"{API}/member-profile/MPCA-XXX-9999")
    assert r.status_code == 404


# -------- Dashboard --------

def test_dashboard_stats_phase3(s):
    r = s.get(f"{API}/dashboard/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ("fee_collection_pct", "total_invoices", "paid_invoices", "total_bank_balance"):
        assert k in d
    assert isinstance(d["fee_collection_pct"], (int, float))
    assert d["total_invoices"] >= 1
    assert d["total_bank_balance"] > 0
