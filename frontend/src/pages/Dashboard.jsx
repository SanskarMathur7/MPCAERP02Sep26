import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboardStats, fetchMembers, fetchDisclosures } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Users, FileText, Calendar, Receipt, AlertTriangle, TrendingUp, ChevronRight, Trophy, Landmark, IndianRupee } from "lucide-react";

const StatTile = ({ label, value, sub, icon: Icon, accent = "green" }) => {
    const colorMap = {
        green: "text-mpca-green-dark",
        oxblood: "text-mpca-oxblood",
        brass: "text-mpca-brass",
        wood: "text-mpca-wood-dark",
    };
    return (
        <div className="bulletin-card p-7 relative" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="flex items-start justify-between mb-6">
                <Icon className={colorMap[accent]} size={22} strokeWidth={1.25} />
                <div className="overline">Phase 1</div>
            </div>
            <div className="font-serif text-5xl text-mpca-green-dark leading-none">{value}</div>
            <div className="mt-3 text-sm tracking-wide text-mpca-charcoal">{label}</div>
            {sub && <div className="text-[11px] mt-1 text-mpca-gray-dark">{sub}</div>}
        </div>
    );
};

const Dashboard = () => {
    const { persona } = useAuth();
    const [stats, setStats] = useState(null);
    const [recentMembers, setRecentMembers] = useState([]);
    const [recentDisclosures, setRecentDisclosures] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [s, m, d] = await Promise.all([
                    fetchDashboardStats(),
                    fetchMembers(),
                    fetchDisclosures(),
                ]);
                setStats(s);
                setRecentMembers(m.slice(0, 5));
                setRecentDisclosures(d.slice(0, 4));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="p-16 text-center text-mpca-gray-dark font-serif text-lg" data-testid="dashboard-loading">
                Reading the ledger…
            </div>
        );
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="dashboard-page">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
                <div>
                    <div className="overline">Pavilion · Dashboard</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Good day, {persona?.honorific} {persona?.name?.split(" ").slice(-1)}.
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        A glance at the register, the meetings, and the obligations of the
                        Association. The full ledger awaits below.
                    </p>
                </div>
                <div className="text-right">
                    <div className="overline">As On</div>
                    <div className="font-serif text-xl text-mpca-green-dark mt-1">
                        {new Date().toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}
                    </div>
                </div>
            </div>

            <div className="crest-divider mb-12" />

            {/* Stats grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-16">
                <StatTile
                    label="Total Members"
                    value={stats.total_members}
                    sub={`Active: ${stats.active_members} · Pending: ${stats.pending_members}`}
                    icon={Users}
                    accent="green"
                />
                <StatTile
                    label="Upcoming Meetings"
                    value={stats.upcoming_meetings}
                    sub="AGM · Committee · Sub-Committee"
                    icon={Calendar}
                    accent="oxblood"
                />
                <StatTile
                    label="Public Disclosures"
                    value={stats.total_disclosures}
                    sub="AGM notices · Minutes · Audits"
                    icon={FileText}
                    accent="brass"
                />
                <StatTile
                    label="Fee Collection"
                    value={`${stats.fee_collection_pct}%`}
                    sub={`${stats.paid_invoices ?? 0}/${stats.total_invoices ?? 0} invoices paid`}
                    icon={Receipt}
                    accent="wood"
                />
            </div>

            {/* Phase III tile band — Bank balance */}
            <div className="bulletin-card p-8 mb-16 bg-gradient-to-br from-mpca-green-dark to-mpca-wood-dark text-mpca-ivory relative overflow-hidden" data-testid="bank-balance-card">
                <div className="grid md:grid-cols-3 gap-8 items-center relative">
                    <div className="md:col-span-2">
                        <Landmark className="text-mpca-gold-light mb-3" size={28} strokeWidth={1.25} />
                        <div className="overline !text-mpca-gold-light">Consolidated Bank Position</div>
                        <div className="font-serif text-5xl md:text-6xl text-mpca-gold-light mt-3 leading-none">
                            ₹{new Intl.NumberFormat("en-IN").format(stats.total_bank_balance ?? 0)}
                        </div>
                        <p className="text-mpca-ivory/70 mt-3 text-sm">
                            Across all Association accounts · Live balance from the banker's ledger.
                        </p>
                    </div>
                    <div className="md:text-right">
                        <Link to="/bank" className="btn-heritage-primary !bg-mpca-brass !text-mpca-green-dark" data-testid="goto-bank">
                            View Accounts <ChevronRight size={14} />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Two-column: category breakdown + grievances */}
            <div className="grid lg:grid-cols-3 gap-8 mb-16">
                <div className="lg:col-span-2 bulletin-card p-8" data-testid="category-breakdown">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="overline">Composition</div>
                            <h3 className="font-serif text-2xl text-mpca-green-dark mt-2">
                                Membership by Category
                            </h3>
                        </div>
                        <TrendingUp className="text-mpca-brass" size={20} strokeWidth={1.25} />
                    </div>

                    <div className="space-y-4 mt-8">
                        {Object.entries(stats.by_category).map(([cat, count]) => {
                            const pct = stats.total_members ? (count / stats.total_members) * 100 : 0;
                            return (
                                <div key={cat} data-testid={`cat-${cat.toLowerCase()}`}>
                                    <div className="flex items-baseline justify-between mb-1.5">
                                        <span className="font-serif text-lg text-mpca-green-dark">{cat}</span>
                                        <span className="font-mono text-sm text-mpca-charcoal">
                                            {count}{" "}
                                            <span className="text-mpca-gray text-xs">
                                                ({pct.toFixed(0)}%)
                                            </span>
                                        </span>
                                    </div>
                                    <div className="h-[3px] bg-mpca-brass/15 relative">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-mpca-green-dark transition-all duration-1000"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bulletin-card p-8 bg-mpca-parchment/50" data-testid="grievances-card">
                    <AlertTriangle className="text-mpca-oxblood mb-5" size={22} strokeWidth={1.25} />
                    <div className="overline">Open Matters</div>
                    <h3 className="font-serif text-2xl text-mpca-green-dark mt-2">
                        Grievance Redressal
                    </h3>
                    <div className="font-serif text-5xl text-mpca-oxblood mt-6 leading-none">
                        {stats.pending_grievances}
                    </div>
                    <p className="text-xs text-mpca-gray-dark mt-3 leading-relaxed">
                        Pending submissions awaiting Committee review. Full grievance
                        workflow opens in Phase 4 of the rollout.
                    </p>
                    <div className="mt-6 pt-6 border-t border-mpca-brass/20">
                        <div className="overline text-[9px]">Roadmap</div>
                        <p className="text-[11px] text-mpca-gray-dark mt-1">
                            Submission · Escalation · Resolution Tracking
                        </p>
                    </div>
                </div>
            </div>

            {/* Recent rows */}
            <div className="grid lg:grid-cols-2 gap-8">
                {/* Recent members */}
                <div className="bulletin-card overflow-hidden" data-testid="recent-members">
                    <div className="px-7 py-5 border-b border-mpca-brass/20 flex items-center justify-between">
                        <div>
                            <div className="overline">From the Register</div>
                            <h3 className="font-serif text-xl text-mpca-green-dark mt-1">
                                Recent Members
                            </h3>
                        </div>
                        <Link to="/members" className="btn-heritage-ghost" data-testid="view-all-members">
                            View All <ChevronRight size={12} />
                        </Link>
                    </div>
                    <div>
                        {recentMembers.map((m) => (
                            <Link
                                to={`/members/${m.id}`}
                                key={m.id}
                                className="ledger-row flex items-center gap-4 px-7 py-4"
                                data-testid={`recent-member-${m.uid}`}
                            >
                                <div className="font-mono text-[10px] text-mpca-brass tracking-wider w-28">
                                    {m.uid}
                                </div>
                                <div className="flex-1">
                                    <div className="font-serif text-base text-mpca-green-dark leading-tight">
                                        {m.name}
                                    </div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-0.5">
                                        {m.category} · {m.sub_category}
                                    </div>
                                </div>
                                <span className={`pill ${m.status === "Active" ? "pill-active" : m.status === "Pending" ? "pill-pending" : "pill-lapsed"}`}>
                                    {m.status}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Recent disclosures */}
                <div className="bulletin-card overflow-hidden" data-testid="recent-disclosures">
                    <div className="px-7 py-5 border-b border-mpca-brass/20 flex items-center justify-between">
                        <div>
                            <div className="overline">From the Bulletin</div>
                            <h3 className="font-serif text-xl text-mpca-green-dark mt-1">
                                Latest Disclosures
                            </h3>
                        </div>
                        <Link to="/disclosures" className="btn-heritage-ghost" data-testid="view-all-disclosures">
                            View All <ChevronRight size={12} />
                        </Link>
                    </div>
                    <div>
                        {recentDisclosures.map((d) => (
                            <div
                                key={d.id}
                                className="ledger-row px-7 py-4"
                                data-testid={`recent-disclosure-${d.id}`}
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <div className="font-serif text-base text-mpca-green-dark leading-tight">
                                        {d.title}
                                    </div>
                                    <span className="font-mono text-[10px] text-mpca-brass whitespace-nowrap">
                                        {new Date(d.issued_date).toLocaleDateString("en-IN", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                        })}
                                    </span>
                                </div>
                                <div className="text-[11px] uppercase tracking-wider text-mpca-gray-dark mt-1.5">
                                    {d.disclosure_type.replace(/_/g, " ")}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="crest-divider my-16" />

            {/* Roadmap teaser */}
            <div className="bulletin-card p-10 bg-mpca-green-dark text-mpca-ivory relative overflow-hidden" data-testid="roadmap-teaser">
                <div
                    className="absolute inset-0 opacity-15"
                    style={{
                        backgroundImage:
                            "url('https://static.prod-images.emergentagent.com/jobs/152b2070-1a30-4f04-95c7-4d26fa8ac612/images/2064a62584872a486cf02834d876d9ef2064bc9f4cc65f6ff4cbeee51b2bcf5d.png')",
                        backgroundSize: "cover",
                    }}
                />
                <div className="relative grid md:grid-cols-3 gap-8 items-center">
                    <div className="md:col-span-2">
                        <Trophy className="text-mpca-gold-light mb-4" size={28} strokeWidth={1.25} />
                        <div className="overline !text-mpca-gold-light">Phases II — V</div>
                        <h3 className="font-serif text-3xl md:text-4xl mt-3 leading-tight text-mpca-ivory">
                            AGM, Elections, Finance, Player Registration and the AI Assistant —
                            <em className="text-mpca-gold-light not-italic"> all forthcoming.</em>
                        </h3>
                    </div>
                    <div className="md:text-right">
                        <Link to="/members/new" data-testid="cta-add-member" className="btn-heritage-primary !bg-mpca-brass !text-mpca-green-dark">
                            Enrol a Member <ChevronRight size={14} />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
