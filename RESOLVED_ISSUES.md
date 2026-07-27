# MPCA ERP — Resolved Issues Summary

**As of:** 2026-07-23 · Companion to [AUDIT_REPORT.md](AUDIT_REPORT.md)

Summary of every audit finding that has been **fixed and verified**. Detail and file:line references live in the main report; this is the short list with why each mattered.

**Total resolved: 20** — 4 HIGH (H3, H4, H6, H8) + all 12 MEDIUM (M1–M12). *(Still open: C1/C2/C3, H7, H9; deferred: H2; not planned: H5.)*

---

## HIGH — resolved

| # | The problem (in plain words) | What was fixed | Why it mattered |
|---|------------------------------|----------------|-----------------|
| **H3** | The database had no "index" (like a book with no table of contents), so every lookup had to read through every record. | Added 79 MongoDB indexes, ensured at startup | Every query was a full collection scan; latency would degrade as data grew — the top latency risk at 200–300 users/day. |
| **H4** | Slow jobs (generating PDFs/Excel, calling the AI) ran on the one lane that serves all users, so one slow job made everyone wait — and an AI call could hang forever. | Report rendering moved off the event loop; all LLM calls given timeouts | One slow request froze the single worker and stalled *every* concurrent user. |
| **H6** | When two people updated a bank balance or created a record at the same time, one change could silently overwrite the other, or two records could get the same reference number. | Atomic `$inc` balances + atomic sequence counters | Concurrent writes caused lost balance updates and duplicate reference numbers — direct corruption of financial records. |
| **H8** | If any single screen hit an error, the whole app went to a blank white page with no way to recover. | React ErrorBoundary + global error/rejection handlers | A single render error white-screened the entire app for the user, with no recovery. |

---

## MEDIUM — all resolved

| # | The problem (in plain words) | What was fixed | Why it mattered |
|---|------------------------------|----------------|-----------------|
| **M1** | List screens tried to load the entire table at once and quietly cut off at a fixed number, so some records simply never showed up. | `skip`/`limit` pagination on 16 list endpoints | Endpoints returned entire collections and silently truncated at fixed caps — slow reads and missing rows as data grows. |
| **M2** | The search boxes fed whatever a user typed straight into the database; a specially crafted search could make the server spin at 100% CPU. | `re.escape()` on all user search input | A crafted regex (ReDoS) could pin the CPU and take the app down — a cheap denial of service. |
| **M3** | Some "edit" screens accepted money fields without checking them, so negative or non-number amounts could be saved. | Typed, validated money PATCH bodies (`ge=0`) | Untyped bodies let negative/non-numeric amounts through, corrupting financial data. |
| **M4** | When a stored date couldn't be read, the app hid the error and left documents looking "Active" when they were actually expired. | Swallowed date-parse errors now logged | Bad data silently left KYC/compliance docs showing "Active" instead of "Expired" — a compliance risk. |
| **M5** | On every restart the app re-ran its full demo-data setup before it could serve traffic, using an outdated startup mechanism. | Migrated to `lifespan`; seeding gated behind a flag | Deprecated hooks + full re-seed on every boot added startup latency and delayed readiness on each deploy. |
| **M6** | The database driver was an old version with a known security flaw. | pymongo 4.5.0 → 4.6.3 | Closed a known BSON out-of-bounds-read CVE (PYSEC-2026-1826). |
| **M7** | A test file crashed the whole test run if one environment setting was missing. | Guarded the unbounded env read in tests | A missing env var crashed pytest collection, blocking the whole suite in CI. |
| **M8** | The production build shipped "source maps" — files that expose the app's full original source code to anyone. | `GENERATE_SOURCEMAP=false` for prod builds | Prevents shipping full readable source maps that expose the entire codebase to the public. |
| **M9** | The browser downloaded the code for all ~60 pages just to show the first screen. | Route-level code-splitting (`React.lazy`) — 444 kB → 113 kB gzip | Every user downloaded the whole app to see the landing page — slow first paint, especially on mobile. |
| **M10** | If the server was slow, the app waited a full 20 seconds and never retried a failed request. | Axios timeout lowered + retry/backoff interceptor | A 20s hang was a long user-facing stall; transient failures now recover automatically. |
| **M11** | There was no template showing which configuration values the app needs to run. | Added `.env.example` for backend + frontend | Undocumented config made correct deploys and onboarding error-prone. |
| **M12** | The "is it alive?" check always said OK even when the database was down. | `/api/health` endpoint that pings MongoDB | Without a real readiness probe, deploys route traffic to not-ready pods → errors during every release. |

---

## Overall impact

The reliability, latency, and code-quality hardening that was in scope is **done and verified** — the app is materially more robust than at the original audit (indexed queries, non-blocking request path, atomic financial writes, crash-safe and fast-loading frontend, a real health check).

**The verdict remains 🔴 NO-GO for one decisive reason: authentication (C1/C2).** Anyone who can reach the URL can still read and delete financial/PII data. That, plus the deployment items (C3, H7, H9) and the deferred dependency upgrade (H2), must close before go-live. See [AUDIT_REPORT.md](AUDIT_REPORT.md) for the remaining TODO.
