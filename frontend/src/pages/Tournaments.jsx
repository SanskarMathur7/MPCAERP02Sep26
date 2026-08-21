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

// ═══════════════════════════════════════════════════════════════════════
// DELHIGENCE-INSPIRED DESIGN TOKENS
// Editorial-premium palette · Instrument Sans + Instrument Serif italic
// accent · Mono eyebrows · Embossed paper cards with soft floating shadow.
// ═══════════════════════════════════════════════════════════════════════
const DL = {
    fontDisplay: "'Instrument Sans', system-ui, sans-serif",
    fontSerif:   "'Instrument Serif', 'Cormorant Garamond', serif",
    fontMono:    "'IBM Plex Mono', ui-monospace, monospace",
    fontBody:    "'Instrument Sans', system-ui, sans-serif",

    ivory:      "#F5EFE6", // page bg (warm ivory)
    paper:      "#FBF8F1", // card bg (lighter cream)
    paperEdge:  "#EDE5D3", // subtle bottom-tint for embossed gradient
    ink:        "#0E1F1B", // near-black primary text
    ink2:       "#3A4A44", // secondary text
    ink3:       "#6B7770", // tertiary / eyebrows
    muted:      "#8E958F",
    rule:       "rgba(14, 31, 27, 0.10)",
    ruleStrong: "rgba(14, 31, 27, 0.22)",
    emerald:    "#0D3B2E", // brand accent (dark forest green)
    emeraldSoft:"rgba(13, 59, 46, 0.08)",
    gold:       "#D4A757", // gold accent for eyebrow numerals
    danger:     "#9B2B2B",
};

// Embossed card style — subtle top highlight + bottom sub-shadow + soft floating shadow
const embossedCard = (extra = {}) => ({
    background: `linear-gradient(180deg, ${DL.paper} 0%, ${DL.paperEdge} 100%)`,
    borderRadius: "6px",
    border: `1px solid ${DL.ruleStrong}`,
    boxShadow: [
        "inset 0 1px 0 rgba(255,255,255,0.85)",       // top highlight
        "inset 0 -1px 0 rgba(14,31,27,0.06)",         // bottom sub-shadow
        "0 20px 40px -22px rgba(14,31,27,0.28)",      // soft floating shadow
        "0 4px 10px -4px rgba(14,31,27,0.08)",        // close ambient
    ].join(", "),
    ...extra,
});

const Pill = ({ tone, label, testId }) => {
    const styleMap = {
        active:    { bg: DL.emerald,     fg: DL.paper, ring: "none" },
        pending:   { bg: "transparent",   fg: DL.ink,   ring: `1px solid ${DL.ruleStrong}` },
        suspended: { bg: DL.danger,       fg: DL.paper, ring: "none" },
        lapsed:    { bg: "rgba(14,31,27,0.06)", fg: DL.ink2, ring: "none" },
        saffron:   { bg: DL.gold,         fg: DL.ink,   ring: "none" },
        maroon:    { bg: "#5c1420",       fg: DL.paper, ring: "none" },
    };
    const s = styleMap[tone] || styleMap.lapsed;
    return (
        <span
            data-testid={testId}
            style={{ backgroundColor: s.bg, color: s.fg, border: s.ring === "none" ? "none" : s.ring, fontFamily: DL.fontMono, letterSpacing: "0.14em" }}
            className="inline-flex items-center px-2.5 py-[3px] text-[10px] font-medium uppercase whitespace-nowrap rounded-full"
        >
            {label}
        </span>
    );
};

const StatTile = ({ icon: Icon, label, value, sub }) => {
    return (
        <div
            className="p-6 flex flex-col justify-between h-full"
            style={embossedCard()}
            data-testid={"trn-stat-" + label.toLowerCase().replace(/\s+/g, "-")}
        >
            <div className="flex items-start justify-between">
                <div
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: DL.emeraldSoft, boxShadow: `inset 0 0 0 1px rgba(13,59,46,0.22)` }}
                >
                    <Icon style={{ color: DL.emerald }} size={16} strokeWidth={1.75} />
                </div>
                <div className="text-[10px] uppercase tracking-[0.22em]" style={{ fontFamily: DL.fontMono, color: DL.muted }}>
                    / stat
                </div>
            </div>
            <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.22em]" style={{ fontFamily: DL.fontMono, color: DL.ink3 }}>{label}</div>
                <div className="mt-2 text-4xl leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 500 }}>
                    {value}
                </div>
                {sub && <div className="text-[13px] mt-3 leading-snug" style={{ color: DL.ink3 }}>{sub}</div>}
            </div>
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

    if (loading) return <div className="p-16" data-testid="trn-loading" style={{ backgroundColor: DL.ivory, fontFamily: DL.fontBody }}><CricketLoader size="lg" label="Loading tournament catalogue…" /></div>;

    return (
        <div
            className="page-enter min-h-screen"
            data-testid="tournaments-page"
            style={{ backgroundColor: DL.ivory, fontFamily: DL.fontBody, color: DL.ink }}
        >
        <div className="px-8 md:px-12 py-12 max-w-[1280px] mx-auto">
            {/* Eyebrow row · delhigence pattern */}
            <div className="mb-8 flex items-baseline gap-6">
                <span className="text-[11px] uppercase tracking-[0.22em]" style={{ fontFamily: DL.fontMono, color: DL.ink3 }}>
                    / Tournaments · Article VII
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: DL.rule }} />
                <span className="text-[10px] uppercase tracking-[0.22em]" style={{ fontFamily: DL.fontMono, color: DL.muted }}>
                    Season 2026-27
                </span>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
                <div className="max-w-3xl">
                    <h1
                        className="text-[44px] md:text-[64px] leading-[1.02] tracking-[-0.02em]"
                        style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 500 }}
                    >
                        Every fixture,
                        <br />
                        <span className="italic" style={{ fontFamily: DL.fontSerif, color: DL.emerald }}>every claim,</span>
                        {" "}one workspace.
                    </h1>
                    <p className="mt-6 text-[15.5px] leading-[1.7]" style={{ color: DL.ink2, maxWidth: "62ch" }}>
                        Create tournaments, accept hosting, draft squads, manage budget &amp; reimbursements, appoint match officials, and attach linked camps — all from a single, wiring-aware surface. Pick a row below to open its workspace, or use{" "}
                        <Link
                            to="/tournament-calendar"
                            className="italic underline underline-offset-4 decoration-[1.5px]"
                            style={{ fontFamily: DL.fontSerif, color: DL.emerald, textDecorationColor: `${DL.emerald}55` }}
                        >
                            Tournament Calendar
                        </Link>{" "}
                        for a read-only schedule view.
                    </p>
                </div>
                {isOfficeBearer && getCreatableTournamentTypes(persona).length > 0 && (
                    <button
                        onClick={() => setCreateOpen(true)}
                        data-testid="new-tournament-btn"
                        className="group inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium transition-all"
                        style={{
                            backgroundColor: DL.emerald,
                            color: DL.paper,
                            boxShadow: "0 14px 30px -14px rgba(13, 59, 46, 0.55), inset 0 1px 0 rgba(255,255,255,0.15)",
                            fontFamily: DL.fontBody,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = DL.ink; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = DL.emerald; }}
                    >
                        <Plus size={16} strokeWidth={2} className="transition-transform group-hover:rotate-90" /> Add Tournament
                    </button>
                )}
            </div>

            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-12" data-testid="trn-stats">
                    <StatTile icon={Trophy}      label={persona?.body_type === "State" ? "Total Tournaments" : "In My Scope"}   value={persona?.body_type === "State" ? stats.total_tournaments : list.length}  sub={persona?.body_type === "State" ? `Cycle ${(typeof window !== "undefined" && window.__mpca_season) || "2026-27"} · state-wide` : `${persona?.body_name || persona?.body_code}`} />
                    <StatTile icon={Calendar}    label="Upcoming"            value={persona?.body_type === "State" ? stats.upcoming : list.filter((t) => t.status === "Upcoming").length}            sub="Awaiting squad selection" />
                    <StatTile icon={Users}       label="In Selection"        value={persona?.body_type === "State" ? stats.in_selection : list.filter((t) => t.status === "Squad_Selection").length}        sub="Squads being formed" />
                    <StatTile icon={ShieldCheck} label="In Progress"         value={persona?.body_type === "State" ? stats.in_progress : list.filter((t) => t.status === "In_Progress").length}         sub="Currently being played" />
                    <StatTile icon={Trophy}      label="Players Selected"    value={stats.total_players_selected} sub={stats.total_squads + " squads"} />
                </div>
            )}

            {/* Filter chips · pill-style, mono labels */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                <Filter size={14} style={{ color: DL.muted }} />
                {[
                    ["live",                 "Live"],
                    ["upcoming",             "Upcoming"],
                    ["all",                  "All"],
                    ["pending_my_accept",    "Awaiting Me"],
                    ["MPCA_InterDivisional", "Inter-Div"],
                    ["MPCA_Championship",    "Championships"],
                    ["BCCI",                 "BCCI"],
                    ["womens",               "Women's"],
                    ["three_team",           "3-Team"],
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
                            className="px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.16em] transition-all rounded-full"
                            style={{
                                backgroundColor: active ? DL.emerald : "transparent",
                                color: active ? DL.paper : DL.ink,
                                border: active ? `1px solid ${DL.emerald}` : `1px solid ${DL.ruleStrong}`,
                                fontFamily: DL.fontMono,
                                boxShadow: active ? "0 8px 20px -12px rgba(13,59,46,0.5)" : "none",
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {isMpcaState && (hiddenCount > 0 || includeCampScoped) && !["BCCI", "MPCA_InterDivisional", "MPCA_Championship"].includes(filter) && (
                <div className="mb-4 flex items-center gap-3 text-[11px]" data-testid="mpca-visibility-toggle">
                    <span className="uppercase tracking-[0.2em]" style={{ fontFamily: DL.fontMono, color: DL.ink3 }}>
                        {includeCampScoped
                            ? "Showing all tournaments including Camps · School · Club"
                            : `${hiddenCount} tournament${hiddenCount === 1 ? "" : "s"} hidden — visibility · on-submit`}
                    </span>
                    <button
                        onClick={() => setIncludeCampScoped(v => !v)}
                        data-testid="mpca-visibility-toggle-btn"
                        className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] rounded-full transition-colors"
                        style={{ color: DL.emerald, border: `1px solid ${DL.ruleStrong}`, fontFamily: DL.fontMono }}
                    >
                        {includeCampScoped ? "Focus on core" : "Show all"}
                    </button>
                </div>
            )}

            {isMpcaState && ["BCCI", "MPCA_InterDivisional", "MPCA_Championship"].includes(filter) && (
                <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]" data-testid="mpca-realtime-banner" style={{ fontFamily: DL.fontMono, color: DL.emerald }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: DL.emerald }} />
                    Real-time visibility · every {filter === "BCCI" ? "BCCI" : (filter === "MPCA_Championship" ? "Championship" : "Inter-Divisional")} action visible as it happens
                </div>
            )}

            {/* Tournament list · each row is its own embossed card for prominence */}
            <div data-testid="trn-list">
                {filtered.length === 0 ? (
                    <div className="p-16 text-center italic" style={{ ...embossedCard(), color: DL.ink3, fontFamily: DL.fontSerif, fontSize: "18px" }} data-testid="trn-empty">
                        {filter === "live"
                            ? "No live tournaments right now. Switch to Upcoming or All to see the full calendar."
                            : "No tournaments match this filter."}
                    </div>
                ) : (
                    <div className="space-y-3">
                    {filtered.map((t) => {
                        const fm = FORMAT_META[t.format] || { label: t.format, tone: "lapsed" };
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
                                className="w-full flex flex-wrap items-center gap-4 px-6 py-5 cursor-pointer transition-all"
                                style={embossedCard()}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(14,31,27,0.06), 0 28px 55px -22px rgba(14,31,27,0.35), 0 6px 14px -4px rgba(14,31,27,0.1)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = embossedCard().boxShadow; }}
                                onClick={() => navigate(`/tournaments/${t.id}`)}
                            >
                                <div
                                    className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: DL.emeraldSoft, boxShadow: `inset 0 0 0 1px rgba(13,59,46,0.22)`, color: DL.emerald }}
                                >
                                    <Trophy size={18} strokeWidth={1.5} />
                                </div>
                                <div className="text-[10.5px] tracking-[0.2em] w-28" style={{ fontFamily: DL.fontMono, color: DL.muted }}>{t.tournament_no}</div>
                                <div className="flex-1 min-w-[280px]">
                                    <div className="text-[19px] leading-tight tracking-[-0.01em]" style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 500 }}>
                                        {t.name}
                                        {t.short_name && (
                                            <span className="italic ml-2 text-[15px]" style={{ fontFamily: DL.fontSerif, color: DL.emerald }}>
                                                — {t.short_name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[12px] mt-1.5 flex items-center gap-2 flex-wrap" style={{ color: DL.ink3 }}>
                                        <Calendar size={11} /> {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                                        {(t.venue_name_snapshot || t.venue) && (
                                            <><span style={{ color: DL.muted }}>·</span><MapPin size={11} /> {t.venue_name_snapshot || t.venue}{t.ground_name_snapshot ? <span style={{ color: DL.muted }}> · {t.ground_name_snapshot}</span> : null}</>
                                        )}
                                        {t.host_body_id && <span style={{ fontFamily: DL.fontMono, color: DL.muted }}>· Host {t.host_body_id}</span>}
                                        {t.trophy_name && <span style={{ color: DL.gold, fontFamily: DL.fontSerif, fontStyle: "italic" }}>· 🏆 {t.trophy_name}</span>}
                                        <WiringComplianceChip tournament={t} testId={"trn-wiring-" + t.tournament_no} className="ml-1" />
                                    </div>
                                    {acc.status && acc.status !== "Not_Required" && (
                                        <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-[0.18em]" data-testid={"trn-acc-" + t.tournament_no} style={{ fontFamily: DL.fontMono }}>
                                            <span style={{
                                                padding: "3px 10px",
                                                borderRadius: "9999px",
                                                backgroundColor: acc.status === "Accepted" ? DL.emerald : acc.status === "Rejected" ? DL.danger : DL.gold,
                                                color: acc.status === "Pending" ? DL.ink : DL.paper,
                                            }}>
                                                {acc.status === "Pending" ? "Awaiting" : acc.status}
                                            </span>
                                            {required.map((bc) => {
                                                const acted = (acc.entries || []).filter((e) => e.body_code === bc)[0];
                                                const st2 = !acted
                                                    ? { color: DL.ink3, borderColor: DL.rule }
                                                    : acted.action === "accept"
                                                        ? { color: DL.emerald, borderColor: DL.emerald }
                                                        : { color: DL.danger, borderColor: DL.danger };
                                                return (
                                                    <span key={bc} className="px-2 py-0.5 rounded-full border" style={st2}>
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
                                <span className="text-[11px] uppercase tracking-[0.2em] w-20 text-right" style={{ fontFamily: DL.fontMono, color: DL.muted }}>{ageLabel(t)}</span>
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
                                            className="px-3.5 py-1.5 text-[10px] uppercase tracking-[0.18em] rounded-full transition disabled:opacity-50"
                                            style={{ backgroundColor: DL.emerald, color: DL.paper, fontFamily: DL.fontMono, boxShadow: "0 10px 24px -14px rgba(13,59,46,0.6)" }}
                                            data-testid={"trn-accept-" + t.tournament_no}
                                        >
                                            ✓ Accept
                                        </button>
                                        <button
                                            onClick={() => handleAcceptance(t.id, "reject")}
                                            disabled={accepting}
                                            className="px-3.5 py-1.5 text-[10px] uppercase tracking-[0.18em] rounded-full transition disabled:opacity-50"
                                            style={{ backgroundColor: DL.danger, color: DL.paper, fontFamily: DL.fontMono, boxShadow: "0 10px 24px -14px rgba(155,43,43,0.6)" }}
                                            data-testid={"trn-reject-" + t.tournament_no}
                                        >
                                            ✗ Reject
                                        </button>
                                    </div>
                                )}
                                <ChevronRight size={18} style={{ color: DL.ink3 }} />
                            </div>
                        );
                    })}
                    </div>
                )}
            </div>

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
