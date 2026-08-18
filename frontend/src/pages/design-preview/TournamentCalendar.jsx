import { DesignPreviewShell, PageHeader, HudPanel, HudChart, KpiHero, HUD_COLORS } from "./_shared";
import { MATCH_HEATMAP, FORMAT_MIX, TOURNAMENT_GANTT } from "./_mock";

export default function TournamentCalendar() {
    const heatmapOption = {
        tooltip: { formatter: (p) => `<b>${p.value[0]}</b><br/>${p.value[1]} matches` },
        visualMap: { min: 0, max: 10, orient: "horizontal", left: "center", bottom: 4, itemWidth: 14, itemHeight: 8,
            textStyle: { color: "#94A3B8", fontSize: 9, fontFamily: "IBM Plex Mono" }, inRange: { color: ["#1A2634", "#2A9D8F", "#FFB703", "#FF8A00", "#E63946"] } },
        calendar: {
            top: 20, left: 60, right: 30, range: ["2026-04-01", "2027-03-31"], cellSize: ["auto", 14],
            splitLine: { lineStyle: { color: "#334155" } },
            itemStyle: { color: "#0A1118", borderColor: "#0A1118", borderWidth: 1 },
            dayLabel: { color: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" },
            monthLabel: { color: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" },
            yearLabel: { show: false },
        },
        series: [{ type: "heatmap", coordinateSystem: "calendar", data: MATCH_HEATMAP }],
    };

    const donutOption = {
        tooltip: { trigger: "item", formatter: "{b}<br/>{c} matches ({d}%)" },
        legend: { bottom: 0, textStyle: { color: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" }, itemWidth: 10, itemHeight: 8 },
        series: [{
            type: "pie", radius: ["55%", "80%"], center: ["50%", "44%"], avoidLabelOverlap: false,
            itemStyle: { borderColor: "#0A1118", borderWidth: 2 },
            label: { show: true, color: "#F8FAFC", fontSize: 10, fontFamily: "IBM Plex Mono", formatter: "{b}\n{c}" },
            labelLine: { lineStyle: { color: "#334155" } },
            data: FORMAT_MIX.map((f) => ({ name: f.name, value: f.value, itemStyle: { color: f.color } })),
        }],
    };

    // Simple Gantt via custom series
    const monthStart = new Date("2026-04-01").getTime();
    const monthEnd   = new Date("2027-03-31").getTime();
    const ganttOption = {
        tooltip: { formatter: (p) => `<b>${p.name}</b><br/>${new Date(p.value[1]).toDateString()} → ${new Date(p.value[2]).toDateString()}` },
        grid: { top: 30, right: 20, bottom: 30, left: 160, height: TOURNAMENT_GANTT.length * 22 },
        xAxis: { type: "time", min: monthStart, max: monthEnd, axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 }, splitLine: { lineStyle: { color: "#1E293B" } } },
        yAxis: { type: "category", data: TOURNAMENT_GANTT.map((t) => t.name), axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 }, inverse: true },
        series: [{
            type: "custom",
            renderItem: (params, api) => {
                const cat = api.value(0);
                const start = api.coord([api.value(1), cat]);
                const end   = api.coord([api.value(2), cat]);
                const h = api.size([0, 1])[1] * 0.55;
                const type = api.value(3);
                const color = { BCCI: HUD_COLORS.saffron, INTERDIV: HUD_COLORS.cyan, CHAMPIONSHIP: HUD_COLORS.pitch }[type] || HUD_COLORS.marigold;
                return { type: "rect", shape: { x: start[0], y: start[1] - h / 2, width: end[0] - start[0], height: h }, style: { fill: color } };
            },
            encode: { x: [1, 2], y: 0 },
            data: TOURNAMENT_GANTT.map((t, i) => ({ name: t.name, value: [i, new Date(t.start).getTime(), new Date(t.end).getTime(), t.type] })),
        }],
    };

    return (
        <DesignPreviewShell>
            <PageHeader eyebrow="ANNUAL · 2026-27" title="Tournament Calendar & Performance" kicker="Match density heatmap, tournament spans, and format-mix breakdown for the full season." />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiHero label="Tournaments" value={TOURNAMENT_GANTT.length} accent="saffron" testid="kpi-tournaments-count" />
                <KpiHero label="Matches" value={FORMAT_MIX.reduce((s, f) => s + f.value, 0)} accent="cyan" testid="kpi-matches-total" />
                <KpiHero label="Peak Month" value="NOV" accent="crimson" testid="kpi-peak-month" />
                <KpiHero label="Avg / Day" value="4.8" accent="marigold" testid="kpi-avg-per-day" />
            </div>

            <HudPanel title="Match Density · Calendar Heatmap" className="mb-4" testid="calendar-heatmap-panel">
                <HudChart option={heatmapOption} height={180} testid="calendar-heatmap-chart" />
            </HudPanel>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <HudPanel title="Tournament Spans · Gantt" className="lg:col-span-2" testid="gantt-panel">
                    <HudChart option={ganttOption} height={280} testid="gantt-chart" />
                </HudPanel>
                <HudPanel title="Format Mix" testid="format-mix-panel">
                    <HudChart option={donutOption} height={280} testid="format-mix-chart" />
                </HudPanel>
            </div>
        </DesignPreviewShell>
    );
}
