/**
 * WarmSeasonOverview — ported from /design-preview/SeasonOverview.jsx into the
 * Institutional Warm palette (ivory + emerald + gold). Sample data only for now.
 */
import Marquee from "react-fast-marquee";
import { motion } from "framer-motion";
import { Flag, MapPin } from "lucide-react";
import { KPIS, LIVE_MATCHES, TICKER, UPCOMING_TOSSES } from "@/pages/design-preview/_mock";
import { DL } from "@/lib/designSystem";
import { WarmPanel, WarmKpiHero, WarmChart, WarmPageHeader, WARM_COLORS, PulseDot, SampleChip } from "./_warm";

export default function WarmSeasonOverview() {
    const velocityOption = {
        grid: { top: 10, right: 6, bottom: 20, left: 6, containLabel: false },
        xAxis: {
            type: "category", data: Array.from({ length: 14 }, (_, i) => i + 1),
            axisLine: { show: false }, axisTick: { show: false },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 9 },
        },
        yAxis: { show: false },
        series: [{
            type: "line", smooth: true, showSymbol: false,
            lineStyle: { color: WARM_COLORS.gold, width: 2.5 },
            areaStyle: {
                color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [
                    { offset: 0, color: "rgba(184,131,40,0.42)" },
                    { offset: 1, color: "rgba(184,131,40,0)" },
                ] },
            },
            data: [12, 18, 15, 22, 27, 24, 31, 28, 34, 30, 42, 38, 45, 41],
        }],
    };

    return (
        <div>
            <WarmPageHeader
                eyebrow="Live · Season 2026-27"
                title="Season Overview"
                kicker="Every match, every rupee, every squad — surfaced in one grade-A viewport."
                right={<SampleChip />}
            />

            {/* Ticker */}
            <div
                className="mb-6 flex items-stretch overflow-hidden"
                style={{ border: `1px solid ${DL.ruleStrong}`, borderRadius: 4, background: DL.paper }}
                data-testid="warm-ticker-strip"
            >
                <div
                    className="shrink-0 flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.24em] font-bold"
                    style={{ fontFamily: DL.fontMono, color: DL.paper, background: DL.emerald }}
                >
                    <PulseDot tone="gold" /> Live feed
                </div>
                <Marquee gradient={false} speed={45} pauseOnHover className="flex-1">
                    {TICKER.map((t, i) => (
                        <span key={i} className="mx-8 py-2 text-[11.5px]" style={{ color: DL.ink2, fontFamily: DL.fontMono }}>
                            <span className="mr-2" style={{ color: DL.gold, fontWeight: 700 }}>///</span>{t}
                        </span>
                    ))}
                </Marquee>
            </div>

            {/* Hero KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="warm-kpi-strip">
                <WarmKpiHero label="Active Tournaments" value={KPIS.tournaments_active} accent="emerald" trend={{ dir: "up", value: "+3", label: "vs last season" }} testid="warm-kpi-tournaments" />
                <WarmKpiHero label="Matches Today"       value={KPIS.matches_today}       accent="gold"    trend={{ dir: "up", value: "+2", label: "vs yesterday" }} testid="warm-kpi-matches" />
                <WarmKpiHero label="Disbursed YTD"       value={KPIS.disbursed_ytd_cr}    suffix="Cr"      accent="goldSoft" trend={{ dir: "up", value: "+18%", label: "vs YoY" }} testid="warm-kpi-disbursed" />
                <WarmKpiHero label="Active Claims"       value={KPIS.active_claims}       accent="oxblood" trend={{ dir: "down", value: "-4", label: "week-on-week" }} testid="warm-kpi-claims" />
                <WarmKpiHero label="Officials On-Duty"   value={KPIS.officials_on_duty}   accent="emerald" testid="warm-kpi-officials" />
                <WarmKpiHero label="Squads Finalised"    value={KPIS.squads_finalised}    accent="gold"    testid="warm-kpi-squads" />
            </div>

            {/* Live matches + tosses + velocity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <WarmPanel title="Live Matches · In-Play" right={<span><PulseDot tone="oxblood" /> &nbsp;{LIVE_MATCHES.length} live</span>} className="lg:col-span-2" testid="warm-live-matches-panel">
                    <div className="divide-y" style={{ borderColor: DL.rule }}>
                        {LIVE_MATCHES.map((m, i) => (
                            <motion.div
                                key={m.id}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="py-3 flex items-start gap-4"
                                style={{ borderColor: DL.rule }}
                                data-testid={`warm-live-match-${m.id}`}
                            >
                                <div className="pt-1 shrink-0"><PulseDot tone="oxblood" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                                        <Flag size={10} /> {m.tourn}<span style={{ color: DL.muted }}>·</span>
                                        <MapPin size={10} /> {m.location}
                                    </div>
                                    <div className="mt-1 text-[14px] font-bold" style={{ color: DL.ink }}>{m.teams}</div>
                                    <div className="mt-1 flex items-baseline gap-3">
                                        <span className="text-[26px] tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.emerald }}>{m.score}</span>
                                        <span className="text-[10.5px] font-bold" style={{ fontFamily: DL.fontMono, color: DL.muted }}>({m.ovs} OV)</span>
                                        {m.target && <span className="text-[10.5px] font-bold" style={{ fontFamily: DL.fontMono, color: DL.danger }}>TARGET {m.target}</span>}
                                    </div>
                                </div>
                                <span className="text-[9px] uppercase font-bold px-2 py-0.5 shrink-0" style={{ fontFamily: DL.fontMono, color: DL.gold, border: `1px solid ${DL.rule}`, borderRadius: 3 }}>{m.format}</span>
                            </motion.div>
                        ))}
                    </div>
                </WarmPanel>

                <div className="space-y-4">
                    <WarmPanel title="Upcoming Tosses" testid="warm-upcoming-tosses-panel">
                        <div className="space-y-3">
                            {UPCOMING_TOSSES.map((t, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="text-[30px] leading-none shrink-0" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.gold }}>
                                        {t.when_min}<span className="text-xs ml-1" style={{ color: DL.muted, fontWeight: 500 }}>min</span>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{t.tourn}</div>
                                        <div className="text-[12px] mt-0.5" style={{ color: DL.ink }}>{t.teams}</div>
                                        <div className="text-[10.5px]" style={{ fontFamily: DL.fontMono, color: DL.muted }}>{t.venue}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </WarmPanel>

                    <WarmPanel title="Runs / Day · 14-day trend" right="+41 today" testid="warm-velocity-panel">
                        <WarmChart option={velocityOption} height={100} testid="warm-velocity-chart" />
                        <div className="mt-2 text-[10px] flex items-center justify-between" style={{ fontFamily: DL.fontMono }}>
                            <span style={{ color: DL.muted }}>MIN 12 · AVG 27 · MAX 45</span>
                            <span style={{ color: DL.emerald, fontWeight: 700 }}>▲ TRENDING UP</span>
                        </div>
                    </WarmPanel>
                </div>
            </div>
        </div>
    );
}
