"""Phase III.5 backend tests:
  1. /api/bodies endpoints (BCCI -> MPCA -> 10 Divisions -> 54 Districts hierarchy)
  2. Regression: All previously working endpoints from Phase I-III still 200
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env value (used when run from CI without env injection)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# -------------------- Phase III.5: Bodies --------------------

class TestBodies:
    def test_list_bodies_total_count(self, client):
        r = client.get(f"{API}/bodies")
        assert r.status_code == 200
        data = r.json()
        # 1 BCCI + 1 MPCA + 10 Divisions + 54 Districts = 66
        assert isinstance(data, list)
        assert len(data) == 66, f"Expected 66 bodies, got {len(data)}"

    def test_list_bodies_unique_codes(self, client):
        r = client.get(f"{API}/bodies")
        codes = [b["code"] for b in r.json()]
        assert len(codes) == len(set(codes)), "Duplicate body codes found"

    def test_list_bodies_breakdown_by_type(self, client):
        data = client.get(f"{API}/bodies").json()
        by_type = {}
        for b in data:
            by_type.setdefault(b["body_type"], []).append(b)
        assert len(by_type.get("BCCI", [])) == 1
        assert len(by_type.get("State", [])) == 1
        assert len(by_type.get("Division", [])) == 10
        assert len(by_type.get("District", [])) == 54

    def test_list_bodies_filter_by_type(self, client):
        r = client.get(f"{API}/bodies", params={"body_type": "Division"})
        assert r.status_code == 200
        divs = r.json()
        assert len(divs) == 10
        assert all(d["body_type"] == "Division" for d in divs)
        assert all(d["parent_code"] == "MPCA" for d in divs)

    def test_list_bodies_filter_by_parent(self, client):
        r = client.get(f"{API}/bodies", params={"parent_code": "DIV-IND"})
        assert r.status_code == 200
        kids = r.json()
        # Indore Division has 8 districts
        assert len(kids) == 8
        assert all(k["body_type"] == "District" for k in kids)

    def test_bodies_tree_root_is_bcci(self, client):
        r = client.get(f"{API}/bodies/tree")
        assert r.status_code == 200
        tree = r.json()
        assert isinstance(tree, list)
        assert len(tree) == 1, "Tree should have exactly 1 root (BCCI)"
        root = tree[0]
        assert root["code"] == "BCCI"
        # BCCI's child is MPCA
        assert "children" in root
        assert len(root["children"]) == 1
        mpca = root["children"][0]
        assert mpca["code"] == "MPCA"
        # MPCA has 10 division children
        assert len(mpca["children"]) == 10
        # Each division has its districts under it
        total_districts = sum(len(d["children"]) for d in mpca["children"])
        assert total_districts == 54
        # Specifically Indore Division
        ind = next(d for d in mpca["children"] if d["code"] == "DIV-IND")
        assert len(ind["children"]) == 8

    def test_get_body_mpca(self, client):
        r = client.get(f"{API}/bodies/MPCA")
        assert r.status_code == 200
        b = r.json()
        assert b["code"] == "MPCA"
        assert b["body_type"] == "State"
        assert b["parent_code"] == "BCCI"
        assert b["name"] == "Madhya Pradesh Cricket Association"
        # Mongo _id must NOT leak
        assert "_id" not in b

    def test_get_body_invalid_returns_404(self, client):
        r = client.get(f"{API}/bodies/INVALID-CODE-XYZ")
        assert r.status_code == 404

    def test_mpca_summary(self, client):
        r = client.get(f"{API}/bodies/MPCA/summary")
        assert r.status_code == 200
        s = r.json()
        assert s["body"]["code"] == "MPCA"
        assert s["division_count"] == 10
        assert s["district_count"] == 54
        assert s["direct_children_count"] == 10

    def test_indore_division_summary(self, client):
        r = client.get(f"{API}/bodies/DIV-IND/summary")
        assert r.status_code == 200
        s = r.json()
        assert s["body"]["code"] == "DIV-IND"
        assert s["body"]["body_type"] == "Division"
        assert s["district_count"] == 8
        assert s["direct_children_count"] == 8

    def test_create_body_success_and_duplicate(self, client):
        unique_code = f"TEST-BODY-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "code": unique_code,
            "name": "TEST Body Phase 3.5",
            "body_type": "Club",
            "parent_code": "DIST-INDO-IND",
            "state": "Madhya Pradesh",
            "seat": "Indore",
            "annual_grant_inr": 5000.0,
        }
        r = client.post(f"{API}/bodies", json=payload)
        assert r.status_code == 200, f"Create failed: {r.text}"
        created = r.json()
        assert created["code"] == unique_code
        assert created["body_type"] == "Club"
        assert "id" in created and len(created["id"]) > 0

        # Verify GET returns it
        g = client.get(f"{API}/bodies/{unique_code}")
        assert g.status_code == 200
        assert g.json()["name"] == "TEST Body Phase 3.5"

        # Duplicate code -> 400
        dup = client.post(f"{API}/bodies", json=payload)
        assert dup.status_code == 400

        # cleanup: best-effort delete via direct DB not exposed; leave as TEST_ prefix
        # (no DELETE endpoint provided for bodies)


# -------------------- Regression: Phase I-III endpoints --------------------

REGRESSION_GET_ENDPOINTS = [
    "/api/",
    "/api/members",
    "/api/disclosures",
    "/api/meetings",
    "/api/elections",
    "/api/fees",
    "/api/bank/accounts",
    "/api/bank/transactions",
    "/api/financial-powers",
    "/api/dashboard/stats",
]


@pytest.mark.parametrize("path", REGRESSION_GET_ENDPOINTS)
def test_regression_get_endpoint_200(client, path):
    r = client.get(f"{BASE_URL}{path}")
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"


def test_regression_seed_counts(client):
    """Sanity: seeded counts unchanged after Phase III.5."""
    members = client.get(f"{API}/members").json()
    assert len(members) >= 7, f"Expected >=7 seeded members, got {len(members)}"

    disclosures = client.get(f"{API}/disclosures").json()
    assert len(disclosures) >= 1

    meetings = client.get(f"{API}/meetings").json()
    assert len(meetings) >= 1

    elections = client.get(f"{API}/elections").json()
    assert len(elections) >= 1

    accounts = client.get(f"{API}/bank/accounts").json()
    assert len(accounts) >= 2


def test_regression_verify_uid(client):
    # Use the first seeded member
    members = client.get(f"{API}/members").json()
    assert members, "No members seeded"
    uid = members[0]["uid"]
    r = client.get(f"{API}/verify/{uid}")
    assert r.status_code == 200, f"verify failed: {r.text}"
    body = r.json()
    # API returns the member object (or wrapped). Just ensure uid is present somewhere.
    assert uid in str(body)


def test_regression_member_profile(client):
    members = client.get(f"{API}/members").json()
    uid = members[0]["uid"]
    r = client.get(f"{API}/member-profile/{uid}")
    assert r.status_code == 200, f"member-profile failed: {r.text}"
    data = r.json()
    assert data["member"]["uid"] == uid
    assert "invoices" in data
    assert "total_outstanding" in data


def test_regression_dashboard_stats_shape(client):
    r = client.get(f"{API}/dashboard/stats")
    assert r.status_code == 200
    s = r.json()
    # Spot-check several keys; tolerate extra keys
    for k in ("total_members", "active_members"):
        assert k in s, f"missing key {k} in dashboard stats"
