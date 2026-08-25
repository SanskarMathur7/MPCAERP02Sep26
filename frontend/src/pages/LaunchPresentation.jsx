/**
 * /launch-presentation — MPCA ERP · 10-minute operator-first pitch (Iter 130)
 * ─────────────────────────────────────────────────────────────────────────
 * Companion to /storyline. Same content library, same slide renderers, same
 * heritage design — but re-sequenced for a value-first audience (admin /
 * committee / operator). The original /storyline pitch (thesis-first, 15 min)
 * stays untouched.
 *
 * Sequence:
 *   1. Basic overview of the ERP (sidebar + dashboard mockup)
 *   2. Player Registration — the pipeline, then the deep-dive
 *   3. Grant Claims — the pipeline, then the deep-dive
 *   4. Tournament Management — setup / fixtures / reimbursement
 *   5. Squad Selection — where the tournament is nearly lost
 *   6. Pain-points we solve · why this operating model works
 *   7. The standing offer — MPCA moved first
 *
 * ~9 slides · ~65 seconds each · ~10 minutes total.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { DL } from "@/lib/designSystem";
import {
    ArrowRight, ArrowLeft, X,
    Users, HandCoins, Trophy, Landmark, ShieldCheck, GitBranch,
    FileCheck2, ScrollText, Calendar, ClipboardList, BarChart3, Wallet,
} from "lucide-react";
import {
    WhySlide, BucketIntroSlide, FeatureSlide, ImpactSlide, CtaSlide, NavBtn,
    emeraldBg,
} from "./Storyline";

// ═════════════════════════════════════════════════════════════════════
// Slide data — 9 slides · operator-first sequence
// ═════════════════════════════════════════════════════════════════════

const SLIDES = [
    // ═══════════════════════════════════════════════════════════════
    // 01 · Overview — sidebar + dashboard mockup
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "overview",
        eyebrow: "01 · The ERP",
        title: "One system. Six modules. Every part of MPCA's operations, digitised.",
        subtitle: "Built for operators. Owned by MPCA. Open to every association.",
        modules: [
            { icon: Users,        label: "Player Registration",  sub: "3,000+ players · KYC · eligibility" },
            { icon: Trophy,       label: "Tournament Management", sub: "40+ tournaments · fixtures · reimbursements" },
            { icon: HandCoins,    label: "Grant Claims",         sub: "20+ schemes · claim → payment" },
            { icon: ClipboardList,label: "Squad Selection",       sub: "Selection console · signed PDFs" },
            { icon: Landmark,     label: "Governance",           sub: "Maker-Checker · meetings · minutes" },
            { icon: BarChart3,    label: "Reporting",            sub: "Finance · audit trail · exports" },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // 02 · Player Registration — intro
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "players",
        bucketLabel: "Module 01 · Player Registration",
        eyebrow: "02 · Player Registration — from guessing to certainty",
        icon: Users,
        title: "The player pipeline was manual from Aadhaar to Ranji.",
        subtitle: "One DOB typo · one disqualified squad · three months later.",
        pains: [
            "KYC fields copied by hand",
            "Name mismatches missed under pressure",
            "34 age brackets on a spreadsheet",
            "Every reviewer reads the rules differently",
        ],
        aiCount: 2,
        aiPreview: "AI reads the docs. The engine walks the rules. Every reviewer sees the same reasoning.",
    },
    // 03 · Player Registration — deep-dive
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
    // 04 · Grant Claims — intro
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "grants",
        bucketLabel: "Module 02 · Grant Claims",
        eyebrow: "03 · Grant Claims — every rupee, traced end-to-end",
        icon: HandCoins,
        title: "The biggest backlog wasn't the field. It was the file room.",
        subtitle: "20+ schemes · six-step pipeline · every claim keyed by hand.",
        pains: [
            "60 invoices per tournament · every line-item keyed twice",
            "Status opaque · claimants call the Secretariat for updates",
            "Approvals lost in inbox chains · 8-week claim cycles",
            "No rollup · every invoice audited in isolation",
        ],
        aiCount: 2,
        aiPreview: "Every invoice auto-diffed against the PDF. One click rolls up the whole tournament. MPCA approves ambers, not greens.",
    },
    // 05 · Grants — deep-dive
    {
        kind: "feature",
        bucketId: "grants",
        icon: HandCoins,
        eyebrow: "Grants · Deep-Dive",
        featureName: "AI Diff · Per-invoice + Tournament AI Audit",
        problem: "60 invoices. Two days of Accounts. Weeks in inbox chains.",
        aiVerb: "VERIFIES & ROLLS UP",
        aiDescription: "Every invoice auto-diffed against its PDF. One click rolls up the whole tournament. MPCA approves ambers, not greens. Claimants see live status the moment it changes.",
        metric: { before: "1–2 days", after: "≤ 90 seconds", label: "per claim · AI verification time" },
        seasonSave: "≈ 600 staff-hours · 2–4% leakage recoverable",
        dividend: "= reinvested into pitch covers, sight-screens, roller repairs across districts",
        livePage: { label: "Reimbursement Claim Review", path: "/reimbursement-claims" },
        mockup: "grants",
    },

    // ═══════════════════════════════════════════════════════════════
    // 06 · Tournament Management — bucket_intro
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "tournaments",
        bucketLabel: "Module 03 · Tournament Management",
        eyebrow: "04 · Tournaments — one shared canvas from fixture to final",
        icon: Trophy,
        title: "40 tournaments a year. Every year. Every one a paper trail.",
        subtitle: "Draws, fixtures, grounds, officials, reimbursements — one console.",
        pains: [
            "Fixture drafts emailed as attachments · reconciled by memory",
            "Ground double-bookings surface on match-day",
            "Match officials, umpires, scorers · assigned by phone calls",
            "Reimbursements chase the tournament by weeks",
        ],
        aiCount: 2,
        aiPreview: "One tournament page holds every fact. Fixture calendar detects clashes. AI-audited invoices attach to their own tournament.",
    },
    // 07 · Squad Selection — deep-dive
    {
        kind: "feature",
        bucketId: "squads",
        icon: Users,
        eyebrow: "Squads · Deep-Dive",
        featureName: "AI Squad Recommendation + KYC Audit",
        problem: "Names from memory. KYC gaps after announcement.",
        aiVerb: "SHORTLISTS & CLEARS",
        aiDescription: "Ranks the pool. Audits KYC and eligibility before the meeting. Selectors debate strategy, not paperwork. Signed PDF parses back into the ERP automatically.",
        metric: { before: "6 hrs/meeting", after: "20 min", label: "squad-finalisation cycle" },
        seasonSave: "≈ 90 staff-hours · zero KYC-triggered drop-outs · zero version drift",
        dividend: "= kit, travel and jersey numbers align on the first attempt",
        livePage: { label: "Selection Console", path: "/selection-console" },
        mockup: "squad",
    },

    // ═══════════════════════════════════════════════════════════════
    // 08 · Why this operating model works — pain-points synthesis
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "why",
        eyebrow: "05 · The Operating Truth",
        overline: "How the ERP is built to actually stick",
        title: "AI does the labour. Humans do the leadership.",
        subtitle: "Every AI verdict is advisory. Humans always decide.",
        pillars: [
            {
                title: "Ingest",
                detail: "Every PDF, invoice, scan and signed sheet enters as structured data — not as a folder attachment. Nothing left in an inbox.",
            },
            {
                title: "Structure",
                detail: "Eligibility rules, approval matrices and grant schemes live as data. Rewritable per season, without a code change.",
            },
            {
                title: "Reason",
                detail: "The engine walks every rule against every document. Reviewers see the exact citation that supports each verdict.",
            },
            {
                title: "Judge",
                detail: "Approvers always click. Maker-Checker on every state change. Every decision is signed, dated, immutable.",
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // 09 · The standing offer — CTA
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "cta",
        eyebrow: "06 · The Standing Offer",
        title: "Every association runs the same backlogs. MPCA just wrote the answer.",
        body: "One state. Ten divisions. One codebase. One audit trail. Rewritable per season, portable to any board.",
        body2: null,
        stats: [
            { value: "10",   label: "MPCA divisions · unified under one framework" },
            { value: "4",    label: "Cognitive layers · Ingest · Structure · Reason · Judge" },
            { value: "20+",  label: "Cricket associations · plug into the same code" },
            { value: "0",    label: "Vendor lock-in · every line owned by MPCA" },
        ],
        quote: "MPCA moved first. The rest of Indian cricket can now follow, or catch up.",
    },
];

// ═════════════════════════════════════════════════════════════════════
// Custom overview slide (only used on this deck)
// ═════════════════════════════════════════════════════════════════════

const OverviewSlide = ({ data }) => (
    <div>
        {/* Eyebrow */}
        <div
            className="mb-3"
            style={{
                fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.28em",
                textTransform: "uppercase", color: DL.gold, fontWeight: 700,
            }}
            data-testid="launch-eyebrow"
        >
            {data.eyebrow}
        </div>

        <h1
            className="mb-3"
            style={{
                fontFamily: DL.fontDisplay, fontWeight: 800,
                fontSize: "clamp(28px, 3.4vw, 46px)", lineHeight: 1.1, letterSpacing: "-0.01em",
                color: DL.paper, maxWidth: 1050,
            }}
            data-testid="launch-title"
        >
            {data.title}
        </h1>
        <p
            className="mb-8"
            style={{
                fontFamily: DL.fontBody, fontStyle: "italic",
                fontSize: "clamp(15px, 1.4vw, 19px)",
                color: "rgba(245,239,230,0.72)", maxWidth: 780,
            }}
        >
            {data.subtitle}
        </p>

        <div className="grid grid-cols-[280px_1fr] gap-6 items-start">
            {/* Left: sidebar mockup */}
            <div
                style={{
                    background: "#0D3B2E", border: `1px solid ${DL.gold}55`,
                    padding: "16px 12px", borderRadius: 3,
                    boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
                }}
            >
                <div style={{ fontFamily: DL.fontMono, fontSize: 9, letterSpacing: "0.24em", color: DL.gold, fontWeight: 700, marginBottom: 12, paddingLeft: 8 }}>
                    MPCA · ERP
                </div>
                <div style={{ height: 1, background: `${DL.gold}30`, marginBottom: 10 }} />
                {data.modules.map((m, i) => {
                    const Icon = m.icon;
                    return (
                        <div
                            key={i}
                            style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "9px 10px",
                                background: i === 1 ? "rgba(184,131,40,0.16)" : "transparent",
                                borderLeft: i === 1 ? `2px solid ${DL.gold}` : "2px solid transparent",
                                marginBottom: 2, borderRadius: 2,
                            }}
                        >
                            <Icon size={13} style={{ color: i === 1 ? DL.gold : "rgba(245,239,230,0.7)" }} />
                            <div style={{ fontFamily: DL.fontBody, fontSize: 12, color: i === 1 ? DL.paper : "rgba(245,239,230,0.75)", fontWeight: i === 1 ? 700 : 500 }}>
                                {m.label}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Right: module tiles */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.modules.map((m, i) => {
                    const Icon = m.icon;
                    return (
                        <div
                            key={i}
                            style={{
                                background: "rgba(245,239,230,0.04)",
                                border: `1px solid ${DL.gold}33`,
                                padding: "16px 14px", borderRadius: 3,
                                transition: "all 220ms",
                            }}
                            data-testid={`launch-tile-${m.label.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                            <Icon size={18} style={{ color: DL.gold, marginBottom: 10 }} />
                            <div style={{ fontFamily: DL.fontDisplay, fontSize: 15, fontWeight: 700, color: DL.paper, lineHeight: 1.2, marginBottom: 5 }}>
                                {m.label}
                            </div>
                            <div style={{ fontFamily: DL.fontMono, fontSize: 10, color: "rgba(245,239,230,0.55)", lineHeight: 1.4 }}>
                                {m.sub}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        <div className="mt-10 text-center" style={{ maxWidth: 900, marginLeft: "auto", marginRight: "auto" }}>
            <div style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.22em", color: DL.gold, fontWeight: 700, marginBottom: 6 }}>
                THE PROMISE OF THIS DECK
            </div>
            <p style={{ fontFamily: DL.fontBody, fontSize: 15, lineHeight: 1.55, color: "rgba(245,239,230,0.85)" }}>
                Next slides: <strong>players → grants → tournaments → squads.</strong> For each — the old pain, the new flow, the hours saved.
            </p>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Deck shell (mirrors Storyline shell)
// ═════════════════════════════════════════════════════════════════════

export default function LaunchPresentation() {
    const [slide, setSlide] = useState(0);
    const total = SLIDES.length;

    const next = useCallback(() => setSlide((s) => Math.min(total - 1, s + 1)), [total]);
    const prev = useCallback(() => setSlide((s) => Math.max(0, s - 1)), []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
            else if (e.key >= "1" && e.key <= "9") setSlide(Math.min(total - 1, Number(e.key) - 1));
            else if (e.key === "0") setSlide(total - 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [next, prev, total]);

    const current = SLIDES[slide];
    const progress = ((slide + 1) / total) * 100;

    return (
        <div
            className="fixed inset-0"
            data-testid="launch-presentation-page"
            style={{ background: emeraldBg, color: DL.paper, fontFamily: DL.fontBody, overflow: "hidden" }}
        >
            <style>{`
                @keyframes launchfx { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: none; } }
                .launch-slide-in > * { animation: launchfx 520ms cubic-bezier(0.22,1,0.36,1) both; }
                .launch-slide-in > *:nth-child(2) { animation-delay: 90ms; }
                .launch-slide-in > *:nth-child(3) { animation-delay: 180ms; }
                .launch-slide-in > *:nth-child(4) { animation-delay: 270ms; }
                .launch-slide-in > *:nth-child(5) { animation-delay: 360ms; }
            `}</style>

            {/* Progress bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.08)", zIndex: 5 }}>
                <div
                    data-testid="launch-progress"
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
                    data-testid="launch-counter"
                >
                    {String(slide + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
                <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.22em] font-bold transition-all"
                    style={{ fontFamily: DL.fontMono, color: DL.gold, border: `1px solid rgba(184,131,40,0.5)`, backdropFilter: "blur(8px)" }}
                    data-testid="launch-exit"
                    title="Exit deck"
                >
                    <X size={11} strokeWidth={2.5} /> Exit
                </Link>
            </div>

            {/* Slide surface */}
            <div
                key={slide}
                className="launch-slide-in absolute inset-0 flex items-start justify-center px-6 md:px-16 pt-14 pb-28"
                style={{ overflowY: "auto" }}
                data-testid={`launch-slide-${slide}`}
            >
                <div className="w-full my-auto" style={{ maxWidth: 1400 }}>
                    {current.kind === "overview"      && <OverviewSlide     data={current} />}
                    {current.kind === "bucket_intro"  && <BucketIntroSlide  data={current} />}
                    {current.kind === "feature"       && <FeatureSlide      data={current} />}
                    {current.kind === "why"           && <WhySlide          data={current} />}
                    {current.kind === "impact"        && <ImpactSlide       data={current} />}
                    {current.kind === "cta"           && <CtaSlide          data={current} />}
                </div>
            </div>

            {/* Bottom controls */}
            <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 14, zIndex: 5 }}>
                <NavBtn onClick={prev} disabled={slide === 0} testid="launch-prev">
                    <ArrowLeft size={16} strokeWidth={2.5} /> Prev
                </NavBtn>
                <div className="flex items-center gap-2" data-testid="launch-dots">
                    {SLIDES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setSlide(i)}
                            className="rounded-full transition-all"
                            style={{
                                height: 6, width: i === slide ? 24 : 6,
                                background: i === slide ? DL.gold : "rgba(255,255,255,0.28)",
                                border: "none", cursor: "pointer",
                            }}
                            data-testid={`launch-dot-${i}`}
                        />
                    ))}
                </div>
                <NavBtn onClick={next} disabled={slide === total - 1} testid="launch-next" primary>
                    Next <ArrowRight size={16} strokeWidth={2.5} />
                </NavBtn>
            </div>
        </div>
    );
}
