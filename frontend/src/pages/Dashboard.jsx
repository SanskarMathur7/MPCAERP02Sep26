/**
 * Command Centre · Dashboard (Iter 106 · Feb 2026)
 * ------------------------------------------------
 * Refocused as an analytics-forward surface.  The action inbox stays
 * (Pending With Me), everything else is now tabs — each tab is a warm-palette
 * port of the /showcase HUD panels (currently sample data).
 *
 * Tabs:  Season Overview  ·  Grants Board  ·  Budget Health
 * Removed: Fairplay Rankings, Focus Stripes, Divisions Drill-down grid,
 *          Recent Activity list, Quick Actions grid, 6-tile KPI band.
 */
import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { Activity, HandCoins, IndianRupee, Users, Sparkles } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import PendingWithMePanel from "@/components/PendingWithMePanel";
import { DL, PageShell, PageEyebrow } from "@/lib/designSystem";

const WarmSeasonOverview = lazy(() => import("./dashboard-hud/WarmSeasonOverview"));
const WarmGrantsBoard    = lazy(() => import("./dashboard-hud/WarmGrantsBoard"));
const WarmBudgetHealth   = lazy(() => import("./dashboard-hud/WarmBudgetHealth"));
const WarmPlayers        = lazy(() => import("./dashboard-hud/WarmPlayers"));

const TABS = [
    { id: "season",  label: "Season Overview", icon: Activity,    Component: WarmSeasonOverview },
    { id: "players", label: "Players",         icon: Users,       Component: WarmPlayers },
    { id: "grants",  label: "Grants Board",    icon: HandCoins,   Component: WarmGrantsBoard },
    { id: "budget",  label: "Budget Health",   icon: IndianRupee, Component: WarmBudgetHealth },
];

const personaMeta = (persona) => {
    if (!persona) return { rootLabel: "", post: "" };
    if (persona.body_type === "State")
        return { rootLabel: "Madhya Pradesh Cricket Association", post: persona.post || "" };
    return { rootLabel: persona.body_name || persona.body_code || "", post: persona.post || "" };
};

const Dashboard = () => {
    const { persona } = useAuth();
    const [activeTab, setActiveTab] = useState("season");
    const { rootLabel, post } = personaMeta(persona);
    const Active = TABS.find((t) => t.id === activeTab)?.Component || WarmSeasonOverview;

    // Personalisation — greeting by wall-clock hour
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = persona?.name?.split(" ").slice(-1)[0] || persona?.name || "";

    return (
        <PageShell testid="dashboard-page">
            <PageEyebrow
                title="Command Centre"
                meta={`${persona?.body_type || ""} · ${rootLabel}${post ? " · " + post : ""}`}
                rightAction={
                    <div className="flex items-center gap-4 flex-wrap">
                        <div
                            className="inline-flex items-center gap-2 px-4 h-[38px] rounded-full"
                            style={{
                                background: `linear-gradient(180deg, ${DL.paper} 0%, ${DL.paperEdge} 100%)`,
                                border: `1.5px solid ${DL.ruleStrong}`,
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 6px 14px -8px rgba(14,31,27,0.25)",
                            }}
                            data-testid="dashboard-greeting-chip"
                        >
                            <Sparkles size={14} strokeWidth={2.5} style={{ color: DL.gold }} />
                            <span className="text-[13px] font-bold" style={{ color: DL.ink2 }}>{greeting},</span>
                            <span className="text-[13px] font-bold" style={{ color: DL.ink, fontFamily: DL.fontDisplay }}>
                                {persona?.honorific || ""} {firstName}
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>As On</div>
                            <div className="text-[16px] font-bold mt-0.5" style={{ color: DL.ink }}>
                                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                            </div>
                        </div>
                    </div>
                }
            />

            {/* Tab strip */}
            <div
                className="flex flex-wrap items-stretch gap-1 mb-6"
                style={{ borderBottom: `2px solid ${DL.rule}` }}
                data-testid="dashboard-tabs"
            >
                {TABS.map((t) => {
                    const isActive = t.id === activeTab;
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveTab(t.id)}
                            data-testid={`dashboard-tab-${t.id}`}
                            className="inline-flex items-center gap-2 px-5 py-3 -mb-[2px] transition-colors"
                            style={{
                                fontFamily: DL.fontMono,
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.22em",
                                textTransform: "uppercase",
                                color: isActive ? DL.emerald : DL.muted,
                                borderBottom: `2px solid ${isActive ? DL.gold : "transparent"}`,
                                background: isActive ? DL.paper : "transparent",
                                cursor: "pointer",
                            }}
                        >
                            <Icon size={13} strokeWidth={2.25} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div className="mb-10" data-testid={`dashboard-tab-content-${activeTab}`}>
                <Suspense fallback={<div className="p-16"><CricketLoader size="md" label="Loading tab…" /></div>}>
                    <Active />
                </Suspense>
            </div>

            {/* Action inbox — stays visible under every tab.  MPCA-State personas only. */}
            {persona?.body_type === "State" && <PendingWithMePanel />}
        </PageShell>
    );
};

export default Dashboard;
