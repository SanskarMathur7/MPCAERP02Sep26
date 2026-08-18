import Marquee from "react-fast-marquee";
import { DesignPreviewShell, PageHeader, HudPanel, HudChart, KpiHero, PulseDot, HUD_COLORS } from "./_shared";
import { FINANCIAL_SANKEY, CASH_MONTHLY } from "./_mock";

export default function FinancialFlow() {
    const sankeyOption = {
        tooltip: { trigger: "item", triggerOn: "mousemove", formatter: (p) => p.dataType === "edge" ? `${p.data.source} → ${p.data.target}: <b>₹${p.data.value} Cr</b>` : `${p.name}` },
        series: [{
            type: "sankey", left: 10, right: 130, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 6,
            data: FINANCIAL_SANKEY.nodes.map((n) => ({ ...n })),
            links: FINANCIAL_SANKEY.links,
            layoutIterations: 32,
            itemStyle: { borderWidth: 1, borderColor: "#F8FAFC" },
            lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.6 },
            label: { color: "#F8FAFC", fontSize: 10, fontFamily: "IBM Plex Mono" },
            emphasis: { focus: "adjacency", lineStyle: { opacity: 0.9 } },
            levels: [
                { depth: 0, itemStyle: { color: HUD_COLORS.crimson } },
                { depth: 1, itemStyle: { color: HUD_COLORS.saffron } },
                { depth: 2, itemStyle: { color: HUD_COLORS.marigold } },
                { depth: 3, itemStyle: { color: HUD_COLORS.pitch } },
                { depth: 4, itemStyle: { color: HUD_COLORS.cyan } },
            ],
        }],
    };

    const cashOption = {
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        legend: { bottom: 0, textStyle: { color: "#94A3B8", fontSize: 10, fontFamily: "IBM Plex Mono" }, itemWidth: 10, itemHeight: 8 },
        grid: { top: 20, right: 12, bottom: 40, left: 40 },
        xAxis: { type: "category", data: CASH_MONTHLY.map((c) => c.m), axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        yAxis: { type: "value", name: "₹ Cr", nameTextStyle: { color: "#64748B", fontSize: 10 }, axisLine: { show: false }, splitLine: { lineStyle: { color: "#1E293B" } }, axisLabel: { color: "#94A3B8", fontSize: 10 } },
        series: [
            { name: "Inflow (BCCI)", type: "line", smooth: true, symbol: "circle", symbolSize: 6,
              data: CASH_MONTHLY.map((c) => c.in_cr), lineStyle: { color: HUD_COLORS.pitch, width: 2 }, itemStyle: { color: HUD_COLORS.pitch },
              areaStyle: { color: "rgba(42,157,143,0.20)" } },
            { name: "Outflow (Grants)", type: "line", smooth: true, symbol: "circle", symbolSize: 6,
              data: CASH_MONTHLY.map((c) => c.out_cr), lineStyle: { color: HUD_COLORS.saffron, width: 2 }, itemStyle: { color: HUD_COLORS.saffron },
              areaStyle: { color: "rgba(255,138,0,0.15)" } },
        ],
    };

    const OUTFLOW_TICKER = [
        "₹32.5L → DIV-IND · Match Fee Reimbursement · UTR AXISN20260218-8871",
        "₹18.4L → DIV-BPL · Travel Grant · UTR SBIN20260218-1123",
        "₹9.2L → DIV-GWL · Coaching Camp Grant · UTR ICIC20260218-9992",
        "₹7.8L → DIV-SHM · Travel Grant · UTR HDFC20260218-4451",
        "₹6.8L → DIV-JBP · Match Officials DA · UTR AXISN20260218-6673",
        "₹4.4L → DIV-UJN · Kit Grant · UTR KOTAK20260218-3312",
    ];

    return (
        <DesignPreviewShell>
            <PageHeader eyebrow="MONEY MOVEMENT" title="Financial Flow" kicker="A single-view map of every rupee: from BCCI Central to a club net at ground level." />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KpiHero label="Inflow YTD" value="92" suffix=" Cr" accent="pitch" testid="kpi-inflow" />
                <KpiHero label="Outflow YTD" value="76" suffix=" Cr" accent="saffron" testid="kpi-outflow" />
                <KpiHero label="Net Corpus" value="16" suffix=" Cr" accent="cyan" testid="kpi-net-corpus" />
                <KpiHero label="Receivable · BCCI" value="42" suffix=" L" accent="crimson" testid="kpi-receivable" />
            </div>

            {/* Outflow ticker */}
            <div className="border border-hud-panel bg-black mb-4" data-testid="outflow-ticker">
                <div className="flex items-stretch">
                    <div className="bg-hud-saffron text-hud-base px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] shrink-0 flex items-center gap-2">
                        <PulseDot color="crimson" /> TREASURER · OUTFLOW
                    </div>
                    <Marquee gradient={false} speed={40} pauseOnHover className="flex-1">
                        {OUTFLOW_TICKER.map((t, i) => (
                            <span key={i} className="font-mono text-[11px] text-hud-marigold py-2 mx-8">
                                <span className="text-hud-crimson mr-2">▶</span>{t}
                            </span>
                        ))}
                    </Marquee>
                </div>
            </div>

            <div className="mb-4">
                <HudPanel title="BCCI · MPCA · Divisions · Districts · Clubs · Sankey (₹ Cr)" right="₹92 Cr traced" testid="financial-sankey-panel">
                    <HudChart option={sankeyOption} height={440} testid="financial-sankey-chart" />
                </HudPanel>
            </div>

            <HudPanel title="Monthly Cash Flow · Inflow vs Outflow" testid="cashflow-panel">
                <HudChart option={cashOption} height={240} testid="cashflow-chart" />
            </HudPanel>
        </DesignPreviewShell>
    );
}
