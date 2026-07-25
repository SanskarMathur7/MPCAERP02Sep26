"""
Sprint M26 · Phase C — Inter_District tournament pool + participation support.

Backend behaviors covered:
  1. sync_participants_from_pools accepts both division_pools and district_pools
  2. PATCH /setup-meta with district_pools (scope=Inter_District, host=DIV-IND)
     auto-creates District participation rows (body_type=District)
  3. Progress endpoint sets setup.teams=true when only district_pools is present
  4. POST /participants/resync returns pool_count = len(div) + len(dist)
  5. District participant persists acceptance changes (body_code=DIST-*)
  6. Regression — Inter_Divisional with division_pools still creates Division rows
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def inter_district_tid(s):
    """Fresh Inter_District tournament hosted by DIV-IND."""
    payload = {
        "name": "TEST_M26C_InterDistrict",
        "format": "One_Day",
        "scope": "Inter_District",
        "tournament_type": "MPCA_Championship",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "start_date": "2026-10-01",
        "end_date": "2026-10-02",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"Cannot create tournament: {r.status_code} {r.text[:200]}")
    tid = r.json()["id"]
    yield tid
    try:
        s.delete(f"{API}/tournaments/{tid}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def inter_divisional_tid(s):
    """Fresh Inter_Divisional tournament for regression test."""
    payload = {
        "name": "TEST_M26C_InterDiv_Regression",
        "format": "One_Day",
        "scope": "Inter_Divisional",
        "tournament_type": "MPCA_InterDivisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "start_date": "2026-11-01",
        "end_date": "2026-11-02",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"Cannot create tournament: {r.status_code} {r.text[:200]}")
    tid = r.json()["id"]
    yield tid
    try:
        s.delete(f"{API}/tournaments/{tid}")
    except Exception:
        pass


# ─────────────── 2. PATCH setup-meta with district_pools ───────────────

class TestDistrictPoolsSetup:
    def test_patch_district_pools_creates_district_participants(self, s, inter_district_tid):
        tid = inter_district_tid
        setup = {"district_pools": [
            {"id": "dp1", "name": "Pool A",
             "district_codes": ["DIST-INDO-IND", "DIST-DHAR-IND", "DIST-BURH-IND"],
             "host_district_code": "DIST-INDO-IND"},
        ]}
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup})
        assert r.status_code == 200, r.text
        # Verify setup_meta stored district_pools with correct keys
        t = r.json()
        meta = t.get("setup_meta", {})
        assert "district_pools" in meta
        assert meta["district_pools"][0]["district_codes"] == ["DIST-INDO-IND", "DIST-DHAR-IND", "DIST-BURH-IND"]
        assert meta["district_pools"][0]["host_district_code"] == "DIST-INDO-IND"

        # Verify participants seeded
        parts = s.get(f"{API}/tournaments/{tid}/participants").json()
        codes = {p["body_code"] for p in parts}
        assert codes == {"DIST-INDO-IND", "DIST-DHAR-IND", "DIST-BURH-IND"}
        # body_type = 'District' on all rows
        for p in parts:
            assert p["body_type"] == "District", f"Expected District, got {p['body_type']} for {p['body_code']}"
        # Host role assigned correctly
        host_rows = [p for p in parts if p["role"] == "Host"]
        assert len(host_rows) == 1
        assert host_rows[0]["body_code"] == "DIST-INDO-IND"

    def test_merge_both_pools_creates_merged_participants(self, s):
        """Backend sync helper — pass both div and district pools, verify merged."""
        # Create a fresh tournament for the merge test (Inter_District is fine)
        payload = {
            "name": "TEST_M26C_MergePools",
            "format": "One_Day",
            "scope": "Inter_District",
            "tournament_type": "MPCA_Championship",
            "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND",
            "start_date": "2026-12-01",
        }
        r = s.post(f"{API}/tournaments", json=payload)
        assert r.status_code in (200, 201)
        tid = r.json()["id"]
        try:
            setup = {
                "division_pools": [{"id": "dv1", "name": "Div Pool",
                                    "division_codes": ["DIV-IND"], "host_division_code": "DIV-IND"}],
                "district_pools": [{"id": "ds1", "name": "Dist Pool",
                                    "district_codes": ["DIST-INDO-IND", "DIST-DHAR-IND"],
                                    "host_district_code": "DIST-INDO-IND"}],
            }
            r2 = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup})
            assert r2.status_code == 200, r2.text
            parts = s.get(f"{API}/tournaments/{tid}/participants").json()
            codes = {p["body_code"] for p in parts}
            assert codes == {"DIV-IND", "DIST-INDO-IND", "DIST-DHAR-IND"}
            # Verify body_type is set per body (Division for DIV-IND, District for others)
            by_code = {p["body_code"]: p for p in parts}
            assert by_code["DIV-IND"]["body_type"] == "Division"
            assert by_code["DIST-INDO-IND"]["body_type"] == "District"
            assert by_code["DIST-DHAR-IND"]["body_type"] == "District"
        finally:
            s.delete(f"{API}/tournaments/{tid}")


# ─────────────── 3. Progress endpoint ───────────────

class TestProgressWithDistrictPools:
    def test_progress_teams_set_true_when_only_district_pools(self, s, inter_district_tid):
        tid = inter_district_tid
        r = s.get(f"{API}/tournaments/{tid}/progress")
        assert r.status_code == 200
        setup_phase = next(p for p in r.json()["phases"] if p["key"] == "setup")
        teams_step = next(st for st in setup_phase["steps"] if st["key"] == "teams")
        assert teams_step["done"] is True, "teams step should be done when district_pools set"


# ─────────────── 4. Resync returns correct pool_count ───────────────

class TestResyncPoolCount:
    def test_resync_returns_pool_count_of_district_pools(self, s, inter_district_tid):
        tid = inter_district_tid
        r = s.post(f"{API}/tournaments/{tid}/participants/resync")
        assert r.status_code == 200
        data = r.json()
        assert data["resynced"] is True
        assert data["pool_count"] == 1  # one district pool created above


# ─────────────── 5. Acceptance persistence on District participant ───────────────

class TestDistrictAcceptance:
    def test_patch_acceptance_persists_for_district_participant(self, s, inter_district_tid):
        tid = inter_district_tid
        r = s.patch(f"{API}/tournaments/{tid}/participants/DIST-DHAR-IND",
                    json={"acceptance_status": "Accepted", "acceptance_note": "TEST_ok",
                          "acceptance_by_name": "TEST_dist_sec"})
        assert r.status_code == 200, r.text
        assert r.json()["acceptance_status"] == "Accepted"
        # Verify persistence
        p = s.get(f"{API}/tournaments/{tid}/participants/DIST-DHAR-IND").json()
        assert p["acceptance_status"] == "Accepted"
        assert p["acceptance_note"] == "TEST_ok"
        assert p["acceptance_at"] is not None


# ─────────────── 6. Regression — Inter_Divisional still works ───────────────

class TestInterDivisionalRegression:
    def test_division_pools_still_creates_division_participants(self, s, inter_divisional_tid):
        tid = inter_divisional_tid
        setup = {"division_pools": [
            {"id": "p1", "name": "Pool A",
             "division_codes": ["DIV-IND", "DIV-BPL"],
             "host_division_code": "DIV-IND"},
        ]}
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup})
        assert r.status_code == 200

        parts = s.get(f"{API}/tournaments/{tid}/participants").json()
        codes = {p["body_code"] for p in parts}
        assert codes == {"DIV-IND", "DIV-BPL"}
        for p in parts:
            assert p["body_type"] == "Division"

    def test_resync_returns_division_pool_count(self, s, inter_divisional_tid):
        r = s.post(f"{API}/tournaments/{inter_divisional_tid}/participants/resync")
        assert r.status_code == 200
        assert r.json()["pool_count"] == 1


# ─────────────── 7. Edge case: only 1-district pool ───────────────

class TestSingleDistrictPool:
    def test_remove_pool_soft_deletes_participants(self, s, inter_district_tid):
        tid = inter_district_tid
        # Reduce to 1 district
        setup = {"district_pools": [
            {"id": "dp1", "name": "Pool A",
             "district_codes": ["DIST-INDO-IND"],
             "host_district_code": "DIST-INDO-IND"},
        ]}
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup})
        assert r.status_code == 200
        parts = s.get(f"{API}/tournaments/{tid}/participants").json()
        active_codes = {p["body_code"] for p in parts}
        assert active_codes == {"DIST-INDO-IND"}
