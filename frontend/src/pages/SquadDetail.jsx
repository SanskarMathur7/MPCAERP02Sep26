import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
    ArrowLeft, Users, Plus, X, Crown, BadgeCheck, ShieldCheck, ShieldAlert,
    Send, Loader2, Search, Filter, Lock, RotateCcw, CheckCircle2, XCircle, Info,
    Download, Upload, FileCheck, Sparkles, RefreshCw,
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
    openAuthedFile,
} from "@/lib/api";

const ROLE_LABEL = { Batter: "Batter", Bowler: "Bowler", All_Rounder: "All-Rounder", Wicket_Keeper: "WK" };
const CATEGORY_LABEL = { Local_MP: "Local MP", Guest: "Guest", Foreign: "Foreign" };

// MPCA-136 · Age filter helpers. Season cutoff = 1 September of the season's
// start year (matches BCCI cricketing-age convention). Falls back to today if
// the season cycle is unparseable.
const _seasonAgeCutoff = (cycle) => {
    if (!cycle || typeof cycle !== "string") return new Date();
    const startYear = parseInt(cycle.slice(0, 4), 10);
    if (!Number.isFinite(startYear)) return new Date();
    return new Date(`${startYear}-09-01`);
};
const _ageOnDate = (dobIso, refDate) => {
    if (!dobIso) return null;
    const dob = new Date(dobIso);
    if (Number.isNaN(+dob)) return null;
    let age = refDate.getFullYear() - dob.getFullYear();
    const m = refDate.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && refDate.getDate() < dob.getDate())) age -= 1;
    return age;
};
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
    // MPCA-235 · Ship 6 · Wiring-driven squad-mode hint (Manual PDF vs Register-linked)
    const [wiringSquadMode, setWiringSquadMode] = useState(null);
    // MPCA-242 · Wiring-driven approval flag (M/O/NA) — governs button copy,
    // notification firing, and section headers so users are never told
    // "Submit to MPCA" when the wiring says no MPCA approval exists.
    const [wiringApprovalFlag, setWiringApprovalFlag] = useState(null);
    // Feb 2026 · Tournament Player Eligibility Engine — per-body split from
    // `/tournaments/{tid}/eligible-players`. Populated after players load.
    // Shape: { tournament: {...}, byPlayerId: Map<id, {ok, reasons[]}> }
    const [eligibility, setEligibility] = useState(null);
    // MPCA override to bypass eligibility block (State personas only)
    const [eligibilityOverride, setEligibilityOverride] = useState(false);

    // Fetch the wiring status for this squad's tournament and read the 'squad'
    // step's `mode` attribute. Advisory only — both PDF upload and player picker
    // remain available regardless of mode.
    useEffect(() => {
        if (!tournament?.id) return;
        let alive = true;
        api.get(`/tournaments/${tournament.id}/wiring-status`)
            .then(r => {
                if (!alive) return;
                const squadStep = (r.data.steps || []).find(s => s.key === "squad");
                setWiringSquadMode(squadStep ? { mode: squadStep.mode, owner: squadStep.owner, text: squadStep.text } : null);
                const approvalStep = (r.data.steps || []).find(s => s.key === "squad_approval");
                setWiringApprovalFlag(approvalStep?.flag ?? null);
            })
            .catch(() => { if (alive) { setWiringSquadMode(null); setWiringApprovalFlag(null); } });
        return () => { alive = false; };
    }, [tournament?.id]);

    // Feb 2026 · Eligibility engine — fetch the split for THIS body once the
    // tournament + squad are resolved. Re-fetches when the squad's body changes.
    useEffect(() => {
        if (!tournament?.id || !squad?.body_id) return;
        let alive = true;
        api.get(`/tournaments/${tournament.id}/eligible-players`, {
            params: { body_code: squad.body_id, limit: 5000 },
        })
            .then(r => {
                if (!alive) return;
                const byId = new Map();
                (r.data?.eligible || []).forEach(p => byId.set(p.id, { ok: true, reasons: [] }));
                (r.data?.ineligible || []).forEach(p => byId.set(p.id, { ok: false, reasons: p.eligibility_reasons || [] }));
                setEligibility({ tournament: r.data?.tournament || null, byPlayerId: byId, counts: r.data?.counts || null });
            })
            .catch(() => { if (alive) setEligibility(null); });
        return () => { alive = false; };
    }, [tournament?.id, squad?.body_id]);

    const bootstrap = useCallback(async () => {
        setLoading(true);
        setErr("");
        try {
            if (sid) {
                // M39g fix · Use the direct GET /squads/{sid} endpoint instead of
                // iterating all tournaments (which was slow AND broke scope-checks).
                const { data: found } = await api.get(`/squads/${sid}`);
                if (!found) throw new Error("Squad not found.");
                setSquad(found);
                const tId = found.tournament_id;
                const t = await fetchTournament(tId);
                setTournament(t);
                await loadPlayersForSquad(found);
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

    // Iter 123m · Auto-fire the AI cross-check when MPCA opens a squad that
    // has a signed copy but hasn't been verified yet. Fires exactly once per
    // squad id (avoids retriggering on every setSquad). Silent on error so
    // the manual "Verify with AI" button still works as a fallback.
    const [autoVerifiedFor, setAutoVerifiedFor] = useState(null);
    useEffect(() => {
        const isMPCAReviewer = persona?.body_type === "State";
        if (!squad || !isMPCAReviewer) return;
        if (!squad.signed_copy_url || squad.pdf_verification) return;
        if (autoVerifiedFor === squad.id) return;
        setAutoVerifiedFor(squad.id);
        (async () => {
            try {
                const { data } = await api.post(`/squads/${squad.id}/verify-signed-copy`);
                setSquad((s) => ({ ...(s || {}), pdf_verification: data }));
            } catch { /* leave the manual button visible */ }
        })();
    }, [squad, persona, autoVerifiedFor]);

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
        // Feb 2026 · Block ineligible picks unless MPCA-State toggles override.
        const eLookup = eligibility?.byPlayerId?.get(player.id);
        if (eLookup && !eLookup.ok && !eligibilityOverride) {
            alert(
                `${player.full_name || "This player"} is not eligible for this tournament:\n\n` +
                (eLookup.reasons || []).map(r => `• ${r}`).join("\n") +
                (isMPCA ? "\n\nTurn on 'MPCA Override' in the eligibility banner above to force-pick." : "")
            );
            return;
        }
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
        // M37 · Signed nomination copy is mandatory for Division/District submissions to MPCA.
        if (!isMPCA && !squad.signed_copy_url) {
            alert("Signed nomination copy is required. Please download the nomination form, get it signed by the Division office bearers, and upload the signed PDF before submitting.");
            return;
        }
        // MPCA-242 · Wiring-driven copy — only prompt "for MPCA reviewer" when
        // the wiring says approval IS mandatory. Otherwise this is a self-lock.
        const needsMpca = wiringApprovalFlag === "M";
        const note = window.prompt(needsMpca ? "Optional note for MPCA reviewer:" : "Optional internal note:") ?? "";
        await guardAsync(async () => {
            const { data: updated } = await api.post(`/squads/${squad.id}/submit`, { note: note || null });
            setSquad(updated);
            // notify-ai-review no-ops on the backend when wiring != M (MPCA-242).
            try { await api.post(`/squads/${updated.id}/notify-ai-review`); } catch (_) { /* non-fatal */ }
            alert(needsMpca ? "Submitted to MPCA for review." : "Squad locked. No MPCA approval is required for this tournament type per the wiring.");
        });
    };

    const handleSignedCopyUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "squad_signed_copy");
            const { data: upload } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            const { data: updated } = await api.post(`/squads/${squad.id}/signed-copy`, { signed_copy_url: upload.url });
            setSquad(updated);
            // Iter 108f · auto-fire AI cross-check right after upload
            try {
                const { data: v } = await api.post(`/squads/${squad.id}/verify-signed-copy`);
                setSquad((s) => ({ ...(s || updated), pdf_verification: v }));
            } catch (verifyErr) { /* the summary card will show a manual "Verify" button */ }
        } catch (err) { alert(err?.response?.data?.detail || err.message); }
        finally { e.target.value = ""; }
    };

    const handleReview = async (action) => {
        const verb = action === "approve" ? "APPROVE" : "REJECT";
        if (!window.confirm(`${verb} this squad?`)) return;
        const note = action === "reject"
            ? window.prompt("Rejection note (required):")
            : (window.prompt("Optional note:") || "");
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

    // MPCA-140 · Per-player decision handler. Reviewer marks each nominated
    // player Approved / Rejected with an optional (Approved) or mandatory
    // (Rejected reason free-text) note.
    const handleMemberDecision = async (playerId, decision) => {
        const isReject = decision === "Rejected";
        const reason = window.prompt(
            isReject
                ? "Reason for rejecting this player (required):"
                : "Optional note for approving this player:",
        );
        if (isReject && !reason) return;
        await guardAsync(async () => {
            const { data: updated } = await api.post(
                `/squads/${squad.id}/members/${playerId}/decision`,
                { decision, reason: reason || null },
            );
            setSquad(updated);
        });
    };
    const handleClearDecision = async (playerId) => {
        await guardAsync(async () => {
            const { data: updated } = await api.delete(`/squads/${squad.id}/members/${playerId}/decision`);
            setSquad(updated);
        });
    };

    // ── Derived state
    const members = squad?.members || [];
    const memberIds = useMemo(() => new Set(members.map((m) => m.player_id)), [members]);
    const status = squad?.submission_status || "Draft";
    const isMine = persona?.body_code === squad?.body_id;
    const isMPCA = persona?.body_type === "State";

    // Edit rules: Division can edit while status is Draft/Rejected. MPCA can edit
    // in any status EXCEPT Approved (MPCA-131 · once MPCA approves, the roster
    // is locked; MPCA must Reopen the squad to make further changes).
    const canEdit = (isMine && ["Draft", "Rejected"].includes(status)) || (isMPCA && status !== "Approved");
    const canSubmit = isMine && ["Draft", "Rejected"].includes(status);
    const canReview = isMPCA && status === "Awaiting_MPCA_Approval";
    const canReopen = isMPCA && status === "Approved";

    const filteredPool = useMemo(() => {
        const query = q.trim().toLowerCase();
        // MPCA-136 · Age filter — tournament.age_cap_years / age_floor_years are
        // numeric caps derived from the tournament's category/age group. When a
        // cap is set (e.g. U-19 → age_cap_years=19), players born too early
        // (i.e. would be > cap at 1-Sept of the season year) are hidden from
        // the pool so Divisions can't accidentally pick over-age players.
        const seasonCutoff = _seasonAgeCutoff(tournament?.fiscal_cycle);
        const capYears = Number(tournament?.age_cap_years) || null;
        const floorYears = Number(tournament?.age_floor_years) || null;
        const inAgeBand = (dobIso) => {
            if (!dobIso) return !capYears && !floorYears; // no DOB → only ok if no cap
            const age = _ageOnDate(dobIso, seasonCutoff);
            if (age == null) return true;
            if (capYears && age > capYears) return false;
            if (floorYears && age < floorYears) return false;
            return true;
        };
        return players
            .filter((p) => !memberIds.has(p.id))
            .filter((p) => roleFilter === "all" || p.role === roleFilter)
            .filter((p) => catFilter === "all" || p.category === catFilter)
            .filter((p) => inAgeBand(p.date_of_birth || p.dob))
            .filter((p) => {
                if (!query) return true;
                // MPCA-126 · null-safe search — some legacy player rows had
                // full_name/player_id missing and crashed the render.
                const name = (p.full_name || "").toLowerCase();
                const code = (p.player_id || "").toLowerCase();
                return name.includes(query) || code.includes(query);
            });
    }, [players, memberIds, q, roleFilter, catFilter, tournament?.age_cap_years, tournament?.age_floor_years, tournament?.fiscal_cycle]);

    // Role breakdown for header stats
    const roleBreakdown = useMemo(() => {
        const b = { Batter: 0, Bowler: 0, All_Rounder: 0, Wicket_Keeper: 0 };
        members.forEach((m) => { if (b[m.role] !== undefined) b[m.role] += 1; });
        return b;
    }, [members]);

    // MPCA-140 · Decision map for per-player review UI + Approve-Whole-List
    // gating. Keyed by player_id → { decision, reason, decided_by, decided_at }.
    const decisionByPid = useMemo(() => {
        const map = {};
        (squad?.member_decisions || []).forEach((d) => { map[d.player_id] = d; });
        return map;
    }, [squad?.member_decisions]);
    const decidedCount = members.filter((m) => decisionByPid[m.player_id]).length;
    const undecidedCount = members.length - decidedCount;
    const allMembersDecided = members.length > 0 && undecidedCount === 0;

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
    // Iter 108c · isDraftT removed with the manual status banner.

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
                                <Users size={11} className="inline mr-1" /> {members.length} nominated · playing cap {maxSize}
                            </span>
                            {captain && <span className="text-[10px] uppercase tracking-widest text-mpca-gold-light"><Crown size={10} className="inline mr-1" /> {captain.full_name}</span>}
                            {isMine && <span className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-0.5">Your body</span>}
                        </div>
                    </div>

                    {/* ─── Workflow action strip ─── */}
                    <div className="flex flex-wrap items-center gap-2" data-testid="squad-actions">
                        {/* M38d · Signed nomination link — visible to EVERYONE (MPCA reviewers included) */}
                        {squad.signed_copy_url && (
                            <button
                                type="button"
                                onClick={() => openAuthedFile(squad.signed_copy_url)}
                                className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-3 py-2 flex items-center gap-1 hover:bg-mpca-green transition-colors"
                                data-testid="squad-view-signed-link"
                                title={squad.signed_copy_uploaded_at ? `Uploaded ${new Date(squad.signed_copy_uploaded_at).toLocaleString("en-IN")}${squad.signed_copy_uploaded_by ? ` by ${squad.signed_copy_uploaded_by}` : ""}` : "View signed nomination copy"}
                            >
                                <FileCheck size={12} /> View Signed Copy
                            </button>
                        )}
                        {canSubmit && !isMPCA && (members.length >= 11 && captain || wiringSquadMode?.mode === "Manual_PDF") && (
                            <>
                                {members.length >= 11 && captain && (
                                    <a href={`/squads/${squad.id}/nomination-form`} target="_blank" rel="noreferrer" className="text-[11px] uppercase tracking-widest bg-mpca-ivory text-mpca-green-dark px-3 py-2 flex items-center gap-1 hover:bg-mpca-gold-light transition-colors" data-testid="squad-download-nomination-btn">
                                        <Download size={12} /> Download Nomination
                                    </a>
                                )}
                                <label className="text-[11px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-3 py-2 flex items-center gap-1 cursor-pointer hover:bg-mpca-brass/80 transition-colors" data-testid="squad-upload-signed-btn">
                                    <Upload size={12} /> {squad.signed_copy_url ? "Replace Signed Copy" : "Upload Signed Squad PDF"}
                                    <input type="file" className="hidden" accept="application/pdf,image/*" onChange={handleSignedCopyUpload} />
                                </label>
                            </>
                        )}
                        {canSubmit && (
                            (members.length >= 11 && captain) ||
                            (wiringSquadMode?.mode === "Manual_PDF" && squad.signed_copy_url)
                        ) && (
                            <button
                                onClick={handleSubmit}
                                disabled={busy || (!isMPCA && !squad.signed_copy_url)}
                                title={!isMPCA && !squad.signed_copy_url ? "Upload signed squad PDF first" : ""}
                                className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-2 flex items-center gap-1 disabled:opacity-40 hover:bg-mpca-burgundy-dark transition-colors"
                                data-testid="squad-submit-mpca-btn"
                            >
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {wiringApprovalFlag === "M" ? "Submit to MPCA" : "Lock Squad"}
                            </button>
                        )}
                        {canReview && (
                            <>
                                <button
                                    onClick={() => handleReview("approve")}
                                    disabled={busy || !allMembersDecided}
                                    title={!allMembersDecided ? `Decide every player first — ${undecidedCount} pending.` : "Approve the whole squad"}
                                    className="text-[11px] uppercase tracking-widest bg-mpca-gold text-mpca-green-dark px-3 py-2 flex items-center gap-1 border border-mpca-gold hover:bg-mpca-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                                    data-testid="squad-approve-btn"
                                >
                                    <CheckCircle2 size={12} /> Approve Whole List
                                    {!allMembersDecided && <span className="text-[9px] font-mono ml-1">({decidedCount}/{members.length})</span>}
                                </button>
                                <button onClick={() => handleReview("reject")} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-2 flex items-center gap-1 border border-mpca-oxblood hover:bg-mpca-oxblood/90 transition-colors disabled:opacity-50 font-semibold" data-testid="squad-reject-btn">
                                    <XCircle size={12} /> Reject Whole Squad
                                </button>
                                <a
                                    href={`/squads/${squad.id}/mpca-review-form`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] uppercase tracking-widest bg-mpca-ivory text-mpca-green-dark px-3 py-2 flex items-center gap-1 hover:bg-mpca-gold-light transition-colors"
                                    data-testid="squad-mpca-review-pdf-btn"
                                >
                                    <Download size={12} /> MPCA Review PDF
                                </a>
                            </>
                        )}
                        {/* MPCA-130 · "Finalize XV" button removed — Approve
                            already locks the squad; the double CTA was
                            confusing MPCA reviewers. */}
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

            {/* Iter 108f · AI cross-check of signed PDF vs digitally-picked roster */}
            {squad.signed_copy_url && (
                <div className="mt-4 border border-mpca-brass/30 bg-white" data-testid="squad-pdf-verify-card">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-mpca-brass/20 bg-mpca-ivory">
                        <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-mpca-green-dark">
                            Signed Copy · AI Cross-check
                        </div>
                        <div className="flex items-center gap-2">
                            {squad.pdf_verification?.check && (
                                <span
                                    className={
                                        "px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold border " +
                                        (squad.pdf_verification.check.verdict === "clean"
                                            ? "bg-mpca-green-light text-mpca-green-dark border-mpca-green-deep/40"
                                            : "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/50")
                                    }
                                    data-testid="pdf-verify-verdict"
                                >
                                    {squad.pdf_verification.check.match_pct}% match · {squad.pdf_verification.check.verdict}
                                </span>
                            )}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                    try {
                                        const { data } = await api.post(`/squads/${squad.id}/verify-signed-copy`);
                                        setSquad((s) => ({ ...s, pdf_verification: data }));
                                    } catch (err) { alert(err?.response?.data?.detail || err.message); }
                                }}
                                className="text-[10px] uppercase tracking-[0.18em] font-bold px-3 py-1 border border-mpca-brass/50 text-mpca-brass hover:bg-mpca-brass/5 disabled:opacity-60 flex items-center gap-1.5"
                                data-testid="pdf-verify-run-btn"
                            >
                                <Sparkles size={11} /> {squad.pdf_verification ? "Re-verify" : "Verify with AI"}
                            </button>
                        </div>
                    </div>

                    {squad.pdf_verification?.parsed && (
                        <div className="p-3 space-y-3">
                            {(squad.pdf_verification.check?.extra_in_pdf?.length > 0 ||
                              squad.pdf_verification.check?.missing_in_pdf?.length > 0) && (
                                <div className="text-[11px] p-2 border border-mpca-brass/40 bg-mpca-brass/5 text-mpca-brass" data-testid="pdf-verify-mismatch">
                                    <b>Mismatches:</b>
                                    {squad.pdf_verification.check.missing_in_pdf.length > 0 && (
                                        <div className="mt-1">In roster but NOT in PDF: {squad.pdf_verification.check.missing_in_pdf.map(m => m.full_name).join(", ")}</div>
                                    )}
                                    {squad.pdf_verification.check.extra_in_pdf.length > 0 && (
                                        <div className="mt-1">In PDF but NOT in roster: {squad.pdf_verification.check.extra_in_pdf.map(m => m.name).join(", ")}</div>
                                    )}
                                </div>
                            )}
                            <div>
                                <div className="text-[10px] uppercase tracking-widest text-mpca-gray-dark mb-2">
                                    Squad Summary · read from PDF
                                    {squad.pdf_verification.parsed.captain && <> · C {squad.pdf_verification.parsed.captain}</>}
                                    {squad.pdf_verification.parsed.vice_captain && <> · VC {squad.pdf_verification.parsed.vice_captain}</>}
                                </div>
                                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-1.5" data-testid="pdf-verify-players">
                                    {(squad.pdf_verification.parsed.players || []).map((p, i) => (
                                        <div key={i} className="flex items-center gap-2 px-2 py-1 border border-mpca-brass/20 bg-mpca-ivory/40 text-[11.5px]">
                                            <span className="w-5 text-[9.5px] font-mono text-mpca-gray-dark">{i + 1}</span>
                                            <span className="flex-1 truncate font-semibold text-mpca-charcoal">{p.name}</span>
                                            <span className="text-[9px] uppercase tracking-widest text-mpca-gray-dark">{p.role}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {!squad.pdf_verification && (
                        <div className="p-4 text-[11px] italic text-mpca-gray-dark">
                            Click &quot;Verify with AI&quot; to read the PDF and cross-check names against the {members.length}-player roster picked in the ERP.
                        </div>
                    )}
                </div>
            )}

            {/* Iter 108c · The "still in Draft" banner is retired.  Tournament status
                is now auto-derived from the calendar (see TournamentDetail.jsx ·
                effectiveStatus) so a squad manager never has to wait for MPCA
                to flip a field manually — the roster stays editable until the
                tournament is Cancelled or Completed. */}

            {/* MPCA-235 · Ship 6 · Wiring-driven squad-mode banner (advisory) */}
            {/* Feb 2026 · Eligibility Engine banner — DOB/gender/medical rules from tournament_master */}
            {eligibility?.tournament?.master_matched && (
                <div
                    data-testid="squad-eligibility-banner"
                    className="mb-4 border border-mpca-oxblood/40 bg-mpca-parchment/60 px-4 py-3 text-[11px]"
                >
                    <div className="flex items-start gap-3">
                        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-mpca-oxblood" />
                        <div className="flex-1">
                            <div className="uppercase tracking-widest text-[10px] text-mpca-oxblood mb-1 font-mono">
                                Eligibility rules · {eligibility.tournament.master_name || eligibility.tournament.name}
                            </div>
                            <div className="text-mpca-green-dark flex flex-wrap gap-x-4 gap-y-1">
                                {eligibility.tournament.gender && (
                                    <span data-testid="elig-rule-gender">
                                        <b>Gender:</b> {eligibility.tournament.gender}
                                    </span>
                                )}
                                {eligibility.tournament.age_grp && (
                                    <span data-testid="elig-rule-age"><b>Age:</b> {eligibility.tournament.age_grp}</span>
                                )}
                                {eligibility.tournament.born_on_or_before && (
                                    <span data-testid="elig-rule-boob">
                                        <b>Born on/before:</b> {eligibility.tournament.born_on_or_before}
                                    </span>
                                )}
                                {eligibility.tournament.born_on_or_after && (
                                    <span data-testid="elig-rule-boa">
                                        <b>Born on/after:</b> {eligibility.tournament.born_on_or_after}
                                    </span>
                                )}
                                {eligibility.tournament.medical_required && (
                                    <span data-testid="elig-rule-medical" className="text-mpca-oxblood font-mono uppercase">
                                        Medical clearance required
                                    </span>
                                )}
                            </div>
                            {eligibility.counts && (
                                <div className="mt-1 text-[10px] text-mpca-gray-dark font-mono" data-testid="elig-counts">
                                    Pool: {eligibility.counts.total} · <span className="text-mpca-green-dark">Eligible {eligibility.counts.eligible}</span> · <span className="text-mpca-oxblood">Ineligible {eligibility.counts.ineligible}</span>
                                </div>
                            )}
                        </div>
                        {isMPCA && (eligibility.counts?.ineligible || 0) > 0 && (
                            <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-mpca-oxblood cursor-pointer" data-testid="elig-mpca-override-toggle">
                                <input
                                    type="checkbox"
                                    checked={eligibilityOverride}
                                    onChange={(e) => setEligibilityOverride(e.target.checked)}
                                />
                                MPCA Override
                            </label>
                        )}
                    </div>
                </div>
            )}

            {wiringSquadMode && wiringSquadMode.mode !== "NA" && (
                <div
                    data-testid="squad-wiring-mode-banner"
                    className={
                        "mb-4 border px-4 py-3 text-[11px] flex items-start gap-3 " +
                        (wiringSquadMode.mode === "Manual_PDF"
                            ? "border-mpca-brass/40 bg-mpca-parchment/70 text-mpca-green-dark"
                            : "border-mpca-green-dark/30 bg-mpca-ivory text-mpca-green-dark")
                    }
                >
                    <Info size={14} className="mt-0.5 shrink-0 text-mpca-brass" />
                    <div className="flex-1">
                        <div className="uppercase tracking-widest text-[10px] text-mpca-brass mb-1">
                            Wired for this tournament type · {wiringSquadMode.owner} owned
                        </div>
                        {wiringSquadMode.mode === "Manual_PDF" ? (
                            <div>
                                <b>Manual · PDF only</b> — this tournament type does not use the player register. Upload the signed squad-list PDF below to officially nominate players. The picker further down is faded because it is optional and used only for internal record-keeping.
                            </div>
                        ) : wiringSquadMode.mode === "Register_Linked" ? (
                            <div>
                                <b>Register-linked</b> — select players from your Player Register below. Once the squad is submitted, upload the signed copy for MPCA to approve.
                            </div>
                        ) : (
                            <div>
                                <b>Auto-computed</b> — squad is derived automatically. Manual edits below are advisory only.
                            </div>
                        )}
                        {wiringSquadMode.text && (
                            <div className="mt-1 text-[10px] text-mpca-gray-dark italic">{wiringSquadMode.text}</div>
                        )}
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

            {/* M39g · AI Review of signed squad PDF — visible to MPCA reviewers */}
            {isMPCA && squad.signed_copy_url && (squad.ai_review_status || squad.ai_review_verdict) && (() => {
                const verdict = squad.ai_review_verdict;
                const status = squad.ai_review_status;
                const tone = verdict === "Looks_Good" ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : verdict === "Reject_Recommended" ? "border-mpca-oxblood bg-mpca-oxblood/5 text-mpca-oxblood"
                    : "border-mpca-brass bg-mpca-brass/10 text-mpca-brass";
                const rerun = async () => {
                    try {
                        setBusy(true);
                        const { data } = await api.post(`/squads/${squad.id}/ai-review`);
                        setSquad(data);
                    } catch (e) { alert(e?.response?.data?.detail || e.message); }
                    finally { setBusy(false); }
                };
                return (
                    <div className={`mb-4 border ${tone} px-4 py-3 text-[11px]`} data-testid="squad-ai-review-panel">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                                <Sparkles size={14} className="mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="uppercase tracking-widest text-[9px] mb-1">
                                        AI Review · Advisory Only
                                        {typeof squad.ai_review_confidence === "number" && <span className="ml-2 font-mono opacity-70">confidence {(squad.ai_review_confidence * 100).toFixed(0)}%</span>}
                                    </div>
                                    <div className="font-serif text-sm" data-testid="squad-ai-verdict">
                                        {status === "Pending" && "AI is reviewing the signed PDF…"}
                                        {status === "Completed" && verdict && (
                                            <>Verdict: <b>{verdict.replace(/_/g, " ")}</b></>
                                        )}
                                        {status === "Failed" && "AI review failed — click Re-run below."}
                                    </div>
                                    {Array.isArray(squad.ai_review_comments) && squad.ai_review_comments.length > 0 && (
                                        <ul className="mt-2 list-disc pl-5 space-y-0.5" data-testid="squad-ai-comments">
                                            {squad.ai_review_comments.map((c, i) => <li key={i}>{c}</li>)}
                                        </ul>
                                    )}
                                    <div className="mt-2 text-[10px] italic opacity-80">MPCA makes the final call — AI verdict is informational.</div>
                                </div>
                            </div>
                            <button onClick={rerun} disabled={busy} className="text-[10px] uppercase tracking-widest border border-current px-2 py-1 hover:bg-white/40 disabled:opacity-40 inline-flex items-center gap-1" data-testid="squad-rerun-ai-btn">
                                <RefreshCw size={10} /> Re-run
                            </button>
                        </div>
                    </div>
                );
            })()}

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
            {/* MPCA-241 · For Manual_PDF wiring types the picker is not the official
                nomination surface — fade it out so users focus on the Signed PDF
                upload below, but keep it interactive for internal record-keeping. */}
            {wiringSquadMode?.mode === "Manual_PDF" && (
                <div className="mb-2 border border-mpca-brass/40 bg-mpca-parchment/60 px-4 py-2 text-[10px] uppercase tracking-widest text-mpca-brass flex items-center gap-2" data-testid="squad-picker-fade-ribbon">
                    <Info size={11} />
                    <span className="font-mono">Picker below is optional · Manual PDF upload is the accepted flow for this tournament type</span>
                </div>
            )}
            <div
                className={"grid grid-cols-1 lg:grid-cols-5 gap-6 " + (wiringSquadMode?.mode === "Manual_PDF" ? "opacity-50 hover:opacity-100 transition-opacity duration-200" : "")}
                data-testid="squad-detail-body"
                data-picker-faded={wiringSquadMode?.mode === "Manual_PDF" ? "true" : "false"}
            >
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
                            const eLookup = eligibility?.byPlayerId?.get(p.id);
                            const isIneligible = !!(eLookup && !eLookup.ok);
                            const canPickThis = !isIneligible || eligibilityOverride;
                            return (
                                <div key={p.id} className={"px-5 py-3 grid grid-cols-12 items-center gap-3 " + (isIneligible ? "bg-mpca-oxblood/5" : "")} data-testid={`squad-pool-row-${testKey}`} data-player-id={p.id} data-player-no={p.player_id} data-ineligible={isIneligible ? "true" : "false"}>
                                    <div className="col-span-1">
                                        <div className={"w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-serif shrink-0 " + (isIneligible ? "bg-mpca-oxblood/20 text-mpca-oxblood" : "bg-mpca-parchment text-mpca-green-dark")}>
                                            {(p.full_name || "?").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                                        </div>
                                    </div>
                                    <div className="col-span-6 min-w-0">
                                        <div className="font-serif text-sm text-mpca-green-dark truncate">{p.full_name || "(unnamed player)"}</div>
                                        <div className="text-[10px] text-mpca-gray-dark font-mono truncate">
                                            <span className="text-mpca-brass">{p.player_id || "—"}</span> · {ROLE_LABEL[p.role] || p.role || "—"} · {CATEGORY_LABEL[p.category] || p.category || "—"} · {p.body_id || "—"}
                                        </div>
                                        {(p.batting_style || p.bowling_style) && (
                                            <div className="text-[9px] text-mpca-gray-dark mt-0.5">
                                                {p.batting_style && <>Bats {p.batting_style.replace(/_/g, " ")}</>}
                                                {p.batting_style && p.bowling_style && " · "}
                                                {p.bowling_style && <>Bowls {p.bowling_style.replace(/_/g, " ")}</>}
                                            </div>
                                        )}
                                        {isIneligible && (
                                            <div className="mt-1 flex flex-wrap gap-1" data-testid={`elig-reasons-${testKey}`}>
                                                {eLookup.reasons.map((r, i) => {
                                                    const [code, ...rest] = r.split(":");
                                                    const detail = rest.join(":").trim();
                                                    const label = code.replace(/_/g, " ");
                                                    return (
                                                        <span key={i} className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-mpca-oxblood/50 bg-mpca-oxblood/10 text-mpca-oxblood font-mono" title={detail}>
                                                            <XCircle size={9} /> {label}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-5 flex justify-end gap-1">
                                        {canEdit && !busy && (
                                            <>
                                                <button
                                                    onClick={() => handleAdd(p)}
                                                    disabled={!canPickThis}
                                                    className={"text-[10px] uppercase tracking-[0.15em] px-2 py-1 border transition-colors " + (canPickThis ? "border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory" : "border-mpca-oxblood/40 text-mpca-oxblood/60 cursor-not-allowed")}
                                                    title={canPickThis ? "Add to squad" : (eLookup?.reasons || []).join(" · ")}
                                                    data-testid={`squad-pool-pick-${testKey}`}
                                                >
                                                    {canPickThis ? "+ Pick" : "Blocked"}
                                                </button>
                                                {!captain && canPickThis && (
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
                                {members.length} nominated · playing cap {maxSize}
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
                            {members.map((m, idx) => {
                                const dec = decisionByPid[m.player_id];
                                return (
                                <div key={m.player_id} className={"px-5 py-2.5 flex items-center gap-3 " + (dec?.decision === "Rejected" ? "bg-mpca-oxblood/5" : dec?.decision === "Approved" ? "bg-mpca-green-dark/5" : "")} data-testid={`squad-member-${m.player_id}`}>
                                    <div className="text-[10px] text-mpca-brass font-mono w-5">#{idx + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-sm text-mpca-green-dark flex items-center gap-1.5 truncate">
                                            <a
                                                href={`/players/${m.player_id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:underline hover:text-mpca-oxblood transition-colors truncate"
                                                title="Open player profile in a new tab"
                                                data-testid={`squad-member-name-link-${m.player_id}`}
                                            >
                                                {m.full_name}
                                            </a>
                                            {m.is_captain && <span title="Captain"><Crown size={12} className="text-mpca-oxblood" /></span>}
                                            {m.is_keeper && <span title="Wicket-keeper"><BadgeCheck size={12} className="text-mpca-gold" /></span>}
                                        </div>
                                        <div className="text-[9px] text-mpca-gray-dark font-mono">{m.player_no} · {ROLE_LABEL[m.role] || m.role}</div>
                                        {dec && (
                                            <div className={"text-[10px] mt-0.5 " + (dec.decision === "Approved" ? "text-mpca-green-dark" : "text-mpca-oxblood")} data-testid={`squad-member-decision-${m.player_id}`}>
                                                {dec.decision === "Approved" ? "✓" : "✗"} {dec.decision}
                                                {dec.reason && <span className="italic"> — {dec.reason}</span>}
                                            </div>
                                        )}
                                    </div>
                                    {canReview && !busy && (
                                        <div className="flex flex-col gap-1 items-end">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleMemberDecision(m.player_id, "Approved")}
                                                    className={"text-[9px] uppercase px-1.5 py-0.5 border " + (dec?.decision === "Approved" ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory")}
                                                    title="Approve this player"
                                                    data-testid={`squad-member-approve-${m.player_id}`}
                                                >
                                                    <CheckCircle2 size={10} />
                                                </button>
                                                <button
                                                    onClick={() => handleMemberDecision(m.player_id, "Rejected")}
                                                    className={"text-[9px] uppercase px-1.5 py-0.5 border " + (dec?.decision === "Rejected" ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory")}
                                                    title="Reject this player"
                                                    data-testid={`squad-member-reject-${m.player_id}`}
                                                >
                                                    <XCircle size={10} />
                                                </button>
                                            </div>
                                            {dec && (
                                                <button
                                                    onClick={() => handleClearDecision(m.player_id)}
                                                    className="text-[8px] uppercase text-mpca-brass hover:underline"
                                                    data-testid={`squad-member-clear-${m.player_id}`}
                                                >
                                                    reset
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {canEdit && !canReview && !busy && (
                                        <button onClick={() => handleRemove(m.player_id)} className="text-mpca-burgundy-dark hover:text-mpca-oxblood disabled:opacity-40" data-testid={`squad-remove-${m.player_id}`} title="Remove">
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                                );
                            })}
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
// MPCA-106 · Only support staff live on the squad now. On-field match officials
// (umpires · scorer · referee) are assigned centrally via the Match Officials
// module — nominating them here duplicated data and confused Divisions.
const OFFICIAL_SLOTS = [
    { key: "manager", label: "Team Manager" },
    { key: "coach", label: "Head Coach" },
    { key: "trainer", label: "Trainer" },
    { key: "physio", label: "Physio" },
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
                    <div className="overline">Support Staff</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-0.5">
                        {filled} of {OFFICIAL_SLOTS.length} slots filled
                    </div>
                    <div className="text-[10px] text-mpca-gray-dark mt-1">
                        Nominated by {squad.body_id} along with the XV — Team Manager, Head Coach, Trainer and Physio only. On-field match officials (umpires, scorer, referee) are assigned centrally by MPCA in the Match Officials module.
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
