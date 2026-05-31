# MPCA ERP · Stakeholder Review Meeting

**Date:** _[Insert date]_
**Venue:** _[Insert venue]_
**Duration:** 90 minutes
**Convened by:** _[Your name & post]_

---

## Attendees (proposed)

| # | Role | Name |
|---|---|---|
| 1 | President, MPCA | _[name]_ |
| 2 | Hon. Secretary, MPCA | _[name]_ |
| 3 | Hon. Treasurer, MPCA | _[name]_ |
| 4 | Hon. Vice-President(s) | _[names]_ |
| 5 | Chief Administrative Officer | _[name]_ |
| 6 | Internal Auditor | _[name]_ |
| 7 | IT / Project Sponsor | _[name]_ |
| 8 | Division Secretary representatives (1–2) | _[names]_ |

---

## Meeting Objectives

1. **Reconfirm** that the system being built faithfully reflects MPCA's original 12-tab plan.
2. **Demonstrate** the building blocks completed so far against that plan.
3. **Capture** MPCA's red-line on two open inputs: (a) the AI Approval Matrix v0.1, (b) the updated RBAC sheet.
4. **Approve** the next sequence of modules (Finance deepening → Officials → Academy → Museum → Scoring) and any priority shifts.
5. **Align** on the pilot rollout plan and go-live readiness criteria.

---

## Agenda

### 🟢 Part 1 · Welcome & Framing _(5 min)_

- Convener's welcome
- Recap of the project mandate per the original 12-tab plan
- Today's working principle: *"The doc was your design — the system is our execution. Where they don't match, we adjust the system, not the doc."*

---

### 🟢 Part 2 · Faithful-to-Plan Coverage Walkthrough _(15 min)_

Walk through the **Coverage Matrix** (one slide per tab from the original plan):

| Tab | What MPCA asked for | What's built |
|---|---|---|
| **1. Overview** | State Cricket Association ERP, BCCI-affiliated identity | ✅ Done — Landing, login, branded shell |
| **2. Org Structure** | BCCI → MPCA → 10 Divisions → 54 Districts as login/access segmentation | ✅ Done — `bodies` collection (66 records); RBAC scopes from this hierarchy |
| **3. Modules M1–M10** | Player · Tournament · Match Officials · Team Officials · Finance · Infra · HR · Compliance · Documents · Meetings | ✅ M1, M2, M5, M9, M10 · 🔴 M3, M4, M6, M7, M8 (in sequence) |
| **4. RBAC** | 5-tier × 3-domain access | ✅ Partial — sidebar regrouped into Secretarial / Financial / Operations per your Tab-2 clarification |
| **5. AI Assistant** | Document validation for grants + Constitution Q&A | ✅ Grant gatekeeper live (Gemini 3 Flash) · 🔴 Constitution Q&A in Phase V |
| **6. Process Flows** | Grant claim, Procurement (3-quote/QCBS/L1), Player NOC, Elections | ✅ All four flows live with maker-checker audit chains |
| **7. Financial Powers (Art. 28(v))** | 6-level sanctioning matrix, two-signatory rule, anti-fragmentation, ABC analysis | ✅ All four enforced server-side; visible in Budget Ledger |
| **8. Player Rules** | Local-MP / Born-Outside / Guest, NOC, disqualification flags, auto IDs | ✅ Complete |
| **9. Constitution (16 sections)** | Legal Identity, Membership, Meetings, Elections, Fees, Bank, Disclosures, Grievance | ✅ 11 of 16 sections covered (full breakdown in `COVERAGE_MATRIX.md`) |
| **10. Data Schema** | Multi-tenant `body_id`, append-only `approval_chain`, year-scoped serial numbers | ✅ All three baked into every collection |
| **11. Tech Stack** | React + Tailwind + FastAPI + MongoDB + Indian Cricket palette | ✅ Done |
| **12. Phases & KPIs** | Phase I–V roadmap | ✅ Phases I, II, III, III.5, III.6, III.7, III.8, IV.1, IV.2 complete · 🔴 IV.3–V remaining |

**Take-away message for MPCA:** *"38 line-items shipped, 8 partial, 16 pending. Zero items dropped or reinterpreted."*

---

### 🟢 Part 3 · Live Demo of Building Blocks _(25 min)_

A short narrated demo, one feature per minute, in the order shown:

1. **Sidebar segregation** — Secretarial · Financial · Operations (your Tab-2 clarification absorbed)
2. **Member registration with auto UID, QR identity card, public verify page**
3. **Meetings & Elections** with voter list + electoral officer conclude step
4. **Grant Claim creation** by a District Secretary, with **real file uploads** (PDF/JPG/PNG/DOCX)
5. **AI Gatekeeper validation** — show a claim being submitted, AI reads the attached doc against the rulebook, returns it with 4 missing-document citations
6. **AI Re-Validate loop** — upload the missing doc → click "Re-Validate with AI" → status flips live
7. **Treasurer's Sanction with Approved-Amount differential (PF3)** — claimed ₹4,25,000, approved ₹5,000, reduction ₹4,20,000, reason stamped, bank debits at the approved amount
8. **In-app Notification bell** with SLA red-flag overdue pills
9. **AI Rulebook viewer + PDF/MD download** — to be reviewed in this very meeting

---

### 🟠 Part 4 · MPCA Decision Points (the asks for today) _(20 min)_

**A · AI Approval Matrix v0.1 — 8 open questions to red-line** *(15 min)*

These come straight from `APPROVAL_MATRIX.md` Section 6. Each needs a yes/no/value from MPCA leadership today, or by a stated date.

| # | Decision required | MPCA response |
|---|---|---|
| 1 | Min active members for Annual Grant — is 25 right, or different for districts vs divisions? | _____ |
| 2 | Should Tournament_Expense advances require pre-sanction above a threshold? If yes, what threshold? | _____ |
| 3 | Infrastructure photographs — is 2 dated images the minimum for civil works? | _____ |
| 4 | Honorarium rate card — separate document in ERP, or static reference text? | _____ |
| 5 | Special_Sanction justification — is 200 chars enough, or raise to 500? | _____ |
| 6 | OCR machine-readability threshold — keep at 90%? | _____ |
| 7 | AI auto-action override — 2 signatures (Treasurer + Secretary) or 3 (add President)? | _____ |
| 8 | Blacklisted vendors / suspect bill patterns — does MPCA have a list to ingest? | _____ |

**B · Updated RBAC Sheet** *(5 min)*

We have an interim 6-persona model (President · Secretary · Treasurer · Division Sec · District Sec · Public). The original plan calls for a 5-tier × 3-domain RBAC matrix. **Action requested:** MPCA shares the official RBAC sheet (or confirms the interim is acceptable for Phase I-IV deployment).

---

### 🔵 Part 5 · Next-Phase Build Plan & Sequence _(15 min)_

**Already committed for the next sprint** (Bucket C · Finance deepening):

1. **PF2** — Multi-stage send-back with structured reason categories *(in-progress today)*
2. **F6a** — Vendor Bills module + Vendor Master
3. **F6c** — BCCI Claims Dashboard
4. **PF1** — Annual Grant district + division share approvals
5. **PF5** — Surplus Distribution flow (Match → AGM → Division)
6. **PF4** — Journal Voucher / Payment Voucher separation
7. **F6e** — Investment Module (FDs · MFs · ROI)

**Then** (Bucket B · New modules):

8. **M3 Match Officials + M4 Team Officials** *(priority bumped per G6 in ERP_POINTS.pdf)*
9. **Academy Module** (Camps · Coaching · Practice Matches)
10. **Museum Module** (Exhibits catalogue — per your choice)
11. **Custom MIS / Interactive Reports**
12. **BCCI-Level Online Scoring** (own phase — largest single build)

**Blocked items pending MPCA inputs:**

- **F6b · Tally integration** — needs Tally Cloud / Server-Tally API credentials
- **R2 · RBAC sheet** — needs the updated official matrix
- **AI rulebook v1.0** — needs sign-off on the 8 open questions (Part 4 · A above)

**Approval requested in this meeting:** confirm the above sequence + flag any priority shifts.

---

### 🟣 Part 6 · Production Readiness & Go-Live _(7 min)_

Items to align on before a formal pilot:

| Topic | Today's status | Decision needed |
|---|---|---|
| **Domain** | App lives on a preview URL | MPCA to provide the official subdomain (e.g., `erp.mpca.in`) |
| **Authentication** | Persona-switching for demo | Decision: continue persona model for pilot, or switch to Google OAuth + JWT (Phase V) |
| **Payment integration** | Mocked at bank-debit level | Decision: defer to Phase V, or accelerate Stripe/Razorpay |
| **Data seeding** | Synthetic seed data | MPCA to share: real Division/District list, real Office Bearer list, real Member roll |
| **Pilot scope** | TBD | Decision: which 1 Division + 2 Districts go first |
| **Training & change-mgmt** | TBD | Decision: who from MPCA trains end-users; we provide tutorial PDFs |
| **Audit & sign-off** | TBD | Decision: who from MPCA signs off feature-by-feature |

---

### 🟤 Part 7 · Open Floor + AOB _(3 min)_

Capture any items MPCA wants to raise that aren't on this agenda.

---

## Pre-read attachments

Send these **with the meeting invite** so attendees can come prepared:

1. **`COVERAGE_MATRIX.md`** — Tab-by-tab coverage of the original 12-tab plan _(in `/app/memory/`)_
2. **`APPROVAL_MATRIX.md`** — The AI rulebook strawman v0.1 — printed PDF copy for red-lining _(downloadable from `/rulebook` page in the ERP, or `/app/memory/`)_
3. **ERP preview URL** — _[paste current preview URL here]_
4. **Demo login note** — *"Use the persona cards on the login page. No password needed for the demo."*

---

## Post-meeting deliverables (next-48-hr checklist for you)

- [ ] Circulate minutes within 24 hours
- [ ] Update `APPROVAL_MATRIX.md` to v1.0 with MPCA's red-lines → AI picks up the new rules on next claim, zero code change
- [ ] Receive R2 RBAC sheet from MPCA Secretariat
- [ ] Confirm subdomain + DNS plan with MPCA IT
- [ ] Confirm pilot scope (1 Div + 2 Dist) and seed-data export from MPCA records
- [ ] Schedule next review in **4 weeks** to demo Bucket C completion

---

## Quick scripts for the convener (use as needed)

**Opening line:**
> "We're here today not to redesign anything — the design is yours, finalised in your 12-tab plan. We're here to show you the system being built block by block exactly to that design, get your sign-off on the AI rulebook, and align on what we build next."

**When showing each feature:**
> "This satisfies Tab _X_, Section _Y_ of your plan."

**When asking for the 8 rulebook decisions:**
> "These eight calls only MPCA can make. Once you red-line them today, the AI's rulebook is final and the system enforces it on every claim from this moment on — no code change needed."

**Closing line:**
> "Your decisions today unblock the next 4 weeks. Thank you for your time."

---

*Drafted: Feb 2026 · Source-of-truth: `/app/memory/PRD.md` + `/app/memory/COVERAGE_MATRIX.md` + `/app/memory/APPROVAL_MATRIX.md`*
