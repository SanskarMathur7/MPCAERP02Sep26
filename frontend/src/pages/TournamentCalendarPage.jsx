import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { fetchTournaments, fetchBodies } from "@/lib/api";
import { LayoutList, LayoutGrid, Filter } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import TournamentCalendarView from "@/components/TournamentCalendarView";

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ─────────── Persona-based scope filter ───────────
// MPCA (State) → sees ALL tournaments.
// Division → tournaments where their DIV code is host OR appears on acceptance.required_from
//           OR is fielding a squad (via participating body list — best proxy: acceptance list).
// District → same rule, scoped to their DIST code (or its parent DIV automatically).
// Match Official → only tournaments they are assigned to (approx: MPCA + acceptance-required).
const scopeTournamentsForPersona = (tournaments, persona) => {
    if (!persona) return tournaments;
    const bodyCode = persona.body_code;
    if (!bodyCode || persona.body_type === "State") return tournaments;
    if (persona.body_type === "Official") {
        // Match officials see any tournament that has an official DA form for them — approx: show all state + MPCA-hosted.
        // Deep-linking to DA is done from /my-da-forms so keep this permissive.
        return tournaments;
    }
    // Division / District
    const parentDivPrefix = bodyCode.startsWith("DIST-")
        ? "DIV-" + bodyCode.split("-").pop() // DIST-INDO-IND → DIV-IND
        : null;
    return tournaments.filter((t) => {
        if (t.host_body_id === bodyCode) return true;
        if (parentDivPrefix && t.host_body_id === parentDivPrefix) return true;
        const req = (t.acceptance?.required_from) || [];
        if (req.includes(bodyCode)) return true;
        if (parentDivPrefix && req.includes(parentDivPrefix)) return true;
        return false;
    });
};

const TOURNAMENT_TYPE_LABEL = {
    MPCA_InterDivisional: "Inter-Divisional",
    MPCA_Championship: "Championship",
    BCCI: "BCCI",
    Invitational: "Invitational",
    Other: "Other",
};

const TournamentCalendarPage = () => {
    const { persona } = useAuth();
    const [list, setList] = useState([]);
    const [bodies, setBodies] = useState([]);
    const [loading, setLoading] = useState(true);
    // MPCA defaults to Month grid; Divisions default to List (per user choice).
    const [viewMode, setViewMode] = useState(persona?.body_type === "State" ? "calendar" : "list");
    const [typeFilter, setTypeFilter] = useState("all");

    useEffect(() => {
        (async () => {
            try {
                const [t, b] = await Promise.all([
                    fetchTournaments().catch(() => []),
                    fetchBodies().catch(() => []),
                ]);
                setList(t || []);
                setBodies(b || []);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const scoped = useMemo(() => scopeTournamentsForPersona(list, persona), [list, persona]);

    const typeFiltered = useMemo(() => {
        if (typeFilter === "all") return scoped;
        return scoped.filter((t) => t.tournament_type === typeFilter);
    }, [scoped, typeFilter]);

    const sortedByDate = useMemo(() => {
        return [...typeFiltered].sort((a, b) => {
            const da = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
            const db = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
            return da - db;
        });
    }, [typeFiltered]);

    if (loading)
        return (
            <div className="p-16" data-testid="calendar-loading">
                <CricketLoader size="lg" label="Loading tournament calendar…" />
            </div>
        );

    const scopeLabel = persona?.body_type === "State"
        ? "All tournaments · state-wide"
        : `Filtered to tournaments allocated to ${persona?.body_name || persona?.body_code}`;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="tournament-calendar-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
                <div>
                    <div className="overline">Article VII · Match Calendar</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Tournament Calendar
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl" data-testid="calendar-scope-label">
                        {scopeLabel}. Read-only schedule view · click any tournament to open its full workspace.
                    </p>
                </div>
            </div>

            <div className="crest-divider mb-8" />

            {/* View toggle + type filter */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                <div className="inline-flex border border-mpca-brass/40 mr-3" data-testid="cal-view-toggle">
                    <button
                        onClick={() => setViewMode("list")}
                        className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5 ${viewMode === "list" ? "bg-mpca-green-dark text-mpca-ivory" : "text-mpca-green-dark hover:bg-mpca-parchment"}`}
                        data-testid="cal-view-list"
                    >
                        <LayoutList size={12} strokeWidth={1.5} /> List
                    </button>
                    <button
                        onClick={() => setViewMode("calendar")}
                        className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5 border-l border-mpca-brass/40 ${viewMode === "calendar" ? "bg-mpca-green-dark text-mpca-ivory" : "text-mpca-green-dark hover:bg-mpca-parchment"}`}
                        data-testid="cal-view-month"
                    >
                        <LayoutGrid size={12} strokeWidth={1.5} /> Month
                    </button>
                </div>

                <Filter size={12} className="text-mpca-gray-dark" />
                {[
                    ["all", "All Types"],
                    ["MPCA_InterDivisional", "Inter-Divisional"],
                    ["MPCA_Championship", "Championships"],
                    ["BCCI", "BCCI"],
                    ["Invitational", "Invitational"],
                ].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setTypeFilter(k)}
                        data-testid={`cal-type-${k}`}
                        className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold border transition-colors ${typeFilter === k ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:bg-mpca-parchment"}`}
                    >
                        {label}
                    </button>
                ))}
                <div className="ml-auto text-[10px] text-mpca-gray-dark uppercase tracking-widest font-mono" data-testid="cal-scoped-count">
                    {typeFiltered.length} tournament(s)
                </div>
            </div>

            {viewMode === "calendar" ? (
                <TournamentCalendarView tournaments={typeFiltered} bodies={bodies} />
            ) : (
                <div className="bulletin-card overflow-hidden" data-testid="cal-list">
                    {sortedByDate.length === 0 ? (
                        <div className="p-12 text-center text-mpca-gray-dark italic font-serif" data-testid="cal-empty">
                            No tournaments in your calendar yet.
                        </div>
                    ) : (
                        <div className="divide-y divide-mpca-brass/15">
                            {sortedByDate.map((t) => (
                                <Link
                                    key={t.id}
                                    to={`/tournaments/${t.id}`}
                                    className="block px-6 py-4 hover:bg-mpca-parchment/40 transition-colors"
                                    data-testid={`cal-row-${t.id}`}
                                >
                                    <div className="flex items-center gap-4 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="overline text-[9px]">
                                                {t.tournament_no} · {TOURNAMENT_TYPE_LABEL[t.tournament_type] || t.tournament_type} · {t.format.replace(/_/g, "-")}
                                            </div>
                                            <div className="font-serif text-lg text-mpca-green-dark mt-1">{t.name}</div>
                                            <div className="text-[11px] text-mpca-gray-dark mt-1">
                                                {fmtDate(t.start_date)} → {fmtDate(t.end_date)}
                                                {t.host_body_id && <> · Host: <span className="font-mono text-mpca-brass">{t.host_body_id}</span></>}
                                                {t.venue_name_snapshot && <> · {t.venue_name_snapshot}</>}
                                            </div>
                                        </div>
                                        <span className="pill pill-active">{t.status.replace(/_/g, " ")}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TournamentCalendarPage;
