"""Iter 119 — Backend tests for RBAC role matrix, user assignments, and password flows.

Covers:
- GET /api/rbac/roles returns 20 roles incl. vice_president + internal_auditor
- hon_treasurer got tournaments.* + squads.approve perms
- internal_auditor is read-only (no create/edit/approve)
- User role_id assignments (cao-mpca, internal-auditor, vice-president, joint-secretary, treasurer)
- POST /api/rbac/users/{uid}/reset-password + login with new pw
- POST /api/auth/change-password self-service
- RBAC users list has real Excel display_names (no legacy dummies)
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # Fall back to frontend/.env
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
SYS_EMAIL = "sysadmin@mpca.in"
SYS_PW = "mpca@2026"
PRES_EMAIL = "president@mpcaonline.com"
PRES_PW = "mpca@2026"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
    return r


@pytest.fixture(scope="module")
def sys_token():
    r = _login(SYS_EMAIL, SYS_PW)
    assert r.status_code == 200, f"sysadmin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def sys_headers(sys_token):
    return {"Authorization": f"Bearer {sys_token}", "Content-Type": "application/json"}


# ─── Roles ────────────────────────────────────────────────────

def test_roles_list_has_20_roles_incl_new(sys_headers):
    r = requests.get(f"{BASE_URL}/api/rbac/roles", headers=sys_headers, timeout=15)
    assert r.status_code == 200
    roles = r.json()
    ids = [x["id"] for x in roles]
    assert "vice_president" in ids, f"vice_president missing. got={ids}"
    assert "internal_auditor" in ids, f"internal_auditor missing. got={ids}"
    assert len(roles) == 20, f"expected 20 roles, got {len(roles)}: {ids}"


def test_hon_treasurer_has_tournament_and_squad_perms(sys_headers):
    r = requests.get(f"{BASE_URL}/api/rbac/roles", headers=sys_headers, timeout=15)
    role = next(x for x in r.json() if x["id"] == "hon_treasurer")
    perms = set(role["permissions"])
    required = {"tournaments.create", "tournaments.edit", "tournaments.publish",
                "tournaments.close", "squads.approve"}
    missing = required - perms
    assert not missing, f"hon_treasurer missing perms: {missing}"


def test_internal_auditor_is_read_only(sys_headers):
    r = requests.get(f"{BASE_URL}/api/rbac/roles", headers=sys_headers, timeout=15)
    role = next(x for x in r.json() if x["id"] == "internal_auditor")
    perms = set(role["permissions"])
    forbidden = {"tournaments.create", "tournaments.edit", "squads.approve"}
    leaks = forbidden & perms
    assert not leaks, f"internal_auditor has forbidden perms: {leaks}"
    # sanity — has audit/view perms
    assert "rbac.audit_log" in perms
    assert "budgets.view" in perms


# ─── User role assignments ────────────────────────────────────

def test_user_role_assignments(sys_headers):
    r = requests.get(f"{BASE_URL}/api/rbac/users", headers=sys_headers, timeout=15)
    assert r.status_code == 200
    users = {u["id"]: u for u in r.json()}
    expected = {
        "cao-mpca": "hon_treasurer",
        "internal-auditor": "internal_auditor",
        "vice-president": "vice_president",
        "joint-secretary": "joint_secretary",
        "treasurer": "hon_treasurer",
    }
    for uid, want in expected.items():
        assert uid in users, f"missing user {uid}"
        assert users[uid]["role_id"] == want, \
            f"{uid}: expected role_id={want} got={users[uid]['role_id']}"


def test_users_have_real_excel_display_names(sys_headers):
    r = requests.get(f"{BASE_URL}/api/rbac/users", headers=sys_headers, timeout=15)
    users = r.json()
    names = {u["display_name"] for u in users}
    expected_names = [
        "Mahanaaryaman Scindia", "Vineet Sethia", "Sudhir Asnani", "Arundhati Kirkire",
        "Sanjeev Dua", "Rohit Pandit", "Nitin Batra", "Devashish Nilesey",
        "Sushil Rajak", "Ajay Dwivedi", "Pradeep Tomar", "Vinay Shukla",
        "Vijay Prakash Sharma", "Tasleem Khan", "Kamal Shrivastava",
        "Shanti Kumar Jain", "Surendra Kabra", "Vikas Yadav",
    ]
    missing = [n for n in expected_names if n not in names]
    assert not missing, f"missing real names: {missing}"
    legacy = {"Naveen Mittal", "Kailash Vijayvargiya", "Rajesh Kulkarni"}
    leaks = legacy & names
    assert not leaks, f"legacy dummy names still present: {leaks}"


# ─── Password reset + change round-trip ───────────────────────

def test_reset_and_change_password_roundtrip(sys_headers):
    """president: reset via admin → login with new pw → change via self-service → login with fresher pw
    → restore back to mpca@2026 at the end."""
    tmp_pw = "newpassword123"
    fresh_pw = "freshpw123"

    # 1) admin reset
    r = requests.post(
        f"{BASE_URL}/api/rbac/users/president/reset-password",
        headers=sys_headers,
        json={"new_password": tmp_pw, "force_reset": True},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # 2) login with new pw returns force_password_reset=True
    r = _login(PRES_EMAIL, tmp_pw)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"].get("force_password_reset") is True
    tok = data["access_token"]

    # 3) self-service change-password
    r = requests.post(
        f"{BASE_URL}/api/auth/change-password",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        json={"current_password": tmp_pw, "new_password": fresh_pw},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("force_password_reset") is False

    # 4) login with fresh pw returns force_password_reset=False
    r = _login(PRES_EMAIL, fresh_pw)
    assert r.status_code == 200
    assert r.json()["user"].get("force_password_reset") is False

    # 5) restore
    r = requests.post(
        f"{BASE_URL}/api/rbac/users/president/reset-password",
        headers=sys_headers,
        json={"new_password": PRES_PW, "force_reset": True},
        timeout=15,
    )
    assert r.status_code == 200


# ─── CAO + Internal Auditor login sanity ──────────────────────

def test_cao_and_auditor_can_login():
    """Ensures the two 'new-role' users exist and can login."""
    for email in ("panditrdpandit@gmail.com", "accounts@mpcaonline.com"):
        r = _login(email, "mpca@2026")
        assert r.status_code == 200, f"{email}: {r.status_code} {r.text}"
        assert r.json().get("access_token")
