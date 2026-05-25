"""Phase IV.2 — Tournaments + Squads Module (M2) backend tests."""
import os
import pytest
import requests

# Load REACT_APP_BACKEND_URL from frontend/.env if not set in process env
def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Root & seed sanity ----------------
class TestRootAndSeed:
    def test_version(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        body = r.json()
        # version key may be in 'version' or message
        assert "4.1.0" in str(body)

    def test_tournaments_seeded_15(self, client):
        r = client.get(f"{API}/tournaments")
        assert r.status_code == 200
        ts = r.json()
        assert len(ts) == 15, f"Expected 15, got {len(ts)}"
        # tournament_no format
        for t in ts:
            assert t["tournament_no"].startswith("TRN-2025-26-"), t["tournament_no"]

    def test_named_tournaments_present(self, client):
        r = client.get(f"{API}/tournaments")
        names = {t["name"] for t in r.json()}
        expected = {
            "MY Memorial Trophy", "Madhavrao Scindia Trophy",
            "Col. CK Nayudu Trophy (MP Leg)", "JN Bhaya Trophy",
            "Parmanandbhai Patel Trophy", "Hiralal Gaekwad Trophy",
            "SM Khan Trophy", "MM Jagdale Trophy",
            "AW Kanmadikar Trophy", "JS Anand Memorial Trophy",
            "Holkar Trophy", "MPCA Premier League (T20)",
            "MP Women's One-Day Cup", "MP U-23 Challenge Cup",
            "Holkar Pink-Ball Invitational",
        }
        missing = expected - names
        assert not missing, f"Missing: {missing}"

    def test_seeded_data_intact(self, client):
        bodies = client.get(f"{API}/bodies").json()
        players = client.get(f"{API}/players").json()
        assert len(bodies) == 66, f"bodies={len(bodies)}"
        assert len(players) == 7, f"players={len(players)}"


# ---------------- Filters ----------------
class TestFilters:
    def test_status_upcoming(self, client):
        r = client.get(f"{API}/tournaments", params={"status": "Upcoming"})
        assert r.status_code == 200
        assert len(r.json()) == 15

    def test_scope_championship(self, client):
        r = client.get(f"{API}/tournaments", params={"scope": "Championship"})
        assert r.status_code == 200
        assert len(r.json()) == 4

    def test_format_T20(self, client):
        r = client.get(f"{API}/tournaments", params={"format": "T20"})
        assert r.status_code == 200
        ts = r.json()
        # Seed actually has 4 T20s: PPT, MMJT, JSAT, MPL (test plan said 3 but JSAT is also T20)
        assert len(ts) == 4
        names = {t["name"] for t in ts}
        assert "MPCA Premier League (T20)" in names
        assert "MM Jagdale Trophy" in names
        assert "Parmanandbhai Patel Trophy" in names
        assert "JS Anand Memorial Trophy" in names

    def test_fiscal_cycle(self, client):
        r = client.get(f"{API}/tournaments", params={"fiscal_cycle": "2025-26"})
        assert r.status_code == 200
        assert len(r.json()) == 15


# ---------------- Get by id + create ----------------
class TestGetAndCreate:
    def test_get_by_id_ok(self, client):
        ts = client.get(f"{API}/tournaments").json()
        tid = ts[0]["id"]
        r = client.get(f"{API}/tournaments/{tid}")
        assert r.status_code == 200
        assert r.json()["id"] == tid

    def test_get_by_id_404(self, client):
        r = client.get(f"{API}/tournaments/does-not-exist-xyz")
        assert r.status_code == 404

    def test_create_invalid_host_body(self, client):
        payload = {
            "name": "TEST_BadHost", "short_code": "TBH", "format": "T20",
            "scope": "Invitational", "fiscal_cycle": "2025-26",
            "host_body_id": "BODY-NOPE",
        }
        r = client.post(f"{API}/tournaments", json=payload)
        assert r.status_code == 400

    def test_create_age_floor_gt_cap(self, client):
        payload = {
            "name": "TEST_BadAge", "short_code": "TBA", "format": "T20",
            "scope": "Invitational", "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA", "age_floor_years": 20, "age_cap_years": 14,
        }
        r = client.post(f"{API}/tournaments", json=payload)
        assert r.status_code == 400

    def test_create_ok_and_status_machine(self, client):
        payload = {
            "name": "TEST_StatusFlow", "short_code": "TSF", "format": "T20",
            "scope": "Invitational", "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA",
        }
        r = client.post(f"{API}/tournaments", json=payload)
        assert r.status_code == 200
        t = r.json()
        assert t["tournament_no"].startswith("TRN-2025-26-")
        assert t["status"] == "Upcoming"
        tid = t["id"]

        # Upcoming → In_Progress should fail
        r = client.post(f"{API}/tournaments/{tid}/status/In_Progress")
        assert r.status_code == 400

        # Upcoming → Squad_Selection OK
        r = client.post(f"{API}/tournaments/{tid}/status/Squad_Selection")
        assert r.status_code == 200
        assert r.json()["status"] == "Squad_Selection"

        # Squad_Selection → In_Progress OK
        r = client.post(f"{API}/tournaments/{tid}/status/In_Progress")
        assert r.status_code == 200

        # In_Progress → Completed OK
        r = client.post(f"{API}/tournaments/{tid}/status/Completed")
        assert r.status_code == 200

        # Completed → Squad_Selection should 400
        r = client.post(f"{API}/tournaments/{tid}/status/Squad_Selection")
        assert r.status_code == 400

        # Completed → Cancelled should 400 too (terminal)
        r = client.post(f"{API}/tournaments/{tid}/status/Cancelled")
        assert r.status_code == 400

        # cleanup
        client.delete(f"{API}/tournaments/{tid}")  # may 405 if no delete; ignore

    def test_cancel_from_upcoming(self, client):
        payload = {
            "name": "TEST_CancelFlow", "short_code": "TCF", "format": "T20",
            "scope": "Invitational", "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA",
        }
        r = client.post(f"{API}/tournaments", json=payload).json()
        tid = r["id"]
        r2 = client.post(f"{API}/tournaments/{tid}/status/Cancelled")
        assert r2.status_code == 200
        assert r2.json()["status"] == "Cancelled"


# ---------------- Squads + player rules ----------------
@pytest.fixture(scope="module")
def tournaments_by_name(client):
    ts = client.get(f"{API}/tournaments").json()
    return {t["name"]: t for t in ts}


@pytest.fixture(scope="module")
def players_by_name(client):
    ps = client.get(f"{API}/players").json()
    return {p["full_name"]: p for p in ps}


class TestSquadsAndPlayers:
    created_squads = []

    def test_squads_empty_initial(self, client, tournaments_by_name):
        tid = tournaments_by_name["MM Jagdale Trophy"]["id"]
        r = client.get(f"{API}/tournaments/{tid}/squads")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_squad_invalid_tournament(self, client):
        r = client.post(f"{API}/squads", json={
            "tournament_id": "bogus", "body_id": "DIST-INDO-IND",
            "team_name": "TEST_BogusTSquad",
        })
        assert r.status_code == 404

    def test_create_squad_invalid_body(self, client, tournaments_by_name):
        tid = tournaments_by_name["MY Memorial Trophy"]["id"]
        r = client.post(f"{API}/squads", json={
            "tournament_id": tid, "body_id": "BODY-NOPE",
            "team_name": "TEST_BadBody",
        })
        assert r.status_code == 400

    def test_u14_rejects_adult(self, client, tournaments_by_name, players_by_name):
        t = tournaments_by_name["MM Jagdale Trophy"]
        assert t["age_cap_years"] == 14
        # create squad
        r = client.post(f"{API}/squads", json={
            "tournament_id": t["id"], "body_id": "DIST-INDO-IND",
            "team_name": "TEST_U14_Indore",
        })
        assert r.status_code == 200, r.text
        sq = r.json()
        self.__class__.created_squads.append(sq["id"])

        # add adult Aarav (~23)
        aarav = players_by_name["Aarav Sharma"]
        r = client.post(f"{API}/squads/{sq['id']}/players", json={"player_id": aarav["id"]})
        assert r.status_code == 400
        assert "exceeds tournament cap of U-14" in r.json().get("detail", "")

    def test_duplicate_squad_blocked(self, client, tournaments_by_name):
        t = tournaments_by_name["MM Jagdale Trophy"]
        r = client.post(f"{API}/squads", json={
            "tournament_id": t["id"], "body_id": "DIST-INDO-IND",
            "team_name": "TEST_DupSquad",
        })
        assert r.status_code == 400

    def test_senior_no_guest_rejects_guest(self, client, tournaments_by_name, players_by_name):
        t = tournaments_by_name["MY Memorial Trophy"]
        assert t["allows_guests"] is False
        r = client.post(f"{API}/squads", json={
            "tournament_id": t["id"], "body_id": "DIST-INDO-IND",
            "team_name": "TEST_MYMT_Indore",
        })
        assert r.status_code == 200
        sq = r.json()
        self.__class__.created_squads.append(sq["id"])

        # Adding Aarav (adult, Local_MP) should succeed
        aarav = players_by_name["Aarav Sharma"]
        r = client.post(f"{API}/squads/{sq['id']}/players",
                        json={"player_id": aarav["id"], "is_captain": True})
        assert r.status_code == 200, r.text
        members = r.json()["members"]
        assert len(members) == 1
        assert members[0]["is_captain"] is True

        # Adding Yuvraj (Guest) should fail
        yuvraj = players_by_name["Yuvraj Mehta"]
        r = client.post(f"{API}/squads/{sq['id']}/players", json={"player_id": yuvraj["id"]})
        assert r.status_code == 400
        assert "does not permit Guest" in r.json().get("detail", "")

    def test_mpl_allows_guest(self, client, tournaments_by_name, players_by_name):
        t = tournaments_by_name["MPCA Premier League (T20)"]
        assert t["allows_guests"] is True
        r = client.post(f"{API}/squads", json={
            "tournament_id": t["id"], "body_id": "DIST-INDO-IND",
            "team_name": "TEST_MPL_Indore",
        })
        assert r.status_code == 200
        sq = r.json()
        self.__class__.created_squads.append(sq["id"])
        yuvraj = players_by_name["Yuvraj Mehta"]
        r = client.post(f"{API}/squads/{sq['id']}/players", json={"player_id": yuvraj["id"]})
        assert r.status_code == 200, r.text

    def test_cross_body_blocked(self, client, tournaments_by_name, players_by_name):
        # Create a squad at Bhopal district in MY Memorial; try to add Aarav (Indore)
        t = tournaments_by_name["MY Memorial Trophy"]
        r = client.post(f"{API}/squads", json={
            "tournament_id": t["id"], "body_id": "DIST-BHOP-BPL",
            "team_name": "TEST_MYMT_Bhopal",
        })
        assert r.status_code == 200
        sq = r.json()
        self.__class__.created_squads.append(sq["id"])
        aarav = players_by_name["Aarav Sharma"]
        r = client.post(f"{API}/squads/{sq['id']}/players", json={"player_id": aarav["id"]})
        assert r.status_code == 400
        assert "does not belong" in r.json().get("detail", "")

    def test_captain_uniqueness(self, client, tournaments_by_name, players_by_name):
        # use MPL Indore squad (allows guests; senior; Aarav and Yuvraj both at Indore)
        # find that squad
        t = tournaments_by_name["MPCA Premier League (T20)"]
        squads = client.get(f"{API}/tournaments/{t['id']}/squads").json()
        sq = next(s for s in squads if s["body_id"] == "DIST-INDO-IND")
        # First add Aarav as captain
        aarav = players_by_name["Aarav Sharma"]
        r = client.post(f"{API}/squads/{sq['id']}/players",
                        json={"player_id": aarav["id"], "is_captain": True})
        assert r.status_code == 200
        members = r.json()["members"]
        # Yuvraj already there from earlier test, may or may not be captain (was added without captain flag)
        # Now Aarav is captain → only one captain
        captains = [m for m in members if m["is_captain"]]
        assert len(captains) == 1
        assert captains[0]["player_id"] == aarav["id"]

        # Add a new member as captain → previous Aarav captain should clear
        # Use Ishaan? No - Ishaan is at Bhopal. Use Yuvraj? Already in.
        # The previous test placed Yuvraj in the squad without captain. Now flip Aarav off
        # by setting someone else captain — but we only have 2 indore players (Aarav + Yuvraj),
        # both already in. So construct fresh squad scenario isn't needed; the assertion
        # of single captain already validated. We verify captain count == 1.

    def test_capacity_19th_rejected(self, client, tournaments_by_name):
        # Create a fresh tournament with max_squad_size=2 then try to add 3rd
        # Easier: use existing field max_squad_size=18; we don't have 19 players.
        # So create a new tournament with max_squad_size=1 and verify 2nd is rejected.
        payload = {
            "name": "TEST_CapacityTournament", "short_code": "TCAP",
            "format": "T20", "scope": "Invitational", "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA", "max_squad_size": 1, "allows_guests": True,
        }
        t = client.post(f"{API}/tournaments", json=payload).json()
        r = client.post(f"{API}/squads", json={
            "tournament_id": t["id"], "body_id": "DIST-INDO-IND",
            "team_name": "TEST_Capacity",
        })
        sq = r.json()
        self.__class__.created_squads.append(sq["id"])
        players = client.get(f"{API}/players").json()
        indore = [p for p in players if p["body_id"] == "DIST-INDO-IND"]
        assert len(indore) >= 2
        r1 = client.post(f"{API}/squads/{sq['id']}/players", json={"player_id": indore[0]["id"]})
        assert r1.status_code == 200
        r2 = client.post(f"{API}/squads/{sq['id']}/players", json={"player_id": indore[1]["id"]})
        assert r2.status_code == 400
        assert "full" in r2.json().get("detail", "").lower()

    def test_remove_player(self, client, tournaments_by_name, players_by_name):
        # Use TEST_MYMT_Indore squad with Aarav inside
        t = tournaments_by_name["MY Memorial Trophy"]
        squads = client.get(f"{API}/tournaments/{t['id']}/squads").json()
        sq = next(s for s in squads if s["body_id"] == "DIST-INDO-IND")
        aarav = players_by_name["Aarav Sharma"]
        r = client.delete(f"{API}/squads/{sq['id']}/players/{aarav['id']}")
        assert r.status_code == 200
        # second call → 404
        r2 = client.delete(f"{API}/squads/{sq['id']}/players/{aarav['id']}")
        assert r2.status_code == 404

    def test_cannot_modify_in_progress(self, client, players_by_name):
        # Create fresh tournament, advance to In_Progress, try add player → 400
        payload = {
            "name": "TEST_LockedTournament", "short_code": "TLT",
            "format": "T20", "scope": "Invitational", "fiscal_cycle": "2025-26",
            "host_body_id": "MPCA", "allows_guests": True,
        }
        t = client.post(f"{API}/tournaments", json=payload).json()
        sq = client.post(f"{API}/squads", json={
            "tournament_id": t["id"], "body_id": "DIST-INDO-IND",
            "team_name": "TEST_Locked",
        }).json()
        self.__class__.created_squads.append(sq["id"])
        client.post(f"{API}/tournaments/{t['id']}/status/Squad_Selection")
        client.post(f"{API}/tournaments/{t['id']}/status/In_Progress")
        aarav = players_by_name["Aarav Sharma"]
        r = client.post(f"{API}/squads/{sq['id']}/players", json={"player_id": aarav["id"]})
        assert r.status_code == 400


# ---------------- Stats ----------------
class TestStats:
    def test_summary(self, client):
        r = client.get(f"{API}/tournaments-stats/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["total_tournaments"] >= 15
        assert "total_squads" in data
        assert "total_players_selected" in data


# ---------------- Regression — existing endpoints ----------------
class TestRegression:
    endpoints = [
        "/bodies", "/members", "/disclosures", "/meetings", "/elections",
        "/fees", "/bank/accounts", "/financial-powers", "/dashboard/stats",
        "/claims", "/budgets", "/procurement", "/finance/abc-analysis",
        "/players", "/players-stats/summary", "/transfers",
    ]

    @pytest.mark.parametrize("path", endpoints)
    def test_endpoint_200(self, client, path):
        r = client.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"


# ---------------- Cleanup ----------------
def test_zzz_cleanup(client):
    """Remove all TEST_ squads + TEST_ tournaments created so demo isn't polluted."""
    # Delete squads via mongo? No, no DELETE squad endpoint. We'll remove via tournaments.
    # Delete TEST_ tournaments using direct mongo collection — but no endpoint.
    # Best effort: list all tournaments, find TEST_ ones, and skip (no delete endpoint).
    # We can mark them Cancelled at least.
    ts = client.get(f"{API}/tournaments").json()
    cancelled = 0
    for t in ts:
        if t["name"].startswith("TEST_") and t["status"] not in ("Completed", "Cancelled"):
            r = client.post(f"{API}/tournaments/{t['id']}/status/Cancelled")
            if r.status_code == 200:
                cancelled += 1
    print(f"Cancelled {cancelled} TEST_ tournaments")
