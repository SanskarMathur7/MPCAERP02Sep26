/**
 * dashboard-hud/_warm.jsx — Institutional-Warm variants of the /design-preview HUD
 * ------------------------------------------------------------------------------
 * The /design-preview HUD panels live on a dark navy palette (broadcast look).
 * Inside the Command Centre Dashboard we want the SAME charts but painted with
 * the same ivory + emerald + gold system the rest of the ERP uses (see DL in
 * /src/lib/designSystem.jsx). This file provides matching WarmPanel, WarmChart,
 * WarmKpiHero, PulseDot, PageHeader helpers so the ported panels stay one-line.
 */
import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { DL } from "@/lib/designSystem";

/* ---------- Warm palette for ECharts ---------------------------------- */
export const WARM_COLORS = {
    emerald: DL.emerald,       // #0D3B2E — primary charts
    gold:    DL.gold,          // #B88328 — accent
    goldSoft:"#D4A017",        // warmer amber
    oxblood: DL.danger,        // #8B1F1F — alerts / overrun
    olive:   DL.muted,         // #4C5750 — muted trend
    terracotta: "#B5533C",     // secondary warm accent
    text:    DL.ink,           // #0E1F1B — chart labels
    text2:   DL.ink2,          // #1F2E28
    text3:   DL.muted,         // #4C5750
    axis:    "rgba(184,131,40,0.55)",
    split:   "rgba(184,131,40,0.16)",
    surface: DL.paper,         // #FBF8F1 — chart background
};

/* ---------- ECharts theme (single source of truth) -------------------- */
const WARM_THEME = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Nunito, ui-sans-serif", color: WARM_COLORS.text2 },
    tooltip: {
        backgroundColor: DL.paper,
        borderColor: DL.ruleStrong,
        borderWidth: 1,
        textStyle: { color: WARM_COLORS.text, fontFamily: "Nunito" },
        extraCssText: "border-radius: 4px; box-shadow: 0 8px 24px -8px rgba(14,31,27,0.25);",
    },
    grid: { top: 24, right: 16, bottom: 28, left: 44, containLabel: true },
};

/* ---------- WarmChart --------------------------------------------------- */
export const WarmChart = ({ option, height = 240, testid, className = "" }) => {
    const merged = useMemo(() => ({
        ...WARM_THEME,
        ...option,
        tooltip: { ...WARM_THEME.tooltip, ...(option.tooltip || {}) },
    }), [option]);
    return (
        <div data-testid={testid} className={className} style={{ height }}>
            <ReactECharts option={merged} style={{ height: "100%", width: "100%" }} notMerge lazyUpdate />
        </div>
    );
};

/* ---------- WarmPanel (institutional card) --------------------------- */
export const WarmPanel = ({ title, subtitle, right, children, className = "", testid }) => (
    <section
        data-testid={testid}
        className={"transition-shadow " + className}
        style={{
            background: DL.paper,
            border: `1px solid ${DL.ruleStrong}`,
            borderRadius: 4,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75), 0 4px 12px -8px rgba(14,31,27,0.18)",
        }}
    >
        {(title || right) && (
            <header
                className="flex items-center justify-between px-5 py-3"
                style={{
                    borderBottom: `1px solid ${DL.rule}`,
                    background: `linear-gradient(180deg, ${DL.ivory} 0%, ${DL.paperEdge} 100%)`,
                }}
            >
                <div>
                    {title && (
                        <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>
                            {title}
                        </div>
                    )}
                    {subtitle && <div className="text-[11px] mt-0.5" style={{ color: DL.muted }}>{subtitle}</div>}
                </div>
                {right && (
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                        {right}
                    </div>
                )}
            </header>
        )}
        <div className="p-5">{children}</div>
    </section>
);

/* ---------- WarmKpiHero (big display number) ------------------------- */
export const WarmKpiHero = ({ label, value, accent = "emerald", trend, suffix, testid }) => {
    const color = ({
        emerald: DL.emerald,
        gold:    DL.gold,
        oxblood: DL.danger,
        goldSoft:"#D4A017",
        olive:   DL.muted,
    })[accent] || DL.emerald;
    return (
        <div
            data-testid={testid}
            className="px-5 py-4 transition-all duration-200 hover:-translate-y-0.5"
            style={{
                background: DL.paper,
                border: `1px solid ${DL.ruleStrong}`,
                borderRadius: 4,
                borderLeft: `4px solid ${color}`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
            }}
        >
            <div className="text-[9.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{label}</div>
            <div className="mt-2 text-[36px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color }}>
                {value}
                {suffix && <span className="ml-1 text-[18px]" style={{ color: DL.muted }}>{suffix}</span>}
            </div>
            {trend && (
                <div className="mt-2 text-[10.5px] font-bold" style={{ fontFamily: DL.fontMono, color: trend.dir === "up" ? DL.emerald : DL.danger }}>
                    {trend.dir === "up" ? "▲" : "▼"} {trend.value} <span style={{ color: DL.muted, fontWeight: 500 }}>{trend.label}</span>
                </div>
            )}
        </div>
    );
};

/* ---------- Warm pulse dot ------------------------------------------- */
export const PulseDot = ({ tone = "oxblood" }) => {
    const color = ({ oxblood: DL.danger, emerald: DL.emerald, gold: DL.gold })[tone] || DL.danger;
    return (
        <span className="relative inline-flex h-2 w-2" style={{ verticalAlign: "middle" }}>
            <span className="animate-ping absolute inline-flex h-full w-full opacity-70 rounded-full" style={{ backgroundColor: color }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
        </span>
    );
};

/* ---------- SampleChip · flags panels that use mock data ------------- */
export const SampleChip = () => (
    <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.18em]"
        style={{
            fontFamily: DL.fontMono,
            color: DL.gold,
            background: "rgba(184,131,40,0.12)",
            border: `1px solid ${DL.gold}`,
        }}
        data-testid="warm-sample-chip"
    >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: DL.gold, display: "inline-block" }} />
        Sample data
    </span>
);

/* ---------- ScopeChip · shows the caller's data scope ---------------- */
export const ScopeChip = ({ label }) => (
    <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-[0.18em]"
        style={{
            fontFamily: DL.fontMono,
            color: DL.emerald,
            background: "rgba(13,59,46,0.08)",
            border: `1px solid ${DL.emerald}`,
        }}
        data-testid="warm-scope-chip"
        title="Data scope for the currently signed-in user"
    >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: DL.emerald, display: "inline-block" }} />
        Scope · {label}
    </span>
);

/* ---------- WarmPageHeader ------------------------------------------- */
export const WarmPageHeader = ({ eyebrow, title, kicker, right }) => (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5 pb-4" style={{ borderBottom: `1px dashed ${DL.rule}` }}>
        <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                <PulseDot tone="emerald" /> {eyebrow}
            </div>
            <h2 className="mt-2 text-[28px] md:text-[32px] leading-tight tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink }}>
                {title}
            </h2>
            {kicker && <p className="mt-2 text-[12.5px] max-w-2xl" style={{ color: DL.muted, fontWeight: 500 }}>{kicker}</p>}
        </div>
        {right}
    </div>
);
