"""MPCA Squad Selection Sprint · Iteration A backend tests.

Covers:
- MPCA-131 · POST/DELETE add/remove player return 409 when squad is Approved.
- MPCA-131 · positive path: MPCA can still edit an Awaiting_MPCA_Approval squad.
- MPCA-141 · Approve/Reject inserts notifications for role secretary + president.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

MPCA_HDR = {
    "X-Role-Id": "secretary",
    "X-User-Body-Code": "MPCA",
    "X-Body-Code": "MPCA",
    "X-Body-Type": "State",
    "X-User-Name": "Shri Sanjeev Dua",
    "X-Persona-Id": "secretary",
    "X-Persona-Body": "MPCA",
}
DIV_HDR = {
    "X-Role-Id": "division-secretary",
    "X-User-Body-Code": "DIV-IND",
    "X-Body-Code": "DIV-IND",
    "X-Body-Type": "Division",
    "X-User-Name": "Shri Devashish Nilosey",
    "X-Persona-Id": "division-secretary",
    "X-Persona-Body": "DIV-IND",
}

TOURNAMENT_NAME_HINT = "Madhavrao Scindia Trophy"


@pytest.fixture(scope="module")
def tournament_id():
    r = requests.get(f"{API}/tournaments", headers=MPCA_HDR, timeout=15)
    r.raise_for_status()
    for t in r.json():
        if TOURNAMENT_NAME_HINT in (t.get("name") or ""):
            return t["id"]
    pytest.skip("Madhavrao Scindia Trophy tournament not found in seed")


@pytest.fixture(scope="module")
def squad_id(tournament_id):
    r = requests.get(f"{API}/tournaments/{tournament_id}/squads", headers=MPCA_HDR, timeout=15)
    r.raise_for_status()
    div_ind = [s for s in r.json() if s.get("body_id") == "DIV-IND"]
    if not div_ind:
        # create one
        payload = {
            "tournament_id": tournament_id,
            "body_id": "DIV-IND",
            "team_name": f"TEST · DIV-IND · {uuid.uuid4().hex[:6]}",
        }
        cr = requests.post(f"{API}/squads", headers=DIV_HDR, json=payload, timeout=15)
        cr.raise_for_status()
        return cr.json()["id"]
    return div_ind[0]["id"]


def _get_squad(sid):
    r = requests.get(f"{API}/squads/{sid}", headers=MPCA_HDR, timeout=15)
    r.raise_for_status()
    return r.json()


def _reset_to_draft(sid):
    sq = _get_squad(sid)
    if sq.get("submission_status") == "Approved":
        r = requests.post(f"{API}/squads/{sid}/reopen", headers=MPCA_HDR, timeout=15)
        r.raise_for_status()


def _ensure_min_11_and_captain(sid):
    sq = _get_squad(sid)
    members = sq.get("members") or []
    have_capt = any(m.get("is_captain") for m in members)
    have_ids = {m["player_id"] for m in members}

    if len(members) >= 11 and have_capt:
        return

    # Fetch DIV-IND players
    pr = requests.get(
        f"{API}/players", params={"body_id": "DIV-IND", "limit": 50}, headers=DIV_HDR, timeout=15
    )
    pr.raise_for_status()
    pool = [p for p in pr.json() if p["id"] not in have_ids]

    needed = 11 - len(members)
    added = 0
    for p in pool:
        if added >= max(needed, 0) and have_capt:
            break
        payload = {"player_id": p["id"], "is_captain": (not have_capt), "is_keeper": False}
        rr = requests.post(f"{API}/squads/{sid}/players", headers=DIV_HDR, json=payload, timeout=15)
        if rr.status_code == 200:
            if not have_capt:
                have_capt = True
            added += 1
        # ignore add failures (eligibility warnings, etc)
    sq = _get_squad(sid)
    if len(sq.get("members") or []) < 11 or not any(m.get("is_captain") for m in sq.get("members") or []):
        pytest.skip(f"Could not build a submittable squad (members={len(sq.get('members') or [])})")


def _submit(sid):
    sq = _get_squad(sid)
    if sq["submission_status"] in ("Awaiting_MPCA_Approval", "Approved"):
        return
    # Bypass signed-copy requirement by patching a placeholder — endpoint accepts arbitrary URL
    if not sq.get("signed_copy_url"):
        pu = requests.post(
            f"{API}/squads/{sid}/signed-copy",
            headers=DIV_HDR,
            json={"signed_copy_url": "https://example.com/test-signed.pdf"},
            timeout=15,
        )
        # may 200 or 400 depending on implementation — best effort
    r = requests.post(f"{API}/squads/{sid}/submit", headers=DIV_HDR, json={"note": "TEST"}, timeout=15)
    assert r.status_code == 200, f"submit failed: {r.status_code} {r.text}"


def _approve(sid):
    r = requests.post(
        f"{API}/squads/{sid}/review",
        headers=MPCA_HDR,
        json={"action": "approve", "note": "TEST auto-approve"},
        timeout=15,
    )
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"
    return r.json()


# ─────────────────────────────────────────────────────────────
# MPCA-131 · Positive path — Awaiting_MPCA_Approval allows edits
# ─────────────────────────────────────────────────────────────
class TestMPCA131PositivePath:
    def test_awaiting_squad_still_editable(self, squad_id):
        _reset_to_draft(squad_id)
        _ensure_min_11_and_captain(squad_id)
        _submit(squad_id)
        sq = _get_squad(squad_id)
        assert sq["submission_status"] == "Awaiting_MPCA_Approval"

        # Pick any player already in squad, remove then re-add — this
        # confirms MPCA/Division can edit the roster while awaiting review.
        member = sq["members"][-1]
        pid = member["player_id"]
        was_capt = member.get("is_captain", False)
        rm = requests.delete(f"{API}/squads/{squad_id}/players/{pid}", headers=MPCA_HDR, timeout=15)
        assert rm.status_code == 200, f"remove during Awaiting should succeed, got {rm.status_code} {rm.text}"

        # re-add so the squad remains submittable for downstream tests
        add = requests.post(
            f"{API}/squads/{squad_id}/players",
            headers=MPCA_HDR,
            json={"player_id": pid, "is_captain": was_capt, "is_keeper": False},
            timeout=15,
        )
        assert add.status_code == 200, f"re-add during Awaiting should succeed, got {add.status_code} {add.text}"


# ─────────────────────────────────────────────────────────────
# MPCA-131 · Approved squad rejects add/remove with 409
# ─────────────────────────────────────────────────────────────
class TestMPCA131LockOnApproved:
    def test_add_player_returns_409_when_approved(self, squad_id):
        # squad should already be Awaiting from previous test
        sq = _get_squad(squad_id)
        if sq["submission_status"] != "Awaiting_MPCA_Approval":
            _reset_to_draft(squad_id)
            _ensure_min_11_and_captain(squad_id)
            _submit(squad_id)
        _approve(squad_id)
        sq = _get_squad(squad_id)
        assert sq["submission_status"] == "Approved"

        # Pick any player NOT in squad
        member_ids = {m["player_id"] for m in sq["members"]}
        pr = requests.get(
            f"{API}/players", params={"body_id": "DIV-IND", "limit": 50}, headers=DIV_HDR, timeout=15
        )
        candidate = next((p for p in pr.json() if p["id"] not in member_ids), None)
        assert candidate is not None

        r = requests.post(
            f"{API}/squads/{squad_id}/players",
            headers=MPCA_HDR,
            json={"player_id": candidate["id"], "is_captain": False, "is_keeper": False},
            timeout=15,
        )
        assert r.status_code == 409, f"expected 409 lock, got {r.status_code}: {r.text}"
        assert "locked" in r.text.lower() or "approved" in r.text.lower()

    def test_delete_player_returns_409_when_approved(self, squad_id):
        sq = _get_squad(squad_id)
        assert sq["submission_status"] == "Approved"
        pid = sq["members"][0]["player_id"]
        r = requests.delete(f"{API}/squads/{squad_id}/players/{pid}", headers=MPCA_HDR, timeout=15)
        assert r.status_code == 409, f"expected 409 lock, got {r.status_code}: {r.text}"
        assert "locked" in r.text.lower() or "approved" in r.text.lower()


# ─────────────────────────────────────────────────────────────
# MPCA-141 · Approve inserts notifications for secretary + president
# ─────────────────────────────────────────────────────────────
class TestMPCA141Notifications:
    def test_notifications_created_on_approve(self, squad_id):
        # Squad is already Approved (previous test). Verify notifications exist for
        # role=secretary and role=president with the squad's body_id.
        sq = _get_squad(squad_id)
        body = sq["body_id"]
        sid = sq["id"]

        found = {"secretary": False, "president": False}
        for role in ("secretary", "president"):
            r = requests.get(
                f"{API}/notifications",
                params={"recipient_role_id": role, "recipient_body_id": body, "limit": 50},
                headers=MPCA_HDR,
                timeout=15,
            )
            assert r.status_code == 200
            for n in r.json():
                if (n.get("kind") == "squad_review"
                        and n.get("related_id") == sid
                        and "approv" in (n.get("title") or "").lower()
                        and n.get("link") == f"/squads/{sid}"):
                    found[role] = True
                    break
        assert found["secretary"], f"No secretary squad_review notification for squad {sid} / body {body}"
        assert found["president"], f"No president squad_review notification for squad {sid} / body {body}"

    def test_notifications_created_on_reject(self, squad_id):
        # Reopen squad and re-submit → reject → verify reject notifications.
        _reset_to_draft(squad_id)
        _submit(squad_id)
        r = requests.post(
            f"{API}/squads/{squad_id}/review",
            headers=MPCA_HDR,
            json={"action": "reject", "note": "TEST auto-reject"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        sq = _get_squad(squad_id)
        body = sq["body_id"]
        sid = sq["id"]

        for role in ("secretary", "president"):
            r = requests.get(
                f"{API}/notifications",
                params={"recipient_role_id": role, "recipient_body_id": body, "limit": 50},
                headers=MPCA_HDR,
                timeout=15,
            )
            assert r.status_code == 200
            hit = any(
                n.get("kind") == "squad_review"
                and n.get("related_id") == sid
                and "reject" in (n.get("title") or "").lower()
                for n in r.json()
            )
            assert hit, f"No {role} reject notification for squad {sid}"


@pytest.fixture(scope="module", autouse=True)
def _cleanup(squad_id):
    yield
    # Leave squad in Draft so subsequent runs are re-usable.
    try:
        sq = _get_squad(squad_id)
        if sq.get("submission_status") in ("Approved", "Awaiting_MPCA_Approval", "Rejected"):
            if sq.get("submission_status") == "Approved":
                requests.post(f"{API}/squads/{squad_id}/reopen", headers=MPCA_HDR, timeout=15)
            else:
                # Manually set to Draft via reopen if endpoint allows, else just leave.
                pass
    except Exception:
        pass
