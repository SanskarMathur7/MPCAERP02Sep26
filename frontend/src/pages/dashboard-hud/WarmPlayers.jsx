/**
 * WarmPlayers — Players analytics tab (Iter 107). SAMPLE DATA until wired.
 * Tiles: a) Registration funnel · b) KYC ageing · c) Doc completeness ·
 *        d) AI validation split · e) Guest quota gauges · f) Category donut ·
 *        g) Age-group pyramid · h) Court/Suspended alert · j) Positional balance ·
 *        k) Debutants YTD · l) Cross-tournament load · m) Division distribution ·
 *        n) Transfers this season.
 */
import { Users, ShieldCheck, AlertTriangle, Sparkles, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DL } from "@/lib/designSystem";
import { WarmPanel, WarmChart, WarmKpiHero, WarmPageHeader, WARM_COLORS, SampleChip, ScopeChip } from "./_warm";
import { scopePlayerMocks, scopeLabel } from "./_mockScope";

/* ---------- Sample data (state-wide baseline) ------------------------ */
const RAW_KPIS = { active: 1284, pending: 63, suspended: 4, debutants_ytd: 187, court_order: 2 };

const RAW_FUNNEL = [
    { name: "Draft",                     value: 1610 },
    { name: "Submitted",                 value: 1502 },
    { name: "Under Division Review",     value: 1420 },
    { name: "Division Approved",         value: 1372 },
    { name: "Active",                    value: 1284 },
];

const RAW_KYC_AGEING = [
    { bucket: "0-7 d",    count: 38, color: WARM_COLORS.emerald },
    { bucket: "8-14 d",   count: 24, color: WARM_COLORS.gold },
    { bucket: "15-30 d",  count: 14, color: WARM_COLORS.goldSoft },
    { bucket: "30+ d",    count:  8, color: WARM_COLORS.oxblood },
];

const RAW_DOC_COMPLETENESS = { complete: 1147, incomplete: 137, total: 1284 };

const RAW_AI_SPLIT = [
    { name: "Clean",           value: 1120, color: WARM_COLORS.emerald },
    { name: "Warning",         value: 128,  color: WARM_COLORS.gold },
    { name: "Suspected Fraud", value: 36,   color: WARM_COLORS.oxblood },
];

const RAW_GUEST_QUOTAS = [
    { label: "MP Domicile",  used: 42,  cap: 60 },
    { label: "Education",    used: 18,  cap: 30 },
    { label: "Out of MP",    used: 27,  cap: 30 },
];

const RAW_CATEGORY_MIX = [
    { name: "Local · MP",     value: 1041, color: WARM_COLORS.emerald },
    { name: "Born Outside",   value: 156,  color: WARM_COLORS.gold },
    { name: "Guest",          value: 87,   color: WARM_COLORS.terracotta },
];

const RAW_AGE_PYRAMID = [
    { grp: "U-14",   men: 118, women: 42 },
    { grp: "U-16",   men: 164, women: 58 },
    { grp: "U-19",   men: 212, women: 71 },
    { grp: "U-23",   men: 189, women: 63 },
    { grp: "Senior", men: 288, women: 79 },
];

const RAW_POSITIONAL = [
    { name: "Batter",      value: 470, color: WARM_COLORS.emerald },
    { name: "Bowler",      value: 386, color: WARM_COLORS.gold },
    { name: "All-rounder", value: 312, color: WARM_COLORS.terracotta },
    { name: "WK",          value: 116, color: WARM_COLORS.oxblood },
];

const RAW_CROSS_LOAD = [
    { name: "Aditya Rathore",    squads: 5 }, { name: "Priyansh Sharma", squads: 5 },
    { name: "Rajat Patidar",     squads: 4 }, { name: "Venkatesh Iyer",  squads: 4 },
    { name: "Shubhangi Kulkarni",squads: 4 }, { name: "Yash Dubey",      squads: 3 },
    { name: "Kumar Kartikeya",   squads: 3 }, { name: "Avesh Khan",      squads: 3 },
    { name: "Puneet Datey",      squads: 3 }, { name: "Aryan Juyal",     squads: 3 },
];

const RAW_DIV_DISTRIBUTION = [
    { code: "DIV-IND", players: 214 }, { code: "DIV-BPL", players: 187 },
    { code: "DIV-GWL", players: 156 }, { code: "DIV-JBP", players: 138 },
    { code: "DIV-UJN", players: 124 }, { code: "DIV-CHM", players: 118 },
    { code: "DIV-SGR", players: 107 }, { code: "DIV-RTL", players:  92 },
    { code: "DIV-RWA", players:  82 }, { code: "DIV-STN", players:  66 },
];

const RAW_TRANSFERS = [
    { division: "DIV-IND", inbound: 12, outbound:  6, pending: 3 },
    { division: "DIV-BPL", inbound:  8, outbound:  4, pending: 2 },
    { division: "DIV-GWL", inbound:  6, outbound:  9, pending: 4 },
    { division: "DIV-JBP", inbound:  5, outbound:  5, pending: 1 },
    { division: "DIV-UJN", inbound:  4, outbound:  3, pending: 2 },
];

/* ---------- Small helpers ------------------------------------------- */
const Bar = ({ pct, color, height = 8 }) => (
    <div className="flex-1 rounded-sm overflow-hidden" style={{ background: DL.ivory, border: `1px solid ${DL.rule}`, height }}>
        <div className="h-full" style={{ width: `${pct}%`, background: color, transition: "width 500ms ease" }} />
    </div>
);

const GaugeMini = ({ label, used, cap }) => {
    const pct = Math.round((used / cap) * 100);
    const tone = pct >= 90 ? WARM_COLORS.oxblood : pct >= 70 ? WARM_COLORS.gold : WARM_COLORS.emerald;
    return (
        <div className="flex flex-col items-center text-center px-2" data-testid={`warm-quota-${label.toLowerCase().replace(/\s+/g,"-")}`}>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{label}</div>
            <div className="relative w-24 h-24">
                <svg viewBox="0 0 100 100" width="96" height="96">
                    <circle cx="50" cy="50" r="42" fill="none" stroke={DL.rule} strokeWidth="9" />
                    <circle
                        cx="50" cy="50" r="42" fill="none" stroke={tone} strokeWidth="9"
                        strokeDasharray={`${(pct * 2.639).toFixed(2)} ${(100 * 2.639).toFixed(2)}`}
                        strokeDashoffset="0" transform="rotate(-90 50 50)" strokeLinecap="round"
                        style={{ transition: "stroke-dasharray 500ms ease" }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-[22px] leading-none" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: tone }}>{pct}%</div>
                    <div className="text-[9.5px] mt-0.5" style={{ fontFamily: DL.fontMono, color: DL.muted }}>{used}/{cap}</div>
                </div>
            </div>
        </div>
    );
};

/* ---------- Main --------------------------------------------------- */
export default function WarmPlayers() {
    const { persona } = useAuth();
    const {
        KPIS, FUNNEL, KYC_AGEING, DOC_COMPLETENESS, AI_SPLIT, GUEST_QUOTAS, CATEGORY_MIX,
        AGE_PYRAMID, POSITIONAL, CROSS_LOAD, DIV_DISTRIBUTION, TRANSFERS,
    } = scopePlayerMocks(persona, {
        KPIS: RAW_KPIS, FUNNEL: RAW_FUNNEL, KYC_AGEING: RAW_KYC_AGEING,
        DOC_COMPLETENESS: RAW_DOC_COMPLETENESS, AI_SPLIT: RAW_AI_SPLIT,
        GUEST_QUOTAS: RAW_GUEST_QUOTAS, CATEGORY_MIX: RAW_CATEGORY_MIX,
        AGE_PYRAMID: RAW_AGE_PYRAMID, POSITIONAL: RAW_POSITIONAL,
        CROSS_LOAD: RAW_CROSS_LOAD, DIV_DISTRIBUTION: RAW_DIV_DISTRIBUTION,
        TRANSFERS: RAW_TRANSFERS,
    });
    // Chart options — kept minimal, warm-themed
    const donutOption = {
        tooltip: { trigger: "item", formatter: "{b}<br/><b>{c}</b> ({d}%)" },
        legend: { bottom: 0, textStyle: { color: WARM_COLORS.text2, fontSize: 10.5, fontFamily: "Nunito" }, itemWidth: 10, itemHeight: 8 },
        series: [{
            type: "pie", radius: ["48%", "72%"], center: ["50%", "44%"],
            avoidLabelOverlap: true, itemStyle: { borderColor: DL.paper, borderWidth: 3 },
            label: { show: true, color: WARM_COLORS.text, fontFamily: "Nunito", fontWeight: 700, fontSize: 11, formatter: "{b}\n{c}" },
            labelLine: { length: 8, length2: 6, lineStyle: { color: WARM_COLORS.axis } },
            data: CATEGORY_MIX.map((c) => ({ name: c.name, value: c.value, itemStyle: { color: c.color } })),
        }],
    };

    const pyramidOption = {
        grid: { top: 20, right: 20, bottom: 24, left: 60 },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p) => `${p[0].name}<br/>Men <b>${Math.abs(p[0].value)}</b> · Women <b>${p[1]?.value ?? 0}</b>` },
        legend: { data: ["Men", "Women"], top: 0, textStyle: { color: WARM_COLORS.text2, fontFamily: "Nunito", fontSize: 10.5 }, itemWidth: 10, itemHeight: 8 },
        xAxis: { type: "value", axisLine: { show: false }, axisLabel: { color: WARM_COLORS.text3, fontSize: 9, formatter: (v) => Math.abs(v) }, splitLine: { lineStyle: { color: WARM_COLORS.split } } },
        yAxis: { type: "category", data: AGE_PYRAMID.map((r) => r.grp), axisLine: { lineStyle: { color: WARM_COLORS.axis } }, axisLabel: { color: WARM_COLORS.text2, fontSize: 11, fontWeight: 700 } },
        series: [
            { name: "Men",   type: "bar", stack: "total", data: AGE_PYRAMID.map((r) => -r.men),   itemStyle: { color: WARM_COLORS.emerald }, label: { show: true, position: "insideLeft",  color: DL.paper, fontFamily: "Nunito", fontSize: 10, fontWeight: 700, formatter: (p) => Math.abs(p.value) } },
            { name: "Women", type: "bar", stack: "total", data: AGE_PYRAMID.map((r) =>  r.women), itemStyle: { color: WARM_COLORS.gold },    label: { show: true, position: "insideRight", color: DL.ink,   fontFamily: "Nunito", fontSize: 10, fontWeight: 700 } },
        ],
    };

    const funnelMax = FUNNEL[0].value;
    const docPct = Math.round((DOC_COMPLETENESS.complete / DOC_COMPLETENESS.total) * 100);
    const aiTotal = AI_SPLIT.reduce((s, x) => s + x.value, 0);
    const kycMax = Math.max(...KYC_AGEING.map((k) => k.count));
    const posMax = Math.max(...POSITIONAL.map((p) => p.value));
    const loadMax = Math.max(...CROSS_LOAD.map((r) => r.squads));
    const divMax = Math.max(...DIV_DISTRIBUTION.map((d) => d.players));

    return (
        <div>
            <WarmPageHeader
                eyebrow="Human Capital · 2026-27"
                title="Players"
                kicker="Registrations, KYC, eligibility, squads — the human capital powering every trophy."
                right={<div className="flex items-center gap-2"><ScopeChip label={scopeLabel(persona)} /><SampleChip /></div>}
            />

            {/* Row 1 · KPI hero band */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                <WarmKpiHero label="Active"          value={KPIS.active.toLocaleString("en-IN")} accent="emerald" testid="warm-kpi-p-active" />
                <WarmKpiHero label="Pending"         value={KPIS.pending}      accent="gold"    testid="warm-kpi-p-pending" />
                <WarmKpiHero label="Suspended"       value={KPIS.suspended}    accent="oxblood" testid="warm-kpi-p-suspended" />
                <WarmKpiHero label="Court Order"     value={KPIS.court_order}  accent="oxblood" testid="warm-kpi-p-court" />
                <WarmKpiHero label="Debutants YTD"   value={KPIS.debutants_ytd} accent="goldSoft" trend={{ dir: "up", value: "+42", label: "vs last season" }} testid="warm-kpi-p-debutants" />
            </div>

            {/* Row 2 · Registration funnel  +  AI validation split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <WarmPanel title="Registration Funnel" subtitle="Draft → Active · drop-off at each stage" className="lg:col-span-2" testid="warm-p-funnel-panel">
                    <div className="space-y-2.5" data-testid="warm-p-funnel-list">
                        {FUNNEL.map((s, i) => {
                            const pct = (s.value / funnelMax) * 100;
                            const prev = i === 0 ? s.value : FUNNEL[i - 1].value;
                            const dropPct = i === 0 ? null : Math.round(((prev - s.value) / prev) * 100);
                            return (
                                <div key={s.name} className="flex items-center gap-4">
                                    <div className="w-52 shrink-0 text-[12.5px] font-bold" style={{ color: DL.ink }}>{s.name}</div>
                                    <Bar pct={pct} color={i === FUNNEL.length - 1 ? WARM_COLORS.emerald : WARM_COLORS.gold} height={22} />
                                    <div className="w-20 text-right text-[15px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink }}>{s.value.toLocaleString("en-IN")}</div>
                                    <div className="w-16 text-right text-[10.5px] font-bold" style={{ fontFamily: DL.fontMono, color: dropPct > 0 ? DL.danger : DL.muted }}>
                                        {dropPct == null ? "—" : `−${dropPct}%`}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </WarmPanel>

                <WarmPanel title="AI Validation Split" subtitle={`${aiTotal.toLocaleString("en-IN")} checked`} testid="warm-p-ai-panel">
                    <div className="space-y-3" data-testid="warm-p-ai-list">
                        {AI_SPLIT.map((s) => {
                            const pct = (s.value / aiTotal) * 100;
                            const Icon = s.name === "Clean" ? ShieldCheck : s.name === "Warning" ? Sparkles : AlertTriangle;
                            return (
                                <div key={s.name}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: DL.ink }}>
                                            <Icon size={13} strokeWidth={2} style={{ color: s.color }} />
                                            {s.name}
                                        </div>
                                        <div className="text-[13px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: s.color }}>
                                            {s.value} <span className="text-[10px]" style={{ color: DL.muted, fontWeight: 500 }}>({Math.round(pct)}%)</span>
                                        </div>
                                    </div>
                                    <Bar pct={pct} color={s.color} height={10} />
                                </div>
                            );
                        })}
                    </div>
                </WarmPanel>
            </div>

            {/* Row 3 · Guest quota gauges  +  KYC ageing  +  Doc completeness */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <WarmPanel title="Guest Quotas" subtitle="Used vs cap · MP Domicile · Education · Out of MP" testid="warm-p-quota-panel">
                    <div className="flex items-start justify-around py-2">
                        {GUEST_QUOTAS.map((q) => <GaugeMini key={q.label} {...q} />)}
                    </div>
                </WarmPanel>

                <WarmPanel title="KYC Ageing" subtitle="Days docs have been sitting unverified" testid="warm-p-kyc-panel">
                    <div className="space-y-3" data-testid="warm-p-kyc-list">
                        {KYC_AGEING.map((k) => {
                            const pct = (k.count / kycMax) * 100;
                            return (
                                <div key={k.bucket} className="flex items-center gap-3">
                                    <div className="w-16 shrink-0 text-[11px] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink }}>{k.bucket}</div>
                                    <Bar pct={pct} color={k.color} height={14} />
                                    <div className="w-10 text-right text-[13px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: k.color }}>{k.count}</div>
                                </div>
                            );
                        })}
                    </div>
                </WarmPanel>

                <WarmPanel title="Document Completeness" subtitle="Active players with all mandatory KYC" testid="warm-p-doc-panel">
                    <div className="flex flex-col items-center text-center py-4">
                        <div className="text-[52px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: docPct >= 90 ? WARM_COLORS.emerald : docPct >= 70 ? WARM_COLORS.gold : WARM_COLORS.oxblood }}>{docPct}%</div>
                        <div className="text-[11px] mt-2" style={{ fontFamily: DL.fontMono, color: DL.muted }}>
                            {DOC_COMPLETENESS.complete.toLocaleString("en-IN")} of {DOC_COMPLETENESS.total.toLocaleString("en-IN")}
                        </div>
                        <div className="w-full mt-4"><Bar pct={docPct} color={docPct >= 90 ? WARM_COLORS.emerald : docPct >= 70 ? WARM_COLORS.gold : WARM_COLORS.oxblood} height={12} /></div>
                        <div className="mt-3 text-[11px] font-bold" style={{ color: DL.danger, fontFamily: DL.fontMono }}>
                            {DOC_COMPLETENESS.incomplete} incomplete
                        </div>
                    </div>
                </WarmPanel>
            </div>

            {/* Row 4 · Age pyramid  +  Category donut */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <WarmPanel title="Age-Group Pyramid" subtitle="U-14 · U-16 · U-19 · U-23 · Senior · Men vs Women" className="lg:col-span-2" testid="warm-p-pyramid-panel">
                    <WarmChart option={pyramidOption} height={280} testid="warm-p-pyramid-chart" />
                </WarmPanel>
                <WarmPanel title="Category Mix" subtitle="Local · Born Outside · Guest" testid="warm-p-donut-panel">
                    <WarmChart option={donutOption} height={280} testid="warm-p-donut-chart" />
                </WarmPanel>
            </div>

            {/* Row 5 · Positional balance  +  Cross-tournament load */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <WarmPanel title="Positional Balance" subtitle="Batter · Bowler · All-rounder · WK" testid="warm-p-position-panel">
                    <div className="space-y-3" data-testid="warm-p-position-list">
                        {POSITIONAL.map((p) => {
                            const pct = (p.value / posMax) * 100;
                            return (
                                <div key={p.name} className="flex items-center gap-3">
                                    <div className="w-28 shrink-0 text-[12.5px] font-bold" style={{ color: DL.ink }}>{p.name}</div>
                                    <Bar pct={pct} color={p.color} height={16} />
                                    <div className="w-16 text-right text-[15px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: p.color }}>{p.value}</div>
                                </div>
                            );
                        })}
                    </div>
                </WarmPanel>

                <WarmPanel title="Cross-Tournament Load" subtitle="Top 10 players by squad-count · overload watchlist" testid="warm-p-load-panel">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2" data-testid="warm-p-load-list">
                        {CROSS_LOAD.map((r) => {
                            const pct = (r.squads / loadMax) * 100;
                            const tone = r.squads >= 5 ? WARM_COLORS.oxblood : r.squads >= 4 ? WARM_COLORS.gold : WARM_COLORS.emerald;
                            return (
                                <div key={r.name} className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0 text-[11.5px] font-bold truncate" style={{ color: DL.ink }} title={r.name}>{r.name}</div>
                                    <Bar pct={pct} color={tone} height={7} />
                                    <div className="w-4 text-right text-[12px] font-bold" style={{ fontFamily: DL.fontMono, color: tone }}>{r.squads}</div>
                                </div>
                            );
                        })}
                    </div>
                </WarmPanel>
            </div>

            {/* Row 6 · Division distribution + Transfers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <WarmPanel title="Division-Wise Player Distribution" subtitle="Active roster count per Division · sorted" className="lg:col-span-2" testid="warm-p-div-panel">
                    <div className="space-y-2.5" data-testid="warm-p-div-list">
                        {DIV_DISTRIBUTION.map((d, i) => {
                            const pct = (d.players / divMax) * 100;
                            const color = i < 3 ? WARM_COLORS.emerald : i < 7 ? WARM_COLORS.gold : WARM_COLORS.terracotta;
                            return (
                                <div key={d.code} className="flex items-center gap-3">
                                    <div className="w-24 shrink-0 text-[11.5px] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink }}>{d.code}</div>
                                    <Bar pct={pct} color={color} height={16} />
                                    <div className="w-16 text-right text-[15px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color }}>{d.players}</div>
                                </div>
                            );
                        })}
                    </div>
                </WarmPanel>

                <WarmPanel title="Transfers This Season" subtitle="Inbound · Outbound · Pending" testid="warm-p-transfer-panel">
                    <div className="space-y-3" data-testid="warm-p-transfer-list">
                        {TRANSFERS.map((t) => (
                            <div key={t.division} className="pb-2.5" style={{ borderBottom: `1px dashed ${DL.rule}` }}>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-[11.5px] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink }}>{t.division}</div>
                                    <div className="text-[9.5px] font-bold" style={{ color: DL.muted, fontFamily: DL.fontMono }}>{t.pending} pending</div>
                                </div>
                                <div className="flex items-center gap-4 text-[12px]">
                                    <div className="flex items-center gap-1" style={{ color: WARM_COLORS.emerald }} title="Inbound">
                                        <ArrowDownRight size={12} strokeWidth={2.5} />
                                        <span className="font-bold" style={{ fontFamily: DL.fontDisplay }}>{t.inbound}</span>
                                    </div>
                                    <div className="flex items-center gap-1" style={{ color: WARM_COLORS.oxblood }} title="Outbound">
                                        <ArrowUpRight size={12} strokeWidth={2.5} />
                                        <span className="font-bold" style={{ fontFamily: DL.fontDisplay }}>{t.outbound}</span>
                                    </div>
                                    <div className="text-[10.5px]" style={{ color: DL.muted, fontFamily: DL.fontMono }}>
                                        net {t.inbound - t.outbound >= 0 ? "+" : ""}{t.inbound - t.outbound}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </WarmPanel>
            </div>
        </div>
    );
}
