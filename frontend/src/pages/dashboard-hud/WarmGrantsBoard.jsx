/**
 * WarmGrantsBoard — ported from /design-preview/GrantsBoard.jsx into the
 * Institutional Warm palette. Kanban of claims + waterfall + ageing histogram.
 */
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { DL } from "@/lib/designSystem";
import { WarmPanel, WarmChart, WarmKpiHero, WarmPageHeader, WARM_COLORS, SampleChip, ScopeChip } from "./_warm";
import { useScopedMocks, scopeLabel } from "./_mockScope";

const stageColor = (stageKey) => {
    // Map HUD stage colours → warm palette bins so users still read status at a glance.
    return ({
        Draft:            WARM_COLORS.olive,
        Submitted:        WARM_COLORS.gold,
        Under_Review:     WARM_COLORS.goldSoft,
        Approved:         WARM_COLORS.emerald,
        Payment_Made:     WARM_COLORS.emerald,
        Returned:         WARM_COLORS.oxblood,
        Rejected:         WARM_COLORS.oxblood,
    })[stageKey] || WARM_COLORS.gold;
};

export default function WarmGrantsBoard() {
    const { persona } = useAuth();
    const { GRANT_STAGES, GRANT_CARDS, AGEING_BUCKETS } = useScopedMocks(persona);
    const totalCr = GRANT_STAGES.reduce((s, x) => s + x.sum_cr, 0);

    // Waterfall of ₹ across stages
    const waterfallOption = {
        grid: { top: 12, right: 12, bottom: 44, left: 44 },
        xAxis: {
            type: "category", data: GRANT_STAGES.map((s) => s.label),
            axisLine: { lineStyle: { color: WARM_COLORS.axis } },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 10, rotate: 20 },
        },
        yAxis: {
            type: "value", name: "₹ Cr",
            nameTextStyle: { color: WARM_COLORS.text3, fontSize: 10 },
            axisLine: { show: false }, axisTick: { show: false },
            splitLine: { lineStyle: { color: WARM_COLORS.split } },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 10 },
        },
        tooltip: { trigger: "axis" },
        series: [{
            type: "bar",
            data: GRANT_STAGES.map((s) => ({ value: s.sum_cr, itemStyle: { color: stageColor(s.key) } })),
            barWidth: "56%",
            label: {
                show: true, position: "top", color: WARM_COLORS.text, fontFamily: "Nunito", fontSize: 10, fontWeight: 700,
                formatter: (p) => `₹${p.value}Cr`,
            },
        }],
    };

    // Ageing histogram
    const ageingPalette = [WARM_COLORS.emerald, WARM_COLORS.gold, WARM_COLORS.goldSoft, WARM_COLORS.terracotta, WARM_COLORS.oxblood];
    const ageingOption = {
        grid: { top: 10, right: 10, bottom: 30, left: 34 },
        xAxis: {
            type: "category", data: AGEING_BUCKETS.map((b) => b.bucket),
            axisLine: { lineStyle: { color: WARM_COLORS.axis } },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 10 },
        },
        yAxis: {
            type: "value", axisLine: { show: false },
            splitLine: { lineStyle: { color: WARM_COLORS.split } },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 10 },
        },
        tooltip: { trigger: "axis" },
        series: [{
            type: "bar", barWidth: "60%",
            data: AGEING_BUCKETS.map((b, i) => ({ value: b.count, itemStyle: { color: ageingPalette[i] } })),
        }],
    };

    return (
        <div>
            <WarmPageHeader
                eyebrow="Lifecycle · Grant Claims"
                title="Grants Board"
                kicker="Every claim in-flight, ordered by ageing. Column height = volume, colour = stage."
                right={<div className="flex items-center gap-2"><ScopeChip label={scopeLabel(persona)} /><SampleChip /></div>}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <WarmKpiHero label="Claims in Flight" value={GRANT_CARDS.length} accent="gold" testid="warm-kpi-total-claims" />
                <WarmKpiHero label="Approved Value"   value={GRANT_STAGES.find((s) => s.key === "Approved")?.sum_cr ?? 0} suffix="Cr" accent="emerald" testid="warm-kpi-approved-value" />
                <WarmKpiHero label="Paid YTD"         value={GRANT_STAGES.find((s) => s.key === "Payment_Made")?.sum_cr ?? 0} suffix="Cr" accent="emerald" testid="warm-kpi-paid-value" />
                <WarmKpiHero label="Pipeline"         value={totalCr.toFixed(1)} suffix="Cr" accent="goldSoft" testid="warm-kpi-pipeline" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <WarmPanel title="₹ Waterfall by Stage" className="lg:col-span-2" testid="warm-waterfall-panel">
                    <WarmChart option={waterfallOption} height={220} testid="warm-waterfall-chart" />
                </WarmPanel>
                <WarmPanel title="Ageing Distribution" testid="warm-ageing-panel">
                    <WarmChart option={ageingOption} height={220} testid="warm-ageing-chart" />
                </WarmPanel>
            </div>

            {/* Kanban */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="warm-grants-kanban">
                {GRANT_STAGES.map((stage) => {
                    const c = stageColor(stage.key);
                    const cards = GRANT_CARDS.filter((x) => x.stage === stage.key);
                    return (
                        <div
                            key={stage.key}
                            className="min-h-[280px]"
                            style={{ background: DL.paper, border: `1px solid ${DL.ruleStrong}`, borderRadius: 4 }}
                            data-testid={`warm-kanban-col-${stage.key}`}
                        >
                            <div
                                className="px-3 py-2 flex items-center justify-between"
                                style={{ borderBottom: `1px solid ${DL.rule}`, borderTop: `3px solid ${c}` }}
                            >
                                <div>
                                    <div className="text-[10px] uppercase tracking-[0.15em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{stage.label}</div>
                                    <div className="text-[9.5px] mt-0.5" style={{ fontFamily: DL.fontMono, color: DL.muted }}>₹{stage.sum_cr}Cr · {stage.count} claims</div>
                                </div>
                                <div className="text-[22px] leading-none" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: c }}>{stage.count}</div>
                            </div>
                            <div className="p-2 space-y-2">
                                {cards.map((cd, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="p-2.5"
                                        style={{ background: DL.ivory, border: `1px solid ${DL.rule}`, borderLeft: `3px solid ${c}`, borderRadius: 3 }}
                                        data-testid={`warm-kanban-card-${stage.key}-${i}`}
                                    >
                                        <div className="flex items-center justify-between text-[10px] font-bold" style={{ fontFamily: DL.fontMono }}>
                                            <span style={{ color: DL.ink2 }}>{cd.body}</span>
                                            <span style={{ color: cd.age_days > 14 ? DL.danger : cd.age_days > 7 ? DL.gold : DL.muted }}>{cd.age_days}d</span>
                                        </div>
                                        <div className="text-[11px] mt-1 truncate" style={{ color: DL.ink }}>{cd.scheme}</div>
                                        <div className="text-[18px] mt-1" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: c }}>₹{cd.amount_l}L</div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
