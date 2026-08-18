import { DesignPreviewShell, PageHeader, HudPanel, HudChart, KpiHero, HUD_COLORS } from "./_shared";
import { BUDGET_TREE, BUDGET_UTILISATION, TOP_OVERRUNS, INVOICE_VELOCITY } from "./_mock";

export default function BudgetHealth() {
    const treemapOption = {
        tooltip: { formatter: (p) => `<b>${p.name}</b><br/>₹${p.value} Cr` },
        series: [{
            type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
            visibleMin: 0.1, data: BUDGET_TREE.children, upperLabel: { show: true, color: "#F8FAFC", fontFamily: "IBM Plex Mono", fontSize: 11, height: 22 },
            itemStyle: { borderColor: "#0A1118", borderWidth: 2, gapWidth: 2 },
            label: { color: "#F8FAFC", fontFamily: "IBM Plex Sans", fontSize: 10 },
            levels: [
                { itemStyle: { borderColor: "#0A1118", borderWidth: 3, gapWidth: 3 }, upperLabel: { show: true, backgroundColor: "#1E293B", padding: [4, 6] } },
                { colorSaturation: [0.3, 0.6], itemStyle: { borderColorSaturation: 0.7, gapWidth: 1, borderWidth: 1 } },
            ],
            color: [HUD_COLORS.saffron, HUD_COLORS.crimson, HUD_COLORS.cyan, HUD_COLORS.pitch, HUD_COLORS.marigold, "#B84AA6"],
        }],
    };

    const gaugeOption = {
        series: [{
            type: "gauge", startAngle: 210, endAngle: -30, min: 0, max: 100, splitNumber: 10,
            axisLine: { lineStyle: { width: 18, color: [[0.6, HUD_COLORS.pitch], [0.85, HUD_COLORS.marigold], [1, HUD_COLORS.crimson]] } },
            pointer: { itemStyle: { color: "#F8FAFC" }, length: "58%", width: 4 },
            progress: { show: false },
            splitLine: { length: 8, distance: -20, lineStyle: { color: "#0A1118", width: 2 } },
            axisTick: { length: 4, distance: -14, lineStyle: { color: "#334155" } },
            axisLabel: { color: "#64748B", fontSize: 9, distance: -34 },
            detail: { valueAnimation: true, formatter: "{value}%", color: HUD_COLORS.saffron, fontSize: 32, fontFamily: "'Bebas Neue'", offsetCenter: [0, "70%"] },
            title: { color: "#94A3B8", fontSize: 10, offsetCenter: [0, "94%"], fontFamily: "IBM Plex Mono" },
            data: [{ value: Math.round(BUDGET_UTILISATION * 100), name: "UTILISATION" }],
        }],
    };

    const overrunOption = {
        grid: { top: 6, right: 10, bottom: 6, left: 130 },
        xAxis: { type: "value", axisLine: { show: false }, axisLabel: { color: "#64748B", fontSize: 9 }, splitLine: { lineStyle: { color: "#1E293B" } }, max: 130 },
        yAxis: { type: "category", data: TOP_OVERRUNS.map((o) => o.head).reverse(), axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        tooltip: { trigger: "axis", formatter: (p) => `${p[0].name}: <b>${p[0].value}%</b>` },
        series: [{
            type: "bar", data: TOP_OVERRUNS.map((o) => ({ value: o.pct, itemStyle: { color: o.pct > 115 ? HUD_COLORS.crimson : HUD_COLORS.saffron } })).reverse(),
            barWidth: "60%", label: { show: true, position: "right", color: "#F8FAFC", fontFamily: "IBM Plex Mono", fontSize: 10, formatter: "{c}%" },
            markLine: { data: [{ xAxis: 100, lineStyle: { color: HUD_COLORS.crimson, type: "dashed" }, label: { color: HUD_COLORS.crimson, fontSize: 9, formatter: "100%" } }], symbol: "none" },
        }],
    };

    const velocityOption = {
        grid: { top: 10, right: 10, bottom: 24, left: 32 },
        xAxis: { type: "category", data: ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"], axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        yAxis: { type: "value", axisLine: { show: false }, splitLine: { lineStyle: { color: "#1E293B" } }, axisLabel: { color: "#94A3B8", fontSize: 9 } },
        tooltip: { trigger: "axis" },
        series: [{ name: "Invoices", type: "line", smooth: true, data: INVOICE_VELOCITY, lineStyle: { color: HUD_COLORS.cyan, width: 2 }, symbol: "circle", symbolSize: 6, itemStyle: { color: HUD_COLORS.cyan }, areaStyle: { color: "rgba(0,180,216,0.15)" } }],
    };

    return (
        <DesignPreviewShell>
            <PageHeader eyebrow="FISCAL · 2026-27" title="Budget Health" kicker="Season-wide budget deployment. Treemap surfaces where money is going; gauges surface how fast." />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiHero label="Approved Budget" value="30.8" suffix=" Cr" accent="cyan" testid="kpi-budget-approved" />
                <KpiHero label="Committed" value="22.8" suffix=" Cr" accent="saffron" testid="kpi-budget-committed" />
                <KpiHero label="Utilisation" value={`${Math.round(BUDGET_UTILISATION * 100)}%`} accent="marigold" testid="kpi-budget-util" />
                <KpiHero label="Overrun Heads" value={TOP_OVERRUNS.filter((o) => o.pct > 100).length} accent="crimson" testid="kpi-budget-overruns" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <HudPanel title="Budget Head · Treemap" className="lg:col-span-2 lg:row-span-2" testid="treemap-panel">
                    <HudChart option={treemapOption} height={500} testid="treemap-chart" />
                </HudPanel>

                <HudPanel title="Utilisation Gauge" testid="gauge-panel">
                    <HudChart option={gaugeOption} height={220} testid="gauge-chart" />
                </HudPanel>

                <HudPanel title="Top 5 Overrun Heads" testid="overrun-panel">
                    <HudChart option={overrunOption} height={220} testid="overrun-chart" />
                </HudPanel>
            </div>

            <div className="mt-4">
                <HudPanel title="Invoice Velocity · Monthly" testid="velocity-monthly-panel">
                    <HudChart option={velocityOption} height={160} testid="velocity-monthly-chart" />
                </HudPanel>
            </div>
        </DesignPreviewShell>
    );
}
