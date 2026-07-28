"""M39m Sprint · Backend tests for:
1. Tournament activity log via record_id OR details.tournament_id
2. Signed-PDF gate on reimbursement claim submit
4. default_scheme_inputs on tournament PATCH/GET
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def tournament(s):
    """Create a test tournament in an activated cycle (2025-26)."""
    payload = {
        "name": "TEST_M39M Activity Tournament",
        "format": "One_Day",
        "scope": "Inter_Divisional",
        "host_body_id": "DIV-IND",
        "start_date": "2025-11-15",
        "end_date": "2025-11-18",
        "fiscal_cycle": "2025-26",
        "created_by_body_code": "MPCA",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    assert r.status_code == 200, f"tournament create failed: {r.status_code} {r.text}"
    return r.json()


class TestActivityLog:
    """Item 1 · Audit log entries via log_activity + get_audit_trail widened match."""

    def test_create_writes_audit_row(self, s, tournament):
        tid = tournament["id"]
        r = s.get(f"{API}/shared/audit-log", params={"record_id": tid, "limit": 50})
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1, f"expected ≥1 audit row, got {rows}"
        matches = [
            row for row in rows
            if row.get("module") == "tournament"
            and row.get("action") == "Created"
            and (row.get("details") or {}).get("tournament_id") == tid
        ]
        assert matches, f"No Created row with details.tournament_id={tid}. Rows={rows}"

    def test_participant_accept_writes_audit_row(self, s, tournament):
        tid = tournament["id"]
        # Insert a participation directly via Mongo (there's no public POST — rows
        # are usually synced from tournament_workspace pools).
        import pymongo, os as _os, uuid as _uuid
        from datetime import datetime, timezone
        _cli = pymongo.MongoClient(_os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        _db = _cli[_os.environ.get("DB_NAME", "test_database")]
        body_code = "DIV-GWL"
        _db.tournament_participations.update_one(
            {"tournament_id": tid, "body_code": body_code},
            {"$set": {
                "id": str(_uuid.uuid4()),
                "tournament_id": tid,
                "body_code": body_code,
                "body_type": "Division",
                "body_name": "Gwalior Division",
                "role": "Visitor",
                "removed_at": None,
                "acceptance_status": "Pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )

        # Flip acceptance_status → Accepted
        r2 = s.patch(
            f"{API}/tournaments/{tid}/participants/{body_code}",
            json={"acceptance_status": "Accepted", "acceptance_by_name": "TEST Gwalior Secretary"},
        )
        assert r2.status_code == 200, f"participant PATCH failed: {r2.status_code} {r2.text}"

        # Verify audit log now shows a participation·Accepted row
        r3 = s.get(f"{API}/shared/audit-log", params={"record_id": tid, "limit": 50})
        assert r3.status_code == 200
        rows = r3.json()
        matches = [
            row for row in rows
            if row.get("module") == "participation"
            and "Accepted" in (row.get("action") or "")
            and (row.get("details") or {}).get("tournament_id") == tid
        ]
        assert matches, f"No participation·Accepted row for tid={tid}. Rows={rows}"


class TestDefaultSchemeInputs:
    """Item 4 · default_scheme_inputs persists on tournament."""

    def test_patch_and_get_default_scheme_inputs(self, s, tournament):
        tid = tournament["id"]
        payload = {"default_scheme_inputs": {"days": 4, "matches": 6}}
        r = s.patch(f"{API}/tournaments/{tid}", json=payload)
        assert r.status_code == 200, f"PATCH failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("default_scheme_inputs") == {"days": 4, "matches": 6}, \
            f"Echo mismatch: {data.get('default_scheme_inputs')}"

        # GET to verify persistence
        r2 = s.get(f"{API}/tournaments/{tid}")
        assert r2.status_code == 200
        assert r2.json().get("default_scheme_inputs") == {"days": 4, "matches": 6}


class TestSignedPdfGate:
    """Item 2 · Signed-PDF gate on reimbursement claim submit (HTTP 412)."""

    @pytest.fixture(scope="class")
    def claim(self, s, tournament):
        tid = tournament["id"]
        payload = {
            "tournament_id": tid,
            "body_id": "DIV-IND",
            "fiscal_cycle": "2025-26",
            "scheme_code": tournament.get("scheme_code") or "2-D",
        }
        r = s.post(f"{API}/reimbursement-claims", json=payload)
        assert r.status_code == 200, f"claim create failed: {r.status_code} {r.text}"
        return r.json()

    def test_submit_without_signed_pdf_returns_412(self, s, claim):
        cid = claim["id"]
        r = s.post(
            f"{API}/reimbursement-claims/{cid}/submit",
            json={
                "actor_name": "TEST Devashish",
                "actor_role": "division-secretary",
                "actor_body_id": "DIV-IND",
            },
        )
        assert r.status_code == 412, f"expected 412 without signed PDF, got {r.status_code} {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "sign" in detail, f"Detail should mention signed: {detail}"

    def test_upload_signed_pdf_and_then_submit(self, s, claim):
        cid = claim["id"]
        # Upload signed PDF
        r = s.post(
            f"{API}/reimbursement-claims/{cid}/signed-pdf",
            json={"signed_pdf_url": "/api/uploads/fake.pdf", "uploaded_by": "TEST Devashish"},
        )
        assert r.status_code == 200, f"signed-pdf upload failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("signed_pdf_url") == "/api/uploads/fake.pdf"

        # Now submit
        r2 = s.post(
            f"{API}/reimbursement-claims/{cid}/submit",
            json={
                "actor_name": "TEST Devashish",
                "actor_role": "division-secretary",
                "actor_body_id": "DIV-IND",
            },
        )
        assert r2.status_code == 200, f"submit failed after signed upload: {r2.status_code} {r2.text}"
        assert r2.json().get("status") == "Submitted"


class TestAuditLogHasMultipleEntries:
    """M39m · After Create + Accept + (optional) Budget submit, audit log should have ≥2 rows."""

    def test_at_least_two_audit_rows(self, s, tournament):
        tid = tournament["id"]
        r = s.get(f"{API}/shared/audit-log", params={"record_id": tid, "limit": 50})
        assert r.status_code == 200
        rows = r.json()
        # After Create + Participant Accept, should be ≥2
        assert len(rows) >= 2, f"Expected ≥2 audit rows after fixtures, got {len(rows)}: {rows}"


# ═══════════════════ Teardown ═══════════════════

@pytest.fixture(scope="module", autouse=True)
def cleanup(s, request):
    yield
    # Best-effort teardown: delete any TEST_M39M tournaments and their child records.
    try:
        r = s.get(f"{API}/tournaments", params={"limit": 500})
        for t in r.json() if r.status_code == 200 else []:
            if str(t.get("name", "")).startswith("TEST_M39M"):
                tid = t["id"]
                # delete claims first
                cs = s.get(f"{API}/reimbursement-claims", params={"tournament_id": tid, "limit": 100})
                if cs.status_code == 200:
                    for c in cs.json():
                        if c.get("status") == "Draft":
                            s.delete(f"{API}/reimbursement-claims/{c['id']}")
                # (tournament deletion — endpoint may not exist; ignore)
    except Exception:
        pass
