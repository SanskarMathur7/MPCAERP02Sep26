import { useState, lazy, Suspense } from "react";
import { HudEmbeddedContext } from "@/pages/design-preview/_shared";
import {
    LayoutDashboard, Network, Boxes, FileText, GitBranch, Database, Server,
    Users, Trophy, IndianRupee, Shield, ChevronRight, Layers, Zap, Code2, Info,
    Target, Workflow, ClipboardCheck, Lock, Eye, Calendar as CalendarIcon,
    Building2, GraduationCap, Award, MailCheck, Repeat, BookOpen, Gavel,
    ScrollText, CheckCircle2, AlertTriangle, ArrowRight, Cpu, KeyRound,
    Sparkles, TrendingUp, Package, Radio,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════════
// Command Deck · lazy-loaded HUD dashboards (folded from /design-preview)
// ═════════════════════════════════════════════════════════════════════
const HudSeasonOverview     = lazy(() => import("@/pages/design-preview/SeasonOverview"));
const HudGrantsBoard        = lazy(() => import("@/pages/design-preview/GrantsBoard"));
const HudBudgetHealth       = lazy(() => import("@/pages/design-preview/BudgetHealth"));
const HudTournamentCalendar = lazy(() => import("@/pages/design-preview/TournamentCalendar"));
const HudOfficialsSquads    = lazy(() => import("@/pages/design-preview/OfficialsSquads"));
const HudFinancialFlow      = lazy(() => import("@/pages/design-preview/FinancialFlow"));
const HudComplianceMatrix   = lazy(() => import("@/pages/design-preview/ComplianceMatrix"));
const HudDivisionScorecard  = lazy(() => import("@/pages/design-preview/DivisionScorecard"));

const DECK_HUDS = [
    { key: "season",     label: "Season",     Comp: HudSeasonOverview },
    { key: "grants",     label: "Grants",     Comp: HudGrantsBoard },
    { key: "budget",     label: "Budget",     Comp: HudBudgetHealth },
    { key: "calendar",   label: "Calendar",   Comp: HudTournamentCalendar },
    { key: "officials",  label: "Officials",  Comp: HudOfficialsSquads },
    { key: "finance",    label: "Finance",    Comp: HudFinancialFlow },
    { key: "compliance", label: "Compliance", Comp: HudComplianceMatrix },
    { key: "divisions",  label: "Divisions",  Comp: HudDivisionScorecard },
];

const CommandDeckTab = () => {
    const [hud, setHud] = useState(DECK_HUDS[0].key);
    const Active = DECK_HUDS.find((h) => h.key === hud)?.Comp;
    return (
        <div data-testid="showcase-deck-tab">
            <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-mpca-brass flex items-center gap-2">
                        <Radio size={12} /> Broadcast HUD · Read-only Analytics
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold text-mpca-green-dark">Command Deck</h2>
                    <p className="text-[13px] text-mpca-charcoal/80 mt-1 max-w-2xl">
                        Eight live-styled dashboards folded from the retired <span className="font-mono">/design-preview</span> deck — all sample-data analytics, no data-input controls.
                    </p>
                </div>
                <div className="flex items-center gap-1 flex-wrap" data-testid="showcase-deck-subtabs">
                    {DECK_HUDS.map((h) => {
                        const active = hud === h.key;
                        return (
                            <button
                                key={h.key}
                                onClick={() => setHud(h.key)}
                                data-testid={`showcase-deck-subtab-${h.key}`}
                                className={`px-2.5 py-1 text-[10px] uppercase tracking-widest border transition-colors ${
                                    active
                                        ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                        : "border-mpca-brass/40 text-mpca-charcoal hover:border-mpca-green-dark"
                                }`}
                            >
                                {h.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <HudEmbeddedContext.Provider value={true}>
                <div className="-mx-6 md:-mx-8 border-t border-b border-mpca-brass/30" data-testid={`showcase-deck-active-${hud}`}>
                    <Suspense fallback={<div className="p-12 text-center text-[11px] uppercase tracking-widest text-mpca-brass">Loading HUD…</div>}>
                        {Active ? <Active /> : null}
                    </Suspense>
                </div>
            </HudEmbeddedContext.Provider>
        </div>
    );
};


/**
 * MPCA ERP · Phase 1 Showcase — stakeholder walkthrough document
 * ────────────────────────────────────────────────────────────────
 * A comprehensive, self-explanatory reference that a stakeholder can
 * present end-to-end without external narration.
 *
 *   Tabs
 *   ──────
 *   Overview  — Why, what, at-a-glance numbers, before/after
 *   HLD       — Layered architecture, request lifecycle, deployment,
 *               security surface, integration topology
 *   LLD       — Wiring engine internals, live matrix samples, state
 *               machines, compute contract, data-model catalog,
 *               guard invocation contracts
 *   PRD       — Business goals, personas, functional requirements per
 *               module, non-functional requirements (security /
 *               performance / auditability / compliance), acceptance
 *               criteria, non-goals
 *   Modules   — Every module with Who / What / How / Endpoints /
 *               Artifacts / Wiring binding
 */

// ═════════════════════════════════════════════════════════════════════
// Shared primitives
// ═════════════════════════════════════════════════════════════════════

const KPI = ({ label, value, sub, icon: Icon }) => (
    <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 hover:border-mpca-oxblood/60 transition-all" data-testid={`kpi-${label.toLowerCase().replace(/\W+/g, "-")}`}>
        <div className="flex items-start gap-3">
            <div className="w-9 h-9 border border-mpca-brass/50 bg-mpca-parchment/50 flex items-center justify-center flex-shrink-0">
                <Icon size={16} className="text-mpca-oxblood" />
            </div>
            <div>
                <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">{label}</div>
                <div className="font-serif text-2xl text-mpca-charcoal leading-none">{value}</div>
                {sub && <div className="text-[10px] text-mpca-gray-dark mt-1 italic leading-tight">{sub}</div>}
            </div>
        </div>
    </div>
);

const H2 = ({ children }) => (
    <h2 className="font-serif text-3xl text-mpca-green-dark mt-10 mb-4 leading-tight border-b border-mpca-brass/30 pb-2">{children}</h2>
);
const H3 = ({ children }) => (
    <h3 className="font-serif text-xl text-mpca-oxblood mt-6 mb-3">{children}</h3>
);
const H4 = ({ children }) => (
    <h4 className="font-serif text-[15px] text-mpca-green-dark mt-4 mb-2 uppercase tracking-wide">{children}</h4>
);
const P = ({ children }) => (
    <p className="text-[13px] text-mpca-charcoal leading-relaxed mb-3">{children}</p>
);

const Callout = ({ tone = "info", title, children }) => {
    const tones = {
        info:    "border-mpca-brass/50 bg-mpca-parchment/50 text-mpca-charcoal",
        success: "border-mpca-green-dark/60 bg-mpca-green-dark/5 text-mpca-charcoal",
        warn:    "border-mpca-oxblood/60 bg-mpca-oxblood/5 text-mpca-charcoal",
    };
    return (
        <div className={`border-l-4 p-4 my-4 text-[12px] leading-relaxed ${tones[tone]}`}>
            {title && <div className="font-serif text-mpca-oxblood text-sm mb-1">{title}</div>}
            <div>{children}</div>
        </div>
    );
};

const Code = ({ children }) => (
    <div className="border border-mpca-brass/30 bg-mpca-charcoal/95 text-mpca-gold-light p-4 font-mono text-[11px] whitespace-pre overflow-x-auto my-3">{children}</div>
);

const Pill = ({ tone = "brass", children }) => {
    const tones = {
        brass: "border-mpca-brass/50 text-mpca-brass bg-mpca-parchment/50",
        blood: "border-mpca-oxblood/60 text-mpca-oxblood bg-mpca-oxblood/5",
        green: "border-mpca-green-dark/50 text-mpca-green-dark bg-mpca-green-dark/5",
    };
    return <span className={`inline-block px-1.5 py-0.5 text-[9px] uppercase tracking-widest border ${tones[tone]} font-mono`}>{children}</span>;
};

// ═════════════════════════════════════════════════════════════════════
// TAB 1 · Overview
// ═════════════════════════════════════════════════════════════════════

const OverviewTab = () => (
    <div>
        <div className="border-l-4 border-mpca-oxblood bg-mpca-parchment/40 p-5 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-1">MPCA ERP · Phase 1 · Stakeholder Brief</div>
            <h1 className="font-serif text-4xl text-mpca-green-dark leading-tight mb-2">
                Madhya Pradesh Cricket Association<br />Enterprise Resource Platform
            </h1>
            <p className="text-[13px] text-mpca-charcoal">
                A unified digital backbone for state cricket governance — tournaments,
                camps, players, budgets, reimbursements, match officials and public
                communication — built on a single tournament-wiring governance engine
                that keeps every module aligned with the MPCA scheme document.
            </p>
        </div>

        <H2>Why we built this</H2>
        <P>
            The MPCA administers cricket across the entire state of Madhya Pradesh — 8 divisions, 55+ districts, hundreds of clubs and schools, several thousand registered players, dozens of match officials, and a season that spans BCCI, Inter-Division, Inter-District, Inter-School, Inter-Club tournaments and three flavours of camps (Pre-Tournament, Periodical Coaching, Vacation). Historically that operation ran on spreadsheets, e-mail attachments, physical letters and word-of-mouth approvals. Every closure of a tournament required weeks of manual reconciliation. Every scheme change forced a fresh round of stakeholder training. Every player registration lived in a paper register.
        </P>
        <P>
            The MPCA ERP replaces that fragmented workflow with a <b>single, wiring-driven governance platform</b> that:
        </P>
        <ul className="list-disc list-inside text-[13px] text-mpca-charcoal space-y-1 mb-4">
            <li>Encodes the MPCA scheme document as a machine-readable <b>80-cell wiring matrix</b> (8 tournament types × 10 lifecycle steps), not tribal knowledge.</li>
            <li>Enforces persona-scoped access via 13 RBAC roles and 55 permissions across 18 modules — a District Secretary can never accidentally act on state-level approvals.</li>
            <li>Produces printable, signable PDF artifacts at every workflow gate — signed squad sheets, signed grant approvals, signed closure certificates with merged appendices.</li>
            <li>Runs on a modern cloud-native stack (React SPA + FastAPI + MongoDB on Kubernetes) so it serves internal operations <i>and</i> the public communication site from the same platform.</li>
        </ul>

        <H2>Phase 1 in numbers</H2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KPI icon={Trophy}         label="Tournament Types"    value="8"    sub="BCCI · Inter-Div · District · School · Club · 3 camps" />
            <KPI icon={Boxes}          label="Wiring Cells"        value="80"   sub="8 types × 10 steps · single source of truth" />
            <KPI icon={Users}          label="RBAC Roles"          value="13"   sub="President · Secretary · Treasurer · Div · Dist · Official · Sys-Admin" />
            <KPI icon={KeyRound}       label="Permissions"         value="55+"  sub="18 modules · module.action grammar" />
            <KPI icon={ScrollText}     label="PDF Artifacts"       value="14+"  sub="Squad · Grant · Invoice · Closure · Certificates" />
            <KPI icon={Workflow}       label="Backend Routers"     value="40+"  sub="Domain-scoped FastAPI modules" />
            <KPI icon={IndianRupee}    label="Rate Card Heads"     value="17+8" sub="17 budget heads + 8 travel heads · driver-based" />
            <KPI icon={ClipboardCheck} label="Automated Pytests"   value="74"   sub="Wiring · Grants · Closure · Persona guards" />
        </div>

        <H2>What Phase 1 delivers</H2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
                ["Tournament Wiring Engine", "One singleton config document driving owner, approver, mode, visibility, SLA and blocking rules for every step of every tournament type. Zero hardcoded role checks — change a cell, change the workflow across the whole platform."],
                ["Unified Budget Compute", "A pure-Python port of the MPCA Utility (v20). Ingests rate cards × format × head × driver (AwayTeamPax / HostTeamPax / AllPax / TeamCount / MatchOfficialsPax) and produces per-match rollups with days engine, rooms rule, and travel-grant sub-engine."],
                ["Tournament Finance Console (M39r)", "MPCA-owned budget flow: MPCA enters input variables once → Prepare (auto-splits Host + Visitor budgets) → Send → Division Accept / Request Revision → Approved. Auto-sanction removes a redundant MPCA click."],
                ["Grant Claims Lifecycle", "Non-tournament schemes (1-A, 3-E, 4-x, 5-B, 6-A, 6-B, 7-A). 8-state machine (Draft → Documents_Pending → Submitted → Under_Review → Approved → Sanctioned → Payment_Made, with Rejected branch). Per-document Gemini verification + cross-doc AI summary + threaded discussion."],
                ["Rich Closure Certificate", "14-section reportlab PDF (tournament summary, bodies, pool tables, calendar, officials, squads, unified budget rollup, invoices, deductions, financial summary, payments, signed artifacts, issuer footer, signature block). pypdf appends signed appendices to a single archival document."],
                ["Match Officials & DA", "MPCA-owned central assignment for 9 official roles × 5 grades. Standard fee + DA rate cards. KYC + bank profile per official. Wiring locks Divisions out of a workflow the MPCA runs end-to-end."],
                ["Selection Funnel", "Annual SeasonRegistration per player → SelectionFunnel per (tournament × format) → LongList → Probables → Final 12. Stage capacities enforced. Register-linked from the master player database."],
                ["RBAC + Access Control", "13 seeded roles, permission catalog spanning 18 modules × 55 actions, users mapped to (role × body). RBAC console reserved for President / Hon. Secretary / System Administrator."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                    <div className="font-serif text-mpca-oxblood text-base mb-2">{t}</div>
                    <div className="text-[12px] text-mpca-charcoal leading-relaxed">{b}</div>
                </div>
            ))}
        </div>

        <H2>The problem this platform solves</H2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-mpca-oxblood" />
                    <div className="font-serif text-mpca-oxblood text-base">Before — pain points</div>
                </div>
                <ul className="text-[12px] text-mpca-charcoal space-y-1.5 list-disc list-inside">
                    <li>Every scheme rate change required manually updating dozens of spreadsheets across divisions.</li>
                    <li>Draft budget numbers were e-mailed to MPCA and became state-visible before the division was ready to defend them.</li>
                    <li>Grant claims travelled via signed paper letters — no audit trail, no chronology, no cross-doc consistency check.</li>
                    <li>Squad sheets were photocopies with no linkage to the player-registration master; age/gender validation happened manually.</li>
                    <li>Tournament closure was a weeks-long manual reconciliation across dozens of Excel files kept by different clerks.</li>
                    <li>Match-official DA reimbursements had no standardised rate card enforcement — every division negotiated locally.</li>
                    <li>No unified audit log. If an approval was contested, reconstructing the chronology was near-impossible.</li>
                </ul>
            </div>
            <div className="border border-mpca-green-dark/40 bg-mpca-green-dark/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-mpca-green-dark" />
                    <div className="font-serif text-mpca-green-dark text-base">After — the ERP promise</div>
                </div>
                <ul className="text-[12px] text-mpca-charcoal space-y-1.5 list-disc list-inside">
                    <li>Rate card updates propagate to every budget the moment they are saved — snapshots freeze historical numbers.</li>
                    <li>On-Submit visibility keeps division drafts private until the division explicitly submits — enforced server-side.</li>
                    <li>Grant claims flow through a signed-PDF pipeline with a threaded discussion channel + Gemini-powered document verifier.</li>
                    <li>Squads either link to the master register (Register_Linked) or upload a signed PDF (Manual_PDF) — always audit-linked.</li>
                    <li>Tournament closure produces a single archival PDF (14 sections) with financials, calendar, officials, and appendices merged in.</li>
                    <li>Every rupee is anchored to a scheme + rate card + wiring cell + approver — no ad-hoc payments.</li>
                    <li>Every mutation writes to <code className="bg-mpca-parchment/60 px-1">audit_logs</code>. Every RBAC change and every claim decision is chronologically reconstructible.</li>
                </ul>
            </div>
        </div>

        <Callout tone="info" title="How to read this document">
            The remaining tabs walk you through the platform in progressively more detail:
            <span className="block mt-2">
                <b>HLD</b> shows the architecture at 30,000 ft — the five layers, the request lifecycle, deployment, security surface, integration topology.
                <b> LLD</b> zooms into the wiring engine — the singleton config, actual matrix rows, state machines for every workflow, unified budget compute contract, guard invocation, and the data-model catalog.
                <b> PRD</b> is the full requirements document — business goals, personas, functional requirements per module, security architecture, non-functional guarantees, acceptance criteria, and non-goals.
                <b> Modules</b> catalogues every module with Who / What / How / Endpoints / Artifacts / Wiring binding.
            </span>
        </Callout>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// TAB 2 · HLD (High-Level Design)
// ═════════════════════════════════════════════════════════════════════

const HLDTab = () => (
    <div>
        <H2>Architecture at a glance</H2>
        <P>
            The MPCA ERP is organised into <b>five architectural layers</b>. Traffic enters through a Kubernetes ingress and flows through Presentation → API Gateway → Domain → Persistence, with a horizontal Integration bus attached to the Domain layer.  Each layer has one responsibility, and the layers only talk to their immediate neighbours — no back-channels.
        </P>

        {/* Layered architecture diagram */}
        <div className="border-2 border-mpca-brass/50 bg-mpca-parchment/30 p-6 my-6 overflow-x-auto">
            <svg viewBox="0 0 960 620" className="w-full min-w-[940px]" data-testid="hld-layered" aria-label="Layered architecture">
                <defs>
                    <marker id="arrH" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                        <path d="M0,0 L10,4 L0,8 z" fill="#7a1e2b" />
                    </marker>
                </defs>
                <text x="480" y="22" textAnchor="middle" fontSize="14" fontFamily="serif" fill="#3b5540">MPCA ERP · Layered Architecture (5 tiers + Integration bus)</text>

                {/* Personas row */}
                {[
                    [40,  "MPCA Sec / Pres"],
                    [180, "Division Sec"],
                    [320, "District Sec"],
                    [460, "Club / School"],
                    [600, "Match Official"],
                    [740, "Public"],
                ].map(([x, label]) => (
                    <g key={label}>
                        <rect x={x} y="40" width="120" height="34" fill="#f4ede0" stroke="#7a5c2e" />
                        <text x={x + 60} y="62" textAnchor="middle" fontSize="10" fill="#2a1810">{label}</text>
                    </g>
                ))}

                {/* Ingress */}
                <rect x="240" y="94" width="420" height="34" fill="#3b5540" />
                <text x="450" y="116" textAnchor="middle" fontSize="11" fill="#f4ede0" fontWeight="bold">Kubernetes Ingress · TLS termination · REACT_APP_BACKEND_URL</text>

                {/* Layer 1 · Presentation */}
                <rect x="40" y="148" width="700" height="76" fill="#fff8ea" stroke="#7a1e2b" strokeWidth="1.5" />
                <text x="60" y="168" fontSize="10" fontWeight="bold" fill="#7a1e2b">L1 · PRESENTATION</text>
                <text x="60" y="184" fontSize="9.5" fill="#2a1810">React SPA (port 3000) · React Router · Lazy-loaded pages · AuthContext + SeasonContext</text>
                <text x="60" y="199" fontSize="9.5" fill="#2a1810">useWiring hook (in-module cache) · Tailwind heritage palette · Persona chip login (localStorage JWT)</text>
                <text x="60" y="214" fontSize="9.5" fill="#2a1810">60+ pages · shadcn/ui + custom · Progression Ribbon · Setup Boxes · Signed PDF pickers</text>
                <rect x="760" y="148" width="160" height="76" fill="#e8ddc6" stroke="#7a5c2e" />
                <text x="840" y="172" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#7a5c2e">Public Marketing</text>
                <text x="840" y="188" textAnchor="middle" fontSize="8.5" fill="#2a1810">/ · /showcase</text>
                <text x="840" y="202" textAnchor="middle" fontSize="8.5" fill="#2a1810">/disclosures-public</text>
                <text x="840" y="216" textAnchor="middle" fontSize="8.5" fill="#2a1810">/verify/:uid</text>

                {/* Layer 2 · API Gateway */}
                <rect x="40" y="234" width="880" height="60" fill="#e8ddc6" stroke="#7a1e2b" strokeWidth="1.5" />
                <text x="60" y="253" fontSize="10" fontWeight="bold" fill="#7a1e2b">L2 · API GATEWAY (FastAPI @ 8001)</text>
                <text x="60" y="270" fontSize="9.5" fill="#2a1810">api_router singleton · CORS · persona headers (X-Body-Type / X-User-Body-Code / X-User-Name / X-Persona-Post)</text>
                <text x="60" y="285" fontSize="9.5" fill="#2a1810">40+ domain routers · Pydantic v2 validation · standardised 404/403/409 error shape · Response middlewares</text>

                {/* Layer 3 · Domain */}
                <rect x="40" y="304" width="700" height="130" fill="#fff8ea" stroke="#7a1e2b" strokeWidth="1.5" />
                <text x="60" y="324" fontSize="10" fontWeight="bold" fill="#7a1e2b">L3 · DOMAIN LOGIC</text>
                <text x="60" y="340" fontSize="9.5" fill="#2a1810">core/wiring_guard.py — assert_wiring_owner() + stamp_actor() on every mutation</text>
                <text x="60" y="355" fontSize="9.5" fill="#2a1810">core/scoping.py — body_scope() filters list endpoints to the persona&apos;s scope</text>
                <text x="60" y="370" fontSize="9.5" fill="#2a1810">core/pdf_generator.py — reportlab renderers · core/ai_signed_docs.py — pypdf merger</text>
                <text x="60" y="385" fontSize="9.5" fill="#2a1810">core/ai_validator.py — Gemini per-doc verifier · core/email_notifications.py — SMTP hooks</text>
                <text x="60" y="400" fontSize="9.5" fill="#2a1810">core/shared_services.py — next_seq atomic counters · core/indexes.py — MongoDB index setup</text>
                <text x="60" y="415" fontSize="9.5" fill="#2a1810">unified_budget compute engine — per-match rollup · Days engine · Rooms rule · Travel-grant sub-engine</text>
                <text x="60" y="429" fontSize="8.5" fontStyle="italic" fill="#7a5c2e">All domain helpers are pure functions where possible — testable in isolation.</text>

                {/* Wiring Config box (sidecar to Domain) */}
                <rect x="760" y="304" width="160" height="130" fill="#7a5c2e" />
                <text x="840" y="325" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#f4ede0">TOURNAMENT WIRING</text>
                <text x="840" y="340" textAnchor="middle" fontSize="9" fill="#f4ede0">Singleton doc</text>
                <text x="840" y="354" textAnchor="middle" fontSize="9" fill="#f4ede0">version-counted</text>
                <text x="840" y="370" textAnchor="middle" fontSize="9" fill="#f4ede0">8 types × 10 steps</text>
                <text x="840" y="385" textAnchor="middle" fontSize="9" fill="#f4ede0">= 80 cells</text>
                <text x="840" y="404" textAnchor="middle" fontSize="8" fill="#f4ede0" fontStyle="italic">cached in every</text>
                <text x="840" y="416" textAnchor="middle" fontSize="8" fill="#f4ede0" fontStyle="italic">SPA session</text>

                {/* Layer 4 · Integration bus */}
                <rect x="40" y="444" width="880" height="52" fill="#f4ede0" stroke="#7a5c2e" strokeWidth="1.5" />
                <text x="60" y="463" fontSize="10" fontWeight="bold" fill="#7a5c2e">L4 · INTEGRATION BUS</text>
                <text x="60" y="479" fontSize="9.5" fill="#2a1810">Emergent LLM Key (Gemini 2.5 Flash) — doc verify + claim summary · reportlab — PDF render · pypdf — merge</text>
                <text x="60" y="491" fontSize="9.5" fill="#2a1810">SMTP (email_notifications) · Uploads store (chunked, S3-ready) · Season activation gate · Rate-card snapshots</text>

                {/* Layer 5 · Persistence */}
                <rect x="40" y="506" width="880" height="90" fill="#e8ddc6" stroke="#3b5540" strokeWidth="1.5" />
                <text x="60" y="525" fontSize="10" fontWeight="bold" fill="#3b5540">L5 · PERSISTENCE (MongoDB)</text>
                <text x="60" y="542" fontSize="9" fill="#2a1810">Governance: tournament_wiring · audit_logs · roles · users · rbac_role_permissions</text>
                <text x="60" y="556" fontSize="9" fill="#2a1810">Domain: tournaments · squads · camps · match_officials · tournament_match_officials · match_official_da</text>
                <text x="60" y="570" fontSize="9" fill="#2a1810">Finance: tournament_budgets · rate_cards · tournament_invoices · receipts · reimbursement_claims · grant_claims · grant_claim_discussions</text>
                <text x="60" y="584" fontSize="9" fill="#2a1810">Master: bodies · players · season_registrations · selection_funnels · reimbursement_schemes · venues_grounds · uploads</text>

                {/* Arrows */}
                <line x1="450" y1="74" x2="450" y2="92" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrH)" />
                <line x1="450" y1="128" x2="450" y2="146" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrH)" />
                <line x1="390" y1="224" x2="390" y2="232" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrH)" />
                <line x1="390" y1="294" x2="390" y2="302" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrH)" />
                <line x1="450" y1="434" x2="450" y2="442" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrH)" />
                <line x1="450" y1="496" x2="450" y2="504" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrH)" />
                {/* Wiring sidecar link */}
                <line x1="740" y1="370" x2="758" y2="370" stroke="#7a5c2e" strokeWidth="1.5" strokeDasharray="3,3" markerEnd="url(#arrH)" />
            </svg>
        </div>

        <H3>Layer responsibilities</H3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
                [LayoutDashboard, "L1 · Presentation", "React SPA on port 3000. 60+ lazily-loaded pages, persona-scoped sidebar (AppLayout), Tailwind heritage palette (parchment / brass / oxblood / green-dark). Persona chip login persists to localStorage; every API call carries persona headers. The public marketing site (/, /showcase, /disclosures-public, /verify/:uid) is served from the same bundle — no separate marketing codebase."],
                [Server, "L2 · API Gateway", "FastAPI at port 8001 fronted by a single api_router. 40+ domain-scoped route modules registered under a shared /api prefix. Kubernetes ingress routes /api/* to backend, everything else to frontend. Pydantic v2 validates every payload. CORS-open in preview, tightened in production."],
                [Cpu, "L3 · Domain Logic", "Where every governance rule lives. core/wiring_guard.py enforces the 80-cell owner matrix on every mutation. core/scoping.py filters list endpoints. core/pdf_generator.py renders reportlab PDFs. core/ai_validator.py + core/ai_signed_docs.py wrap Gemini for doc verification and appendix merging. Unified Budget compute engine (unified_budget.py) is a pure Python port of the MPCA Utility HTML v20."],
                [Zap, "L4 · Integration Bus", "External services accessed only through domain-layer wrappers, never directly by routers. Emergent LLM Key powers Gemini 2.5 Flash for per-doc verification + cross-doc claim summary. reportlab + pypdf for print artifacts. SMTP for notifications. Uploads pipeline supports chunked upload for large signed PDFs."],
                [Database, "L5 · Persistence (MongoDB)", "Domain-scoped collections. tournament_wiring is a singleton document (~30 KB) loaded once and cached client-side. audit_logs is append-only for compliance. Every domain document has a UUID id field (never Mongo ObjectId in API responses)."],
                [Shield, "Wiring Sidecar", "The tournament_wiring collection is deliberately drawn as a sidecar to the Domain layer: both L1 (via useWiring hook) and L3 (via wiring_guard) read from it constantly. It is the single artefact that ties every workflow together. One version-counter, one document, ~80 cells."],
            ].map(([Icon, t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                    <div className="flex items-center gap-2 mb-2"><Icon size={14} className="text-mpca-oxblood" /><span className="font-serif text-mpca-oxblood text-sm">{t}</span></div>
                    <div className="text-[12px] text-mpca-charcoal leading-relaxed">{b}</div>
                </div>
            ))}
        </div>

        <H2>Request lifecycle — sequence diagram</H2>
        <P>
            Below is the exact end-to-end path a mutation follows, using <b>Division submits a Grant Claim</b> as the concrete example. Every mutation on the platform follows this same shape.
        </P>

        <div className="border-2 border-mpca-brass/50 bg-mpca-parchment/30 p-4 my-6 overflow-x-auto">
            <svg viewBox="0 0 960 480" className="w-full min-w-[940px]" data-testid="hld-sequence" aria-label="Request lifecycle sequence">
                <defs>
                    <marker id="arrS" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                        <path d="M0,0 L10,4 L0,8 z" fill="#3b5540" />
                    </marker>
                    <marker id="arrSr" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                        <path d="M0,0 L10,4 L0,8 z" fill="#7a1e2b" />
                    </marker>
                </defs>
                {/* Lanes */}
                {[
                    [60,  "Division SPA"],
                    [240, "Ingress"],
                    [400, "FastAPI Router"],
                    [560, "Wiring Guard"],
                    [720, "Domain Logic"],
                    [880, "MongoDB"],
                ].map(([x, label]) => (
                    <g key={label}>
                        <rect x={x - 55} y="30" width="110" height="26" fill="#7a5c2e" />
                        <text x={x} y="47" textAnchor="middle" fontSize="10" fill="#f4ede0" fontWeight="bold">{label}</text>
                        <line x1={x} y1="60" x2={x} y2="460" stroke="#7a5c2e" strokeWidth="0.7" strokeDasharray="3,3" />
                    </g>
                ))}
                {/* Steps */}
                {[
                    [85,  "POST /api/grant-claims/{cid}/submit + X-Body-Type · X-User-Body-Code · X-User-Name", 60, 240, "#3b5540"],
                    [115, "TLS termination, strip host, forward to 8001", 240, 400, "#3b5540"],
                    [150, "Pydantic validates payload, resolves route to routes/grant_claims.submit_grant_claim", 400, 400, "#7a5c2e"],
                    [190, "assert_wiring_owner(tid, 'grant_submission', body_type='Division', body_code='DIV-IND')", 400, 560, "#3b5540"],
                    [225, "Read tournament_wiring[type][step] → owner='Division' → check body_type ∈ {State, Division} → OK", 560, 560, "#7a5c2e"],
                    [265, "Season activation gate — is_season_activated('2025-26')? MPCA signed Schemes PDF on file? OK", 400, 720, "#3b5540"],
                    [305, "Route re-checks required signed_submission_url · idempotency guard (409 if in-flight duplicate)", 400, 400, "#7a5c2e"],
                    [340, "Update grant_claims doc → status=Submitted · stamp_actor(persona, body_code) · updated_at=now", 720, 880, "#3b5540"],
                    [375, "Write audit_logs entry (action='grant_submit', actor, before, after) — append-only", 720, 880, "#3b5540"],
                    [410, "Fan-out notifications: MPCA Secretary + Treasurer · in-app + SMTP email (best-effort)", 720, 720, "#7a5c2e"],
                    [445, "200 OK · updated GrantClaim payload · SPA re-reads useWiring → ribbon step flips to 'Awaiting MPCA'", 720, 60, "#7a1e2b"],
                ].map(([y, txt, fromX, toX, color], i) => (
                    <g key={i}>
                        <line x1={fromX} y1={y} x2={toX - (fromX < toX ? 4 : -4)} y2={y} stroke={color} strokeWidth="1.5" markerEnd={color === "#7a1e2b" ? "url(#arrSr)" : "url(#arrS)"} />
                        <text x={(fromX + toX) / 2} y={y - 4} textAnchor="middle" fontSize="8.5" fill="#2a1810">{txt}</text>
                    </g>
                ))}
            </svg>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
                ["Persona headers on every call", "Every fetch from the SPA is enriched with X-Body-Type / X-User-Body-Code / X-User-Name / X-Persona-Post. The backend never has to guess who is calling — the client always states it, and the wiring guard verifies it against the wiring matrix."],
                ["Guard before mutation", "assert_wiring_owner() is the very first line of every mutation endpoint. If the persona&apos;s body_type is not in the owner set (per the wiring cell for this tournament type × this step), the endpoint returns 403 immediately — no side effects."],
                ["Audit + notify after mutation", "Once the mutation succeeds, an audit_logs entry is appended (append-only, never mutated) and notifications fan out in-app + SMTP. Failure to notify does not fail the transaction; the audit trail is authoritative."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[11.5px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>

        <H2>Security surface</H2>
        <P>
            The MPCA ERP has <b>four security boundaries</b> — none of them can be bypassed by a client-side edit. Each boundary is enforced at the API/domain layer.
        </P>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
                [Lock, "Authentication (persona chip)", "Persona chip login persists a JWT-shaped record to localStorage. Every API call carries the persona in headers. Backend endpoints read those headers and treat unknown personas as anonymous (403 for anything that needs a body scope)."],
                [Shield, "Wiring guard (authorisation)", "core/wiring_guard.assert_wiring_owner() reads the wiring cell for (tournament_type × step) and checks the caller&apos;s body_type against the owner set. Cannot be bypassed by URL munging — the guard is called before any state read/write."],
                [Eye, "Visibility redaction (data segregation)", "Wiring cells with visibility=On_Submit cause list/detail endpoints to redact draft numbers from state-level personas until the division explicitly submits. Enforced server-side, not by frontend routing."],
                [ScrollText, "Immutable audit log", "Every mutation writes an audit_logs entry with actor, body, action_label, timestamp, before/after payload. Append-only — no endpoint deletes or mutates existing audit rows."],
                [KeyRound, "RBAC role-permission grid", "Beyond wiring, 55 permissions across 18 modules gate feature-level access (e.g. schemes.edit, rbac.assign_users). President / Hon. Secretary / Sys-Admin can edit the grid; everyone else consumes it read-only."],
                [Package, "Signed artifact chain", "Every governance gate ends with a signable, printable PDF stored alongside the record. The signed URL is the compliance receipt — closure cannot flip to Completed without closure_signed_url present."],
            ].map(([Icon, t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                    <div className="flex items-center gap-2 mb-2"><Icon size={14} className="text-mpca-oxblood" /><span className="font-serif text-mpca-oxblood text-sm">{t}</span></div>
                    <div className="text-[12px] text-mpca-charcoal leading-relaxed">{b}</div>
                </div>
            ))}
        </div>

        <H2>Deployment topology</H2>
        <P>
            The platform runs on Kubernetes with supervisor-managed processes inside each container. Hot-reload is enabled for both tiers during development. In production, a rolling deploy replaces containers one at a time with zero downtime.
        </P>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[
                ["Frontend container",  "React SPA · yarn build · served on port 3000 · REACT_APP_BACKEND_URL baked at build time · supervisor-managed."],
                ["Backend container",   "FastAPI + uvicorn on port 8001 · supervisor-managed · MONGO_URL from env · reportlab, pypdf, emergentintegrations, motor (async Mongo driver) installed."],
                ["MongoDB cluster",     "Managed MongoDB · role-based auth · DB_NAME set via env · daily snapshots recommended. Indexes bootstrapped by core/indexes.py at startup."],
                ["Kubernetes Ingress",  "TLS termination, path-based routing (/api → backend, else → frontend), rate limits configurable per route family."],
                ["Uploads storage",     "Chunked upload pipeline — local by default, S3-compatible when configured. Signed PDFs referenced by URL from grant_claims / squads / tournaments."],
                ["Observability",       "Supervisor logs per process · MongoDB slow-query log · reportlab render errors captured to logs · audit_logs collection is queryable via /audit-log page for the RBAC council."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[11px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>

        <H2>Integration topology</H2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[
                ["Emergent LLM Key · Gemini 2.5 Flash", "Per-document verification (matches expected label · confidence · extracted fields) + cross-doc claim summary (amount reconciliation, fiscal-cycle date check, low-confidence signal, verdict roll-up)."],
                ["reportlab · PDF generation", "Closure certificate (14 sections), grant claim submission/approval summary, DA voucher, squad sheet, tournament schedule."],
                ["pypdf · PDF merging", "Appends signed appendices (squad signed sheets, closure signed PDF, MPCA approval PDFs) into a single archival closure document. Safe fallback if a URL doesn&apos;t resolve to a valid PDF."],
                ["SMTP · email_notifications", "Grant rejection notice, approval notice, closure alert. Best-effort; failures logged but do not fail the underlying transaction."],
                ["Uploads · chunked file store", "Signed PDFs, KYC documents, invoice scans. URL-referenced; the domain layer never inlines binary in Mongo."],
                ["Season activation gate", "is_season_activated(cycle) checks that MPCA has uploaded the signed master Schemes PDF for the fiscal cycle. Blocks grant-claim creation until this is done."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[11px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// TAB 3 · LLD (Low-Level Design)
// ═════════════════════════════════════════════════════════════════════

// The actual 10 wiring steps as defined in tournament_wiring.py
const stepDetails = [
    { n: 1,  key: "tournament_creation",     label: "Tournament Creation",   bucket: "Pre_Tournament",  desc: "Basics (name · season · format · host · dates) captured. Wiring resolves the type-code and freezes the wiring snapshot for this instance." },
    { n: 2,  key: "pool_basics",             label: "Pool (Basics)",         bucket: "Pre_Tournament",  desc: "Participating bodies chosen. Inter-Div / Inter-District pools are register-linked; Manual types allow ad-hoc adds." },
    { n: 3,  key: "match_official_posting",  label: "Match Official Posting",bucket: "Pre_Tournament",  desc: "Central MPCA-owned assignment (Umpires · Scorers · Selectors · Observers · Referees). Wiring keeps Division out for MPCA-owned tournaments." },
    { n: 4,  key: "squad",                   label: "Squad",                 bucket: "Pre_Tournament",  desc: "Register_Linked pulls from the player master (age/gender validated); Manual_PDF accepts a signed team-list upload. Mode is wired per tournament type." },
    { n: 5,  key: "squad_approval",          label: "Squad Approval by MPCA",bucket: "Pre_Tournament",  desc: "M / O / NA per wiring flag. Manual_PDF squads generally skip MPCA approval; Register_Linked Inter-Division squads always require it." },
    { n: 6,  key: "match_calendar",          label: "Match Calendar",        bucket: "In_Tournament",   desc: "Match dates, venues, format overrides, days engine parameters. Blocks_next until every match has a venue." },
    { n: 7,  key: "unified_budget",          label: "Unified Budget",        bucket: "In_Tournament",   desc: "Rate card × format × head × driver produces the per-match rollup. On_Submit visibility hides draft numbers from MPCA until Division submits." },
    { n: 8,  key: "finance_console",         label: "Finance Console",       bucket: "Post_Tournament", desc: "M39r — MPCA prepares (Host + Visitor split), sends, Division accepts or requests revision, auto-sanctions on accept. Invoices, DA forms, claims flow through here." },
    { n: 9,  key: "tournament_closure",      label: "Tournament Closure",    bucket: "Post_Tournament", desc: "Owner drafts closure PDF (14 sections), gets it signed, uploads signed URL, then hits close. Immutable after this point." },
    { n: 10, key: "mpca_visibility",         label: "MPCA Visibility",       bucket: "Post_Tournament", desc: "Cross-cutting cell — Realtime · On_Submit · Never. Decides whether MPCA sees draft numbers or only submitted values." },
];

// A sample of the actual matrix from tournament_wiring.py — 4 representative rows
const wiringSample = [
    { type: "BCCI",            step: "Squad",              flag: "M",  owner: "MPCA",     approver: "None", mode: "Manual_PDF",     visibility: "Realtime",  english: "MPCA uploads the manual squad list; no register selection." },
    { type: "Inter-Division",  step: "Squad",              flag: "M",  owner: "Division", approver: "MPCA", mode: "Register_Linked",visibility: "Realtime",  english: "All participating divisions select from register; MPCA approves each squad." },
    { type: "Inter-Division",  step: "Unified Budget",     flag: "M",  owner: "MPCA",     approver: "MPCA", mode: "Auto_Compute",   visibility: "Realtime",  english: "MPCA authors per rate card; both teams count as AWAY pax (no home-side exemption)." },
    { type: "Pre-Camp",        step: "Tournament Creation",flag: "NA", owner: "Auto",     approver: "None", mode: "Auto_Compute",   visibility: "Realtime",  english: "Not a fresh create — auto-created & linked to an active Inter-Division tournament." },
    { type: "Pre-Camp",        step: "Unified Budget",     flag: "M",  owner: "Division", approver: "None", mode: "Auto_Compute",   visibility: "On_Submit", english: "Division creates & uploads; MPCA has no role until the claim is submitted." },
    { type: "Inter-District",  step: "Match Official",     flag: "M",  owner: "Division", approver: "Division", mode: "Register_Linked", visibility: "Realtime", english: "DIVISION posts (not MPCA) — the tournament is Division-run." },
    { type: "Inter-School",    step: "Match Calendar",     flag: "O",  owner: "Division", approver: "None", mode: "Manual_PDF",     visibility: "Realtime",  english: "Optional; division may make it, all manual fields, no register linkage." },
    { type: "Inter-Club",      step: "Finance Console",    flag: "M",  owner: "Division", approver: "MPCA", mode: "Auto_Compute",   visibility: "On_Submit", english: "Only the two-day knockout is reimbursed; one-day & league-cum-knockout are not." },
    { type: "Coaching Camp",   step: "Squad Approval",     flag: "NA", owner: "Auto",     approver: "None", mode: "NA",             visibility: "Realtime",  english: "No — division self-manages this camp; MPCA does not approve the roster." },
    { type: "Vacation Camp",   step: "Finance Console",    flag: "M",  owner: "Division", approver: "MPCA", mode: "Auto_Compute",   visibility: "On_Submit", english: "Divisional Secretary must certify no amount was charged from players." },
];

const LLDTab = () => (
    <div>
        <H2>The wiring engine — mechanism</H2>
        <P>
            <b>One MongoDB document.</b> The <code className="bg-mpca-parchment/60 px-1">tournament_wiring</code> collection holds a single document with <code className="bg-mpca-parchment/60 px-1">id=&quot;singleton&quot;</code>, a version counter, and 80 wiring cells (8 tournament types × 10 lifecycle steps). This document is loaded once at startup, cached in memory, and re-fetched only when the version bumps.
        </P>
        <P>
            <b>One guard function.</b> Every mutation endpoint on the platform calls <code className="bg-mpca-parchment/60 px-1">assert_wiring_owner(tid, step_key, x_body_type, x_body_code)</code> as its very first line. The guard resolves the wiring cell for (tournament&apos;s type × this step), reads <code>owner</code>, and compares against the caller&apos;s body_type. If the persona isn&apos;t authorised, a 403 is raised — no side effects.
        </P>
        <P>
            <b>One frontend hook.</b> The SPA uses <code className="bg-mpca-parchment/60 px-1">useWiringStep(tid, stepKey)</code> and <code className="bg-mpca-parchment/60 px-1">useWiringOwnerMatch(tid, stepKey, persona)</code> to decide which affordances to render. Non-owners see read-only rendering; owners see action buttons.
        </P>

        <div className="border-2 border-mpca-brass/50 bg-mpca-parchment/30 p-6 my-6 overflow-x-auto">
            <svg viewBox="0 0 1000 260" className="w-full min-w-[960px]" data-testid="lld-flow" aria-label="LLD wiring flow">
                <defs>
                    <marker id="arrL" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                        <path d="M0,0 L10,4 L0,8 z" fill="#3b5540" />
                    </marker>
                </defs>
                <text x="500" y="20" textAnchor="middle" fontSize="14" fontFamily="serif" fill="#3b5540">10-Step Tournament Wiring Flow · 3 buckets</text>
                {stepDetails.map((s, i) => {
                    const x = 20 + (i * 96);
                    const fill = s.bucket === "Pre_Tournament" ? "#fff8ea" : s.bucket === "In_Tournament" ? "#e8ddc6" : "#f4ede0";
                    return (
                        <g key={s.key}>
                            <rect x={x} y="60" width="86" height="76" fill={fill} stroke="#7a1e2b" strokeWidth="1.2" />
                            <text x={x + 43} y="78" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#7a1e2b">{s.n}</text>
                            <text x={x + 43} y="98" textAnchor="middle" fontSize="8.5" fill="#2a1810">{s.label.split(" ").slice(0, 2).join(" ")}</text>
                            <text x={x + 43} y="112" textAnchor="middle" fontSize="8.5" fill="#2a1810">{s.label.split(" ").slice(2).join(" ")}</text>
                            <text x={x + 43} y="128" textAnchor="middle" fontSize="7.5" fontStyle="italic" fill="#7a5c2e">{s.bucket.replace("_", " ")}</text>
                            {i < 9 && <line x1={x + 86} y1="96" x2={x + 96} y2="96" stroke="#3b5540" strokeWidth="1.5" markerEnd="url(#arrL)" />}
                        </g>
                    );
                })}
                <rect x="20" y="150" width="960" height="90" fill="#f4ede0" stroke="#7a5c2e" />
                <text x="500" y="170" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#3b5540">Every step cell exposes 8 attributes:</text>
                <text x="500" y="188" textAnchor="middle" fontSize="10" fill="#2a1810">flag (M · O · NA · INFO) · owner (MPCA · Division · District · Auto) · approver (MPCA · Division · None)</text>
                <text x="500" y="204" textAnchor="middle" fontSize="10" fill="#2a1810">mode (Register_Linked · Manual_PDF · Auto_Compute · NA) · visibility (Realtime · On_Submit · Never)</text>
                <text x="500" y="220" textAnchor="middle" fontSize="10" fill="#2a1810">blocks_next (bool) · sla_days (int) · text (governance intent, human-readable)</text>
                <text x="500" y="234" textAnchor="middle" fontSize="9" fontStyle="italic" fill="#7a5c2e">assert_wiring_owner() enforces owner-set membership before every mutation — 403 otherwise</text>
            </svg>
        </div>

        <H2>Anatomy of a wiring cell</H2>
        <P>Each of the 80 cells carries the same 8 attributes. That uniformity is what makes the whole platform predictable.</P>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
                ["flag",         "M · O · NA · INFO", "Mandatory · Optional · Not-Applicable · Informational-only for this tournament type."],
                ["owner",        "MPCA · Division · District · Auto", "Which body performs the mutation for this step. Auto = system-managed, off-limits to human action."],
                ["approver",     "MPCA · Division · None", "Which body approves the output of this step, if any."],
                ["mode",         "Register_Linked · Manual_PDF · Auto_Compute · NA", "How data is captured — from the master register, a signed upload, an automatic computation, or not applicable."],
                ["visibility",   "Realtime · On_Submit · Never", "Do other bodies see drafts as they happen, only after submit, or never at all."],
                ["blocks_next",  "true / false", "Does this step gate progression? If true, subsequent steps stay locked until this one completes."],
                ["sla_days",     "integer", "Days the owner has to complete this step. Overshoot fires an escalation notification."],
                ["text",         "human-readable", "The governance intent, from the MPCA scheme document. Rendered verbatim in the Wiring Console."],
            ].map(([f, v, d]) => (
                <div key={f} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-mpca-oxblood text-[12px]">{f}</span>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-brass">{v}</span>
                    </div>
                    <div className="text-[11px] text-mpca-charcoal">{d}</div>
                </div>
            ))}
        </div>

        <H2>Live wiring matrix — 10 real cells</H2>
        <P>Below are ten rows drawn <b>verbatim</b> from the seeded matrix in <code className="bg-mpca-parchment/60 px-1">routes/tournament_wiring.py</code>. This is the actual data that governs every mutation:</P>
        <div className="border border-mpca-brass/30 overflow-x-auto mb-4">
            <table className="w-full text-[11.5px] text-mpca-charcoal">
                <thead className="bg-mpca-parchment/70 text-[10px] uppercase tracking-widest text-mpca-brass">
                    <tr>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Step</th>
                        <th className="text-left p-2">Flag</th>
                        <th className="text-left p-2">Owner</th>
                        <th className="text-left p-2">Approver</th>
                        <th className="text-left p-2">Mode</th>
                        <th className="text-left p-2">Visibility</th>
                        <th className="text-left p-2">Plain English</th>
                    </tr>
                </thead>
                <tbody>
                    {wiringSample.map((r, i) => (
                        <tr key={i} className="border-t border-mpca-brass/15 align-top">
                            <td className="p-2 font-serif text-mpca-oxblood">{r.type}</td>
                            <td className="p-2">{r.step}</td>
                            <td className="p-2"><Pill tone={r.flag === "M" ? "blood" : r.flag === "NA" ? "brass" : "green"}>{r.flag}</Pill></td>
                            <td className="p-2 font-mono text-[11px]">{r.owner}</td>
                            <td className="p-2 font-mono text-[11px]">{r.approver}</td>
                            <td className="p-2 italic">{r.mode}</td>
                            <td className="p-2">{r.visibility}</td>
                            <td className="p-2">{r.english}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <H2>Guard invocation — backend contract</H2>
        <P>Every mutation endpoint on the platform is shaped this way. The pattern is enforced by code review and by the pytest suite (74 tests currently green).</P>
        <Code>{`# routes/grant_claims.py · submit_grant_claim (excerpt)
@api_router.post("/grant-claims/{cid}/submit")
async def submit_grant_claim(
    cid: str,
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    doc = await db.grant_claims.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")

    # 1. Wiring guard — enforces (type × step) owner rule.
    await assert_wiring_owner(
        tid=doc["tournament_id"] or "GLOBAL",
        step_key="grant_submission",
        x_body_type=x_body_type,
        x_body_code=x_body_code,
        action_label="grant submission",
    )

    # 2. Season activation gate — MPCA must have uploaded signed Schemes PDF.
    if not await is_season_activated(doc["fiscal_cycle"]):
        raise HTTPException(403, "Schemes not yet activated for this cycle.")

    # 3. Signed submission summary must be on file.
    if not doc.get("signed_submission_url"):
        raise HTTPException(400, "Upload signed submission PDF first.")

    # 4. Mutation — stamp actor, never default to 'MPCA'.
    await db.grant_claims.update_one({"id": cid}, {"$set": {
        "status": "Submitted",
        "submitted_by": stamp_actor(x_user_name, x_body_code, x_body_type),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }})

    # 5. Audit + notify (best-effort SMTP, hard-required audit).
    await _write_audit_log(cid, "grant_submit", before=doc, actor=x_user_name)
    await _create_notification(role_id="hon-secretary", ...)

    return await db.grant_claims.find_one({"id": cid}, {"_id": 0})`}</Code>

        <H3>The guard function itself</H3>
        <Code>{`# core/wiring_guard.py — the single source of truth for owner enforcement
_OWNER_TO_BODY_TYPES = {
    "MPCA":     {"State"},
    "Division": {"State", "Division"},
    "District": {"State", "Division", "District"},
}

async def assert_wiring_owner(tid, step_key, x_body_type, x_body_code=None, *, action_label=None):
    cell  = await resolve_wiring_cell(tid, step_key)
    owner = cell.get("owner") or "MPCA"

    if owner == "Auto":
        raise HTTPException(409, f"Step '{step_key}' is system-managed for this tournament type.")

    if x_body_type is None:                                  # legacy service-to-service call
        return owner, cell

    allowed = _OWNER_TO_BODY_TYPES.get(owner, {"State"})
    if x_body_type not in allowed:
        verb = action_label or f"{step_key.replace('_', ' ')} action"
        raise HTTPException(403, f"Only {' / '.join(sorted(allowed))} personas may perform "
                                 f"this {verb} (wiring owner = {owner}).")
    return owner, cell`}</Code>

        <H3>The frontend consumer</H3>
        <Code>{`// lib/useWiring.js — cached per tournament id, shared across panels
const step   = useWiringStep(tournamentId, "unified_budget");
const canAct = useWiringOwnerMatch(tournamentId, "unified_budget", persona);

if (canAct)                          return <SubmitBudgetButton />;
if (step?.visibility === "On_Submit") return <RedactedRow reason="Draft not yet submitted" />;
return <ReadOnlyBudgetView />;`}</Code>

        <H2>State machines</H2>
        <P>Every long-running document on the platform is a small state machine. Four of them do the heavy lifting:</P>

        <H3>Grant Claim (8 states, 1 branch)</H3>
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4 mb-3 overflow-x-auto text-[11.5px] font-mono">
{"Draft → Documents_Pending → Submitted → Under_Review → Approved → Sanctioned → Payment_Made"}
<br />
{"                                                     └─ Rejected (may fire post-approval on audit)"}
        </div>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>Draft</b> — created by Division / District; scheme + body + cycle picked.</li>
            <li><b>Documents_Pending</b> — required documents from scheme.required_documents seeded; each uploaded doc is auto-verified by Gemini.</li>
            <li><b>Submitted</b> — signed submission summary PDF uploaded; Division submits to MPCA.</li>
            <li><b>Under_Review</b> — MPCA optionally moves to this intermediate state to signal active review.</li>
            <li><b>Approved</b> — MPCA-signed approval summary PDF on file; approved_amount recorded.</li>
            <li><b>Sanctioned</b> — legacy stage retained for pre-M39z docs; new claims skip straight to Payment_Made.</li>
            <li><b>Payment_Made</b> — UTR + amount + payment_date + optional receipt URL recorded by MPCA.</li>
            <li><b>Rejected</b> — MPCA may reject from Submitted / Under_Review / Approved. Post-approval rejection triggers an SMTP notice + audit entry; claim stays visible with Rejected pill.</li>
        </ul>

        <H3>Tournament Finance Console (M39r — 4 states)</H3>
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4 mb-3 overflow-x-auto text-[11.5px] font-mono">
{"Draft ─send─▶ Sent_To_Division ─div-accept─▶ Approved  (auto-sanction · M39z)"}
<br />
{"                              └─request-revision─▶ Revision_Requested ─(re-send)─▶ Sent_To_Division"}
        </div>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>Draft</b> — MPCA enters input variables once, hits Prepare — system generates one Host budget (full scheme allocation) + one Visitor budget per accepted visiting body.</li>
            <li><b>Sent_To_Division</b> — MPCA hits Send; Divisions see an Action Centre card &quot;Budget received · needs your acceptance&quot;.</li>
            <li><b>Approved</b> — Division taps Accept → auto-sanction (M39z removed the redundant second MPCA click).</li>
            <li><b>Revision_Requested</b> — Division taps Request Revision with a reason; back to MPCA for edits and re-send.</li>
        </ul>

        <H3>Squad workflow (per wiring flag)</H3>
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4 mb-3 overflow-x-auto text-[11.5px] font-mono">
{"Draft → Roster_Built → Submitted → (if flag=M) MPCA_Review → Approved / Rejected"}
<br />
{"                                  (if flag=NA) → Signed (Manual_PDF branch skips MPCA)"}
        </div>

        <H3>Closure (owner-driven)</H3>
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4 mb-3 overflow-x-auto text-[11.5px] font-mono">
{"Open → (generate closure PDF · 14 sections) → Signed (closure_signed_url set) → Completed"}
        </div>
        <P>The <code className="bg-mpca-parchment/60 px-1">/tournaments/&#123;tid&#125;/close</code> endpoint refuses to flip Completed unless <code>closure_signed_url</code> is present <b>and</b> the caller matches the wiring owner for the <code>tournament_closure</code> step. Owner is per-type: MPCA for BCCI/Inter-Div, Division for Inter-District/Inter-School/Inter-Club/all camps.</P>

        <H2>Unified Budget compute engine — the contract</H2>
        <P>
            <code className="bg-mpca-parchment/60 px-1">routes/unified_budget.py</code> is a pure Python port of the MPCA Utility HTML v20. Given a rate card, pools and matches, it returns the exact rollup the utility produced — this is what makes the platform trustworthy for finance folks who ran the utility manually for years.
        </P>
        <Code>{`# For each match, for each of the 17 default BUDGET_HEADS:
if head.basis == "Match":
    amount = rate.md × qty × 1                                    # once per match
else:                                                             # "MatchDays"
    amount = rate.md × qty × MatchDays  +  rate.nmd × qty × NonMatchDays

# Drivers (qty resolution):
AwayTeamPax        = squad × (teams_playing - host_playing_flag)
HostTeamPax        = squad × host_playing_flag
MatchOfficialsPax  = count(assigned umpires + scorers + selectors + observers)
AllPax             = host_pax + away_pax + officials + other_pax
TeamCount          = number of teams (default 2 — for conveyance)
HostTeamCount      = 1 if host plays, else 0 (for coach/manager/trainer)
None (flat head)   = 1

# Rooms rule (head.rooms == True):    qty = ceil(driver_value / 2)

# Days engine (per match):
span_days(m)          = to - from + 1                             # inclusive
match_days(m)         = min(actualDays, span_days)  when actualDays valid
shortfall_days(m)     = span_days - match_days
effective_nmd(m, gap) = manual override else gap[m.id] + shortfall_days

# Travel grant is a separate compute — compute_travel_grant() over 8 travel heads.`}</Code>

        <P>
            The engine also honours <b>rate-card overrides</b>: MPCA can add custom heads (VIP hospitality, trophy engraving) and rename / re-driver / re-owner any of the 17 defaults via <code>head_meta_overrides</code>. Once a budget is locked, a <b>snapshot</b> of the rate card + rows is frozen so subsequent rate-card edits do not silently mutate historical numbers.
        </P>

        <H2>Data model catalog (MongoDB collections)</H2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
                ["Governance", "tournament_wiring (singleton) · audit_logs · roles · users · rbac_role_permissions"],
                ["Tournaments & Squads", "tournaments · squads · squad_timelines · tournament_participations · fixtures · tournament_plans"],
                ["Camps", "camps (separate collection; scheduled for absorption into tournaments per MPCA-254)"],
                ["Officials", "match_officials · tournament_match_officials · match_official_da · match_official_kyc"],
                ["Finance — Master", "reimbursement_schemes · rate_cards (per type × format × season) · bodies · financial_powers"],
                ["Finance — Transactional", "tournament_budgets · tournament_invoices · receipts · reimbursement_claims · grant_claims · grant_claim_discussions · extra_expenses · vouchers"],
                ["Players", "players · season_registrations · selection_funnels · selection_entries"],
                ["Master data", "bodies (State/Division/District/Club/School) · venues_grounds · uploads · disclosures · elections · meetings · members"],
                ["Notifications & Discussions", "notifications · discussions · grant_claim_discussions (per-claim thread)"],
                ["AI & Documents", "ai_document_verifications · body_documents (Body Data Warehouse · Vault picker)"],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[11px] text-mpca-charcoal font-mono">{b}</div>
                </div>
            ))}
        </div>

        <Callout tone="success" title="Why this design pays off">
            Because every governance rule lives in one config, changing a scheme becomes a config edit — not a code change. When MPCA revises a rate card, delegates a step from MPCA to Division, or flips visibility from Realtime to On_Submit, the same endpoint code keeps running and the entire SPA re-renders with the new behaviour on the next fetch. A season-end audit reconstructs exactly what wiring was in force for any tournament via the wiring snapshot frozen at creation.
        </Callout>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// TAB 4 · PRD (Product Requirements Document)
// ═════════════════════════════════════════════════════════════════════

const PRDTab = () => (
    <div>
        <H2>1. Executive summary</H2>
        <P>
            The Madhya Pradesh Cricket Association ERP (Phase 1) is a multi-tenant governance platform for state cricket administration. It replaces spreadsheet + email + paper workflows with a single, wiring-driven digital backbone. The Phase 1 scope covers governance (wiring, RBAC, audit), operations (tournaments, camps, squads, calendar, officials), finance (schemes, rate cards, unified budget, invoices, DA, grant claims, closure), master data (players, bodies, venues) and public communication (showcase, marketing, verification).
        </P>
        <P>
            The platform is built on FastAPI + MongoDB + React SPA, deployed on Kubernetes, and integrates with Gemini (via Emergent LLM Key), SMTP, reportlab and pypdf. Its <b>defining architectural choice</b> is that every governance rule is encoded in a machine-readable 80-cell wiring matrix — no hardcoded role checks anywhere.
        </P>

        <H2>2. Business goals</H2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
                ["Governance in code",         "Move MPCA scheme rules from tribal knowledge and static PDFs into a machine-readable wiring config that can be edited by the RBAC council without a code deploy."],
                ["Time-to-close a tournament", "Cut end-to-end closure time from weeks (Excel reconciliation) to hours (auto-compiled 14-section PDF with merged appendices)."],
                ["Auditability",               "Every mutation writes an immutable audit log with actor, body, action, timestamp, before/after payload. Post-hoc reconstruction of any decision is possible."],
                ["Financial hygiene",          "Every rupee traceable to a scheme + rate card + wiring cell + approver + signed PDF. No ad-hoc payments possible through the platform."],
                ["Stakeholder self-service",   "Divisions manage their own tournaments, camps, budgets, squads and claims without waiting on MPCA back-office turnaround. Wiring keeps them within scope."],
                ["Public communication",       "Same platform surfaces marketing + seed data explorer + membership verification for external stakeholders — no duplicate marketing site to maintain."],
                ["Trust through signed PDFs",  "Every governance gate ends with a signable, printable PDF. Cricket administration is still a paper-first culture; the platform respects that."],
                ["Scheme-safe by construction","Grant claims cannot even be created until MPCA has uploaded the signed Schemes PDF for the fiscal cycle (season activation gate)."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[12px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>

        <H2>3. User personas &amp; role catalog</H2>
        <P>
            The platform recognises <b>four body-type tiers</b> (State · Division · District · Public/Official) and <b>13 RBAC roles</b> mapped to those tiers. The role → permission grid spans 18 modules × 55 permissions.
        </P>

        <H3>3.1 Body-type tiers</H3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
                ["State",   "MPCA headquarters — sees all bodies. All State personas share body_code='MPCA'. Owner set of every 'MPCA' wiring cell resolves to {State}."],
                ["Division","One of ~8 divisions (Indore, Gwalior, Bhopal, etc.). Sees own division + child districts. Body code 'DIV-XXX'."],
                ["District","One of ~55 districts under a division. Sees own district only. Body code 'DIST-XXX-YYY'."],
                ["Public / Official / Club / School", "External stakeholders — match officials submit their own DA; clubs/schools submit signed squad PDFs and view scheduled tournaments; the public sees marketing + disclosures."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[12px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>

        <H3>3.2 The 13 RBAC roles</H3>
        <div className="border border-mpca-brass/30 overflow-x-auto mb-4">
            <table className="w-full text-[11.5px] text-mpca-charcoal">
                <thead className="bg-mpca-parchment/70 text-[10px] uppercase tracking-widest text-mpca-brass">
                    <tr>
                        <th className="text-left p-2">Role</th>
                        <th className="text-left p-2">Body scope</th>
                        <th className="text-left p-2">Primary responsibilities</th>
                    </tr>
                </thead>
                <tbody>
                    {[
                        ["President",             "State",    "Chairs the Board, signs resolutions, holds ultimate approval power. All permissions."],
                        ["Hon. Secretary",        "State",    "Operational chief of MPCA. Final approver on operations & governance. All permissions."],
                        ["Hon. Treasurer",        "State",    "Final approver on all finance. Approves grants, invoices, extras, receipts, closure."],
                        ["Joint Secretary",       "State",    "Assists Secretary. Can propose/edit but not final-approve major claims."],
                        ["Auditor (Internal)",    "State",    "View-only across every body. No writes. Full audit-log read."],
                        ["State Selector",        "State",    "Reviews state-level squads. Cannot touch finance."],
                        ["System Administrator",  "State",    "Owns RBAC and master data (schemes, bodies, venues). No claim/budget approvals."],
                        ["Division Secretary",    "Division", "Operational chief of a Division. Creates own tournaments, submits budgets & claims."],
                        ["Division Treasurer",    "Division", "Signs off on Division finance before it goes to MPCA."],
                        ["District Secretary",    "District", "Operational chief of a District. Runs district camps, submits claims to Division."],
                        ["Match Official",        "Any",      "Umpire/Referee/Scorer. Fills own DA/TA forms after officiating."],
                        ["Coach / Physio",        "Any",      "Views players and squad data; submits performance notes."],
                        ["Public",                "Public",   "Unauthenticated. Views marketing, disclosures, member verification."],
                    ].map(([r, s, resp]) => (
                        <tr key={r} className="border-t border-mpca-brass/15">
                            <td className="p-2 font-serif text-mpca-oxblood">{r}</td>
                            <td className="p-2 font-mono text-[11px]">{s}</td>
                            <td className="p-2">{resp}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <H2>4. Functional requirements</H2>
        <P>Below are the requirements module-by-module. Each requirement is prefixed with a role (who must be able to do it) and a wiring binding (which cell in the matrix governs it).</P>

        <H3>4.1 Tournament Wiring Console</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>President / Hon. Secretary / Sys-Admin</b> — view and edit any of the 80 wiring cells; every edit bumps the version counter and writes an audit_logs entry.</li>
            <li><b>Any authenticated persona</b> — view the current wiring matrix in read-only mode.</li>
            <li>Reset to defaults endpoint restores the seeded matrix (guarded by RBAC).</li>
            <li>Export endpoint returns the JSON matrix for offline archival.</li>
        </ul>

        <H3>4.2 Tournament Workspace</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>Wiring-owner</b> — create tournament of any of the 8 types (wiring cell <code>tournament_creation</code>).</li>
            <li>Progression Ribbon on the detail page renders the 10 lifecycle steps with per-step status (locked · in-progress · complete) driven entirely by wiring + document state.</li>
            <li>Setup Boxes below the ribbon (Basics, Pool, Officials, Squad, Calendar, Budget, Finance, Closure) each read wiring via <code>useWiring</code> and render only the affordances the persona can perform.</li>
            <li>Non-owners see read-only rendering of every box, honouring the visibility flag (On_Submit hides draft numbers).</li>
        </ul>

        <H3>4.3 Squad Selection</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>Wiring-owner</b> (Division / District / Club / School depending on type) — build a squad in Register_Linked mode (from the player master, with age/gender validation) or Manual_PDF mode (upload signed team-list URL).</li>
            <li><b>MPCA (State)</b> — approve squads only for tournament types where wiring flag=M for <code>squad_approval</code>. Approval yields a signed MPCA approval PDF.</li>
            <li>Squad_timelines record announcement dates per MPCA plan (e.g. squad must be locked 10 days before first match).</li>
        </ul>

        <H3>4.4 Match Calendar</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>Wiring-owner</b> — add matches (stage, dates, venue, format, days engine parameters).</li>
            <li>blocks_next=true means Unified Budget cannot be entered until every match has a venue.</li>
            <li>Calendar lock endpoint freezes the schedule; downstream compute uses only the locked calendar.</li>
        </ul>

        <H3>4.5 Unified Budget &amp; Rate Card</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>Sys-Admin / MPCA</b> — maintain rate cards per (tournament_type × format_group × season). 17 default budget heads + 8 travel heads. Custom heads and per-head meta overrides supported.</li>
            <li><b>Wiring-owner of unified_budget</b> — author the tournament budget (Auto_Compute mode uses the compute engine; Manual_PDF mode accepts a signed upload).</li>
            <li>On submission, a snapshot of rate card + rows is frozen so future rate-card edits do not silently mutate historical numbers.</li>
            <li>On_Submit visibility (per wiring) redacts draft rows from MPCA views until submission.</li>
        </ul>

        <H3>4.6 Tournament Finance Console (M39r)</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>MPCA</b> — enter input variables once, hit Prepare (auto-splits Host + Visitor budgets), Send to Division(s).</li>
            <li><b>Division</b> — see Action Centre card, Accept (auto-sanctions) or Request Revision (with reason, sends back to MPCA).</li>
            <li>Terminal state Approved unlocks invoice / DA / claim spending.</li>
        </ul>

        <H3>4.7 Match Officials &amp; DA</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>MPCA (sole owner across all types except Inter-District)</b> — empanel officials, assign per match, apply standard fees + DA rates from rate card.</li>
            <li>Standard fees per role (₹700 Umpire · ₹500 Scorer · ₹800 Selector · ₹1,200 Observer · ₹1,500 Referee · ₹1,200 Physio) and per-day DA (₹500 Umpire · ₹400 Scorer · etc.) seeded but override-able per assignment.</li>
            <li>Officials fill their own DA forms; MPCA reviews via DA Review Inbox; Treasurer approves payment.</li>
            <li>KYC + bank profile per official — Not_Started → Docs_Submitted → KYC_Verified.</li>
        </ul>

        <H3>4.8 Grant Claims (non-tournament schemes)</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li>Season activation gate — MPCA must upload signed Schemes PDF for the cycle before any claim can be created.</li>
            <li><b>Division / District</b> — create claim (scheme + body + cycle), upload required documents one-by-one (Gemini auto-verifies each), upload signed submission PDF, submit.</li>
            <li>Cross-doc AI summary rolls per-doc verdicts + amount reconciliation + fiscal-cycle date check into an overall Recommend_Approve / Manual_Review / Recommend_Reject verdict.</li>
            <li><b>MPCA</b> — review, download approval summary, get it signed, upload signed approval PDF, approve with amount. Approval requires the signed URL — hard-required.</li>
            <li>Threaded discussion between MPCA and division available at every state.</li>
            <li><b>Treasurer</b> — record payment (UTR + amount + date + optional receipt URL).</li>
            <li>MPCA may reject even post-approval (audit rejection); Division sees Rejected pill + reason + SMTP notice.</li>
        </ul>

        <H3>4.9 Selection Funnel</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li>Annual SeasonRegistration per player per body — status Registered → Verified → Active.</li>
            <li>SelectionFunnel per (tournament × format) starts at LongList; selectors add players at each stage; stage limits enforced.</li>
            <li>Progression: LongList → Probables → Final 12 → &quot;Submitted to BCCI App&quot; placeholder.</li>
        </ul>

        <H3>4.10 Closure Certificate</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>Wiring-owner of tournament_closure</b> (MPCA for BCCI/Inter-Div, Division for Inter-District and camps) — generate closure PDF (14 sections via reportlab), get signed, upload signed URL.</li>
            <li>Optional appendix merge (<code>?merge_signed=1</code>) appends squad signed sheets + closure signed PDF via pypdf into a single archive; safely skips URLs that don&apos;t resolve to PDFs.</li>
            <li>Final <code>/close</code> flips status to Completed only when <code>closure_signed_url</code> is present. Immutable after this.</li>
        </ul>

        <H3>4.11 RBAC &amp; Access Control</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li><b>President / Hon. Secretary / Sys-Admin</b> — view and edit the role → permission grid; assign users to roles + bodies; browse the RBAC audit log.</li>
            <li>All other RBAC endpoints refuse the caller with 403 unless they hold one of the three admin roles above.</li>
            <li>Every RBAC change is audit-logged.</li>
        </ul>

        <H3>4.12 Master Data</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li>Bodies (state / division / district / club / school) · Players (with photo, DOB, gender, KYC status) · Venues &amp; Grounds · Reimbursement Schemes · Rate Cards.</li>
            <li>All read by every authenticated persona (via body_scope filter for lists) but writes are RBAC-gated to Sys-Admin / relevant secretary.</li>
        </ul>

        <H3>4.13 Public surface</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1 mb-3">
            <li>Landing page (marketing) · /showcase (this document) · /disclosures-public (published disclosures) · /verify/:uid (member verification) · /register/player/:token (public player registration link).</li>
            <li>All public routes are anonymous — no persona chip required.</li>
        </ul>

        <H2>5. Non-functional requirements</H2>

        <H3>5.1 Security</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1.5 mb-3">
            <li><b>Authentication</b> — Persona chip login persists a JWT-shaped record to localStorage. Every API call carries X-Body-Type / X-User-Body-Code / X-User-Name / X-Persona-Post headers. Backend treats unknown personas as anonymous (403 for anything requiring a body scope).</li>
            <li><b>Authorisation — Wiring guard</b> — <code>assert_wiring_owner()</code> is the very first line of every mutation endpoint. Reads the wiring cell for (tournament_type × step) and validates the caller against the owner set. Cannot be bypassed by URL munging.</li>
            <li><b>Authorisation — RBAC grid</b> — 55 permissions across 18 modules gate feature-level access beyond wiring (e.g. schemes.edit, rbac.assign_users). President / Hon. Secretary / Sys-Admin can edit; everyone else consumes read-only.</li>
            <li><b>Data segregation — On_Submit visibility</b> — Wiring cells with visibility=On_Submit cause list/detail endpoints to redact draft numbers from state-level personas until the division submits. Enforced server-side.</li>
            <li><b>Audit</b> — Every mutation writes an <code>audit_logs</code> entry. Append-only — no endpoint deletes or mutates existing rows. Retained indefinitely.</li>
            <li><b>Signed artifact chain</b> — Every governance gate ends with a signable PDF stored alongside the record. Closure cannot flip Completed without <code>closure_signed_url</code>. Grant approval cannot flip Approved without <code>signed_approval_url</code>.</li>
            <li><b>Season activation gate</b> — Grant claims cannot even be created until MPCA has uploaded the signed Schemes PDF for the fiscal cycle. Prevents rogue claims outside sanctioned scheme rates.</li>
            <li><b>Persona attribution</b> — <code>stamp_actor(persona, body_code, body_type)</code> records the actual persona in every mutation attribution field (locked_by, submitted_by, approved_by, closed_by). Never defaults to a generic &quot;MPCA&quot; string.</li>
            <li><b>Idempotency guards</b> — Active-claim / active-budget / active-tournament checks prevent creating duplicate in-flight records for the same (body × scheme × cycle) tuple.</li>
            <li><b>ObjectId hygiene</b> — Every list/detail endpoint uses <code>&#123;&quot;_id&quot;: 0&#125;</code> projection to strip Mongo ObjectId from responses. API contract is UUIDs only.</li>
            <li><b>Transport</b> — TLS-only in production (Kubernetes ingress termination). CORS-open in preview, tightened in production.</li>
            <li><b>Secrets</b> — MONGO_URL, EMERGENT_LLM_KEY, SMTP credentials in environment only, never in code, never in .env commits.</li>
        </ul>

        <H3>5.2 Performance</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1.5 mb-3">
            <li>Wiring config is a single ~30 KB document loaded once at startup and cached in memory. Zero DB hits per mutation for wiring lookup.</li>
            <li>Frontend caches wiring status per tournament id via <code>useWiring</code> — multiple panels on the same page share ONE HTTP call.</li>
            <li>Lazy-loaded routes — 60+ pages fetched on demand instead of a monolithic bundle. First-paint size trimmed accordingly.</li>
            <li>MongoDB indexes bootstrapped at startup via <code>core/indexes.py</code> on the frequently-queried fields (tournament_id, body_id, fiscal_cycle, status, created_at).</li>
            <li>Unified Budget compute is pure Python, O(matches × heads) — sub-100ms for a full Inter-Division tournament.</li>
        </ul>

        <H3>5.3 Availability &amp; recovery</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1.5 mb-3">
            <li>Kubernetes rolling deploy — zero downtime for both tiers.</li>
            <li>Hot-reload during development; supervisor auto-restart on process crash.</li>
            <li>MongoDB daily snapshots recommended (out-of-band).</li>
            <li>Best-effort SMTP — email dispatch failure does not fail the underlying transaction; audit_logs are the compliance authority.</li>
            <li>pypdf appendix merge fails gracefully — if a URL doesn&apos;t resolve to a PDF, the base closure PDF still renders.</li>
        </ul>

        <H3>5.4 Auditability &amp; compliance</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1.5 mb-3">
            <li>Every mutation writes <code>audit_logs</code>: actor · body · action_label · timestamp · before/after payload.</li>
            <li>Every wiring cell edit bumps the singleton version counter — historical reconstruction is possible.</li>
            <li>Every budget lock freezes a snapshot of rate card + rows.</li>
            <li>Every grant claim carries signed submission PDF + signed approval PDF — the compliance receipt.</li>
            <li>Every closure carries signed closure PDF with merged appendices.</li>
            <li>Audit-log page (<code>/audit-log</code>) filterable by actor, body, action, date range — for the RBAC council.</li>
        </ul>

        <H3>5.5 Idempotency &amp; auto-heal</H3>
        <ul className="list-disc list-inside text-[12px] text-mpca-charcoal space-y-1.5 mb-3">
            <li>Startup migrations flip legacy records that pre-date wiring rules — every boot, safe to re-run.</li>
            <li>Idempotent seeders — wiring, RBAC roles, permission catalog, standard fees/DA rates.</li>
            <li>Duplicate-claim guards on grant creation and budget submission.</li>
        </ul>

        <H2>6. Success metrics</H2>
        <ul className="list-disc list-inside text-[13px] text-mpca-charcoal space-y-1 mb-4">
            <li><b>100% of mutation endpoints</b> gated by <code>assert_wiring_owner()</code> — enforced by code review and pytest suite.</li>
            <li><b>All 8 tournament types</b> flow through the same 10-step lifecycle — no bespoke workflows.</li>
            <li><b>Every stakeholder sees only what wiring allows</b> — realtime or on-submit — enforced server-side.</li>
            <li><b>Every closure</b> produces a printable signed certificate with embedded appendices — zero manual Excel reconciliation.</li>
            <li><b>Every grant claim</b> carries a signed submission PDF and signed approval PDF — full paper-trail.</li>
            <li><b>74/74 pytests green</b> — regression protection on wiring, grants, closure, persona guards.</li>
            <li><b>Zero <code>isMPCA</code> hardcoded checks</b> in mutation endpoints — verified by grep audit.</li>
        </ul>

        <H2>7. Acceptance criteria (Phase 1 exit)</H2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
                ["Wiring is source of truth",       "Every endpoint that mutates tournament state passes through wiring_guard. No hardcoded role checks anywhere in routes/."],
                ["Persona attribution",             "Every mutation stamps the actual persona + body — no default &apos;MPCA&apos; fallback in locked_by / issued_by / submitted_by / closed_by / approved_by."],
                ["Signable artifacts at every gate","Squad submission, grant submission, MPCA approval, closure certificate all yield reportlab PDFs with signature blocks."],
                ["On-Submit visibility",            "Division draft numbers stay private from MPCA state view until submission; wiring flag controls this per type."],
                ["Idempotent auto-heal",            "Startup migrations flip legacy records; every boot safe to re-run."],
                ["Zero regression",                 "All 74 pytests green after every sprint."],
                ["Public / private surface",        "Public marketing site and internal ERP served from same platform, isolated by persona-chip auth."],
                ["Printable everywhere",            "Every list view and every artifact has a print/PDF route — the association still produces physical files."],
                ["Season activation gate",          "Grant claim creation blocked until MPCA uploads signed Schemes PDF for the fiscal cycle."],
                ["Audit-log integrity",             "audit_logs is append-only; no endpoint deletes or mutates existing rows; retained indefinitely."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[12px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>

        <H2>8. Explicit non-goals for Phase 1</H2>
        <ul className="list-disc list-inside text-[13px] text-mpca-charcoal space-y-1 mb-4">
            <li>Ball-by-ball live scoring is <b>out of scope</b> — planned as Phase VI.</li>
            <li>Native mobile apps are out of scope — the SPA is fully responsive on mobile browsers.</li>
            <li>Hindi / regional i18n is out of scope — English-only for Phase 1.</li>
            <li>Automated real-SMTP email dispatch is stubbed — real SMTP wiring is a Phase 2 backlog item.</li>
            <li>External payment gateway integration is out of scope — Treasurer records UTR after off-platform NEFT/RTGS.</li>
            <li>Absorbing camps into the tournaments collection is scheduled but not yet executed (MPCA-254 Ship B).</li>
        </ul>

        <H2>9. Roadmap</H2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[
                ["🔴 P0 (next sprint)", "MPCA-254 alignment ship — Compliance chips · Promote camps to first-class tournaments · Hide /camps sidebar for Division."],
                ["🟠 P1",              "BCCI Approve-Assignment endpoint · Budget Version History · Grant drag-and-drop uploader · Grant discussion push-notify · Real SMTP dispatch."],
                ["🟡 P2",              "DA/TA multi-budget picker · Scheme 3-B no-fee undertaking · Bulk UTR upload · Form 16A prefill · KO team promoter."],
                ["🔵 P3",              "Per-match-day budget caps · Phase VI ball-by-ball scoring · Hindi i18n · Native player-registration mobile app."],
                ["🧹 Refactor",        "Split bloated models.py into /backend/models/ domain files · deprecate db.camps collection after MPCA-254 Ship B migration is verified."],
                ["📈 Observability",   "Structured logging middleware · slow-query log dashboard · nightly audit-log digest email to Auditor role."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[12px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// TAB 5 · Modules
// ═════════════════════════════════════════════════════════════════════

const modules = [
    {
        icon: Workflow,
        name: "Tournament Wiring Console",
        who: "President · Hon. Secretary · Sys-Admin (view for all)",
        what: "Live editor for the (8 × 10) governance matrix — the single source of truth for the platform.",
        how: "Every cell edit bumps the singleton version counter and writes an audit_logs entry. Reset endpoint restores seeded defaults.",
        endpoints: "GET /tournament-wiring · PATCH /tournament-wiring/cell · POST /tournament-wiring/reset · GET /tournament-wiring/export",
        artifacts: "tournament_wiring singleton · audit_logs entries",
        wiring: "Governs everything — the tool that edits itself out of code",
    },
    {
        icon: Trophy,
        name: "Tournament Workspace",
        who: "All personas (persona-scoped)",
        what: "The page a stakeholder opens to run a tournament. 10-step Progression Ribbon + Setup Boxes (Basics, Pool, Officials, Squad, Calendar, Budget, Finance, Closure).",
        how: "Every box reads wiring via useWiring and renders only affordances the persona is allowed to perform. Non-owners see read-only.",
        endpoints: "GET /tournaments · POST /tournaments · GET /tournaments/{tid} · GET /tournaments/{tid}/progress · GET /tournaments/{tid}/wiring-status",
        artifacts: "Tournament record · Progression state · Setup meta",
        wiring: "tournament_creation cell decides who creates; each subsequent step reads its own cell",
    },
    {
        icon: Users,
        name: "Squad Selection",
        who: "Division · District · Club · School (mode wired per type)",
        what: "Register_Linked mode picks from the master player register with age/gender/ID validation; Manual_PDF mode accepts a signed team-list upload URL.",
        how: "Squad approval is Mandatory/Optional/NA per wiring flag — Manual_PDF squads generally skip MPCA approval and go straight to Signed.",
        endpoints: "GET /squads · POST /squads · POST /squads/{sid}/submit · POST /squads/{sid}/mpca-approve · POST /squads/{sid}/signed-upload",
        artifacts: "Squad sheet PDF · MPCA approval PDF (when flag=M) · squad_timelines",
        wiring: "squad · squad_approval cells",
    },
    {
        icon: CalendarIcon,
        name: "Match Calendar",
        who: "MPCA / Host Division depending on tournament type",
        what: "Match dates, venues, format overrides, days-engine parameters (actual_days, nmd_manual, other_pax, driver overrides).",
        how: "blocks_next=true means Unified Budget cannot start until every match has a venue. Calendar-lock endpoint freezes the schedule.",
        endpoints: "GET /tournaments/{tid}/matches · POST /tournaments/{tid}/matches · PATCH /tournaments/{tid}/calendar-lock",
        artifacts: "Match records · Calendar PDF",
        wiring: "match_calendar cell",
    },
    {
        icon: IndianRupee,
        name: "Unified Budget &amp; Rate Card",
        who: "Sys-Admin maintains rate cards · Wiring-owner authors the budget",
        what: "17 default budget heads + 8 travel heads driven by rate card × format × season. Per-match rollup via the compute engine (Days engine, Rooms rule, drivers).",
        how: "Budget snapshot freezes the rate card at submission. On_Submit visibility hides draft rows from MPCA until Division submits.",
        endpoints: "GET /rate-cards · PATCH /rate-cards/{id} · GET /tournaments/{tid}/unified-budget · POST /tournaments/{tid}/unified-budget/submit",
        artifacts: "Budget PDF · budget_snapshots · rate_card entries · custom_heads",
        wiring: "unified_budget cell · mpca_visibility cell",
    },
    {
        icon: TrendingUp,
        name: "Tournament Finance Console (M39r)",
        who: "MPCA prepares & sends · Division accepts / requests revision",
        what: "4-state MPCA-owned finance flow: Draft → Sent_To_Division → Approved (with revision loop).",
        how: "MPCA enters input variables once, Prepare auto-splits Host + Visitor budgets, Send fans out to divisions. Division accept auto-sanctions.",
        endpoints: "POST /tournaments/{tid}/finance/prepare · POST /tournaments/{tid}/finance/send · POST /tournaments/{tid}/finance/{bid}/accept · POST /tournaments/{tid}/finance/{bid}/request-revision",
        artifacts: "tournament_budgets · Host + Visitor split · Action Centre cards",
        wiring: "finance_console cell",
    },
    {
        icon: Gavel,
        name: "Match Officials &amp; DA",
        who: "MPCA (sole owner across all types except Inter-District where Division owns)",
        what: "Central assignment of 9 official roles × 5 grades. Standard fees + DA rate cards. KYC + bank profile per official.",
        how: "Wiring locks non-owners out entirely. DA amounts are rate-card driven, not free-typed. Treasurer records UTR on payment.",
        endpoints: "GET /match-officials · POST /match-officials/{tid}/assign · POST /match-official-da/{did}/submit · POST /match-official-da/{did}/approve",
        artifacts: "Assignment sheet · DA form PDF · Payment record · KYC docs",
        wiring: "match_official_posting cell",
    },
    {
        icon: MailCheck,
        name: "Grant Claims (non-tournament schemes)",
        who: "Division / District submits · MPCA approves · Treasurer records payment",
        what: "8-state lifecycle for schemes 1-A / 3-E / 4-x / 5-B / 6-A / 6-B / 7-A. Gemini AI per-doc verification + cross-doc summary + threaded discussion.",
        how: "Season activation gate blocks creation until MPCA uploads signed Schemes PDF. Signed submission PDF + Signed approval PDF are both mandatory. Post-approval rejection possible.",
        endpoints: "POST /grant-claims · POST /grant-claims/{cid}/document/{doc_id} · POST /grant-claims/{cid}/submit · POST /grant-claims/{cid}/approve · POST /grant-claims/{cid}/payment · POST /grant-claims/{cid}/discussions",
        artifacts: "Signed submission PDF · Signed approval PDF · Discussion thread · Payment record · AI summary",
        wiring: "Governed by RBAC + season activation gate rather than tournament wiring",
    },
    {
        icon: ScrollText,
        name: "Rich Closure Certificate",
        who: "Wiring-owner of tournament_closure (MPCA for BCCI/Inter-Div, Division for others)",
        what: "14-section reportlab PDF: header · tournament summary · bodies · pool tables · calendar · officials · squads · budget rollup · invoices · deductions · financial summary · payments · signed artifacts · signature block.",
        how: "pypdf appends signed appendices into a single archival document. Close endpoint refuses to flip Completed without signed_url.",
        endpoints: "GET /tournaments/{tid}/closure-letter/pdf · POST /tournaments/{tid}/closure-signed-upload · POST /tournaments/{tid}/close",
        artifacts: "Closure PDF · merged appendix archive · closure_signed_url",
        wiring: "tournament_closure cell",
    },
    {
        icon: GraduationCap,
        name: "Selection Funnel",
        who: "State Selector / Division Secretary depending on tournament level",
        what: "Annual SeasonRegistration per player → SelectionFunnel per (tournament × format) → LongList → Probables → Final 12.",
        how: "Stage capacities enforced. Register-linked from the master player database. Snapshots player fields at each stage.",
        endpoints: "GET /season-registrations · POST /selection-funnels · POST /selection-funnels/{fid}/add · POST /selection-funnels/{fid}/advance",
        artifacts: "season_registrations · selection_funnels · selection_entries",
        wiring: "squad cell (Register_Linked mode)",
    },
    {
        icon: Building2,
        name: "Camps (Pre-Tournament / Coaching / Vacation)",
        who: "Division (all camp types)",
        what: "Currently on a separate /camps flow. Types: Pre-Tournament (linked to Inter-Div), Periodical Coaching (3-A), Vacation (3-B).",
        how: "Threads tournament_id=camp_id to reuse Budget + Invoice + Claim rails. MPCA-254 Ship B will absorb camps into the tournaments collection.",
        endpoints: "GET /camps · POST /camps · GET /camps/{cid} · POST /camps/{cid}/close",
        artifacts: "Camp record · Roster · Budget · Closure PDF",
        wiring: "camp · coachingcamp · vacationcamp rows of the matrix",
    },
    {
        icon: Sparkles,
        name: "AI Document Verifier",
        who: "System (auto-invoked on doc upload)",
        what: "Gemini 2.5 Flash reads each uploaded grant document and returns matches/confidence/extracted-fields/issues.",
        how: "Per-doc verdict rolls up into a cross-doc summary with amount-reconciliation (>15% variance = critical), fiscal-cycle date sanity, and low-confidence signal.",
        endpoints: "Invoked internally on POST /grant-claims/{cid}/document/{doc_id} · POST /grant-claims/{cid}/ai-summary",
        artifacts: "ai_verified · ai_confidence · ai_extracted · ai_summary block",
        wiring: "Not wiring-gated — RBAC-gated to Division / MPCA",
    },
    {
        icon: KeyRound,
        name: "RBAC &amp; Access Control",
        who: "President · Hon. Secretary · Sys-Admin (write) · Auditor (audit-log read)",
        what: "13 seeded roles × 55 permissions × 18 modules. Users mapped to (role + body).",
        how: "Every RBAC change writes audit_log. require_rbac_admin dependency gates all writes.",
        endpoints: "GET /rbac/roles · PATCH /rbac/roles/{rid}/permissions · POST /rbac/users · GET /rbac/audit-log",
        artifacts: "roles · users · rbac_role_permissions · audit_log entries",
        wiring: "Wiring config is edit-guarded by these three roles",
    },
    {
        icon: Repeat,
        name: "Auto-heal Migrations &amp; Seeders",
        who: "System (startup)",
        what: "Idempotent boot-time migrations that seed wiring, RBAC roles, permissions, standard fees/DA rates, and flip legacy records into current wiring state.",
        how: "Each migration checks a guard flag on the record; safe to re-run on every boot. Every migration writes an audit_log entry.",
        endpoints: "Called from server startup event · not user-facing",
        artifacts: "Seeded documents · audit_logs (actor=system)",
        wiring: "Bootstraps the wiring singleton if missing",
    },
    {
        icon: Eye,
        name: "On-Submit Visibility Filter",
        who: "Cross-cutting (server-side redaction layer)",
        what: "Hides Division draft numbers from MPCA state views until submission. Enforced at the API, not the UI.",
        how: "Every list/detail endpoint calls the visibility resolver which reads the wiring cell for the step and either returns the row verbatim or a redacted stub.",
        endpoints: "Applied inside routers rather than being a standalone endpoint",
        artifacts: "Redacted API responses (draft rows show placeholder)",
        wiring: "mpca_visibility cell + per-step visibility flag",
    },
    {
        icon: Lock,
        name: "Immutable Audit Log",
        who: "System",
        what: "Every mutation writes an audit_logs entry with actor, body, timestamp, action_label, before/after payload.",
        how: "Guaranteed by the same code path as wiring_guard. Append-only; no endpoint deletes or mutates existing rows.",
        endpoints: "GET /audit-log · GET /audit-log/{action}/latest",
        artifacts: "audit_logs collection · Audit Log page (/audit-log)",
        wiring: "Called on every wiring_guard-protected write",
    },
    {
        icon: BookOpen,
        name: "MPCA Schemes Register",
        who: "Sys-Admin (edit) · Hon. Secretary uploads signed Schemes PDF per cycle",
        what: "Master list of reimbursement schemes (1-A through 9-BCCI). Each scheme carries required_documents list + heads + eligible_bodies + rate_inr.",
        how: "Signed Schemes PDF upload activates the fiscal cycle — grant claim creation is blocked until this is done (season activation gate).",
        endpoints: "GET /reimbursement-schemes · PATCH /reimbursement-schemes/{code} · POST /events/season-activation",
        artifacts: "reimbursement_schemes · season_activation record",
        wiring: "Not wiring-gated — RBAC + season activation gate",
    },
];

const ModulesTab = () => (
    <div>
        <H2>Modules delivered</H2>
        <P>Every module below is wiring-aware unless explicitly noted. Each card lists Who uses it, What it does, How it works under the hood, the Endpoints it exposes, the Artifacts it produces, and the Wiring cell(s) that govern it.</P>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modules.map(m => {
                const Icon = m.icon;
                return (
                    <div key={m.name} className="border border-mpca-brass/30 bg-mpca-ivory p-4 hover:border-mpca-oxblood/60 transition-all">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-mpca-brass/20">
                            <Icon size={16} className="text-mpca-oxblood" />
                            <div className="font-serif text-mpca-oxblood text-base" dangerouslySetInnerHTML={{ __html: m.name }} />
                        </div>
                        <div className="text-[11.5px] text-mpca-charcoal leading-relaxed space-y-2">
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">Who</span> — {m.who}</div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">What</span> — {m.what}</div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">How</span> — {m.how}</div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">Endpoints</span> — <span className="font-mono text-[10.5px] break-words">{m.endpoints}</span></div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">Artifacts</span> — <span className="italic">{m.artifacts}</span></div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">Wiring</span> — <span className="text-mpca-green-dark">{m.wiring}</span></div>
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Root component with tab pagination
// ═════════════════════════════════════════════════════════════════════

const TABS = [
    { key: "overview", label: "Overview",      icon: LayoutDashboard },
    { key: "deck",     label: "Command Deck",  icon: Radio },
    { key: "hld",      label: "HLD",           icon: Network },
    { key: "lld",      label: "LLD",           icon: GitBranch },
    { key: "prd",      label: "PRD",           icon: FileText },
    { key: "modules",  label: "Modules",       icon: Layers },
];

const MPCAShowcase = () => {
    const [tab, setTab] = useState("overview");
    return (
        <div className="min-h-screen bg-mpca-parchment/20" data-testid="mpca-showcase">
            <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
                {/* Sticky tab bar */}
                <div className="sticky top-0 z-20 bg-mpca-parchment/95 backdrop-blur border-b-2 border-mpca-oxblood/60 mb-6 -mx-6 md:-mx-10 px-6 md:px-10">
                    <div className="flex items-center justify-between py-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-mpca-brass">
                            <Code2 size={12} /> MPCA ERP · Phase 1 Showcase
                        </div>
                        <nav className="flex items-center gap-1 flex-wrap" role="tablist" data-testid="showcase-tabs">
                            {TABS.map(t => {
                                const active = tab === t.key;
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.key}
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setTab(t.key)}
                                        className={`px-3 py-1.5 text-[11px] uppercase tracking-widest border transition-all flex items-center gap-1.5 ${
                                            active
                                                ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood"
                                                : "border-mpca-brass/40 text-mpca-charcoal hover:border-mpca-oxblood hover:text-mpca-oxblood"
                                        }`}
                                        data-testid={`showcase-tab-${t.key}`}
                                    >
                                        <Icon size={12} />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </div>

                {/* Tab body */}
                <div className="bg-mpca-ivory border border-mpca-brass/30 p-6 md:p-8" data-testid={`showcase-panel-${tab}`}>
                    {tab === "overview" && <OverviewTab />}
                    {tab === "deck"     && <CommandDeckTab />}
                    {tab === "hld"      && <HLDTab />}
                    {tab === "lld"      && <LLDTab />}
                    {tab === "prd"      && <PRDTab />}
                    {tab === "modules"  && <ModulesTab />}
                </div>

                {/* Footer / pagination hint */}
                <div className="mt-6 flex items-center justify-between text-[10px] uppercase tracking-widest text-mpca-brass">
                    <div>Phase 1 · Wiring-driven governance</div>
                    <div>Page {TABS.findIndex(t => t.key === tab) + 1} of {TABS.length}</div>
                </div>
            </div>
        </div>
    );
};

export default MPCAShowcase;
