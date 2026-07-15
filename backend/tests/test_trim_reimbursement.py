"""Sprint T-RIM · Tournament Reimbursement Matrix — backend E2E tests.

Covers:
- Reimbursement schemes (10 seeded)
- PATCH /tournaments/{tid} scheme_code
- Tournament budgets create
- Tournament invoices with multi-head allocations
- Budget tracker computes from allocations
- Reimbursement preview summary
- Reimbursement claim CRUD + submit/approve/reject/comment/idempotency
- Reimbursement claim stats
"""
import os
import uuid
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

TID_SEED = "89847570-56c9-4253-9340-044ddbd6695f"  # CT Sarwate Trophy (seeded)
CYCLE = "2025-26"
TEST_BODY = "DIV-BPL"  # use a body different from seeded MPCA/DIV-IND to keep isolation


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ═══════════════════ Reimbursement Schemes ═══════════════════
class TestSchemes:
    def test_list_returns_10_schemes(self, s):
        r = s.get(f"{API}/reimbursement-schemes")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        codes = sorted([d["scheme_code"] for d in data])
        expected = sorted(["2-A", "2-B", "2-C", "2-D", "2-E", "3-A", "3-B", "3-C", "3-D", "9-BCCI"])
        assert codes == expected, f"expected {expected} got {codes}"

    def test_get_single_scheme(self, s):
        r = s.get(f"{API}/reimbursement-schemes/2-D")
        assert r.status_code == 200
        d = r.json()
        assert d["scheme_code"] == "2-D"
        assert d.get("is_active") is True
        # scheme document should carry structured content
        assert d.get("categories") or d.get("description") or d.get("conditions")

    def test_get_missing_scheme(self, s):
        r = s.get(f"{API}/reimbursement-schemes/9-XXX")
        assert r.status_code == 404


# ═══════════════════ Tournament PATCH ═══════════════════
class TestTournamentPatch:
    def test_patch_scheme_code(self, s):
        r = s.patch(f"{API}/tournaments/{TID_SEED}", json={"scheme_code": "2-D"})
        assert r.status_code == 200
        assert r.json().get("scheme_code") == "2-D"

    def test_patch_missing_tournament(self, s):
        r = s.patch(f"{API}/tournaments/does-not-exist", json={"scheme_code": "2-D"})
        assert r.status_code == 404


# ═══════════════════ Budget + Invoices + Tracker ═══════════════════
class TestBudgetInvoiceTracker:
    @pytest.fixture(scope="class")
    def tournament_id(self, s):
        # Create a fresh tournament for isolated testing
        payload = {
            "name": f"TEST_TRIM_{uuid.uuid4().hex[:6]}",
            "tournament_no": f"TEST-TRIM-{uuid.uuid4().hex[:4]}",
            "tournament_type": "MPCA_Championship",
            "format": "One_Day",
            "scope": "Inter_Divisional",
            "fiscal_cycle": CYCLE,
            "host_body_id": TEST_BODY,
            "scheme_code": "2-D",
            "start_date": "2025-11-01",
            "end_date": "2025-11-05",
        }
        r = s.post(f"{API}/tournaments", json=payload)
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        yield tid
        # cleanup: try DELETE if exists
        s.delete(f"{API}/tournaments/{tid}")

    @pytest.fixture(scope="class")
    def budget_id(self, s, tournament_id):
        payload = {
            "tournament_id": tournament_id,
            "body_id": TEST_BODY,
            "fiscal_cycle": CYCLE,
            "scheme_code": "2-D",
            "head_allocations": [
                {"head": "Accommodation — visiting team (Double Occ)", "limit_inr": 200000},
                {"head": "Ground rent + match-day tent", "limit_inr": 100000},
                {"head": "Coach honorarium (match-day)", "limit_inr": 50000},
            ],
            "total_ceiling_inr": 350000,
        }
        r = s.post(f"{API}/tournament-budgets", json=payload)
        assert r.status_code in (200, 201), r.text
        b = r.json()
        # approve so tracker/preview picks it up
        s.post(f"{API}/tournament-budgets/{b['id']}/approve", json={"actor_role": "secretary", "actor_name": "TEST"})
        return b["id"]

    def test_budget_created(self, s, budget_id):
        r = s.get(f"{API}/tournament-budgets/{budget_id}")
        assert r.status_code == 200
        d = r.json()
        assert len(d.get("head_allocations", [])) == 3

    def test_invoice_with_multi_head_allocations(self, s, tournament_id, budget_id):
        payload = {
            "tournament_id": tournament_id,
            "body_id": TEST_BODY,
            "budget_id": budget_id,
            "vendor_name": "TEST_Vendor_ABC",
            "invoice_no": f"TEST-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2025-11-03",
            "amount_inr": 150000,
            "gst_inr": 27000,
            "total_inr": 177000,
            "budget_head_code": "PLAYER_STAY",
            "allocations": [
                {"head_code": "PLAYER_STAY", "head_label": "Accommodation — visiting team (Double Occ)", "amount_inr": 120000},
                {"head_code": "OTHER", "head_label": "Coach honorarium (match-day)", "amount_inr": 57000},
            ],
        }
        r = s.post(f"{API}/tournament-invoices", json=payload)
        assert r.status_code in (200, 201), r.text
        inv = r.json()
        assert inv.get("id")
        # Verify persistence via GET
        got = s.get(f"{API}/tournament-invoices/{inv['id']}").json()
        allocs = got.get("allocations") or []
        assert len(allocs) == 2, f"allocations not persisted: {allocs}"
        total_alloc = sum(a["amount_inr"] for a in allocs)
        assert total_alloc == 177000
        # approve so it feeds tracker/preview
        s.post(f"{API}/tournament-invoices/{inv['id']}/submit")
        s.post(f"{API}/tournament-invoices/{inv['id']}/approve")

    def test_tracker_uses_allocations(self, s, budget_id):
        r = s.get(f"{API}/tournament-budgets/{budget_id}/tracker")
        assert r.status_code == 200
        d = r.json()
        heads = {h["head"]: h for h in d["heads"]}
        # 120k against Accommodation limit 200k → 60%
        acc = heads.get("Accommodation — visiting team (Double Occ)")
        assert acc is not None
        assert acc["spent_inr"] == 120000
        assert acc["utilisation_pct"] == 60.0
        # 57k against Coach honorarium limit 50k → over 7k
        coach = heads.get("Coach honorarium (match-day)")
        assert coach is not None
        assert coach["spent_inr"] == 57000
        assert coach["over_budget_inr"] == 7000

    def test_reimbursement_preview(self, s, tournament_id):
        r = s.get(f"{API}/tournaments/{tournament_id}/reimbursement-preview", params={"body_id": TEST_BODY})
        assert r.status_code == 200
        summary = r.json()["summary"]
        assert summary["invoiced_total_inr"] == 177000
        # eligible = 120000 (acc, within limit) + 50000 (coach, capped) = 170000
        assert summary["eligible_total_inr"] == 170000
        assert summary["over_budget_inr"] == 7000
        # head-wise breakdown
        assert len(summary["heads"]) >= 3


# ═══════════════════ Reimbursement Claim workflow ═══════════════════
class TestClaimWorkflow:
    @pytest.fixture(scope="class")
    def claim_tid(self, s):
        payload = {
            "name": f"TEST_CLAIM_{uuid.uuid4().hex[:6]}",
            "tournament_no": f"TEST-CLM-{uuid.uuid4().hex[:4]}",
            "tournament_type": "MPCA_Championship",
            "format": "One_Day",
            "scope": "Inter_Divisional",
            "fiscal_cycle": CYCLE,
            "host_body_id": TEST_BODY,
            "scheme_code": "2-D",
            "start_date": "2025-12-01",
            "end_date": "2025-12-05",
        }
        r = s.post(f"{API}/tournaments", json=payload)
        assert r.status_code in (200, 201)
        tid = r.json()["id"]
        # Set up a minimal budget so summary has heads
        b_payload = {
            "tournament_id": tid, "body_id": TEST_BODY, "fiscal_cycle": CYCLE,
            "scheme_code": "2-D",
            "head_allocations": [{"head": "Accommodation — visiting team (Double Occ)", "limit_inr": 100000}],
            "total_ceiling_inr": 100000,
        }
        br = s.post(f"{API}/tournament-budgets", json=b_payload)
        b = br.json()
        s.post(f"{API}/tournament-budgets/{b['id']}/approve", json={"actor_role": "secretary", "actor_name": "T"})
        # add a small invoice
        inv = s.post(f"{API}/tournament-invoices", json={
            "tournament_id": tid, "body_id": TEST_BODY, "budget_id": b["id"],
            "vendor_name": "TEST_V", "invoice_no": f"T-{uuid.uuid4().hex[:5]}",
            "invoice_date": "2025-12-02", "amount_inr": 50000, "gst_inr": 9000, "total_inr": 59000,
            "budget_head_code": "PLAYER_STAY",
            "allocations": [{"head_code": "PLAYER_STAY", "head_label": "Accommodation — visiting team (Double Occ)", "amount_inr": 59000}],
        }).json()
        s.post(f"{API}/tournament-invoices/{inv['id']}/submit")
        s.post(f"{API}/tournament-invoices/{inv['id']}/approve")
        yield tid
        s.delete(f"{API}/tournaments/{tid}")

    @pytest.fixture(scope="class")
    def claim_id(self, s, claim_tid):
        payload = {
            "tournament_id": claim_tid,
            "body_id": TEST_BODY,
            "fiscal_cycle": CYCLE,
            "scheme_code": "2-D",
        }
        r = s.post(f"{API}/reimbursement-claims", json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_create_claim(self, s, claim_id):
        r = s.get(f"{API}/reimbursement-claims/{claim_id}")
        assert r.status_code == 200
        c = r.json()
        assert c["status"] == "Draft"
        assert c["claim_ref"].startswith(f"TRC-{CYCLE}-")

    def test_idempotency_duplicate_draft(self, s, claim_tid, claim_id):
        # Second attempt should 409
        r = s.post(f"{API}/reimbursement-claims", json={
            "tournament_id": claim_tid, "body_id": TEST_BODY, "fiscal_cycle": CYCLE, "scheme_code": "2-D",
        })
        assert r.status_code == 409

    def test_submit_claim(self, s, claim_id):
        r = s.post(f"{API}/reimbursement-claims/{claim_id}/submit", json={
            "actor_role": "division-secretary", "actor_name": "TEST Div Sec", "actor_body_id": TEST_BODY,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Submitted"
        assert d.get("summary") is not None
        assert d["summary"]["invoice_count"] >= 1
        assert d.get("submitted_at")

    def test_reject_requires_notes(self, s, claim_id):
        r = s.post(f"{API}/reimbursement-claims/{claim_id}/reject", json={
            "actor_role": "secretary", "actor_name": "TEST Sec", "actor_body_id": "MPCA",
        })
        # 400 (custom "reason required") preferred; 422 acceptable (pydantic validation)
        assert r.status_code in (400, 422), r.text

    def test_add_comment(self, s, claim_id):
        r = s.post(f"{API}/reimbursement-claims/{claim_id}/comment", json={
            "actor_role": "secretary", "actor_name": "TEST Sec", "actor_body_id": "MPCA",
            "comment_text": "Please clarify accommodation vendor",
        })
        assert r.status_code == 200
        d = r.json()
        comments = d.get("comments") or []
        assert any(c.get("text") == "Please clarify accommodation vendor" for c in comments)

    def test_approve_exceeds_eligible_rejected(self, s, claim_id):
        c = s.get(f"{API}/reimbursement-claims/{claim_id}").json()
        eligible = float(c["summary"]["eligible_total_inr"])
        r = s.post(f"{API}/reimbursement-claims/{claim_id}/approve", json={
            "actor_role": "secretary", "actor_name": "TEST Sec", "actor_body_id": "MPCA",
            "approved_amount_inr": eligible + 100000,
        })
        assert r.status_code == 422, r.text

    def test_approve_within_eligible(self, s, claim_id):
        c = s.get(f"{API}/reimbursement-claims/{claim_id}").json()
        eligible = float(c["summary"]["eligible_total_inr"])
        approved = max(0, eligible - 1000)
        r = s.post(f"{API}/reimbursement-claims/{claim_id}/approve", json={
            "actor_role": "secretary", "actor_name": "TEST Sec", "actor_body_id": "MPCA",
            "approved_amount_inr": approved,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Approved"
        assert d["approved_amount_inr"] == approved

    def test_cannot_re_approve(self, s, claim_id):
        r = s.post(f"{API}/reimbursement-claims/{claim_id}/approve", json={
            "actor_role": "secretary", "actor_name": "TEST", "actor_body_id": "MPCA", "approved_amount_inr": 100,
        })
        assert r.status_code == 409


class TestClaimStats:
    def test_stats_summary(self, s):
        r = s.get(f"{API}/reimbursement-claims-stats/summary")
        assert r.status_code == 200
        d = r.json()
        assert "total_claims" in d
        assert "approved" in d
        assert "eligible_total_inr" in d
        assert "approved_total_inr" in d
        assert d["approved"] >= 1  # seed + our test claim


# ═══════════════════ Reject flow (separate claim) ═══════════════════
class TestClaimReject:
    def test_reject_full_flow(self, s):
        # Create a tournament + claim, submit and reject
        payload = {
            "name": f"TEST_REJ_{uuid.uuid4().hex[:6]}",
            "tournament_no": f"TEST-REJ-{uuid.uuid4().hex[:4]}",
            "tournament_type": "MPCA_Championship",
            "format": "One_Day",
            "scope": "Inter_Divisional",
            "fiscal_cycle": CYCLE,
            "host_body_id": TEST_BODY,
            "scheme_code": "2-D",
            "start_date": "2025-12-10",
            "end_date": "2025-12-15",
        }
        t = s.post(f"{API}/tournaments", json=payload).json()
        tid = t["id"]
        try:
            claim = s.post(f"{API}/reimbursement-claims", json={
                "tournament_id": tid, "body_id": TEST_BODY, "fiscal_cycle": CYCLE, "scheme_code": "2-D",
            }).json()
            cid = claim["id"]
            s.post(f"{API}/reimbursement-claims/{cid}/submit", json={
                "actor_role": "division-secretary", "actor_name": "T", "actor_body_id": TEST_BODY,
            })
            r = s.post(f"{API}/reimbursement-claims/{cid}/reject", json={
                "actor_role": "secretary", "actor_name": "TEST Sec", "actor_body_id": "MPCA",
                "notes": "Insufficient documentation",
            })
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "Rejected"
            assert d["rejection_reason"] == "Insufficient documentation"
        finally:
            s.delete(f"{API}/tournaments/{tid}")
