# MPCA Grant Approval Matrix — Strawman v0.1

> **Purpose**: Rulebook against which the AI gatekeeper (Claude Sonnet 4.5) will validate uploaded claim documents before routing a Grant Claim to human approvers.
> **Status**: DRAFT — **MPCA to review & redline**. Once approved, this file becomes the source-of-truth for `approval_matrix` MongoDB collection.
> **Owner**: MPCA Hon. Treasurer (proposed)
> **Last update**: Feb 2026
> **Authority reference**: Constitution Art. 28(v) — Sanctioning Schedule

---

## 1 · Sanctioning Schedule (recap from `/api/sanction-thresholds`)

| # | Authority | Single-claim limit (INR) |
|---|---|---|
| 1 | District Secretary | ≤ 25,000 |
| 2 | District Committee | ≤ 2,00,000 |
| 3 | Division Secretary | ≤ 5,00,000 |
| 4 | MPCA Hon. Treasurer | ≤ 10,00,000 |
| 5 | Managing Committee Resolution | ≤ 50,00,000 |
| 6 | AGM Resolution | Unlimited |

**Two-signatory rule** kicks in at > ₹50,000 (cosigner mandatory on disburse).

---

## 2 · Required Documents per Claim Category

### 2.1 Annual_Grant — District statutory grant per Art. 28(v)

| Document | Required | AI checks |
|---|---|---|
| Previous year's audited Statement of Accounts | ✅ Mandatory | Year matches `fiscal_cycle − 1` · auditor signature page present |
| Current year's budget passed by District Committee | ✅ Mandatory | MC meeting reference present · total amount aligns with claim |
| Member List with paid subscriptions (as of cycle start) | ✅ Mandatory | Min 25 active members for district eligibility |
| AGM Notice + Minutes of last AGM | ✅ Mandatory | Held within last 18 months |
| Bank statement of last 6 months | ✅ Mandatory | Cleared cheques / balance reconciles |
| PAN + GST + Registration Certificate (per Constitution Sec 1) | ⚠️ One-time | If not on file at MPCA |

**Approval chain:** District Sec → Division Sec → MPCA Hon. Treasurer
**Standard amount:** ₹1,10,000/district · ₹30,000/division
**Auto-reject triggers:** missing audited accounts, AGM > 18 months old, < 25 active members.

---

### 2.2 Tournament_Expense — Travel · Boarding · Officiating

| Document | Required | AI checks |
|---|---|---|
| BCCI/MPCA tournament fixture or selection letter | ✅ Mandatory | Tournament listed in MPCA calendar OR BCCI roster |
| Itemised expense statement (travel · lodging · meals · officiating) | ✅ Mandatory | Sub-totals sum to claim amount within ±1% |
| Original bills/vouchers (hotels · transport · ground rent) | ✅ Mandatory | Vendor GSTIN visible · date within tournament window |
| Squad/officials list with player IDs (MPCA/YYYY/NNNNNN format) | ✅ Mandatory | All IDs cross-validate against `players` collection |
| Tournament result/score sheet (post-event claims) | ⚠️ Required for post-event | Match dates align with bills |
| Sanction letter from MPCA for advances | ⚠️ Required for advances | Prior sanction reference cited |

**Approval chain:** District Sec → Division Sec → MPCA Hon. Treasurer (per amount)
**BCCI-claimable:** YES if tournament is BCCI-sanctioned (set `claimable_from_bcci=true`)
**Auto-reject triggers:** missing bills, vendor GSTIN absent on >20% of bills, player IDs invalid.

---

### 2.3 Infrastructure — Equipment · Ground · Stadium Works

| Document | Required | AI checks |
|---|---|---|
| 3 vendor quotations (per Procurement Protocol) | ✅ Mandatory if > ₹1L | Quote dates within last 90 days · L1 vendor visible |
| QCBS evaluation matrix (per Procurement Protocol) | ✅ Mandatory if > ₹75L | Technical + financial scoring shown |
| L1-or-justify note (when not awarding to L1) | ✅ Conditional | Justification > 10 chars · MC approval cited |
| Purchase Order / Work Order | ✅ Mandatory | PR number references `procurement_requests` collection |
| Final invoice/bill from awarded vendor | ✅ Mandatory | Matches PR amount within ±5% |
| Photographs (before/after for ground works) | ✅ Mandatory for civil works | Min 2 images · dated |
| EMD / Security Deposit receipt | ⚠️ Required if applicable | Refund schedule noted |

**Approval chain:** District/Division Committee → MPCA Treasurer → MC Resolution (per amount)
**BCCI-claimable:** Sometimes — only if BCCI grant scheme cited
**Auto-reject triggers:** missing quotes for > ₹1L items, no L1 justification, PR/bill amount mismatch > 5%.

---

### 2.4 Honorarium — Umpire panel · Coaching staff · Scorers

| Document | Required | AI checks |
|---|---|---|
| Approved panel list (MPCA-issued) | ✅ Mandatory | Name + post + panel-ID present |
| Match-wise attendance sheet | ✅ Mandatory | Signed by Match Referee/Tournament Director |
| Rate card reference | ✅ Mandatory | Per-day/per-match rate matches MPCA standard |
| TDS deduction certificate (if applicable) | ⚠️ Required if recipient > ₹30k cumulative | Form 16A reference |
| Bank transfer confirmation | ✅ Required at disbursement | UTR/NEFT reference |

**Approval chain:** Tournament Director → District/Division Sec → MPCA Treasurer
**BCCI-claimable:** YES for BCCI-roster tournaments
**Auto-reject triggers:** unapproved panel members, attendance sheet unsigned, rate exceeds MPCA standard.

---

### 2.5 Special_Sanction — One-off MC-approved expenditure

| Document | Required | AI checks |
|---|---|---|
| MC Resolution explicitly approving this expenditure | ✅ Mandatory | Resolution date + meeting number + amount cited |
| Detailed justification note (signed by Hon. Secretary) | ✅ Mandatory | > 200 chars · references relevant Art./section |
| Beneficiary details + bank account | ✅ Mandatory | Account name matches resolution |
| Tax compliance certificate (if > ₹2L to single party) | ⚠️ Conditional | PAN + GST verified |
| Supporting bills/agreements as relevant | ✅ Mandatory | At least 1 corroborating document |

**Approval chain:** Hon. Secretary → MC Resolution → MPCA Treasurer (disburse)
**BCCI-claimable:** Almost never (case-by-case)
**Auto-reject triggers:** no MC resolution cited, justification < 200 chars, beneficiary bank mismatch.

---

## 3 · Universal AI Gatekeeper Checks (applied to every claim)

Regardless of category, every claim is run through these:

1. **Amount sanity** — `amount_inr` matches sum of itemised costs across uploaded docs (±1%)
2. **Fiscal cycle** — All bill dates fall within `fiscal_cycle`'s window (e.g. 2025-26 = Apr 1 2025 – Mar 31 2026)
3. **Body identity** — Uploaded documents reference `body_id` consistently (no cross-body mix-ups)
4. **Duplicate detection** — No other Disbursed claim in same cycle has the same bill numbers
5. **Anti-fragmentation** — Already enforced by `POST /api/claims` server-side
6. **OCR quality** — Min 90% of uploaded images/PDFs are machine-readable (else flag for human review)
7. **PII redaction check** — No Aadhaar / PAN in plain text on uploaded docs without justification (flag, don't reject)

---

## 4 · AI Decision Codes (returned to the workflow)

| Code | Meaning | Auto-action |
|---|---|---|
| `APPROVE_FAST_TRACK` | All mandatory docs present, all checks pass, amount within District Sec limit | Skip to MPCA queue with green flag |
| `APPROVE_STANDARD` | All mandatory docs present, normal routing | Continue to Division → MPCA chain |
| `HOLD_FOR_HUMAN` | One or more soft warnings (low confidence on OCR, missing optional doc) | Route to Division as normal, flag amber |
| `RETURN_TO_ORIGINATOR` | One or more mandatory docs missing or invalid | Auto-action `return` with reason |
| `AUTO_REJECT` | Hard violation (e.g. wrong body, duplicate, fraud signal) | Auto-action `reject` with reason; notify Hon. Treasurer |

The AI **never** does the disbursement itself — it only sets the routing & severity. Humans always sign the final disburse.

---

## 5 · Override & Audit

- Any AI auto-action (`RETURN_TO_ORIGINATOR` / `AUTO_REJECT`) **can be overridden** by Hon. Treasurer + Hon. Secretary co-signing (logged in `approval_chain` as `AI_OVERRIDE_BY` entry).
- Every AI decision is persisted as an `ApprovalStep` with `actor_post = "AI Gatekeeper"`, full reasoning text in `notes`, and timestamp.
- 100% of AI decisions are auditable via the existing `approval_chain` JSONB on each claim.

---

## 6 · Open questions for MPCA review

1. **Annual_Grant** — Is 25 active members the right threshold, or different for divisions vs districts?
2. **Tournament_Expense** — Should we require pre-sanction for advances > a threshold? If so, what threshold?
3. **Infrastructure** — Photograph requirement: 2 images is the proposal — is this too few?
4. **Honorarium** — Should the rate card live as a separate document in the ERP, or is it a static reference?
5. **Special_Sanction** — Should the 200-char justification threshold be higher (e.g. 500)?
6. **OCR threshold** — 90% machine-readable — adjust up or down?
7. **AI override** — Should the override require 2 signatures (Treasurer + Secretary) or 3 (add President)?
8. **Anti-fraud signals** — Is there a known list of black-listed vendors / suspect bill patterns MPCA wants the AI to learn?

Once these are answered, this strawman becomes v1.0 and gets ingested into the `approval_matrix` collection that drives Step 4.
