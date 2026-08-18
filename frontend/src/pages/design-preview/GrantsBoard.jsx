import { motion } from "framer-motion";
import { DesignPreviewShell, PageHeader, HudPanel, HudChart, KpiHero, HUD_COLORS } from "./_shared";
import { GRANT_STAGES, GRANT_CARDS, AGEING_BUCKETS } from "./_mock";

export default function GrantsBoard() {
    const totalCr = GRANT_STAGES.reduce((s, x) => s + x.sum_cr, 0);

    // Waterfall of ₹ across stages
    const waterfallOption = {
        grid: { top: 10, right: 10, bottom: 40, left: 44 },
        xAxis: { type: "category", data: GRANT_STAGES.map((s) => s.label), axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10, rotate: 20 } },
        yAxis: { type: "value", name: "₹ Cr", nameTextStyle: { color: "#64748B", fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: "#1E293B" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        tooltip: { trigger: "axis" },
        series: [{
            type: "bar", data: GRANT_STAGES.map((s) => ({ value: s.sum_cr, itemStyle: { color: s.color } })),
            barWidth: "56%", label: { show: true, position: "top", color: "#F8FAFC", fontFamily: "IBM Plex Mono", fontSize: 10, formatter: (p) => `₹${p.value}Cr` },
        }],
    };

    // Ageing histogram
    const ageingOption = {
        grid: { top: 10, right: 10, bottom: 30, left: 34 },
        xAxis: { type: "category", data: AGEING_BUCKETS.map((b) => b.bucket), axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        yAxis: { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "#1E293B" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        tooltip: { trigger: "axis" },
        series: [{
            type: "bar", data: AGEING_BUCKETS.map((b, i) => ({ value: b.count, itemStyle: { color: [HUD_COLORS.pitch, HUD_COLORS.cyan, HUD_COLORS.marigold, HUD_COLORS.saffron, HUD_COLORS.crimson][i] } })),
            barWidth: "60%",
        }],
    };

    return (
        <DesignPreviewShell>
            <PageHeader eyebrow="LIFECYCLE · GRANT CLAIMS" title="Grants Board" kicker="Six-stage kanban of every claim in the pipeline, ordered by ageing. Colour-coded by stage; height-of-column signals volume." />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiHero label="Claims in flight" value={GRANT_CARDS.length} accent="cyan" testid="kpi-total-claims" />
                <KpiHero label="Approved value" value={GRANT_STAGES.find((s) => s.key === "Approved").sum_cr} suffix=" Cr" accent="pitch" testid="kpi-approved-value" />
                <KpiHero label="Paid YTD" value={GRANT_STAGES.find((s) => s.key === "Payment_Made").sum_cr} suffix=" Cr" accent="saffron" testid="kpi-paid-value" />
                <KpiHero label="Pipeline" value={totalCr.toFixed(1)} suffix=" Cr" accent="marigold" testid="kpi-pipeline" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <HudPanel title="₹ Waterfall by Stage" className="lg:col-span-2" testid="waterfall-panel">
                    <HudChart option={waterfallOption} height={220} testid="waterfall-chart" />
                </HudPanel>
                <HudPanel title="Ageing Distribution" testid="ageing-panel">
                    <HudChart option={ageingOption} height={220} testid="ageing-chart" />
                </HudPanel>
            </div>

            {/* Kanban */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="grants-kanban">
                {GRANT_STAGES.map((stage) => {
                    const cards = GRANT_CARDS.filter((c) => c.stage === stage.key);
                    return (
                        <div key={stage.key} className="bg-hud-base border border-hud-panel min-h-[280px]" data-testid={`kanban-col-${stage.key}`}>
                            <div className="px-3 py-2 border-b border-hud-panel flex items-center justify-between" style={{ borderTop: `2px solid ${stage.color}` }}>
                                <div>
                                    <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-hud-text-2">{stage.label}</div>
                                    <div className="text-[9px] font-mono text-hud-text-3 mt-0.5">₹{stage.sum_cr}Cr · {stage.count} claims</div>
                                </div>
                                <div className="font-['Bebas_Neue'] text-2xl leading-none" style={{ color: stage.color, fontFamily: "'Bebas Neue', sans-serif" }}>{stage.count}</div>
                            </div>
                            <div className="p-2 space-y-2">
                                {cards.map((c, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                                                className="bg-hud-surface border border-hud-panel p-2.5 hover:border-hud-cyan transition-colors" style={{ borderLeft: `3px solid ${stage.color}` }}
                                                data-testid={`kanban-card-${stage.key}-${i}`}>
                                        <div className="flex items-center justify-between text-[10px] font-mono">
                                            <span className="text-hud-text-2">{c.body}</span>
                                            <span className={"text-[9px] " + (c.age_days > 14 ? "text-hud-crimson" : c.age_days > 7 ? "text-hud-marigold" : "text-hud-text-3")}>{c.age_days}d</span>
                                        </div>
                                        <div className="text-[11px] text-hud-text mt-1 truncate">{c.scheme}</div>
                                        <div className="font-['Bebas_Neue'] text-xl mt-1" style={{ color: stage.color, fontFamily: "'Bebas Neue', sans-serif" }}>₹{c.amount_l}L</div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </DesignPreviewShell>
    );
}
