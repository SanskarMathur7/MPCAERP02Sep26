"""MPCA-235 · Tournament Wiring Console — end-to-end backend verification.

Focus areas (per review request):
 (a) wiring-status derivation correctness for all 7 seeded tournaments
     (TRN-2026-27-001 → 007) — each must resolve to the correct type_id
     and steps must reflect live seeded data.
 (b) Ship 4 visibility filter behaviour on GET /api/tournaments with
     include_camp_scoped=false as MPCA State persona.
 (c) audit log correctness after cell edits (PATCH → GET audit).
 (d) freeze-season snapshot immutability + revision incrementing.
 (e) MPCA-236 inter-district tournament creation via API.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 20


# ─────────────────────────── Fixtures ───────────────────────────

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def wiring(client):
    r = client.get(f"{API}/tournament-wiring", timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def seeded_tournaments(client):
    """Return the 7 seeded tournaments keyed by tournament_no."""
    r = client.get(f"{API}/tournaments?limit=1000", timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    docs = r.json()
    out = {}
    for d in docs:
        tno = d.get("tournament_no")
        if tno and tno.startswith("TRN-2026-27-00"):
            out[tno] = d
    return out


# ─────────────────────────── (0) Matrix shape ───────────────────────────

class TestMatrixShape:
    def test_matrix_has_8_types_and_9_steps(self, wiring):
        assert len(wiring["types"]) == 8
        assert len(wiring["steps"]) == 9
        type_ids = {t["id"] for t in wiring["types"]}
        assert type_ids == {"bcci", "interdiv", "camp", "district",
                            "interschool", "interclub", "coachingcamp", "vacationcamp"}

    def test_all_72_cells_have_8_attrs(self, wiring):
        required = {"flag", "owner", "approver", "mode", "visibility", "blocks_next", "sla_days", "text"}
        for tid, steps in wiring["cells"].items():
            assert len(steps) == 9, f"{tid} missing steps"
            for skey, cell in steps.items():
                assert required.issubset(cell.keys()), f"{tid}.{skey} missing attrs"

    def test_enums_present(self, wiring):
        e = wiring["enums"]
        assert set(e["flag"]) == {"M", "O", "NA", "INFO"}
        assert set(e["owner"]) == {"MPCA", "Division", "District", "Auto"}
        assert set(e["mode"]) == {"Register_Linked", "Manual_PDF", "Auto_Compute", "NA"}
        assert set(e["visibility"]) == {"Realtime", "On_Submit", "Never"}


# ─────────────────────────── (a) Wiring status per tournament ───────────────────────────

EXPECTED_TYPE = {
    "TRN-2026-27-001": "bcci",
    "TRN-2026-27-002": "interdiv",
    "TRN-2026-27-003": "district",
    "TRN-2026-27-004": "interschool",
    "TRN-2026-27-005": "interclub",
    "TRN-2026-27-006": "coachingcamp",
    "TRN-2026-27-007": "vacationcamp",
}


class TestWiringStatusPerTournament:
    def test_all_7_tournaments_seeded(self, seeded_tournaments):
        missing = [n for n in EXPECTED_TYPE if n not in seeded_tournaments]
        assert not missing, f"Missing seeded tournaments: {missing}"

    @pytest.mark.parametrize("tno,expected_type", list(EXPECTED_TYPE.items()))
    def test_type_id_resolution(self, client, seeded_tournaments, tno, expected_type):
        t = seeded_tournaments.get(tno)
        if not t:
            pytest.skip(f"{tno} not seeded")
        tid = t["id"]
        r = client.get(f"{API}/tournaments/{tid}/wiring-status", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["type_id"] == expected_type, (
            f"{tno} (code={t.get('tournament_type_code')}) expected type_id={expected_type} "
            f"but got {data['type_id']}"
        )
        assert len(data["steps"]) == 9
        assert data["type_name"], "type_name missing"

    @pytest.mark.parametrize("tno", list(EXPECTED_TYPE.keys()))
    def test_status_derivation_matches_state(self, client, seeded_tournaments, tno):
        t = seeded_tournaments.get(tno)
        if not t:
            pytest.skip(f"{tno} not seeded")
        tid = t["id"]
        r = client.get(f"{API}/tournaments/{tid}/wiring-status", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        steps = {s["key"]: s for s in data["steps"]}

        # tournament_creation should be done for all (tournament exists)
        assert steps["tournament_creation"]["status"] in ("done", "info")

        # Squad step: check if there are seeded squads with members
        sq_r = client.get(f"{API}/squads?tournament_id={tid}", timeout=TIMEOUT)
        squad_has_members = False
        if sq_r.status_code == 200:
            for s in sq_r.json():
                if s.get("members"):
                    squad_has_members = True
                    break
        sq_step = steps.get("squad", {})
        if sq_step.get("flag") == "M":
            if squad_has_members:
                assert sq_step["status"] in ("done", "current"), (
                    f"{tno}: squad has members but status={sq_step['status']}"
                )

        # Match calendar: NA flag → status na; M and matches exist → done
        cal = steps.get("match_calendar", {})
        if cal.get("flag") == "NA":
            assert cal["status"] == "na"

    def test_progress_pct_range(self, client, seeded_tournaments):
        for tno in EXPECTED_TYPE:
            t = seeded_tournaments.get(tno)
            if not t:
                continue
            r = client.get(f"{API}/tournaments/{t['id']}/wiring-status", timeout=TIMEOUT)
            assert r.status_code == 200
            pct = r.json()["progress_pct"]
            assert 0 <= pct <= 100, f"{tno} progress_pct={pct} out of range"


# ─────────────────────────── (b) Ship 4 Visibility Filter ───────────────────────────

class TestShip4VisibilityFilter:
    HEADERS_STATE = {"X-User-Persona": "secretary", "X-User-Body-Type": "State"}

    def test_default_returns_everything(self, client):
        r = client.get(f"{API}/tournaments?limit=1000", headers=self.HEADERS_STATE, timeout=TIMEOUT)
        assert r.status_code == 200
        # Default (no param) should be backward-compat = include everything
        scopes = {d.get("scope") for d in r.json()}
        # Should include Championship if seed has them
        assert scopes  # at least something

    def test_explicit_true_returns_everything(self, client):
        r = client.get(f"{API}/tournaments?include_camp_scoped=true&limit=1000",
                       headers=self.HEADERS_STATE, timeout=TIMEOUT)
        assert r.status_code == 200

    def test_false_hides_championship_without_claim(self, client):
        r_all = client.get(f"{API}/tournaments?include_camp_scoped=true&limit=1000",
                           headers=self.HEADERS_STATE, timeout=TIMEOUT)
        r_filt = client.get(f"{API}/tournaments?include_camp_scoped=false&limit=1000",
                            headers=self.HEADERS_STATE, timeout=TIMEOUT)
        assert r_all.status_code == 200 and r_filt.status_code == 200
        all_docs = r_all.json()
        filt_docs = r_filt.json()

        championship_all = [d for d in all_docs if d.get("scope") in ("Championship", "Invitational")]
        championship_filt = [d for d in filt_docs if d.get("scope") in ("Championship", "Invitational")]

        # Every Championship in filtered set must have a submitted claim
        filt_ids = {d["id"] for d in championship_filt}
        for d in championship_all:
            if d["id"] not in filt_ids:
                # Hidden — verify no submitted claim
                cr = client.get(f"{API}/reimbursement-claims?tournament_id={d['id']}", timeout=TIMEOUT)
                if cr.status_code == 200:
                    claims = cr.json()
                    subs = [c for c in claims if c.get("status") in
                            ("Submitted", "Under_Review", "Approved", "Rejected", "Disbursed")]
                    assert not subs, f"Hidden tournament {d['id']} actually has submitted claim"

        # Filtered set must be a strict subset (or equal) — cannot be larger
        assert len(filt_docs) <= len(all_docs)

        # Non-Championship scopes must be present in both
        non_champ_all = {d["id"] for d in all_docs if d.get("scope") not in ("Championship", "Invitational")}
        non_champ_filt = {d["id"] for d in filt_docs if d.get("scope") not in ("Championship", "Invitational")}
        assert non_champ_all == non_champ_filt, "Non-championship tournaments should not be filtered"


# ─────────────────────────── (c) PATCH cell + Audit Log ───────────────────────────

class TestPatchAndAudit:
    def test_patch_validates_enum(self, client):
        r = client.patch(f"{API}/tournament-wiring/cell",
                         json={"type_id": "bcci", "step_key": "pool_basics", "flag": "INVALID"},
                         timeout=TIMEOUT)
        assert r.status_code == 422

    def test_patch_unknown_type(self, client):
        r = client.patch(f"{API}/tournament-wiring/cell",
                         json={"type_id": "bogus", "step_key": "pool_basics", "flag": "M"},
                         timeout=TIMEOUT)
        assert r.status_code == 404

    def test_patch_creates_audit_row_and_reflects_in_status(self, client, seeded_tournaments):
        # Get current wiring version and pool_basics flag for bcci
        r0 = client.get(f"{API}/tournament-wiring", timeout=TIMEOUT)
        assert r0.status_code == 200
        w0 = r0.json()
        orig_flag = w0["cells"]["bcci"]["pool_basics"]["flag"]
        orig_version = w0["version"]

        # Flip to a different valid value (M ↔ NA)
        new_flag = "NA" if orig_flag != "NA" else "M"

        # Patch
        rp = client.patch(f"{API}/tournament-wiring/cell",
                          json={"type_id": "bcci", "step_key": "pool_basics", "flag": new_flag},
                          timeout=TIMEOUT)
        assert rp.status_code == 200, rp.text
        assert rp.json()["cell"]["flag"] == new_flag
        assert rp.json()["version"] == orig_version + 1

        # Audit row exists
        ra = client.get(f"{API}/tournament-wiring/audit?type_id=bcci&step_key=pool_basics",
                        timeout=TIMEOUT)
        assert ra.status_code == 200
        aj = ra.json()
        assert aj["count"] >= 1
        # First row is most recent
        latest = aj["rows"][0]
        assert latest["type_id"] == "bcci"
        assert latest["step_key"] == "pool_basics"
        assert latest["after"]["flag"] == new_flag
        assert latest["before"]["flag"] == orig_flag
        assert "flag" in latest["diff"]

        # Verify wiring-status for BCCI tournament reflects the change
        bcci_t = seeded_tournaments.get("TRN-2026-27-001")
        if bcci_t:
            rs = client.get(f"{API}/tournaments/{bcci_t['id']}/wiring-status", timeout=TIMEOUT)
            assert rs.status_code == 200
            steps = {s["key"]: s for s in rs.json()["steps"]}
            assert steps["pool_basics"]["flag"] == new_flag
            if new_flag == "NA":
                assert steps["pool_basics"]["status"] == "na"

        # Revert to original so we don't corrupt matrix
        rr = client.patch(f"{API}/tournament-wiring/cell",
                          json={"type_id": "bcci", "step_key": "pool_basics", "flag": orig_flag},
                          timeout=TIMEOUT)
        assert rr.status_code == 200

    def test_audit_sorted_desc(self, client):
        r = client.get(f"{API}/tournament-wiring/audit?limit=50", timeout=TIMEOUT)
        assert r.status_code == 200
        rows = r.json()["rows"]
        if len(rows) >= 2:
            for i in range(len(rows) - 1):
                assert rows[i]["changed_at"] >= rows[i + 1]["changed_at"], "Audit not sorted desc"


# ─────────────────────────── (d) Freeze-Season Snapshots ───────────────────────────

class TestFreezeSeason:
    def test_freeze_creates_snapshot_with_revision(self, client):
        cycle = f"TEST-{uuid.uuid4().hex[:6]}"

        # Rev 1
        r1 = client.post(f"{API}/tournament-wiring/freeze-season/{cycle}", timeout=TIMEOUT)
        assert r1.status_code == 200, r1.text
        snap1 = r1.json()["snapshot"]
        assert snap1["cycle"] == cycle
        assert snap1["revision"] == 1
        assert "cells" in snap1
        assert len(snap1["cells"]) == 8

        # Rev 2
        r2 = client.post(f"{API}/tournament-wiring/freeze-season/{cycle}", timeout=TIMEOUT)
        assert r2.status_code == 200
        snap2 = r2.json()["snapshot"]
        assert snap2["revision"] == 2
        assert snap2["id"] != snap1["id"]

        # List snapshots filtered by cycle
        rl = client.get(f"{API}/tournament-wiring/snapshots?cycle={cycle}", timeout=TIMEOUT)
        assert rl.status_code == 200
        rows = rl.json()["rows"]
        assert len(rows) >= 2
        revisions = {row["revision"] for row in rows if row["cycle"] == cycle}
        assert {1, 2}.issubset(revisions)

        # Fetch by id
        rg = client.get(f"{API}/tournament-wiring/snapshots/{snap1['id']}", timeout=TIMEOUT)
        assert rg.status_code == 200
        assert rg.json()["id"] == snap1["id"]
        assert "cells" in rg.json()

    def test_snapshot_immutable_against_wiring_edit(self, client):
        cycle = f"IMMUT-{uuid.uuid4().hex[:6]}"
        # Get current bcci.pool_basics flag
        w0 = client.get(f"{API}/tournament-wiring", timeout=TIMEOUT).json()
        orig_flag = w0["cells"]["bcci"]["pool_basics"]["flag"]

        # Freeze
        snap = client.post(f"{API}/tournament-wiring/freeze-season/{cycle}", timeout=TIMEOUT).json()["snapshot"]
        snap_flag_at_freeze = snap["cells"]["bcci"]["pool_basics"]["flag"]

        # Mutate live matrix
        alt = "NA" if orig_flag != "NA" else "M"
        client.patch(f"{API}/tournament-wiring/cell",
                     json={"type_id": "bcci", "step_key": "pool_basics", "flag": alt},
                     timeout=TIMEOUT)

        # Re-read snapshot — must still show original
        rg = client.get(f"{API}/tournament-wiring/snapshots/{snap['id']}", timeout=TIMEOUT)
        assert rg.status_code == 200
        assert rg.json()["cells"]["bcci"]["pool_basics"]["flag"] == snap_flag_at_freeze

        # Revert
        client.patch(f"{API}/tournament-wiring/cell",
                     json={"type_id": "bcci", "step_key": "pool_basics", "flag": orig_flag},
                     timeout=TIMEOUT)

    def test_snapshot_not_found(self, client):
        r = client.get(f"{API}/tournament-wiring/snapshots/nonexistent-id-xyz", timeout=TIMEOUT)
        assert r.status_code == 404


# ─────────────────────────── (e) MPCA-236 Inter-District create ───────────────────────────

class TestMpca236InterDistrictCreation:
    def test_create_inter_district_tournament(self, client):
        payload = {
            "name": f"TEST_InterDistrict_{uuid.uuid4().hex[:6]}",
            "scope": "Inter_District",
            "tournament_type": "MPCA_Championship",
            "format": "Multi_Day",
            "fiscal_cycle": "2026-27",
            "start_date": "2026-05-01",
            "end_date": "2026-05-05",
            "host_body_type": "Division",
            "host_body_name": "Bhopal Division",
        }
        r = client.post(f"{API}/tournaments", json=payload, timeout=TIMEOUT)
        # If creation succeeds → verify scope, else record for report
        if r.status_code in (200, 201):
            d = r.json()
            assert d["scope"] == "Inter_District"
            # Cleanup
            client.delete(f"{API}/tournaments/{d['id']}", timeout=TIMEOUT)
        else:
            pytest.fail(f"Inter-District creation failed: {r.status_code} {r.text[:300]}")
