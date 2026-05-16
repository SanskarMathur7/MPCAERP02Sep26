"""MPCA ERP Phase 2 backend tests — Meetings, Elections, Public Verify.

Modules covered:
- Meetings CRUD + filters + meeting_no auto-generation + resolutions
- Elections CRUD + candidates + vote (happy/duplicate/inactive/closed) + conclude
- Public verify endpoint
- Dashboard new fields (upcoming_meetings, elections_open)
"""
import os
import re
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


_created_meeting_ids: list[str] = []
_created_election_ids: list[str] = []


@pytest.fixture(scope="session", autouse=True)
def _cleanup(client):
    yield
    for mid in _created_meeting_ids:
        try:
            client.delete(f"{API}/meetings/{mid}", timeout=10)
        except Exception:
            pass


# ---------------- Meetings ----------------

class TestMeetings:
    def test_list_seeded(self, client):
        r = client.get(f"{API}/meetings", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 3
        types = {m["meeting_type"] for m in items}
        assert {"AGM", "Committee", "Sub_Committee"}.issubset(types)
        for m in items:
            assert "_id" not in m
            assert "id" in m and "meeting_no" in m

    def test_filter_by_type_agm(self, client):
        r = client.get(f"{API}/meetings", params={"meeting_type": "AGM"}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for m in items:
            assert m["meeting_type"] == "AGM"
            assert m["meeting_no"].startswith("AGM-")

    def test_create_meeting_auto_no(self, client):
        payload = {
            "title": "TEST_Sub-Committee Finance Review",
            "meeting_type": "Sub_Committee",
            "scheduled_date": "2026-04-10",
            "scheduled_time": "10:00 AM",
            "venue": "TEST Boardroom",
            "quorum_required": 4,
            "agenda": [
                {"number": 1, "title": "TEST agenda item 1"},
                {"number": 2, "title": "TEST agenda item 2"},
            ],
        }
        r = client.post(f"{API}/meetings", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["title"] == payload["title"]
        # Format SC-YYYY-NNN
        assert re.match(r"^SC-\d{4}-\d{3}$", m["meeting_no"]), f"Bad meeting_no: {m['meeting_no']}"
        assert m["status"] == "Scheduled"
        assert len(m["agenda"]) == 2
        _created_meeting_ids.append(m["id"])

        # GET single
        r2 = client.get(f"{API}/meetings/{m['id']}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["meeting_no"] == m["meeting_no"]

    def test_patch_status_advancement(self, client):
        assert _created_meeting_ids, "need prior meeting"
        mid = _created_meeting_ids[0]
        # Need to send full body since PATCH uses MeetingCreate
        full = client.get(f"{API}/meetings/{mid}").json()
        full["status"] = "Notice_Issued"
        r = client.patch(f"{API}/meetings/{mid}", json=full, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Notice_Issued"

        g = client.get(f"{API}/meetings/{mid}", timeout=15).json()
        assert g["status"] == "Notice_Issued"

    def test_resolutions_empty_for_scheduled(self, client):
        # Use an AGM seeded meeting
        meetings = client.get(f"{API}/meetings", params={"meeting_type": "AGM"}).json()
        mid = meetings[0]["id"]
        r = client.get(f"{API}/meetings/{mid}/resolutions", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_add_resolution(self, client):
        assert _created_meeting_ids, "need prior meeting"
        mid = _created_meeting_ids[0]
        payload = {
            "meeting_id": mid,
            "number": 1,
            "title": "TEST_Resolution",
            "text": "Resolved that this is a TEST resolution.",
            "proposed_by": "MPCA-IND-0001",
            "seconded_by": "MPCA-IND-0002",
            "status": "Carried",
        }
        r = client.post(f"{API}/meetings/{mid}/resolutions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["title"] == "TEST_Resolution"
        assert res["meeting_id"] == mid

        lst = client.get(f"{API}/meetings/{mid}/resolutions").json()
        assert any(x["id"] == res["id"] for x in lst)

    def test_delete_cascades_resolutions(self, client):
        # Create new meeting, add resolution, delete meeting, ensure resolutions gone.
        m = client.post(f"{API}/meetings", json={
            "title": "TEST_To Delete", "meeting_type": "Committee",
            "scheduled_date": "2026-05-01", "venue": "TEST",
            "quorum_required": 5,
        }).json()
        mid = m["id"]
        client.post(f"{API}/meetings/{mid}/resolutions", json={
            "meeting_id": mid, "number": 1, "title": "TEST_R", "text": "x",
        })
        d = client.delete(f"{API}/meetings/{mid}")
        assert d.status_code == 200
        # Confirm resolutions gone
        lst = client.get(f"{API}/meetings/{mid}/resolutions").json()
        assert lst == []


# ---------------- Elections ----------------

class TestElections:
    @pytest.fixture(scope="class")
    def seeded_election(self, client):
        elections = client.get(f"{API}/elections").json()
        assert elections, "expected at least one seeded election"
        return elections[0]

    def test_list_seeded(self, client):
        r = client.get(f"{API}/elections", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert any(e["status"] == "Voting_Open" for e in items)

    def test_candidates_seeded(self, client, seeded_election):
        r = client.get(f"{API}/elections/{seeded_election['id']}/candidates")
        assert r.status_code == 200
        cands = r.json()
        assert len(cands) >= 2

    def test_create_election_eligible_count(self, client):
        payload = {
            "title": "TEST_Election President",
            "post": "President",
            "tenure_years": 4,
            "cooling_period_years": 4,
            "electoral_officer": "TEST Officer",
            "nomination_open_date": "2026-06-01",
            "nomination_close_date": "2026-06-30",
            "voting_date": "2026-07-15",
            "status": "Announced",
        }
        r = client.post(f"{API}/elections", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["title"] == payload["title"]
        # eligible_voters_count should equal number of active members (>=6 from seed)
        assert e["eligible_voters_count"] >= 6
        _created_election_ids.append(e["id"])

    def test_add_candidate_validates_uid(self, client):
        assert _created_election_ids
        eid = _created_election_ids[0]
        bad = client.post(f"{API}/elections/{eid}/candidates", json={
            "election_id": eid, "member_uid": "MPCA-XXX-9999", "member_name": "TEST",
        })
        assert bad.status_code == 404

        good = client.post(f"{API}/elections/{eid}/candidates", json={
            "election_id": eid, "member_uid": "MPCA-PAT-0001", "member_name": "ignored",
            "manifesto": "TEST",
        })
        assert good.status_code == 200, good.text
        c = good.json()
        # Backend overrides with real name
        assert c["member_uid"] == "MPCA-PAT-0001"
        assert c["member_name"] == "Shri Devendra Bundela"

    def test_vote_rejected_when_election_not_open(self, client):
        # the newly created election is "Announced"
        assert _created_election_ids
        eid = _created_election_ids[0]
        cands = client.get(f"{API}/elections/{eid}/candidates").json()
        assert cands
        r = client.post(f"{API}/elections/{eid}/vote", json={
            "election_id": eid, "candidate_id": cands[0]["id"], "voter_uid": "MPCA-IND-0002",
        })
        assert r.status_code == 400

    def test_vote_happy_path_and_duplicate(self, client, seeded_election):
        eid = seeded_election["id"]
        cands = client.get(f"{API}/elections/{eid}/candidates").json()
        assert cands
        cand = cands[0]
        before = cand["votes_received"]

        # Pick an active voter that likely hasn't voted yet
        candidate_voters = ["MPCA-IND-0002", "MPCA-HON-0001", "MPCA-PAT-0001", "MPCA-INS-0002", "MPCA-INS-0001"]
        chosen_voter = None
        for v in candidate_voters:
            rr = client.post(f"{API}/elections/{eid}/vote", json={
                "election_id": eid, "candidate_id": cand["id"], "voter_uid": v,
            })
            if rr.status_code == 200:
                chosen_voter = v
                break
        assert chosen_voter, "no eligible voter available - all voters may have already voted"

        # Duplicate
        dup = client.post(f"{API}/elections/{eid}/vote", json={
            "election_id": eid, "candidate_id": cand["id"], "voter_uid": chosen_voter,
        })
        assert dup.status_code == 400

        # Vote count incremented
        after_cands = client.get(f"{API}/elections/{eid}/candidates").json()
        after = next(c for c in after_cands if c["id"] == cand["id"])["votes_received"]
        assert after >= before + 1

    def test_vote_rejects_non_active(self, client, seeded_election):
        # MPCA-IND-0003 is Pending in seed
        eid = seeded_election["id"]
        cands = client.get(f"{API}/elections/{eid}/candidates").json()
        r = client.post(f"{API}/elections/{eid}/vote", json={
            "election_id": eid, "candidate_id": cands[0]["id"], "voter_uid": "MPCA-IND-0003",
        })
        assert r.status_code == 400

    def test_conclude_election(self, client):
        # Create a fresh election, add 2 candidates, set Voting_Open, cast one vote, conclude.
        e = client.post(f"{API}/elections", json={
            "title": "TEST_Conclude Election",
            "post": "Secretary",
            "tenure_years": 4, "cooling_period_years": 4,
            "electoral_officer": "TEST",
            "nomination_open_date": "2026-01-01",
            "nomination_close_date": "2026-01-15",
            "voting_date": "2026-02-01",
            "status": "Voting_Open",
        }).json()
        eid = e["id"]
        _created_election_ids.append(eid)

        c1 = client.post(f"{API}/elections/{eid}/candidates", json={
            "election_id": eid, "member_uid": "MPCA-PAT-0001", "member_name": "x",
        }).json()
        c2 = client.post(f"{API}/elections/{eid}/candidates", json={
            "election_id": eid, "member_uid": "MPCA-HON-0001", "member_name": "x",
        }).json()

        # Vote for c1 to make them winner
        vr = client.post(f"{API}/elections/{eid}/vote", json={
            "election_id": eid, "candidate_id": c1["id"], "voter_uid": "MPCA-INS-0002",
        })
        assert vr.status_code == 200, vr.text

        cr = client.post(f"{API}/elections/{eid}/conclude")
        assert cr.status_code == 200, cr.text
        assert cr.json()["ok"] is True

        elec = client.get(f"{API}/elections/{eid}").json()
        assert elec["status"] == "Concluded"

        cands = client.get(f"{API}/elections/{eid}/candidates").json()
        cands_by_id = {c["id"]: c for c in cands}
        assert cands_by_id[c1["id"]]["status"] == "Elected"
        assert cands_by_id[c2["id"]]["status"] == "Defeated"


# ---------------- Verify ----------------

class TestVerify:
    def test_valid_active_uid(self, client):
        r = client.get(f"{API}/verify/MPCA-IND-0001", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["is_active"] is True
        assert data["uid"] == "MPCA-IND-0001"
        assert "name" in data and data["name"]
        assert data["category"] == "Individual"

    def test_pending_member_not_active(self, client):
        r = client.get(f"{API}/verify/MPCA-IND-0003")
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["is_active"] is False

    def test_invalid_uid(self, client):
        r = client.get(f"{API}/verify/MPCA-FOO-9999")
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is False
        assert data["uid"] == "MPCA-FOO-9999"


# ---------------- Dashboard new fields ----------------

class TestDashboardPhase2:
    def test_new_fields(self, client):
        r = client.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        data = r.json()
        assert "upcoming_meetings" in data
        assert "elections_open" in data
        assert isinstance(data["upcoming_meetings"], int)
        assert isinstance(data["elections_open"], int)
        # Seed has 1 Scheduled + 1 Notice_Issued + 1 Concluded meeting → upcoming >= 2
        assert data["upcoming_meetings"] >= 2
        assert data["elections_open"] >= 1
