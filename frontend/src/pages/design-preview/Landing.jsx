/**
 * /design-preview — landing page with 8 dashboard tiles.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, Radio, Activity, IndianRupee, Calendar, Users, GitBranch, ShieldCheck, Trophy } from "lucide-react";
import { DesignPreviewShell, PulseDot, PageHeader } from "./_shared";

const TILES = [
    { n: "01", to: "/design-preview/season-overview",     title: "SEASON OVERVIEW",      kicker: "Live command centre",              icon: Activity,   accent: "text-hud-crimson" },
    { n: "02", to: "/design-preview/grants-board",        title: "GRANTS BOARD",         kicker: "Kanban · ageing · waterfall",       icon: GitBranch,  accent: "text-hud-marigold" },
    { n: "03", to: "/design-preview/budget-health",       title: "BUDGET HEALTH",        kicker: "Treemap · gauges · overruns",       icon: IndianRupee, accent: "text-hud-saffron" },
    { n: "04", to: "/design-preview/tournament-calendar", title: "TOURNAMENT CALENDAR",  kicker: "Annual heatmap · Gantt · mix",      icon: Calendar,   accent: "text-hud-cyan" },
    { n: "05", to: "/design-preview/officials-squads",    title: "OFFICIALS & SQUADS",   kicker: "Workload sankey · funnel · radar",  icon: Users,      accent: "text-hud-pitch" },
    { n: "06", to: "/design-preview/financial-flow",      title: "FINANCIAL FLOW",       kicker: "BCCI → MPCA → Divisions → Clubs",   icon: Radio,      accent: "text-hud-saffron" },
    { n: "07", to: "/design-preview/compliance-matrix",   title: "COMPLIANCE MATRIX",    kicker: "8 types × 10 steps · red flags",    icon: ShieldCheck, accent: "text-hud-crimson" },
    { n: "08", to: "/design-preview/division-scorecard",  title: "DIVISION SCORECARD",   kicker: "Radar · ranked bars · 6 dims",      icon: Trophy,     accent: "text-hud-marigold" },
];

export default function DesignPreviewLanding() {
    return (
        <DesignPreviewShell>
            <PageHeader
                eyebrow="EXECUTIVE COMMAND · LIVE PREVIEW"
                title="MPCA · 2026-27 Command Deck"
                kicker="A broadcast-HUD reimagining of the MPCA ERP dashboards — dense, data-first analytics wrapped in a live-scoring aesthetic. Every tile below is a fully-rendered mock; existing dashboards remain untouched."
                right={<div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-hud-text-2"><PulseDot color="crimson" /> ON-AIR · SAMPLE DATA</div>}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="design-preview-tiles">
                {TILES.map((t, i) => (
                    <motion.div key={t.n} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.35 }}>
                        <Link to={t.to} data-testid={`design-tile-${t.n}`}
                              className="group block border border-hud-panel bg-hud-surface hover:bg-hud-elev hover:border-hud-cyan transition-all">
                            <div className="p-5">
                                <div className="flex items-start justify-between">
                                    <div className="font-mono text-[10px] tracking-[0.3em] text-hud-text-3">— {t.n} —</div>
                                    <t.icon size={18} className={t.accent + " group-hover:scale-110 transition-transform"} strokeWidth={1.5} />
                                </div>
                                <div className="mt-8 text-2xl leading-tight text-hud-text group-hover:text-hud-cyan transition-colors"
                                     style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.03em" }}>
                                    {t.title}
                                </div>
                                <div className="mt-1 text-[11px] text-hud-text-2">{t.kicker}</div>
                                <div className="mt-5 flex items-center justify-between border-t border-hud-panel pt-3">
                                    <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-hud-text-3">Open dashboard</span>
                                    <ArrowUpRight size={14} className="text-hud-text-3 group-hover:text-hud-saffron group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </div>

            <div className="mt-8 border border-hud-panel bg-hud-surface p-6" data-testid="design-preview-brief">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] text-hud-text-2 leading-relaxed">
                    <div>
                        <div className="font-mono uppercase tracking-[0.25em] text-hud-cyan text-[10px] mb-2">Design Language</div>
                        <p>Broadcast-HUD × Data-first. Deep navy base with saffron / crimson / pitch-green accents. Bebas Neue hero counters, IBM Plex for labels &amp; tables, Plex Mono for figures &amp; timestamps.</p>
                    </div>
                    <div>
                        <div className="font-mono uppercase tracking-[0.25em] text-hud-cyan text-[10px] mb-2">Charting Stack</div>
                        <p>Apache ECharts (via <code>echarts-for-react</code>). Sankey for financial flow, treemap for budget heads, calendar heatmap for match density, radar for division scorecard, gauge for utilisation, funnel for squad selection.</p>
                    </div>
                    <div>
                        <div className="font-mono uppercase tracking-[0.25em] text-hud-cyan text-[10px] mb-2">Scope</div>
                        <p>New route family <code>/design-preview/*</code>. Existing routes, colours &amp; components untouched. Every figure on these pages is <span className="text-hud-saffron">sample data</span> for stakeholder review only.</p>
                    </div>
                </div>
            </div>
        </DesignPreviewShell>
    );
}
