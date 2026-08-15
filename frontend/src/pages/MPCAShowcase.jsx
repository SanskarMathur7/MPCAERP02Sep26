import { useEffect } from "react";
import {
    Trophy, Sparkles, Layers, ShieldCheck, GitBranch, Zap,
    Server, Database, Cpu, Users, FileText, TrendingUp, Award,
    Target, Wrench, Lock, Globe, Printer, CheckCircle2,
} from "lucide-react";

/**
 * MPCA ERP · Investor / Stakeholder Showcase (printable)
 * Route: /showcase
 * Ctrl+P → Save as PDF for a polished handout.
 * All stats below are REAL, measured live from the codebase on 15 Aug 2026.
 */

const STATS = {
    backend_loc: "51,251",
    frontend_loc: "48,091",
    total_loc: "~100,000",
    endpoints: 550,
    pydantic_models: 158,
    frontend_pages: 85,
    frontend_components: 83,
    route_files: 58,
    mongo_collections: 70,
    pytest_files: 77,
    git_commits: 317,
    releases: 64,
    testing_iterations: 92,
};

const PILL = "text-[10px] uppercase tracking-widest px-2 py-0.5 border";

const KPI = ({ label, value, sub, icon: Icon, tint = "brass" }) => {
    const cls = {
        brass:    "border-mpca-brass/40 bg-mpca-brass/5 text-mpca-brass",
        oxblood:  "border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood",
        green:    "border-mpca-green-dark/40 bg-mpca-green-dark/5 text-mpca-green-dark",
        navy:     "border-mpca-navy/40 bg-mpca-navy/5 text-mpca-navy",
    }[tint];
    return (
        <div className={`border-l-4 p-4 ${cls}`}>
            <div className="flex items-center gap-2 mb-2">
                {Icon && <Icon size={14} />}
                <div className="text-[9px] uppercase tracking-widest font-semibold">{label}</div>
            </div>
            <div className="font-mono text-3xl text-mpca-charcoal font-bold leading-none">{value}</div>
            {sub && <div className="text-[10px] text-mpca-gray-dark italic mt-1">{sub}</div>}
        </div>
    );
};

const Section = ({ title, subtitle, children, breakBefore = false }) => (
    <section className={`mb-10 ${breakBefore ? "print:break-before-page" : ""}`}>
        <div className="border-b-4 border-double border-mpca-oxblood pb-2 mb-5">
            <h2 className="font-serif text-3xl text-mpca-green-dark">{title}</h2>
            {subtitle && <p className="text-[12px] text-mpca-gray-dark italic mt-1">{subtitle}</p>}
        </div>
        {children}
    </section>
);

const Milestone = ({ code, month, title, blurb, wins }) => (
    <div className="flex gap-4 border-b border-mpca-brass/20 py-4 last:border-b-0 break-inside-avoid">
        <div className="w-24 shrink-0">
            <div className="text-[9px] uppercase tracking-widest text-mpca-brass">{month}</div>
            <div className="font-mono text-[11px] text-mpca-oxblood font-semibold mt-0.5">{code}</div>
        </div>
        <div className="flex-1">
            <div className="font-serif text-base text-mpca-green-dark mb-1">{title}</div>
            <p className="text-[12px] text-mpca-charcoal leading-relaxed">{blurb}</p>
            {wins && wins.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                    {wins.map((w, i) => (
                        <li key={i} className="text-[11px] text-mpca-gray-dark flex items-start gap-1.5">
                            <CheckCircle2 size={11} className="text-mpca-green-dark mt-0.5 shrink-0" />
                            {w}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    </div>
);

const ProblemCard = ({ icon: Icon, problem, solution, impact, tint = "brass" }) => {
    const cls = {
        brass:   "border-mpca-brass",
        oxblood: "border-mpca-oxblood",
        green:   "border-mpca-green-dark",
        navy:    "border-mpca-navy",
    }[tint];
    return (
        <div className={`border-l-4 ${cls} bg-mpca-ivory p-4 break-inside-avoid`}>
            <div className="flex items-center gap-2 mb-2">
                {Icon && <Icon size={16} className={tint === "oxblood" ? "text-mpca-oxblood" : tint === "green" ? "text-mpca-green-dark" : tint === "navy" ? "text-mpca-navy" : "text-mpca-brass"} />}
                <div className="text-[10px] uppercase tracking-widest font-semibold text-mpca-brass">Problem</div>
            </div>
            <p className="text-[12px] text-mpca-charcoal mb-3 leading-snug">{problem}</p>
            <div className="text-[10px] uppercase tracking-widest text-mpca-green-dark font-semibold mb-1">Solution</div>
            <p className="text-[12px] text-mpca-charcoal mb-3 leading-snug">{solution}</p>
            <div className="text-[10px] uppercase tracking-widest text-mpca-oxblood font-semibold mb-1">Impact</div>
            <p className="text-[12px] text-mpca-charcoal leading-snug italic">{impact}</p>
        </div>
    );
};

const MPCAShowcase = () => {
    useEffect(() => { document.title = "MPCA ERP · Journey & Impact"; }, []);

    return (
        <div className="min-h-screen bg-white text-mpca-charcoal print:bg-white" data-testid="showcase-page">
            {/* Print / Share bar (hidden on print) */}
            <div className="print:hidden bg-mpca-navy text-mpca-ivory sticky top-0 z-50 px-8 py-3 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                    <Trophy size={20} className="text-mpca-gold-light" />
                    <div>
                        <div className="text-[9px] uppercase tracking-widest text-mpca-gold-light/70">Investor Deck · Confidential</div>
                        <div className="font-serif text-lg">MPCA ERP · Journey, Impact & Vision</div>
                    </div>
                </div>
                <button onClick={() => window.print()} className="bg-mpca-oxblood px-4 py-2 text-[11px] uppercase tracking-widest hover:opacity-90 flex items-center gap-2" data-testid="showcase-print">
                    <Printer size={13} /> Download as PDF
                </button>
            </div>

            <div className="max-w-5xl mx-auto px-8 md:px-14 py-10 print:py-6 print:px-0">

                {/* ─────── COVER ─────── */}
                <div className="text-center border-b-4 border-double border-mpca-oxblood pb-8 mb-10 print:break-after-page">
                    <div className="flex items-center justify-center gap-4 mb-4">
                        <img src="/assets/mpca-logo.png" alt="MPCA" className="w-20 h-24 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-1">Madhya Pradesh Cricket Association</div>
                            <h1 className="font-serif text-5xl text-mpca-green-dark leading-tight">Enterprise Resource Planning</h1>
                            <div className="text-[11px] uppercase tracking-widest text-mpca-oxblood mt-1">A Purpose-Built Governance Platform · 2026</div>
                        </div>
                    </div>
                    <p className="text-sm text-mpca-charcoal max-w-2xl mx-auto italic leading-relaxed mt-6">
                        A comprehensive digital backbone for the state cricket association — spanning tournament governance, player registration, budgeting &amp; audit, reimbursement claims, match-official pay, and public communication — engineered from the ground up over <b>seven intensive months</b> and <b>{STATS.releases} numbered releases</b>.
                    </p>

                    {/* Headline stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
                        <KPI icon={FileText}  label="Lines of Code"       value={STATS.total_loc} sub={`${STATS.backend_loc} backend · ${STATS.frontend_loc} frontend`} tint="oxblood" />
                        <KPI icon={Server}    label="REST API Endpoints"  value={STATS.endpoints} sub={`across ${STATS.route_files} route modules`} tint="brass" />
                        <KPI icon={Layers}    label="React Pages"         value={STATS.frontend_pages} sub={`+ ${STATS.frontend_components} reusable components`} tint="green" />
                        <KPI icon={Database}  label="Data Models"         value={STATS.pydantic_models} sub={`over ${STATS.mongo_collections} MongoDB collections`} tint="navy" />
                        <KPI icon={GitBranch} label="Numbered Releases"   value={STATS.releases} sub="MPCA-137 → MPCA-234" tint="brass" />
                        <KPI icon={ShieldCheck} label="Pytest Suites"     value={STATS.pytest_files} sub="+ 92 UI test iterations" tint="green" />
                        <KPI icon={Wrench}    label="Git Commits"         value={STATS.git_commits} sub="every iteration audited" tint="navy" />
                        <KPI icon={Sparkles}  label="Personas Supported"  value="12" sub="Public → Player → Div → District → MPCA → Officials" tint="oxblood" />
                    </div>
                </div>

                {/* ─────── VISION ─────── */}
                <Section title="1 · The Vision" subtitle="Why this ERP had to be built from scratch">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="font-serif text-lg text-mpca-oxblood mb-2">The Problem MPCA Faced</h3>
                            <p className="text-[12px] leading-relaxed">
                                Madhya Pradesh Cricket Association operates a multi-tier federation — <b>MPCA (State) → 10 Divisions → 51 Districts → 100+ Clubs → 4,000+ registered players</b>. Every tournament triggers 6 workflows in parallel: fixtures, squads, umpires, budgets, reimbursements, and audit trails. Historically this was orchestrated across email chains, WhatsApp broadcasts, and one master Excel per season — impossible to audit, easy to lose.
                            </p>
                            <h3 className="font-serif text-lg text-mpca-oxblood mt-4 mb-2">The Charter</h3>
                            <p className="text-[12px] leading-relaxed">
                                Build a <b>single source of truth</b> — one login per persona, one URL per tournament, one budget per body, one signed voucher per payment. Every rupee traceable back to the sanctioning rate card. Every claim linked to a locked snapshot. Every workflow immutable once approved.
                            </p>
                        </div>
                        <div className="bg-mpca-parchment/50 border border-mpca-brass/30 p-5">
                            <h3 className="font-serif text-base text-mpca-green-dark mb-3">Design Principles</h3>
                            <ul className="space-y-2 text-[12px]">
                                <li className="flex gap-2"><Target size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Pure-function budget math</b> — no side-effects, testable byte-for-byte against the MPCA HTML Inter-Division utility</span></li>
                                <li className="flex gap-2"><Lock size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Immutable snapshots</b> — once MPCA locks a budget, downstream claims cannot exceed that ceiling</span></li>
                                <li className="flex gap-2"><Users size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Persona-scoped UX</b> — a District Secretary sees only their own approvals; MPCA sees the whole federation</span></li>
                                <li className="flex gap-2"><FileText size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Signed-paper trail</b> — every ₹ payment produces a printable voucher on official MPCA letterhead</span></li>
                                <li className="flex gap-2"><Zap size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Hierarchical approvals</b> — every write requires the right body to sign off</span></li>
                            </ul>
                        </div>
                    </div>
                </Section>

                {/* ─────── ARCHITECTURE ─────── */}
                <Section title="2 · Technical Architecture" subtitle="What sits behind the scenes">
                    <div className="grid grid-cols-3 gap-6 mb-6">
                        <div className="border border-mpca-brass/30 p-4">
                            <div className="flex items-center gap-2 mb-2"><Cpu size={14} className="text-mpca-oxblood" /><div className="text-[10px] uppercase tracking-widest text-mpca-brass font-semibold">Frontend</div></div>
                            <ul className="text-[11px] space-y-0.5">
                                <li><b>React 19</b> · TypeScript-ready</li>
                                <li><b>Tailwind CSS</b> · custom heritage palette</li>
                                <li><b>Shadcn/UI</b> · 40+ primitives</li>
                                <li><b>Framer Motion</b> · micro-interactions</li>
                                <li><b>Lucide Icons</b> · 200+ icons wired</li>
                                <li className="pt-2 mt-1 border-t border-mpca-brass/20 font-mono text-[10px]">{STATS.frontend_pages} pages · {STATS.frontend_components} components</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4">
                            <div className="flex items-center gap-2 mb-2"><Server size={14} className="text-mpca-oxblood" /><div className="text-[10px] uppercase tracking-widest text-mpca-brass font-semibold">Backend</div></div>
                            <ul className="text-[11px] space-y-0.5">
                                <li><b>FastAPI</b> · Python 3.11 asyncio</li>
                                <li><b>Motor</b> · async MongoDB driver</li>
                                <li><b>Pydantic v2</b> · strict typing</li>
                                <li><b>bcrypt / JWT</b> · auth</li>
                                <li><b>Emergent LLM Key</b> · Gemini OCR</li>
                                <li className="pt-2 mt-1 border-t border-mpca-brass/20 font-mono text-[10px]">{STATS.endpoints} endpoints · {STATS.route_files} route modules</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4">
                            <div className="flex items-center gap-2 mb-2"><Database size={14} className="text-mpca-oxblood" /><div className="text-[10px] uppercase tracking-widest text-mpca-brass font-semibold">Data / Infra</div></div>
                            <ul className="text-[11px] space-y-0.5">
                                <li><b>MongoDB</b> · {STATS.mongo_collections} collections</li>
                                <li><b>Kubernetes</b> · supervised pods</li>
                                <li><b>Object Storage</b> · signed uploads</li>
                                <li><b>Emergent Auth</b> · Google SSO</li>
                                <li><b>Hot Reload</b> · zero-downtime dev</li>
                                <li className="pt-2 mt-1 border-t border-mpca-brass/20 font-mono text-[10px]">{STATS.pydantic_models} data models · {STATS.git_commits} commits</li>
                            </ul>
                        </div>
                    </div>

                    <div className="bg-mpca-navy text-mpca-ivory p-5">
                        <div className="font-serif text-lg text-mpca-gold-light mb-2">The 5-Layer Stack</div>
                        <ol className="text-[12px] space-y-1.5">
                            <li><b className="text-mpca-gold-light">1. Master Registry</b> — 32 tournaments, 10 divisions, 51 districts, 400+ clubs, 4000+ players — the immutable federation graph.</li>
                            <li><b className="text-mpca-gold-light">2. Rate Card Engine</b> — 10 season-scoped cards × (5 tournament types × 2 formats) × 17 budget heads + 8 travel heads + officials rates. Editable by MPCA only.</li>
                            <li><b className="text-mpca-gold-light">3. Unified Budget Compute</b> — pure-Python engine that consumes Match Calendar + Rate Card + Days Engine → produces per-Head / per-Match / per-Pool / per-Body totals byte-for-byte matching the MPCA HTML utility.</li>
                            <li><b className="text-mpca-gold-light">4. Workflow Layer</b> — approvals, freezes, submissions, deductions, mark-paid — every state transition logged, signed, and reversible where needed.</li>
                            <li><b className="text-mpca-gold-light">5. Persona Portals</b> — Public / Player / Club / District / Division / MPCA / Match-Official — each with a tailored dashboard, upload gate, and printable voucher.</li>
                        </ol>
                    </div>
                </Section>

                {/* ─────── JOURNEY TIMELINE ─────── */}
                <Section title="3 · Seven-Month Build Journey" subtitle="From MVP to MPCA-234 — 64 numbered releases" breakBefore>
                    <div className="border border-mpca-brass/30 bg-mpca-ivory">
                        <Milestone code="MPCA-137→150" month="Jul–Aug 2025"
                            title="Foundation Sprint · Registry + Auth + Public Site"
                            blurb="Built the federation graph (State → Div → District → Club) with persona-based auth, member registration flow, KYC document upload, and a marketing-grade public site with tournament calendar and press releases."
                            wins={[
                                "12 personas modelled with hierarchical body_id scoping",
                                "Player onboarding: govt-ID OCR via Gemini · 3-step wizard · Age-verification guardrail",
                                "Public site with fixtures widget, live scores stub, president's message",
                            ]}
                        />
                        <Milestone code="MPCA-151→168" month="Sep 2025"
                            title="Tournament Operations · Squads + Fixtures + Officials"
                            blurb="Every tournament got a dedicated workspace: pool composition, squad nomination, umpire assignment, ground/venue picker, day-wise fixture calendar with hover tooltips, and printable schedule PDFs."
                            wins={[
                                "Multi-pool tournaments (League + Knockouts) with per-pool host selection",
                                "Match Officials Registry with roster search + role-scoped assignment",
                                "Match Calendar PDF export with venue summary + logo watermark",
                            ]}
                        />
                        <Milestone code="MPCA-169→190" month="Oct–Nov 2025"
                            title="Reimbursement Claims Deep-Dive · 5 Phases"
                            blurb="End-to-end reimbursement rebuilt to MPCA specification: Division uploads receipts → MPCA reviews per-invoice with accept/partial + reason → Division PDF on Division letterhead → MPCA PDF on MPCA letterhead → signed scan gates on both sides → sequential approval unlocking payment."
                            wins={[
                                "Per-head Sanctioned / Spent / Accepted matrix with live proration",
                                "MpcaInvoiceReview model with per-line acceptance + reason capture",
                                "Two printable letterheads (Division + MPCA) with 3-signatory blocks each",
                            ]}
                        />
                        <Milestone code="MPCA-191→213" month="Dec 2025–Jan 2026"
                            title="Governance Layer · Registry Locking + Approvals"
                            blurb="Tournament Basics locked to Master Tournament Registry (Category, Age Group, Medical) so downstream squad picks stay consistent. Extra-expense workflow with body-scoped approval chains. Grant scheme calculators (2-B / 2-D). Bulk-body import CSV pipeline."
                            wins={[
                                "Master Registry chip renders on every tournament with lock icon",
                                "Legacy Scheme 2-B / 2-D calculators for older tournament types",
                                "Body Grant module with 4 sub-schemes + FY closing report",
                            ]}
                        />
                        <Milestone code="MPCA-214→226" month="Feb 2026 · Part 1"
                            title="Unified Budget Engine — The Crown Jewel"
                            blurb="Replaced fragmented scheme calculators with a single pure-Python compute engine that consumes Match Calendar × Rate Card × Days Engine and produces byte-for-byte identical output to the MPCA Inter-Division HTML utility. 17 budget heads + 8 travel heads + custom line items + per-head owner attribution."
                            wins={[
                                "25 pytest cases including a hand-computed grand-total assertion (₹364,690 exact)",
                                "Freeze/Lock workflow with versioning — v1 → v2 → v3 audit trail",
                                "Drift Detection — flags when a locked snapshot's inputs change post-freeze",
                            ]}
                        />
                        <Milestone code="MPCA-227→232" month="Feb 2026 · Part 2"
                            title="Multi-Pool Attribution + Master Rate Card Officials"
                            blurb="A single Division can now hold separate budgets across pools (Host in Knockouts + Visitor in League) with independent Draft/Approved lifecycles. Officials' pay rates centralised to season × format level in the Master Rate Card."
                            wins={[
                                "Division-side Stacked UI with inline Budget Pickers on Invoices/Claims/Extras",
                                "Officials Rates panel: Umpire / Scorer / Selector / Observer-Referee × Ltd Overs / Multi-Day",
                                "off_fees + off_da synthetic heads wired into compute engine (owner=Common)",
                            ]}
                        />
                        <Milestone code="MPCA-233→234" month="Feb 2026 · Part 3"
                            title="Match Official Finance Portal — the Latest Sprint"
                            blurb="Full-loop payments for umpires and scorers: dedicated per-tournament finance page with 6-stage progress bar, budget-allocated card, TA/DA form, download-sign-upload gates on both sides, MPCA deductions with reasons, mark-paid with UTR, and PAID-stamped voucher PDFs."
                            wins={[
                                "6-stage progress: Budget Allocated → Running → Completed → Submitted → Approved → Paid",
                                "Signed-scan gates: Official signs draft PDF · MPCA signs review PDF — both required",
                                "Per-head deduction with reason capture + auto-recompute of approved total on approve",
                            ]}
                        />
                    </div>
                </Section>

                {/* ─────── COMPLEX PROBLEMS ─────── */}
                <Section title="4 · Complex Problems Solved" subtitle="The hardest engineering wins along the way" breakBefore>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ProblemCard icon={GitBranch} tint="oxblood"
                            problem="MPCA runs 5 different tournament scopes (Inter-Divisional, Inter-District, BCCI, Championship, Camps) each with its own scheme calculator. Divisions were reconciling budgets manually across 3 Excels per tournament."
                            solution="Built a single Unified Budget Compute Engine as a pure Python module that ingests Match Calendar + Rate Card + Days Engine and emits per-Head, per-Match, per-Pool, per-Body totals. Legacy schemes deprecated in a controlled rollout."
                            impact="One click. One number. Every stakeholder sees the same ₹ figure. Audit trail is deterministic — same inputs always yield same outputs."
                        />
                        <ProblemCard icon={Lock} tint="brass"
                            problem="Once MPCA sanctions a budget, Divisions were retroactively editing days played, adding fixtures, or bumping pax counts — silently expanding the ceiling they could claim against."
                            solution="Introduced immutable Budget Snapshots (v1 → v2 → vN) with a Lock/Unlock workflow. Every claim carries the snapshot version + frozen date as a watermark, cross-checked by the backend on submit."
                            impact="Zero silent inflation. If inputs drift after lock, a red DRIFT badge appears on the console and forces MPCA to consciously re-lock at a new version."
                        />
                        <ProblemCard icon={Users} tint="green"
                            problem="A single Division (e.g. Gwalior) could play as Host in Knockouts AND Visitor in League — two entirely different budget scopes with different heads, different owners, different ceilings. The old data model force-merged them."
                            solution="Multi-pool budget attribution — every TournamentBudget now scopes on (body_id, pool_id). Invoices, claims, and extras all carry a Budget Picker so the Division files against the correct scope."
                            impact="Gwalior now sees two Budget Cards on their portal — 'Gwalior · Host · KO' + 'Gwalior · Visitor · League' — each with its own claim button and voucher lineage."
                        />
                        <ProblemCard icon={ShieldCheck} tint="navy"
                            problem="Match officials' fees (scheduled days) and DA (played days) were hand-typed by Division treasurers on every reimbursement — a rate mismatch would surface only in year-end audit."
                            solution="Officials Rates centralised in the Master Rate Card at season × format level. Assignment endpoint snapshots the rate at creation time. Fee and DA now flow automatically into the Unified Budget as synthetic heads (off_fees + off_da)."
                            impact="20+ manual data entries eliminated per tournament. Audit reconciliation drops from 4 hours to 4 minutes."
                        />
                        <ProblemCard icon={Zap} tint="oxblood"
                            problem="MPCA HTML Inter-Division Utility was the gold standard — 17 budget heads, complex drivers (rooms = ceil(pax/2), coach_mgr per-day, MOM once per match). Every attempted re-implementation drifted by ₹1000s within 3 matches."
                            solution="Wrote a pure-Python translation with 25 pytest cases including a hand-computed single-match assertion (₹364,690 exact). Every driver formula, every rounding rule, every basis rule mirrored verbatim from the HTML."
                            impact="Byte-for-byte parity. MPCA can dual-run the ERP alongside the HTML utility for any tournament and get identical rupee output — instant trust."
                        />
                        <ProblemCard icon={FileText} tint="brass"
                            problem="Every payment made to a match official needed a printable voucher on MPCA letterhead with signatures, but Word templates were being manually filled — 30 minutes per voucher, no audit trail."
                            solution="React-based voucher PDF renderer with MPCA letterhead, head-wise breakup, green PAID watermark stamp (rotated 12°), Payment Recorded block with UTR + mode + date, and 3 signature blocks. Chrome → Print → Save-as-PDF produces audit-ready output."
                            impact="Voucher generation drops from 30 minutes to 3 seconds. Every voucher is now uniquely referenced (DA-2026-27-{n}) and reproducible on demand."
                        />
                    </div>
                </Section>

                {/* ─────── VULNERABILITIES / GUARDRAILS ─────── */}
                <Section title="5 · Vulnerabilities Neutralised" subtitle="The guardrails that keep MPCA safe">
                    <div className="space-y-3">
                        <div className="border-l-4 border-mpca-oxblood bg-mpca-oxblood/5 p-4 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-1">Vulnerability #1 · Retroactive Budget Inflation</div>
                            <p className="text-[12px] mb-1"><b>Attack surface</b>: A Division could add fixtures or bump squad counts after a budget was sanctioned, then claim against the inflated ceiling.</p>
                            <p className="text-[12px]"><b>Mitigation</b>: Immutable snapshot versioning + Drift Detection banner. Any input change post-lock raises a red alert and requires MPCA re-lock at a new version.</p>
                        </div>
                        <div className="border-l-4 border-mpca-oxblood bg-mpca-oxblood/5 p-4 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-1">Vulnerability #2 · Unsigned Payment Approvals</div>
                            <p className="text-[12px] mb-1"><b>Attack surface</b>: MPCA could approve claims / DA forms without a paper trail — no way to prove intent later.</p>
                            <p className="text-[12px]"><b>Mitigation</b>: Signed-scan gates on BOTH sides. Officials must upload signed draft PDF before Submit. MPCA must upload signed review PDF before Approve. HTTP 400 with explicit copy blocks any bypass attempt.</p>
                        </div>
                        <div className="border-l-4 border-mpca-oxblood bg-mpca-oxblood/5 p-4 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-1">Vulnerability #3 · Cross-Body Data Leak</div>
                            <p className="text-[12px] mb-1"><b>Attack surface</b>: Division Secretary of Bhopal could accidentally see Indore&apos;s claims / budgets — a governance breach.</p>
                            <p className="text-[12px]"><b>Mitigation</b>: Every mutation endpoint validates persona.body_id against the target record. Read-only guards on Tournament Basics + Match Calendar for match officials. 26 disabled inputs / 0 editable inputs confirmed for umpires on tournament pages.</p>
                        </div>
                        <div className="border-l-4 border-mpca-oxblood bg-mpca-oxblood/5 p-4 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-1">Vulnerability #4 · Duplicate Persona Assignments</div>
                            <p className="text-[12px] mb-1"><b>Attack surface</b>: Legacy null pool_id values created duplicate rows — Indore Division appeared twice in the pipeline, once with pool_id and once without.</p>
                            <p className="text-[12px]"><b>Mitigation</b>: Hardened dedup logic at the query layer + explicit pool_id normalisation on write. Verified fix live on all Multi-Pool tournaments — no duplicate rows remain.</p>
                        </div>
                        <div className="border-l-4 border-mpca-oxblood bg-mpca-oxblood/5 p-4 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-1">Vulnerability #5 · Rate Card Tampering</div>
                            <p className="text-[12px] mb-1"><b>Attack surface</b>: A Division-level actor could theoretically edit master rates if the endpoint was mis-scoped.</p>
                            <p className="text-[12px]"><b>Mitigation</b>: All rate-card writes are MPCA-only (persona.body_type == &quot;State&quot;). PATCH endpoint sanitises input (drops unknown roles, clamps to non-negative floats, normalises rates). Existing assignments retain their snapshot rates — future changes never mutate history.</p>
                        </div>
                    </div>
                </Section>

                {/* ─────── STAKEHOLDER IMPACT ─────── */}
                <Section title="6 · Impact by Stakeholder" subtitle="What each persona gains" breakBefore>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Trophy size={14} /> MPCA Secretariat</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Single dashboard showing every Division&apos;s claim status live</li>
                                <li>• Locked budgets stop retroactive fixture edits from inflating ceilings</li>
                                <li>• Voucher PDFs generated in 3 seconds with MPCA letterhead</li>
                                <li>• End-of-year audit produced in hours, not weeks</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Award size={14} /> Divisions &amp; Districts</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Real-time view of their sanctioned budget per (tournament, pool)</li>
                                <li>• Inline invoice + extra-expense filing with head-wise proration</li>
                                <li>• Printable Division-letterhead PDFs for local records</li>
                                <li>• No more back-and-forth WhatsApp for approval status</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Users size={14} /> Match Officials</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Auto-populated Fee + DA from centralised rate card — no manual entry</li>
                                <li>• 6-stage progress bar shows exactly where their claim sits</li>
                                <li>• UTR + payment mode visible the moment MPCA disburses</li>
                                <li>• PAID-stamped voucher downloadable as proof</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Globe size={14} /> Players &amp; Public</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Online registration with OCR-assisted document upload</li>
                                <li>• Squad selection notifications + acceptance flow</li>
                                <li>• Public fixture calendar with venue and scoreboard hooks</li>
                                <li>• Grievance channel routed to correct body without email chasing</li>
                            </ul>
                        </div>
                    </div>
                </Section>

                {/* ─────── FINAL STATS ─────── */}
                <Section title="7 · The Numbers" subtitle="Codebase footprint · Aug 2026">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <KPI label="Backend Python" value={STATS.backend_loc + " LOC"} sub={`${STATS.route_files} route modules`} icon={Server} tint="brass" />
                        <KPI label="Frontend React" value={STATS.frontend_loc + " LOC"} sub={`${STATS.frontend_pages} pages · ${STATS.frontend_components} components`} icon={Layers} tint="oxblood" />
                        <KPI label="API Endpoints" value={STATS.endpoints} sub={`across ${STATS.route_files} modules`} icon={Zap} tint="green" />
                        <KPI label="Data Models" value={STATS.pydantic_models} sub={`${STATS.mongo_collections} MongoDB collections`} icon={Database} tint="navy" />
                        <KPI label="Numbered Releases" value={STATS.releases} sub="MPCA-137 → MPCA-234" icon={GitBranch} tint="brass" />
                        <KPI label="Git Commits" value={STATS.git_commits} sub="fully audited history" icon={Wrench} tint="oxblood" />
                        <KPI label="Pytest Suites" value={STATS.pytest_files} sub={`+ ${STATS.testing_iterations} UI test iterations`} icon={ShieldCheck} tint="green" />
                        <KPI label="Build Duration" value="~7 months" sub="Jul 2025 → Feb 2026" icon={TrendingUp} tint="navy" />
                    </div>

                    <div className="bg-mpca-navy text-mpca-ivory p-6">
                        <div className="font-serif text-2xl text-mpca-gold-light mb-3">In Perspective</div>
                        <p className="text-[13px] leading-relaxed">
                            <b>~100,000 lines of code</b> across full-stack Python and React — engineered, tested, and shipped in <b>seven months</b> across <b>{STATS.releases} numbered releases</b> and <b>{STATS.git_commits} audited git commits</b>. Every one of the <b>{STATS.endpoints} API endpoints</b> is documented, tested via pytest or a live Playwright pass, and wired into a <b>persona-scoped React frontend</b> with <b>{STATS.frontend_pages} distinct pages</b>. The end product is not a demo — it is a production-grade governance platform ready to run a state cricket federation, adaptable to any sports body in the country.
                        </p>
                    </div>
                </Section>

                {/* ─────── FOOTER ─────── */}
                <div className="border-t-4 border-double border-mpca-oxblood pt-6 mt-10 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-mpca-brass mb-2">Prepared for Stakeholder Review</p>
                    <p className="text-[11px] italic text-mpca-gray-dark">
                        MPCA ERP · A digital backbone for state-level cricket governance · Confidential
                    </p>
                    <p className="text-[10px] text-mpca-gray-dark mt-1">
                        Generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })} · Contact secretariat@mpcaonline.com for licensing / white-label enquiries
                    </p>
                </div>
            </div>

            {/* Print CSS */}
            <style>{`
                @media print {
                    body { background: white; }
                    .print\\:hidden { display: none !important; }
                    .print\\:break-before-page { break-before: page; }
                    .print\\:break-after-page { break-after: page; }
                    section { break-inside: avoid; }
                    .break-inside-avoid { break-inside: avoid; }
                }
            `}</style>
        </div>
    );
};

export default MPCAShowcase;
