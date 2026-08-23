/**
 * /storyline — MPCA ERP · 15-minute AI Stakeholder Pitch (Iter 127)
 * ──────────────────────────────────────────────────────────────────
 * A click-through horizontal deck for a leading-stakeholder audience.
 * Argues ONE thing: AI applied to cricket's operational backbone — not
 * on-field analytics — is where the transformation happens. The deck
 * builds a four-layer framework (Ingest → Structure → Reason → Judge)
 * and hangs three product deep-dives (Grants · Player Registration ·
 * Squad Selection) off it. Closes with an open, non-BCCI ask that
 * positions MPCA as the innovation partner for the sport at large.
 *
 * ~13 slides · ~70 seconds each · ~15 minutes total.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { DL } from "@/lib/designSystem";
import {
    ArrowRight, ArrowLeft, X, Play, Eye, ExternalLink,
    FileCheck2, ShieldCheck, HandCoins, Users, GitBranch, ScrollText,
    Trophy, Landmark, Layers, Brain, Scale, Gavel, Database,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// Slide data — 13 slides total
// ═══════════════════════════════════════════════════════════════════

const SLIDES = [
    // ═══════════════════════════════════════════════════════════════
    // 01 · Cold open — the unseen half of cricket
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "what",
        eyebrow: "01 · Opening",
        overline: "The story nobody tells about AI in cricket",
        title: "Everyone talks about AI on the field. Nobody talks about AI in the file room.",
        subtitle: "Hawkeye, DRS, batter heatmaps — that is one percent of what AI can do for cricket. The other ninety-nine percent is the file room: grants, eligibility, tournament wiring, division books. That is where a talented U-16 from Rewa either gets to play or never gets seen. This is a story about applying AI to that half.",
        pains: [
            { value: "1%",  label: "of AI-in-cricket lives on the field" },
            { value: "99%", label: "lives in the file room · today, still manual" },
            { value: "3,000+", label: "Players. Every KYC verified by hand." },
            { value: "40+",  label: "Tournaments a year · every squad, every rupee" },
            { value: "10",   label: "Divisions × 20+ grant schemes = one permanent backlog" },
            { value: "0",    label: "Machine-readable audit trail before this" },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // 02 · The reality — four quadrants of pain
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "what",
        eyebrow: "02 · The Reality",
        overline: "Where cricket administration actually lives today",
        title: "Four backlogs. All manual. All growing.",
        subtitle: "Every state cricket association runs on the same four rails — Grants, Player Registration, Tournament Management, Division Administration. Each rail is a paper-and-memory pipeline that scales linearly with headcount. Hire a person, process one more file a day.",
        pains: [
            { value: "8 weeks", label: "Grants · one reimbursement claim, end-to-end" },
            { value: "24,000",  label: "Invoice line-items keyed by hand each year" },
            { value: "15-30 min", label: "Player Reg · to verify ONE document" },
            { value: "Squad-lock", label: "when missing KYC surfaces · forced drop-outs" },
            { value: "6 hrs",    label: "Tournament · per selection meeting" },
            { value: "3-5 days", label: "Division Admin · per single approval hop" },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // 03 · The false choice — analytics vs administration
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "why",
        eyebrow: "03 · The Insight",
        title: "\"AI in cricket\" ≠ analytics.",
        subtitle: "The industry conflates AI in cricket with what happens on television — ball tracking, decision reviews, player heatmaps. That is one narrow application. Cricket's real cognitive burden is off the field — and it has been waiting for its turn.",
        columns: [
            {
                heading: "What the world builds today",
                accent: "gold",
                items: [
                    "Ball tracking and pitch maps",
                    "Batter and bowler heatmaps",
                    "Fantasy scoring and match predictions",
                    "Broadcast-side highlight reels",
                    "Wearable performance analytics",
                ],
            },
            {
                heading: "What still runs on paper",
                accent: "emerald",
                items: [
                    "Player registration & KYC · Aadhaar, DOB, marksheets",
                    "Eligibility · 7 canonical tags, 34 age brackets, medical",
                    "Grant application → sanction → disbursal → claim",
                    "Squad selection with KYC audit",
                    "Approval chains · who signs first, then who, then who",
                    "Immutable audit for every scheme rupee",
                ],
            },
        ],
        punch: "It is easier to build DRS than to build audit-grade approval workflows for a state cricket association. But only one of the two is a governance problem — and only one of them scales to every state in the country.",
    },

    // ═══════════════════════════════════════════════════════════════
    // 04 · The framework — Ingest / Structure / Reason / Judge  ⭐
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "framework",
        eyebrow: "04 · The Framework",
        title: "We didn't automate cricket administration. We gave it a brain.",
        subtitle: "Most digital transformation projects stop at Layer 1 — they scan documents and file them. We built up to Layer 4, where a human is no longer a data-entry clerk verifying documents, but a judge acting on a signed, evidenced recommendation.",
        layers: [
            {
                n: 1, slug: "ingest", icon: Database, name: "Ingest",
                what: "Vision AI reads every document — Aadhaar, birth cert, marksheet, invoice, signed PDF — and returns structured fields with confidence scores.",
                example: "e.g. Birth Certificate → DOB 2008-08-04 · QR verified · confidence 0.95",
            },
            {
                n: 2, slug: "structure", icon: Layers, name: "Structure",
                what: "The association's real rulebook is encoded as configurable data — 34 age brackets, 20+ grant schemes, 7 eligibility tags, per-scheme rate cards — editable by SysAdmin without a redeploy.",
                example: "e.g. Local/Residence rule = residency ≥ 3 months · editable season-over-season",
            },
            {
                n: 3, slug: "reason", icon: Brain, name: "Reason",
                what: "For every case, the engine walks the rules, matches Layer 1 evidence, promotes AI-extracted values into missing form fields, and emits a recommendation with a full per-rule trail.",
                example: "e.g. player recommended Local/Residence because Aadhaar 2016 → 129 months resident, Birth Cert corroborates DOB, Marksheet confirms Gwalior schooling",
            },
            {
                n: 4, slug: "judge", icon: Gavel, name: "Judge",
                what: "The human sees the recommendation, the evidence, the confidence, the trail — and DECIDES. Every override is signed, dated, and audit-logged. The reviewer stops being a clerk and becomes a judge.",
                example: "e.g. MPCA reviewer clicks Approve on 60 green-chip invoices in one action, and only debates the 4 amber ones",
            },
        ],
        punch: "Everyone builds Layer 1. Most stop there. We built all four. That is the difference between digitising paperwork and giving the paperwork a brain.",
    },

    // ═══════════════════════════════════════════════════════════════
    // 05 · Deep-dive #1 · Grants — intro
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "grants",
        bucketLabel: "Deep-Dive 01 · Grants",
        eyebrow: "05 · Grants — the biggest backlog",
        icon: HandCoins,
        title: "Every scheme rupee — traced from headquarters to the boundary rope.",
        subtitle: "An association disburses grants across 20+ schemes — Grounds, U-16 camps, Vacation camps, Coaching allowances, tournament reimbursements. Every rupee travels a six-step path: application, sanction, disbursal, spend, claim, reconciliation. Six chances for error. Six queues to sit in. When a Division fields 60 invoices for a single tournament, the association's Accounts desk becomes a permanent backlog.",
        pains: [
            "Divisions submit 40–60 scanned invoices per tournament in bulk",
            "Accounts opens each, keys it into a ledger, cross-checks the rate card line-by-line",
            "Applicable scheme head and budget-head mapping done mentally — errors slip through",
            "Duplicates across tournaments spotted only if someone happens to notice",
            "Inflated per-diem, mileage, accommodation rates paid quietly · 2–4% leakage / year",
            "Divisions wait 2+ months for payment · officers front the money from their own pockets",
        ],
        aiCount: 2,
        aiPreview: "Two features close this gap: a per-invoice AI Diff chip that verifies each attachment against the typed fields at extraction time, and a one-click Tournament AI Audit that rolls up Approved / Needs-Review / Rejected + eligible reimbursement before the Division even submits.",
    },
    {
        kind: "feature",
        bucketId: "grants",
        icon: HandCoins,
        eyebrow: "Grants · Deep-Dive",
        featureName: "AI Diff · Per-invoice + Tournament AI Audit",
        problem: "A 60-invoice claim used to consume two days of Accounts time before it even reached MPCA. Anything that slipped through the desk sat in an inbox chain for weeks.",
        aiVerb: "VERIFIES & ROLLS UP",
        aiDescription: "Every uploaded invoice is auto-diffed against the typed vendor / date / amount fields. Green chip if the file matches; amber if it doesn't, with the mismatch spelled out. One button runs the tournament-wide audit that classifies all invoices into Approved / Needs-Review / Rejected + eligible reimbursement ₹, before the claim even leaves the Division. MPCA then approves the ambers — not the greens.",
        metric: { before: "1–2 days", after: "≤ 90 seconds", label: "per claim · AI verification time" },
        seasonSave: "≈ 600 staff-hours · 2-4% leakage recoverable",
        dividend: "= reinvested into pitch covers, sight-screens, roller repairs across districts",
        livePage: { label: "Reimbursement Claim Review", path: "/reimbursement-claims" },
    },

    // ═══════════════════════════════════════════════════════════════
    // 06 · Deep-dive #2 · Player Registration — intro + feature
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "players",
        bucketLabel: "Deep-Dive 02 · Player Registration",
        eyebrow: "06 · Player Registration — from guessing to certainty",
        icon: Users,
        title: "The player pipeline was manual from Aadhaar to Ranji.",
        subtitle: "Every one of an association's registered players is a paperwork chain: Aadhaar, DOB proof, school marksheet, Samagra ID, medical, KYC completeness, and a dozen eligibility rules. Each of those signals lived in a different sheet. When a typo in a DOB got missed at registration, an entire squad could be disqualified post-fact after a rival's protest — three months later.",
        pains: [
            "Registration officer opens every Aadhaar / DOB proof individually and copies fields by hand",
            "Name spellings reconciled across form, Aadhaar, birth cert, marksheets — mismatches missed under time pressure",
            "DOB checked line-by-line against 34 BCCI age brackets on a shared spreadsheet",
            "Residency, education, and prior-play thresholds interpreted differently by every reviewer",
            "One typo in a DOB = an entire squad disqualified post-fact",
            "KYC completeness surfaces only at squad-lock — forcing last-minute drop-outs",
        ],
        aiCount: 2,
        aiPreview: "Vision AI extracts every uploaded document; the Eligibility Engine walks the association's rulebook, promotes AI-extracted values into missing form fields, and emits a per-rule verification trail. Every reviewer's screen shows the same signed reasoning.",
    },
    {
        kind: "feature",
        bucketId: "players",
        icon: ShieldCheck,
        eyebrow: "Players · Deep-Dive",
        featureName: "AI Eligibility Engine · Verification Trail",
        problem: "Reviewers were guessing. Data fields on the form were often left empty, KYC docs weren't cross-referenced with the rulebook, and no two reviewers ever gave the same verdict on the same borderline case.",
        aiVerb: "REASONS & RECOMMENDS",
        aiDescription: "The engine walks the association's sequential eligibility decision tree, one rule at a time. When a typed field is empty, it promotes the AI-extracted value from the corresponding KYC document — Aadhaar's enrolment year becomes residency proof, marksheet institute becomes education proof, birth certificate DOB corroborates identity. Every rule check emits a passed/failed verdict + the exact document that backed it. The reviewer sees the recommendation and every citation on one screen; overrides need a signed reason or an evidence document.",
        metric: { before: "15–30 min/doc", after: "seconds", label: "per player · verification time" },
        seasonSave: "≈ 450 staff-hours · zero post-hoc disqualifications",
        dividend: "= selectors focus on cricket, reviewers focus on judgement",
        livePage: { label: "Player Detail · Verification Trail", path: "/players" },
    },

    // ═══════════════════════════════════════════════════════════════
    // 07 · Deep-dive #3 · Squad Selection + KYC Audit
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "squads",
        bucketLabel: "Deep-Dive 03 · Squad Selection",
        eyebrow: "07 · Squad Selection — where the game is nearly lost",
        icon: Trophy,
        title: "40 tournaments a year. Every squad decided by memory.",
        subtitle: "A single tournament touches selection meetings, signed squad PDFs, umpire postings, ground bookings and fixture releases. Multiply by 40. Squads were argued from memory in six-hour rooms. The signed PDF then floated across three inboxes as slightly-different versions. Kit, travel, jersey numbers misaligned on day one because the source list drifted.",
        pains: [
            "Selection committee sits with paper stat sheets · names debated from memory, not data",
            "6+ hours per meeting × 15 meetings a year gone to spreadsheet crunching",
            "Player KYC gaps surface AT squad-lock · last-minute drop-outs shake the squad",
            "Signed squad PDF re-typed by every recipient into their own local sheet",
            "Three slightly-different versions float across the association, Divisions and Managers",
        ],
        aiCount: 2,
        aiPreview: "AI recommends the shortlist with pre-audited KYC + eligibility, so selectors argue strategy, not paperwork. Post-selection, the signed squad PDF is parsed straight back into the ERP — version drift becomes impossible.",
    },
    {
        kind: "feature",
        bucketId: "squads",
        icon: Users,
        eyebrow: "Squads · Deep-Dive",
        featureName: "AI Squad Recommendation + KYC Audit",
        problem: "Selection meetings argued names from memory. KYC gaps surfaced at squad-lock — sometimes AFTER announcement — forcing last-minute drop-outs and shaking the squad's confidence.",
        aiVerb: "SHORTLISTS & CLEARS",
        aiDescription: "The engine ranks every eligible player against role, recent form, and past appearances; in parallel it audits KYC (Aadhaar, PAN, medical, bank) and eligibility tag (Local / Guest / Ineligible). Selectors see a pre-cleared shortlist with a bias-analysis panel — the human then debates strategy and bench balance, not paperwork. Post-selection, the signed squad PDF is parsed on upload and cross-checked against the ERP's squad record; names, jersey numbers, roles, all locked to a single source of truth.",
        metric: { before: "6 hrs/meeting", after: "20 min", label: "squad-finalisation cycle" },
        seasonSave: "≈ 90 staff-hours · zero KYC-triggered drop-outs · zero version drift",
        dividend: "= kit, travel and jersey numbers align on the first attempt",
        livePage: { label: "Selection Console", path: "/selection-console" },
    },

    // ═══════════════════════════════════════════════════════════════
    // 08 · The Operating Truth — AI does the labour, humans do the leadership
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "why",
        eyebrow: "08 · The Operating Truth",
        title: "AI does the labour. Humans do the leadership.",
        subtitle: "Every AI decision in this system is advisory. Reviewers see the recommendation, the evidence, the confidence, the trail — and then they choose. We didn't build an autonomous agent. We built a cognitive prosthetic for the reviewer.",
        columns: [
            {
                heading: "What the AI is NOT",
                accent: "gold",
                items: [
                    "Not a judge · every verdict is a recommendation",
                    "Not autonomous · nothing auto-approves without a human click",
                    "Not opaque · every AI decision carries a trail + confidence",
                    "Not immutable · thresholds are SysAdmin-editable per season",
                    "Not replacing anyone · it removes drudgery, not seats",
                ],
            },
            {
                heading: "What the human becomes",
                accent: "emerald",
                items: [
                    "Reviews recommendations, not documents",
                    "Debates borderline cases, not spellings",
                    "Signs overrides that are audit-logged forever",
                    "Focuses on strategy, mentorship, negotiation",
                    "Stops being a clerk · starts being a decision-maker",
                ],
            },
        ],
        punch: "The reviewer stops typing and starts thinking. That is the return on AI, measured in the only metric that ultimately counts for an association: the quality of the decisions its leadership actually gets to make.",
    },

    // ═══════════════════════════════════════════════════════════════
    // 09 · What actually ships · consolidated impact
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "impact",
        eyebrow: "09 · What Actually Ships",
        title: "One working demonstrator. Six months. Every layer, end-to-end.",
        rows: [
            ["Player document verification",       "15–30 min",  "seconds"],
            ["Eligibility check per tournament",   "2 hrs",      "instant"],
            ["Per-invoice AI Diff",                "1–2 days",   "≤ 90 sec"],
            ["Tournament-wide AI Audit",           "manual roll-up",  "one click"],
            ["Squad-finalisation meeting",         "6 hrs",      "20 min"],
            ["Signed squad PDF → ERP sync",        "45 min",     "seconds"],
            ["Governance approval cycle",          "3–5 days",   "same day"],
        ],
        totals: [
            { value: "4",     label: "Cognitive layers · Ingest / Structure / Reason / Judge" },
            { value: "7",     label: "Canonical eligibility tags · rewritable per season" },
            { value: "20+",   label: "Grant schemes · encoded as data, not code" },
            { value: "100%",  label: "Signed, dated, immutable audit trail" },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // 10 · Closing · open, non-BCCI, MPCA-as-innovator
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "cta",
        eyebrow: "10 · The Ask",
        title: "This is the first proof-of-work.",
        body: "Every state cricket association in this country faces the same four backlogs — grants, player registration, tournament management, division administration. The rulebooks differ; the mechanics do not. Which means the same four-layer framework — Ingest, Structure, Reason, Judge — can be adapted to any of them, once we have shown it works at one.",
        body2: "That is what this working demonstrator does. It gives MPCA the standing to say: the innovation the sport has been waiting for outside the boundary rope, we built here first. We would like the mandate to keep building — and to be the association that reinvests this into cricket, wherever the sport needs it next.",
        stats: [
            { value: "4",      label: "Cognitive layers, one framework" },
            { value: "3",      label: "Deep-dives shown today · Grants · Players · Squads" },
            { value: "1",      label: "Working demonstrator · six months old" },
            { value: "Every",  label: "Cricket association can be next" },
        ],
        quote: "The industry thinks AI in cricket lives on the field. We chose to build the other ninety-nine percent — the file room, the rulebook, the audit trail — because that is where the sport actually decides who gets to play. MPCA would like to be the association that made that choice first.",
    },
];

// ═══════════════════════════════════════════════════════════════════
// Deck shell + slide renderers
// ═══════════════════════════════════════════════════════════════════

const emeraldBg = `radial-gradient(ellipse at 30% 20%, ${DL.emerald} 0%, ${DL.ink} 55%, #060d0c 100%)`;

export default function Storyline() {
    const [slide, setSlide] = useState(0);
    const [preview, setPreview] = useState(null); // { label, path, shot } | null
    const total = SLIDES.length;

    const next = useCallback(() => setSlide((s) => Math.min(total - 1, s + 1)), [total]);
    const prev = useCallback(() => setSlide((s) => Math.max(0, s - 1)), []);

    // Keyboard navigation
    useEffect(() => {
        const onKey = (e) => {
            if (preview) {
                if (e.key === "Escape") setPreview(null);
                return;
            }
            if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
            else if (e.key >= "1" && e.key <= "9") setSlide(Math.min(total - 1, Number(e.key) - 1));
            else if (e.key === "0") setSlide(total - 1); // 0 = last slide
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [next, prev, total, preview]);

    const current = SLIDES[slide];
    const progress = ((slide + 1) / total) * 100;

    return (
        <div
            className="fixed inset-0"
            data-testid="storyline-page"
            style={{ background: emeraldBg, color: DL.paper, fontFamily: DL.fontBody, overflow: "hidden" }}
        >
            <style>{`
                @keyframes slidefx { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: none; } }
                .storyline-slide-in > * { animation: slidefx 520ms cubic-bezier(0.22,1,0.36,1) both; }
                .storyline-slide-in > *:nth-child(2) { animation-delay: 90ms; }
                .storyline-slide-in > *:nth-child(3) { animation-delay: 180ms; }
                .storyline-slide-in > *:nth-child(4) { animation-delay: 270ms; }
                .storyline-slide-in > *:nth-child(5) { animation-delay: 360ms; }
            `}</style>

            {/* Progress bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.08)", zIndex: 5 }}>
                <div
                    data-testid="storyline-progress"
                    style={{
                        width: `${progress}%`, height: "100%", background: DL.gold,
                        transition: "width 320ms cubic-bezier(0.22,1,0.36,1)",
                        boxShadow: `0 0 12px ${DL.gold}`,
                    }}
                />
            </div>

            {/* Top-right controls */}
            <div style={{ position: "absolute", top: 28, right: 32, display: "flex", gap: 10, alignItems: "center", zIndex: 5 }}>
                <span
                    className="text-[11px] uppercase tracking-[0.24em] font-bold"
                    style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.9 }}
                    data-testid="storyline-counter"
                >
                    {String(slide + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
                <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.22em] font-bold transition-all"
                    style={{ fontFamily: DL.fontMono, color: DL.gold, border: `1px solid rgba(184,131,40,0.5)`, backdropFilter: "blur(8px)" }}
                    data-testid="storyline-exit"
                    title="Exit deck"
                >
                    <X size={11} strokeWidth={2.5} /> Exit
                </Link>
            </div>

            {/* Top-left brand */}
            <div style={{ position: "absolute", top: 28, left: 32, display: "flex", alignItems: "center", gap: 10, zIndex: 5 }}>
                <span
                    className="text-[11px] uppercase tracking-[0.28em] font-bold"
                    style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.85 }}
                >
                    MPCA · AI Pitch
                </span>
            </div>

            {/* Slide surface — items-start so tall slides (e.g. Grants with 7 pain items)
                don't push their content off the top of the viewport. Vertical
                padding + safe-center via margin-auto on inner keeps short
                slides visually centred. */}
            <div
                key={slide}
                className="storyline-slide-in absolute inset-0 flex items-start justify-center px-6 md:px-16 pt-14 pb-28"
                style={{ overflowY: "auto" }}
                data-testid={`storyline-slide-${slide}`}
            >
                <div className="w-full my-auto" style={{ maxWidth: 1400 }}>
                {current.kind === "what"          && <WhatSlide        data={current} />}
                {current.kind === "why"           && <WhySlide         data={current} />}
                {current.kind === "framework"     && <FrameworkSlide   data={current} />}
                {current.kind === "bucket_intro"  && <BucketIntroSlide data={current} />}
                {current.kind === "feature"       && <FeatureSlide     data={current} onLive={setPreview} />}
                {current.kind === "impact"        && <ImpactSlide      data={current} />}
                {current.kind === "cta"           && <CtaSlide         data={current} />}
                </div>
            </div>

            {/* Bottom controls */}
            <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 14, zIndex: 5 }}>
                <NavBtn onClick={prev} disabled={slide === 0} testid="storyline-prev">
                    <ArrowLeft size={16} strokeWidth={2.5} /> Prev
                </NavBtn>
                <div className="flex items-center gap-2" data-testid="storyline-dots">
                    {SLIDES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setSlide(i)}
                            data-testid={`storyline-dot-${i}`}
                            aria-label={`Go to slide ${i + 1}`}
                            className="rounded-full transition-all"
                            style={{
                                width: i === slide ? 24 : 7,
                                height: 7,
                                background: i === slide ? DL.gold : "rgba(184,131,40,0.35)",
                            }}
                        />
                    ))}
                </div>
                <NavBtn onClick={next} disabled={slide === total - 1} testid="storyline-next" primary>
                    Next <ArrowRight size={16} strokeWidth={2.5} />
                </NavBtn>
            </div>

            {/* Live-preview lightbox */}
            {preview && <LivePreview data={preview} onClose={() => setPreview(null)} />}
        </div>
    );
}

// ── Nav button ────────────────────────────────────────────────────
const NavBtn = ({ children, onClick, disabled, testid, primary }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        data-testid={testid}
        className="inline-flex items-center gap-2 rounded-full text-[12px] uppercase tracking-[0.22em] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
            fontFamily: DL.fontMono,
            padding: primary ? "10px 20px" : "9px 16px",
            background: primary ? DL.gold : "transparent",
            color: primary ? DL.ink : DL.gold,
            border: primary ? `1px solid ${DL.gold}` : `1px solid rgba(184,131,40,0.4)`,
            boxShadow: primary ? "0 14px 30px -12px rgba(184,131,40,0.6)" : "none",
            cursor: disabled ? "not-allowed" : "pointer",
        }}
    >
        {children}
    </button>
);

// ═══════════════════════════════════════════════════════════════════
// Slide 1 · WHAT · The Problem
// ═══════════════════════════════════════════════════════════════════
const WhatSlide = ({ data }) => (
    <div className="max-w-[1200px] w-full">
        <div className="text-center mb-9">
            <div className="text-[11px] uppercase tracking-[0.32em] font-bold mb-4" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                {data.eyebrow}
            </div>
            <div className="text-[11.5px] uppercase tracking-[0.22em] font-bold mb-5" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.55)" }}>
                {data.overline}
            </div>
            <h1
                className="text-[48px] md:text-[68px] leading-[1.05] tracking-tight mb-6"
                style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                data-testid="what-title"
            >
                {data.title}
            </h1>
            <p className="text-[17px] md:text-[19px] leading-[1.6] max-w-[860px] mx-auto" style={{ color: "rgba(245,239,230,0.78)" }}>
                {data.subtitle}
            </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.pains.map((p, i) => (
                <div
                    key={p.label}
                    className="p-5 rounded-md"
                    style={{
                        background: "rgba(139,31,31,0.10)",
                        border: "1px solid rgba(139,31,31,0.42)",
                        borderLeft: "3px solid #C24F4F",
                    }}
                    data-testid={`what-pain-${i}`}
                >
                    <div className="text-[36px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: "#E88787", fontWeight: 800 }}>
                        {p.value}
                    </div>
                    <div className="text-[12.5px] mt-2 leading-snug font-semibold" style={{ color: DL.paper }}>
                        {p.label}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════════════════
// Slide 2 · WHY · AI is the answer
// ═══════════════════════════════════════════════════════════════════
const WhySlide = ({ data }) => (
    <div className="max-w-[1200px] w-full">
        <div className="text-center mb-10">
            <div className="text-[11px] uppercase tracking-[0.32em] font-bold mb-5" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                {data.eyebrow}
            </div>
            <h1
                className="text-[44px] md:text-[62px] leading-[1.05] tracking-tight mb-6"
                style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                data-testid="why-title"
            >
                {data.title}
            </h1>
            <p className="text-[16px] md:text-[18px] leading-[1.6] max-w-[900px] mx-auto" style={{ color: "rgba(245,239,230,0.78)" }}>
                {data.subtitle}
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {data.columns.map((col) => (
                <div
                    key={col.heading}
                    className="p-6 rounded-md"
                    style={{
                        background: col.accent === "gold" ? "rgba(184,131,40,0.08)" : "rgba(13,59,46,0.30)",
                        border: `1px solid ${col.accent === "gold" ? "rgba(184,131,40,0.42)" : "rgba(43,110,89,0.6)"}`,
                    }}
                >
                    <div
                        className="text-[10.5px] uppercase tracking-[0.24em] font-bold mb-4"
                        style={{ fontFamily: DL.fontMono, color: col.accent === "gold" ? DL.gold : "#7EC49E" }}
                    >
                        {col.heading}
                    </div>
                    <ul className="space-y-3">
                        {col.items.map((it) => (
                            <li key={it} className="flex items-start gap-2.5 text-[14px] leading-[1.5]" style={{ color: DL.paper }}>
                                <span
                                    className="mt-2 h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ background: col.accent === "gold" ? DL.gold : "#7EC49E" }}
                                />
                                <span>{it}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>

        <blockquote
            className="text-[18px] md:text-[22px] leading-[1.5] italic max-w-[880px] mx-auto text-center px-6 py-5 rounded-md"
            style={{
                color: DL.paper,
                background: "rgba(184,131,40,0.06)",
                border: `1px solid ${DL.gold}`,
                borderLeft: `4px solid ${DL.gold}`,
            }}
            data-testid="why-punch"
        >
            {data.punch}
        </blockquote>
    </div>
);

// ═══════════════════════════════════════════════════════════════════
// Framework slide · The four-layer cognition stack
// Ingest → Structure → Reason → Judge. The intellectual crown jewel of
// the deck — everything downstream (grants, players, squads) reads back
// against these four layers.
// ═══════════════════════════════════════════════════════════════════
const FrameworkSlide = ({ data }) => (
    <div className="max-w-[1240px] w-full">
        <div className="text-center mb-8">
            <div className="text-[11px] uppercase tracking-[0.32em] font-bold mb-4" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                {data.eyebrow}
            </div>
            <h1
                className="text-[42px] md:text-[58px] leading-[1.05] tracking-tight mb-4"
                style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                data-testid="framework-title"
            >
                {data.title}
            </h1>
            <p className="text-[15px] md:text-[17px] leading-[1.55] max-w-[880px] mx-auto" style={{ color: "rgba(245,239,230,0.75)" }}>
                {data.subtitle}
            </p>
        </div>

        {/* Ladder — Layer 4 at the top, Layer 1 at the base */}
        <div className="flex flex-col-reverse gap-3 mb-7 max-w-[1080px] mx-auto">
            {data.layers.map((L, i) => {
                const Icon = L.icon;
                const isTop = i === data.layers.length - 1;
                return (
                    <div
                        key={L.name}
                        className="grid grid-cols-[auto_120px_1fr_1fr] items-center gap-4 md:gap-6 p-5 rounded-md relative"
                        style={{
                            background: isTop ? "rgba(184,131,40,0.14)" : "rgba(13,59,46,0.35)",
                            border: `1px solid ${isTop ? DL.gold : "rgba(43,110,89,0.55)"}`,
                            marginLeft: `${i * 22}px`,          // staircase inset for ladder feel
                        }}
                        data-testid={`framework-layer-${L.slug}`}
                    >
                        <div
                            className="w-10 h-10 rounded flex items-center justify-center shrink-0"
                            style={{
                                background: isTop ? DL.gold : "rgba(43,110,89,0.5)",
                                color: isTop ? DL.ink : DL.paper,
                            }}
                        >
                            <Icon size={18} strokeWidth={1.8} />
                        </div>
                        <div>
                            <div className="text-[9.5px] uppercase tracking-[0.24em] font-bold" style={{ fontFamily: DL.fontMono, color: isTop ? DL.gold : "#7EC49E" }}>
                                Layer {L.n}
                            </div>
                            <div className="text-[18px] md:text-[20px] leading-tight font-bold" style={{ fontFamily: DL.fontDisplay, color: DL.paper }}>
                                {L.name}
                            </div>
                        </div>
                        <div className="text-[13.5px] leading-[1.45]" style={{ color: DL.paper }}>
                            {L.what}
                        </div>
                        <div className="text-[12.5px] leading-[1.45] italic" style={{ color: "rgba(245,239,230,0.65)" }}>
                            {L.example}
                        </div>
                    </div>
                );
            })}
        </div>

        <blockquote
            className="text-[18px] md:text-[22px] leading-[1.5] italic max-w-[900px] mx-auto text-center px-6 py-5 rounded-md"
            style={{
                color: DL.paper,
                background: "rgba(184,131,40,0.06)",
                border: `1px solid ${DL.gold}`,
                borderLeft: `4px solid ${DL.gold}`,
            }}
            data-testid="framework-punch"
        >
            {data.punch}
        </blockquote>
    </div>
);

// ═══════════════════════════════════════════════════════════════════
// Bucket-intro slide · 3 total (Players · Tournaments · Money & Compliance)
// Establishes the sub-domain context before its 2-3 feature slides fire.
// ═══════════════════════════════════════════════════════════════════
const BucketIntroSlide = ({ data }) => {
    const Icon = data.icon;
    return (
        <div className="max-w-[1200px] w-full">
            {/* Bucket badge */}
            <div className="flex items-center justify-center mb-8">
                <div
                    className="inline-flex items-center gap-3 px-5 py-3 rounded-full"
                    style={{ background: "rgba(184,131,40,0.14)", border: `1.5px solid ${DL.gold}` }}
                >
                    <Icon size={22} strokeWidth={2.25} style={{ color: DL.gold }} />
                    <span className="text-[13px] uppercase tracking-[0.28em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                        {data.bucketLabel}
                    </span>
                </div>
            </div>

            <div className="text-center mb-10">
                <div className="text-[10.5px] uppercase tracking-[0.28em] font-bold mb-4" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.55)" }}>
                    {data.eyebrow}
                </div>
                <h1
                    className="text-[42px] md:text-[58px] leading-[1.05] tracking-tight mb-6"
                    style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                    data-testid="bucket-title"
                >
                    {data.title}
                </h1>
                <p className="text-[16px] md:text-[18px] leading-[1.6] max-w-[900px] mx-auto" style={{ color: "rgba(245,239,230,0.78)" }}>
                    {data.subtitle}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4 items-stretch">
                {/* LEFT — pain callouts */}
                <div
                    className="p-6 rounded-md"
                    style={{ background: "rgba(139,31,31,0.10)", border: "1px solid rgba(139,31,31,0.42)", borderLeft: "3px solid #C24F4F" }}
                >
                    <div className="text-[10.5px] uppercase tracking-[0.24em] font-bold mb-4" style={{ fontFamily: DL.fontMono, color: "#E88787" }}>
                        The manual pain
                    </div>
                    <ul className="space-y-3">
                        {data.pains.map((p) => (
                            <li key={p} className="flex items-start gap-2.5 text-[14px] leading-[1.5] font-semibold" style={{ color: DL.paper }}>
                                <span className="mt-2 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#E88787" }} />
                                <span>{p}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* RIGHT — AI answer preview */}
                <div
                    className="p-6 rounded-md flex flex-col"
                    style={{ background: "rgba(13,59,46,0.30)", border: "1px solid rgba(43,110,89,0.6)", borderLeft: `3px solid ${DL.gold}` }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-[10.5px] uppercase tracking-[0.24em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                            AI&apos;s answer
                        </div>
                        <div
                            className="inline-flex items-baseline gap-1.5 px-3 py-1 rounded-full"
                            style={{ background: DL.gold, color: DL.ink, fontFamily: DL.fontMono }}
                        >
                            <span className="text-[15px] font-bold leading-none">{data.aiCount}</span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">AI features</span>
                        </div>
                    </div>
                    <p className="text-[14px] leading-[1.6] font-semibold flex-1" style={{ color: DL.paper }}>
                        {data.aiPreview}
                    </p>
                    <div className="mt-4 text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.55)" }}>
                        ↓ Next: watch each one in action
                    </div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// Slide 2-8 · AI Feature slide
// ═══════════════════════════════════════════════════════════════════
const FeatureSlide = ({ data, onLive }) => {
    const Icon = data.icon;
    return (
        <div className="max-w-[1280px] w-full grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
            {/* LEFT — problem + AI verb */}
            <div>
                <div className="flex items-center gap-3 mb-6">
                    <div
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{ background: "rgba(184,131,40,0.16)", border: "1px solid rgba(184,131,40,0.4)" }}
                    >
                        <Icon size={20} strokeWidth={2.25} style={{ color: DL.gold }} />
                    </div>
                    <div className="text-[10.5px] uppercase tracking-[0.28em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                        {data.eyebrow} · {data.featureName}
                    </div>
                </div>

                <div className="mb-8">
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold mb-3" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.55)" }}>
                        The Problem · Today
                    </div>
                    <h2
                        className="text-[30px] md:text-[38px] leading-[1.15] tracking-tight"
                        style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                        data-testid="feature-problem"
                    >
                        {data.problem}
                    </h2>
                </div>

                <div>
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold mb-3" style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.85 }}>
                        AI · Now
                    </div>
                    <div
                        className="text-[64px] md:text-[88px] leading-[0.95] tracking-tight mb-4"
                        style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.gold, letterSpacing: "-0.02em" }}
                        data-testid="feature-verb"
                    >
                        {data.aiVerb}
                    </div>
                    <p className="text-[15.5px] md:text-[17px] leading-[1.55] max-w-[560px]" style={{ color: "rgba(245,239,230,0.78)" }}>
                        {data.aiDescription}
                    </p>
                </div>
            </div>

            {/* RIGHT — headline metric + live preview */}
            <div>
                <div
                    className="p-8 md:p-10 rounded-md mb-5"
                    style={{
                        background: "linear-gradient(180deg, rgba(184,131,40,0.14) 0%, rgba(184,131,40,0.04) 100%)",
                        border: "1.5px solid rgba(184,131,40,0.44)",
                        boxShadow: "0 30px 60px -30px rgba(184,131,40,0.35)",
                    }}
                    data-testid="feature-metric-card"
                >
                    <div className="text-[10.5px] uppercase tracking-[0.24em] font-bold mb-6" style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.9 }}>
                        Impact · Measured
                    </div>

                    <div className="flex items-baseline gap-4 mb-6">
                        <div className="text-[28px] md:text-[34px] line-through leading-none" style={{ fontFamily: DL.fontDisplay, color: "rgba(245,239,230,0.45)", fontWeight: 700 }}>
                            {data.metric.before}
                        </div>
                        <ArrowRight size={22} strokeWidth={2.5} style={{ color: DL.gold }} />
                        <div className="text-[52px] md:text-[64px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: DL.paper, fontWeight: 800 }} data-testid="feature-metric-after">
                            {data.metric.after}
                        </div>
                    </div>
                    <div className="text-[13px] uppercase tracking-[0.2em] font-bold mb-8" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.62)" }}>
                        {data.metric.label}
                    </div>

                    <div className="pt-6" style={{ borderTop: "1px dashed rgba(184,131,40,0.34)" }}>
                        <div className="text-[15.5px] font-bold mb-2" style={{ color: DL.gold, fontFamily: DL.fontBody }}>
                            {data.seasonSave}
                        </div>
                        <div className="text-[13.5px] leading-[1.55] italic" style={{ color: "rgba(245,239,230,0.72)" }}>
                            {data.dividend}
                        </div>
                    </div>
                </div>

                {/* See it live */}
                <button
                    onClick={() => onLive(data.livePage)}
                    data-testid="feature-see-live"
                    className="w-full inline-flex items-center justify-between gap-2 px-6 py-4 rounded-md text-[13px] uppercase tracking-[0.22em] font-bold transition-all"
                    style={{
                        background: DL.paper,
                        color: DL.emerald,
                        border: "1.5px solid rgba(184,131,40,0.5)",
                        fontFamily: DL.fontMono,
                        boxShadow: "0 8px 22px -10px rgba(255,255,255,0.35)",
                        cursor: "pointer",
                    }}
                >
                    <span className="inline-flex items-center gap-2">
                        <Play size={13} strokeWidth={2.5} /> See it live in the ERP
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: DL.gold }}>
                        {data.livePage.label} →
                    </span>
                </button>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// Slide 9 · Impact ledger
// ═══════════════════════════════════════════════════════════════════
const ImpactSlide = ({ data }) => (
    <div className="max-w-[1200px] w-full">
        <div className="text-center mb-10">
            <div className="text-[11px] uppercase tracking-[0.28em] font-bold mb-3" style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.9 }}>
                {data.eyebrow}
            </div>
            <h2 className="text-[42px] md:text-[54px] leading-[1.05] tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }} data-testid="impact-title">
                {data.title}
            </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-8 items-start">
            {/* Ledger table */}
            <div
                className="p-6 rounded-md"
                style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(184,131,40,0.25)" }}
            >
                <div className="grid grid-cols-[1.7fr_1fr_1fr] gap-3 pb-3 border-b" style={{ borderColor: "rgba(184,131,40,0.35)" }}>
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.6)" }}>Manual routine</div>
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.6)" }}>Before</div>
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>After · AI</div>
                </div>
                {data.rows.map(([metric, before, after]) => (
                    <div key={metric} className="grid grid-cols-[1.7fr_1fr_1fr] gap-3 py-3 border-b" style={{ borderColor: "rgba(184,131,40,0.14)" }}>
                        <div className="text-[13.5px] font-semibold" style={{ color: DL.paper }}>{metric}</div>
                        <div className="text-[13px]" style={{ color: "rgba(245,239,230,0.6)" }}>{before}</div>
                        <div className="text-[14px] font-bold" style={{ color: DL.gold }}>{after}</div>
                    </div>
                ))}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-3">
                {data.totals.map((t) => (
                    <div
                        key={t.label}
                        className="p-4 rounded-md"
                        style={{ background: "rgba(184,131,40,0.10)", border: "1px solid rgba(184,131,40,0.4)" }}
                    >
                        <div className="text-[32px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: DL.gold, fontWeight: 800 }}>
                            {t.value}
                        </div>
                        <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold mt-2" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.7)" }}>
                            {t.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════════════════
// Slide 10 · CTA
// ═══════════════════════════════════════════════════════════════════
const CtaSlide = ({ data }) => (
    <div className="max-w-[1120px] w-full text-center">
        <div className="text-[11px] uppercase tracking-[0.32em] font-bold mb-5" style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.9 }}>
            {data.eyebrow}
        </div>
        <h1
            className="text-[46px] md:text-[68px] leading-[1.05] tracking-tight mb-8"
            style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
            data-testid="cta-title"
        >
            {data.title}
        </h1>
        <p className="text-[17px] md:text-[19px] leading-[1.65] max-w-[860px] mx-auto mb-4" style={{ color: "rgba(245,239,230,0.78)" }}>
            {data.body}
        </p>
        <p className="text-[17px] md:text-[19px] leading-[1.65] max-w-[860px] mx-auto mb-10" style={{ color: "rgba(245,239,230,0.78)" }}>
            {data.body2}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 max-w-[900px] mx-auto">
            {data.stats.map((s) => (
                <div
                    key={s.label}
                    className="p-5 rounded-md"
                    style={{ background: "rgba(184,131,40,0.10)", border: "1px solid rgba(184,131,40,0.4)" }}
                >
                    <div className="text-[38px] leading-none" style={{ fontFamily: DL.fontDisplay, color: DL.gold, fontWeight: 800 }}>
                        {s.value}
                    </div>
                    <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold mt-2" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.72)" }}>
                        {s.label}
                    </div>
                </div>
            ))}
        </div>

        <blockquote
            className="text-[19px] md:text-[22px] leading-[1.55] italic max-w-[820px] mx-auto"
            style={{ color: DL.paper, borderLeft: `2px solid ${DL.gold}`, paddingLeft: 20, textAlign: "left" }}
        >
            {data.quote}
        </blockquote>
    </div>
);

// ═══════════════════════════════════════════════════════════════════
// Live-preview lightbox — iframes the ACTUAL live page (same origin so the
// stakeholder sees the current UI + real data if signed in). Fallback to
// "Open in new tab" if the iframe fails to load.
// ═══════════════════════════════════════════════════════════════════
const LivePreview = ({ data, onClose }) => {
    // Iter 119 — same-origin iframe captures keyboard focus, so a window-
    // level keydown never fires. We (a) autofocus the overlay div in case
    // the user has not yet clicked into the iframe, AND (b) also attach the
    // Escape listener to the iframe's contentDocument on load (works because
    // the iframe is same-origin).
    const overlayRef = React.useRef(null);
    const iframeRef = React.useRef(null);
    React.useEffect(() => { overlayRef.current?.focus(); }, []);
    const handleKey = React.useCallback((e) => {
        if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }, [onClose]);
    const attachToIframe = () => {
        try {
            const doc = iframeRef.current?.contentDocument;
            if (doc) doc.addEventListener("keydown", handleKey);
        } catch (_) { /* cross-origin — ignore, X button still works */ }
    };
    return (
    <div
        ref={overlayRef}
        tabIndex={-1}
        onKeyDown={handleKey}
        onClick={onClose}
        data-testid="live-preview-overlay"
        style={{
            position: "fixed", inset: 0, zIndex: 20,
            background: "rgba(6, 13, 12, 0.88)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            outline: "none",
        }}
    >
        <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[1400px] rounded-lg overflow-hidden flex flex-col"
            style={{ background: DL.paper, boxShadow: "0 40px 100px rgba(0,0,0,0.6)", height: "88vh" }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-6 py-3 shrink-0"
                style={{ background: DL.emerald, color: DL.paper, borderBottom: `2px solid ${DL.gold}` }}
            >
                <div className="flex items-center gap-3">
                    <Eye size={16} strokeWidth={2.5} style={{ color: DL.gold }} />
                    <span className="text-[11px] uppercase tracking-[0.24em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                        Live · {data.label}
                    </span>
                    <span className="text-[10.5px] uppercase tracking-[0.2em]" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.55)" }}>
                        {data.path}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={data.path}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10.5px] uppercase tracking-[0.22em] font-bold transition-all"
                        style={{ fontFamily: DL.fontMono, color: DL.emerald, background: DL.gold }}
                        data-testid="live-preview-open-page"
                    >
                        <ExternalLink size={11} strokeWidth={2.5} /> Open in new tab
                    </a>
                    <button
                        onClick={onClose}
                        data-testid="live-preview-close"
                        className="w-8 h-8 rounded-full inline-flex items-center justify-center"
                        style={{ background: "rgba(255,255,255,0.14)", color: DL.paper }}
                    >
                        <X size={14} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Live iframe — same origin so JWT in localStorage works */}
            <iframe
                ref={iframeRef}
                onLoad={attachToIframe}
                title={`Live · ${data.label}`}
                src={data.path}
                data-testid="live-preview-iframe"
                style={{ flex: 1, width: "100%", border: "none", background: DL.ivory }}
            />
        </div>
    </div>
    );
};
