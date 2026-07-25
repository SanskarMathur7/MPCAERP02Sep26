# MPCA ERP — Product Requirements Document

> **Madhya Pradesh Cricket Association — Enterprise Resource Planning System**
> Reference plan: https://mpca-plan-updated.netlify.app/
> Started: Jan 2026 · Last update: Feb 2026 — UI Content Audit + Switch Persona pill + dual-mode coin loader

## Recent Changelog
- **Feb 2026 — Sprint M23 · Tournament Directory Dropdown (smoke tested)**: On the Create-Tournament Step 2, the plain `name` text-input is now a **directory-driven dropdown** keyed on the tournament type picked in Step 1. Directory source: user-supplied `MPCA-tournament-directory.pdf`. **(A)** New `lib/tournamentDirectory.js` with `TOURNAMENT_DIRECTORY` — 11 keys mapping type-code → array of `{name, age}` entries curated from the PDF: 11 Inter-Div trophies (MY Memorial, Madhavrao Scindia, JN Bhaya, H Gaekwad, SM Khan, Parmanandbhai Patel, MM Jagdale, AW Kanmadikar, JS Anand, Boys U-22 LO, Girls U-18); 5 Inter-District Championships (Indore/Bhopal/Gwalior/Jabalpur/Ujjain); 5 Inter-School knockouts by age & gender; 3 Inter-Club categories; 4 Coaching Camps by age; 4 Vacation Camps (Summer/Winter × U-14/U-16); 6 Pre-Tournament Camps; 4 Reciprocal series; 7 Travel Subsidies; **27 BCCI staging tournaments** (Ranji Elite/Plate, Duleep, Irani, Col CK Nayudu Elite/Plate, Cooch Behar Elite/Plate, Vijay Merchant Elite/Plate, Vijay Hazare, Syed Mushtaq Ali, Vinoo Mankad, Vizzy, plus 10 Women's variants Sr/U-23/U-19/U-15 in Multi-day/One-Day/T20/Inter-Zonal); and 12 Away Participation entries mirroring BCCI. **(B)** `TournamentCreateModal.jsx` Step 2 rewritten: if directory has entries for the picked type it renders a `trn-name-select` dropdown with `— Pick from MPCA directory —` placeholder + all named tournaments + a final `➕ Other · type manually` sentinel. Selecting a named entry auto-populates the Trophy field. Selecting Other reveals the original `trn-name-input` text field (auto-focused). **(C)** Guards: `__other__` sentinel stripped from payload before POST; save button disabled while name is empty or still `__other__`. **(D)** Smoke verified: BCCI Staging option shows 28 options (1 placeholder + 27 tournaments + Other), auto-budget preview ₹2,89,340 still renders correctly after scheme 2-D is set.

- **Feb 2026 — Sprint M22 · Tournament Creation RBAC + Sectioned Picker (100% verified · smoke tested)**: Applied the user's RBAC rule to the tournament type-picker so each persona sees only the categories their role may create. **(A)** `tournamentCatalog.js` extended per-type with `created_by[]`, `section` and `flow` metadata. Classification per user brief + attached mockup: **MPCA-level personas** (body_type=State) create 3 types → `bcci_staging`, `away_participation` (BCCI ALLOTS TO MPCA) + `inter_div` (MPCA ALLOTS TO DIVISION). **Division/District personas** create the other 8 types → `inter_div_travel`, `pre_camp`, `reciprocal`, `inter_district`, `inter_school`, `inter_club`, `coaching_camp`, `vacation_camp` (all grouped under `A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS`). **(B)** New helpers `getCreatableTournamentTypes(persona)` + `groupTypesBySection()`. **(C)** `TournamentCreateModal.jsx` step-1 rewritten to render the picker in **visual sections** with colour-coded section tints (navy for BCCI, green for MPCA→Division, brass for Division→internal) — matches the user's screenshot 1:1. Each card carries per-scheme reference (e.g. `Scheme p.19`, `BCCI Guidelines cl.1B and cl.13`) and an origin→recipient flow chip. **(D)** `Tournaments.jsx` hub hides the `Add Tournament` CTA entirely for personas with zero creatable types (Match Official, Auditor, etc.). Modal itself falls back to a `trn-type-picker-empty` state with a ShieldAlert if directly opened. **(E)** Body-type=`Any` field-personas (Match Official, Coach, Data Entry) intentionally excluded — they cannot create tournaments. **Smoke verified**: MPCA sees exactly `[bcci_staging, away_participation, inter_div]` across 2 sections; Division sees exactly 8 cards across 1 section; Match Official sees no button.

- **Feb 2026 — Sprint M21 · Role-Based Access Control (100% verified iter37)**: Full RBAC console shipped per user brief. **(A)** 13 roles seeded: 7 MPCA (President, Hon. Secretary, Hon. Treasurer, Joint Secretary, Auditor, State Selector, System Administrator), 2 Division (Division Secretary, Division Treasurer), 1 District (District Secretary), 3 field-agnostic (Match Official, Coach/Physio, Data Entry). BCCI Liaison dropped per user Q1. **(B)** Permission catalog: 55 permissions across 19 modules (members, tournaments, squads, budgets, invoices, extras, reimbursement_claims, grant_claims, match_officials, da_forms, venues, players, calendar, receipts, closure, governance, schemes, disclosures, rbac). **(C)** Users: single role per user (Q2b), hybrid user table auto-seeded from the 6 persona chips (Q5). **(D)** Backend: new `routes/rbac.py` (14 endpoints — roles CRUD, users CRUD, audit-log, permission-catalog, whoami). Server-side gate `require_rbac_admin` restricts every RBAC endpoint to `{president, secretary, system-administrator}` + `body_code=MPCA`. Bootstrap mode: no persona headers = allowed (for CLI/seed). **(E)** Audit log: RBAC edits + all approval events captured (Q4b). Helper `log_audit_event()` exposed for other modules to hook in later. **(F)** Frontend: new `AccessControl.jsx` page with 3 tabs — Users (list/add/edit/deactivate/delete; persona-linked users non-deletable), Roles (13-row list + per-module permission matrix with module-level toggle + save), Audit Log (timestamp/actor/action/entity/changes rows, 140+ events post-seed). **(G)** Sidebar: new Governance section under NAV_DOMAINS with `rbac_admin_only: true` filter — visible ONLY to President + Secretary. Treasurer/Division/District do not see the entry. Direct URL access is gated via `isRbacAdmin` check on the page itself. **(H)** All axios calls now forward `X-Persona-Post` header (previously missing). **Testing**: iter37 = 17/17 pytest pass + all frontend flows pass. 2 MEDIUM UI issues found and patched immediately: (1) Treasurer with body_type=State was falling through to the read-only page instead of `rbac-forbidden` — guard tightened to `!isRbacAdmin(persona)` only; (2) `RolesTab` `selected` state became stale after save — refactored to `selectedId` with useMemo lookup against the refreshed `roles` array so permission-count and pills always reflect live server state. Screenshot verified: Sanjeev Dua sees all 13 roles with Hon. Secretary showing 84 permissions rendered as tinted pill grid.

- **Feb 2026 — Sprint M20 · Input Variables → Auto-Budget → Submit Flow (100% verified iter35)**: Dynamic per-type input variables now drive live auto-budgeting on the tournament workspace. **(A)** `TOURNAMENT_TYPE_CATALOG` extended with explicit `scheme_code` per type — 6 types map to backend calculators (inter_div→2-B, inter_district→2-A, inter_div_travel→2-C, bcci_staging→2-D, coaching_camp→3-A, pre_camp→3-D). **(B)** `INLINE_INPUT_SPECS` frontend fallback for 5 non-scheme types (reciprocal, inter_school, inter_club, vacation_camp, away_participation) — inputs still persist on `tournament.input_variables` for record. **(C)** New `InputVariablesPanel.jsx` — dynamically renders 6-9 fields per type, live auto-recomputes budget on any edit (400ms debounce), supports select/number/text field types with unit + hint. **(D)** Save action upserts a `tournament_budget` doc: creates fresh Draft if none, PATCHes existing (unless Approved). **(E)** Submit action calls `/tournament-budgets/{bid}/submit` and reflects status change (Draft → Submitted → Approved) inline. **(F)** RBAC: MPCA persona sees disabled inputs + no save/submit buttons but preview still visible for transparency; Division/District can edit and submit; once Approved, all inputs disabled with "edit locked" badge. **(G)** Wired into Overview tab — `box-input-vars` now expands inline instead of deep-linking to /finance. **(H)** Bug fix: `default_format: "OneDay"` → `"One_Day"` in catalog (backend enum uses underscore) — was causing 422 on inter_school create. **Testing**: iter35 = 7 pytest pass + 1 skip (already-approved lifecycle), 8/8 frontend scenarios pass, retest_needed=false. Panel confirms ₹2,80,800 default for scheme 2-B, auto-recompute on input change verified. Progress derivation: `progress-step-budget_created` and `progress-step-budget_approved` correctly reflect budget lifecycle.

- **Feb 2026 — Sprint M19 · Tournament Workspace Overhaul (100% verified iter34)**: Massive UX rework of the tournament experience per user brief + attached utility HTML. **(A) Type Catalog** (`tournamentCatalog.js`) — 11 tournament categories from the MPCA rate-card utility: `inter_div`, `inter_district`, `inter_div_travel`, `pre_camp`, `reciprocal`, `coaching_camp`, `vacation_camp`, `inter_school`, `inter_club`, `bcci_staging`, `away_participation` with title/one-liner/input-hint/eligible-hosts. **(B) Two-step Create-Tournament Modal** (`TournamentCreateModal.jsx`) — Step 1 renders an 11-card type picker (data-testid `trn-type-card-<code>`), Step 2 is the existing detail form pre-filled with format/scope/scheme derived from the chosen type. Back-to-picker chip available. Payload now includes `tournament_type_code`. **(C) Backend model + routes** — `TournamentBase` extended with `tournament_type_code`, `input_variables: Dict`, `calendar_fixed: bool`, `closure_letter_generated_at`. New file `routes/tournament_workspace.py` adds 10 endpoints: matches (CRUD), receipts (CRUD), input-variables PATCH, calendar-lock PATCH, progress GET (5-phase derivation), financial-summary GET (auto-rollup), closure-letter GET/POST. **(D) Progress Stepper** (`TournamentProgress.jsx`) — sticky horizontal 5-phase pill bar (Setup / Squad / Play / Claim / Payment) with expandable sub-steps and a percent progress bar; all data derived from live document state. **(E) Setup Boxes** — 8-tile grid on Tournament Overview (Input Variables, Match Calendar, Squad Selection, Budget & Extras, Invoices+DA, Financial Summary, MPCA Receipts, Closure Letter). Boxes deep-link to existing screens (squad, finance) or expand inline panels (calendar, receipts, summary, closure). **(F) Match Calendar Panel** — user adds fixtures (stage, date, home/away, venue) with lock/unlock; locking flips `calendar_fixed=true` and lights up the corresponding progress step. **(G) MPCA Receipts Panel** — records payments received from MPCA against a tournament with UTR/mode; totals roll into Financial Summary and Progress. **(H) Financial Summary** — auto-rolls invoices, extras, DA forms, budget, claim & receipts; computes ₹ variance. **(I) Closure Letter** — MPCA-only action; generates a plain-text certificate with all financial figures + tournament header, persisted in `tournament_closure_letters`. **(J) Live filter default** on `/tournaments` — hub now defaults to `🔴 Live` (statuses `Squad_Selection` + `In_Progress`) plus Upcoming/All/etc chips. **Testing**: iter34 backend 20/20 pytest pass, frontend 12/12 scenarios pass, retest_needed=false. Post-test cosmetic fix applied: FinancialSummaryPanel loading state given distinct testid `panel-financial-summary-loading`.

- **Feb 2026 — Sprint M18 · Tournament UX Consolidation (verified iter33 6/7 → fix applied)**: Consolidated the fractured tournament experience from **5 sidebar entries into 2** per user directive. **(1) Sidebar collapse** (`AppLayout.jsx`) — removed `Tournament Reimbursement Matrix`, `Reimbursement Claims`, `Camps & Coaching`, `Selection Funnel`. Renamed the calendar entry from `MPCA Tournament Calendar` → `Tournament Calendar` (own route `/tournament-calendar`). Match Official sidebar now has only `My DA / TA Forms` + `Tournament Calendar`. **(2) Unified Tournaments hub** (`/tournaments`, `Tournaments.jsx`) — dropped view-toggle (calendar moved to own page), page renamed from *The MPCA Cricket Calendar* → *Tournaments*, list-only, with inline Select + Finance action pills per row and `New Tournament` button. **(3) TournamentSubTabs sticky strip** (new `TournamentSubTabs.jsx`) — rendered on every `/tournaments/:id/*` screen (Overview, Squad, Finance, Locked-selection variant, and Reimbursement claim detail) with 6 tabs: Overview, Squad Selection, Budget & Finance, Reimbursement, Match Officials, Camps. Active tab gets oxblood underline; auto-detects active state from route. Fetches claim id lazily so the Reimbursement tab deep-links to the specific claim record. **(4) Tournament Calendar page** (new `TournamentCalendarPage.jsx` at `/tournament-calendar`) — read-only, no create button. `scopeTournamentsForPersona` filter: MPCA/Match-Official see all; Division/District see only tournaments where their body (or parent DIV) is host OR appears in `acceptance.required_from`. View toggle Month/List with defaults: **Month for MPCA, List for Divisions** per user choice. Type-filter chips (All / Inter-Divisional / Championships / BCCI / Invitational). Verified via iter33: MPCA sees 38 tournaments, DIV-IND sees 5. **Post-testing fix**: locked SelectionConsole (acceptance=Pending) now also renders TournamentSubTabs so users retain sub-tab navigation even before host acceptance. **New Treasurer persona** live: `persona-chip-treasurer` → Shri Naveen Mittal · Hon. Treasurer, MPCA (State scope, financial powers).

- **Feb 2026 — Sprint M17 · 6-Bug Fix Pass (100% verified iter31+32)**: Consolidated fixes for the 6 UI refinements user raised after Sprint M16. **(1) Player Performance charts + filters** — extended `PerformanceTab` on `PlayerDetail.jsx` with a 4-chart Recharts dashboard (Runs per Season bar / Career Progression cumulative line / Format Distribution pie / Matches per Season bar) plus dual filters (Season dropdown + Format dropdown — Multi-Day/List A/T20/All), record-count strap-line, all with data-testids. Chart palette matches MPCA heritage tokens (oxblood, brass, green-dark). **(2) Grant Claim chip on Schemes list** — `SchemesMaster.jsx` list rows now render an inline oxblood `Claim` chip for every non-tournament scheme (data-testid `claim-row-<code>`); MPCA and tournament-scheme rows show the caret only. Also filtered the New Claim modal in `GrantClaims.jsx` so tournament schemes never leak in. **(3) Persona names updated** — `AuthContext.jsx`: MPCA Secretary=Sanjeev Dua, Division-Indore Secretary=Devashish Nilosey, Match Official=Chandrakant Pandit (President + District Secretary unchanged). `/app/memory/test_credentials.md` updated to match. **(4) Venue filter fixed** — two-layer: **backend** `venues_grounds.py:87-90` auto-scope now appends `{owner_body_id:'MPCA'}` for sub-body personas so a Division sees the state pool (0→320 venues); **frontend** `TournamentCreateModal.jsx:118-135` `filteredVenues` rewritten to filter by `hostBody.seat` city (e.g. DIV-IND → 128 Indore venues, DIV-BPL → 64 Bhopal). Helper text `Showing X of Y venues — filtered to your host body.` renders below dropdown. **(5) Scheme dropdown + auto-budget on Tournament Create** — `TournamentCreateModal.jsx` now fetches active reimbursement schemes on mount, renders a scheme select (data-testid `trn-scheme-select`) with only tournament-eligible codes (2-A..2-E, 3-A..3-D, 9-BCCI). Selecting a scheme fires `/api/schemes/{code}/input-spec` + `/api/schemes/{code}/compute-budget` to render a live Budget Preview block (data-testid `trn-budget-preview`, `trn-budget-total`). On tournament save, if a scheme was picked, a **draft budget is auto-created** via `POST /api/tournament-budgets` so the Division Secretary can immediately Submit. **(6) Submit Budget Sheet CTA** — `TournamentFinanceDetail.jsx` gains a Send-icon `Submit Budget to MPCA` button (data-testid `submit-budget-btn`) visible on the Budget Sheet tab when persona is `division-secretary`/`district-secretary` AND budget.status ∈ {Draft, Returned}. Wired to `POST /api/tournament-budgets/{bid}/submit`. Status transitions to Submitted with an amber `AWAITING MPCA APPROVAL` badge; Approved/Returned states get colour-coded badges. RBAC verified: MPCA persona never sees the button. **Testing**: iterations 31 (5/6 pass) + 32 (retest of BUG-5 → 6/6 pass), retest_needed=false.

- **Feb 2026 — Sprint M16 · Rich Player Workbook + AI-Auto-KYC**: Ingested the updated selection-console HTML (`mpca-selection-console (3).html`) which added a rich `h` (history) array per player = ~15 rows of `[season_idx, tournament_code, M, INN, NO, RUNS, HS, 100s, 50s, spare, OV, WKT, BEST, ECON, B_AVG]`. Idempotent seed pass updated all 250 HTML-seeded players with `selection_meta.season_records[]` (structured season-by-season × tournament breakdown, tournament codes mapped via `TRN_MAP` — VHT/SMAT/RT/CKN/U23OD/IDT etc.), `selection_meta.career_figures` (multi-day / List A / T20 totals from `cf`), `selection_meta.quality_index` (from `ql`), and `selection_meta.role_desc_full` (verbose role like "Top-Order/Middle Batter"). New **Performance tab** on `PlayerDetail.jsx`: 6-card Career Overview (Matches / Runs / Batting Avg / FC Avg / Quality Index / Yo-Yo), Format-wise Career table (Multi-day / List A / T20 with M · Runs · Avg · SR · 100s · 50s), and a **Season-by-Season Record** grouped by season with a 12-column table (Tournament / M / INN / NO / RUNS / HS / 100 / 50 / OV / WKT / B.AVG) rendered per season with an oxblood season-banner. Data-testids on every stat row + record row. **AI KYC auto-verification** — extended the existing `_run_player_doc_validation` (Gemini 3 Flash) flow so that **every KYC document upload immediately auto-runs the AI validator** without requiring a manual button press. The `DocSlot.upload` handler now chains `addPlayerDocument → aiValidatePlayerDocuments` in one flow; the resulting AI verdict (`CLEAN` / `MINOR_ISSUES` / `FLAGGED` / `SUSPECTED_FRAUD`) with per-doc reasoning and confidence is visible immediately via the pre-existing `AIReportCard`. Non-fatal try/catch ensures upload succeeds even if AI is down. Tab counter badge on Performance tab shows number of season records (15 for typical player). Verified with player Vishnu Bhardwaj: 15 entries · 4 seasons · career figs FC 90 / List A 90 / T20 63 / quality 82.

- **Feb 2026 — Sprint M15 · 7-Bug Fix Pass (verified 100%/100% by testing_agent iteration_30)**: (1) **Tournament scoping tightened** — `_tournament_scope_query` in `routes/tournaments.py` no longer broadcasts MPCA/BCCI-hosted tournaments to Divisions/Districts; Division now sees ONLY own DIV code + child `DIST-*-{SUFFIX}` + tournaments where their body appears in `acceptance.required_from`. Verified: DIV-IND persona sees 1 tournament (Vijay Merchant Trophy), MPCA sees 33. (2) **Squad approval RBAC hardened** — `SelectionConsole.jsx` split condition into `body_type !== "State"` for Submit button and `body_type === "State"` for AI-Review/Approve/Reject; Division users can no longer approve/reject their own submissions. (3) **Match Officials dropdown fixed** — SelectionConsole now merges MPCA state-panel officials with the persona-body's officials via two parallel API calls + dedupe by id; Umesh Bharadwaj (State Panel Umpire) now appears in the dropdown alongside body-specific officials. (4) **Scheme-Aware Budget Calculator** — new `/app/backend/routes/scheme_calc.py` with deterministic formulae for **2-A / 2-B / 2-C / 2-D / 3-A / 3-D** driven by user-provided input variables (`match_days`, `rooms_visiting`, `outstation_teams`, `team_strength`, `rail_fare_per_pax`, `camp_days` etc.). Two new endpoints: `GET /api/schemes/{code}/input-spec` (returns variables + defaults + hints + select-options) and `POST /api/schemes/{code}/compute-budget` (returns computed `head_allocations` with `formula` field like "₹1,800 × 20 rooms × 6 days"). Frontend `TournamentFinanceDetail.jsx` scheme picker is now a **2-step wizard**: Step 1 filters to tournament-related schemes; Step 2 renders the input form with live-recompute-on-change (300ms debounce) and previews computed budget totals inline. Verified: 2-D with defaults yields ₹2,89,340 across 9 heads; 2-B with defaults across 9 heads. (5) **Overall AI Verdict** — `squad_ai.py::squad_recommendation` now emits `overall_verdict` (PASS / PASS_WITH_REMARKS / FAIL) + `verdict_reason` + `critical_issues` array. Logic: PASS if no critical issues; PASS_WITH_REMARKS only if the single issue is a small KYC gap (≤5); FAIL otherwise. Prominent 2-line verdict banner rendered at the top of `/squads/:sid/review` with colour-coded border (green/brass/oxblood). (6) **Grant Claim Submit RBAC** — `canSubmit` now gated with `!isMPCA` — MPCA Secretary can no longer see the Submit button on any grant claim, only Approve/Reject. Fixed regression that surfaced after previous test. (7) **Tournament-schemes are read-only in Schemes Master** — `SchemesMaster.jsx` new `TOURNAMENT_SCHEME_CODES` set (2-A / 2-B / 2-C / 2-D / 2-E / 3-C / 3-D / 9-BCCI) drives an `isTournamentScheme` predicate that hides the "Claim under this scheme" button and shows an inline read-only notice pointing the user to the Tournament Reimbursement Matrix. Also: fixed pre-existing AI-doc-verification `NoneType` bug (upload-record path lookup was using `storage_path` instead of `_path`).

- **Feb 2026 — Sprint M14 · Non-Tournament Schemes: Grant Claims + AI Doc Verification + AI Assistant + Schemes Master**: Complete grant-claim workflow for **all non-tournament MPCA schemes** (Annual Grants 1-A, Revenue Share 1-B, Camps 3-A/3-B/3-D, District grants 3-E.2/3-E.3/3-E.4, Awards 4-C/4-G, Infrastructure 5-B, Office 6-A, Ground 6-B, Welfare 7-A, BCCI hosting 9-BCCI). Extended `/app/backend/data/reimbursement_schemes.json` to **18 schemes** with rich `scheme_type` (Annual_Grant / Reimbursement / Camp / Award / Welfare / Infrastructure / Revenue_Share), `eligible_bodies`, `required_documents` (full list per scheme — e.g. Scheme 1-A has 11 required docs), `conditions`, `frequency` and `rate_display` on every head. Model updated with these new fields (`ReimbursementScheme` in `models.py`). New `/app/backend/routes/grant_claims.py` with: (1) `GrantClaim` model with pre-seeded document slots matching scheme's required_documents; (2) full workflow endpoints `POST /api/grant-claims` (idempotency: rejects duplicate active claims per body+scheme+cycle), `POST /api/grant-claims/{cid}/document/{doc_id}` (attach file + auto-run AI verification), `POST /api/grant-claims/{cid}/submit` (validates all docs uploaded), `/approve`, `/reject`; (3) **AI Document Verifier** (`_ai_verify_document`) — Gemini 2.5-flash with FileContentWithMimeType inspects each uploaded doc against its expected `required_label`, returns `{matches, confidence 0-1, document_type_detected, key_details, issues, verdict_note}`, all persisted onto the document slot; (4) **AI Eligibility Recommender** `GET /api/schemes-recommendations` — filters schemes by body_type, computes total potential (sum of head rates), marks already-claimed vs not-started, returns tailored `recommendation_note`; (5) **AI Assistant Chat** `POST /api/ai-assistant/chat` — session-based Gemini chat that receives (a) the caller's body + type from scope headers, (b) their existing claims for FY 2025-26, (c) full filtered schemes catalogue as system context, so the assistant can answer "which grants am I eligible for?" or "documents for Scheme 1-A?" with scheme-specific citations. Never invents schemes. Live-tested with Indore Division — returns 3 top schemes (1-A, 6-A, 6-B) with document list; (6) `PATCH /api/reimbursement-schemes/{code}` — MPCA-only scheme editor. **Frontend**: three new pages + one floating panel — **`/schemes`** (`SchemesMaster.jsx`) shows 21 schemes with filter chips (Annual_Grant / Reimbursement / Camp / Award / Welfare / Infrastructure / Revenue_Share), 2-column layout, sticky detail pane with editable heads/documents/conditions for MPCA (Edit button surfaces inline text fields with add/remove), and "Claim under this scheme" CTA for Div/Dist that routes to `/grant-claims/new?scheme=1-A`; **`/grant-claims`** (`GrantClaims.jsx`) 2-column claim list + document upload panel where each required doc slot is a card with Upload button → AI badge (green "AI verified · 92% confidence" or oxblood "AI flag · {reason}") plus AI-extracted document_type_detected label, plus Submit/Approve/Reject actions; **AI Assistant floating FAB** (`AIAssistantPanel.jsx`) — bottom-right pill button visible only to `division-secretary` and `district-secretary` personas, opens a 400×560px chat panel with sticky suggestion chips ("What grants am I eligible for?" · "Documents for Scheme 1-A?" · "How to claim Ground Maintenance?"), auto-scroll, session-based conversation. Sidebar rearranged — Financial group now leads with "MPCA Schemes Register" and "Grant Claims", followed by Tournament Reimbursement Matrix + Reimbursement Claims. Read-side body-scoping applied to `grant-claims` — Divisions see own + child Districts' claims, MPCA sees all. Verified via curl: DIV-IND potential ₹59.3L across all applicable schemes, MPCA can edit any scheme, Gemini chat replies with scheme_code citations.

- **Feb 2026 — Sprint M13-A · Backend Read-Side Scoping + Sprint M13-B · Camps Module + Sprint M13-C · AI Squad Recommendation**: Massive multi-part sprint delivering data-isolation, coaching camps, and an AI-powered squad review workflow. **(A) Backend Read-Side Scoping** — new `/app/backend/core/scoping.py` with `get_scope(request)` reading X-Persona-Id / X-Body-Code / X-Body-Type / X-Persona-Name headers and `body_scope(scope, field)` returning MongoDB query fragments (own DIV code + child DIST-*-{suffix} regex for Division, exact DIST code for District, `{}` for State). Frontend axios interceptor upgraded to inject the new scope headers on every request. Applied to GET endpoints in: **players** (auto-scopes), **members**, **tournaments** (custom `_tournament_scope_query` allowing MPCA/BCCI-hosted + own-body + on-acceptance-list), **venues** (owner_body_id ∪ managed_by_body_id), **tournament-budgets**, **tournament-invoices**, **extra-expense-requests**, **reimbursement-claims**, **match-official-da** (scoped by `official_name` for match-official persona). Verified via curl: MPCA/State sees 257 players / 32 tournaments; Indore Division sees 35 players / 23 tournaments (25 MPCA/BCCI-hosted + own); Indore District sees 2 players / 23 tournaments; Match Official Umesh Bharadwaj sees 2 DA forms. **(B) Camps & Coaching module** — new `/app/backend/routes/camps.py` with `Camp` model (camp_type: Periodical_Coaching/Vacation_Camp/Reciprocal_Match/Pre_Tournament_Camp mapped to schemes 3-A/3-B/3-C/3-D), full CRUD + `/complete` + stats endpoint. Frontend `/camps` page with 4-scheme overview cards (3-A/3-B/3-C/3-D · budget-head count from ReimbursementScheme) + create-camp modal + row navigation to the shared `/tournaments/:id/finance` Reimbursement Matrix (since camp_id and tournament_id are both UUIDs, the finance pipeline reuses seamlessly). Sidebar: new Operations → "Camps & Coaching" nav link. **(C) AI Squad Recommendation** — `/app/backend/routes/squad_ai.py` with deterministic scoring engine using `selection_meta` (`yo_yo`, `form_last_5.fc[]`, `stats.fc[]`, `compliance.age_verified/noc_ok/anti_doping_ok`, `availability`); returns composite score 0-100 (`_player_score`) with role classification (`_classify_role` splits Bowler into pace vs spin from `bowling_style`), quota-based XV picker (6 batters + 2 all-rounders + 2 keepers + 3 pace + 2 spin), KYC gap detector (`_kyc_gaps` inspects age proof, employer NOC, anti-doping, court order flag, disqualification_count, missing docs `AGE_PROOF/PHOTO_ID/MEDICAL_CERT`), and selection bias analyser (`_selection_bias` flags ≥70% concentration in one body). Endpoints: `GET /api/squads/{sid}/recommendation` (deterministic verdict), `POST /api/squads/{sid}/ai-second-opinion` (Gemini 2.5-flash via Emergent LLM key — returns 3-4 crisp observations in ≤100 words), `POST /api/squads/{sid}/notify-ai-review` (in-app notification to MPCA Secretary on Division submit). Frontend `/squads/:sid/review` page: 4-stat scorecard strip (Quality Score / Overlap % / KYC Gaps / Body Spread with colour-coding — green ≥70, brass 50-70, oxblood <50), AI Observations panel, side-by-side Selected (oxblood header) vs AI-Recommended XV (green header) — matched players get `CheckCircle2` green highlight, missed recommendations get "MISSED" tag, KYC gaps show inline in oxblood, role-bucket score reasoning, "Ask AI for Second Opinion" button that streams Gemini's verdict inline. Role Balance card shows batters/all-rounders/keepers/pace/spin counts (zeros flagged in oxblood). Body Spread card renders a bar chart of every contributing body with over-70% warning banner. Selection Console's Submit-to-MPCA flow now auto-calls `/notify-ai-review` and displays "AI Review" button (Sparkles icon) beside Approve/Reject when the squad reaches `Awaiting_MPCA_Approval`. **Live tested** with Indore Division XV squad on CT Sarwate Trophy — Quality 96.7/100, Overlap 40%, KYC Gaps 45, Bias 100% DIV-IND, Gemini opinion identified all 4 issues autonomously.

- **Feb 2026 — Sprint T-RIM Follow-up · Tournament Detail Cleanup + Player Register Activation + Body-Scoped Player Views**: Three tightly-related quality upgrades. **(1) Tournament Detail cleanup** — the massive 985-line `TournamentOps` component (Plan · Approval / Budget Tracker / Invoices · AI / DA Forms / Extra Expense) was **removed from `TournamentDetail.jsx`** since the full-featured Tournament Reimbursement Matrix now owns all of that in a dedicated per-tournament finance console. In its place: a compact "Financial Operations" CTA card with a single "Open Finance Console →" button routing to `/tournaments/:id/finance`. Removes ~5 tabs of duplicate UI and eliminates 6 different code-paths converging on the same models. **(2) Player Register activated** — moved `Player Register` from the Coming-Soon section into the live "Operations" sidebar group (`/players` was always routed; only the nav link was gated). **(3) Body-scoped Player views** — `Players.jsx` now auto-scopes by persona body_type at first render (not via a filter chip toggle): MPCA/State sees ALL players across every Division; Division sees own DIV code + children DIST-*-{suffix} (fixed a latent `endsWith(body_code.slice(-3))` bug that could false-match); District sees only its own DIST body_id. New "Viewing Scope" banner ribbon at top of the register renders the scope-name pill + live scoped count (`data-testid="scope-count"`). Verified: MPCA=257, Division-Indore=35 (33 Division + 2 Indore District), District-Indore=2. **250 rich HTML player records** re-seeded from `/app/memory/reference/mpca_selection_console.html` (`const DATA` array) with corrected Pydantic enum values (`category='Local_MP'`, `bowling_style` mapped to canonical values like `Right_Arm_Leg_Spin`, `Left_Arm_Orthodox`). Regional aliases from the HTML remapped to MPCA admin divisions: Bundelkhand→Sagar, Malwa→Indore, Nimar→Narmadapuram. Since Selection Console reads from the same `/api/players` endpoint, the same body-scope automatically flows through: Divisions/Districts in the Selection Funnel now only see players from their own hierarchy, MPCA sees the full pool. Sprint 5th-persona Match Official's simplified sidebar also refined: `Dashboard` + `Organisation` items now hidden — only "My DA/TA Forms" + "Tournament Calendar" render for `match-official`.

- **Feb 2026 — Sprint T-RIM · Tournament Reimbursement Matrix (Assembled from MPCA Master Document)**: Full per-tournament finance console linked to the Tournament module. Backend: parsed **10 MPCA reimbursement schemes** (2-A Inter-School, 2-B Inter-District, 2-C Inter-Divisional Travel, 2-D Inter-Divisional Hosting, 2-E Inter-Club A-Grade, 3-A/B/C/D Camps + Reciprocal + Pre-Tournament, 9-BCCI Hosting/Participation) from the client's updated HTML master doc into `/app/backend/data/reimbursement_schemes.json` and auto-seeded on startup into `db.reimbursement_schemes` (idempotent). New models: `ReimbursementScheme` (heads + conditions + fiscal_cycle), `InvoiceHeadAllocation` (one invoice can span multiple budget heads via allocations array), `TournamentReimbursementClaim` (Draft → Submitted → Under_Review → Approved/Rejected with auto-generated summary sheet snapshot). New endpoints: `GET /api/reimbursement-schemes[/{code}]`, `POST /api/reimbursement-schemes/reseed`; `GET /api/reimbursement-claims[/{cid}]`, `POST /api/reimbursement-claims` (idempotent — 409 on duplicate active claim per tournament+body+cycle), `POST /api/reimbursement-claims/{cid}/{submit,start-review,approve,reject,comment}` (approve requires `approved_amount_inr ≤ eligible`; reject requires notes), `GET /api/tournaments/{tid}/reimbursement-preview?body_id=` (live summary sheet), `GET /api/reimbursement-claims-stats/summary`, and a new `PATCH /api/tournaments/{tid}` to attach `scheme_code`. `TournamentInvoiceBase` extended with `allocations: List[InvoiceHeadAllocation]`; the budget-tracker (`/api/tournament-budgets/{bid}/tracker`) rewritten to compute `spent_inr` per head from allocations first (label match preferred) and fall back to legacy `budget_head_code` — no double-counting. `_compute_summary` builds head-wise Budget/Spent/Eligible/Over rows aggregated across all Approved invoices + approved extra-expense requests. On submit, MPCA Secretary receives an in-app notification with the eligible total. Frontend: 4 new pages. **`/tournament-finance`** — list of all tournaments with Budget/Spent/Invoice-count/Claim-status columns, colour-coded utilisation bars, filter chips (All / Over-Budget / With-Claim / No-Budget), auto-scoped by persona body (Division sees own + child Districts, District sees own). **`/tournaments/:id/finance`** — 4-tab console: (1) **Budget Sheet** with "Assign Scheme" picker modal listing all 10 schemes (excludes lump-sum prize heads from operational ceiling — surfaces them in the notes), scheme conditions rendered below the head table; (2) **Invoices** with upload → AI Extract (Gemini via existing `/tournament-invoices/ai-extract`) → multi-head allocation splitter (allocations must sum to invoice total exactly, live delta indicator in oxblood if mismatched); (3) **Extra Expense** requests with justification (≥10 chars) → Division submits → MPCA Secretary approves; (4) **Budget vs Actual** live tracker + prominent "Submit Reimbursement to MPCA" CTA once claim conditions met. **`/reimbursement-claims`** (MPCA view) — list with status chips (Submitted/Under_Review/Approved/Rejected/all) and body-scoped filtering; **`/reimbursement-claims/:id`** — full claim page rendering the auto-generated Summary Sheet (Budget/Invoiced/Eligible/Over headline + head-wise breakdown with per-row over-flag), attached invoices with file links, discussion thread with comments, approval trail, Approve modal (with optional lowered amount) + Reject modal (reason required). **`/my-da-forms`** — dedicated Match Official portal: sidebar collapsed to only "My DA/TA Forms" + "Tournament Calendar" for `match-official` persona; each DA row is editable (days, travel, food, misc, bank details, PAN) with live total re-computation; Submit locks the form. 5th persona added: `Shri Umesh Bharadwaj` (State Panel Umpire, match-official login) with 2 seeded DA forms. Sidebar restructured to add a new **Financial → Tournament Reimbursement Matrix + Reimbursement Claims** section for office bearers. Testing verified end-to-end via `iteration_29.json` — **19/19 backend pytest cases pass · 95% frontend E2E pass**, `retest_needed=false`.

- **Feb 2026 — Sprint M12 · Selection Console (Post-Acceptance Squad Workflow)**: Full 3-column selection workflow that opens the moment a host body accepts a tournament (M11). New Squad fields: `shortlist_ids[]`, `votes{player_id: [voter_id]}`, `voters[]`, `match_officials {manager,coach,trainer,physio,umpire_1,umpire_2,scorer,referee}`, `waivers[]`, `submission_status ∈ Draft|Awaiting_MPCA_Approval|Approved|Rejected`, review trail (submitted_at/by/body + reviewed_at/by/note); `SquadMember.is_vice_captain`; `Player.selection_meta` dict for rich HTML stats. New endpoints: `GET/PATCH /tournaments/{tid}/selection` (auto-creates Draft on first GET, locks while awaiting MPCA), `POST /tournaments/{tid}/selection/submit` (Division-only, min 11 + Captain guards → Awaiting_MPCA_Approval), `POST /tournaments/{tid}/selection/review` (MPCA Hon. Secretary/President only). Selection is locked until acceptance.status ∈ {Accepted, Not_Required}. Frontend `SelectionConsole.jsx` — 3-column layout: (1) filter/weights rail with role chips (TOP/MID/WK/AR/PACE/SPIN), Yo-Yo benchmark, 5-slider Index weights (Form/Season/Fitness/Experience/Conditions), committee-present checkboxes; (2) Pool/Shortlist/Squad tabs with per-selector voting pips, "carried" majority-badge, computed Index score sorted, star to shortlist and Add/In-XV to squad; (3) squad sheet with C/VC/keeper marks, per-role balance grid, Match Officials block (8 slots), red-flag Warnings box. New `PlayerDossierDrawer.jsx` right-slide drawer with full FC/List A/T20 stats, last-5 form line, compliance ✓/✗ rows, Add/Remove squad action. **Draft Minutes** exports a text file (present selectors + squad + officials + warnings); **Export CSV** dumps the squad. "Select" button appears on tournament rows once acceptance is Accepted. 250 rich HTML player records seeded into `db.players` with `selection_meta.seed_source='html_console_v1'`. Verified end-to-end via `iteration_27.json` — **16/16 backend tests + full frontend E2E pass**, `retest_needed=false`, zero critical issues.
- **Feb 2026 — Sprint M11 · Tournament Host-Body Acceptance Workflow**: When MPCA allots a tournament to a Division or a District, that host body (and, for District-hosted, its parent Division too) must now formally **accept or reject** before the tournament can move out of Draft into Upcoming. New `Tournament.acceptance` object holds `required_from` (auto-seeded on create from host body_type — Division → [division]; District → [district, parent_division]; State → []), `entries[]` (audit log of every stamp with by_role_id, by_name, at, note), and rolled-up `status: 'Not_Required' | 'Pending' | 'Accepted' | 'Rejected'`. New endpoints: `POST /api/tournaments/{tid}/acceptance {action, note}` and `GET /api/tournaments/pending-acceptance` (registered before the generic `/tournaments/{tid}` to avoid path-parameter shadowing). Backend guards: caller's `X-Role-Id` must be in office-bearer set; `X-User-Body-Code` must be on `required_from` (else 403 with helpful hint); repeat-accept from same body → 400 idempotency; any reject → `acceptance.status='Rejected'` sticky; once every required body has accepted (no rejects) → auto-promote `status='Upcoming'`. Frontend axios interceptor extended to send `X-User-Body-Code` + `X-User-Name` from persona. Tournament list rows render an inline acceptance strip (colour-coded status + per-body ✓/✗ chips). When the logged-in persona's `body_code` is on the required list AND hasn't acted yet, inline Accept/Reject buttons appear on the row (`e.stopPropagation()` so they don't trigger row navigation). New filter chip **"⏳ Awaiting My Acceptance"** for one-click view of pending items. Verified end-to-end via `iteration_26.json` — **13/13 backend tests + full frontend E2E pass**, zero critical issues, RBAC, sticky-reject, and 2-body District flow all pass.
- **Feb 2026 — Sprint M10 · Tournament Calendar (Month Grid + Scope Filters)**: The Tournament Calendar page now has a **List | Calendar** view toggle. The new Calendar view renders a proper month grid (Mon-Sun) with the current day highlighted in oxblood, prev/next month navigation, a "Today" button, per-month tournament count, and colour-coded tournament chips inside each day cell (Inter-Divisional green, Championship oxblood, BCCI brass, Invitational charcoal, Other gray). Legend row shows all 5 tone/colour mappings. Filter chips: **All / MPCA / Divisions / Districts** — picking a non-All scope reveals a body-specific dropdown (10 divisions or 54 districts) so a Division Secretary can drill into their own calendar in two clicks. Tournaments with `start_date=null` appear in an "Undated · Awaiting Schedule" bucket beneath the grid so nothing is hidden. Overflow days show `+N more` when >3 tournaments overlap. Fully client-side — operates on the already-fetched tournament + bodies lists (no new backend endpoints, zero extra network calls). Each chip links to the tournament detail page. Frontend E2E verified via `iteration_25.json` — all acceptance criteria pass (view toggle, month navigation, scope filters, body dropdown, undated bucket, list-view regression, Add Tournament regression, Venues page regression).
- **Feb 2026 — Sprint M9 · Venues & Grounds Ownership Model**: Refactored Venues to reflect the real MPCA operational reality — a ground can be **owned by MPCA (HQ)** but **managed by a Division** (or by a District), and **BCCI accreditation** is a separate, per-ground dimension (None / Domestic / International). New fields on `VenueBase`: `owner_body_id` (authoritative — defaults to MPCA), `managed_by_body_id` (optional — defaults to owner), and `bcci_approval: Literal["None","Domestic","International"]`. Legacy `body_id` is force-mirrored to `owner_body_id` for backward compat; `bcci_calendar_eligible` boolean now derives from `bcci_approval` both ways. Same treatment on `GroundBase` — every ground has its own `bcci_approval` (a Main ground can inherit from its Venue; Practice/Net grounds default to None) plus a `managed_by_body_id` override so a MPCA-owned venue's practice ground can be delegated to a District. Endpoints extended: `GET /api/venues?owner_body_id=&managed_by_body_id=&bcci_approval=` filters; `POST` and `PATCH` validate owner + manager bodies against `db.bodies` (400 on unknown code). Sync logic uses `payload.model_dump(exclude_unset=True)` to detect the client's explicit intent — so legacy callers sending only `body_id` and modern callers sending only `owner_body_id` both work without collision. Data migration ran against the 5 seeded venues: Holkar → MPCA owned + MPCA managed + International; Captain Roop Singh → MPCA owned + Gwalior Division managed + International; Aishbagh → MPCA owned + Bhopal Division managed + Domestic; MPCA Indore Academy → MPCA owned + Indore Division managed + None; Jabalpur Division Ground → Division owned + Division managed + None. Frontend `VenuesGrounds.jsx` now renders three pills on every card (`OWNER · <code>`, `MGR · <code>` with red tint if manager differs from owner, and `★ BCCI · Domestic/International` or `Not BCCI-approved`). Both the Empanel Venue form and the Add Ground form gained the new selects. Verified end-to-end across 4 test iterations (22→24) — **24/24 backend tests pass, full frontend E2E pass**, zero outstanding issues.
- **Feb 2026 — Sprint M8 · Editable Tournament Calendar + Active Venues/Grounds**: The Tournament Calendar is now user-editable — office bearers can add tournaments via a rich modal (`TournamentCreateModal.jsx`). Modal fields: **Tournament Type** (5-option dropdown: MPCA_InterDivisional / MPCA_Championship / BCCI / Invitational / Other), **Tournament Name** (free text — user types the trophy name manually per instruction), Trophy/Short Name, Format (16 options), Scope, Fiscal Cycle, **Host Body** (State/Division/District picker from live bodies list — MPCA, DIV-*, DIST-* codes), start/end dates, age cap/floor, max squad, Women's toggle, notes. Backend `POST /api/tournaments` extended with `venue_id`, `ground_id`, `venue_name_snapshot`, `ground_name_snapshot` fields on `TournamentBase`; validates that the picked Ground actually belongs to the picked Venue (400 on mismatch), Host body exists (400 on unknown), and age_floor ≤ age_cap. **Venues & Grounds** module promoted from Coming Soon into an active Operations sidebar tab; 5 seeded venues (Holkar, Aishbagh, Captain Roop Singh, MPCA Indore Academy, Jabalpur Division) × 8 grounds available for immediate linkage. Ground dropdown in the tournament modal is chained to the selected Venue — only that venue's grounds are shown. Card meta in the tournament list now displays `venue · ground · Host {code}` inline. Verified end-to-end: 8/8 backend + full frontend E2E + RBAC (district-secretary can NOT see Add button) all pass in `iteration_20.json`.
- **Feb 2026 — Sprint M7 · Organisation Structure Integrated**: Verified the full MPCA org tree matches the official chart shared by the client — 10 Divisions × 54 Districts (Rewa 6, Sagar 6, Bhopal 5, Jabalpur 8, Indore 8, Narmadapuram 3, Gwalior 5, Ujjain 7, Shahdol 3, Chambal 3) already seeded in `db.bodies` under BCCI → MPCA → Divisions → Districts. Elevated the previously hidden `/org` route into an **active sidebar link** ("Organisation · 10·54") right below Dashboard so the tree is the first thing bearers see. Added drill-down: every Division/District row in the org tree now has an "Open →" chip that navigates to the new `/org/:code` **Body Detail page** — shows the body header (name/code/seat/founded/annual grant), a 4-stat summary strip (direct children, districts-under, members-on-roll, annual grant outlay), an "Office Bearers" roster auto-filtered from members whose current MembershipAssignment matches office-bearer roles or category, a "Children · Activity Snapshot" grid (for MPCA/Divisions) with per-child members/claims-pending/disbursed-FY counts each clickable to drill deeper, and a "Members on Roll" list scoped to that body. Removed leftover `Club`-type test body from the tree. Cross-links: Body Detail rows link to `/members/:id`, and the parent chip links back up the tree — implementing full BCCI ↔ MPCA ↔ Division ↔ District navigation as required by the constitution's claim-flow (District → Division → MPCA).
- **Feb 2026 — Sprint M6.1 · Multi-Category Membership (Positions & Tenure)**: A single member can now hold **multiple concurrent categories/roles** (e.g., Life Member + Vice-President + Managing Committee Chair) with per-assignment tenure metadata. New `MembershipAssignment` sub-model on `Member.memberships[]` — each assignment carries `category`, `role`, `committee`, `start_date`, `end_date`, `is_primary`, `term_ref`, `notes`, `added_by`. New endpoints: `POST/PATCH/DELETE /api/members/{id}/memberships[/{aid}]` (all gated to office bearers). Bulk-upload now **auto-merges** rows: if an incoming CSV row's email matches an existing member, it appends a new assignment instead of creating a duplicate — critical for onboarding a member into multiple committees via one CSV. `POST /api/members` auto-seeds a primary assignment from the top-level `sub_category`/`role`/`membership_date`. Primary-uniqueness invariant enforced (`_ensure_single_primary`) — setting a new primary demotes the previous. Frontend: new `MembershipAssignments.jsx` component renders "Positions Held" with two sections — **Currently Held** (active) + **Past — Tenure History** (auto-detected via `end_date`), inline Add/Edit/Delete UI, category dropdown from the dynamic categories list, tenure date pickers, primary-star badge, term-ref chip. `MemberDetail` header now shows all current position pills below the base identity. Members list rows show a compact secondary pill strip for members holding >1 concurrent position (up to 3 + "N more" indicator). Verified end-to-end: Devendra Bundela now cleanly displays Patron (primary) + Managing Committee/Chair + Office Bearer/Vice President concurrent postings.
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


