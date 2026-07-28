"""M39l · Five tournament-tab bug regression tests.

Covers:
 · Bug 1  Extra-expense body_id + MPCA visibility
 · Bug 2  Division sees BCCI/MPCA-hosted tournaments where they participate
 · Bug 3  Role-aware scheme-for-body endpoint
 · Bug 4  MPCA any office bearer can approve tournament-budget totals
 · Bug 5  Squad max_squad_size cap removed
"""
import os
import uuid
from datetime import date, timedelta
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://nice-aryabhata-4.preview.emergentagent.com",
).rstrip("/")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _hdrs(body_code, body_type, persona_id=None, name=None):
    h = {
        "Content-Type": "application/json",
        "X-Body-Code": body_code,
        "X-Body-Type": body_type,
    }
    if persona_id:
        h["X-Persona-Id"] = persona_id
        h["X-Role-Id"] = persona_id
    if name:
        h["X-Persona-Name"] = name
    return h


MPCA = _hdrs("MPCA", "State", "secretary", "MPCA Secretary")
DIV_IND = _hdrs("DIV-IND", "Division", "division-secretary", "Devashish Nilosey")
DIV_GWL = _hdrs("DIV-GWL", "Division", "division-secretary-gwl", "Kailash Vijayvargiya")
DIV_BPL = _hdrs("DIV-BPL", "Division", "division-secretary", "TestBPL Sec")


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    return s


def _tournament_payload(name, host_body_id, host_scheme=None, visiting_scheme=None,
                        max_squad_size=15, scheme_code="2-D"):
    today = date.today()
    return {
        "name": f"TEST_M39L_{name}_{uuid.uuid4().hex[:6]}",
        "format": "OneDay_Senior",
        "scope": "Inter_Divisional",
        "tournament_type": "MPCA_InterDivisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": host_body_id,
        "max_squad_size": max_squad_size,
        "start_date": (today + timedelta(days=15)).isoformat(),
        "end_date": (today + timedelta(days=25)).isoformat(),
        "scheme_code": scheme_code,
        "host_scheme_code": host_scheme,
        "visiting_scheme_code": visiting_scheme,
    }


@pytest.fixture(scope="module")
def created_tids(api, mongo):
    """Cleanup: drop TEST_ artefacts after all tests in module."""
    tids = []
    yield tids
    # Cleanup
    for tid in tids:
        mongo.tournaments.delete_one({"id": tid})
        mongo.squads.delete_many({"tournament_id": tid})
        mongo.tournament_budgets.delete_many({"tournament_id": tid})
        mongo.extra_expense_requests.delete_many({"tournament_id": tid})
        mongo.tournament_participations.delete_many({"tournament_id": tid})


# ═══════════════════════════════════════════════════════════════════════════
# Bug 5 · Squad has no hard cap — divisions may nominate unlimited players.
# ═══════════════════════════════════════════════════════════════════════════
class TestBug5NoSquadCap:
    def test_add_20_players_when_cap_is_15(self, api, created_tids):
        # 1. Create tournament with max_squad_size=15 (MPCA-hosted so no acceptance flow needed)
        resp = api.post(f"{BASE_URL}/api/tournaments",
                        json=_tournament_payload("Bug5", "MPCA", max_squad_size=15),
                        headers=MPCA)
        assert resp.status_code == 200, resp.text
        t = resp.json()
        tid = t["id"]
        created_tids.append(tid)
        assert t["max_squad_size"] == 15

        # Move to Upcoming so we can create squads
        api.post(f"{BASE_URL}/api/tournaments/{tid}/status/Awaiting_Approval", headers=MPCA)
        api.post(f"{BASE_URL}/api/tournaments/{tid}/status/Upcoming", headers=MPCA)

        # 2. Create squad
        sq_resp = api.post(f"{BASE_URL}/api/squads",
                           json={"tournament_id": tid, "body_id": "DIV-IND",
                                 "team_name": "Indore Test Squad"},
                           headers=DIV_IND)
        assert sq_resp.status_code == 200, sq_resp.text
        sid = sq_resp.json()["id"]

        # 3. Pull 20 DIV-IND players (Senior seniors — Batter/Bowler/Allrounder etc.)
        players = api.get(f"{BASE_URL}/api/players?body_id=DIV-IND&limit=50").json()
        # Filter to senior age (>= 19) since default is senior. If age_cap None, all pass.
        chosen = players[:20]
        assert len(chosen) == 20, f"Need 20 DIV-IND players; got {len(chosen)}"

        # 4. Add 20 players — every add MUST return 200 (no "Squad is full")
        added = 0
        for p in chosen:
            r = api.post(f"{BASE_URL}/api/squads/{sid}/players",
                         json={"player_id": p["id"]}, headers=DIV_IND)
            if r.status_code != 200:
                # Some may fail eligibility; capture the reason but still assert no cap error
                assert "Squad is full" not in r.text, (
                    f"Bug 5 REGRESSION: cap enforced after {added} players: {r.text}"
                )
                # Skip eligibility-related failures — they are unrelated to Bug 5.
                continue
            added += 1

        # 5. Verify squad has 20 members (or as close as eligibility allowed) — but at least > 15
        squad = api.get(f"{BASE_URL}/api/tournaments/{tid}/squads",
                        headers=DIV_IND).json()
        # squad list returns array; find ours
        s = [x for x in squad if x["id"] == sid][0]
        assert len(s["members"]) > 15, (
            f"Bug 5 REGRESSION: only {len(s['members'])} accepted; cap should be gone"
        )
        assert len(s["members"]) == added


# ═══════════════════════════════════════════════════════════════════════════
# Bug 4 · Any MPCA office bearer can approve budgets with edited totals
# ═══════════════════════════════════════════════════════════════════════════
class TestBug4BudgetApprovalOpen:
    def test_president_can_approve_with_edited_totals(self, api, mongo, created_tids):
        # Setup tournament
        resp = api.post(f"{BASE_URL}/api/tournaments",
                        json=_tournament_payload("Bug4", "DIV-IND"),
                        headers=MPCA)
        assert resp.status_code == 200, resp.text
        tid = resp.json()["id"]
        created_tids.append(tid)

        # Create + submit a budget as DIV-IND
        b_resp = api.post(f"{BASE_URL}/api/tournament-budgets", json={
            "tournament_id": tid,
            "body_id": "DIV-IND",
            "fiscal_cycle": "2025-26",
            "total_ceiling_inr": 100000.0,
            "head_allocations": [
                {"head": "Accommodation", "limit_inr": 60000.0},
                {"head": "Food", "limit_inr": 40000.0},
            ],
        }, headers=DIV_IND)
        assert b_resp.status_code == 200, b_resp.text
        bid = b_resp.json()["id"]

        # Submit
        sub = api.post(f"{BASE_URL}/api/tournament-budgets/{bid}/submit", json={
            "actor_post": "Division Secretary",
            "actor_name": "Devashish",
            "actor_body_id": "DIV-IND",
        }, headers=DIV_IND)
        assert sub.status_code == 200, sub.text

        # MPCA President approves with SMALLER edited values
        pres_hdrs = _hdrs("MPCA", "State", "president", "Mahanaryaman Scindia")
        appr = api.post(f"{BASE_URL}/api/tournament-budgets/{bid}/approve", json={
            "actor_post": "Hon. President",
            "actor_name": "Mahanaryaman Scindia",
            "actor_body_id": "MPCA",
            "approved_total_inr": 80000.0,
            "approved_head_allocations": [
                {"head": "Accommodation", "limit_inr": 50000.0},
                {"head": "Food", "limit_inr": 30000.0},
            ],
            "notes": "Trimmed per policy.",
        }, headers=pres_hdrs)
        assert appr.status_code == 200, appr.text
        data = appr.json()
        assert data["status"] == "Approved"
        assert data["approved_total_inr"] == 80000.0
        heads = {h["head"]: h["limit_inr"] for h in data["approved_head_allocations"]}
        assert heads["Accommodation"] == 50000.0
        assert heads["Food"] == 30000.0


# ═══════════════════════════════════════════════════════════════════════════
# Bug 2 · Division sees BCCI/MPCA-hosted tournaments they participate in
# ═══════════════════════════════════════════════════════════════════════════
class TestBug2ParticipantVisibility:
    def test_participant_division_can_see_mpca_hosted(self, api, mongo, created_tids):
        # 1. Create MPCA-hosted tournament
        resp = api.post(f"{BASE_URL}/api/tournaments",
                        json=_tournament_payload("Bug2", "MPCA"),
                        headers=MPCA)
        assert resp.status_code == 200, resp.text
        tid = resp.json()["id"]
        created_tids.append(tid)

        # 2. Seed tournament_participations directly (bypass workspace API)
        for code, name in [("DIV-IND", "Indore Division"),
                           ("DIV-GWL", "Gwalior Division")]:
            mongo.tournament_participations.insert_one({
                "id": str(uuid.uuid4()),
                "tournament_id": tid,
                "body_code": code,
                "body_type": "Division",
                "body_name": name,
                "role": "Visitor",
                "removed_at": None,
            })

        # 3. GET /api/tournaments as DIV-IND — must include this tid
        r = api.get(f"{BASE_URL}/api/tournaments", headers=DIV_IND)
        assert r.status_code == 200
        assert any(t["id"] == tid for t in r.json()), (
            "Bug 2 REGRESSION: DIV-IND did not see MPCA-hosted tournament they participate in."
        )

        # DIV-GWL too
        r2 = api.get(f"{BASE_URL}/api/tournaments", headers=DIV_GWL)
        assert any(t["id"] == tid for t in r2.json()), (
            "Bug 2 REGRESSION: DIV-GWL did not see MPCA-hosted tournament they participate in."
        )

        # 4. GET /api/tournaments/{tid} as DIV-IND — must be 200
        r3 = api.get(f"{BASE_URL}/api/tournaments/{tid}", headers=DIV_IND)
        assert r3.status_code == 200, f"Expected 200, got {r3.status_code}: {r3.text}"

        # 5. GET as DIV-BPL (non-participant, non-host) — MUST return 403
        r4 = api.get(f"{BASE_URL}/api/tournaments/{tid}", headers=DIV_BPL)
        assert r4.status_code == 403, (
            f"Bug 2 REGRESSION: DIV-BPL (non-participant) got {r4.status_code} "
            f"expected 403. Body: {r4.text[:200]}"
        )


# ═══════════════════════════════════════════════════════════════════════════
# Bug 1 · Extra-expense body_id + MPCA sees Division submissions
# ═══════════════════════════════════════════════════════════════════════════
class TestBug1ExtraExpenseBodyId:
    def test_division_can_see_own_and_mpca_sees_all(self, api, created_tids):
        # Use an MPCA-hosted tournament
        resp = api.post(f"{BASE_URL}/api/tournaments",
                        json=_tournament_payload("Bug1", "MPCA"),
                        headers=MPCA)
        assert resp.status_code == 200
        tid = resp.json()["id"]
        created_tids.append(tid)

        # Division creates extra-expense with body_id = DIV-IND
        er = api.post(f"{BASE_URL}/api/extra-expense-requests", json={
            "tournament_id": tid,
            "body_id": "DIV-IND",
            "head_code": "EXTRA_MEDICAL",
            "head_label": "Extra Medical Coverage",
            "is_new_head": True,
            "amount_inr": 15000.0,
            "justification": "Player injury required additional medical staff.",
        }, headers=DIV_IND)
        assert er.status_code == 200, er.text
        rid = er.json()["id"]

        # Division must see it in their scoped list
        list_div = api.get(f"{BASE_URL}/api/extra-expense-requests", headers=DIV_IND).json()
        assert any(x["id"] == rid for x in list_div), (
            "Bug 1 REGRESSION: Division cannot see their own extra-expense request."
        )

        # Submit
        sub = api.post(f"{BASE_URL}/api/extra-expense-requests/{rid}/submit", json={
            "actor_name": "Devashish", "actor_body_id": "DIV-IND",
            "actor_post": "Division Secretary",
        }, headers=DIV_IND)
        assert sub.status_code == 200, sub.text

        # MPCA sees it (Submitted)
        list_mpca = api.get(f"{BASE_URL}/api/extra-expense-requests", headers=MPCA).json()
        assert any(x["id"] == rid for x in list_mpca), (
            "Bug 1 REGRESSION: MPCA cannot see submitted Division extra-expense."
        )


# ═══════════════════════════════════════════════════════════════════════════
# Bug 3 · Role-aware scheme-for-body endpoint
# ═══════════════════════════════════════════════════════════════════════════
class TestBug3SchemeForBody:
    def test_host_gets_2D_visiting_gets_2C(self, api, created_tids):
        resp = api.post(f"{BASE_URL}/api/tournaments", json=_tournament_payload(
            "Bug3", "DIV-IND", host_scheme="2-D", visiting_scheme="2-C"
        ), headers=MPCA)
        assert resp.status_code == 200, resp.text
        tid = resp.json()["id"]
        created_tids.append(tid)

        # HOST (DIV-IND)
        r_host = api.get(
            f"{BASE_URL}/api/tournaments/{tid}/scheme-for-body/DIV-IND",
            headers=MPCA,
        )
        assert r_host.status_code == 200, r_host.text
        data_h = r_host.json()
        assert data_h["role"] == "host"
        assert data_h["scheme_code"] == "2-D"

        # VISITING (DIV-GWL)
        r_vis = api.get(
            f"{BASE_URL}/api/tournaments/{tid}/scheme-for-body/DIV-GWL",
            headers=MPCA,
        )
        assert r_vis.status_code == 200, r_vis.text
        data_v = r_vis.json()
        assert data_v["role"] == "visiting"
        assert data_v["scheme_code"] == "2-C"
