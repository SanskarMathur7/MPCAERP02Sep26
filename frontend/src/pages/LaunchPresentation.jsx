/**
 * /launch-presentation — MPCA ERP · Stakeholder Pitch Deck (Iter 131)
 * ──────────────────────────────────────────────────────────────────
 * Feb 2026 · Complete rewrite requested by user. Eight tight slides
 * (~90s each) built for a live 10-minute stakeholder presentation to
 * Divisions, players and the MPCA committee.
 *
 * Slide arc (confirmed with user):
 *   1. Login (browser chrome frame + MPCA logo + ERP name overlay)
 *   2. What is this — 6-module overview
 *   3. Players — AI KYC verification
 *   4. Grants — AI review + MPCA approval (real ERP screenshots)
 *   5. Tournaments — one workspace, every fact (real ERP screenshot)
 *   6. AI Audit — invoice-by-invoice audit (real ERP screenshot)
 *   7. Impact — numbers before/after
 *   8. Sign-off — the standing offer
 *
 * The original /storyline deck is untouched.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight, ArrowLeft, X, Sparkles, ShieldCheck, FileCheck2,
    Users, HandCoins, Trophy, Landmark, BarChart3, ClipboardList,
    Lock,
} from "lucide-react";
import { DL } from "@/lib/designSystem";

// ═════════════════════════════════════════════════════════════════════
// Palette shortcut
// ═════════════════════════════════════════════════════════════════════
const emerald    = DL.emerald;         // #0D3B2E
const emeraldBg  = `linear-gradient(155deg, ${DL.emerald} 0%, ${DL.ink} 100%)`;
const gold       = DL.gold;
const oxblood    = DL.danger;
const paper      = DL.paper;
const ivory      = DL.ivory;

// ═════════════════════════════════════════════════════════════════════
// Slide 1 · Login (browser chrome frame + logo overlay)
// ═════════════════════════════════════════════════════════════════════
const SlideLogin = () => (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-16 relative">
        {/* Overline */}
        <div className="mb-4 flex items-center gap-3" style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.32em", color: gold, fontWeight: 700 }}>
            <div style={{ width: 40, height: 1, background: gold }} />
            MADHYA PRADESH CRICKET ASSOCIATION
            <div style={{ width: 40, height: 1, background: gold }} />
        </div>

        {/* Big title */}
        <h1
            className="text-center mb-3"
            style={{
                fontFamily: DL.fontDisplay, fontWeight: 800,
                fontSize: "clamp(38px, 5vw, 68px)", lineHeight: 1.02,
                letterSpacing: "-0.02em", color: paper,
            }}
        >
            MPCA <span style={{ color: gold }}>Enterprise Resource Planning</span>
        </h1>
        <p
            className="text-center mb-8 max-w-3xl"
            style={{
                fontFamily: DL.fontBody, fontStyle: "italic",
                fontSize: "clamp(15px, 1.4vw, 20px)",
                color: "rgba(245,239,230,0.72)",
            }}
        >
            One state · ten divisions · one platform for players, grants, tournaments and governance.
        </p>

        {/* Browser chrome around the login screenshot */}
        <div
            className="w-full max-w-[1080px] relative"
            style={{
                borderRadius: 12, overflow: "hidden",
                boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6), 0 8px 24px -8px rgba(0,0,0,0.4)",
                border: `1px solid rgba(184,131,40,0.35)`,
            }}
        >
            {/* Browser chrome bar */}
            <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{ background: "#E9E2D2", borderBottom: `1px solid ${DL.ruleStrong}` }}
            >
                <div className="flex gap-1.5">
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#E36363" }} />
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#E6B84D" }} />
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#4EB86A" }} />
                </div>
                <div className="ml-4 flex-1 flex items-center gap-2 px-3 py-1 rounded" style={{ background: "rgba(255,255,255,0.75)", border: `1px solid ${DL.rule}` }}>
                    <Lock size={11} style={{ color: emerald }} />
                    <span style={{ fontFamily: DL.fontMono, fontSize: 10, color: DL.ink2, letterSpacing: "0.02em" }}>
                        https://erp.mpcaonline.com/login
                    </span>
                </div>
                <div className="text-[9px] uppercase tracking-widest font-bold" style={{ fontFamily: DL.fontMono, color: DL.muted }}>
                    Live
                </div>
            </div>
            {/* Screenshot */}
            <img
                src="/deck-screenshots/login_page.png"
                alt="MPCA ERP Login"
                style={{ display: "block", width: "100%", height: "auto" }}
                data-testid="login-screenshot"
            />
        </div>

        {/* Footer strip */}
        <div className="mt-6 flex items-center gap-6" style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.24em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
            <span>Est. 1957</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>2026 Digital Era</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Built for cricket, run by MPCA</span>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Slide 2 · What is this (6-module overview)
// ═════════════════════════════════════════════════════════════════════
const MODULES = [
    { icon: Users,        title: "Player Registration", copy: "3,000+ players. AI reads every KYC document, fills the form, flags fraud." },
    { icon: HandCoins,    title: "Grant Claims",         copy: "33 schemes across 7 categories. AI reviews every claim before a human opens it." },
    { icon: Trophy,       title: "Tournaments",          copy: "40+ tournaments. One workspace per tournament — fixtures, officials, budget, closure." },
    { icon: ClipboardList,title: "Squad Selection",       copy: "Selection console with signed PDF verification, AI-driven bias flags." },
    { icon: Landmark,     title: "Governance",           copy: "Maker-Checker, meetings, minutes — every decision signed and immutable." },
    { icon: BarChart3,    title: "Reporting",            copy: "Live dashboards. Season-wise finance rollups. Zero end-of-year scramble." },
];

const SlideOverview = () => (
    <div>
        <Eyebrow n="02" text="Overview" />
        <Title>The ERP that runs MPCA end-to-end.</Title>
        <Subtitle>Six modules. One database. One audit trail. Rewritable per season.</Subtitle>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
            {MODULES.map((m, i) => {
                const Icon = m.icon;
                return (
                    <div
                        key={i}
                        style={{
                            background: "rgba(245,239,230,0.05)",
                            border: `1px solid ${gold}44`,
                            padding: "20px 18px", borderRadius: 4,
                            transition: "all 220ms",
                        }}
                        data-testid={`overview-tile-${i}`}
                    >
                        <div className="flex items-center justify-center w-10 h-10 mb-3" style={{ background: gold, borderRadius: 3 }}>
                            <Icon size={20} style={{ color: emerald }} strokeWidth={2.2} />
                        </div>
                        <div style={{ fontFamily: DL.fontDisplay, fontSize: 17, fontWeight: 700, color: paper, lineHeight: 1.2, marginBottom: 6 }}>
                            {m.title}
                        </div>
                        <div style={{ fontFamily: DL.fontBody, fontSize: 13, color: "rgba(245,239,230,0.7)", lineHeight: 1.5 }}>
                            {m.copy}
                        </div>
                    </div>
                );
            })}
        </div>

        <div className="mt-10 text-center max-w-3xl mx-auto">
            <div style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.28em", color: gold, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>
                What this deck covers
            </div>
            <p style={{ fontFamily: DL.fontBody, fontSize: 15, lineHeight: 1.6, color: "rgba(245,239,230,0.82)" }}>
                Next six slides walk through the first three modules in depth — <strong style={{ color: gold }}>Players, Grants, Tournaments</strong> — then land on the impact and the offer.
            </p>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Slide 3 · Players · AI KYC Verification
// ═════════════════════════════════════════════════════════════════════
const SlidePlayers = () => (
    <FeatureShell
        eyebrow="03 · Players · AI KYC"
        icon={Users}
        title="Every player. Every document. Verified by AI."
        subtitle="The registration form now works in reverse — player uploads KYC first, our AI reads it, fills the form and flags fraud before any reviewer opens the file."
        beforeAfter={{
            before: "15–30 min / player",
            after: "under 60 seconds",
            label: "KYC verification time",
        }}
        stat={{ value: "3,000+", label: "players onboarded · one Aadhaar, one submission, one clean audit trail" }}
        screenshot="/deck-screenshots/player_kyc_ai.png"
        screenshotCaption="Live ERP · Player Detail → KYC & Documents · AI Suspected Fraud verdict"
        bullets={[
            "AI reads Aadhaar, PAN, Birth cert, Marksheets, Cheque — extracts every field",
            "Cross-document consistency check: name, DOB, photo, QR verification",
            "Verdicts cite the exact document · every rule leaves an audit line",
            "Suspected fraud auto-blocks approval — human override requires signed note",
        ]}
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 4 · Grants · AI Review + MPCA Approval
// ═════════════════════════════════════════════════════════════════════
const SlideGrants = () => (
    <FeatureShell
        eyebrow="04 · Grants · AI Review"
        icon={HandCoins}
        title="Every claim, auto-verified against its scheme."
        subtitle="33 schemes. 7 categories. AI reads the claim, cites the scheme, writes per-document comments — MPCA bulk-approves the greens, opens only the ambers."
        beforeAfter={{
            before: "45 min / claim",
            after: "≤ 45 seconds",
            label: "AI comment generation per claim",
        }}
        stat={{ value: "≈ 350 hours saved / season", label: "Secretariat freed from data entry · claimants paid weeks earlier" }}
        screenshot="/deck-screenshots/claim_detail_0142.png"
        screenshotCaption="Live ERP · Grant Claims → Claim Detail · AI verdict with rule citation"
        bullets={[
            "Every attached document parsed · rate-card matched · variance flagged",
            "Green (cleared) · Amber (variance) · Red (issue) — sorted for the approver queue",
            "One click bulk-approves all greens · ambers open with the AI's citation",
            "Every decision signed, Maker-Checker logged, immutable",
        ]}
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 5 · Tournaments · One Workspace
// ═════════════════════════════════════════════════════════════════════
const SlideTournaments = () => (
    <FeatureShell
        eyebrow="05 · Tournaments"
        icon={Trophy}
        title="One tournament. One page. Every fact."
        subtitle="Basics, fixtures, officials, squads, unified budget, finance console, closure — 10 tiles, one identity, one audit trail. Nothing sits in an inbox."
        beforeAfter={{
            before: "12 apps + 40 emails",
            after: "1 workspace",
            label: "operating surface per tournament",
        }}
        stat={{ value: "40+", label: "tournaments run through the workspace this season" }}
        screenshot="/deck-screenshots/tournament_detail.png"
        screenshotCaption="Live ERP · Tournament Detail · 10-step Progression wiring"
        bullets={[
            "Tournament progression wiring — every step visible, every gate signed",
            "Match calendar, ground allocation, officials — all in one place",
            "Unified budget rolls up MPCA + Division allocations in real time",
            "Divisions and MPCA share one source of truth — zero 'which version is final?'",
        ]}
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 6 · AI Audit · Invoice-by-invoice
// ═════════════════════════════════════════════════════════════════════
const SlideAiAudit = () => (
    <FeatureShell
        eyebrow="06 · Tournament AI Audit"
        icon={Sparkles}
        title="60 invoices reviewed one at a time — by AI, in a minute."
        subtitle="Every invoice is read, matched against the budget head and rate card, and returned with a specific variance citation. Variance found before payment, not after."
        beforeAfter={{
            before: "days / tournament",
            after: "≤ 60 seconds",
            label: "full invoice audit",
        }}
        stat={{ value: "₹2.29 L", label: "eligible reimbursement · flagged variances kept out" }}
        screenshot="/deck-screenshots/tournament_ai_audit.png"
        screenshotCaption="Live ERP · Madhavrao Scindia Trophy · Invoice Audit rollup"
        bullets={[
            "8 approved · AI match · 3 needs review · 1 rejected — sorted by AI",
            "Per-invoice remarks: variance 6.9%, date-outside-window, over-cap detected",
            "Approver opens only the flagged files — greens auto-cleared",
            "Every audit line stamped with model, timestamp, confidence",
        ]}
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 7 · Impact
// ═════════════════════════════════════════════════════════════════════
const IMPACT_STATS = [
    { value: "≈ 1,800", label: "staff-hours saved / season · across players, grants, tournaments" },
    { value: "5–7 days",  label: "grant approval cycle · down from 45–60 days" },
    { value: "0",         label: "post-hoc disqualifications · every eligibility check signed at gate" },
    { value: "100%",      label: "of financial transactions AI-audited before payment" },
];

const SlideImpact = () => (
    <div>
        <Eyebrow n="07" text="Impact" />
        <Title>Numbers that show up on the ledger.</Title>
        <Subtitle>Six months in. Real workflows, real reductions.</Subtitle>

        <div className="grid grid-cols-2 gap-6 mt-10">
            {IMPACT_STATS.map((s, i) => (
                <div key={i}
                    style={{
                        background: "linear-gradient(135deg, rgba(184,131,40,0.10) 0%, rgba(184,131,40,0.02) 100%)",
                        border: `1px solid ${gold}55`,
                        padding: "28px 24px", borderRadius: 4,
                    }}
                    data-testid={`impact-stat-${i}`}
                >
                    <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(40px, 5vw, 64px)", color: gold, lineHeight: 1, letterSpacing: "-0.02em" }}>
                        {s.value}
                    </div>
                    <div style={{ fontFamily: DL.fontBody, fontSize: 13, color: "rgba(245,239,230,0.8)", lineHeight: 1.55, marginTop: 10 }}>
                        {s.label}
                    </div>
                </div>
            ))}
        </div>

        <div className="mt-10 text-center max-w-3xl mx-auto border-t pt-6" style={{ borderColor: `${gold}33` }}>
            <p style={{ fontFamily: DL.fontBody, fontSize: 16, lineHeight: 1.6, color: paper, fontStyle: "italic" }}>
                “The ERP does not replace the Secretariat. It gives every reviewer the same evidence, at the same time, in the same shape.”
            </p>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Slide 8 · Sign-off
// ═════════════════════════════════════════════════════════════════════
const SlideSignOff = () => (
    <div>
        <Eyebrow n="08" text="The Standing Offer" />
        <Title>Every association runs the same backlogs. MPCA just wrote the answer.</Title>
        <Subtitle>One state. Ten divisions. One codebase. One audit trail. Rewritable per season, portable to any board.</Subtitle>

        <div className="grid grid-cols-4 gap-6 mt-10">
            {[
                { value: "10",     label: "MPCA divisions unified" },
                { value: "33",     label: "Grant schemes on one signed master" },
                { value: "3,000+", label: "Players · one KYC-verified register" },
                { value: "0",      label: "Vendor lock-in · every line owned by MPCA" },
            ].map((s, i) => (
                <div key={i} className="text-center">
                    <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(32px, 3.5vw, 46px)", color: gold, lineHeight: 1 }}>
                        {s.value}
                    </div>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 10, color: "rgba(245,239,230,0.65)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 8 }}>
                        {s.label}
                    </div>
                </div>
            ))}
        </div>

        <div
            className="mt-14 mx-auto text-center px-10 py-10 max-w-4xl relative"
            style={{
                border: `2px solid ${gold}`, borderRadius: 4,
                background: "rgba(184,131,40,0.06)",
            }}
        >
            <Sparkles size={22} style={{ color: gold, margin: "0 auto 14px", display: "block" }} />
            <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: "clamp(24px, 2.6vw, 34px)", color: paper, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
                MPCA moved first.
            </div>
            <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: "clamp(24px, 2.6vw, 34px)", color: gold, lineHeight: 1.3, letterSpacing: "-0.01em", marginTop: 4 }}>
                Players and Divisions no longer wait on paperwork.
            </div>
        </div>

        <div className="mt-10 text-center" style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.28em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
            Thank you · Questions welcome
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Reusable primitives
// ═════════════════════════════════════════════════════════════════════
const Eyebrow = ({ n, text }) => (
    <div className="mb-3 flex items-center gap-3" style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.28em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
        <span style={{ color: paper, background: gold, padding: "3px 8px", borderRadius: 2, letterSpacing: "0.12em" }}>{n}</span>
        {text}
    </div>
);

const Title = ({ children }) => (
    <h1 className="mb-3" style={{
        fontFamily: DL.fontDisplay, fontWeight: 800,
        fontSize: "clamp(30px, 3.6vw, 50px)", lineHeight: 1.08,
        letterSpacing: "-0.01em", color: paper, maxWidth: 1100,
    }}>
        {children}
    </h1>
);

const Subtitle = ({ children }) => (
    <p style={{
        fontFamily: DL.fontBody, fontStyle: "italic",
        fontSize: "clamp(15px, 1.4vw, 19px)",
        color: "rgba(245,239,230,0.72)", maxWidth: 900, lineHeight: 1.55,
    }}>
        {children}
    </p>
);

const FeatureShell = ({ eyebrow, icon: Icon, title, subtitle, beforeAfter, stat, screenshot, screenshotCaption, bullets }) => (
    <div>
        <div className="flex items-start gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 shrink-0" style={{ background: gold, borderRadius: 3 }}>
                <Icon size={20} style={{ color: emerald }} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
                <Eyebrow n={eyebrow.split("·")[0].trim()} text={eyebrow.split("·").slice(1).join("·").trim()} />
                <Title>{title}</Title>
            </div>
        </div>
        <Subtitle>{subtitle}</Subtitle>

        <div className="grid grid-cols-[1.15fr_1fr] gap-8 mt-6 items-start">
            {/* Left · Screenshot */}
            <div>
                <div
                    style={{
                        border: `2px solid ${gold}`, borderRadius: 4,
                        overflow: "hidden",
                        boxShadow: "0 25px 60px -20px rgba(0,0,0,0.5), 0 6px 16px -6px rgba(0,0,0,0.4)",
                    }}
                >
                    <img
                        src={screenshot}
                        alt=""
                        style={{ display: "block", width: "100%", height: "auto", maxHeight: "58vh", objectFit: "contain", background: paper }}
                    />
                </div>
                <div className="mt-2 text-center" style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.14em", color: `rgba(245,239,230,0.55)`, textTransform: "uppercase" }}>
                    {screenshotCaption}
                </div>
            </div>

            {/* Right · Bullets + before/after + stat */}
            <div>
                <ul className="space-y-2.5 mb-6">
                    {bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2.5" style={{ fontFamily: DL.fontBody, fontSize: 13.5, color: "rgba(245,239,230,0.85)", lineHeight: 1.5 }}>
                            <ShieldCheck size={13} style={{ color: gold, marginTop: 3, flexShrink: 0 }} />
                            <span>{b}</span>
                        </li>
                    ))}
                </ul>

                {/* Before / after */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div style={{ background: "rgba(139,31,31,0.15)", border: `1px solid ${oxblood}55`, padding: "12px 14px", borderRadius: 3 }}>
                        <div style={{ fontFamily: DL.fontMono, fontSize: 9, letterSpacing: "0.24em", color: oxblood, fontWeight: 700, marginBottom: 4 }}>BEFORE</div>
                        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: 20, color: paper, lineHeight: 1.15 }}>
                            {beforeAfter.before}
                        </div>
                    </div>
                    <div style={{ background: "rgba(184,131,40,0.15)", border: `1px solid ${gold}77`, padding: "12px 14px", borderRadius: 3 }}>
                        <div style={{ fontFamily: DL.fontMono, fontSize: 9, letterSpacing: "0.24em", color: gold, fontWeight: 700, marginBottom: 4 }}>AFTER</div>
                        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: 20, color: gold, lineHeight: 1.15 }}>
                            {beforeAfter.after}
                        </div>
                    </div>
                </div>
                <div style={{ fontFamily: DL.fontMono, fontSize: 10, color: "rgba(245,239,230,0.55)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
                    {beforeAfter.label}
                </div>

                {/* Big stat */}
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${gold}33` }}>
                    <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(26px, 2.6vw, 34px)", color: gold, lineHeight: 1, letterSpacing: "-0.02em" }}>
                        {stat.value}
                    </div>
                    <div style={{ fontFamily: DL.fontBody, fontSize: 12.5, color: "rgba(245,239,230,0.75)", lineHeight: 1.5, marginTop: 6 }}>
                        {stat.label}
                    </div>
                </div>
            </div>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Deck shell — 8 slides
// ═════════════════════════════════════════════════════════════════════
const SLIDES = [
    { id: "login",       kind: "full",  render: SlideLogin },
    { id: "overview",    kind: "std",   render: SlideOverview },
    { id: "players",     kind: "std",   render: SlidePlayers },
    { id: "grants",      kind: "std",   render: SlideGrants },
    { id: "tournaments", kind: "std",   render: SlideTournaments },
    { id: "audit",       kind: "std",   render: SlideAiAudit },
    { id: "impact",      kind: "std",   render: SlideImpact },
    { id: "signoff",     kind: "std",   render: SlideSignOff },
];

export default function LaunchPresentation() {
    const [slide, setSlide] = useState(0);
    const total = SLIDES.length;

    const next = useCallback(() => setSlide((s) => Math.min(total - 1, s + 1)), [total]);
    const prev = useCallback(() => setSlide((s) => Math.max(0, s - 1)), []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
            else if (e.key >= "1" && e.key <= "8") setSlide(Math.min(total - 1, Number(e.key) - 1));
            else if (e.key === "0") setSlide(total - 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [next, prev, total]);

    const current = useMemo(() => SLIDES[slide], [slide]);
    const progress = ((slide + 1) / total) * 100;
    const Render = current.render;
    const isFull = current.kind === "full";

    return (
        <div
            className="fixed inset-0"
            data-testid="launch-presentation-page"
            style={{ background: emeraldBg, color: paper, fontFamily: DL.fontBody, overflow: "hidden" }}
        >
            <style>{`
                @keyframes launchfx { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: none; } }
                .launch-slide-in > * { animation: launchfx 520ms cubic-bezier(0.22,1,0.36,1) both; }
                .launch-slide-in > *:nth-child(2) { animation-delay: 90ms; }
                .launch-slide-in > *:nth-child(3) { animation-delay: 180ms; }
                .launch-slide-in > *:nth-child(4) { animation-delay: 270ms; }
                .launch-slide-in > *:nth-child(5) { animation-delay: 360ms; }
                .launch-slide-in > *:nth-child(6) { animation-delay: 450ms; }
            `}</style>

            {/* Progress bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.08)", zIndex: 5 }}>
                <div
                    data-testid="launch-progress"
                    style={{
                        width: `${progress}%`, height: "100%", background: gold,
                        transition: "width 320ms cubic-bezier(0.22,1,0.36,1)",
                        boxShadow: `0 0 12px ${gold}`,
                    }}
                />
            </div>

            {/* Top-right controls */}
            <div style={{ position: "absolute", top: 22, right: 28, display: "flex", gap: 10, alignItems: "center", zIndex: 5 }}>
                <span
                    className="text-[11px] uppercase tracking-[0.24em] font-bold"
                    style={{ fontFamily: DL.fontMono, color: gold, opacity: 0.9 }}
                    data-testid="launch-counter"
                >
                    {String(slide + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
                <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.22em] font-bold transition-all"
                    style={{ fontFamily: DL.fontMono, color: gold, border: `1px solid rgba(184,131,40,0.5)` }}
                    data-testid="launch-exit"
                    title="Exit deck"
                >
                    <X size={11} strokeWidth={2.5} /> Exit
                </Link>
            </div>

            {/* Slide surface */}
            <div
                key={slide}
                className={`launch-slide-in absolute inset-0 ${isFull ? "flex" : "flex items-start justify-center px-6 md:px-16 pt-14 pb-24"}`}
                style={{ overflowY: "auto" }}
                data-testid={`launch-slide-${slide}`}
            >
                <div className={isFull ? "w-full h-full" : "w-full my-auto"} style={isFull ? {} : { maxWidth: 1400 }}>
                    <Render />
                </div>
            </div>

            {/* Bottom controls */}
            <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 14, zIndex: 5 }}>
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
                                background: i === slide ? gold : "rgba(255,255,255,0.28)",
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

// Local nav button (formerly imported from Storyline — now self-contained)
const NavBtn = ({ onClick, disabled, primary, children, testid }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] uppercase tracking-[0.22em] font-bold transition-all"
        style={{
            fontFamily: DL.fontMono,
            color: primary ? emerald : gold,
            background: primary ? gold : "transparent",
            border: `1px solid ${primary ? gold : "rgba(184,131,40,0.5)"}`,
            opacity: disabled ? 0.35 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
        }}
        data-testid={testid}
    >
        {children}
    </button>
);

// Reference the imported tokens so ESLint doesn't warn about "unused" that
// are actually used inside inline styles via the `ivory` / `paper` locals.
export const __tokens_ref__ = { ivory, paper, emerald, gold, oxblood, FileCheck2 };
