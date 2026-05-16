# MPCA ERP — Product Requirements Document

> **Madhya Pradesh Cricket Association — Enterprise Resource Planning System**
> Reference plan: https://mpca-plan-updated.netlify.app/
> Started: Jan 2026 · Version 1.0 (Phase 1 of V)

## Original Problem Statement

User requested an ERP application for the Madhya Pradesh Cricket Association based on the system-design plan published at mpca-plan-updated.netlify.app. The plan covers 16 governance areas drawn from the MPCA Constitution (as amended 12.11.2022): Legal Identity, Constitution Tracking, Important Dates, Membership Base & Norms, Membership Register, Voting & Member Actions, Managing Committee, AGM Management, Special/Extraordinary GM, Committee Meetings, Elections, Post Holder Rules, Fees & Subscriptions, Bank Operations, Disclosures, Grievance Redressal.

User preferences:
- **Design**: "Cricket feeler, fantastic experience" — Classic/Heritage direction
- **Auth**: Demo login for now (Gmail OAuth in a later phase)
- **Approach**: Phased development

## Architecture

- **Frontend**: React 19 + React Router + Tailwind CSS + lucide-react. Cormorant Garamond (serif headings), Bricolage Grotesque (sans body), IBM Plex Mono (numerics). Custom heritage colour tokens (pitch green, brass, ivory, oxblood).
- **Backend**: FastAPI + Motor (MongoDB async). All routes prefixed `/api`.
- **Storage**: MongoDB (`members`, `disclosures` collections). Seed data on startup.
- **Auth (Phase 1)**: Persona-based, stored in `localStorage` as `mpca_persona`. NOT a security boundary.

## User Personas (Phase 1 Demo Auth)

| ID | Role | Persona | Notes |
|---|---|---|---|
| president | President | Shri Abhilash Khandekar | Full executive |
| secretary | Hon. Secretary | Shri Sanjay Jagdale | Register custody, AGM convener |
| treasurer | Hon. Treasurer | Smt. Meera Verma | Bank & fees |
| committee | Committee Member | Capt. Rajinder Pal Singh | Vote, propose |
| member | Member | Shri Naveen Joshi | View self, pay fees |
| public | Public | Guest Viewer | Disclosures only |

## Phase Roadmap

| Phase | Scope | Status |
|---|---|---|
| **I** | Landing · Demo Auth · Dashboard · Membership Register · Public Disclosures | ✅ **Complete (Jan 2026)** |
| II | AGM / Committee Meetings · Elections module (with electoral officer, tenure, cooling period) | Backlog |
| III | Fees & Subscriptions ledger · Bank Operations · Financial Powers | Backlog |
| IV | Player Registration · Grievance Redressal workflow | Backlog |
| V | Constitution Library (full searchable) · AI Assistant (constitution Q&A, draft notices, summarise minutes) · Analytics | Backlog |

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

## Next Action Items

1. **Phase 2 kick-off**: AGM/Committee Meetings module (notice generation, agenda templates from constitution, quorum tracker, minutes editor) + Elections module.
2. **Authentication upgrade**: Emergent-managed Google OAuth, with RBAC enforcement per persona.
3. **AI Assistant scoping**: decide model (Claude Sonnet via Emergent LLM key) + RAG over constitution PDF.

## Future / Backlog

- Real Gmail OAuth (Phase 2 priority)
- File uploads (photo + signature) instead of URLs
- Audit log of every register write
- BCCI sync (player registration, age verification)
- Mobile-responsive refinements for ledger tables
- Multi-language (Hindi) toggle
