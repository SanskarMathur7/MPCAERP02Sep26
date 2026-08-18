import { AlertTriangle, Clock } from "lucide-react";
import { DesignPreviewShell, PageHeader, HudPanel, HudChart, KpiHero, HUD_COLORS } from "./_shared";
import { COMPLIANCE_TYPES, COMPLIANCE_STEPS, COMPLIANCE_CELLS, RED_FLAGS } from "./_mock";

export default function ComplianceMatrix() {
    // ECharts heatmap
    const heatmapOption = {
        tooltip: { formatter: (p) => `<b>${COMPLIANCE_TYPES[p.value[1]]}</b> · ${COMPLIANCE_STEPS[p.value[0]]}<br/>Compliance: ${["FAILING", "AT-RISK", "OK", "GREEN"][p.value[2]]}` },
        grid: { top: 40, right: 20, bottom: 40, left: 130 },
        xAxis: { type: "category", data: COMPLIANCE_STEPS, splitArea: { show: true, areaStyle: { color: ["#111A24", "#0A1118"] } }, axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10, rotate: 30 }, position: "top" },
        yAxis: { type: "category", data: COMPLIANCE_TYPES, splitArea: { show: true, areaStyle: { color: ["#111A24", "#0A1118"] } }, axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        visualMap: {
            min: 0, max: 3, calculable: false, orient: "horizontal", left: "center", bottom: 4, itemWidth: 14, itemHeight: 8,
            pieces: [
                { value: 0, label: "Failing", color: HUD_COLORS.crimson },
                { value: 1, label: "At-Risk", color: HUD_COLORS.marigold },
                { value: 2, label: "OK",      color: HUD_COLORS.cyan },
                { value: 3, label: "Green",   color: HUD_COLORS.pitch },
            ],
            textStyle: { color: "#94A3B8", fontSize: 9, fontFamily: "IBM Plex Mono" },
        },
        series: [{
            type: "heatmap", data: COMPLIANCE_CELLS,
            label: { show: false },
            itemStyle: { borderColor: "#0A1118", borderWidth: 2 },
            emphasis: { itemStyle: { borderColor: "#F8FAFC", borderWidth: 1 } },
        }],
    };

    return (
        <DesignPreviewShell>
            <PageHeader eyebrow="GOVERNANCE" title="Compliance Matrix" kicker="Every tournament type × every wiring step, colour-coded by governance health. Drill through failing cells to open remediation tasks." />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiHero label="Total Cells" value={COMPLIANCE_CELLS.length} accent="cyan" testid="kpi-cells-total" />
                <KpiHero label="Green" value={COMPLIANCE_CELLS.filter((c) => c[2] === 3).length} accent="pitch" testid="kpi-cells-green" />
                <KpiHero label="At-Risk" value={COMPLIANCE_CELLS.filter((c) => c[2] === 1).length} accent="marigold" testid="kpi-cells-at-risk" />
                <KpiHero label="Failing" value={COMPLIANCE_CELLS.filter((c) => c[2] === 0).length} accent="crimson" testid="kpi-cells-failing" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <HudPanel title="8 Types × 10 Steps · Heatmap" className="lg:col-span-2" testid="compliance-heatmap-panel">
                    <HudChart option={heatmapOption} height={420} testid="compliance-heatmap-chart" />
                </HudPanel>

                <HudPanel title="Red-Flag Alerts" right={`${RED_FLAGS.length} open`} testid="redflags-panel">
                    <div className="space-y-3">
                        {RED_FLAGS.map((f, i) => (
                            <div key={i} className="border-l-2 pl-3 py-1" style={{ borderColor: f.severity === "high" ? HUD_COLORS.crimson : HUD_COLORS.marigold }} data-testid={`redflag-${i}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertTriangle size={12} className={f.severity === "high" ? "text-hud-crimson" : "text-hud-marigold"} strokeWidth={1.5} />
                                    <span className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: f.severity === "high" ? HUD_COLORS.crimson : HUD_COLORS.marigold }}>{f.severity}</span>
                                    <span className="font-mono text-[9px] text-hud-text-3 flex items-center gap-1 ml-auto"><Clock size={9} /> {f.age}</span>
                                </div>
                                <div className="text-[11px] text-hud-text leading-snug">{f.title}</div>
                            </div>
                        ))}
                    </div>
                </HudPanel>
            </div>
        </DesignPreviewShell>
    );
}
