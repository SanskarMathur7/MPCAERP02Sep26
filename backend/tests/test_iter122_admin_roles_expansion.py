"""Iter 122 · BUG FIX regression — real MPCA role_ids added to _ADMIN_ROLES sets.

Covers 5 files where hardcoded legacy persona IDs were replaced with the
real Feb-2026 RBAC role_ids across:
  · routes/match_officials.py       (_ADMIN_ROLES)
  · routes/player_registrations.py  (MPCA_ROLES)
  · routes/body_documents.py        (MPCA_READ_ROLES)
  · routes/selection_console.py     (_DIVISION_ROLES)
  · routes/members.py               (_OFFICE_BEARER_ROLES)

USER PROOF: Secretary can POST /api/tournaments/{tid}/match-officials
           Division Secretary is 403 for same POST (central assignment blocked).
"""
import os
import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
PW = "mpca@2026"

SEC_EMAIL = "secretary@mpcaonline.com"
VP_EMAIL = "vicepresident@mpcaonline.com"
JS_EMAIL = "jointsecretary@mpcaonline.com"
DIV_SEC_EMAIL = "ind.hs@mpcaonline.com"
SYSADMIN_EMAIL = "sysadmin@mpca.in"


def _login(email: str, pw: str = PW) -> str:
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ── Session-scoped token fixtures ────────────────────────────────────────
@pytest.fixture(scope="module")
def sec_tok():   return _login(SEC_EMAIL)


@pytest.fixture(scope="module")
def vp_tok():    return _login(VP_EMAIL)


@pytest.fixture(scope="module")
def js_tok():    return _login(JS_EMAIL)


@pytest.fixture(scope="module")
def div_tok():   return _login(DIV_SEC_EMAIL)


@pytest.fixture(scope="module")
def sysadmin_tok(): return _login(SYSADMIN_EMAIL)


# ── Helper — find any tournament + any match official ────────────────────
@pytest.fixture(scope="module")
def any_tournament_id(sec_tok):
    r = httpx.get(f"{API}/tournaments", headers=_auth(sec_tok), timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    assert items, "no tournaments seeded — cannot test"
    # Prefer Madhavrao Trophy if present, else first
    for t in items:
        if "Madhavrao" in (t.get("name") or ""):
            return t["id"]
    return items[0]["id"]


@pytest.fixture(scope="module")
def any_official_id(sec_tok):
    r = httpx.get(f"{API}/match-officials?role=Umpire&active_only=true",
                  headers=_auth(sec_tok), timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    assert items, "no match officials seeded"
    return items[0]["id"]


# ══════════════════════════════════════════════════════════════════════════
# TEST 1 · USER BUG · Secretary CAN assign a match official (was 403)
# ══════════════════════════════════════════════════════════════════════════
def test_secretary_can_assign_match_official(sec_tok, any_tournament_id, any_official_id):
    payload = {"official_id": any_official_id, "role": "Umpire", "days": 2}
    r = httpx.post(
        f"{API}/tournaments/{any_tournament_id}/match-officials",
        json=payload, headers=_auth(sec_tok), timeout=15,
    )
    assert r.status_code == 200, (
        f"Secretary was BLOCKED from central assignment — got {r.status_code}: {r.text}\n"
        f"USER BUG NOT FIXED: 'Only MPCA office bearers may assign match officials.'"
    )
    body = r.json()
    assert body.get("official_id") == any_official_id
    assert body.get("role") == "Umpire"
    assert body.get("tournament_id") == any_tournament_id
    # cleanup — remove the assignment so re-runs stay idempotent
    aid = body.get("id")
    if aid:
        httpx.delete(f"{API}/tournaments/{any_tournament_id}/match-officials/{aid}",
                     headers=_auth(sec_tok), timeout=10)


# ══════════════════════════════════════════════════════════════════════════
# TEST 2 · Division Secretary is BLOCKED from central assignment
# ══════════════════════════════════════════════════════════════════════════
def test_division_secretary_blocked_from_central_assignment(div_tok, any_tournament_id, any_official_id):
    payload = {"official_id": any_official_id, "role": "Umpire", "days": 2}
    r = httpx.post(
        f"{API}/tournaments/{any_tournament_id}/match-officials",
        json=payload, headers=_auth(div_tok), timeout=15,
    )
    # 403 expected; central assignment is MPCA-scope only for MPCA-owned tournament types
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    detail = (r.json().get("detail") or "").lower()
    assert ("mpca" in detail or "central" in detail or "host division" in detail), \
        f"unexpected block reason: {detail}"


# ══════════════════════════════════════════════════════════════════════════
# TEST 3 · Secretary can list / approve player registrations
# ══════════════════════════════════════════════════════════════════════════
def test_secretary_can_list_player_registrations(sec_tok):
    r = httpx.get(f"{API}/player-registrations", headers=_auth(sec_tok), timeout=15)
    assert r.status_code == 200, f"list failed: {r.status_code} {r.text}"
    assert isinstance(r.json(), list)


# ══════════════════════════════════════════════════════════════════════════
# TEST 4 · Vice President has admin privileges
# ══════════════════════════════════════════════════════════════════════════
def test_vice_president_can_list_members(vp_tok):
    r = httpx.get(f"{API}/members", headers=_auth(vp_tok), timeout=15)
    assert r.status_code == 200, f"VP blocked from /api/members: {r.status_code} {r.text}"


def test_vice_president_can_assign_match_official(vp_tok, any_tournament_id, any_official_id):
    payload = {"official_id": any_official_id, "role": "Scorer", "days": 1}
    r = httpx.post(
        f"{API}/tournaments/{any_tournament_id}/match-officials",
        json=payload, headers=_auth(vp_tok), timeout=15,
    )
    assert r.status_code == 200, f"VP central-assign failed: {r.status_code} {r.text}"
    aid = r.json().get("id")
    if aid:
        httpx.delete(f"{API}/tournaments/{any_tournament_id}/match-officials/{aid}",
                     headers=_auth(vp_tok), timeout=10)


# ══════════════════════════════════════════════════════════════════════════
# TEST 5 · Joint Secretary has admin privileges
# ══════════════════════════════════════════════════════════════════════════
def test_joint_secretary_can_assign_match_official(js_tok, any_tournament_id, any_official_id):
    payload = {"official_id": any_official_id, "role": "Referee", "days": 1}
    r = httpx.post(
        f"{API}/tournaments/{any_tournament_id}/match-officials",
        json=payload, headers=_auth(js_tok), timeout=15,
    )
    assert r.status_code == 200, f"Joint Secretary central-assign failed: {r.status_code} {r.text}"
    aid = r.json().get("id")
    if aid:
        httpx.delete(f"{API}/tournaments/{any_tournament_id}/match-officials/{aid}",
                     headers=_auth(js_tok), timeout=10)


# ══════════════════════════════════════════════════════════════════════════
# TEST 6 · SysAdmin regression — still bypasses everything
# ══════════════════════════════════════════════════════════════════════════
def test_sysadmin_can_assign_match_official(sysadmin_tok, any_tournament_id, any_official_id):
    payload = {"official_id": any_official_id, "role": "Umpire", "days": 1}
    r = httpx.post(
        f"{API}/tournaments/{any_tournament_id}/match-officials",
        json=payload, headers=_auth(sysadmin_tok), timeout=15,
    )
    assert r.status_code == 200, f"SysAdmin central-assign failed: {r.status_code} {r.text}"
    aid = r.json().get("id")
    if aid:
        httpx.delete(f"{API}/tournaments/{any_tournament_id}/match-officials/{aid}",
                     headers=_auth(sysadmin_tok), timeout=10)


# ══════════════════════════════════════════════════════════════════════════
# TEST 7 · REGRESSION · RBAC roster preserved
# ══════════════════════════════════════════════════════════════════════════
def test_rbac_users_count(sysadmin_tok):
    r = httpx.get(f"{API}/rbac/users", headers=_auth(sysadmin_tok), timeout=15)
    assert r.status_code == 200, r.text
    users = r.json() if isinstance(r.json(), list) else r.json().get("users") or []
    assert len(users) == 18, f"expected 18 users, got {len(users)}"


def test_rbac_roles_count(sysadmin_tok):
    r = httpx.get(f"{API}/rbac/roles", headers=_auth(sysadmin_tok), timeout=15)
    assert r.status_code == 200, r.text
    roles = r.json() if isinstance(r.json(), list) else r.json().get("roles") or []
    assert len(roles) == 20, f"expected 20 roles, got {len(roles)}"
