"""tests/test_mc_engine.py — Iter 109 (updated Iter 121) · M&C engine sanity.

Refreshed for Feb 2026 real MPCA roster:
  · Maker (submit) = Chief Accounts Officer (panditrdpandit@gmail.com)
  · Checker (approve/return/reject) = Hon. Secretary (secretary@mpcaonline.com)
  · Two-person rule enforced on approve/reject
"""
import os
import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", os.environ.get("BACKEND_URL", "http://localhost:8001")).rstrip("/")
API = f"{BASE_URL}/api"

PW = "mpca@2026"


def _login(email: str, password: str = PW) -> str:
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_mc_admin_lists_17_workflows():
    tok = _login("sysadmin@mpca.in")
    r = httpx.get(f"{API}/mc-admin/workflows", headers=_auth(tok), timeout=10)
    assert r.status_code == 200, r.text
    keys = [w["key"] for w in r.json()["workflows"]]
    assert "tournament_create" in keys
    assert "player_registration_approve" in keys
    assert "grant_claim_approve" in keys
    assert len(keys) >= 17


def test_mc_admin_posts_catalog_has_new_posts():
    tok = _login("sysadmin@mpca.in")
    r = httpx.get(f"{API}/mc-admin/posts", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    titles = [p["post_title"] for p in r.json()["posts"]]
    for t in ("President", "Hon. Secretary", "Chief Accounts Officer",
              "Cricket Manager", "Selection Chairperson", "Joint Secretary"):
        assert t in titles, f"Missing canonical post: {t}"


def test_mc_admin_requires_rbac_manage_permission():
    # A division-honorary secretary should NOT have rbac.manage
    tok = _login("ind.hs@mpcaonline.com")
    r = httpx.get(f"{API}/mc-admin/workflows", headers=_auth(tok), timeout=10)
    assert r.status_code == 403


def test_mc_runtime_state_shape():
    tok = _login("secretary@mpcaonline.com")
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
    tok = _login("panditrdpandit@gmail.com")  # CAO is the maker
    r = httpx.get(f"{API}/mc/inbox/needs-rework", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    assert set(r.json().keys()) >= {"count", "buckets"}


def test_mc_two_person_rule_end_to_end():
    """CAO submits via tournament CREATE → Sec approves → status flips to Approved.
    CAO can't self-approve (two-person)."""
    cao = _login("panditrdpandit@gmail.com")
    sec = _login("secretary@mpcaonline.com")

    payload = {
        "name": "TEST_mc_engine_e2e",
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
    cr = httpx.post(f"{API}/tournaments", json=payload, headers=_auth(cao), timeout=20)
    assert cr.status_code == 200, cr.text
    tid = cr.json()["id"]

    # State should be PendingReview after inline submit
    st = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_auth(cao), timeout=10).json()
    assert st["status"] == "PendingReview", st

    # CAO cannot approve own submission
    bad = httpx.post(f"{API}/mc/tournament_create/{tid}/transition",
                     headers=_auth(cao), json={"action": "approve"}, timeout=10)
    assert bad.status_code in (400, 403), bad.text

    # Sec approves → Approved
    ok = httpx.post(f"{API}/mc/tournament_create/{tid}/transition",
                    headers=_auth(sec), json={"action": "approve"}, timeout=10)
    assert ok.status_code == 200, ok.text
    assert ok.json()["doc"]["mc_status"] == "Approved"

    # Cleanup
    httpx.delete(f"{API}/tournaments/{tid}", headers=_auth(cao), timeout=10)
