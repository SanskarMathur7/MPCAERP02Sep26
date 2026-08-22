"""lib/sysadmin_metrics.py — Iter 111b · MongoDB-persisted metrics.

Design goals:
    · Survive backend restarts (in-memory buffers wiped every deploy).
    · Bounded storage — TTL indexes auto-prune old telemetry (7-day retention).
    · Zero-blocking on the hot path — best-effort inserts via `fire_and_forget`.
    · Aggregate on-read (fast enough at telemetry scale of <10k events/day).

Collections:
    sys_metrics_requests    (TTL 7d)  – one doc per API request
    sys_metrics_logins      (TTL 30d) – one doc per login attempt (success/fail)
"""
import asyncio
import time
import re
from datetime import datetime, timezone, timedelta

from core.infra import db, logger

APP_STARTED_AT = datetime.now(timezone.utc).isoformat()
_START_TIME = time.monotonic()

_UUID_RE = re.compile(r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_indexes_created = False


async def _ensure_indexes():
    global _indexes_created
    if _indexes_created:
        return
    try:
        # 7-day TTL on request telemetry
        await db.sys_metrics_requests.create_index("at", expireAfterSeconds=7 * 86400)
        await db.sys_metrics_requests.create_index([("path", 1)])
        # 30-day TTL on login events (needed for security posture + audit)
        await db.sys_metrics_logins.create_index("at", expireAfterSeconds=30 * 86400)
        await db.sys_metrics_logins.create_index([("success", 1)])
        _indexes_created = True
    except Exception as e:  # noqa: BLE001
        logger.warning("sys_metrics index setup failed: %s", e)


def _norm(path: str) -> str:
    return _UUID_RE.sub("/{id}", path)


def _fire_and_forget(coro):
    try:
        asyncio.get_event_loop().create_task(coro)
    except Exception:  # loop may not yet be running during import
        pass


def record_request(path: str, status_code: int, latency_ms: float):
    _fire_and_forget(_record_request_async(path, status_code, latency_ms))


async def _record_request_async(path: str, status_code: int, latency_ms: float):
    await _ensure_indexes()
    try:
        await db.sys_metrics_requests.insert_one({
            "path": _norm(path),
            "status": status_code,
            "latency_ms": round(latency_ms, 2),
            "at": datetime.now(timezone.utc),
            "is_error": status_code >= 500,
        })
    except Exception:
        pass  # never break the request pipeline for telemetry


def record_failed_login(email: str, ip: str):
    _fire_and_forget(_record_login_async(email, ip, "", False))


def record_successful_login(email: str, ip: str, role: str):
    _fire_and_forget(_record_login_async(email, ip, role, True))


async def _record_login_async(email: str, ip: str, role: str, success: bool):
    await _ensure_indexes()
    try:
        await db.sys_metrics_logins.insert_one({
            "email": email, "ip": ip, "role": role, "success": success,
            "at": datetime.now(timezone.utc),
        })
    except Exception:
        pass


# ─────────────────── Aggregate readers ───────────────────

async def snapshot() -> dict:
    """Aggregate the last 24h of request telemetry + 24h of login events."""
    await _ensure_indexes()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)

    # ── Request aggregates
    total_hits = 0
    total_errors = 0
    top_routes = []
    latency_ms = {"avg": 0, "p50": 0, "p95": 0, "p99": 0, "samples": 0}
    try:
        # Aggregate per-route counts
        pipeline = [
            {"$match": {"at": {"$gte": cutoff}}},
            {"$group": {
                "_id": "$path",
                "hits": {"$sum": 1},
                "errors": {"$sum": {"$cond": ["$is_error", 1, 0]}},
            }},
            {"$sort": {"hits": -1}},
            {"$limit": 20},
        ]
        rows = await db.sys_metrics_requests.aggregate(pipeline).to_list(length=None)
        top_routes = [{"path": r["_id"], "hits": r["hits"], "errors": r["errors"]} for r in rows]
        total_hits = sum(r["hits"] for r in rows)
        total_errors = sum(r["errors"] for r in rows)

        # Sample last 1000 latencies to compute p50/p95/p99
        cur = db.sys_metrics_requests.find(
            {"at": {"$gte": cutoff}}, {"_id": 0, "latency_ms": 1}
        ).sort("at", -1).limit(1000)
        lats = [d["latency_ms"] for d in await cur.to_list(length=None)]
        if lats:
            lats_sorted = sorted(lats)
            def pct(p):
                idx = min(len(lats_sorted) - 1, int(len(lats_sorted) * p / 100))
                return round(lats_sorted[idx], 1)
            latency_ms = {
                "avg": round(sum(lats) / len(lats), 1),
                "p50": pct(50),
                "p95": pct(95),
                "p99": pct(99),
                "samples": len(lats),
            }
    except Exception as e:  # noqa: BLE001
        logger.warning("metrics snapshot failed: %s", e)

    # ── Login events
    failed_logins = []
    successful_logins = []
    try:
        cur = db.sys_metrics_logins.find(
            {"success": False}, {"_id": 0}
        ).sort("at", -1).limit(50)
        failed_logins = [
            {**d, "at": d["at"].isoformat() if hasattr(d["at"], "isoformat") else d["at"]}
            for d in await cur.to_list(length=None)
        ]
        cur = db.sys_metrics_logins.find(
            {"success": True}, {"_id": 0}
        ).sort("at", -1).limit(50)
        successful_logins = [
            {**d, "at": d["at"].isoformat() if hasattr(d["at"], "isoformat") else d["at"]}
            for d in await cur.to_list(length=None)
        ]
    except Exception:
        pass

    return {
        "app_started_at": APP_STARTED_AT,
        "uptime_seconds": int(time.monotonic() - _START_TIME),
        "requests_total": total_hits,
        "errors_total": total_errors,
        "latency_ms": latency_ms,
        "top_routes": top_routes,
        "failed_logins_recent": failed_logins,
        "successful_logins_recent": successful_logins,
    }
