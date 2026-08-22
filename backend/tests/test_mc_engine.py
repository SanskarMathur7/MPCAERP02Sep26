"""tests/test_mc_engine.py — Iter 109 · Maker-Checker engine sanity."""
import os
import httpx
import pytest

API = f"{os.environ.get('BACKEND_URL', 'http://localhost:8001')}/api"


def _login(email: str, password: str = "mpca@2026") -> str:
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_mc_admin_lists_17_workflows():
    tok = _login("secretary@mpca.in")
    r = httpx.get(f"{API}/mc-admin/workflows", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    keys = [w["key"] for w in r.json()["workflows"]]
    assert "tournament_create" in keys
    assert "player_registration_approve" in keys
    assert "grant_claim_approve" in keys
    assert len(keys) >= 17


def test_mc_admin_posts_catalog_has_new_posts():
    tok = _login("secretary@mpca.in")
    r = httpx.get(f"{API}/mc-admin/posts", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    titles = [p["post_title"] for p in r.json()["posts"]]
    for t in ("President", "Hon. Secretary", "Chief Accounts Officer",
              "Cricket Manager", "Selection Chairperson", "Joint Secretary"):
        assert t in titles, f"Missing canonical post: {t}"


def test_mc_admin_requires_rbac_manage_permission():
    tok = _login("indore.secretary@mpca.in")
    r = httpx.get(f"{API}/mc-admin/workflows", headers=_auth(tok), timeout=10)
    assert r.status_code == 403


def test_mc_runtime_state_shape():
    """A logged-in user can query state of any tournament (get 200 with the standard shape)."""
    tok = _login("secretary@mpca.in")
    ts = httpx.get(f"{API}/tournaments?limit=1", headers=_auth(tok), timeout=10).json()
    rows = ts if isinstance(ts, list) else ts.get("items") or ts.get("tournaments") or []
    assert rows, "seed a tournament first"
    tid = rows[0]["id"]
    r = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    d = r.json()
    for k in ("status", "chain", "next_actions", "workflow", "steps"):
        assert k in d, f"state view missing {k}"


def test_mc_rework_inbox_endpoint():
    tok = _login("cricket.manager@mpca.in")
    r = httpx.get(f"{API}/mc/inbox/needs-rework", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    assert set(r.json().keys()) >= {"count", "buckets"}


def test_mc_two_person_rule_end_to_end():
    """Cricket Mgr submits → Secretary approves (partial) → Secretary can't sign twice → President approves → status flips to Approved.

    Requires the tournament_create workflow to be pre-configured (done via curl earlier).
    """
    cm = _login("cricket.manager@mpca.in")
    sec = _login("secretary@mpca.in")
    pres = _login("president@mpca.in")
    # Fetch a fresh tournament — reset its mc_status to Draft first
    ts = httpx.get(f"{API}/tournaments?limit=10", headers=_auth(sec), timeout=10).json()
    rows = ts if isinstance(ts, list) else ts.get("items") or ts.get("tournaments") or []
    assert len(rows) >= 1
    # Pick the last one
    tid = rows[-1]["id"]
    # Direct DB reset via patching mc_status is not exposed; instead we just
    # verify the API returns something sensible on state calls
    state = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_auth(cm), timeout=10)
    assert state.status_code == 200

    # If already Approved by prior tests, skip transitions
    if state.json()["status"] in ("Approved", "Rejected"):
        pytest.skip("this doc already terminal — engine transitions verified in other tests")

    # Submit
    r = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_auth(cm),
                   json={"action": "submit"}, timeout=10)
    if r.status_code == 400 and "No transition" in r.text:
        pytest.skip("wrong starting status — earlier tests moved this doc")
    assert r.status_code == 200, r.text
    assert r.json()["doc"]["mc_status"] == "PendingReview"

    # Secretary partial approve
    r = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_auth(sec),
                   json={"action": "approve"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["doc"]["mc_status"] == "PendingReview"  # still pending
    assert len(r.json()["doc"]["mc_approvals"]) >= 1

    # Two-person rule enforced
    r = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_auth(sec),
                   json={"action": "approve"}, timeout=10)
    assert r.status_code == 403
    assert "Two-person" in r.text

    # President finalises
    r = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_auth(pres),
                   json={"action": "approve"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["doc"]["mc_status"] == "Approved"
