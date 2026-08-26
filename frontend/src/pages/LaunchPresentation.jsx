/**
 * /launch-presentation — MPCA ERP · Stakeholder Pitch Deck (Iter 131c)
 * ────────────────────────────────────────────────────────────────────
 * Feb 2026 · Focused rewrite (Iter 131c):
 *   User steer — "This should majorly show how we are making it convenient
 *   for players. Then remove all stats — not live yet. On grants, show
 *   Divisions can pick eligible scheme + AI verifies docs on the spot.
 *   Other modules (squads, invoice audit, tournaments) — brief residual
 *   mention at the end only."
 *
 * Slide arc (revised):
 *   1. Login opener — browser chrome frame + MPCA logo + ERP name
 *   2. What we're showing today — two highlights only
 *   3. Players · A link, docs upload, AI reads it live
 *   4. Players · If anything is off, we tell them & they fix it right away
 *   5. Grants · Divisions pick eligible scheme, see exactly what to upload
 *   6. Grants · AI verifies each document on the spot
 *   7. Also inside the ERP — brief residual list (no numbers)
 *   8. Sign-off — the promise, no stats
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight, ArrowLeft, X, Sparkles, ShieldCheck, FileCheck2,
    Users, HandCoins, Trophy, Landmark, BarChart3, ClipboardList,
    Lock, MailCheck, Link2, ScrollText,
} from "lucide-react";
import { DL } from "@/lib/designSystem";

// ═════════════════════════════════════════════════════════════════════
// Palette shortcut
// ═════════════════════════════════════════════════════════════════════
const emerald   = DL.emerald;
const emeraldBg = `linear-gradient(155deg, ${DL.emerald} 0%, ${DL.ink} 100%)`;
const gold      = DL.gold;
const oxblood   = DL.danger;
const paper     = DL.paper;
const ivory     = DL.ivory;

// ═════════════════════════════════════════════════════════════════════
// Slide 1 · Login (browser chrome frame + logo overlay)
// ═════════════════════════════════════════════════════════════════════
const SlideLogin = () => (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-16 relative">
        <div className="mb-4 flex items-center gap-3" style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.32em", color: gold, fontWeight: 700 }}>
            <div style={{ width: 40, height: 1, background: gold }} />
            MADHYA PRADESH CRICKET ASSOCIATION
            <div style={{ width: 40, height: 1, background: gold }} />
        </div>
        <h1 className="text-center mb-3" style={{
            fontFamily: DL.fontDisplay, fontWeight: 800,
            fontSize: "clamp(38px, 5vw, 68px)", lineHeight: 1.02,
            letterSpacing: "-0.02em", color: paper,
        }}>
            MPCA <span style={{ color: gold }}>Enterprise Resource Planning</span>
        </h1>
        <p className="text-center mb-8 max-w-3xl" style={{
            fontFamily: DL.fontBody, fontStyle: "italic",
            fontSize: "clamp(15px, 1.4vw, 20px)",
            color: "rgba(245,239,230,0.72)",
        }}>
            Built to make life simpler for our players and our divisions.
        </p>

        <div className="w-full max-w-[1080px] relative" style={{
            borderRadius: 12, overflow: "hidden",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6), 0 8px 24px -8px rgba(0,0,0,0.4)",
            border: `1px solid rgba(184,131,40,0.35)`,
        }}>
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "#E9E2D2", borderBottom: `1px solid ${DL.ruleStrong}` }}>
                <div className="flex gap-1.5">
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#E36363" }} />
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#E6B84D" }} />
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#4EB86A" }} />
                </div>
                <div className="ml-4 flex-1 flex items-center gap-2 px-3 py-1 rounded" style={{ background: "rgba(255,255,255,0.75)", border: `1px solid ${DL.rule}` }}>
                    <Lock size={11} style={{ color: emerald }} />
                    <span style={{ fontFamily: DL.fontMono, fontSize: 10, color: DL.ink2 }}>
                        https://erp.mpcaonline.com/login
                    </span>
                </div>
                <div className="text-[9px] uppercase tracking-widest font-bold" style={{ fontFamily: DL.fontMono, color: DL.muted }}>
                    Live
                </div>
            </div>
            <img
                src="/deck-screenshots/login_page.png"
                alt="MPCA ERP Login"
                style={{ display: "block", width: "100%", height: "auto" }}
                data-testid="login-screenshot"
            />
        </div>

        <div className="mt-6 flex items-center gap-6" style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: "0.24em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
            <span>Est. 1957</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>2026 Digital Era</span>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Slide 2 · What we're showing today (two highlights)
// ═════════════════════════════════════════════════════════════════════
const SlideOverview = () => (
    <div>
        <Eyebrow n="02" text="What we're showing today" />
        <Title>Two things that used to take weeks. Now they take a link.</Title>
        <Subtitle>The ERP does many things. Today we focus on the two that matter the most to Players and Divisions — everything else is quietly handled the same way, inside the same platform.</Subtitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
            {/* Highlight 1 · Players */}
            <div style={{
                background: "linear-gradient(155deg, rgba(184,131,40,0.14) 0%, rgba(184,131,40,0.03) 100%)",
                border: `1.5px solid ${gold}88`,
                padding: "28px 26px", borderRadius: 4,
            }}>
                <div className="flex items-center gap-3 mb-4">
                    <div style={{ width: 44, height: 44, background: gold, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Users size={22} style={{ color: emerald }} strokeWidth={2.2} />
                    </div>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.24em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
                        Highlight 01
                    </div>
                </div>
                <div style={{ fontFamily: DL.fontDisplay, fontSize: 22, fontWeight: 800, color: paper, lineHeight: 1.2, marginBottom: 8 }}>
                    Players register online with live AI checks.
                </div>
                <div style={{ fontFamily: DL.fontBody, fontSize: 14, color: "rgba(245,239,230,0.82)", lineHeight: 1.6 }}>
                    Player receives one link, uploads documents, and gets an instant AI check on the spot. If anything is off, they get a clear message and can rectify it right away.
                </div>
            </div>

            {/* Highlight 2 · Grants */}
            <div style={{
                background: "linear-gradient(155deg, rgba(184,131,40,0.14) 0%, rgba(184,131,40,0.03) 100%)",
                border: `1.5px solid ${gold}88`,
                padding: "28px 26px", borderRadius: 4,
            }}>
                <div className="flex items-center gap-3 mb-4">
                    <div style={{ width: 44, height: 44, background: gold, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <HandCoins size={22} style={{ color: emerald }} strokeWidth={2.2} />
                    </div>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.24em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
                        Highlight 02
                    </div>
                </div>
                <div style={{ fontFamily: DL.fontDisplay, fontSize: 22, fontWeight: 800, color: paper, lineHeight: 1.2, marginBottom: 8 }}>
                    Divisions claim grants without the paperwork guesswork.
                </div>
                <div style={{ fontFamily: DL.fontBody, fontSize: 14, color: "rgba(245,239,230,0.82)", lineHeight: 1.6 }}>
                    Divisions pick an eligible scheme and see exactly what to upload. AI verifies every document on the spot so nothing gets rejected weeks later for a missing paper.
                </div>
            </div>
        </div>

        <div className="mt-10 text-center max-w-3xl mx-auto">
            <div style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.28em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
                Ten minutes · Two highlights · One platform
            </div>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Slide 3 · Players — one link, docs upload, AI on the spot
// ═════════════════════════════════════════════════════════════════════
const SlidePlayerLink = () => (
    <FeatureShell
        eyebrow="03 · Players"
        icon={Link2}
        title="One link. Upload documents. Register on the spot."
        subtitle="Players no longer come to the office with paper files. Each player receives a secure registration link from their Division. Everything happens online, in the player's own hands."
        screenshot="/deck-screenshots/public_reg_docs_first.png"
        screenshotCaption="Live ERP · Public player registration link"
        bullets={[
            { icon: MailCheck, text: "Division emails or shares one registration link with each player" },
            { icon: FileCheck2, text: "Player uploads Aadhaar, Birth Certificate, Marksheets and other KYC — right from their phone" },
            { icon: Sparkles,   text: "AI reads every document and auto-fills the form — player just reviews and confirms" },
            { icon: ShieldCheck,text: "Nothing is submitted to MPCA until the player is happy with what AI has extracted" },
        ]}
        closer="No queues. No paperwork days. No trips to the Division office."
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 4 · Players — rectification on the fly
// ═════════════════════════════════════════════════════════════════════
const SlidePlayerRectify = () => (
    <FeatureShell
        eyebrow="04 · Players"
        icon={ShieldCheck}
        title="If anything is off, the player is told immediately."
        subtitle="No more waiting for the Division to reply with a rejection weeks later. AI flags issues on the spot — the player can correct the document and re-run the check without leaving the page."
        screenshot="/deck-screenshots/player_kyc_ai.png"
        screenshotCaption="Live ERP · AI Verification report with cross-document warnings"
        bullets={[
            { icon: Sparkles,    text: "Each uploaded document gets a live status — AI Verified, Needs Review, or Problem" },
            { icon: ScrollText,  text: "Clear message tells the player exactly what to fix — e.g. \"Aadhaar last update was in 2014, please share a recent update history\"" },
            { icon: FileCheck2,  text: "Player replaces the document, re-runs the check, and moves on — no email chains" },
            { icon: MailCheck,   text: "Even after submission, if MPCA needs a correction, the player gets a tokenised link — no login needed" },
        ]}
        closer="Corrections that used to take weeks now happen in minutes."
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 5 · Grants — Divisions pick eligible scheme, see docs needed
// ═════════════════════════════════════════════════════════════════════
const SlideGrantsPick = () => (
    <FeatureShell
        eyebrow="05 · Grants"
        icon={HandCoins}
        title="Divisions see every eligible scheme — and exactly what to upload."
        subtitle="No more guessing which scheme to claim under, or which papers to attach. The Schemes Register lays out every active scheme with its eligibility conditions and required documents right on the screen."
        screenshot="/deck-screenshots/schemes_register.png"
        screenshotCaption="Live ERP · Schemes Register · 33 schemes across 7 categories"
        bullets={[
            { icon: Landmark,    text: "One master document · every grant, reimbursement, camp, award, welfare, infrastructure and revenue-share scheme MPCA runs" },
            { icon: ClipboardList, text: "Category tabs let Divisions filter to what's actually relevant — Annual, Reimbursement, Camp, Infrastructure and more" },
            { icon: FileCheck2,  text: "Every scheme lists exactly which documents to attach and which eligibility conditions apply" },
            { icon: ShieldCheck, text: "Division hits Claim → the claim form opens pre-configured with the scheme's document checklist" },
        ]}
        closer="Divisions never wonder what to file, or under which head, ever again."
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 6 · Grants — AI verifies each document on the spot
// ═════════════════════════════════════════════════════════════════════
const SlideGrantsAi = () => (
    <FeatureShell
        eyebrow="06 · Grants"
        icon={Sparkles}
        title="AI verifies every document as it's uploaded."
        subtitle="The moment a Division attaches a document, AI reads it, matches it against the scheme's rate card and eligibility rules, and writes a comment right next to the document. Nothing sits in an inbox waiting for a reviewer."
        screenshot="/deck-screenshots/claim_detail_0142.png"
        screenshotCaption="Live ERP · Claim Detail · Per-document AI verdicts with rule citations"
        bullets={[
            { icon: Sparkles,    text: "AI reads each supporting document, extracts the numbers, and compares against the scheme's approved rates" },
            { icon: ShieldCheck, text: "Any variance is called out on the spot — Division sees it before submitting to MPCA" },
            { icon: FileCheck2,  text: "MPCA reviewers open the claim already knowing exactly what's clean and what needs a second look" },
            { icon: MailCheck,   text: "If MPCA asks for more documents, the request lands directly with the Division — with a clear reason" },
        ]}
        closer="Fewer rejections. Fewer resubmissions. Claims settle faster."
    />
);

// ═════════════════════════════════════════════════════════════════════
// Slide 7 · Also inside the ERP (residual list — no numbers)
// ═════════════════════════════════════════════════════════════════════
const ALSO_INSIDE = [
    { icon: Trophy,        title: "Tournaments",         copy: "One workspace per tournament — fixtures, officials, budgets, closure. Every fact in one place." },
    { icon: ClipboardList, title: "Squad Selection",     copy: "Selection console with signed PDFs and AI cross-checks against the roster." },
    { icon: FileCheck2,    title: "Invoice AI Audit",    copy: "Every tournament invoice AI-audited against the budget head and rate card before payment." },
    { icon: Landmark,      title: "Governance",          copy: "Maker-Checker on every major action. Meetings, minutes and audit trail baked in." },
    { icon: BarChart3,     title: "Reporting",           copy: "Live season dashboards — finance, tournaments, players — always current, never stale." },
];

const SlideAlsoInside = () => (
    <div>
        <Eyebrow n="07" text="Also inside the ERP" />
        <Title>Everything else runs on the same discipline — quietly, in the background.</Title>
        <Subtitle>Once Players and Grants are on the platform, the rest of MPCA&apos;s operating surface uses the same signed audit trail, the same AI-first review, the same one-source-of-truth database. Happy to demo any of these separately.</Subtitle>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
            {ALSO_INSIDE.map((m, i) => {
                const Icon = m.icon;
                return (
                    <div key={i} style={{
                        background: "rgba(245,239,230,0.04)",
                        border: `1px solid ${gold}33`,
                        padding: "18px 16px", borderRadius: 3,
                    }} data-testid={`residual-tile-${i}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <Icon size={16} style={{ color: gold }} strokeWidth={2.2} />
                            <div style={{ fontFamily: DL.fontDisplay, fontSize: 15, fontWeight: 700, color: paper }}>
                                {m.title}
                            </div>
                        </div>
                        <div style={{ fontFamily: DL.fontBody, fontSize: 12.5, color: "rgba(245,239,230,0.68)", lineHeight: 1.5 }}>
                            {m.copy}
                        </div>
                    </div>
                );
            })}
        </div>

        <div className="mt-8 text-center max-w-3xl mx-auto">
            <div className="border-t pt-4" style={{ borderColor: `${gold}33` }}>
                <p style={{ fontFamily: DL.fontBody, fontStyle: "italic", fontSize: 14, color: "rgba(245,239,230,0.65)", lineHeight: 1.6 }}>
                    Each of these modules deserves its own conversation. Today, we wanted to keep the room focused on the two backlogs Players and Divisions feel every single day.
                </p>
            </div>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Slide 8 · Sign-off (no numbers)
// ═════════════════════════════════════════════════════════════════════
const SlideSignOff = () => (
    <div className="flex flex-col justify-center min-h-[68vh]">
        <Eyebrow n="08" text="The Promise" />
        <Title>Players register with a link. Divisions claim with a click.</Title>
        <Subtitle>The MPCA ERP is designed so that neither of them ever has to visit an office, chase an email, or wonder where their file is stuck. Everything lands where it should — signed, audited, and traceable.</Subtitle>

        <div
            className="mt-10 mx-auto text-center px-10 py-10 max-w-4xl relative"
            style={{ border: `2px solid ${gold}`, borderRadius: 4, background: "rgba(184,131,40,0.06)" }}
        >
            <Sparkles size={22} style={{ color: gold, margin: "0 auto 14px", display: "block" }} />
            <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: "clamp(24px, 2.6vw, 34px)", color: paper, lineHeight: 1.3 }}>
                Simpler for players.
            </div>
            <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: "clamp(24px, 2.6vw, 34px)", color: gold, lineHeight: 1.3, marginTop: 4 }}>
                Faster for divisions.
            </div>
            <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: "clamp(24px, 2.6vw, 34px)", color: paper, lineHeight: 1.3, marginTop: 4 }}>
                Cleaner for MPCA.
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
        fontSize: "clamp(28px, 3.4vw, 46px)", lineHeight: 1.1,
        letterSpacing: "-0.01em", color: paper, maxWidth: 1100,
    }}>
        {children}
    </h1>
);

const Subtitle = ({ children }) => (
    <p style={{
        fontFamily: DL.fontBody, fontStyle: "italic",
        fontSize: "clamp(14px, 1.35vw, 18px)",
        color: "rgba(245,239,230,0.72)", maxWidth: 950, lineHeight: 1.55,
    }}>
        {children}
    </p>
);

const FeatureShell = ({ eyebrow, icon: Icon, title, subtitle, screenshot, screenshotCaption, bullets, closer }) => (
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
                <div style={{
                    border: `2px solid ${gold}`, borderRadius: 4, overflow: "hidden",
                    boxShadow: "0 25px 60px -20px rgba(0,0,0,0.5), 0 6px 16px -6px rgba(0,0,0,0.4)",
                }}>
                    <img src={screenshot} alt="" style={{ display: "block", width: "100%", height: "auto", maxHeight: "60vh", objectFit: "contain", background: paper }} />
                </div>
                <div className="mt-2 text-center" style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: "0.14em", color: `rgba(245,239,230,0.55)`, textTransform: "uppercase" }}>
                    {screenshotCaption}
                </div>
            </div>

            {/* Right · bullets + closer */}
            <div>
                <ul className="space-y-3.5">
                    {bullets.map((b, i) => {
                        const BIcon = b.icon || ShieldCheck;
                        return (
                            <li key={i} className="flex items-start gap-3" style={{ fontFamily: DL.fontBody, fontSize: 14, color: "rgba(245,239,230,0.88)", lineHeight: 1.55 }}>
                                <div style={{ width: 26, height: 26, background: `${gold}22`, border: `1px solid ${gold}77`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                                    <BIcon size={13} style={{ color: gold }} />
                                </div>
                                <span>{b.text}</span>
                            </li>
                        );
                    })}
                </ul>

                {closer && (
                    <div className="mt-8 pt-5" style={{ borderTop: `1px solid ${gold}55` }}>
                        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: "clamp(18px, 1.8vw, 24px)", color: gold, lineHeight: 1.3, fontStyle: "italic" }}>
                            {closer}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Deck shell — 8 slides
// ═════════════════════════════════════════════════════════════════════
const SLIDES = [
    { id: "login",           kind: "full", render: SlideLogin },
    { id: "overview",        kind: "std",  render: SlideOverview },
    { id: "player-link",     kind: "std",  render: SlidePlayerLink },
    { id: "player-rectify",  kind: "std",  render: SlidePlayerRectify },
    { id: "grants-pick",     kind: "std",  render: SlideGrantsPick },
    { id: "grants-ai",       kind: "std",  render: SlideGrantsAi },
    { id: "also-inside",     kind: "std",  render: SlideAlsoInside },
    { id: "signoff",         kind: "std",  render: SlideSignOff },
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
        <div className="fixed inset-0"
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
                <div data-testid="launch-progress" style={{
                    width: `${progress}%`, height: "100%", background: gold,
                    transition: "width 320ms cubic-bezier(0.22,1,0.36,1)",
                    boxShadow: `0 0 12px ${gold}`,
                }} />
            </div>

            {/* Top-right controls */}
            <div style={{ position: "absolute", top: 22, right: 28, display: "flex", gap: 10, alignItems: "center", zIndex: 5 }}>
                <span className="text-[11px] uppercase tracking-[0.24em] font-bold"
                    style={{ fontFamily: DL.fontMono, color: gold, opacity: 0.9 }}
                    data-testid="launch-counter"
                >
                    {String(slide + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
                <Link to="/dashboard"
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
                        <button key={i} onClick={() => setSlide(i)}
                            className="rounded-full transition-all"
                            style={{
                                height: 6, width: i === slide ? 24 : 6,
                                background: i === slide ? gold : "rgba(255,255,255,0.28)",
                                border: "none", cursor: "pointer",
                            }}
                            data-testid={`launch-dot-${i}`} />
                    ))}
                </div>
                <NavBtn onClick={next} disabled={slide === total - 1} testid="launch-next" primary>
                    Next <ArrowRight size={16} strokeWidth={2.5} />
                </NavBtn>
            </div>
        </div>
    );
}

const NavBtn = ({ onClick, disabled, primary, children, testid }) => (
    <button onClick={onClick} disabled={disabled}
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
    >{children}</button>
);

// Reference imports so ESLint doesn't nag on unused tokens/icons.
export const __refs__ = { ivory, paper, emerald, gold, oxblood };
