/**
 * Command Centre · Dashboard (Iter 108 · Feb 2026)
 * ------------------------------------------------
 * Iter 108: tabs are now permission-gated (see /src/lib/authz.js).  Match
 * Officials get a super-minimal own-view dashboard; District Secretaries lose
 * the Budget tab; Division Secretaries see all four tabs but the numbers
 * inside are auto-scoped by the backend to their DIV-* code.
 */
import { useState, useMemo, lazy, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { Activity, HandCoins, IndianRupee, Users, Sparkles, ShieldCheck } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import PendingWithMePanel from "@/components/PendingWithMePanel";
import { DL, PageShell, PageEyebrow } from "@/lib/designSystem";
import { can, roleOf, ROLES, PERMISSIONS } from "@/lib/authz";

const WarmSeasonOverview = lazy(() => import("./dashboard-hud/WarmSeasonOverview"));
const WarmGrantsBoard    = lazy(() => import("./dashboard-hud/WarmGrantsBoard"));
const WarmBudgetHealth   = lazy(() => import("./dashboard-hud/WarmBudgetHealth"));
const WarmPlayers        = lazy(() => import("./dashboard-hud/WarmPlayers"));

const ALL_TABS = [
    { id: "season",  label: "Season Overview", icon: Activity,    perm: PERMISSIONS.DASHBOARD_SEASON_VIEW,  Component: WarmSeasonOverview },
    { id: "players", label: "Players",         icon: Users,       perm: PERMISSIONS.DASHBOARD_PLAYERS_VIEW, Component: WarmPlayers },
    { id: "grants",  label: "Grants Board",    icon: HandCoins,   perm: PERMISSIONS.DASHBOARD_GRANTS_VIEW,  Component: WarmGrantsBoard },
    { id: "budget",  label: "Budget Health",   icon: IndianRupee, perm: PERMISSIONS.DASHBOARD_BUDGET_VIEW,  Component: WarmBudgetHealth },
];

const personaMeta = (persona) => {
    if (!persona) return { rootLabel: "", post: "" };
    if (persona.body_type === "State")
        return { rootLabel: "Madhya Pradesh Cricket Association", post: persona.post || "" };
    return { rootLabel: persona.body_name || persona.body_code || "", post: persona.post || "" };
};

/* ---------- Match Official mini-dashboard ------------------------- */
const MatchOfficialMini = ({ persona }) => (
    <PageShell testid="dashboard-page-official">
        <PageEyebrow
            title="Match Official Console"
            meta={`Official · ${persona?.name || ""}`}
        />
        <section
            className="p-8"
            style={{
                background: DL.paper,
                border: `1px solid ${DL.ruleStrong}`,
                borderRadius: 4,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75), 0 6px 14px -8px rgba(14,31,27,0.18)",
            }}
        >
            <div className="flex items-center gap-3 mb-4">
                <ShieldCheck size={20} style={{ color: DL.emerald }} />
                <div className="text-[13px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>
                    Your Corner
                </div>
            </div>
            <h2 className="text-[28px] tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink }}>
                Welcome, {persona?.honorific || ""} {persona?.name || ""}
            </h2>
            <p className="mt-3 text-[13px] max-w-2xl" style={{ color: DL.muted }}>
                MPCA-wide analytics are restricted to office-bearers.  From here you can access your own postings,
                submit DA/TA claims, and review your season history.
            </p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <a href="/officials/me" className="p-4 transition-all hover:-translate-y-0.5"
                   style={{ background: DL.ivory, border: `1px solid ${DL.ruleStrong}`, borderLeft: `4px solid ${DL.emerald}`, borderRadius: 4 }}
                   data-testid="official-jump-postings">
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>My Postings</div>
                    <div className="mt-1 text-[15px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink }}>Upcoming assignments →</div>
                </a>
                <a href="/da-forms" className="p-4 transition-all hover:-translate-y-0.5"
                   style={{ background: DL.ivory, border: `1px solid ${DL.ruleStrong}`, borderLeft: `4px solid ${DL.gold}`, borderRadius: 4 }}
                   data-testid="official-jump-claims">
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>DA / TA Claims</div>
                    <div className="mt-1 text-[15px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink }}>Submit &amp; track →</div>
                </a>
                <a href="/officials/me?tab=history" className="p-4 transition-all hover:-translate-y-0.5"
                   style={{ background: DL.ivory, border: `1px solid ${DL.ruleStrong}`, borderLeft: `4px solid ${DL.muted}`, borderRadius: 4 }}
                   data-testid="official-jump-history">
                    <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>Season History</div>
                    <div className="mt-1 text-[15px]" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink }}>All matches officiated →</div>
                </a>
            </div>
        </section>
    </PageShell>
);

const Dashboard = () => {
    const { persona } = useAuth();
    const role = useMemo(() => roleOf(persona), [persona]);
    const TABS = useMemo(() => ALL_TABS.filter((t) => can(role, t.perm)), [role]);
    const [activeTab, setActiveTab] = useState(TABS[0]?.id || "season");
    const { rootLabel, post } = personaMeta(persona);
    const Active = TABS.find((t) => t.id === activeTab)?.Component || TABS[0]?.Component;

    // Personalisation — greeting by wall-clock hour
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = persona?.name?.split(" ").slice(-1)[0] || persona?.name || "";

    // Match Officials get their own minimal surface
    if (role === ROLES.MATCH_OFFICIAL) {
        return <MatchOfficialMini persona={persona} />;
    }

    // No tabs at all (should never happen for a signed-in user, but fail closed)
    if (TABS.length === 0 || !Active) {
        return (
            <PageShell testid="dashboard-page-empty">
                <PageEyebrow title="Command Centre" meta="No dashboards available for your role" />
                <div className="p-8 text-center" style={{ color: DL.muted }}>
                    Ask your MPCA administrator to grant you dashboard access.
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell testid="dashboard-page">
            <PageEyebrow
                title="Command Centre"
                rightAction={
                    <div className="flex items-center gap-4 flex-wrap">
                        <div
                            className="inline-flex items-center gap-2 px-5 h-[42px] rounded-full"
                            style={{
                                background: `linear-gradient(180deg, ${DL.paper} 0%, ${DL.paperEdge} 100%)`,
                                border: `1.5px solid ${DL.ruleStrong}`,
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 6px 14px -8px rgba(14,31,27,0.25)",
                            }}
                            data-testid="dashboard-greeting-chip"
                        >
                            <Sparkles size={16} strokeWidth={2.5} style={{ color: DL.gold }} />
                            <span style={{ color: DL.ink2, fontWeight: 700, fontSize: 15 }}>{greeting},</span>
                            <span style={{ color: DL.ink, fontFamily: DL.fontDisplay, fontWeight: 700, fontSize: 15 }}>
                                {persona?.honorific || ""} {firstName}
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="text-[12px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>As On</div>
                            <div className="text-[18px] font-bold mt-1" style={{ color: DL.ink }}>
                                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                            </div>
                        </div>
                    </div>
                }
            />

            {/* Tab strip · permission-filtered */}
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
                                fontSize: 13,
                                fontWeight: 700,
                                letterSpacing: "0.22em",
                                textTransform: "uppercase",
                                color: isActive ? DL.emerald : DL.muted,
                                borderBottom: `3px solid ${isActive ? DL.gold : "transparent"}`,
                                background: isActive ? DL.paper : "transparent",
                                cursor: "pointer",
                            }}
                        >
                            <Icon size={15} strokeWidth={2.25} />
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
        </PageShell>
    );
};

export default Dashboard;
