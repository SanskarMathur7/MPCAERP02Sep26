/**
 * /storyline — MPCA ERP · AI Story for the Prime Minister of India
 * Feb 2026 — Editorial-scale narrative page.
 * Uses the shared design system (DL palette, Nunito, embossed cards) so it
 * lives in the same visual language as the rest of the ERP.
 */
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { DL, embossedCard } from "@/lib/designSystem";
import {
    Sparkles, Cpu, ShieldCheck, HandCoins, Users, Trophy, Calendar,
    FileCheck2, MessageSquare, Database, ScrollText, GitBranch, Building2,
    ArrowRight, ArrowLeft, Quote, Award, Landmark, Download, Presentation, X,
} from "lucide-react";

// ── palette shortcuts ──────────────────────────────────────────────
const emeraldSlab = {
    background: `linear-gradient(180deg, ${DL.emerald} 0%, #0a2f24 100%)`,
    color: DL.paper,
    borderRadius: "8px",
    border: `1.5px solid ${DL.ruleStrong}`,
    boxShadow: [
        "inset 0 1px 0 rgba(255,255,255,0.10)",
        "inset 0 -1px 0 rgba(0,0,0,0.35)",
        "0 28px 60px -30px rgba(14,31,27,0.55)",
        "0 8px 18px -8px rgba(14,31,27,0.25)",
    ].join(", "),
};

const Eyebrow = ({ children, tone = "gold" }) => (
    <div
        className="text-[12px] uppercase tracking-[0.28em] font-bold"
        style={{ fontFamily: DL.fontMono, color: tone === "gold" ? DL.gold : DL.ink2 }}
    >
        {children}
    </div>
);

const H2 = ({ children }) => (
    <h2
        className="text-[34px] md:text-[44px] leading-[1.05] tracking-tight mt-3 mb-6"
        style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 800 }}
    >
        {children}
    </h2>
);

const PainCard = ({ n, title, before, after, icon: Icon, ai }) => (
    <div className="p-6" style={embossedCard()} data-testid={`storyline-pain-${n}`}>
        <div className="flex items-start justify-between mb-3">
            <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: DL.emeraldSoft, boxShadow: `inset 0 0 0 1.5px rgba(13,59,46,0.32)` }}
            >
                <Icon size={18} strokeWidth={2.25} style={{ color: DL.emerald }} />
            </div>
            <div className="flex items-center gap-2">
                {ai && (
                    <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] font-bold rounded-full"
                        style={{ backgroundColor: DL.gold, color: DL.ink, fontFamily: DL.fontMono }}
                    >
                        <Sparkles size={10} strokeWidth={2.5} /> AI
                    </span>
                )}
                <span
                    className="text-[11px] uppercase tracking-[0.22em] font-bold"
                    style={{ fontFamily: DL.fontMono, color: DL.muted }}
                >
                    #{String(n).padStart(2, "0")}
                </span>
            </div>
        </div>
        <div className="text-[20px] leading-tight tracking-tight" style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 800 }}>
            {title}
        </div>
        <div className="mt-4 grid gap-3">
            <div>
                <Eyebrow tone="ink">Before</Eyebrow>
                <div className="text-[13.5px] mt-1 leading-relaxed font-semibold" style={{ color: DL.ink2 }}>{before}</div>
            </div>
            <div className="pt-3 border-t" style={{ borderColor: DL.rule }}>
                <Eyebrow>After · in the ERP</Eyebrow>
                <div className="text-[13.5px] mt-1 leading-relaxed font-semibold" style={{ color: DL.ink }}>{after}</div>
            </div>
        </div>
    </div>
);

const AiRow = ({ n, name, replaces, icon: Icon }) => (
    <div className="p-5 flex items-start gap-4" style={embossedCard()} data-testid={`storyline-ai-${n}`}>
        <div
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg shrink-0"
            style={{ backgroundColor: DL.emeraldSoft, boxShadow: `inset 0 0 0 1.5px rgba(13,59,46,0.32)` }}
        >
            <Icon size={20} strokeWidth={2.25} style={{ color: DL.emerald }} />
        </div>
        <div className="flex-1">
            <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                    AI · {String(n).padStart(2, "0")}
                </span>
            </div>
            <div className="text-[19px] leading-tight tracking-tight mt-1" style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 800 }}>
                {name}
            </div>
            <div className="text-[13px] mt-1.5 font-semibold" style={{ color: DL.ink2 }}>
                Replaces · <span style={{ color: DL.ink }}>{replaces}</span>
            </div>
        </div>
    </div>
);

const ImpactRow = ({ metric, before, after }) => (
    <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-3 md:gap-6 py-4 border-b" style={{ borderColor: DL.rule }}>
        <div className="text-[15px] font-bold" style={{ color: DL.ink }}>{metric}</div>
        <div className="text-[14px] font-semibold" style={{ color: DL.ink2 }}>{before}</div>
        <div className="text-[14px] font-bold" style={{ color: DL.emerald }}>{after}</div>
    </div>
);

// ── Content ────────────────────────────────────────────────────────
const PAINS = [
    { n: 1,  icon: Calendar,     title: "Tournament calendar circulation to Divisions", before: "MPCA typed the BCCI calendar into Word, printed ten copies, couriered them to ten Divisions. A five-day loop.", after: "MPCA drafts the calendar once inside the ERP; every Division sees it live on their dashboard the moment it is saved. No printing, no couriering, no five-day loop.", ai: false },
    { n: 2,  icon: Building2,    title: "Ground allocation against the calendar",       before: "Manual roster — phone calls to Holkar, Emerald, Roop Singh managers to see which ground is free on which date.", after: "Ground master is digital. MPCA picks a ground for each match inside the ERP; conflict-check is built in so no ground is booked twice.", ai: false },
    { n: 3,  icon: ShieldCheck,  title: "Match Official postings & follow-ups",         before: "Twenty phone calls a day chasing umpires and scorers to confirm postings. Days of chasing per tournament.", after: "Digital posting notice. Umpire accepts / declines with one tap. MPCA sees a real-time accept-reject dashboard.", ai: false },
    { n: 4,  icon: HandCoins,    title: "Match Official payments — two payers, one man", before: "Umpires collected DA from the Division and fees from MPCA — two doors, two waits, two chances of disappointment.", after: "Unified Budget Engine consolidates DA + fees into a single MPCA-issued payment. One official, one payer, one cycle.", ai: false },
    { n: 5,  icon: Calendar,     title: "Match calendar awareness for all stakeholders", before: "Manual circulation → missed matches → embarrassed officials at the ground gate.", after: "Every stakeholder — Division, District, umpire, scorer, coach, player — sees the calendar in real-time on their dashboard.", ai: false },
    { n: 6,  icon: FileCheck2,   title: "Player approvals — night-before dumping",       before: "Divisions dumped 30-40 player forms 24 hours before a tournament. MPCA staff worked until 2 AM verifying paper documents.", after: "Player registration begins weeks earlier via a secure Division-issued link. MPCA no longer approves — MPCA verifies, because AI has already done the hard part.", ai: true },
    { n: 7,  icon: Cpu,          title: "AI-powered player document verification",       before: "Manual DOB checking, name-spelling checking, photo checking — done in pressure and prone to error.", after: "Gemini Vision AI reads Aadhaar, DOB certificate, school records, passport photo. Extracts DOB, verifies name match, confirms photo validity — in 30 seconds per player.", ai: true },
    { n: 8,  icon: Cpu,          title: "AI-powered eligibility tagging",                 before: "MPCA officers manually cross-checked a player's DOB against the tournament age bracket. Ineligible players slipped through under time pressure.", after: "The AI Eligibility Engine tags each player with the tournaments they qualify for (U-16 / U-19 / Ranji / Women's). Ineligible players are structurally impossible to select.", ai: true },
    { n: 9,  icon: Cpu,          title: "AI-powered reimbursement claim verification",   before: "Accounts team sat 1-2 days per claim checking each invoice by hand, against rate cards, scheme heads, budget ceilings.", after: "Every invoice is instantly OCR'd + reasoned about by AI — extracts vendor, amount, GST, date. Flags doubling, inflation, out-of-scope items before it reaches MPCA. 1-2 days becomes 90 seconds.", ai: true },
    { n: 10, icon: GitBranch,    title: "Ten Divisions, ten claims, ten timelines",       before: "MPCA had no single view of which Division had submitted the claim, which was pending, which was paid. Claims literally got lost.", after: "One live dashboard shows the entire lifecycle — submitted · MPCA review · Treasurer approval · payment released — for every Division against every tournament.", ai: false },
    { n: 11, icon: Award,        title: "Non-tournament grant verification",              before: "Manual document verification for coaching, welfare, infrastructure, annual grants. Payment held for days.", after: "The same AI verifier reviews grant claim documents against scheme rules — auditability up, labour down.", ai: true },
    { n: 12, icon: MessageSquare, title: "MPCA ↔ Division communication",                  before: "Emails lost. Phone calls forgotten. Letters filed in a cupboard no one could find six months later.", after: "Built-in Discussion Threads on every tournament, claim, grant — with role-based pinging. Every message timestamped, indexed, searchable forever.", ai: false },
    { n: 13, icon: FileCheck2,   title: "Extra-expense approvals",                        before: "Endless follow-ups — “Did MPCA approve this ₹40,000?” — and no way to prove it.", after: "Extra-Expense Approval Engine routes each request to the correct office bearer per wiring. Approval, rejection, rationale — all stamped into the platform.", ai: false },
    { n: 14, icon: MessageSquare, title: "General communication with Divisions",           before: "Phone, letter, mail — three parallel channels, no memory, no accountability.", after: "One channel per Division, private, permanent, searchable. Decision-making sped up. Institutional memory preserved.", ai: false },
    { n: 15, icon: Database,     title: "Datawarehouse for Divisions",                     before: "MPCA had no centralised repository of Division documents — bank statements, PAN, GST, board resolutions.", after: "Each Division has its own DMS on the ERP. MPCA can drill in and see the entire document trail — one click, one truth.", ai: false },
    { n: 16, icon: ScrollText,   title: "Governance & approval logs",                     before: "No trail of who approved what, when, in what order. Approval matrix on paper.", after: "Immutable audit log for every action — timestamp, actor, before/after. Wiring enforces sequence. Compliance is architecture, not policy.", ai: false },
];

const AI_FEATURES = [
    { n: 1, icon: FileCheck2, name: "Gemini Vision Player Document Verification",   replaces: "48 hours of manual paper checking, prone to human error" },
    { n: 2, icon: ShieldCheck, name: "AI Eligibility Tagging Engine",                 replaces: "Human judgement made under time pressure at 2 AM" },
    { n: 3, icon: HandCoins,   name: "AI Grant Claim Verifier · OCR + fraud flagging", replaces: "1-2 days of accounts team labour per claim" },
    { n: 4, icon: Landmark,    name: "AI Bank Statement OCR for advance reconciliation", replaces: "Manual bank reconciliation entries" },
    { n: 5, icon: Trophy,      name: "Rate Card Matcher · BCCI vs Championship auto-select", replaces: "Multiple rate confusion errors" },
    { n: 6, icon: MessageSquare, name: "AI Discussion Summariser (planned)",             replaces: "Reading a 40-message thread to catch up" },
    { n: 7, icon: GitBranch,   name: "Dynamic Wiring Engine — intelligent workflow orchestrator", replaces: "A rulebook nobody remembers" },
];

const IMPACT = [
    ["Tournament calendar circulation",       "5 days",       "5 minutes"],
    ["Player document verification (one)",    "15-30 minutes", "30 seconds"],
    ["Grant claim verification (one invoice)", "1-2 days",     "90 seconds"],
    ["Full tournament reimbursement claim · end-to-end", "2+ months", "1 day"],
    ["Umpire posting acceptance loop",         "3-5 days",     "1 tap"],
    ["Approvals lost to email / phone",        "Countless",    "Zero"],
    ["Auditability of governance actions",     "Ad-hoc",       "100% immutable"],
    ["Match officials' payment doors",          "2 · Division + MPCA", "1 · MPCA only"],
    ["Ineligible players slipping through",    "Recurring",    "Structurally impossible"],
];

// ── Page ───────────────────────────────────────────────────────────
export default function Storyline() {
    const [presenter, setPresenter] = useState(false);
    const [slide, setSlide] = useState(0);

    // Feb 2026 · Presenter keyboard navigation — arrows + escape.
    useEffect(() => {
        if (!presenter) return;
        const onKey = (e) => {
            if (e.key === "Escape") setPresenter(false);
            if (e.key === "ArrowRight" || e.key === " ") setSlide((s) => Math.min(6, s + 1));
            if (e.key === "ArrowLeft")  setSlide((s) => Math.max(0, s - 1));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [presenter]);

    const slideTitles = useMemo(() => ["Hero", "Act I · Old world", "Act II · Pain points", "Act III · AI arsenal", "Act IV · Impact ledger", "Act V · National vision", "Closer"], []);

    return (
        <div
            className="page-enter min-h-screen"
            data-testid="storyline-page"
            style={{ backgroundColor: DL.ivory, fontFamily: DL.fontBody, color: DL.ink }}
        >
            {/* Feb 2026 · Print + presenter styles. When body has
                .storyline-printing, hide everything except the
                storyline content. Slide-mode is a separate overlay. */}
            <style>{`
                @media print {
                    body > *:not(#storyline-print-root) { display: none !important; }
                    #storyline-print-root { padding: 0 !important; margin: 0 auto !important; max-width: 100% !important; }
                    [data-testid="storyline-toolbar"], [data-testid="storyline-back"], [data-testid="storyline-footer-nav"] { display: none !important; }
                    section { page-break-inside: avoid; }
                    @page { size: A4; margin: 16mm 14mm; }
                }
            `}</style>
            <div id="storyline-print-root" className="px-8 md:px-12 py-10 max-w-[1200px] mx-auto">
                {/* Toolbar */}
                <div className="flex items-center justify-between gap-3 mb-6 flex-wrap" data-testid="storyline-toolbar">
                    <Link
                        to="/showcase"
                        className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.18em] font-bold rounded-full px-4 py-2 transition-colors"
                        style={{ fontFamily: DL.fontMono, color: DL.ink, border: `1.5px solid ${DL.ruleStrong}` }}
                        data-testid="storyline-back"
                    >
                        ← Back to Showcase
                    </Link>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-[12px] uppercase tracking-[0.2em] font-bold transition-colors"
                            style={{ color: DL.ink, border: `1.5px solid ${DL.ruleStrong}`, fontFamily: DL.fontMono, backgroundColor: DL.paper }}
                            data-testid="storyline-download-pdf"
                        >
                            <Download size={14} strokeWidth={2.5} /> Download as PDF
                        </button>
                        <button
                            onClick={() => { setSlide(0); setPresenter(true); }}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-[12px] uppercase tracking-[0.2em] font-bold transition-colors"
                            style={{ backgroundColor: DL.emerald, color: DL.paper, fontFamily: DL.fontMono, boxShadow: "0 14px 30px -14px rgba(13,59,46,0.55)" }}
                            data-testid="storyline-presenter-btn"
                        >
                            <Presentation size={14} strokeWidth={2.5} /> Presenter Mode
                        </button>
                    </div>
                </div>

                {/* Band 1 · Hero */}
                <div id="storyline-band-0" className="p-8 md:p-12 mb-10 relative overflow-hidden" style={emeraldSlab}>
                    <Eyebrow>
                        Address to · The Prime Minister of India
                    </Eyebrow>
                    <h1
                        className="text-[44px] md:text-[64px] mt-4 leading-[1.02] tracking-tight"
                        style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                    >
                        Bharat&apos;s Cricket Backbone,
                        <br />
                        <span style={{ color: DL.gold }}>Rebuilt with AI.</span>
                    </h1>
                    <p className="mt-6 text-[16.5px] leading-[1.7] max-w-3xl font-semibold" style={{ color: "rgba(251,248,241,0.92)" }}>
                        Indian cricket runs on the passion of millions, but its administrative machinery still runs on paper, phone calls, and sixty-year-old muscle memory. The Madhya Pradesh Cricket Association has rebuilt that machinery from the ground up — with Artificial Intelligence at its beating heart. What used to take ten days now takes ten minutes.
                    </p>
                    <div className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-full"
                         style={{ backgroundColor: "rgba(184,131,40,0.20)", border: `1.5px solid ${DL.gold}` }}>
                        <Sparkles size={14} strokeWidth={2.5} style={{ color: DL.gold }} />
                        <span className="text-[12px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                            A template for 38 state associations · one national dashboard
                        </span>
                    </div>
                </div>

                {/* Band 2 · Act I — the old world */}
                <section id="storyline-band-1" className="mb-14">
                    <Eyebrow tone="ink">Act I</Eyebrow>
                    <H2>The old world — cricket administration on paper.</H2>
                    <div className="p-8 md:p-10 relative" style={{ ...embossedCard(), borderLeft: `4px solid ${DL.gold}` }}>
                        <Quote size={32} strokeWidth={2} style={{ color: DL.gold, position: "absolute", top: 24, right: 24, opacity: 0.35 }} />
                        <p className="text-[16px] md:text-[17px] leading-[1.8] font-semibold" style={{ color: DL.ink2 }}>
                            The MPCA Secretary opens Excel. He types out the BCCI calendar into a Word document. He prints ten copies. He couriers them to ten Divisions. Meanwhile, he calls the ground manager — <em>“Is Holkar available on the 14th? What about Emerald? What about Roop Singh Stadium?”</em>
                            <br /><br />
                            Players are handed a paper form the day before selection. Divisions arrive at MPCA HQ with a bundle of Aadhaar copies, DOB certificates, and school leaving papers — often <span style={{ color: DL.emerald, fontWeight: 800 }}>the night before the match</span>. An MPCA official sits till 2 AM verifying dates of birth, checking eligibility, marking one player ineligible… and the tournament kicks off at 8 AM anyway.
                            <br /><br />
                            When the tournament ends, ten Divisions submit ten different reimbursement claims across four weeks. Each claim has 30-50 invoices. Each invoice must be checked by hand. Each phone call between MPCA and a Division becomes <span style={{ color: DL.emerald, fontWeight: 800 }}>a paper trail nobody can find six months later</span>.
                        </p>
                        <p className="mt-6 text-[15px] italic font-bold" style={{ color: DL.emerald }}>
                            This is the pain Indian cricket has quietly borne for sixty years.
                        </p>
                    </div>
                </section>

                {/* Band 3 · Act II — the pain-point grid */}
                <section id="storyline-band-2" className="mb-14">
                    <Eyebrow tone="ink">Act II · 16 pain points, 16 resolutions</Eyebrow>
                    <H2>What AI has done to every single one.</H2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {PAINS.map((p) => <PainCard key={p.n} {...p} />)}
                    </div>
                </section>

                {/* Band 4 · Act III — the AI features */}
                <section id="storyline-band-3" className="mb-14">
                    <Eyebrow tone="ink">Act III · The AI arsenal</Eyebrow>
                    <H2>Seven AI capabilities, one product.</H2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {AI_FEATURES.map((f) => <AiRow key={f.n} {...f} />)}
                    </div>
                </section>

                {/* Band 5 · Act IV — the impact ledger */}
                <section id="storyline-band-4" className="mb-14">
                    <Eyebrow tone="ink">Act IV · The impact ledger</Eyebrow>
                    <H2>Before → After · measurable.</H2>
                    <div className="p-8" style={embossedCard()}>
                        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-3 md:gap-6 pb-3 border-b-2" style={{ borderColor: DL.ruleStrong }}>
                            <Eyebrow tone="ink">Metric</Eyebrow>
                            <Eyebrow tone="ink">Before ERP</Eyebrow>
                            <Eyebrow>After ERP</Eyebrow>
                        </div>
                        {IMPACT.map(([metric, before, after]) => (
                            <ImpactRow key={metric} metric={metric} before={before} after={after} />
                        ))}
                    </div>
                </section>

                {/* Band 6 · Act V — national vision */}
                <section id="storyline-band-5" className="mb-14">
                    <Eyebrow tone="ink">Act V · The national vision</Eyebrow>
                    <H2>Why this matters for Bharat.</H2>
                    <div className="p-8 md:p-10" style={embossedCard()}>
                        <p className="text-[16px] leading-[1.8] font-semibold" style={{ color: DL.ink2 }}>
                            Cricket is not just a sport in India — it is <span style={{ color: DL.emerald, fontWeight: 800 }}>civic infrastructure</span>. It employs, entertains, and unites over 100 crore Indians. Yet its administrative backbone — 38 state associations plus the BCCI itself — has never been digitised at this level of ambition, with AI at its core.
                            <br /><br />
                            <span style={{ color: DL.ink, fontWeight: 800 }}>What MPCA has built is not just an ERP. It is a template.</span> Every state association faces the same 16 pain points. Every one has Divisions, Districts, Tournaments, Camps, Officials, Players, Grants, Reimbursements, approval chains, and audit obligations.
                            <br /><br />
                            The MPCA ERP can be forked, re-branded, and rolled out to all 38 state associations within twelve months. With one further step — connecting these 38 ERPs to a <span style={{ color: DL.emerald, fontWeight: 800 }}>BCCI-level consolidated dashboard</span> — Indian cricket administration will become fully Digital-India-native, transparent, and world-class.
                        </p>
                        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                ["38", "State associations"],
                                ["1", "National dashboard"],
                                ["12", "Months to roll out"],
                                ["100 cr+", "Indians impacted"],
                            ].map(([v, l]) => (
                                <div key={l} className="p-4" style={{ background: `linear-gradient(180deg, ${DL.emeraldSoft} 0%, rgba(13,59,46,0.02) 100%)`, border: `1.5px solid ${DL.ruleStrong}`, borderRadius: "6px" }}>
                                    <div className="text-[32px] leading-none" style={{ fontFamily: DL.fontDisplay, color: DL.emerald, fontWeight: 800 }}>{v}</div>
                                    <div className="text-[12px] uppercase tracking-[0.2em] font-bold mt-2" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{l}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Band 7 · The one-line closer */}
                <div id="storyline-band-6" className="p-8 md:p-12 mb-10 relative overflow-hidden" style={emeraldSlab}>
                    <Eyebrow>The One-Line Closer</Eyebrow>
                    <p
                        className="mt-4 text-[24px] md:text-[32px] leading-[1.3] tracking-tight"
                        style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}
                    >
                        “Indian cricket administration used to be a game of <span style={{ color: DL.gold }}>memory, paper, and follow-up</span>. Today, thanks to the MPCA ERP and its AI, it has become a game of <span style={{ color: DL.gold }}>clarity, evidence, and speed</span>.
                        <br /><br />
                        And if this can be done for cricket, it can be done for every sport, every scheme, and every institution that Bharat runs. This is Viksit Bharat — <span style={{ color: DL.gold }}>one AI-verified document at a time.</span>”
                    </p>
                    <div className="mt-6 text-[12px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: "rgba(184,131,40,0.75)" }}>
                        — Delivered on behalf of · MPCA · Bharat&apos;s cricket backbone
                    </div>
                </div>

                {/* Footer nav */}
                <div className="flex flex-wrap gap-3 mt-8" data-testid="storyline-footer-nav">
                    <Link
                        to="/showcase"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] uppercase tracking-[0.2em] font-bold"
                        style={{ backgroundColor: DL.emerald, color: DL.paper, fontFamily: DL.fontMono, boxShadow: "0 14px 30px -14px rgba(13,59,46,0.55)" }}
                        data-testid="storyline-showcase-btn"
                    >
                        Open Showcase <ArrowRight size={14} strokeWidth={2.5} />
                    </Link>
                    <Link
                        to="/dashboard"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] uppercase tracking-[0.2em] font-bold"
                        style={{ color: DL.ink, border: `1.5px solid ${DL.ruleStrong}`, fontFamily: DL.fontMono }}
                        data-testid="storyline-dashboard-btn"
                    >
                        Go to ERP Dashboard <ArrowRight size={14} strokeWidth={2.5} />
                    </Link>
                </div>
            </div>

            {/* Feb 2026 · Presenter Mode overlay — full-screen, one band per slide */}
            {presenter && (
                <div
                    className="fixed inset-0 z-[100] overflow-y-auto"
                    style={{ backgroundColor: DL.ivory }}
                    data-testid="storyline-presenter-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) { /* clicking backdrop does nothing */ } }}
                >
                    {/* Top strip */}
                    <div className="sticky top-0 z-10 flex items-center justify-between px-6 md:px-10 py-3" style={{ background: `linear-gradient(180deg, ${DL.emerald} 0%, #0a2f24 100%)`, borderBottom: `2px solid ${DL.gold}` }}>
                        <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                                / Presenter · Slide {slide + 1} of 7
                            </span>
                            <span className="hidden md:inline text-[15px] font-bold" style={{ fontFamily: DL.fontDisplay, color: DL.paper }}>
                                {slideTitles[slide]}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSlide((s) => Math.max(0, s - 1))}
                                disabled={slide === 0}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-bold disabled:opacity-40"
                                style={{ fontFamily: DL.fontMono, color: DL.emerald, backgroundColor: DL.gold }}
                                data-testid="presenter-prev"
                            >
                                <ArrowLeft size={12} strokeWidth={2.5} /> Prev
                            </button>
                            <button
                                onClick={() => setSlide((s) => Math.min(6, s + 1))}
                                disabled={slide === 6}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.18em] font-bold disabled:opacity-40"
                                style={{ fontFamily: DL.fontMono, color: DL.emerald, backgroundColor: DL.gold }}
                                data-testid="presenter-next"
                            >
                                Next <ArrowRight size={12} strokeWidth={2.5} />
                            </button>
                            <button
                                onClick={() => setPresenter(false)}
                                className="inline-flex items-center gap-1 w-7 h-7 rounded-full text-[13px] font-bold justify-center"
                                style={{ color: DL.emerald, backgroundColor: DL.paper, fontFamily: DL.fontMono }}
                                data-testid="presenter-close"
                                title="Esc"
                            >
                                <X size={14} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>

                    {/* Slide content — reuses the band DOM by cloning via id */}
                    <PresenterSlide index={slide} />

                    {/* Slide progress dots */}
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: DL.emerald, boxShadow: "0 14px 30px -14px rgba(13,59,46,0.55)" }} data-testid="presenter-dots">
                        {slideTitles.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setSlide(i)}
                                className="w-2.5 h-2.5 rounded-full transition-all"
                                style={{ backgroundColor: i === slide ? DL.gold : "rgba(184,131,40,0.25)" }}
                                data-testid={`presenter-dot-${i}`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Presenter slide renderer ──────────────────────────────────────
// Picks the DOM node for the corresponding band and renders it inside
// the presenter overlay via a scoped scaled clone.
const PresenterSlide = ({ index }) => {
    const [html, setHtml] = useState("");
    useEffect(() => {
        const el = document.getElementById(`storyline-band-${index}`);
        if (el) {
            // strip the outer id from the clone so we don't create duplicate ids in the DOM
            const clone = el.cloneNode(true);
            clone.removeAttribute("id");
            setHtml(clone.outerHTML);
        }
        window.scrollTo({ top: 0, behavior: "instant" });
    }, [index]);
    return (
        <div
            className="px-8 md:px-16 py-10 md:py-14 min-h-[calc(100vh-64px)] flex items-center justify-center"
            style={{ backgroundColor: DL.ivory }}
        >
            <div className="w-full max-w-[1100px]" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
    );
};
