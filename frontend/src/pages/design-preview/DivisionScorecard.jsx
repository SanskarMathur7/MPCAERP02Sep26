import { motion } from "framer-motion";
import { DesignPreviewShell, PageHeader, HudPanel, HudChart, KpiHero, HUD_COLORS } from "./_shared";
import { SCORECARD_DIMS, SCORECARD_ROWS } from "./_mock";

const cellColor = (v) => v >= 85 ? HUD_COLORS.pitch : v >= 70 ? HUD_COLORS.cyan : v >= 55 ? HUD_COLORS.marigold : HUD_COLORS.crimson;

export default function DivisionScorecard() {
    const top3 = SCORECARD_ROWS.slice(0, 3);
    const radarOption = {
        tooltip: {}, legend: { bottom: 0, textStyle: { color: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" }, itemWidth: 10, itemHeight: 8 },
        radar: {
            indicator: SCORECARD_DIMS.map((d) => ({ name: d, max: 100 })),
            splitNumber: 5, shape: "polygon", center: ["50%", "50%"], radius: "65%",
            axisName: { color: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" },
            splitLine: { lineStyle: { color: "#334155" } }, splitArea: { areaStyle: { color: ["#111A24", "#0A1118"] } }, axisLine: { lineStyle: { color: "#334155" } },
        },
        series: [{
            type: "radar", symbol: "none", lineStyle: { width: 2 },
            data: top3.map((r, i) => ({
                name: r.div, value: r.scores,
                itemStyle: { color: [HUD_COLORS.saffron, HUD_COLORS.cyan, HUD_COLORS.pitch][i] },
                areaStyle: { color: [HUD_COLORS.saffron, HUD_COLORS.cyan, HUD_COLORS.pitch][i], opacity: 0.14 },
            })),
        }],
    };

    return (
        <DesignPreviewShell>
            <PageHeader eyebrow="COMPARATIVE · DIVISIONS" title="Division Scorecard" kicker="10 divisions × 6 dimensions. Radar shows top 3; the table shows every division ranked by composite score." />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiHero label="Champion" value={SCORECARD_ROWS[0].div.toUpperCase()} accent="saffron" testid="kpi-champion" />
                <KpiHero label="Top Composite" value={Math.round(SCORECARD_ROWS[0].scores.reduce((s, x) => s + x, 0) / 6)} accent="pitch" testid="kpi-top-composite" />
                <KpiHero label="Gap · Top vs Last" value={Math.round(SCORECARD_ROWS[0].scores.reduce((s, x) => s + x, 0) / 6) - Math.round(SCORECARD_ROWS[SCORECARD_ROWS.length - 1].scores.reduce((s, x) => s + x, 0) / 6)} suffix=" pts" accent="crimson" testid="kpi-gap" />
                <KpiHero label="Below Median" value={SCORECARD_ROWS.filter((r, i) => i >= 5).length} accent="marigold" testid="kpi-below-median" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <HudPanel title="Top 3 · Radar Compare" className="lg:col-span-2" testid="radar-panel">
                    <HudChart option={radarOption} height={420} testid="scorecard-radar-chart" />
                </HudPanel>

                <HudPanel title="Ranked Divisions" right="Score / 100 · higher = better" className="lg:col-span-3" testid="scorecard-table-panel">
                    <div className="space-y-1.5">
                        <div className="grid grid-cols-[24px_120px_repeat(6,1fr)_60px] gap-2 items-center px-2 py-1 border-b border-hud-panel font-mono text-[9px] uppercase tracking-[0.15em] text-hud-text-3">
                            <span>#</span><span>DIVISION</span>
                            {SCORECARD_DIMS.map((d, i) => <span key={i} className="text-center truncate" title={d}>{d.split(" ").map((w) => w[0]).join("")}</span>)}
                            <span className="text-right">AVG</span>
                        </div>
                        {SCORECARD_ROWS.map((r, i) => {
                            const avg = Math.round(r.scores.reduce((s, x) => s + x, 0) / 6);
                            return (
                                <motion.div key={r.div} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                                            className="grid grid-cols-[24px_120px_repeat(6,1fr)_60px] gap-2 items-center px-2 py-1.5 bg-hud-base border border-hud-panel hover:border-hud-cyan transition-colors"
                                            data-testid={`scorecard-row-${r.div}`}>
                                    <span className={"font-['Bebas_Neue'] text-xl leading-none " + (i < 3 ? "text-hud-saffron" : "text-hud-text-3")} style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{i + 1}</span>
                                    <span className="text-hud-text text-xs">{r.div}</span>
                                    {r.scores.map((s, k) => (
                                        <div key={k} className="relative h-4 bg-hud-panel/40 overflow-hidden">
                                            <div className="absolute inset-y-0 left-0" style={{ width: `${s}%`, backgroundColor: cellColor(s), opacity: 0.85 }} />
                                            <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] text-hud-text">{s}</span>
                                        </div>
                                    ))}
                                    <span className="font-['Bebas_Neue'] text-xl text-right leading-none" style={{ color: cellColor(avg), fontFamily: "'Bebas Neue', sans-serif" }}>{avg}</span>
                                </motion.div>
                            );
                        })}
                    </div>
                </HudPanel>
            </div>
        </DesignPreviewShell>
    );
}
