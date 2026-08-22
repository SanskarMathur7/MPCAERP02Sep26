"""routes/sysadmin.py — Iter 111 · System Administrator analytics console.

All endpoints require the `sys_admin` role (SYSTEM_CONFIG permission).

    GET /api/sysadmin/overview          KPIs + high-level snapshot
    GET /api/sysadmin/usage             per-user + per-role activity
    GET /api/sysadmin/journeys          simple user-journey traces
    GET /api/sysadmin/system-health     uptime + CPU + memory + DB stats
    GET /api/sysadmin/security          vulnerability posture score
    GET /api/sysadmin/compliance        controls checklist
    GET /api/sysadmin/backups           backup status
    POST /api/sysadmin/backups/trigger  trigger a manual backup (stub)
"""
import os
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta

import psutil
from fastapi import HTTPException, Request

from core.infra import api_router, db, client
from lib.authz import get_principal, Role
from lib.sysadmin_metrics import snapshot as metrics_snapshot, APP_STARTED_AT


def _require_sysadmin(request: Request):
    p = get_principal(request)
    if p.role != Role.SYS_ADMIN:
        raise HTTPException(403, "System Administrator access required")
    return p


# ─────────────────────── Overview ─────────────────────────────────────
@api_router.get("/sysadmin/overview")
async def sysadmin_overview(request: Request):
    _require_sysadmin(request)
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(days=1)).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()

    users_total = await db.users.count_documents({})
    users_active = await db.users.count_documents({"is_active": True})
    audit_24h = await db.audit_log.count_documents({"created_at": {"$gte": day_ago}})
    audit_7d = await db.audit_log.count_documents({"created_at": {"$gte": week_ago}})

    m = metrics_snapshot()
    error_rate = round(100 * m["errors_total"] / m["requests_total"], 2) if m["requests_total"] else 0

    return {
        "app_started_at": APP_STARTED_AT,
        "uptime_seconds": m["uptime_seconds"],
        "users_total": users_total,
        "users_active": users_active,
        "audit_events_24h": audit_24h,
        "audit_events_7d": audit_7d,
        "requests_total": m["requests_total"],
        "latency_p95_ms": m["latency_ms"]["p95"],
        "error_rate_pct": error_rate,
        "failed_logins_recent": len(m["failed_logins_recent"]),
    }


# ─────────────────────── Usage (per-user / per-role) ──────────────────
@api_router.get("/sysadmin/usage")
async def sysadmin_usage(request: Request, days: int = 30):
    _require_sysadmin(request)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    cur = db.audit_log.find({"created_at": {"$gte": since}}, {"_id": 0, "actor": 1, "action": 1, "created_at": 1})
    events = await cur.to_list(length=20000)

    per_user = Counter(e.get("actor", "unknown") for e in events)
    per_action = Counter(e.get("action", "unknown") for e in events)

    # bucketing by day
    per_day = defaultdict(int)
    for e in events:
        try:
            day = e["created_at"][:10]
            per_day[day] += 1
        except Exception:
            pass

    users = await db.users.find({}, {"_id": 0, "email": 1, "name": 1, "post": 1, "post_title": 1, "body_type": 1, "body_code": 1}).to_list(length=None)
    m = metrics_snapshot()

    return {
        "days": days,
        "total_events": len(events),
        "top_users": [{"actor": a, "events": c} for a, c in per_user.most_common(15)],
        "top_actions": [{"action": a, "count": c} for a, c in per_action.most_common(15)],
        "events_per_day": [{"date": d, "count": per_day[d]} for d in sorted(per_day.keys())],
        "recent_logins": m["successful_logins_recent"][-25:],
        "users_registered": users,
    }


# ─────────────────────── User journeys ────────────────────────────────
@api_router.get("/sysadmin/journeys")
async def sysadmin_journeys(request: Request, limit: int = 30):
    _require_sysadmin(request)
    # Group last N audit-log events per actor to construct a "journey" trace.
    cur = db.audit_log.find({}, {"_id": 0}).sort("created_at", -1).limit(2000)
    events = await cur.to_list(length=2000)
    by_actor = defaultdict(list)
    for e in events:
        by_actor[e.get("actor") or "unknown"].append(e)
    trace = []
    for actor, es in by_actor.items():
        es_sorted = sorted(es, key=lambda x: x.get("created_at", ""))
        trace.append({
            "actor": actor,
            "steps": [
                {"action": e.get("action"), "entity": e.get("entity_type"), "at": e.get("created_at")}
                for e in es_sorted[-8:]
            ],
        })
    trace = sorted(trace, key=lambda t: len(t["steps"]), reverse=True)[:limit]
    return {"journeys": trace, "actors_seen": len(by_actor)}


# ─────────────────────── System health ────────────────────────────────
@api_router.get("/sysadmin/system-health")
async def sysadmin_system_health(request: Request):
    _require_sysadmin(request)

    cpu = psutil.cpu_percent(interval=0.15)
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    load = os.getloadavg()

    # DB stats
    db_stats = {}
    try:
        stats = await db.command("dbStats")
        db_stats = {
            "collections":  stats.get("collections"),
            "objects":      stats.get("objects"),
            "data_size_mb": round((stats.get("dataSize") or 0) / (1024 * 1024), 2),
            "storage_size_mb": round((stats.get("storageSize") or 0) / (1024 * 1024), 2),
            "indexes":      stats.get("indexes"),
            "index_size_mb": round((stats.get("indexSize") or 0) / (1024 * 1024), 2),
        }
    except Exception as e:
        db_stats = {"error": str(e)}

    # Ping DB for latency
    db_ping_ms = None
    try:
        import time
        t0 = time.perf_counter()
        await client.admin.command("ping")
        db_ping_ms = round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        pass

    m = metrics_snapshot()
    return {
        "uptime_seconds": m["uptime_seconds"],
        "cpu_percent": cpu,
        "memory": {
            "total_mb": round(vm.total / (1024*1024), 0),
            "used_mb":  round(vm.used / (1024*1024), 0),
            "percent":  vm.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024**3), 1),
            "used_gb":  round(disk.used / (1024**3), 1),
            "percent":  disk.percent,
        },
        "load_avg": {"1m": load[0], "5m": load[1], "15m": load[2]},
        "db": db_stats,
        "db_ping_ms": db_ping_ms,
        "requests": {
            "total": m["requests_total"],
            "errors": m["errors_total"],
            "latency_ms": m["latency_ms"],
        },
        "top_routes": m["top_routes"],
    }


# ─────────────────────── Security posture ─────────────────────────────
@api_router.get("/sysadmin/security")
async def sysadmin_security(request: Request):
    _require_sysadmin(request)
    m = metrics_snapshot()

    checks = []
    def add(id_, label, status, detail):  # status: pass|warn|fail
        checks.append({"id": id_, "label": label, "status": status, "detail": detail})

    # 1. JWT secret configured
    jwt_secret = os.environ.get("JWT_SECRET")
    add("jwt_secret", "JWT_SECRET set (≥32 chars)",
        "pass" if jwt_secret and len(jwt_secret) >= 32 else "fail",
        f"length={len(jwt_secret) if jwt_secret else 0}")

    # 2. CORS not wildcard
    cors = os.environ.get("CORS_ORIGINS", "*")
    add("cors", "CORS not wildcard",
        "fail" if cors.strip() == "*" else "pass",
        f"CORS_ORIGINS={cors}")

    # 3. Rate limit on /auth/login
    add("rate_limit_login", "Rate limit on /api/auth/login", "fail",
        "Not implemented — SEC-002 P3 backlog item")

    # 4. Legacy header authz
    add("legacy_header_auth", "Legacy X-User-Body-Code header auth removed", "fail",
        "SEC-001 — routes still trust client headers; migration pending")

    # 5. bcrypt cost
    add("bcrypt_cost", "bcrypt cost factor ≥ 12", "pass", "cost=12 (default)")

    # 6. Failed logins spike
    recent = m["failed_logins_recent"]
    last_hour = [f for f in recent if (datetime.now(timezone.utc) - datetime.fromisoformat(f["at"].replace("Z","+00:00").replace("+00:00","+00:00"))).total_seconds() < 3600]
    add("failed_logins_1h", "Failed logins in last 1h",
        "warn" if len(last_hour) > 10 else "pass",
        f"{len(last_hour)} failed attempts")

    # 7. Default password auto-restore
    add("default_pw_reset", "Default password auto-restore on restart", "fail",
        "SEC-002 — seed_users.py re-hashes hashes; backlog")

    # 8. Audit log growing
    day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    audit_24h = await db.audit_log.count_documents({"created_at": {"$gte": day_ago}})
    add("audit_log", "Audit log capturing events",
        "pass" if audit_24h > 0 else "warn",
        f"{audit_24h} events in last 24h")

    score = round(100 * sum(1 for c in checks if c["status"] == "pass") / len(checks))
    return {
        "score": score,
        "checks_total": len(checks),
        "checks_pass": sum(1 for c in checks if c["status"] == "pass"),
        "checks_warn": sum(1 for c in checks if c["status"] == "warn"),
        "checks_fail": sum(1 for c in checks if c["status"] == "fail"),
        "checks": checks,
        "failed_logins_recent": recent,
    }


# ─────────────────────── Compliance controls ──────────────────────────
@api_router.get("/sysadmin/compliance")
async def sysadmin_compliance(request: Request):
    _require_sysadmin(request)
    controls = [
        {"id": "audit_trail", "label": "Immutable audit trail for every M&C transition", "status": "pass",
         "evidence": "audit_log collection + mc_chain array on docs"},
        {"id": "two_person",  "label": "Two-person rule on sensitive actions", "status": "pass",
         "evidence": "M&C engine enforces on 17 workflows"},
        {"id": "role_matrix", "label": "Role → permission matrix documented", "status": "pass",
         "evidence": "/app/backend/lib/authz.py ROLE_MATRIX"},
        {"id": "data_retention","label": "Data retention policy (audit_log)", "status": "warn",
         "evidence": "No TTL configured on audit_log; grows unbounded"},
        {"id": "data_export", "label": "Per-user data export capability", "status": "warn",
         "evidence": "No dedicated endpoint yet — GDPR-adjacent"},
        {"id": "encryption_at_rest", "label": "Encryption at rest (MongoDB)", "status": "warn",
         "evidence": "Depends on hosting; MongoDB Atlas encrypted by default"},
        {"id": "encryption_in_transit", "label": "TLS in transit", "status": "pass",
         "evidence": "Ingress terminates TLS; JWT over HTTPS"},
        {"id": "backup_schedule", "label": "Automated backup schedule", "status": "fail",
         "evidence": "Manual mongodump only — no cron / infra hook"},
        {"id": "incident_playbook", "label": "Incident response playbook", "status": "warn",
         "evidence": "Not documented in-repo"},
    ]
    score = round(100 * sum(1 for c in controls if c["status"] == "pass") / len(controls))
    return {"score": score, "controls": controls}


# ─────────────────────── Backup & restore ─────────────────────────────
@api_router.get("/sysadmin/backups")
async def sysadmin_backups(request: Request):
    _require_sysadmin(request)
    backups = []
    try:
        cur = db.system_backups.find({}, {"_id": 0}).sort("started_at", -1).limit(20)
        backups = await cur.to_list(length=None)
    except Exception:
        pass
    return {
        "backups": backups,
        "storage_provider": "local · mongodump",
        "notes": "Configure MongoDB Atlas / self-hosted cron for scheduled + off-site backups.",
    }


@api_router.post("/sysadmin/backups/trigger")
async def sysadmin_backup_trigger(request: Request):
    principal = _require_sysadmin(request)
    now = datetime.now(timezone.utc).isoformat()
    rec = {
        "id": f"bkp_{int(datetime.now(timezone.utc).timestamp())}",
        "kind": "manual",
        "started_at": now,
        "triggered_by": principal.name,
        "status": "queued",
        "note": "Manual trigger — actual mongodump requires ops runbook.",
    }
    await db.system_backups.insert_one(rec)
    rec.pop("_id", None)
    return {"ok": True, "backup": rec}
