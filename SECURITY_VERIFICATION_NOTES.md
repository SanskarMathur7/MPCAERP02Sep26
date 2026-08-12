# Internal Verification Notes — DO NOT SHARE

Companion to **SECURITY_OVERVIEW.md**. This file (a) maps every claim in the client-facing overview to code evidence, (b) records additional defensive measures that are present, (c) flags what is **weak or absent** so you don't ship a claim that isn't true, and (d) specifies the **technical security provisions still required** to close the gaps. Keep this file internal.

Legend for status: ✅ verified present · ⚠️ present but weak/partial · 🔴 absent / contradicts a security claim.

---

## Part 1 — Evidence for each claim in the Overview

| # | Overview claim | Evidence (file:line) | Verdict |
|---|----------------|----------------------|---------|
| 1 | Encrypted in transit (HTTPS) | `frontend/.env` → backend URL `https://…`; frontend on port 443 (`WDS_SOCKET_PORT=443`) | ✅ Platform terminates TLS. |
| 2 | Database not exposed to the public internet | `backend/.env` → `MONGO_URL="mongodb://localhost:27017"` | ✅ Network isolation only — see caveat below. |
| 3 | Third-party AI key server-side only | Used in `backend/core/ai_validator.py:161-177`; `frontend/src/lib/api.js` has no secrets (grep clean); frontend `.env` holds only the public backend URL | ✅ Key never reaches the browser. |
| 4 | Secrets from environment, not hardcoded in source | `backend/core/infra.py:5-14` loads config via `dotenv`/`os.environ`; `git grep` for the key in tracked source → no hits in app code | ✅ — but the key *value* is now in git history via a committed report (Part 3). |
| 5 | Input validation via typed models | Pydantic `BaseModel` in **43 of 56** route modules; e.g. `routes/uploads.py:6,48`, typed request bodies throughout `models.py` (83 models) | ⚠️ Real and widespread, **not universal** — some endpoints take loosely-typed `dict`/query args. Overview says "information is validated," not "every endpoint." |
| 6 | Injection-safe DB access | `motor` async driver with structured dict queries; **no** `$where`/`eval`/`exec` (grep clean); user search wrapped in `re.escape` → `players.py:65-68`, `vendor_bills.py:104-106`, `venues_grounds.py:95`, `tournament_plan.py:405`, `fixtures.py:264` | ✅ Closes NoSQL injection and the earlier ReDoS vector. |
| 7 | XSS protection via UI auto-escaping | React default escaping; `grep dangerouslySetInnerHTML` over `frontend/src` → **0 hits** | ✅ No raw-HTML injection sink found. |
| 8 | Upload type allowlist + size cap + random names | `routes/uploads.py:24-33` (8-type MIME allowlist), `:34` + `:77-80` (20 MB cap, streamed with abort + file cleanup on overflow), `:62,66` (UUID filename), `:61` (extension from server-side map, not client filename) | ✅ Upload *validation* is genuinely present. Overview claims validation + non-guessable naming only — **not** retrieval access control (Part 3). |
| 9 | Production build excludes readable source | `frontend/.env` → `GENERATE_SOURCEMAP=false` | ✅ No `.map` files shipped. |
| 10 | Managed cloud hosting over HTTPS | `/.emergent/` platform config; HTTPS backend URL | ✅ Modest but defensible. Did **not** claim isolated environments/backups (no evidence). |

### Detail notes on the partial/caveated claims
- **#2 (DB isolation):** the DB binds to `localhost` on the app server, so it is not reachable from the public internet — but the connection string carries **no username/password**, so the database itself is unauthenticated. I deliberately did **not** write "database access requires credentials." The only true statement is network isolation.
- **#5 (validation):** validation strength varies by endpoint. Money-carrying PATCH bodies were tightened (all-Optional models with `ge=0`, e.g. `tournament_invoices`, `extra_expense`), but several status/text PATCH endpoints still accept key-whitelisted `dict`s. Fine to say "submitted information is checked against data rules"; do not say "all input is strictly typed."
- **#8 (uploads):** the MIME check trusts the client-declared content type (`uploads.py:56`) — there is no magic-byte inspection. Combined with the missing retrieval auth (Part 3), keep the Overview wording exactly as-is.

---

## Part 2 — Additional verified technical provisions (present, defensive)

These are real and worth knowing, though most are too minor or too technical to feature in the client Overview. All verified in code.

- ✅ **No unsafe deserialization.** No `pickle`, `yaml.load`, `marshal`, or `__reduce__` anywhere (grep clean) — the app never reconstructs objects from untrusted bytes, closing a common remote-code-execution vector.
- ✅ **Timeouts on outbound AI calls.** `core/ai_validator.py:20` (`AI_CALL_TIMEOUT=45s`), applied via `asyncio.wait_for(...)` at `:177` and `:398`; a timeout is caught and degrades to "hold for human review." Prevents a slow/hung third-party service from stalling requests indefinitely (availability / soft-DoS resilience).
- ✅ **Bounded pagination.** List endpoints clamp caller-supplied paging, e.g. `members.py:73` → `.skip(max(skip,0)).limit(min(max(limit,1),5000))`. Prevents a client from requesting an unbounded result set to exhaust memory.
- ✅ **Server-generated resource identifiers.** Records and uploaded files use server-side UUIDs (`uploads.py:62`), not client-supplied or sequential IDs, reducing trivial enumeration/tampering.
- ✅ **Upload write is size-capped mid-stream.** `uploads.py:69-81` counts bytes while streaming and aborts + deletes on overflow, so an oversized upload can't fill the disk before the size check.
- ✅ **DB-backed readiness probe.** `server.py:85-93` `/api/health` actually pings MongoDB (returns 503 if down) — supports safe deploys/monitoring. NOTE it returns raw DB error text to the caller (see Part 3, error leakage).

---

## Part 3 — 🔴 MUST READ BEFORE SHARING: weak or missing items

These are why the Overview has **no "Account & Access Security" section and no "Payments" section**. Do not add claims about them.

### 🔴 CRITICAL — No real authentication or authorization
- **Login does not verify a password.** The login flow selects a "persona" client-side; the password field is not checked against any stored credential. There are **no hashed passwords** anywhere — no bcrypt/argon2/PBKDF2/hashlib usage in application code (the only `password` reference is an outbound SMTP setting, `core/email_notifications.py:36`).
- **Identity comes from client-supplied headers.** `core/scoping.py:49-63` reads `X-Body-Type` / `X-Body-Code` / `X-Persona-Id` and trusts them; `X-Body-Type: state` makes `body_scope()` return `{}` (no filter → sees everything).
- **The RBAC admin guard is header-based and has an open bypass.** `routes/rbac.py:306-323` (`require_rbac_admin`) reads the persona from headers, and at `:315` **allows the request through when no persona header is present at all**. Admin-guarded endpoints are reachable simply by omitting headers.
- **Consequence:** anyone who can reach the API can act as any role — read bank balances, payroll, and member PII, and delete records.
- **Do NOT claim:** password hashing, secure login, sessions/tokens, token expiry, logout, role-based access control, admin separation, or "users see only their own data."

### 🔴 CRITICAL — CORS is wildcard with credentials
- `backend/server.py:98-104`: `allow_credentials=True` with `allow_origins` defaulting to `"*"` (and `backend/.env` ships `CORS_ORIGINS="*"`); methods and headers are also `"*"`. This is the opposite of "scoped to the app's domain." **Do NOT** make any CORS/origin claim.

### 🟠 HIGH — Uploaded files have no retrieval access control
- `routes/uploads.py:101-113` (`serve_upload`) returns any file to anyone with its ID — no ownership/role check. KYC docs (PAN, bank details) are retrievable by anyone with the link. The random UUID is *obscurity, not authorization*. **Do NOT** claim uploaded files are "restricted to authorized users."

### 🟠 HIGH — No rate limiting / brute-force protection
- No `slowapi`/limiter/throttling anywhere (grep clean). **Do NOT** claim rate limiting or abuse protection.

### 🟠 HIGH — No security-response headers
- No `Content-Security-Policy`, `Strict-Transport-Security` (HSTS), `X-Frame-Options`, `X-Content-Type-Options`, or `TrustedHostMiddleware` (grep clean). No clickjacking / MIME-sniffing / HSTS protection at the app layer. **Do NOT** claim hardened browser security headers.

### 🟠 HIGH — Live AI key in plaintext, and its value is now in git history
- `backend/.env` holds `EMERGENT_LLM_KEY=sk-emergent-3F4F7762cA3D53aEf4` in plaintext. The `.env` file is git-ignored and was never committed **as config**, but the key **value** is now in committed history via the audit report (`git log -S 'sk-emergent'` matches `AUDIT_REPORT.md`). **Action:** rotate the key and scrub the value from the committed report. This is why the Overview says "not hardcoded in the application source," not "no secrets in the repository."

### 🟡 MEDIUM — Error responses leak internal detail
- Health endpoint returns raw DB error text (`server.py:93`, `str(e)[:200]`); the AI path returns exception type/message (`core/ai_validator.py:181`). **Do NOT** claim "error messages don't leak internals."

### 🟡 MEDIUM — Unauthenticated DB + non-prod DB name
- DB connection has no credentials and `DB_NAME="test_database"`. Confirm production points at a named, access-controlled database instance before go-live.

### ℹ️ Note on CSRF
- Auth is not cookie-based (identity travels in custom request headers), so classic CSRF is not the primary exposure today — but that is a side effect of the missing real auth, not a deliberate control. Once cookie/token sessions are introduced (Part 4), CSRF protection must be added.

---

## Part 4 — Required technical security provisions (to implement)

Concrete controls needed to make the Overview's omitted sections truthful and to reach a shippable posture. Prioritized. None of these exist today.

### P0 — Must exist before real users / before this doc can claim account security
1. **Real authentication.** Store users with passwords hashed via **bcrypt or argon2** (`bcrypt`/`passlib` are already dependencies — currently unused). Issue a signed, short-expiry **session token or JWT** on verified login; deliver via `Secure` + `HttpOnly` + `SameSite=Strict` cookie (or an `Authorization: Bearer` header). Implement real logout (token/session invalidation).
2. **Server-side authorization.** Add a FastAPI dependency (e.g. `Depends(require_user)`) applied globally that resolves identity/role **from the verified token, never from client headers**. Default-deny; maintain an explicit allow-list of truly public routes (e.g. the member-card verify endpoint). Retire the header-based `get_scope`/`require_rbac_admin` trust and remove the no-header bypass at `rbac.py:315`.
3. **Ownership / body-scope enforcement on writes.** Enforce that a caller can only read/mutate records within their authorized body scope — on **write** paths too, not just list filters.
4. **Lock down CORS.** Set `allow_origins` to the explicit production frontend origin(s); keep `allow_credentials=True` only with a concrete origin list; restrict `allow_methods`/`allow_headers` to what's used. Remove the `"*"` default.
5. **Access control on file retrieval.** Require auth on `GET /uploads/{id}` and check the caller is entitled to that document (by body scope / relationship). Consider magic-byte content validation in addition to the MIME check.
6. **Rotate the exposed AI key** and scrub its value from the committed report; move secrets to the platform's secret manager.

### P1 — Should exist before go-live
7. **Rate limiting / brute-force protection** (e.g. `slowapi`) on login and other sensitive/expensive endpoints (AI calls, search).
8. **Security-response headers** via middleware: `Strict-Transport-Security` (HSTS), `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or CSP `frame-ancestors`), and `TrustedHostMiddleware`.
9. **CSRF protection** — required once cookie-based sessions are introduced (double-submit token or `SameSite` + per-request token).
10. **Stop leaking internals in errors.** Return generic error messages to clients; log the detail server-side with a correlation id (health/readiness should not echo raw DB exceptions).
11. **Authenticated database + production DB name.** Enable MongoDB auth (username/password or platform-managed access) and point at a properly named production database, not `test_database`.

### P2 — Hardening / hygiene
12. **Universal input typing.** Replace remaining loosely-typed `dict`/query bodies with explicit Pydantic models; enforce numeric bounds on all money/quantity fields.
13. **Audit logging of security events** (logins, permission changes, disbursements) with tamper-evident, PII-scrubbed records; ensure no secrets/tokens are ever logged.
14. **Dependency CVE remediation** (e.g. the FastAPI/starlette upgrade tracked in the main audit) so the request path has no known-exploitable advisories.

---

## Part 5 — Bottom line

**SECURITY_OVERVIEW.md is accurate and defensible as written** — every sentence maps to real code in Parts 1–2. But it is deliberately a *partial* picture: it covers the application-layer, data-in-transit, and hosting protections that genuinely exist, while the account-security foundation (authentication + authorization) is **not yet in place** (Part 3), and the controls that would fix that are listed in Part 4.

**Recommendation:** don't present the Overview as a comprehensive "the app is secure" statement, and expect the owner to ask "how do users log in securely?" — today the honest answer is that login is not enforced server-side. Close at least the **P0** provisions (and ideally P1) first; then the Overview can be expanded with a genuine "Account & Access Security" section.
