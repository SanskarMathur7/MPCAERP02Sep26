"""MPCA Squad Selection Sprint · Iteration B backend tests.

Covers:
- MPCA-140 POST/DELETE /api/squads/{sid}/members/{pid}/decision
- MPCA-140 POST /api/squads/{sid}/review (approve requires all decided; drops rejected)
- MPCA-140 reject still works without decisions
- MPCA-136 age filter data availability (age_cap_years on tournament)
- Player-Registration return-to-player endpoint
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

MPCA_HEADERS = {
    "X-Role-Id": "secretary",
    "X-User-Body-Code": "MPCA",
    "X-User-Name": "Shri Sanjeev Dua",
    "Content-Type": "application/json",
}
DIV_HEADERS = {
    "X-Role-Id": "division-secretary",
    "X-User-Body-Code": "DIV-IND",
    "X-User-Name": "Shri Devashish Nilosey",
    "Content-Type": "application/json",
}

SQUAD_ID = "93a7fa22-9c1f-4740-b1e6-9feb331046d1"


@pytest.fixture(scope="module")
def squad_awaiting():
    """Ensure the reference squad is in Awaiting_MPCA_Approval, and clear any prior decisions."""
    # Reopen if not Draft
    r = requests.get(f"{API}/squads/{SQUAD_ID}")
    assert r.status_code == 200, r.text
    doc = r.json()
    status = doc.get("submission_status")
    if status == "Approved":
        rr = requests.post(f"{API}/squads/{SQUAD_ID}/reopen", headers=MPCA_HEADERS)
        assert rr.status_code == 200, rr.text
        status = "Draft"
    if status == "Awaiting_MPCA_Approval":
        # reject to send back to draft-ish state then resubmit fresh
        pass
    if status != "Awaiting_MPCA_Approval":
        # Submit as MPCA (bypasses signed-copy req)
        rs = requests.post(
            f"{API}/squads/{SQUAD_ID}/submit",
            headers=MPCA_HEADERS,
            json={"note": "iter B test submit"},
        )
        assert rs.status_code == 200, rs.text
    # Clear all previous decisions
    doc = requests.get(f"{API}/squads/{SQUAD_ID}").json()
    for m in doc.get("members") or []:
        requests.delete(
            f"{API}/squads/{SQUAD_ID}/members/{m['player_id']}/decision",
            headers=MPCA_HEADERS,
        )
    return requests.get(f"{API}/squads/{SQUAD_ID}").json()


# ─── MPCA-140 · Per-player decision endpoint ────────────────────────────────
class TestMemberDecision:
    def test_decision_requires_mpca_role(self, squad_awaiting):
        pid = squad_awaiting["members"][0]["player_id"]
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/members/{pid}/decision",
            headers=DIV_HEADERS,
            json={"decision": "Approved", "reason": "ok"},
        )
        assert r.status_code == 403

    def test_decision_bad_squad_404(self):
        r = requests.post(
            f"{API}/squads/{uuid.uuid4()}/members/foo/decision",
            headers=MPCA_HEADERS,
            json={"decision": "Approved"},
        )
        assert r.status_code == 404

    def test_decision_bad_player_404(self, squad_awaiting):
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/members/not-on-roster/decision",
            headers=MPCA_HEADERS,
            json={"decision": "Approved"},
        )
        assert r.status_code == 404

    def test_decision_invalid_value_400(self, squad_awaiting):
        pid = squad_awaiting["members"][0]["player_id"]
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/members/{pid}/decision",
            headers=MPCA_HEADERS,
            json={"decision": "Maybe"},
        )
        assert r.status_code == 400

    def test_decision_persist_and_overwrite(self, squad_awaiting):
        pid = squad_awaiting["members"][0]["player_id"]
        # Approve
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/members/{pid}/decision",
            headers=MPCA_HEADERS,
            json={"decision": "Approved", "reason": "solid form"},
        )
        assert r.status_code == 200, r.text
        decisions = [d for d in r.json()["member_decisions"] if d["player_id"] == pid]
        assert len(decisions) == 1 and decisions[0]["decision"] == "Approved"
        assert decisions[0]["reason"] == "solid form"

        # Overwrite with Rejected
        r2 = requests.post(
            f"{API}/squads/{SQUAD_ID}/members/{pid}/decision",
            headers=MPCA_HEADERS,
            json={"decision": "Rejected", "reason": "injury"},
        )
        assert r2.status_code == 200
        decisions = [d for d in r2.json()["member_decisions"] if d["player_id"] == pid]
        assert len(decisions) == 1 and decisions[0]["decision"] == "Rejected"
        assert decisions[0]["reason"] == "injury"

        # DELETE clears
        r3 = requests.delete(
            f"{API}/squads/{SQUAD_ID}/members/{pid}/decision", headers=MPCA_HEADERS
        )
        assert r3.status_code == 200
        assert not [d for d in r3.json()["member_decisions"] if d["player_id"] == pid]

    def test_decision_only_on_awaiting_status(self):
        # Create a fresh squad by creating a dummy tournament? Too heavy.
        # Instead, approve the reference squad after decisions and check 409.
        # We do this in test_approve_flow.
        pass


# ─── MPCA-140 · review approve/reject flow ──────────────────────────────────
class TestReviewFlow:
    def test_approve_blocks_when_missing_decisions(self, squad_awaiting):
        # Ensure decisions are cleared
        for m in squad_awaiting["members"]:
            requests.delete(
                f"{API}/squads/{SQUAD_ID}/members/{m['player_id']}/decision",
                headers=MPCA_HEADERS,
            )
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/review",
            headers=MPCA_HEADERS,
            json={"action": "approve", "note": "trying"},
        )
        assert r.status_code == 400
        assert "decision" in r.text.lower()

    def test_reject_works_without_decisions(self, squad_awaiting):
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/review",
            headers=MPCA_HEADERS,
            json={"action": "reject", "note": "whole-squad reject test"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["submission_status"] == "Rejected"
        # Restore back to Awaiting for subsequent tests
        rs = requests.post(
            f"{API}/squads/{SQUAD_ID}/submit",
            headers=MPCA_HEADERS,
            json={"note": "resubmit after test reject"},
        )
        assert rs.status_code == 200, rs.text

    def test_approve_moves_rejected_to_dropped(self, squad_awaiting):
        doc = requests.get(f"{API}/squads/{SQUAD_ID}").json()
        # ensure awaiting
        assert doc["submission_status"] == "Awaiting_MPCA_Approval"
        members = doc["members"]
        assert len(members) >= 2
        # Clear any leftover decisions
        for m in members:
            requests.delete(
                f"{API}/squads/{SQUAD_ID}/members/{m['player_id']}/decision",
                headers=MPCA_HEADERS,
            )
        # Approve all but the last one (which we reject)
        rejected_pid = members[-1]["player_id"]
        for m in members[:-1]:
            r = requests.post(
                f"{API}/squads/{SQUAD_ID}/members/{m['player_id']}/decision",
                headers=MPCA_HEADERS,
                json={"decision": "Approved"},
            )
            assert r.status_code == 200
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/members/{rejected_pid}/decision",
            headers=MPCA_HEADERS,
            json={"decision": "Rejected", "reason": "over-age"},
        )
        assert r.status_code == 200

        # Approve whole
        approve_r = requests.post(
            f"{API}/squads/{SQUAD_ID}/review",
            headers=MPCA_HEADERS,
            json={"action": "approve", "note": "iter B full-list approval"},
        )
        assert approve_r.status_code == 200, approve_r.text
        final = approve_r.json()
        assert final["submission_status"] == "Approved"
        member_pids = {m["player_id"] for m in final.get("members") or []}
        dropped_pids = {m["player_id"] for m in final.get("dropped_members") or []}
        assert rejected_pid not in member_pids
        assert rejected_pid in dropped_pids
        assert len(final["members"]) == len(members) - 1

    def test_decision_409_when_not_awaiting(self):
        # The squad is now Approved. New decisions should 409.
        doc = requests.get(f"{API}/squads/{SQUAD_ID}").json()
        assert doc["submission_status"] == "Approved"
        pid = doc["members"][0]["player_id"]
        r = requests.post(
            f"{API}/squads/{SQUAD_ID}/members/{pid}/decision",
            headers=MPCA_HEADERS,
            json={"decision": "Approved"},
        )
        assert r.status_code == 409


# ─── MPCA-136/137 · Age cap on tournament ──────────────────────────────────
class TestAgeCap:
    def test_tournament_age_cap_field_supported(self):
        # Find the tournament for this squad and try to PATCH age_cap_years=19
        squad = requests.get(f"{API}/squads/{SQUAD_ID}").json()
        tid = squad["tournament_id"]
        r = requests.patch(
            f"{API}/tournaments/{tid}",
            headers=MPCA_HEADERS,
            json={"age_cap_years": 19},
        )
        assert r.status_code in (200, 204), r.text
        got = requests.get(f"{API}/tournaments/{tid}").json()
        assert got.get("age_cap_years") == 19


# ─── Player-Registration · return-to-player ─────────────────────────────────
class TestPlayerRegistrationReturn:
    def test_return_endpoint_exists(self):
        # Find a non-approved registration
        r = requests.get(f"{API}/player-registrations", headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        regs = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        candidate = next(
            (x for x in regs if x.get("status") not in ("Approved", "Rejected")), None
        )
        if not candidate:
            pytest.skip("No non-Approved/non-Rejected player registration available.")
        rid = candidate["id"]
        rr = requests.post(
            f"{API}/player-registrations/{rid}/return-to-player",
            headers=MPCA_HEADERS,
            json={"remark": "TEST_IterB · missing DOB doc", "actor_name": "Shri Sanjeev Dua"},
        )
        assert rr.status_code == 200, rr.text
        after = rr.json()
        assert after["status"] == "Returned"
        assert "TEST_IterB" in (after.get("return_reason") or "")
