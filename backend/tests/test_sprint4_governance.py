"""Sprint 4 · Governance & Compliance backend tests.

Coverage:
  - DMS: list / summary / expiring / create / archive / KYC sync idempotency
  - Compliance: list / dashboard / next-due maths / file / duplicate period / create
  - Audit Pack: preview + PDF generation
  - Regression: Sprint 1/2/3 endpoints still return 200
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ══════════════════ DMS ══════════════════

class TestDMS:
    def test_list_documents_seeded(self, api):
        r = api.get(f"{BASE_URL}/api/documents")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        assert len(docs) >= 16, f"expected >=16 seeded docs, got {len(docs)}"
        d0 = docs[0]
        for k in ("folder", "doc_type", "url", "uploaded_at", "filename", "id", "doc_no"):
            assert k in d0, f"missing key {k} in document"

    def test_dms_summary(self, api):
        r = api.get(f"{BASE_URL}/api/dms-stats/summary")
        assert r.status_code == 200
        s = r.json()
        assert s["total"] >= 16
        assert isinstance(s["by_folder"], dict)
        # 7+ folders expected (Legal/Statutory/Financial/HR/Contracts/Board/Vendor_KYC)
        assert len(s["by_folder"]) >= 6
        assert s["by_status"]["Active"] >= 14
        assert s["by_status"]["Expired"] >= 1
        assert s["expiring_30d"] >= 1

    def test_documents_expiring(self, api):
        r = api.get(f"{BASE_URL}/api/documents-expiring?days=60")
        assert r.status_code == 200
        d = r.json()
        assert "expired" in d and "expiring" in d
        assert d["expired_count"] >= 1
        expired_names = [x["filename"] for x in d["expired"]]
        assert any("Insurance_Policy" in n for n in expired_names), \
            f"expected Insurance_Policy_* in expired[], got {expired_names}"
        # days_left negative for expired
        for x in d["expired"]:
            assert x["days_left"] < 0
        # expiring set should include BCCI Affiliation + GST Registration
        expiring_names = [x["filename"] for x in d["expiring"]]
        assert any("BCCI_Affiliation" in n for n in expiring_names), expiring_names
        assert any("GST_Registration" in n for n in expiring_names), expiring_names
        for x in d["expiring"]:
            assert x["days_left"] >= 0

    def test_create_document_auto_docno(self, api):
        payload = {
            "folder": "Statutory",
            "filename": "TEST_SPRINT4_Doc.pdf",
            "url": "https://example.com/test.pdf",
            "doc_type": "Test Document",
            "tags": ["test", "sprint4"],
            "uploaded_by": "PyTest",
        }
        r = api.post(f"{BASE_URL}/api/documents", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["filename"] == payload["filename"]
        assert d["folder"] == "Statutory"
        assert re.match(r"^DOC-\d{4}-\d{5}$", d["doc_no"]), f"bad doc_no: {d['doc_no']}"
        assert d["status"] == "Active"
        # GET verification
        g = api.get(f"{BASE_URL}/api/documents/{d['id']}")
        assert g.status_code == 200
        assert g.json()["filename"] == payload["filename"]

    def test_create_document_missing_fields_422(self, api):
        r = api.post(f"{BASE_URL}/api/documents", json={"folder": "Other"})
        assert r.status_code == 422, r.text

    def test_archive_document(self, api):
        # create then archive
        r = api.post(f"{BASE_URL}/api/documents", json={
            "folder": "Other",
            "filename": "TEST_SPRINT4_Archive.pdf",
            "url": "https://example.com/a.pdf",
            "doc_type": "Archive Test",
        })
        did = r.json()["id"]
        a = api.post(f"{BASE_URL}/api/documents/{did}/archive")
        assert a.status_code == 200
        assert a.json()["status"] == "Archived"

    def test_kyc_sync_idempotent(self, api):
        r1 = api.post(f"{BASE_URL}/api/dms/sync-from-kyc")
        assert r1.status_code == 200
        n1 = r1.json()["inserted"]
        r2 = api.post(f"{BASE_URL}/api/dms/sync-from-kyc")
        assert r2.status_code == 200
        assert r2.json()["inserted"] == 0, \
            f"idempotent sync should insert 0 on 2nd call, got {r2.json()['inserted']}"


# ══════════════════ COMPLIANCE ══════════════════

class TestCompliance:
    def test_list_compliance_seeded(self, api):
        r = api.get(f"{BASE_URL}/api/compliance")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 10, f"expected >=10, got {len(items)}"
        names = " · ".join(x["name"] for x in items)
        for keyword in ["GSTR-3B", "GSTR-1", "24Q", "26Q", "PF", "ESI", "ITR-7", "Registrar"]:
            assert keyword in names, f"missing '{keyword}' in {names}"

    def test_compliance_dashboard(self, api):
        r = api.get(f"{BASE_URL}/api/compliance/dashboard")
        assert r.status_code == 200
        d = r.json()
        counts = d["counts"]
        for k in ("Overdue", "Due_Soon", "Upcoming", "Filed"):
            assert k in counts
        assert counts["Overdue"] >= 4, f"expected significant overdue, got {counts}"
        # Rows enriched
        for row in d["rows"]:
            for k in ("id", "name", "authority", "frequency", "status_label"):
                assert k in row
            if row.get("next_due_date"):
                assert row.get("days_left") is not None

    def test_dashboard_esi_is_overdue(self, api):
        r = api.get(f"{BASE_URL}/api/compliance/dashboard")
        rows = {row["name"]: row for row in r.json()["rows"]}
        esi = next((v for k, v in rows.items() if "ESI" in k), None)
        assert esi is not None, "ESI row missing"
        assert esi["status_label"] == "Overdue", f"ESI expected Overdue, got {esi}"
        assert esi["days_left"] < 0

    def test_next_due_maths_monthly(self, api):
        # GSTR-3B is Monthly · due_day=20 typically. verify next_due format is YYYY-MM-DD
        r = api.get(f"{BASE_URL}/api/compliance/dashboard")
        rows = {row["name"]: row for row in r.json()["rows"]}
        gstr = next((v for k, v in rows.items() if "GSTR-3B" in k), None)
        assert gstr is not None
        assert re.match(r"^\d{4}-\d{2}-\d{2}$", gstr["next_due_date"])
        assert gstr["frequency"] == "Monthly"

    def test_file_compliance_and_duplicate_rejected(self, api):
        r = api.get(f"{BASE_URL}/api/compliance")
        items = r.json()
        # pick an item without matching test-period filed
        target = next((x for x in items if x["frequency"] == "Monthly"), None)
        assert target
        period = "TEST_SPRINT4_2026-01"
        payload = {"period": period, "filed_by": "PyTest", "ack_ref": "TEST-ACK-001"}
        f1 = api.post(f"{BASE_URL}/api/compliance/{target['id']}/file", json=payload)
        assert f1.status_code == 200, f1.text
        # verify appended
        history = f1.json()["filed_history"]
        assert any(fr["period"] == period for fr in history)
        # duplicate should 400
        f2 = api.post(f"{BASE_URL}/api/compliance/{target['id']}/file", json=payload)
        assert f2.status_code == 400, f"expected 400 on duplicate, got {f2.status_code} {f2.text}"

    def test_create_compliance(self, api):
        payload = {
            "name": "TEST_SPRINT4 Custom Compliance",
            "authority": "TEST Authority",
            "frequency": "Yearly",
            "due_day": 30,
            "due_month": 9,
            "section_ref": "TEST-SEC",
        }
        r = api.post(f"{BASE_URL}/api/compliance", json=payload)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["name"] == payload["name"]
        assert c["frequency"] == "Yearly"


# ══════════════════ AUDIT PACK ══════════════════

class TestAuditPack:
    def test_preview(self, api):
        r = api.get(f"{BASE_URL}/api/audit-pack/preview")
        assert r.status_code == 200
        p = r.json()
        assert p["fiscal_cycle"]
        assert "counts" in p
        for k in ("vouchers", "assets", "compliance_items", "active_pos", "payroll_registers"):
            assert k in p["counts"]
        assert p["estimated_pages"] >= 3

    def test_pdf_generation(self, api):
        r = api.get(f"{BASE_URL}/api/audit-pack/generate.pdf")
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        content = r.content
        assert content.startswith(b"%PDF"), f"bad header: {content[:8]}"
        assert len(content) > 3000, f"PDF too small: {len(content)}"
        # Check for MPCA branding in PDF stream (may be encoded, but title metadata should be there)
        assert b"MPCA" in content or b"Madhya Pradesh" in content, \
            "expected MPCA branding text in PDF"


# ══════════════════ REGRESSION ══════════════════

class TestRegression:
    @pytest.mark.parametrize("path", [
        "/api/division-grants",
        "/api/vouchers",
        "/api/ledger?body_id=MPCA&fiscal_cycle=2026-27",
        "/api/finance/budget-vs-actual",
        "/api/purchase-orders",
        "/api/vendors-kyc/summary",
        "/api/assets",
        "/api/employees",
        "/api/payroll/registers",
        "/api/shared/audit-log",
    ])
    def test_regression_endpoint_200(self, api, path):
        r = api.get(f"{BASE_URL}{path}")
        assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"
