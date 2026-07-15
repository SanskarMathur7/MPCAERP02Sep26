import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Star, X, Users, Award, ShieldCheck, FileText, Download, Send, Check, ArrowRight, Sparkles } from "lucide-react";
import { fetchTournament, fetchPlayers, fetchSelection, patchSelection, submitSelection, reviewSelection, api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import PlayerDossierDrawer from "@/components/PlayerDossierDrawer";

// ─────── Role bucketing (mirrors HTML console) ───────
const ROLE_BUCKETS = [
    { code: "TOP", label: "Top Order",   min: 3 },
    { code: "MID", label: "Middle Order",min: 3 },
    { code: "WK",  label: "Keeper",      min: 2 },
    { code: "AR",  label: "All-Rounder", min: 2 },
    { code: "PACE",label: "Pace",        min: 3 },
    { code: "SPIN",label: "Spin",        min: 2 },
];

// Committee selectors (mock — same 5 as HTML)
const COMMITTEE = [
    { id: "sel-chair",   name: "Chairman of Selectors" },
    { id: "sel-indore",  name: "Selector · Indore" },
    { id: "sel-bhopal",  name: "Selector · Bhopal" },
    { id: "sel-gwalior", name: "Selector · Gwalior" },
    { id: "sel-jabalpur",name: "Selector · Jabalpur" },
];

const DEFAULT_WEIGHTS = { form: 30, season: 25, fitness: 20, exp: 15, cond: 10 };
const DEFAULT_YOYO = 16.1;

// derive role code for HTML-seeded + legacy Player rows
const roleCode = (p) => {
    if (p.selection_meta?.role_code) return p.selection_meta.role_code;
    if (p.role === "Wicket_Keeper") return "WK";
    if (p.role === "All_Rounder") return "AR";
    if (p.role === "Bowler") {
        const b = (p.bowling_style || "").toLowerCase();
        return b.includes("spin") || b.includes("orthodox") || b.includes("chinaman") ? "SPIN" : "PACE";
    }
    return "MID";
};

const ageOf = (p) => p.selection_meta?.age_years ?? (p.date_of_birth ? new Date().getFullYear() - new Date(p.date_of_birth).getFullYear() : null);
const yoyoOf = (p) => p.selection_meta?.yo_yo ?? null;
const divName = (p) => p.selection_meta?.division_name || p.division_folder || p.body_id;

// Simple index calculator (0-100) — form + season + fitness + experience + conditions, weighted
const calcIndex = (p, w) => {
    const m = p.selection_meta || {};
    const stats = m.stats || {};
    const fc = stats.fc || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const form = m.form_last_5?.fc || [];
    const formAvg = form.length ? form.reduce((s, [r, w2]) => s + r + w2 * 20, 0) / form.length : 0;
    const season = fc[1] || 0;                          // runs
    const fitness = m.yo_yo ?? 15;
    const exp = fc[0] || 0;                             // matches
    const cond = m.conditions_fit?.fc ?? 50;
    // normalise
    const nForm = Math.min(100, formAvg * 1.2);
    const nSeason = Math.min(100, season / 8);
    const nFit = Math.min(100, ((fitness - 14) / 6) * 100);
    const nExp = Math.min(100, exp * 2.5);
    const nCond = cond;
    const total = w.form + w.season + w.fitness + w.exp + w.cond || 1;
    return Math.round((nForm * w.form + nSeason * w.season + nFit * w.fitness + nExp * w.exp + nCond * w.cond) / total);
};

const SelectionConsole = () => {
    const { id: tid } = useParams();
    const navigate = useNavigate();
    const { persona, isOfficeBearer } = useAuth();
    const [tournament, setTournament] = useState(null);
    const [players, setPlayers] = useState([]);
    const [selection, setSelection] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("pool"); // pool | shortlist | squad
    const [q, setQ] = useState("");
    const [roleFilter, setRoleFilter] = useState(null);
    const [divFilter, setDivFilter] = useState("");
    const [flags, setFlags] = useState({ avail: false, fit: false, carried: false, clean: false });
    const [yoyoMin, setYoyoMin] = useState(DEFAULT_YOYO);
    const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
    const [voters, setVoters] = useState(COMMITTEE.map((c) => c.id));
    const [dossierId, setDossierId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [busyAction, setBusyAction] = useState(null);
    const [officialsPool, setOfficialsPool] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [t, ps, sel] = await Promise.all([
                fetchTournament(tid),
                fetchPlayers().catch(() => []),
                fetchSelection(tid).catch(() => null),
            ]);
            setTournament(t);
            setPlayers(ps);
            setSelection(sel);
            if (sel?.voters?.length) setVoters(sel.voters);
            // Fetch match officials scoped to persona's body (or MPCA for state)
            try {
                const bodyScope = persona?.body_code;
                const { data: pool } = await import("@/lib/api").then((m) => m.api.get("/match-officials", { params: bodyScope ? { body_id: bodyScope, active_only: true } : { active_only: true } }));
                setOfficialsPool(pool || []);
            } catch { setOfficialsPool([]); }
        } finally { setLoading(false); }
    }, [tid, persona]);

    useEffect(() => { load(); }, [load]);

    const save = useCallback(async (patch) => {
        setSaving(true);
        try {
            const updated = await patchSelection(tid, patch);
            setSelection(updated);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setSaving(false); }
    }, [tid]);

    // ─── Filter the pool ───
    const pool = useMemo(() => {
        if (!players || !tournament) return [];
        return players
            .filter((p) => {
                if (divFilter && divName(p) !== divFilter) return false;
                if (roleFilter && roleCode(p) !== roleFilter) return false;
                if (flags.avail && (p.selection_meta?.availability || "Available") !== "Available") return false;
                if (flags.fit && (yoyoOf(p) ?? 0) < yoyoMin) return false;
                if (q && !p.full_name.toLowerCase().includes(q.toLowerCase()) && !divName(p).toLowerCase().includes(q.toLowerCase())) return false;
                return true;
            })
            .map((p) => ({ ...p, _index: calcIndex(p, weights) }))
            .sort((a, b) => b._index - a._index);
    }, [players, tournament, divFilter, roleFilter, flags, yoyoMin, q, weights]);

    const shortlist = useMemo(() => {
        const ids = new Set(selection?.shortlist_ids || []);
        return pool.filter((p) => ids.has(p.id));
    }, [pool, selection]);

    const squadMembers = selection?.members || [];
    const squadIds = new Set(squadMembers.map((m) => m.player_id));
    const shortlistIds = new Set(selection?.shortlist_ids || []);

    const toggleShortlist = (pid) => {
        const list = new Set(selection?.shortlist_ids || []);
        list.has(pid) ? list.delete(pid) : list.add(pid);
        save({ shortlist_ids: Array.from(list) });
    };

    const toggleVote = (pid, voterId) => {
        const votes = { ...(selection?.votes || {}) };
        const cur = new Set(votes[pid] || []);
        cur.has(voterId) ? cur.delete(voterId) : cur.add(voterId);
        votes[pid] = Array.from(cur);
        save({ votes });
    };

    const addToSquad = (p) => {
        if (squadIds.has(p.id)) return;
        const t = tournament;
        const maxSize = t?.max_squad_size || 18;
        if (squadMembers.length >= maxSize) { alert(`Squad already at max ${maxSize}`); return; }
        const newMember = {
            player_id: p.id, player_no: p.player_id, full_name: p.full_name,
            role: p.role, is_captain: false, is_vice_captain: false, is_keeper: roleCode(p) === "WK",
            added_on: new Date().toISOString(),
        };
        save({ members: [...squadMembers, newMember] });
    };

    const removeFromSquad = (pid) => save({ members: squadMembers.filter((m) => m.player_id !== pid) });

    const setLeader = (pid, key) => {
        const updated = squadMembers.map((m) => ({ ...m, [key]: m.player_id === pid }));
        save({ members: updated });
    };

    const updateOfficials = (patch) => save({ match_officials: { ...(selection?.match_officials || {}), ...patch } });

    // ─── Squad balance ───
    const balance = ROLE_BUCKETS.map((b) => {
        const have = squadMembers.filter((m) => roleCode({ selection_meta: players.find((p) => p.id === m.player_id)?.selection_meta, role: m.role, bowling_style: players.find((p) => p.id === m.player_id)?.bowling_style }) === b.code).length;
        return { ...b, have };
    });

    const captain = squadMembers.find((m) => m.is_captain);
    const vc = squadMembers.find((m) => m.is_vice_captain);
    const submissionStatus = selection?.submission_status || "Draft";
    const canEdit = ["Draft", "Rejected"].includes(submissionStatus);

    const warnings = [];
    balance.forEach((b) => { if (b.have < b.min) warnings.push(`Shortfall · ${b.label}: need ${b.min}, have ${b.have}`); });
    if (!captain) warnings.push("Captain not appointed");
    if (!vc) warnings.push("Vice-captain not appointed");
    if (squadMembers.length < 11) warnings.push(`Squad has ${squadMembers.length} — minimum 11 required`);

    const acceptanceOK = ["Accepted", "Not_Required"].includes(tournament?.acceptance?.status);

    const doSubmit = async () => {
        if (warnings.length) { if (!window.confirm(`There are ${warnings.length} warnings. Submit anyway?`)) return; }
        setBusyAction("submit");
        try {
            const updated = await submitSelection(tid, null);
            setSelection(updated);
            // Sprint M13-C: notify MPCA Secretary with AI verdict summary
            if (updated?.id) {
                try { await api.post(`/squads/${updated.id}/notify-ai-review`); } catch (_) { /* non-fatal */ }
            }
            alert("Submitted to MPCA for approval. AI verdict summary has been sent.");
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusyAction(null); }
    };

    const doReview = async (action) => {
        const note = window.prompt(`${action === "approve" ? "Approval" : "Rejection"} note (optional):`) ?? "";
        setBusyAction(action);
        try {
            const updated = await reviewSelection(tid, action, note || null);
            setSelection(updated);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusyAction(null); }
    };

    const exportCSV = () => {
        const rows = [["player_no", "full_name", "role", "is_captain", "is_vice_captain", "is_keeper"]];
        squadMembers.forEach((m) => rows.push([m.player_no, m.full_name, m.role, m.is_captain, m.is_vice_captain, m.is_keeper]));
        const csv = rows.map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${tournament?.tournament_no || "squad"}.csv`; a.click();
    };

    const draftMinutes = () => {
        const off = selection?.match_officials || {};
        const lines = [
            `MINUTES OF SELECTION — DRAFT`,
            `Tournament: ${tournament?.name} (${tournament?.tournament_no})`,
            `Host body: ${tournament?.host_body_id}`,
            `Date: ${new Date().toDateString()}`,
            "",
            `Present selectors:`,
            ...voters.map((v) => `  · ${COMMITTEE.find((c) => c.id === v)?.name || v}`),
            "",
            `Squad (${squadMembers.length}/${tournament?.max_squad_size}):`,
            ...squadMembers.map((m, i) => `  ${i + 1}. ${m.full_name} · ${m.role}${m.is_captain ? " (C)" : m.is_vice_captain ? " (VC)" : ""}${m.is_keeper ? " · WK" : ""}`),
            "",
            `Match Officials:`,
            `  Manager: ${off.manager || "—"}`,
            `  Coach: ${off.coach || "—"}`,
            `  Trainer: ${off.trainer || "—"}`,
            `  Physio: ${off.physio || "—"}`,
            `  Umpires: ${off.umpire_1 || "—"} · ${off.umpire_2 || "—"}`,
            `  Scorer: ${off.scorer || "—"}`,
            `  Referee: ${off.referee || "—"}`,
            "",
            `Warnings at submission: ${warnings.length}`,
            ...warnings.map((w) => `  · ${w}`),
            "",
            `Notes: ${selection?.notes || "—"}`,
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `minutes-${tournament?.tournament_no}.txt`; a.click();
    };

    if (loading) return <div className="p-16"><CricketLoader label="Loading selection console…" size="lg" /></div>;
    if (!tournament) return <div className="p-16 text-center"><div className="font-serif text-3xl text-mpca-green-dark">Tournament not found.</div></div>;

    if (!acceptanceOK) {
        return (
            <div className="p-16 text-center">
                <div className="font-serif text-3xl text-mpca-green-dark">🔒 Locked</div>
                <p className="text-mpca-gray-dark mt-3">The host body must accept this tournament before squad selection can begin. Current acceptance: <b>{tournament?.acceptance?.status}</b></p>
                <Link to={`/tournaments`} className="btn-heritage-secondary mt-6 inline-flex"><ArrowLeft size={14} /> Back to Calendar</Link>
            </div>
        );
    }

    const activeList = tab === "pool" ? pool : tab === "shortlist" ? shortlist : pool.filter((p) => squadIds.has(p.id));
    const divisions = Array.from(new Set(players.map(divName).filter(Boolean))).sort();

    return (
        <div className="page-enter px-6 md:px-10 py-8 max-w-[1600px] mx-auto" data-testid="selection-console">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <Link to={`/tournaments`} className="btn-heritage-ghost"><ArrowLeft size={14} /> Back to Calendar</Link>
                <div className="flex-1 min-w-[200px]">
                    <div className="overline">Article VII · Selection Console</div>
                    <h1 className="font-serif text-3xl text-mpca-green-dark leading-tight">{tournament.name}</h1>
                    <div className="text-xs text-mpca-gray-dark mt-1 font-mono">
                        {tournament.tournament_no} · Host {tournament.host_body_id} · Squad size {tournament.max_squad_size}
                        <span className="ml-3 px-2 py-0.5 border border-mpca-brass/40 text-mpca-brass" data-testid="sel-status">{submissionStatus}</span>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button className="btn-heritage-ghost" onClick={draftMinutes} data-testid="draft-minutes-btn"><FileText size={12} /> Draft Minutes</button>
                    <button className="btn-heritage-ghost" onClick={exportCSV} data-testid="export-csv-btn"><Download size={12} /> Export CSV</button>
                    {canEdit && persona?.body_type !== "State" && (
                        <button className="btn-heritage-primary" onClick={doSubmit} disabled={busyAction === "submit"} data-testid="submit-mpca-btn">
                            <Send size={12} /> {busyAction === "submit" ? "Submitting…" : "Submit to MPCA"}
                        </button>
                    )}
                    {submissionStatus === "Awaiting_MPCA_Approval" && isOfficeBearer && (
                        <>
                            <Link to={`/squads/${selection?.id}/review`} className="btn-heritage-secondary" data-testid="ai-review-btn">
                                <Sparkles size={12} /> AI Review
                            </Link>
                            <button className="btn-heritage-primary" onClick={() => doReview("approve")} disabled={busyAction === "approve"} data-testid="approve-btn"><Check size={12} /> Approve</button>
                            <button className="btn-heritage-secondary !bg-mpca-oxblood !text-mpca-ivory" onClick={() => doReview("reject")} disabled={busyAction === "reject"} data-testid="reject-btn"><X size={12} /> Reject</button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4">
                {/* ─── LEFT RAIL: Filters + Weights ─── */}
                <div className="space-y-3">
                    <div className="bulletin-card p-3">
                        <div className="overline mb-2">Filters</div>
                        <select className="input-heritage !text-xs mb-2" value={divFilter} onChange={(e) => setDivFilter(e.target.value)} data-testid="sel-div-filter">
                            <option value="">All divisions</option>
                            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <div className="flex flex-wrap gap-1 mb-2">
                            {ROLE_BUCKETS.map((b) => (
                                <button key={b.code} onClick={() => setRoleFilter(roleFilter === b.code ? null : b.code)}
                                    className={`px-2 py-1 text-[10px] uppercase tracking-wider border ${roleFilter === b.code ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-brass/40 text-mpca-charcoal"}`}
                                    data-testid={`sel-role-${b.code}`}>{b.code}</button>
                            ))}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-mpca-gray-dark mt-2 mb-1">Show only</div>
                        {[["avail", "Available"], ["fit", "Fitness pass"], ["clean", "No red flags"]].map(([k, l]) => (
                            <label key={k} className="flex items-center gap-2 text-xs text-mpca-charcoal py-0.5">
                                <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} data-testid={`sel-flag-${k}`} /> {l}
                            </label>
                        ))}
                    </div>
                    <div className="bulletin-card p-3">
                        <div className="overline mb-2">Fitness benchmark (Yo-Yo)</div>
                        <input type="number" step="0.1" className="input-heritage !text-xs font-mono" value={yoyoMin} onChange={(e) => setYoyoMin(parseFloat(e.target.value) || 0)} data-testid="sel-yoyo-min" />
                    </div>
                    <div className="bulletin-card p-3">
                        <div className="overline mb-2">Index weights</div>
                        {[["form", "Recent form"], ["season", "Season output"], ["fitness", "Fitness"], ["exp", "Experience"], ["cond", "Conditions"]].map(([k, l]) => (
                            <label key={k} className="block mb-1.5">
                                <div className="flex justify-between text-[11px] text-mpca-charcoal"><span>{l}</span><span className="font-mono text-mpca-brass">{weights[k]}</span></div>
                                <input type="range" min="0" max="100" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: parseInt(e.target.value) })} className="w-full" data-testid={`sel-w-${k}`} />
                            </label>
                        ))}
                        <button className="text-[10px] text-mpca-brass hover:underline mt-1" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset weights</button>
                    </div>
                    <div className="bulletin-card p-3">
                        <div className="overline mb-2">Panel present ({voters.length}/{COMMITTEE.length})</div>
                        {COMMITTEE.map((c) => (
                            <label key={c.id} className="flex items-center gap-2 text-[11px] py-0.5">
                                <input type="checkbox" checked={voters.includes(c.id)}
                                    onChange={() => { const v = voters.includes(c.id) ? voters.filter((x) => x !== c.id) : [...voters, c.id]; setVoters(v); save({ voters: v }); }}
                                    data-testid={`sel-voter-${c.id}`} /> {c.name}
                            </label>
                        ))}
                    </div>
                </div>

                {/* ─── MIDDLE: Ledger ─── */}
                <div className="bulletin-card overflow-hidden">
                    <div className="p-3 border-b border-mpca-brass/20 flex flex-wrap items-center gap-2">
                        <div className="inline-flex border border-mpca-brass/40">
                            {["pool", "shortlist", "squad"].map((tk) => (
                                <button key={tk} onClick={() => setTab(tk)}
                                    className={`px-3 py-1.5 text-[11px] uppercase tracking-widest ${tab === tk ? "bg-mpca-green-dark text-mpca-ivory" : "text-mpca-green-dark hover:bg-mpca-parchment"} ${tk !== "pool" ? "border-l border-mpca-brass/40" : ""}`}
                                    data-testid={`sel-tab-${tk}`}>{tk} {tk === "shortlist" ? `(${shortlist.length})` : tk === "squad" ? `(${squadMembers.length})` : `(${pool.length})`}</button>
                            ))}
                        </div>
                        <div className="flex-1 min-w-[200px] relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-mpca-gray" size={14} />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player or division" className="input-heritage pl-8 !py-1.5 !text-xs" data-testid="sel-search" />
                        </div>
                        {saving && <span className="text-[10px] text-mpca-brass italic">saving…</span>}
                    </div>
                    <div className="overflow-y-auto max-h-[70vh]">
                        {activeList.length === 0 ? (
                            <div className="p-8 text-center text-mpca-gray-dark italic text-sm">No players match this view.</div>
                        ) : activeList.map((p) => {
                            const idxColor = p._index >= 70 ? "text-mpca-green" : p._index >= 45 ? "text-mpca-brass" : "text-mpca-gray-dark";
                            const votesFor = (selection?.votes?.[p.id] || []).length;
                            const carried = voters.length > 0 && votesFor > voters.length / 2;
                            const inSquad = squadIds.has(p.id);
                            const inShort = shortlistIds.has(p.id);
                            const fit = (yoyoOf(p) ?? 0) >= yoyoMin;
                            return (
                                <div key={p.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-mpca-brass/10 hover:bg-mpca-parchment/40" data-testid={`pool-row-${p.id}`}>
                                    <div className="col-span-4 min-w-0">
                                        <button onClick={() => setDossierId(p.id)} className="text-left w-full" data-testid={`open-dossier-${p.id}`}>
                                            <div className="font-serif text-sm text-mpca-green-dark truncate">{p.full_name}</div>
                                            <div className="text-[10px] text-mpca-gray-dark truncate">{divName(p)} · {p.selection_meta?.role_desc || p.role} · {ageOf(p)}y</div>
                                        </button>
                                    </div>
                                    <div className="col-span-1 text-[10px] font-mono text-mpca-charcoal">{roleCode(p)}</div>
                                    <div className={`col-span-1 text-sm font-mono font-bold ${idxColor}`}>{p._index}</div>
                                    <div className={`col-span-1 text-[10px] font-mono ${fit ? "text-mpca-green" : "text-mpca-oxblood"}`}>{yoyoOf(p) ?? "—"}</div>
                                    <div className="col-span-3 flex items-center gap-0.5 flex-wrap">
                                        {COMMITTEE.map((c) => {
                                            const voted = (selection?.votes?.[p.id] || []).includes(c.id);
                                            const isPresent = voters.includes(c.id);
                                            return (
                                                <button key={c.id} title={c.name} onClick={() => toggleVote(p.id, c.id)} disabled={!isPresent || !canEdit}
                                                    className={`w-4 h-4 rounded-full text-[9px] font-bold ${voted ? "bg-mpca-green text-mpca-ivory" : isPresent ? "bg-mpca-brass/20 text-mpca-brass" : "bg-mpca-gray/20 text-mpca-gray-dark cursor-not-allowed"}`}
                                                    data-testid={`vote-${p.id}-${c.id}`}>{voted ? "✓" : ""}</button>
                                            );
                                        })}
                                        {carried && <span className="ml-1 text-[9px] uppercase text-mpca-green tracking-widest">carried</span>}
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-1">
                                        <button onClick={() => toggleShortlist(p.id)} disabled={!canEdit}
                                            className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${inShort ? "bg-mpca-brass text-mpca-ivory border-mpca-brass" : "border-mpca-brass/40 text-mpca-brass"}`}
                                            data-testid={`shortlist-${p.id}`}><Star size={10} /></button>
                                        <button onClick={() => inSquad ? removeFromSquad(p.id) : addToSquad(p)} disabled={!canEdit}
                                            className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${inSquad ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-brass/40 text-mpca-brass"}`}
                                            data-testid={`squad-${p.id}`}>{inSquad ? "In XV" : "Add"}</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ─── RIGHT SHEET: Squad + Officials + Warnings ─── */}
                <div className="space-y-3">
                    <div className="bulletin-card p-3" data-testid="squad-sheet">
                        <div className="flex items-center justify-between mb-2">
                            <div className="overline">Squad ({squadMembers.length}/{tournament.max_squad_size})</div>
                            {canEdit && squadMembers.length > 0 && (
                                <button onClick={() => save({ members: [] })} className="text-[10px] text-mpca-oxblood hover:underline" data-testid="clear-squad-btn">Clear</button>
                            )}
                        </div>
                        {squadMembers.length === 0 ? (
                            <div className="text-xs italic text-mpca-gray-dark py-3">No players selected yet.</div>
                        ) : squadMembers.map((m) => (
                            <div key={m.player_id} className="flex items-center gap-2 py-1.5 border-b border-mpca-brass/10 last:border-b-0" data-testid={`squad-member-${m.player_id}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-serif text-mpca-green-dark truncate">{m.full_name}</div>
                                    <div className="text-[10px] text-mpca-gray-dark">{m.role}{m.is_keeper ? " · WK" : ""}</div>
                                </div>
                                {canEdit && (
                                    <>
                                        <button onClick={() => setLeader(m.player_id, "is_captain")}
                                            className={`w-6 h-6 text-[10px] font-bold border ${m.is_captain ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-brass/40 text-mpca-brass"}`}
                                            data-testid={`cap-${m.player_id}`}>C</button>
                                        <button onClick={() => setLeader(m.player_id, "is_vice_captain")}
                                            className={`w-8 h-6 text-[10px] font-bold border ${m.is_vice_captain ? "bg-mpca-brass text-mpca-ivory border-mpca-brass" : "border-mpca-brass/40 text-mpca-brass"}`}
                                            data-testid={`vc-${m.player_id}`}>VC</button>
                                        <button onClick={() => removeFromSquad(m.player_id)} className="text-mpca-oxblood" data-testid={`rm-${m.player_id}`}><X size={12} /></button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="bulletin-card p-3">
                        <div className="overline mb-2">Balance</div>
                        <div className="grid grid-cols-2 gap-1 text-[11px]">
                            {balance.map((b) => (
                                <div key={b.code} className={`flex justify-between px-2 py-1 border ${b.have >= b.min ? "border-mpca-green/40 text-mpca-green" : "border-mpca-oxblood/40 text-mpca-oxblood"}`}>
                                    <span>{b.label}</span><span className="font-mono">{b.have}/{b.min}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bulletin-card p-3" data-testid="match-officials-block">
                        <div className="flex items-center justify-between mb-2">
                            <div className="overline">Match Officials</div>
                            <Link to="/match-officials" className="text-[10px] text-mpca-brass hover:underline">Manage directory →</Link>
                        </div>
                        {officialsPool.length === 0 && (
                            <div className="text-[10px] text-mpca-oxblood italic mb-2">
                                No officials on record for your body ({persona?.body_code || "—"}). <Link to="/match-officials" className="underline">Add them here</Link>.
                            </div>
                        )}
                        {[
                            ["manager", "Manager", ["Manager"]],
                            ["coach", "Coach", ["Coach"]],
                            ["trainer", "Trainer", ["Trainer"]],
                            ["physio", "Physio", ["Physio"]],
                            ["umpire_1", "Umpire 1", ["Umpire"]],
                            ["umpire_2", "Umpire 2", ["Umpire"]],
                            ["scorer", "Scorer", ["Scorer"]],
                            ["referee", "Referee", ["Referee"]],
                        ].map(([k, l, allowed]) => {
                            const opts = officialsPool.filter((o) => allowed.includes(o.role));
                            const cur = selection?.match_officials?.[k] || "";
                            return (
                                <div key={k} className="mb-1.5">
                                    <div className="text-[10px] uppercase tracking-wider text-mpca-gray-dark">{l}</div>
                                    <select value={cur} onChange={(e) => updateOfficials({ [k]: e.target.value })}
                                        disabled={!canEdit} className="input-heritage !py-1 !text-xs"
                                        data-testid={`official-${k}`}>
                                        <option value="">— Not assigned —</option>
                                        {opts.map((o) => (
                                            <option key={o.id} value={o.full_name}>{o.full_name} · {o.grade.replace(/_/g, " ")} · {o.body_id}</option>
                                        ))}
                                        {cur && !opts.some((o) => o.full_name === cur) && <option value={cur}>{cur} (external)</option>}
                                    </select>
                                </div>
                            );
                        })}
                    </div>

                    {warnings.length > 0 && (
                        <div className="bulletin-card p-3 border-l-4 border-mpca-oxblood" data-testid="warnings-block">
                            <div className="overline text-mpca-oxblood mb-2">Warnings ({warnings.length})</div>
                            <ul className="text-[11px] text-mpca-oxblood space-y-0.5 list-disc pl-4">
                                {warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    )}

                    {selection?.review_note && (
                        <div className="bulletin-card p-3">
                            <div className="overline mb-1">Last review note</div>
                            <div className="text-xs text-mpca-charcoal italic">{selection.review_note}</div>
                        </div>
                    )}
                </div>
            </div>

            <PlayerDossierDrawer
                playerId={dossierId}
                onClose={() => setDossierId(null)}
                players={players}
                canEdit={canEdit}
                inSquad={dossierId ? squadIds.has(dossierId) : false}
                onToggleSquad={(p) => squadIds.has(p.id) ? removeFromSquad(p.id) : addToSquad(p)}
            />
        </div>
    );
};

export default SelectionConsole;
