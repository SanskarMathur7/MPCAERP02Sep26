"""lib/metrics_middleware.py — Iter 111 · Records per-request latency + status."""
import time
from starlette.middleware.base import BaseHTTPMiddleware

from lib.sysadmin_metrics import record_request


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            status = 500
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            path = request.url.path
            if path.startswith("/api"):
                record_request(path, status, elapsed_ms)
        return response
