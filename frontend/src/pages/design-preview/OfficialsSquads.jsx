import { DesignPreviewShell, PageHeader, HudPanel, HudChart, KpiHero, HUD_COLORS } from "./_shared";
import { OFFICIALS_SANKEY, SQUAD_FUNNEL, FITNESS_RADAR, FITNESS_DIMS } from "./_mock";

export default function OfficialsSquads() {
    const sankeyOption = {
        tooltip: { trigger: "item", triggerOn: "mousemove", formatter: (p) => p.dataType === "edge" ? `${p.data.source} → ${p.data.target}: <b>${p.data.value}</b>` : `${p.name}` },
        series: [{
            type: "sankey", left: 10, right: 90, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 8,
            data: OFFICIALS_SANKEY.nodes.map((n) => ({ ...n })),
            links: OFFICIALS_SANKEY.links,
            itemStyle: { borderWidth: 1, borderColor: "#F8FAFC" },
            lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.55 },
            label: { color: "#F8FAFC", fontSize: 10, fontFamily: "IBM Plex Sans" },
            emphasis: { focus: "adjacency", lineStyle: { opacity: 0.85 } },
            levels: [
                { depth: 0, itemStyle: { color: HUD_COLORS.crimson } },
                { depth: 1, itemStyle: { color: HUD_COLORS.saffron } },
                { depth: 2, itemStyle: { color: HUD_COLORS.marigold } },
                { depth: 3, itemStyle: { color: HUD_COLORS.pitch } },
            ],
        }],
    };

    const funnelOption = {
        tooltip: { trigger: "item", formatter: "{b}<br/>{c} players" },
        series: [{
            type: "funnel", left: "10%", top: 10, bottom: 10, width: "80%",
            min: 0, max: SQUAD_FUNNEL[0].value, sort: "descending", gap: 2,
            label: { color: "#F8FAFC", fontFamily: "IBM Plex Mono", fontSize: 11, formatter: "{b} · {c}" },
            labelLine: { length: 12, lineStyle: { color: "#334155" } },
            itemStyle: { borderColor: "#0A1118", borderWidth: 1 },
            data: SQUAD_FUNNEL.map((f, i) => ({ name: f.name, value: f.value, itemStyle: { color: [HUD_COLORS.cyan, HUD_COLORS.pitch, HUD_COLORS.marigold, HUD_COLORS.saffron, HUD_COLORS.crimson][i] } })),
        }],
    };

    const radarOption = {
        tooltip: {},
        legend: { bottom: 0, textStyle: { color: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" }, itemWidth: 10, itemHeight: 8 },
        radar: {
            indicator: FITNESS_DIMS.map((d) => ({ name: d, max: 100 })),
            splitNumber: 5, shape: "polygon", center: ["50%", "48%"], radius: "60%",
            axisName: { color: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" },
            splitLine: { lineStyle: { color: "#334155" } },
            splitArea: { areaStyle: { color: ["#111A24", "#0A1118"] } },
            axisLine: { lineStyle: { color: "#334155" } },
        },
        series: [{
            type: "radar", symbol: "none", lineStyle: { width: 2 },
            data: FITNESS_RADAR.map((r, i) => ({
                name: r.name, value: r.value,
                itemStyle: { color: [HUD_COLORS.saffron, HUD_COLORS.cyan, HUD_COLORS.pitch][i] },
                areaStyle: { color: [HUD_COLORS.saffron, HUD_COLORS.cyan, HUD_COLORS.pitch][i], opacity: 0.15 },
            })),
        }],
    };

    return (
        <DesignPreviewShell>
            <PageHeader eyebrow="HUMAN CAPITAL" title="Officials & Squads" kicker="Panel workload distribution, squad-selection funnel, and fitness profile across age groups." />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiHero label="Officials on Panel" value={112} accent="saffron" testid="kpi-officials-panel" />
                <KpiHero label="Assignments · Season" value={186} accent="cyan" testid="kpi-officials-assignments" />
                <KpiHero label="Players in Trials" value={SQUAD_FUNNEL[1].value} accent="marigold" testid="kpi-players-trials" />
                <KpiHero label="Final Squad" value={SQUAD_FUNNEL[SQUAD_FUNNEL.length - 1].value} accent="pitch" testid="kpi-final-squad" />
            </div>

            <div className="mb-4">
                <HudPanel title="Officials Workload · MPCA Panel → Tournament → Division" right="Sample of 214 assignments" testid="officials-sankey-panel">
                    <HudChart option={sankeyOption} height={320} testid="officials-sankey-chart" />
                </HudPanel>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HudPanel title="Squad Selection Funnel · Sr. Men's" testid="squad-funnel-panel">
                    <HudChart option={funnelOption} height={320} testid="squad-funnel-chart" />
                </HudPanel>
                <HudPanel title="Fitness Profile · Age Groups" testid="fitness-radar-panel">
                    <HudChart option={radarOption} height={320} testid="fitness-radar-chart" />
                </HudPanel>
            </div>
        </DesignPreviewShell>
    );
}
