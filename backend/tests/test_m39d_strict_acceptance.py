"""M39d · Strict Tournament Acceptance tests.
Verifies that only the invited Division/District Secretary can accept/reject
a tournament, and MPCA can no longer act on their behalf.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")

# Any tid works since role/persona checks happen BEFORE tournament lookup.
DUMMY_TID = "00000000-0000-0000-0000-000000000000"
REAL_TID = None


def _find_real_tid():
    global REAL_TID
    if REAL_TID:
        return REAL_TID
    r = requests.get(f"{BASE_URL}/api/tournaments?limit=5", headers={
        "X-Persona-Id": "secretary", "X-Body-Code": "MPCA", "X-Body-Type": "State"})
    if r.status_code == 200 and r.json():
        REAL_TID = r.json()[0]["id"]
    return REAL_TID


# ── PATCH /participants/{body_code} — participant-level acceptance ──

def test_patch_participant_mpca_cannot_flip_division():
    """MPCA persona cannot accept for DIV-IND."""
    r = requests.patch(
        f"{BASE_URL}/api/tournaments/{_find_real_tid() or DUMMY_TID}/participants/DIV-IND",
        headers={
            "X-Persona-Id": "secretary",
            "X-Body-Code": "MPCA",
            "X-Body-Type": "State",
        },
        json={"acceptance_status": "Accepted"},
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    body = r.json()
    detail = body.get("detail", "")
    assert "Only DIV-IND can accept" in detail or "MPCA cannot act" in detail, f"unexpected detail: {detail}"


def test_patch_participant_matching_body_passes_scope_check():
    """DIV-IND persona flipping DIV-IND row should pass the scope-check
    (it may then 404 if participant absent, but NOT 403)."""
    r = requests.patch(
        f"{BASE_URL}/api/tournaments/{_find_real_tid() or DUMMY_TID}/participants/DIV-IND",
        headers={
            "X-Persona-Id": "division-secretary",
            "X-Body-Code": "DIV-IND",
            "X-Body-Type": "Division",
        },
        json={"acceptance_status": "Accepted"},
    )
    # 200 = flipped; 404 = participant/tournament missing. NOT 403.
    assert r.status_code != 403, f"scope check falsely blocked matching body: {r.status_code}: {r.text}"


# ── POST /tournaments/{tid}/acceptance — top-level acceptance ──

def test_acceptance_top_level_mpca_secretary_forbidden():
    """MPCA secretary with X-Role-Id=secretary cannot act on behalf of DIV-IND."""
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{_find_real_tid() or DUMMY_TID}/acceptance",
        headers={
            "X-Role-Id": "secretary",
            "X-Body-Code": "MPCA",
            "X-User-Body-Code": "DIV-IND",
            "X-User-Name": "Sanjeev Dua",
        },
        json={"action": "accept"},
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    assert "Only the Division or District Secretary" in r.json().get("detail", "")


def test_acceptance_top_level_secretary_role_forbidden_even_if_body_matches():
    """Even with matching persona=MPCA and target=MPCA, role='secretary'
    is no longer in _ACCEPTANCE_ROLES, so it must 403."""
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{_find_real_tid() or DUMMY_TID}/acceptance",
        headers={
            "X-Role-Id": "secretary",
            "X-Body-Code": "MPCA",
            "X-User-Body-Code": "MPCA",
        },
        json={"action": "accept"},
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    assert "Only the Division or District Secretary" in r.json().get("detail", "")


def test_acceptance_top_level_president_role_forbidden():
    """President was previously allowed to accept on behalf of a Division;
    M39d removes that. Should now 403."""
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{_find_real_tid() or DUMMY_TID}/acceptance",
        headers={
            "X-Role-Id": "president",
            "X-Body-Code": "MPCA",
            "X-User-Body-Code": "DIV-IND",
        },
        json={"action": "accept"},
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_acceptance_top_level_division_secretary_role_allowed_past_role_gate():
    """DIV secretary role IS in _ACCEPTANCE_ROLES; with persona=DIV-IND acting
    on DIV-IND, must pass the role/persona gates. It may then 404 (tournament
    doesn't exist) or 403 (body not on required_from list) or 200."""
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{_find_real_tid() or DUMMY_TID}/acceptance",
        headers={
            "X-Role-Id": "division-secretary",
            "X-Body-Code": "DIV-IND",
            "X-User-Body-Code": "DIV-IND",
            "X-User-Name": "Devashish Nilosey",
        },
        json={"action": "accept"},
    )
    # Not the "Only the Division or District Secretary" 403.
    if r.status_code == 403:
        assert "Only the Division or District Secretary" not in r.json().get("detail", "")


def test_acceptance_top_level_persona_body_spoof_check():
    """X-Body-Code (persona) must match X-User-Body-Code (target). Mismatch → 403."""
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{_find_real_tid() or DUMMY_TID}/acceptance",
        headers={
            "X-Role-Id": "division-secretary",
            "X-Body-Code": "DIV-BPL",       # persona body
            "X-User-Body-Code": "DIV-IND",  # spoofed target
        },
        json={"action": "accept"},
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "cannot act on behalf of" in detail or "Only the Division" in detail
