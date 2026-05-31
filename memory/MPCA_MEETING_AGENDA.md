# MPCA ERP · Stakeholder Review

**Date** _[Insert date]_ · **Duration** 90 min · **Convener** _[Your name]_

---

## 📊 Overall Build Progress

| Bucket | Done | Partial | Pending | Total | % Complete |
|---|---|---|---|---|---|
| 12-Tab Original Plan | 38 | 8 | 16 | 62 | **🟢 65 %** |
| ERP_POINTS Addendum (22 new) | 11 | 0 | 11 | 22 | **🟡 50 %** |
| **Combined** | **49** | **8** | **27** | **84** | **🟢 62 %** |

---

## 📑 Tab-by-Tab Coverage

| Tab | Section | Done | Pending | % | Status |
|---|---|---|---|---|---|
| 1 | Overview | 2/2 | – | 100 % | 🟢 Complete |
| 2 | Org Structure (BCCI → 10 Div → 54 Dist) | 3/3 | – | 100 % | 🟢 Complete |
| 3 | Modules (M1–M10) | 5 (M1, M2, M5, M9, M10) | 5 (M3, M4, M6, M7, M8) | 50 % | 🟡 Half |
| 4 | RBAC (5-tier × 3-domain) | 3 | 2 | 60 % | 🟡 Partial |
| 5 | AI Assistant | 1 (Grant gate) | 2 (Constitution Q&A, Drafting) | 33 % | 🟡 Started |
| 6 | Process Flows | 4 (Grant · Procurement · NOC · Election) | 1 (AI-gate already done) | 80 % | 🟢 Mostly |
| 7 | Financial Powers (Art. 28(v)) | 5/5 | – | 100 % | 🟢 Complete |
| 8 | Player Rules | 6/6 | – | 100 % | 🟢 Complete |
| 9 | Constitution (16 sections) | 11 | 5 | 69 % | 🟢 Strong |
| 10 | Data Schema | 3 | 2 (audit log, indices) | 60 % | 🟡 Partial |
| 11 | Tech Stack | 3 | 3 (bilingual, mobile, OCR) | 50 % | 🟡 Half |
| 12 | Phases & KPIs | 9 phases | 4 phases (IV.3–V) | 69 % | 🟢 Strong |

---

## 🆕 ERP_POINTS Addendum Snapshot

| Bucket | Item | Status |
|---|---|---|
| A · Platform | G1 Real-time output | 🟢 Done |
| A · Platform | G2 SLA / Due-dates | 🟢 Done |
| A · Platform | G3 In-app notifications | 🟢 Done |
| A · Platform | G4 Red-flag overdue | 🟢 Done |
| A · Platform | G7 Draft / incomplete uploads | 🟢 Done |
| A · Platform | G9 MIS / Reports | 🔴 Next |
| B · Modules | G6 Match + Team Officials | 🔴 Next |
| B · Modules | G8 Online Scoring (BCCI-level) | 🔴 Phase VI |
| B · Modules | G10 Academy | 🔴 Pending |
| B · Modules | G11 Museum | 🔴 Pending |
| C · Finance | F1 / PF3 Approved-vs-claimed | 🟢 Done |
| C · Finance | F2 Scheme-linked claim types | 🔴 Pending |
| C · Finance | F3 Tally / BCCI flags | 🔴 Pending |
| C · Finance | PF1 Annual Grant split | 🔴 Pending |
| C · Finance | PF2 Structured send-back | 🟢 Done |
| C · Finance | PF4 JV / PV separation | 🔴 Pending |
| C · Finance | PF5 Surplus distribution | 🔴 Pending |
| C · Finance | F6a Vendor Bills | 🔴 Next |
| C · Finance | F6b Tally integration | 🔴 Blocked (creds) |
| C · Finance | F6c BCCI Claims dashboard | 🔴 Pending |
| C · Finance | F6e Investment module | 🔴 Pending |
| D · RBAC | R1 Hon. Treasurer role | 🟢 Done |
| D · RBAC | R2 Updated RBAC sheet | 🔴 Blocked (MPCA) |

---

## 🎯 Agenda

| Time | Part | Topic | Lead |
|---|---|---|---|
| 0–05 | 1 | Welcome · Framing · Working principle | Convener |
| 05–20 | 2 | Tab-by-Tab Coverage Walkthrough _(table above)_ | Project lead |
| 20–45 | 3 | Live Demo · 9 features in order | Project lead |
| 45–65 | 4 | MPCA Decisions · 8 rulebook red-lines + RBAC sheet | All |
| 65–80 | 5 | Next-phase build sequence + approval | Project lead |
| 80–87 | 6 | Production readiness · domain · pilot · sign-off | All |
| 87–90 | 7 | Open floor · AOB | Convener |

---

## 🟢 Part 3 · Live Demo Sequence

| # | Feature | Maps to plan |
|---|---|---|
| 1 | Sidebar segregation (Secretarial / Financial / Operations) | Tab 4 (3-domain RBAC) |
| 2 | Member registration · QR identity card · public verify | Tabs 5, 9 §5, 9 §6 |
| 3 | Meetings · Elections · Voter list · Conclude → declare winner | Tab 9 §8–11 |
| 4 | Grant claim creation with real file uploads | Tab 6 Flow #1 + Phase III.6 |
| 5 | **AI Gatekeeper validation** — auto-reads PDF, cites rulebook | Tab 5 + Section 2.2 of Rulebook |
| 6 | **AI Re-validate** — upload missing doc → flips verdict live | Headline feature |
| 7 | Treasurer's sanction with **Approved-Amount differential (PF3)** | ERP_POINTS F1/PF3 |
| 8 | **Structured Return** with reason codes (PF2) | ERP_POINTS PF2 |
| 9 | Notification bell + SLA overdue red-flag pills | ERP_POINTS G2/G3/G4 |

---

## 🟠 Part 4 · MPCA Decision Points (15 min)

### 4A · AI Rulebook v0.1 — 8 questions to red-line today

| # | Decision | MPCA's call |
|---|---|---|
| 1 | Annual Grant min active members — 25? | _____ |
| 2 | Tournament_Expense pre-sanction threshold? | _____ |
| 3 | Infrastructure photographs — min 2 dated? | _____ |
| 4 | Honorarium rate card — separate doc or static text? | _____ |
| 5 | Special_Sanction justification — 200 or 500 char min? | _____ |
| 6 | OCR machine-readability — keep 90 %? | _____ |
| 7 | AI override — 2 signatures or 3? | _____ |
| 8 | Blacklisted vendors / suspect bill patterns to ingest? | _____ |

### 4B · RBAC Sheet

| Item | Today | Ask |
|---|---|---|
| Current model | 6-persona (President · Secretary · Treasurer · Div Sec · Dist Sec · Public) | MPCA to share official 5-tier × 3-domain matrix **or** confirm interim is OK for Phase I–IV |

---

## 🔵 Part 5 · Next-Phase Build Sequence

### Bucket C · Finance Deepening (in order)

| # | Item | Est. Effort | Status |
|---|---|---|---|
| 1 | F6a · Vendor Bills + Vendor Master | 1.5 hr | 🔴 Next |
| 2 | F6c · BCCI Claims Dashboard | 1 hr | 🔴 Then |
| 3 | PF1 · Annual Grant district + division split | 45 min | 🔴 |
| 4 | PF5 · Surplus distribution flow | 45 min | 🔴 |
| 5 | PF4 · Journal / Payment Voucher split | 1 hr | 🔴 |
| 6 | F6e · Investment module (FDs · MFs · ROI) | 1 hr | 🔴 |
| 7 | F6b · Tally integration | 1.5 hr | 🔴 Blocked (creds) |

### Bucket B · New Modules

| # | Module | Est. Effort | Priority |
|---|---|---|---|
| 8 | M3 Match Officials + M4 Team Officials | 2 hr | 🔥 Bumped (G6) |
| 9 | Academy (Camps · Coaching · Practice Matches) | 1.5 hr | 🟡 |
| 10 | Museum (Exhibits catalogue) | 30 min | 🟡 |
| 11 | MIS / Custom Reports | 2 hr | 🟡 |
| 12 | BCCI-Level Online Scoring | 4–6 hr | 🟣 Own phase |

---

## 🟣 Part 6 · Production Readiness

| Topic | Today's status | Decision needed |
|---|---|---|
| Domain | Preview URL | MPCA subdomain (e.g. `erp.mpca.in`) |
| Auth | Persona demo | Continue or switch to Google OAuth + JWT |
| Payment | Bank-debit mocked | Defer Phase V or accelerate Stripe/Razorpay |
| Real data | Synthetic seed | MPCA to share Div/Dist + Office Bearer + Member lists |
| Pilot scope | TBD | Pick 1 Division + 2 Districts |
| Training | TBD | MPCA-side trainer + we provide tutorial PDFs |
| Sign-off | TBD | Designate feature-by-feature signer |

---

## 📦 Pre-read Attachments

1. **`MPCA_Meeting_Agenda.pdf`** — this document
2. **`MPCA_Approval_Matrix_v0.1.pdf`** — AI rulebook for red-line
3. **Live preview URL** — `_[paste]_` · use persona cards on `/login`

---

## ✅ Post-Meeting Checklist (next 48 hr)

- [ ] Circulate minutes
- [ ] Update `APPROVAL_MATRIX.md` to v1.0 with red-lines → AI uses new rules from next claim
- [ ] Receive official RBAC sheet
- [ ] Confirm subdomain + DNS plan
- [ ] Confirm pilot scope + seed-data export
- [ ] Schedule next review in 4 weeks

---

## 🗣️ Convener Speaking Notes

**Opening:** *"This is not a re-design meeting — it's a sign-off meeting. The design is yours. The system is our execution."*

**Showing each feature:** *"This is Tab _X_, Section _Y_ of your plan."*

**Asking for rulebook decisions:** *"Eight calls only MPCA can make. Red-line them today, and the AI enforces them on every claim from this moment — no code change."*

**Closing:** *"Your decisions today unblock the next 4 weeks. Thank you."*
