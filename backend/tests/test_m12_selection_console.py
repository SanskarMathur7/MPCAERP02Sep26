"""Backend tests · Sprint M12 · Selection Console (post-acceptance squad workflow)."""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to file scan of frontend/.env (defensive)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].rstrip("/")

API = f"{BASE_URL}/api"
STAMP = str(int(time.time()))

_mongo = MongoClient("mongodb://localhost:27017")
_db = _mongo["test_database"]


def _delete_tournament(tid: str):
    try:
        _db.tournaments.delete_many({"id": tid})
        _db.squads.delete_many({"tournament_id": tid})
    except Exception:
        pass


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def sample_player_ids(sess):
    r = sess.get(f"{API}/players")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 250
    # Pick a variety of role_code buckets from html seeds
    html = [p for p in data if (p.get("selection_meta") or {}).get("seed_source") == "html_console_v1"]
    assert len(html) >= 250
    ids = [p["id"] for p in html[:15]]
    return ids


@pytest.fixture(scope="module")
def draft_tournament(sess):
    """Create a Draft (unaccepted) tournament hosted by DIV-IND."""
    payload = {
        "name": f"M12 UnAccepted {STAMP}",
        "format": "OneDay_Senior",
        "scope": "Inter_Divisional",
        "tournament_type": "MPCA_InterDivisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "max_squad_size": 15,
    }
    r = sess.post(f"{API}/tournaments", json=payload,
                  headers={"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary",
                           "X-User-Name": "Shri Sanjeev Rao"})
    assert r.status_code == 200, r.text
    t = r.json()
    yield t
    # cleanup
    try:
        _delete_tournament(t["id"])
    except Exception:
        pass


@pytest.fixture(scope="module")
def accepted_tournament(sess):
    """Create + accept a DIV-IND tournament so selection console is unlocked."""
    payload = {
        "name": f"M12 Accepted {STAMP}",
        "format": "OneDay_Senior",
        "scope": "Inter_Divisional",
        "tournament_type": "MPCA_InterDivisional",
        "fiscal_cycle": "2025-26",
        "host_body_id": "DIV-IND",
        "max_squad_size": 15,
    }
    r = sess.post(f"{API}/tournaments", json=payload,
                  headers={"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary",
                           "X-User-Name": "Shri Sanjeev Rao"})
    assert r.status_code == 200, r.text
    t = r.json()
    # Accept via DIV-IND
    r2 = sess.post(f"{API}/tournaments/{t['id']}/acceptance",
                   json={"action": "accept", "note": "OK"},
                   headers={"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary",
                            "X-User-Name": "Shri Vikram Patil"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["acceptance"]["status"] == "Accepted"
    yield r2.json()
    # cleanup
    try:
        _delete_tournament(t["id"])
    except Exception:
        pass


# ---------- 1. Players seed sanity ----------

class TestPlayersSeed:
    def test_players_count_and_html_seed(self, sess):
        r = sess.get(f"{API}/players")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 250, f"Expected >=250, got {len(data)}"
        html = [p for p in data if (p.get("selection_meta") or {}).get("seed_source") == "html_console_v1"]
        assert len(html) >= 250, f"Expected >=250 html-seeded, got {len(html)}"

    def test_selection_meta_shape(self, sess):
        r = sess.get(f"{API}/players")
        html = [p for p in r.json() if (p.get("selection_meta") or {}).get("seed_source") == "html_console_v1"]
        sample = html[0]["selection_meta"]
        assert "yo_yo" in sample
        assert "stats" in sample
        assert "form_last_5" in sample
        assert "division_name" in sample


# ---------- 2. GET /selection: locked when pending ----------

class TestSelectionLock:
    def test_pending_tournament_selection_locked(self, sess, draft_tournament):
        r = sess.get(f"{API}/tournaments/{draft_tournament['id']}/selection")
        assert r.status_code in (200,), r.text
        # NOTE: get_selection does not gate on acceptance; only patch/submit do.
        # But per spec: acceptance-based lock. Verify that patch blocks when Pending.
        r2 = sess.patch(f"{API}/tournaments/{draft_tournament['id']}/selection",
                        json={"notes": "x"},
                        headers={"X-Role-Id": "division-secretary"})
        assert r2.status_code == 400
        assert "locked" in r2.text.lower() or "accept" in r2.text.lower()


# ---------- 3. GET /selection: creates draft on first call, idempotent ----------

class TestGetSelectionIdempotent:
    def test_first_call_creates_draft(self, sess, accepted_tournament):
        tid = accepted_tournament["id"]
        r = sess.get(f"{API}/tournaments/{tid}/selection")
        assert r.status_code == 200
        s = r.json()
        assert s["tournament_id"] == tid
        assert s["submission_status"] == "Draft"
        assert s["members"] == []

    def test_second_call_returns_same(self, sess, accepted_tournament):
        tid = accepted_tournament["id"]
        r1 = sess.get(f"{API}/tournaments/{tid}/selection")
        r2 = sess.get(f"{API}/tournaments/{tid}/selection")
        assert r1.status_code == r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]


# ---------- 4. PATCH /selection: persists fields ----------

class TestPatchSelection:
    def test_patch_persists_shortlist_votes_officials(self, sess, accepted_tournament, sample_player_ids):
        tid = accepted_tournament["id"]
        # ensure squad exists
        sess.get(f"{API}/tournaments/{tid}/selection")
        payload = {
            "shortlist_ids": sample_player_ids[:5],
            "votes": {sample_player_ids[0]: ["sel-chair", "sel-indore"]},
            "voters": ["sel-chair", "sel-indore"],
            "match_officials": {"manager": "Rakesh", "coach": "Anil",
                                 "trainer": "T1", "physio": "P1",
                                 "umpire_1": "U1", "umpire_2": "U2",
                                 "scorer": "S1", "referee": "R1"},
            "notes": "Trial patch",
        }
        r = sess.patch(f"{API}/tournaments/{tid}/selection", json=payload,
                       headers={"X-Role-Id": "division-secretary"})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["shortlist_ids"] == sample_player_ids[:5]
        assert s["voters"] == ["sel-chair", "sel-indore"]
        assert s["match_officials"]["manager"] == "Rakesh"
        assert s["match_officials"]["umpire_1"] == "U1"
        assert s["notes"] == "Trial patch"

    def test_patch_persists_members(self, sess, accepted_tournament, sample_player_ids):
        tid = accepted_tournament["id"]
        # Look up the html-seed player rows to build member payloads
        players = sess.get(f"{API}/players").json()
        by_id = {p["id"]: p for p in players}
        members = []
        for i, pid in enumerate(sample_player_ids[:12]):
            pl = by_id[pid]
            members.append({
                "player_id": pid,
                "player_no": pl["player_id"],
                "full_name": pl["full_name"],
                "role": pl["role"],
                "is_captain": i == 0,
                "is_vice_captain": i == 1,
                "is_keeper": False,
            })
        r = sess.patch(f"{API}/tournaments/{tid}/selection",
                       json={"members": members},
                       headers={"X-Role-Id": "division-secretary"})
        assert r.status_code == 200, r.text
        assert len(r.json()["members"]) == 12
        assert r.json()["members"][0]["is_captain"] is True


# ---------- 5. Submit workflow ----------

class TestSubmit:
    def test_submit_403_without_role(self, sess, accepted_tournament):
        tid = accepted_tournament["id"]
        r = sess.post(f"{API}/tournaments/{tid}/selection/submit", json={})
        assert r.status_code == 403

    def test_submit_fails_when_less_than_11(self, sess, accepted_tournament, sample_player_ids):
        # Create a NEW tournament so state is deterministic
        payload = {
            "name": f"M12 SubmitSmall {STAMP}",
            "format": "OneDay_Senior", "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional", "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND", "max_squad_size": 15,
        }
        rc = sess.post(f"{API}/tournaments", json=payload,
                       headers={"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary"})
        tid = rc.json()["id"]
        sess.post(f"{API}/tournaments/{tid}/acceptance", json={"action": "accept"},
                  headers={"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary"})

        # Add only 3 members
        players = sess.get(f"{API}/players").json()
        by_id = {p["id"]: p for p in players}
        members = [{
            "player_id": pid, "player_no": by_id[pid]["player_id"],
            "full_name": by_id[pid]["full_name"], "role": by_id[pid]["role"],
            "is_captain": i == 0, "is_vice_captain": False, "is_keeper": False,
        } for i, pid in enumerate(sample_player_ids[:3])]
        sess.patch(f"{API}/tournaments/{tid}/selection",
                   json={"members": members},
                   headers={"X-Role-Id": "division-secretary"})
        r = sess.post(f"{API}/tournaments/{tid}/selection/submit", json={},
                      headers={"X-Role-Id": "division-secretary",
                               "X-User-Body-Code": "DIV-IND"})
        assert r.status_code == 400
        assert "11" in r.text or "at least" in r.text.lower()

        # Cleanup
        _delete_tournament(tid)

    def test_submit_fails_when_no_captain(self, sess, sample_player_ids):
        payload = {
            "name": f"M12 SubmitNoCap {STAMP}",
            "format": "OneDay_Senior", "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional", "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND", "max_squad_size": 15,
        }
        rc = sess.post(f"{API}/tournaments", json=payload,
                       headers={"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary"})
        tid = rc.json()["id"]
        sess.post(f"{API}/tournaments/{tid}/acceptance", json={"action": "accept"},
                  headers={"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary"})

        players = sess.get(f"{API}/players").json()
        by_id = {p["id"]: p for p in players}
        members = [{
            "player_id": pid, "player_no": by_id[pid]["player_id"],
            "full_name": by_id[pid]["full_name"], "role": by_id[pid]["role"],
            "is_captain": False, "is_vice_captain": False, "is_keeper": False,
        } for pid in sample_player_ids[:11]]
        sess.patch(f"{API}/tournaments/{tid}/selection",
                   json={"members": members},
                   headers={"X-Role-Id": "division-secretary"})
        r = sess.post(f"{API}/tournaments/{tid}/selection/submit", json={},
                      headers={"X-Role-Id": "division-secretary",
                               "X-User-Body-Code": "DIV-IND"})
        assert r.status_code == 400
        assert "captain" in r.text.lower()

        _delete_tournament(tid)

    def test_submit_success_and_locks_edits(self, sess, sample_player_ids):
        payload = {
            "name": f"M12 SubmitOK {STAMP}",
            "format": "OneDay_Senior", "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional", "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND", "max_squad_size": 15,
        }
        rc = sess.post(f"{API}/tournaments", json=payload,
                       headers={"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary"})
        tid = rc.json()["id"]
        sess.post(f"{API}/tournaments/{tid}/acceptance", json={"action": "accept"},
                  headers={"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary"})

        players = sess.get(f"{API}/players").json()
        by_id = {p["id"]: p for p in players}
        members = [{
            "player_id": pid, "player_no": by_id[pid]["player_id"],
            "full_name": by_id[pid]["full_name"], "role": by_id[pid]["role"],
            "is_captain": i == 0, "is_vice_captain": False, "is_keeper": i == 1,
        } for i, pid in enumerate(sample_player_ids[:11])]
        sess.patch(f"{API}/tournaments/{tid}/selection",
                   json={"members": members},
                   headers={"X-Role-Id": "division-secretary"})
        r = sess.post(f"{API}/tournaments/{tid}/selection/submit", json={"note": "please approve"},
                      headers={"X-Role-Id": "division-secretary",
                               "X-User-Body-Code": "DIV-IND",
                               "X-User-Name": "Shri Vikram Patil"})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["submission_status"] == "Awaiting_MPCA_Approval"
        assert s["submitted_at"] is not None
        assert s["submitted_by"] == "Shri Vikram Patil"

        # Now patch should be blocked
        r2 = sess.patch(f"{API}/tournaments/{tid}/selection",
                        json={"notes": "sneaky edit"},
                        headers={"X-Role-Id": "division-secretary"})
        assert r2.status_code == 400
        assert "locked" in r2.text.lower() or "awaiting" in r2.text.lower()

        # store for review tests via return
        pytest.M12_AWAITING_TID = tid


# ---------- 6. Review workflow ----------

class TestReview:
    def test_review_403_for_non_mpca(self, sess):
        tid = getattr(pytest, "M12_AWAITING_TID", None)
        if not tid:
            pytest.skip("depends on submit success test")
        r = sess.post(f"{API}/tournaments/{tid}/selection/review",
                      json={"action": "approve"},
                      headers={"X-Role-Id": "division-secretary"})
        assert r.status_code == 403

    def test_review_approve_by_secretary(self, sess):
        tid = getattr(pytest, "M12_AWAITING_TID", None)
        if not tid:
            pytest.skip("depends on submit")
        r = sess.post(f"{API}/tournaments/{tid}/selection/review",
                      json={"action": "approve", "note": "Looks good"},
                      headers={"X-Role-Id": "secretary",
                               "X-User-Name": "Shri Sanjeev Rao"})
        assert r.status_code == 200, r.text
        assert r.json()["submission_status"] == "Approved"

        # Re-review must 400
        r2 = sess.post(f"{API}/tournaments/{tid}/selection/review",
                       json={"action": "reject"},
                       headers={"X-Role-Id": "secretary"})
        assert r2.status_code == 400

        # Cleanup this test tournament
        _delete_tournament(tid)

    def test_review_reject_flow(self, sess, sample_player_ids):
        # Build a new full submission then reject it
        payload = {
            "name": f"M12 Reject {STAMP}",
            "format": "OneDay_Senior", "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional", "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND", "max_squad_size": 15,
        }
        rc = sess.post(f"{API}/tournaments", json=payload,
                       headers={"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary"})
        tid = rc.json()["id"]
        sess.post(f"{API}/tournaments/{tid}/acceptance", json={"action": "accept"},
                  headers={"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary"})

        players = sess.get(f"{API}/players").json()
        by_id = {p["id"]: p for p in players}
        members = [{
            "player_id": pid, "player_no": by_id[pid]["player_id"],
            "full_name": by_id[pid]["full_name"], "role": by_id[pid]["role"],
            "is_captain": i == 0, "is_vice_captain": False, "is_keeper": False,
        } for i, pid in enumerate(sample_player_ids[:11])]
        sess.patch(f"{API}/tournaments/{tid}/selection", json={"members": members},
                   headers={"X-Role-Id": "division-secretary"})
        sess.post(f"{API}/tournaments/{tid}/selection/submit", json={},
                  headers={"X-Role-Id": "division-secretary",
                           "X-User-Body-Code": "DIV-IND"})
        r = sess.post(f"{API}/tournaments/{tid}/selection/review",
                      json={"action": "reject", "note": "Fix balance"},
                      headers={"X-Role-Id": "secretary",
                               "X-User-Name": "Shri Sanjeev Rao"})
        assert r.status_code == 200
        s = r.json()
        assert s["submission_status"] == "Rejected"
        assert s["review_note"] == "Fix balance"

        # Now patch should be allowed again (Rejected -> editable)
        r2 = sess.patch(f"{API}/tournaments/{tid}/selection",
                        json={"notes": "reworked"},
                        headers={"X-Role-Id": "division-secretary"})
        assert r2.status_code == 200
        assert r2.json()["notes"] == "reworked"

        _delete_tournament(tid)

    def test_review_bad_action(self, sess, sample_player_ids):
        # Non-awaiting → 400
        payload = {
            "name": f"M12 NoAwait {STAMP}",
            "format": "OneDay_Senior", "scope": "Inter_Divisional",
            "tournament_type": "MPCA_InterDivisional", "fiscal_cycle": "2025-26",
            "host_body_id": "DIV-IND", "max_squad_size": 15,
        }
        rc = sess.post(f"{API}/tournaments", json=payload,
                       headers={"X-User-Body-Code": "MPCA", "X-Role-Id": "secretary"})
        tid = rc.json()["id"]
        sess.post(f"{API}/tournaments/{tid}/acceptance", json={"action": "accept"},
                  headers={"X-User-Body-Code": "DIV-IND", "X-Role-Id": "division-secretary"})
        sess.get(f"{API}/tournaments/{tid}/selection")  # create draft
        r = sess.post(f"{API}/tournaments/{tid}/selection/review",
                      json={"action": "approve"},
                      headers={"X-Role-Id": "secretary"})
        assert r.status_code == 400
        _delete_tournament(tid)


# ---------- Cleanup: purge any residual M12 tournaments ----------

def test_zzz_cleanup(sess):
    tlist = sess.get(f"{API}/tournaments").json()
    for t in tlist:
        if t["name"].startswith("M12 ") or t["name"].startswith("BugFix "):
            try:
                _delete_tournament(t["id"])
            except Exception:
                pass
    remaining = [t for t in sess.get(f"{API}/tournaments").json()
                 if t["name"].startswith("M12 ")]
    assert len(remaining) == 0, f"Still {len(remaining)} M12 tournaments"
