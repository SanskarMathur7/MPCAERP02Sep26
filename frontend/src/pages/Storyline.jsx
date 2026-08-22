/**
 * /storyline — MPCA ERP · 10-minute AI Stakeholder Pitch (Iter 117)
 * ──────────────────────────────────────────────────────────────────
 * A click-through horizontal deck. One slide per screen, ~60 seconds
 * of talk per slide.
 *
 *   Slide 1 · Thesis
 *   Slide 2-8 · Seven AI features (problem → verb → metric → live preview)
 *   Slide 9 · Consolidated impact table
 *   Slide 10 · "38 State boards" call-to-action
 *
 * Interactions:
 *   · Left/Right arrow keys, Spacebar, click-Next, click-Back
 *   · Number keys 1-9 + 0 jump to slide
 *   · Progress bar, dots, slide counter
 *   · "See it live" opens a lightbox with the captured ERP screenshot
 *     + a link to open the real page in a new tab
 */
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { DL } from "@/lib/designSystem";
import {
    ArrowRight, ArrowLeft, X, Play, Eye, ExternalLink,
    FileCheck2, ShieldCheck, HandCoins, Users, GitBranch, ScrollText,
    Trophy, Landmark,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// Slide data — 10 slides total
// ═══════════════════════════════════════════════════════════════════

const SLIDES = [
    // ═══════════════════════════════════════════════════════════════
    // WHAT · The Problem
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "what",
        eyebrow: "WHAT · The Problem",
        overline: "The state of cricket administration today",
        title: "Cricket administration runs on paper, memory, and follow-up.",
        subtitle: "The Madhya Pradesh Cricket Association manages 10 Divisions, 40 tournaments a year, and thousands of players. Every action — until now — was manual. Every decision left a paper trail nobody could search.",
        pains: [
            { value: "15-30 min", label: "To verify ONE player document" },
            { value: "1-2 days",  label: "To verify ONE reimbursement invoice" },
            { value: "3-5 days",  label: "Every single approval hop" },
            { value: "6 hrs",     label: "Per squad-selection meeting" },
            { value: "8 weeks",   label: "End-to-end reimbursement" },
            { value: "0",         label: "Machine-readable audit trail" },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // WHY · AI is the answer
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "why",
        eyebrow: "WHY · The Insight",
        title: "AI does the pattern work. Humans do the judgement work.",
        subtitle: "Cricket administration is 80% pattern work — verifying documents, matching invoices, routing approvals, checking eligibility. AI is built for exactly that. Give machines the drudgery, and humans get 5× more time for the game itself.",
        columns: [
            {
                heading: "What humans do best",
                accent: "gold",
                items: [
                    "Selection judgement · reading a player's temperament",
                    "Strategy · playing conditions, opposition, bench balance",
                    "Negotiation · sponsors, vendors, BCCI liaison",
                    "Mentorship · coaching camps, talent scouting",
                    "Ceremony · presiding, presenting, representing",
                ],
            },
            {
                heading: "What AI does best",
                accent: "emerald",
                items: [
                    "OCR & extraction · Aadhaar, DOB, invoices, contracts",
                    "Cross-verification · DOB vs. bracket, rate vs. card",
                    "Routing · sending each request to the right actor, in order",
                    "Audit · stamping every action, immutably, forever",
                    "Pattern flagging · duplicates, outliers, non-standard clauses",
                ],
            },
        ],
        punch: "Cricket administrations don't need more staff. They need to hand the pattern work to AI.",
    },

    // ═══════════════════════════════════════════════════════════════
    // HOW · Bucket 1 — PLAYERS
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "players",
        bucketLabel: "Bucket 01 · Players",
        eyebrow: "HOW · Players",
        icon: Users,
        title: "The player pipeline was manual from Aadhaar to Ranji.",
        subtitle: "Every one of MPCA's 3,000+ registered players is a paperwork chain: Aadhaar, DOB proof, school certificate, medical, KYC, and a dozen eligibility checks. All of it, until now, done by hand — often at midnight, always under BCCI deadline pressure.",
        pains: [
            "Player-registration officer opens every Aadhaar / DOB proof individually and copies fields by hand",
            "Name spellings reconciled across form, Aadhaar and school certificate — mismatches missed under time pressure",
            "DOB checked line-by-line against 34 BCCI age brackets on a shared spreadsheet",
            "Medical clearance and gender criteria tracked in separate files — some players slip through",
            "One typo in a DOB = an entire squad disqualified post-fact after a rival's protest",
            "KYC completeness (bank / PAN / photo) surfaces only at squad-lock — forcing drop-outs",
        ],
        aiCount: 2,
        aiPreview: "Two AI features close this gap: AI Vision extracts every document in 30 seconds; the AI Eligibility Engine tags each player with every tournament they qualify for the instant they register.",
    },
    {
        kind: "feature",
        bucketId: "players",
        icon: FileCheck2,
        eyebrow: "Players · AI 01 / 02",
        featureName: "AI Vision · Player Document Verifier",
        problem: "Every field of every Aadhaar, DOB proof and school certificate cross-checked against the registration form — 1,200 documents a year.",
        aiVerb: "EXTRACTS",
        aiDescription: "AI Vision reads every document, extracts DOB / name / issuing authority, and flags mismatches inside 30 seconds per player.",
        metric: { before: "15-30 min", after: "30 sec", label: "per player · verification time" },
        seasonSave: "≈ 450 staff-hours saved per season",
        dividend: "= 45 extra district coaching visits or 15 talent-scouting camps",
        livePage: { label: "Player Registrations", path: "/player-registrations" },
    },
    {
        kind: "feature",
        bucketId: "players",
        icon: ShieldCheck,
        eyebrow: "Players · AI 02 / 02",
        featureName: "AI Eligibility Engine",
        problem: "Cross-checking each player's DOB / gender / medical against 34 BCCI tournament brackets under deadline pressure.",
        aiVerb: "TAGS",
        aiDescription: "The moment a player registers, AI tags them with every tournament they qualify for. Ineligible names become structurally unselectable in the squad picker.",
        metric: { before: "2 hrs/tournament", after: "Instant", label: "eligibility resolution" },
        seasonSave: "≈ 80 staff-hours saved · Zero post-hoc disqualifications",
        dividend: "= Ranji / U-19 / U-16 selectors focus on cricket, not spreadsheets",
        livePage: { label: "Player Register", path: "/players" },
    },

    // ═══════════════════════════════════════════════════════════════
    // HOW · Bucket 2 — TOURNAMENTS
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "tournaments",
        bucketLabel: "Bucket 02 · Tournaments",
        eyebrow: "HOW · Tournaments",
        icon: Trophy,
        title: "40 tournaments a year. Every squad decided by memory.",
        subtitle: "A single tournament touches selection meetings, signed squad PDFs, umpire postings, ground bookings and fixture releases. Multiply by 40. Squads were argued from memory in 6-hour rooms; the signed PDF then floated across three inboxes as slightly-different versions.",
        pains: [
            "Selection committee sits with paper stat sheets — names debated from memory, not data",
            "6+ hours per selection meeting × 15 meetings a year gone to spreadsheet crunching",
            "Player KYC gaps surface AT squad-lock — last-minute drop-outs shake the squad",
            "Signed squad PDF is emailed around; each recipient re-types names into their own sheet",
            "Three slightly-different versions of the squad float across MPCA, Divisions and Managers",
            "Jersey numbers, kit sizes and travel plans misalign on day one because the source list drifted",
        ],
        aiCount: 2,
        aiPreview: "Two AI features close this gap: AI recommends the squad with a pre-audited KYC list, and the Squad PDF Verifier parses the signed PDF straight back into the ERP — version drift becomes impossible.",
    },
    {
        kind: "feature",
        bucketId: "tournaments",
        icon: Users,
        eyebrow: "Tournaments · AI 01 / 02",
        featureName: "AI Squad Recommendation + KYC Audit",
        problem: "Selection meetings argue names from memory. KYC gaps surface at squad-lock — sometimes AFTER announcement — forcing last-minute drop-outs.",
        aiVerb: "RECOMMENDS",
        aiDescription: "AI ranks every eligible player against role, recent form and past appearances; parallelly it audits KYC (Aadhaar / PAN / bank / medical) and gives a pre-cleared shortlist.",
        metric: { before: "6 hrs/meeting", after: "20 min", label: "squad-finalisation cycle" },
        seasonSave: "≈ 90 staff-hours · Zero KYC-triggered drop-outs",
        dividend: "= Selectors debate strategy and bench balance, not paperwork",
        livePage: { label: "Selection Console", path: "/selection-console" },
    },
    {
        kind: "feature",
        bucketId: "tournaments",
        icon: FileCheck2,
        eyebrow: "Tournaments · AI 02 / 02",
        featureName: "AI Squad PDF Verifier",
        problem: "Post-selection, the signed squad PDF is emailed around. Every recipient re-types names into their local sheet — three slightly-different versions float around.",
        aiVerb: "PARSES",
        aiDescription: "The signed PDF is parsed on upload; names / roles / jersey numbers are cross-checked against the ERP's squad record and locked. Version drift is impossible.",
        metric: { before: "45 min/squad", after: "5 sec", label: "PDF-to-ERP sync" },
        seasonSave: "≈ 22 staff-hours · Zero version-drift incidents",
        dividend: "= Kit, travel, and jersey numbers align on the first attempt",
        livePage: { label: "Tournaments · Squads", path: "/tournaments" },
    },

    // ═══════════════════════════════════════════════════════════════
    // HOW · Bucket 3 — GRANTS
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "grants",
        bucketLabel: "Bucket 03 · Grants",
        eyebrow: "HOW · Grants",
        icon: HandCoins,
        title: "Every scheme rupee — traced from MPCA to the boundary rope.",
        subtitle: "MPCA disburses grants to 10 Divisions under 20+ schemes — Grounds, U-16 camps, Vacation camps, Coaching allowances, BCCI-linked reimbursements. Every rupee travels the same six-step path: application, sanction, disbursal, spend, claim, reconciliation. Six chances for error. Six queues to sit in.",
        pains: [
            "Divisions submit scanned invoices in bulk — often 40-60 per tournament",
            "Accounts opens each one, keys it into a ledger, cross-checks against rate cards line-by-line",
            "Applicable scheme head and budget-head mapping is a mental exercise — errors slip through",
            "10 Divisions × 40 tournaments = permanent claim backlog at the MPCA Accounts desk",
            "Duplicate invoices across tournaments discovered only if a sharp eye happens to spot them",
            "Inflated per-diem, mileage or accommodation rates paid quietly — 2-4% leakage / year",
            "Divisions wait 2+ months for payment — DA officers front the money from their own pockets",
        ],
        aiCount: 1,
        aiPreview: "One AI feature closes the entire gap: an AI Claim Engine OCRs every invoice, extracts vendor / amount / GST, matches against the applicable rate card and scheme head, and flags duplicates + inflation in 90 seconds.",
    },
    {
        kind: "feature",
        bucketId: "grants",
        icon: HandCoins,
        eyebrow: "Grants · AI 01 / 01",
        featureName: "AI Reimbursement Claim Verifier",
        problem: "10 Divisions × 40 tournaments × 40-60 invoices each. A backlog nobody could clear by hand.",
        aiVerb: "VERIFIES",
        aiDescription: "The AI Claim Engine OCRs every invoice, extracts vendor / amount / GST / date, matches against the applicable rate card, and flags duplicates + inflation.",
        metric: { before: "1-2 days", after: "90 seconds", label: "per claim · verification time" },
        seasonSave: "≈ 600 staff-hours + 2-4% leakage recovered",
        dividend: "= Reinvested into pitch covers, sight-screens, roller repairs across districts",
        livePage: { label: "Reimbursement Claims", path: "/reimbursement-claims" },
    },

    // ═══════════════════════════════════════════════════════════════
    // HOW · Bucket 4 — GOVERNANCE & COMPLIANCE
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "governance",
        bucketLabel: "Bucket 04 · Governance & Compliance",
        eyebrow: "HOW · Governance & Compliance",
        icon: Landmark,
        title: "The approval matrix lived in a Word doc. Everyone remembered it differently.",
        subtitle: "Every association action needs approvals in a specific order. Who signs first, who signs next, what amount triggers what escalation. When that logic lived in a Word doc, it lived nowhere at all.",
        pains: [
            "Approval matrix maintained as a Word document — copies drift, versions diverge",
            "Requests get sent to the wrong person, rebound, delay, or die in an inbox",
            "Nobody remembers whether the Cricket Manager or the Manager approves ₹40,000 extras",
            "Every signed contract / MoU / resolution is filed manually — legal review is line-by-line",
            "Non-standard clauses slip through when a lawyer runs out of time before signing week",
            "When BCCI or a district asks 'who approved this?' — the answer is buried in emails",
        ],
        aiCount: 2,
        aiPreview: "Two AI features close this gap: the Dynamic Wiring Engine encodes every approval chain as data and routes each request in the right order; the Signed-Doc Reviewer scans every contract for missing signatures and non-standard clauses.",
    },
    {
        kind: "feature",
        bucketId: "governance",
        icon: GitBranch,
        eyebrow: "Governance · AI 01 / 02",
        featureName: "Dynamic Wiring Engine — Workflow Orchestrator",
        problem: "Requests routed to the wrong person, then rebounded, then delayed. Nobody remembered who approved ₹40,000 extras — the Cricket Manager or the Manager.",
        aiVerb: "ROUTES",
        aiDescription: "Every action's approval chain is encoded as configurable data. The engine routes each request to the right actor, in the right order, with an immutable audit stamp.",
        metric: { before: "3-5 days", after: "Same day", label: "per approval cycle" },
        seasonSave: "≈ 500 staff-hours · 100% audit trail",
        dividend: "= Governance stops being policy and becomes architecture",
        livePage: { label: "Tournament Wiring", path: "/tournament-wiring" },
    },
    {
        kind: "feature",
        bucketId: "governance",
        icon: ScrollText,
        eyebrow: "Governance · AI 02 / 02",
        featureName: "AI Signed-Document Reviewer",
        problem: "Every signed contract / MoU / resolution is filed manually. Legal review is line-by-line — non-standard clauses slip through when deadlines are tight.",
        aiVerb: "REVIEWS",
        aiDescription: "AI scans each uploaded signed document, checks for missing signatures / dates / stamps, flags non-standard clauses against MPCA's template library.",
        metric: { before: "30-60 min/doc", after: "20 sec", label: "compliance sweep" },
        seasonSave: "≈ 150 staff-hours · Every clause traceable",
        dividend: "= Faster sponsor deals, faster kit contracts, faster prize disbursals",
        livePage: { label: "Document Management", path: "/dms" },
    },
    // ── Consolidated impact ────────────────────────────────────────
    {
        kind: "impact",
        eyebrow: "HOW · The bottom line",
        title: "Seven AI features. One product. Real numbers.",
        rows: [
            ["Player document verification",    "15-30 min",   "30 sec"],
            ["Eligibility check per tournament", "2 hrs",       "Instant"],
            ["Reimbursement claim per invoice",  "1-2 days",    "90 sec"],
            ["Squad-finalisation meeting",       "6 hrs",       "20 min"],
            ["Squad PDF → ERP sync",             "45 min",      "5 sec"],
            ["Signed-document compliance",       "30-60 min",   "20 sec"],
            ["Governance approval cycle",        "3-5 days",    "Same day"],
        ],
        totals: [
            { value: "1,700+",     label: "Staff-hours saved / season" },
            { value: "₹ Lakhs",    label: "Leakage recovered / year" },
            { value: "0",          label: "Manual disqualifications" },
            { value: "100%",       label: "Immutable audit trail" },
        ],
    },
    // ── CTA ─────────────────────────────────────────────────────────
    {
        kind: "cta",
        eyebrow: "The Ask",
        title: "This works for 38 state boards. And for the BCCI.",
        body: "Every state cricket association faces the same 16 pain points. Same Divisions, Districts, Tournaments, Camps, Officials, Players, Grants, Reimbursements, approval chains, audit obligations.",
        body2: "The MPCA ERP can be forked, re-branded and rolled out to all 38 state associations inside twelve months. Connect them to a single BCCI-level dashboard, and Indian cricket administration becomes fully digital, transparent, and AI-native.",
        stats: [
            { value: "38",      label: "State associations" },
            { value: "1",       label: "National dashboard" },
            { value: "12 mo.",  label: "To roll out" },
            { value: "100 cr+", label: "Indians impacted" },
        ],
        quote: "Cricket administration used to be a game of memory, paper, and follow-up. Today, thanks to the MPCA ERP and its AI, it is a game of clarity, evidence, and speed.",
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
