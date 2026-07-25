# MPCA ERP — Production-Readiness Audit

**Original audit:** 2026-07-22 · **Last updated:** 2026-07-23
**Target load:** 200–300 users/day, low latency, zero downtime after deploy
**Scope:** `/app/backend` (FastAPI + MongoDB/motor), `/app/frontend` (React 19 / CRA+CRACO)

> **Remediation status (2026-07-23):** All four addressed HIGH items (H3, H4, H6, H8) and
> all twelve MEDIUM items (M1–M12) are implemented and verified live on the pod. H2 is
> **deferred** (revisit before go-live) and H5 is **not planned** for now — see notes.
> The CORS and `.env`-file findings have been removed from this report at the team's request.

---

## VERDICT: 🔴 NO-GO for production (unchanged)

The blocker is unchanged and unrelated to the items fixed so far: **there is no real
authentication (C1/C2)** on a system holding bank balances, payroll, and member PII. Until
that is closed, the app must not be exposed to real users. The reliability/latency/quality
hardening below is done and verified, so once auth (and the remaining deployment items) land,
the app is in far better shape.

---

## 1. CRITICAL and HIGH issues (current status)

### CRITICAL (deployment blockers)
- **C1 — No server-side authentication; RBAC is spoofable client headers, default = "see everything."** 🔲 OPEN — `core/scoping.py`, all endpoints.
- **C2 — Unauthenticated access to and mutation of sensitive data** (bank, payroll, vendor KYC, member hard-deletes). 🔲 OPEN.
- **C3 — Production served by the React dev server (`yarn start`), not the built bundle.** 🔲 OPEN — `/etc/supervisor/conf.d/supervisord.conf` (platform-controlled).

### HIGH
- **H2 — Known-CVE dependencies** (starlette DoS via FastAPI pin; litellm; EOL react-scripts). ⏳ **DEFERRED** — revisit the starlette/FastAPI upgrade before go-live; low real-world risk while the app is not yet publicly exposed.
- **H3 — No MongoDB indexes.** ✅ **FIXED** — `core/indexes.py`, 79 indexes ensured at startup.
- **H4 — Blocking work on the async event loop.** ✅ **FIXED** — report rendering offloaded to threads; LLM calls given timeouts.
- **H5 — Money stored/computed as `float`.** ⏳ **NOT PLANNED (accepted for now)** — full `Decimal` migration deemed too large/risky to undertake at this time.
- **H6 — Non-atomic balance updates & reference counters.** ✅ **FIXED** — atomic `$inc` balances + atomic `next_seq` counters.
- **H7 — Backend runs dev flags (`--workers 1 --reload`).** 🔲 OPEN — platform-controlled (`supervisord.conf`).
- **H8 — No React ErrorBoundary / global handlers.** ✅ **FIXED** — `ErrorBoundary` + global handlers.
- **H9 — Uploaded files on ephemeral pod disk.** 🔲 OPEN — needs durable object storage (bucket/credentials required).

Detail, file:line, rationale, and (where done) verification below.

---

## 2. Detailed findings

Legend: **CRITICAL** = blocks deploy · **HIGH** = fix before real users · **MEDIUM** = fix soon · **LOW** = hygiene.
Status: ✅ FIXED · ⏳ DEFERRED/NOT PLANNED · 🔲 OPEN.

---

### CRITICAL

#### C1 — No real authentication; RBAC trusts client-supplied headers 🔲 OPEN
**Where:** `backend/core/scoping.py`; enforced ad-hoc via `Header(..., alias="X-Role-Id")`; frontend sets them in `frontend/src/lib/api.js`.
**What:** No login/session/token anywhere (no `Depends`/JWT/OAuth across the endpoints). "RBAC" is the frontend putting the current persona into request headers, which the backend reads verbatim; `body_scope()` returns `{}` (no filter → everything) when headers are absent or `X-Body-Type: state`.
**Why critical:** Any client can claim any role, or omit headers, and read/mutate all data. Total authz bypass on a financial system.
**Fix:** Real authentication (server-issued session/JWT, short expiry, secure cookie or bearer). Derive persona/body/role from the verified principal server-side — never from client headers. Global `Depends(require_user)` with an explicit public allow-list; enforce authorization on writes too.

#### C2 — Unauthenticated exposure/mutation of sensitive data (IDOR) 🔲 OPEN
**Where (examples):** `bank.py:15/28/36` (balances/ledgers), `hr_payroll.py:134` (salaries), `members.py:154` (unauthenticated hard delete), `vendor_kyc.py:135` (vendor bank details), `dashboard.py:31` (aggregate financials).
**Why critical:** Consequence of C1 — anyone reaching the API can enumerate salaries/balances and permanently delete records.
**Fix:** Same as C1 (auth + server-side scoping on every read *and* write); prefer soft-delete for governance records.

#### C3 — Production served by the CRA development server 🔲 OPEN
**Where:** `/etc/supervisor/conf.d/supervisord.conf` → `yarn start`. A working `build` exists and code-splitting now keeps the initial bundle small (see M9), but the dev server is still what runs.
**Why critical:** webpack-dev-server is single-process, unminified, HMR-enabled, memory-heavy, and unsuitable for production load.
**Fix:** Serve the static `build/` via nginx (present on the pod) or `serve -s build`; update the supervisor `frontend` program. (File is marked read-only / platform-managed — apply via the deploy pipeline.)

---

### HIGH

#### H2 — Dependency vulnerabilities ⏳ DEFERRED (revisit before go-live)
**What:** `pip-audit` flags starlette 0.37.2 (multipart DoS; the reachable one), litellm 1.80.0, pymongo (fixed — see below); `yarn audit` flags ~280 advisories dominated by EOL `react-scripts@5.0.1` build-chain deps.
**Constraint found:** `fastapi==0.110.1` hard-pins `starlette<0.38.0`, so the starlette fix requires upgrading FastAPI (→ ~0.115.x) and a full endpoint smoke-test. The litellm bump also pulls a major openai version bump. The npm advisories require migrating off react-scripts (e.g. Vite).
**Decision:** Deferred. Real-world risk is low while the app is not publicly exposed (and it shouldn't be until C1/C2 land). **Go-live checklist item:** do the FastAPI/starlette upgrade (closes the DoS) before exposing to real users. litellm bump and the react-scripts→Vite migration are lower priority.
**Note:** pymongo was already bumped **4.5.0 → 4.6.3** (closes PYSEC-2026-1826) as part of this pass — `pip check` clean, verified.

#### H3 — Database indexes ✅ FIXED
**What was done:** Added `backend/core/indexes.py` declaring **79 indexes** across all hot collections (unique `id` per collection + compound indexes on `body_id`/`status`/`fiscal_cycle`/`account_id`/etc.), created idempotently and non-fatally at startup (each wrapped in try/except). Wired into the lifespan startup in `server.py`.
**Verified:** startup log — `ensure_indexes: 79/79 indexes ensured`; queries no longer full-scan.

#### H4 — Blocking operations off the event loop ✅ FIXED
**What was done:** CPU-bound report rendering offloaded via `asyncio.to_thread` — `ledger.py` (xlsx `wb.save`, PDF `doc.build`), `audit_pack.py` (PDF `doc.build`). Every in-request LLM call given a hard timeout (`asyncio.wait_for`, `AI_CALL_TIMEOUT` default 45s) — `core/ai_validator.py` (×2), `grant_claims.py` (×2), `tournament_invoices.py`, `squad_ai.py`; all inside existing try/except so a timeout degrades gracefully.
**Verified:** compiles/imports clean; backend healthy.

#### H5 — Monetary values as `float` ⏳ NOT PLANNED (accepted risk for now)
**Where:** `backend/models.py` — 55 `float` money fields; arithmetic in `bank.py`, `vendor_bills.py`, `hr_payroll.py`, `ledger.py`, `reimbursement_claims.py`, `extra_expense.py`, `claims.py`.
**Why it matters:** Float rounding can cause paisa drift and wrong over-budget/eligibility comparisons in an audited financial system.
**Decision:** The full `Decimal`/`Decimal128` migration (models + all arithmetic + the H6 atomic `$inc` + serialization + existing-data migration) is too large/risky to undertake now and is **not planned** for this cycle. Partial mitigation already in place: rounding on balance writes and `ge=0` validation on typed money patches (M3). Revisit if financial-accuracy issues surface.

#### H6 — Atomic balances & reference numbers ✅ FIXED
**What was done:** Bank balances use atomic `$inc` via `find_one_and_update` (`bank.py`, `vendor_bills.py`) — no more lost updates. Reference-number generators converted from racy `count_documents()+1` to an atomic `next_seq()` helper (`core/shared_services.py`, backed by the `code_counters` collection, lazily seeded to preserve existing numbering): claims, procurement, transfers (NOC), tournaments, fee invoices, grant claims, tournament invoices, DA forms, reimbursement claims, tournament budgets, members, players, fixtures.
**Verified:** 20 concurrent transactions moved the balance by exactly 20 (zero lost updates); `next_seq` returns all-distinct values under concurrency and seeds correctly.
**Scope note:** a few non-financial operational counters (camps, meetings, venues/grounds, selection funnels, DMS docs, tournament-workspace) still use `count+1` — lower risk; same helper applies if wanted.

#### H7 — Backend dev-flag run configuration 🔲 OPEN
**Where:** `supervisord.conf` → `uvicorn ... --workers 1 --reload`.
**Fix:** Remove `--reload`; run gunicorn + uvicorn workers sized to CPU. (Platform-managed file — apply via deploy pipeline.)

#### H8 — React crash safety ✅ FIXED
**What was done:** Added `frontend/src/components/ErrorBoundary.jsx` wrapping the whole app in `src/index.js` with a fallback + reload, plus global `unhandledrejection`/`error` handlers.
**Verified:** production build compiles clean.

#### H9 — Uploads on ephemeral pod disk 🔲 OPEN
**Where:** `core/infra.py` `UPLOAD_ROOT = /app/backend/uploads`; `routes/uploads.py`.
**Why:** Pod-local disk is ephemeral — uploaded documents are lost on redeploy while the DB still references them.
**Fix:** Store uploads in durable object storage (S3/GCS — `boto3` already a dependency); keep only the object key in Mongo. **Needs a bucket + credentials.**

---

### MEDIUM — all fixed ✅ (2026-07-23)

- **M1 — Pagination.** ✅ Added `skip`/`limit` to 16 primary list endpoints (members, players, claims, grant-claims, vendors, vendor-bills, documents, assets, employees, payroll registers, vouchers, division-grants, procurement, transfers, tournaments, reimbursement-claims). `limit` defaults to each endpoint's prior cap (non-breaking); values clamped (`skip≥0`, `limit∈[1,5000]`). Verified: default/`limit`/`skip` all behave; bad input no longer 500s.
- **M2 — Regex ReDoS.** ✅ `re.escape()` on user search input across members, players, vendor_bills, dms, fixtures, tournament_plan, venues_grounds. Verified: `search=(a+)+` returns 200 instantly.
- **M3 — Typed request bodies.** ✅ Money-carrying PATCH bodies typed with all-Optional Pydantic models (`extra="ignore"`, money `ge=0`): `tournament_invoices.update_invoice`, `extra_expense.update_extra_expense_request`. Verified: extra keys ignored, negative/non-numeric amounts rejected. (Non-money status/text patches left as-is — key-whitelisted already.)
- **M4 — Swallowed errors.** ✅ Silent `except: pass` on status-affecting date parses replaced with `logger.warning` in dms, vendor_kyc, assets.
- **M5 — Lifespan + seed gate.** ✅ Migrated `@app.on_event` → `lifespan`; seeding gated behind `SEED_ON_STARTUP` (default true; set false in prod).
- **M6 — pymongo bump.** ✅ 4.5.0 → 4.6.3; `pip check` clean; verified boot.
- **M7 — pytest collection crash.** ✅ Guarded the unbounded env read in `test_members_m6.py`.
- **M8 — Source maps.** ✅ `GENERATE_SOURCEMAP=false` in frontend `.env`; build emits no `.map` files.
- **M9 — Code-splitting.** ✅ `App.js` pages converted to `React.lazy` + `Suspense`; initial bundle **444 kB → 113 kB gzip** across 60 on-demand chunks.
- **M10 — Axios.** ✅ Timeout 20s→15s + retry interceptor (idempotent GETs, transient failures, backoff).
- **M11 — Config docs.** ✅ Added `backend/.env.example` and `frontend/.env.example`.
- **M12 — Health check.** ✅ `/api/health` pings MongoDB (503 if down); verified `{"status":"ok","db":"ok"}`.

---

### LOW (open)

- **L1 — Unused JWT libs.** 🔲 `python-jose` and `pyjwt` are declared but never imported; removing `python-jose` eliminates the unfixable `ecdsa` CVE.
- **L2 — `python-multipart` pin hygiene.** 🔲 Tighten `>=0.0.9` to `>=0.0.18` (installed 0.0.28 is already safe).
- **L3 — Linter drift.** 🔲 `.ruff_cache` exists but ruff isn't installed/configured; pin ruff + config and run in CI.
- **L4 — No frontend tests.** 🔲 `craco test` exists but no `*.test.*` files.
- **L5 — Benign swallowed exceptions in `core/helpers.py`.** 🔲 Defensive date/JSON parsing; a debug log would aid diagnosis.

---

## 3. Remaining prioritized TODO

| # | Item | Sev | Status | Notes / effort |
|---|------|-----|--------|----------------|
| 1 | C1/C2 — real auth + server-side scoping | CRIT | OPEN | Needs credential-model decision; the top priority |
| 2 | C3 — serve built frontend, not dev server | CRIT | OPEN | Platform/deploy-pipeline change |
| 3 | H7 — prod server flags (workers, no reload) | HIGH | OPEN | Platform/deploy-pipeline change |
| 4 | H9 — durable upload storage (S3/GCS) | HIGH | OPEN | Needs bucket + credentials |
| 5 | H2 — FastAPI/starlette upgrade (DoS) | HIGH | DEFERRED | Do before public exposure; ~30–60 min + smoke test |
| 6 | H2 — litellm bump / react-scripts→Vite | HIGH | DEFERRED | Lower priority |
| 7 | H5 — money → Decimal | HIGH | NOT PLANNED | Large/risky; accepted for now |
| 8 | L1 — remove unused python-jose/pyjwt | LOW | OPEN | ~0.1 d; kills ecdsa CVE |
| 9 | L2–L5 — pins, linters, tests, logging | LOW | OPEN | Hygiene |

---

## 4. Go / No-Go

### 🔴 NO-GO — for one reason: authentication (C1/C2).

Everything reliability-, latency-, and quality-related that was in scope has been fixed and
verified (H3, H4, H6, H8; M1–M12; pymongo). The app is materially more robust than at the
original audit. The remaining blocker is singular and decisive: **anyone who can reach the URL
can still read and delete financial/PII data**, because there is no real authentication.

**Minimum bar to reach GO:**
1. Close **C1/C2** (auth + server-side scoping) — the top priority.
2. Close **C3** and **H7** (serve the build; production server flags) via the deploy pipeline.
3. Close **H9** (durable upload storage).
4. Do the deferred **H2** FastAPI/starlette upgrade before public exposure.
5. Re-run this audit (incl. a full pytest/mypy pass) and load-test before sign-off.

### What's solid now
Modular routes; validated file uploads; AI-failure fallbacks (now with timeouts); idempotent,
gated seed; DB indexes; atomic balances & reference numbers; paginated list endpoints; escaped
search; crash-safe frontend with lazy-loaded routes; a real DB-backed health check.

---
*Re-audit required before deployment. This report reflects remediation completed through 2026-07-23.*
