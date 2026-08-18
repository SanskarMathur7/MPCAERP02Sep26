import { useState } from "react";
import {
    LayoutDashboard, Network, Boxes, FileText, GitBranch, Database, Server,
    Users, Trophy, IndianRupee, Shield, ChevronRight, Layers, Zap, Code2, Info,
    Target, Workflow, ClipboardCheck, Lock, Eye, Calendar as CalendarIcon,
    Building2, GraduationCap, Award, MailCheck, Repeat, BookOpen, Gavel,
    ScrollText, CheckCircle2, AlertTriangle, ArrowRight,
} from "lucide-react";

/**
 * MPCA ERP · Phase 1 Showcase (stakeholder-ready)
 * ─────────────────────────────────────────────────
 * A self-explanatory walkthrough document.  Every tab reads end-to-end so a
 * stakeholder can present from this document alone — no external narration
 * required.
 * Tabs: Overview · HLD · LLD · PRD · Modules
 */

// ─────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// TAB 1 · Overview
// ─────────────────────────────────────────────────────────────
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
            The MPCA administers cricket across the entire state of Madhya Pradesh — 8 divisions, 55+ districts, hundreds of clubs and schools, several thousand registered players, dozens of match officials, and a season that spans multiple tournament formats. Historically, that operation ran on spreadsheets, e-mail attachments, physical letters and word-of-mouth approvals. Every closure of a tournament required weeks of manual reconciliation. Every scheme change forced a fresh round of stakeholder training. Every player registration lived in a paper register.
        </P>
        <P>
            The MPCA ERP replaces that fragmented workflow with a <b>single, wiring-driven governance platform</b> that:
        </P>
        <ul className="list-disc list-inside text-[13px] text-mpca-charcoal space-y-1 mb-4">
            <li>Encodes the MPCA scheme document as machine-readable rules, not tribal knowledge.</li>
            <li>Enforces persona-scoped access — a District Secretary can never accidentally act on state-level approvals, and vice-versa.</li>
            <li>Produces printable, signable PDF artifacts at every workflow gate — signed squad sheets, signed grant approvals, signed closure certificates.</li>
            <li>Runs on a modern cloud-native stack so it can serve internal ops <i>and</i> the public communication site from the same platform.</li>
        </ul>

        <H2>Phase 1 in numbers</H2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KPI icon={Trophy}      label="Tournament Types"       value="8"       sub="BCCI · Inter-Div · District · School · Club · 3 camps" />
            <KPI icon={Boxes}       label="Wiring Steps / Type"    value="10"      sub="Creation → Closure · one config matrix" />
            <KPI icon={Users}       label="Persona Roles"          value="12+"     sub="MPCA · Division · District · Club · School · Camps" />
            <KPI icon={IndianRupee} label="Finance Schemes"        value="9"       sub="Scheme 1-A through 9-BCCI with rate cards" />
            <KPI icon={ScrollText}  label="PDF Artifact Types"     value="14+"     sub="Squad · Grant · Invoice · Closure · Certificates" />
            <KPI icon={Workflow}    label="Backend Route Modules"  value="40+"     sub="Domain-scoped FastAPI routers" />
            <KPI icon={ClipboardCheck} label="Automated Pytests"    value="74"     sub="Wiring · Grants · Closure · Persona guards" />
            <KPI icon={Shield}      label="Wiring Cells"           value="80"      sub="8 types × 10 steps · single source of truth" />
        </div>

        <H2>What Phase 1 delivers</H2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
                ["Tournament Wiring Governance", "A single config matrix (8 types × 10 steps) drives owner / approver / mode / visibility for every downstream module. Zero hardcoded role checks. Change a cell → change the workflow across the whole platform."],
                ["Unified Budget & Rate Card", "Master Rate Card by tournament-type × format × head. Division drafts privately, MPCA locks with a snapshot, on-submit visibility keeps drafts hidden from state view until submission."],
                ["Grant Claims Lifecycle", "Draft → Signed submission → MPCA review → Signed approval → Payment Made. reportlab-generated summary PDFs on both sides, threaded discussion between MPCA and division, division-wise MPCA filter."],
                ["Rich Closure Certificate", "14-section multi-page PDF with pool tables, calendar, invoices, deductions, financial summary and pypdf-merged signed appendices. Every tournament ends with an archival-quality document."],
                ["Match Officials & DA", "MPCA-owned assignment and DA payments. Wiring guards keep the Division out of a workflow the MPCA runs end-to-end. Rate cards driven by scheme type."],
                ["Public Communication", "Marketing showcase, seed data explorer, persona-driven sign-in — the same platform serves internal ops and external outreach without duplicating the codebase."],
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
                    <li>Draft budget numbers were e-mailed to MPCA and became state-visible before the division was ready.</li>
                    <li>Grant claims travelled via signed paper letters — no audit trail, no chronology.</li>
                    <li>Squad sheets were photocopies with no linkage to the player-registration master.</li>
                    <li>Tournament closure was a weeks-long manual reconciliation across dozens of Excel files.</li>
                    <li>Match-official DA reimbursements had no standardised rate card enforcement.</li>
                </ul>
            </div>
            <div className="border border-mpca-green-dark/40 bg-mpca-green-dark/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-mpca-green-dark" />
                    <div className="font-serif text-mpca-green-dark text-base">After — the ERP promise</div>
                </div>
                <ul className="text-[12px] text-mpca-charcoal space-y-1.5 list-disc list-inside">
                    <li>Rate card updates propagate to every budget the moment they are saved.</li>
                    <li>On-Submit visibility keeps division drafts private until the division explicitly submits.</li>
                    <li>Grant claims flow through a signed-PDF pipeline with a threaded discussion channel.</li>
                    <li>Squads either link to the player master (Register_Linked) or upload a signed PDF (Manual_PDF) — always audit-linked.</li>
                    <li>Tournament closure produces a single archival PDF with financials, calendar, officials, and appendices merged in.</li>
                    <li>Every rupee is anchored to a scheme + rate card + wiring cell — no ad-hoc payments.</li>
                </ul>
            </div>
        </div>

        <Callout tone="info" title="How to read this document">
            The remaining tabs walk you through the platform in progressively more detail:
            <span className="block mt-2">
                <b>HLD</b> shows the architecture at 30,000 ft — pieces and how they connect.
                <b> LLD</b> zooms into the wiring engine — the mechanism that makes governance uniform.
                <b> PRD</b> lists the product requirements, personas and success metrics.
                <b> Modules</b> catalogues everything shipped, module-by-module, with wiring binding and artifacts.
            </span>
        </Callout>
    </div>
);

// ─────────────────────────────────────────────────────────────
// TAB 2 · HLD (High-Level Design)
// ─────────────────────────────────────────────────────────────
const HLDTab = () => (
    <div>
        <H2>System Architecture</H2>
        <P>
            The MPCA ERP is a three-tier cloud-native application. The <b>React SPA</b> is the presentation layer — persona-scoped pages, sticky sidebar navigation, and wiring-aware panels. The <b>FastAPI backend</b> is the governance layer — 40+ domain routers, every mutation endpoint gated by <code className="bg-mpca-parchment/60 px-1 text-[11px]">assert_wiring_owner()</code>. The <b>MongoDB layer</b> holds domain-scoped collections, immutable audit logs, and wiring snapshots per season. All three tiers are stitched together by a Kubernetes ingress that routes <code className="bg-mpca-parchment/60 px-1 text-[11px]">/api/*</code> to the backend and everything else to the frontend.
        </P>

        <div className="border-2 border-mpca-brass/50 bg-mpca-parchment/30 p-6 my-6 overflow-x-auto">
            <svg viewBox="0 0 900 520" className="w-full min-w-[880px]" data-testid="hld-diagram" aria-label="HLD architecture diagram">
                <defs>
                    <marker id="arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                        <path d="M0,0 L10,4 L0,8 z" fill="#7a1e2b" />
                    </marker>
                </defs>
                <text x="450" y="20" textAnchor="middle" className="font-serif" fontSize="14" fill="#3b5540">MPCA ERP · High-Level Architecture</text>

                {/* Row 1 — Personas */}
                <g>
                    {[
                        [40,  "MPCA Sec / Pres"],
                        [180, "Division Sec"],
                        [320, "District Sec"],
                        [460, "Club / School"],
                        [600, "Match Official"],
                        [740, "Public"],
                    ].map(([x, label]) => (
                        <g key={label}>
                            <rect x={x} y="50" width="120" height="40" fill="#f4ede0" stroke="#7a5c2e" />
                            <text x={x + 60} y="75" textAnchor="middle" fontSize="11" fill="#2a1810">{label}</text>
                        </g>
                    ))}
                </g>

                {/* Ingress */}
                <rect x="240" y="130" width="420" height="42" fill="#3b5540" />
                <text x="450" y="156" textAnchor="middle" fontSize="12" fill="#f4ede0" fontWeight="bold">Kubernetes Ingress · REACT_APP_BACKEND_URL</text>

                {/* SPA */}
                <rect x="80" y="200" width="340" height="70" fill="#fff8ea" stroke="#7a1e2b" strokeWidth="1.5" />
                <text x="250" y="225" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#7a1e2b">React SPA (port 3000)</text>
                <text x="250" y="245" textAnchor="middle" fontSize="10" fill="#2a1810">Pages · Panels · useWiring hook · Progression Ribbon</text>
                <text x="250" y="260" textAnchor="middle" fontSize="10" fill="#2a1810">Persona chip login · Tailwind heritage palette</text>

                {/* API */}
                <rect x="480" y="200" width="340" height="70" fill="#fff8ea" stroke="#7a1e2b" strokeWidth="1.5" />
                <text x="650" y="225" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#7a1e2b">FastAPI Backend (port 8001)</text>
                <text x="650" y="245" textAnchor="middle" fontSize="10" fill="#2a1810">40+ route modules · wiring_guard.assert_wiring_owner()</text>
                <text x="650" y="260" textAnchor="middle" fontSize="10" fill="#2a1810">reportlab PDFs · Gemini AI · SMTP · pypdf merge</text>

                {/* Wiring Config box */}
                <rect x="330" y="300" width="240" height="55" fill="#7a5c2e" />
                <text x="450" y="323" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#f4ede0">TOURNAMENT WIRING CONFIG</text>
                <text x="450" y="342" textAnchor="middle" fontSize="10" fill="#f4ede0">Single source of truth · 8 types × 10 steps</text>

                {/* Mongo */}
                <rect x="80" y="390" width="340" height="80" fill="#e8ddc6" stroke="#3b5540" strokeWidth="1.5" />
                <text x="250" y="415" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#3b5540">MongoDB</text>
                <text x="250" y="435" textAnchor="middle" fontSize="10" fill="#2a1810">tournaments · squads · camps · budgets · invoices</text>
                <text x="250" y="450" textAnchor="middle" fontSize="10" fill="#2a1810">grant_claims · players · bodies · officials · discussions</text>
                <text x="250" y="465" textAnchor="middle" fontSize="10" fill="#2a1810">tournament_wiring · notifications · audit_logs</text>

                {/* External Services */}
                <rect x="480" y="390" width="340" height="80" fill="#e8ddc6" stroke="#3b5540" strokeWidth="1.5" />
                <text x="650" y="415" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#3b5540">External Services</text>
                <text x="650" y="435" textAnchor="middle" fontSize="10" fill="#2a1810">Emergent LLM (Gemini · Claude) · SMTP · S3 uploads</text>
                <text x="650" y="450" textAnchor="middle" fontSize="10" fill="#2a1810">Persona-chip auth (JWT) · Public marketing site</text>

                {/* Arrows */}
                <line x1="450" y1="90" x2="450" y2="128" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrow)" />
                <line x1="380" y1="172" x2="250" y2="198" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrow)" />
                <line x1="520" y1="172" x2="650" y2="198" stroke="#7a1e2b" strokeWidth="1.5" markerEnd="url(#arrow)" />
                <line x1="250" y1="270" x2="250" y2="388" stroke="#3b5540" strokeWidth="1" markerEnd="url(#arrow)" />
                <line x1="650" y1="270" x2="650" y2="388" stroke="#3b5540" strokeWidth="1" markerEnd="url(#arrow)" />
                <line x1="650" y1="270" x2="510" y2="298" stroke="#7a5c2e" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow)" />
                <line x1="250" y1="270" x2="390" y2="298" stroke="#7a5c2e" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow)" />
                <text x="450" y="380" textAnchor="middle" fontSize="9" fill="#7a5c2e" fontStyle="italic">wiring read on every mutation</text>
            </svg>
        </div>

        <H3>How to read this diagram</H3>
        <P>
            The <b>top row</b> is every persona that touches the platform. All of them come in through a single ingress that terminates TLS, applies rate-limits, and demultiplexes the traffic into either the SPA (browser HTML/JS/CSS) or the API (JSON over HTTPS).
            The <b>middle band</b> is the runtime — SPA and API are independent processes that only talk over HTTP. The API alone talks to MongoDB and external services; the SPA never touches the database directly.
            The <b>lower band</b> shows the persistent + external surface — MongoDB is our source of state, external services (LLM, SMTP, S3) are called from the API on behalf of authenticated personas.
            The <b>golden Wiring Config box</b> in the middle is deliberately drawn as a hub: both tiers read from it constantly. It is the single artefact that ties everything together.
        </P>

        <H2>Request lifecycle — a walkthrough</H2>
        <P>
            Consider a Division Secretary submitting a Unified Budget for approval. What happens end-to-end?
        </P>
        <ol className="list-decimal list-inside text-[13px] text-mpca-charcoal space-y-2 mb-4">
            <li><b>Browser</b> → the SPA collects the budget rows and hits <code className="bg-mpca-parchment/60 px-1 text-[11px]">POST /api/tournaments/&#123;tid&#125;/budget/submit</code> with persona headers (<code>X-Body-Type</code>, <code>X-Body-Code</code>, <code>X-Persona-Name</code>).</li>
            <li><b>Ingress</b> forwards the call to the FastAPI process. TLS is terminated here, hostname (<code>REACT_APP_BACKEND_URL</code>) is stripped, path becomes <code>/api/…</code>.</li>
            <li><b>FastAPI</b> resolves the endpoint. The very first line calls <code>assert_wiring_owner(tid, &quot;unified_budget&quot;, x_body_type, x_body_code)</code>. This reads the wiring cell for <i>this tournament type</i> at the <i>budget</i> step and confirms that <b>Division</b> is the configured owner. If not, a 403 is raised immediately.</li>
            <li><b>Mutation</b> then proceeds. The budget document is written to MongoDB. <code>stamp_actor()</code> records the actual persona in <code>submitted_by</code> — no default &quot;MPCA&quot; fallback.</li>
            <li><b>Snapshot</b> — a full copy of the budget rows + rate card is frozen into <code>budget_snapshots</code>. Any future rate card change will not silently mutate this locked artefact.</li>
            <li><b>Notification</b> — MPCA Secretary + President receive an in-app notification (and, in production, an SMTP email) that a division budget awaits their review.</li>
            <li><b>SPA</b> receives the response and re-reads wiring via <code>useWiring</code> to flip the &quot;Submit&quot; button into &quot;Awaiting MPCA Approval&quot;. No page reload; the panel is now in a different governance state.</li>
        </ol>

        <H2>Component responsibilities</H2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
                [Server, "FastAPI Backend", "40+ route modules organised by domain (tournaments, budgets, grants, officials, players). Every mutation endpoint calls assert_wiring_owner(step, x_body_type) — persona is stamped, not hardcoded."],
                [LayoutDashboard, "React SPA", "Persona-scoped pages driven by a single AppLayout sidebar. useWiring hook caches wiring-status per tournament and shares it across all panels within a page."],
                [Database, "MongoDB", "Domain-scoped collections. Immutable audit_logs and tournament_wiring_snapshots for compliance. ObjectIds always stripped via BaseDocument."],
                [Shield, "Wiring Guard", "core/wiring_guard.py — resolves the correct cell for (tournament_type, step) and raises 403 unless the persona's body_type matches the owner set. One helper, applied uniformly."],
                [Network, "Ingress Router", "K8s routes /api/* → 8001, everything else → 3000. Frontend uses REACT_APP_BACKEND_URL exclusively; backend uses MONGO_URL from .env. Fail-fast on missing config."],
                [Zap, "AI & PDF pipeline", "Gemini via Emergent LLM key for doc OCR + claim review. reportlab for closure + grant PDFs. pypdf merges signed appendices into a single archival document."],
            ].map(([Icon, t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-4">
                    <div className="flex items-center gap-2 mb-2"><Icon size={14} className="text-mpca-oxblood" /><span className="font-serif text-mpca-oxblood text-sm">{t}</span></div>
                    <div className="text-[12px] text-mpca-charcoal leading-relaxed">{b}</div>
                </div>
            ))}
        </div>

        <H2>Deployment topology</H2>
        <P>
            The platform runs on a Kubernetes cluster with supervisor-managed processes inside each container. Hot-reload is enabled for both tiers during development. In production, a rolling deploy replaces containers one at a time with zero downtime. MongoDB is a managed cluster with authenticated <code>MONGO_URL</code>. Static assets are served from the SPA container behind the same ingress.
        </P>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[
                ["Frontend container", "React SPA · yarn build · served on port 3000 · REACT_APP_BACKEND_URL baked at build time."],
                ["Backend container",  "FastAPI + uvicorn on port 8001 · supervisor-managed · MONGO_URL from env · reportlab, pypdf, emergentintegrations installed."],
                ["MongoDB cluster",    "Managed MongoDB · role-based auth · DB_NAME set via env · daily snapshots recommended."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div className="text-[11px] text-mpca-charcoal">{b}</div>
                </div>
            ))}
        </div>

        <H2>Security &amp; compliance surface</H2>
        <ul className="list-disc list-inside text-[13px] text-mpca-charcoal space-y-1.5 mb-4">
            <li><b>Persona authentication</b> — JWT-based sign-in with persona chips. Every request carries the persona identity in headers, verified server-side.</li>
            <li><b>Wiring guard</b> — no endpoint mutates data without a wiring-owner check. Cannot be bypassed by a client-side edit.</li>
            <li><b>On-Submit visibility</b> — Division draft numbers are redacted from MPCA views until the division explicitly submits. Enforced at the API, not the UI.</li>
            <li><b>Immutable audit_logs</b> — every mutation writes a log entry with actor, body, timestamp, before/after payload.</li>
            <li><b>Snapshots on approval</b> — Budget + wiring snapshots freeze at approval time so downstream reports are reproducible.</li>
            <li><b>Signed artefacts</b> — every governance gate (squad, grant submit, grant approve, closure) yields a printable, signable PDF stored alongside the record.</li>
        </ul>
    </div>
);

// ─────────────────────────────────────────────────────────────
// TAB 3 · LLD (Low-Level Design)
// ─────────────────────────────────────────────────────────────
const stepDetails = [
    { n: 1,  key: "creation",         label: "Creation",         owner: "MPCA / Division", mode: "Form",           artifact: "Tournament record", desc: "Tournament basics (name, format, season, host body) captured. Wiring resolves the type-code and freezes the wiring snapshot for this instance." },
    { n: 2,  key: "pool",             label: "Pool",             owner: "MPCA / Host",     mode: "Register_Linked", artifact: "Participating bodies list", desc: "Participating bodies are chosen. Inter-Division/Inter-District pools are register-linked; Manual types allow ad-hoc adds." },
    { n: 3,  key: "officials",        label: "Officials",        owner: "MPCA",            mode: "Register_Linked", artifact: "Assignment sheet", desc: "Match officials are assigned per match. MPCA is the sole owner across every tournament type — Division cannot appoint officials." },
    { n: 4,  key: "squad",            label: "Squad",            owner: "Body-in-scope",   mode: "Register_Linked · Manual_PDF", artifact: "Squad sheet PDF", desc: "Register_Linked pulls from the player master; Manual_PDF accepts a signed team-list upload. Mode is wired per tournament type." },
    { n: 5,  key: "squad_approval",   label: "Squad Approval",   owner: "MPCA · flag",     mode: "M / O / NA",     artifact: "Approval record", desc: "Wiring flag decides whether MPCA approval is Mandatory / Optional / Not-Applicable. Manual_PDF squads mostly skip MPCA approval." },
    { n: 6,  key: "match_calendar",   label: "Calendar",         owner: "MPCA / Host",     mode: "Form",           artifact: "Match schedule", desc: "Match dates, venues and officials mapping are locked in. Blocks_next until every match has a venue." },
    { n: 7,  key: "unified_budget",   label: "Budget",           owner: "Division / Host", mode: "Rate-card driven", artifact: "Budget PDF · Snapshot", desc: "Rate card × format × head produces the draft budget. Division submits, MPCA locks, snapshot freezes the numbers." },
    { n: 8,  key: "finance_console",  label: "Finance Console",  owner: "MPCA + Division", mode: "Claims & Payments", artifact: "Invoices · DA forms", desc: "Grant claims, invoice submissions, DA forms and payment records live here. Wiring flag decides which persona can generate what." },
    { n: 9,  key: "tournament_closure", label: "Closure",        owner: "MPCA",            mode: "Signed PDF · Close", artifact: "Closure certificate", desc: "MPCA compiles the closure PDF (14 sections) with pypdf-merged appendices, marks the tournament closed. Immutable after this point." },
    { n: 10, key: "mpca_visibility",  label: "MPCA Visibility",  owner: "Wiring flag",     mode: "Realtime · On_Submit", artifact: "Redaction rules", desc: "Cross-cutting cell — decides whether MPCA sees Division drafts in real-time or only after On_Submit. Enforced server-side." },
];

const LLDTab = () => (
    <div>
        <H2>Tournament Wiring · 10-step lifecycle</H2>
        <P>
            Every one of the 8 tournament types moves through the same 10 wiring steps. Each cell in the (type × step) matrix carries <b>flag</b> (M/O/NA), <b>owner</b>, <b>approver</b>, <b>mode</b>, <b>visibility</b>, <b>blocks_next</b> and <b>sla_days</b>. The wiring config is the single source of truth — every downstream module reads it, never hardcodes.
        </P>

        <div className="border-2 border-mpca-brass/50 bg-mpca-parchment/30 p-6 my-6 overflow-x-auto">
            <svg viewBox="0 0 1000 260" className="w-full min-w-[960px]" data-testid="lld-flow" aria-label="LLD wiring flow">
                <defs>
                    <marker id="arrow2" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                        <path d="M0,0 L10,4 L0,8 z" fill="#3b5540" />
                    </marker>
                </defs>
                <text x="500" y="20" textAnchor="middle" fontSize="14" fontFamily="serif" fill="#3b5540">10-Step Tournament Wiring Flow</text>
                {stepDetails.map((s, i) => {
                    const x = 20 + (i * 96);
                    return (
                        <g key={s.key}>
                            <rect x={x} y="60" width="86" height="72" fill={i < 5 ? "#fff8ea" : (i < 7 ? "#e8ddc6" : "#f4ede0")} stroke="#7a1e2b" strokeWidth="1.2" />
                            <text x={x + 43} y="78" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#7a1e2b">{s.n}</text>
                            <text x={x + 43} y="100" textAnchor="middle" fontSize="9" fill="#2a1810">{s.label}</text>
                            <text x={x + 43} y="118" textAnchor="middle" fontSize="7.5" fill="#7a5c2e">{s.owner}</text>
                            {i < 9 && <line x1={x + 86} y1="96" x2={x + 96} y2="96" stroke="#3b5540" strokeWidth="1.5" markerEnd="url(#arrow2)" />}
                        </g>
                    );
                })}
                <text x="140" y="160" fontSize="9" fill="#7a5c2e" fontStyle="italic">Pre-Tournament</text>
                <text x="600" y="160" fontSize="9" fill="#7a5c2e" fontStyle="italic">In-Tournament</text>
                <text x="860" y="160" fontSize="9" fill="#7a5c2e" fontStyle="italic">Post-Tournament</text>

                <rect x="20" y="185" width="960" height="60" fill="#f4ede0" stroke="#7a5c2e" />
                <text x="500" y="205" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#3b5540">Every step cell exposes:</text>
                <text x="500" y="225" textAnchor="middle" fontSize="10" fill="#2a1810">flag (M · O · NA) · owner (MPCA · Division · District · Auto) · approver · mode (Register_Linked · Manual_PDF · Auto_Compute · NA) · visibility (Realtime · On_Submit) · blocks_next · sla_days</text>
                <text x="500" y="240" textAnchor="middle" fontSize="9" fill="#7a5c2e" fontStyle="italic">assert_wiring_owner() is invoked before every mutation — 403 if persona body_type ∉ owner set</text>
            </svg>
        </div>

        <H2>What each step does</H2>
        <div className="border border-mpca-brass/30 overflow-x-auto">
            <table className="w-full text-[12px] text-mpca-charcoal">
                <thead className="bg-mpca-parchment/70 text-[10px] uppercase tracking-widest text-mpca-brass">
                    <tr>
                        <th className="text-left p-2 border-b border-mpca-brass/30 w-10">#</th>
                        <th className="text-left p-2 border-b border-mpca-brass/30">Step</th>
                        <th className="text-left p-2 border-b border-mpca-brass/30">Owner</th>
                        <th className="text-left p-2 border-b border-mpca-brass/30">Mode</th>
                        <th className="text-left p-2 border-b border-mpca-brass/30">Artifact</th>
                        <th className="text-left p-2 border-b border-mpca-brass/30">What happens</th>
                    </tr>
                </thead>
                <tbody>
                    {stepDetails.map(s => (
                        <tr key={s.key} className="border-b border-mpca-brass/15 align-top">
                            <td className="p-2 font-mono text-mpca-oxblood">{s.n}</td>
                            <td className="p-2 font-serif text-mpca-oxblood whitespace-nowrap">{s.label}</td>
                            <td className="p-2">{s.owner}</td>
                            <td className="p-2 italic text-[11px]">{s.mode}</td>
                            <td className="p-2 text-[11px]">{s.artifact}</td>
                            <td className="p-2">{s.desc}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <H2>Anatomy of a wiring cell</H2>
        <P>
            A wiring cell is the intersection of one <b>tournament type</b> (row) and one <b>step</b> (column). Every cell carries the same seven fields — that uniformity is what makes the platform predictable.
        </P>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
                ["flag",         "M · O · NA", "Is this step Mandatory, Optional, or Not-Applicable for this tournament type?"],
                ["owner",        "MPCA · Division · District · Auto", "Which body is allowed to perform the mutation for this step?"],
                ["approver",     "MPCA · Division · none", "Which body approves the output of this step, if any?"],
                ["mode",         "Register_Linked · Manual_PDF · Auto_Compute · Form · NA", "How the data is captured — from the master register, a signed upload, an automatic computation, or a form."],
                ["visibility",   "Realtime · On_Submit", "Do other bodies see drafts as they happen, or only after submit?"],
                ["blocks_next",  "true / false", "Does this step gate progression? If true, subsequent steps stay locked until this one is complete."],
                ["sla_days",     "integer", "How many days the owner has to complete this step. Overshoot fires an escalation notification."],
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

        <H2>Example — Inter-Division tournament</H2>
        <P>Reading three rows of the wiring matrix in plain English:</P>
        <div className="border border-mpca-brass/30 overflow-x-auto mb-4">
            <table className="w-full text-[12px] text-mpca-charcoal">
                <thead className="bg-mpca-parchment/70 text-[10px] uppercase tracking-widest text-mpca-brass">
                    <tr>
                        <th className="text-left p-2">Step</th><th className="text-left p-2">flag</th><th className="text-left p-2">owner</th><th className="text-left p-2">mode</th><th className="text-left p-2">visibility</th><th className="text-left p-2">In plain English</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-t border-mpca-brass/15"><td className="p-2 font-serif text-mpca-oxblood">Squad</td><td className="p-2">M</td><td className="p-2">Division</td><td className="p-2 italic">Register_Linked</td><td className="p-2">Realtime</td><td className="p-2">Divisions must pick their squad from the player register; MPCA sees the picks as they happen.</td></tr>
                    <tr className="border-t border-mpca-brass/15"><td className="p-2 font-serif text-mpca-oxblood">Budget</td><td className="p-2">M</td><td className="p-2">Division</td><td className="p-2 italic">Rate-card</td><td className="p-2">On_Submit</td><td className="p-2">Division drafts privately; MPCA only sees the numbers once the division submits.</td></tr>
                    <tr className="border-t border-mpca-brass/15"><td className="p-2 font-serif text-mpca-oxblood">Closure</td><td className="p-2">M</td><td className="p-2">MPCA</td><td className="p-2 italic">Signed PDF</td><td className="p-2">Realtime</td><td className="p-2">Only MPCA can close; the closure PDF is generated by the system, signed by MPCA officials.</td></tr>
                </tbody>
            </table>
        </div>

        <H2>Guard invocation contract (backend)</H2>
        <div className="border border-mpca-brass/30 bg-mpca-charcoal/95 text-mpca-gold-light p-4 font-mono text-[11px] whitespace-pre overflow-x-auto">{`# Every mutation endpoint follows this pattern.
async def endpoint(tid, payload, x_body_type=Header(...), x_body_code=Header(...)):
    await assert_wiring_owner(
        tid, "unified_budget",           # step key
        x_body_type, x_body_code,
        action_label="budget lock",
    )
    # ...proceed with mutation, stamp persona via stamp_actor()
    doc.locked_by = stamp_actor(x_persona_name, x_body_code, x_body_type)`}</div>

        <H2>Frontend visibility contract (SPA)</H2>
        <div className="border border-mpca-brass/30 bg-mpca-charcoal/95 text-mpca-gold-light p-4 font-mono text-[11px] whitespace-pre overflow-x-auto">{`// Every panel that renders governance affordances reads from useWiring.
const step   = useWiringStep(tournamentId, "finance_console");
const canAct = useWiringOwnerMatch(tournamentId, "finance_console", persona);

if (canAct) { <GenerateButton /> }
if (step?.visibility === "On_Submit") { <RedactedRow /> }`}</div>

        <Callout tone="success" title="Why this matters">
            Because every governance rule lives in one config, changing a scheme becomes a config edit — not a code change. When MPCA revises a rate card, or delegates a step from MPCA to Division, or flips visibility from Realtime to On_Submit, the same endpoint code keeps running and the entire SPA re-renders with the new behaviour on the next fetch.
        </Callout>
    </div>
);

// ─────────────────────────────────────────────────────────────
// TAB 4 · PRD (Product Requirements)
// ─────────────────────────────────────────────────────────────
const PRDTab = () => (
    <div>
        <H2>Product Requirements · Phase 1</H2>
        <P>
            The MPCA ERP is a multi-tenant governance platform for the state cricket association. It must enforce the MPCA scheme document in code, keep every stakeholder (MPCA, Division, District, Club, School, camps, match officials) on their exact scope, and produce printable signable artifacts at every workflow gate.
        </P>

        <H3>Business objectives</H3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-mpca-charcoal mb-4">
            {[
                ["Governance in code",           "Move MPCA scheme rules from tribal knowledge and static PDFs into machine-readable wiring config."],
                ["Time-to-close a tournament",   "Cut end-to-end closure time from weeks (Excel reconciliation) to hours (auto-compiled 14-section PDF)."],
                ["Auditability",                 "Every mutation writes an immutable audit log with actor, body, before/after payload."],
                ["Financial hygiene",            "Every rupee traceable to a scheme + rate card + wiring cell + approver — no ad-hoc payments."],
                ["Stakeholder self-service",     "Divisions manage their own tournaments and camps without waiting on MPCA back-office turnaround."],
                ["Public communication",         "Same platform surfaces marketing + seed data for external stakeholders — no duplicate site to maintain."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div>{b}</div>
                </div>
            ))}
        </div>

        <H3>User personas &amp; day-in-life</H3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
                { icon: Award, title: "MPCA Secretary / President", body: "State-level authority. Reviews Division-submitted budgets, approves squads flagged Mandatory, closes tournaments with signed PDFs, oversees grant approvals, watches division-wise finance dashboards." },
                { icon: Building2, title: "Division Secretary", body: "Hosts Inter-District / Inter-School / Inter-Club tournaments and camps within the division. Drafts budgets privately, submits claims to MPCA, uploads signed team lists, manages match calendars." },
                { icon: Gavel, title: "District Secretary", body: "Participates in Inter-District tournaments. Owns the district camp fleet. Registers players from the district into the master register." },
                { icon: GraduationCap, title: "Club / School Secretary", body: "Participates in respective tournaments. Uploads signed squad PDFs. Receives grants and files signed acknowledgements." },
                { icon: Users, title: "Match Official", body: "Assigned by MPCA to specific matches. Submits DA reimbursement claims post-match against the scheme rate card." },
                { icon: BookOpen, title: "Public / Prospect", body: "Reads the marketing showcase, browses seed data, follows tournament calendars — same platform, no separate marketing site to maintain." },
            ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Icon size={14} className="text-mpca-oxblood" />
                        <span className="font-serif text-mpca-oxblood text-sm">{title}</span>
                    </div>
                    <div className="text-[11.5px] text-mpca-charcoal">{body}</div>
                </div>
            ))}
        </div>

        <H3>Non-negotiable requirements</H3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-mpca-charcoal mb-4">
            {[
                ["Wiring is source of truth", "No hardcoded isMPCA / isBCCI checks in any endpoint. Every guard reads from tournament_wiring."],
                ["Persona attribution",      "Every mutation stamps the actual persona + body — no default 'MPCA' fallback in locked_by / issued_by / submitted_by."],
                ["Signable artifacts at every gate", "Squad submission, grant submission, MPCA approval, closure certificate all yield reportlab PDFs with signature blocks."],
                ["On-Submit visibility",     "Division draft numbers stay private from MPCA state view until claim is submitted; wiring flag controls this per type."],
                ["Idempotent auto-heal",     "Startup migrations flip legacy records that pre-date wiring rules — every boot, safe to re-run."],
                ["Zero regression",          "Every new sprint keeps all existing pytests green — currently 74/74."],
                ["Public / private surface", "Public marketing site and internal ERP served from same platform, isolated by persona-chip auth."],
                ["Printable everywhere",     "Every list view and every artifact has a print/PDF route — the association still produces physical files."],
            ].map(([t, b]) => (
                <div key={t} className="border border-mpca-brass/30 bg-mpca-ivory p-3">
                    <div className="font-serif text-mpca-oxblood text-sm mb-1">{t}</div>
                    <div>{b}</div>
                </div>
            ))}
        </div>

        <H3>Success metrics</H3>
        <ul className="list-disc list-inside text-[13px] text-mpca-charcoal space-y-1 mb-4">
            <li>Every mutation endpoint gated by <code className="bg-mpca-parchment/60 px-1">assert_wiring_owner()</code> — <b>100%</b> coverage.</li>
            <li>Every tournament type flows through the same 10-step lifecycle — no bespoke workflows.</li>
            <li>Every stakeholder sees only what wiring allows — real-time or on-submit — enforced server-side.</li>
            <li>Every closure produces a printable signed certificate with embedded appendices — no manual Excel reconciliation.</li>
            <li>Every grant claim carries a signed submission PDF and a signed approval PDF — full paper-trail.</li>
            <li>Automated pytest suite protects the wiring engine — currently <b>74/74 green</b>.</li>
        </ul>

        <H3>Explicit non-goals for Phase 1</H3>
        <ul className="list-disc list-inside text-[13px] text-mpca-charcoal space-y-1 mb-4">
            <li>Ball-by-ball live scoring is <b>out of scope</b> — a separate Phase VI initiative.</li>
            <li>Native mobile apps are out of scope — the SPA is fully responsive on mobile browsers.</li>
            <li>Hindi/regional i18n is out of scope — English-only for Phase 1.</li>
            <li>Automated real-SMTP email dispatch is stubbed — real SMTP wiring is a Phase 2 backlog item.</li>
        </ul>
    </div>
);

// ─────────────────────────────────────────────────────────────
// TAB 5 · Modules
// ─────────────────────────────────────────────────────────────
const modules = [
    {
        icon: Workflow,
        name: "Tournament Wiring Console",
        who: "MPCA Secretary",
        what: "A live editor for the (8 × 10) governance matrix — the single source of truth for the platform.",
        how: "Every cell edit is audit-logged. Snapshots freeze wiring per season so historical tournaments keep their original rules even if the config evolves.",
        artifacts: "wiring_snapshots · audit_logs",
    },
    {
        icon: Trophy,
        name: "Tournament Workspace",
        who: "All personas (persona-scoped)",
        what: "The one page a stakeholder opens to run a tournament. A 10-step Progression Ribbon at the top; Setup Boxes below (Basics, Pool, Officials, Squad, Calendar, Budget, Finance, Closure).",
        how: "Every box reads wiring via useWiring and renders only the affordances the persona is allowed to perform. Non-owners see read-only rendering.",
        artifacts: "Tournament record · Progress state",
    },
    {
        icon: Users,
        name: "Squad Selection",
        who: "Division · District · Club · School",
        what: "Two modes: Register_Linked picks from the master player register with age/gender/ID validation; Manual_PDF accepts a signed team-list upload.",
        how: "Mode is wired per tournament type. Squad approval is Mandatory/Optional/NA per wiring flag — Manual_PDF squads generally skip MPCA approval and go straight to Signed.",
        artifacts: "Squad sheet PDF · MPCA approval PDF (when M)",
    },
    {
        icon: IndianRupee,
        name: "Unified Budget & Rate Card",
        who: "Division drafts · MPCA locks",
        what: "Master rate card indexed by (tournament_type × format × head). Division sees rates automatically. MPCA locks with a snapshot at approval.",
        how: "On_Submit visibility hides draft numbers from MPCA until Division submits. Snapshot captures the rate card at approval time so downstream reports are reproducible.",
        artifacts: "Budget PDF · budget_snapshots · rate_card entries",
    },
    {
        icon: Gavel,
        name: "Match Officials & DA",
        who: "MPCA (sole owner)",
        what: "MPCA appoints match officials per match. Officials submit DA reimbursement claims post-match against the scheme rate card.",
        how: "Wiring locks Division out of this workflow entirely. DA amounts are rate-card driven, not free-typed. Payment records the treasurer's UTR.",
        artifacts: "Assignment sheet · DA form PDF · Payment record",
    },
    {
        icon: MailCheck,
        name: "Grant Claims (non-tournament)",
        who: "Division submits · MPCA approves",
        what: "Full grant lifecycle: Draft → Signed Submission → MPCA Review → Signed Approval → Payment Made. Threaded discussion between MPCA and division on the claim.",
        how: "Both submission and approval yield reportlab PDFs with signature blocks. Supporting documents are drag-uploaded (planned) and merged via pypdf into the approval archive.",
        artifacts: "Signed submission PDF · Signed approval PDF · Discussion thread · Payment record",
    },
    {
        icon: ScrollText,
        name: "Rich Closure Certificate",
        who: "MPCA (sole owner)",
        what: "A 14-section multi-page closure PDF with pool tables, calendar, invoices, deductions, financial summary and appendices.",
        how: "reportlab renders each section from live data. pypdf merges signed appendices (squad sheets, MPCA approval PDFs, invoices) into a single archival document. Once generated, the tournament is closed and its state becomes immutable.",
        artifacts: "Closure PDF · merged appendix archive",
    },
    {
        icon: CalendarIcon,
        name: "Match Calendar",
        who: "MPCA / Host",
        what: "Match dates, venues, and officials-per-match mapping. Blocks the tournament from progressing until every match has a venue.",
        how: "The blocks_next flag on the wiring cell prevents Budget/Closure steps until the calendar is complete. Automatic reminders fire when sla_days is exceeded.",
        artifacts: "Match records · Calendar PDF",
    },
    {
        icon: GraduationCap,
        name: "Camps (Pre-Tournament / Coaching / Vacation)",
        who: "Division / District",
        what: "Camp creation, roster, budget, and closure. Currently on a separate /camps flow.",
        how: "Phase 1 alignment plan (MPCA-254) promotes camps to first-class tournaments so they inherit the full 10-step wiring — instead of maintaining a parallel architecture.",
        artifacts: "Camp record · Roster · Budget · Closure PDF",
    },
    {
        icon: Repeat,
        name: "Auto-heal Migrations",
        who: "System (startup)",
        what: "Idempotent boot-time migrations that flip legacy records (created before a wiring rule change) into the current wiring state.",
        how: "Each migration checks a guard flag on the record; safe to re-run on every boot. Every migration writes an audit_log entry noting the actor as 'system'.",
        artifacts: "audit_logs · migrated documents",
    },
    {
        icon: Eye,
        name: "On-Submit Visibility Filter",
        who: "Cross-cutting",
        what: "A server-side redaction layer that hides Division draft numbers from MPCA state views until the Division explicitly submits.",
        how: "Every list/detail endpoint calls the visibility resolver, which reads the wiring cell for the step and either returns the row verbatim or returns a redacted stub. Enforced at the API — cannot be bypassed by a client-side edit.",
        artifacts: "Redacted API responses",
    },
    {
        icon: Lock,
        name: "Immutable Audit Log",
        who: "System",
        what: "Every mutation writes an audit_logs entry with actor, body, timestamp, action_label, and before/after payload.",
        how: "Guaranteed by the same wiring_guard.assert_wiring_owner() path — cannot mutate without an audit entry. Retained indefinitely; forms the compliance backbone of the platform.",
        artifacts: "audit_logs collection",
    },
];

const ModulesTab = () => (
    <div>
        <H2>Modules delivered</H2>
        <P>Every module below is wiring-aware unless explicitly noted. Each card lists Who uses it, What it does, How it works under the hood, and the Artifacts it produces.</P>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modules.map(m => {
                const Icon = m.icon;
                return (
                    <div key={m.name} className="border border-mpca-brass/30 bg-mpca-ivory p-4 hover:border-mpca-oxblood/60 transition-all">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-mpca-brass/20">
                            <Icon size={16} className="text-mpca-oxblood" />
                            <div className="font-serif text-mpca-oxblood text-base">{m.name}</div>
                        </div>
                        <div className="text-[11.5px] text-mpca-charcoal leading-relaxed space-y-2">
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">Who</span> — {m.who}</div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">What</span> — {m.what}</div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">How</span> — {m.how}</div>
                            <div><span className="text-[10px] uppercase tracking-widest text-mpca-brass">Artifacts</span> — <span className="italic">{m.artifacts}</span></div>
                        </div>
                    </div>
                );
            })}
        </div>

        <H2>What&apos;s next — MPCA-254 alignment ship</H2>
        <div className="border border-mpca-brass/40 bg-mpca-parchment/50 p-4 text-[12px] text-mpca-charcoal">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <ArrowRight size={14} className="text-mpca-oxblood" />
                        <span className="font-serif text-mpca-oxblood text-sm">Ship A · Compliance Chips</span>
                    </div>
                    Show <b>🟢 Wired · Following Governance</b> or <b>🟡 Wired · Legacy Flow</b> chips on the tournament type picker, tournament list, and detail headers.
                </div>
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <ArrowRight size={14} className="text-mpca-oxblood" />
                        <span className="font-serif text-mpca-oxblood text-sm">Ship B · Promote Camps</span>
                    </div>
                    Migrate camps from the standalone <code>/camps</code> collection into <code>db.tournaments</code> with type-code <code>camp / coachingcamp / vacationcamp</code>, unifying them under the 10-step wiring.
                </div>
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <ArrowRight size={14} className="text-mpca-oxblood" />
                        <span className="font-serif text-mpca-oxblood text-sm">Ship C · Sidebar Cleanup</span>
                    </div>
                    Hide the standalone Camps sidebar item for Division users once camps live inside the main tournaments list.
                </div>
            </div>
        </div>

        <Callout tone="info" title="Roadmap beyond MPCA-254">
            <ul className="list-disc list-inside space-y-0.5">
                <li>Drag-and-drop signed PDF uploader for grants (replaces the current URL-prompt).</li>
                <li>Grant discussion notifications — ping the recipient on new messages.</li>
                <li>Bulk Payment UTR upload — CSV parser for treasurer to mark DA forms paid at scale.</li>
                <li>Season Earnings Statement — Form 16A prefill per official.</li>
                <li>KO Team Promoter — bulk swap placeholders for Knockout brackets.</li>
                <li>Real SMTP wiring for production email notifications.</li>
                <li>Phase VI — BCCI-level ball-by-ball online scoring tool.</li>
                <li>Hindi i18n for the full application.</li>
                <li>Native mobile app for Player Registration.</li>
            </ul>
        </Callout>
    </div>
);

// ─────────────────────────────────────────────────────────────
// Root component with tab pagination
// ─────────────────────────────────────────────────────────────
const TABS = [
    { key: "overview", label: "Overview",  icon: LayoutDashboard },
    { key: "hld",      label: "HLD",       icon: Network },
    { key: "lld",      label: "LLD",       icon: GitBranch },
    { key: "prd",      label: "PRD",       icon: FileText },
    { key: "modules",  label: "Modules",   icon: Layers },
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
