# MPCA ERP — Coverage Matrix vs. Original Instruction Document

> Source of truth: [mpca-plan-updated.netlify.app](https://mpca-plan-updated.netlify.app/) (12 tabs) + the 16-section Constitution Data Model on the Constitution tab.
> Snapshot: **Feb 2026**
> Maintainer note: regenerate this file whenever a tab's status changes.

**Legend**
- ✅ Built (in production, tested)
- 🟡 Partial (gap identified)
- 🔴 Not built
- 📘 Explanatory-only — concept from the doc that should NOT render as a user screen

---

## TAB 1 · Overview

| Requirement from doc | Status | Where in our build |
|---|---|---|
| State Cricket Association ERP framing | ✅ | Landing + Login + AppLayout brand |
| BCCI-affiliated identity, founded 1957 | ✅ | Sidebar brand, Landing hero |

## TAB 2 · Org Structure (BCCI → MPCA → 10 Div → 54 Dist)

| Requirement | Status | Where |
|---|---|---|
| Hierarchy data model | ✅ | `bodies` collection (66 records seeded) |
| `GET /api/bodies/tree` + summary endpoints | ✅ | `server.py` |
| User-facing tree visualisation | 📘 | `OrgStructure.jsx` — **explanatory only, hide from sidebar** |

## TAB 3 · Modules (M1–M10)

| Module | Status | Where |
|---|---|---|
| **M1** Player Management (Local-MP / Born-Outside / Guest, NOC, disqualification) | ✅ | `Players.jsx`, `/api/players/*`, `/api/transfers/*` |
| **M2** Tournament Management (10 inter-div tournaments + squads + fixtures) | ✅ | `Tournaments.jsx`, `/api/tournaments/*` |
| **M3** Match Officials (umpires, scorers, renewals) | 🔴 | listed in sidebar "Coming Soon" |
| **M4** Team Officials (coaches, support staff) | 🔴 | listed in sidebar "Coming Soon" |
| **M5** Finance & Compliance | ✅ | Budgets, Claims, Procurement, Bank, Fees, Financial Powers |
| **M6** Infrastructure / Facilities | 🔴 | not started |
| **M7** HR / Staff | 🔴 | not started |
| **M8** Compliance / Grievance Redressal | 🔴 | listed in sidebar "Coming Soon" |
| **M9** Document Management / Disclosures | ✅ | `Disclosures.jsx`, `/api/disclosures` |
| **M10** Meetings (AGM/SGM/Committee + Elections) | ✅ | `Meetings.jsx`, `Elections.jsx` |

## TAB 4 · RBAC & Access (5-tier × 3-domain)

| Requirement | Status | Where |
|---|---|---|
| 5-tier hierarchy (HQ → Div Leaders → Dist Officers → Field → External) | 🟡 | 6 demo personas (State/Div/Dist/Public); Field + External tiers absent |
| 3-domain access (Secretarial / Financial / Admin & Tournaments) | 🔴 | flat sidebar today — **Layer 1 fix** |
| Body-scoped read enforcement on backend | 🟡 | `body_id` stored everywhere; no FastAPI dep enforces scope server-side |
| Maker-checker approval chain | ✅ | `approval_chain` JSONB on claims + procurement + transfers |
| Real auth (Google OAuth + JWT + MFA) | 🔴 | demo `localStorage` personas only — deferred to Phase V |

## TAB 5 · AI Assistant

| Requirement | Status | Where |
|---|---|---|
| Constitution Q&A (Claude Sonnet) | 🔴 | not started — Phase V backlog |
| Document validation gate for grant claims | 🔴 | **Layer 2c — pending build** |
| Draft notices / summarise minutes / compliance reminders | 🔴 | Phase V backlog |

## TAB 6 · Process Flows

| Flow | Status | Where |
|---|---|---|
| Grant claim flow (District → Division → MPCA Treasurer → Disburse) | ✅ | `/api/claims/*` state machine |
| Procurement (3-quote / QCBS / L1-or-justify) | ✅ | `/api/procurement/*` |
| Player NOC Transfer (Draft → From → To → MPCA → Completed) | ✅ | `/api/transfers/*` |
| AI-gated grant validation flow | 🔴 | not started |
| Election conclude → declare winner | ✅ | `/api/elections/{id}/conclude` |

## TAB 7 · Financial Powers (Art. 28(v))

| Requirement | Status | Where |
|---|---|---|
| 6-level sanctioning matrix (Dist Sec ≤₹25k … AGM unlimited) | ✅ | `/api/sanction-thresholds`, Budget Ledger card |
| Two-signatory rule >₹50k | ✅ | enforced in `/api/claims/{id}/disburse` |
| Anti-fragmentation rule | ✅ | enforced in `POST /api/claims` |
| Auto bank-debit on disburse | ✅ | atomic transaction insertion |
| ABC Pareto expenditure analysis | ✅ | `/api/finance/abc-analysis`, Budget Ledger band |

## TAB 8 · Player Rules

| Requirement | Status | Where |
|---|---|---|
| Categories (Local-MP / Born-Outside / Guest) | ✅ | Player model |
| MP domicile validator | ✅ | `_validate_eligibility` |
| Guest TW3 verified gate | ✅ | same |
| Disqualification flags (2-Year / Lifetime / Div-Penalty / Age-Misrep) | ✅ | `DisqualificationFlag` model |
| Auto Player ID `MPCA/YYYY/NNNNNN` | ✅ | `_next_player_id` |
| Reinstate workflow | ✅ | `/api/players/{id}/reinstate` |

## TAB 9 · Constitution — 16-section Data Model

| § | Section | Status | Where |
|---|---|---|---|
| 1 | Legal Identity | 🟡 | partial in `bodies` (PAN/GST fields not yet) |
| 2 | Constitution tracking (amendment dates, ROFS submission) | 🔴 | not built |
| 3 | Important Dates (FY 1 Apr–31 Mar, Membership 1 Sep–31 Aug) | ✅ | `fiscal_cycle` field everywhere |
| 4 | Membership categories & norms | ✅ | Member model + 4 UID prefixes |
| 5 | Membership Register (UID, photo, signature, approver) | ✅ | `Members.jsx`, identity card |
| 6 | Voting & member actions | ✅ | Election voting endpoint, voter UID check |
| 7 | Managing Committee structure | 🟡 | personas exist; full MC seat register not yet |
| 8 | AGM management (notice, quorum, agenda, adjournment) | ✅ | Meetings + Resolutions |
| 9 | SGM / EOGM | ✅ | meeting type filter |
| 10 | Committee meetings | ✅ | same module |
| 11 | Elections (electoral officer, tenure, cooling) | ✅ | Elections module |
| 12 | Post holder rules (tenure, dual-role, cooling) | 🟡 | tenure tracked; dual-role/cooling validators not yet |
| 13 | Fees & Subscriptions (late rules, suspension) | ✅ | Fees module |
| 14 | Bank Operations (signatories, reconciliation, deposits, ROI) | 🟡 | accounts + txns + balance ✅; ROI / deposit tracking 🔴 |
| 15 | Disclosures (all 5 types) | ✅ | Disclosures module |
| 16 | Grievance Redressal | 🔴 | Coming Soon |

## TAB 10 · Data Schema

| Requirement | Status | Where |
|---|---|---|
| Multi-tenant `body_id` on every collection | ✅ | III.6 migration |
| Append-only `approval_chain` JSONB | ✅ | claims, procurement, transfers |
| Year-scoped serial generators | ✅ | UID, claim_no, NOC, PR-no, fee-no |
| Audit log (every write) | 🔴 | Phase V backlog |
| MongoDB indices on hot fields | 🔴 | tech-debt |

## TAB 11 · Tech Stack

| Requirement | Status | Where |
|---|---|---|
| React 19 + Tailwind + lucide | ✅ | frontend |
| FastAPI + Motor (Mongo async) | ✅ | backend |
| Indian Cricket palette | ✅ | CSS-var theme |
| Bilingual EN + HI | 🔴 | Phase V backlog |
| Mobile apps (RN Android + iOS) | 🔴 | out of web scope |
| OCR (Vision API) | 🔴 | backlog |

## TAB 12 · Phases & KPIs

| Phase | Status |
|---|---|
| I — Membership + Disclosures + Identity Card | ✅ |
| II — Meetings + Elections + Public Verify | ✅ |
| III — Fees + Bank + Financial Powers + Member Portal | ✅ |
| III.5 — Indian theme + Org hierarchy | ✅ |
| III.6 — Body-scoping + Grant Workflow | ✅ |
| III.7 — Budget Ledger + 2-sig + anti-fragmentation | ✅ |
| III.8 — Procurement + ABC | ✅ |
| IV.1 — Player Module + NOC | ✅ |
| IV.2 — Tournament Module | ✅ |
| IV.3 — Match & Team Officials (M3 + M4) | 🔴 |
| IV.4 — Infrastructure (M6) | 🔴 |
| IV.5 — Grievance Redressal (M8) | 🔴 |
| V — AI Assistant + Real Auth + Real Payments + Constitution Library + Audit Log | 🔴 |

---

## Summary Counts

| Bucket | Count |
|---|---|
| ✅ Fully built | 38 |
| 🟡 Partial (gap identified) | 8 |
| 🔴 Not built | 16 |
| 📘 Explanatory-only (hide from UI) | 1 (Org Structure) |

## Top 3 Gaps in Priority Order

1. **Information Architecture** — sidebar is flat; doc mandates 3 domains (Secretarial / Financial / Operations). → *Layer 1 fix.*
2. **AI-gated grant validation** — Tab 5 + Tab 6 requirement. District uploads docs → Claude Sonnet validates against Approval Matrix → auto-route. → *Layer 2 build.*
3. **M3 / M4 / M6 / M8 modules** — Tab 3 squares still empty.
