# MPCA ERP — Production-Readiness Audit

**Date:** 2026-07-22
**Target load:** 200–300 users/day, low latency, zero downtime after deploy
**Scope:** `/app/backend` (FastAPI + MongoDB/motor), `/app/frontend` (React 19 / CRA+CRACO)
**Method:** Static analysis of source, config, dependency graph, and live checks (build, pip-audit, yarn audit, test collection). Some live runs (full pytest, mypy) were cut short by a transient pod outage — noted where relevant.

---

## VERDICT: 🔴 NO-GO for production

This is a financial/governance ERP (bank balances, payroll, vendor KYC, grants, elections) with **no real authentication**, served in production by a **development server**. Any one of the three CRITICAL findings below is a deployment blocker on its own. The good news: the codebase is well-organized and many building blocks are correct (upload validation, AI-failure fallbacks, idempotent seed), so the blockers are fixable in days, not weeks. Re-audit after CRITICAL + HIGH items are closed.

---

## 1. CRITICAL and HIGH issues (summary list)

### CRITICAL (deployment blockers)
- **C1 — No server-side authentication; RBAC is spoofable client headers, and the default is "see everything."** `core/scoping.py`, all 368 endpoints.
- **C2 — Unauthenticated access to and mutation of sensitive data** (bank balances, payroll salaries, vendor KYC, member hard-deletes). `bank.py`, `hr_payroll.py`, `members.py`, `vendor_kyc.py`.
- **C3 — Production is served by the React dev server (`yarn start`), not the built bundle.** `/etc/supervisor/conf.d/supervisord.conf:16`.

### HIGH
- **H1 — Known-CVE dependencies:** starlette 0.37.2 (9 advisories), litellm 1.80.0 (8 advisories); frontend 280 npm advisories (4 critical / 144 high) from EOL `react-scripts@5.0.1`.
- **H2 — No MongoDB indexes anywhere** — every query on every endpoint is a full collection scan.
- **H3 — Blocking work on the async event loop** (in-request LLM calls, openpyxl/reportlab report generation, sync file I/O) with a single worker — one slow request stalls all users.
- **H4 — Money stored and computed as `float`** (55 fields, zero `Decimal`) across bank, payroll, budgets, grants.
- **H5 — Non-atomic balance read-modify-write and counter-based reference numbers** — lost updates and duplicate IDs under concurrency.
- **H6 — Backend runs with dev flags `--workers 1 --reload`** — not a production server configuration.
- **H7 — No React ErrorBoundary or global rejection handler** — any render error white-screens the whole SPA.
- **H8 — Uploaded files stored on ephemeral pod disk** — lost on every redeploy/restart.

Full detail, file:line, rationale, and fixes below.

---

## 2. Detailed findings

Legend: **CRITICAL** = blocks deploy · **HIGH** = fix before real users · **MEDIUM** = fix soon after · **LOW** = hygiene/tech-debt.

---

### CRITICAL

#### C1 — No real authentication; RBAC trusts client-supplied headers and defaults to full access
**Where:** `backend/core/scoping.py` (whole file); enforced ad-hoc in routes via `Header(..., alias="X-Role-Id")` etc.; frontend sets them in `frontend/src/lib/api.js:12-30`.
**What:** There is no login, session, or token anywhere (`grep` for `Depends`, `jwt`, `OAuth2`, `HTTPBearer`, `Authorization` → **zero hits** across 368 endpoints). "RBAC" is implemented by the frontend putting the current persona into request headers (`X-Role-Id`, `X-Persona-Id`, `X-Body-Code`, `X-Body-Type`, `X-User-Email`) which the backend reads verbatim:
```python
# core/scoping.py
def get_scope(request):
    h = request.headers
    return RequestScope(persona_id=h.get("x-persona-id"),
                        body_code=h.get("x-body-code"),
                        body_type=h.get("x-body-type"), ...)

def body_scope(scope, field="body_id"):
    if scope.is_state or not scope.body_code or not scope.body_type:
        return {}      # <-- no filter: returns EVERYTHING
```
**Why it's critical:** Any client can set `X-Body-Type: state` (or simply omit the headers) and the query filter collapses to `{}` — unrestricted read of every division/district's data. There is nothing to verify the caller actually holds that persona. The scoping is also read-only; mutating endpoints (deletes, approvals) apply no scope at all. For an org of 200–300 users handling money and elections, this is a total authz bypass.
**Fix:** Introduce real authentication (server-issued session or signed JWT with short expiry, `httpOnly`+`Secure` cookie or Authorization bearer). Derive persona/body/role from the verified principal server-side — never from client headers. Add a FastAPI dependency (`Depends(require_user)`) applied globally, and an explicit allow-list for any truly public route. Enforce authorization on writes, not just reads.

#### C2 — Unauthenticated exposure and mutation of sensitive data (IDOR everywhere)
**Where (examples):**
- `backend/routes/bank.py:15` `list_bank_accounts`, `:28` `get_bank_account/{id}`, `:36` `list_transactions` — all balances and ledgers, no auth.
- `backend/routes/hr_payroll.py:134` `list_employees` (`.to_list(1000)`), `get_employee/{eid}` — salaries, TDS, HRA.
- `backend/routes/members.py:154` `delete_member`, `:320` category delete, `:249` membership delete — **unauthenticated hard deletes by id**.
- `backend/routes/vendor_kyc.py:135` `find({}).to_list(1000)` — GSTIN, bank details of all vendors.
- `backend/routes/dashboard.py:31` — aggregate financials exposed on an open endpoint.
**Why it's critical:** Consequence of C1. Anyone who can reach the API URL can enumerate salaries and bank balances and can permanently delete members/records. Data breach + data-loss risk.
**Fix:** Same as C1 (auth + server-side scoping on every read *and* write). Additionally, prefer soft-delete for governance records.

#### C3 — Production served by the CRA development server
**Where:** `/etc/supervisor/conf.d/supervisord.conf:16` → `command=yarn start` (`craco start`, webpack-dev-server) in `/app/frontend`. A working `build` script exists (`"build": "craco build"`, verified to succeed in 18.3s → `432 kB` gzip main chunk) and `frontend/build/` is present, but nothing serves it.
**Why it's critical:** webpack-dev-server is single-process, unminified, keeps an HMR websocket open, is memory-heavy, and is explicitly documented as unsuitable for production. Under concurrent load it will be slow and unstable, and ships dev-only tooling (`@emergentbase/visual-edits`) to end users. This alone fails the "low latency / zero downtime" requirement.
**Fix:** Build once (`yarn build`) and serve the static `build/` via nginx (already installed on the pod) or `serve -s build`. Update the supervisor `frontend` program accordingly. Set `GENERATE_SOURCEMAP=false` (see M8).

---

### HIGH

#### H1 — Dependency vulnerabilities (backend CVEs + EOL frontend toolchain)
**Backend** (`pip-audit -r requirements.txt` → 19 advisories in 4 packages; cross-checked vs installed):
- **starlette 0.37.2** (transitive via `fastapi==0.110.1`) — 9 advisories incl. multipart/form-data DoS (fixed ≥0.40.0). **Bump `fastapi` so starlette ≥0.40.0.**
- **litellm 1.80.0** (transitive via `emergentintegrations==0.1.0`) — 8 advisories (fixed ≥1.84.0). **Bump `emergentintegrations`.**
- **pymongo 4.5.0** (pinned) — PYSEC-2026-1826 (BSON OOB read). **→ 4.6.3.** (MEDIUM)
- **ecdsa 0.19.2** (via unused `python-jose`) — PYSEC-2026-1325, *no fix available*. Eliminated by removing `python-jose` (see L1).
**Frontend** (`yarn audit`): **280 advisories — 4 critical / 144 high / 112 moderate / 20 low**, dominated by EOL `react-scripts@5.0.1` build-chain deps.
**Why:** Known-exploitable DoS in the request path (starlette multipart) is directly reachable at this traffic level; the EOL toolchain will keep accumulating advisories with no upstream fixes.
**Fix:** Bump fastapi/starlette and emergentintegrations/litellm and pymongo; re-run pip-audit to confirm. For the frontend, triage runtime vs build-only advisories and plan migration off `react-scripts` (e.g. Vite) — this also fixes C3/M1/M8 cleanly.

#### H2 — No database indexes
**Where:** Entire backend — `grep create_index|ensure_index` → **0 occurrences**. Startup runs `seed_data()` but creates no indexes.
**Why:** Every `find`/`find_one` (queries on `id`, `body_id`, `status`, `cycle`, regex search, etc.) is a full collection scan. Fine on seed data, but collections grow daily; at 200–300 users/day latency degrades within weeks and the single event loop spends CPU on scans. This is the top *latency* risk.
**Fix:** Create indexes on every field used in queries/sorts — at minimum `{id:1}` (unique) on each collection, plus `body_id`, `status`, `cycle`, and compound indexes for the common list filters. Add an `ensure_indexes()` coroutine to startup. Add unique indexes to back H5.

#### H3 — Blocking operations on the async event loop
**Where:**
- In-request LLM calls: `core/ai_validator.py:171` (`await chat.send_message` on claim submit), `routes/grant_claims.py:174` & `:395`, `routes/tournament_invoices.py:85`, `routes/squad_ai.py:333`. Seconds-to-tens-of-seconds each. **No explicit timeout is set on these calls** (the code catches errors and degrades to HOLD, which is good, but a hang holds the request).
- CPU-bound report generation: `routes/ledger.py:118` (openpyxl xlsx), `routes/ledger.py:194` & `routes/audit_pack.py:37` (reportlab PDF) — pure-Python, blocks the loop for the whole render.
- Sync file write in async handler: `routes/uploads.py:71` (`with open(target_path,"wb")`).
**Why:** With `--workers 1` (H6), the event loop is shared by all users. A handful of concurrent claim submits or a PDF export freezes every other request → latency spikes and apparent downtime.
**Fix:** Offload CPU/blocking work to a threadpool (`await run_in_executor` / `asyncio.to_thread`) or a background task/queue; add explicit timeouts (and a fallback) to every external LLM/HTTP call; stream large exports. Run multiple workers (H6).

#### H4 — Monetary values stored and computed as `float`
**Where:** `backend/models.py` — 55 `float` money fields, 0 `Decimal`. Arithmetic in `bank.py:50` (`round(balance + delta, 2)`), `vendor_bills.py:320`, `hr_payroll.py:172-198` (gross/TDS), `ledger.py:58-69`, `reimbursement_claims.py:62-113` (limit-eligibility comparisons), `extra_expense.py:147-174` (ceiling top-ups), `claims.py:95-98`.
**Why:** Floating-point rounding causes paisa-level drift and, worse, wrong over-budget / eligibility decisions when comparing against ceilings — unacceptable in a financial ERP subject to audit.
**Fix:** Store and compute money as `Decimal` (or integer paise). Convert at the Pydantic boundary; keep JSON serialization as string or fixed-scale number.

#### H5 — Non-atomic balance updates and counter-based reference numbers
**Where:** `routes/bank.py:44` `add_transaction` reads `current_balance`, computes in Python, then `$set`s it (same in `vendor_bills.py:319-320`). Reference numbers use `count_documents(...) + 1`: `procurement.py:18`, `tournament_invoices.py:75`, `tournament_plan.py:333`, and helpers `next_uid`/`_next_claim_no` in `core/helpers.py`.
**Why:** Two concurrent transactions on one account → **lost update** (one debit silently overwritten → wrong balance). Two concurrent creates → **duplicate PR/INV/claim numbers** (no unique index to catch it). Both are realistic at this concurrency and corrupt financial records.
**Fix:** Use atomic `$inc` for balances (`find_one_and_update`). For sequences, use an atomic counters collection (`find_one_and_update` with `$inc`) or a unique index + retry. Add the unique indexes from H2.

#### H6 — Backend run configuration uses development flags
**Where:** `/etc/supervisor/conf.d/supervisord.conf` → `uvicorn server:app --host 0.0.0.0 --port 8001 --workers 1 --reload`.
**Why:** `--reload` watches the filesystem and is a dev-only feature (extra memory, restarts on file changes → dropped requests). `--workers 1` gives zero CPU parallelism; combined with H3 the app serializes on any slow request.
**Fix:** Remove `--reload`; run under gunicorn+uvicorn workers (e.g. `gunicorn -k uvicorn.workers.UvicornWorker -w 2..4 server:app`) sized to CPU. Keep `stopsignal=TERM`/`stopwaitsecs` (already set — graceful drain is fine).

#### H7 — No React ErrorBoundary and no global error/rejection handler
**Where:** `frontend/src/` — zero `ErrorBoundary`/`componentDidCatch`/`getDerivedStateFromError`; `src/index.js` renders `<App/>` bare. No `window.addEventListener('unhandledrejection'|'error')`. Some `fetch` calls don't check `res.ok` (`components/NotificationBell.jsx:56/69/103/114`, `components/FileUpload.jsx:55`, `pages/PlayerDetail.jsx:81`, `pages/TournamentOps.jsx:327`).
**Why:** A render-time throw in any of 60 pages blanks the entire SPA (white screen) with no recovery — a single-user "downtime." Silent promise rejections hide failures.
**Fix:** Wrap the router in an ErrorBoundary with a fallback UI (ideally per-route); add a global `unhandledrejection`/`error` handler; route the raw `fetch` calls through the axios instance (which centralizes error handling) and check `res.ok`.

#### H8 — Uploaded files stored on ephemeral pod disk
**Where:** `core/infra.py` `UPLOAD_ROOT = /app/backend/uploads`; `routes/uploads.py:64-71` writes files there; `serve_upload` reads by stored `_path`.
**Why:** Pod-local disk is ephemeral. On redeploy/restart, all uploaded claim/KYC/grant documents are lost while the DB still references them (`serve_upload` then 410s). Contradicts "zero downtime / data durability." (The upload code itself is otherwise solid — MIME allow-list, 20 MB cap, UUID filenames, no path traversal.)
**Fix:** Store uploads in durable object storage (S3/GCS — `boto3` is already a dependency) and keep only the object key in Mongo.

---

### MEDIUM

- **M1 — No pagination; hard caps silently truncate.** No `to_list(None)` (good), but every list endpoint uses a fixed cap with no `skip`/client `limit`: `.to_list(3000)` (`audit_pack.py:84`, `dms.py:201`), `.to_list(2000)` (`members.py`), `.to_list(1000)` (`hr_payroll.py:134`/`:222`, `vendor_kyc.py:135`, `venues_grounds.py:95/194`, `vouchers.py:99`, `camps.py:153`, `division_grants.py:242`, `dms.py:113`), `.to_list(500)` (~25 endpoints). Only `bank.py:36` accepts a caller `limit`. As collections pass the caps, the UI silently drops rows and every call does a large unindexed read. **Fix:** add `skip`/`limit` params with a sane max and return a total count; pairs with H2.
- **M2 — Unescaped user input used as MongoDB `$regex` (ReDoS + unindexed scans).** Search params passed raw: `members.py:59-63`, `players.py:62-65`, `dms.py:109-111`, `vendor_bills.py:101-103`, `venues_grounds.py:94`, `tournament_plan.py:402`; also the division-suffix regex in `scoping.py:body_scope`. A crafted pattern (e.g. `(a+)+$`) pins the single event-loop CPU. **Fix:** `re.escape()` input, cap its length, prefer anchored/prefix match with a text index.
- **M3 — Untyped `dict` request bodies without value validation.** PATCH/PUT handlers whitelist keys (so no mass-assignment) but don't type-check values: `tournament_invoices.py:191` (money fields accept strings/negatives), `camps.py:111`, `tournaments.py:109`, `grant_claims.py:406`, `players.py:294` (raw `status` bypasses the enum). **Fix:** replace `patch: dict` with explicit all-Optional Pydantic `*Update` models and `Field(ge=0)` on money — the pattern already used correctly in `bank.py:19/44`.
- **M4 — Swallowed exceptions hide stale governance state.** `except Exception: pass` around date parsing in `dms.py:122/182`, `vendor_kyc.py:153`, `assets.py:109/116/202` — a malformed stored date leaves a KYC/compliance doc showing "Active" instead of "Expired" (`dms.py:118-123` never flips status). Not a crash, but a correctness/compliance bug. **Fix:** `logging.warning` the parse failure so bad data is discoverable; consider failing closed (mark for review) rather than silently "Active."
- **M5 — `@app.on_event` startup/shutdown are deprecated** (`server.py:45,57`) and startup runs `seed_data()` + workflow-config upsert + reimbursement-scheme seed on every boot. Seeds are idempotent (guarded by `count_documents(...) > 0`), so no data loss, but they add startup latency and delay readiness on each deploy. **Fix:** migrate to the FastAPI `lifespan` context manager; gate seeding behind an explicit flag/CLI rather than every boot.
- **M6 — pymongo 4.5.0 CVE** (PYSEC-2026-1826) → bump to **4.6.3** (also see H1).
- **M7 — pytest collection error.** `backend/tests/test_members_m6.py:17` does `os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")` → `AttributeError` when the var is unset, aborting collection for that module (634 tests collected, 1 collection error). Tests are HTTP integration tests requiring a live server + env var, so CI can't run them hermetically. **Fix:** guard the env read with a default; provide a test config; consider unit tests that don't need a live server.
- **M8 — Production source maps likely shipped.** CRA emits `.map` files by default (no `GENERATE_SOURCEMAP=false` configured for the prod build), exposing full readable source. **Fix:** set `GENERATE_SOURCEMAP=false` for prod builds.
- **M9 — No code-splitting; single 432 kB gzip bundle.** `src/App.js` statically imports all ~60 pages (no `React.lazy`/`Suspense`). Every user downloads the entire app (finance, payroll, elections, tournaments) to see the landing page. **Fix:** route-level `React.lazy` + `Suspense`; split heavy deps (`recharts`, `react-markdown`, `embla-carousel`, full Radix set).
- **M10 — 20 s axios timeout, no retry/backoff.** `frontend/src/lib/api.js:7-9`. A 20 s hang is a long user-facing stall. **Fix:** lower the timeout, add a centralized response-error interceptor with user feedback and optional retry for idempotent GETs.
- **M11 — No dedicated readiness health check.** `GET /api/` returns `{"status":"ok"}` and works as a liveness probe, but it doesn't verify DB connectivity. **Fix:** add `/api/health` that pings Mongo (`await db.command("ping")`) and wire the platform probe to it.

---

### LOW

- **L1 — Unused JWT libraries inflate the CVE surface.** `python-jose` and `pyjwt` are in `requirements.txt` but never imported (`grep` → 0). `python-jose` drags in the unfixable `ecdsa` PYSEC-2026-1325. **Fix:** remove both — eliminates that CVE for free.
- **L2 — `python-multipart` pin hygiene.** `>=0.0.9` allows a DoS-vulnerable version (CVE-2024-53981, fixed 0.0.18); installed is 0.0.28 (safe), but tighten the pin to `>=0.0.18`.
- **L3 — Linter drift.** `.ruff_cache` exists but `ruff` is not installed on the pod and there is no ruff config; `mypy>=1.8.0` is declared (2.1.0 installed) but no clean run was captured. **Fix:** pin ruff + a `[tool.ruff]` config and run both in CI.
- **L4 — No frontend tests.** `"test": "craco test"` exists but there are zero `*.test.*`/`*.spec.*` files under `frontend/src`. **Fix:** add smoke tests for critical flows (login/persona switch, claim submit).
- **L5 — Benign swallowed exceptions in `core/helpers.py`** (`:167`, `:416`, `:452`, `:479`, `:507`) and `core/ai_validator._parse_ai_response` — defensive date/JSON parsing fallbacks; acceptable, but a debug-level log would aid diagnosis.

---

## 3. Prioritized MEDIUM / LOW TODO with effort estimates

| # | Item | Sev | Effort |
|---|------|-----|--------|
| 1 | Add `skip`/`limit` pagination + total counts to list endpoints (M1) | MED | 1–2 d |
| 2 | `re.escape` + length cap on all regex-search params and scoping suffix (M2) | MED | 0.5 d |
| 3 | Replace `dict` bodies with typed `*Update` Pydantic models incl. money `ge=0` (M3) | MED | 1–2 d |
| 4 | Log (or fail-closed) the swallowed date parses in dms/vendor_kyc/assets (M4) | MED | 0.5 d |
| 5 | Migrate `on_event` → `lifespan`; gate seeding behind a flag (M5) | MED | 0.5 d |
| 6 | Bump pymongo → 4.6.3 and re-run pip-audit (M6, with H1) | MED | 0.25 d |
| 7 | Fix pytest collection (guard env read) + make tests runnable in CI (M7) | MED | 1 d |
| 8 | `GENERATE_SOURCEMAP=false` for prod build (M8) | MED | 0.1 d |
| 9 | Route-level `React.lazy`/`Suspense` code-splitting (M9) | MED | 1–2 d |
| 10 | Lower axios timeout + central error/retry interceptor (M10) | MED | 0.5 d |
| 11 | Add `/api/health` with DB ping; wire platform probe (M11) | MED | 0.25 d |
| 12 | Remove unused `python-jose`/`pyjwt` (L1) | LOW | 0.1 d |
| 13 | Tighten `python-multipart` pin ≥0.0.18 (L2) | LOW | 0.1 d |
| 14 | Install+configure ruff, run mypy clean in CI (L3) | LOW | 0.5–1 d |
| 15 | Add frontend smoke tests (L4) | LOW | 1–2 d |
| 16 | Debug-log the benign helper/AI-parse fallbacks (L5) | LOW | 0.25 d |

---

## 4. Go / No-Go

### 🔴 NO-GO

The application must not be deployed to production for real users in its current state. Blocking reasons:

1. **No authentication / authorization** — anyone with the URL can read salaries and bank balances and delete records (C1, C2). This is the single most serious issue.
2. **Served by a development server** rather than the built production bundle (C3) — it will be slow and unstable under concurrent load.

### Minimum bar to reach GO
- Close **all CRITICAL** (C1–C3): real auth + server-side scoping on reads and writes; serve the production build via nginx instead of the dev server.
- Close **all HIGH** (H1–H8): bump vulnerable deps; add DB indexes; offload blocking work + multi-worker prod server; `Decimal` money; atomic balances/sequences; ErrorBoundary + global handlers; durable upload storage.
- Then re-run this audit (including a full `pytest` and `mypy` pass once the environment is stable) and load-test at ~5–10× expected peak concurrency before sign-off.

### What's already good (keep it)
Clean modular route structure; upload handling (MIME allow-list, size cap, UUID names, no traversal); AI-gatekeeper failure handling degrades safely to human review; idempotent seed guards; consistent env-var usage in the frontend (no hardcoded URLs/secrets in `src/`); graceful shutdown wiring in supervisor. The blockers are configuration- and auth-shaped, not architectural — a focused effort closes them quickly.

---
*Estimated effort to reach GO: ~2–3 engineer-weeks (CRITICAL+HIGH), plus the MEDIUM/LOW backlog above. Re-audit required before deployment.*
