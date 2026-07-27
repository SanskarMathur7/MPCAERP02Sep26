"""M34 · Squad Match Officials PATCH endpoint + RBAC + workflow guard."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

TID = "58bd8f3c-2562-4231-b846-537103e8a542"  # SM Khan Trophy
SID = "96329508-900d-4a8d-a044-46cf53dc0c9e"  # DIV-IND squad on above tournament


def _get_squad():
    r = requests.get(f"{API}/tournaments/{TID}/squads", timeout=15)
    r.raise_for_status()
    return next((s for s in r.json() if s["id"] == SID), None)


@pytest.fixture(scope="module", autouse=True)
def reopen_and_restore():
    """Reopen the squad (Approved -> Draft) so PATCH write-path can be tested.
    Restore original state (Approved) + original officials at teardown."""
    original = _get_squad()
    assert original is not None, "seed squad missing"
    original_status = original.get("submission_status")
    original_officials = dict(original.get("match_officials") or {})

    if original_status == "Approved":
        r = requests.post(f"{API}/squads/{SID}/reopen", headers={"X-Role-Id": "secretary"}, timeout=15)
        assert r.status_code == 200, f"reopen failed: {r.status_code} {r.text}"

    yield {"original_status": original_status, "original_officials": original_officials}

    # Restore officials via MPCA (bypasses workflow guard)
    payload = {k: original_officials.get(k) for k in
               ["manager", "coach", "trainer", "physio", "umpire_1", "umpire_2", "scorer", "referee"]}
    requests.patch(f"{API}/squads/{SID}/officials", json=payload,
                   headers={"X-Role-Id": "secretary"}, timeout=15)
    # Re-finalize if it was Approved originally
    if original_status == "Approved":
        # Need >=11 members + captain; if no captain we can't finalize.
        s = _get_squad()
        has_cap = any(m.get("is_captain") for m in s.get("members", []))
        if has_cap and len(s.get("members", [])) >= 11:
            requests.post(f"{API}/squads/{SID}/review",
                          json={"action": "finalize", "note": "restore"},
                          headers={"X-Role-Id": "secretary"}, timeout=15)


# ─── PATCH happy path (owner body) ──────────────────────────────────────

def test_patch_officials_owner_ok():
    payload = {"manager": "TEST_Manager_M34", "umpire_1": "TEST_Umpire_A"}
    r = requests.patch(f"{API}/squads/{SID}/officials", json=payload,
                       headers={"X-User-Body-Code": "DIV-IND"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    mo = data.get("match_officials") or {}
    assert mo.get("manager") == "TEST_Manager_M34"
    assert mo.get("umpire_1") == "TEST_Umpire_A"


def test_patch_officials_missing_keys_preserved():
    # Set two fields
    requests.patch(f"{API}/squads/{SID}/officials",
                   json={"coach": "TEST_Coach_X", "scorer": "TEST_Scorer_Y"},
                   headers={"X-User-Body-Code": "DIV-IND"}, timeout=15)
    # Now patch only coach with new value; scorer should remain
    r = requests.patch(f"{API}/squads/{SID}/officials",
                       json={"coach": "TEST_Coach_X2"},
                       headers={"X-User-Body-Code": "DIV-IND"}, timeout=15)
    assert r.status_code == 200
    mo = r.json().get("match_officials") or {}
    assert mo.get("coach") == "TEST_Coach_X2"
    assert mo.get("scorer") == "TEST_Scorer_Y"


def test_patch_officials_null_clears_field():
    # Empty string / None should be allowed (present key set)
    r = requests.patch(f"{API}/squads/{SID}/officials",
                       json={"physio": ""},
                       headers={"X-User-Body-Code": "DIV-IND"}, timeout=15)
    assert r.status_code == 200
    mo = r.json().get("match_officials") or {}
    assert mo.get("physio") == ""


# ─── RBAC ──────────────────────────────────────────────────────────────

def test_patch_officials_unrelated_body_forbidden():
    r = requests.patch(f"{API}/squads/{SID}/officials",
                       json={"manager": "SHOULD_FAIL"},
                       headers={"X-User-Body-Code": "DIV-BPL"}, timeout=15)
    assert r.status_code == 403, r.text


def test_patch_officials_mpca_can_edit():
    r = requests.patch(f"{API}/squads/{SID}/officials",
                       json={"referee": "TEST_MPCA_Referee"},
                       headers={"X-Role-Id": "secretary"}, timeout=15)
    assert r.status_code == 200
    assert (r.json().get("match_officials") or {}).get("referee") == "TEST_MPCA_Referee"


# ─── Workflow guard ────────────────────────────────────────────────────

def test_patch_officials_blocked_when_awaiting_or_approved():
    # Submit to MPCA (need cap+11). Squad currently has 15 but may lack captain.
    s = _get_squad()
    if not any(m.get("is_captain") for m in s.get("members", [])):
        # mark first member captain via legacy tournament-selection PATCH
        members = list(s.get("members", []))
        members[0]["is_captain"] = True
        r = requests.patch(f"{API}/tournaments/{TID}/selection",
                           json={"members": members},
                           headers={"X-Role-Id": "division-secretary"}, timeout=15)
        assert r.status_code == 200, r.text

    r = requests.post(f"{API}/squads/{SID}/submit", json={"note": "test"},
                      headers={"X-Role-Id": "division-secretary",
                               "X-User-Body-Code": "DIV-IND"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("submission_status") == "Awaiting_MPCA_Approval"

    # Owning body now blocked
    r = requests.patch(f"{API}/squads/{SID}/officials",
                       json={"manager": "SHOULD_BE_BLOCKED"},
                       headers={"X-User-Body-Code": "DIV-IND"}, timeout=15)
    assert r.status_code == 400
    assert "reopen" in r.text.lower() or "awaiting" in r.text.lower()

    # MPCA still allowed
    r = requests.patch(f"{API}/squads/{SID}/officials",
                       json={"manager": "TEST_MPCA_Override"},
                       headers={"X-Role-Id": "secretary"}, timeout=15)
    assert r.status_code == 200
    assert (r.json().get("match_officials") or {}).get("manager") == "TEST_MPCA_Override"

    # Reopen so subsequent tests / restore work
    r = requests.post(f"{API}/squads/{SID}/reopen",
                      headers={"X-Role-Id": "secretary"}, timeout=15)
    assert r.status_code == 200
