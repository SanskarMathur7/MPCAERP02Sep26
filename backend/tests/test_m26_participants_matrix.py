"""
Sprint M26 · Tournament Participants Matrix – backend tests.

Covers:
    * GET /tournaments/{tid}/participants (active + include_removed)
    * PATCH /tournaments/{tid}/setup-meta auto-syncs participations
    * Soft-delete + re-activation preserves acceptance_status
    * PATCH /tournaments/{tid}/participants/{code} validations
    * POST /tournaments/{tid}/participants/resync
    * GET /tournaments/{tid}/progress still marks setup.teams done for division_pools
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Existing seeded Inter_Divisional tournament with 2 pools
SEEDED_TID = "e2a9ac5c-8e72-4d0a-9aa9-8dae40f482e5"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


# ─────────────── Seeded tournament participants ───────────────

class TestSeededParticipants:
    def test_list_returns_rows_for_seeded_tournament(self, s):
        r = s.get(f"{API}/tournaments/{SEEDED_TID}/participants")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 2, f"Expected participants, got {len(rows)}"
        # Verify shape
        for row in rows:
            assert "body_code" in row
            assert "role" in row and row["role"] in ("Host", "Visitor")
            assert "acceptance_status" in row
            assert row["acceptance_status"] in ("Pending", "Accepted", "Declined", "Not_Required")
            for k in ("invoice_total_inr", "receipt_total_inr", "budget_total_inr",
                      "claim_requested_inr", "claim_approved_inr", "outstanding_inr"):
                assert k in row, f"Missing derived total {k}"
            assert "_id" not in row

    def test_host_row_exists(self, s):
        rows = s.get(f"{API}/tournaments/{SEEDED_TID}/participants").json()
        hosts = [r for r in rows if r["role"] == "Host"]
        assert len(hosts) >= 1
        assert hosts[0]["body_code"] == "DIV-IND"


# ─────────────── PATCH endpoint ───────────────

class TestPatchAcceptance:
    def test_reject_invalid_status(self, s):
        r = s.patch(
            f"{API}/tournaments/{SEEDED_TID}/participants/DIV-CHM",
            json={"acceptance_status": "Foo"},
        )
        assert r.status_code == 400, r.text

    def test_accept_and_reset_flow(self, s):
        # Accept
        r = s.patch(
            f"{API}/tournaments/{SEEDED_TID}/participants/DIV-CHM",
            json={"acceptance_status": "Accepted", "acceptance_by_name": "TEST_secretary"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["acceptance_status"] == "Accepted"
        assert body["acceptance_by_name"] == "TEST_secretary"
        assert body["acceptance_at"] is not None

        # Reset back to Pending
        r = s.patch(
            f"{API}/tournaments/{SEEDED_TID}/participants/DIV-CHM",
            json={"acceptance_status": "Pending"},
        )
        assert r.status_code == 200
        assert r.json()["acceptance_status"] == "Pending"

    def test_patch_non_existent_body(self, s):
        r = s.patch(
            f"{API}/tournaments/{SEEDED_TID}/participants/DIV-NOPE",
            json={"acceptance_status": "Accepted"},
        )
        assert r.status_code == 404


# ─────────────── setup-meta auto-sync & soft-delete ───────────────

@pytest.fixture(scope="module")
def temp_tournament(s):
    """Create a fresh Inter_Divisional tournament for destructive sync tests."""
    payload = {
        "name": "TEST_M26_Sync",
        "format": "Multi_Day",
        "scope": "Inter_Divisional",
        "tournament_type": "MPCA_InterDivisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "start_date": "2026-08-01",
        "end_date": "2026-08-05",
    }
    r = s.post(f"{API}/tournaments", json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"Could not create tournament: {r.status_code} {r.text[:200]}")
    tid = r.json()["id"]
    yield tid
    # cleanup
    try:
        s.delete(f"{API}/tournaments/{tid}")
    except Exception:
        pass


class TestAutoSync:
    def test_setup_meta_creates_and_soft_deletes(self, s, temp_tournament):
        tid = temp_tournament

        # Empty participants initially
        r = s.get(f"{API}/tournaments/{tid}/participants")
        assert r.status_code == 200
        assert r.json() == []

        # Save 4 divisions across 2 pools
        setup1 = {
            "division_pools": [
                {"id": "p1", "name": "Pool A",
                 "division_codes": ["DIV-IND", "DIV-BPL"],
                 "host_division_code": "DIV-IND"},
                {"id": "p2", "name": "Pool B",
                 "division_codes": ["DIV-GWL", "DIV-JBP"],
                 "host_division_code": "DIV-GWL"},
            ]
        }
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup1})
        assert r.status_code == 200, r.text

        rows = s.get(f"{API}/tournaments/{tid}/participants").json()
        codes = {r["body_code"] for r in rows}
        assert codes == {"DIV-IND", "DIV-BPL", "DIV-GWL", "DIV-JBP"}, codes
        # Host detection
        by_code = {r["body_code"]: r for r in rows}
        assert by_code["DIV-IND"]["role"] == "Host"
        assert by_code["DIV-GWL"]["role"] == "Host"
        assert by_code["DIV-BPL"]["role"] == "Visitor"

        # Mark DIV-JBP as Accepted so we can verify preservation on re-add
        r = s.patch(f"{API}/tournaments/{tid}/participants/DIV-JBP",
                    json={"acceptance_status": "Accepted",
                          "acceptance_note": "will return",
                          "acceptance_by_name": "TEST_sec"})
        assert r.status_code == 200

        # Drop DIV-JBP
        setup2 = {
            "division_pools": [
                {"id": "p1", "name": "Pool A",
                 "division_codes": ["DIV-IND", "DIV-BPL"],
                 "host_division_code": "DIV-IND"},
                {"id": "p2", "name": "Pool B",
                 "division_codes": ["DIV-GWL"],
                 "host_division_code": "DIV-GWL"},
            ]
        }
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup2})
        assert r.status_code == 200

        active = s.get(f"{API}/tournaments/{tid}/participants").json()
        assert {r["body_code"] for r in active} == {"DIV-IND", "DIV-BPL", "DIV-GWL"}

        all_rows = s.get(f"{API}/tournaments/{tid}/participants",
                         params={"include_removed": "true"}).json()
        assert len(all_rows) == 4
        removed = [r for r in all_rows if r["removed_at"]]
        assert len(removed) == 1
        assert removed[0]["body_code"] == "DIV-JBP"
        # Acceptance preserved on soft-delete
        assert removed[0]["acceptance_status"] == "Accepted"
        assert removed[0]["acceptance_note"] == "will return"

        # Re-add DIV-JBP → should re-activate and preserve
        setup3 = setup1
        r = s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup3})
        assert r.status_code == 200
        after = s.get(f"{API}/tournaments/{tid}/participants").json()
        by = {r["body_code"]: r for r in after}
        assert "DIV-JBP" in by
        assert by["DIV-JBP"]["removed_at"] is None
        assert by["DIV-JBP"]["acceptance_status"] == "Accepted", "should preserve prior acceptance"
        assert by["DIV-JBP"]["acceptance_note"] == "will return"

    def test_patch_on_soft_deleted_returns_404(self, s, temp_tournament):
        tid = temp_tournament
        # Save minimal pool without DIV-CHM
        setup = {
            "division_pools": [
                {"id": "p1", "name": "Pool A",
                 "division_codes": ["DIV-IND"],
                 "host_division_code": "DIV-IND"},
                {"id": "p2", "name": "Pool B",
                 "division_codes": ["DIV-CHM"],
                 "host_division_code": "DIV-CHM"},
            ]
        }
        s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": setup})
        # Drop DIV-CHM
        s.patch(f"{API}/tournaments/{tid}/setup-meta", json={"setup_meta": {
            "division_pools": [
                {"id": "p1", "name": "Pool A",
                 "division_codes": ["DIV-IND"], "host_division_code": "DIV-IND"},
            ]
        }})
        r = s.patch(f"{API}/tournaments/{tid}/participants/DIV-CHM",
                    json={"acceptance_status": "Accepted"})
        assert r.status_code == 404


# ─────────────── Resync endpoint ───────────────

class TestResync:
    def test_resync_returns_pool_count(self, s):
        r = s.post(f"{API}/tournaments/{SEEDED_TID}/participants/resync")
        assert r.status_code == 200
        data = r.json()
        assert data.get("resynced") is True
        assert data.get("pool_count") == 2

    def test_resync_unknown_tournament(self, s):
        r = s.post(f"{API}/tournaments/deadbeef/participants/resync")
        assert r.status_code == 404


# ─────────────── Progress regression ───────────────

class TestProgressTeamsWithPools:
    def test_setup_teams_done_when_only_division_pools(self, s):
        r = s.get(f"{API}/tournaments/{SEEDED_TID}/progress")
        assert r.status_code == 200
        phases = r.json()["phases"]
        setup = next(p for p in phases if p["key"] == "setup")
        teams = next(st for st in setup["steps"] if st["key"] == "teams")
        assert teams["done"] is True, "setup.teams should be done for division_pools"
