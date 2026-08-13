"""MPCA-168 · Tournament Reimbursement Claim Workflow Overhaul — Phase A/E tests.

Phase A · Backend model + endpoints (invoice-review, mpca-signed-pdf, approve gates)
Phase E · tournament_invoices lock when claim is Submitted/Under_Review/Approved

Uses persona-based headers (X-Body-Code/X-Body-Type) similar to prior sprints.
Seeds fixture data directly via motor to avoid depending on full tournament flow.
"""
import os
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MPCA_HEADERS = {"X-Body-Code": "MPCA", "X-Body-Type": "State", "X-Persona-Name": "TEST_MPCA_Sec"}
DIV_HEADERS = {"X-Body-Code": "DIV-IND", "X-Body-Type": "Division", "X-Persona-Name": "TEST_Div_Sec"}


# ────────────────── Motor fixtures for direct DB seeding ──────────────────

@pytest.fixture(scope="module")
def db():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def seed(db, loop):
    """Seed tournament + budget + 2 invoices + a Submitted claim."""
    async def _seed():
        tid = f"TEST-t-{uuid.uuid4().hex[:8]}"
        bid = "DIV-IND"
        cycle = "2099-00"

        await db.tournaments.insert_one({
            "id": tid, "tournament_no": "TEST-TRN", "name": "TEST_MPCA168 Tournament",
            "format": "T20_Senior", "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional", "fiscal_cycle": cycle,
            "host_body_id": "MPCA", "scheme_code": "2-D", "status": "Completed",
        })

        bud_id = f"TEST-b-{uuid.uuid4().hex[:8]}"
        await db.tournament_budgets.insert_one({
            "id": bud_id, "budget_no": "TEST-TB", "tournament_id": tid, "body_id": bid,
            "fiscal_cycle": cycle, "status": "Approved",
            "total_ceiling_inr": 1000000.0, "approved_total_inr": 1000000.0,
            "approved_head_allocations": [
                {"head": "Hotel", "limit_inr": 600000.0},
                {"head": "Travel", "limit_inr": 400000.0},
            ],
            "head_allocations": [
                {"head": "Hotel", "limit_inr": 600000.0},
                {"head": "Travel", "limit_inr": 400000.0},
            ],
        })

        inv_a_id = f"TEST-inv-a-{uuid.uuid4().hex[:8]}"
        inv_b_id = f"TEST-inv-b-{uuid.uuid4().hex[:8]}"
        await db.tournament_invoices.insert_many([
            {"id": inv_a_id, "invoice_ref": "TEST-INV-A", "tournament_id": tid,
             "body_id": bid, "total_inr": 500000.0, "status": "Approved",
             "vendor_name": "Hotel A", "invoice_date": "2026-01-01",
             "allocations": [{"head_label": "Hotel", "head_code": "HOTEL", "amount_inr": 500000.0}]},
            {"id": inv_b_id, "invoice_ref": "TEST-INV-B", "tournament_id": tid,
             "body_id": bid, "total_inr": 300000.0, "status": "Approved",
             "vendor_name": "Travel B", "invoice_date": "2026-01-02",
             "allocations": [
                 {"head_label": "Hotel", "head_code": "HOTEL", "amount_inr": 100000.0},
                 {"head_label": "Travel", "head_code": "TRAVEL", "amount_inr": 200000.0},
             ]},
        ])

        cid = f"TEST-claim-{uuid.uuid4().hex[:8]}"
        await db.tournament_reimbursement_claims.insert_one({
            "id": cid, "claim_ref": "TEST-TRC-0001", "tournament_id": tid,
            "tournament_name": "TEST_MPCA168 Tournament",
            "body_id": bid, "body_name": "Indore Division",
            "fiscal_cycle": cycle, "scheme_code": "2-D",
            "status": "Submitted", "route_to_body_id": "MPCA",
            "review_stage": "MPCA",
            "invoice_ids": [inv_a_id, inv_b_id],
            "summary": {"eligible_total_inr": 800000.0, "invoice_count": 2, "heads": []},
            "mpca_invoice_reviews": [],
            "signed_pdf_url": "/api/uploads/fake-signed.pdf",
            "approval_chain": [],
        })
        return {"tid": tid, "bid": bid, "cid": cid, "cycle": cycle,
                "inv_a": inv_a_id, "inv_b": inv_b_id, "bud_id": bud_id}
    data = loop.run_until_complete(_seed())
    yield data
    async def _cleanup():
        await db.tournaments.delete_one({"id": data["tid"]})
        await db.tournament_budgets.delete_one({"id": data["bud_id"]})
        await db.tournament_invoices.delete_many({"tournament_id": data["tid"]})
        await db.tournament_reimbursement_claims.delete_one({"id": data["cid"]})
    loop.run_until_complete(_cleanup())


# ══════════════════ Phase A · Invoice-Review endpoint ══════════════════

class TestInvoiceReview:
    def test_404_on_missing_claim(self):
        r = requests.post(f"{API}/reimbursement-claims/does-not-exist/invoice-review",
                          json={"invoice_id": "x", "accepted_inr": 1}, headers=MPCA_HEADERS)
        assert r.status_code == 404

    def test_403_non_mpca(self, seed):
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                          json={"invoice_id": seed["inv_a"], "accepted_inr": 100.0},
                          headers=DIV_HEADERS)
        assert r.status_code == 403

    def test_404_invoice_not_on_claim(self, seed):
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                          json={"invoice_id": "some-random-id", "accepted_inr": 100.0},
                          headers=MPCA_HEADERS)
        assert r.status_code == 404

    def test_422_negative(self, seed):
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                          json={"invoice_id": seed["inv_a"], "accepted_inr": -1},
                          headers=MPCA_HEADERS)
        assert r.status_code == 422

    def test_422_over_invoice_total(self, seed):
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                          json={"invoice_id": seed["inv_a"], "accepted_inr": 999999999.0},
                          headers=MPCA_HEADERS)
        assert r.status_code == 422

    def test_success_and_status_flip(self, seed):
        # Accept invoice A fully (500,000)
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                          json={"invoice_id": seed["inv_a"], "accepted_inr": 500000.0,
                                "reviewed_by": "TEST_MPCA_Sec"},
                          headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "Under_Review"  # auto-flip from Submitted
        reviews = data["mpca_invoice_reviews"]
        assert len(reviews) == 1
        assert reviews[0]["invoice_id"] == seed["inv_a"]
        assert reviews[0]["accepted_inr"] == 500000.0

    def test_overwrites_previous_review(self, seed):
        # Second review on same invoice A → replaces
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                          json={"invoice_id": seed["inv_a"], "accepted_inr": 400000.0,
                                "reason": "Deducted overspend"},
                          headers=MPCA_HEADERS)
        assert r.status_code == 200
        data = r.json()
        matching = [x for x in data["mpca_invoice_reviews"] if x["invoice_id"] == seed["inv_a"]]
        assert len(matching) == 1
        assert matching[0]["accepted_inr"] == 400000.0
        assert matching[0]["reason"] == "Deducted overspend"


# ══════════════════ Phase A · DELETE invoice-review ══════════════════

class TestClearReview:
    def test_403_non_mpca(self, seed):
        r = requests.delete(
            f"{API}/reimbursement-claims/{seed['cid']}/invoice-review/{seed['inv_a']}",
            headers=DIV_HEADERS)
        assert r.status_code == 403

    def test_delete_removes_entry(self, seed):
        # Ensure entry exists
        requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                      json={"invoice_id": seed["inv_a"], "accepted_inr": 100.0},
                      headers=MPCA_HEADERS)
        r = requests.delete(
            f"{API}/reimbursement-claims/{seed['cid']}/invoice-review/{seed['inv_a']}",
            headers=MPCA_HEADERS)
        assert r.status_code == 200
        assert all(x["invoice_id"] != seed["inv_a"]
                   for x in (r.json().get("mpca_invoice_reviews") or []))


# ══════════════════ Phase A · Review Summary ══════════════════

class TestReviewSummary:
    def test_summary_shape_and_proration(self, seed):
        # Set review only on invoice B (allocated 100k Hotel + 200k Travel, total 300k)
        # accepted_inr = 150,000 → prorated 50k Hotel + 100k Travel
        requests.delete(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review/{seed['inv_a']}",
                        headers=MPCA_HEADERS)
        requests.delete(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review/{seed['inv_b']}",
                        headers=MPCA_HEADERS)
        requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                      json={"invoice_id": seed["inv_b"], "accepted_inr": 150000.0,
                            "reason": "Partial travel"}, headers=MPCA_HEADERS)

        r = requests.get(f"{API}/reimbursement-claims/{seed['cid']}/review-summary",
                         headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["claim_id"] == seed["cid"]
        assert data["invoice_count"] == 2
        assert data["invoices_reviewed"] == 1
        assert data["all_reviewed"] is False
        # Heads
        head_by_name = {h["head"]: h for h in data["heads"]}
        assert "Hotel" in head_by_name and "Travel" in head_by_name
        assert head_by_name["Hotel"]["budget_inr"] == 600000.0
        assert head_by_name["Travel"]["budget_inr"] == 400000.0
        # Proration for invoice B: 100/300 * 150k = 50k Hotel, 200/300 * 150k = 100k Travel
        assert round(head_by_name["Hotel"]["accepted_inr"], 2) == 50000.0
        assert round(head_by_name["Travel"]["accepted_inr"], 2) == 100000.0
        # difference_inr present
        assert "difference_inr" in head_by_name["Hotel"]
        # totals
        assert round(data["totals"]["accepted_inr"], 2) == 150000.0

    def test_all_reviewed_flag(self, seed):
        requests.post(f"{API}/reimbursement-claims/{seed['cid']}/invoice-review",
                      json={"invoice_id": seed["inv_a"], "accepted_inr": 500000.0},
                      headers=MPCA_HEADERS)
        r = requests.get(f"{API}/reimbursement-claims/{seed['cid']}/review-summary",
                         headers=MPCA_HEADERS)
        assert r.json()["all_reviewed"] is True


# ══════════════════ Phase A · MPCA-signed PDF endpoint ══════════════════

class TestMpcaSignedPdf:
    def test_403_non_mpca(self, seed):
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/mpca-signed-pdf",
                          json={"signed_pdf_url": "/api/uploads/x.pdf"},
                          headers=DIV_HEADERS)
        assert r.status_code == 403

    def test_persist(self, seed):
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/mpca-signed-pdf",
                          json={"signed_pdf_url": "/api/uploads/mpca-decision.pdf",
                                "uploaded_by": "TEST_MPCA_Sec"},
                          headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mpca_signed_pdf_url"] == "/api/uploads/mpca-decision.pdf"
        assert data["mpca_signed_pdf_uploaded_at"]
        assert data["mpca_signed_pdf_uploaded_by"] == "TEST_MPCA_Sec"

        # Verify GET reflects it
        g = requests.get(f"{API}/reimbursement-claims/{seed['cid']}", headers=MPCA_HEADERS)
        assert g.json()["mpca_signed_pdf_url"] == "/api/uploads/mpca-decision.pdf"


# ══════════════════ Phase A · Approve gates ══════════════════

class TestApproveGates:
    def test_missing_reviews_blocks_approve(self, seed, db, loop):
        # Reset reviews to only invoice A, then attempt approve
        async def reset():
            await db.tournament_reimbursement_claims.update_one(
                {"id": seed["cid"]},
                {"$set": {"mpca_invoice_reviews": [
                    {"invoice_id": seed["inv_a"], "accepted_inr": 500000.0,
                     "reviewed_at": "2026-01-01T00:00:00+00:00"}
                ], "status": "Under_Review"}})
        loop.run_until_complete(reset())
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/approve",
                          json={"actor_role": "Hon. Secretary", "actor_name": "TEST_MPCA_Sec",
                                "actor_body_id": "MPCA"},
                          headers=MPCA_HEADERS)
        assert r.status_code == 400
        assert "invoice" in r.text.lower()

    def test_missing_signed_pdf_blocks(self, seed, db, loop):
        async def prep():
            await db.tournament_reimbursement_claims.update_one(
                {"id": seed["cid"]},
                {"$set": {"mpca_invoice_reviews": [
                    {"invoice_id": seed["inv_a"], "accepted_inr": 500000.0,
                     "reviewed_at": "2026-01-01T00:00:00+00:00"},
                    {"invoice_id": seed["inv_b"], "accepted_inr": 300000.0,
                     "reviewed_at": "2026-01-01T00:00:00+00:00"},
                ], "mpca_signed_pdf_url": None, "status": "Under_Review"}})
        loop.run_until_complete(prep())
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/approve",
                          json={"actor_role": "Hon. Secretary", "actor_name": "TEST_MPCA_Sec",
                                "actor_body_id": "MPCA"},
                          headers=MPCA_HEADERS)
        assert r.status_code == 400
        assert "sign" in r.text.lower() or "pdf" in r.text.lower()

    def test_success_uses_sum_of_accepted(self, seed, db, loop):
        async def prep():
            await db.tournament_reimbursement_claims.update_one(
                {"id": seed["cid"]},
                {"$set": {"mpca_invoice_reviews": [
                    {"invoice_id": seed["inv_a"], "accepted_inr": 400000.0,
                     "reviewed_at": "2026-01-01T00:00:00+00:00"},
                    {"invoice_id": seed["inv_b"], "accepted_inr": 250000.0,
                     "reviewed_at": "2026-01-01T00:00:00+00:00"},
                ], "mpca_signed_pdf_url": "/api/uploads/mpca-decision.pdf",
                "status": "Under_Review"}})
        loop.run_until_complete(prep())
        # even though action.approved_amount_inr provided, sum-of-accepted wins
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/approve",
                          json={"actor_role": "Hon. Secretary", "actor_name": "TEST_MPCA_Sec",
                                "actor_body_id": "MPCA",
                                "approved_amount_inr": 999.0},
                          headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "Approved"
        assert data["approved_amount_inr"] == 650000.0  # 400k + 250k


# ══════════════════ Phase E · Invoice CRUD lock ══════════════════

class TestPhaseELock:
    """Verify tournament_invoices CRUD is blocked when a claim is active."""

    def test_create_blocked_when_claim_submitted(self, seed, db, loop):
        # Reset the seeded claim back to Submitted state
        async def reset():
            await db.tournament_reimbursement_claims.update_one(
                {"id": seed["cid"]}, {"$set": {"status": "Submitted"}})
        loop.run_until_complete(reset())

        r = requests.post(f"{API}/tournament-invoices", json={
            "tournament_id": seed["tid"], "body_id": seed["bid"],
            "invoice_date": "2026-02-01", "vendor_name": "Should Fail",
            "total_inr": 100.0,
            "allocations": [{"head_code": "HOTEL", "head_label": "Hotel", "amount_inr": 100.0}],
        }, headers=DIV_HEADERS)
        assert r.status_code == 409
        assert "claim" in r.text.lower()

    def test_patch_blocked(self, seed):
        r = requests.patch(f"{API}/tournament-invoices/{seed['inv_a']}",
                           json={"vendor_name": "Renamed"},
                           headers=DIV_HEADERS)
        assert r.status_code == 409

    def test_delete_blocked(self, seed):
        r = requests.delete(f"{API}/tournament-invoices/{seed['inv_a']}",
                            headers=DIV_HEADERS)
        assert r.status_code == 409

    def test_unlocks_on_rejected(self, seed, db, loop):
        async def reset():
            await db.tournament_reimbursement_claims.update_one(
                {"id": seed["cid"]}, {"$set": {"status": "Rejected"}})
        loop.run_until_complete(reset())

        # Now create should NOT hit the claim-lock (may fail for other reasons
        # like status guards, but not the 409-with-'claim' message).
        r = requests.post(f"{API}/tournament-invoices", json={
            "tournament_id": seed["tid"], "body_id": seed["bid"],
            "invoice_date": "2026-02-01", "vendor_name": "TEST_After_Reject",
            "total_inr": 100.0,
            "allocations": [{"head_code": "HOTEL", "head_label": "Hotel", "amount_inr": 100.0}],
        }, headers=DIV_HEADERS)
        # Allow 200/201, but if 409 make sure it's NOT the claim-lock one
        if r.status_code == 409:
            assert "claim" not in r.text.lower()
        else:
            assert r.status_code in (200, 201), r.text
            # cleanup created invoice
            try:
                iid = r.json().get("id")
                if iid:
                    async def _rm():
                        await db.tournament_invoices.delete_one({"id": iid})
                    loop.run_until_complete(_rm())
            except Exception:
                pass


# ═════════════════════ Feb 2026 · head remarks + spent fallback ═════════════════════

class TestDivisionHeadRemarks:
    """Feb 2026 additions on top of MPCA-168 Phase A."""

    def test_set_remark(self, seed):
        r = requests.post(
            f"{API}/reimbursement-claims/{seed['cid']}/head-remark",
            json={"head": "Hotel", "remark": "Bill missing GST invoice"},
            headers=DIV_HEADERS,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("division_head_remarks", {}).get("Hotel") == "Bill missing GST invoice"

    def test_empty_remark_deletes(self, seed):
        # Set then clear
        requests.post(f"{API}/reimbursement-claims/{seed['cid']}/head-remark",
                      json={"head": "Food", "remark": "temp"}, headers=DIV_HEADERS)
        r = requests.post(f"{API}/reimbursement-claims/{seed['cid']}/head-remark",
                          json={"head": "Food", "remark": ""}, headers=DIV_HEADERS)
        assert r.status_code == 200
        assert "Food" not in (r.json().get("division_head_remarks") or {})

    def test_other_body_forbidden(self, seed):
        r = requests.post(
            f"{API}/reimbursement-claims/{seed['cid']}/head-remark",
            json={"head": "Hotel", "remark": "shouldn't work"},
            headers={"X-Body-Code": "DIV-BPL", "X-Body-Type": "Division"},
        )
        assert r.status_code == 403

    def test_summary_returns_remarks(self, seed):
        requests.post(f"{API}/reimbursement-claims/{seed['cid']}/head-remark",
                      json={"head": "Travel", "remark": "AC-2 fares"}, headers=DIV_HEADERS)
        r = requests.get(f"{API}/reimbursement-claims/{seed['cid']}/review-summary",
                         headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        assert (r.json().get("division_head_remarks") or {}).get("Travel") == "AC-2 fares"
