"""lib/auth_middleware.py — Iter 108.

FastAPI/Starlette middleware that enforces JWT authentication on every
`/api/*` request except a small public allow-list, and attaches the resolved
`RequestPrincipal` to `request.state.principal`.

This is the single choke-point that closes SEC-001 (spoofable headers) and
SEC-004 (Dashboard leak): every downstream route reads scope + role from
`request.state.principal`, never from client-controlled headers.

Public allow-list
─────────────────
    · POST /api/auth/login    · POST /api/auth/logout
    · GET  /api/health        · GET  /api/           (root)
    · OPTIONS *               (CORS pre-flight)
"""
import os
from typing import Optional

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from core.infra import db, logger
from lib.authz import principal_from_user

# Paths that MUST work without authentication (login, health, CORS pre-flight)
_PUBLIC_PREFIXES = (
    "/api/auth/login",
    "/api/auth/logout",
    "/api/health",
)
_PUBLIC_EXACT = {"/api/", "/api"}


def _is_public(path: str, method: str) -> bool:
    if method == "OPTIONS":
        return True
    if path in _PUBLIC_EXACT:
        return True
    for p in _PUBLIC_PREFIXES:
        if path == p or path.startswith(p + "?"):
            return True
    # Anything outside /api/ is served by the frontend — middleware ignores it
    if not path.startswith("/api"):
        return True
    return False


def _decode_bearer(auth_header: str) -> Optional[dict]:
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    if not token:
        return None
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        method = request.method

        if _is_public(path, method):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        payload = _decode_bearer(auth_header)
        if payload is None:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

        user_id = payload.get("sub")
        if not user_id:
            return JSONResponse(status_code=401, content={"detail": "Invalid token payload"})

        try:
            user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        except Exception as e:  # noqa: BLE001
            logger.error("auth_middleware · user lookup failed: %s", e)
            return JSONResponse(status_code=500, content={"detail": "Auth backend error"})

        if not user or not user.get("is_active", True):
            return JSONResponse(status_code=401, content={"detail": "User not found or disabled"})

        # Attach the resolved principal — every downstream route reads it via
        # lib.authz.get_principal(request) or by touching request.state.principal.
        request.state.principal = principal_from_user(user)
        return await call_next(request)
