import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
    ArrowLeft, Users, Plus, X, Crown, BadgeCheck, ShieldCheck, ShieldAlert,
    Send, Loader2, Search, Filter, Lock, RotateCcw, CheckCircle2, XCircle, Info,
} from "lucide-react";
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
const CATEGORY_LABEL = { Local_MP: "Local MP", Guest: "Guest", Foreign: "Foreign" };
const STATUS_TONE = {
    Draft: "bg-mpca-brass/20 text-mpca-brass border-mpca-brass/40",
    Submitted: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/40",
    Awaiting_MPCA_Approval: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/40",
    Under_Review: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/40",
    Approved: "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40",
    Rejected: "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/40",
};

/**
 * Sprint M30 · Per-body Squad Selection Console
 * ─────────────────────────────────────────────
 * Full-detail 2-column layout for picking a squad for one participant body
 * (either a Division/District for inter-body tournaments, or MPCA for BCCI
 * tournaments). Handles the entire workflow: draft → submit to MPCA → MPCA
 * edit → finalize.
 *
 * Routes:
 *   /tournaments/:tid/squads/new?body=<CODE>   · idempotent create-then-redirect
 *   /squads/:sid                                · existing squad
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
    const [q, setQ] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [catFilter, setCatFilter] = useState("all");
    const [err, setErr] = useState("");

    const bootstrap = useCallback(async () => {
        setLoading(true);
        setErr("");
        try {
            if (sid) {
                let tId = null;
                try {
                    const { data: rec } = await api.get(`/squads/${sid}/recommendation`);
                    tId = rec?.squad?.tournament_id || rec?.tournament_id;
                } catch (_) { /* rec optional */ }
                if (!tId) {
                    const { data: ts } = await api.get("/tournaments");
                    for (const t of ts || []) {
                        const list = await fetchSquads(t.id).catch(() => []);
                        const found = (list || []).find((s) => s.id === sid);
                        if (found) { tId = t.id; setSquad(found); break; }
                    }
                    if (!tId) throw new Error("Squad not found in your scope.");
                } else {
                    const list = await fetchSquads(tId).catch(() => []);
                    const found = (list || []).find((s) => s.id === sid);
                    if (!found) throw new Error("Squad not found on the tournament.");
                    setSquad(found);
                }
                const t = await fetchTournament(tId);
                setTournament(t);
                const list = await fetchSquads(tId).catch(() => []);
                await loadPlayersForSquad(list.find((s) => s.id === sid));
            } else if (tidParam) {
                const bodyCode = searchParams.get("body");
                if (!bodyCode) throw new Error("Missing ?body=<CODE> in URL.");
                const t = await fetchTournament(tidParam);
                setTournament(t);
                const existing = (await fetchSquads(tidParam).catch(() => [])).find(
                    (s) => s.body_id === bodyCode
                );
                let sq = existing;
                if (!sq) {
                    const { data: bodies } = await api
                        .get("/bodies", { params: { code: bodyCode } })
                        .catch(() => ({ data: [] }));
                    const body = (bodies || []).find((b) => b.code === bodyCode);
                    const teamName = `${body?.name || bodyCode} · ${t.name}`;
                    sq = await createSquad({ tournament_id: tidParam, body_id: bodyCode, team_name: teamName });
                }
                setSquad(sq);
                await loadPlayersForSquad(sq);
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

    const loadPlayersForSquad = async (sq) => {
        if (!sq) return;
        // M34 · Scope rules:
        //   • MPCA (State) — sees ALL players across the state.
        //   • Division   — sees own division + its child districts.
        //   • District   — sees own district only.
        // Backend already enforces the scoping via the persona headers; this
        // client-side branch is a defensive filter so the UI matches the rule
        // even if a caller passes a broader response.
        let pool = [];
        if (persona?.body_type === "State") {
            const { data: all } = await api.get("/players", { params: { limit: 5000 } });
            pool = all || [];
        } else if (sq.body_id.startsWith("DIV-")) {
            const shortCode = sq.body_id.slice(-3);
            const { data: all } = await api.get("/players", { params: { limit: 2000 } });
            pool = (all || []).filter((p) => p.body_id === sq.body_id || (p.body_id || "").endsWith(shortCode));
        } else {
            const { data } = await api.get("/players", { params: { body_id: sq.body_id, limit: 2000 } });
            pool = data || [];
        }
        setPlayers(pool);
    };

    useEffect(() => { bootstrap(); }, [bootstrap]);

    const refresh = async () => {
        if (!tournament || !squad) return;
        const list = await fetchSquads(tournament.id);
        const sq = list.find((s) => s.id === squad.id);
        if (sq) setSquad(sq);
    };

    const guardAsync = async (fn) => {
        setBusy(true); setErr("");
        try { await fn(); } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const handleAdd = async (player, opts = {}) => {
        await guardAsync(async () => {
            await addPlayerToSquad(squad.id, {
                player_id: player.id,
                is_captain: !!opts.captain,
                is_keeper: !!opts.keeper || player.role === "Wicket_Keeper",
            });
            await refresh();
        });
    };

    const handleRemove = async (playerId) => {
        if (!window.confirm("Remove this player from the squad?")) return;
        await guardAsync(async () => {
            await removePlayerFromSquad(squad.id, playerId);
            await refresh();
        });
    };

    const handleSubmit = async () => {
        const note = window.prompt("Optional note for MPCA reviewer:") ?? "";
        await guardAsync(async () => {
            const { data: updated } = await api.post(`/squads/${squad.id}/submit`, { note: note || null });
            setSquad(updated);
            try { await api.post(`/squads/${updated.id}/notify-ai-review`); } catch (_) { /* non-fatal */ }
            alert("Submitted to MPCA for review.");
        });
    };

    const handleReview = async (action) => {
        const verb = action === "approve" ? "APPROVE" : action === "reject" ? "REJECT" : "FINALIZE";
        if (!window.confirm(`${verb} this squad?`)) return;
        const note = action === "reject" ? window.prompt("Rejection note (required):") : window.prompt("Optional note:") ?? "";
        if (action === "reject" && !note) return;
        await guardAsync(async () => {
            const { data: updated } = await api.post(`/squads/${squad.id}/review`, { action, note: note || null });
            setSquad(updated);
            alert(`Squad ${action}d.`);
        });
    };

    const handleReopen = async () => {
        if (!window.confirm("Unlock this squad so the Division can edit it again?")) return;
        await guardAsync(async () => {
            const { data: updated } = await api.post(`/squads/${squad.id}/reopen`);
            setSquad(updated);
        });
    };

    // ── Derived state
    const members = squad?.members || [];
    const memberIds = useMemo(() => new Set(members.map((m) => m.player_id)), [members]);
    const status = squad?.submission_status || "Draft";
    const isMine = persona?.body_code === squad?.body_id;
    const isMPCA = persona?.body_type === "State";

    // Edit rules: Division can edit while status is Draft/Rejected. MPCA can always edit
    // (used to make final adjustments after Division submits).
    const canEdit = (isMine && ["Draft", "Rejected"].includes(status)) || isMPCA;
    const canSubmit = isMine && ["Draft", "Rejected"].includes(status);
    const canReview = isMPCA && status === "Awaiting_MPCA_Approval";
    const canFinalize = isMPCA && status !== "Approved";
    const canReopen = isMPCA && status === "Approved";

    const filteredPool = useMemo(() => {
        const query = q.trim().toLowerCase();
        return players
            .filter((p) => !memberIds.has(p.id))
            .filter((p) => roleFilter === "all" || p.role === roleFilter)
            .filter((p) => catFilter === "all" || p.category === catFilter)
            .filter((p) => !query || p.full_name.toLowerCase().includes(query) || (p.player_id || "").toLowerCase().includes(query));
    }, [players, memberIds, q, roleFilter, catFilter]);

    // Role breakdown for header stats
    const roleBreakdown = useMemo(() => {
        const b = { Batter: 0, Bowler: 0, All_Rounder: 0, Wicket_Keeper: 0 };
        members.forEach((m) => { if (b[m.role] !== undefined) b[m.role] += 1; });
        return b;
    }, [members]);

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
    const isDraftT = tournament.status === "Draft";

    const warnings = [];
    if (members.length < 11) warnings.push(`Need at least 11 players (have ${members.length}).`);
    if (!captain) warnings.push("A Captain must be marked before submission.");

    return (
        <div className="page-enter px-8 md:px-12 py-8 max-w-[1400px] mx-auto" data-testid="squad-detail-page">
            <TournamentSubTabs tournamentId={tournament.id} active="squad" />

            <button onClick={() => navigate(`/tournaments/${tournament.id}`)} className="btn-heritage-ghost mb-4" data-testid="squad-back-btn">
                <ArrowLeft size={14} /> Back to Tournament
            </button>

            {/* ─── Header ─── */}
            <div className="bulletin-card p-6 mb-6 bg-gradient-to-br from-mpca-green-dark to-mpca-wood-dark text-mpca-ivory">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="overline !text-mpca-gold-light">{tournament.tournament_no} · {tournament.name}</div>
                        <h1 className="font-serif text-2xl md:text-3xl text-mpca-ivory mt-1 leading-tight truncate" data-testid="squad-team-name">
                            {squad.team_name}
                        </h1>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${STATUS_TONE[status] || "bg-mpca-ivory/10 text-mpca-ivory border-mpca-ivory/30"}`} data-testid="squad-status-badge">
                                {status.replace(/_/g, " ")}
                            </span>
                            <span className="text-[11px] text-mpca-ivory/80 font-mono" data-testid="squad-count-line">
                                <Users size={11} className="inline mr-1" /> {members.length} / {maxSize}
                            </span>
                            {captain && <span className="text-[10px] uppercase tracking-widest text-mpca-gold-light"><Crown size={10} className="inline mr-1" /> {captain.full_name}</span>}
                            {isMine && <span className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-0.5">Your body</span>}
                        </div>
                    </div>

                    {/* ─── Workflow action strip ─── */}
                    <div className="flex flex-wrap items-center gap-2" data-testid="squad-actions">
                        {canSubmit && members.length >= 11 && captain && (
                            <button onClick={handleSubmit} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-2 flex items-center gap-1 disabled:opacity-40 hover:bg-mpca-burgundy-dark transition-colors" data-testid="squad-submit-mpca-btn">
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Submit to MPCA
                            </button>
                        )}
                        {canReview && (
                            <>
                                <button onClick={() => handleReview("approve")} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-green-light text-mpca-green-dark px-3 py-2 flex items-center gap-1 disabled:opacity-40" data-testid="squad-approve-btn">
                                    <CheckCircle2 size={12} /> Approve
                                </button>
                                <button onClick={() => handleReview("reject")} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-brass/40 text-mpca-ivory px-3 py-2 flex items-center gap-1 disabled:opacity-40" data-testid="squad-reject-btn">
                                    <XCircle size={12} /> Reject
                                </button>
                            </>
                        )}
                        {isMPCA && canFinalize && members.length >= 11 && captain && (
                            <button onClick={() => handleReview("finalize")} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-gold-light text-mpca-green-dark px-4 py-2 flex items-center gap-1 disabled:opacity-40 hover:bg-mpca-gold transition-colors" data-testid="squad-finalize-btn">
                                <Lock size={12} /> Finalize XV
                            </button>
                        )}
                        {canReopen && (
                            <button onClick={handleReopen} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-ivory/10 text-mpca-ivory px-3 py-2 flex items-center gap-1 border border-mpca-ivory/30 disabled:opacity-40 hover:bg-mpca-ivory/20 transition-colors" data-testid="squad-reopen-btn">
                                <RotateCcw size={12} /> Reopen
                            </button>
                        )}
                    </div>
                </div>

                {/* Role breakdown row */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]" data-testid="squad-role-breakdown">
                    <div className="border border-mpca-ivory/20 px-3 py-1.5"><span className="text-mpca-ivory/60 uppercase tracking-wider text-[9px] block">Batters</span><span className="font-mono text-mpca-ivory">{roleBreakdown.Batter}</span></div>
                    <div className="border border-mpca-ivory/20 px-3 py-1.5"><span className="text-mpca-ivory/60 uppercase tracking-wider text-[9px] block">Bowlers</span><span className="font-mono text-mpca-ivory">{roleBreakdown.Bowler}</span></div>
                    <div className="border border-mpca-ivory/20 px-3 py-1.5"><span className="text-mpca-ivory/60 uppercase tracking-wider text-[9px] block">All-Rounders</span><span className="font-mono text-mpca-ivory">{roleBreakdown.All_Rounder}</span></div>
                    <div className="border border-mpca-ivory/20 px-3 py-1.5"><span className="text-mpca-ivory/60 uppercase tracking-wider text-[9px] block">Wicket-Keepers</span><span className="font-mono text-mpca-ivory">{keepers.length}</span></div>
                    <div className="border border-mpca-ivory/20 px-3 py-1.5"><span className="text-mpca-ivory/60 uppercase tracking-wider text-[9px] block">Pool Available</span><span className="font-mono text-mpca-ivory">{players.length}</span></div>
                </div>
            </div>

            {/* ─── Workflow guidance banner ─── */}
            {isDraftT && (
                <div className="mb-4 border border-mpca-brass/40 bg-mpca-brass/10 text-mpca-brass px-4 py-2 text-[11px] flex items-start gap-2" data-testid="squad-draft-hint">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    <div>
                        This tournament is still in <b>Draft</b>. You can build the squad now — once MPCA moves the tournament to <b>Upcoming</b>, the roster will be locked to changes until squad selection formally opens.
                    </div>
                </div>
            )}

            {status === "Awaiting_MPCA_Approval" && isMine && (
                <div className="mb-4 border border-mpca-navy/40 bg-mpca-navy/10 text-mpca-navy px-4 py-2 text-[11px] flex items-start gap-2" data-testid="squad-awaiting-hint">
                    <ShieldCheck size={12} className="mt-0.5 shrink-0" />
                    <div>
                        Your squad is with MPCA for review. You cannot edit until MPCA either approves it or reopens it back to Draft.
                    </div>
                </div>
            )}

            {status === "Approved" && (
                <div className="mb-4 border border-mpca-green-dark/40 bg-mpca-green-dark/10 text-mpca-green-dark px-4 py-2 text-[11px] flex items-start gap-2" data-testid="squad-approved-hint">
                    <ShieldCheck size={12} className="mt-0.5 shrink-0" />
                    <div>
                        This squad has been <b>{squad.finalized_by_mpca ? "finalized" : "approved"}</b> by MPCA on {(squad.reviewed_at || "").slice(0, 10)}. {isMPCA && "You can reopen it to make changes."}
                    </div>
                </div>
            )}

            {err && (
                <div className="mb-4 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2 flex items-center gap-2" data-testid="squad-inline-error">
                    <ShieldAlert size={12} /> {err}
                </div>
            )}

            {warnings.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                    {warnings.map((w, i) => (
                        <span key={i} className="text-[10px] uppercase tracking-widest bg-mpca-brass/15 text-mpca-brass border border-mpca-brass/40 px-2 py-1" data-testid={`squad-warning-${i}`}>
                            {w}
                        </span>
                    ))}
                </div>
            )}

            {/* ─── 2-column body ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" data-testid="squad-detail-body">
                {/* LEFT · Player pool */}
                <div className="lg:col-span-3 bulletin-card" data-testid="squad-pool-card">
                    <div className="px-5 py-3 border-b border-mpca-brass/20 flex items-center justify-between">
                        <div>
                            <div className="overline">Player Pool</div>
                            <div className="font-serif text-lg text-mpca-green-dark mt-0.5">
                                {persona?.body_type === "State"
                                    ? `${filteredPool.length} available across MPCA state`
                                    : `${filteredPool.length} available in ${squad.body_id}${squad.body_id.startsWith("DIV-") ? " + child districts" : ""}`}
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="px-5 py-3 border-b border-mpca-brass/15 grid grid-cols-1 md:grid-cols-4 gap-2 text-[10px]">
                        <div className="relative md:col-span-2">
                            <Search size={12} className="absolute left-3 top-2.5 text-mpca-brass" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or MPCA Player ID…" className="input-heritage font-mono !py-1.5 !text-xs pl-9" data-testid="squad-pool-search" />
                        </div>
                        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="squad-pool-role-filter">
                            <option value="all">All Roles</option>
                            <option value="Batter">Batter</option>
                            <option value="Bowler">Bowler</option>
                            <option value="All_Rounder">All-Rounder</option>
                            <option value="Wicket_Keeper">Wicket-Keeper</option>
                        </select>
                        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="squad-pool-cat-filter">
                            <option value="all">All Categories</option>
                            <option value="Local_MP">Local MP</option>
                            <option value="Guest">Guest</option>
                            <option value="Foreign">Foreign</option>
                        </select>
                    </div>

                    <div className="divide-y divide-mpca-brass/15 max-h-[600px] overflow-y-auto">
                        {filteredPool.length === 0 ? (
                            <div className="px-5 py-12 text-center text-mpca-gray-dark italic font-serif text-sm" data-testid="squad-pool-empty">
                                {players.length === 0
                                    ? `No players registered under ${squad.body_id} yet. Add them in the Player Register first.`
                                    : "No matching players — try clearing filters."}
                            </div>
                        ) : filteredPool.map((p) => {
                            const testKey = (p.player_id || p.id).replace(/\//g, "-");
                            return (
                                <div key={p.id} className="px-5 py-3 grid grid-cols-12 items-center gap-3" data-testid={`squad-pool-row-${testKey}`} data-player-id={p.id} data-player-no={p.player_id}>
                                    <div className="col-span-1">
                                        <div className="w-9 h-9 rounded-full bg-mpca-parchment text-mpca-green-dark flex items-center justify-center text-[10px] font-serif shrink-0">
                                            {p.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                                        </div>
                                    </div>
                                    <div className="col-span-6 min-w-0">
                                        <div className="font-serif text-sm text-mpca-green-dark truncate">{p.full_name}</div>
                                        <div className="text-[10px] text-mpca-gray-dark font-mono truncate">
                                            <span className="text-mpca-brass">{p.player_id}</span> · {ROLE_LABEL[p.role] || p.role} · {CATEGORY_LABEL[p.category] || p.category} · {p.body_id}
                                        </div>
                                        {(p.batting_style || p.bowling_style) && (
                                            <div className="text-[9px] text-mpca-gray-dark mt-0.5">
                                                {p.batting_style && <>Bats {p.batting_style.replace(/_/g, " ")}</>}
                                                {p.batting_style && p.bowling_style && " · "}
                                                {p.bowling_style && <>Bowls {p.bowling_style.replace(/_/g, " ")}</>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-5 flex justify-end gap-1">
                                        {canEdit && !busy && members.length < maxSize && (
                                            <>
                                                <button onClick={() => handleAdd(p)} className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 border border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory transition-colors" data-testid={`squad-pool-pick-${testKey}`}>+ Pick</button>
                                                {!captain && (
                                                    <button onClick={() => handleAdd(p, { captain: true })} className="text-[10px] uppercase tracking-[0.15em] px-2 py-1 border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors" data-testid={`squad-pool-cap-${testKey}`}>+ Cap</button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT · Selected XV */}
                <div className="lg:col-span-2 bulletin-card" data-testid="squad-selected-card">
                    <div className="px-5 py-3 border-b border-mpca-brass/20 flex items-center justify-between">
                        <div>
                            <div className="overline">Selected Squad</div>
                            <div className="font-serif text-lg text-mpca-green-dark mt-0.5">
                                {members.length} of {maxSize}
                            </div>
                        </div>
                        {status === "Approved" && <Lock size={16} className="text-mpca-green-dark" title="Locked by MPCA" />}
                    </div>

                    {members.length === 0 ? (
                        <div className="px-5 py-16 text-center text-mpca-gray-dark italic font-serif text-sm" data-testid="squad-selected-empty">
                            No players selected yet.<br />
                            {canEdit ? "Pick players from the pool on the left." : "Waiting on selectors to pick the XV."}
                        </div>
                    ) : (
                        <div className="divide-y divide-mpca-brass/15 max-h-[600px] overflow-y-auto">
                            {members.map((m, idx) => (
                                <div key={m.player_id} className="px-5 py-2.5 flex items-center gap-3" data-testid={`squad-member-${m.player_id}`}>
                                    <div className="text-[10px] text-mpca-brass font-mono w-5">#{idx + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-sm text-mpca-green-dark flex items-center gap-1.5 truncate">
                                            {m.full_name}
                                            {m.is_captain && <span title="Captain"><Crown size={12} className="text-mpca-oxblood" /></span>}
                                            {m.is_keeper && <span title="Wicket-keeper"><BadgeCheck size={12} className="text-mpca-gold" /></span>}
                                        </div>
                                        <div className="text-[9px] text-mpca-gray-dark font-mono">{m.player_no} · {ROLE_LABEL[m.role] || m.role}</div>
                                    </div>
                                    {canEdit && !busy && (
                                        <button onClick={() => handleRemove(m.player_id)} className="text-mpca-burgundy-dark hover:text-mpca-oxblood disabled:opacity-40" data-testid={`squad-remove-${m.player_id}`} title="Remove">
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {(squad.eligibility_warnings || []).length > 0 && (
                        <div className="px-5 py-3 bg-mpca-oxblood/5 border-t border-mpca-oxblood/30" data-testid="squad-selector-notes">
                            <div className="overline !text-mpca-oxblood mb-1 flex items-center gap-1"><ShieldAlert size={11} /> Selector notes</div>
                            {(squad.eligibility_warnings || []).map((w, i) => (
                                <div key={i} className="text-[10px] text-mpca-burgundy-dark">{w}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* M34 · Match Officials — nominated by Division, approved by MPCA */}
            <SquadOfficialsSection squad={squad} canEdit={canEdit && !busy} onSaved={refresh} />

            <div className="mt-6 text-[11px] text-mpca-gray-dark italic">
                Rich review · <Link to={`/squads/${squad.id}/review`} className="text-mpca-oxblood hover:underline">Open AI-assisted review console →</Link>
            </div>
        </div>
    );
};

// ────────────────── M34 · Officials sub-component ──────────────────

const OFFICIAL_SLOTS = [
    { key: "manager", label: "Team Manager" },
    { key: "coach", label: "Head Coach" },
    { key: "trainer", label: "Trainer" },
    { key: "physio", label: "Physio" },
    { key: "umpire_1", label: "Umpire #1 (On-field)" },
    { key: "umpire_2", label: "Umpire #2 (On-field)" },
    { key: "scorer", label: "Scorer" },
    { key: "referee", label: "Match Referee" },
];

const SquadOfficialsSection = ({ squad, canEdit, onSaved }) => {
    const [officials, setOfficials] = useState(squad.match_officials || {});
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => { setOfficials(squad.match_officials || {}); setDirty(false); }, [squad.id, squad.match_officials]);

    const setField = (k, v) => { setOfficials((o) => ({ ...o, [k]: v })); setDirty(true); };

    const save = async () => {
        setSaving(true); setErr("");
        try {
            const payload = {};
            OFFICIAL_SLOTS.forEach((s) => { payload[s.key] = officials[s.key] || null; });
            await api.patch(`/squads/${squad.id}/officials`, payload);
            setDirty(false);
            onSaved?.();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const filled = OFFICIAL_SLOTS.filter((s) => (officials[s.key] || "").trim()).length;

    return (
        <div className="mt-8 bulletin-card" data-testid="squad-officials-card">
            <div className="px-5 py-3 border-b border-mpca-brass/20 flex items-center justify-between">
                <div>
                    <div className="overline">Match Officials</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-0.5">
                        {filled} of {OFFICIAL_SLOTS.length} slots filled
                    </div>
                    <div className="text-[10px] text-mpca-gray-dark mt-1">
                        Nominated by {squad.body_id} along with the XV. MPCA reviews these with the squad before approval. Selected officials can submit their DA forms after the tournament.
                    </div>
                </div>
                {canEdit && dirty && (
                    <button onClick={save} disabled={saving} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="squad-officials-save-btn">
                        {saving ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />} Save Officials
                    </button>
                )}
            </div>

            {err && (
                <div className="mx-5 mt-3 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2 flex items-center gap-2" data-testid="squad-officials-error">
                    <ShieldAlert size={11} /> {err}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3 p-5">
                {OFFICIAL_SLOTS.map((slot) => (
                    <label key={slot.key} className="block" data-testid={`squad-official-field-${slot.key}`}>
                        <div className="text-[10px] uppercase tracking-widest text-mpca-brass font-mono mb-1">{slot.label}</div>
                        <input
                            value={officials[slot.key] || ""}
                            onChange={(e) => setField(slot.key, e.target.value)}
                            disabled={!canEdit}
                            placeholder="Full name"
                            className="input-heritage !py-1.5 !text-xs"
                        />
                    </label>
                ))}
            </div>
        </div>
    );
};

export default SquadDetail;
