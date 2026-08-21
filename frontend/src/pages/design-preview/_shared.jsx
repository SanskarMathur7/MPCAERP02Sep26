/**
 * DESIGN-PREVIEW · shared utilities
 * ---------------------------------
 * Isolated to `/design-preview/*` — nothing here leaks into the live app.
 * Broadcast-HUD aesthetic: dark base, sharp edges, IBM Plex + Bebas Neue,
 * ECharts dark theme, ticker strips, live pulse dots.
 */
import { useMemo, createContext, useContext } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import ReactECharts from "echarts-for-react";
import { Radio, Home, ChevronLeft, Sparkles } from "lucide-react";

/* ---------- ECharts dark theme (single source of truth) --------------- */
export const ECHARTS_THEME = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "IBM Plex Sans, ui-sans-serif", color: "#94A3B8" },
    tooltip: {
        backgroundColor: "#111A24",
        borderColor: "#334155",
        borderWidth: 1,
        textStyle: { color: "#F8FAFC", fontFamily: "IBM Plex Sans" },
        extraCssText: "border-radius: 0;",
    },
    grid: { top: 24, right: 16, bottom: 28, left: 44, containLabel: true },
};

export const HUD_COLORS = {
    saffron: "#FF8A00",
    marigold: "#FFB703",
    crimson: "#E63946",
    pitch: "#2A9D8F",
    cyan: "#00B4D8",
    oxblood: "#4A0404",
    text2: "#94A3B8",
    text3: "#64748B",
};

/* ---------- Chart wrapper (applies theme + sizing) -------------------- */
export const HudChart = ({ option, height = 240, testid, className = "" }) => {
    const merged = useMemo(() => ({
        ...ECHARTS_THEME,
        ...option,
        tooltip: { ...ECHARTS_THEME.tooltip, ...(option.tooltip || {}) },
    }), [option]);
    return (
        <div data-testid={testid} className={className} style={{ height }}>
            <ReactECharts option={merged} style={{ height: "100%", width: "100%" }} notMerge lazyUpdate />
        </div>
    );
};

/* ---------- HUD Panel (broadcast-style card) -------------------------- */
export const HudPanel = ({ title, subtitle, right, children, className = "", testid }) => (
    <section data-testid={testid} className={"border border-hud-panel bg-hud-surface " + className}>
        {(title || right) && (
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-hud-panel bg-hud-elev">
                <div>
                    {title && <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-hud-text-2">{title}</div>}
                    {subtitle && <div className="text-[11px] text-hud-text-3 mt-0.5">{subtitle}</div>}
                </div>
                {right && <div className="text-[10px] font-mono uppercase text-hud-text-2">{right}</div>}
            </header>
        )}
        <div className="p-4">{children}</div>
    </section>
);

/* ---------- KPI hero counter ----------------------------------------- */
export const KpiHero = ({ label, value, accent = "saffron", trend, suffix, testid }) => {
    const color = { saffron: "text-hud-saffron", crimson: "text-hud-crimson", pitch: "text-hud-pitch", cyan: "text-hud-cyan", marigold: "text-hud-marigold" }[accent] || "text-hud-saffron";
    return (
        <div data-testid={testid} className="border border-hud-panel bg-hud-surface p-4 hover:border-hud-cyan transition-colors">
            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-hud-text-2">{label}</div>
            <div className={"font-['Bebas_Neue'] leading-none text-5xl mt-2 " + color} style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.02em" }}>
                {value}{suffix && <span className="text-2xl text-hud-text-2 ml-1">{suffix}</span>}
            </div>
            {trend && (
                <div className={"text-[10px] font-mono mt-2 " + (trend.dir === "up" ? "text-hud-pitch" : "text-hud-crimson")}>
                    {trend.dir === "up" ? "▲" : "▼"} {trend.value} <span className="text-hud-text-3">{trend.label}</span>
                </div>
            )}
        </div>
    );
};

/* ---------- Live pulse dot ------------------------------------------- */
export const PulseDot = ({ color = "crimson" }) => {
    const c = { crimson: "bg-hud-crimson", pitch: "bg-hud-pitch", saffron: "bg-hud-saffron", cyan: "bg-hud-cyan" }[color];
    return (
        <span className="relative inline-flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full ${c} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${c}`} />
        </span>
    );
};

/* ---------- Shared page shell ---------------------------------------- */
const NAV = [
    { to: "/design-preview/season-overview", label: "SEASON" },
    { to: "/design-preview/grants-board", label: "GRANTS" },
    { to: "/design-preview/budget-health", label: "BUDGET" },
    { to: "/design-preview/tournament-calendar", label: "CALENDAR" },
    { to: "/design-preview/officials-squads", label: "OFFICIALS" },
    { to: "/design-preview/financial-flow", label: "FINANCE" },
    { to: "/design-preview/compliance-matrix", label: "COMPLIANCE" },
    { to: "/design-preview/division-scorecard", label: "DIVISIONS" },
];

/* ---------- Embedded-in-Showcase context ----------------------------- */
export const HudEmbeddedContext = createContext(false);

export const DesignPreviewShell = ({ children }) => {
    const loc = useLocation();
    const embedded = useContext(HudEmbeddedContext);
    if (embedded) {
        // Embedded inside /showcase — skip banner + top-nav + footer, keep HUD palette.
        return (
            <div className="bg-hud-base text-hud-text" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                <div className="px-4 py-4">
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} key={loc.pathname}>
                        {children}
                    </motion.div>
                </div>
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-hud-base text-hud-text" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {/* Watermark banner */}
            <div className="bg-hud-oxblood text-hud-marigold text-[10px] font-mono uppercase tracking-[0.3em] px-4 py-1.5 text-center border-b border-hud-crimson/40" data-testid="design-preview-banner">
                <Sparkles size={11} className="inline mr-2 -mt-0.5" strokeWidth={1.5} />
                Design Proposal v1 · Stakeholder Preview Only · Existing dashboards untouched
            </div>
            {/* Top nav */}
            <nav className="border-b border-hud-panel bg-hud-surface/95 backdrop-blur sticky top-0 z-40" data-testid="design-preview-topnav">
                <div className="max-w-[1600px] mx-auto flex items-center gap-6 px-6 py-2.5">
                    <Link to="/design-preview" className="flex items-center gap-2 group" data-testid="design-preview-home-link">
                        <Radio size={14} className="text-hud-crimson group-hover:animate-pulse" />
                        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-hud-text group-hover:text-hud-cyan transition-colors">MPCA · Command</span>
                    </Link>
                    <div className="h-4 w-px bg-hud-panel" />
                    <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                        {NAV.map((n) => (
                            <NavLink
                                key={n.to}
                                to={n.to}
                                className={({ isActive }) => "px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors " + (isActive ? "text-hud-saffron border-b-2 border-hud-saffron" : "text-hud-text-2 hover:text-hud-text border-b-2 border-transparent")}
                                data-testid={`design-nav-${n.label.toLowerCase()}`}
                            >
                                {n.label}
                            </NavLink>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-hud-text-2">
                        <PulseDot color="pitch" />
                        <span>ON-AIR</span>
                        <span className="text-hud-text-3">·</span>
                        <span>{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <Link to="/dashboard" className="text-[10px] font-mono uppercase tracking-[0.2em] text-hud-text-3 hover:text-hud-crimson flex items-center gap-1" data-testid="design-preview-exit-link">
                        <ChevronLeft size={11} /> Exit
                    </Link>
                </div>
            </nav>
            <main className="max-w-[1600px] mx-auto px-6 py-6">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} key={loc.pathname}>
                    {children}
                </motion.div>
            </main>
            <footer className="border-t border-hud-panel bg-hud-surface/50 px-6 py-4 text-center text-[9px] font-mono uppercase tracking-[0.3em] text-hud-text-3">
                MPCA Executive Command · Preview Build · All figures on this page are <span className="text-hud-saffron">sample data</span> for design demonstration
            </footer>
        </div>
    );
};

/* ---------- Small helper: page header -------------------------------- */
export const PageHeader = ({ eyebrow, title, kicker, right }) => (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6 border-b border-hud-panel pb-4">
        <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-hud-cyan">
                <PulseDot color="cyan" /> {eyebrow}
            </div>
            <h1 className="mt-2 text-4xl md:text-5xl leading-none text-hud-text" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.02em" }}>
                {title}
            </h1>
            {kicker && <p className="mt-2 text-xs text-hud-text-2 max-w-2xl">{kicker}</p>}
        </div>
        {right}
    </div>
);
