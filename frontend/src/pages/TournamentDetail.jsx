import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    fetchTournament, fetchSquads, createSquad, addPlayerToSquad, removePlayerFromSquad,
    setTournamentStatus, fetchPlayers, fetchBodies, api,
} from "@/lib/api";
import {
    Trophy, Calendar, MapPin, Users, ChevronLeft, Plus, X, ShieldCheck, AlertTriangle, Crown, BadgeCheck,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import TournamentSubTabs from "@/components/TournamentSubTabs";
import TournamentProgress from "@/components/TournamentProgress";
import InputVariablesPanel from "@/components/InputVariablesPanel";
import TournamentBudgetsPanel from "@/components/TournamentBudgetsPanel";
import TournamentInvoicesPanel from "@/components/TournamentInvoicesPanel";
import TournamentStatusStepper from "@/components/TournamentStatusStepper";
import TournamentBasicsPanel from "@/components/TournamentBasicsPanel";
import ParticipantsMatrix from "@/components/ParticipantsMatrix";
import TournamentSquadsPanel from "@/components/TournamentSquadsPanel";
import {
    MatchCalendarPanel, TournamentReceiptsPanel, FinancialSummaryPanel, ClosureLetterPanel,
} from "@/components/TournamentWorkspacePanels";
import { getTypeByCode } from "@/lib/tournamentCatalog";
import { Wallet, ArrowRight, Sliders, Receipt, ScrollText, Activity, HandCoins, Landmark, ListChecks, UsersRound, ClipboardEdit, History, MessageSquare } from "lucide-react";
import MatchOfficialDAPanel from "@/components/MatchOfficialDAPanel";
import TournamentActivityLog from "@/components/TournamentActivityLog";
import DiscussionThread from "@/components/DiscussionThread";
import TournamentFinanceCard from "@/components/TournamentFinanceCard";

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const ROLE_LABEL = { Batter: "Batter", Bowler: "Bowler", All_Rounder: "All-Rounder", Wicket_Keeper: "WK" };

const SetupBox = ({ testId, icon: Icon, label, note, onClick, active }) => (
    <button
        onClick={onClick}
        className={`text-left border p-3 hover:bg-mpca-cream/30 transition-all group ${active ? "border-mpca-oxblood bg-mpca-cream/40" : "border-mpca-brass/30"}`}
        data-testid={testId}
    >
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
    const [newSquad, setNewSquad] = useState({ open: false, body_id: "", team_name: "" });
    const [addPlayer, setAddPlayer] = useState({ squad: null, query: "", players: [] });
    const [bodies, setBodies] = useState([]);
    const [openBox, setOpenBox] = useState(null); // "calendar"|"receipts"|"summary"|"closure"
    const [progressKey, setProgressKey] = useState(0);
    const [myParticipation, setMyParticipation] = useState(null);   // M39x

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

    const load = async () => {
        const [tx, sq] = await Promise.all([fetchTournament(id), fetchSquads(id)]);
        setT(tx);
        setSquads(sq);
    };
    useEffect(() => {
        (async () => {
            try {
                await load();
                setBodies(await fetchBodies());
            } finally { setLoading(false); }
        })();
    }, [id]);

    const openAddPlayer = async (squad) => {
        // Pull players that belong to this squad's body (or descendants if Division)
        const filter = { body_id: squad.body_id };
        let players = await fetchPlayers(filter);
        // If Division squad, also pull descendant district players
        if (squad.body_id.startsWith("DIV-")) {
            const all = await fetchPlayers();
            const div_short = squad.body_id.slice(-3);
            players = all.filter((p) => p.body_id === squad.body_id || p.body_id.endsWith(div_short));
        }
        const excluded = new Set(squad.members.map((m) => m.player_id));
        players = players.filter((p) => !excluded.has(p.id));
        setAddPlayer({ squad, query: "", players });
    };

    const handleStatus = async (newStatus) => {
        try {
            const u = await setTournamentStatus(id, newStatus);
            setT(u);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const handleCreateSquad = async (e) => {
        e.preventDefault();
        try {
            await createSquad({ tournament_id: id, body_id: newSquad.body_id, team_name: newSquad.team_name });
            setNewSquad({ open: false, body_id: "", team_name: "" });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const handleAddPlayer = async (player, isCap, isKp) => {
        try {
            await addPlayerToSquad(addPlayer.squad.id, { player_id: player.id, is_captain: isCap, is_keeper: isKp });
            setAddPlayer({ squad: null, query: "", players: [] });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const handleRemovePlayer = async (squad, playerId) => {
        if (!window.confirm("Remove this player from the squad?")) return;
        try {
            await removePlayerFromSquad(squad.id, playerId);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading) return <div className="p-16" data-testid="trn-detail-loading"><CricketLoader size="lg" label="Loading tournament…" /></div>;
    if (!t) return <div className="p-16 text-center">Not found.</div>;

    const canEdit = persona && persona.body_type === "State";
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
                    <SetupBox testId="box-basics" icon={ListChecks} label="Tournament Basics" note={t.setup_meta?.category ? `${t.setup_meta.category} · ${t.setup_meta.age_group}` : "Category, teams, grounds"} onClick={() => setOpenBox(openBox === "basics" ? null : "basics")} active={openBox === "basics"} />
                    {persona?.id === "match-official" ? (
                        <>
                            <SetupBox testId="box-calendar" icon={Calendar} label="Match Calendar" note={t.calendar_fixed ? "Locked · view fixtures" : "View fixtures"} onClick={() => setOpenBox(openBox === "calendar" ? null : "calendar")} active={openBox === "calendar"} />
                            <SetupBox testId="box-my-da" icon={ClipboardEdit} label="My DA / TA Form" note="Fill T.A. & D.A. claim for this tournament" onClick={() => setOpenBox(openBox === "my-da" ? null : "my-da")} active={openBox === "my-da"} />
                        </>
                    ) : (
                        <>
                            <SetupBox testId="box-participants" icon={UsersRound} label="Participants Matrix" note={(() => { const pools = (t.setup_meta?.division_pools || []).concat(t.setup_meta?.district_pools || []); const totalCodes = pools.flatMap(p => p.division_codes || p.district_codes || []).length; return pools.length ? `${totalCodes} bodies · ${pools.length} pool(s)` : "Set pools first"; })()} onClick={() => setOpenBox(openBox === "participants" ? null : "participants")} active={openBox === "participants"} />
                            <SetupBox testId="box-squads" icon={Users} label="Squads" note="One per participating body" onClick={() => setOpenBox(openBox === "squads" ? null : "squads")} active={openBox === "squads"} />
                            <SetupBox testId="box-calendar" icon={Calendar} label="Match Calendar" note={t.calendar_fixed ? "Locked" : "Editable"} onClick={() => setOpenBox(openBox === "calendar" ? null : "calendar")} active={openBox === "calendar"} />
                            <SetupBox testId="box-squad" icon={Users} label="Squad Selection" note={persona?.body_type === "Division" || persona?.body_type === "District" ? `My body · ${persona?.body_code}` : (squads.length ? `${squads.length} squad(s)` : "Not started")} onClick={() => {
                                // M34 · Unified squad screen — everyone lands on SquadDetail now.
                                // MPCA persona: if a squad exists for the host body, open it directly;
                                // else start a new one for the host body. Division/District open theirs.
                                const targetBody = (persona?.body_type === "Division" || persona?.body_type === "District")
                                    ? persona.body_code
                                    : (t.host_body_id || (squads[0]?.body_id));
                                if (!targetBody) return navigate(`/tournaments/${id}/selection`);
                                const existing = squads.find((s) => s.body_id === targetBody);
                                if (existing) navigate(`/squads/${existing.id}`);
                                else navigate(`/tournaments/${id}/squads/new?body=${targetBody}`);
                            }} />
                            {/* M39t · Consolidated Finance action card — replaces the 6 individual finance boxes */}
                            <TournamentFinanceCard tournament={t} persona={persona} />
                            <SetupBox testId="box-activity" icon={History} label="Activity Log" note="Chronological trail of all actions" onClick={() => setOpenBox(openBox === "activity" ? null : "activity")} active={openBox === "activity"} />
                            <SetupBox testId="box-discussion" icon={MessageSquare} label="Discussion" note="MPCA · Division chat for this tournament" onClick={() => setOpenBox(openBox === "discussion" ? null : "discussion")} active={openBox === "discussion"} />
                        </>
                    )}
                </div>
                {openBox === "basics" && (
                    <div className="mt-4"><TournamentBasicsPanel tournament={t} canEdit={canEdit || persona?.body_code === t.host_body_id} onChange={() => { refreshProgress(); load(); }} /></div>
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
                    <div className="mt-4"><MatchCalendarPanel tournament={t} canEdit={canEdit || persona?.body_code === t.host_body_id} onChange={() => { refreshProgress(); load(); }} /></div>
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
                {openBox === "activity" && (
                    <div className="mt-4"><TournamentActivityLog tournamentId={id} /></div>
                )}
                {openBox === "discussion" && (
                    <div className="mt-4"><TournamentDiscussionBox tournamentId={id} /></div>
                )}
            </div>

            {/* Squads — hidden for match-official persona (no roster / financial context needed) */}
            {persona?.id !== "match-official" && (<>
            <div className="flex items-end justify-between mb-6">
                <div>
                    <div className="overline">Participating Teams</div>
                    <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">Squads</h2>
                </div>
                {canEdit && canEditSquad && (
                    <button onClick={() => setNewSquad({ open: true, body_id: "", team_name: "" })} className="btn-heritage-primary" data-testid="new-squad-btn">
                        <Plus size={14} /> Add Squad
                    </button>
                )}
            </div>

            {squads.length === 0 ? (
                <div className="bulletin-card p-12 text-center text-mpca-gray-dark italic font-serif" data-testid="no-squads">
                    No squads yet. {canEdit && canEditSquad && "Use the “Add Squad” button to invite a body to participate."}
                </div>
            ) : (
                <div className="space-y-6">
                    {squads.map((sq) => (
                        <div key={sq.id} className="bulletin-card" data-testid={"squad-card-" + sq.body_id}>
                            <div className="px-6 py-4 border-b border-mpca-brass/20 flex items-center justify-between flex-wrap gap-3">
                                <div>
                                    <div className="overline">{sq.body_id}</div>
                                    <div className="font-serif text-xl text-mpca-green-dark mt-1">{sq.team_name}</div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-1">
                                        {sq.members.length} / {t.max_squad_size} selected
                                    </div>
                                </div>
                                {canEdit && canEditSquad && sq.members.length < t.max_squad_size && (
                                    <button onClick={() => openAddPlayer(sq)} className="btn-heritage-ghost" data-testid={"add-player-btn-" + sq.body_id}>
                                        <Plus size={12} /> Add Player
                                    </button>
                                )}
                            </div>
                            {sq.members.length === 0 ? (
                                <div className="px-6 py-8 text-sm text-mpca-gray-dark italic">No players selected yet.</div>
                            ) : (
                                <div className="divide-y divide-mpca-brass/15">
                                    {sq.members.map((m) => (
                                        <div key={m.player_id} className="px-6 py-3 flex items-center gap-4" data-testid={"squad-member-" + m.player_id}>
                                            <div className="w-8 h-8 rounded-full bg-mpca-parchment text-mpca-green-dark flex items-center justify-center text-xs font-serif shrink-0">
                                                {m.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-serif text-sm text-mpca-green-dark flex items-center gap-2">
                                                    {m.full_name}
                                                    {m.is_captain && <span title="Captain"><Crown size={12} className="text-mpca-oxblood" /></span>}
                                                    {m.is_keeper && <span title="Wicket-keeper"><BadgeCheck size={12} className="text-mpca-gold" /></span>}
                                                </div>
                                                <div className="text-[10px] text-mpca-gray-dark font-mono">{m.player_no} · {ROLE_LABEL[m.role]}</div>
                                            </div>
                                            {canEdit && canEditSquad && (
                                                <button onClick={() => handleRemovePlayer(sq, m.player_id)} className="text-mpca-burgundy-dark hover:text-mpca-oxblood" data-testid={"remove-" + m.player_id}>
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {sq.eligibility_warnings?.length > 0 && (
                                <div className="px-6 py-3 bg-mpca-oxblood/5 border-t border-mpca-oxblood/30">
                                    <div className="overline !text-mpca-oxblood mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Selector notes</div>
                                    {sq.eligibility_warnings.map((w, i) => (<div key={i} className="text-[11px] text-mpca-burgundy-dark">{w}</div>))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            </>)}

            {/* New squad dialog */}
            {newSquad.open && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="new-squad-dialog">
                    <form onSubmit={handleCreateSquad} className="bg-mpca-ivory border-2 border-mpca-brass max-w-md w-full">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood">
                            <div className="overline !text-mpca-gold-light">New Squad</div>
                            <div className="font-serif text-2xl mt-1">Invite a Body</div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="label-heritage">Body *</label>
                                <select required value={newSquad.body_id} onChange={(e) => setNewSquad((s) => ({ ...s, body_id: e.target.value }))} className="input-heritage" data-testid="ns-body">
                                    <option value="">— Select body —</option>
                                    {t.scope === "Inter_Divisional" ? (
                                        divisions.map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)
                                    ) : (
                                        <>
                                            {divisions.map((b) => <option key={b.code} value={b.code}>{b.name} (Division)</option>)}
                                            {districts.map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
                                        </>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="label-heritage">Team Name *</label>
                                <input required value={newSquad.team_name} onChange={(e) => setNewSquad((s) => ({ ...s, team_name: e.target.value }))} placeholder="e.g. Indore U-19" className="input-heritage" data-testid="ns-name" />
                            </div>
                        </div>
                        <div className="px-6 pb-5 flex items-center justify-end gap-3">
                            <button type="button" onClick={() => setNewSquad({ open: false, body_id: "", team_name: "" })} className="btn-heritage-ghost" data-testid="ns-cancel">Cancel</button>
                            <button type="submit" className="btn-heritage-primary" data-testid="ns-create"><Trophy size={14} /> Create Squad</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Add player dialog */}
            {addPlayer.squad && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid="add-player-dialog">
                    <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full my-12">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                            <div>
                                <div className="overline !text-mpca-gold-light">{addPlayer.squad.team_name}</div>
                                <div className="font-serif text-xl mt-1">Select a Player</div>
                            </div>
                            <button onClick={() => setAddPlayer({ squad: null, query: "", players: [] })} className="text-mpca-gold-light text-2xl"><X /></button>
                        </div>
                        <div className="p-5">
                            <input
                                value={addPlayer.query}
                                onChange={(e) => setAddPlayer((s) => ({ ...s, query: e.target.value }))}
                                placeholder="Search by name or MPCA Player ID…"
                                className="input-heritage font-mono mb-4"
                                data-testid="ap-search"
                            />
                            <div className="max-h-96 overflow-y-auto border border-mpca-brass/30">
                                {addPlayer.players.filter((p) => !addPlayer.query.trim() ||
                                    p.full_name.toLowerCase().includes(addPlayer.query.toLowerCase()) ||
                                    p.player_id.toLowerCase().includes(addPlayer.query.toLowerCase())
                                ).map((p) => (
                                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0 border-mpca-brass/15" data-testid={"ap-row-" + p.player_id.replace(/\//g, "-")}>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-serif text-sm text-mpca-green-dark">{p.full_name}</div>
                                            <div className="text-[10px] text-mpca-gray-dark font-mono">{p.player_id} · {ROLE_LABEL[p.role]} · {p.category.replace("_", "-")} · {p.body_id}</div>
                                        </div>
                                        <button onClick={() => handleAddPlayer(p, false, false)} className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 border border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory transition-colors" data-testid={"ap-pick-" + p.player_id.replace(/\//g, "-")}>Pick</button>
                                        <button onClick={() => handleAddPlayer(p, true, false)} className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors" data-testid={"ap-cap-" + p.player_id.replace(/\//g, "-")}>+ Captain</button>
                                    </div>
                                ))}
                                {addPlayer.players.length === 0 && (
                                    <div className="px-3 py-8 text-center text-sm text-mpca-gray-dark italic">No eligible players in this body. Register players first.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TournamentDetail;

// M39 · Thin wrapper that resolves the tournament's discussion thread id then renders the shared thread UI
const TournamentDiscussionBox = ({ tournamentId }) => {
    const [threadId, setThreadId] = useState(null);
    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/discussions/tournament/${tournamentId}`);
                setThreadId(data.id);
            } catch { /* silent */ }
        })();
    }, [tournamentId]);
    if (!threadId) return <div className="bulletin-card p-6 text-[11px] text-mpca-brass">Opening discussion thread…</div>;
    return <DiscussionThread threadId={threadId} height="60vh" />;
};
