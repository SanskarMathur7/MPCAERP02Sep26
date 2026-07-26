"""M30 · Squad workflow (submit/review/finalize/reopen) + Pending-Actions tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")

# SM Khan Trophy TRN-2026-27-009 · DIV-IND host · Draft
DRAFT_TID = "58bd8f3c-2562-4231-b846-537103e8a542"
DIV_SQUAD_ID = "96329508-900d-4a8d-a044-46cf53dc0c9e"


@pytest.fixture
def s():
    return requests.Session()


# ─────────── Pending actions ───────────
class TestPendingActions:
    def test_tournament_pending_returns_shape(self, s):
        r = s.get(f"{BASE_URL}/api/tournaments/{DRAFT_TID}/pending-actions")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "count" in d
        assert isinstance(d["items"], list)
        assert d["count"] == len(d["items"])

    def test_tournament_pending_input_vars_item(self, s):
        r = s.get(f"{BASE_URL}/api/tournaments/{DRAFT_TID}/pending-actions")
        items = r.json()["items"]
        iv = [i for i in items if i.get("kind") == "input_vars"]
        assert iv, "Expected an input_vars pending item on Draft tournament without input_variables"
        assert iv[0]["waiting_on"] == "MPCA"

    def test_mpca_inbox_returns_items_with_tournament_meta(self, s):
        r = s.get(f"{BASE_URL}/api/pending-actions/mpca?limit=30")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "count" in d
        assert d["count"] >= 1
        for it in d["items"]:
            assert "tournament_no" in it
            assert "tournament_name" in it
            assert it.get("waiting_on") == "MPCA"


# ─────────── Squad player-add on Draft ───────────
class TestSquadPlayerAddOnDraft:
    def test_add_player_on_draft_tournament_allowed(self, s):
        # Ensure Draft squad state
        s.post(f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/reopen", headers={"X-Role-Id": "secretary"})
        pr = s.get(f"{BASE_URL}/api/players?body_id=DIV-IND&limit=30")
        pool = pr.json()
        items = pool if isinstance(pool, list) else pool.get("items", [])
        # Skip any already in squad
        sq = _get_squad(s, DIV_SQUAD_ID)
        existing = {m["player_id"] for m in (sq.get("members") or [])}
        candidates = [p for p in items if p["id"] not in existing]
        assert candidates, "No fresh DIV-IND player available"
        player_id = candidates[0]["id"]
        r = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/players",
            json={"player_id": player_id},
            headers={"X-Role-Id": "division-secretary", "X-User-Body-Code": "DIV-IND"},
        )
        assert r.status_code == 200, r.text
        assert any(m["player_id"] == player_id for m in r.json()["members"])


# ─────────── Submit / Review / Reopen ───────────
def _get_squad(s, sid):
    r = s.get(f"{BASE_URL}/api/tournaments/{DRAFT_TID}/squads")
    for sq in r.json():
        if sq["id"] == sid:
            return sq
    return None


class TestSquadSubmitFlow:
    def test_submit_below_11_returns_400(self, s):
        sq = _get_squad(s, DIV_SQUAD_ID)
        assert sq
        # only proceed if members < 11 (default). Reopen first to reset.
        s.post(f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/reopen", headers={"X-Role-Id": "secretary"})
        sq = _get_squad(s, DIV_SQUAD_ID)
        if len(sq.get("members") or []) >= 11:
            pytest.skip("Squad already has 11+ members; cannot test <11 rejection here without cleanup")
        r = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/submit",
            json={"note": "test"},
            headers={"X-Role-Id": "division-secretary", "X-User-Body-Code": "DIV-IND"},
        )
        assert r.status_code == 400
        assert "at least 11" in r.text or "need at least 11" in r.text.lower()

    def test_full_submit_review_reopen_cycle(self, s):
        # Ensure squad is in Draft
        s.post(f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/reopen", headers={"X-Role-Id": "secretary"})

        # Load DIV-IND players
        pr = s.get(f"{BASE_URL}/api/players?body_id=DIV-IND&limit=20")
        pool = pr.json()
        players = pool if isinstance(pool, list) else pool.get("items", [])
        assert len(players) >= 11, f"Need at least 11 DIV-IND players; got {len(players)}"

        sq = _get_squad(s, DIV_SQUAD_ID)
        existing_ids = {m["player_id"] for m in (sq.get("members") or [])}

        # Add players until we have >= 11
        headers_div = {"X-Role-Id": "division-secretary", "X-User-Body-Code": "DIV-IND"}
        for p in players:
            if p["id"] in existing_ids:
                continue
            if len(existing_ids) >= 11:
                break
            r = s.post(
                f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/players",
                json={"player_id": p["id"]},
                headers=headers_div,
            )
            if r.status_code == 200:
                existing_ids.add(p["id"])

        sq = _get_squad(s, DIV_SQUAD_ID)
        members = sq.get("members") or []
        assert len(members) >= 11, f"Failed to add 11 players; have {len(members)}"

        # Mark first member as captain via remove + re-add with is_captain=True
        cap_pid = members[0]["player_id"]
        rd = s.delete(f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/players/{cap_pid}")
        if rd.status_code == 200:
            ra = s.post(
                f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/players",
                json={"player_id": cap_pid, "is_captain": True},
                headers=headers_div,
            )
            assert ra.status_code == 200, ra.text
        else:
            pytest.skip(f"Could not toggle captain (delete status={rd.status_code})")

        # SUBMIT
        r = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/submit",
            json={"note": "Ready for review"},
            headers=headers_div,
        )
        assert r.status_code == 200, r.text
        assert r.json()["submission_status"] == "Awaiting_MPCA_Approval"

        # REVIEW · approve requires MPCA role
        r_forbidden = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/review",
            json={"action": "approve"},
            headers={"X-Role-Id": "division-secretary"},
        )
        assert r_forbidden.status_code == 403

        # APPROVE as MPCA secretary
        r_appr = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/review",
            json={"action": "approve", "note": "LGTM"},
            headers={"X-Role-Id": "secretary"},
        )
        assert r_appr.status_code == 200, r_appr.text
        assert r_appr.json()["submission_status"] == "Approved"

        # FINALIZE
        r_fin = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/review",
            json={"action": "finalize"},
            headers={"X-Role-Id": "secretary"},
        )
        assert r_fin.status_code == 200, r_fin.text
        assert r_fin.json()["finalized_by_mpca"] is True

        # REOPEN
        r_re = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/reopen",
            headers={"X-Role-Id": "secretary"},
        )
        assert r_re.status_code == 200
        assert r_re.json()["submission_status"] == "Draft"

    def test_review_rbac_division_forbidden(self, s):
        r = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/review",
            json={"action": "approve"},
            headers={"X-Role-Id": "division-secretary"},
        )
        assert r.status_code == 403

    def test_reopen_requires_mpca(self, s):
        r = s.post(
            f"{BASE_URL}/api/squads/{DIV_SQUAD_ID}/reopen",
            headers={"X-Role-Id": "division-secretary"},
        )
        assert r.status_code == 403
