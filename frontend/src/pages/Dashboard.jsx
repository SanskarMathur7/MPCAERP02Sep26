import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, fetchAuditLog, fetchPlayerStats, fetchTournamentStats } from "@/lib/api";
import {
    Users, HandCoins, AlertTriangle, ChevronRight,
    Building2, MapPin, Sparkles, ArrowUpRight,
    Trophy, Activity, ScrollText,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import PendingWithMePanel from "@/components/PendingWithMePanel";
import { DL, PageShell, PageEyebrow, embossedCard } from "@/lib/designSystem";

const fmtINR = (n) => {
    if (n == null) return "—";
    const v = Number(n);
    if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
    if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v).startsWith("₹")
        ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)
        : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)}`;
};

const personaScope = (persona) => {
    // Returns { rootCode, rootLabel, childLabel } telling us which level the dashboard is anchored at.
    if (!persona) return { rootCode: null, rootLabel: "", childLabel: "" };
    if (persona.body_type === "State") {
        return { rootCode: "MPCA", rootLabel: "Madhya Pradesh Cricket Association", childLabel: "Divisions" };
    }
    if (persona.body_type === "Division") {
        return { rootCode: persona.body_code, rootLabel: persona.body_name || persona.body_code, childLabel: "Districts" };
    }
    if (persona.body_type === "District") {
        return { rootCode: persona.body_code, rootLabel: persona.body_name || persona.body_code, childLabel: null };
    }
    return { rootCode: "MPCA", rootLabel: "MPCA", childLabel: "Divisions" };
};

// Iter 105 · KpiTile removed with the old 6-tile band. FocusStripe (below) is the
// new tile grammar — richer per-area context, fewer tiles, one primary CTA each.

/**
 * FocusStripe — one full-width band per core focus area (Players / Tournaments / Grants).
 * Pattern borrowed from /design-preview/Landing.jsx (numbered eyebrow · icon · big title ·
 * kicker · inline KPIs · open-arrow) and translated to the Institutional Warm palette.
 */
const FocusMiniKpi = ({ label, value, tone = "green" }) => {
    const color = tone === "warn" ? DL.gold : tone === "danger" ? DL.danger : DL.emerald;
    return (
        <div className="flex flex-col items-start" data-testid={`focus-kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <span className="text-[9.5px] uppercase tracking-[0.22em] font-bold mb-1.5" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{label}</span>
            <span className="text-[30px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color }}>{value}</span>
        </div>
    );
};

const FocusStripe = ({ n, icon: Icon, title, kicker, kpis, to, testid }) => (
    <Link
        to={to}
        data-testid={testid}
        className="group flex items-stretch gap-6 p-6 transition-all duration-200 hover:-translate-y-0.5"
        style={{
            ...embossedCard(),
            borderLeft: `4px solid ${DL.gold}`,
        }}
    >
        <div className="flex flex-col justify-between w-[220px] shrink-0 pr-6" style={{ borderRight: `1px dashed ${DL.rule}` }}>
            <div>
                <div className="text-[10px] tracking-[0.3em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>— {n} —</div>
                <div className="mt-4 flex items-center gap-2.5">
                    <Icon size={22} strokeWidth={1.75} style={{ color: DL.emerald }} />
                    <span className="text-[24px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink }}>{title}</span>
                </div>
            </div>
            <div className="text-[11.5px] mt-3 leading-relaxed" style={{ color: DL.muted, fontWeight: 500 }}>
                {kicker}
            </div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-8 items-center">
            {kpis.map((k) => <FocusMiniKpi key={k.label} {...k} />)}
        </div>
        <div className="flex flex-col items-end justify-between shrink-0 w-24">
            <span className="text-[9.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>Open ▶</span>
            <ArrowUpRight
                size={22}
                strokeWidth={2}
                className="transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-1"
                style={{ color: DL.emerald }}
            />
        </div>
    </Link>
);

const ChildCard = ({ child, onOpen }) => {
    const Icon = child.body_type === "Division" ? Building2 : MapPin;
    const urgent = child.claims_overdue > 0;
    return (
        <button
            onClick={() => onOpen(child)}
            data-testid={`child-card-${child.code}`}
            className={
                "group relative bg-mpca-ivory border text-left p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 " +
                (urgent ? "border-mpca-oxblood/60" : "border-mpca-brass/30 hover:border-mpca-brass")
            }
        >
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <Icon size={14} strokeWidth={1.5} className="text-mpca-brass" />
                    <span className="font-mono text-[10px] tracking-wider text-mpca-brass">{child.code}</span>
                </div>
                <ChevronRight size={14} strokeWidth={1.5} className="text-mpca-gray-dark group-hover:text-mpca-oxblood transition-colors" />
            </div>

            <div className="font-serif text-lg text-mpca-green-dark leading-tight mb-4 min-h-[2.5rem]">
                {child.name}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                    <div className="text-[9px] tracking-widest uppercase text-mpca-gray-dark">Members</div>
                    <div className="font-serif text-xl text-mpca-green-dark">{child.members_count}</div>
                </div>
                <div>
                    <div className="text-[9px] tracking-widest uppercase text-mpca-gray-dark">Pending</div>
                    <div className="font-serif text-xl text-mpca-green-dark">{child.claims_pending}</div>
                </div>
                <div>
                    <div className="text-[9px] tracking-widest uppercase text-mpca-gray-dark">Overdue</div>
                    <div className={"font-serif text-xl " + (urgent ? "text-mpca-oxblood" : "text-mpca-green-dark")}>
                        {child.claims_overdue}
                    </div>
                </div>
            </div>

            <div className="pt-3 border-t border-mpca-brass/20 flex items-center justify-between">
                <div>
                    <div className="text-[9px] tracking-widest uppercase text-mpca-gray-dark">Disbursed YTD</div>
                    <div className="font-serif text-sm text-mpca-green-dark">{fmtINR(child.disbursed_ytd_inr)}</div>
                </div>
                {urgent && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-mpca-oxblood text-white text-[9px] tracking-wider uppercase">
                        <AlertTriangle size={9} strokeWidth={2} />
                        {child.claims_overdue} overdue
                    </div>
                )}
            </div>
        </button>
    );
};

const Dashboard = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const { rootCode, rootLabel, childLabel } = useMemo(() => personaScope(persona), [persona]);

    const [activity, setActivity] = useState(null);   // children-activity result (State / Division)
    const [playerStats, setPlayerStats] = useState(null);      // Iter 105 · Players focus stripe
    const [tournamentStats, setTournamentStats] = useState(null); // Iter 105 · Tournaments focus stripe
    const [recentAudit, setRecentAudit] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!persona || !rootCode) return;
        (async () => {
            setLoading(true);
            try {
                if (childLabel) {
                    // State or Division persona — load children grid for the drill-down section
                    const { data: a } = await api.get(`/bodies/${rootCode}/children-activity`);
                    setActivity(a);
                }
                // Iter 105 · Focus-stripe data (Players / Tournaments) — universal
                try { setPlayerStats(await fetchPlayerStats()); } catch (_) { /* swallow */ }
                try { setTournamentStats(await fetchTournamentStats()); } catch (_) { /* swallow */ }
                // Recent audit trail — universal across personas
                try {
                    const audit = await fetchAuditLog({ limit: 10 });
                    setRecentAudit(audit);
                } catch (_) { /* swallow */ }
            } catch (e) {
                console.error("dashboard load failed", e);
            } finally {
                setLoading(false);
            }
        })();
    }, [persona, rootCode, childLabel]);

    // Roll up totals across child cards for the KPI band — declared BEFORE any early return.
    // MPCA-Feb2026 · Real ERP-value KPIs: adds Approval Rate (a season-quality
    // signal), Live Tournaments (an activity signal), and Total Annual Grant
    // (the money the ERP is now governing end-to-end). Season label pulls
    // dynamically from useSeason() — the hard-coded "2025-26" is gone.
    const totals = useMemo(() => {
        if (!activity) return null;
        const rolled = activity.children.reduce(
            (acc, c) => ({
                members: acc.members + (c.active_members || c.members_count || 0),
                pending: acc.pending + (c.claims_pending || 0),
                overdue: acc.overdue + (c.claims_overdue || 0),
                disbursed: acc.disbursed + (c.disbursed_ytd_inr || 0),
                grant_pool: acc.grant_pool + (c.annual_grant_inr || 0),
            }),
            { members: 0, pending: 0, overdue: 0, disbursed: 0, grant_pool: 0 },
        );
        // % of grant pool actually paid out — ERP transparency win.
        rolled.utilisation_pct = rolled.grant_pool > 0
            ? Math.round((rolled.disbursed / rolled.grant_pool) * 100)
            : 0;
        // Active bodies with zero overdue = clean-slate ratio.
        rolled.clean_bodies = activity.children.filter((c) => (c.claims_overdue || 0) === 0).length;
        return rolled;
    }, [activity]);

    if (loading) {
        return (
            <div className="p-16" data-testid="dashboard-loading">
                <CricketLoader size="lg" label="Reading the ledger…" />
            </div>
        );
    }

    // Feb 2026 · Personalisation — pick greeting by wall-clock hour
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = persona?.name?.split(" ").slice(-1)[0] || persona?.name || "";

    return (
        <PageShell testid="dashboard-page">
            <PageEyebrow
                title="Command Centre"
                meta={`${persona?.body_type || ""} · ${rootLabel}${persona?.post ? " · " + persona.post : ""}`}
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
                            <span className="text-[13px] font-bold" style={{ color: DL.ink2 }}>
                                {greeting},
                            </span>
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

            {/* Iter 105 · Three Focus Area stripes — Players / Tournaments / Grants.
                Every other module (Meetings, Members, Rulebook, etc.) remains reachable
                from the left nav; the dashboard now surfaces ONLY the three primary
                signals the office bearer needs to act on today. */}
            <div className="space-y-4 mb-10" data-testid="focus-stripes">
                <FocusStripe
                    n="01"
                    icon={Users}
                    title="Players"
                    kicker="Registrations, KYC, eligibility — the human capital of every squad."
                    to="/players"
                    testid="focus-players"
                    kpis={[
                        { label: "Active", value: (playerStats?.active_players ?? 0).toLocaleString("en-IN") },
                        { label: "Pending Approval", value: playerStats?.pending_players ?? 0, tone: (playerStats?.pending_players ?? 0) > 0 ? "warn" : "green" },
                        { label: "Guest · Local · Outside", value: playerStats ? `${playerStats.by_category?.Guest ?? 0} / ${playerStats.by_category?.Local_MP ?? 0} / ${playerStats.by_category?.Born_Outside ?? 0}` : "—" },
                    ]}
                />
                <FocusStripe
                    n="02"
                    icon={Trophy}
                    title="Tournaments"
                    kicker="Every trophy in flight — from wiring to closure, one glance."
                    to="/tournaments"
                    testid="focus-tournaments"
                    kpis={[
                        { label: "In Flight", value: tournamentStats?.total_tournaments ?? 0 },
                        { label: "In Selection", value: tournamentStats?.in_selection ?? 0, tone: (tournamentStats?.in_selection ?? 0) > 0 ? "warn" : "green" },
                        { label: "In Progress", value: tournamentStats?.in_progress ?? 0 },
                    ]}
                />
                <FocusStripe
                    n="03"
                    icon={HandCoins}
                    title="Grants"
                    kicker="Every rupee — sanctioned, disbursed, still in the pipeline."
                    to="/claims"
                    testid="focus-grants"
                    kpis={totals ? [
                        { label: "Utilisation", value: `${totals.utilisation_pct}%`, tone: totals.utilisation_pct >= 70 ? "green" : totals.utilisation_pct >= 30 ? "warn" : "danger" },
                        { label: "Disbursed", value: fmtINR(totals.disbursed) },
                        { label: "Overdue", value: totals.overdue, tone: totals.overdue > 0 ? "danger" : "green" },
                    ] : [
                        { label: "Utilisation", value: "—" },
                        { label: "Disbursed", value: "—" },
                        { label: "Overdue", value: "—" },
                    ]}
                />
            </div>

            {/* Sprint M30 · Pending With MPCA (State personas only) */}
            {persona?.body_type === "State" && <PendingWithMePanel />}

            {/* Children grid (Division cards for State persona; District cards for Division persona) */}
            {activity && activity.children.length > 0 && (
                <section className="mb-12">
                    <div className="flex items-end justify-between mb-5">
                        <div>
                            <div className="overline">{childLabel} · Drill down</div>
                            <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">
                                {activity.children.length} {childLabel} reporting to {rootLabel}
                            </h2>
                        </div>
                        {totals?.overdue > 0 && (
                            <Link
                                to="/claims"
                                className="inline-flex items-center gap-1 text-xs tracking-wider uppercase text-mpca-oxblood hover:underline"
                                data-testid="dashboard-overdue-link"
                            >
                                <AlertTriangle size={11} strokeWidth={1.75} />
                                Review {totals.overdue} overdue
                                <ArrowUpRight size={11} strokeWidth={1.75} />
                            </Link>
                        )}
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="children-grid">
                        {activity.children.map((c) => (
                            <ChildCard
                                key={c.code}
                                child={c}
                                onOpen={() => {
                                    // Drill down by URL filter on the Claims page (the most actionable view)
                                    navigate(`/claims?body_id=${c.code}`);
                                }}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Recent Activity — universal, last 10 audit events */}
            {recentAudit.length > 0 && (
                <section className="mb-12" data-testid="recent-activity">
                    <div className="flex items-end justify-between mb-5">
                        <div>
                            <div className="overline flex items-center gap-2">
                                <Activity size={12} strokeWidth={1.75} /> Live Ledger
                            </div>
                            <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">Recent Activity</h2>
                            <p className="text-[11px] text-mpca-gray-dark mt-1">
                                Latest 10 workflow actions across the ERP — pulled from the immutable audit log.
                            </p>
                        </div>
                        <Link
                            to="/audit-log"
                            className="inline-flex items-center gap-1 text-xs tracking-wider uppercase text-mpca-brass hover:text-mpca-oxblood"
                            data-testid="recent-activity-view-all"
                        >
                            <ScrollText size={11} strokeWidth={1.75} />
                            View full log
                            <ArrowUpRight size={11} strokeWidth={1.75} />
                        </Link>
                    </div>
                    <div className="bulletin-card divide-y divide-mpca-brass/20 overflow-hidden" data-testid="recent-activity-list">
                        {recentAudit.map((r) => (
                            <div key={r.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-mpca-parchment/30" data-testid={`recent-activity-row-${r.id}`}>
                                <div className="flex-shrink-0 w-16 text-right">
                                    <div className="text-[10px] font-mono text-mpca-brass">
                                        {new Date(r.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                    <div className="text-[9px] tracking-wider uppercase text-mpca-gray-dark">
                                        {new Date(r.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                    </div>
                                </div>
                                <div className="flex-shrink-0">
                                    <span className="inline-block px-2 py-0.5 bg-mpca-brass/15 text-mpca-brass text-[9px] tracking-wider uppercase font-semibold">
                                        {r.module?.replace(/_/g, " ")}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-mpca-charcoal flex flex-wrap items-baseline gap-x-2">
                                        <span className="font-mono text-mpca-oxblood text-[11px] uppercase tracking-wider">{r.action}</span>
                                        <span className="text-mpca-gray-dark">·</span>
                                        <span className="text-mpca-green-dark font-medium">{r.actor_name}</span>
                                        {r.actor_role && <span className="text-mpca-gray-dark text-[10px]">· {r.actor_role}</span>}
                                    </div>
                                    {r.details?.code && (
                                        <div className="text-[10px] font-mono text-mpca-brass mt-0.5 truncate">
                                            {r.details.code}
                                            {r.details?.note && <span className="text-mpca-gray-dark ml-2 italic">— {r.details.note}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Iter 105 · Quick Actions grid removed — the three Focus Stripes above
                serve as the primary jump targets. Secondary modules stay in the left nav. */}
        </PageShell>
    );
};

export default Dashboard;
