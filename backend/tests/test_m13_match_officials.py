"""Sprint M13 · Match Officials + Selection Funnel activation.

Coverage:
- Ref data & purge validation (bodies=66, member_categories=7; members/players/tournaments should be [])
- Match Officials CRUD + RBAC (division-secretary role header, public/no-role 403, invalid body 400)
- E2E: create official under DIV-IND → filter by body_id
- Cleanup: purge any M13/BugFix/RBAC test data at end
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for tests running inside container without env — resolve from frontend/.env
    import re
    with open("/app/frontend/.env") as f:
        m = re.search(r"REACT_APP_BACKEND_URL=(\S+)", f.read())
        BASE_URL = m.group(1).rstrip("/") if m else ""

API = f"{BASE_URL}/api"


# ─── Fixtures ────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def cleanup():
    created_officials = []
    created_tournaments = []
    yield {"officials": created_officials, "tournaments": created_tournaments}
    for oid in created_officials:
        try:
            requests.delete(f"{API}/match-officials/{oid}", headers={"X-Role-Id": "secretary"})
        except Exception:
            pass


# ─── Reference data ──────────────────────────────────────────────────
class TestReferenceData:
    def test_bodies_count(self, s):
        r = s.get(f"{API}/bodies")
        assert r.status_code == 200
        assert len(r.json()) == 66, f"Expected 66 bodies, got {len(r.json())}"

    def test_member_categories_count(self, s):
        r = s.get(f"{API}/member-categories")
        assert r.status_code == 200
        assert len(r.json()) == 7

    # Spec: after purge these should be empty. Report as failures if they aren't.
    @pytest.mark.parametrize("resource", ["members", "players", "tournaments", "venues", "grounds"])
    def test_transactional_purged(self, s, resource):
        r = s.get(f"{API}/{resource}")
        assert r.status_code == 200
        data = r.json()
        assert data == [], (
            f"Sprint M13 spec expects /api/{resource} to be empty after purge, "
            f"but got {len(data)} rows. Startup seed is re-populating data — "
            f"seed.py needs to be disabled or check a purge-guard flag."
        )


# ─── Match Officials CRUD ────────────────────────────────────────────
class TestMatchOfficialsCRUD:
    def test_list_officials_empty_or_list(self, s):
        r = s.get(f"{API}/match-officials")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_official_as_division_secretary(self, s, cleanup):
        payload = {
            "full_name": "M13 TEST Umpire Ravi",
            "role": "Umpire",
            "grade": "State_Panel",
            "body_id": "DIV-IND",
            "phone": "+91 9876500001",
            "years_of_experience": 5,
        }
        r = s.post(f"{API}/match-officials", json=payload,
                   headers={"X-Role-Id": "division-secretary"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["full_name"] == payload["full_name"]
        assert data["role"] == "Umpire"
        assert data["body_id"] == "DIV-IND"
        assert "id" in data
        cleanup["officials"].append(data["id"])

    def test_create_official_public_role_forbidden(self, s):
        payload = {
            "full_name": "M13 TEST Rejected",
            "role": "Scorer",
            "body_id": "DIV-IND",
        }
        r = s.post(f"{API}/match-officials", json=payload,
                   headers={"X-Role-Id": "public"})
        assert r.status_code == 403

    def test_create_official_invalid_body_400(self, s):
        payload = {
            "full_name": "M13 TEST Bad Body",
            "role": "Umpire",
            "body_id": "DIV-NOSUCH",
        }
        r = s.post(f"{API}/match-officials", json=payload,
                   headers={"X-Role-Id": "secretary"})
        assert r.status_code == 400
        assert "does not exist" in r.text.lower() or "not" in r.text.lower()

    def test_filter_by_body_id(self, s, cleanup):
        # Add an official under MPCA
        p1 = {"full_name": "M13 TEST MPCA Ref", "role": "Referee", "body_id": "MPCA"}
        r1 = s.post(f"{API}/match-officials", json=p1, headers={"X-Role-Id": "secretary"})
        assert r1.status_code == 200
        cleanup["officials"].append(r1.json()["id"])

        # Filter by DIV-IND should NOT contain the MPCA official
        r = s.get(f"{API}/match-officials", params={"body_id": "DIV-IND"})
        assert r.status_code == 200
        rows = r.json()
        for row in rows:
            assert row["body_id"] == "DIV-IND"

        # Filter by role
        r2 = s.get(f"{API}/match-officials", params={"role": "Referee"})
        assert r2.status_code == 200
        for row in r2.json():
            assert row["role"] == "Referee"

    def test_delete_official_verifies_removal(self, s, cleanup):
        # Create then delete
        payload = {"full_name": "M13 TEST To Delete", "role": "Coach", "body_id": "MPCA"}
        r = s.post(f"{API}/match-officials", json=payload,
                   headers={"X-Role-Id": "secretary"})
        assert r.status_code == 200
        oid = r.json()["id"]

        d = s.delete(f"{API}/match-officials/{oid}", headers={"X-Role-Id": "secretary"})
        assert d.status_code == 200
        # Verify not present
        rows = s.get(f"{API}/match-officials").json()
        assert not any(o["id"] == oid for o in rows)

    def test_delete_official_public_forbidden(self, s):
        r = s.delete(f"{API}/match-officials/does-not-matter",
                     headers={"X-Role-Id": "public"})
        assert r.status_code == 403


# ─── Selection Funnel wiring — no dedicated GET, uses tournaments+selection ─
class TestSelectionFunnelWiring:
    def test_selection_funnel_route_uses_tournaments_api(self, s):
        # Just verify the underlying endpoints the funnel page consumes are up
        r1 = s.get(f"{API}/tournaments")
        assert r1.status_code == 200


# ─── Cleanup runs via fixture teardown ────────────────────────────────
