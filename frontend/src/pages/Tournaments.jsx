import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { fetchTournaments, fetchTournamentStats } from "@/lib/api";
import {
    Trophy, Calendar, MapPin, Users, ChevronRight, Filter, ShieldCheck, Plus,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import TournamentCreateModal from "@/components/TournamentCreateModal";

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const FORMAT_META = {
    Multi_Day:      { label: "Multi-Day",  tone: "active" },
    One_Day:        { label: "One-Day",    tone: "pending" },
    T20:            { label: "T20",        tone: "saffron" },
    Pink_Ball:      { label: "Pink-Ball",  tone: "maroon" },
    FourDay_Senior: { label: "4-Day Sr",   tone: "active" },
    FourDay_U23:    { label: "4-Day U-23", tone: "active" },
    FourDay_U19:    { label: "4-Day U-19", tone: "active" },
    OneDay_Senior:  { label: "1-Day Sr",   tone: "pending" },
    OneDay_U23:     { label: "1-Day U-23", tone: "pending" },
    OneDay_U19:     { label: "1-Day U-19", tone: "pending" },
    OneDay_Womens:  { label: "1-Day W",    tone: "pending" },
    T20_Senior:     { label: "T20 Sr",     tone: "saffron" },
    T20_U23:        { label: "T20 U-23",   tone: "saffron" },
    T20_U19:        { label: "T20 U-19",   tone: "saffron" },
    T20_Womens:     { label: "T20 W",      tone: "saffron" },
    U16_League:     { label: "U-16 League", tone: "lapsed" },
    FiveDay:        { label: "5-Day",      tone: "active" },
    ThreeDay:       { label: "3-Day",      tone: "active" },
    FortyOver:      { label: "40-Over",    tone: "pending" },
    ThirtyOver:     { label: "30-Over",    tone: "pending" },
};
const SCOPE_META = {
    Inter_Divisional: { label: "Inter-Divisional", tone: "lapsed" },
    Inter_District:   { label: "Inter-District",   tone: "lapsed" },
    Championship:     { label: "Championship",     tone: "active" },
    Invitational:     { label: "Invitational",     tone: "pending" },
};
const TYPE_META = {
    MPCA_InterDivisional: { label: "MPCA Inter-Div",    tone: "lapsed" },
    MPCA_Championship:    { label: "MPCA Championship", tone: "active" },
    BCCI:                 { label: "BCCI",              tone: "saffron" },
    Invitational:         { label: "Invitational",      tone: "pending" },
    Other:                { label: "Other",             tone: "lapsed" },
};
const STATUS_META = {
    Draft:              { label: "Draft",             tone: "lapsed" },
    Awaiting_Approval:  { label: "Awaiting Approval", tone: "pending" },
    Approved:           { label: "Approved",          tone: "active" },
    Upcoming:           { label: "Upcoming",          tone: "pending" },
    Squad_Selection:    { label: "Squad Selection",   tone: "saffron" },
    In_Progress:        { label: "In Progress",       tone: "active" },
    Completed:          { label: "Completed",         tone: "lapsed" },
    Cancelled:          { label: "Cancelled",         tone: "suspended" },
    Rejected:           { label: "Rejected",          tone: "suspended" },
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
    const { persona, isOfficeBearer } = useAuth();
    const navigate = useNavigate();
    const [list, setList] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [createOpen, setCreateOpen] = useState(false);

    const load = async () => {
        try {
            const [l, s] = await Promise.all([fetchTournaments(), fetchTournamentStats()]);
            setList(l);
            setStats(s);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        let r = list;
        if (["Draft","Awaiting_Approval","Upcoming", "Squad_Selection", "In_Progress", "Completed"].includes(filter)) {
            r = r.filter((t) => t.status === filter);
        } else if (["Inter_Divisional", "Championship", "Invitational"].includes(filter)) {
            r = r.filter((t) => t.scope === filter);
        } else if (["MPCA_InterDivisional","MPCA_Championship","BCCI"].includes(filter)) {
            r = r.filter((t) => t.tournament_type === filter);
        } else if (filter === "womens") {
            r = r.filter((t) => t.is_womens);
        } else if (filter === "three_team") {
            r = r.filter((t) => t.is_three_team_format);
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
                    <div className="overline">Article VII · Cricket Calendar</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        The MPCA Cricket Calendar
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The full MPCA tournament calendar — 9 men&apos;s + 3 women&apos;s Inter-Divisional trophies,
                        5 Championship trophies (Winner + Rest of MP A + B), plus BCCI tournaments
                        (Ranji, Vijay Hazare, U-23, U-19, U-16, U-14). Squads pull from the Player
                        Register; age-caps, guest quotas and Women&apos;s eligibility are enforced.
                    </p>
                </div>
                {isOfficeBearer && (
                    <button
                        className="btn-heritage-primary"
                        onClick={() => setCreateOpen(true)}
                        data-testid="new-tournament-btn"
                    >
                        <Plus size={14} strokeWidth={1.5} /> Add Tournament
                    </button>
                )}
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
                    ["all",                  "All"],
                    ["MPCA_InterDivisional", "MPCA Inter-Div"],
                    ["MPCA_Championship",    "Championships"],
                    ["BCCI",                 "BCCI"],
                    ["womens",               "Women's"],
                    ["three_team",           "3-Team Format"],
                    ["Draft",                "Draft"],
                    ["Awaiting_Approval",    "Awaiting Approval"],
                    ["Upcoming",             "Upcoming"],
                    ["Squad_Selection",      "In Selection"],
                    ["In_Progress",          "In Progress"],
                    ["Completed",            "Completed"],
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
                    filtered.map((t) => {
                        const fm = FORMAT_META[t.format] || { label: t.format, tone: "lapsed" };
                        const sc = SCOPE_META[t.scope] || { label: t.scope, tone: "lapsed" };
                        const tm = TYPE_META[t.tournament_type] || { label: t.tournament_type, tone: "lapsed" };
                        const st = STATUS_META[t.status] || { label: t.status, tone: "lapsed" };
                        return (
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
                                    <div className="text-[11px] text-mpca-gray-dark mt-1 flex items-center gap-2 flex-wrap">
                                        <Calendar size={11} /> {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                                        {(t.venue_name_snapshot || t.venue) && (
                                            <><span>·</span><MapPin size={11} /> {t.venue_name_snapshot || t.venue}{t.ground_name_snapshot ? <span className="text-mpca-brass"> · {t.ground_name_snapshot}</span> : null}</>
                                        )}
                                        {t.host_body_id && <span className="font-mono text-mpca-brass">· Host {t.host_body_id}</span>}
                                        {t.trophy_name && <span className="text-mpca-oxblood">· 🏆 {t.trophy_name}</span>}
                                    </div>
                                </div>
                                <span className="font-mono text-[11px] text-mpca-gray-dark uppercase tracking-wider w-20 text-right">{ageLabel(t)}</span>
                                <Pill tone={tm.tone} label={tm.label} testId={"trn-type-" + t.tournament_type} />
                                <Pill tone={fm.tone} label={fm.label} testId={"trn-fmt-" + t.format} />
                                {t.is_three_team_format && <span className="pill bg-mpca-gold/15 text-mpca-gold-dark border-mpca-gold/50" data-testid={"trn-3team-" + t.tournament_no}>3-Team</span>}
                                {t.is_womens && <span className="pill bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/50" data-testid={"trn-womens-" + t.tournament_no}>Women&apos;s</span>}
                                {t.allows_guests && <span className="pill bg-mpca-brass/15 text-mpca-gold border-mpca-brass/50">+ Guest</span>}
                                <Pill tone={st.tone} label={st.label} testId={"trn-status-" + t.status} />
                                <ChevronRight size={14} className="text-mpca-gray" />
                            </button>
                        );
                    })
                )}
            </div>

            <TournamentCreateModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onDone={() => load()}
            />
        </div>
    );
};

export default Tournaments;
