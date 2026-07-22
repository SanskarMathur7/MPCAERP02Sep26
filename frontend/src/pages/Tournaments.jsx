import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { fetchTournaments, fetchTournamentStats, fetchBodies, actOnTournamentAcceptance } from "@/lib/api";
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
    const [bodies, setBodies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("live");
    const [createOpen, setCreateOpen] = useState(false);
    const [viewMode, setViewMode] = useState("list"); // 'list' | 'calendar'
    const [accBusy, setAccBusy] = useState(null); // tournament id being acted on

    const handleAcceptance = async (tid, action) => {
        const note = action === "reject" ? window.prompt("Optional note explaining the rejection (leave blank if none):") : null;
        if (action === "reject" && note === null) return; // user cancelled
        setAccBusy(tid);
        try {
            const updated = await actOnTournamentAcceptance(tid, action, note || null);
            setList((prev) => prev.map((x) => x.id === tid ? updated : x));
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setAccBusy(null);
        }
    };

    const load = async () => {
        try {
            const [l, s, b] = await Promise.all([
                fetchTournaments(),
                fetchTournamentStats(),
                fetchBodies().catch(() => []),
            ]);
            setList(l);
            setStats(s);
            setBodies(b);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        let r = list;
        // Sprint M19 · "Live" default = active-play statuses only
        if (filter === "live") {
            r = r.filter((t) => ["Squad_Selection", "In_Progress"].includes(t.status));
        } else if (filter === "upcoming") {
            r = r.filter((t) => t.status === "Upcoming");
        } else if (["Draft","Awaiting_Approval","Upcoming", "Squad_Selection", "In_Progress", "Completed"].includes(filter)) {
            r = r.filter((t) => t.status === filter);
        } else if (["Inter_Divisional", "Championship", "Invitational"].includes(filter)) {
            r = r.filter((t) => t.scope === filter);
        } else if (["MPCA_InterDivisional","MPCA_Championship","BCCI"].includes(filter)) {
            r = r.filter((t) => t.tournament_type === filter);
        } else if (filter === "womens") {
            r = r.filter((t) => t.is_womens);
        } else if (filter === "three_team") {
            r = r.filter((t) => t.is_three_team_format);
        } else if (filter === "pending_my_accept") {
            r = r.filter((t) => {
                const acc = t.acceptance || {};
                if (!persona?.body_code || acc.status !== "Pending") return false;
                if (!(acc.required_from || []).includes(persona.body_code)) return false;
                return !(acc.entries || []).some((e) => e.body_code === persona.body_code);
            });
        } else if (["Multi_Day", "One_Day", "T20", "Pink_Ball"].includes(filter)) {
            r = r.filter((t) => t.format === filter);
        }
        return r;
    }, [list, filter, persona]);

    if (loading) return <div className="p-16" data-testid="trn-loading"><CricketLoader size="lg" label="Loading tournament catalogue…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="tournaments-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article VII · Tournament Operations</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Tournaments
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The single hub for every tournament action — create, host acceptance, squad selection, budget &amp; finance, reimbursement claims, match officials and linked camps. Pick a tournament below to open its full workspace, or use <Link to="/tournament-calendar" className="underline decoration-mpca-brass underline-offset-2 hover:text-mpca-oxblood">Tournament Calendar</Link> for a read-only schedule view.
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
                    ["live",                 "🔴 Live"],
                    ["upcoming",             "Upcoming"],
                    ["all",                  "All"],
                    ["pending_my_accept",    "⏳ Awaiting My Acceptance"],
                    ["MPCA_InterDivisional", "MPCA Inter-Div"],
                    ["MPCA_Championship",    "Championships"],
                    ["BCCI",                 "BCCI"],
                    ["womens",               "Women's"],
                    ["three_team",           "3-Team Format"],
                    ["Draft",                "Draft"],
                    ["Awaiting_Approval",    "Awaiting Approval"],
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

            {(
            <div className="bulletin-card overflow-hidden" data-testid="trn-list">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif" data-testid="trn-empty">
                        {filter === "live"
                            ? "No live tournaments right now. Switch to Upcoming or All to see the full calendar."
                            : "No tournaments match this filter."}
                    </div>
                ) : (
                    filtered.map((t) => {
                        const fm = FORMAT_META[t.format] || { label: t.format, tone: "lapsed" };
                        const sc = SCOPE_META[t.scope] || { label: t.scope, tone: "lapsed" };
                        const tm = TYPE_META[t.tournament_type] || { label: t.tournament_type, tone: "lapsed" };
                        const st = STATUS_META[t.status] || { label: t.status, tone: "lapsed" };
                        const acc = t.acceptance || {};
                        const required = acc.required_from || [];
                        const alreadyActed = (acc.entries || []).some((e) => e.body_code === persona?.body_code);
                        const iMustAccept = persona?.body_code && required.includes(persona.body_code) && !alreadyActed && acc.status === "Pending";
                        const accepting = accBusy === t.id;
                        return (
                            <div
                                key={t.id}
                                data-testid={"trn-row-" + t.tournament_no}
                                className="ledger-row w-full flex flex-wrap items-center gap-4 px-6 py-4 cursor-pointer"
                                onClick={() => navigate(`/tournaments/${t.id}`)}
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
                                    {/* M11 · Acceptance status + required-from strip */}
                                    {acc.status && acc.status !== "Not_Required" && (
                                        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider" data-testid={"trn-acc-" + t.tournament_no}>
                                            <span className={
                                                acc.status === "Accepted"  ? "px-2 py-0.5 bg-mpca-green/15 border border-mpca-green/50 text-mpca-green" :
                                                acc.status === "Rejected"  ? "px-2 py-0.5 bg-mpca-oxblood/15 border border-mpca-oxblood/50 text-mpca-oxblood" :
                                                                             "px-2 py-0.5 bg-mpca-brass/15 border border-mpca-brass/50 text-mpca-brass"
                                            }>
                                                {acc.status === "Pending" ? "Awaiting" : acc.status}
                                            </span>
                                            {required.map((bc) => {
                                                const acted = (acc.entries || []).filter((e) => e.body_code === bc)[0];
                                                return (
                                                    <span key={bc} className={
                                                        !acted ? "text-mpca-gray-dark border border-mpca-gray/30 px-1.5 py-0.5" :
                                                        acted.action === "accept" ? "text-mpca-green border border-mpca-green/40 px-1.5 py-0.5" :
                                                                                    "text-mpca-oxblood border border-mpca-oxblood/40 px-1.5 py-0.5"
                                                    }>
                                                        {acted?.action === "accept" ? "✓ " : acted?.action === "reject" ? "✗ " : "· "}{bc}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <span className="font-mono text-[11px] text-mpca-gray-dark uppercase tracking-wider w-20 text-right">{ageLabel(t)}</span>
                                <Pill tone={tm.tone} label={tm.label} testId={"trn-type-" + t.tournament_type} />
                                <Pill tone={fm.tone} label={fm.label} testId={"trn-fmt-" + t.format} />
                                {t.is_three_team_format && <span className="pill bg-mpca-gold/15 text-mpca-gold-dark border-mpca-gold/50" data-testid={"trn-3team-" + t.tournament_no}>3-Team</span>}
                                {t.is_womens && <span className="pill bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/50" data-testid={"trn-womens-" + t.tournament_no}>Women&apos;s</span>}
                                {t.allows_guests && <span className="pill bg-mpca-brass/15 text-mpca-gold border-mpca-brass/50">+ Guest</span>}
                                <Pill tone={st.tone} label={st.label} testId={"trn-status-" + t.status} />
                                {(acc.status === "Accepted" || acc.status === "Not_Required") && (
                                    <Link
                                        to={`/tournaments/${t.id}/selection`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="px-3 py-1 text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory hover:bg-mpca-green transition inline-flex items-center gap-1"
                                        data-testid={"trn-select-" + t.tournament_no}
                                    >
                                        <Users size={11} strokeWidth={1.5} /> Select
                                    </Link>
                                )}
                                <Link
                                    to={`/tournaments/${t.id}/finance`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-3 py-1 text-[10px] uppercase tracking-widest bg-mpca-brass text-mpca-green-dark hover:bg-mpca-brass/80 transition inline-flex items-center gap-1"
                                    data-testid={"trn-finance-" + t.tournament_no}
                                >
                                    ₹ Finance
                                </Link>
                                {iMustAccept && (
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => handleAcceptance(t.id, "accept")}
                                            disabled={accepting}
                                            className="px-3 py-1 text-[10px] uppercase tracking-widest bg-mpca-green text-mpca-ivory hover:bg-mpca-green-dark transition disabled:opacity-50"
                                            data-testid={"trn-accept-" + t.tournament_no}
                                        >
                                            ✓ Accept
                                        </button>
                                        <button
                                            onClick={() => handleAcceptance(t.id, "reject")}
                                            disabled={accepting}
                                            className="px-3 py-1 text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory hover:opacity-90 transition disabled:opacity-50"
                                            data-testid={"trn-reject-" + t.tournament_no}
                                        >
                                            ✗ Reject
                                        </button>
                                    </div>
                                )}
                                <ChevronRight size={14} className="text-mpca-gray" />
                            </div>
                        );
                    })
                )}
            </div>
            )}

            <TournamentCreateModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onDone={() => load()}
            />
        </div>
    );
};

export default Tournaments;
