import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getCreatableTournamentTypes } from "@/lib/tournamentCatalog";
import { fetchTournaments, fetchTournamentStats, fetchBodies, actOnTournamentAcceptance } from "@/lib/api";
import {
    Trophy, Calendar, MapPin, Users, ChevronRight, Filter, ShieldCheck, Plus,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import TournamentCreateModal from "@/components/TournamentCreateModal";
import { TournamentProgressionRibbonMini } from "@/components/TournamentProgressionRibbon";
import { WiringComplianceChip } from "@/lib/wiringCompliance";

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

const IW = {
    font: "'Nunito', system-ui, sans-serif",
    bgPage:     "#faf6ed", // cream page
    bgCard:     "#fbf9f0", // card surface
    bgHeader:   "#f5efdb", // header/footer tint
    border:     "#d4b95c", // gold rule
    borderSoft: "rgba(212, 185, 92, 0.4)",
    eyebrow:    "#7a5c1a", // bronze/olive
    text:       "#264d3b", // dark olive-green (primary)
    textSoft:   "#4a3a1a",
    accent:     "#7a1f2c", // oxblood
    accentSoft: "#a04552",
};

const Pill = ({ tone, label, testId }) => {
    // Institutional Warm — hex tokens, no MPCA global classes.
    const styleMap = {
        active:    { bg: IW.text,   fg: "#fff" },
        pending:   { bg: IW.bgHeader, fg: IW.eyebrow, border: `1px solid ${IW.border}` },
        suspended: { bg: IW.accent, fg: "#fff" },
        lapsed:    { bg: "#e8dcc0", fg: IW.textSoft },
        saffron:   { bg: IW.accent, fg: "#fff" },
        maroon:    { bg: "#5c1420", fg: "#fff" },
    };
    const s = styleMap[tone] || styleMap.lapsed;
    return (
        <span
            data-testid={testId}
            style={{ backgroundColor: s.bg, color: s.fg, border: s.border || "none" }}
            className="inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
        >
            {label}
        </span>
    );
};

const StatTile = ({ icon: Icon, label, value, sub }) => {
    return (
        <div
            className="p-6 border"
            style={{ backgroundColor: IW.bgCard, borderColor: IW.borderSoft }}
            data-testid={"trn-stat-" + label.toLowerCase().replace(/\s+/g, "-")}
        >
            <Icon style={{ color: IW.eyebrow }} className="mb-3" size={20} strokeWidth={1.5} />
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: IW.eyebrow }}>{label}</div>
            <div className="mt-2 text-3xl font-bold leading-none" style={{ color: IW.text }}>{value}</div>
            {sub && <div className="text-xs mt-2" style={{ color: IW.textSoft }}>{sub}</div>}
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
    // MPCA-235 · Ship 4 · MPCA state persona defaults to hiding Camp/School/Club
    // tournaments until their Finance claim is submitted. Toggle to show all.
    const isMpcaState = persona?.body_type === "State";
    const [includeCampScoped, setIncludeCampScoped] = useState(!isMpcaState);
    const [hiddenCount, setHiddenCount] = useState(0);

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
            // MPCA-235 · Ship 4 · Fetch full + filtered counts so we can show
            // the "N hidden — Show all" chip when MPCA state is looking.
            const params = includeCampScoped ? {} : { include_camp_scoped: false };
            const [l, lAll, s, b] = await Promise.all([
                fetchTournaments(params),
                isMpcaState && !includeCampScoped ? fetchTournaments({}) : Promise.resolve(null),
                fetchTournamentStats(),
                fetchBodies().catch(() => []),
            ]);
            setList(l);
            setStats(s);
            setBodies(b);
            setHiddenCount(lAll ? Math.max(0, lAll.length - l.length) : 0);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [includeCampScoped]);

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

    if (loading) return <div className="p-16" data-testid="trn-loading" style={{ backgroundColor: IW.bgPage, fontFamily: IW.font }}><CricketLoader size="lg" label="Loading tournament catalogue…" /></div>;

    return (
        <div
            className="page-enter min-h-screen"
            data-testid="tournaments-page"
            style={{ backgroundColor: IW.bgPage, fontFamily: IW.font, color: IW.text }}
        >
        <div className="px-8 md:px-12 py-10 max-w-7xl mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
                <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: IW.eyebrow }}>Article VII · Tournament Operations</div>
                    <h1 className="text-4xl md:text-5xl font-bold mt-3 leading-tight" style={{ color: IW.text }}>
                        Tournaments
                    </h1>
                    <p className="mt-3 max-w-2xl text-base leading-relaxed" style={{ color: IW.textSoft }}>
                        The single hub for every tournament action — create, host acceptance, squad selection, budget &amp; finance, reimbursement claims, match officials and linked camps. Pick a tournament below to open its full workspace, or use <Link to="/tournament-calendar" className="underline underline-offset-4" style={{ color: IW.accent, textDecorationColor: IW.border }}>Tournament Calendar</Link> for a read-only schedule view.
                    </p>
                </div>
                {isOfficeBearer && getCreatableTournamentTypes(persona).length > 0 && (
                    <button
                        onClick={() => setCreateOpen(true)}
                        data-testid="new-tournament-btn"
                        className="h-11 px-5 text-sm font-bold uppercase tracking-widest flex items-center gap-2 transition-colors"
                        style={{ backgroundColor: IW.text, color: "#fff" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1a3628")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = IW.text)}
                    >
                        <Plus size={16} strokeWidth={2} /> Add Tournament
                    </button>
                )}
            </div>

            <div className="border-t-2 mb-8" style={{ borderColor: IW.border }} />

            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-10" data-testid="trn-stats">
                    <StatTile icon={Trophy}      label={persona?.body_type === "State" ? "Total Tournaments" : "In My Scope"}   value={persona?.body_type === "State" ? stats.total_tournaments : list.length}  sub={persona?.body_type === "State" ? `Cycle ${(typeof window !== "undefined" && window.__mpca_season) || "2026-27"} · state-wide` : `${persona?.body_name || persona?.body_code}`} />
                    <StatTile icon={Calendar}    label="Upcoming"            value={persona?.body_type === "State" ? stats.upcoming : list.filter((t) => t.status === "Upcoming").length}            sub="Awaiting squad selection" />
                    <StatTile icon={Users}       label="In Selection"        value={persona?.body_type === "State" ? stats.in_selection : list.filter((t) => t.status === "Squad_Selection").length}        sub="Squads being formed" />
                    <StatTile icon={ShieldCheck} label="In Progress"         value={persona?.body_type === "State" ? stats.in_progress : list.filter((t) => t.status === "In_Progress").length}         sub="Currently being played" />
                    <StatTile icon={Trophy}      label="Players Selected"    value={stats.total_players_selected} sub={stats.total_squads + " squads"} />
                </div>
            )}

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                <Filter size={14} style={{ color: IW.eyebrow }} />
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
                ].map(([k, label]) => {
                    const active = filter === k;
                    return (
                        <button
                            key={k}
                            onClick={() => setFilter(k)}
                            data-testid={"trn-filter-" + k}
                            className="px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-bold border-2 transition-colors"
                            style={{
                                backgroundColor: active ? IW.text : "transparent",
                                color: active ? "#fff" : IW.text,
                                borderColor: active ? IW.text : IW.border,
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {isMpcaState && (hiddenCount > 0 || includeCampScoped) && !["BCCI", "MPCA_InterDivisional", "MPCA_Championship"].includes(filter) && (
                <div className="mb-4 flex items-center gap-3 text-[11px]" data-testid="mpca-visibility-toggle">
                    <span className="uppercase tracking-widest font-semibold" style={{ color: IW.eyebrow }}>
                        {includeCampScoped
                            ? "Showing all tournaments including Camps · School · Club (visibility · on-submit)"
                            : `${hiddenCount} tournament${hiddenCount === 1 ? "" : "s"} hidden until their Finance claim is submitted`}
                    </span>
                    <button
                        onClick={() => setIncludeCampScoped(v => !v)}
                        data-testid="mpca-visibility-toggle-btn"
                        className="px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold border-2 transition-colors"
                        style={{ color: IW.eyebrow, borderColor: IW.border }}
                    >
                        {includeCampScoped ? "Focus on core" : "Show all"}
                    </button>
                </div>
            )}

            {isMpcaState && ["BCCI", "MPCA_InterDivisional", "MPCA_Championship"].includes(filter) && (
                <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-widest font-semibold" data-testid="mpca-realtime-banner" style={{ color: IW.text }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: IW.text }} />
                    Real-time visibility · MPCA sees every {filter === "BCCI" ? "BCCI" : (filter === "MPCA_Championship" ? "Championship" : "MPCA Inter-Divisional")} tournament action as it happens (per wiring)
                </div>
            )}

            {(
            <div className="border-2 overflow-hidden" style={{ backgroundColor: IW.bgCard, borderColor: IW.border }} data-testid="trn-list">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center italic" style={{ color: IW.textSoft }} data-testid="trn-empty">
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
                                className="w-full flex flex-wrap items-center gap-4 px-6 py-4 cursor-pointer border-b transition-colors"
                                style={{ borderColor: IW.borderSoft }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = IW.bgHeader)}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                onClick={() => navigate(`/tournaments/${t.id}`)}
                            >
                                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: IW.text, color: "#f6d97a" }}>
                                    <Trophy size={16} strokeWidth={1.5} />
                                </div>
                                <div className="font-mono text-[10px] tracking-wider w-28" style={{ color: IW.eyebrow }}>{t.tournament_no}</div>
                                <div className="flex-1 min-w-[260px]">
                                    <div className="text-lg font-bold leading-tight" style={{ color: IW.text }}>
                                        {t.name}{t.short_name && <span className="text-[10px] tracking-[0.2em] uppercase ml-2 font-normal" style={{ color: IW.eyebrow }}>{t.short_name}</span>}
                                    </div>
                                    <div className="text-[11px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: IW.textSoft }}>
                                        <Calendar size={11} /> {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                                        {(t.venue_name_snapshot || t.venue) && (
                                            <><span>·</span><MapPin size={11} /> {t.venue_name_snapshot || t.venue}{t.ground_name_snapshot ? <span style={{ color: IW.eyebrow }}> · {t.ground_name_snapshot}</span> : null}</>
                                        )}
                                        {t.host_body_id && <span className="font-mono" style={{ color: IW.eyebrow }}>· Host {t.host_body_id}</span>}
                                        {t.trophy_name && <span style={{ color: IW.accent }}>· 🏆 {t.trophy_name}</span>}
                                        <WiringComplianceChip tournament={t} testId={"trn-wiring-" + t.tournament_no} className="ml-1" />
                                    </div>
                                    {acc.status && acc.status !== "Not_Required" && (
                                        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider" data-testid={"trn-acc-" + t.tournament_no}>
                                            <span style={{
                                                padding: "2px 8px",
                                                backgroundColor: acc.status === "Accepted" ? IW.text : acc.status === "Rejected" ? IW.accent : IW.eyebrow,
                                                color: "#fff",
                                            }}>
                                                {acc.status === "Pending" ? "Awaiting" : acc.status}
                                            </span>
                                            {required.map((bc) => {
                                                const acted = (acc.entries || []).filter((e) => e.body_code === bc)[0];
                                                const st2 = !acted
                                                    ? { color: IW.textSoft, borderColor: IW.borderSoft }
                                                    : acted.action === "accept"
                                                        ? { color: IW.text, borderColor: IW.text }
                                                        : { color: IW.accent, borderColor: IW.accent };
                                                return (
                                                    <span key={bc} className="px-1.5 py-0.5 border" style={st2}>
                                                        {acted?.action === "accept" ? "✓ " : acted?.action === "reject" ? "✗ " : "· "}{bc}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="mt-2">
                                        <TournamentProgressionRibbonMini tournament={t} />
                                    </div>
                                </div>
                                <span className="font-mono text-[11px] uppercase tracking-wider w-20 text-right" style={{ color: IW.textSoft }}>{ageLabel(t)}</span>
                                <Pill tone={tm.tone} label={tm.label} testId={"trn-type-" + t.tournament_type} />
                                <Pill tone={fm.tone} label={fm.label} testId={"trn-fmt-" + t.format} />
                                {t.is_three_team_format && <Pill tone="pending" label="3-Team" testId={"trn-3team-" + t.tournament_no} />}
                                {t.is_womens && <Pill tone="saffron" label="Women's" testId={"trn-womens-" + t.tournament_no} />}
                                {t.allows_guests && <Pill tone="pending" label="+ Guest" />}
                                <Pill tone={st.tone} label={st.label} testId={"trn-status-" + t.status} />
                                {iMustAccept && (
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => handleAcceptance(t.id, "accept")}
                                            disabled={accepting}
                                            className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold transition disabled:opacity-50"
                                            style={{ backgroundColor: IW.text, color: "#fff" }}
                                            data-testid={"trn-accept-" + t.tournament_no}
                                        >
                                            ✓ Accept
                                        </button>
                                        <button
                                            onClick={() => handleAcceptance(t.id, "reject")}
                                            disabled={accepting}
                                            className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold transition disabled:opacity-50"
                                            style={{ backgroundColor: IW.accent, color: "#fff" }}
                                            data-testid={"trn-reject-" + t.tournament_no}
                                        >
                                            ✗ Reject
                                        </button>
                                    </div>
                                )}
                                <ChevronRight size={16} style={{ color: IW.eyebrow }} />
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
        </div>
    );
};

export default Tournaments;
