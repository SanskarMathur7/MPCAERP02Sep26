import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { fetchTournaments, fetchTournamentStats } from "@/lib/api";
import {
    Trophy, Calendar, MapPin, Users, ChevronRight, Filter, ShieldCheck,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const FORMAT_META = {
    Multi_Day:  { label: "Multi-Day",  tone: "active" },
    One_Day:    { label: "One-Day",    tone: "pending" },
    T20:        { label: "T20",        tone: "saffron" },
    Pink_Ball:  { label: "Pink-Ball",  tone: "maroon" },
};
const SCOPE_META = {
    Inter_Divisional: { label: "Inter-Divisional", tone: "lapsed" },
    Inter_District:   { label: "Inter-District",   tone: "lapsed" },
    Championship:     { label: "Championship",     tone: "active" },
    Invitational:     { label: "Invitational",     tone: "pending" },
};
const STATUS_META = {
    Upcoming:        { label: "Upcoming",        tone: "pending" },
    Squad_Selection: { label: "Squad Selection", tone: "saffron" },
    In_Progress:     { label: "In Progress",     tone: "active" },
    Completed:       { label: "Completed",       tone: "lapsed" },
    Cancelled:       { label: "Cancelled",       tone: "suspended" },
};

const Pill = ({ tone, label, testId }) => {
    const map = {
        active: "pill pill-active",
        pending: "pill pill-pending",
        suspended: "pill pill-suspended",
        lapsed: "pill pill-lapsed",
        saffron: "pill bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/50",
        maroon: "pill bg-mpca-burgundy-dark/15 text-mpca-burgundy-dark border-mpca-burgundy-dark/50",
    };
    return <span className={map[tone] || "pill pill-lapsed"} data-testid={testId}>{label}</span>;
};

const StatTile = ({ icon: Icon, label, value, sub, accent = "navy" }) => {
    const c = { navy: "text-mpca-green-dark", saffron: "text-mpca-oxblood", marigold: "text-mpca-gold", maroon: "text-mpca-burgundy-dark" }[accent];
    return (
        <div className="bulletin-card p-6 border-0 rounded-none" data-testid={"trn-stat-" + label.toLowerCase().replace(/\s+/g, "-")}>
            <Icon className={c + " mb-3"} size={20} strokeWidth={1.25} />
            <div className="overline">{label}</div>
            <div className="font-serif text-3xl text-mpca-green-dark mt-2 leading-none">{value}</div>
            {sub && <div className="text-[11px] text-mpca-gray-dark mt-2">{sub}</div>}
        </div>
    );
};

const ageLabel = (t) => {
    if (t.age_cap_years && t.age_floor_years) return `U-${t.age_cap_years} / ${t.age_floor_years}+`;
    if (t.age_cap_years) return `U-${t.age_cap_years}`;
    if (t.age_floor_years) return `${t.age_floor_years}+`;
    return "Senior";
};

const Tournaments = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [list, setList] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        (async () => {
            try {
                const [l, s] = await Promise.all([fetchTournaments(), fetchTournamentStats()]);
                setList(l);
                setStats(s);
            } finally { setLoading(false); }
        })();
    }, []);

    const filtered = useMemo(() => {
        let r = list;
        if (["Upcoming", "Squad_Selection", "In_Progress", "Completed"].includes(filter)) {
            r = r.filter((t) => t.status === filter);
        } else if (["Inter_Divisional", "Championship", "Invitational"].includes(filter)) {
            r = r.filter((t) => t.scope === filter);
        } else if (["Multi_Day", "One_Day", "T20", "Pink_Ball"].includes(filter)) {
            r = r.filter((t) => t.format === filter);
        }
        return r;
    }, [list, filter]);

    if (loading) return <div className="p-16" data-testid="trn-loading"><CricketLoader size="lg" label="Loading tournament catalogue…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="tournaments-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Phase IV.2 · M2 Tournament Management</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        The MPCA Cricket Calendar
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        15 tournaments — 10 inter-divisional trophies + 5 championship cups —
                        spanning Multi-Day, One-Day, T20 and Pink-Ball formats. Squads pull from
                        the Player Register; age-cap and Guest-allowance enforced at selection.
                    </p>
                </div>
            </div>

            <div className="crest-divider mb-10" />

            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-10" data-testid="trn-stats">
                    <StatTile icon={Trophy}      label="Total Tournaments"   value={stats.total_tournaments}  sub="Cycle 2025-26"             accent="navy" />
                    <StatTile icon={Calendar}    label="Upcoming"            value={stats.upcoming}            sub="Awaiting squad selection"   accent="saffron" />
                    <StatTile icon={Users}       label="In Selection"        value={stats.in_selection}        sub="Squads being formed"        accent="marigold" />
                    <StatTile icon={ShieldCheck} label="In Progress"         value={stats.in_progress}         sub="Currently being played"     accent="navy" />
                    <StatTile icon={Trophy}      label="Players Selected"    value={stats.total_players_selected} sub={stats.total_squads + " squads"} accent="maroon" />
                </div>
            )}

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                <Filter size={12} className="text-mpca-gray-dark" />
                {[
                    ["all",              "All"],
                    ["Upcoming",         "Upcoming"],
                    ["Squad_Selection",  "In Selection"],
                    ["In_Progress",      "In Progress"],
                    ["Completed",        "Completed"],
                    ["Inter_Divisional", "Inter-Divisional"],
                    ["Championship",     "Championship"],
                    ["Multi_Day",        "Multi-Day"],
                    ["T20",              "T20"],
                ].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setFilter(k)}
                        data-testid={"trn-filter-" + k}
                        className={"px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold border transition-colors " + (filter === k ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:bg-mpca-parchment")}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="bulletin-card overflow-hidden" data-testid="trn-list">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No tournaments match this filter.</div>
                ) : (
                    filtered.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => navigate(`/tournaments/${t.id}`)}
                            data-testid={"trn-row-" + t.tournament_no}
                            className="ledger-row w-full text-left flex flex-wrap items-center gap-4 px-6 py-4"
                        >
                            <div className="w-10 h-10 rounded-full bg-mpca-green-dark text-mpca-gold-light flex items-center justify-center shrink-0">
                                <Trophy size={16} strokeWidth={1.5} />
                            </div>
                            <div className="font-mono text-[10px] text-mpca-brass tracking-wider w-28">{t.tournament_no}</div>
                            <div className="flex-1 min-w-[260px]">
                                <div className="font-serif text-lg text-mpca-green-dark leading-tight">
                                    {t.name}{t.short_name && <span className="text-[10px] tracking-[0.2em] uppercase text-mpca-brass ml-2 font-sans">{t.short_name}</span>}
                                </div>
                                <div className="text-[11px] text-mpca-gray-dark mt-1 flex items-center gap-2">
                                    <Calendar size={11} /> {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                                    {t.venue && <><span>·</span><MapPin size={11} /> {t.venue}</>}
                                </div>
                            </div>
                            <span className="font-mono text-[11px] text-mpca-gray-dark uppercase tracking-wider w-20 text-right">{ageLabel(t)}</span>
                            <Pill tone={FORMAT_META[t.format].tone} label={FORMAT_META[t.format].label} testId={"trn-fmt-" + t.format} />
                            <Pill tone={SCOPE_META[t.scope].tone} label={SCOPE_META[t.scope].label} testId={"trn-scope-" + t.scope} />
                            {t.allows_guests && <span className="pill bg-mpca-brass/15 text-mpca-gold border-mpca-brass/50">+ Guest</span>}
                            <Pill tone={STATUS_META[t.status].tone} label={STATUS_META[t.status].label} testId={"trn-status-" + t.status} />
                            <ChevronRight size={14} className="text-mpca-gray" />
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};

export default Tournaments;
