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
        subtitle: "1% lives on the field. 99% lives in the file room.",
        metaphor: "iceberg",
        pains: [
            { value: "3,000+", label: "Players. Every KYC verified by hand." },
            { value: "40+",    label: "Tournaments a year · every squad, every rupee" },
            { value: "10",     label: "Divisions × 20+ grant schemes = one permanent backlog" },
            { value: "0",      label: "Machine-readable audit trail before this" },
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
        subtitle: "Same four rails. Every association. Every year.",
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
        subtitle: "Two very different bodies of work.",
        columns: [
            {
                heading: "What the world builds today",
                accent: "gold",
                items: [
                    "Ball tracking",
                    "Player heatmaps",
                    "Fantasy predictions",
                    "Highlight reels",
                    "Wearable analytics",
                ],
            },
            {
                heading: "What still runs on paper",
                accent: "emerald",
                items: [
                    "Player KYC · registration",
                    "Eligibility · 34 age brackets",
                    "Grants · sanction to claim",
                    "Squad selection · audit",
                    "Approval chains",
                    "Rupee-level audit trail",
                ],
            },
        ],
        punch: "One is a broadcast problem. The other is a governance problem.",
    },

    // ═══════════════════════════════════════════════════════════════
    // 04 · The framework — Ingest / Structure / Reason / Judge  ⭐
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "framework",
        eyebrow: "04 · The Framework",
        title: "We didn't automate cricket administration. We gave it a brain.",
        subtitle: "Four layers. Most stop at one.",
        layers: [
            {
                n: 1, slug: "ingest", icon: Database, name: "Ingest",
                what: "Vision AI reads every KYC doc, invoice, signed PDF.",
                example: "Birth Certificate → DOB 2008-08-04 · confidence 0.95",
            },
            {
                n: 2, slug: "structure", icon: Layers, name: "Structure",
                what: "The rulebook, encoded as editable data.",
                example: "34 age brackets · 20+ schemes · 7 tags · SysAdmin-editable",
            },
            {
                n: 3, slug: "reason", icon: Brain, name: "Reason",
                what: "Walks the rules. Emits a signed recommendation.",
                example: "Local/Residence · Aadhaar 2016 → 129 months · Marksheet confirms",
            },
            {
                n: 4, slug: "judge", icon: Gavel, name: "Judge",
                what: "Human decides. Signed. Audit-logged.",
                example: "Approve 60 greens in one click. Debate 4 ambers.",
            },
        ],
        punch: "Everyone builds Layer 1. We built all four.",
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
        subtitle: "20+ schemes. Six-step pipeline. Zero traceability.",
        pains: [
            "40–60 scans per tournament",
            "Rate card checked line-by-line",
            "Budget head mapped from memory",
            "Duplicates hidden across seasons",
            "2–4% quiet leakage every year",
            "Officers front cash for 2+ months",
        ],
        aiCount: 2,
        aiPreview: "AI Diff chips per invoice. One-click tournament audit.",
    },
    {
        kind: "feature",
        bucketId: "grants",
        icon: HandCoins,
        eyebrow: "Grants · Deep-Dive",
        featureName: "AI Diff · Per-invoice + Tournament AI Audit",
        problem: "60 invoices. Two days of Accounts. Weeks in inbox chains.",
        aiVerb: "VERIFIES & ROLLS UP",
        aiDescription: "Every invoice auto-diffed against its PDF. One click rolls up the whole tournament. MPCA approves ambers, not greens.",
        metric: { before: "1–2 days", after: "≤ 90 seconds", label: "per claim · AI verification time" },
        seasonSave: "≈ 600 staff-hours · 2-4% leakage recoverable",
        dividend: "= reinvested into pitch covers, sight-screens, roller repairs across districts",
        livePage: { label: "Reimbursement Claim Review", path: "/reimbursement-claims" },
        mockup: "grants",
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
        subtitle: "One DOB typo · one disqualified squad · three months later.",
        pains: [
            "KYC fields copied by hand",
            "Name mismatches missed under pressure",
            "34 age brackets on a spreadsheet",
            "Every reviewer reads the rules differently",
            "One typo · one disqualified squad",
            "KYC gaps surface at squad-lock",
        ],
        aiCount: 2,
        aiPreview: "AI reads the docs. The engine walks the rules. Every reviewer sees the same reasoning.",
    },
    {
        kind: "feature",
        bucketId: "players",
        icon: ShieldCheck,
        eyebrow: "Players · Deep-Dive",
        featureName: "AI Eligibility Engine · Verification Trail",
        problem: "Reviewers guessed. No two verdicts ever matched.",
        aiVerb: "REASONS & RECOMMENDS",
        aiDescription: "Missing form fields? The engine promotes AI-extracted values from KYC docs. Every rule cites the exact document that backed it.",
        metric: { before: "15–30 min/doc", after: "seconds", label: "per player · verification time" },
        seasonSave: "≈ 450 staff-hours · zero post-hoc disqualifications",
        dividend: "= selectors focus on cricket, reviewers focus on judgement",
        livePage: { label: "Player Detail · Verification Trail", path: "/players" },
        mockup: "player",
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
        subtitle: "Six-hour rooms. Three versions of one squad list.",
        pains: [
            "Names debated from memory",
            "6 hrs/meeting × 15 meetings/year",
            "KYC gaps at squad-lock",
            "Signed PDF re-typed by every inbox",
            "Three drifting versions circulate",
        ],
        aiCount: 2,
        aiPreview: "Pre-cleared shortlist. Signed PDF parsed back. Version drift impossible.",
    },
    {
        kind: "feature",
        bucketId: "squads",
        icon: Users,
        eyebrow: "Squads · Deep-Dive",
        featureName: "AI Squad Recommendation + KYC Audit",
        problem: "Names from memory. KYC gaps after announcement.",
        aiVerb: "SHORTLISTS & CLEARS",
        aiDescription: "Ranks the pool. Audits KYC and eligibility. Selectors debate strategy, not paperwork.",
        metric: { before: "6 hrs/meeting", after: "20 min", label: "squad-finalisation cycle" },
        seasonSave: "≈ 90 staff-hours · zero KYC-triggered drop-outs · zero version drift",
        dividend: "= kit, travel and jersey numbers align on the first attempt",
        livePage: { label: "Selection Console", path: "/selection-console" },
        mockup: "squad",
    },

    // ═══════════════════════════════════════════════════════════════
    // 08 · The Operating Truth — AI does the labour, humans do the leadership
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "why",
        eyebrow: "08 · The Operating Truth",
        title: "AI does the labour. Humans do the leadership.",
        subtitle: "Every AI verdict is advisory. Humans always decide.",
        columns: [
            {
                heading: "What the AI is NOT",
                accent: "gold",
                items: [
                    "Not a judge · advisory only",
                    "Not autonomous · human click required",
                    "Not opaque · full trail + confidence",
                    "Not immutable · SysAdmin-editable",
                    "Not replacing anyone · removes drudgery",
                ],
            },
            {
                heading: "What the human becomes",
                accent: "emerald",
                items: [
                    "Reviews recommendations · not docs",
                    "Debates cases · not spellings",
                    "Signs overrides · audit-logged",
                    "Focuses on strategy · mentorship",
                    "Clerk → decision-maker",
                ],
            },
        ],
        punch: "The reviewer stops typing. Starts thinking.",
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
        body: "Same four backlogs. Same four-layer framework. Every association.",
        body2: "MPCA built this first. Standing to reinvest it into the sport.",
        stats: [
            { value: "4",      label: "Cognitive layers, one framework" },
            { value: "3",      label: "Deep-dives shown today · Grants · Players · Squads" },
            { value: "1",      label: "Working demonstrator · six months old" },
            { value: "Every",  label: "Cricket association can be next" },
        ],
        quote: "The industry chose the field. We chose the file room. That is where the sport actually decides who plays.",
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
                {current.kind === "feature"       && <FeatureSlide     data={current} />}
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
const IcebergDiagram = () => (
    <svg viewBox="0 0 700 340" style={{ width: "100%", maxWidth: 620, margin: "0 auto", display: "block" }} aria-hidden>
        {/* Waterline */}
        <line x1="0" y1="112" x2="700" y2="112" stroke="rgba(184,131,40,0.6)" strokeWidth="1" strokeDasharray="6 6" />
        <text x="0" y="104" fontFamily={DL.fontMono} fontSize="10.5" fill={DL.gold} letterSpacing="2">WATERLINE · WHAT THE SPORT SEES</text>
        {/* Above-water tip · 1% */}
        <polygon points="330,20 400,110 260,110" fill="rgba(245,239,230,0.92)" stroke={DL.gold} strokeWidth="1.5" />
        <text x="330" y="72" textAnchor="middle" fontFamily={DL.fontDisplay} fontWeight="800" fontSize="28" fill="#1A1F1D">1%</text>
        <text x="330" y="92" textAnchor="middle" fontFamily={DL.fontMono} fontSize="9.5" letterSpacing="1.5" fill="#5C5A54">ON-FIELD ANALYTICS</text>
        {/* Below-water bulk · 99% */}
        <polygon points="260,110 400,110 500,300 160,300" fill="rgba(13,59,46,0.85)" stroke={DL.gold} strokeWidth="1.5" opacity="0.95" />
        <text x="330" y="200" textAnchor="middle" fontFamily={DL.fontDisplay} fontWeight="800" fontSize="64" fill={DL.gold}>99%</text>
        <text x="330" y="226" textAnchor="middle" fontFamily={DL.fontMono} fontSize="10.5" letterSpacing="2" fill="rgba(245,239,230,0.85)">CRICKET ADMINISTRATION</text>
        <text x="330" y="250" textAnchor="middle" fontFamily={DL.fontBody} fontSize="12" fill="rgba(245,239,230,0.62)">Grants · Player Registration · Tournament wiring · Division books</text>
        {/* Reflection ripples */}
        <ellipse cx="330" cy="112" rx="220" ry="4" fill="none" stroke="rgba(184,131,40,0.28)" strokeWidth="0.6" />
        <ellipse cx="330" cy="112" rx="140" ry="2.5" fill="none" stroke="rgba(184,131,40,0.4)" strokeWidth="0.6" />
    </svg>
);

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
                className="text-[42px] md:text-[58px] leading-[1.05] tracking-tight mb-6"
                style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                data-testid="what-title"
            >
                {data.title}
            </h1>
            <p className="text-[15.5px] md:text-[17px] leading-[1.6] max-w-[860px] mx-auto" style={{ color: "rgba(245,239,230,0.78)" }}>
                {data.subtitle}
            </p>
        </div>

        {data.metaphor === "iceberg" && <IcebergDiagram />}

        <div className={"grid gap-3 " + (data.metaphor === "iceberg" ? "grid-cols-2 md:grid-cols-4 mt-6" : "grid-cols-2 md:grid-cols-3")}>
            {data.pains.map((p, i) => (
                <div
                    key={p.label}
                    className="p-4 rounded-md"
                    style={{
                        background: "rgba(139,31,31,0.10)",
                        border: "1px solid rgba(139,31,31,0.42)",
                        borderLeft: "3px solid #C24F4F",
                    }}
                    data-testid={`what-pain-${i}`}
                >
                    <div className="text-[26px] md:text-[32px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: "#E88787", fontWeight: 800 }}>
                        {p.value}
                    </div>
                    <div className="text-[11.5px] mt-2 leading-snug font-semibold" style={{ color: DL.paper }}>
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
                        <div className="text-[13px] md:text-[14.5px] leading-[1.4] font-semibold" style={{ color: DL.paper }}>
                            {L.what}
                        </div>
                        <div className="text-[11px] md:text-[12px] leading-[1.4] italic" style={{ color: "rgba(245,239,230,0.6)" }}>
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
// ═══════════════════════════════════════════════════════════════════
// Product Mockups · rendered inline on each deep-dive slide.
// Avoid live-URL demos (which need auth in a stakeholder meeting) —
// these mockups are self-contained SVG/HTML replicas of the real
// screens, guaranteed to render on any device without a login.
// ═══════════════════════════════════════════════════════════════════

const chipStyle = (kind) => {
    const map = {
        green:  { bg: "rgba(31,127,89,0.18)",  fg: "#3EBB88", bd: "rgba(62,187,136,0.55)" },
        amber:  { bg: "rgba(184,131,40,0.20)", fg: "#F4C874", bd: "rgba(244,200,116,0.55)" },
        red:    { bg: "rgba(197,86,86,0.18)",  fg: "#F1B4B4", bd: "rgba(241,180,180,0.55)" },
        neutral:{ bg: "rgba(245,239,230,0.08)",fg: "rgba(245,239,230,0.65)", bd: "rgba(245,239,230,0.22)" },
    };
    const s = map[kind] || map.neutral;
    return {
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, borderRadius: 3,
        fontFamily: DL.fontMono,
    };
};

const mockupFrame = {
    background: "#F5EFE6",
    color: "#1A1F1D",
    borderRadius: 6,
    border: "1px solid rgba(184,131,40,0.4)",
    overflow: "hidden",
    boxShadow: "0 30px 60px -30px rgba(184,131,40,0.4)",
};

// ── Mockup 1 · Grants — AI Diff chips on invoice rows + AI Audit rollup ──
const MockupGrants = () => (
    <div style={mockupFrame} data-testid="mockup-grants">
        {/* Browser-chrome header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid rgba(0,0,0,0.08)", background: "#EBE4D6", fontFamily: DL.fontMono, fontSize: 10, color: "#5C5A54" }}>
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#C55656" }} />
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#D5A93A" }} />
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#4A9E6C" }} />
            <span style={{ marginLeft: 12, letterSpacing: "0.06em" }}>MPCA ERP · Tournament / Vinoo Mankad · Invoices</span>
        </div>
        {/* AI Audit rollup card */}
        <div style={{ padding: "14px 18px", background: "#F0E9DC", borderBottom: "1px solid rgba(139,31,31,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 9.5, letterSpacing: "0.24em", fontWeight: 700, color: "#8B1F1F" }}>AI · TOURNAMENT AUDIT</div>
                    <div style={{ fontFamily: DL.fontDisplay, fontSize: 16, fontWeight: 800, color: "#0D3B2E" }}>60 invoices audited · one click</div>
                </div>
                <button style={{ padding: "6px 12px", background: "#8B1F1F", color: "#F5EFE6", fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.2em", fontWeight: 700, border: "none", borderRadius: 3 }}>▶ RUN AI AUDIT</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                <div style={{ padding: "10px 14px", background: "rgba(74,158,108,0.14)", border: "1px solid rgba(74,158,108,0.5)", borderRadius: 4 }}>
                    <div style={{ fontSize: 26, fontFamily: DL.fontDisplay, fontWeight: 800, color: "#1F7F59" }}>52</div>
                    <div style={{ fontSize: 9, fontFamily: DL.fontMono, letterSpacing: "0.2em", fontWeight: 700, color: "#1F7F59" }}>APPROVED · AI MATCH</div>
                </div>
                <div style={{ padding: "10px 14px", background: "rgba(213,169,58,0.14)", border: "1px solid rgba(213,169,58,0.5)", borderRadius: 4 }}>
                    <div style={{ fontSize: 26, fontFamily: DL.fontDisplay, fontWeight: 800, color: "#B88328" }}>6</div>
                    <div style={{ fontSize: 9, fontFamily: DL.fontMono, letterSpacing: "0.2em", fontWeight: 700, color: "#B88328" }}>NEEDS REVIEW</div>
                </div>
                <div style={{ padding: "10px 14px", background: "rgba(197,86,86,0.14)", border: "1px solid rgba(197,86,86,0.5)", borderRadius: 4 }}>
                    <div style={{ fontSize: 26, fontFamily: DL.fontDisplay, fontWeight: 800, color: "#8B1F1F" }}>2</div>
                    <div style={{ fontSize: 9, fontFamily: DL.fontMono, letterSpacing: "0.2em", fontWeight: 700, color: "#8B1F1F" }}>REJECTED</div>
                </div>
                <div style={{ padding: "10px 14px", background: "#F5EFE6", border: "1px solid rgba(31,127,89,0.4)", borderRadius: 4 }}>
                    <div style={{ fontSize: 18, fontFamily: DL.fontMono, fontWeight: 800, color: "#1F7F59" }}>₹ 4,65,131</div>
                    <div style={{ fontSize: 9, fontFamily: DL.fontMono, letterSpacing: "0.2em", fontWeight: 700, color: "#5C5A54" }}>ELIGIBLE REIMBURSEMENT</div>
                </div>
            </div>
        </div>
        {/* Invoice table */}
        <table style={{ width: "100%", fontFamily: DL.fontBody, fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
                <tr style={{ background: "#EBE4D6", color: "#5C5A54" }}>
                    <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>REF</th>
                    <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>VENDOR</th>
                    <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>DATE</th>
                    <th style={{ padding: "8px 14px", textAlign: "right", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>AMOUNT</th>
                    <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>AI DIFF</th>
                </tr>
            </thead>
            <tbody>
                {[
                    { ref: "INV-2026-27-0007", vendor: "Sanskar Sports · Balls", date: "12 Aug 26",  amt: "₹ 42,000",  chip: "green",  chipText: "✓ AI MATCH" },
                    { ref: "INV-2026-27-0008", vendor: "Hotel Sayaji · Boarding",date: "14 Aug 26",  amt: "₹ 1,18,500",chip: "green",  chipText: "✓ AI MATCH" },
                    { ref: "INV-2026-27-0009", vendor: "MB Fuels",                date: "15 Aug 26",  amt: "₹ 8,750",   chip: "amber",  chipText: "⚠ AMOUNT MISMATCH" },
                    { ref: "INV-2026-27-0010", vendor: "Ramesh Umpire Meals",     date: "16 Aug 26",  amt: "₹ 6,200",   chip: "green",  chipText: "✓ AI MATCH" },
                    { ref: "INV-2026-27-0011", vendor: "Sight Screens · Pooja Fab",date:"17 Aug 26",  amt: "₹ 22,000",  chip: "amber",  chipText: "⚠ DATE OUTSIDE CYCLE" },
                    { ref: "INV-2026-27-0012", vendor: "Municipality · Water Bill",date:"18 Aug 26",  amt: "₹ 4,340",   chip: "green",  chipText: "✓ AI MATCH" },
                ].map((r) => (
                    <tr key={r.ref} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                        <td style={{ padding: "9px 14px", fontFamily: DL.fontMono, fontSize: 10.5, color: "#B88328" }}>{r.ref}</td>
                        <td style={{ padding: "9px 14px", color: "#1A1F1D", fontWeight: 600 }}>{r.vendor}</td>
                        <td style={{ padding: "9px 14px", color: "#5C5A54", fontFamily: DL.fontMono, fontSize: 11 }}>{r.date}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: DL.fontMono, fontWeight: 700, color: "#1A1F1D" }}>{r.amt}</td>
                        <td style={{ padding: "9px 14px" }}><span style={chipStyle(r.chip)}>{r.chipText}</span></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ── Mockup 2 · Player Registration · Verification Trail table ─────────────
const MockupPlayerTrail = () => (
    <div style={mockupFrame} data-testid="mockup-player">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid rgba(0,0,0,0.08)", background: "#EBE4D6", fontFamily: DL.fontMono, fontSize: 10, color: "#5C5A54" }}>
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#C55656" }} />
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#D5A93A" }} />
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#4A9E6C" }} />
            <span style={{ marginLeft: 12, letterSpacing: "0.06em" }}>MPCA ERP · Player Detail · Bakshraj Singh</span>
        </div>
        {/* Verdict banner */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "rgba(74,158,108,0.10)", borderBottom: "1px solid rgba(74,158,108,0.35)" }}>
            <div>
                <div style={{ fontFamily: DL.fontMono, fontSize: 9.5, letterSpacing: "0.24em", fontWeight: 700, color: "#5C5A54" }}>MPCA ELIGIBILITY · SEASON 2026-27</div>
                <div style={{ fontFamily: DL.fontDisplay, fontSize: 20, fontWeight: 800, color: "#1F7F59", marginTop: 2 }}>Local / Residence</div>
            </div>
            <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: DL.fontMono, fontSize: 9.5, letterSpacing: "0.24em", fontWeight: 700, color: "#5C5A54" }}>AI CONFIDENCE</div>
                <div style={{ fontFamily: DL.fontDisplay, fontSize: 22, fontWeight: 800, color: "#1F7F59" }}>0.95</div>
            </div>
        </div>
        {/* Trail table */}
        <div style={{ padding: "10px 18px 6px", fontFamily: DL.fontMono, fontSize: 9, letterSpacing: "0.24em", fontWeight: 700, color: "#8B1F1F" }}>
            VERIFICATION TRAIL · 8 RULES CHECKED
        </div>
        <table style={{ width: "100%", fontFamily: DL.fontBody, fontSize: 11.5, borderCollapse: "collapse" }}>
            <thead>
                <tr style={{ background: "#EBE4D6", color: "#5C5A54" }}>
                    <th style={{ padding: "6px 14px", textAlign: "left", width: 22 }}></th>
                    <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>RULE</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>VERDICT / REASON</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, letterSpacing: "0.22em", fontFamily: DL.fontMono, fontWeight: 700 }}>KYC EVIDENCE</th>
                </tr>
            </thead>
            <tbody>
                {[
                    { icon: "✓", tag: "AI · Facts Promoted",     why: "education = 'SANSKAR ACADEMY / CBSE' (AI · Marksheet); residency_since = 2016-01-01 (Aadhaar)", evidence: "birth_cert · aadhar · samagra · marksheet_10", passed: true },
                    { icon: "✗", tag: "Local/Birth",             why: "place_of_birth_division not on file — cannot verify birth", evidence: "Birth Certificate · AI DOB=2008-08-04 · QR verified", passed: false },
                    { icon: "✓", tag: "Local/Residence",         why: "Resident in Division for 129.5 months (≥ 3 required).", evidence: "Aadhaar · AI enrolled 2016 · Samagra ID on file", passed: true },
                    { icon: "✗", tag: "Local/Employment",        why: "Employment (self or parent) not on file", evidence: "Affidavit · not uploaded", passed: false },
                    { icon: "✓", tag: "Local/Education",         why: "Studying at SANSKAR ACADEMY / CBSE (129.5 months in Division).", evidence: "Marksheet 10 · AI institute=SANSKAR ACADEMY · years 2022-23, 2024-25", passed: true },
                ].map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                        <td style={{ padding: "8px 14px", fontFamily: DL.fontMono, fontWeight: 800, color: r.passed ? "#1F7F59" : "#8B1F1F", fontSize: 15 }}>{r.icon}</td>
                        <td style={{ padding: "8px 8px", fontFamily: DL.fontMono, fontSize: 10.5, color: "#B88328", fontWeight: 700 }}>{r.tag}</td>
                        <td style={{ padding: "8px 8px", color: "#1A1F1D" }}>{r.why}</td>
                        <td style={{ padding: "8px 8px", fontFamily: DL.fontMono, fontSize: 10, color: "#5C5A54" }}>{r.evidence}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ── Mockup 3 · Squad Selection · Pre-cleared shortlist ────────────────────
const MockupSquad = () => (
    <div style={mockupFrame} data-testid="mockup-squad">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid rgba(0,0,0,0.08)", background: "#EBE4D6", fontFamily: DL.fontMono, fontSize: 10, color: "#5C5A54" }}>
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#C55656" }} />
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#D5A93A" }} />
            <span style={{ height: 9, width: 9, borderRadius: "50%", background: "#4A9E6C" }} />
            <span style={{ marginLeft: 12, letterSpacing: "0.06em" }}>MPCA ERP · Selection Console · MP U-19 · Cooch Behar</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: 16 }}>
            {/* LEFT · AI shortlist */}
            <div>
                <div style={{ fontFamily: DL.fontMono, fontSize: 9, letterSpacing: "0.24em", fontWeight: 700, color: "#8B1F1F", marginBottom: 8 }}>AI · PRE-CLEARED SHORTLIST · 15 OF 42</div>
                {[
                    { name: "Rishabh Malviya",   role: "Right-hand bat · slip",    tag: "Local/Birth",     kyc: "green" },
                    { name: "Aarav Jhala",       role: "Off-spin all-rounder",     tag: "Local/Residence", kyc: "green" },
                    { name: "Kabir Tiwari",      role: "Left-arm pace",            tag: "Guest/MP-Dom",    kyc: "amber" },
                    { name: "Ishaan Pandey",     role: "Wicketkeeper-bat",         tag: "Local/Education", kyc: "green" },
                    { name: "Devansh Bansal",    role: "Right-hand top-order",     tag: "Local/Residence", kyc: "green" },
                    { name: "Yash Mishra",       role: "Right-arm pace",           tag: "Local/Employment",kyc: "green" },
                ].map((p) => (
                    <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#F5EFE6", border: "1px solid rgba(0,0,0,0.08)", borderLeft: `3px solid ${p.kyc === "green" ? "#1F7F59" : "#B88328"}`, borderRadius: 3, marginBottom: 6 }}>
                        <div>
                            <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: 13, color: "#0D3B2E" }}>{p.name}</div>
                            <div style={{ fontSize: 10.5, color: "#5C5A54", marginTop: 1 }}>{p.role}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                            <span style={chipStyle("neutral")}>{p.tag}</span>
                            <span style={chipStyle(p.kyc)}>{p.kyc === "green" ? "KYC ✓" : "KYC · REVIEW"}</span>
                        </div>
                    </div>
                ))}
            </div>
            {/* RIGHT · KYC audit panel + bias meter */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ padding: 12, background: "rgba(74,158,108,0.08)", border: "1px solid rgba(74,158,108,0.35)", borderRadius: 4 }}>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 9, letterSpacing: "0.24em", fontWeight: 700, color: "#1F7F59", marginBottom: 8 }}>KYC · AI AUDIT</div>
                    {[
                        { label: "Aadhaar verified",   n: "42/42", chip: "green" },
                        { label: "Birth Cert on file", n: "39/42", chip: "green" },
                        { label: "Medical fitness",    n: "37/42", chip: "amber" },
                        { label: "Bank details",       n: "42/42", chip: "green" },
                    ].map((k) => (
                        <div key={k.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                            <span style={{ fontSize: 12, color: "#1A1F1D" }}>{k.label}</span>
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontFamily: DL.fontMono, fontSize: 11, fontWeight: 700, color: "#0D3B2E" }}>{k.n}</span>
                                <span style={{ ...chipStyle(k.chip), padding: "1px 6px", fontSize: 9 }}>{k.chip === "green" ? "OK" : "⚠"}</span>
                            </span>
                        </div>
                    ))}
                </div>
                <div style={{ padding: 12, background: "rgba(184,131,40,0.10)", border: "1px solid rgba(184,131,40,0.4)", borderRadius: 4 }}>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 9, letterSpacing: "0.24em", fontWeight: 700, color: "#B88328", marginBottom: 8 }}>AI · SELECTION BIAS ANALYSIS</div>
                    <div style={{ fontSize: 12, color: "#1A1F1D", marginBottom: 4 }}>
                        Divisional balance: <b>4 divisions represented</b> · Indore 5, Bhopal 4, Gwalior 3, Ujjain 3.
                    </div>
                    <div style={{ fontSize: 12, color: "#1A1F1D", marginBottom: 4 }}>
                        Role balance: <b>7 bat · 4 bowl · 2 all-round · 2 keeper</b>
                    </div>
                    <div style={{ fontSize: 11, color: "#5C5A54", fontStyle: "italic", marginTop: 6 }}>
                        No selector-division skew detected. Proceed to committee sign-off.
                    </div>
                </div>
                <div style={{ padding: "10px 12px", background: "#0D3B2E", color: "#F5EFE6", fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.2em", fontWeight: 700, borderRadius: 3, textAlign: "center" }}>
                    ▶ COMMIT SHORTLIST TO COMMITTEE
                </div>
            </div>
        </div>
    </div>
);

const MOCKUPS = { grants: MockupGrants, player: MockupPlayerTrail, squad: MockupSquad };

const FeatureSlide = ({ data }) => {
    const Icon = data.icon;
    const Mockup = data.mockup ? MOCKUPS[data.mockup] : null;
    return (
        <div className="max-w-[1320px] w-full">
            {/* TOP · 2-col — problem + AI verb (LEFT), metric card (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-start mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-5">
                        <div
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                            style={{ background: "rgba(184,131,40,0.16)", border: "1px solid rgba(184,131,40,0.4)" }}
                        >
                            <Icon size={18} strokeWidth={2.25} style={{ color: DL.gold }} />
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.28em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                            {data.eyebrow} · {data.featureName}
                        </div>
                    </div>

                    <div className="mb-6">
                        <div className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.55)" }}>
                            The Problem · Today
                        </div>
                        <h2
                            className="text-[24px] md:text-[30px] leading-[1.2] tracking-tight"
                            style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                            data-testid="feature-problem"
                        >
                            {data.problem}
                        </h2>
                    </div>

                    <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2" style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.85 }}>
                            AI · Now
                        </div>
                        <div
                            className="text-[44px] md:text-[60px] leading-[0.95] tracking-tight mb-3"
                            style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.gold, letterSpacing: "-0.02em" }}
                            data-testid="feature-verb"
                        >
                            {data.aiVerb}
                        </div>
                        <p className="text-[12.5px] md:text-[13.5px] leading-[1.5] max-w-[500px]" style={{ color: "rgba(245,239,230,0.72)" }}>
                            {data.aiDescription}
                        </p>
                    </div>
                </div>

                <div
                    className="p-6 md:p-7 rounded-md"
                    style={{
                        background: "linear-gradient(180deg, rgba(184,131,40,0.14) 0%, rgba(184,131,40,0.04) 100%)",
                        border: "1.5px solid rgba(184,131,40,0.44)",
                        boxShadow: "0 30px 60px -30px rgba(184,131,40,0.35)",
                    }}
                    data-testid="feature-metric-card"
                >
                    <div className="text-[10px] uppercase tracking-[0.24em] font-bold mb-4" style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.9 }}>
                        Impact · Measured
                    </div>

                    <div className="flex items-baseline gap-3 mb-4">
                        <div className="text-[22px] md:text-[26px] line-through leading-none" style={{ fontFamily: DL.fontDisplay, color: "rgba(245,239,230,0.45)", fontWeight: 700 }}>
                            {data.metric.before}
                        </div>
                        <ArrowRight size={18} strokeWidth={2.5} style={{ color: DL.gold }} />
                        <div className="text-[36px] md:text-[48px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: DL.paper, fontWeight: 800 }} data-testid="feature-metric-after">
                            {data.metric.after}
                        </div>
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.2em] font-bold mb-5" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.62)" }}>
                        {data.metric.label}
                    </div>

                    <div className="pt-4" style={{ borderTop: "1px dashed rgba(184,131,40,0.34)" }}>
                        <div className="text-[13.5px] font-bold mb-1.5" style={{ color: DL.gold, fontFamily: DL.fontBody }}>
                            {data.seasonSave}
                        </div>
                        <div className="text-[12px] leading-[1.5] italic" style={{ color: "rgba(245,239,230,0.72)" }}>
                            {data.dividend}
                        </div>
                    </div>
                </div>
            </div>

            {/* BOTTOM · Full-width product mockup — replaces the fragile "See it
                live" link so the deck runs offline in the meeting room. */}
            {Mockup && (
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="text-[9.5px] uppercase tracking-[0.28em] font-bold" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.55)" }}>
                            The Screen · Product Reference
                        </div>
                        <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(184,131,40,0.5) 0%, transparent 100%)" }} />
                    </div>
                    <Mockup />
                </div>
            )}
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
