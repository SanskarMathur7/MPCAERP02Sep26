"""M6 · Membership Register Upgrade — backend regression suite.

Covers:
- Dynamic member-categories CRUD + RBAC
- Bulk CSV upload (dry-run + real, aliases, skip rules)
- Bulk-upload template endpoint
- /members/stats aggregation
- PATCH/DELETE /members with X-Role-Id / X-User-Email RBAC
- List filters (member_type / division_body_id)
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

OFFICE_BEARER_HEADERS = {"X-Role-Id": "secretary", "X-User-Email": "secretary@mpca.test"}
DISTRICT_HEADERS = {"X-Role-Id": "district-secretary", "X-User-Email": "district@mpca.test"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------------- member-categories ----------------
class TestMemberCategories:
    def test_list_seeded_categories(self, s):
        r = s.get(f"{API}/member-categories")
        assert r.status_code == 200
        data = r.json()
        names = {c["name"] for c in data}
        expected = {
            "Life Member", "Annual Member", "Office Bearer",
            "District Association", "School / Institution",
            "Honorary Member", "Patron",
        }
        missing = expected - names
        assert not missing, f"Seeded categories missing: {missing}"
        assert len(data) >= 7

    def test_create_category_as_secretary(self, s):
        uniq = f"TEST_CAT_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": uniq, "code": "TC1",
            "description": "e2e test category",
            "applies_to": "Both", "base_category": "Individual",
            "display_order": 999, "active": True,
        }
        r = s.post(f"{API}/member-categories", json=payload, headers=OFFICE_BEARER_HEADERS)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == uniq
        assert body["code"] == "TC1"
        # cleanup
        s.delete(f"{API}/member-categories/{body['id']}", headers=OFFICE_BEARER_HEADERS)

    def test_create_duplicate_rejected(self, s):
        payload = {"name": "Life Member", "code": "LM2",
                   "applies_to": "Both", "base_category": "Individual"}
        r = s.post(f"{API}/member-categories", json=payload, headers=OFFICE_BEARER_HEADERS)
        assert r.status_code == 400
        assert "already exists" in r.text.lower()

    def test_create_rbac_blocks_non_bearer(self, s):
        payload = {"name": f"TEST_BLOCK_{uuid.uuid4().hex[:6]}", "code": "TB",
                   "applies_to": "Both", "base_category": "Individual"}
        r = s.post(f"{API}/member-categories", json=payload, headers=DISTRICT_HEADERS)
        assert r.status_code == 403

    def test_patch_and_delete_flow(self, s):
        uniq = f"TEST_UPD_{uuid.uuid4().hex[:6]}"
        create = s.post(f"{API}/member-categories",
                        json={"name": uniq, "code": "TU", "applies_to": "Both", "base_category": "Individual"},
                        headers=OFFICE_BEARER_HEADERS)
        assert create.status_code == 200
        cid = create.json()["id"]

        # patch with non-bearer → 403
        r_bad = s.patch(f"{API}/member-categories/{cid}",
                        json={"name": uniq + "_x", "code": "TU", "applies_to": "Both", "base_category": "Individual"},
                        headers=DISTRICT_HEADERS)
        assert r_bad.status_code == 403

        # patch as secretary → 200
        r_ok = s.patch(f"{API}/member-categories/{cid}",
                       json={"name": uniq + "_ok", "code": "TU", "applies_to": "MPCA", "base_category": "Individual"},
                       headers=OFFICE_BEARER_HEADERS)
        assert r_ok.status_code == 200, r_ok.text
        assert r_ok.json()["name"] == uniq + "_ok"

        # delete non-bearer → 403
        r_del_bad = s.delete(f"{API}/member-categories/{cid}", headers=DISTRICT_HEADERS)
        assert r_del_bad.status_code == 403

        # delete bearer → 200
        r_del = s.delete(f"{API}/member-categories/{cid}", headers=OFFICE_BEARER_HEADERS)
        assert r_del.status_code == 200
        assert r_del.json().get("deleted") is True


# ---------------- Bulk upload ----------------
class TestBulkUpload:
    def _csv_bytes(self, rows_csv):
        return ("name,category,member_type,division_body_id,role,membership_id,address,email,phone,member_category,joined\n"
                + rows_csv).encode()

    def test_template_endpoint(self, s):
        r = s.get(f"{API}/members/bulk-upload/template")
        assert r.status_code == 200
        body = r.json()
        assert "headers" in body and isinstance(body["headers"], list) and len(body["headers"]) > 5
        assert "content" in body and body["content"].startswith("name,")
        assert body["filename"].endswith(".csv")

    def test_dry_run_inserts_nothing(self, s):
        pre = s.get(f"{API}/members").json()
        pre_count = len(pre)

        marker = uuid.uuid4().hex[:8]
        csv = (f"TEST_DRY_{marker},Individual,MPCA,,President,MID-{marker},Indore,ok@x.io,9999,,\n")
        files = {"file": (f"dry_{marker}.csv", io.BytesIO(self._csv_bytes(csv)), "text/csv")}
        r = s.post(f"{API}/members/bulk-upload",
                   files=files, data={"dry_run": "true"},
                   headers=OFFICE_BEARER_HEADERS)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["inserted"] == 0
        # dry-run report notes rows that would be inserted
        assert any("dry_run" in (e.get("reason") or "").lower() for e in body["errors"])
        post_count = len(s.get(f"{API}/members").json())
        assert post_count == pre_count, "Dry run must not persist rows"

    def test_real_upload_with_aliases_and_skips(self, s):
        pre_count = len(s.get(f"{API}/members").json())
        marker = uuid.uuid4().hex[:8]
        # Row 1: valid (uses aliases: mobile→phone, designation→role, joined→date, member_category→sub_category)
        # Row 2: missing name (must skip)
        # Row 3: Division without division_body_id (must skip)
        csv_text = (
            "full_name,category,membership_type,division,designation,member_id,address,email,mobile,member_category,joined\n"
            f"TEST_UP_{marker},Individual,MPCA,,Founder,MID-{marker},Bhopal,up{marker}@x.io,9111100000,Life Member,2021-01-15\n"
            f",Individual,MPCA,,,MID-BAD,Nowhere,bad@x.io,9000000000,,\n"
            f"TEST_DIVX_{marker},Individual,Division,,Coach,MID-DX,Indore,dx@x.io,9000011111,,\n"
        )
        files = {"file": (f"real_{marker}.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = s.post(f"{API}/members/bulk-upload",
                   files=files, data={"dry_run": "false"},
                   headers=OFFICE_BEARER_HEADERS)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["inserted"] == 1, body
        assert body["skipped"] == 2, body
        reasons = [e["reason"].lower() for e in body["errors"]]
        assert any("missing" in x and "name" in x for x in reasons), reasons
        assert any("division" in x for x in reasons), reasons

        post_members = s.get(f"{API}/members").json()
        assert len(post_members) == pre_count + 1

        # Verify alias mapping worked on the inserted member
        inserted = [m for m in post_members if m.get("name") == f"TEST_UP_{marker}"]
        assert inserted, "TEST_UP row not found"
        m = inserted[0]
        assert m.get("phone") == "9111100000"           # mobile→phone
        assert m.get("role") == "Founder"                 # designation→role
        assert m.get("membership_date") == "2021-01-15"   # joined→membership_date
        assert m.get("sub_category") == "Life Member"     # member_category→sub_category
        assert m.get("email") == f"up{marker}@x.io"

        # cleanup — delete the inserted TEST_ member
        s.delete(f"{API}/members/{m['id']}", headers=OFFICE_BEARER_HEADERS)

    def test_bulk_upload_rbac(self, s):
        marker = uuid.uuid4().hex[:6]
        csv_text = f"name,category,address\nTEST_RBAC_{marker},Individual,Indore\n"
        files = {"file": ("x.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = s.post(f"{API}/members/bulk-upload", files=files,
                   data={"dry_run": "true"},
                   headers=DISTRICT_HEADERS)
        assert r.status_code == 403


# ---------------- Stats + list filters ----------------
class TestStatsAndFilters:
    def test_stats_shape(self, s):
        r = s.get(f"{API}/members/stats")
        assert r.status_code == 200
        body = r.json()
        for k in ("total", "by_type", "by_category", "by_status"):
            assert k in body
        assert isinstance(body["total"], int)

    def test_filter_by_member_type_division(self, s):
        # Create a Division member first to guarantee at least one exists
        marker = uuid.uuid4().hex[:6]
        create = s.post(f"{API}/members", json={
            "name": f"TEST_DIV_{marker}", "category": "Individual",
            "member_type": "Division", "division_body_id": "DIV-IND",
            "address": "Indore",
        })
        assert create.status_code == 200, create.text
        mid = create.json()["id"]

        r = s.get(f"{API}/members", params={"member_type": "Division"})
        assert r.status_code == 200
        rows = r.json()
        assert all((m.get("member_type") or "MPCA") == "Division" for m in rows)
        assert any(m["id"] == mid for m in rows)

        # filter by division_body_id
        r2 = s.get(f"{API}/members", params={"division_body_id": "DIV-IND"})
        assert r2.status_code == 200
        assert all(m.get("division_body_id") == "DIV-IND" for m in r2.json())

        # cleanup
        s.delete(f"{API}/members/{mid}", headers=OFFICE_BEARER_HEADERS)


# ---------------- PATCH / DELETE RBAC ----------------
class TestMemberRBAC:
    @pytest.fixture(scope="class")
    def seed_member(self, s=requests.Session()):
        # Create a fresh MPCA member owned by a specific email
        marker = uuid.uuid4().hex[:6]
        email = f"owner_{marker}@x.io"
        r = s.post(f"{API}/members", json={
            "name": f"TEST_MEM_{marker}", "category": "Individual",
            "member_type": "MPCA", "address": "Indore",
            "role": "Member", "email": email,
        })
        assert r.status_code == 200, r.text
        m = r.json()
        yield m, email
        # teardown
        s.delete(f"{API}/members/{m['id']}", headers=OFFICE_BEARER_HEADERS)

    def test_patch_as_secretary_ok(self, s, seed_member):
        m, _ = seed_member
        r = s.patch(f"{API}/members/{m['id']}",
                    json={"role": "President-Updated"},
                    headers=OFFICE_BEARER_HEADERS)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["role"] == "President-Updated"
        assert body.get("updated_at")
        assert body.get("updated_by") == "secretary"

    def test_patch_non_bearer_mismatched_email_blocked(self, s, seed_member):
        m, _ = seed_member
        r = s.patch(f"{API}/members/{m['id']}",
                    json={"role": "hacker"},
                    headers={"X-Role-Id": "district-secretary",
                             "X-User-Email": "not-the-owner@x.io"})
        assert r.status_code == 403
        assert "only edit your own" in r.text.lower()

    def test_patch_non_bearer_matching_email_ok(self, s, seed_member):
        m, email = seed_member
        r = s.patch(f"{API}/members/{m['id']}",
                    json={"phone": "9000012345"},
                    headers={"X-Role-Id": "district-secretary",
                             "X-User-Email": email})
        assert r.status_code == 200, r.text
        assert r.json()["phone"] == "9000012345"

    def test_delete_blocked_for_non_bearer(self, s, seed_member):
        m, _ = seed_member
        r = s.delete(f"{API}/members/{m['id']}",
                     headers={"X-Role-Id": "district-secretary"})
        assert r.status_code == 403
