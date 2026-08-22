"""lib/sysadmin_metrics.py — Iter 111 · Lightweight in-process metrics.

Kept small: ring-buffer for latency + counters for route hits.  Not a
substitute for Prometheus / OTel; provides just enough signal for the
sysadmin analytics console without adding an infra dependency.
"""
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

APP_STARTED_AT = datetime.now(timezone.utc).isoformat()
_START_TIME = time.monotonic()

# route → total_calls
_route_hits: dict[str, int] = defaultdict(int)
# route → total_errors (5xx)
_route_errors: dict[str, int] = defaultdict(int)
# ring buffer of latencies (ms) — last 1000 samples
_latencies: deque = deque(maxlen=1000)
# last N failed login attempts (email, ip, at)
_failed_logins: deque = deque(maxlen=200)
# last N successful login attempts
_successful_logins: deque = deque(maxlen=200)


def record_request(path: str, status_code: int, latency_ms: float):
    key = _norm(path)
    _route_hits[key] += 1
    if status_code >= 500:
        _route_errors[key] += 1
    _latencies.append(latency_ms)


def _norm(path: str) -> str:
    # collapse UUIDs to reduce cardinality
    import re
    return re.sub(r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{id}", path)


def record_failed_login(email: str, ip: str):
    _failed_logins.append({"email": email, "ip": ip, "at": datetime.now(timezone.utc).isoformat()})


def record_successful_login(email: str, ip: str, role: str):
    _successful_logins.append({"email": email, "ip": ip, "role": role, "at": datetime.now(timezone.utc).isoformat()})


def snapshot() -> dict:
    uptime_seconds = time.monotonic() - _START_TIME
    lats = list(_latencies)
    lats_sorted = sorted(lats)

    def pct(p):
        if not lats_sorted:
            return 0
        idx = min(len(lats_sorted) - 1, int(len(lats_sorted) * p / 100))
        return round(lats_sorted[idx], 1)

    top_routes = sorted(_route_hits.items(), key=lambda kv: kv[1], reverse=True)[:20]
    return {
        "app_started_at": APP_STARTED_AT,
        "uptime_seconds": int(uptime_seconds),
        "requests_total": sum(_route_hits.values()),
        "errors_total": sum(_route_errors.values()),
        "latency_ms": {
            "avg": round(sum(lats) / len(lats), 1) if lats else 0,
            "p50": pct(50),
            "p95": pct(95),
            "p99": pct(99),
            "samples": len(lats),
        },
        "top_routes": [{"path": p, "hits": h, "errors": _route_errors.get(p, 0)} for p, h in top_routes],
        "failed_logins_recent": list(_failed_logins)[-50:],
        "successful_logins_recent": list(_successful_logins)[-50:],
    }
