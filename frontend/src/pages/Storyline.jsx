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
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { DL } from "@/lib/designSystem";
import {
    ArrowRight, ArrowLeft, X, Play, Eye, ExternalLink,
    FileCheck2, ShieldCheck, HandCoins, Users, GitBranch, ScrollText,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// Slide data — 10 slides total
// ═══════════════════════════════════════════════════════════════════

const SLIDES = [
    // ── Slide 1 · Thesis ─────────────────────────────────────────────
    {
        kind: "thesis",
        eyebrow: "The Thesis",
        overline: "MPCA · Enterprise Resource Planning",
        title: "Cricket administration, rewired by AI.",
        subtitle: "One state board. Ten Divisions. Forty tournaments a year. Every action manual, until now.",
        stats: [
            { label: "AI features live in production", value: "7" },
            { label: "Manual routines replaced", value: "16" },
            { label: "Staff-hours saved per season (est.)", value: "1,700+" },
            { label: "State boards that could adopt this", value: "38" },
        ],
    },
    // ── Slides 2-8 · Seven AI features ──────────────────────────────
    {
        kind: "feature",
        icon: FileCheck2,
        eyebrow: "AI · 01 / 07",
        featureName: "Gemini Vision · Player Document Verifier",
        problem: "Verifying 1,200 player documents a year — Aadhaar, DOB proofs, school records — at midnight, by hand.",
        aiVerb: "EXTRACTS",
        aiDescription: "Gemini Vision reads every document, extracts DOB / name / issuing authority, and flags mismatches inside 30 seconds per player.",
        metric: { before: "15-30 min", after: "30 sec", label: "per player · verification time" },
        seasonSave: "≈ 450 staff-hours saved per season",
        dividend: "= 45 extra district coaching visits or 15 talent-scouting camps",
        livePage: { label: "Player Registrations", path: "/player-registrations", shot: "/ux-audit/president/player-registrations.png" },
    },
    {
        kind: "feature",
        icon: ShieldCheck,
        eyebrow: "AI · 02 / 07",
        featureName: "AI Eligibility Engine",
        problem: "Cross-checking each player's DOB / gender / medical against 34 BCCI tournament brackets under deadline pressure.",
        aiVerb: "TAGS",
        aiDescription: "The moment a player registers, AI tags them with every tournament they qualify for. Ineligible names become structurally unselectable in the squad picker.",
        metric: { before: "2 hrs/tournament", after: "Instant", label: "eligibility resolution" },
        seasonSave: "≈ 80 staff-hours saved · Zero post-hoc disqualifications",
        dividend: "= Ranji / U-19 / U-16 selectors focus on cricket, not spreadsheets",
        livePage: { label: "Player Register", path: "/players", shot: "/ux-audit/president/players.png" },
    },
    {
        kind: "feature",
        icon: HandCoins,
        eyebrow: "AI · 03 / 07",
        featureName: "AI Reimbursement Claim Verifier",
        problem: "Accounts team spends 1-2 working days per claim — matching each invoice against rate cards, scheme heads and budget ceilings by hand.",
        aiVerb: "VERIFIES",
        aiDescription: "Gemini 3 Flash OCRs every invoice, extracts vendor / amount / GST / date, matches against the applicable rate card, and flags duplicates + inflation.",
        metric: { before: "1-2 days", after: "90 seconds", label: "per claim · verification time" },
        seasonSave: "≈ 600 staff-hours + 2-4% leakage recovered",
        dividend: "= Reinvested into pitch covers, sight-screens, roller repairs across districts",
        livePage: { label: "Reimbursement Claims", path: "/reimbursement-claims", shot: "/ux-audit/president/reimbursement-claims.png" },
    },
    {
        kind: "feature",
        icon: Users,
        eyebrow: "AI · 04 / 07",
        featureName: "AI Squad Recommendation + KYC Audit",
        problem: "Selection meetings argue names from memory. KYC gaps surface at squad-lock — sometimes AFTER announcement — forcing last-minute drop-outs.",
        aiVerb: "RECOMMENDS",
        aiDescription: "AI ranks every eligible player against role, recent form and past appearances; parallelly it audits KYC (Aadhaar / PAN / bank / medical) and gives a pre-cleared shortlist.",
        metric: { before: "6 hrs/meeting", after: "20 min", label: "squad-finalisation cycle" },
        seasonSave: "≈ 90 staff-hours · Zero KYC-triggered drop-outs",
        dividend: "= Selectors debate strategy and bench balance, not paperwork",
        livePage: { label: "Selection Console", path: "/selection-console", shot: "/ux-audit/president/selection-console.png" },
    },
    {
        kind: "feature",
        icon: FileCheck2,
        eyebrow: "AI · 05 / 07",
        featureName: "AI Squad PDF Verifier",
        problem: "Post-selection, the signed squad PDF is emailed around. Every recipient re-types names into their local sheet — three slightly-different versions float around.",
        aiVerb: "PARSES",
        aiDescription: "The signed PDF is parsed on upload; names / roles / jersey numbers are cross-checked against the ERP's squad record and locked. Version drift is impossible.",
        metric: { before: "45 min/squad", after: "5 sec", label: "PDF-to-ERP sync" },
        seasonSave: "≈ 22 staff-hours · Zero version-drift incidents",
        dividend: "= Kit, travel, and jersey numbers align on the first attempt",
        livePage: { label: "Tournaments · Squads", path: "/tournaments", shot: "/ux-audit/president/tournaments.png" },
    },
    {
        kind: "feature",
        icon: ScrollText,
        eyebrow: "AI · 06 / 07",
        featureName: "AI Signed-Document Reviewer",
        problem: "Every signed contract / MoU / resolution is filed manually. Legal review is line-by-line — non-standard clauses slip through when deadlines are tight.",
        aiVerb: "REVIEWS",
        aiDescription: "AI scans each uploaded signed document, checks for missing signatures / dates / stamps, flags non-standard clauses against MPCA's template library.",
        metric: { before: "30-60 min/doc", after: "20 sec", label: "compliance sweep" },
        seasonSave: "≈ 150 staff-hours · Every clause traceable",
        dividend: "= Faster sponsor deals, faster kit contracts, faster prize disbursals",
        livePage: { label: "Document Management", path: "/dms", shot: "/ux-audit/president/dms.png" },
    },
    {
        kind: "feature",
        icon: GitBranch,
        eyebrow: "AI · 07 / 07",
        featureName: "Dynamic Wiring Engine — Workflow Orchestrator",
        problem: "MPCA's approval matrix lived in a Word doc. Everyone remembered it differently. Approvals rebounded, delayed, or got lost.",
        aiVerb: "ROUTES",
        aiDescription: "Every action's approval chain is encoded as configurable data. The engine routes each request to the right actor, in the right order, with an immutable audit stamp.",
        metric: { before: "3-5 days", after: "Same day", label: "per approval cycle" },
        seasonSave: "≈ 500 staff-hours · 100% audit trail",
        dividend: "= Governance stops being policy and becomes architecture",
        livePage: { label: "Tournament Wiring", path: "/tournament-wiring", shot: "/ux-audit/president/tournament-wiring.png" },
    },
    // ── Slide 9 · Consolidated impact ───────────────────────────────
    {
        kind: "impact",
        eyebrow: "The Bottom Line",
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
    // ── Slide 10 · Call-to-action ───────────────────────────────────
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

            {/* Slide surface */}
            <div
                key={slide}
                className="storyline-slide-in absolute inset-0 flex items-center justify-center px-6 md:px-16 py-16"
                style={{ overflowY: "auto" }}
                data-testid={`storyline-slide-${slide}`}
            >
                {current.kind === "thesis"  && <ThesisSlide  data={current} />}
                {current.kind === "feature" && <FeatureSlide data={current} onLive={setPreview} />}
                {current.kind === "impact"  && <ImpactSlide  data={current} />}
                {current.kind === "cta"     && <CtaSlide     data={current} />}
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
// Slide 1 · Thesis
// ═══════════════════════════════════════════════════════════════════
const ThesisSlide = ({ data }) => (
    <div className="max-w-[1120px] w-full text-center">
        <div className="text-[11px] uppercase tracking-[0.32em] font-bold mb-6" style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.9 }}>
            {data.overline}
        </div>
        <h1
            className="text-[64px] md:text-[92px] leading-[1] tracking-tight mb-8"
            style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
            data-testid="thesis-title"
        >
            {data.title}
        </h1>
        <p
            className="text-[19px] md:text-[22px] leading-[1.55] max-w-[820px] mx-auto mb-14"
            style={{ color: "rgba(245,239,230,0.75)", fontFamily: DL.fontBody }}
        >
            {data.subtitle}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-[900px] mx-auto">
            {data.stats.map((s) => (
                <div
                    key={s.label}
                    className="p-5 rounded-md"
                    style={{ background: "rgba(184,131,40,0.08)", border: "1px solid rgba(184,131,40,0.32)" }}
                >
                    <div className="text-[38px] leading-none" style={{ fontFamily: DL.fontDisplay, color: DL.gold, fontWeight: 800 }}>
                        {s.value}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.18em] font-bold mt-2.5" style={{ fontFamily: DL.fontMono, color: "rgba(245,239,230,0.72)" }}>
                        {s.label}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

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
// Live-preview lightbox
// ═══════════════════════════════════════════════════════════════════
const LivePreview = ({ data, onClose }) => (
    <div
        onClick={onClose}
        data-testid="live-preview-overlay"
        style={{
            position: "fixed", inset: 0, zIndex: 20,
            background: "rgba(6, 13, 12, 0.88)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}
    >
        <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[1200px] rounded-lg overflow-hidden"
            style={{ background: DL.paper, boxShadow: "0 40px 100px rgba(0,0,0,0.6)" }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-6 py-4"
                style={{ background: DL.emerald, color: DL.paper, borderBottom: `2px solid ${DL.gold}` }}
            >
                <div className="flex items-center gap-3">
                    <Eye size={16} strokeWidth={2.5} style={{ color: DL.gold }} />
                    <span className="text-[11px] uppercase tracking-[0.24em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                        Live · {data.label}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        to={data.path}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10.5px] uppercase tracking-[0.22em] font-bold transition-all"
                        style={{ fontFamily: DL.fontMono, color: DL.emerald, background: DL.gold }}
                        data-testid="live-preview-open-page"
                    >
                        <ExternalLink size={11} strokeWidth={2.5} /> Open Page
                    </Link>
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

            {/* Screenshot */}
            <div style={{ maxHeight: "78vh", overflow: "auto", background: DL.ivory }}>
                <img
                    src={data.shot}
                    alt={data.label}
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.innerHTML = '<div style="padding:80px;text-align:center;color:#4C5750;font-family:IBM Plex Mono;font-size:13px;text-transform:uppercase;letter-spacing:0.2em;">Preview unavailable · click Open Page to view live</div>'; }}
                />
            </div>
        </div>
    </div>
);
