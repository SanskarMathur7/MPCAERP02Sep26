"""Iter 98 · JWT-based auth (Feb 2026) — replaces persona-chip demo login."""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEFAULT_PW = "mpca@2026"
ACCOUNTS = [
    ("president@mpca.in", "president"),
    ("secretary@mpca.in", "secretary"),
    ("treasurer@mpca.in", "treasurer"),
    ("indore.secretary@mpca.in", "division-secretary"),
    ("gwalior.secretary@mpca.in", "division-secretary-gwl"),
    ("indore.district@mpca.in", "district-secretary"),
    ("official@mpca.in", "match-official"),
]


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─── BACKEND #1 · Login success for all 7 seeded accounts ───
@pytest.mark.parametrize("email,expected_id", ACCOUNTS)
def test_login_all_seeded_accounts(sess, email, expected_id):
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": DEFAULT_PW})
    assert r.status_code == 200, f"{email}: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("token_type") == "bearer"
    assert isinstance(data.get("access_token"), str) and len(data["access_token"]) > 20
    assert data["access_token"].startswith("eyJ"), "JWT should start with eyJ"
    user = data.get("user", {})
    assert user.get("email") == email
    assert user.get("id") == expected_id
    assert "password_hash" not in user, "password_hash must NOT be returned"
    # persona-shape fields required by frontend header injection
    for f in ["name", "post", "body_type", "body_code"]:
        assert f in user, f"missing persona field: {f}"


# ─── BACKEND #2 · Wrong password → 401 ───
def test_login_wrong_password(sess):
    r = sess.post(f"{API}/auth/login", json={"email": "secretary@mpca.in", "password": "bogus"})
    assert r.status_code == 401
    assert r.json().get("detail") == "Invalid email or password"


# ─── BACKEND #3 · Unknown email → same 401 (no enumeration leak) ───
def test_login_unknown_email(sess):
    r = sess.post(f"{API}/auth/login", json={"email": "nobody@mpca.in", "password": DEFAULT_PW})
    assert r.status_code == 401
    assert r.json().get("detail") == "Invalid email or password"


# ─── BACKEND #4 · /auth/me tests ───
def test_me_with_valid_token(sess):
    r = sess.post(f"{API}/auth/login", json={"email": "secretary@mpca.in", "password": DEFAULT_PW})
    token = r.json()["access_token"]
    r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    u = r2.json()
    assert u["email"] == "secretary@mpca.in"
    assert "password_hash" not in u
    assert u["id"] == "secretary"


def test_me_no_token(sess):
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_me_malformed_token(sess):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer notavalidjwt"})
    assert r.status_code == 401
    assert "detail" in r.json()


def test_me_expired_token(sess):
    # Build an expired token using the same secret & algo
    import jwt as pyjwt
    from datetime import datetime, timezone, timedelta
    secret = os.environ.get("JWT_SECRET") or "a0ea1d6dec2f4744d556e7ce985c238428dc31f8600764804fc327c5a20b5452"
    payload = {
        "sub": "secretary",
        "email": "secretary@mpca.in",
        "iat": datetime.now(timezone.utc) - timedelta(hours=48),
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        "type": "access",
    }
    tok = pyjwt.encode(payload, secret, algorithm="HS256")
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


# ─── BACKEND #5 · bcrypt hash & email unique index ───
def test_bcrypt_hash_and_unique_email_index():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = MongoClient(mongo_url)
    db = client[db_name]
    doc = db.users.find_one({"email": "secretary@mpca.in"})
    assert doc is not None
    ph = doc.get("password_hash", "")
    assert ph.startswith("$2b$"), f"expected bcrypt hash, got: {ph[:10]}"
    # unique email index
    idxs = db.users.index_information()
    email_idx = [v for k, v in idxs.items() if any(f[0] == "email" for f in v.get("key", []))]
    assert email_idx, "email index missing"
    assert any(idx.get("unique") for idx in email_idx), "email index must be unique"


# ─── BACKEND #6 · logout is stateless 200 ───
def test_logout_stateless(sess):
    r = requests.post(f"{API}/auth/logout")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # also with token
    login = sess.post(f"{API}/auth/login", json={"email": "secretary@mpca.in", "password": DEFAULT_PW})
    tok = login.json()["access_token"]
    r2 = requests.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code == 200
    assert r2.json() == {"ok": True}


# ─── Bonus · protected endpoint accepts Bearer + persona headers ───
def test_members_accepts_bearer_and_persona_headers(sess):
    login = sess.post(f"{API}/auth/login", json={"email": "secretary@mpca.in", "password": DEFAULT_PW})
    data = login.json()
    tok = data["access_token"]
    u = data["user"]
    headers = {
        "Authorization": f"Bearer {tok}",
        "X-Body-Code": u["body_code"],
        "X-Persona-Post": u["post"],
        "X-Persona-Id": u["id"],
    }
    r = requests.get(f"{API}/members", headers=headers)
    assert r.status_code == 200, f"members endpoint failed: {r.status_code} {r.text[:200]}"
