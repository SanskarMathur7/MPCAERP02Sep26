"""MPCA Phase 5 · MPCA-112 backend tests.

MPCA-112 — POST /api/grant-claims/{cid}/reject now accepts claims in status
Approved (post-approval audit). Regression: rejecting from Draft still fails
with 409 (only Submitted / Under_Review / Approved allowed).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Scheme with 0 required_documents so submit works without uploads
SCHEME_CODE = "2-C"       # Inter-Divisional Tournament — Travel, eligible=All
BODY_ID = "DIV-IND"
FISCAL_CYCLE = "2025-26"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _cleanup_active(session):
    """Ensure no active claim exists on the target scheme/body/cycle."""
    r = session.get(f"{API}/grant-claims", params={"scheme_code": SCHEME_CODE, "body_id": BODY_ID})
    if r.status_code != 200:
        return
    for c in r.json():
        if c.get("fiscal_cycle") != FISCAL_CYCLE:
            continue
        if c.get("status") in ("Draft", "Documents_Pending", "Submitted", "Under_Review", "Approved"):
            # Attempt to force-reject then leave; but Draft cannot be rejected.
            # For test isolation, we just try submitting + rejecting if possible.
            cid = c["id"]
            if c["status"] in ("Draft", "Documents_Pending"):
                session.post(f"{API}/grant-claims/{cid}/submit", params={"actor_name": "TEST_cleanup"})
            session.post(f"{API}/grant-claims/{cid}/reject", params={"actor_name": "TEST_cleanup", "reason": "cleanup"})


def _create_claim(session):
    _cleanup_active(session)
    r = session.post(f"{API}/grant-claims", json={
        "scheme_code": SCHEME_CODE, "body_id": BODY_ID,
        "fiscal_cycle": FISCAL_CYCLE, "claimed_amount_inr": 25000.0,
        "notes": "TEST_MPCA112 post-approval reject",
    })
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    return r.json()


class TestMPCA112PostApprovalReject:

    def test_reject_from_draft_returns_409(self, session):
        """Regression: Draft cannot be rejected."""
        claim = _create_claim(session)
        cid = claim["id"]
        assert claim["status"] in ("Draft", "Documents_Pending"), claim["status"]
        # 2-C has 0 required docs → status "Draft"
        r = session.post(f"{API}/grant-claims/{cid}/reject",
                         params={"actor_name": "TEST_MPCA", "reason": "should fail"})
        assert r.status_code == 409, f"expected 409 from Draft reject, got {r.status_code} {r.text}"
        # cleanup: submit then reject
        s = session.post(f"{API}/grant-claims/{cid}/submit", params={"actor_name": "TEST_div"})
        assert s.status_code == 200, s.text
        session.post(f"{API}/grant-claims/{cid}/reject", params={"actor_name": "TEST_MPCA", "reason": "cleanup"})

    def test_reject_from_approved_succeeds(self, session):
        """MPCA-112 · reject from Approved sets status=Rejected + reason."""
        claim = _create_claim(session)
        cid = claim["id"]
        # submit
        r = session.post(f"{API}/grant-claims/{cid}/submit", params={"actor_name": "TEST_div"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Submitted"
        # approve
        r = session.post(f"{API}/grant-claims/{cid}/approve",
                         params={"actor_name": "TEST_MPCA", "approved_amount_inr": 20000, "notes": "ok"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Approved"
        # POST-APPROVAL reject — the ticket under test
        reason = "Audit finding: duplicated invoice detected"
        r = session.post(f"{API}/grant-claims/{cid}/reject",
                         params={"actor_name": "TEST_MPCA_auditor", "reason": reason})
        assert r.status_code == 200, f"post-approval reject failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["status"] == "Rejected"
        assert data.get("rejection_reason") == reason
        assert data.get("reviewed_by") == "TEST_MPCA_auditor"

        # GET to verify persistence
        g = session.get(f"{API}/grant-claims/{cid}")
        assert g.status_code == 200
        got = g.json()
        assert got["status"] == "Rejected"
        assert got["rejection_reason"] == reason

    def test_reject_requires_reason(self, session):
        """Reason is mandatory."""
        claim = _create_claim(session)
        cid = claim["id"]
        session.post(f"{API}/grant-claims/{cid}/submit", params={"actor_name": "TEST_div"})
        # Try reject without reason
        r = session.post(f"{API}/grant-claims/{cid}/reject",
                         params={"actor_name": "TEST_MPCA", "reason": ""})
        # FastAPI treats empty string as passing the required query param, but
        # our route checks `if not reason` → 400.
        assert r.status_code in (400, 422), f"expected 400/422 for empty reason, got {r.status_code} {r.text}"
        # cleanup
        session.post(f"{API}/grant-claims/{cid}/reject", params={"actor_name": "TEST_MPCA", "reason": "cleanup"})
