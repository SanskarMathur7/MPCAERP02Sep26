import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Users, Plus, X, Crown, BadgeCheck, ShieldCheck, ShieldAlert, Send, Loader2, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import TournamentSubTabs from "@/components/TournamentSubTabs";
import {
    api,
    fetchTournament,
    fetchSquads,
    createSquad,
    addPlayerToSquad,
    removePlayerFromSquad,
} from "@/lib/api";

const ROLE_LABEL = { Batter: "Batter", Bowler: "Bowler", All_Rounder: "All-Rounder", Wicket_Keeper: "WK" };
const STATUS_TONE = {
    Draft: "bg-mpca-brass/20 text-mpca-brass border-mpca-brass/40",
    Submitted: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/40",
    Awaiting_MPCA_Approval: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/40",
    Under_Review: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/40",
    Approved: "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40",
    Rejected: "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/40",
};

/**
 * Sprint M30 · Per-body Squad Detail
 * ──────────────────────────────────
 * Renders a dedicated screen for one participant body's squad on a tournament.
 * Two entry points:
 *   - /tournaments/:tid/squads/new?body=DIV-IND · creates the squad, then redirects
 *   - /squads/:sid                              · loads an existing squad
 *
 * Player pool is auto-scoped to the squad's body (Division squads also see
 * players from their child districts — the same rule the backend enforces on
 * POST /squads/{sid}/players).
 */
const SquadDetail = () => {
    const { sid, tid: tidParam } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { persona } = useAuth();

    const [tournament, setTournament] = useState(null);
    const [squad, setSquad] = useState(null);
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [q, setQ] = useState("");
    const [err, setErr] = useState("");

    // ── Bootstrap: either load existing squad (sid) or create-then-load (tid+body)
    const bootstrap = useCallback(async () => {
        setLoading(true);
        setErr("");
        try {
            if (sid) {
                // Existing squad — no direct GET endpoint, fetch via tournament's squad list.
                // We first need to find which tournament this squad belongs to.
                // Simpler path: try to grab it from list_squads via the passed tournament,
                // but we don't have tid here → discover via /squads/{sid}/recommendation which
                // returns tournament_id implicitly. Fallback: full-scan of tournaments.
                // Cheapest: list squads for all tournaments in scope is heavy; instead we
                // look at the squad_ai recommendation endpoint header. But the simplest
                // reliable approach — fetch via api /squads/{sid}/players endpoints don't
                // exist. So we hit the recommendation endpoint just to get tournament_id.
                let tId = null;
                try {
                    const { data: rec } = await api.get(`/squads/${sid}/recommendation`);
                    tId = rec?.squad?.tournament_id || rec?.tournament_id;
                } catch (_) { /* rec is optional */ }
                if (!tId) {
                    // Fall back: iterate scoped tournaments (small pool for the persona) and find the squad.
                    const { data: ts } = await api.get("/tournaments");
                    for (const t of ts || []) {
                        const sq = await fetchSquads(t.id).catch(() => []);
                        const found = (sq || []).find((s) => s.id === sid);
                        if (found) { tId = t.id; setSquad(found); break; }
                    }
                    if (!tId) throw new Error("Squad not found in your scope.");
                } else {
                    const sq = await fetchSquads(tId).catch(() => []);
                    const found = (sq || []).find((s) => s.id === sid);
                    if (!found) throw new Error("Squad not found on the tournament.");
                    setSquad(found);
                }
                const t = await fetchTournament(tId);
                setTournament(t);
                await loadPlayersForSquad(t, (await fetchSquads(tId).catch(() => [])).find((s) => s.id === sid) || null);
            } else if (tidParam) {
                // New squad flow
                const bodyCode = searchParams.get("body");
                if (!bodyCode) throw new Error("Missing ?body=<CODE> in URL.");
                const t = await fetchTournament(tidParam);
                setTournament(t);
                // Check for existing squad first (idempotency)
                const existing = (await fetchSquads(tidParam).catch(() => [])).find(
                    (s) => s.body_id === bodyCode
                );
                let sq = existing;
                if (!sq) {
                    // Get body name for team name
                    const { data: bodies } = await api.get("/bodies", { params: { code: bodyCode } }).catch(() => ({ data: [] }));
                    const body = (bodies || []).find((b) => b.code === bodyCode);
                    const teamName = `${body?.name || bodyCode} · ${t.name}`;
                    sq = await createSquad({ tournament_id: tidParam, body_id: bodyCode, team_name: teamName });
                }
                setSquad(sq);
                await loadPlayersForSquad(t, sq);
                // Redirect to the canonical /squads/:sid so refresh works
                navigate(`/squads/${sq.id}`, { replace: true });
            } else {
                throw new Error("Missing squad or tournament id.");
            }
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally {
            setLoading(false);
        }
    }, [sid, tidParam, searchParams, navigate]);

    const loadPlayersForSquad = async (t, sq) => {
        if (!sq) return;
        // Filter pool by squad body: Division squads also pull child district players.
        let pool = [];
        if (sq.body_id.startsWith("DIV-")) {
            const shortCode = sq.body_id.slice(-3);
            const { data: all } = await api.get("/players", { params: { limit: 2000 } });
            pool = (all || []).filter(
                (p) => p.body_id === sq.body_id || (p.body_id || "").endsWith(shortCode)
            );
        } else {
            const { data } = await api.get("/players", { params: { body_id: sq.body_id, limit: 2000 } });
            pool = data || [];
        }
        setPlayers(pool);
    };

    useEffect(() => { bootstrap(); }, [bootstrap]);

    // ── Actions
    const refresh = async () => {
        if (!tournament || !squad) return;
        const sq = (await fetchSquads(tournament.id)).find((s) => s.id === squad.id);
        setSquad(sq);
    };

    const handleAdd = async (player, opts = {}) => {
        setBusy(true); setErr("");
        try {
            await addPlayerToSquad(squad.id, {
                player_id: player.id,
                is_captain: !!opts.captain,
                is_keeper: !!opts.keeper || player.role === "Wicket_Keeper",
            });
            await refresh();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const handleRemove = async (playerId) => {
        if (!window.confirm("Remove this player from the squad?")) return;
        setBusy(true); setErr("");
        try {
            await removePlayerFromSquad(squad.id, playerId);
            await refresh();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const handleSubmitToMpca = async () => {
        if (!squad || !tournament) return;
        const note = window.prompt("Optional note for MPCA reviewer:") ?? "";
        setBusy(true); setErr("");
        try {
            const { data: updated } = await api.post(
                `/tournaments/${tournament.id}/selection/submit`,
                { note: note || null }
            );
            setSquad(updated);
            // Non-fatal AI notify
            try { await api.post(`/squads/${updated.id}/notify-ai-review`); } catch (_) { /* ignore */ }
            alert("Submitted to MPCA for approval.");
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    // ── Derived
    const members = squad?.members || [];
    const memberIds = new Set(members.map((m) => m.player_id));
    const status = squad?.submission_status || "Draft";
    const canEdit = ["Draft", "Rejected"].includes(status);
    const isMine = persona?.body_code === squad?.body_id;
    const isMPCA = persona?.body_type === "State";
    const canManage = isMine || isMPCA;

    const filteredPool = useMemo(() => {
        const query = q.trim().toLowerCase();
        return players
            .filter((p) => !memberIds.has(p.id))
            .filter((p) => !query || p.full_name.toLowerCase().includes(query) || (p.player_id || "").toLowerCase().includes(query));
    }, [players, memberIds, q]);

    // ── Render
    if (loading) return (
        <div className="p-16" data-testid="squad-detail-loading">
            <CricketLoader size="lg" label="Loading squad…" />
        </div>
    );

    if (err && !squad) return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="squad-detail-error">
            <button onClick={() => navigate(-1)} className="btn-heritage-ghost mb-6"><ArrowLeft size={14} /> Back</button>
            <div className="bulletin-card p-8 bg-mpca-oxblood/5 border-mpca-oxblood/40 text-mpca-oxblood">
                <div className="overline !text-mpca-oxblood">Error</div>
                <div className="font-serif text-lg mt-1">{err}</div>
            </div>
        </div>
    );

    if (!squad || !tournament) return null;

    const captain = members.find((m) => m.is_captain);
    const keepers = members.filter((m) => m.is_keeper);
    const maxSize = tournament.max_squad_size || 18;
    const warnings = [];
    if (members.length < 11) warnings.push(`Need at least 11 players (have ${members.length}).`);
    if (!captain) warnings.push("A Captain must be marked before submission.");

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="squad-detail-page">
            <TournamentSubTabs tournamentId={tournament.id} active="squad" />

            <button onClick={() => navigate(`/tournaments/${tournament.id}`)} className="btn-heritage-ghost mb-6" data-testid="squad-back-btn">
                <ArrowLeft size={14} /> Back to Tournament
            </button>

            {/* Header */}
            <div className="bulletin-card p-8 mb-8 bg-gradient-to-br from-mpca-green-dark to-mpca-wood-dark text-mpca-ivory">
                <div className="overline !text-mpca-gold-light">{tournament.tournament_no} · Squad for {squad.body_id}</div>
                <h1 className="font-serif text-3xl md:text-4xl text-mpca-ivory mt-2 leading-tight" data-testid="squad-team-name">
                    {squad.team_name}
                </h1>
                <div className="flex items-center gap-3 mt-4 flex-wrap">
                    <span
                        className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${STATUS_TONE[status] || "bg-mpca-ivory/10 text-mpca-ivory border-mpca-ivory/30"}`}
                        data-testid="squad-status-badge"
                    >
                        {status.replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] text-mpca-ivory/80 font-mono" data-testid="squad-count-line">
                        <Users size={11} className="inline mr-1" /> {members.length} / {maxSize}
                    </span>
                    {isMine && <span className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-0.5">Your body</span>}
                </div>
                <div className="text-[11px] text-mpca-ivory/70 mt-3 max-w-2xl">
                    Only players registered under <b className="text-mpca-gold-light font-mono">{squad.body_id}</b>
                    {squad.body_id.startsWith("DIV-") && " and its child districts"} appear in the picker below.
                    Add up to {maxSize} players, mark a Captain, then submit to MPCA for approval.
                </div>
            </div>

            {err && (
                <div className="mb-4 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2 flex items-center gap-2" data-testid="squad-inline-error">
                    <ShieldAlert size={12} /> {err}
                </div>
            )}

            {/* Actions strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex flex-wrap gap-2">
                    {warnings.map((w, i) => (
                        <span key={i} className="text-[10px] uppercase tracking-widest bg-mpca-brass/15 text-mpca-brass border border-mpca-brass/40 px-2 py-1" data-testid={`squad-warning-${i}`}>
                            {w}
                        </span>
                    ))}
                    {warnings.length === 0 && members.length > 0 && (
                        <span className="text-[10px] uppercase tracking-widest bg-mpca-green-dark/15 text-mpca-green-dark border border-mpca-green-dark/40 px-2 py-1" data-testid="squad-ready-chip">
                            <ShieldCheck size={11} className="inline mr-1" /> Ready to submit
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    {canManage && canEdit && members.length < maxSize && (
                        <button onClick={() => setPickerOpen(true)} disabled={busy} className="btn-heritage-primary" data-testid="squad-add-player-btn">
                            <Plus size={14} /> Add Player
                        </button>
                    )}
                    {canManage && canEdit && members.length >= 11 && captain && (
                        <button onClick={handleSubmitToMpca} disabled={busy} className="btn-heritage-secondary" data-testid="squad-submit-mpca-btn">
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Submit to MPCA
                        </button>
                    )}
                </div>
            </div>

            {/* Members list */}
            <div className="bulletin-card mb-8" data-testid="squad-members-card">
                <div className="px-6 py-4 border-b border-mpca-brass/20 flex items-center justify-between">
                    <div>
                        <div className="overline">Squad Sheet</div>
                        <div className="font-serif text-xl text-mpca-green-dark mt-1">{members.length} selected · {keepers.length} keeper(s)</div>
                    </div>
                </div>
                {members.length === 0 ? (
                    <div className="px-6 py-12 text-center text-mpca-gray-dark italic font-serif" data-testid="squad-empty">
                        No players selected yet. {canManage && canEdit && "Click 'Add Player' to build the squad."}
                    </div>
                ) : (
                    <div className="divide-y divide-mpca-brass/15">
                        {members.map((m) => (
                            <div key={m.player_id} className="px-6 py-3 flex items-center gap-4" data-testid={`squad-member-${m.player_id}`}>
                                <div className="w-9 h-9 rounded-full bg-mpca-parchment text-mpca-green-dark flex items-center justify-center text-xs font-serif shrink-0">
                                    {m.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-serif text-sm text-mpca-green-dark flex items-center gap-2">
                                        {m.full_name}
                                        {m.is_captain && <span title="Captain"><Crown size={12} className="text-mpca-oxblood" /></span>}
                                        {m.is_keeper && <span title="Wicket-keeper"><BadgeCheck size={12} className="text-mpca-gold" /></span>}
                                    </div>
                                    <div className="text-[10px] text-mpca-gray-dark font-mono">{m.player_no} · {ROLE_LABEL[m.role] || m.role}</div>
                                </div>
                                {canManage && canEdit && (
                                    <button onClick={() => handleRemove(m.player_id)} disabled={busy} className="text-mpca-burgundy-dark hover:text-mpca-oxblood disabled:opacity-40" data-testid={`squad-remove-${m.player_id}`}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {(squad.eligibility_warnings || []).length > 0 && (
                    <div className="px-6 py-3 bg-mpca-oxblood/5 border-t border-mpca-oxblood/30" data-testid="squad-selector-notes">
                        <div className="overline !text-mpca-oxblood mb-1 flex items-center gap-1">
                            <ShieldAlert size={12} /> Selector notes
                        </div>
                        {(squad.eligibility_warnings || []).map((w, i) => (
                            <div key={i} className="text-[11px] text-mpca-burgundy-dark">{w}</div>
                        ))}
                    </div>
                )}
            </div>

            <div className="text-[11px] text-mpca-gray-dark italic">
                Rich review · <Link to={`/squads/${squad.id}/review`} className="text-mpca-oxblood hover:underline">Open AI-assisted review console →</Link>
            </div>

            {/* Player picker */}
            {pickerOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid="squad-picker-dialog">
                    <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full my-12">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                            <div>
                                <div className="overline !text-mpca-gold-light">{squad.team_name}</div>
                                <div className="font-serif text-xl mt-1">Select a Player</div>
                            </div>
                            <button onClick={() => setPickerOpen(false)} className="text-mpca-gold-light text-2xl" data-testid="squad-picker-close"><X /></button>
                        </div>
                        <div className="p-5">
                            {err && (
                                <div className="mb-3 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2 flex items-center gap-2" data-testid="squad-picker-error">
                                    <ShieldAlert size={12} /> {err}
                                </div>
                            )}
                            <div className="relative mb-4">
                                <Search size={13} className="absolute left-3 top-3.5 text-mpca-brass" />
                                <input
                                    autoFocus
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search by name or MPCA Player ID…"
                                    className="input-heritage font-mono pl-9"
                                    data-testid="squad-picker-search"
                                />
                            </div>
                            <div className="text-[10px] text-mpca-gray-dark mb-2" data-testid="squad-picker-count">
                                Showing {filteredPool.length} of {players.length} available players from {squad.body_id}
                                {squad.body_id.startsWith("DIV-") && " + child districts"}
                            </div>
                            <div className="max-h-96 overflow-y-auto border border-mpca-brass/30">
                                {filteredPool.length === 0 ? (
                                    <div className="px-3 py-8 text-center text-sm text-mpca-gray-dark italic">
                                        {players.length === 0
                                            ? `No players registered under ${squad.body_id} yet. Add players in the Player Register first.`
                                            : "No matching players — clear the search or add more players to your body."}
                                    </div>
                                ) : filteredPool.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0 border-mpca-brass/15" data-testid={`squad-picker-row-${p.player_id.replace(/\//g, "-")}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-serif text-sm text-mpca-green-dark">{p.full_name}</div>
                                            <div className="text-[10px] text-mpca-gray-dark font-mono">
                                                {p.player_id} · {ROLE_LABEL[p.role] || p.role} · {(p.category || "").replace(/_/g, "-")} · {p.body_id}
                                            </div>
                                        </div>
                                        <button onClick={() => handleAdd(p)} disabled={busy} className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 border border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory transition-colors disabled:opacity-40" data-testid={`squad-picker-pick-${p.player_id.replace(/\//g, "-")}`}>Pick</button>
                                        <button onClick={() => handleAdd(p, { captain: true })} disabled={busy} className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors disabled:opacity-40" data-testid={`squad-picker-cap-${p.player_id.replace(/\//g, "-")}`}>+ Captain</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SquadDetail;
