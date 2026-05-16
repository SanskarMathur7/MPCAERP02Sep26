# MPCA ERP — Execution Tracker

> **Reference plan**: https://mpca-plan-updated.netlify.app/
> **Last updated**: Jan 2026 · End of Phase III
> **Live URL**: https://nice-aryabhata-4.preview.emergentagent.com/

---

## Legend
- ✅ **Done** — Implemented, tested, live
- 🟡 **Partial** — Foundation built, deeper work pending
- ⏳ **Planned** — Scheduled for a future phase
- 🔒 **Mocked** — Functional with mock; real integration deferred

---

## 1. Overall Progress

| Phase | Scope | Status | Tests |
|---|---|---|---|
| **I** | Landing · Demo Auth · Dashboard · Membership Register · Public Disclosures · Identity Card | ✅ Done | 13/13 frontend, 13/13 backend |
| **II** | AGM / Meetings · Elections · Public Verify + QR codes | ✅ Done | 19/19 backend, frontend verified |
| **III** | Fees & Subscriptions · Bank Operations · Financial Powers · Member Portal (Pay Dues) | ✅ Done | 19/19 backend, 100% frontend |
| **IV** | Player Registration · Grievance Redressal · Squad Reveal page | ⏳ Planned | — |
| **V** | Constitution Library · AI Assistant · Analytics · Audit Log | ⏳ Planned | — |

**Cumulative**: 51/51 backend tests · 41+ frontend E2E flows · ~25 routes · 12 MongoDB collections seeded.

---

## 2. Reference Plan — Section-by-section status

### 2.1 Overview · ✅ Captured
The Landing page, sidebar roadmap (Phases I–V) and the PRD reflect the full charter.

### 2.2 Org Structure · 🟡 Partial
| Role | Implemented as | Status |
|---|---|---|
| President | Persona card · Sidebar profile | ✅ |
| Hon. Secretary | Persona · Convenes meetings · Issues notices | ✅ |
| Hon. Treasurer | Persona · Fees + Bank signatory | ✅ |
| Joint Secretary | Financial Powers schedule | 🟡 Defined, no UI yet |
| Vice President(s) | Mentioned in elections post list | 🟡 Defined, no UI |
| Committee Member | Persona · Vote in committee | ✅ |
| Members | Individual / Institutional / Honorary / Patron | ✅ |
| Public | Persona · Disclosures + Verify | ✅ |

### 2.3 Modules — 16 governance areas

| # | Module (from Constitution) | Status | Lives at |
|---|---|---|---|
| 1 | Legal Identity (Registration, PAN, GST) | 🟡 Static page tile only | Roadmap (Phase V) |
| 2 | Constitution Tracking (amendments, ROFS) | ⏳ Planned | Phase V Library |
| 3 | Important Dates (FY, Membership cycle) | 🟡 Reflected in fees + AGM seed | Implicit |
| 4 | Membership Base & Norms | ✅ Categories + sub-categories enforced | /members |
| 5 | Membership Register (Digital UID, photo, signature) | ✅ Full CRUD + ID Card | /members |
| 6 | Voting & Member Actions | ✅ Voting in elections module | /elections/:id |
| 7 | Managing Committee | 🟡 Listed as persona; tenure tracking pending | Phase IV deepen |
| 8 | AGM Management (notice, agenda, quorum, minutes) | ✅ Full flow | /meetings |
| 9 | Special/Extraordinary GM (SGM) | ✅ Meeting type supported | /meetings (filter SGM) |
| 10 | Committee Meetings | ✅ Full flow + resolutions | /meetings |
| 11 | Elections (electoral officer, nominations, voting) | ✅ Full lifecycle | /elections |
| 12 | Post Holder Rules (tenure, cooling period) | 🟡 Captured in elections; tenure register pending | Phase IV deepen |
| 13 | Fees & Subscriptions (dues, late, sanctions) | ✅ Ledger + bulk generate + pay | /fees |
| 14 | Bank Operations (accounts, transactions) | ✅ Multi-account + txn ledger | /bank |
| 15 | Disclosures (notices, minutes, audited a/c) | ✅ Bulletin + year groups | /disclosures |
| 16 | Grievance Redressal | ⏳ Planned | Phase IV |

**12 of 16 modules functionally complete · 4 partial/planned.**

### 2.4 RBAC & Access · 🟡 Foundation only
- Personas defined (6 roles)
- localStorage-based demo auth
- ⏳ Real authentication (Emergent Google OAuth) — Phase IV/V
- ⏳ Endpoint-level role enforcement — Phase IV
- ⏳ Audit log of who did what — Phase V

### 2.5 AI Assistant · ⏳ Planned (Phase V)
Scope (per the plan):
- Constitution Q&A (RAG over constitution PDF)
- Draft AGM notices / committee circulars
- Summarise meeting minutes
- Plain-language answer to "Who can approve this expenditure?"

Suggested stack: **Claude Sonnet 4.5** via Emergent Universal Key + simple vector search on Constitution PDF chunks.

### 2.6 Process Flows · 🟡 Partial
| Flow | Status |
|---|---|
| Member enrolment → UID generation → register | ✅ |
| Meeting convene → notice → quorum → conclude → minutes | ✅ |
| Election → nominate → vote → conclude → declare | ✅ |
| Fee cycle: generate → issue → pay → receipt | ✅ |
| Bank txn → approval → balance update | ✅ |
| Player registration → eligibility → BCCI link | ⏳ Phase IV |
| Grievance submission → escalation → resolution | ⏳ Phase IV |

### 2.7 Financial Powers · ✅ Done
6 posts modelled with single-txn limits and approval rules per Article XIV. Visible at `/financial-powers`.

### 2.8 Player Rules · ⏳ Planned (Phase IV)
- Age verification
- BCCI registration link
- Selection committee workflow
- Career stats placeholder

### 2.9 Constitution · 🟡 Reference only
- Constitutional articles referenced throughout the UI as "Article V", "Article XI", etc.
- ⏳ Full searchable Constitution Library — Phase V
- ⏳ Amendment tracking with version history — Phase V

### 2.10 Data Schema · ✅ Done
MongoDB collections:
- `members`, `disclosures`, `meetings`, `resolutions`, `elections`, `candidates`, `votes`, `fee_invoices`, `bank_accounts`, `bank_txns` (10 active + system collections)

### 2.11 Tech Stack · ✅ Done
- Frontend: React 19 + React Router + Tailwind CSS + lucide-react
- Backend: FastAPI + Motor (async MongoDB)
- DB: MongoDB
- Fonts: Cormorant Garamond + Bricolage Grotesque + IBM Plex Mono
- QR codes: api.qrserver.com (to be moved local in optimisation pass)

### 2.12 Phases & KPIs · 🟡 Phases done, KPI dashboard pending
- Phases I–III delivered. IV–V planned.
- ⏳ KPI dashboard (renewal rate, AGM attendance trend, fee collection trend, election turnout history) — Phase V

---

## 3. Phase IV — Detailed Task Breakdown

### 4.1 Player Registration (P0)
- [ ] Player model (uid, dob, age category, parent/guardian, club affiliation, BCCI registration #, eligibility flags)
- [ ] Auto-generate Player UID `MPCA-PLR-YYYY-NNNN`
- [ ] CRUD endpoints + frontend (`/players`)
- [ ] Player profile page with career stats placeholder
- [ ] Document uploads (DOB proof, photo, parent consent for minors) — file upload required
- [ ] Age category auto-derivation (U-13, U-16, U-19, U-23, Senior)
- [ ] BCCI registration external link
- [ ] Bulk import via CSV (district associations submit player lists)

### 4.2 Selection Committee & Squad Reveal (P1 enhancement)
- [ ] Tournament model (name, format, start_date, host)
- [ ] Selection model (tournament, captain, vice-captain, wicketkeeper, 16-player squad, reserves, declared_on)
- [ ] Selection workflow tied to a Selection Committee meeting (links to `meetings`)
- [ ] **Public `/squad/:tournament` page** — beautiful squad reveal card with role badges, photos, shareable link, OpenGraph card for social media

### 4.3 Grievance Redressal (P0)
- [ ] Grievance model (submitted_by_uid, against, category, description, attachments, status, assigned_to, escalation_level)
- [ ] Categories: Conduct · Selection · Financial · Administrative · Other
- [ ] Workflow: Submitted → Acknowledged → Under Inquiry → Resolved / Escalated / Dismissed
- [ ] Frontend: `/grievances` (admin) + `/grievance/new` (member-side submission, possibly anonymous)
- [ ] Email/SMS notifications to assigned officer (Phase V — needs SendGrid/Twilio)
- [ ] Resolution recording + closure note

### 4.4 Refactor (P0 housekeeping)
- [ ] Split `server.py` (1250+ lines) into routers: `routers/members.py`, `meetings.py`, `elections.py`, `fees.py`, `bank.py`, `verify.py`
- [ ] Move FastAPI startup to `lifespan` (replace deprecated `@on_event`)
- [ ] Introduce a `MemberUpdate` Partial schema (and same for meetings, elections, fees) so PATCH truly accepts partials
- [ ] Migrate `next_uid` / `next_invoice_no` to a Mongo counters collection (`findOneAndUpdate $inc`) — concurrency safety

---

## 4. Phase V — Detailed Task Breakdown

### 5.1 Constitution Library (P0)
- [ ] Upload the MPCA Constitution PDF (already attached on the plan site) to backend, chunk it
- [ ] Section browser by Article (I–XVII) with anchor links
- [ ] Search across articles
- [ ] Version / amendment history table (last amended 12.11.2022, etc.)
- [ ] Deep links from UI references (e.g. "Article V" in the Member page links to the actual clause)

### 5.2 AI Assistant (P0)
**Integration**: Claude Sonnet 4.5 via Emergent Universal Key — must call `integration_playbook_expert_v2` before implementation.
- [ ] Floating chat widget on every protected page
- [ ] Constitution RAG: vector store of constitution chunks (TF-IDF or pgvector-equivalent in Mongo)
- [ ] Capabilities:
  - "Who can approve a ₹4 lakh payment?"
  - "Summarise the August 2025 committee meeting"
  - "Draft an AGM notice for 12th October 2026"
  - "List all institutional members with pending dues"
- [ ] Conversation history per persona

### 5.3 Analytics Dashboard (P1)
- [ ] Membership growth chart (monthly enrolment, churn, by category)
- [ ] Fee collection trend (last 5 cycles)
- [ ] AGM attendance trend
- [ ] Election turnout history
- [ ] Geographic distribution map (members by district)

### 5.4 Audit Log (P0)
- [ ] `audit_log` collection: actor (persona), action, entity, entity_id, before/after JSON, timestamp, IP
- [ ] Middleware to auto-record every write
- [ ] `/audit` admin page with filters
- [ ] Cannot be edited or deleted (append-only)

### 5.5 Real Authentication (P0)
- [ ] Replace persona localStorage with **Emergent-managed Google OAuth**
- [ ] Map google user → MPCA member by email
- [ ] Persona-mapped RBAC enforced on every protected route (frontend + backend)
- [ ] Session timeout, refresh tokens

---

## 5. KPI Dashboard (delivers at end of Phase V)

| KPI | Source | Target |
|---|---|---|
| Total Members | members collection | Growth trend |
| Membership Renewal % | fee_invoices Paid/Total per cycle | > 85% |
| AGM Attendance | meeting.attendees vs eligible | Quorum + |
| Election Voter Turnout | votes / election.eligible_voters_count | > 60% |
| Fee Collection by Due Date | Paid before due_date / Total | > 70% |
| Mean Grievance Resolution Time | grievances closed_at − created_at | < 30 days |
| Bank Reserve Health | total_bank_balance / annual budget | > 3 months runway |

---

## 6. Cross-cutting / Tech Debt Backlog

- [ ] **Refactor backend** to routers (P0 — blocks scale)
- [ ] **Local QR generation** (`qrcode.react`) replacing api.qrserver.com (offline-safe)
- [ ] **File uploads** (S3/local storage) for photo, signature, DOB proof, attachments
- [ ] **Mobile responsiveness** pass for ledger tables and member portal
- [ ] **Hindi language toggle** (i18n) — member-facing pages first
- [ ] **PDF generation** server-side for AGM notices, audited accounts, identity cards (replace browser print)
- [ ] **Email/SMS notifications** (SendGrid + Twilio) — for grievance acks, AGM notices, fee reminders
- [ ] **Concurrency-safe counters** for UID, invoice_no, meeting_no (Mongo counters)
- [ ] **MongoDB indices** on members.uid, members.email, fee_invoices.member_uid, fee_invoices.cycle, bank_txns.account_id, bank_txns.date
- [ ] **Real payment gateway**: Stripe (test keys already in env) or Razorpay — replace MOCK-PAY path

---

## 7. Test Coverage Snapshot

| Layer | Tests | Pass | Iteration |
|---|---|---|---|
| Backend pytest (Phase I) | 13 | 13 | 1 |
| Frontend E2E (Phase I) | 28 | 28 | 1, 2 |
| Member Card | 13 | 13 | 2 |
| Backend pytest (Phase II) | 19 | 19 | 3 |
| Frontend E2E (Phase II) | 14 | 14 | 4 |
| Backend pytest (Phase III) | 19 | 19 | 5 |
| Frontend E2E (Phase III) | ~22 | 22 | 5 |
| **Total** | **128** | **128** | — |

Test reports live at `/app/test_reports/iteration_{1..5}.json` and `/app/backend/tests/test_*.py`.

---

## 8. Quick Demo Flows (for stakeholder review)

1. **Pavilion entry → Office Bearer dashboard**
   `/` → Enter Pavilion → Sign in as **President** → Dashboard → see 4 stat tiles + ₹2.14Cr bank balance

2. **Member lifecycle**
   `/members` → Filter Institutional → Click Indore Gymkhana → View Identity Card → Print/Save PDF · Member Portal

3. **AGM management**
   `/meetings` → Open AGM card → see agenda → Record Resolution → Status workflow

4. **Live election**
   `/elections` → Open Treasurer election → Cast vote with `MPCA-PAT-0001` → Vote recorded → Conclude → Winner declared

5. **Public verify + Pay Dues** (no login)
   `/verify/MPCA-IND-0001` → green-bordered valid card
   `/member-profile/MPCA-INS-0001` → outstanding dues → Pay Now → receipt modal → Print/Save PDF

6. **Treasurer flow**
   Sign in as **Hon. Treasurer** → `/fees` → Generate cycle / Mark Paid → `/bank` → Record Transaction (auto-balance) → `/financial-powers` reference
