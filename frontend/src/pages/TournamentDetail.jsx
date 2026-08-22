import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    fetchTournament, fetchSquads,
    setTournamentStatus, fetchBodies, api,
} from "@/lib/api";
import {
    Trophy, Calendar, MapPin, Users, ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle, BadgeCheck,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import TournamentProgressionRibbon from "@/components/TournamentProgressionRibbon";
import ApprovalChain from "@/components/ApprovalChain";
import { WiringComplianceChip } from "@/lib/wiringCompliance";
import InputVariablesPanel from "@/components/InputVariablesPanel";
import { DL, PageShell, embossedCard } from "@/lib/designSystem";
import TournamentBudgetsPanel from "@/components/TournamentBudgetsPanel";
import TournamentInvoicesPanel from "@/components/TournamentInvoicesPanel";
import TournamentBasicsPanel from "@/components/TournamentBasicsPanel";
import DaysEnginePanel from "@/components/DaysEnginePanel";
import UnifiedBudgetPanel from "@/components/UnifiedBudgetPanel";
import ParticipantsMatrix from "@/components/ParticipantsMatrix";
import TournamentSquadsPanel from "@/components/TournamentSquadsPanel";
import {
    MatchCalendarPanel, TournamentReceiptsPanel, FinancialSummaryPanel, ClosureLetterPanel,
} from "@/components/TournamentWorkspacePanels";
import { getTypeByCode } from "@/lib/tournamentCatalog";
import { Wallet, ArrowRight, Sliders, Receipt, ScrollText, Activity, HandCoins, Landmark, ListChecks, UsersRound, ClipboardEdit, History, MessageSquare, CalendarClock } from "lucide-react";
import MatchOfficialDAPanel from "@/components/MatchOfficialDAPanel";
import TournamentActivityLog from "@/components/TournamentActivityLog";
import DiscussionThread from "@/components/DiscussionThread";
import TournamentFinanceCard from "@/components/TournamentFinanceCard";
import MatchOfficialsPanel from "@/pages/finance/MatchOfficialsPanel";

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const SetupBox = ({ testId, icon: Icon, label, note, onClick, active, flag }) => {
    // MPCA-235 · Ship 3 · flag prop may be a raw string ("M"/"O"/"NA"/"INFO")
    // OR an object {flag, owner}. Normalise to a string for badge rendering.
    const flagChar = typeof flag === "object" && flag !== null ? flag.flag : flag;
    const flagStyle = flagChar === "M" ? { bg: "rgba(139,31,31,0.10)", fg: "#8B1F1F", border: "1px solid rgba(139,31,31,0.35)" }
                    : flagChar === "O" ? { bg: "rgba(184,131,40,0.14)", fg: "#B88328", border: "1px solid rgba(184,131,40,0.4)" }
                    : flagChar === "NA" ? { bg: "transparent", fg: "#4C5750", border: "1px dashed rgba(14,31,27,0.32)" }
                    : flagChar === "INFO" ? { bg: "rgba(184,131,40,0.10)", fg: "#B88328", border: "1px solid rgba(184,131,40,0.3)" }
                    : null;
    return (
    <button
        onClick={onClick}
        className="text-left p-4 transition-all group relative"
        style={{
            background: active
                ? `linear-gradient(180deg, #F5EEDA 0%, #EDE1BF 100%)`
                : `linear-gradient(180deg, ${DL.paper} 0%, ${DL.paperEdge} 100%)`,
            border: active ? `1.5px solid ${DL.gold}` : `1px solid ${DL.ruleStrong}`,
            borderRadius: "6px",
            boxShadow: active
                ? "inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(14,31,27,0.10), 0 22px 40px -22px rgba(184,131,40,0.45), 0 4px 10px -4px rgba(14,31,27,0.10)"
                : "inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(14,31,27,0.06), 0 14px 30px -22px rgba(14,31,27,0.24), 0 4px 10px -4px rgba(14,31,27,0.08)",
        }}
        data-testid={testId}
    >
        {flagStyle && (
            <span
                data-testid={`${testId}-flag`}
                title={
                    flagChar === "M"    ? "Mandatory — required for this tournament type" :
                    flagChar === "O"    ? "Optional — you may fill this if useful" :
                    flagChar === "NA"   ? "Not required for this tournament type — you may still add data, but it won't be used elsewhere" :
                    flagChar === "INFO" ? "Informational / audit trail" : ""
                }
                className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: flagStyle.bg, color: flagStyle.fg, border: flagStyle.border, fontFamily: DL.fontMono, letterSpacing: "0.1em" }}
            >
                {flagChar === "NA" ? "N/A" : flagChar === "M" ? "REQ" : flagChar === "O" ? "OPT" : "INFO"}
            </span>
        )}
        <div className="flex items-center justify-center h-10 w-10 rounded-lg mb-3" style={{ backgroundColor: DL.emeraldSoft, boxShadow: `inset 0 0 0 1.5px rgba(13,59,46,0.32)` }}>
            <Icon size={18} strokeWidth={2.25} style={{ color: DL.emerald }} />
        </div>
        <div className="text-[15px] leading-tight" style={{ fontFamily: DL.fontDisplay, color: active ? DL.emerald : DL.ink, fontWeight: 800 }}>{label}</div>
        <div className="text-[11.5px] mt-1.5 font-semibold" style={{ color: DL.ink2 }}>{note}</div>
    </button>
    );
};

const TournamentDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { persona } = useAuth();
    const [t, setT] = useState(null);
    const [squads, setSquads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bodies, setBodies] = useState([]);
    const [openBox, setOpenBox] = useState(null); // "calendar"|"receipts"|"summary"|"closure"
    const panelRef = useRef(null);
    const heroRef = useRef(null);
    const [heroPast, setHeroPast] = useState(false);
    // Feb 2026 · Auto-scroll to expanded workspace panel so the user sees it.
    // Uses scrollIntoView which walks up the DOM to find the nearest scroll root.
    useEffect(() => {
        if (!openBox) return;
        const tick = setTimeout(() => {
            if (panelRef.current) {
                panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 80);
        return () => clearTimeout(tick);
    }, [openBox]);
    // Feb 2026 · Sticky sub-nav appears once the hero scrolls out of view.
    // Uses IntersectionObserver so it works regardless of which ancestor is the scroll root.
    useEffect(() => {
        if (!heroRef.current) return;
        const el = heroRef.current;
        const obs = new IntersectionObserver(
            ([entry]) => setHeroPast(!entry.isIntersecting),
            { root: null, threshold: 0, rootMargin: "-60px 0px 0px 0px" }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [t]);
    const [progressKey, setProgressKey] = useState(0);
    const [myParticipation, setMyParticipation] = useState(null);   // M39x
    const [wiringFlags, setWiringFlags] = useState({});             // MPCA-235 · Ship 3 · flag per box
    const [parentTournament, setParentTournament] = useState(null); // MPCA-254 · Ship B · linked Inter-Div tournament (for camps)
    // Feb 2026 · Age-Filter Preview badge on the hero — fetched from
    // `/tournaments/{tid}/eligibility-spec` so Divisions see the DOB
    // window + medical requirement before opening the squad picker.
    const [eligSpec, setEligSpec] = useState(null);
    useEffect(() => {
        if (!id) return;
        let alive = true;
        api.get(`/tournaments/${id}/eligibility-spec`)
            .then(r => { if (alive) setEligSpec(r.data); })
            .catch(() => { if (alive) setEligSpec(null); });
        return () => { alive = false; };
    }, [id]);

    // MPCA-235 · Ship 3 · Read the wiring status once and build a box-testid → {flag, owner} map
    // so each SetupBox shows a Mandatory / Optional / Optional·Not Used badge AND the note text
    // reflects who actually acts (Division vs MPCA) for this tournament type.
    useEffect(() => {
        let alive = true;
        api.get(`/tournaments/${id}/wiring-status`)
            .then(r => {
                if (!alive) return;
                const byStep = Object.fromEntries((r.data.steps || []).map(s => [s.key, s]));
                const cell = (k) => byStep[k] ? { flag: byStep[k].flag, owner: byStep[k].owner } : {};
                setWiringFlags({
                    "box-basics":         cell("pool_basics"),
                    "box-participants":   cell("pool_basics"),
                    "box-officials":      cell("match_official_posting"),
                    "box-squads":         cell("squad"),
                    "box-calendar":       cell("match_calendar"),
                    "box-days-engine":    cell("match_calendar"),
                    "box-unified-budget": cell("unified_budget"),
                    "box-finance":        cell("finance_console"),
                    "box-my-da":          cell("finance_console"),
                });
            })
            .catch(() => { if (alive) setWiringFlags({}); });
        return () => { alive = false; };
    }, [id, progressKey]);

    // M39x · Fetch this body's participation row (if any) so we can show the
    // "Accept Tournament" banner when their acceptance_status is Pending.
    useEffect(() => {
        (async () => {
            if (!persona?.body_code || persona?.body_type === "State") { setMyParticipation(null); return; }
            try {
                const { data } = await api.get(`/tournaments/${id}/participants/${persona.body_code}`);
                setMyParticipation(data || null);
            } catch { setMyParticipation(null); }
        })();
    }, [id, persona?.body_code, persona?.body_type, progressKey]);

    // MPCA-254 · Ship B — For Pre-Tournament / Camp tournaments, fetch the
    // parent Inter-Divisional tournament so we can show a clickable link
    // back to it (users often need to jump to the parent to see squads,
    // fixtures, or the shared budget context).
    useEffect(() => {
        (async () => {
            const parentId = t?.parent_tournament_id;
            if (!parentId) { setParentTournament(null); return; }
            try {
                const { data } = await api.get(`/tournaments/${parentId}`);
                setParentTournament(data || null);
            } catch { setParentTournament(null); }
        })();
    }, [t?.parent_tournament_id]);

    const acceptTournament = async () => {
        try {
            await api.patch(`/tournaments/${id}/participants/${persona.body_code}`, {
                acceptance_status: "Accepted",
                acceptance_by_name: persona.name,
            });
            setProgressKey((k) => k + 1);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const declineTournament = async () => {
        const note = window.prompt("Reason for declining (optional):");
        try {
            await api.patch(`/tournaments/${id}/participants/${persona.body_code}`, {
                acceptance_status: "Declined",
                acceptance_by_name: persona.name,
                acceptance_note: note || null,
            });
            setProgressKey((k) => k + 1);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const refreshProgress = () => setProgressKey((k) => k + 1);

    const [accessDenied, setAccessDenied] = useState(null);

    const load = async () => {
        try {
            const [tx, sq] = await Promise.all([fetchTournament(id), fetchSquads(id)]);
            setT(tx);
            setSquads(sq);
        } catch (e) {
            if (e?.response?.status === 403) {
                // M39z.g · graceful access-denied card (matches Finance Console pattern)
                setAccessDenied(e.response.data?.detail || "You do not have access to this tournament.");
            } else {
                throw e;
            }
        }
    };
    useEffect(() => {
        (async () => {
            try {
                await load();
                setBodies(await fetchBodies());
            } finally { setLoading(false); }
        })();
    }, [id]);

    const handleStatus = async (newStatus) => {
        try {
            const u = await setTournamentStatus(id, newStatus);
            setT(u);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // MPCA-125 + MPCA-154 · Squad create + add/remove player flows were
    // removed from this page. Every squad action now lives on `/squads/{sid}`
    // (via the "Squads" setup box) so there is only ONE way to reach a squad.


    if (loading) return <div className="p-16" data-testid="trn-detail-loading"><CricketLoader size="lg" label="Loading tournament…" /></div>;
    if (accessDenied) return (
        <div className="max-w-2xl mx-auto p-8 mt-12 bulletin-card border-l-4 border-mpca-oxblood" data-testid="trn-detail-access-denied">
            <div className="overline text-[10px] font-semibold text-mpca-oxblood">Access denied</div>
            <div className="font-serif text-2xl text-mpca-green-dark mt-2">You cannot view this tournament</div>
            <p className="text-sm text-mpca-charcoal mt-3 leading-relaxed">{accessDenied}</p>
            <p className="text-[11px] text-mpca-charcoal/70 mt-4 italic">
                If this looks wrong, ask MPCA to check your body&apos;s participation or parent-Division mapping.
            </p>
        </div>
    );
    if (!t) return <div className="p-16 text-center">Not found.</div>;

    // M39z.g / M39z.h · Organiser rights for the tournament:
    //   · State (MPCA) — always
    //   · Host body itself (Division or District)
    //   · Parent Division of the host, when the host is a District (so
    //     Divisions can manage Inter-District tournaments run under them,
    //     even when a child District was chosen as the host body)
    const isState = persona && persona.body_type === "State";
    const myBody = persona?.body_code;
    const isHostBody = myBody && myBody === t.host_body_id;
    const hostIsDistrict = (t.host_body_id || "").startsWith("DIST-");
    // Body code convention: DIV-<3letter>  and  DIST-<name>-<3letter>. So the
    // Division suffix is the last three chars of DIV-code; a District under
    // that Division ends with -<suffix>.
    const isParentDivOfHostDist =
        persona?.body_type === "Division"
        && myBody?.startsWith("DIV-")
        && hostIsDistrict
        && (t.host_body_id || "").endsWith(`-${myBody.slice(-3)}`);
    const canEdit = isState || isHostBody || isParentDivOfHostDist;
    // MPCA-234 · Match officials get READ-ONLY view of Tournament Basics + Match Calendar.
    // They're allocated to officiate — not to modify the schedule or pool composition.
    const isMatchOfficial = persona?.id === "match-official" || persona?.body_type === "Match_Official";
    const canEditSetup = canEdit && !isMatchOfficial;
    // Iter 108c · Squad selection opens automatically 30 days before start.
    // We compute effectiveStatus below; here we use the raw status only for
    // the terminal cases (Cancelled / Completed), which time cannot infer.
    const canEditSquad = !["Cancelled", "Completed"].includes(t.status);
    const divisions = bodies.filter((b) => b.body_type === "Division");
    const districts = bodies.filter((b) => b.body_type === "District");
    const ageLabel = t.age_cap_years ? "U-" + t.age_cap_years : (t.age_floor_years ? t.age_floor_years + "+" : "Senior");

    // Feb 2026 · Days-until pill and quick stats for the reorganised layout.
    // Iter 108c · The single derived "effectiveStatus" replaces the manually
    // managed t.status field for DISPLAY purposes.  MPCA no longer has to
    // flip Draft → Upcoming → Squad_Selection → In_Progress → Completed by
    // hand; the calendar drives the label and squad/wiring gates read from
    // this derived value.  The underlying t.status is still stored (used by
    // cancellation flow) but never displayed on its own.
    const effectiveStatus = (() => {
        if (t.status === "Cancelled") return "Cancelled";
        if (t.status === "Completed") return "Completed";
        if (!t.start_date || !t.end_date) return "Upcoming";
        const now = new Date();
        const sd = new Date(t.start_date);
        const ed = new Date(t.end_date);
        const dayMs = 86400000;
        if (now > ed) return "Completed";
        if (now >= sd) return "In Progress";
        const daysToStart = Math.ceil((sd - now) / dayMs);
        // Selection window: 30 days out to start → open for squads
        if (daysToStart <= 30) return "Squad Selection";
        return "Upcoming";
    })();
    const daysUntilInfo = (() => {
        if (!t.start_date || !t.end_date) return null;
        const now = new Date();
        const sd = new Date(t.start_date);
        const ed = new Date(t.end_date);
        const dayMs = 86400000;
        if (now < sd) { const d = Math.ceil((sd - now) / dayMs); return { label: `Starts in ${d} day${d === 1 ? "" : "s"}`, tone: "gold" }; }
        if (now > ed) return { label: "Concluded", tone: "muted" };
        const d = Math.ceil((ed - now) / dayMs);
        return { label: `Live · ends in ${d} day${d === 1 ? "" : "s"}`, tone: "live" };
    })();
    const budgetPct = (t.budget_total_inr && t.budget_total_inr > 0)
        ? Math.round(((t.budget_utilized_inr || 0) / t.budget_total_inr) * 100)
        : null;
    const quickStats = [
        { label: "Squads",   value: (squads || []).length,                    sub: (squads || []).length ? "registered" : "not yet" },
        { label: "Matches",  value: t.match_count || t.fixture_count || 0,   sub: t.calendar_fixed ? "calendar locked" : "calendar draft" },
        { label: "Officials", value: t.officials_appointed_count || 0,        sub: "appointed" },
        { label: "Budget",   value: budgetPct != null ? `${budgetPct}%` : "—", sub: budgetPct != null ? "utilised" : "not set" },
    ];

    return (
        <PageShell testid="trn-detail-page">
            {/* Feb 2026 · Scoped style override — force Nunito on inherited
                heritage components (SetupBoxes, Discussion) so the page reads
                as one aesthetic instead of a font salad. Also mute the
                heritage brass/gray palette on inline serifs. */}
            <style>{`
                [data-testid="trn-detail-page"] .font-serif,
                [data-testid="trn-detail-page"] h1,
                [data-testid="trn-detail-page"] h2,
                [data-testid="trn-detail-page"] h3 { font-family: 'Nunito', system-ui, sans-serif !important; font-weight: 700 !important; }
                [data-testid="trn-detail-page"] .overline { color: ${DL.ink2} !important; font-family: 'IBM Plex Mono', ui-monospace, monospace !important; font-weight: 700 !important; letter-spacing: 0.18em !important; }
                [data-testid="trn-detail-page"] .bulletin-card { background: linear-gradient(180deg, ${DL.paper} 0%, ${DL.paperEdge} 100%) !important; border: 1px solid ${DL.ruleStrong} !important; border-radius: 6px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(14,31,27,0.06), 0 14px 30px -18px rgba(14,31,27,0.24), 0 4px 10px -4px rgba(14,31,27,0.08) !important; }
                [data-testid="trn-detail-page"] .text-mpca-green-dark { color: ${DL.ink} !important; }
                [data-testid="trn-detail-page"] .text-mpca-gray-dark, [data-testid="trn-detail-page"] .text-mpca-charcoal { color: ${DL.ink2} !important; }
                [data-testid="trn-detail-page"] .text-mpca-brass { color: ${DL.gold} !important; }
            `}</style>
            {/* Feb 2026 · Sticky sub-nav — appears once the hero has scrolled out */}
            {heroPast && t && (
                <div
                    className="fixed left-0 right-0 top-0 z-40 flex items-center gap-4 px-6 md:px-10 py-3"
                    style={{
                        background: `linear-gradient(180deg, ${DL.emerald} 0%, #0a2f24 100%)`,
                        color: DL.paper,
                        borderBottom: `2px solid ${DL.gold}`,
                        boxShadow: "0 12px 24px -12px rgba(14,31,27,0.4)",
                    }}
                    data-testid="trn-sticky-nav"
                >
                    <button
                        onClick={() => navigate("/tournaments")}
                        className="text-[11px] uppercase tracking-[0.2em] font-bold"
                        style={{ fontFamily: DL.fontMono, color: DL.gold }}
                    >
                        ← All Tournaments
                    </button>
                    <div className="h-4 w-px" style={{ backgroundColor: "rgba(184,131,40,0.35)" }} />
                    <span className="text-[10.5px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                        {t.tournament_no}
                    </span>
                    <span className="text-[17px] font-bold truncate" style={{ fontFamily: DL.fontDisplay, color: DL.paper }}>{t.name}</span>
                    <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 text-[10.5px] uppercase tracking-[0.18em] font-bold rounded-full" style={{ fontFamily: DL.fontMono, backgroundColor: "rgba(184,131,40,0.15)", border: `1.5px solid ${DL.gold}`, color: DL.gold }}>
                        {t.status.replace(/_/g, " ")}
                    </span>
                    {daysUntilInfo && (
                        <span className="text-[11px] uppercase tracking-[0.18em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                            · {daysUntilInfo.label}
                        </span>
                    )}
                </div>
            )}
            <button
                onClick={() => navigate("/tournaments")}
                className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.18em] font-bold mb-5 rounded-full px-4 py-2 transition-colors"
                style={{ fontFamily: DL.fontMono, color: DL.ink, border: `1.5px solid ${DL.ruleStrong}` }}
                data-testid="trn-back"
            >
                <ChevronLeft size={14} strokeWidth={2.5} /> Back to Tournaments
            </button>

            {/* Band 1 · Hero */}
            <div ref={heroRef}>
            {/* Header hero card — embossed emerald slab */}
            <div
                className="p-8 md:p-10 mb-8 relative overflow-hidden"
                style={{
                    background: `linear-gradient(180deg, ${DL.emerald} 0%, #0a2f24 100%)`,
                    color: DL.paper,
                    borderRadius: "8px",
                    border: `1.5px solid ${DL.ruleStrong}`,
                    boxShadow: [
                        "inset 0 1px 0 rgba(255,255,255,0.10)",
                        "inset 0 -1px 0 rgba(0,0,0,0.35)",
                        "0 28px 60px -30px rgba(14,31,27,0.55)",
                        "0 8px 18px -8px rgba(14,31,27,0.25)",
                    ].join(", "),
                }}
            >
                <div className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                    {t.tournament_no} · {t.scope.replace(/_/g, "-")} · {t.format.replace(/_/g, "-")}
                </div>
                <h1 className="text-[40px] md:text-[52px] mt-3 leading-[1.05] tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}>
                    {t.name}
                </h1>
                {t.short_name && <div className="text-[12px] tracking-[0.28em] uppercase mt-2 font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>&ldquo;{t.short_name}&rdquo;</div>}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                    {daysUntilInfo && (
                        <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] font-bold rounded-full"
                            style={{
                                backgroundColor: daysUntilInfo.tone === "live" ? "rgba(184,131,40,0.20)" : daysUntilInfo.tone === "gold" ? "rgba(184,131,40,0.15)" : "rgba(0,0,0,0.25)",
                                border: `1.5px solid ${DL.gold}`,
                                color: daysUntilInfo.tone === "muted" ? "rgba(251,248,241,0.7)" : DL.gold,
                                fontFamily: DL.fontMono,
                            }}
                            data-testid="trn-days-chip"
                        >
                            {daysUntilInfo.tone === "live" && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: DL.gold }} />}
                            {daysUntilInfo.label}
                        </span>
                    )}
                    {parentTournament && (
                        <button
                            onClick={() => navigate(`/tournaments/${parentTournament.id}`)}
                            title={`Linked to ${parentTournament.name} — click to open the parent Inter-Divisional tournament`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] font-bold rounded-full transition-all"
                            style={{ backgroundColor: "rgba(184,131,40,0.15)", border: `1.5px solid ${DL.gold}`, color: DL.gold, fontFamily: DL.fontMono }}
                            data-testid="trn-detail-linked-parent"
                        >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DL.gold }} />
                            Linked to · {parentTournament.name}
                            <ChevronRight size={11} strokeWidth={2.5} />
                        </button>
                    )}
                    {/* Feb 2026 · Age-Filter Preview badge — shows the DOB/gender/medical rules from tournament_master */}
                    {eligSpec?.master_matched && (
                        <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] font-bold rounded-full"
                            style={{ backgroundColor: "rgba(184,131,40,0.12)", border: `1.5px solid ${DL.gold}`, color: DL.gold, fontFamily: DL.fontMono }}
                            title={`Eligibility rules from Tournament Master${eligSpec.master_name ? ` · ${eligSpec.master_name}` : ""}`}
                            data-testid="trn-hero-eligibility-badge"
                        >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DL.gold }} />
                            {eligSpec.age_grp || (eligSpec.gender === "Women" ? "Women" : "Men")}
                            {eligSpec.gender && eligSpec.age_grp && ` · ${eligSpec.gender}`}
                            {eligSpec.born_on_or_before && ` · born ≤ ${eligSpec.born_on_or_before}`}
                            {eligSpec.born_on_or_after && ` · born ≥ ${eligSpec.born_on_or_after}`}
                            {eligSpec.medical_required && " · Medical Req"}
                        </span>
                    )}
                </div>
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mt-7">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>Window</div>
                        <div className="text-[15px] font-semibold mt-1" style={{ color: "rgba(251,248,241,0.95)" }}>{fmtDate(t.start_date)} → {fmtDate(t.end_date)}</div>
                    </div>
                    {t.venue && (
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>Venue</div>
                            <div className="text-[15px] font-semibold mt-1" style={{ color: "rgba(251,248,241,0.95)" }}>{t.venue}</div>
                        </div>
                    )}
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>Age Bracket</div>
                        <div className="text-[15px] font-semibold mt-1" style={{ color: "rgba(251,248,241,0.95)" }}>{ageLabel} · max {t.max_squad_size}/squad</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>Status · Guest Players</div>
                        <div className="text-[15px] font-semibold mt-1" style={{ color: "rgba(251,248,241,0.95)" }}>{effectiveStatus} · {t.allows_guests ? "permitted" : "not permitted"}</div>
                    </div>
                </div>

                {canEdit && t.status !== "Cancelled" && t.status !== "Completed" && (
                    <div className="mt-7 flex flex-wrap gap-3" data-testid="trn-status-actions">
                        {/* Iter 108c · Status is now auto-derived from dates.  The only
                            manual actions retained are Complete-early and Cancel — both
                            terminal transitions that the calendar can't infer. */}
                        <button onClick={() => handleStatus("Completed")} className="px-5 py-2.5 rounded-full text-[12px] uppercase tracking-[0.18em] font-bold transition-colors" style={{ backgroundColor: DL.gold, color: DL.ink, fontFamily: DL.fontMono, boxShadow: "0 12px 24px -12px rgba(184,131,40,0.7)" }} data-testid="trn-complete">Mark Completed</button>
                        <button onClick={() => handleStatus("Cancelled")} className="px-5 py-2.5 rounded-full text-[12px] uppercase tracking-[0.18em] font-bold transition-colors" style={{ backgroundColor: "transparent", color: DL.paper, border: `1.5px solid rgba(251,248,241,0.4)`, fontFamily: DL.fontMono }} data-testid="trn-cancel">Cancel</button>
                    </div>
                )}
            </div>
            </div>

            {/* Band 2 · 4 Quick Stats — embossed strip below the hero */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="trn-quick-stats">
                {quickStats.map((s) => (
                    <div key={s.label} className="px-5 py-4" style={embossedCard()}>
                        <div className="text-[12px] uppercase tracking-[0.18em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{s.label}</div>
                        <div className="mt-1.5 text-[32px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 800 }}>{s.value}</div>
                        <div className="text-[12px] mt-1.5 font-semibold" style={{ color: DL.ink2 }}>{s.sub}</div>
                    </div>
                ))}
            </div>

            {/* Band 3 · Progression Ribbon (single source of truth for phase) */}
            <div className="mb-6">
                <TournamentProgressionRibbon tournamentId={id} refreshKey={progressKey} />
            </div>

            {/* Band 3b · Iter 122 — inline Maker-Checker approval chain.
                Shows PendingReview status, audit chain, and Approve/Return/Reject
                buttons to whichever office bearer has the matching post. */}
            <div className="mb-8" data-testid="tournament-approval-chain">
                <ApprovalChain
                    workflowKey="tournament_create"
                    docId={id}
                    onChange={() => setProgressKey((k) => k + 1)}
                />
            </div>

            {/* Band 4 · Workspace grid (was "Setup Boxes") */}
            <div className="mb-8">
                <div className="flex items-baseline gap-3 mb-3 flex-wrap">
                    <div className="text-[13px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink }}>
                        Workspace
                    </div>
                    {t.tournament_type_code && (
                        <div className="text-[12px] font-semibold" style={{ color: DL.ink2 }}>
                            Type: <span style={{ fontFamily: DL.fontMono, color: DL.gold, fontWeight: 700 }}>{t.tournament_type_code}</span>
                            <span className="ml-2" style={{ color: DL.ink, fontWeight: 700 }}>{getTypeByCode(t.tournament_type_code)?.name || ""}</span>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="setup-boxes">
                            {/* MPCA-237 · Ship 4a · Suppress the Accept banner when the current
                                persona IS the tournament creator (Division that both created and
                                hosts an Inter-District tournament). Show a tracker line instead.
                                Blast radius: fires only when scope=Inter_District AND persona is
                                the host Division. All other 7 tournament types unaffected. */}
                            {(() => {
                                const isDivisionCreator = t.scope === "Inter_District"
                                    && persona?.body_type === "Division"
                                    && persona?.body_code === t.host_body_id;
                                if (!isDivisionCreator) return null;
                                return (
                                    <div className="col-span-2 md:col-span-4 bulletin-card p-3 border-l-4 border-mpca-brass bg-mpca-parchment/50 flex items-center gap-3"
                                         data-testid="tournament-creator-tracker">
                                        <BadgeCheck className="text-mpca-brass shrink-0" size={16} />
                                        <div className="text-xs text-mpca-green-dark">
                                            <b>You created this tournament</b> — acceptances will come in from the participating Districts. Track their status in the Participants Matrix below.
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* M39x · Prominent Accept Tournament banner for Divisions/Districts with Pending acceptance */}
                            {myParticipation && myParticipation.acceptance_status === "Pending"
                                && !(t.scope === "Inter_District" && persona?.body_type === "Division" && persona?.body_code === t.host_body_id) && (
                                <div className="col-span-2 md:col-span-4 bulletin-card p-5 border-l-4 border-mpca-oxblood bg-mpca-oxblood/5"
                                     data-testid="tournament-accept-banner">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="text-mpca-oxblood shrink-0" size={22} />
                                            <div>
                                                <div className="overline flex items-center gap-2 mb-1">
                                                    <BadgeCheck size={12} /> Action required · {persona?.body_code}
                                                </div>
                                                <div className="font-serif text-xl text-mpca-oxblood">
                                                    Accept your tournament allocation
                                                </div>
                                                <p className="text-xs text-mpca-charcoal mt-1 max-w-2xl">
                                                    MPCA has assigned <b>{persona?.body_name || persona?.body_code}</b> as {myParticipation.role === "Host" ? "the Host" : "a Visitor"} in pool <b>{myParticipation.pool_name || "Main"}</b> for this tournament. Confirm your participation to unlock squad selection & budget acceptance.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button onClick={acceptTournament}
                                                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest bg-mpca-oxblood text-mpca-parchment hover:bg-mpca-oxblood/90 flex items-center gap-2"
                                                data-testid="tournament-accept-btn">
                                                <BadgeCheck size={12} /> Accept Tournament
                                            </button>
                                            <button onClick={declineTournament}
                                                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest border-2 border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood/10"
                                                data-testid="tournament-decline-btn">
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {myParticipation && myParticipation.acceptance_status === "Accepted" && (
                                <div className="col-span-2 md:col-span-4 bulletin-card p-3 border-l-4 border-mpca-green-dark bg-mpca-green-dark/5 flex items-center gap-3"
                                     data-testid="tournament-accepted-strip">
                                    <ShieldCheck className="text-mpca-green-dark" size={16} />
                                    <div className="text-xs text-mpca-green-dark">
                                        <b>Accepted</b> as {myParticipation.role} in pool <b>{myParticipation.pool_name || "Main"}</b> on {new Date(myParticipation.acceptance_at).toLocaleDateString("en-IN")}
                                    </div>
                                </div>
                            )}
                    <SetupBox testId="box-basics" icon={ListChecks} label="Tournament Basics" note={t.setup_meta?.category ? `${t.setup_meta.category} · ${t.setup_meta.age_group}` : "Category, teams, grounds"} onClick={() => setOpenBox(openBox === "basics" ? null : "basics")} active={openBox === "basics"} flag={wiringFlags["box-basics"]} />
                    {persona?.id === "match-official" ? (
                        <>
                            <SetupBox testId="box-calendar" icon={Calendar} label="Match Calendar" note={t.calendar_fixed ? "Locked · view fixtures" : "View fixtures"} onClick={() => setOpenBox(openBox === "calendar" ? null : "calendar")} active={openBox === "calendar"} flag={wiringFlags["box-calendar"]} />
                            <Link to={`/my-finance/${t.id}`} className="block" data-testid="box-my-finance-link">
                                <SetupBox testId="box-my-da" icon={ClipboardEdit} label="My DA / TA Form" note="Open dedicated finance page (Budget · Claim · Payment)" onClick={() => {}} active={false} flag={wiringFlags["box-my-da"]} />
                            </Link>
                        </>
                    ) : (
                        <>
                            {/* MPCA-235 · Ship A · Boxes ordered to match the 9-step wiring progression */}
                            {/* 2 · Pool / Participants */}
                            <SetupBox testId="box-participants" icon={UsersRound} label="Participants Matrix" note={(() => { const pools = (t.setup_meta?.division_pools || []).concat(t.setup_meta?.district_pools || []); const totalCodes = pools.flatMap(p => p.division_codes || p.district_codes || []).length; return pools.length ? `${totalCodes} bodies · ${pools.length} pool(s)` : "Set pools first"; })()} onClick={() => setOpenBox(openBox === "participants" ? null : "participants")} active={openBox === "participants"} flag={wiringFlags["box-participants"]} />
                            {/* 3 · Match Official Posting (moved up from utility footer). MPCA-238 · Note is wiring-owner driven. */}
                            <SetupBox
                                testId="box-officials"
                                icon={ShieldCheck}
                                label="Match Officials"
                                note={
                                    wiringFlags["box-officials"]?.owner === "Division"
                                        ? "Division posts umpires · scorers · referees · physios for this tournament"
                                        : wiringFlags["box-officials"]?.owner === "MPCA"
                                            ? "MPCA assigns umpires · scorers · referees · physios centrally"
                                            : "Umpires · scorers · referees · physios"
                                }
                                onClick={() => setOpenBox(openBox === "officials" ? null : "officials")}
                                active={openBox === "officials"}
                                flag={wiringFlags["box-officials"]}
                            />
                            {/* 4 · Squad */}
                            <SetupBox testId="box-squads" icon={Users} label="Squads" note="One per participating body · click to open selection" onClick={() => setOpenBox(openBox === "squads" ? null : "squads")} active={openBox === "squads"} flag={wiringFlags["box-squads"]} />
                            {/* 6 · Match Calendar */}
                            <SetupBox testId="box-calendar" icon={Calendar} label="Match Calendar" note={t.calendar_fixed ? "Locked" : "Editable"} onClick={() => setOpenBox(openBox === "calendar" ? null : "calendar")} active={openBox === "calendar"} flag={wiringFlags["box-calendar"]} />
                            {/* 6a · Days Engine (support for Match Calendar) */}
                            <SetupBox testId="box-days-engine" icon={CalendarClock} label="Days Engine" note="Match Days · Non-Match Days · calendar" onClick={() => setOpenBox(openBox === "days-engine" ? null : "days-engine")} active={openBox === "days-engine"} flag={wiringFlags["box-days-engine"]} />
                            {/* 7 · Unified Budget */}
                            <SetupBox testId="box-unified-budget" icon={Wallet} label="Unified Budget" note="Auto ₹ from Calendar × Rate Card × Officials" onClick={() => setOpenBox(openBox === "unified-budget" ? null : "unified-budget")} active={openBox === "unified-budget"} flag={wiringFlags["box-unified-budget"]} />
                            {/* 8 · Finance Console — now a plain SetupBox for consistency; opens the consolidated card below */}
                            <SetupBox testId="box-finance-console" icon={HandCoins} label="Finance Console" note="Budget · Invoices · Reimbursements · Summary" onClick={() => { setOpenBox(openBox === "finance-console" ? null : "finance-console"); }} active={openBox === "finance-console"} flag={wiringFlags["box-finance-console"]} />
                            {/* 9 · Closure Letter — end of tournament */}
                            <SetupBox
                                testId="box-closure"
                                icon={ScrollText}
                                label="Closure Letter"
                                note={isState ? "Generate · sign · dispatch" : "View once MPCA has closed the tournament"}
                                onClick={() => setOpenBox(openBox === "closure" ? null : "closure")}
                                active={openBox === "closure"}
                            />
                            {/* Utility footer — audit + comms */}
                            <SetupBox testId="box-activity" icon={History} label="Activity Log" note="Chronological trail of all actions" onClick={() => setOpenBox(openBox === "activity" ? null : "activity")} active={openBox === "activity"} />
                            <SetupBox testId="box-discussion" icon={MessageSquare} label="Discussion" note="Broadcast to all Divisions · or chat privately with one" onClick={() => setOpenBox(openBox === "discussion" ? null : "discussion")} active={openBox === "discussion"} />
                            {(t.tournament_scope === "Inter_Divisional" || t.scope === "Inter_Divisional") && (
                                <SetupBox testId="box-pre-camps" icon={UsersRound} label="Pre-Tournament Camps" note="One per participating body · auto-created on approval" onClick={() => setOpenBox(openBox === "pre-camps" ? null : "pre-camps")} active={openBox === "pre-camps"} />
                            )}
                        </>
                    )}
                </div>
                {openBox === "basics" && (
                    <div ref={panelRef} className="mt-4"><TournamentBasicsPanel tournament={t} canEdit={canEditSetup && (canEdit || persona?.body_code === t.host_body_id)} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "participants" && (
                    <div ref={panelRef} className="mt-4"><ParticipantsMatrix tournament={t} persona={persona} canManage={canEdit} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "squads" && (
                    <div ref={panelRef} className="mt-4"><TournamentSquadsPanel tournament={t} persona={persona} canManage={canEdit} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "input-vars" && (
                    <div ref={panelRef} className="mt-4"><InputVariablesPanel tournament={t} persona={persona} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "calendar" && (
                    <div ref={panelRef} className="mt-4"><MatchCalendarPanel tournament={t} canEdit={canEditSetup && (canEdit || persona?.body_code === t.host_body_id)} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "days-engine" && (
                    <div ref={panelRef} className="mt-4"><DaysEnginePanel tournament={t} canEdit={canEdit || persona?.body_code === t.host_body_id} /></div>
                )}
                {openBox === "unified-budget" && (
                    <div ref={panelRef} className="mt-4"><UnifiedBudgetPanel tournament={t} canEdit={canEdit || persona?.body_code === "MPCA"} /></div>
                )}
                {openBox === "finance-console" && (
                    <div ref={panelRef} className="mt-4"><TournamentFinanceCard tournament={t} persona={persona} /></div>
                )}
                {openBox === "budget" && (
                    <div ref={panelRef} className="mt-4"><TournamentBudgetsPanel tournament={t} persona={persona} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "invoices" && (
                    <div ref={panelRef} className="mt-4"><TournamentInvoicesPanel tournament={t} persona={persona} /></div>
                )}
                {openBox === "receipts" && (
                    <div ref={panelRef} className="mt-4"><TournamentReceiptsPanel tournament={t} canEdit={canEdit} /></div>
                )}
                {openBox === "summary" && (
                    <div ref={panelRef} className="mt-4"><FinancialSummaryPanel tournament={t} /></div>
                )}
                {openBox === "closure" && (
                    <div ref={panelRef} className="mt-4"><ClosureLetterPanel tournament={t} persona={persona} canGenerate={canEdit} /></div>
                )}
                {openBox === "my-da" && (
                    <div ref={panelRef} className="mt-4"><MatchOfficialDAPanel tournamentId={id} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "officials" && (
                    <div ref={panelRef} className="mt-4" data-testid="box-officials-panel"><MatchOfficialsPanel tournament={t} persona={persona} /></div>
                )}
                {openBox === "activity" && (
                    <div ref={panelRef} className="mt-4"><TournamentActivityLog tournamentId={id} /></div>
                )}
                {openBox === "pre-camps" && (
                    <div ref={panelRef} className="mt-4"><PreTournamentCampsPanel tournamentId={id} tournamentName={t.name} persona={persona} /></div>
                )}
            </div>

            {/* Feb 2026 · Discussion — slide-out drawer instead of an inline block */}
            {openBox === "discussion" && (
                <div
                    className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-full shadow-2xl overflow-y-auto"
                    style={{ background: `linear-gradient(180deg, ${DL.paper} 0%, ${DL.paperEdge} 100%)`, borderLeft: `2px solid ${DL.gold}` }}
                    data-testid="trn-discussion-drawer"
                >
                    <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b" style={{ backgroundColor: DL.emerald, borderColor: DL.gold, color: DL.paper }}>
                        <span className="text-[12px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>
                            / Discussion · {t.tournament_no}
                        </span>
                        <button
                            onClick={() => setOpenBox(null)}
                            className="text-[13px] font-bold w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors"
                            style={{ color: DL.emerald, backgroundColor: DL.gold, fontFamily: DL.fontMono }}
                            data-testid="trn-discussion-close"
                        >
                            ×
                        </button>
                    </div>
                    <div className="p-5">
                        <TournamentDiscussionBox tournamentId={id} />
                    </div>
                </div>
            )}

            {/* MPCA-125 + MPCA-154 · The inline "Participating Teams / Squads"
                grid and its New-Squad + Add-Player dialogs have been REMOVED.
                Every squad interaction is now consolidated on `/squads/{sid}`,
                accessible via the "Squads" setup box above. This removes the
                two-tab confusion (per MPCA-125) and ensures MPCA cannot add
                players from the tournament detail page (MPCA-154). */}
        </PageShell>
    );
};

export default TournamentDetail;

// M39-v2 · Tournament discussion with channel selector (General + per-Division private channels)
const TournamentDiscussionBox = ({ tournamentId }) => {
    const [channels, setChannels] = useState([]);
    const [selectedScope, setSelectedScope] = useState(null); // null = General
    const [threadId, setThreadId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/discussions/tournament/${tournamentId}/channels`);
                setChannels(data.channels || []);
            } catch { setChannels([{ body_scope: null, label: "General · All Divisions", kind: "general" }]); }
        })();
    }, [tournamentId]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setThreadId(null);
            try {
                const params = selectedScope ? { body_scope: selectedScope } : {};
                const { data } = await api.get(`/discussions/tournament/${tournamentId}`, { params });
                setThreadId(data.id);
            } catch { /* silent */ }
            finally { setLoading(false); }
        })();
    }, [tournamentId, selectedScope]);

    const activeLabel = (channels.find((c) => (c.body_scope || null) === (selectedScope || null)) || {}).label;

    return (
        <div data-testid="tournament-discussion-box">
            {channels.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-2" data-testid="discussion-channels">
                    {channels.map((c) => {
                        const isActive = (c.body_scope || null) === (selectedScope || null);
                        const tid = c.body_scope || "general";
                        return (
                            <button
                                key={tid}
                                onClick={() => setSelectedScope(c.body_scope || null)}
                                className={`text-[10px] uppercase tracking-widest px-3 py-1.5 border ${isActive
                                    ? "bg-mpca-green-dark text-mpca-gold-light border-mpca-green-dark"
                                    : "border-mpca-brass/40 text-mpca-green-dark hover:bg-mpca-parchment/40"}`}
                                data-testid={`discussion-channel-${tid}`}
                            >
                                {c.label}
                            </button>
                        );
                    })}
                </div>
            )}
            {activeLabel && (
                <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-2" data-testid="discussion-active-channel">
                    Active channel · {activeLabel}
                </div>
            )}
            {loading || !threadId
                ? <div className="bulletin-card p-6 text-[11px] text-mpca-brass">Opening discussion thread…</div>
                : <DiscussionThread key={threadId} threadId={threadId} height="60vh" />}
        </div>
    );
};


// MPCA-204 · Pre-Tournament Camps panel (Inter-Divisional tournaments only)
const PreTournamentCampsPanel = ({ tournamentId, tournamentName, persona }) => {
    const [camps, setCamps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [participants, setParticipants] = useState([]);
    const navigate = useNavigate();

    const load = async () => {
        setLoading(true);
        try {
            const [c, p] = await Promise.all([
                api.get(`/tournaments/${tournamentId}/pre-tournament-camps`).then((r) => r.data).catch(() => []),
                api.get(`/tournaments/${tournamentId}/participants`).then((r) => r.data).catch(() => []),
            ]);
            setCamps(c || []);
            setParticipants((p || []).filter((x) => !x.removed_at));
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [tournamentId]);

    const campByBody = useMemo(() => Object.fromEntries((camps || []).map((c) => [c.body_id, c])), [camps]);
    const isMPCA = persona?.body_type === "State" || persona?.body_code === "MPCA";
    const inviteReciprocal = async (hostCid, visitorCode) => {
        try {
            await api.post(`/camps/${hostCid}/reciprocal-visitors`, { body_id: visitorCode, invited_by: persona?.display_name });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const removeReciprocal = async (hostCid, visitorCode) => {
        if (!window.confirm("Remove this reciprocal visitor?")) return;
        try {
            await api.delete(`/camps/${hostCid}/reciprocal-visitors/${visitorCode}`);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading) return <div className="bulletin-card p-6 text-[11px] text-mpca-brass">Loading camps…</div>;

    return (
        <div className="space-y-4" data-testid="pre-camps-panel">
            <div className="bulletin-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="overline">Pre-Tournament Camps</div>
                        <div className="font-serif text-xl text-mpca-green-dark mt-1">{tournamentName}</div>
                        <p className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl">
                            One Pre-Tournament Camp is auto-materialised for every participating body when this tournament is Approved. Each Division can budget & claim its camp independently. Divisions may join another division&apos;s camp as a <em>reciprocal visitor</em> — the host camp then receives extra budget top-ups (accommodation + food of visiting team + umpire &amp; scorer fees).
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="overline text-[9px]">Camps</div>
                        <div className="font-mono text-lg text-mpca-oxblood">{camps.length} / {participants.length}</div>
                    </div>
                </div>
            </div>

            {participants.length === 0 && (
                <div className="bulletin-card p-4 text-[11px] text-mpca-brass" data-testid="pre-camps-no-participants">
                    No participating bodies on this tournament yet. Add participants first — camps materialise automatically on plan approval.
                </div>
            )}

            {participants.map((p) => {
                const c = campByBody[p.body_code];
                return (
                    <div key={p.body_code} className="bulletin-card p-4" data-testid={`pre-camp-row-${p.body_code}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <div className="font-serif text-base text-mpca-green-dark">{p.body_name}</div>
                                <div className="text-[10px] text-mpca-brass uppercase tracking-widest">
                                    {p.role || "Participant"}{c ? ` · Camp ${c.camp_no}` : " · No camp yet"}
                                </div>
                                {c && (
                                    <div className="text-[10px] text-mpca-gray-dark mt-1">
                                        {c.start_date} → {c.end_date} · Status <span className="font-mono">{c.status}</span>
                                        {c.auto_created_from_tournament && <span className="ml-2 text-mpca-navy">· Auto</span>}
                                    </div>
                                )}
                            </div>
                            {c ? (
                                <button
                                    onClick={() => navigate(`/camps/${c.id}`)}
                                    className="text-[10px] uppercase tracking-widest border border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory px-3 py-1.5"
                                    data-testid={`open-camp-${p.body_code}`}
                                >
                                    Open Camp
                                </button>
                            ) : (isMPCA || persona?.body_code === p.body_code) ? (
                                <button
                                    onClick={async () => {
                                        try {
                                            const cycle = camps[0]?.fiscal_cycle || new Date().getFullYear() + "-" + String((new Date().getFullYear() + 1) % 100).padStart(2, "0");
                                            const today = new Date();
                                            const startISO = today.toISOString().slice(0, 10);
                                            const endD = new Date(today); endD.setDate(endD.getDate() + 6);
                                            const endISO = endD.toISOString().slice(0, 10);
                                            const { data: created } = await api.post("/camps", {
                                                name: `${p.body_name || p.body_code} · Pre-Tournament Camp`,
                                                body_id: p.body_code,
                                                camp_type: "Pre_Tournament_Camp",
                                                // MPCA-253 · Do NOT force scheme_code="3-D". Pre-Tournament
                                                // camps follow the Master Rate Card like tournaments (per
                                                // tournament_type × format × head). Backend leaves
                                                // scheme_code null; the ratecard-driven auto-budget path
                                                // takes over.
                                                fiscal_cycle: cycle,
                                                start_date: startISO,
                                                end_date:   endISO,
                                                inter_division_tournament_id: tournamentId,
                                                inter_division_tournament_name: tournamentName,
                                                created_by: persona?.name,
                                            });
                                            navigate(`/camps/${created.id}`);
                                        } catch (e) {
                                            // MPCA-253 · Pydantic validation errors are `{detail: [{...}, ...]}`.
                                            // Coerce to a legible message instead of "[object Object]".
                                            const raw = e?.response?.data?.detail;
                                            const msg = Array.isArray(raw)
                                                ? raw.map(x => `• ${x.loc?.join(".") || "field"}: ${x.msg}`).join("\n")
                                                : (typeof raw === "string" ? raw : e.message);
                                            alert(msg);
                                        }
                                    }}
                                    className="text-[10px] uppercase tracking-widest border border-mpca-brass text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory px-3 py-1.5"
                                    data-testid={`start-camp-${p.body_code}`}
                                >
                                    Start Camp
                                </button>
                            ) : (
                                <span className="text-[10px] text-mpca-oxblood italic">Auto-creates on tournament approval</span>
                            )}
                        </div>
                        {c && (
                            <div className="mt-3 pl-3 border-l-2 border-mpca-brass/30">
                                <div className="overline text-[9px] flex items-center justify-between mb-2">
                                    <span>Reciprocal Visitors · {(c.reciprocal_visitors || []).length}</span>
                                    {(isMPCA || persona?.body_code === c.body_id) && (
                                        <select
                                            defaultValue=""
                                            onChange={(e) => { if (e.target.value) { inviteReciprocal(c.id, e.target.value); e.target.value = ""; } }}
                                            className="text-[10px] normal-case tracking-normal border border-mpca-brass/40 px-2 py-1 bg-mpca-parchment"
                                            data-testid={`invite-reciprocal-${p.body_code}`}
                                        >
                                            <option value="">+ Invite visiting body</option>
                                            {participants
                                                .filter((x) => x.body_code !== c.body_id && !(c.reciprocal_visitors || []).some((r) => r.body_id === x.body_code))
                                                .map((x) => <option key={x.body_code} value={x.body_code}>{x.body_name}</option>)}
                                        </select>
                                    )}
                                </div>
                                {(c.reciprocal_visitors || []).length === 0 ? (
                                    <div className="text-[10px] text-mpca-gray-dark italic">None yet.</div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {c.reciprocal_visitors.map((v) => (
                                            <div key={v.body_id} className="text-[10px] bg-mpca-navy text-mpca-gold-light px-2 py-1 flex items-center gap-2" data-testid={`reciprocal-${p.body_code}-${v.body_id}`}>
                                                {v.body_name}
                                                {(isMPCA || persona?.body_code === c.body_id) && (
                                                    <button onClick={() => removeReciprocal(c.id, v.body_id)} className="hover:text-mpca-oxblood" title="Remove">×</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
