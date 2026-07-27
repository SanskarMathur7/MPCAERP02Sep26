"""M33 · Body Data Warehouse — backend tests

Covers RBAC on GET/POST/PATCH/DELETE + kinds summary + uploads pipeline.
"""
import io
import os
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

DIV_IND = "DIV-IND"
DIV_BPL = "DIV-BPL"
DIST_INDO = "DIST-INDO-IND"  # child under DIV-IND per credentials


def _h(body_code=None, role_id=None):
    h = {"Content-Type": "application/json"}
    if body_code:
        h["X-User-Body-Code"] = body_code
    if role_id:
        h["X-Role-Id"] = role_id
    return h


@pytest.fixture(scope="module")
def created_doc_ids():
    ids = []
    yield ids
    # hard cleanup TEST_ docs
    for bcode, did in ids:
        try:
            requests.delete(f"{BASE}/bodies/{bcode}/documents/{did}?hard=true", headers=_h(bcode), timeout=10)
        except Exception:
            pass


# ─── RBAC on GET ───────────────────────────────────────────────
class TestGetRBAC:
    def test_owner_can_read(self):
        r = requests.get(f"{BASE}/bodies/{DIV_IND}/documents", headers=_h(DIV_IND), timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_mpca_can_read(self):
        r = requests.get(f"{BASE}/bodies/{DIV_IND}/documents", headers=_h("MPCA", "secretary"), timeout=15)
        assert r.status_code == 200, r.text

    def test_parent_division_can_read_district(self):
        # Confirm parent chain
        b = requests.get(f"{BASE}/bodies").json()
        codes = {x["code"]: x.get("parent_code") for x in b if isinstance(x, dict)}
        # Pick a district child of DIV-IND
        child = next((c for c, p in codes.items() if p == DIV_IND), None)
        if not child:
            pytest.skip("No child body under DIV-IND to test parent read")
        r = requests.get(f"{BASE}/bodies/{child}/documents", headers=_h(DIV_IND), timeout=15)
        assert r.status_code == 200, f"Division should read child {child}: {r.text}"

    def test_unrelated_body_forbidden(self):
        r = requests.get(f"{BASE}/bodies/{DIV_IND}/documents", headers=_h(DIV_BPL), timeout=15)
        assert r.status_code == 403, r.text


# ─── POST / PATCH / DELETE ─────────────────────────────────────
class TestWriteFlow:
    def test_create_as_owner(self, created_doc_ids):
        payload = {
            "doc_kind": "GST_Certificate",
            "label": "TEST_M33_GST",
            "doc_no": "23AAACM1234A1Z9",
            "metadata": {"GSTIN": "23AAACM1234A1Z9"},
        }
        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json=payload, headers=_h(DIV_IND), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"]
        assert data["doc_kind"] == "GST_Certificate"
        assert data["label"] == "TEST_M33_GST"
        assert isinstance(data["metadata"], dict)
        created_doc_ids.append((DIV_IND, data["id"]))

    def test_create_forbidden_for_other_body(self):
        payload = {"doc_kind": "PAN_Card", "label": "TEST_M33_bad"}
        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json=payload, headers=_h(DIV_BPL), timeout=15)
        assert r.status_code == 403, r.text

    def test_patch_updates_and_stamps(self, created_doc_ids):
        # create first
        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json={"doc_kind": "PAN_Card", "label": "TEST_M33_PAN"}, headers=_h(DIV_IND), timeout=15)
        assert r.status_code == 200
        d = r.json()
        created_doc_ids.append((DIV_IND, d["id"]))
        old_updated = d["updated_at"]

        p = requests.patch(f"{BASE}/bodies/{DIV_IND}/documents/{d['id']}", json={"label": "TEST_M33_PAN_v2"}, headers=_h(DIV_IND), timeout=15)
        assert p.status_code == 200, p.text
        assert p.json()["label"] == "TEST_M33_PAN_v2"
        assert p.json()["updated_at"] != old_updated

        # Verify persistence via GET
        g = requests.get(f"{BASE}/bodies/{DIV_IND}/documents", headers=_h(DIV_IND), timeout=15)
        assert any(x["id"] == d["id"] and x["label"] == "TEST_M33_PAN_v2" for x in g.json())

    def test_patch_forbidden_other_body(self, created_doc_ids):
        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json={"doc_kind": "Other", "label": "TEST_M33_forbid"}, headers=_h(DIV_IND), timeout=15)
        d = r.json()
        created_doc_ids.append((DIV_IND, d["id"]))
        p = requests.patch(f"{BASE}/bodies/{DIV_IND}/documents/{d['id']}", json={"label": "hack"}, headers=_h(DIV_BPL), timeout=15)
        assert p.status_code == 403

    def test_patch_empty_400(self, created_doc_ids):
        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json={"doc_kind": "Other", "label": "TEST_M33_empty"}, headers=_h(DIV_IND), timeout=15)
        d = r.json()
        created_doc_ids.append((DIV_IND, d["id"]))
        p = requests.patch(f"{BASE}/bodies/{DIV_IND}/documents/{d['id']}", json={}, headers=_h(DIV_IND), timeout=15)
        assert p.status_code == 400

    def test_soft_delete_and_hard_delete(self, created_doc_ids):
        # Create a doc
        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json={"doc_kind": "Other", "label": "TEST_M33_softdel"}, headers=_h(DIV_IND), timeout=15)
        d = r.json()
        did = d["id"]

        # Soft delete
        s = requests.delete(f"{BASE}/bodies/{DIV_IND}/documents/{did}", headers=_h(DIV_IND), timeout=15)
        assert s.status_code == 200
        assert s.json().get("hard") is False

        # Not in active list
        act = requests.get(f"{BASE}/bodies/{DIV_IND}/documents", headers=_h(DIV_IND), timeout=15).json()
        assert not any(x["id"] == did for x in act)

        # In include_inactive
        inact = requests.get(f"{BASE}/bodies/{DIV_IND}/documents?include_inactive=true", headers=_h(DIV_IND), timeout=15).json()
        assert any(x["id"] == did and x["is_active"] is False for x in inact)

        # Hard delete
        h = requests.delete(f"{BASE}/bodies/{DIV_IND}/documents/{did}?hard=true", headers=_h(DIV_IND), timeout=15)
        assert h.status_code == 200
        assert h.json().get("hard") is True

    def test_delete_forbidden_other_body(self, created_doc_ids):
        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json={"doc_kind": "Other", "label": "TEST_M33_dfor"}, headers=_h(DIV_IND), timeout=15)
        d = r.json()
        created_doc_ids.append((DIV_IND, d["id"]))
        x = requests.delete(f"{BASE}/bodies/{DIV_IND}/documents/{d['id']}", headers=_h(DIV_BPL), timeout=15)
        assert x.status_code == 403


# ─── Kinds summary ─────────────────────────────────────────────
class TestKindsSummary:
    def test_essentials_grow(self, created_doc_ids):
        # baseline
        s0 = requests.get(f"{BASE}/bodies/{DIV_IND}/documents/kinds/summary", headers=_h(DIV_IND), timeout=15).json()
        assert s0["essential_total"] == 4
        base = s0["essential_filled"]

        # Ensure at least one of each essential kind exists
        for k in ["GST_Certificate", "PAN_Card", "Bank_Account", "Constitution_Bye_Laws"]:
            if s0["counts"].get(k, 0) == 0:
                r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json={"doc_kind": k, "label": f"TEST_M33_ess_{k}"}, headers=_h(DIV_IND), timeout=15)
                assert r.status_code == 200
                created_doc_ids.append((DIV_IND, r.json()["id"]))

        s1 = requests.get(f"{BASE}/bodies/{DIV_IND}/documents/kinds/summary", headers=_h(DIV_IND), timeout=15).json()
        assert s1["essential_filled"] == 4
        assert s1["essential_missing"] == []
        assert s1["essential_filled"] >= base


# ─── Uploads pipeline integration ──────────────────────────────
class TestUploadIntegration:
    def test_upload_then_attach(self, created_doc_ids):
        pdf_bytes = b"%PDF-1.4\n%%EOF\n"
        files = {"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        data = {"body_id": DIV_IND, "related_type": "body_document", "uploaded_by": "pytest"}
        u = requests.post(f"{BASE}/uploads", files=files, data=data, timeout=30)
        assert u.status_code in (200, 201), u.text
        up = u.json()
        file_url = up.get("url") or up.get("file_url")
        assert file_url

        r = requests.post(f"{BASE}/bodies/{DIV_IND}/documents", json={
            "doc_kind": "GST_Certificate", "label": "TEST_M33_upload_pdf",
            "file_url": file_url, "file_name": up.get("original_name") or "test.pdf",
            "size_bytes": up.get("size_bytes"), "mime_type": up.get("mime_type"),
        }, headers=_h(DIV_IND), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["file_url"] == file_url
        created_doc_ids.append((DIV_IND, d["id"]))
