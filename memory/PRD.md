# MPCA ERP — Product Requirements Document

> **Madhya Pradesh Cricket Association — Enterprise Resource Planning System**
> Reference plan: https://mpca-plan-updated.netlify.app/
> Started: Jan 2026 · Last update: Feb 2026 — UI Content Audit + Switch Persona pill + dual-mode coin loader

## Recent Changelog
- **Feb 2026 — Sprint M6 · Membership Register Upgrade**: Membership module now supports the full MPCA general-body + Division-linked membership model. New fields on `Member`: `member_type` (MPCA | Division), `division_body_id`, `role`, `membership_id`, `updated_at`, `updated_by`. New dynamic `member_categories` collection (7 seeded: Life Member, Annual Member, Office Bearer, District Association, School/Institution, Honorary Member, Patron) with full CRUD gated to office bearers. **CSV Bulk-upload utility** at `POST /api/members/bulk-upload` with column aliasing (mobile→phone, designation→role, joined→membership_date, member_category→sub_category), dry-run mode, and detailed per-row error reporting. Template download at `GET /api/members/bulk-upload/template`. New aggregate endpoint `GET /api/members/stats`. **RBAC-editable member profiles**: office bearers may edit any member; a member may edit only their own record (matched by X-User-Email vs member.email). Frontend axios interceptor auto-attaches `X-Role-Id` and `X-User-Email` from `localStorage.mpca_persona`. New pages: `/members/categories` (CRUD for categories with active toggle, applies-to filter, base-category anchoring, fee amount, display order), inline-edit mode on `MemberDetail` with bearer-only fields (category, status), and a **Bulk Upload modal** with dry-run + real-upload paths, downloadable template button, and full row-level error viewer. `Members` list gained a stats strip (Total / MPCA / Division / Active), Type filter chips (MPCA/Division), sub-category dropdown, and search that now includes role + membership_id. **15/15 backend + frontend tests pass.** Categories are dynamic — office bearers manage them via UI without a code change.

- **Feb 2026 — Phase D · Player Selection Funnel (MoM 6)**: Annual seasonal player re-registration + a 4-stage selection funnel per (tournament × format). **Funnel pipeline:** LongList(≤150) → ShortList(≤30) → Pool(≤20) → Squad(≤12) → Submitted-to-BCCI. Stage caps enforced. **International tournament workflow**: Division Sec recommends squad → MPCA President validates → BCCI App submission (placeholder until BCCI integration ships — auto-stamps a `BCCI-PENDING-…` reference). Selectors add/remove players at the current stage; "Advance" promotes a subset to next stage. New endpoints: `GET/POST /api/season-registrations`, `POST /api/season-registrations/{id}/{approve,reject}`, `GET/POST/DELETE /api/selection-funnels`, `POST /api/selection-funnels/{id}/{add-players,remove-player,advance,division-recommend,mpca-validate,submit-to-bcci}`, `GET /api/selection-funnels-stats/summary`. Frontend page `/selection` shows funnel pipeline bar with per-stage live counts vs caps, persona-gated action buttons (Add Players · Advance · Division-Recommend · MPCA-Validate · BCCI-Submit), and an inline "International Squad Workflow" tracker. Seeded: all 7 existing players auto-registered for 2025-26, 1 domestic funnel at Pool stage, 1 international funnel ready for division recommendation. Workflow guards: must be at Squad to division-recommend, division must recommend before MPCA validation, exactly 12 players required for BCCI submission, international squads cannot skip MPCA validation. **Zero regression to 19+ existing endpoints across Phases A/B/C.**
- **Feb 2026 — Phase C · Venue + Ground Master + Ground Expenses (MoM 3+4)**: Three new lightweight modules. **Venues**: BCCI-categorised master (Intl / Domestic-A / Domestic-B / MPCA-State / Divisional / District / Private) with `bcci_calendar_eligible` flag, capacity, floodlights, address. **Grounds**: per-venue playable fields (Main/Practice/Net Practice) with pitch type, boundaries, **suitable_formats** from a new 12-format MoM taxonomy (FourDay/OneDay/T20 × Senior/U23/U19/Womens + U16 League), and an embedded **Ground Staff Salary Register** with per-ground monthly+annual payroll roll-up. **Ground Expenses**: sub-ledger with 7 expense types (Staff_Salary / Pitch_Maintenance / Equipment_Repair / Water_Electricity / Cleaning / Security / Misc) and 4-stage workflow (Draft → Submitted → Approved → Paid / Rejected). New endpoints: `GET/POST/PATCH/DELETE /api/venues`, `GET/POST/PATCH/DELETE /api/grounds`, `POST/DELETE /api/grounds/{gid}/staff[/{sid}]`, `GET /api/grounds/{gid}/payroll-summary`, `GET/POST/DELETE /api/ground-expenses`, `POST /api/ground-expenses/{id}/{submit,approve,reject}`, `GET /api/ground-expenses-stats/summary`. Frontend page `/venues` with 3 tabs (Venues / Grounds / Expenses), inline ground-staff CRUD, payroll calculation, and expense workflow. Seeded: 5 venues (Holkar, Capt Roop Singh, Aishbagh, MPCA Academy, Jabalpur) + 7 grounds (with 13 ground-staff across them) + 4 ground expenses (Paid/Approved/Submitted/Draft). Delete guards fire on venue-with-grounds and ground-with-expenses. Zero regression to existing 8 modules (claims, tournament-budgets, vendor-bills, procurement, bodies, tournaments, players, fairplay).
- **Feb 2026 — Phase B · Enhanced Claim Paths + Summary Form + 2-day TAT (MoM 2 + 5 + 9)**: Claims module now supports TWO PATHS: `As_per_Budget` (must link to an Approved Tournament Budget with itemised Travel/Hotel/Road/TA-DA sub-bills) vs `Bulk_Budget` (off-envelope ad-hoc). Excess detection: when sub-bills exceed an approved head limit, claim is auto-flagged `is_excess=true` with full `excess_heads` breakdown for the Excess Sanction workflow. **5 new MoM grant categories**: Admin_Grant, Coaching_Grant, Tournament_Funding (1:1 matched), District_Travel, MRA_Management. **SLA TAT updated to 2 days (48h)** uniformly across all stages per MoM agreement. Frontend ClaimNew rebuilt with path-picker, TB selector showing live approved head limits, sub-bill grid with per-row excess warning, and a clear "Excess Sanction Flag" banner. Claims list now shows path pills (`As-per-Budget` navy / `Bulk` saffron) + `⚠ Excess` oxblood pill. Claim detail drawer shows a Summary Form sub-bills table + per-head excess breakdown banner. Test suite scaffolded at `/app/backend/tests/test_phase_b_claims.py`.
- **Feb 2026 — Phase A · Tournament Auto-Budget (MoM Item 1)**: New module per the 1st-June MoM "Auto Budget" requirement. Each Division can propose a per-tournament budget envelope with: (a) **Total Ceiling** fixed cap, (b) **Head-Under sub-limits** across 8 cricket-finance heads (Travel, Hotel, Road BLP+Lunch+Rain, TA/DA, Match Officials, Equipment, Ground Expenses, Misc), (c) **Variable line items** each individually approvable by MPCA. Workflow: Draft → Submitted → (Approved with revised totals / Returned with reason code / Rejected). MPCA Treasurer can approve a lower total + revised head limits at sanction. New endpoints: `GET/POST/PATCH/DELETE /api/tournament-budgets`, `POST /api/tournament-budgets/{id}/{submit,approve,return,reject}`, `POST /api/tournament-budgets/{id}/variables`, `POST /api/tournament-budgets/{id}/variables/{iid}/decide`, `GET /api/tournament-budgets-stats/summary`. Frontend page `/tournament-budgets` with propose-budget dialog, head-limit allocation matrix, approval dialog supporting revised total + per-head overrides, and inline variable item add/decide. 4 budgets seeded (Approved/Submitted/Returned/Draft) across 4 divisions. **36/37 backend tests pass + 0 frontend issues + 0 regressions** (the 1 failure was a test-side endpoint typo). Unblocks Phases B/C/D since claims must now match an approved tournament budget.
- **Feb 2026 — F6a · Vendor Master + Vendor Bills (NEW)**: Added a full vendor empanelment + bill processing workflow. Vendor Master tracks 8 vendor categories (Hotel · Travel · Material · Infra · Catering · Printing · Services · Other) with GSTIN/PAN/bank/blacklist fields. Vendor Bills follow a 4-stage workflow: **Submitted → Verified (Accounts) → Sanctioned (Treasurer) → Paid (Treasurer auto-books Debit on the chosen bank account)**. Plus structured return reasons (6-code taxonomy) and an explicit blacklist guard that blocks new bills against blacklisted vendors. New endpoints: `GET/POST/PATCH/DELETE /api/vendors`, `POST /api/vendors/{id}/blacklist`, `POST /api/vendors/{id}/un-blacklist`, `GET/POST/DELETE /api/vendor-bills`, `POST /api/vendor-bills/{id}/{submit,verify,sanction,pay,reject,return}`, `GET /api/vendor-bills-stats/summary`. Frontend: new `/vendors` page (empanelled directory with category filter, search, blacklist toggle) and `/vendor-bills` page (4-stage workflow UI with action buttons gated by persona, expandable rows showing GST/TDS/approval trail/return reasons). 8 vendors + 5 bills (covering all status states) seeded. 44/44 backend tests passing.
- **Feb 2026 — Backend modular refactor**: `server.py` shrank from **4,822 lines → 48 lines** (a thin orchestrator). Codebase now organised as `/app/backend/models.py`, `/app/backend/seed.py`, `/app/backend/core/{infra,helpers,ai_validator,pdf_generator}.py`, and `/app/backend/routes/*.py` (one module per domain: members, disclosures, dashboard, meetings, elections, verify, fees, bank, financial_powers, bodies, claims, budgets, procurement, players, transfers, tournaments, notifications, uploads, ai_claims, rulebook, vendor_bills). All 20+ route modules register handlers on a shared `api_router` from `core/infra.py`. Zero API contract changes — fully backward-compatible. Unblocks future Vendor Bills + JV/PV + Match Officials modules without bloating the monolith.
- **Feb 2026 — Meeting Agenda Part 4C (Information Required from MPCA Team)**: Added a 13-row table to `MPCA_MEETING_AGENDA.md` capturing the 13 outstanding asks from MPCA (Player selection process, Excel pointers, Manual functions/registers, RBAC member list, Updated grant scheme, Player DB, Academy concept, Scoring tool API, TATs, Techno-commercial process, Min. grant requirements, Dashboard needs per role, BCCI-claimable expense list) each mapped to the ERP module it feeds + owner + status. Also added "Documentation to be Prepared" section for the NDA. Auto-rendered in the PDF (still inline-viewable in browser).
- **Feb 2026 — Fairplay Index (renamed from Division Performance)**: The leaderboard metric is now branded **Fairplay** — a composite organisational-health score across **Financial** (grant utilization · overdue · AI reject rate), **Corporate Governance** (AGM cadence · elections · disclosures · active members), and a **forthcoming Player Performance axis** that will light up when M3/M4/Players modules ship and inform selection recommendations. Endpoint renamed to `GET /api/dashboard/fairplay-rankings` (old `/division-performance` kept as alias). Each row now shows 3-column axis grid with the Player column dimmed and tooltipped. Right-side score label renamed "Total" → "Fairplay".
- **Feb 2026 — Division Performance Leaderboard**: State-persona dashboard now shows ranked "Top 3 · Best Performing" + "Needs Attention · Bottom 3" cards. Transparent dual-axis scoring: **Financial** (grant utilization sweet-spot 60-90% · overdue penalty · AI reject rate) + **Corporate Governance** (AGM in last 18 months · election in last 5 years · disclosures this cycle · active members ≥ 25). New backend `GET /api/dashboard/division-performance` returns all 10 divisions ranked with full component breakdown. Frontend: green/oxblood progress bars per axis, rank chips, methodology copy under the section header. Verified live with President persona: Jabalpur Division ranks #1 (only division with disbursed claims), Indore ranks #10 (the only one with an overdue claim).
- **Feb 2026 — Dashboard re-architected · Persona-aware ERP drill-down**: Scrapped the newsletter-style dashboard for a proper hierarchical command-centre view. **State persona (President/Secretary/Treasurer)** now sees 10 clickable Division cards with per-division KPIs (Members · Pending · Overdue · Disbursed YTD); each card auto-highlights in oxblood when claims are overdue. **Division persona** sees the 8 District cards under their division. **District persona** sees their own claims pipeline. Click any card → drills into Claims filtered by that body_id. New backend endpoint `GET /api/bodies/{code}/children-activity` aggregates per-child counts including SLA-derived overdue computation. Claims page now accepts `?body_id=X` URL param for drill-down. Header shows scope explicitly: `Scope · Madhya Pradesh Cricket Association · President, MPCA`. Roll-up KPI band sums child totals. "Review N overdue" link appears in section header when any child has SLA breaches.
- **Feb 2026 — Bucket C · PF2 · Structured Send-Back Reasons**: Returning a claim now requires a structured reason code from a 9-item taxonomy (`DOCS_MISSING` / `AMOUNT_MISMATCH` / `BUDGET_HEAD_INVALID` / `AGM_RESOLUTION_REQUIRED` / `VENDOR_GSTIN_INVALID` / `SANCTION_LETTER_REQUIRED` / `DUPLICATE_CLAIM` / `CAO_REVIEW_NEEDED` / `OTHER`) plus optional free-text detail. Code is persisted in the new `return_reason_code` field on Claim and auto-stamped into the approval-chain note like `[DOCS_MISSING] Required documents missing — Travel receipts not attached`. New endpoint `GET /api/return-reasons` exposes the taxonomy with `applies_to` filters per status. Frontend: Return dialog now shows a dropdown + hint + detail textarea inside an oxblood-bordered "RETURN REASON · PF2" block. Each reason has a `severity` field (DUPLICATE_CLAIM is critical, rest warning) ready for future analytics.
- **Feb 2026 — MPCA Meeting Agenda + downloadable PDF**: Drafted a 7-part 90-min stakeholder review agenda at `/app/memory/MPCA_MEETING_AGENDA.md`. Includes objectives, attendee list, tab-by-tab faithful-to-plan walkthrough, live demo flow, 8 rulebook red-line decision points, next-phase sequence, production-readiness checklist, and convener speaking scripts. Exposed as `GET /api/meeting-agenda/download.pdf` (15 KB) and `GET /api/meeting-agenda/download.md` (10 KB) — both ready for meeting circulation.
- **Feb 2026 — Bucket C · PF3 · Approved-vs-Claimed Differential**: Treasurer can now sanction a lower amount than claimed. New fields `approved_amount_inr` + `approved_amount_reason` on Claim model; `sanction` endpoint validates approved ≤ claimed and requires a reason when they differ. Reduction is auto-stamped into the approval-chain note for audit. `disburse` endpoint now debits the approved amount (not the claimed) into the bank — verified with a CLM-2025-26-003 test: claimed ₹4,25,000 → approved ₹5,000 → bank debited ₹5,000 with reason persisted. Frontend: ActionDialog sanction screen got an "Approved Amount" input + auto-shown reduction reason field; Claims list rows show approved-amount (gold) with claimed struck-through underneath; drawer header gold-amount + struck claim + a dedicated 3-column "Approved Amount · PF3" breakdown card with claimed/approved/reduction + quoted reason. Also fixed a pre-existing oversight: disburse now fires a "Disbursed" notification to the originator.
- **Feb 2026 — AI Rulebook viewer + downloads (Option B)**: New `/rulebook` page renders `/app/memory/APPROVAL_MATRIX.md` as heritage-styled HTML with full Markdown + GitHub-flavored tables. Sidebar entry "AI Rulebook" under Financial. 3 backend endpoints: `GET /api/rulebook` (JSON), `GET /api/rulebook/download.md`, `GET /api/rulebook/download.pdf` (reportlab-rendered, A4, 13KB). Top-right of viewer has "PDF" + "MARKDOWN" download buttons. MPCA can review in-app, download a copy, red-line offline, and we replace the .md — AI picks up the new rulebook on the next claim submission with zero code change. Added `react-markdown` + `remark-gfm` deps and a new `.rulebook-prose` CSS layer.
- **Feb 2026 — Step 2b · Notifications extended to Procurement + Transfer NOC**: Added `_notify_for_procurement` (fires on Award / Linked_To_Claim / Close / Cancel) and `_notify_for_transfer` (fires on From_Body_Approved / To_Body_Approved / MPCA_Approved / Completed / Rejected). Procurement events flow into the same in-app bell as claims; transfer events route per stage (releasing body → receiving body → MPCA secretary → completing body). Same `(recipient_role_id, recipient_body_id)` shape, same severity logic, same drawer integration. No new endpoints; just hooks inside existing workflow transitions.
- **Feb 2026 — AI Re-Validate Demo Polish**: Added inline `<FileUpload />` block + golden "RE-VALIDATE WITH AI" button on the claim drawer, visible only to the originator when AI returned/held a claim. New backend endpoint `POST /api/claims/{id}/attach-docs` to append docs without resubmitting. Workflow: AI returns → originator uploads missing doc → clicks Re-Validate → claim re-flows through gatekeeper → status flips live. This is the headline demo moment.
- **Feb 2026 — Step 4 · AI-gated Grant Validation (Gemini 3 Flash)**: The headline AI feature. Every claim submission now triggers an AI gatekeeper that reads `/app/memory/APPROVAL_MATRIX.md` (the rulebook strawman v0.1) plus all attached PDFs/images, then emits one of 5 decision codes (`APPROVE_FAST_TRACK` / `APPROVE_STANDARD` / `HOLD_FOR_HUMAN` / `RETURN_TO_ORIGINATOR` / `AUTO_REJECT`). Hard violations auto-`return` or auto-`reject` the claim and notify the originator. The AI step is appended to `approval_chain` as a fully-auditable `AI Gatekeeper` entry. Used `gemini-3-flash-preview` (chosen over Claude because the integration library only supports file attachments on Gemini). Endpoints: `POST /api/claims/{id}/ai-validate` for on-demand re-validation; auto-hook on `POST /api/claims/{id}/submit`. Frontend: new `AIVerdictCard` in claim drawer + colored AI pill on list rows. Strawman matrix file `APPROVAL_MATRIX.md` (5 ClaimCategories, 7 universal checks, 5 decision codes, 8 open questions for MPCA review).
- **Feb 2026 — Step 3 · Real File Uploads**: Replaced mocked URL strings with persistent multipart uploads. New `uploads` collection + 3 endpoints (`POST /api/uploads` multipart, `GET /api/uploads/{id}` serves file, `GET /api/uploads/{id}/meta`). Files persist to `/app/backend/uploads/<yyyy-mm>/<uuid>.<ext>`. 20 MB cap, 8 allowed MIME types (PDF · JPEG · PNG · WebP · DOCX · XLSX · DOC · XLS). Frontend: new `FileUpload.jsx` component (drag-drop + click-to-pick + per-file remove + thumbnails for images), wired into ClaimNew so District Sec can attach supporting docs. Attachments now render in Claims detail drawer with click-through to open in new tab. This unblocked Step 4.
- **Feb 2026 — Step 2 · Notification Spine + SLA / Red-flag**: Implemented G2/G3/G4 from ERP POINTS.pdf. New `notifications` collection + 4 endpoints (`GET /api/notifications`, `GET /api/notifications/stats`, `POST /api/notifications/{id}/read`, `POST /api/notifications/mark-all-read`). Workflow hooks on submit/recommend/sanction/disburse/reject/return auto-create targeted notifications keyed by `(recipient_role_id, recipient_body_id)`. `SLA_HOURS_BY_STATUS` table (Draft:14d · Submitted:7d · Division_Recommended:5d · MPCA_Sanctioned:3d · Returned:5d) drives derived `due_at` + `is_overdue` fields on every Claim read. Frontend: new `NotificationBell.jsx` polls every 20s, sits in sidebar persona card, opens a panel with title/message/timestamp/severity; bell badge shows unread count. Claims register rows now show a **maroon "OVERDUE" pill** next to the title when SLA breached.
- **Feb 2026 — Step 1 · Information Architecture cleanup**: Sidebar regrouped into 3 domains per user clarification — **Secretarial** (Membership · Meetings · Elections · Disclosures) · **Financial** (Budget · Claims · Procurement · Fees · Bank · Financial Powers) · **Operations** (Players · Tournaments). "Org Structure" link removed from sidebar (route preserved for admin/demo access by direct URL — it's an RBAC-design concept, not an end-user screen).
- **Feb 2026 — UI Content Audit (P0)**: Stripped all PRD/blueprint terminology that had leaked into rendered UI. Replaced "Phase III.5/6/7/8" and "Phase IV/V", "M1/M2/M3/M4" module IDs, "Roadmap" headings, and "forthcoming" copy with constitutional Article references (Article II / VI / VII / XIV) and clean professional copy. Sidebar "Roadmap" group renamed to "Coming Soon" with no phase badges.
- **Feb 2026 — Switch Persona pill**: Added a discrete "SWITCH" button inside the persona card in the sidebar. Returns user to `/login` so they can pick another demo persona (highly requested for demos).
- **Feb 2026 — Coin Loader dual-mode**: `CricketLoader` now supports `mode="spin"` (default — steady continuous Y-axis rotation for ordinary page loads) and `mode="toss"` (ceremonial arc + multi-flip — used only on the Login sign-in transition).


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
| president | President | Shri Mahanaryaman Scindia | State | MPCA HQ |
| secretary | Hon. Secretary | Shri Sanjeev Rao | State | MPCA HQ |
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
| **III.6** | `body_id` scoping on all collections · Idempotent migration · Claims & Grant Workflow (District → Division → MPCA) · Maker-checker `approval_chain` JSONB · Claims register + new-claim form · Persona-aware action buttons · Dashboard claims band | ✅ **Complete (May 2026)** — 47/47 backend tests pass |
| **III.7** | Per-body Budget Ledger (reconciled live vs claims) · Auto bank-debit on Disburse · 2-signatory enforcement >₹50k · Anti-fragmentation rule per Art. 28(v) · Sanctioning matrix reference | ✅ **Complete (May 2026)** — 28/28 backend tests pass |
| **III.8** | Procurement Protocol (3-quote / QCBS / L1-or-justify) · EMD + Security Deposit tracking · ABC Expenditure Analysis (Pareto bucketing) · Status guards on close/cancel | ✅ **Complete (May 2026)** — 40/40 backend tests pass |
| **IV.1**  | **Player Module (M1)** — Player Register with Local-MP / Born-Outside / Guest categories · Eligibility validator (MP domicile, TW3 for Guest, age) · Auto Player ID (MPCA/YYYY/NNNNNN) · Disqualification flags (Two-Year/Lifetime/Division-Penalty/Age-Misrep) · Reinstate · **Transfer NOC workflow** (Draft → From-Body → To-Body → MPCA → Completed with body_id move) reusing III.6 ApprovalStep | ✅ **Complete (May 2026)** — 45/45 backend tests pass |
| **IV.2**  | Tournament Module (M2) — seed 10 inter-divisional tournaments · Squad assignment · Fixtures · Results | ✅ **Complete (May 2026)** |
| **IV.2.1**| Official MPCA emblem integration (Wikipedia source — royal-blue chhatra + sunburst) · `MpcaEmblem` SVG component (themable) + `MpcaLogoMark` (official PNG) for public surfaces · Refreshed office-bearers to 2025 (Mahanaryaman Scindia / Sanjeev Rao / Meera Verma) · Founding year corrected to 1957 | ✅ **Complete (May 2026)** |
| **IV.2.2**| Login page rebuilt as proper sign-in screen (2-column: navy brand pane + clean form with email/password + persona quick-pick) · `CricketLoader` component (animated leather ball + white seam, bouncing with shadow) wired across 19 pages · Saffron-marigold pulse around Landing emblem on first load · Cricket-themed sign-in transition | ✅ **Complete (May 2026)** |
| IV | Player Registration · Grievance Redressal workflow | Backlog |
| V | Constitution Library (full searchable) · AI Assistant (constitution Q&A, draft notices, summarise minutes) · Analytics | Backlog |

## What's been implemented — Phase IV.1 (May 2026) — Player Module (M1)

### Backend (`/app/backend/server.py`)
- **NEW `players` collection** + models: `Player`, `PlayerCreate`, `PlayerBase`, `DisqualificationFlag`. Categories: `Local_MP` / `Born_Outside` / `Guest`. Roles: Batter/Bowler/All-Rounder/Wicket-Keeper. Statuses: Pending/Active/Suspended/Banned/Transferred/Retired.
- **Eligibility validator** (`_validate_eligibility`) enforces: Local_MP requires `domicile_state == "Madhya Pradesh"` (else hard-fail); Guest requires `tw3_verified == True` (else hard-fail); flags missing residency evidence for Born_Outside; computes age and warns on <12 or >60.
- **Unique Player ID generator** (`_next_player_id`) — format `MPCA/{YYYY}/{6-digit-serial}` (e.g. `MPCA/2026/000007`). Year-scoped serials.
- **NEW endpoints** (all `/api`):
  - `GET /api/players?body_id=&category=&status=&search=` — list + filter + search
  - `GET /api/players/{pid}` — accepts either UUID or `MPCA/YYYY/NNNNNN` (URL-encoded)
  - `POST /api/players/check-eligibility` — dry-run validator (returns ok + notes + age)
  - `POST /api/players` — register; runs validator first; hard-fails on category errors
  - `POST /api/players/{id}/approve` — Pending → Active
  - `POST /api/players/{id}/disqualify` — appends a `DisqualificationFlag`; Two_Year_Ban → Suspended, Lifetime_Ban → Banned
  - `POST /api/players/{id}/reinstate` — Suspended → Active
  - `GET /api/players-stats/summary` — totals + by_category breakdown
- **NEW `transfer_requests` collection** + Transfer NOC workflow (reuses III.6 `ApprovalStep` model). Endpoints:
  - `POST /api/transfers` — creates with `noc_no` like `NOC-2025-26-001`; validates `from_body_id == player.body_id` and from ≠ to.
  - `POST /api/transfers/{id}/approve-from` (Draft → From_Body_Approved)
  - `POST /api/transfers/{id}/approve-to` (From → To_Body_Approved)
  - `POST /api/transfers/{id}/approve-mpca` (To → MPCA_Approved)
  - `POST /api/transfers/{id}/complete` (MPCA_Approved → Completed; **moves `player.body_id` to `to_body_id`**)
  - `POST /api/transfers/{id}/reject` (any non-terminal → Rejected)
  - State-machine guards on every transition.
- **`seed_players()`** — 7 demo players spanning 5 districts, all 3 categories, all 3 working statuses, with one Two-Year-Ban example (Sahil Verma, Gwalior).
- Version → **4.0.0**.

### Frontend
- **NEW route `/players`** — `Players.jsx`:
  - 4 stat tiles (Total / Active / Pending / Suspended) + 3-tile category breakdown
  - 8-chip filter bar (All / My Scope / Active / Pending / Suspended / Local-MP / Born-Outside / Guest) + name/ID search
  - Per-row avatar initials, Player ID, body, role, age, batting/bowling style + category & status pills
  - Detail drawer with all identity fields + bowling/batting style + TW3 status (Guest) + Eligibility validator output + Disqualifications list + persona-aware actions (Approve · Suspend · Reinstate)
  - New-Player dialog with live age computation, conditional guardian fields for minors, conditional TW3 checkbox for Guest, "Check Eligibility" dry-run button, full eligibility result panel
  - Suspend dialog with 5 sanction types + expiry date
- **AppLayout** — "Player Register" promoted to PRIMARY_NAV (between Org Structure and Grant Claims) with Trophy icon. "Player Module (M1)" removed from roadmap.

### Testing (Phase IV.1)
- Backend: **45/45 pytest tests pass · 100%** (`/app/test_reports/iteration_10.json`). Covered: every CRUD, every validator path, every lifecycle transition, the full 4-step NOC workflow (including body_id move on completion), every guard rail, regression of all Phase I-III.8 endpoints, seeded data integrity.
- Frontend: Smoke-tested visually — register list, detail drawer, sanctioned player showing Two-Year-Ban audit all render correctly.

### Minor (non-blocking)
- `GET /api/players/{player_id}` with the human-friendly form (containing slashes) requires URL-encoding. UUID lookup works without encoding. Acceptable trade-off.

## What's been implemented — Phase III.8 (May 2026) — Procurement + ABC

### Backend (`/app/backend/server.py`)
- **NEW `procurement_requests` collection** + models: `ProcurementRequest`, `Quotation`, `AwardPayload`, `ProcurementMethod` (Direct/Three_Quote/QCBS/Open_Tender), `ProcurementStatus`.
- **Auto method derivation** via `_procurement_method_for()`: < ₹1L → Direct, ₹1L–₹75L → Three_Quote, > ₹75L → QCBS.
- **NEW endpoints** (all `/api`):
  - `GET /api/procurement?body_id=&status=&method=&fiscal_cycle=` — list with filters
  - `GET /api/procurement/{id}` — fetch single
  - `POST /api/procurement` — create Draft (validates `body_id`, sets `pr_no` `PR-{cycle}-NNN`)
  - `POST /api/procurement/{id}/quotations` — append a Quotation; ≥3 quotes flips status to `Quotes_Collected`
  - `POST /api/procurement/{id}/award` — enforces **3-quote rule** for Three_Quote/QCBS, **vendor must be quoted**, **L1-or-justify** (justification >10 chars required if awarded ≠ lowest)
  - `POST /api/procurement/{id}/close` — only from `Awarded` or `Linked_To_Claim`
  - `POST /api/procurement/{id}/cancel` — from any non-terminal status
  - `POST /api/procurement/{pr_id}/link-claim/{claim_id}` — ties a PR to a Claim for payment
- **NEW `GET /api/finance/abc-analysis?fiscal_cycle=`** — Pareto bucketing of disbursed claims: A (top ~70% of value), B (next ~20%), C (trailing ~10%). Bucket assignment uses *previous* cumulative percentage (so the item that crosses the boundary is still credited to the bucket it pushed past — standard ABC convention).
- **`seed_procurement()`** — 3 demo PRs covering Direct/Awarded, Three_Quote/Awarded with 3 vendors and L1 highlighted (GroundCraft India L1 at ₹4,25,000), and Three_Quote/Draft awaiting quotes.
- Version → **3.8.0**.

### Frontend
- **NEW route `/procurement`** — `Procurement.jsx`:
  - Procurement Register with filter chips (All / From My Body / Draft / Quotes Collected / Awarded / Closed / Cancelled)
  - Per-row method & status pills, awarded-vendor inline
  - Detail drawer showing all quotations with L1 badge + awarded badge
  - New PR dialog with live method preview as user types amount
  - Add-Quotation dialog with GSTIN + date + amount
  - Award dialog with vendor select (shows L1 marker), auto-justification warning when not awarding L1, justification textarea becomes required
  - Close / Cancel buttons gated by current status
- **Budget Ledger page** now shows the **ABC Expenditure Analysis card** above the per-body table — 3 bucket tiles (A saffron / B marigold / C navy) + cumulative saffron-marigold-navy bar with vendor tooltip.
- **AppLayout** — "Procurement" added to PRIMARY_NAV.

### Testing (Phase III.8)
- Backend: **40/40 pytest tests pass · 100%** (`/app/test_reports/iteration_9.json`). Covered: method derivation across thresholds, 3-quote enforcement, L1-or-justify rule (3 sub-cases), award guards, lifecycle close/cancel + status guards (added post-test feedback), link-claim, ABC bucket assignment edge cases (single claim should land in A), Phase I-III.7 regression.
- Frontend: Smoke-tested visually — procurement register, ABC band, threshold matrix all render correctly.

## What's been implemented — Phase III.7 (May 2026) — Finance Close-out

### Backend (`/app/backend/server.py`)
- **NEW `body_budgets` collection** + endpoint suite:
  - `GET /api/budgets?fiscal_cycle=&body_id=` — returns one row per body, reconciled live against `claims` (annual / committed / disbursed / available / utilisation_pct / claim_count)
  - `GET /api/budgets/{body_id}` — single body
  - `POST /api/budgets` — upsert annual budget override (default = body.annual_grant_inr)
- **NEW `GET /api/sanction-thresholds`** — reference for Art. 28(v) (6 levels: District Sec ≤₹25k · District Cmt ≤₹2L · Division Sec ≤₹5L · MPCA Treasurer ≤₹10L · MC ≤₹50L · AGM unlimited) + 2-signatory threshold ₹50,000.
- **Anti-fragmentation rule** on `POST /api/claims`: if the new claim is individually within authority X's limit but the body's cumulative open spend for the cycle would cross authority Y's limit, the call returns 400 with a message naming both authorities. Overridable with `?force=true`.
- **Auto bank-debit on Disburse**: when a claim transitions to Disbursed, a `BankTransaction` is atomically inserted (txn_type=Debit, narration referencing the claim_no, reference `CLAIM/CLM-...`), the source account balance is decremented, and `disbursement_txn_id` + `disbursement_account_id` are written back to the claim for traceability.
- **Two-signatory enforcement**: `POST /api/claims/{id}/disburse` requires `co_signatory_post` + `co_signatory_name` when `amount > ₹50,000`. Co-signature is appended to the approval chain note.
- **Insufficient-balance guard** on Disburse.
- `Claim.supporting_doc_urls` — multi-attachment array.
- Version bumped to **3.7.0**.

### Frontend
- **NEW route `/budgets`** — `Budgets.jsx`:
  - 4 totals tiles (Annual / In-Flight / Disbursed / Available headroom)
  - Art. 28(v) sanctioning matrix card (6 rows + 2-signatory threshold)
  - Filter chips (All / Divisions / Districts) + "Include bodies with no activity"
  - Per-body table with utilisation bars (green <80% · saffron 80-100% · maroon >100%)
  - Persona-aware scoping (Division sees own + districts; District sees own)
- **Claims action dialog** now surfaces co-signatory inputs automatically when `amount > ₹50,000` and the action is `disburse`.
- **AppLayout** — "Budget Ledger" promoted to PRIMARY_NAV.

### Testing (Phase III.7)
- Backend: **28/28 pytest tests pass · 100% · zero issues** (`/app/test_reports/iteration_8.json`). Covered: version, budget ledger reconciliation, 404 + idempotent upsert + body-exists guard, sanction-thresholds, anti-fragmentation (block + force-override), auto bank-debit (claim linkage + balance decrement + Debit txn inserted), 2-signatory enforcement (both paths), insufficient-balance guard, full Phase I-III.6 regression sweep.
- Frontend: Smoke-tested visually — budget ledger renders cleanly with all utilisation bars and Art. 28(v) matrix.

## What's been implemented — Phase III.6 (May 2026) — Body Scoping + Grant Workflow

### Backend (`/app/backend/server.py`)
- **`body_id` field** added to base models for: Member, Disclosure, Meeting, Election, FeeInvoice, BankAccount, BankTransaction. Defaults to `"MPCA"`.
- **`migrate_body_ids()`** — idempotent backfill on startup that tags every legacy record (those without a `body_id`) as `MPCA`.
- **NEW `claims` collection** + models: `Claim`, `ClaimBase`, `ClaimCreate`, `ApprovalStep`, `ClaimAction`.
- **NEW: maker-checker `approval_chain`** — append-only JSONB list on every claim recording stage / actor_post / actor_name / actor_body_id / decision / notes / timestamp for full audit.
- **NEW endpoints** (all `/api`):
  - `GET /api/claims?body_id=&parent_body_id=&status=&fiscal_cycle=` — list with filters
  - `GET /api/claims/{id}` — fetch single
  - `POST /api/claims` — create Draft (validates `body_id` exists)
  - `POST /api/claims/{id}/submit` — District → Division (Draft|Returned → Submitted)
  - `POST /api/claims/{id}/recommend` — Division → MPCA (Submitted → Division_Recommended)
  - `POST /api/claims/{id}/sanction` — MPCA Treasurer (Division_Recommended → MPCA_Sanctioned)
  - `POST /api/claims/{id}/disburse` — MPCA Treasurer (MPCA_Sanctioned → Disbursed)
  - `POST /api/claims/{id}/reject` — at any non-terminal stage
  - `POST /api/claims/{id}/return` — send back to originator
  - `GET /api/claims-stats/summary` — total/pending/disbursed/rejected counts + ₹ in-flight + ₹ disbursed
- **State-machine guards**: every action validates the current status and returns 400 with a descriptive message if violated (e.g. cannot submit a non-Draft claim, cannot reject a Disbursed claim).
- **`seed_claims()`** — auto-seeds 4 demo claims: CLM-2025-26-001 (Draft @ Ujjain), -002 (Submitted @ Indore), -003 (Division_Recommended @ Jabalpur Stadium), -004 (Disbursed @ Sehore — full 4-step audit trail).
- Backend version bumped to **3.6.0**.

### Frontend
- **NEW route**: `/claims` — `Claims.jsx` — register with 4 stat tiles (Total/Pending/Disbursed/Rejected), 8 filter tabs including dynamic "My Queue" that adapts per persona (District→originated; Division→awaiting recommendation; State→awaiting MPCA action), and a detail drawer showing the full approval timeline.
- **Persona-aware action buttons** — each claim row's drawer surfaces only the actions the current persona can perform per the state machine (e.g. only MPCA Treasurer sees "Sanction" / "Disburse"; only the parent Division Sec sees "Recommend"; only the originating District Sec sees "Submit" for Drafts).
- **NEW route**: `/claims/new` — `ClaimNew.jsx` — form for District/State personas to draft a claim with category selector (5 categories: Annual Grant / Tournament / Infrastructure / Honorarium / Special Sanction), amount, cycle.
- **Action dialog modal** — every workflow action opens a confirmation dialog capturing optional notes for the audit trail.
- **AppLayout**: "Grant Claims" promoted to PRIMARY_NAV with HandCoins icon. Removed from Roadmap section.
- **Dashboard**: New "Grant Workflow" band showing claims counts + ₹ in-flight + ₹ disbursed + CTA to register.

### Testing (Phase III.6)
- Backend: **47/47 pytest tests pass · 100% · zero issues** (`/app/test_reports/iteration_7.json`). Covered: version probe, body_id presence across all 7 collections, claims CRUD, filters (body_id / parent_body_id / status / fiscal_cycle), stats aggregation, full happy-path lifecycle, all guards, return-and-resubmit, reject at 3 stages, full Phase I-III.5 regression.
- Frontend: Smoke-tested visually — claims list, persona-aware action buttons, full audit trail drawer all render correctly.

### Demo Workflow (suggested click-through)
1. **As District Secretary (Anil Sharma · Ujjain)**: open `/claims` → see CLM-2025-26-001 (Draft) → click → **Submit to Division**.
2. **Switch persona to Division Secretary (Vikram Patil · Indore)** *(currently demo personas don't include Ujjain Div Sec; use the Indore one for demo)* → switch logical scope — claim now lives at Division.
3. **As MPCA Treasurer (Meera Verma)**: switch persona → claim shows in "Awaiting MPCA Action" → **Sanction** → **Disburse** → claim now in Disbursed bucket; ₹ disbursed total updates.

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

### 🟠 P1 — Phase IV.2 (Tournament Module M2)
1. **Tournament Module (M2)** — seed all 10 inter-divisional tournaments (MY Memorial · Madhavrao Scindia · JN Bhaya · Parmanandbhai Patel · Hiralal Gaekwad · SM Khan · MM Jagdale · AW Kanmadikar · JS Anand · Holkar Trophy) + 5 championship trophies. Squad assignment (drawing from Player Register) + age-cap enforcement + placard generation + fixtures/results.
2. **Match Officials (M3)** + **Team Officials (M4)** registries with renewal cycles.
3. **Grievance Redressal** workflow.

### 🔴 P0 — Phase III.9 (Finance hardening — when ready)
4. Server-side body-scoped read enforcement (FastAPI dep).
5. Real file attachments (PDF/JPEG upload) for Claim + Procurement.
6. Bank statement CSV reconciliation.
7. Write-off + bad-debt provisioning.

### 🟡 P2 — Phase V
8. **AI Assistant** — Claude Sonnet via Emergent LLM key (Constitution Q&A · claim/transfer status · compliance reminders).
9. **Real Auth** — Emergent-managed Google OAuth replacing demo personas; MFA + RBAC enforcement.
10. **Real Payment Gateway** — Stripe/Razorpay UPI (test keys already in env).
11. **Constitution Library** — searchable text + amendment history.
12. **Audit Log** — every register write traced.

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

## M1 + M2 Enhancement Batch — Feb 10, 2026

### M1 · Player Management (enhancements shipped in this batch)
- **M1-A · Extended Profile & Portal Fields (DONE)**
  - New fields: mother_name, sibling_names, gender, proficiency, club_academy,
    height_cm, weight_kg, residency_since, employment, education, address_line
  - Guest sub-categories: Education / MP_Domicile_Junior / MP_Domicile_Senior / Out_Of_MP_Senior
  - Guest disclosure flag + document checklist (uploads via /players/{id}/documents)
  - Court-order flag (⚑) with case reference
  - Player Display ID (new format): `YYYY/DD-MM-YY/serial`
  - Division-wise folder auto-derived: `DIV-XXX`
- **M1-B · Division Review + Transfer + Audit (DONE)**
  - Status ladder: Pending → Under_Division_Review → (Discrepancy_Raised → Pending) → Division_Approved → Active
  - Endpoints: `/players/{id}/start-review`, `/raise-discrepancy`, `/resubmit`, `/division-approve`, `/approve`, `/reopen`
  - Full audit_trail on every player (append-only PlayerAuditEvent list)
  - Discrepancy notes surfaced to applicant; submission_locked toggle
  - Residency validation (3-month local / 1-year out-of-MP)
- **M1-C · Guest Quotas + Disqualification Engine (DONE)**
  - Guest sub-type quotas enforced on squad add
    (Education 1, MP_Domicile_Junior 3, MP_Domicile_Senior 2, Out_Of_MP_Senior 1)
  - Repeat-offender: 2nd Two_Year_Ban auto-promotes to Lifetime_Ban
  - Division penalty defaults to ₹50,000
  - Auto-broadcast notifications to MPCA + BCCI + all state associations
    (recipient_body_id `ALL_STATE_ASSOCIATIONS` fan-out)

### M2 · Tournament Management (enhancements shipped in this batch)
- **M2-A · Correct Catalog + Championship Trophies + Approval (DONE)**
  - Seeded 11 MPCA Inter-Divisional tournaments per user spec:
    MY Memorial, Madhavrao Scindia, JN Bhaya, Parmanandbhai Patel, Hiralal Gaekwad,
    SM Khan, MM Jagdale, AW Kanmadikar, JS Anand (Women/Girls U-18/Girls U-15).
  - Seeded 5 Championship trophies (3-team format Winner + Rest of MP A + B):
    CT Sarwate, CS Nayudu, Bhausaheb Nimbalkar, Bhau Niwsarkar, RP Singh.
  - Seeded 7 BCCI tournaments (Ranji, Vijay Hazare, Syed Mushtaq Ali, U-23 CK Nayudu,
    U-19 Cooch Behar, U-16 Vijay Merchant, U-14 Youth).
  - Approval workflow: Draft → Awaiting_Approval → Upcoming (or Rejected).
    Endpoints: `/tournaments/{id}/submit-for-approval`, `/approve`, `/reject`.
  - New fields: tournament_type, trophy_name, is_three_team_format, is_womens,
    portal_slot_limit, SquadTimeline (provisional 30d / open 15d / transfer 5d / form 15d).
- **M2-B · Fixtures + Rankings (DONE)**
  - Fixture model + `/fixtures` CRUD, status transitions.
  - MatchResult with player_stats + special_performances.
  - Rankings endpoints: `/rankings/batting`, `/rankings/bowling`, `/rankings/special-performances`.
  - Frontend: new `/fixtures` page with tabs (Fixtures · Rankings · HR).
- **M2-C · HR Allocation + Work Hours (DONE)**
  - MatchOfficialAllocation model (10 roles from umpire → curator).
  - `/fixtures/{id}/officials` (POST/DELETE), `/log-hours`.
  - `/hr-allocations/work-hours` aggregation for payroll.

### Files touched
- Backend: models.py, core/helpers.py, routes/players.py (rewritten),
  routes/tournaments.py, routes/fixtures.py (new), seed.py, server.py.
- Frontend: pages/Players.jsx, pages/Tournaments.jsx, pages/Fixtures.jsx (new),
  lib/api.js, App.js, components/AppLayout.jsx.

### Testing status
- Backend curl tests passed (player create → review → discrepancy → resubmit →
  approve; disqualify → auto-promote lifetime; fixture + officials + rankings +
  hr work-hours; tournament approval flow).
- Frontend smoke tests via screenshot passed.
- Comprehensive testing agent run: pending.


---

## Sprint 1 · Finance Rails Completion (Feb 2026) — SHIPPED

Sprint 1 of the approved 8-Sprint Hybrid Plan. Sprint 0 (foundations: shared_services,
CODE service, global audit log, playbook constants) was completed prior. Sprint 1
delivers the double-entry accounting spine.

### What shipped
- **P3.1 · Division Grants (3-step maker-checker)** — Division raises → State Finance
  reviews → State Secretary approves → auto-disburse. Endpoints: `/api/division-grants`,
  `/submit`, `/finance-review`, `/secretary-approve`, `/disburse`, `/send-back`, `/reject`,
  `/division-grants-stats/summary`. Approval chain persisted on the document; illegal
  state transitions return HTTP 400. Send-back and Reject require a note.
- **P3.5 · Vouchers (auto from disbursement)** — When a Division Grant is disbursed a
  Payment Voucher is auto-created via `routes.vouchers.create_voucher_for_grant()`,
  keyed by `linked_ref_id` (idempotent). Voucher No. format: `VCH/MPCA/2026-27/NNNNN`.
  Types: Payment · Receipt · Journal. Endpoints: `/api/vouchers`, `POST /api/vouchers`
  (manual), `/api/vouchers/{id}/cancel`, `/api/vouchers-stats/summary`.
- **P3.6 · General Ledger with running balance** — `GET /api/ledger?body_id=&fiscal_cycle=`
  projects posted vouchers into a running-balance statement. Opening balance sourced
  from `body_budgets.opening_balance_inr` (seeded ₹1.5 Cr for MPCA · 2026-27).
- **P3.7 · Excel + PDF export utility** — `GET /api/ledger/export.xlsx` (openpyxl,
  cricket-themed header fill) and `GET /api/ledger/export.pdf` (reportlab landscape A4
  with MPCA colours). Both return proper MIME + attachment disposition.
- **P3.9 · Budget-vs-Actual dashboard** — `GET /api/finance/budget-vs-actual` produces
  per-body reconciliation with annual_budget · actual · variance · utilisation_pct ·
  status (on_track / under_utilised / over_budget). Aggregates from vouchers +
  division_grants + legacy claims.

### Frontend
- **Recent Activity widget** on Dashboard (`data-testid="recent-activity"`) — last 10
  events from `/api/shared/audit-log` with time, module pill, action, actor, ref-code.
  "View full log" link routes to `/audit-log`.
- New pages: `/division-grants`, `/ledger`, `/budget-vs-actual`. All wired into the
  Financial sidebar group in `AppLayout.jsx`.
- DivisionGrants drawer with 4-stage timeline, action buttons (Submit / Finance Review /
  Secretary Approve / Disburse / Send Back / Reject) role-gated via `canAct(persona, grant)`.
- Ledger page with 4 KPI tiles (Opening · Debits · Credits · Closing), Excel/PDF export
  buttons, and Ledger/Vouchers tabs.
- BudgetVsActual page with 4 KPI tiles + type filter chips + 64-body utilisation table
  with progress bars.

### Seeded data
- 4 Division Grants across all key statuses (Disbursed · Finance_Reviewed · Draft · Sent_Back)
  covering DIV-IND · DIV-JBP · DIV-UJN · DIV-GWL.
- 1 auto-generated Payment Voucher linked to the DIV-IND disbursement.
- MPCA opening balance ₹1.5 Cr for both 2025-26 and 2026-27 fiscal cycles.

### Endpoints registered
- `/api/division-grants` (+ 6 workflow actions + stats/summary)
- `/api/vouchers` (+ cancel + stats/summary)
- `/api/ledger`, `/api/ledger/export.xlsx`, `/api/ledger/export.pdf`
- `/api/finance/budget-vs-actual`

### Files added/changed
- Backend: `routes/division_grants.py` (new · 200 LOC), `routes/vouchers.py` (new · 160 LOC),
  `routes/ledger.py` (new · 260 LOC), `models.py` (`BodyBudgetBase.opening_balance_inr`),
  `seed.py` (`seed_division_grants()` + MPCA opening balance), `server.py` (router imports),
  `requirements.txt` (+openpyxl, +reportlab already present).
- Frontend: `pages/DivisionGrants.jsx` (new · 380 LOC), `pages/Ledger.jsx` (new · 220 LOC),
  `pages/BudgetVsActual.jsx` (new · 175 LOC), `pages/Dashboard.jsx` (Recent Activity
  widget), `lib/api.js` (Sprint 1 helpers), `App.js` (3 new routes), `components/AppLayout.jsx`
  (3 new sidebar links).
- Tests: `/app/backend/tests/test_sprint1_finance.py` (28 tests, all pass).

### Testing status
- **Backend**: 28/28 pytest cases pass (regressions + happy paths + guards).
- **Frontend**: 100% smoke — all 3 Sprint 1 pages render, drawer + timeline + exports work.
- **Regression**: 13 existing endpoints unaffected (verified: claims, vendors, bodies,
  tournaments, players, vendor-bills, tournament-budgets, procurement, shared/audit-log).

### Known non-blocking notes (from testing agent)
- `routes/ledger.py::_ledger_rows` uses a loose `particulars` regex for scope filtering —
  fine at current scale but should move to structured joins (linked_ref_id / cr_account)
  when Sprint 2 adds PO/invoice ledger entries.
- Voucher creation on disbursement is not wrapped in a Mongo transaction; helper is
  idempotent on `linked_ref_id`, so a retry endpoint (future) closes the gap.

### What's next
- **Sprint 2** (Purchase Orders + Vendor KYC): Vendor KYC workflow, PO → invoice →
  payment routing, PO burn-down + TDS flag.
- **Sprint 3** (Asset Register + HR/Payroll).
- Tally integration still BLOCKED awaiting credentials from MPCA.



---

## Sprint 2 · Purchase Orders + Vendor KYC (Feb 2026) — SHIPPED

Sprint 2 of the 8-Sprint Hybrid Plan. Delivers the vendor-management + procurement
spine that feeds Sprint 1's ledger.

### What shipped
- **Vendor KYC lifecycle** (`routes/vendor_kyc.py`) — Not_Started → Docs_Submitted →
  KYC_Verified (12-mo default, calendar-accurate via `relativedelta`) → Expired.
  Rejected branch with mandatory note. 4 required docs enforced on submit.
- **Purchase Orders** (`routes/purchase_orders.py`) — full lifecycle Draft → Submitted
  → Approved → Issued → Partially_Received/Received → Invoiced → Paid.
  2-step approval ≤ ₹1L, 3-step > ₹1L (Head + Finance). Send-back and Cancel branches.
- **TDS auto-calc** on PO creation from `vendor.tds_rate_pct` (default 2% u/s 194C).
- **PO burn-down** — `invoiced_amount_inr` + `paid_amount_inr` incremented via
  `/link-bill` (idempotent on `bill_id`). Auto-flips status Invoiced/Paid.
- **Vendor guards** — PO refuses blacklisted, non-verified, or expired-KYC vendors.
- **Frontend pages**: `/purchase-orders` and `/vendor-kyc` with drawers, approval
  trails, action dialogs, burn-down bars.

### Seeded data
- 13 verified · 1 docs-submitted · 1 not-started vendors; 2 expiring-in-30-days.
- 3 POs (~₹3L committed): Invoiced · Draft · Submitted.

### Testing status
- Backend: 36/36 pytest ✅ (Sprint 1 regression bundled).
- Frontend: 100% smoke ✅.

### Bugs fixed on-the-fly (from testing agent iteration_16)
- **CRITICAL**: Widened `Vendor.category` from `Literal` to `str` on the read
  model — historical data drift can no longer 500 `/api/vendors`. Enum kept
  on `VendorCreate` (write path).
- **HIGH**: `/link-bill` idempotency check on `bill_id`.
- **HIGH**: `/approve` re-work path counts approvals since last `Submit` so
  send-back + re-submit correctly re-runs Head → Finance.
- **MEDIUM**: `create_po` blocks expired-KYC vendors.
- **MEDIUM**: `POLineItem` quantity/unit_price `Field(gt=0)`; gst_pct bounded 0-28.
- **MEDIUM**: KYC verify uses `dateutil.relativedelta(months=+n)` — calendar accurate.

### Deferred to Sprint 4 (Governance)
- Cross-checking link-bill bill_ids against a canonical vendor_bills collection.
- Per-doc KYC verified/remarks history preservation.
- Vendor categories metadata endpoint.

### What's next
- **Sprint 3** — Asset Register + HR/Payroll (fixed assets, depreciation, employee
  master, TDS, payroll register).
- **Sprint 4** — Governance & Compliance (DMS, doc expiry, compliance register,
  audit workpapers PDF).
- **Sprints 5-6** — Dashboards & Reports, AI Assistant Panel.
- Tally integration still BLOCKED awaiting credentials from MPCA.


---

## Sprint 3 · Asset Register + HR/Payroll (Feb 2026) — SHIPPED

Sprint 3 of the 8-Sprint Hybrid Plan. Delivers the fixed-asset and human-capital
back-office spine that closes the loop with Sprint 1's ledger via auto-vouchers.

### What shipped
- **Fixed Asset Register** (`routes/assets.py`) — SLM depreciation with per-month
  book-value roll-forward, tag/QR reference, disposal flow with computed
  gain_loss_on_disposal_inr. Categories: Land · Building · Vehicle · Equipment ·
  Furniture · Computer · Networking · Sports_Equipment · Other. Life-years
  auto-default per category (Building 30 · Computer 3 · Land 0 non-depreciable).
- **Depreciation schedule** endpoint returns period-by-period rows with running
  accumulated depreciation and book value up to end-of-life.
- **Employee Master** (`routes/hr_payroll.py`) — full CV + salary structure
  (Basic + HRA + Special Allowance + Conveyance), employment_type (Permanent /
  Contract / Consultant / Intern / Retainer), statutory flags (tds_applicable,
  pf_applicable, esi_applicable, professional_tax_applicable).
- **Monthly Payroll Register** — auto-computes PF (12% of Basic) + ESI (0.75% of
  Gross, only when Gross ≤ ₹21,000) + Professional Tax (₹200 flat for MP when
  Gross ≥ ₹15,000) + TDS (10% u/s 194J for consultants). Idempotent regenerate.
  Finalise flips status Draft → Finalised, locks the register, AND creates a
  Payment Voucher (Salaries & Wages Dr / Bank Cr) via Sprint 1's vouchers module.
- **Frontend pages**: `/asset-register` (KPI tiles for Gross/Accum/Net Block +
  Utilisation, filter chips, drawer with depreciation projection, disposal dialog
  with live Gain/Loss preview) and `/payroll` (2 tabs: Payroll Registers +
  Employee Master, generate/finalise flows, 12-column payroll detail table,
  auto-voucher badge on finalised registers).

### Seeded data
- 8 fixed assets across all 8 category prototypes (₹11.36 Cr gross · ₹8.82 Cr net).
- 7 employees (6 payroll + 1 consultant on TDS).
- 1 Draft payroll register for the current period (~₹7.7L gross · ₹7.15L net).

### Endpoints added
- `GET/POST /api/assets`, `GET /api/assets/{id}/depreciation-schedule`,
  `POST /api/assets/{id}/dispose`, `GET /api/assets-stats/summary`.
- `GET/POST /api/employees`, `GET /api/employees-stats/summary`.
- `POST /api/payroll/generate`, `GET /api/payroll/registers[/id]`,
  `POST /api/payroll/registers/{id}/finalise`, `GET /api/payroll-stats/summary`.

### Files added/changed
- Backend: `routes/assets.py` (new · 260 LOC), `routes/hr_payroll.py`
  (new · 285 LOC), `seed.py` (seed_assets · seed_employees), `server.py` (router
  imports).
- Frontend: `pages/AssetRegister.jsx` (new · 385 LOC), `pages/Payroll.jsx`
  (new · 400 LOC), `lib/api.js` (Sprint 3 helpers), `App.js` (2 routes),
  `components/AppLayout.jsx` (new 'Assets & HR' sidebar section).
- Tests: `/app/backend/tests/test_sprint3_assets_hr.py` (26 pytest cases · **26/26 pass** after fix).

### Testing status
- **Backend**: 26/26 pytest ✅ (Sprint 1 + Sprint 2 regressions bundled).
- **Frontend**: 100% smoke ✅ — both new pages render correctly.

### Bugs fixed on-the-fly (from testing agent iteration_17)
- **HIGH**: `gain_loss_on_disposal_inr` was persisted to Mongo but stripped by
  `response_model=Asset` (classic `extra='ignore'` silent-drop). Added the field
  to the `Asset` pydantic model — now surfaces in `/api/assets` and drawer.
- **LOW polish**: Added default-life helper text under New Asset dialog's Life
  field ("Default for Computer: 3 years").
- **LOW polish**: Added defensive strip-honorific in `AppLayout` — safeguards
  against 'Shri Shri X' render when persona.name already carries the honorific.
- **LOW cosmetic**: Corrected `AST/` → `ASS/` in the Asset code prefix comment.

### Deferred / documented approximations
- MP Professional Tax uses a flat ₹200/mo slab (real graduated slab ₹125-208
  documented as approximation in `_compute_payroll_row`).
- Depreciation is SLM only. WDV / double-declining deferred.
- Payroll finalise does not yet push individual TDS entries to a 24Q filing
  (deferred to Sprint 4 Governance).
- Bill IDs on PO `/link-bill` are opaque strings — canonical vendor_bills
  cross-check still deferred to Sprint 4.

### What's next
- **Sprint 4** — Governance & Compliance: DMS folders/tags, doc-expiry reminders,
  compliance register, audit workpapers PDF.
- **Sprint 5** — Dashboards & Reports (6 standard reports · MPCA letterhead PDF).
- **Sprint 6** — AI Assistant Panel (scoped read-only chat with deep links).
- **Sprint 7** — Integrations: Google Doc AI, Bank NEFT/RTGS bulk, SMTP live email.
- **Sprint 8** — Hindi i18n + Postgres migration + MFA + AWS deploy.
- **Phase VI** — BCCI-level ball-by-ball online scoring tool.


