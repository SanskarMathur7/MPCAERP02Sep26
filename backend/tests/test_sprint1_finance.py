"""Sprint 1 (Finance Rails) backend regression tests.

Covers:
- P3.1 Division Grants: CRUD, workflow, guards, stats.
- P3.5 Vouchers: auto-created from disbursement, listing.
- P3.6 Ledger: running balance for MPCA / 2026-27.
- P3.7 Export utility: xlsx + pdf MIME + payload.
- P3.9 Budget-vs-Actual reconciliation.
- Recent Activity feed via /api/shared/audit-log.
- Regression on previously working endpoints.
"""
import io
import os
import time
import uuid
import pytest
import requests

def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env") as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"')
                        break
        except FileNotFoundError:
            pass
    return url.rstrip("/")


BASE = _load_backend_url()
assert BASE, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Sanity ----------------

def test_root_ok(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------------- Regression: previously working endpoints ----------------

REGRESSION_ENDPOINTS = [
    "/claims", "/vendors", "/bodies", "/tournaments", "/players",
    "/vendor-bills", "/tournament-budgets", "/procurement",
    "/shared/audit-log", "/tournament-invoices", "/fixtures",
    "/extra-expense-requests",
]


@pytest.mark.parametrize("path", REGRESSION_ENDPOINTS)
def test_regression_endpoints(session, path):
    r = session.get(f"{API}{path}")
    assert r.status_code == 200, f"{path} => {r.status_code} :: {r.text[:180]}"


# ---------------- P3.1 Division Grants ----------------

def test_seeded_grants(session):
    r = session.get(f"{API}/division-grants")
    assert r.status_code == 200
    docs = r.json()
    assert isinstance(docs, list)
    assert len(docs) >= 4, f"Expected >= 4 seeded grants, got {len(docs)}"
    # 4 distinct division codes must be represented (per problem statement)
    div_codes = {d["body_id"] for d in docs}
    expected_seeded_divs = {"DIV-IND", "DIV-JBP", "DIV-UJN", "DIV-GWL"}
    missing = expected_seeded_divs - div_codes
    assert not missing, f"seed missing division codes: {missing}"
    # At least these seeded workflow states must exist (Draft may have been walked
    # forward by manual/regression testing, so accept its terminal states too).
    statuses = {d["status"] for d in docs}
    for st in ("Finance_Reviewed", "Sent_Back", "Disbursed"):
        assert st in statuses, f"Missing seeded status {st}; got {statuses}"
    # Each grant must have a code that starts with GRT/
    for d in docs:
        assert d.get("code", "").startswith("GRT/"), f"bad code {d.get('code')}"


def test_grants_stats_summary(session):
    r = session.get(f"{API}/division-grants-stats/summary")
    assert r.status_code == 200
    data = r.json()
    for k in ("count", "by_status", "total_requested_inr", "total_disbursed_inr"):
        assert k in data, f"missing key {k}"
    assert isinstance(data["by_status"], dict)
    assert data["count"] >= 4
    assert data["total_requested_inr"] > 0


def test_create_grant_and_code_pattern(session):
    payload = {
        "body_id": "DIV-IND",
        "fiscal_cycle": "2026-27",
        "category": "Tournament_Funding",
        "purpose": "TEST_SPRINT1 purpose " + uuid.uuid4().hex[:6],
        "amount_inr": 12345,
        "created_by_name": "TEST_S1",
    }
    r = session.post(f"{API}/division-grants", json=payload)
    assert r.status_code == 200, r.text
    g = r.json()
    assert g["status"] == "Draft"
    assert g["body_id"] == "DIV-IND"
    assert g["code"].startswith("GRT/DIV-IND/2026-27/"), f"bad code {g['code']}"
    # persistence
    r2 = session.get(f"{API}/division-grants/{g['id']}")
    assert r2.status_code == 200
    assert r2.json()["code"] == g["code"]


def test_create_grant_rejects_non_division(session):
    # MPCA is a State body, not Division
    r = session.post(f"{API}/division-grants", json={
        "body_id": "MPCA", "category": "Admin_Grant",
        "purpose": "TEST bad body", "amount_inr": 100,
    })
    assert r.status_code == 400


def test_create_grant_rejects_zero_amount(session):
    r = session.post(f"{API}/division-grants", json={
        "body_id": "DIV-IND", "category": "Admin_Grant",
        "purpose": "TEST zero", "amount_inr": 0,
    })
    assert r.status_code == 400


@pytest.fixture(scope="module")
def new_grant(session):
    """Create a fresh grant for workflow tests."""
    r = session.post(f"{API}/division-grants", json={
        "body_id": "DIV-IND", "fiscal_cycle": "2026-27",
        "category": "Coaching_Grant",
        "purpose": "TEST_SPRINT1_WF workflow " + uuid.uuid4().hex[:6],
        "amount_inr": 100000, "created_by_name": "TEST_WF",
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_workflow_full_flow(session, new_grant):
    gid = new_grant["id"]

    # Guard: cannot finance-review a Draft
    r = session.post(f"{API}/division-grants/{gid}/finance-review",
                     json={"actor_name": "TEST"})
    assert r.status_code == 400

    # Submit
    r = session.post(f"{API}/division-grants/{gid}/submit", json={"actor_name": "TEST_Div"})
    assert r.status_code == 200
    assert r.json()["status"] == "Submitted"

    # Guard: cannot secretary-approve a Submitted
    r = session.post(f"{API}/division-grants/{gid}/secretary-approve",
                     json={"actor_name": "TEST"})
    assert r.status_code == 400

    # Finance review
    r = session.post(f"{API}/division-grants/{gid}/finance-review",
                     json={"actor_name": "TEST_FinOfficer"})
    assert r.status_code == 200
    assert r.json()["status"] == "Finance_Reviewed"

    # Guard: cannot disburse before approval
    r = session.post(f"{API}/division-grants/{gid}/disburse", json={"actor_name": "TEST"})
    assert r.status_code == 400

    # Secretary approve with amount ≤ requested
    r = session.post(f"{API}/division-grants/{gid}/secretary-approve",
                     json={"actor_name": "TEST_Secretary", "approved_amount_inr": 80000})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "Approved"
    assert j["approved_amount_inr"] == 80000

    # Guard: cannot submit already-Approved
    r = session.post(f"{API}/division-grants/{gid}/submit", json={"actor_name": "TEST"})
    assert r.status_code == 400

    # Disburse
    r = session.post(f"{API}/division-grants/{gid}/disburse", json={"actor_name": "TEST_Treasurer"})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "Disbursed"
    assert j.get("voucher_id"), "voucher_id must be set post-disburse"

    # Voucher exists and links back
    v = session.get(f"{API}/vouchers/{j['voucher_id']}")
    assert v.status_code == 200
    vd = v.json()
    assert vd["linked_module"] == "division_grant"
    assert vd["linked_ref_code"] == j["code"]
    assert vd["status"] == "Posted"
    assert vd["voucher_type"] == "Payment"
    assert vd["amount_inr"] == 80000


def test_secretary_approve_rejects_over_requested(session):
    # Create + walk to Finance_Reviewed
    r = session.post(f"{API}/division-grants", json={
        "body_id": "DIV-IND", "category": "Admin_Grant",
        "purpose": "TEST_over_approve", "amount_inr": 5000,
    })
    gid = r.json()["id"]
    session.post(f"{API}/division-grants/{gid}/submit", json={"actor_name": "T"})
    session.post(f"{API}/division-grants/{gid}/finance-review", json={"actor_name": "T"})
    r = session.post(f"{API}/division-grants/{gid}/secretary-approve",
                     json={"actor_name": "T", "approved_amount_inr": 9999})
    assert r.status_code == 400


def test_send_back_requires_note(session):
    r = session.post(f"{API}/division-grants", json={
        "body_id": "DIV-IND", "category": "Admin_Grant",
        "purpose": "TEST_sendback", "amount_inr": 500,
    })
    gid = r.json()["id"]
    session.post(f"{API}/division-grants/{gid}/submit", json={"actor_name": "T"})
    # No note
    r1 = session.post(f"{API}/division-grants/{gid}/send-back", json={"actor_name": "T"})
    assert r1.status_code == 400
    # With note
    r2 = session.post(f"{API}/division-grants/{gid}/send-back",
                      json={"actor_name": "T", "note": "please recheck"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "Sent_Back"
    # Sent_Back can be re-submitted
    r3 = session.post(f"{API}/division-grants/{gid}/submit", json={"actor_name": "T"})
    assert r3.status_code == 200
    assert r3.json()["status"] == "Submitted"


def test_reject_requires_note(session):
    r = session.post(f"{API}/division-grants", json={
        "body_id": "DIV-IND", "category": "Admin_Grant",
        "purpose": "TEST_reject", "amount_inr": 500,
    })
    gid = r.json()["id"]
    session.post(f"{API}/division-grants/{gid}/submit", json={"actor_name": "T"})
    r1 = session.post(f"{API}/division-grants/{gid}/reject", json={"actor_name": "T"})
    assert r1.status_code == 400
    r2 = session.post(f"{API}/division-grants/{gid}/reject",
                      json={"actor_name": "T", "note": "insufficient documentation"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "Rejected"


# ---------------- P3.5 Vouchers ----------------

def test_vouchers_list_has_grant_linked(session):
    r = session.get(f"{API}/vouchers")
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) >= 1
    grant_linked = [v for v in docs if v.get("linked_module") == "division_grant"]
    assert grant_linked, "expected at least one voucher auto-created from a grant"
    v = grant_linked[0]
    assert v["voucher_no"].startswith("VCH/"), f"bad voucher_no {v['voucher_no']}"
    assert v["voucher_type"] == "Payment"
    assert v["linked_ref_code"]


# ---------------- P3.6 Ledger ----------------

def test_ledger_mpca_running_balance(session):
    r = session.get(f"{API}/ledger", params={"body_id": "MPCA", "fiscal_cycle": "2026-27"})
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("opening_balance_inr", "rows", "totals"):
        assert k in data
    assert isinstance(data["rows"], list)
    tot = data["totals"]
    assert "debit_inr" in tot and "credit_inr" in tot and "closing_balance_inr" in tot
    assert tot["entry_count"] > 0, "expected > 0 ledger entries after disburse tests"
    # Every row has required columns
    for row in data["rows"]:
        for k in ("date", "voucher_no", "particulars", "debit_inr", "credit_inr", "running_balance_inr"):
            assert k in row, f"missing {k} in ledger row"


# ---------------- P3.7 Export ----------------

def test_ledger_export_xlsx(session):
    r = session.get(f"{API}/ledger/export.xlsx", params={"body_id": "MPCA", "fiscal_cycle": "2026-27"})
    assert r.status_code == 200
    assert "openxmlformats-officedocument.spreadsheetml.sheet" in r.headers.get("content-type", "")
    payload = r.content
    assert len(payload) > 1000, f"xlsx payload too small: {len(payload)}"
    # xlsx = PK zip
    assert payload[:2] == b"PK"


def test_ledger_export_pdf(session):
    r = session.get(f"{API}/ledger/export.pdf", params={"body_id": "MPCA", "fiscal_cycle": "2026-27"})
    assert r.status_code == 200
    assert "application/pdf" in r.headers.get("content-type", "")
    assert r.content.startswith(b"%PDF"), f"bad PDF magic: {r.content[:8]}"


# ---------------- P3.9 Budget-vs-Actual ----------------

def test_budget_vs_actual_shape_and_64_rows(session):
    r = session.get(f"{API}/finance/budget-vs-actual", params={"fiscal_cycle": "2026-27"})
    assert r.status_code == 200
    data = r.json()
    for k in ("total_budget_inr", "total_actual_inr", "total_variance_inr",
              "overall_utilisation_pct", "rows"):
        assert k in data
    rows = data["rows"]
    assert len(rows) == 64, f"expected 64 rows (Divisions+Districts), got {len(rows)}"
    for row in rows:
        for k in ("body_id", "body_name", "body_type", "annual_budget_inr",
                  "actual_inr", "variance_inr", "utilisation_pct", "status"):
            assert k in row, f"missing {k} in bva row"


# ---------------- Recent Activity (audit log) ----------------

def test_audit_log_returns_events(session):
    r = session.get(f"{API}/shared/audit-log")
    assert r.status_code == 200
    docs = r.json()
    assert isinstance(docs, list)
    assert len(docs) >= 10, f"need >=10 audit events for Recent Activity, got {len(docs)}"
    # Audit log rows store actor as flat fields (actor_name / actor_role / actor_body_id)
    for d in docs[:5]:
        for k in ("module", "action"):
            assert k in d, f"missing {k} in audit log event"
        assert "actor_name" in d or "actor" in d, "audit event must expose actor name"
