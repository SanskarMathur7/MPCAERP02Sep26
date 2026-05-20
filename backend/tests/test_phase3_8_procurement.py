"""Phase III.8 — Procurement Protocol + ABC Expenditure Analysis tests.

Covers:
  * /api/procurement CRUD + quote/award/close/cancel/link-claim
  * 3-quote rule, QCBS threshold rule, L1-or-justify rule
  * /api/finance/abc-analysis Pareto bucketing
  * Regression smoke for Phase I-III.7 endpoints

Throwaway PRs are created with TEST_ prefix titles and cancelled at end-of-class
so demo seed data is not polluted.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_prs():
    return []   # collected for cleanup


@pytest.fixture(scope="module", autouse=True)
def cleanup(client, created_prs):
    yield
    # Cancel all throwaway PRs so demo data stays clean
    for pid in created_prs:
        try:
            client.post(f"{API}/procurement/{pid}/cancel", timeout=10)
        except Exception:
            pass


# ---------------- Phase III.8: version + listing ----------------

class TestVersionAndList:
    def test_root_version(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        body = r.json()
        assert body["version"] == "3.8.0"
        assert body["status"] == "ok"

    def test_list_returns_seeded_three(self, client):
        r = client.get(f"{API}/procurement")
        assert r.status_code == 200
        prs = r.json()
        pr_nos = {p["pr_no"]: p for p in prs}
        assert "PR-2025-26-001" in pr_nos
        assert "PR-2025-26-002" in pr_nos
        assert "PR-2025-26-003" in pr_nos
        # Validate the documented attributes
        assert pr_nos["PR-2025-26-001"]["method"] == "Direct"
        assert pr_nos["PR-2025-26-001"]["status"] == "Awarded"
        assert pr_nos["PR-2025-26-001"]["body_id"] == "MPCA"
        assert pr_nos["PR-2025-26-002"]["method"] == "Three_Quote"
        assert pr_nos["PR-2025-26-002"]["status"] == "Awarded"
        assert pr_nos["PR-2025-26-002"]["body_id"] == "DIST-JABA-JBP"
        assert pr_nos["PR-2025-26-003"]["method"] == "Three_Quote"
        assert pr_nos["PR-2025-26-003"]["status"] == "Draft"
        assert pr_nos["PR-2025-26-003"]["body_id"] == "DIST-SEHO-BPL"

    def test_filters(self, client):
        assert len(client.get(f"{API}/procurement", params={"status": "Awarded"}).json()) >= 2
        assert len(client.get(f"{API}/procurement", params={"method": "Direct"}).json()) >= 1
        assert len(client.get(f"{API}/procurement", params={"body_id": "MPCA"}).json()) >= 1
        assert len(client.get(f"{API}/procurement", params={"fiscal_cycle": "2025-26"}).json()) >= 3

    def test_get_by_id_and_404(self, client):
        prs = client.get(f"{API}/procurement").json()
        pid = prs[0]["id"]
        r = client.get(f"{API}/procurement/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid

        bad = client.get(f"{API}/procurement/nonexistent-xyz")
        assert bad.status_code == 404


# ---------------- Method derivation on create ----------------

class TestCreateMethodDerivation:
    @pytest.mark.parametrize("amount,expected", [
        (50_000, "Direct"),
        (500_000, "Three_Quote"),
        # Note: problem statement said 10_000_000 → Three_Quote, but 10_000_000 (=1Cr=100L)
        # is > the documented 75L QCBS threshold, so implementation returns QCBS (correct).
        (10_000_000, "QCBS"),
        (7_500_000, "Three_Quote"),    # exactly 75L is still Three_Quote
        (80_000_000, "QCBS"),          # >75L → QCBS
    ])
    def test_method_for_amount(self, client, created_prs, amount, expected):
        payload = {
            "body_id": "MPCA",
            "title": f"TEST_method_{amount}",
            "estimated_amount_inr": amount,
            "fiscal_cycle": "2025-26",
        }
        r = client.post(f"{API}/procurement", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["method"] == expected
        assert body["status"] == "Draft"
        assert body["pr_no"].startswith("PR-2025-26-")
        created_prs.append(body["id"])

    def test_invalid_body(self, client):
        r = client.post(f"{API}/procurement", json={
            "body_id": "NOPE-XYZ",
            "title": "TEST_bad_body",
            "estimated_amount_inr": 1000,
        })
        assert r.status_code == 400


# ---------------- Quotations workflow ----------------

class TestQuotations:
    def _new_pr(self, client, created_prs, amount=500_000, body_id="MPCA"):
        r = client.post(f"{API}/procurement", json={
            "body_id": body_id,
            "title": f"TEST_quote_pr_{amount}",
            "estimated_amount_inr": amount,
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        created_prs.append(pid)
        return pid

    def test_third_quote_transitions_to_quotes_collected(self, client, created_prs):
        pid = self._new_pr(client, created_prs, amount=500_000)
        # 1st quote
        r1 = client.post(f"{API}/procurement/{pid}/quotations",
                         json={"vendor_name": "V1", "quote_amount_inr": 480_000, "quote_date": "2025-08-01"})
        assert r1.status_code == 200
        assert r1.json()["status"] == "Draft"
        # 2nd quote
        client.post(f"{API}/procurement/{pid}/quotations",
                    json={"vendor_name": "V2", "quote_amount_inr": 470_000, "quote_date": "2025-08-02"})
        # 3rd quote should flip status
        r3 = client.post(f"{API}/procurement/{pid}/quotations",
                         json={"vendor_name": "V3", "quote_amount_inr": 460_000, "quote_date": "2025-08-03"})
        assert r3.status_code == 200
        assert r3.json()["status"] == "Quotes_Collected"
        assert len(r3.json()["quotations"]) == 3

    def test_cannot_add_quote_after_awarded(self, client, created_prs):
        pid = self._new_pr(client, created_prs, amount=500_000)
        for i, amt in enumerate([100_000, 110_000, 120_000]):
            client.post(f"{API}/procurement/{pid}/quotations",
                        json={"vendor_name": f"V{i}", "quote_amount_inr": amt, "quote_date": "2025-08-04"})
        # Award to L1
        aw = client.post(f"{API}/procurement/{pid}/award",
                         json={"awarded_vendor": "V0", "awarded_amount_inr": 100_000})
        assert aw.status_code == 200
        assert aw.json()["status"] == "Awarded"

        # Now adding a quote should 400
        bad = client.post(f"{API}/procurement/{pid}/quotations",
                          json={"vendor_name": "V_late", "quote_amount_inr": 90_000, "quote_date": "2025-08-05"})
        assert bad.status_code == 400


# ---------------- Award rules ----------------

class TestAwardRules:
    def _seed_pr(self, client, created_prs, amount=500_000, quotes=None):
        r = client.post(f"{API}/procurement", json={
            "body_id": "MPCA",
            "title": f"TEST_award_pr_{amount}",
            "estimated_amount_inr": amount,
        })
        pid = r.json()["id"]
        created_prs.append(pid)
        for q in quotes or []:
            client.post(f"{API}/procurement/{pid}/quotations", json=q)
        return pid

    def test_three_quote_requires_three(self, client, created_prs):
        pid = self._seed_pr(client, created_prs, 500_000, quotes=[
            {"vendor_name": "A", "quote_amount_inr": 100, "quote_date": "2025-08-01"},
            {"vendor_name": "B", "quote_amount_inr": 110, "quote_date": "2025-08-01"},
        ])
        r = client.post(f"{API}/procurement/{pid}/award",
                        json={"awarded_vendor": "A", "awarded_amount_inr": 100})
        assert r.status_code == 400
        assert "3 quotations" in r.text or "3 quot" in r.text

    def test_awarded_must_be_quoted(self, client, created_prs):
        pid = self._seed_pr(client, created_prs, 500_000, quotes=[
            {"vendor_name": "A", "quote_amount_inr": 100, "quote_date": "2025-08-01"},
            {"vendor_name": "B", "quote_amount_inr": 110, "quote_date": "2025-08-01"},
            {"vendor_name": "C", "quote_amount_inr": 120, "quote_date": "2025-08-01"},
        ])
        r = client.post(f"{API}/procurement/{pid}/award",
                        json={"awarded_vendor": "GHOST", "awarded_amount_inr": 100})
        assert r.status_code == 400

    def test_non_l1_requires_justification(self, client, created_prs):
        pid = self._seed_pr(client, created_prs, 500_000, quotes=[
            {"vendor_name": "A", "quote_amount_inr": 100, "quote_date": "2025-08-01"},
            {"vendor_name": "B", "quote_amount_inr": 110, "quote_date": "2025-08-01"},
            {"vendor_name": "C", "quote_amount_inr": 120, "quote_date": "2025-08-01"},
        ])
        # No notes
        r_no = client.post(f"{API}/procurement/{pid}/award",
                           json={"awarded_vendor": "B", "awarded_amount_inr": 110})
        assert r_no.status_code == 400

        # Short notes (< 10 chars)
        r_short = client.post(f"{API}/procurement/{pid}/award",
                              json={"awarded_vendor": "B", "awarded_amount_inr": 110, "notes": "ok"})
        assert r_short.status_code == 400

        # Proper notes — happy path
        r_ok = client.post(f"{API}/procurement/{pid}/award",
                           json={"awarded_vendor": "B", "awarded_amount_inr": 110,
                                 "notes": "B preferred for after-sales support history; L1 rejected by tech panel."})
        assert r_ok.status_code == 200
        body = r_ok.json()
        assert body["status"] == "Awarded"
        assert body["awarded_vendor"] == "B"
        assert body["awarded_amount_inr"] == 110

    def test_award_happy_with_security_deposit(self, client, created_prs):
        pid = self._seed_pr(client, created_prs, 500_000, quotes=[
            {"vendor_name": "A", "quote_amount_inr": 100, "quote_date": "2025-08-01"},
            {"vendor_name": "B", "quote_amount_inr": 110, "quote_date": "2025-08-01"},
            {"vendor_name": "C", "quote_amount_inr": 120, "quote_date": "2025-08-01"},
        ])
        r = client.post(f"{API}/procurement/{pid}/award",
                        json={"awarded_vendor": "A", "awarded_amount_inr": 100, "security_deposit_inr": 10})
        assert r.status_code == 200
        b = r.json()
        assert b["status"] == "Awarded"
        assert b["awarded_vendor"] == "A"
        assert b["security_deposit_inr"] == 10


# ---------------- Close / Cancel / Link ----------------

class TestLifecycle:
    def _awarded_pr(self, client, created_prs):
        r = client.post(f"{API}/procurement", json={
            "body_id": "MPCA",
            "title": "TEST_lifecycle",
            "estimated_amount_inr": 500_000,
        })
        pid = r.json()["id"]
        created_prs.append(pid)
        for v, a in [("A", 100), ("B", 110), ("C", 120)]:
            client.post(f"{API}/procurement/{pid}/quotations",
                        json={"vendor_name": v, "quote_amount_inr": a, "quote_date": "2025-08-01"})
        client.post(f"{API}/procurement/{pid}/award",
                    json={"awarded_vendor": "A", "awarded_amount_inr": 100})
        return pid

    def test_close_from_awarded(self, client, created_prs):
        pid = self._awarded_pr(client, created_prs)
        r = client.post(f"{API}/procurement/{pid}/close")
        assert r.status_code == 200
        assert r.json()["status"] == "Closed"

    def test_cancel_from_draft(self, client, created_prs):
        r = client.post(f"{API}/procurement", json={
            "body_id": "MPCA",
            "title": "TEST_cancel",
            "estimated_amount_inr": 1000,
        })
        pid = r.json()["id"]
        # Note: cancelled, so don't add to created_prs
        c = client.post(f"{API}/procurement/{pid}/cancel")
        assert c.status_code == 200
        assert c.json()["status"] == "Cancelled"

    def test_link_claim_requires_awarded_and_valid_claim(self, client, created_prs):
        pid = self._awarded_pr(client, created_prs)
        # Invalid claim id
        r_bad = client.post(f"{API}/procurement/{pid}/link-claim/nonexistent-claim")
        assert r_bad.status_code == 404
        # Find an existing seeded claim
        claims = client.get(f"{API}/claims").json()
        assert len(claims) >= 1
        cid = claims[0]["id"]
        r = client.post(f"{API}/procurement/{pid}/link-claim/{cid}")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "Linked_To_Claim"
        assert body["linked_claim_id"] == cid


# ---------------- ABC Analysis ----------------

class TestABCAnalysis:
    def test_abc_basic_structure(self, client):
        r = client.get(f"{API}/finance/abc-analysis", params={"fiscal_cycle": "2025-26"})
        assert r.status_code == 200
        data = r.json()
        assert "total_disbursed_inr" in data
        assert "buckets" in data
        for k in ("A", "B", "C"):
            assert k in data["buckets"]
            assert "count" in data["buckets"][k]
            assert "total_inr" in data["buckets"][k]
        assert isinstance(data["rows"], list)

    def test_abc_rows_sorted_desc_and_have_fields(self, client):
        r = client.get(f"{API}/finance/abc-analysis", params={"fiscal_cycle": "2025-26"})
        data = r.json()
        rows = data["rows"]
        amounts = [row["amount_inr"] for row in rows]
        assert amounts == sorted(amounts, reverse=True)
        for row in rows:
            for f in ("bucket", "cum_pct", "share_pct", "claim_no"):
                assert f in row
            assert row["bucket"] in ("A", "B", "C")

    def test_abc_single_disbursed_lands_in_A(self, client):
        # Seed claims: at least 1 claim was disbursed previously (per regression history)
        r = client.get(f"{API}/finance/abc-analysis", params={"fiscal_cycle": "2025-26"})
        data = r.json()
        if not data["rows"]:
            pytest.skip("No disbursed claims in 2025-26 — skipping single-bucket check")
        # First (highest-value) row should be 'A' as prev_cum_pct starts at 0 < 70
        assert data["rows"][0]["bucket"] == "A"


# ---------------- Regression: Phase I-III.7 endpoints ----------------

REGRESSION_GETS = [
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
    "/budgets",
    "/sanction-thresholds",
]


class TestRegression:
    @pytest.mark.parametrize("path", REGRESSION_GETS)
    def test_get_endpoint_200(self, client, path):
        r = client.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} returned {r.status_code}: {r.text[:200]}"

    def test_seed_data_intact(self, client):
        claims = client.get(f"{API}/claims").json()
        claim_nos = {c["claim_no"] for c in claims}
        for n in ("CLM-2025-26-001", "CLM-2025-26-002", "CLM-2025-26-003", "CLM-2025-26-004"):
            assert n in claim_nos, f"missing seed claim {n}"
        bodies = client.get(f"{API}/bodies").json()
        assert len(bodies) >= 66
        members = client.get(f"{API}/members").json()
        assert len(members) >= 7

    def test_mpca_general_balance_unchanged_baseline_recorded(self, client):
        # Record the MPCA General balance — this test mainly asserts the account exists.
        accts = client.get(f"{API}/bank/accounts", params={"body_id": "MPCA"}).json()
        general = [a for a in accts if "general" in a.get("name", "").lower()]
        assert general, "MPCA General Account not found"
        # Print for human inspection
        print(f"MPCA General Account current_balance = {general[0].get('current_balance')}")
