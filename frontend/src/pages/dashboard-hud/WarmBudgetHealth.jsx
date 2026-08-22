/**
 * WarmBudgetHealth — ported from /design-preview/BudgetHealth.jsx into the
 * Institutional Warm palette. Treemap · gauge · overrun bars · velocity line.
 */
import { useAuth } from "@/context/AuthContext";
import { DL } from "@/lib/designSystem";
import { WarmPanel, WarmChart, WarmKpiHero, WarmPageHeader, WARM_COLORS, SampleChip, ScopeChip } from "./_warm";
import { useScopedMocks, scopeLabel } from "./_mockScope";

export default function WarmBudgetHealth() {
    const { persona } = useAuth();
    const { BUDGET_TREE, BUDGET_UTILISATION, TOP_OVERRUNS, INVOICE_VELOCITY, share } = useScopedMocks(persona);
    const warmParentPalette = [
        WARM_COLORS.emerald, WARM_COLORS.gold, WARM_COLORS.terracotta,
        WARM_COLORS.oxblood, WARM_COLORS.goldSoft, WARM_COLORS.olive,
    ];
    // Flatten the budget tree into leaf rows and sort by ₹ desc. Rendered as a
    // pure-CSS horizontal bar list — instantly readable, no chart-library quirks,
    // and every value + name is guaranteed legible at any width.
    const parentIndex = Object.fromEntries(BUDGET_TREE.children.map((p, i) => [p.name, i]));
    const leafRows = BUDGET_TREE.children
        .flatMap((p) => (p.children || []).map((c) => ({
            name: c.name, parent: p.name, value: c.value,
            color: warmParentPalette[parentIndex[p.name] % warmParentPalette.length],
        })))
        .sort((a, b) => b.value - a.value);
    const parentRows = [...BUDGET_TREE.children]
        .map((p, i) => ({ name: p.name, value: p.value, count: (p.children || []).length, color: warmParentPalette[i % warmParentPalette.length] }))
        .sort((a, b) => b.value - a.value);
    const maxLeaf = Math.max(...leafRows.map((r) => r.value), 1);
    const maxParent = Math.max(...parentRows.map((r) => r.value), 1);

    const gaugeOption = {
        series: [{
            type: "gauge", startAngle: 210, endAngle: -30, min: 0, max: 100, splitNumber: 10,
            axisLine: {
                lineStyle: {
                    width: 18,
                    color: [
                        [0.6, WARM_COLORS.emerald],
                        [0.85, WARM_COLORS.gold],
                        [1,   WARM_COLORS.oxblood],
                    ],
                },
            },
            pointer: { itemStyle: { color: DL.ink }, length: "58%", width: 4 },
            progress: { show: false },
            splitLine: { length: 8, distance: -20, lineStyle: { color: DL.paper, width: 2 } },
            axisTick: { length: 4, distance: -14, lineStyle: { color: WARM_COLORS.axis } },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 9, distance: -34 },
            detail: {
                valueAnimation: false, formatter: "{value}%",
                color: WARM_COLORS.emerald, fontSize: 32, fontFamily: "Fraunces, Nunito", fontWeight: 800,
                offsetCenter: [0, "70%"],
            },
            title: { color: WARM_COLORS.text3, fontSize: 10, offsetCenter: [0, "94%"], fontFamily: "Nunito" },
            data: [{ value: Math.round(BUDGET_UTILISATION * 100), name: "UTILISATION" }],
        }],
    };

    const overrunOption = {
        grid: { top: 6, right: 30, bottom: 6, left: 130 },
        xAxis: {
            type: "value", axisLine: { show: false },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 9 },
            splitLine: { lineStyle: { color: WARM_COLORS.split } }, max: 130,
        },
        yAxis: {
            type: "category",
            data: TOP_OVERRUNS.map((o) => o.head).reverse(),
            axisLine: { lineStyle: { color: WARM_COLORS.axis } },
            axisLabel: { color: WARM_COLORS.text2, fontSize: 10 },
        },
        tooltip: { trigger: "axis", formatter: (p) => `${p[0].name}: <b>${p[0].value}%</b>` },
        series: [{
            type: "bar", barWidth: "60%",
            data: TOP_OVERRUNS.map((o) => ({
                value: o.pct,
                itemStyle: { color: o.pct > 115 ? WARM_COLORS.oxblood : WARM_COLORS.gold },
            })).reverse(),
            label: {
                show: true, position: "right",
                color: WARM_COLORS.text, fontFamily: "Nunito", fontWeight: 700, fontSize: 10,
                formatter: "{c}%",
            },
            markLine: {
                symbol: "none",
                data: [{ xAxis: 100, lineStyle: { color: WARM_COLORS.oxblood, type: "dashed" }, label: { color: WARM_COLORS.oxblood, fontSize: 9, formatter: "100%" } }],
            },
        }],
    };

    const velocityOption = {
        grid: { top: 10, right: 10, bottom: 24, left: 32 },
        xAxis: {
            type: "category",
            data: ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
            axisLine: { lineStyle: { color: WARM_COLORS.axis } },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 10 },
        },
        yAxis: {
            type: "value", axisLine: { show: false },
            splitLine: { lineStyle: { color: WARM_COLORS.split } },
            axisLabel: { color: WARM_COLORS.text3, fontSize: 9 },
        },
        tooltip: { trigger: "axis" },
        series: [{
            name: "Invoices", type: "line", smooth: true, data: INVOICE_VELOCITY,
            lineStyle: { color: WARM_COLORS.emerald, width: 2.5 },
            symbol: "circle", symbolSize: 6, itemStyle: { color: WARM_COLORS.emerald },
            areaStyle: { color: "rgba(13,59,46,0.14)" },
        }],
    };

    return (
        <div>
            <WarmPageHeader
                eyebrow="Fiscal · 2026-27"
                title="Budget Health"
                kicker="Season-wide deployment. Treemap surfaces where money is going; gauge & bars surface how fast."
                right={<div className="flex items-center gap-2"><ScopeChip label={scopeLabel(persona)} /><SampleChip /></div>}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <WarmKpiHero label="Approved Budget" value={(30.8 * share).toFixed(1)} suffix="Cr" accent="emerald" testid="warm-kpi-budget-approved" />
                <WarmKpiHero label="Committed"       value={(22.8 * share).toFixed(1)} suffix="Cr" accent="gold"    testid="warm-kpi-budget-committed" />
                <WarmKpiHero label="Utilisation"     value={`${Math.round(BUDGET_UTILISATION * 100)}%`} accent="goldSoft" testid="warm-kpi-budget-util" />
                <WarmKpiHero label="Overrun Heads"   value={TOP_OVERRUNS.filter((o) => o.pct > 100).length} accent="oxblood" testid="warm-kpi-budget-overruns" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <WarmPanel
                    title="Budget Head · Where the Money Sits"
                    subtitle="6 buckets sorted by ₹ · every line item listed below"
                    className="lg:col-span-2"
                    testid="warm-treemap-panel"
                >
                    {/* Parent totals — big bars, executive read */}
                    <div className="space-y-3" data-testid="warm-parent-totals-list">
                        {parentRows.map((p) => {
                            const pct = (p.value / maxParent) * 100;
                            return (
                                <div key={p.name} className="flex items-center gap-4" data-testid={`warm-parent-row-${p.name.toLowerCase().replace(/\s+/g,"-")}`}>
                                    <div className="w-40 shrink-0 text-[12.5px] font-bold leading-tight" style={{ color: DL.ink }}>
                                        {p.name}
                                        <div className="text-[10px] mt-0.5 font-normal" style={{ color: DL.muted, fontFamily: DL.fontMono }}>
                                            {p.count} heads
                                        </div>
                                    </div>
                                    <div className="flex-1 h-6 relative rounded-sm overflow-hidden" style={{ background: DL.ivory, border: `1px solid ${DL.rule}` }}>
                                        <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: p.color, transition: "width 500ms ease" }} />
                                    </div>
                                    <div className="w-20 text-right text-[15px] tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: p.color }}>
                                        ₹{p.value}
                                        <span className="text-[10px] ml-0.5" style={{ color: DL.muted, fontWeight: 500 }}>Cr</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Line items — sorted flat list */}
                    <div className="mt-6 pt-5" style={{ borderTop: `1px dashed ${DL.rule}` }}>
                        <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold mb-3" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>
                            Every Line Item · Sorted by ₹
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2" data-testid="warm-line-items-list">
                            {leafRows.map((r) => {
                                const pct = (r.value / maxLeaf) * 100;
                                return (
                                    <div key={`${r.parent}-${r.name}`} className="flex items-center gap-3">
                                        <div className="w-28 shrink-0 min-w-0">
                                            <div className="text-[12px] font-semibold truncate" style={{ color: DL.ink }} title={r.name}>{r.name}</div>
                                            <div className="text-[9.5px] truncate" style={{ color: DL.muted, fontFamily: DL.fontMono }} title={r.parent}>{r.parent}</div>
                                        </div>
                                        <div className="flex-1 h-3 relative rounded-sm overflow-hidden" style={{ background: DL.ivory, border: `1px solid ${DL.rule}` }}>
                                            <div className="h-full" style={{ width: `${pct}%`, background: r.color, transition: "width 500ms ease" }} />
                                        </div>
                                        <div className="w-14 text-right text-[11.5px] font-bold" style={{ fontFamily: DL.fontMono, color: r.color }}>
                                            ₹{r.value}Cr
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </WarmPanel>

                <WarmPanel title="Utilisation Gauge" testid="warm-gauge-panel">
                    <WarmChart option={gaugeOption} height={220} testid="warm-gauge-chart" />
                </WarmPanel>

                <WarmPanel title="Top 5 Overrun Heads" testid="warm-overrun-panel">
                    <WarmChart option={overrunOption} height={220} testid="warm-overrun-chart" />
                </WarmPanel>
            </div>

            <div className="mt-4">
                <WarmPanel title="Invoice Velocity · Monthly" testid="warm-velocity-monthly-panel">
                    <WarmChart option={velocityOption} height={160} testid="warm-velocity-monthly-chart" />
                </WarmPanel>
            </div>
        </div>
    );
}
