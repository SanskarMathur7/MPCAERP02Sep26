/**
 * WarmBudgetHealth — ported from /design-preview/BudgetHealth.jsx into the
 * Institutional Warm palette. Treemap · gauge · overrun bars · velocity line.
 */
import { BUDGET_TREE, BUDGET_UTILISATION, TOP_OVERRUNS, INVOICE_VELOCITY } from "@/pages/design-preview/_mock";
import { DL } from "@/lib/designSystem";
import { WarmPanel, WarmChart, WarmKpiHero, WarmPageHeader, WARM_COLORS, SampleChip } from "./_warm";

export default function WarmBudgetHealth() {
    const warmTreePalette = [
        WARM_COLORS.emerald, WARM_COLORS.gold, WARM_COLORS.terracotta,
        WARM_COLORS.oxblood, WARM_COLORS.goldSoft, WARM_COLORS.olive,
    ];

    const treemapOption = {
        tooltip: { formatter: (p) => `<b>${p.name}</b><br/>₹${p.value} Cr` },
        series: [{
            type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
            visibleMin: 0.1,
            data: BUDGET_TREE.children,
            upperLabel: { show: true, color: DL.paper, fontFamily: "Nunito", fontWeight: 700, fontSize: 11, height: 22 },
            itemStyle: { borderColor: DL.paper, borderWidth: 2, gapWidth: 2 },
            label: { color: DL.paper, fontFamily: "Nunito", fontSize: 10, fontWeight: 600 },
            levels: [
                { itemStyle: { borderColor: DL.paper, borderWidth: 3, gapWidth: 3 }, upperLabel: { show: true, backgroundColor: DL.ink, padding: [4, 6] } },
                { colorSaturation: [0.35, 0.65], itemStyle: { borderColorSaturation: 0.7, gapWidth: 1, borderWidth: 1 } },
            ],
            color: warmTreePalette,
        }],
    };

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
                valueAnimation: true, formatter: "{value}%",
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
                right={<SampleChip />}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <WarmKpiHero label="Approved Budget" value="30.8" suffix="Cr" accent="emerald" testid="warm-kpi-budget-approved" />
                <WarmKpiHero label="Committed"       value="22.8" suffix="Cr" accent="gold"    testid="warm-kpi-budget-committed" />
                <WarmKpiHero label="Utilisation"     value={`${Math.round(BUDGET_UTILISATION * 100)}%`} accent="goldSoft" testid="warm-kpi-budget-util" />
                <WarmKpiHero label="Overrun Heads"   value={TOP_OVERRUNS.filter((o) => o.pct > 100).length} accent="oxblood" testid="warm-kpi-budget-overruns" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <WarmPanel title="Budget Head · Treemap" className="lg:col-span-2 lg:row-span-2" testid="warm-treemap-panel">
                    <WarmChart option={treemapOption} height={500} testid="warm-treemap-chart" />
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
