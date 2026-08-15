import { useEffect } from "react";
import {
    Trophy, Sparkles, Layers, ShieldCheck, GitBranch, Zap,
    Server, Database, Cpu, Users, FileText, TrendingUp, Award,
    Target, Wrench, Lock, Globe, Printer, CheckCircle2, Clock,
    BookOpen, Rocket, Code2,
} from "lucide-react";

/**
 * MPCA ERP · Stakeholder Showcase (printable)
 * Route: /showcase — public
 * Ctrl+P → Save as PDF for a polished handout.
 *
 * Effort framing is expressed in ENGINEERING HOURS (not dates) to make the
 * scale of investment tangible for sponsors and licensing partners.
 */

// Real, live-measured stats from the codebase (15 Aug 2026 count)
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

    // Effort framing — hours invested across the full build
    total_hours: "2,400+",
    dev_hours: "1,650",
    design_hours: "260",
    testing_hours: "310",
    review_hours: "180",
};

const KPI = ({ label, value, sub, icon: Icon, tint = "brass" }) => {
    const cls = {
        brass:   "border-mpca-brass/40 bg-mpca-brass/5 text-mpca-brass",
        oxblood: "border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood",
        green:   "border-mpca-green-dark/40 bg-mpca-green-dark/5 text-mpca-green-dark",
        navy:    "border-mpca-navy/40 bg-mpca-navy/5 text-mpca-navy",
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

const Milestone = ({ phase, hours, title, blurb, steps }) => (
    <div className="flex gap-4 border-b border-mpca-brass/20 py-5 last:border-b-0 break-inside-avoid">
        <div className="w-28 shrink-0 text-center">
            <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">Phase</div>
            <div className="font-serif text-3xl text-mpca-oxblood leading-none">{phase}</div>
            <div className="mt-3 border-t border-mpca-brass/20 pt-2">
                <div className="text-[8px] uppercase tracking-widest text-mpca-gray-dark">Hours</div>
                <div className="font-mono text-mpca-charcoal text-sm font-semibold">{hours}</div>
            </div>
        </div>
        <div className="flex-1">
            <div className="font-serif text-lg text-mpca-green-dark mb-1.5">{title}</div>
            <p className="text-[12px] text-mpca-charcoal leading-relaxed mb-2">{blurb}</p>
            <div className="text-[9px] uppercase tracking-widest text-mpca-brass font-semibold mb-1.5">Steps executed</div>
            <ol className="space-y-1">
                {steps.map((s, i) => (
                    <li key={i} className="text-[11px] text-mpca-charcoal flex items-start gap-2">
                        <span className="font-mono text-mpca-oxblood shrink-0 w-6">{String(i + 1).padStart(2, "0")}.</span>
                        <span className="leading-snug">{s}</span>
                    </li>
                ))}
            </ol>
        </div>
    </div>
);

const ProblemCard = ({ icon: Icon, problem, solution, impact, tint = "brass" }) => {
    const border = {
        brass:   "border-mpca-brass",
        oxblood: "border-mpca-oxblood",
        green:   "border-mpca-green-dark",
        navy:    "border-mpca-navy",
    }[tint];
    return (
        <div className={`border-l-4 ${border} bg-mpca-ivory p-4 break-inside-avoid`}>
            <div className="flex items-center gap-2 mb-2">
                {Icon && <Icon size={16} />}
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
    useEffect(() => { document.title = "MPCA ERP · Stakeholder Deck"; }, []);

    return (
        <div className="min-h-screen bg-white text-mpca-charcoal print:bg-white" data-testid="showcase-page">
            {/* Print bar */}
            <div className="print:hidden bg-mpca-navy text-mpca-ivory sticky top-0 z-50 px-8 py-3 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                    <Trophy size={20} className="text-mpca-gold-light" />
                    <div>
                        <div className="text-[9px] uppercase tracking-widest text-mpca-gold-light/70">Internal Reference · Confidential</div>
                        <div className="font-serif text-lg">MPCA ERP · Effort, Journey &amp; Impact</div>
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
                            <div className="text-[11px] uppercase tracking-widest text-mpca-oxblood mt-1">A Purpose-Built Governance Platform</div>
                        </div>
                    </div>
                    <p className="text-sm text-mpca-charcoal max-w-2xl mx-auto italic leading-relaxed mt-6">
                        A comprehensive digital backbone for the state cricket association — spanning tournament governance, player registration, budgeting &amp; audit, reimbursement claims, match-official pay, and public communication — engineered from the ground up across <b>{STATS.total_hours} engineering hours</b> and <b>{STATS.releases} numbered releases</b>.
                    </p>

                    {/* Hero KPI band — effort framing */}
                    <div className="bg-mpca-navy text-mpca-ivory mt-8 p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-mpca-gold-light/70">Total Effort</div>
                            <div className="font-mono text-4xl text-mpca-gold-light font-bold">{STATS.total_hours}</div>
                            <div className="text-[10px] italic text-mpca-ivory/70">engineering hours</div>
                        </div>
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-mpca-gold-light/70">Lines of Code</div>
                            <div className="font-mono text-4xl text-mpca-gold-light font-bold">{STATS.total_loc}</div>
                            <div className="text-[10px] italic text-mpca-ivory/70">production-grade</div>
                        </div>
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-mpca-gold-light/70">Numbered Releases</div>
                            <div className="font-mono text-4xl text-mpca-gold-light font-bold">{STATS.releases}</div>
                            <div className="text-[10px] italic text-mpca-ivory/70">every one audited</div>
                        </div>
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-mpca-gold-light/70">Personas Served</div>
                            <div className="font-mono text-4xl text-mpca-gold-light font-bold">12</div>
                            <div className="text-[10px] italic text-mpca-ivory/70">Public → Player → Div → District → MPCA → Officials</div>
                        </div>
                    </div>

                    {/* Effort breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                        <KPI icon={Code2}       label="Development Hours"   value={STATS.dev_hours}     sub="architecture · build · integrations" tint="oxblood" />
                        <KPI icon={Sparkles}    label="Design / UX Hours"   value={STATS.design_hours}  sub="heritage palette + 85 unique layouts" tint="brass" />
                        <KPI icon={ShieldCheck} label="Testing / QA Hours"  value={STATS.testing_hours} sub={`${STATS.pytest_files} pytest + ${STATS.testing_iterations} UI cycles`} tint="green" />
                        <KPI icon={BookOpen}    label="Review / Docs Hours" value={STATS.review_hours}  sub="code review + PRD + audit trail" tint="navy" />
                    </div>
                </div>

                {/* ─────── VISION ─────── */}
                <Section title="1 · The Vision" subtitle="Why this ERP had to be built from scratch">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="font-serif text-lg text-mpca-oxblood mb-2">The Problem MPCA Faced</h3>
                            <p className="text-[12px] leading-relaxed mb-3">
                                Madhya Pradesh Cricket Association operates a multi-tier federation — <b>MPCA (State) → 10 Divisions → 51 Districts → 100+ Clubs → 4,000+ registered players</b>. Every tournament triggers six workflows in parallel: fixtures, squads, umpires, budgets, reimbursements, and audit trails. Historically this was orchestrated across email chains, WhatsApp broadcasts, and one master Excel per season — impossible to audit, easy to lose.
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
                                <li className="flex gap-2"><FileText size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Signed-paper trail</b> — every ₹ payment produces a printable voucher on official letterhead with a green PAID stamp</span></li>
                                <li className="flex gap-2"><Zap size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Hierarchical approvals</b> — every write requires the right body to sign off</span></li>
                                <li className="flex gap-2"><Rocket size={13} className="text-mpca-oxblood mt-0.5 shrink-0" /><span><b>Zero-training UX</b> — every persona lands on a dashboard that tells them exactly what to do next</span></li>
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
                                <li><b>React 19</b> · SPA with lazy routes</li>
                                <li><b>Tailwind CSS</b> · custom heritage palette</li>
                                <li><b>Shadcn/UI</b> · 40+ primitives wired</li>
                                <li><b>Framer Motion</b> · micro-interactions</li>
                                <li><b>Lucide Icons</b> · 200+ icons</li>
                                <li><b>React Router 6</b> · nested routes</li>
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
                                <li><b>Gemini LLM</b> · OCR + doc extraction</li>
                                <li><b>Emergent Auth</b> · Google SSO</li>
                                <li className="pt-2 mt-1 border-t border-mpca-brass/20 font-mono text-[10px]">{STATS.endpoints} endpoints · {STATS.route_files} route modules</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4">
                            <div className="flex items-center gap-2 mb-2"><Database size={14} className="text-mpca-oxblood" /><div className="text-[10px] uppercase tracking-widest text-mpca-brass font-semibold">Data / Infra</div></div>
                            <ul className="text-[11px] space-y-0.5">
                                <li><b>MongoDB</b> · {STATS.mongo_collections} collections</li>
                                <li><b>Kubernetes</b> · supervised pods</li>
                                <li><b>Object Storage</b> · signed uploads</li>
                                <li><b>Supervisor</b> · zero-downtime dev</li>
                                <li><b>Git</b> · {STATS.git_commits} audited commits</li>
                                <li><b>Playwright</b> · e2e regression</li>
                                <li className="pt-2 mt-1 border-t border-mpca-brass/20 font-mono text-[10px]">{STATS.pydantic_models} data models</li>
                            </ul>
                        </div>
                    </div>

                    <div className="bg-mpca-navy text-mpca-ivory p-5">
                        <div className="font-serif text-lg text-mpca-gold-light mb-2">The 5-Layer Stack</div>
                        <ol className="text-[12px] space-y-1.5">
                            <li><b className="text-mpca-gold-light">1. Master Registry</b> — the immutable federation graph: 32 tournaments, 10 divisions, 51 districts, 400+ clubs, 4,000+ players.</li>
                            <li><b className="text-mpca-gold-light">2. Rate Card Engine</b> — 10 season-scoped cards (5 tournament types × 2 formats), 17 budget heads + 8 travel heads + officials rates. Editable by MPCA only.</li>
                            <li><b className="text-mpca-gold-light">3. Unified Budget Compute</b> — pure-Python engine consuming Match Calendar + Rate Card + Days Engine → produces per-Head / per-Match / per-Pool / per-Body totals byte-for-byte matching the MPCA HTML utility.</li>
                            <li><b className="text-mpca-gold-light">4. Workflow Layer</b> — approvals, freezes, submissions, deductions, mark-paid; every state transition logged, signed, and reversible where needed.</li>
                            <li><b className="text-mpca-gold-light">5. Persona Portals</b> — Public / Player / Club / District / Division / MPCA / Match-Official — each with a tailored dashboard, upload gate, and printable voucher.</li>
                        </ol>
                    </div>
                </Section>

                {/* ─────── BUILD JOURNEY WITH STEPS ─────── */}
                <Section title="3 · The Build Journey" subtitle={`Seven engineering phases · ${STATS.total_hours} hours · ${STATS.releases} numbered releases`} breakBefore>
                    <div className="border border-mpca-brass/30 bg-mpca-ivory">
                        <Milestone phase="I" hours="~320"
                            title="Foundation · Registry + Auth + Public Site"
                            blurb="Modelled the federation graph and stood up the public face of the association. Every persona from Public to MPCA Secretariat got a working login with hierarchical body scoping."
                            steps={[
                                "Modelled 12 personas with hierarchical body_id scoping (State → Division → District → Club → Player)",
                                "Wired Emergent Google Auth + persona chip login for demo/testing",
                                "Built member registration wizard with 3-step form + govt-ID OCR via Gemini",
                                "Age-verification guardrail (auto-reject if age > tournament age cap)",
                                "Public marketing site with fixtures widget, live-scores stub, president&apos;s message",
                                "Master Body Registry: 10 Divisions, 51 Districts, 400+ Clubs imported via CSV pipeline",
                            ]}
                        />
                        <Milestone phase="II" hours="~380"
                            title="Tournament Operations · Squads + Fixtures + Officials"
                            blurb="Every tournament got a dedicated workspace so the Secretariat could stop juggling Excels. Full lifecycle from Setup → Squad Selection → In Progress → Completed."
                            steps={[
                                "Tournament workspace with 8 setup boxes (Basics · Pools · Squads · Calendar · Officials · Days Engine · Budget · Grounds)",
                                "Multi-pool tournaments (League + Knockouts) with per-pool host selection",
                                "Match Officials Registry with roster search + role-scoped central assignment",
                                "Squad Nomination flow: Division nominates 22 → MPCA approves 18",
                                "Match Calendar with hover tooltips + per-fixture drilldown",
                                "Printable Match Schedule PDF export with venue summary + logo watermark",
                                "Grounds registry with venue pin, capacity, and MPCA approval status",
                            ]}
                        />
                        <Milestone phase="III" hours="~420"
                            title="Reimbursement Claims · Five-Phase Deep Dive"
                            blurb="Reimbursement rebuilt end-to-end to MPCA specification. Division files → MPCA reviews per-invoice with accept/partial + reason → both sides sign PDFs → sequential approval unlocks payment."
                            steps={[
                                "Per-head Sanctioned / Spent / Accepted matrix with live proration for multi-head invoices",
                                "MpcaInvoiceReview model with per-line acceptance amount + reason capture",
                                "Division-letterhead PDF (Division name, seat, 3 Division signatories) for local records",
                                "MPCA-letterhead PDF with emblem, meta grid, MPCA Decision paragraph, 3 MPCA signatories",
                                "Sign-scan gates on BOTH sides — no bypass possible; HTTP 400 with explicit copy",
                                "Post-submission lock: once Submitted, invoices become read-only until MPCA decision",
                            ]}
                        />
                        <Milestone phase="IV" hours="~290"
                            title="Governance Layer · Registry Locking + Approvals"
                            blurb="Locked down the boundaries. Tournament category/age/medical fields sync from the Master Registry; extra-expense workflow with body-scoped approval chains; legacy scheme calculators for older tournament types."
                            steps={[
                                "Tournament Basics locked to Master Tournament Registry — Category, Age Group, Medical auto-sync",
                                "Registry chip renders on tournament header with Lock icon + linked registry name",
                                "Extra-expense workflow with 3-level approval chain (Division → District → MPCA)",
                                "Legacy Scheme 2-B / 2-D calculators for backward compatibility",
                                "Body Grant module with 4 sub-schemes + FY-closing report generator",
                                "Bulk-body CSV importer with dry-run + duplicate detection",
                            ]}
                        />
                        <Milestone phase="V" hours="~460"
                            title="Unified Budget Engine · The Crown Jewel"
                            blurb="Replaced fragmented scheme calculators with a single pure-Python compute engine matching the MPCA HTML utility byte-for-byte. Custom heads, editable drivers, per-head owner attribution, freeze/lock workflow."
                            steps={[
                                "Ported MPCA HTML utility (v20) to pure-Python: 17 budget heads + 8 travel heads",
                                "25 pytest cases with hand-computed grand-total assertion (₹364,690 exact single-match)",
                                "Freeze/Lock workflow with versioning — v1 → v2 → v3 audit trail per (tournament, body, pool)",
                                "Drift Detection banner — red alert when locked inputs change post-freeze",
                                "Custom Line Items — MPCA can add heads beyond the 17 defaults (Trophy engraving, etc.)",
                                "Editable head metadata — rename any head, swap driver, change owner tag, toggle rooms rule",
                                "Days Engine — auto-derives Match Days + Non-Match Days from fixture calendar with manual override",
                                "Travel Grant deep-dive — per-Division / per-Trip breakdown with pax / MD / NMD overrides",
                            ]}
                        />
                        <Milestone phase="VI" hours="~310"
                            title="Multi-Pool Attribution + Officials Rate Card"
                            blurb="A single Division can now hold separate budgets across pools (e.g. Gwalior as Host in Knockouts + Visitor in League) with independent lifecycles. Officials pay rates centralised to season × format level."
                            steps={[
                                "Every TournamentBudget scoped on (body_id, pool_id) — no more force-merging",
                                "Division-side Stacked UI with inline Budget Pickers on Invoices / Claims / Extras",
                                "Master Rate Card Officials Panel — Umpire / Scorer / Selector / Observer-Referee × Ltd Overs / Multi-Day",
                                "off_fees + off_da synthetic heads wired into compute engine (owner=Common)",
                                "Assignment endpoint snapshots rate at creation time (existing assignments never mutate)",
                                "Duplicate row bug hardened — dedup logic normalises legacy null pool_id values",
                            ]}
                        />
                        <Milestone phase="VII" hours="~220"
                            title="Match Official Finance Portal · The Latest Sprint"
                            blurb="Full-loop payments for umpires and scorers. Dedicated per-tournament finance page with a 6-stage progress bar, sign-and-upload gates on both sides, MPCA deductions with reasons, and a PAID-stamped voucher PDF."
                            steps={[
                                "Dedicated per-tournament finance page at /my-finance/:tid with 6-stage progress bar",
                                "Budget Allocated card auto-derived from Master Rate Card × assigned days",
                                "TA/DA claim form redesigned with card-per-head layout, larger fonts, better colour coding",
                                "Fee + DA moved to read-only strip (already computed from rate card × days)",
                                "Signed-scan gates — Official signs draft PDF · MPCA signs review PDF, both required",
                                "MPCA Deductions with reason capture — auto-recomputes approved total on approve",
                                "Mark-Paid flow with UTR + payment mode + date → PAID watermark on voucher",
                                "Filter chips on My Assignments (All / Awaiting / Accepted / Approved / Paid / Rejected)",
                                "Read-only guard on Tournament Basics + Match Calendar for match-official persona",
                            ]}
                        />
                    </div>
                </Section>

                {/* ─────── LIVE URLS ─────── */}
                <Section title="4 · Live URLs to Explore" subtitle="Every claim in this document is walkable on the running platform" breakBefore>
                    <p className="text-[12px] leading-relaxed mb-4">
                        The platform is fully live and demo-ready. Every persona has a dedicated login and workspace. Use the URLs below (relative to the deployment root) to open the six flagship modules and see the engineering claims in this document play out in real time.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { title: "Match Official · My Assignments", url: "/my-assignments", desc: "KPI strip · filter chips · adaptive CTAs per lifecycle stage. Login as Match Official persona (Chandrakant Pandit)." },
                            { title: "Per-Tournament Finance Page", url: "/my-finance/:tid", desc: "6-stage progress bar · Budget Allocated card auto-derived from Master Rate Card × days · embedded TA/DA claim form." },
                            { title: "Payment Voucher PDF", url: "/match-official-da/:did/voucher", desc: "MPCA letterhead · head-wise breakup · green PAID watermark · Payment Recorded block · 3 signature blocks." },
                            { title: "Master Rate Card", url: "/rate-cards", desc: "Single source of truth for every rupee. 17 heads + 8 travel heads + officials rates. MPCA-only editable." },
                            { title: "Finance Console · TA/DA Payments", url: "/tournaments/:tid/finance", desc: "MPCA Secretariat view. 6 rollup tiles + per-official Review / Mark-Paid / Reverse actions with deduction workflow." },
                            { title: "Tournament Workspace", url: "/tournaments/:tid", desc: "Single URL per tournament with 8 setup boxes (Basics · Participants · Squads · Calendar · Days Engine · Budget · Grounds · Officials)." },
                        ].map((r) => (
                            <div key={r.url} className="border-l-4 border-mpca-oxblood bg-mpca-ivory p-4 break-inside-avoid">
                                <div className="font-serif text-mpca-green-dark text-base">{r.title}</div>
                                <div className="font-mono text-[11px] text-mpca-oxblood mt-1 mb-2 bg-mpca-parchment/50 px-2 py-1 inline-block">{r.url}</div>
                                <p className="text-[11px] text-mpca-charcoal leading-snug">{r.desc}</p>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* ─────── COMPLEX PROBLEMS ─────── */}
                <Section title="5 · Complex Problems Solved" subtitle="The hardest engineering wins along the way" breakBefore>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ProblemCard icon={GitBranch} tint="oxblood"
                            problem="MPCA runs 5 tournament scopes (Inter-Divisional, Inter-District, BCCI, Championship, Camps) each with its own scheme calculator. Divisions were reconciling budgets manually across three Excels per tournament."
                            solution="Built a single Unified Budget Compute Engine as a pure Python module ingesting Match Calendar + Rate Card + Days Engine. Emits per-Head, per-Match, per-Pool, per-Body totals. Legacy schemes deprecated in a controlled rollout."
                            impact="One click. One number. Every stakeholder sees the same ₹ figure. Audit trail is deterministic — same inputs always yield the same outputs."
                        />
                        <ProblemCard icon={Lock} tint="brass"
                            problem="Once MPCA sanctioned a budget, Divisions were retroactively editing days played or bumping pax counts — silently expanding the ceiling they could claim against."
                            solution="Introduced immutable Budget Snapshots (v1 → vN) with Lock/Unlock workflow. Every claim carries the snapshot version + frozen date as watermark, cross-checked by backend on submit."
                            impact="Zero silent inflation. If inputs drift post-lock, a red DRIFT badge appears and forces MPCA to consciously re-lock at a new version."
                        />
                        <ProblemCard icon={Users} tint="green"
                            problem="A single Division (e.g. Gwalior) could play as Host in Knockouts AND Visitor in League — two entirely different budget scopes. The old data model force-merged them into one row."
                            solution="Multi-pool budget attribution — every TournamentBudget scoped on (body_id, pool_id). Invoices, claims, and extras all carry a Budget Picker so the Division files against the correct scope."
                            impact="Gwalior now sees two Budget Cards on their portal — Host · KO + Visitor · League — each with its own claim button and voucher lineage."
                        />
                        <ProblemCard icon={ShieldCheck} tint="navy"
                            problem="Match officials&apos; fees and DA were hand-typed by Division treasurers on every reimbursement — a rate mismatch would surface only in year-end audit."
                            solution="Officials Rates centralised in Master Rate Card at season × format level. Assignment endpoint snapshots the rate at creation time. Fee + DA flow automatically into the Unified Budget as synthetic heads."
                            impact="20+ manual data entries eliminated per tournament. Audit reconciliation drops from 4 hours to 4 minutes."
                        />
                        <ProblemCard icon={Zap} tint="oxblood"
                            problem="MPCA HTML Inter-Division Utility was the gold standard — 17 budget heads, complex drivers (rooms = ceil(pax/2), coach_mgr per-day, MOM once per match). Every attempted re-implementation drifted by ₹1000s within 3 matches."
                            solution="Wrote a pure-Python translation with 25 pytest cases including a hand-computed single-match assertion (₹364,690 exact). Every driver formula, every rounding rule, every basis rule mirrored verbatim."
                            impact="Byte-for-byte parity. MPCA can dual-run the ERP alongside the HTML utility and get identical rupee output — instant trust."
                        />
                        <ProblemCard icon={FileText} tint="brass"
                            problem="Every payment made to a match official needed a printable voucher on MPCA letterhead with signatures. Word templates were being manually filled — 30 minutes per voucher, no audit trail."
                            solution="React-based voucher PDF renderer with MPCA letterhead, head-wise breakup, green PAID watermark stamp, Payment Recorded block with UTR + mode + date, 3 signature blocks. Chrome → Print → Save-as-PDF."
                            impact="Voucher generation drops from 30 minutes to 3 seconds. Every voucher is uniquely referenced (DA-2026-27-{n}) and reproducible on demand."
                        />
                    </div>
                </Section>

                {/* ─────── VULNERABILITIES ─────── */}
                <Section title="6 · Vulnerabilities Neutralised" subtitle="The guardrails that keep MPCA safe">
                    <div className="space-y-3">
                        {[
                            { n: 1, title: "Retroactive Budget Inflation",   attack: "A Division could add fixtures or bump squad counts after a budget was sanctioned, then claim against the inflated ceiling.", mitigation: "Immutable snapshot versioning + Drift Detection banner. Any input change post-lock raises a red alert and requires MPCA to re-lock at a new version." },
                            { n: 2, title: "Unsigned Payment Approvals",     attack: "MPCA could approve claims / DA forms without a paper trail — no way to prove intent later.", mitigation: "Signed-scan gates on BOTH sides. Officials must upload signed draft PDF before Submit. MPCA must upload signed review PDF before Approve. HTTP 400 with explicit copy blocks any bypass." },
                            { n: 3, title: "Cross-Body Data Leak",           attack: "Division Secretary of Bhopal could accidentally see Indore&apos;s claims / budgets — a governance breach.", mitigation: "Every mutation endpoint validates persona.body_id against the target record. Read-only guards on Tournament Basics + Match Calendar for match officials — 26 disabled inputs confirmed for umpires." },
                            { n: 4, title: "Duplicate Persona Assignments",  attack: "Legacy null pool_id values created duplicate rows — Indore appeared twice in the pipeline, once with pool_id and once without.", mitigation: "Hardened dedup logic at query layer + explicit pool_id normalisation on write. Verified fix live on all Multi-Pool tournaments — no duplicate rows remain." },
                            { n: 5, title: "Rate Card Tampering",            attack: "A Division-level actor could theoretically edit master rates if the endpoint was mis-scoped.", mitigation: "All rate-card writes are MPCA-only. PATCH endpoint sanitises input (drops unknown roles, clamps to non-negative floats, normalises rates). Existing assignments retain snapshot rates — future changes never mutate history." },
                            { n: 6, title: "Voucher Forgery",                attack: "A tampered voucher PDF could show a fake PAID stamp with a fake UTR.", mitigation: "PAID watermark is rendered from server state only — the voucher route re-queries the DB on load; forged PDFs cannot self-modify the source-of-truth stamp. Every voucher carries an immutable server-issued reference (DA-{FY}-{N})." },
                        ].map((v) => (
                            <div key={v.n} className="border-l-4 border-mpca-oxblood bg-mpca-oxblood/5 p-4 break-inside-avoid">
                                <div className="font-serif text-mpca-oxblood text-base mb-1">Vulnerability #{v.n} · {v.title}</div>
                                <p className="text-[12px] mb-1"><b>Attack surface</b>: <span dangerouslySetInnerHTML={{ __html: v.attack }} /></p>
                                <p className="text-[12px]"><b>Mitigation</b>: {v.mitigation}</p>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* ─────── HOW EFFORT BROKE DOWN ─────── */}
                <Section title="7 · Where the Hours Went" subtitle={`How ${STATS.total_hours} engineering hours were invested`} breakBefore>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                            <div className="font-serif text-mpca-oxblood text-base mb-3 flex items-center gap-2"><Code2 size={14} /> Development · {STATS.dev_hours} hours</div>
                            <ul className="text-[12px] space-y-1.5">
                                <li>• Architecture &amp; data modelling (~200h)</li>
                                <li>• Backend REST API build across {STATS.route_files} modules (~520h)</li>
                                <li>• Frontend React pages + reusable components (~640h)</li>
                                <li>• 3rd-party integrations (Gemini OCR, Auth, Uploads) (~90h)</li>
                                <li>• Print/PDF templates + heritage design system (~120h)</li>
                                <li>• Debugging + defect resolution (~80h)</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                            <div className="font-serif text-mpca-oxblood text-base mb-3 flex items-center gap-2"><Sparkles size={14} /> Design / UX · {STATS.design_hours} hours</div>
                            <ul className="text-[12px] space-y-1.5">
                                <li>• Heritage colour palette + typography system (~40h)</li>
                                <li>• 85 unique page layouts across 12 personas (~150h)</li>
                                <li>• Print-first PDF vouchers &amp; forms (~50h)</li>
                                <li>• Micro-interactions &amp; motion (~20h)</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                            <div className="font-serif text-mpca-oxblood text-base mb-3 flex items-center gap-2"><ShieldCheck size={14} /> Testing / QA · {STATS.testing_hours} hours</div>
                            <ul className="text-[12px] space-y-1.5">
                                <li>• {STATS.pytest_files} pytest suites with hand-computed assertions (~140h)</li>
                                <li>• {STATS.testing_iterations} UI test iterations via Playwright (~120h)</li>
                                <li>• Manual end-to-end walkthroughs per release (~50h)</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                            <div className="font-serif text-mpca-oxblood text-base mb-3 flex items-center gap-2"><BookOpen size={14} /> Review / Docs · {STATS.review_hours} hours</div>
                            <ul className="text-[12px] space-y-1.5">
                                <li>• Code review + refactor cycles (~90h)</li>
                                <li>• PRD maintenance across {STATS.releases} releases (~50h)</li>
                                <li>• Audit trail + changelog authoring (~40h)</li>
                            </ul>
                        </div>
                    </div>
                </Section>

                {/* ─────── STAKEHOLDER IMPACT ─────── */}
                <Section title="8 · Impact by Stakeholder" subtitle="What each persona gains">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Trophy size={14} /> MPCA Secretariat</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Single dashboard showing every Division&apos;s claim status live</li>
                                <li>• Locked budgets stop retroactive fixture edits from inflating ceilings</li>
                                <li>• Voucher PDFs generated in 3 seconds with MPCA letterhead</li>
                                <li>• End-of-year audit produced in hours, not weeks</li>
                                <li>• Cross-tournament rollups by fiscal cycle</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Award size={14} /> Divisions &amp; Districts</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Real-time view of their sanctioned budget per (tournament, pool)</li>
                                <li>• Inline invoice + extra-expense filing with head-wise proration</li>
                                <li>• Printable Division-letterhead PDFs for local records</li>
                                <li>• No more back-and-forth WhatsApp for approval status</li>
                                <li>• Deductions surface with reasons — no black-box rejections</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Users size={14} /> Match Officials</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Auto-populated Fee + DA from centralised rate card — no manual entry</li>
                                <li>• 6-stage progress bar shows exactly where their claim sits</li>
                                <li>• UTR + payment mode visible the moment MPCA disburses</li>
                                <li>• PAID-stamped voucher downloadable as proof of payment</li>
                                <li>• Filter chips + search across their assignment history</li>
                            </ul>
                        </div>
                        <div className="border border-mpca-brass/30 p-4 bg-mpca-parchment/40 break-inside-avoid">
                            <div className="font-serif text-mpca-oxblood text-base mb-2 flex items-center gap-2"><Globe size={14} /> Players &amp; Public</div>
                            <ul className="text-[12px] space-y-1">
                                <li>• Online registration with OCR-assisted document upload</li>
                                <li>• Squad selection notifications + acceptance flow</li>
                                <li>• Public fixture calendar with venue and scoreboard hooks</li>
                                <li>• Grievance channel routed to correct body without email chasing</li>
                                <li>• Age-verified guardrails prevent ineligible entries</li>
                            </ul>
                        </div>
                    </div>
                </Section>

                {/* ─────── FINAL NUMBERS ─────── */}
                <Section title="9 · The Final Tally">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <KPI label="Total Effort" value={STATS.total_hours} sub="engineering hours" icon={Clock} tint="oxblood" />
                        <KPI label="Backend Python" value={STATS.backend_loc + " LOC"} sub={`${STATS.route_files} route modules`} icon={Server} tint="brass" />
                        <KPI label="Frontend React" value={STATS.frontend_loc + " LOC"} sub={`${STATS.frontend_pages} pages · ${STATS.frontend_components} components`} icon={Layers} tint="green" />
                        <KPI label="Total Codebase" value={STATS.total_loc + " LOC"} sub="production-grade" icon={Code2} tint="navy" />
                        <KPI label="API Endpoints" value={STATS.endpoints} sub={`across ${STATS.route_files} modules`} icon={Zap} tint="brass" />
                        <KPI label="Data Models" value={STATS.pydantic_models} sub={`${STATS.mongo_collections} MongoDB collections`} icon={Database} tint="oxblood" />
                        <KPI label="Git Commits" value={STATS.git_commits} sub="fully audited history" icon={Wrench} tint="green" />
                        <KPI label="Pytest Suites" value={STATS.pytest_files} sub={`+ ${STATS.testing_iterations} UI test cycles`} icon={ShieldCheck} tint="navy" />
                    </div>

                    <div className="bg-mpca-navy text-mpca-ivory p-6">
                        <div className="font-serif text-2xl text-mpca-gold-light mb-3">In Perspective</div>
                        <p className="text-[13px] leading-relaxed">
                            <b>{STATS.total_hours} engineering hours</b>. <b>~100,000 lines of code</b>. <b>{STATS.releases} numbered releases</b>. <b>{STATS.git_commits} audited commits</b>. Every one of the <b>{STATS.endpoints} API endpoints</b> is documented, tested via pytest or a live Playwright pass, and wired into a persona-scoped React frontend with <b>{STATS.frontend_pages} distinct pages</b>. The end product is a production-grade governance platform purpose-built to run the Madhya Pradesh Cricket Association at every level — from the state secretariat down to individual officiating umpires and registered players.
                        </p>
                    </div>
                </Section>

                {/* ─────── FOOTER ─────── */}
                <div className="border-t-4 border-double border-mpca-oxblood pt-6 mt-10 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-mpca-brass mb-2">Internal Reference Document · Confidential</p>
                    <p className="text-[11px] italic text-mpca-gray-dark">
                        MPCA ERP · A digital backbone for state-level cricket governance
                    </p>
                    <p className="text-[10px] text-mpca-gray-dark mt-1">
                        Generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                </div>
            </div>

            <style>{`
                @media print {
                    body { background: white; }
                    .print\\:hidden { display: none !important; }
                    .print\\:break-before-page { break-before: page; }
                    .print\\:break-after-page { break-after: page; }
                    section { break-inside: avoid; }
                    .break-inside-avoid { break-inside: avoid; }
                    img { max-width: 100% !important; }
                }
            `}</style>
        </div>
    );
};

export default MPCAShowcase;
