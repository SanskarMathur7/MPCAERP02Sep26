"""MPCA ERP Phase 1 backend API tests.

Modules covered:
- Root version endpoint
- Dashboard stats
- Members CRUD + filters + UID auto-generation
- Disclosures listing/filter/create
"""
import os
import re
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load REACT_APP_BACKEND_URL from frontend .env to mimic how the public ingress sees the API
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Track created IDs so we can clean up at the end of the run
_created_member_ids: list[str] = []
_created_disclosure_ids: list[str] = []


@pytest.fixture(scope="session", autouse=True)
def _cleanup(client):
    yield
    for mid in _created_member_ids:
        try:
            client.delete(f"{API}/members/{mid}", timeout=10)
        except Exception:
            pass


# ---------------- Root ----------------

class TestRoot:
    def test_version_info(self, client):
        r = client.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("app") == "MPCA ERP"
        assert "version" in data
        assert data.get("status") == "ok"


# ---------------- Dashboard ----------------

class TestDashboard:
    def test_stats_shape(self, client):
        r = client.get(f"{API}/dashboard/stats", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "total_members" in data
        assert "by_category" in data
        assert "fee_collection_pct" in data
        # by_category includes all 4 buckets
        for cat in ["Individual", "Institutional", "Honorary", "Patron"]:
            assert cat in data["by_category"]
        assert isinstance(data["total_members"], int)
        assert data["total_members"] >= 7  # seed minimum


# ---------------- Members ----------------

class TestMembers:
    def test_list_seeded(self, client):
        r = client.get(f"{API}/members", timeout=15)
        assert r.status_code == 200
        members = r.json()
        assert isinstance(members, list)
        assert len(members) >= 7
        # _id (mongo) must be excluded
        for m in members:
            assert "_id" not in m
            assert "id" in m and "uid" in m and "name" in m
            assert re.match(r"^MPCA-(IND|INS|HON|PAT)-\d{4}$", m["uid"]), f"Bad UID: {m['uid']}"

    def test_filter_by_category(self, client):
        r = client.get(f"{API}/members", params={"category": "Institutional"}, timeout=15)
        assert r.status_code == 200
        members = r.json()
        assert len(members) >= 1
        for m in members:
            assert m["category"] == "Institutional"

    def test_search_indore(self, client):
        r = client.get(f"{API}/members", params={"search": "Indore"}, timeout=15)
        assert r.status_code == 200
        members = r.json()
        # Seed includes "Indore Gymkhana Cricket Club"
        assert any("Indore" in m["name"] for m in members), (
            f"Expected an Indore match in results: {[m['name'] for m in members]}"
        )

    def test_create_and_get_member(self, client):
        payload = {
            "name": "TEST_Ravi Shastri",
            "category": "Individual",
            "sub_category": "Annual Member",
            "address": "TEST 1, Indore",
            "phone": "+91 99999 00000",
            "email": "test_ravi@example.com",
            "eligibility_factor": "Test eligibility",
            "membership_date": "2025-01-01",
            "effectiveness": "01.01.2025 - 31.12.2025",
            "fee_structure": "₹3,000/year",
            "approving_authority": "TEST",
            "status": "Active",
        }
        r = client.post(f"{API}/members", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert created["category"] == "Individual"
        assert re.match(r"^MPCA-IND-\d{4}$", created["uid"])
        assert "id" in created
        _created_member_ids.append(created["id"])

        # GET to verify persistence
        r2 = client.get(f"{API}/members/{created['id']}", timeout=15)
        assert r2.status_code == 200
        fetched = r2.json()
        assert fetched["uid"] == created["uid"]
        assert fetched["email"] == payload["email"]

    def test_create_institutional_uid_prefix(self, client):
        payload = {
            "name": "TEST_Bhopal Cricket Club",
            "category": "Institutional",
            "address": "TEST Stadium, Bhopal",
            "representative_name": "TEST Rep",
            "representative_contact": "+91 11111 22222",
            "status": "Active",
        }
        r = client.post(f"{API}/members", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["uid"].startswith("MPCA-INS-")
        _created_member_ids.append(created["id"])

    def test_patch_member(self, client):
        # use most-recently created
        assert _created_member_ids, "Need a prior created member"
        mid = _created_member_ids[0]
        r = client.patch(
            f"{API}/members/{mid}",
            json={
                "name": "TEST_Ravi Shastri Updated",
                "category": "Individual",
                "address": "TEST Updated Address",
                "status": "Suspended",
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["name"] == "TEST_Ravi Shastri Updated"
        assert updated["status"] == "Suspended"

        r2 = client.get(f"{API}/members/{mid}", timeout=15)
        assert r2.json()["status"] == "Suspended"

    def test_delete_member(self, client):
        # Create then delete a fresh one
        payload = {
            "name": "TEST_To Be Deleted",
            "category": "Honorary",
            "address": "TEST",
            "status": "Active",
        }
        r = client.post(f"{API}/members", json=payload, timeout=15)
        assert r.status_code == 200
        mid = r.json()["id"]

        dr = client.delete(f"{API}/members/{mid}", timeout=15)
        assert dr.status_code == 200
        assert dr.json().get("deleted") is True

        gr = client.get(f"{API}/members/{mid}", timeout=15)
        assert gr.status_code == 404

    def test_get_nonexistent_member(self, client):
        r = client.get(f"{API}/members/does-not-exist-uuid", timeout=15)
        assert r.status_code == 404


# ---------------- Disclosures ----------------

class TestDisclosures:
    def test_list_seeded(self, client):
        r = client.get(f"{API}/disclosures", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 5
        for d in items:
            assert "_id" not in d
            assert "id" in d and "title" in d and "disclosure_type" in d

    def test_filter_by_type(self, client):
        r = client.get(f"{API}/disclosures", params={"disclosure_type": "AGM_Notice"}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for d in items:
            assert d["disclosure_type"] == "AGM_Notice"

    def test_create_disclosure(self, client):
        payload = {
            "title": "TEST_Disclosure circular",
            "disclosure_type": "Circular",
            "summary": "TEST summary",
            "content": "TEST content",
            "issued_date": "2025-10-01",
            "issued_by": "TEST Secretary",
        }
        r = client.post(f"{API}/disclosures", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["disclosure_type"] == "Circular"
        assert "id" in d
        _created_disclosure_ids.append(d["id"])

        # GET single
        r2 = client.get(f"{API}/disclosures/{d['id']}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["title"] == payload["title"]
