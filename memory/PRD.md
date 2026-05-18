# MPCA ERP — Product Requirements Document

> **Madhya Pradesh Cricket Association — Enterprise Resource Planning System**
> Reference plan: https://mpca-plan-updated.netlify.app/
> Started: Jan 2026 · Currently on Phase III.5 (re-architecture) · Version 3.5.0

## Original Problem Statement

User requested an ERP application for the Madhya Pradesh Cricket Association based on the system-design plan published at mpca-plan-updated.netlify.app/. The plan covers 10 core modules (M1 Player Management, M2 Tournament Management, M3 Match Officials, M4 Team Officials, M5 Finance & Compliance, M6 Infrastructure, M7-M10 HR/Compliance/Docs/Meetings), 5-tier RBAC (MPCA HQ → Division Leaders → District Officers → Field Users → External Stakeholders), 3-domain access control (Secretarial / Financial / Administration & Tournaments), full BCCI → MPCA → 10 Divisions → 54 Districts hierarchy with maker-checker workflows, AI Assistant, OCR, bilingual EN+HI, and Android+iOS mobile apps.

User preferences (locked):
- **Visual**: Indian Cricket palette — BCCI Navy `#0a1f3d` + Saffron `#ff6a13` + Marigold `#e9b949` + Maroon `#7a1f2c` + Warm Cream `#fbf7ed`. (User explicitly rejected the earlier British-pavilion green/brass palette.)
- **Org seed scale**: Full — MPCA HQ + all 10 divisions + 54 districts as per the SET-UP diagram.
- **Existing modules**: Keep all (Membership, Disclosures, Meetings, Elections, Fees, Bank, Financial Powers, Member Portal). Re-scope to State HQ + add lower-body equivalents.
- **Sequencing**: Architecture rebase + Indian theme first; Finance/Grant workflow next; Player + Tournament after.
- **AI Assistant**: Deferred to Phase V (per plan).
- **Auth**: Demo persona login for now (real auth deferred).

## Architecture

- **Frontend**: React 19 + React Router + Tailwind CSS + lucide-react. Fraunces / Inter / IBM Plex Mono. Indian palette via shared CSS custom properties.
- **Backend**: FastAPI + Motor (MongoDB async). All routes prefixed `/api`. Monolithic `server.py` (~1430 lines) pending split into routers.
- **Storage**: MongoDB collections — `bodies`, `members`, `disclosures`, `meetings`, `resolutions`, `elections`, `candidates`, `votes`, `fee_invoices`, `bank_accounts`, `bank_txns`. Auto-seeded on startup.
- **Auth (Demo)**: 6 personas in `localStorage`, each carrying `body_type` (State / Division / District / Public) and `body_code`. NOT a security boundary.

## User Personas (Demo Auth)

| ID | Role | Persona | Body Tier | Body |
|---|---|---|---|---|
| president | President | Shri Abhilash Khandekar | State | MPCA HQ |
| secretary | Hon. Secretary | Shri Sanjay Jagdale | State | MPCA HQ |
| treasurer | Hon. Treasurer | Smt. Meera Verma | State | MPCA HQ |
| division-secretary | Hon. Secretary | Shri Vikram Patil | Division | Indore Division |
| district-secretary | Hon. Secretary | Shri Anil Sharma | District | Ujjain District |
| public | Public | Guest Viewer | Public | — |

## Phase Roadmap

| Phase | Scope | Status |
|---|---|---|
| **I** | Landing · Demo Auth · Dashboard · Membership Register · Public Disclosures · Identity Card | ✅ **Complete (Jan 2026)** |
| **II** | AGM / Committee Meetings · Elections (electoral officer, tenure, cooling period) · Public Verify endpoint with QR codes on identity cards | ✅ **Complete (Jan 2026)** |
| **III** | Fees & Subscriptions ledger · Bank Operations · Financial Powers · Public Member Portal with Pay Dues + digital receipt | ✅ **Complete (Jan 2026)** |
| **III.5** | Indian Cricket UI re-skin · Multi-tenant Org Hierarchy (BCCI + MPCA + 10 Divisions + 54 Districts) · `/api/bodies` endpoints · Org Structure tree view · Body-scoped personas | ✅ **Complete (May 2026)** — 25/25 backend tests pass |
| **III.6** | District → Division → MPCA Grant Workflow · Per-body budget ledgers · Maker-checker on every transaction · Finance Claim Register · Anti-fragmentation rule | 🔴 P0 NEXT |
| IV | Player Registration · Grievance Redressal workflow | Backlog |
| V | Constitution Library (full searchable) · AI Assistant (constitution Q&A, draft notices, summarise minutes) · Analytics | Backlog |

## What's been implemented — Phase III.5 (May 2026) — Re-Architecture

### User-driven rebase
The user reviewed every tab of the reference plan and identified that the existing build was a single-tenant HQ-only ERP and the UI was "too Australian". This phase corrects both:

### Backend (`/app/backend/server.py`)
- **NEW: `bodies` collection** modelling the BCCI → MPCA → 10 Divisions → 54 Districts hierarchy. Each body has `code`, `name`, `body_type` (BCCI/State/Division/District/Club), `parent_code`, `seat`, `annual_grant_inr`, `secretary_name`, `treasurer_name`.
- **NEW: `seed_bodies()`** auto-seeds 66 bodies (1 BCCI + 1 MPCA + 10 Divisions + 54 Districts). Division grant = ₹30,000/yr; District grant = ₹1,10,000/yr. Realistic MP district names per the SET-UP diagram.
- **NEW endpoints** (all prefixed `/api`):
  - `GET /api/bodies?body_type=&parent_code=` — list / filter
  - `GET /api/bodies/tree` — nested tree starting from BCCI root
  - `GET /api/bodies/{code}` — single body
  - `GET /api/bodies/{code}/summary` — division/district counts + total annual grant to children
  - `POST /api/bodies` — create (rejects duplicate codes with 400)
- Backend version bumped to **3.5.0**.

### Frontend
- **NEW visual identity**: Indian Cricket palette (BCCI Navy `#0a1f3d` + Saffron `#ff6a13` + Marigold `#e9b949` + Maroon `#7a1f2c` + Warm Cream `#fbf7ed`). Implemented as **CSS-variable remap** — every existing page automatically inherits the new theme without touching component code. Tailwind `mpca-*` tokens now resolve to the Indian palette. Khadi-weave background. Saffron selection highlight. Hindi motto "खेल भावना से, राष्ट्र सम्मान से" replaces the prior Latin tag-line.
- **NEW route**: `/org` — `OrgStructure.jsx` — interactive expandable tree (iterative flatten, not recursive — avoided Babel `Maximum call stack` issue) showing all 66 bodies with grant amounts and tier badges.
- **NEW personas** (6 total): President / Hon. Secretary / Hon. Treasurer (State tier) · Division Secretary (Indore) · District Secretary (Ujjain) · Public. Each carries `body_type`, `body_code`, `body_name`.
- **Login page rebuilt** with tricolour stripe atop every persona card + tier icon (Landmark/Building2/MapPin/ShieldCheck) + body chip.
- **Landing rebuilt** — copy now reads "From Holkar to every maidan of Madhya Pradesh"; stats: 10 Divisions · 54 Districts · 10 Core Modules.
- **AppLayout** — saffron underline beneath brand, body-aware "Signed In As" card showing tier + body name, new "Org Structure" nav item, roadmap section listing Grant Workflow / Player Module / Tournament Module / AI Assistant.
- **Dashboard** — new "Organisational Footprint" maroon band ("10 Divisions · 54 Districts"), tier-aware persona greeting, phase tags on stat tiles.

### Testing (Phase III.5)
- Backend: 25/25 pytest tests passing (`/app/backend/tests/test_phase3_5_api.py`). Validates body counts, tree shape, summary aggregates, duplicate rejection, 404 handling, and regression of every Phase I-III endpoint.
- Frontend: Smoke-tested visually — Landing, Login (6 persona cards), Dashboard (with tier chip), Org Structure tree all render correctly in Indian palette.

### What is still NOT done (Phase III.6 P0)
- `body_id` field is NOT yet enforced on members/fees/meetings/bank — they remain implicitly MPCA-HQ-scoped. Tagging is the very next task.
- Grant workflow (District claim → Division recommendation → MPCA Treasurer sanction → MC resolution) — not yet built.
- Per-body bank ledgers — not yet built.
- Maker-checker `approval_chain` JSONB on transactions — not yet built.

## What's been implemented — Phase III (Jan 2026) (Jan 2026)

### Backend (additions to `/app/backend/server.py`)
- **Fees & Subscriptions**: `GET/POST /api/fees`, `POST /api/fees/generate?cycle=…` (idempotent bulk-generate), `POST /api/fees/{id}/pay` (MOCKED payment — returns receipt_no), `GET /api/fees/{id}`. Auto-flags Overdue on read (no DB mutation). Auto-numbered `MPCA-FEE-YYYY-NNNN`.
- **Bank Operations**: `GET/POST /api/bank/accounts`, `GET /api/bank/accounts/{id}`, `GET/POST /api/bank/transactions`. Transactions auto-update `current_balance` and record `balance_after`.
- **Financial Powers**: `GET /api/financial-powers` — constitutional reference (6 posts: President, Hon. Secretary, Hon. Treasurer, Joint Secretary, Managing Committee Resolution, AGM Resolution).
- **Public Member Portal**: `GET /api/member-profile/{uid}` — minimal public profile + outstanding invoices + total_outstanding (sums Pending/Overdue).
- Dashboard stats now derive `fee_collection_pct`, `total_invoices`, `paid_invoices`, `total_bank_balance` from live data.
- Seeds 4 invoices (2 paid, 2 overdue) + 2 bank accounts (₹2.14Cr balance) + 5 sample transactions.

### Frontend
- `/fees` — ledger with 4 summary tiles (Collected, Outstanding, Total, Collection %), status filter, "Generate Cycle 2025-26" button, "Mark Paid" action per row
- `/bank` — total balance hero, account cards, recent transactions across accounts
- `/bank/:id` — account detail with full ledger + "Record Transaction" form (live balance update)
- `/financial-powers` — formal schedule of constitutional powers
- `/member-profile/:uid` — **PUBLIC** member portal: outstanding dues card, Pay Now per invoice → receipt modal with **printable digital receipt** (MOCK-PAY ref), payment history
- Member Detail page → new "Member Portal" link to send members their portal URL
- Sidebar: Phase III modules promoted to PRIMARY_NAV (header: "Phases I — III — Live")
- Dashboard: new Bank Balance card with "View Accounts" CTA

### Testing (Phase III)
- Backend: 19/19 pytest tests passing (fees CRUD + generate idempotency + pay flow; bank CRUD + transaction balance integrity; financial-powers; member-profile public; updated dashboard stats)
- Frontend: 100% — all 6 new screens + dashboard updates + public member portal verified

### MOCKED
- Payment gateway in `/api/fees/{id}/pay` — generates a `MOCK-PAY-XXX` reference. Real Stripe/Razorpay/UPI integration deferred.

## What's been implemented — Phase II (Jan 2026)

### Backend (additions to `/app/backend/server.py`)
- **Meetings**: `GET/POST /api/meetings`, `GET/PATCH/DELETE /api/meetings/{id}`, `GET/POST /api/meetings/{id}/resolutions`. Auto-generated `meeting_no` (e.g. `AGM-2026-001`, `MC-2026-001`).
- **Elections**: `GET/POST /api/elections`, `GET/PATCH /api/elections/{id}`, `GET/POST /api/elections/{id}/candidates`, `POST /api/elections/{id}/vote` (validates active voter + duplicate prevention), `POST /api/elections/{id}/conclude` (marks winner + losers).
- **Public Verify**: `GET /api/verify/{uid}` — returns minimal verifiable info (no auth required).
- Dashboard stats now report real `upcoming_meetings` and `elections_open` counts.
- Seeds 3 meetings + 1 active election + 2 candidates on startup.

### Frontend
- `/meetings` — ledger with type filter (AGM/SGM/Committee/Sub-Committee)
- `/meetings/:id` — agenda, quorum tracker, status workflow (Scheduled → Notice_Issued → In_Progress → Concluded), resolution recording
- `/meetings/new` — dynamic agenda builder
- `/elections` — list with status pills
- `/elections/:id` — candidates with live vote bars, voter UID-based voting, conclude/declare workflow with gold-bordered winner
- `/elections/new` — announcement form
- `/verify/:uid` — **PUBLIC** route, no auth — green-bordered valid card or red-bordered invalid card
- Member identity card (`/members/:id/card`) now displays a QR code (via `api.qrserver.com`) encoding the public `/verify/:uid` URL
- Sidebar: Meetings + Elections promoted to PRIMARY_NAV (Phases I & II — Live)

### Testing (Phase II)
- Backend: 19/19 pytest tests passing
- Frontend: 8/10 critical flows directly verified; remaining 2 are correctly wired (verified via code review)

## What's been implemented — Phase I (Jan 2026)

### NEW: Member Identity Card Generator (Jan 2026)
- `/members/:id/card` — ID-1 ratio printable card (front + back).
- Front: MPCA pitch-green band, emblem, photo (or initials), name, UID, category, enrolled date, validity, motto ribbon.
- Back: Issued by Managing Committee, terms-of-use, member signature line, barcode strip generated from UID, issued date, Hon. Secretary label, Holkar Stadium address.
- "Print · Save as PDF" button uses native `window.print()` with `@media print { @page { size: A4 } }` rules. Sidebar + toolbar hidden in print.
- Reachable from MemberDetail via "View Identity Card" button.
- Frontend: 13/13 tests pass.

### Backend (`/app/backend/server.py`)
- `GET /api/` — version probe
- `GET /api/dashboard/stats` — totals, by-category, placeholders for Phase 2-4 metrics
- `GET /api/members` — list + `?category=` + `?search=` filters
- `GET /api/members/{id}`, `POST /api/members`, `PATCH /api/members/{id}`, `DELETE /api/members/{id}`
- Member model carries all constitutional fields: UID (auto, `MPCA-{IND|INS|HON|PAT}-NNNN`), name, address, contact, eligibility, fee structure, photo/signature URLs, approving authority, representative (institutional), status, loss reason, transferred-to, notes.
- `GET /api/disclosures` + `?disclosure_type=`, `POST /api/disclosures`, `GET /api/disclosures/{id}`
- Disclosure types: AGM_Notice, Committee_Minutes, GBM_Minutes, Audited_Accounts, Selection_Announcement, Circular.
- Auto-seeds 7 members + 5 disclosures on startup.

### Frontend
- `/` Landing — heritage hero, MPCA emblem (custom SVG with stumps/bails/ball), pillars grid, quote, footer.
- `/login` — 6 persona cards rendered as "blazer pockets" with pitch-green/wood textures and brass tacks.
- `/dashboard` — Stats tiles, category breakdown bars, recent members, recent disclosures, Phase 2-5 roadmap teaser.
- `/members` — Ledger-style table with category filters and search.
- `/members/:id` — Formal certificate-style detail page with brass corners.
- `/members/new` — Multi-section enrolment form (constitution-grade fields).
- `/disclosures` — Public bulletin grouped by year, with type filter chips. Also `/disclosures-public` (no auth).
- `AppLayout` — pitch-green sidebar with Phase 1 nav active, Phase 2-5 nav greyed out, persona card, sign-out.

### Testing
- Backend: 13/13 pytest tests passing.
- Frontend: 28/29 functional E2E checks passing (1 timing flake, no app bugs).

## Known Tech-Debt / Notes for next phases

- `dashboard/stats` placeholders (upcoming_meetings, pending_grievances, fee_collection_pct) — replace with real counts in P2/P3/P4.
- `next_uid` uses `count_documents` — not concurrency-safe. Migrate to a counters collection with `findOneAndUpdate $inc` before scaling.
- FastAPI `@app.on_event('startup')` is deprecated — migrate to lifespan in next major refactor.
- `PATCH /api/members/{id}` accepts the full `MemberCreate` schema. For true partial updates introduce a `MemberUpdate` schema with all-Optional fields.
- Frontend auth is `localStorage`-only — replace with real Gmail/OAuth + JWT in Phase 2.

## Next Action Items (P0 → P2)

### 🔴 P0 — Phase III.6 (Finance & Grant Workflow)
1. Add `body_id` to every existing record (members, fees, meetings, bank, etc.). Default existing rows to `MPCA`. Scope all read queries by persona's body.
2. **Grant Request Workflow** — `claims` collection with stages: District submits → Division Sec recommends → MPCA Treasurer sanctions → MC Resolution → Disbursement. `approval_chain` JSONB on every record.
3. **Per-body budget ledger** — annual grant budget + actual spend visualisation.
4. **Anti-fragmentation rule** — block multiple sub-threshold claims that cumulatively exceed sanctioning authority.

### 🟠 P1 — Phase IV
5. **Player Management (M1)** — registration portal, Local-MP / Out-of-MP / Guest eligibility validator, unique Player ID generator (`yr/dd-mm-yy/serial`), transfer NOC workflow, BCCI sync stub.
6. **Tournament Management (M2)** — seed all 10 inter-divisional tournaments (MY Memorial, Madhavrao Scindia, JN Bhaya, Parmanandbhai Patel, Hiralal Gaekwad, SM Khan, MM Jagdale, AW Kanmadikar, JS Anand) + 5 championship trophies. Squad assignment + placard generation + fixture/results module.
7. **Match Officials (M3)** + **Team Officials (M4)** registries with renewal cycles.
8. **Grievance Redressal** workflow.

### 🟡 P2 — Phase V
9. **AI Assistant** — Claude Sonnet via Emergent LLM key. Constitution Q&A, claim-status queries, compliance reminders.
10. **Real Auth** — Emergent-managed Google OAuth replacing demo personas; MFA + RBAC enforcement.
11. **Real Payment Gateway** — Stripe/Razorpay UPI (test keys already in env).
12. **Constitution Library** — full searchable text + amendment history.
13. **Audit Log** — every register write traced.

### 🛠️ Refactoring / Tech-debt
- Split `server.py` (now 1430 lines) into `/app/backend/routes/{bodies,members,meetings,...}.py`.
- `next_uid` → counters collection with `findOneAndUpdate $inc` (concurrency-safe).
- MongoDB indices on `bodies.code`, `bodies.parent_code`, `members.uid`, `fee_invoices.member_uid`.
- FastAPI `on_event` → lifespan migration.
- Frontend `localStorage` auth → real OAuth in P2.
- Bilingual EN+HI toggle.
- Local QR code generation (replace remote dep).
- File uploads (photo, signature) instead of URLs.

## Future / Backlog (deferred or out-of-scope on Emergent web stack)

- React Native mobile apps (Android + iOS) — separate native dev cycle
- Offline-first mode (mobile)
- OCR / handwriting digitisation (Google Vision)
- Google Calendar / Gmail integration for AGM notice mailing
- BCCI HQ Federation API sync (player registration, age verification)
- Elasticsearch for global search across modules
- ABC analysis dashboard for procurement spend
- Predictive renewal-risk model
