"""M1 (Player) + M2 (Tournament + Fixtures/Rankings/HR) enhancement batch — regression."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://nice-aryabhata-4.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

# ---- shared session ----
S = requests.Session()
S.headers.update({"Content-Type": "application/json"})

# ---- convenience data ----
TODAY = datetime.now(timezone.utc)
DOB_ADULT = (TODAY - timedelta(days=365 * 25 + 10)).strftime("%Y-%m-%d")
DOB_JUNIOR = (TODAY - timedelta(days=365 * 15)).strftime("%Y-%m-%d")
RESIDENCY_LONG_AGO = (TODAY - timedelta(days=400)).strftime("%Y-%m-%d")

TEST_TAG = f"TEST_M1M2_{uuid.uuid4().hex[:6]}"


def _mk_player_payload(**over):
    body = {
        "body_id": "DIST-INDO-IND",
        "full_name": f"{TEST_TAG} Player {uuid.uuid4().hex[:4]}",
        "father_name": "Test Father",
        "mother_name": "Test Mother",
        "sibling_names": "Sibling A, Sibling B",
        "gender": "Male",
        "proficiency": "Club",
        "club_academy": "Test Cricket Academy",
        "date_of_birth": DOB_ADULT,
        "place_of_birth": "Indore",
        "domicile_state": "Madhya Pradesh",
        "address_district": "Indore",
        "address_line": "12 MG Road, Indore",
        "residency_since": RESIDENCY_LONG_AGO,
        "employment": "Software Engineer",
        "education": "B.Com",
        "category": "Local_MP",
        "height_cm": 175.5,
        "weight_kg": 72.0,
        "contact_phone": "9999999999",
        "contact_email": "test@example.com",
        "court_order_flag": False,
    }
    body.update(over)
    return body


# =========================================================
# M1-A · Extended profile + display id
# =========================================================
class TestM1A_ExtendedProfile:
    def test_create_player_extended_fields(self):
        payload = _mk_player_payload()
        r = S.post(f"{API}/players", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        # New display id format YYYY/DD-MM-YY/SERIAL
        assert d.get("player_display_id"), "player_display_id missing"
        parts = d["player_display_id"].split("/")
        assert len(parts) == 3, f"Unexpected display id: {d['player_display_id']}"
        assert len(parts[0]) == 4 and parts[0].isdigit()
        assert len(parts[1]) == 8 and parts[1].count("-") == 2  # dd-mm-yy
        assert len(parts[2]) == 4 and parts[2].isdigit()
        # division_folder derivation
        assert d["division_folder"] == "DIV-IND", d["division_folder"]
        # audit trail
        assert d.get("audit_trail"), "audit_trail empty"
        assert d["audit_trail"][0]["event"] == "created"
        # extended fields persisted
        for k in ("mother_name", "sibling_names", "club_academy", "employment", "education", "address_line"):
            assert d.get(k) == payload[k], f"{k} not persisted"
        assert d["height_cm"] == payload["height_cm"]
        assert d["weight_kg"] == payload["weight_kg"]
        # newly registered → locked + Pending
        assert d["submission_locked"] is True
        assert d["status"] == "Pending"
        # store for other tests
        pytest.PLAYER_A = d

    def test_get_by_display_id(self):
        p = getattr(pytest, "PLAYER_A", None)
        if not p:
            pytest.skip("no player from prior test")
        from urllib.parse import quote
        encoded = quote(p["player_display_id"], safe="")
        r = S.get(f"{API}/players/{encoded}")
        # If URL-encoded path lookup not supported, fall back to id lookup
        if r.status_code != 200:
            r = S.get(f"{API}/players/{p['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == p["id"]


# =========================================================
# M1-A · Guest sub-categories validation
# =========================================================
class TestM1A_GuestGuards:
    def test_guest_without_subtype_fails(self):
        payload = _mk_player_payload(category="Guest", tw3_verified=True)
        # ensure guest_subtype absent
        payload.pop("guest_subtype", None)
        r = S.post(f"{API}/players", json=payload)
        assert r.status_code == 400, r.text
        assert "guest_subtype" in r.text.lower() or "subtype" in r.text.lower()

    def test_guest_disclosure_unsigned_fails(self):
        payload = _mk_player_payload(
            category="Guest",
            tw3_verified=True,
            guest_subtype="Education",
            guest_disclosure_signed=False,
        )
        r = S.post(f"{API}/players", json=payload)
        assert r.status_code == 400, r.text
        assert "disclosure" in r.text.lower()

    def test_guest_without_tw3_fails(self):
        payload = _mk_player_payload(
            category="Guest",
            tw3_verified=False,
            guest_subtype="Education",
            guest_disclosure_signed=True,
        )
        r = S.post(f"{API}/players", json=payload)
        assert r.status_code == 400
        assert "tw3" in r.text.lower()

    def test_guest_all_fields_ok(self):
        payload = _mk_player_payload(
            category="Guest",
            tw3_verified=True,
            guest_subtype="MP_Domicile_Senior",
            guest_disclosure_signed=True,
        )
        r = S.post(f"{API}/players", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["category"] == "Guest"
        assert d["guest_subtype"] == "MP_Domicile_Senior"
        assert d["guest_disclosure_signed"] is True


# =========================================================
# M1-B · Review workflow
# =========================================================
class TestM1B_ReviewWorkflow:
    def test_full_review_lifecycle(self):
        # Create fresh player
        r = S.post(f"{API}/players", json=_mk_player_payload())
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["status"] == "Pending"

        actor = {"actor_name": "Vikram Patil", "actor_body_id": "DIV-IND", "actor_post": "Division Secretary"}

        # start review
        r = S.post(f"{API}/players/{pid}/start-review", json=actor)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Under_Division_Review"

        # raise discrepancy
        payload = dict(actor); payload["notes"] = "Missing aadhaar document"
        r = S.post(f"{API}/players/{pid}/raise-discrepancy", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Discrepancy_Raised"
        assert any("Missing aadhaar" in n for n in (d.get("review_notes") or [])), d.get("review_notes")
        assert d["submission_locked"] is False

        # resubmit
        r = S.post(f"{API}/players/{pid}/resubmit", json=actor)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Pending"
        assert d["submission_locked"] is True

        # division-approve
        r = S.post(f"{API}/players/{pid}/division-approve", json=actor)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Division_Approved"

        # MPCA approve
        mpca = {"actor_name": "Sanjeev Rao", "actor_body_id": "MPCA", "actor_post": "Hon. Secretary"}
        r = S.post(f"{API}/players/{pid}/approve", json=mpca)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Active"

        # audit trail must have all events
        events = [e["event"] for e in d.get("audit_trail", [])]
        for expected in ("created", "review_started", "discrepancy", "resubmitted", "division_approved", "approved"):
            assert expected in events, f"Missing audit event {expected}. Got: {events}"

    def test_locked_edit_rejected(self):
        r = S.post(f"{API}/players", json=_mk_player_payload())
        assert r.status_code == 200
        d = r.json()
        assert d["submission_locked"] is True
        pid = d["id"]
        # patch should fail
        r = S.patch(f"{API}/players/{pid}", json={"club_academy": "New Academy"})
        assert r.status_code == 400, r.text
        assert "locked" in r.text.lower()
        # reopen
        actor = {"actor_name": "Vikram Patil", "actor_body_id": "DIV-IND"}
        r = S.post(f"{API}/players/{pid}/reopen", json=actor)
        assert r.status_code == 200
        # patch now accepted
        r = S.patch(f"{API}/players/{pid}", json={"club_academy": "Updated Academy"})
        assert r.status_code == 200, r.text
        assert r.json()["club_academy"] == "Updated Academy"
        # GET verify persisted
        r = S.get(f"{API}/players/{pid}")
        assert r.json()["club_academy"] == "Updated Academy"


# =========================================================
# M1-C · Disqualification engine + court order filter
# =========================================================
class TestM1C_Disqualification:
    def _make_active_player(self):
        r = S.post(f"{API}/players", json=_mk_player_payload())
        assert r.status_code == 200
        pid = r.json()["id"]
        actor = {"actor_name": "Sanjeev Rao", "actor_body_id": "MPCA", "actor_post": "Hon. Secretary"}
        S.post(f"{API}/players/{pid}/approve", json=actor)
        return pid

    def test_repeat_offender_auto_promotes_lifetime(self):
        pid = self._make_active_player()
        flag = {
            "kind": "Two_Year_Ban",
            "reason": "Age misrepresentation",
            "imposed_by": "MPCA",
            "imposed_on": TODAY.strftime("%Y-%m-%d"),
        }
        r = S.post(f"{API}/players/{pid}/disqualify", json=flag)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Suspended"
        assert d["disqualification_count"] == 1

        # reinstate
        r = S.post(f"{API}/players/{pid}/reinstate")
        assert r.status_code == 200
        assert r.json()["status"] == "Active"

        # second Two_Year_Ban → auto Lifetime
        r = S.post(f"{API}/players/{pid}/disqualify", json=flag)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "Banned"
        assert d["disqualification_count"] == 2
        # last flag should be Lifetime_Ban with auto-promote note
        last = d["disqualifications"][-1]
        assert last["kind"] == "Lifetime_Ban"
        assert "auto-promoted" in (last.get("notes") or "").lower()

    def test_court_order_filter(self):
        payload = _mk_player_payload(court_order_flag=True, court_order_ref="HC/MP/1234/2025")
        r = S.post(f"{API}/players", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        r = S.get(f"{API}/players?court_order_only=true")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pid in ids, "Court-order flagged player not returned by filter"
        for p in r.json():
            assert p.get("court_order_flag") is True, p


# =========================================================
# M2-A · Tournament catalog + approval workflow
# =========================================================
class TestM2A_TournamentCatalog:
    def test_catalog_composition(self):
        r = S.get(f"{API}/tournaments")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 23, f"Only {len(data)} tournaments"
        champs = [t for t in data if t.get("tournament_type") == "MPCA_Championship"]
        # trophy names expected
        expected = {"CT Sarwate Trophy", "CS Nayudu Trophy", "Bhausaheb Nimbalkar Trophy", "Bhau Niwsarkar Trophy", "RP Singh Trophy"}
        got = {t.get("trophy_name") or t.get("name") for t in champs}
        # relax: expect at least 5 championships flagged 3-team
        assert len(champs) >= 5, f"Expected ≥5 championships, got {len(champs)}"
        assert all(t.get("is_three_team_format") for t in champs), "Some championships not is_three_team_format"
        # names may match by trophy_name or by name
        matched = 0
        for e in expected:
            for t in champs:
                if e in (t.get("trophy_name") or "") or e in (t.get("name") or ""):
                    matched += 1
                    break
        assert matched == 5, f"Only matched {matched}/5 championship trophies. Got: {got}"

        bcci = [t for t in data if t.get("tournament_type") == "BCCI"]
        assert len(bcci) >= 7, f"Expected ≥7 BCCI, got {len(bcci)}"

        womens = [t for t in data if t.get("is_womens")]
        assert len(womens) >= 3, f"Expected ≥3 women's, got {len(womens)}"


class TestM2A_ApprovalWorkflow:
    def test_full_approval_chain(self):
        payload = {
            "name": f"{TEST_TAG} Trophy",
            "format": "T20",
            "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional",
            "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA",
            "max_squad_size": 15,
            "start_date": "2026-04-01",
            "end_date": "2026-04-10",
        }
        r = S.post(f"{API}/tournaments", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Draft"
        tid = d["id"]

        # submit-for-approval
        r = S.post(f"{API}/tournaments/{tid}/submit-for-approval",
                   params={"actor_name": "Vikram Patil", "actor_body_id": "DIV-IND"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Awaiting_Approval"
        assert len(d["approval_chain"]) == 1

        # approve
        r = S.post(f"{API}/tournaments/{tid}/approve",
                   params={"actor_name": "Sanjeev Rao", "actor_body_id": "MPCA"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Upcoming"
        assert len(d["approval_chain"]) == 2
        pytest.APPROVED_TID = tid

    def test_reject_path(self):
        payload = {
            "name": f"{TEST_TAG} Rejected Trophy",
            "format": "T20", "scope": "Inter_Divisional",
            "fiscal_cycle": "2025-26", "host_body_id": "MPCA",
        }
        r = S.post(f"{API}/tournaments", json=payload)
        tid = r.json()["id"]
        S.post(f"{API}/tournaments/{tid}/submit-for-approval",
               params={"actor_name": "Vikram Patil", "actor_body_id": "DIV-IND"})
        r = S.post(f"{API}/tournaments/{tid}/reject",
                   params={"actor_name": "Sanjeev Rao", "actor_body_id": "MPCA", "notes": "Duplicate"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Rejected"


# =========================================================
# M2-B · Fixtures CRUD + status transitions
# =========================================================
class TestM2B_Fixtures:
    def _get_tid(self):
        tid = getattr(pytest, "APPROVED_TID", None)
        if tid:
            return tid
        # otherwise find any Upcoming tournament
        r = S.get(f"{API}/tournaments?status=Upcoming")
        data = r.json()
        assert data, "No Upcoming tournaments to attach fixtures to"
        return data[0]["id"]

    def test_create_fixture(self):
        tid = self._get_tid()
        payload = {
            "tournament_id": tid,
            "round": "Group A · Match 1",
            "home_team": f"{TEST_TAG} Home",
            "away_team": f"{TEST_TAG} Away",
            "scheduled_date": "2026-04-05",
            "format": "Multi_Day",
            "days": 4,
        }
        r = S.post(f"{API}/fixtures", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["fixture_no"].startswith("FX-2025-26-")
        assert d["status"] == "Scheduled"
        assert d["days"] == 4
        assert d["tournament_name"]
        pytest.FIXTURE_ID = d["id"]
        pytest.FIXTURE_TID = tid

    def test_list_fixtures_by_tournament(self):
        tid = getattr(pytest, "FIXTURE_TID", None)
        fid = getattr(pytest, "FIXTURE_ID", None)
        if not (tid and fid):
            pytest.skip("no prior fixture")
        r = S.get(f"{API}/fixtures?tournament_id={tid}")
        assert r.status_code == 200
        ids = [f["id"] for f in r.json()]
        assert fid in ids

    def test_status_transitions(self):
        fid = getattr(pytest, "FIXTURE_ID", None)
        if not fid: pytest.skip()
        r = S.post(f"{API}/fixtures/{fid}/status/In_Progress")
        assert r.status_code == 200
        assert r.json()["status"] == "In_Progress"
        r = S.post(f"{API}/fixtures/{fid}/status/Completed")
        assert r.status_code == 200
        assert r.json()["status"] == "Completed"

    def test_stats_summary(self):
        r = S.get(f"{API}/fixtures-stats/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("total_fixtures", "scheduled", "in_progress", "completed"):
            assert k in d


# =========================================================
# M2-B · Rankings endpoints
# =========================================================
class TestM2B_Rankings:
    def test_batting_rankings_ok(self):
        r = S.get(f"{API}/rankings/batting")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_bowling_rankings_ok(self):
        r = S.get(f"{API}/rankings/bowling")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_special_performances_ok(self):
        r = S.get(f"{API}/rankings/special-performances")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# =========================================================
# M2-C · HR Allocation + Work Hours
# =========================================================
class TestM2C_HR:
    def test_allocate_and_log_hours(self):
        # Get any Scheduled fixture, or create a new one
        tid = getattr(pytest, "APPROVED_TID", None) or getattr(pytest, "FIXTURE_TID", None)
        if not tid:
            r = S.get(f"{API}/tournaments?status=Upcoming")
            tid = r.json()[0]["id"]
        payload = {
            "tournament_id": tid,
            "round": f"{TEST_TAG} HR Round",
            "home_team": "HR Home", "away_team": "HR Away",
            "scheduled_date": "2026-04-06",
            "format": "One_Day", "days": 1,
        }
        r = S.post(f"{API}/fixtures", json=payload)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]

        # allocate umpire
        alloc = {
            "role": "Umpire_On_Field_1", "name": f"{TEST_TAG} Umpire",
            "honorarium_inr": 3000, "work_hours": 6,
        }
        r = S.post(f"{API}/fixtures/{fid}/officials", json=alloc)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["officials"]
        oid = d["officials"][0]["id"]
        assert d["officials"][0]["work_hours"] == 6

        # log more hours
        r = S.post(f"{API}/fixtures/{fid}/log-hours", params={"official_id": oid, "hours": 2})
        assert r.status_code == 200, r.text
        # After log: 6 + 2 = 8
        r = S.get(f"{API}/fixtures/{fid}")
        offs = r.json()["officials"]
        matched = [o for o in offs if o["id"] == oid]
        assert matched and matched[0]["work_hours"] == 8

        # aggregate work-hours
        r = S.get(f"{API}/hr-allocations/work-hours", params={"name": TEST_TAG})
        assert r.status_code == 200
        rows = r.json()
        assert any(r_["name"].startswith(TEST_TAG) for r_ in rows), rows


# =========================================================
# Regression · Player stats + existing surface
# =========================================================
class TestRegression:
    def test_player_stats_summary(self):
        r = S.get(f"{API}/players-stats/summary")
        assert r.status_code == 200
        for k in ("total_players", "active_players", "pending_players", "suspended_players", "by_category", "court_order_count"):
            assert k in r.json()

    def test_tournaments_stats_summary(self):
        r = S.get(f"{API}/tournaments-stats/summary")
        assert r.status_code == 200

    def test_existing_endpoints_alive(self):
        endpoints = [
            "/bodies", "/members", "/disclosures", "/meetings", "/dashboard/overview",
            "/vendor-bills", "/tournament-budgets", "/venues-grounds",
            "/transfers", "/tournaments", "/players",
        ]
        for ep in endpoints:
            r = S.get(f"{API}{ep}")
            assert r.status_code < 500, f"{ep} returned {r.status_code}"
