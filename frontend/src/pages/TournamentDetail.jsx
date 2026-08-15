import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    fetchTournament, fetchSquads,
    setTournamentStatus, fetchBodies, api,
} from "@/lib/api";
import {
    Trophy, Calendar, MapPin, Users, ChevronLeft, ShieldCheck, AlertTriangle, BadgeCheck,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import TournamentSubTabs from "@/components/TournamentSubTabs";
import TournamentProgress from "@/components/TournamentProgress";
import TournamentProgressionRibbon from "@/components/TournamentProgressionRibbon";
import InputVariablesPanel from "@/components/InputVariablesPanel";
import TournamentBudgetsPanel from "@/components/TournamentBudgetsPanel";
import TournamentInvoicesPanel from "@/components/TournamentInvoicesPanel";
import TournamentStatusStepper from "@/components/TournamentStatusStepper";
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

const SetupBox = ({ testId, icon: Icon, label, note, onClick, active, flag }) => (
    <button
        onClick={onClick}
        className={`text-left border p-3 hover:bg-mpca-cream/30 transition-all group relative ${active ? "border-mpca-oxblood bg-mpca-cream/40" : "border-mpca-brass/30"}`}
        data-testid={testId}
    >
        {flag && (
            <span
                data-testid={`${testId}-flag`}
                title={
                    flag === "M"    ? "Mandatory — required for this tournament type" :
                    flag === "O"    ? "Optional — you may fill this if useful" :
                    flag === "NA"   ? "Not required for this tournament type — you may still add data, but it won't be used elsewhere" :
                    flag === "INFO" ? "Informational / audit trail" : ""
                }
                className={
                    "absolute top-2 right-2 text-[8px] font-mono px-1 py-px border " +
                    (flag === "M"    ? "bg-mpca-oxblood/10 border-mpca-oxblood/40 text-mpca-oxblood" :
                     flag === "O"    ? "bg-mpca-brass/15 border-mpca-brass/40 text-mpca-brass" :
                     flag === "NA"   ? "bg-mpca-ivory border-dashed border-mpca-gray/40 text-mpca-gray" :
                     flag === "INFO" ? "bg-mpca-brass/10 border-mpca-brass/30 text-mpca-brass" :
                                       "border-mpca-gray/30 text-mpca-gray")
                }
            >
                {flag === "NA" ? "OPTIONAL·NOT USED" : flag === "M" ? "REQUIRED" : flag === "O" ? "OPTIONAL" : "INFO"}
            </span>
        )}
        <div className="flex items-center gap-2 mb-1">
            <Icon size={14} className="text-mpca-brass" strokeWidth={1.6} />
            <span className="text-[10px] uppercase tracking-widest text-mpca-brass">Setup</span>
        </div>
        <div className="font-serif text-sm text-mpca-green-dark group-hover:text-mpca-oxblood">{label}</div>
        <div className="text-[10px] text-mpca-gray-dark mt-1 font-mono">{note}</div>
    </button>
);

const TournamentDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { persona } = useAuth();
    const [t, setT] = useState(null);
    const [squads, setSquads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bodies, setBodies] = useState([]);
    const [openBox, setOpenBox] = useState(null); // "calendar"|"receipts"|"summary"|"closure"
    const [progressKey, setProgressKey] = useState(0);
    const [myParticipation, setMyParticipation] = useState(null);   // M39x
    const [wiringFlags, setWiringFlags] = useState({});             // MPCA-235 · Ship 3 · flag per box

    // MPCA-235 · Ship 3 · Read the wiring status once and build a box-testid → flag map
    // so each SetupBox shows a Mandatory / Optional / Optional·Not Used badge.
    // NA cells stay fully functional — the badge just tells the user this data
    // won't be used elsewhere in the ERP for this tournament type.
    useEffect(() => {
        let alive = true;
        api.get(`/tournaments/${id}/wiring-status`)
            .then(r => {
                if (!alive) return;
                const stepFlag = Object.fromEntries((r.data.steps || []).map(s => [s.key, s.flag]));
                setWiringFlags({
                    "box-basics":         stepFlag.pool_basics,
                    "box-participants":   stepFlag.pool_basics,
                    "box-officials":      stepFlag.match_official_posting,
                    "box-squads":         stepFlag.squad,
                    "box-calendar":       stepFlag.match_calendar,
                    "box-days-engine":    stepFlag.match_calendar,
                    "box-unified-budget": stepFlag.unified_budget,
                    "box-finance":        stepFlag.finance_console,
                    "box-my-da":          stepFlag.finance_console,
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
    const canEditSquad = (t.status === "Upcoming" || t.status === "Squad_Selection");
    const divisions = bodies.filter((b) => b.body_type === "Division");
    const districts = bodies.filter((b) => b.body_type === "District");
    const ageLabel = t.age_cap_years ? "U-" + t.age_cap_years : (t.age_floor_years ? t.age_floor_years + "+" : "Senior");

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="trn-detail-page">
            <TournamentSubTabs tournamentId={id} active="overview" />
            <button onClick={() => navigate("/tournaments")} className="btn-heritage-ghost mb-6" data-testid="trn-back">
                <ChevronLeft size={14} /> Back to Tournaments
            </button>

            {/* Header card */}
            <div className="bulletin-card p-8 mb-10 bg-gradient-to-br from-mpca-green-dark to-mpca-wood-dark text-mpca-ivory relative overflow-hidden">
                <div className="overline !text-mpca-gold-light">{t.tournament_no} · {t.scope.replace(/_/g, "-")} · {t.format.replace(/_/g, "-")}</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-ivory mt-3 leading-tight">
                    {t.name}
                </h1>
                {t.short_name && <div className="text-xs tracking-[0.3em] uppercase text-mpca-gold-light mt-2">&ldquo;{t.short_name}&rdquo;</div>}
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-5 mt-7 text-mpca-ivory/90">
                    <div className="flex items-start gap-2">
                        <Calendar size={16} className="text-mpca-gold-light mt-0.5" />
                        <div>
                            <div className="overline text-[9px] !text-mpca-gold-light">Window</div>
                            <div className="text-sm mt-0.5">{fmtDate(t.start_date)} → {fmtDate(t.end_date)}</div>
                        </div>
                    </div>
                    {t.venue && (
                        <div className="flex items-start gap-2">
                            <MapPin size={16} className="text-mpca-gold-light mt-0.5" />
                            <div>
                                <div className="overline text-[9px] !text-mpca-gold-light">Venue</div>
                                <div className="text-sm mt-0.5">{t.venue}</div>
                            </div>
                        </div>
                    )}
                    <div className="flex items-start gap-2">
                        <Users size={16} className="text-mpca-gold-light mt-0.5" />
                        <div>
                            <div className="overline text-[9px] !text-mpca-gold-light">Age Bracket</div>
                            <div className="text-sm mt-0.5">{ageLabel} · max {t.max_squad_size}/squad</div>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <ShieldCheck size={16} className="text-mpca-gold-light mt-0.5" />
                        <div>
                            <div className="overline text-[9px] !text-mpca-gold-light">Status · Guest Players</div>
                            <div className="text-sm mt-0.5">{t.status.replace(/_/g, " ")} · {t.allows_guests ? "permitted" : "not permitted"}</div>
                        </div>
                    </div>
                </div>

                {canEdit && (
                    <div className="mt-7 flex flex-wrap gap-3" data-testid="trn-status-actions">
                        {t.status === "Upcoming" && <button onClick={() => handleStatus("Squad_Selection")} className="btn-heritage-primary !bg-mpca-brass !text-mpca-green-dark" data-testid="trn-open-selection">Open Squad Selection</button>}
                        {t.status === "Squad_Selection" && <button onClick={() => handleStatus("In_Progress")} className="btn-heritage-primary !bg-mpca-brass !text-mpca-green-dark" data-testid="trn-start">Start Tournament</button>}
                        {t.status === "In_Progress" && <button onClick={() => handleStatus("Completed")} className="btn-heritage-primary !bg-mpca-brass !text-mpca-green-dark" data-testid="trn-complete">Mark Completed</button>}
                        {t.status !== "Cancelled" && t.status !== "Completed" && <button onClick={() => handleStatus("Cancelled")} className="btn-heritage-secondary !text-mpca-ivory !border-mpca-ivory/40 hover:!bg-white/10" data-testid="trn-cancel">Cancel</button>}
                    </div>
                )}
            </div>

            {/* Sprint M30 · Status stepper + Pending With Me */}
            <TournamentStatusStepper tournament={t} persona={persona} onAction={() => { refreshProgress(); load(); }} />

            {/* Sprint M19 · Progress stepper (5 phases) */}
            <div className="mb-8">
                <TournamentProgress tournamentId={id} refreshKey={progressKey} />
            </div>

            {/* MPCA-235 · Ship 2 · Tournament Progression Ribbon (Wiring-driven) */}
            <div className="mb-8">
                <TournamentProgressionRibbon tournamentId={id} refreshKey={progressKey} />
            </div>

            {/* Sprint M19 · 8 setup boxes grid */}
            <div className="mb-10">
                <div className="overline mb-3">Tournament Workspace · setup boxes</div>
                {t.tournament_type_code && (
                    <div className="mb-3 text-[11px] text-mpca-gray-dark">
                        Type: <span className="font-mono text-mpca-brass">{t.tournament_type_code}</span>
                        <span className="ml-2 font-serif text-mpca-green-dark">{getTypeByCode(t.tournament_type_code)?.name || ""}</span>
                    </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="setup-boxes">
                            {/* M39x · Prominent Accept Tournament banner for Divisions/Districts with Pending acceptance */}
                            {myParticipation && myParticipation.acceptance_status === "Pending" && (
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
                            <SetupBox testId="box-participants" icon={UsersRound} label="Participants Matrix" note={(() => { const pools = (t.setup_meta?.division_pools || []).concat(t.setup_meta?.district_pools || []); const totalCodes = pools.flatMap(p => p.division_codes || p.district_codes || []).length; return pools.length ? `${totalCodes} bodies · ${pools.length} pool(s)` : "Set pools first"; })()} onClick={() => setOpenBox(openBox === "participants" ? null : "participants")} active={openBox === "participants"} flag={wiringFlags["box-participants"]} />
                            <SetupBox testId="box-squads" icon={Users} label="Squads" note="One per participating body · click to open selection" onClick={() => setOpenBox(openBox === "squads" ? null : "squads")} active={openBox === "squads"} flag={wiringFlags["box-squads"]} />
                            <SetupBox testId="box-calendar" icon={Calendar} label="Match Calendar" note={t.calendar_fixed ? "Locked" : "Editable"} onClick={() => setOpenBox(openBox === "calendar" ? null : "calendar")} active={openBox === "calendar"} flag={wiringFlags["box-calendar"]} />
                            <SetupBox testId="box-days-engine" icon={CalendarClock} label="Days Engine" note="Match Days · Non-Match Days · calendar" onClick={() => setOpenBox(openBox === "days-engine" ? null : "days-engine")} active={openBox === "days-engine"} flag={wiringFlags["box-days-engine"]} />
                            <SetupBox testId="box-unified-budget" icon={Wallet} label="Unified Budget" note="Auto ₹ from Calendar × Rate Card × Officials" onClick={() => setOpenBox(openBox === "unified-budget" ? null : "unified-budget")} active={openBox === "unified-budget"} flag={wiringFlags["box-unified-budget"]} />
                            {/* MPCA-125 · Removed the duplicate "Squad Selection" box — the
                                "Squads" box above is now the ONLY entry point (multi-body
                                view for MPCA, direct link to my squad for Division/District). */}
                            {/* M39t · Consolidated Finance action card — replaces the 6 individual finance boxes */}
                            <TournamentFinanceCard tournament={t} persona={persona} />
                            {/* Aug 2026 · Restored direct-access Closure Letter box.
                                MPCA generates + signs; Division/District can view once
                                generated. The panel is still available via
                                Finance Console → Closure Letter tab for MPCA. */}
                            <SetupBox
                                testId="box-closure"
                                icon={ScrollText}
                                label="Closure Letter"
                                note={isState ? "Generate · sign · dispatch" : "View once MPCA has closed the tournament"}
                                onClick={() => setOpenBox(openBox === "closure" ? null : "closure")}
                                active={openBox === "closure"}
                            />
                            {/* MPCA-133+ · Match Officials (moved out of Finance Console per user request). */}
                            <SetupBox testId="box-officials" icon={ShieldCheck} label="Match Officials" note="MPCA assigns umpires · scorers · referees · physios centrally" onClick={() => setOpenBox(openBox === "officials" ? null : "officials")} active={openBox === "officials"} flag={wiringFlags["box-officials"]} />
                            <SetupBox testId="box-activity" icon={History} label="Activity Log" note="Chronological trail of all actions" onClick={() => setOpenBox(openBox === "activity" ? null : "activity")} active={openBox === "activity"} />
                            <SetupBox testId="box-discussion" icon={MessageSquare} label="Discussion" note="Broadcast to all Divisions · or chat privately with one" onClick={() => setOpenBox(openBox === "discussion" ? null : "discussion")} active={openBox === "discussion"} />
                            {t.tournament_scope === "Inter_Divisional" && (
                                <SetupBox testId="box-pre-camps" icon={UsersRound} label="Pre-Tournament Camps" note="One per participating body · auto-created on approval" onClick={() => setOpenBox(openBox === "pre-camps" ? null : "pre-camps")} active={openBox === "pre-camps"} />
                            )}
                        </>
                    )}
                </div>
                {openBox === "basics" && (
                    <div className="mt-4"><TournamentBasicsPanel tournament={t} canEdit={canEditSetup && (canEdit || persona?.body_code === t.host_body_id)} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "participants" && (
                    <div className="mt-4"><ParticipantsMatrix tournament={t} persona={persona} canManage={canEdit} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "squads" && (
                    <div className="mt-4"><TournamentSquadsPanel tournament={t} persona={persona} canManage={canEdit} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "input-vars" && (
                    <div className="mt-4"><InputVariablesPanel tournament={t} persona={persona} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "calendar" && (
                    <div className="mt-4"><MatchCalendarPanel tournament={t} canEdit={canEditSetup && (canEdit || persona?.body_code === t.host_body_id)} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "days-engine" && (
                    <div className="mt-4"><DaysEnginePanel tournament={t} canEdit={canEdit || persona?.body_code === t.host_body_id} /></div>
                )}
                {openBox === "unified-budget" && (
                    <div className="mt-4"><UnifiedBudgetPanel tournament={t} canEdit={canEdit || persona?.body_code === "MPCA"} /></div>
                )}
                {openBox === "budget" && (
                    <div className="mt-4"><TournamentBudgetsPanel tournament={t} persona={persona} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "invoices" && (
                    <div className="mt-4"><TournamentInvoicesPanel tournament={t} persona={persona} /></div>
                )}
                {openBox === "receipts" && (
                    <div className="mt-4"><TournamentReceiptsPanel tournament={t} canEdit={canEdit} /></div>
                )}
                {openBox === "summary" && (
                    <div className="mt-4"><FinancialSummaryPanel tournament={t} /></div>
                )}
                {openBox === "closure" && (
                    <div className="mt-4"><ClosureLetterPanel tournament={t} persona={persona} canGenerate={canEdit} /></div>
                )}
                {openBox === "my-da" && (
                    <div className="mt-4"><MatchOfficialDAPanel tournamentId={id} onChange={() => { refreshProgress(); load(); }} /></div>
                )}
                {openBox === "officials" && (
                    <div className="mt-4" data-testid="box-officials-panel"><MatchOfficialsPanel tournament={t} persona={persona} /></div>
                )}
                {openBox === "activity" && (
                    <div className="mt-4"><TournamentActivityLog tournamentId={id} /></div>
                )}
                {openBox === "discussion" && (
                    <div className="mt-4"><TournamentDiscussionBox tournamentId={id} /></div>
                )}
                {openBox === "pre-camps" && (
                    <div className="mt-4"><PreTournamentCampsPanel tournamentId={id} tournamentName={t.name} persona={persona} /></div>
                )}
            </div>

            {/* MPCA-125 + MPCA-154 · The inline "Participating Teams / Squads"
                grid and its New-Squad + Add-Player dialogs have been REMOVED.
                Every squad interaction is now consolidated on `/squads/{sid}`,
                accessible via the "Squads" setup box above. This removes the
                two-tab confusion (per MPCA-125) and ensures MPCA cannot add
                players from the tournament detail page (MPCA-154). */}
        </div>
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
