import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, fetchAuditLog } from "@/lib/api";
import {
    Users, Calendar, HandCoins, AlertTriangle, ChevronRight,
    Building2, MapPin, Landmark, TrendingUp, Inbox, Sparkles, ArrowUpRight,
    Trophy, TrendingDown, Activity, ScrollText,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import PendingWithMePanel from "@/components/PendingWithMePanel";

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

const KpiTile = ({ label, value, sub, icon: Icon, accent = "green", testid }) => {
    const colorMap = {
        green: "text-mpca-green-dark",
        oxblood: "text-mpca-oxblood",
        brass: "text-mpca-brass",
    };
    return (
        <div className="bulletin-card p-6 relative" data-testid={testid}>
            <div className="flex items-start justify-between mb-4">
                <Icon className={colorMap[accent]} size={18} strokeWidth={1.5} />
            </div>
            <div className="font-serif text-4xl text-mpca-green-dark leading-none">{value}</div>
            <div className="mt-2 text-sm text-mpca-charcoal">{label}</div>
            {sub && <div className="text-[11px] mt-1 text-mpca-gray-dark">{sub}</div>}
        </div>
    );
};

const ScoreBar = ({ score, color = "green" }) => {
    const colorMap = { green: "bg-mpca-green-deep", oxblood: "bg-mpca-oxblood", brass: "bg-mpca-brass" };
    return (
        <div className="h-1.5 bg-mpca-brass/20 rounded-full overflow-hidden">
            <div
                className={`h-full ${colorMap[color]} transition-all duration-500`}
                style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
            />
        </div>
    );
};

const LeaderboardRow = ({ d, rank, variant }) => {
    const isTop = variant === "top";
    const rankColor = isTop ? "text-mpca-green-deep" : "text-mpca-oxblood";
    const rankBg = isTop ? "bg-mpca-green-deep/10" : "bg-mpca-oxblood/10";
    return (
        <div className="flex items-stretch gap-3 py-2.5 border-t border-mpca-brass/20 first:border-t-0" data-testid={`leaderboard-row-${d.code}`}>
            <div className={`flex items-center justify-center w-9 h-9 font-serif text-lg ${rankColor} ${rankBg} flex-shrink-0`}>
                #{rank}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono text-mpca-brass tracking-wider mb-0.5">{d.code}</div>
                <div className="text-sm font-semibold text-mpca-green-dark leading-tight mb-1 truncate">{d.name}</div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
                    <div>
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="tracking-widest uppercase text-mpca-gray-dark">Financial</span>
                            <span className="font-mono text-mpca-charcoal">{d.financial_score}</span>
                        </div>
                        <ScoreBar score={d.financial_score} color={d.financial_score >= 60 ? "green" : "oxblood"} />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="tracking-widest uppercase text-mpca-gray-dark">Governance</span>
                            <span className="font-mono text-mpca-charcoal">{d.governance_score}</span>
                        </div>
                        <ScoreBar score={d.governance_score} color={d.governance_score >= 60 ? "green" : "oxblood"} />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="tracking-widest uppercase text-mpca-gray-dark/60">Player</span>
                            <span className="font-mono text-mpca-gray-dark/60">—</span>
                        </div>
                        <div className="h-1.5 bg-mpca-brass/10 rounded-full" title="Player performance axis — activates with M3/M4/Players modules" />
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-end justify-center flex-shrink-0 min-w-[60px]">
                <div className="overline text-[8px]">Fairplay</div>
                <div className={`font-serif text-2xl ${rankColor}`}>{d.fairplay_score ?? d.total_score}</div>
            </div>
        </div>
    );
};

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

    const [activity, setActivity] = useState(null);   // children-activity result
    const [stateStats, setStateStats] = useState(null); // for District-only persona
    const [claimsStats, setClaimsStats] = useState(null);
    const [performance, setPerformance] = useState(null); // division leaderboard (State persona only)
    const [recentAudit, setRecentAudit] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!persona || !rootCode) return;
        (async () => {
            setLoading(true);
            try {
                if (childLabel) {
                    // State or Division persona — load children grid
                    const { data: a } = await api.get(`/bodies/${rootCode}/children-activity`);
                    setActivity(a);
                    // Division performance leaderboard — only relevant at State level
                    if (persona.body_type === "State") {
                        try {
                            const { data: p } = await api.get("/dashboard/fairplay-rankings");
                            setPerformance(p);
                        } catch (_) { /* swallow */ }
                    }
                } else {
                    // District persona — load own KPIs only
                    const { data: s } = await api.get(`/bodies/${rootCode}/summary`);
                    setStateStats(s);
                    // Pull this district's claims with explicit body filter
                    const { data: claims } = await api.get(`/claims?body_id=${rootCode}`);
                    setClaimsStats(claims);
                }
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
    const totals = useMemo(() => {
        if (!activity) return null;
        return activity.children.reduce(
            (acc, c) => ({
                members: acc.members + (c.active_members || c.members_count || 0),
                pending: acc.pending + (c.claims_pending || 0),
                overdue: acc.overdue + (c.claims_overdue || 0),
                disbursed: acc.disbursed + (c.disbursed_ytd_inr || 0),
            }),
            { members: 0, pending: 0, overdue: 0, disbursed: 0 },
        );
    }, [activity]);

    if (loading) {
        return (
            <div className="p-16" data-testid="dashboard-loading">
                <CricketLoader size="lg" label="Reading the ledger…" />
            </div>
        );
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="dashboard-page">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">{persona?.body_type} · Command Centre</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Good day, {persona?.honorific} {persona?.name?.split(" ").slice(-1)}.
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Scope · <strong className="text-mpca-charcoal">{rootLabel}</strong>
                        {persona?.post && <> · {persona.post}</>}
                    </p>
                </div>
                <div className="text-right">
                    <div className="overline">As On</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                </div>
            </div>

            <div className="crest-divider mb-10" />

            {/* Roll-up KPI band */}
            {totals && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-10">
                    <KpiTile label="Active Members" value={totals.members} sub={`Across ${activity.children.length} ${childLabel}`} icon={Users} accent="green" testid="kpi-members" />
                    <KpiTile label="Pending Claims" value={totals.pending} sub="Awaiting decision" icon={Inbox} accent="brass" testid="kpi-pending" />
                    <KpiTile label="Overdue Tasks" value={totals.overdue} sub="SLA breached" icon={AlertTriangle} accent={totals.overdue > 0 ? "oxblood" : "green"} testid="kpi-overdue" />
                    <KpiTile label="Disbursed YTD" value={fmtINR(totals.disbursed)} sub="Fiscal cycle 2025-26" icon={HandCoins} accent="green" testid="kpi-disbursed" />
                </div>
            )}

            {/* Sprint M30 · Pending With MPCA (State personas only) */}
            {persona?.body_type === "State" && <PendingWithMePanel />}

            {/* District-only persona — show own claim queue stats */}
            {!childLabel && Array.isArray(claimsStats) && stateStats && (() => {
                const by = {};
                let disbursedTotal = 0;
                for (const c of claimsStats) {
                    by[c.status] = (by[c.status] || 0) + 1;
                    if (c.status === "Disbursed") {
                        disbursedTotal += Number(c.approved_amount_inr ?? c.amount_inr ?? 0);
                    }
                }
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-10">
                        <KpiTile label="My Claims · Draft" value={by.Draft || 0} icon={Inbox} testid="kpi-my-draft" />
                        <KpiTile label="In Progress" value={(by.Submitted || 0) + (by.Division_Recommended || 0) + (by.MPCA_Sanctioned || 0)} sub="In approval chain" icon={TrendingUp} accent="brass" testid="kpi-my-inprogress" />
                        <KpiTile label="Returned" value={by.Returned || 0} sub="Needs my attention" icon={AlertTriangle} accent={(by.Returned || 0) > 0 ? "oxblood" : "green"} testid="kpi-my-returned" />
                        <KpiTile label="Disbursed YTD" value={fmtINR(disbursedTotal)} sub={`${by.Disbursed || 0} claims paid`} icon={HandCoins} testid="kpi-my-disbursed" />
                    </div>
                );
            })()}

            {/* Division Performance Leaderboard — State persona only */}
            {performance && performance.divisions.length > 0 && (
                <section className="mb-12" data-testid="performance-leaderboard">
                    <div className="flex items-end justify-between mb-5">
                        <div>
                            <div className="overline">Fairplay Index · Fiscal {performance.fiscal_cycle}</div>
                            <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">
                                Fairplay Rankings
                            </h2>
                            <p className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl">
                                Composite score across <strong className="text-mpca-charcoal">Financial</strong> (grant utilization · overdue · AI reject rate), <strong className="text-mpca-charcoal">Corporate Governance</strong> (AGM · elections · disclosures · active members), and a forthcoming <strong className="text-mpca-charcoal">Player Performance</strong> axis (lights up when M3, M4 and Player modules go live).
                            </p>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6">
                        <div className="bulletin-card p-6" data-testid="leaderboard-top">
                            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-mpca-brass/30">
                                <Trophy size={16} strokeWidth={1.75} className="text-mpca-green-deep" />
                                <div className="overline !text-mpca-green-deep">Fairplay Top 3</div>
                            </div>
                            {performance.top.map((d) => (
                                <LeaderboardRow key={d.code} d={d} rank={d.rank} variant="top" />
                            ))}
                        </div>

                        <div className="bulletin-card p-6" data-testid="leaderboard-bottom">
                            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-mpca-brass/30">
                                <TrendingDown size={16} strokeWidth={1.75} className="text-mpca-oxblood" />
                                <div className="overline !text-mpca-oxblood">Fairplay · Needs Attention</div>
                            </div>
                            {performance.bottom.map((d) => (
                                <LeaderboardRow key={d.code} d={d} rank={d.rank} variant="bottom" />
                            ))}
                        </div>
                    </div>
                </section>
            )}

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

            {/* Quick-jump grid — universal */}
            <section>
                <div className="overline mb-4">Quick Actions</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Link to="/claims" className="bulletin-card p-4 hover:border-mpca-oxblood transition-colors flex items-center justify-between" data-testid="quick-claims">
                        <div className="flex items-center gap-3">
                            <HandCoins size={16} strokeWidth={1.5} className="text-mpca-oxblood" />
                            <span className="text-sm">Grant Claims</span>
                        </div>
                        <ChevronRight size={14} strokeWidth={1.5} className="text-mpca-gray-dark" />
                    </Link>
                    <Link to="/members" className="bulletin-card p-4 hover:border-mpca-oxblood transition-colors flex items-center justify-between" data-testid="quick-members">
                        <div className="flex items-center gap-3">
                            <Users size={16} strokeWidth={1.5} className="text-mpca-oxblood" />
                            <span className="text-sm">Membership Register</span>
                        </div>
                        <ChevronRight size={14} strokeWidth={1.5} className="text-mpca-gray-dark" />
                    </Link>
                    <Link to="/meetings" className="bulletin-card p-4 hover:border-mpca-oxblood transition-colors flex items-center justify-between" data-testid="quick-meetings">
                        <div className="flex items-center gap-3">
                            <Calendar size={16} strokeWidth={1.5} className="text-mpca-oxblood" />
                            <span className="text-sm">AGM & Meetings</span>
                        </div>
                        <ChevronRight size={14} strokeWidth={1.5} className="text-mpca-gray-dark" />
                    </Link>
                    <Link to="/rulebook" className="bulletin-card p-4 hover:border-mpca-oxblood transition-colors flex items-center justify-between" data-testid="quick-rulebook">
                        <div className="flex items-center gap-3">
                            <Sparkles size={16} strokeWidth={1.5} className="text-mpca-oxblood" />
                            <span className="text-sm">AI Rulebook</span>
                        </div>
                        <ChevronRight size={14} strokeWidth={1.5} className="text-mpca-gray-dark" />
                    </Link>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
