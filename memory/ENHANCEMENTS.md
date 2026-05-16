# MPCA ERP — Smart Enhancements Backlog

> Optimisation ideas for the polish/finishing phase, ranked by impact-vs-effort.
> **Last updated**: Jan 2026 · End of Phase III

---

## Ranking key
- **Impact**: 🔥 high · 🟠 medium · 🔵 low
- **Effort**: ⏱ small (≤ ½ day) · ⏱⏱ medium (≤ 2 days) · ⏱⏱⏱ large (week+)
- **Phase fit**: when it makes most sense to ship

---

## A. Revenue / Cashflow Boosters

### A1 — Real Payment Gateway 🔥 ⏱⏱
Replace the MOCK-PAY flow with **Stripe** (test keys already in env) or **Razorpay** for UPI-first India payments.
- Stripe Crypto / UPI Collect / NEFT instructions
- Auto-receipt email
- Surcharge handling
- **Why**: directly unlocks 80% renewal collection without office visits.
- **Phase**: tail of Phase IV

### A2 — Tiered & "Donate to MPCA" CTA 🟠 ⏱
On the Member Portal, after Pay Dues, surface a **"Patron Top-up" / "Donate to MP Cricket Foundation"** CTA — pre-set amounts (₹1,000 / ₹5,000 / ₹25,000) with 80G receipt issuance.
- **Why**: free additional cashflow + identifies future Patrons.

### A3 — Auto Late-fee Cron 🟠 ⏱
Background job that flags Pending → Overdue on the 1st of each month, applies ₹500 penalty per Article 17(c). Sends reminder via email/SMS.
- **Why**: removes manual treasurer work; legally enforces the constitution.

### A4 — Bulk Subscription Renewal Drive 🟠 ⏱⏱
Hon. Treasurer dashboard button: "Send Renewal Reminder to all Pending Members" — fires personalised email with a one-tap **/member-profile/UID** link + WhatsApp share text.
- Pairs perfectly with A1.

---

## B. Engagement / Member Delight

### B1 — Squad Reveal Page 🔥 ⏱⏱
Public `/squad/:tournament-id` — IPL/BCCI-style squad announcement card with photos, role badges (C, VC, WK), shareable as OpenGraph card. Auto-published when a Selection_Announcement disclosure is filed.
- **Why**: gives MPCA a polished social-media moment for every squad reveal.
- **Phase**: Phase IV

### B2 — Member Wall of Honour 🟠 ⏱⏱
A heritage `/honours` page showcasing past Presidents, distinguished Patrons, BCCI-tier cricketers from MP, photo + tenure + a short citation.
- **Why**: reinforces the "pavilion" feel + makes the app feel like a living archive.

### B3 — AGM Live Mode 🔥 ⏱⏱⏱
On AGM day, the meeting detail page enters **Live Mode**: real-time attendance check-in via QR scan of member ID card, live quorum counter, agenda items advance with chair's click, resolutions recorded with one-tap voting.
- **Why**: turns the ERP into the actual operating console of the AGM.

### B4 — Member Achievements Feed 🔵 ⏱⏱
Each member profile gains an **Achievements** section (Ranji caps, district honours, Honoraria received) — populated by the Hon. Secretary, surfaced on Identity Card back and verify page.

### B5 — Newsletter / Bulletin Email 🔵 ⏱⏱
Monthly digest: new members enrolled, upcoming AGM, last month's resolutions, fee collection % — pulled from the dashboard stats. Templated via SendGrid.

---

## C. Trust / Credibility / Compliance

### C1 — Audit Log (Append-only) 🔥 ⏱⏱
Every write to members, invoices, bank txns, resolutions, elections recorded with actor, before/after, IP. Surfaced at `/audit` for President + Hon. Secretary only.
- **Why**: this is the single biggest legal/governance lift. Makes the ERP defensible at any inquiry.
- **Phase**: Phase V

### C2 — Tamper-evident PDF Disclosures 🟠 ⏱⏱
When a disclosure is published, sign the PDF with a server-held private key. Verify page shows "✓ Signed by MPCA on dd/mm/yyyy". Renders the disclosure cryptographically auditable.

### C3 — Two-person Approval for ≥ ₹50,000 🟠 ⏱⏱
Bank transactions over the financial-powers threshold require a second persona's digital approval before posting. Enforces Article XIV joint-signature rule in the system.

### C4 — Read-only Public Annual Report Page 🔥 ⏱⏱
`/annual-report/:fy` — auto-generated, beautifully laid-out annual report combining membership stats, fee collection summary, audited accounts, AGM minutes, selection announcements, photos. Public, shareable, downloadable PDF.
- **Why**: kills 30 hours of manual annual-report production every year + becomes a marketing asset.

---

## D. Performance / Reliability / Polish

### D1 — Local QR Generation 🟠 ⏱
Replace `api.qrserver.com` with `qrcode.react` library so identity cards print regardless of internet at the stadium gate.

### D2 — MongoDB Indices 🟠 ⏱
Indexes on members.uid (unique), members.email, fee_invoices.member_uid, fee_invoices.cycle (compound), bank_txns.account_id+date, votes.election_id+voter_uid (unique). Sub-50ms queries even at 10× scale.

### D3 — Lighthouse pass 🔵 ⏱
Image lazy-loading on landing hero, font preload (Cormorant already), critical CSS inlining. Target Lighthouse > 95.

### D4 — Skeleton states 🔵 ⏱
Replace "Reading the ledger…" text with shimmer skeletons matching the ledger row layout. Perceived-performance lift.

### D5 — Mobile-first ledger tables 🟠 ⏱⏱
Convert all 12-column grid ledgers to a card view at `< md` breakpoint. Currently desktop-elegant but cramped on phones.

### D6 — Empty-state illustrations 🔵 ⏱
Replace text-only empty states with subtle line-art cricket illustrations (bat + ball + ground). Adds delight without breaking heritage tone.

---

## E. Data / Intelligence

### E1 — AI Constitution Q&A 🔥 ⏱⏱⏱
Claude Sonnet 4.5 RAG over the constitution PDF (already attached on the plan page). Floating ask-anything widget on every protected page.
- **Why**: turns the ERP into a literal living advisor for office-bearers. "Can the Hon. Secretary sanction ₹2 lakh without committee approval?" → cites Article XIV directly.
- **Phase**: Phase V

### E2 — Smart Search across everything 🟠 ⏱⏱
Top-bar global search: type "Jabalpur" → instantly surfaces matching members, meetings held in Jabalpur, transactions tagged Jabalpur.

### E3 — Predictive Renewal Risk 🔵 ⏱⏱
Flag members likely to lapse this cycle based on past payment timeliness + last-attendance. Treasurer sees a "Top 5 at-risk renewals" tile.

### E4 — Selection Stats Layer 🟠 ⏱⏱⏱
Once Player Registration is live, layer in BCCI career stats via scraping or an open API. Member profile becomes a mini Cricbuzz page.

---

## F. Branding / Distribution

### F1 — OpenGraph & favicon polish 🟠 ⏱
Set up og:image (the MPCA crest on pitch-green), proper title/description so when the public verify URL is shared on WhatsApp it looks premium.

### F2 — `/about` page 🟠 ⏱
A heritage timeline of MPCA (1956 → today) with milestones (BCCI affiliation, hosting Ranji finals, current office). Anchors the public face.

### F3 — Press Kit page 🔵 ⏱
`/press` — logos, official photos, recent disclosures, contact, downloadable as a zip for journalists.

### F4 — Embeddable Member Verification Widget 🔵 ⏱⏱
Other cricket bodies can `<iframe src="/verify/MPCA-IND-0001">` to validate before letting an MPCA member into their tournament. Tiny lift; positions MPCA as the canonical authority.

---

## G. Accessibility / Inclusivity

### G1 — WCAG AA pass 🟠 ⏱⏱
Audit contrast (current heritage palette is already strong); ensure all images have alt text, all interactive elements have aria-labels, keyboard navigation throughout.

### G2 — Hindi (हिंदी) toggle 🔥 ⏱⏱⏱
Member-portal-first. Lift in trust + reach in MP enormously. Use i18next; start with portal, verify, public disclosures.

### G3 — Screen-reader optimised "Public Bulletin" 🔵 ⏱
Year groupings as proper `<section>`s; disclosure types as `<header>` with explicit role; reader-friendly skip links.

---

## H. Suggested Final Optimisation Pass (recommended order)

Once Phase V is shipped, take **1 sprint (≈ 1 week)** in this order:

1. **D2** MongoDB indices (½ hr · perf foundation)
2. **A1** Real payment gateway (most ROI of any single feature)
3. **C1** Audit log (governance defensibility)
4. **D1** Local QR (offline-safe printing)
5. **B1** Squad reveal (social moment)
6. **A3** Auto late-fee cron (treasurer relief)
7. **C4** Annual Report auto-page (kills manual work)
8. **G2** Hindi toggle (reach)
9. **D5** Mobile ledger cards
10. **F1** OpenGraph polish

That single sprint moves the product from "great prototype" to "we can announce this at the AGM."

---

## I. "If we had infinite time" — moonshots

- **Live scoring integration**: pull live MP match scoreboards onto a public dashboard
- **District App roll-out**: white-label the ERP for each affiliated District Association — they pay a SaaS fee back to MPCA
- **Player marketplace**: BCCI-compliant player exchange/loan between affiliated clubs
- **Sponsor portal**: dedicated sponsor-facing dashboard showing branding placements, audit access
- **Holographic ID cards** (mobile NFC tap-to-verify at the stadium) — hardware project

---

> **How to use this list**: When we wrap Phases IV–V, scan section H first, then cherry-pick from A/B/C based on what the office bearers find most urgent. Most items here are 1-day or 2-day lifts.
