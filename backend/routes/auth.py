"""Feb 2026 · JWT-based Authentication

Single email+password login that replaces the persona-chip demo. Returns
`{access_token, user}` where `user` carries the same persona shape the
frontend already knows (id, name, post, body_type, body_code, ...) so
none of the existing header-based backend routes need to change — the
frontend keeps sending `X-Body-Code / X-Persona-Post / X-Persona-Id`
based on the authenticated user.

Endpoints:
  · POST /api/auth/login   → {access_token, user}
  · GET  /api/auth/me      → user (Bearer token required)
  · POST /api/auth/logout  → {ok: True} (client-side token wipe; no server state)

Seed script inside — see `seed_users_from_personas()` in `startup.py`.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException, Request
from pydantic import BaseModel, EmailStr

from core.infra import api_router, db

JWT_ALGO = "HS256"
ACCESS_TOKEN_TTL_HOURS = 24  # 1-day sessions for a low-frequency ERP is fine


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _secret() -> str:
    s = os.environ.get("JWT_SECRET")
    if not s:
        raise RuntimeError("JWT_SECRET is not set — configure /app/backend/.env")
    return s


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_TTL_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGO)


def _extract_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


async def get_current_user(request: Request) -> dict:
    """FastAPI dependency — decodes Bearer JWT and returns the user doc.
    Raises 401 when token is missing/expired/invalid."""
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _public_user(u: dict) -> dict:
    """Strip internal fields before sending to the client."""
    u = dict(u)
    u.pop("password_hash", None)
    u.pop("_id", None)
    return u


# ═══════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════

@api_router.post("/auth/login")
async def login(body: LoginRequest, request: Request):
    from lib.sysadmin_metrics import record_failed_login, record_successful_login
    email = body.email.strip().lower()
    ip = (request.client.host if request.client else "") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        record_failed_login(email, ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        record_failed_login(email, ip)
        raise HTTPException(status_code=403, detail="Account is disabled — contact MPCA IT")

    token = create_access_token(user["id"], email)
    record_successful_login(email, ip, user.get("role") or user.get("body_type") or "")
    # Stamp last_login (best-effort; failure to write doesn't block login)
    try:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception:
        pass
    return {"access_token": token, "token_type": "bearer", "user": _public_user(user)}


@api_router.get("/auth/me")
async def me(request: Request):
    return await get_current_user(request)


@api_router.post("/auth/logout")
async def logout():
    # Stateless JWT — client discards the token. Kept for API symmetry.
    return {"ok": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/auth/change-password")
async def change_password(body: ChangePasswordRequest, request: Request):
    """Self-service password change. Verifies the current password, hashes the
    new one (min 8 chars, must differ), and clears `force_password_reset`.
    Used by the /change-password landing page after a force-reset login.
    """
    import bcrypt as _bcrypt
    user = await get_current_user(request)  # 401s if not authenticated
    if not user.get("email"):
        raise HTTPException(400, "User has no email — contact admin")
    # Re-fetch with the hash (get_current_user strips it)
    stored = await db.users.find_one({"id": user["id"]}, {"password_hash": 1})
    if not stored or not verify_password(body.current_password, stored.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_pw = body.new_password.strip()
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if new_pw == body.current_password:
        raise HTTPException(status_code=400, detail="New password must differ from the current one")
    pw_hash = _bcrypt.hashpw(new_pw.encode("utf-8"), _bcrypt.gensalt(rounds=12)).decode("utf-8")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": pw_hash,
            "force_password_reset": False,
            "password_changed_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "force_password_reset": False}
