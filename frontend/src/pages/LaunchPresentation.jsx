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
    // 01 · Overview — brief; deck focus is players + grants
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "overview",
        eyebrow: "01 · The MPCA ERP",
        title: "For players and divisions. Registration and grants — solved.",
        subtitle: "Two backlogs that shape every season, now on one platform. Everything else — tournaments, accounting, governance — is quietly handled the same way.",
        modules: [
            { icon: Users,        label: "Player Registration",  sub: "3,000+ players · KYC · eligibility" },
            { icon: HandCoins,    label: "Grant Claims",         sub: "33 schemes · claim → payment" },
            { icon: Trophy,       label: "Tournament Claims",    sub: "40+ tournaments · invoices" },
            { icon: ClipboardList,label: "Squad Selection",       sub: "Selection console · signed PDFs" },
            { icon: Landmark,     label: "Governance",           sub: "Maker-Checker · audit trail" },
            { icon: BarChart3,    label: "Reporting",            sub: "Finance · exports · dashboards" },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // FOCUS 1 · PLAYER REGISTRATION (audience: players + divisions)
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "players",
        bucketLabel: "Focus 01 · Player Registration",
        eyebrow: "02 · The Registration Problem",
        icon: Users,
        title: "The player pipeline was manual from Aadhaar to Ranji.",
        subtitle: "One DOB typo. One wrong division. Three months later — a disqualification.",
        pains: [
            "KYC fields typed by hand · scans re-uploaded three times",
            "Name and DOB mismatches missed under pressure",
            "34 age brackets on a spreadsheet · every reviewer reads it differently",
            "Corrections chased by phone, WhatsApp, follow-up emails",
        ],
        aiCount: 2,
        aiPreview: "AI reads every document. The engine walks every rule. Every verdict cites the exact document that backed it.",
    },
    // Slide 3 · Player · AI Verification (real ERP mockup)
    {
        kind: "feature",
        bucketId: "players",
        icon: ShieldCheck,
        eyebrow: "Players · AI Verification",
        featureName: "AI Eligibility Engine · Verification Trail",
        problem: "Reviewers guessed. No two verdicts ever matched.",
        aiVerb: "REASONS & RECOMMENDS",
        aiDescription: "AI reads every KYC document. The engine walks 8+ eligibility rules against every uploaded scan. Missing form fields? AI-extracted values from Aadhaar / marksheet are promoted automatically. Every verdict cites the exact document that backed it — QR-verified, district-matched, DOB-cross-checked.",
        metric: { before: "15–30 min/doc", after: "seconds", label: "per player · verification time" },
        seasonSave: "≈ 450 staff-hours · zero post-hoc disqualifications",
        dividend: "= selectors focus on cricket, reviewers focus on judgement",
        livePage: { label: "Player Detail · Verification Trail", path: "/players" },
        mockup: "player",
    },
    // Slide 4 · Player · Correction Loop (mockup showing email + player page)
    {
        kind: "feature",
        bucketId: "players",
        icon: FileCheck2,
        eyebrow: "Players · Correction Loop",
        featureName: "Correction Request · Tokenised Player Link",
        problem: "Registration errors triggered phone calls, WhatsApp, resubmissions from scratch.",
        aiVerb: "FLAGS & INVITES CORRECTION",
        aiDescription: "Reviewer flags specific fields and documents · writes one note · Send. Player gets email + SMS with a single-use tokenised link (no login). Only flagged fields are editable. Player resubmits → reviewer sees the corrected data with a full diff.",
        metric: { before: "3–5 days back-and-forth", after: "under 24 hours", label: "correction cycle" },
        seasonSave: "≈ 200 staff-hours · zero misplaced follow-ups · full audit trail",
        dividend: "= faster approvals · fewer disgruntled players · Secretariat freed from chasing corrections",
        livePage: { label: "Registration Review · Request Correction", path: "/player-registrations" },
        mockup: "correction",
    },

    // ═══════════════════════════════════════════════════════════════
    // FOCUS 2 · GRANT CLAIMS (audience: divisions)
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "bucket_intro",
        bucketId: "grants",
        bucketLabel: "Focus 02 · Grant Claims",
        eyebrow: "03 · The Grants Problem",
        icon: HandCoins,
        title: "Every rupee has a scheme number. Every claim has a story.",
        subtitle: "33 schemes across 7 categories. Old flow: circulars, printouts, inbox chains.",
        pains: [
            "Divisions guessed which scheme applied · called MPCA to confirm",
            "MPCA opened every claim one at a time — even the boring ones",
            "8-week approval cycles · claimants chased status by phone",
            "Small variances hidden in 60-line invoices",
        ],
        aiCount: 2,
        aiPreview: "AI reads the claim, cites the scheme, writes per-document comments. MPCA bulk-approves the greens, opens only the ambers.",
    },
    // Slide 6 · Grants · AI Review (REAL ERP screenshot)
    {
        kind: "feature",
        bucketId: "grants",
        icon: ShieldCheck,
        eyebrow: "Grants · AI Review",
        featureName: "Every Claim · Auto-Verified Against Its Scheme",
        problem: "Reviewers opened 7 documents, cross-checked 6 rates, wrote nothing down.",
        aiVerb: "READS EVERY DOC · CITES EVERY LINE",
        aiDescription: "Claim submitted → AI reads every attached document, extracts the values, compares against the scheme's rate card + eligibility conditions, writes a per-document comment. Amber flags surface variances (ground rate exceeded by ₹4,500) before any human opens the file.",
        metric: { before: "45 min/claim", after: "≤ 45 seconds", label: "per claim · AI comment generation" },
        seasonSave: "≈ 350 staff-hours · every claim reviewed the same way",
        dividend: "= reviewers open only the flagged files · greens sail through",
        livePage: { label: "Claim Detail · AI Review", path: "/claims" },
        mockup: "image:/deck-screenshots/claim_detail_0142.png",
    },
    // Slide 7 · Grants · MPCA Approval (REAL ERP screenshot)
    {
        kind: "feature",
        bucketId: "grants",
        icon: FileCheck2,
        eyebrow: "Grants · MPCA Approval",
        featureName: "Approver Queue · Bulk-Approve the Cleared, Review the Ambers",
        problem: "MPCA opened every claim, one at a time — even the boring ones.",
        aiVerb: "SORTS · RECOMMENDS · BULK-APPROVES",
        aiDescription: "The approver queue groups claims by AI verdict — green (cleared), amber (variance), red (issue). One click bulk-approves the greens. Ambers open with the AI's specific citation. Every decision is signed, Maker-Checker logged, immutable. Claimants paid weeks earlier.",
        metric: { before: "3–4 days", after: "under 30 minutes", label: "MPCA daily approval batch" },
        seasonSave: "≈ 250 approver-hours · zero missed claims",
        dividend: "= claimants paid weeks earlier · Secretariat freed from data entry",
        livePage: { label: "MPCA Approver Console", path: "/claims" },
        mockup: "image:/deck-screenshots/claims_queue.png",
    },

    // ═══════════════════════════════════════════════════════════════
    // Slide 8 · Also handles — short summary for accounting / governance
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "feature",
        bucketId: "also",
        icon: Landmark,
        eyebrow: "04 · Also Handled — Same Discipline",
        featureName: "Tournaments · Accounting · Governance",
        problem: "The two backlogs above aren't the only backlogs. But they use the same operating model.",
        aiVerb: "SAME PATTERN · APPLIED EVERYWHERE",
        aiDescription: "Every tournament opens one workspace (Basics, Fixtures, Officials, Squads, Budget, Finance, Closure) — 12 tiles, one identity. Invoices are AI-audited the same way as grant claims. Accounting rolls up automatically. Governance (Maker-Checker, meetings, minutes) has the same signed audit trail. Nothing sits in an inbox.",
        metric: { before: "12 apps + 40 emails", after: "1 workspace", label: "per tournament" },
        seasonSave: "≈ 800 staff-hours · every fact in one place · every decision signed",
        dividend: "= divisions and MPCA share one source of truth · zero \"which version is final?\"",
        livePage: { label: "Tournament · Workspace View", path: "/tournaments" },
        mockup: "image:/deck-screenshots/tournament_workspace.png",
    },

    // ═══════════════════════════════════════════════════════════════
    // Slide 9 · The standing offer — CTA
    // ═══════════════════════════════════════════════════════════════
    {
        kind: "cta",
        eyebrow: "05 · The Standing Offer",
        title: "Every association runs the same backlogs. MPCA just wrote the answer.",
        body: "One state. Ten divisions. One codebase. One audit trail. Rewritable per season, portable to any board.",
        body2: null,
        stats: [
            { value: "10",   label: "MPCA divisions · unified under one framework" },
            { value: "33",   label: "Grant schemes · one signed master doc" },
            { value: "3,000+", label: "Players · one KYC-verified register" },
            { value: "0",    label: "Vendor lock-in · every line owned by MPCA" },
        ],
        quote: "MPCA moved first. Players and Divisions no longer wait on paperwork.",
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
                Next: <strong>players (AI verification + correction loop) → grants (AI review + MPCA approval).</strong> Then a short close on tournaments, accounting and governance.
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
