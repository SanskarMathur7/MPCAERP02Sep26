"""Iter 121 — BUG FIX regression: POST /api/tournaments now fires M&C submit.

Coverage:
  1. Fresh tournament CREATE via CAO returns mc_status=PendingReview + 1 chain entry
  2. Backfilled 'Madhavrao Scindia Trophy' visible in PendingReview to Secretary
  3. Secretary can approve via M&C → tournament flips to Approved
  4. CAO cannot self-approve (two-person rule)
  5. Regression: legacy test_mc_engine.py workflow tests
  6. Regression: GET /api/tournaments returns roster including new + backfilled
  7. Regression: Auth + RBAC (18 users, 20 roles)
"""
import os
import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

CAO_EMAIL = "panditrdpandit@gmail.com"
SEC_EMAIL = "secretary@mpcaonline.com"
SYSADMIN_EMAIL = "sysadmin@mpca.in"
PW = "mpca@2026"


def _login(email: str, pw: str = PW) -> str:
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def cao_tok():
    return _login(CAO_EMAIL)


@pytest.fixture(scope="module")
def sec_tok():
    return _login(SEC_EMAIL)


@pytest.fixture(scope="module")
def sysadmin_tok():
    return _login(SYSADMIN_EMAIL)


# ─────────────────────────── Test 1 · Fresh CREATE fires M&C submit ───────
def test_fresh_tournament_create_fires_mc_submit(cao_tok):
    payload = {
        "name": "TEST_Iter121_Trophy",
        "tournament_type": "MPCA_InterDivisional",
        "tournament_type_code": "mpca_inter_divisional",
        "type_key": "mpca_inter_divisional",
        "scope": "Inter_Divisional",
        "format": "OneDay_Senior",
        "category": "MPCA_INTER_DIV",
        "level": "Senior",
        "gender": "Male",
        "start_date": "2026-11-01",
        "end_date": "2026-11-15",
        "host_body_id": "MPCA",
        "created_by_body_code": "MPCA",
        "fiscal_cycle": "2026-27",
    }
    r = httpx.post(f"{API}/tournaments", json=payload, headers=_auth(cao_tok), timeout=20)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    body = r.json()
    tid = body["id"]

    # Fetch canonical state via M&C
    st = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_auth(cao_tok), timeout=10)
    assert st.status_code == 200, st.text
    data = st.json()
    assert data["status"] == "PendingReview", f"expected PendingReview, got {data['status']} — full doc {body}"
    chain = data["chain"]
    assert len(chain) >= 1, f"expected ≥1 chain entry, got {chain}"
    submit_entries = [c for c in chain if c.get("action") == "submit"]
    assert submit_entries, f"no submit entry in chain: {chain}"
    assert submit_entries[0]["actor_id"] == "cao-mpca", f"actor_id mismatch: {submit_entries[0]}"

    # Save id for later tests
    pytest.iter121_new_tid = tid


# ─────────────────────────── Test 2 · Backfilled Madhavrao visible ─────────
def test_backfilled_madhavrao_pending_review(sec_tok):
    ts = httpx.get(f"{API}/tournaments", headers=_auth(sec_tok), timeout=15).json()
    rows = ts if isinstance(ts, list) else ts.get("items") or ts.get("tournaments") or []
    madhav = next((t for t in rows if "Madhavrao" in (t.get("name") or "")), None)
    assert madhav, "Madhavrao Scindia Trophy not found in tournaments list"
    tid = madhav["id"]

    r = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_auth(sec_tok), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "PendingReview", f"expected PendingReview, got {d['status']}"
    submit_entries = [c for c in d["chain"] if c.get("action") == "submit"]
    assert len(submit_entries) >= 1, f"chain missing submit: {d['chain']}"

    # Secretary should see approve/return/reject actions
    actions = {a["action"] for a in d.get("next_actions", [])}
    assert "approve" in actions, f"secretary can't approve — next_actions={d.get('next_actions')}"
    # Posts in steps must include Hon. Secretary
    step_posts = []
    for s in d.get("steps", []):
        step_posts.extend(s.get("posts") or [])
    titles = {p.get("post_title") for p in step_posts}
    assert "Hon. Secretary" in titles, f"Hon. Secretary not in required posts: {titles}"

    pytest.iter121_madhav_tid = tid


# ─────────────────────────── Test 3 · Secretary approves ──────────────────
def test_secretary_can_approve(sec_tok, cao_tok):
    # Use the freshly created tournament from Test 1 (approve it now)
    tid = getattr(pytest, "iter121_new_tid", None)
    assert tid, "test 1 didn't seed a new tournament"

    r = httpx.post(
        f"{API}/mc/tournament_create/{tid}/transition",
        json={"action": "approve"},
        headers=_auth(sec_tok),
        timeout=15,
    )
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"
    doc = r.json()["doc"]
    assert doc["mc_status"] == "Approved", f"expected Approved, got {doc['mc_status']}"
    chain = doc.get("mc_chain") or []
    actions = [c.get("action") for c in chain]
    assert actions.count("submit") >= 1 and actions.count("approve") >= 1, (
        f"chain missing submit+approve: {actions}"
    )


# ─────────────────────────── Test 4 · CAO cannot self-approve ─────────────
def test_cao_cannot_self_approve(cao_tok):
    """Create a fresh tournament as CAO, then attempt to approve as CAO → must fail."""
    payload = {
        "name": "TEST_Iter121_SelfApproveGuard",
        "tournament_type": "MPCA_InterDivisional",
        "tournament_type_code": "mpca_inter_divisional",
        "type_key": "mpca_inter_divisional",
        "scope": "Inter_Divisional",
        "format": "OneDay_Senior",
        "category": "MPCA_INTER_DIV",
        "level": "Senior",
        "gender": "Male",
        "start_date": "2026-12-01",
        "end_date": "2026-12-15",
        "host_body_id": "MPCA",
        "created_by_body_code": "MPCA",
        "fiscal_cycle": "2026-27",
    }
    r = httpx.post(f"{API}/tournaments", json=payload, headers=_auth(cao_tok), timeout=20)
    assert r.status_code == 200
    tid = r.json()["id"]

    r = httpx.post(
        f"{API}/mc/tournament_create/{tid}/transition",
        json={"action": "approve"},
        headers=_auth(cao_tok),
        timeout=15,
    )
    assert r.status_code in (400, 403), f"expected 400/403 for self-approve, got {r.status_code} {r.text}"
    # Must mention two-person OR not authorised
    txt = r.text.lower()
    assert (
        "two-person" in txt or "not authorised" in txt or "not authorized" in txt or "post" in txt
    ), f"error msg lacks two-person/actor context: {r.text}"


# ─────────────────────────── Test 5 · Regression: /api/tournaments roster ──
def test_tournaments_roster_regression(cao_tok):
    r = httpx.get(f"{API}/tournaments", headers=_auth(cao_tok), timeout=15)
    assert r.status_code == 200
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or r.json().get("tournaments") or []
    names = [t.get("name") for t in rows]
    assert any("Madhavrao" in (n or "") for n in names), "Madhavrao missing from roster"
    assert any("TEST_Iter121" in (n or "") for n in names), "new iter121 tournament missing from roster"


# ─────────────────────────── Test 6 · Regression: RBAC ────────────────────
def test_rbac_users_and_roles(sysadmin_tok):
    ru = httpx.get(f"{API}/rbac/users", headers=_auth(sysadmin_tok), timeout=15)
    assert ru.status_code == 200
    users = ru.json() if isinstance(ru.json(), list) else ru.json().get("users") or []
    assert len(users) == 18, f"expected 18 users, got {len(users)}"

    rr = httpx.get(f"{API}/rbac/roles", headers=_auth(sysadmin_tok), timeout=15)
    assert rr.status_code == 200
    roles = rr.json() if isinstance(rr.json(), list) else rr.json().get("roles") or []
    assert len(roles) == 20, f"expected 20 roles, got {len(roles)}"
    role_ids = {r.get("id") or r.get("role_id") for r in roles}
    assert "vice_president" in role_ids, "vice_president missing"
    assert "internal_auditor" in role_ids, "internal_auditor missing"


# ─────────────────────────── Test 7 · Sysadmin login (no force reset) ─────
def test_sysadmin_login_no_force_reset(sysadmin_tok):
    r = httpx.get(f"{API}/auth/me", headers=_auth(sysadmin_tok), timeout=10)
    assert r.status_code == 200
    me = r.json()
    assert me.get("force_password_reset") in (False, None), f"sysadmin should not force reset: {me}"


# ─────────────────────────── Cleanup ──────────────────────────────────────
def test_cleanup_test_tournaments(cao_tok):
    """Best-effort cleanup of TEST_Iter121_* tournaments."""
    r = httpx.get(f"{API}/tournaments", headers=_auth(cao_tok), timeout=15)
    rows = r.json() if isinstance(r.json(), list) else r.json().get("items") or []
    for t in rows:
        if (t.get("name") or "").startswith("TEST_Iter121_"):
            httpx.delete(f"{API}/tournaments/{t['id']}", headers=_auth(cao_tok), timeout=10)
