"""Iter 114 · Real MPCA roster + Force-reset + RBAC create-user"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SHARED_PW = "mpca@2026"

LEGACY_DUMMIES = [
    "treasurer@mpca.in",
    "indore.secretary@mpca.in",
    "gwalior.secretary@mpca.in",
    "indore.district@mpca.in",
    "official@mpca.in",
    "cao@mpca.in",
    "joint.secretary@mpca.in",
    "manager@mpca.in",
    "selection.chair@mpca.in",
    "cricket.manager@mpca.in",
]

REAL_HQ_EMAILS = [
    "president@mpcaonline.com",
    "vicepresident@mpcaonline.com",
    "secretary@mpcaonline.com",
    "jointsecretary@mpcaonline.com",
    "treasurer@mpcaonline.com",
    "panditrdpandit@gmail.com",
    "accounts@mpcaonline.com",
]

REAL_DIV_EMAILS = [
    "ind.hs@mpcaonline.com", "jbp.hs@mpcaonline.com", "shd.hs@mpcaonline.com",
    "npm.hs@mpcaonline.com", "sag.hs@mpcaonline.com", "gwl.hs@mpcaonline.com",
    "chb.hs@mpcaonline.com", "rew.hs@mpcaonline.com", "bhp.hs@mpcaonline.com",
    "uji.hs@mpcaonline.com",
]

SYSADMIN_EMAIL = "sysadmin@mpca.in"


def _login(email, pw):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)


@pytest.fixture(scope="module")
def sysadmin_token():
    r = _login(SYSADMIN_EMAIL, SHARED_PW)
    assert r.status_code == 200, f"sysadmin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# ── Backend seed purge ──
@pytest.mark.parametrize("email", LEGACY_DUMMIES)
def test_legacy_dummy_users_cannot_login(email):
    r = _login(email, SHARED_PW)
    assert r.status_code == 401, f"Legacy user {email} unexpectedly returned {r.status_code}"


# ── Real roster login ──
@pytest.mark.parametrize("email", REAL_HQ_EMAILS + REAL_DIV_EMAILS + [SYSADMIN_EMAIL])
def test_real_roster_can_login(email):
    r = _login(email, SHARED_PW)
    assert r.status_code == 200, f"{email} login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == email


def test_specific_real_users_names_and_body(sysadmin_token):
    checks = {
        "president@mpcaonline.com":  ("Mahanaaryaman Scindia", None),
        "secretary@mpcaonline.com":  ("Sudhir Asnani", None),
        "treasurer@mpcaonline.com":  ("Sanjeev Dua", None),
        "ind.hs@mpcaonline.com":     ("Devashish Nilesey", "DIV-IND"),
    }
    for email, (name, body_code) in checks.items():
        r = _login(email, SHARED_PW)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u.get("name") == name or u.get("display_name") == name, f"{email} name mismatch: {u}"
        if body_code:
            assert u.get("body_code") == body_code, f"{email} body_code={u.get('body_code')}"


# ── force_password_reset flag ──
def test_real_users_have_force_reset():
    r = _login("secretary@mpcaonline.com", SHARED_PW)
    if r.status_code != 200:
        pytest.skip("secretary already had password changed by earlier run")
    tok = r.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert me.status_code == 200
    assert me.json().get("force_password_reset") is True


def test_sysadmin_no_force_reset(sysadmin_token):
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=10)
    assert me.status_code == 200
    assert not me.json().get("force_password_reset")


# ── change-password endpoint ──
@pytest.fixture
def throwaway_user(sysadmin_token):
    """Create a disposable user with initial_password for change-password testing."""
    email = f"qa.cp.{int(time.time())}@mpca.in"
    payload = {
        "display_name": "QA CP User",
        "email": email,
        "role_id": "hon_treasurer",
        "body_code": "MPCA",
        "body_type": "State",
        "initial_password": "cptest1234",
        "force_password_reset": True,
    }
    r = requests.post(f"{API}/rbac/users", json=payload,
                      headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=15)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    uid = r.json()["id"]
    yield {"email": email, "password": "cptest1234", "id": uid}
    # cleanup
    try:
        requests.delete(f"{API}/rbac/users/{uid}",
                        headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=10)
    except Exception:
        pass


def test_change_password_wrong_current(throwaway_user):
    r = _login(throwaway_user["email"], throwaway_user["password"])
    assert r.status_code == 200
    tok = r.json()["access_token"]
    r2 = requests.post(f"{API}/auth/change-password",
                       json={"current_password": "wrongwrong", "new_password": "newpass1234"},
                       headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r2.status_code == 400
    assert "incorrect" in r2.json().get("detail", "").lower()


def test_change_password_too_short(throwaway_user):
    tok = _login(throwaway_user["email"], throwaway_user["password"]).json()["access_token"]
    r = requests.post(f"{API}/auth/change-password",
                      json={"current_password": throwaway_user["password"], "new_password": "abc"},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 400
    assert "8 characters" in r.json().get("detail", "")


def test_change_password_same(throwaway_user):
    tok = _login(throwaway_user["email"], throwaway_user["password"]).json()["access_token"]
    r = requests.post(f"{API}/auth/change-password",
                      json={"current_password": throwaway_user["password"],
                            "new_password": throwaway_user["password"]},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 400
    assert "differ" in r.json().get("detail", "").lower()


def test_change_password_happy_path(throwaway_user):
    tok = _login(throwaway_user["email"], throwaway_user["password"]).json()["access_token"]
    new_pw = "newpass9999"
    r = requests.post(f"{API}/auth/change-password",
                      json={"current_password": throwaway_user["password"], "new_password": new_pw},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert body.get("force_password_reset") is False

    # /me shows updated flag
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert me.status_code == 200
    assert me.json().get("force_password_reset") is False

    # old pw fails
    r_old = _login(throwaway_user["email"], throwaway_user["password"])
    assert r_old.status_code == 401
    # new pw succeeds
    r_new = _login(throwaway_user["email"], new_pw)
    assert r_new.status_code == 200


# ── RBAC user list ──
def test_rbac_users_list_18_total(sysadmin_token):
    r = requests.get(f"{API}/rbac/users",
                     headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=15)
    assert r.status_code == 200
    users = r.json()
    # Filter out any throwaway TEST users left behind
    core = [u for u in users if not (u.get("email") or "").startswith("qa.")]
    assert len(core) == 18, f"Expected 18 users, got {len(core)}: {[u.get('email') for u in core]}"

    state = [u for u in core if u.get("body_type") == "State"]
    div = [u for u in core if u.get("body_type") == "Division"]
    assert len(state) == 8, f"State users: {len(state)} — expected 8"
    assert len(div) == 10, f"Division users: {len(div)} — expected 10"

    # No dummy names
    names = " ".join((u.get("display_name") or "") for u in core)
    assert "Naveen Mittal" not in names
    assert "Kailash Vijayvargiya" not in names
    # Real names present
    assert "Mahanaaryaman Scindia" in names
    assert "Sudhir Asnani" in names


# ── RBAC create user with credentials ──
def test_rbac_create_user_with_credentials(sysadmin_token):
    email = f"qa.cred.{int(time.time())}@mpca.in"
    payload = {
        "display_name": "QA Cred User",
        "email": email,
        "role_id": "hon_treasurer",
        "body_code": "MPCA",
        "body_type": "State",
        "initial_password": "test1234",
        "force_password_reset": True,
    }
    r = requests.post(f"{API}/rbac/users", json=payload,
                      headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=15)
    assert r.status_code == 200
    uid = r.json()["id"]

    # Can log in
    lr = _login(email, "test1234")
    assert lr.status_code == 200
    tok = lr.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert me.status_code == 200
    assert me.json().get("force_password_reset") is True

    # cleanup
    requests.delete(f"{API}/rbac/users/{uid}",
                    headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=10)


# ── RBAC create user without credentials (directory only) ──
def test_rbac_create_user_without_credentials(sysadmin_token):
    email = f"qa.dir.{int(time.time())}@mpca.in"
    payload = {
        "display_name": "QA Directory User",
        "email": email,
        "role_id": "hon_treasurer",
        "body_code": "MPCA",
        "body_type": "State",
    }
    r = requests.post(f"{API}/rbac/users", json=payload,
                      headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=15)
    assert r.status_code == 200
    uid = r.json()["id"]

    # Cannot log in
    lr = _login(email, "anypass1234")
    assert lr.status_code == 401

    # cleanup
    requests.delete(f"{API}/rbac/users/{uid}",
                    headers={"Authorization": f"Bearer {sysadmin_token}"}, timeout=10)
