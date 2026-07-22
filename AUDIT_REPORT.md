# MPCA ERP — Production-Readiness Audit

**Date:** 2026-07-22
**Auditor:** Automated code audit (read-only; no source files were modified)
**Target profile:** 200–300 users/day, low latency, zero-downtime deploys
**Scope:** `/app/backend` (FastAPI + MongoDB/motor, 47 route modules, ~17k LOC) and `/app/frontend` (CRA/craco + React 19, ~28k LOC, 123 files)

---

## Verdict (summary)

🔴 **NO-GO for production.** The application has **no authentication and no server-side authorization of any kind** — identity and role are taken from client-supplied HTTP headers and request-body fields, and the login screen never verifies the password. Any visitor can act as the MPCA President, drain the association bank account through the claim-disbursement workflow, forge election results, and read all PII. On top of that, the database has **zero indexes** and the AI gatekeeper runs **inline on the request path with no timeout**, so the app will not hold up at the target traffic even if access control is fixed. Full reasoning and the release gate are in the final section.

---

## How to read this report

Findings are grouped by phase and rated **CRITICAL / HIGH / MEDIUM / LOW**. Each carries a `file:line` reference, why it matters *at this traffic level*, and the recommended fix. CRITICAL + HIGH are listed in full below and also summarized up top in the chat message that accompanies this file. MEDIUM/LOW appear here and in the prioritized TODO at the end with effort estimates.

**Environment note / limitations of this run:**
- Backend Python dependencies are **not installed** in the audit environment (`fastapi`, `pymongo`, etc. missing) and **no MongoDB is running**, so the backend and its test suite **could not be executed here**. Test findings are from reading all 26 test files.
- Declared linters/type-checkers (`ruff`, `flake8`, `mypy`) are in `requirements.txt` but **not installed**, so a full lint/type pass could not be run. The frontend eslint ran as part of the build.
- The **frontend production build was executed and succeeds** (`yarn build` → exit 0, 29.5s) — see PERF-FE-1 for the resulting bundle metrics and the CI caveat.

---

# Phase 2 — Security (highest-impact section)

## CRITICAL

### SEC-1 — No authentication or authorization anywhere; identity is client-controlled
**Files:** `backend/server.py` (whole), `backend/core/scoping.py:49-78`, `frontend/src/pages/Login.jsx:96-108`, `frontend/src/context/AuthContext.jsx:102-136`, `frontend/src/lib/api.js:13-30`

There are **zero** `Depends`, no `OAuth2`/`HTTPBearer`, no session, no JWT, and no login endpoint in the entire backend (`grep` confirms). "RBAC" works like this: the frontend stores a chosen persona in `localStorage.mpca_persona` and the axios interceptor attaches it as plain headers on every request:

```js
// frontend/src/lib/api.js:18-26
if (p?.id) config.headers["X-Role-Id"] = p.id;
if (p?.body_code) config.headers["X-Body-Code"] = p.body_code;
if (p?.body_type) config.headers["X-Body-Type"] = p.body_type;
```

The backend trusts those headers verbatim (`core/scoping.py:49-63` — `X-Body-Type: state` returns an empty filter = sees everything), and state-changing endpoints trust `actor_role` / `actor_name` / `actor_body_id` from the **request body**. The login form never checks the password:

```js
// frontend/src/pages/Login.jsx:96
const handleSubmit = (e) => {
  if (!email.trim() || !password.trim()) { setError(...); return; }
  proceedWith(selectedPersona);   // password never verified
};
```

**Why it matters at 200–300 users/day:** any visitor can open DevTools (or `curl` with headers) and become the President/Treasurer of any body. This is the root cause of SEC-2 through SEC-6 below. **No per-endpoint patch fixes it** — it requires a real auth layer (server-issued signed token/session, verified credentials) with role/body derived server-side from that token, plus a default-deny posture.
**Fix:** Implement authentication (password hashing with bcrypt/argon2 — both `bcrypt` and `passlib` are already in `requirements.txt` but unused; issue a signed JWT or session cookie with `Secure`/`HttpOnly`/`SameSite`), and add a FastAPI dependency that resolves the current user + role on every route. Never read identity from client headers/body.

### SEC-2 — Claim approval chain is fully bypassable → drain the bank account
**File:** `backend/routes/claims.py:173-361` (`submit → recommend → sanction → disburse`)

The four-stage financial approval is a status-only state machine; each transition records but never verifies `actor_post`/`actor_name`/`actor_body_id`. A single anonymous caller can POST the four endpoints in sequence to reach `disburse_claim`, which writes a `Debit` `BankTransaction` and decrements `bank_accounts.current_balance` (`claims.py:349-352`). The two-signatory control (`claims.py:293`) is defeated by sending `co_signatory_post`/`co_signatory_name` strings (`claims.py:321-323`). No maker≠checker separation.
**Why it matters:** direct, unauthenticated exfiltration of association funds plus a forged, fully "signed" audit trail. Highest-impact issue in the app.
**Fix:** enforce per-stage role+body checks from the authenticated identity (SEC-1); enforce separation of duties (creator ≠ sanctioner ≠ disburser).

### SEC-3 — Player transfer (NOC) chain bypassable; reassign any player
**File:** `backend/routes/transfers.py:60-114`

`approve_from` / `approve_to` / `approve_mpca` / `complete` accept `ClaimAction` and only check the previous status — never that the caller is the releasing body, receiving body, or MPCA. One caller can walk all stages; `complete_transfer` (`transfers.py:109-112`) reassigns the player's `body_id`.
**Fix:** bind each stage to the authenticated body identity.

### SEC-4 — Procurement award: zero authz, trivial self-dealing
**File:** `backend/routes/procurement.py:50-133`

No actor is even collected. A caller creates a PR, posts three attacker-authored quotations (`procurement.py:66-85`), and awards to any of them (`procurement.py:88-133`); the L1-justification bypass is just a >10-char `notes` string (`procurement.py:114`). Combined with SEC-2 this manufactures a complete fake procurement→disbursement trail.
**Fix:** authenticate the awarding officer; validate vendors against the vendor master; require independent quote provenance.

### SEC-5 — Elections: anyone can conclude elections and vote as any member
**File:** `backend/routes/elections.py:38-114`

`conclude_election` (`:100-114`) takes no actor and sets the winner; `add_candidate` (`:54-65`) and `update_election` (`:38-45`) are unauthenticated; `cast_vote` (`:68-97`) accepts `voter_uid` in the body with no proof the caller is that voter (one-vote-per-uid is the only guard). Governance integrity is unenforceable.
**Fix:** bind voter identity to the authenticated session; restrict conclude/candidate management to a Returning Officer role.

## HIGH

### SEC-6 — CORS wildcard combined with `allow_credentials=True`
**File:** `backend/server.py:36-42`; `backend/.env` ships `CORS_ORIGINS="*"`

`allow_origins=["*"]` + `allow_credentials=True` + `allow_headers=["*"]` lets any origin make cross-origin calls and set the custom identity headers the app uses for "auth." A malicious page a user visits can invoke the money/governance endpoints above.
**Fix:** explicit origin allowlist in prod; never pair `*` with credentials.

### SEC-7 — Members RBAC gate bypassed by omitting the header; self-role escalation
**File:** `backend/routes/members.py:139,159,193,223,255`; `backend/models.py:95`

The guard `if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:` is skipped entirely when `X-Role-Id` is **absent** (documented in the code comment at `members.py:131-132`). `MemberUpdate` includes a `role` field, so a caller editing "their own" record can set `role: "President"`. `delete_member` is likewise open when the header is omitted.
**Fix:** default-deny when identity is missing; derive role from a verified session; strip `role` from self-service update payloads.

### SEC-8 — Direct, unauthenticated bank-ledger writes
**File:** `backend/routes/bank.py:19,44`

Anyone can `POST /bank/accounts` and `POST /bank/transactions` (arbitrary Debit/Credit) with no actor check, corrupting the ledger independently of the claims workflow.
**Fix:** restrict to authenticated Treasurer/bank-signatory role.

### SEC-9 — Unauthenticated serving of PII documents; client-trusted content-type
**File:** `backend/routes/uploads.py:51-53,56,101-113`

`GET /uploads/{file_id}` serves any file to anyone holding the UUID, with no ownership/scope check — KYC docs (Aadhaar, PAN, birth certificates) included. `file.content_type` is client-supplied and echoed back on download (`uploads.py:109-113`) with no magic-byte validation. *(Positive: filenames are server-generated UUIDs, so no path traversal on upload or download.)*
**Fix:** require auth + body-scope ownership on download; validate real content type; serve user files with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.

### SEC-10 — No rate limiting / brute-force protection anywhere
**Evidence:** no `slowapi`/limiter/throttle anywhere in the codebase.

At target traffic this enables: (a) cost-exhaustion of the LLM key via the AI endpoints (`claims` submit, `routes/grant_claims.py:352` chat); (b) member-UID enumeration on election endpoints; (c) cheap DoS via the unescaped `$regex` scans (SEC-11).
**Fix:** add per-IP/per-identity limits (e.g. `slowapi`) on AI, search, and any future auth endpoints.

### SEC-11 — Regex injection / ReDoS via unescaped user input in `$regex`
**Files:** `players.py:62-65`, `members.py:59-63,566`, `dms.py:109-111`, `vendor_bills.py:101-103`, `venues_grounds.py:94`, `tournament_plan.py:402`, `fixtures.py:263`, `ledger.py:45-46`

User search/name/city values are interpolated straight into `{"$regex": <value>, "$options": "i"}` with no `re.escape`. A crafted catastrophic-backtracking pattern (`(a+)+$`) pins a CPU core — a cheap DoS, made worse because these scans are already un-indexed (see PERF-BE-5). `members.py:566` uses `^{email}$` unescaped in the bulk-upload dedupe.
**Fix:** `re.escape()` all user input in `$regex`; cap input length; prefer anchored/text-index search.

## MEDIUM / LOW (security)

- **MEDIUM — No security headers.** No `X-Frame-Options`, `Content-Security-Policy`, `HSTS`, `X-Content-Type-Options`, or `TrustedHostMiddleware` (backend). Add a headers middleware. *(server.py)*
- **MEDIUM — Endpoints accept raw `dict` bodies (unvalidated values).** `camps.py:111`, `grant_claims.py:406` (keys allowlisted, values not); `grant_claims.py:239,261` take approver identity + `approved_amount_inr` as bare params with no bound check. Use Pydantic partial-update models. *(also Phase 1 validation)*
- **MEDIUM — Live LLM key in plaintext `backend/.env`** (`EMERGENT_LLM_KEY=sk-emergent-…`). *Positive:* verified **never committed** to git history (`git log -S 'sk-emergent'` empty) and `.env` is git-ignored. Still: rotate it, move to a secrets manager, keep it out of build artifacts.
- **MEDIUM — Frontend leaks identifiers to third parties.** `MemberCard.jsx:21` sends member UIDs to `api.qrserver.com`; `Landing.jsx:37-169` pulls full-res Unsplash/emergent images; `public/index.html:103-110` runs PostHog **session recording** (records finance UI) with no consent gate. Generate QR client-side; self-host images; gate/mask recording.
- **LOW — Prompt injection into the AI gatekeeper.** `core/ai_validator.py:123-143,167-170` concatenates claim text and OCR'd upload contents into the LLM prompt. Impact bounded — verdict is advisory/allowlisted and "never disburses" — but a coerced verdict weakens the fraud screen. Keep AI advisory + human gate.
- **LOW — `frontend/.env` note:** contains no secrets (only `REACT_APP_BACKEND_URL`, etc.) and is git-ignored — good. Remember `REACT_APP_*` is baked into the public bundle; never put secrets there.

---

# Phase 3 — Performance & Latency

## CRITICAL

### PERF-BE-1 — Zero database indexes exist anywhere
**Evidence:** `grep -rn "create_index"` across the whole backend returns nothing.

Every collection is queried only by Mongo's default `_id` index. The app looks records up by a custom string `id` field (UUID), so even `find_one({"id": ...})` on nearly every write path (`claims.py:176,191`, `shared_services.py:124,197`) is a **full collection scan**. Every `find({"body_id": ...})`, `count_documents(...)`, and `sort("created_at", -1)` scans the whole collection; an unindexed in-memory sort aborts at 32MB.
**Why it matters:** append-only collections (`audit_log`, `claims`, `players`, `notifications`) grow unbounded; latency degrades linearly and the dashboard (PERF-BE-4) gets slowest exactly under concurrency.
**Fix:** add an `ensure_indexes()` coroutine at startup: unique `{id:1}` on every collection; compound indexes for hot paths, e.g. `claims {body_id:1, status:1, created_at:-1}`, `audit_log {module:1, record_id:1, timestamp:-1}`, `notifications {recipient_role_id:1, recipient_body_id:1, created_at:-1}`, `members {body_id:1, status:1}`.

### PERF-BE-2 — LLM call runs inline on the request path with no timeout
**Files:** `backend/core/ai_validator.py:161-173`; called synchronously from `routes/claims.py:196`, `routes/players.py:445`, `routes/ai_claims.py:43`

```python
# core/ai_validator.py:172 — no timeout; the try/except catches errors, not hangs
raw = await chat.send_message(msg)   # Gemini call, uploads document files
```

No `asyncio.wait_for`, no `BackgroundTasks`, no queue. If Gemini is slow/stalled, the user's "submit claim" request blocks for the whole round-trip, holding an event-loop task and a connection. Under load this exhausts the pool and stalls unrelated requests.
**Why it matters:** single biggest end-user latency risk; one slow upstream degrades the whole app.
**Fix:** wrap in `asyncio.wait_for(..., timeout=20)` **and** move AI validation off the request path — return immediately with status `AI_Pending` and update the claim asynchronously (the code already tolerates a deferred verdict via `_apply_ai_verdict`).

### PERF-BE-3 — No health / liveness / readiness endpoint
**Evidence:** only `GET /api/` (`server.py:29-31`) — a static dict touching no DB.

For zero-downtime deploys a readiness probe must confirm the pod can serve (DB reachable, startup finished). The static root returns 200 even while Mongo is down or the long startup seed (PERF-BE-6) is still running, so traffic routes to not-ready pods and users get errors during every deploy.
**Fix:** `GET /api/health` (liveness, static) + `GET /api/ready` doing `await db.command("ping")` with a short timeout, returning 503 until seeding completes.

## HIGH

### PERF-BE-4 — N+1 query fan-out on dashboard/body endpoints
**Files:** `routes/dashboard.py:64-65` (loops `_division_score` per division; each fires ~8 unindexed queries + a Python loop over up to 1000 claims — `core/helpers.py:132-201`), `routes/bodies.py:92-141` (~6–7 queries per child body).

For ~10 divisions that is ~80 unindexed queries on the endpoint hit on every login/landing.
**Fix:** replace per-item loops with a single aggregation pipeline (`$group`/`$facet`) per collection; pair with PERF-BE-1 indexes.

### PERF-BE-5 — Unbounded queries; no pagination; full-collection exports
**Evidence:** large hard caps and **zero `.skip()`** anywhere. `to_list(5000)`: `ledger.py:51`, `reimbursement_claims.py:392`, `tournament_budgets.py:123`, `vendor_bills.py:418`, `venues_grounds.py:391`. `to_list(3000)`: `assets.py:273`, `audit_pack.py:84`, `dms.py:201`. `to_list(2000)`: `members.py:70`, `players.py:73`, `scoping.py:21`, and more.

List endpoints return thousands of full documents in one un-indexed scan with no page/offset; caps like 5000 silently truncate once data grows.
**Fix:** add `skip`/`limit` (default 50–100) with indexed sort; stream xlsx exports as a background job.

### PERF-BE-6 — Full data seed runs on every boot, blocking readiness
**File:** `backend/server.py:45-54` → `seed.py` (~20 sub-seeders, `migrate_body_ids`, unconditional `update_many` at `seed.py:821`, vendor-KYC backfill scan at `seed.py:1033`)

Seeding is `await`ed before uvicorn serves, so every deploy pays a serial, unindexed DB cost before the pod is ready — directly against zero-downtime. (Sub-seeders are guarded by `count_documents > 0`, so mostly idempotent, but the guards and several unconditional statements still run each boot.)
**Fix:** gate behind `SEED_ON_STARTUP=false` in prod / run as a one-shot migration job; never seed demo data in the serving process.

### PERF-BE-7 — Blocking CPU/file work on the async event loop
**Files:** `routes/ledger.py:117-140+` (openpyxl xlsx build inline), `core/pdf_generator.py:160,242` (reportlab `doc.build` inline), `routes/uploads.py:71` (synchronous `out.write` in async handler), `routes/audit_pack.py:30` (234-line inline PDF build)

Synchronous CPU/disk work freezes the single event loop for its whole duration, stalling every concurrent request.
**Fix:** `await asyncio.to_thread(...)` for PDF/xlsx; `aiofiles`/`run_in_threadpool` for the upload write.

### PERF-FE-1 — No code-splitting: single 432 kB gzipped JS chunk
**Files:** `frontend/src/App.js:5-62` (all pages eagerly imported; no `React.lazy`/`Suspense` anywhere)

Verified from the executed build: one `main.*.js` of **1.81 MB raw / 432 kB gzipped**. A visitor hitting `/login` or the public `/verify/:uid` downloads and parses the code for all 40+ authenticated pages before first paint — a multi-second penalty on slower networks for every daily user.
**Fix:** convert route elements to `React.lazy(() => import(...))` and wrap `<Routes>` in `<Suspense>`. Mechanical change, no craco config needed; the highest-value quick win for perceived latency.

## MEDIUM

- **PERF-BE-8 — Motor client has no pool/timeout tuning.** `core/infra.py:13` `AsyncIOMotorClient(mongo_url)` — a Mongo blip hangs requests ~30s (default server-selection) before failing. Set `maxPoolSize`, `serverSelectionTimeoutMS=5000`, `connectTimeoutMS`, `socketTimeoutMS`.
- **PERF-BE-9 — Case-insensitive `$regex` cannot use an index** even once indexes exist (same sites as SEC-11). Use `$text` or a normalized lowercase field with anchored prefix regex.
- **PERF-BE-10 — Approval-matrix file read on every AI call.** `ai_validator.py:37` `read_text()` synchronously per request. Cache at startup.
- **PERF-FE-2 — Long lists render un-virtualized; index keys on mutable lists.** `Members.jsx:204`, and `key={idx}` used 63× across pages incl. editable rows (`ClaimNew.jsx:324`) — subtle row-state bleed after delete. Use stable ids; add `react-window` before data grows.
- **PERF-FE-3 — FileUpload bypasses the shared axios client** (`FileUpload.jsx:55-58` uses raw `fetch`) → no timeout, a stalled upload hangs forever. Route through `api.post`.

---

# Phase 4 — Reliability & Deployment Readiness

## HIGH

### REL-1 — No React error boundary; one render error white-screens the app
**Files:** `frontend/src/App.js`, `frontend/src/index.js:6-11` (no `ErrorBoundary`/`componentDidCatch` anywhere)

Any uncaught render exception (e.g. an API returns an unexpected shape) unmounts the whole tree to a blank page for every user, with no recovery.
**Fix:** wrap `<Routes>` in an error boundary with a fallback + reload and error logging.

### REL-2 — API failures silently swallowed; users see blank "no data" pages
**Files:** 14 page loaders with no `catch` — e.g. `Bank.jsx:14-24` (`try { … } finally { setLoading(false) }`), `Meetings.jsx:28-37`, `Dashboard.jsx:194,208` (`catch (_) {}`)

On a 500/network drop/20s timeout the spinner disappears and the page looks empty — indistinguishable from genuinely-empty data, with no error or retry.
**Fix:** add an `error` state + retry UI per loader; add a global axios **response interceptor** in `api.js` to normalize 401/403/5xx/timeout and toast (the app already ships `sonner`).

### REL-3 — Business IDs generated by `count()+1` → duplicates under concurrency
**File:** `backend/core/helpers.py:22,85,92,431,439,459,549,556,603`

```python
# helpers.py:91 — read-then-write, not atomic
count = await db.claims.count_documents({"fiscal_cycle": cycle})
return f"CLM-{cycle}-{count + 1:03d}"
```

Two concurrent submissions (plausible at this traffic, or during bulk member import `members.py:559`) mint the **same** claim/member/invoice number — a correctness + audit-integrity bug in a financial system. Note `core/shared_services.next_code:44` already does this correctly with atomic `find_one_and_update({$inc})`.
**Fix:** route all sequence generation through the atomic `code_counters` pattern; delete the count-based generators.

## MEDIUM

- **REL-4 — Deprecated lifecycle hooks; shutdown doesn't drain in-flight work.** `server.py:45,57` use `on_event`; `on_shutdown` just `client.close()`. No `--timeout-graceful-shutdown` configured (no Dockerfile/Procfile/uvicorn config in repo). SIGTERM behavior is undefined; closing the client before requests finish errors them. Migrate to `lifespan`; configure graceful shutdown.
- **REL-5 — No global exception handler / structured 500s.** No `@app.exception_handler`. FastAPI's default means an unhandled error fails only that request (process does **not** crash — good), but there's no centralized logging/correlation. Add a global handler that logs with a request id and returns a clean JSON 500.
- **REL-6 — Silent exception swallowing.** ~22 `except Exception:` blocks in non-test code with bare `pass`/`return`, e.g. `assets.py:109,116,202`, `dms.py:122,182,216`, `vendor_kyc.py:153`, `bodies.py:131`, `helpers.py:167,416,452,479,507`, `audit_pack.py:26`. Real failures vanish undiagnosably. Catch specific exceptions; `logger.exception(...)` before continuing.
- **REL-7 — Config hardcoding; no `.env.example`.** `core/infra.py:24-25` hardcodes `/app/memory/APPROVAL_MATRIX.md` and `MPCA_MEETING_AGENDA.md`; `.env` ships `DB_NAME="test_database"` (footgun in prod); no `.env.example`/`.env.sample` anywhere; `frontend/src/lib/api.js:3` has no fallback (undefined env → `"undefined/api"` and every request 404s). Add `.env.example` for both; move paths to env; assert the backend URL at build time.
- **REL-8 — Build is green but eslint-fragile.** `yarn build` succeeds (exit 0) but emits many `react-hooks/exhaustive-deps` warnings. It passed because it was run with `CI=false`; a standard CI pipeline sets `CI=true`, under which CRA treats warnings as errors and **the build fails**. Fix the warnings or explicitly set `CI=false` in the deploy pipeline (and know the trade-off).

## LOW

- **REL-9 — Logging.** `core/infra.py:18` `basicConfig(level=INFO)` is noisy (seed logs every boot). No secret logging found, but AI reasoning text (potentially containing PII from claims) is persisted to notifications/logs. Consider `WARNING` in prod and scrubbing PII. No unbounded in-process caches/module-level mutable state found (no memory-leak-grade issues).

---

# Phase 1 — Code Quality & Tests

## CRITICAL / HIGH

### TEST-1 (CRITICAL) — The entire test suite runs against a live shared DB, with a hardcoded remote fallback
**Files:** all 26 `backend/tests/test_*.py`; e.g. `test_mpca_api.py:34-41` (best-effort cleanup that swallows delete failures), `test_phase2_api.py:236,292` (casts real votes, concludes elections with no rollback), `test_m1_m2_enhancements.py:9` (`BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://nice-aryabhata-4.preview.emergentagent.com"`)

Every test is a black-box HTTP integration test firing `requests` at a **running server** against **whatever real MongoDB it is wired to** — several open a second direct `pymongo` connection (`test_m12_selection_console.py:19` hardcodes `localhost:27017`). There are **no unit tests, no `TestClient`, no `conftest.py`, no `pytest.ini`**. If the env var is unset the suite writes test data into a **live hosted preview environment over the internet**. Cleanup is partial and swallows errors, so the suite pollutes data and is order-dependent/flaky.
**Why it matters:** "passing tests" say nothing reliable about the code, and the suite itself is a data-integrity/security risk. There is no safe automated regression gate.
**Fix:** add `conftest.py` with a disposable scratch-DB fixture (create/drop per module) and a shared client; fail fast if the URL is unset; never let tests touch a serving DB or a remote host.

### CQ-1 (HIGH) — `models.py` is a 1,966-line god file (83 models); statuses are stringly-typed
**File:** `backend/models.py`

83 `BaseModel` classes for every domain in one file; the `id = Field(default_factory=lambda: str(uuid.uuid4()))` line is copy-pasted 39×; state machines use plain strings (no `Enum`), so statuses are unvalidated.
**Fix:** split into a `models/` package by domain; add a shared `MongoDoc` base for the `id` factory; use `str, Enum` for status fields.

### CQ-2 (HIGH) — Duplicated notify / recipient / approval-chain logic across modules
**Files:** `core/helpers.py:257,308,370`, `tournament_budgets.py:42,52`, `vendor_bills.py:37,51`; `approval_chain` handling spread across ~15 route files

Near-identical `title_map`/`severity_map`/`msg`/`_create_notification` skeletons reimplemented per module.
**Fix:** one generic `notify_status_change(entity_type, doc, new_status, actor_name)` driven by a per-entity config table.

## MEDIUM / LOW

- **CQ-3 (MEDIUM) — Overly long functions.** `audit_pack.py:30` (234 lines), `members.py:444` (169-line CSV importer), `claims.py:60` (114) / `:388` (104) / `:280` (85), `squad_ai.py:182` (109), `ai_validator.py:196` (109), `helpers.py:132` (106). Extract helpers; split row-validation into pure functions.
- **CQ-4 (MEDIUM) — Inconsistent return contracts.** Some handlers use `response_model` (`vendor_bills.py:85`), many return ad-hoc dicts (17 `{"ok": True}` sites; `grant_claims.py` 10, `tournaments.py` 6); error handling mixes `raise HTTPException(404)` with `200 + {"valid": False}` (`verify` endpoint). Standardize on `response_model` + one error envelope.
- **TEST-2 (MEDIUM) — Coverage gaps.** No dedicated endpoint tests for `camps`, `grant_claims`, `tournament_plan`; thin/indirect coverage for `scheme_calc`, `squad_ai`, `hr_payroll`, `ai_claims`; **no auth tests** (no auth exists); shallow error-path coverage (no concurrency, malformed-payload, or 500-handling tests). Coverage was **not measurable** in this environment (deps/DB absent).
- **CQ-5 (LOW) — Dead code / cruft.** `models.py:1302` deprecated `body_id` alias kept indefinitely; `/app/tests/` is an empty `__init__.py`; `/app/test_result.md` is agent-protocol scaffolding, not results; `frontend/src/pages/TournamentOps.jsx` (984 LOC) appears unrouted in `App.js` (likely dead page); `ProtectedShell`/`Protected` wrapper in `App.js:64-72` is redundant indirection.
- **CQ-6 (LOW) — Linters/type-checkers declared but unrun.** `ruff`/`flake8`/`mypy` are in `requirements.txt` but not installed here; no CI config invokes them. Wire them into CI.

---

# Prioritized TODO — MEDIUM / LOW items (with effort estimates)

Effort key: **S** ≤ half a day · **M** ≈ 1–3 days · **L** ≈ 1 week+

| # | Item | Sev | Effort |
|---|------|-----|--------|
| 1 | Add DB pool/timeout tuning to motor client (PERF-BE-8) | MED | S |
| 2 | Add `.env.example` for backend + frontend; env-fallback for `API_BASE`; move hardcoded `/app/memory` paths to env (REL-7) | MED | S |
| 3 | Global FastAPI exception handler + request-id logging (REL-5) | MED | S |
| 4 | Log swallowed exceptions instead of silent `pass` (REL-6, ~22 sites) | MED | S–M |
| 5 | Migrate to `lifespan` + configure `--timeout-graceful-shutdown` (REL-4) | MED | S |
| 6 | Fix eslint `exhaustive-deps` warnings or pin `CI=false` in deploy (REL-8) | MED | S–M |
| 7 | Cache approval-matrix at startup; stop per-call file read (PERF-BE-10) | MED | S |
| 8 | Add security-headers middleware (CSP/HSTS/X-Frame-Options) | MED | S |
| 9 | Replace raw-`dict` endpoints with Pydantic partial-update models (SEC MED) | MED | M |
| 10 | Rotate LLM key; move to secrets manager | MED | S |
| 11 | Generate QR client-side; self-host landing images; gate/mask PostHog recording (SEC MED) | MED | M |
| 12 | Convert `$regex` search to `$text`/normalized-field (PERF-BE-9, ties to SEC-11) | MED | M |
| 13 | Route FileUpload through shared axios client (PERF-FE-3) | MED | S |
| 14 | Virtualize large registers; replace index keys on mutable lists (PERF-FE-2) | MED | M |
| 15 | Split `models.py` into package; introduce status Enums (CQ-1) | MED | M–L |
| 16 | De-duplicate notify/approval logic into one config-driven helper (CQ-2) | MED | M |
| 17 | Refactor 200+ line functions (CQ-3) | MED | M |
| 18 | Standardize `response_model` + error envelope (CQ-4) | MED | M |
| 19 | Add endpoint tests for uncovered modules; measure coverage (TEST-2) | MED | M–L |
| 20 | Reduce prod log level to WARNING; scrub PII from persisted AI reasoning (REL-9) | LOW | S |
| 21 | Remove dead code (TournamentOps, deprecated aliases, redundant wrapper) (CQ-5) | LOW | S |
| 22 | Wire ruff/flake8/mypy into CI (CQ-6) | LOW | S |
| 23 | Treat AI output as strictly advisory; document prompt-injection posture (SEC LOW) | LOW | S |

---

# Go / No-Go Verdict

## 🔴 NO-GO

This application **must not be deployed to production in its current state**, regardless of traffic level. The decision is driven by a small number of unconditional blockers:

**Release-blocking (must fix before any exposure to real users):**
1. **SEC-1 — No authentication/authorization.** Identity and role come from client headers and body fields; the login never checks the password. This is not a hardening gap, it is the absence of access control. Everything below SEC-1 (fund disbursement, transfers, procurement, elections, PII documents, bank ledger) is world-callable by anyone. (SEC-1..SEC-9)
2. **SEC-6 — Wildcard CORS with credentials**, which turns the header-based "auth" into something a malicious third-party page can drive.
3. **TEST-1 — The test suite writes to a live/shared (and by-default remote) database**, so there is no safe regression gate and running "the tests" is itself a production-data hazard.

**Will fail the low-latency / zero-downtime bar even after auth is fixed:**
4. **PERF-BE-1 — Zero DB indexes** (every query is a collection scan).
5. **PERF-BE-2 — LLM call inline on the request path with no timeout** (one slow upstream stalls the app).
6. **PERF-BE-3 / PERF-BE-6 — No readiness probe and a full seed on every boot**, so deploys route traffic to not-ready pods → downtime on every release.

**Also strongly recommended before launch:** REL-1/REL-2 (error boundary + surfaced API errors — otherwise users hit blank pages), REL-3 (ID race → duplicate financial identifiers), PERF-BE-5 (pagination), PERF-FE-1 (code-splitting).

### Recommended path to GO
- **Milestone 1 (blockers):** real auth + server-side RBAC on every route (SEC-1); explicit CORS (SEC-6); rate limiting on auth/AI/search (SEC-10); DB indexes (PERF-BE-1); move AI off the request path + timeout (PERF-BE-2); health/readiness endpoints and gate seeding out of prod boot (PERF-BE-3/BE-6); isolate the test DB (TEST-1). This is the minimum bar for a **conditional GO to a private beta**.
- **Milestone 2 (production-grade):** pagination + N+1 aggregation (PERF-BE-4/BE-5), atomic ID generation (REL-3), error boundary + global API error handling (REL-1/REL-2), graceful shutdown (REL-4), offload blocking PDF/xlsx (PERF-BE-7), frontend code-splitting (PERF-FE-1), secure file serving (SEC-9).
- **Milestone 3:** the MEDIUM/LOW TODO table above.

A reasonable estimate for a competent team to reach a **conditional GO** (Milestone 1) is on the order of **2–3 weeks**; full production hardening (Milestones 1–2) **4–6 weeks**.
