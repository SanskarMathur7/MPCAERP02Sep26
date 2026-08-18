import Marquee from "react-fast-marquee";
import { motion } from "framer-motion";
import { Flag, MapPin } from "lucide-react";
import { DesignPreviewShell, PageHeader, HudPanel, KpiHero, PulseDot, HudChart, HUD_COLORS } from "./_shared";
import { KPIS, LIVE_MATCHES, TICKER, UPCOMING_TOSSES } from "./_mock";

export default function SeasonOverview() {
    // Runs velocity trend — sparkline area
    const velocityOption = {
        grid: { top: 10, right: 6, bottom: 20, left: 6, containLabel: false },
        xAxis: { type: "category", data: Array.from({ length: 14 }, (_, i) => i + 1), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#64748B", fontSize: 9 } },
        yAxis: { show: false },
        series: [{
            type: "line", smooth: true, showSymbol: false, lineStyle: { color: HUD_COLORS.saffron, width: 2 },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(255,138,0,0.5)" }, { offset: 1, color: "rgba(255,138,0,0)" }] } },
            data: [12, 18, 15, 22, 27, 24, 31, 28, 34, 30, 42, 38, 45, 41],
        }],
    };

    return (
        <DesignPreviewShell>
            <PageHeader
                eyebrow="LIVE · SEASON 2026-27"
                title="Command Centre · Season Overview"
                kicker="Every match, every claim, every rupee — surfaced in one broadcast-grade viewport."
            />

            {/* Ticker */}
            <div className="border border-hud-panel bg-black mb-6" data-testid="ticker-strip">
                <div className="flex items-stretch">
                    <div className="bg-hud-crimson text-hud-text px-3 py-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] shrink-0">
                        <PulseDot color="cyan" /> LIVE FEED
                    </div>
                    <Marquee gradient={false} speed={45} pauseOnHover className="flex-1">
                        {TICKER.map((t, i) => (
                            <span key={i} className="font-mono text-[11px] text-hud-text-2 py-2 mx-8">
                                <span className="text-hud-saffron mr-2">///</span>{t}
                            </span>
                        ))}
                    </Marquee>
                </div>
            </div>

            {/* Hero KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="kpi-strip">
                <KpiHero label="Active Tournaments" value={KPIS.tournaments_active} accent="saffron" trend={{ dir: "up", value: "+3", label: "vs last season" }} testid="kpi-tournaments" />
                <KpiHero label="Matches Today" value={KPIS.matches_today} accent="crimson" trend={{ dir: "up", value: "+2", label: "vs yesterday" }} testid="kpi-matches" />
                <KpiHero label="Disbursed YTD" value={KPIS.disbursed_ytd_cr} suffix=" Cr" accent="marigold" trend={{ dir: "up", value: "+18%", label: "vs YoY" }} testid="kpi-disbursed" />
                <KpiHero label="Active Claims" value={KPIS.active_claims} accent="cyan" trend={{ dir: "down", value: "-4", label: "week-on-week" }} testid="kpi-claims" />
                <KpiHero label="Officials On-Duty" value={KPIS.officials_on_duty} accent="pitch" testid="kpi-officials" />
                <KpiHero label="Squads Finalised" value={KPIS.squads_finalised} accent="saffron" testid="kpi-squads" />
            </div>

            {/* Live matches + tosses + velocity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <HudPanel title="Live Matches · In-Play" right={<span className="text-hud-crimson"><PulseDot /> {LIVE_MATCHES.length} live</span>} className="lg:col-span-2" testid="live-matches-panel">
                    <div className="divide-y divide-hud-panel">
                        {LIVE_MATCHES.map((m, i) => (
                            <motion.div key={m.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="py-3 flex items-start gap-4" data-testid={`live-match-${m.id}`}>
                                <div className="pt-1 shrink-0"><PulseDot color="crimson" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-hud-text-2">
                                        <Flag size={10} /> {m.tourn}<span className="text-hud-text-3">·</span>
                                        <MapPin size={10} /> {m.location}
                                    </div>
                                    <div className="mt-1 text-hud-text text-sm font-semibold">{m.teams}</div>
                                    <div className="mt-1 flex items-baseline gap-3">
                                        <span className="font-['Bebas_Neue'] text-2xl text-hud-saffron" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{m.score}</span>
                                        <span className="font-mono text-[10px] text-hud-text-2">({m.ovs} OV)</span>
                                        {m.target && <span className="font-mono text-[10px] text-hud-crimson">TARGET {m.target}</span>}
                                    </div>
                                </div>
                                <span className="text-[9px] font-mono px-2 py-0.5 border border-hud-panel text-hud-text-2 uppercase shrink-0">{m.format}</span>
                            </motion.div>
                        ))}
                    </div>
                </HudPanel>

                <div className="space-y-4">
                    <HudPanel title="Upcoming Tosses" testid="upcoming-tosses-panel">
                        <div className="space-y-3">
                            {UPCOMING_TOSSES.map((t, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="font-['Bebas_Neue'] text-3xl text-hud-cyan leading-none shrink-0" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                                        {t.when_min}<span className="text-xs text-hud-text-3 ml-1">min</span>
                                    </div>
                                    <div>
                                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-hud-text-2">{t.tourn}</div>
                                        <div className="text-hud-text text-xs mt-0.5">{t.teams}</div>
                                        <div className="text-hud-text-3 text-[10px] font-mono">{t.venue}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </HudPanel>

                    <HudPanel title="Runs / Day · 14-day trend" right="+41 today" testid="velocity-panel">
                        <HudChart option={velocityOption} height={100} testid="velocity-chart" />
                        <div className="mt-2 font-mono text-[10px] text-hud-text-3 flex items-center justify-between">
                            <span>MIN 12 · AVG 27 · MAX 45</span>
                            <span className="text-hud-saffron">▲ TRENDING UP</span>
                        </div>
                    </HudPanel>
                </div>
            </div>
        </DesignPreviewShell>
    );
}
