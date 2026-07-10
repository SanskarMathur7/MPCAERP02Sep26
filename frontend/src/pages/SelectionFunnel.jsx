import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchSelectionFunnels, fetchFunnelStats, fetchPlayers, fetchTournaments,
    createSelectionFunnel, addPlayersToFunnel, removePlayerFromFunnel,
    advanceFunnelStage, divisionRecommendFunnel, mpcaValidateFunnel,
    submitFunnelToBCCI, deleteSelectionFunnel,
} from "@/lib/api";
import {
    Users, Plus, ChevronRight, Trophy, Globe, Send, CheckCircle2, X,
    Trash2, Award, ArrowRight, Sparkles, Building2,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const STAGES = ["LongList", "ShortList", "Pool", "Squad", "Submitted"];
const STAGE_LIMITS = { LongList: 150, ShortList: 30, Pool: 20, Squad: 12 };
const STAGE_META = {
    LongList:  { label: "Long List · ≤150",  tone: "lapsed" },
    ShortList: { label: "Short List · ≤30",  tone: "pending" },
    Pool:      { label: "Pool · ≤20",        tone: "pending" },
    Squad:     { label: "Squad · ≤12",       tone: "active" },
    Submitted: { label: "Submitted to BCCI", tone: "active" },
};
const FORMATS = [
    "FourDay_Senior", "FourDay_U23", "FourDay_U19",
    "OneDay_Senior", "OneDay_U23", "OneDay_U19", "OneDay_Womens",
    "T20_Senior", "T20_U23", "T20_U19", "T20_Womens", "U16_League",
];

const Pill = ({ tone, label, testId }) => (
    <span className={"pill pill-" + tone} data-testid={testId}>{label}</span>
);

// ─────────── Create Funnel ───────────
const NewFunnelDialog = ({ open, onClose, onCreated, persona }) => {
    const [tournaments, setTournaments] = useState([]);
    const [form, setForm] = useState({
        tournament_id: "", format: "OneDay_Senior",
        season_year: "2025-26", is_international: false, division_body_id: "",
        notes: "",
    });
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) fetchTournaments().then(setTournaments).catch(() => {}); }, [open]);
    if (!open) return null;
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const f = await createSelectionFunnel({
                ...form,
                division_body_id: form.is_international ? (form.division_body_id || persona.body_code || null) : null,
                created_by: persona.name,
            });
            onCreated(f);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="new-funnel-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-xl w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex items-center justify-between">
                    <div className="font-serif text-xl">Open New Selection Funnel</div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="label-heritage">Tournament *</label>
                        <select required value={form.tournament_id} onChange={(e) => setForm((f) => ({ ...f, tournament_id: e.target.value }))} className="input-heritage" data-testid="funnel-tournament">
                            <option value="">— Choose —</option>
                            {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Format *</label>
                            <select value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))} className="input-heritage" data-testid="funnel-format">
                                {FORMATS.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Season</label>
                            <input value={form.season_year} onChange={(e) => setForm((f) => ({ ...f, season_year: e.target.value }))} className="input-heritage" />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={form.is_international} onChange={(e) => setForm((f) => ({ ...f, is_international: e.target.checked }))} data-testid="funnel-international" />
                        <Globe className="w-4 h-4 text-mpca-saffron" /> International tournament (Division → MPCA validation required)
                    </label>
                    {form.is_international && (
                        <div>
                            <label className="label-heritage">Division Body</label>
                            <input value={form.division_body_id} onChange={(e) => setForm((f) => ({ ...f, division_body_id: e.target.value }))} placeholder="DIV-IND" className="input-heritage" />
                        </div>
                    )}
                    <div>
                        <label className="label-heritage">Notes</label>
                        <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-heritage" />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy || !form.tournament_id} className="btn-heritage-primary" data-testid="funnel-save">
                        {busy ? "Saving…" : "Open Funnel"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ─────────── Add Players Dialog ───────────
const AddPlayersDialog = ({ funnel, currentStage, persona, onClose, onDone }) => {
    const [players, setPlayers] = useState([]);
    const [picked, setPicked] = useState(new Set());
    const [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => { fetchPlayers({ status: "Active" }).then(setPlayers).catch(() => {}); }, []);
    if (!funnel) return null;
    const alreadyAtStage = new Set((funnel.entries || []).filter((e) => e.stage === currentStage).map((e) => e.player_id));
    const stageEntries = (funnel.entries || []).filter((e) => e.stage === currentStage).length;
    const cap = STAGE_LIMITS[currentStage] || 9999;
    const filtered = players.filter((p) => !alreadyAtStage.has(p.id) && (!search || p.name?.toLowerCase().includes(search.toLowerCase())));
    const toggle = (pid) => {
        setPicked((s) => {
            const n = new Set(s);
            if (n.has(pid)) n.delete(pid); else n.add(pid);
            return n;
        });
    };
    const canPick = stageEntries + picked.size <= cap;
    const submit = async () => {
        setBusy(true);
        try {
            const updated = await addPlayersToFunnel(funnel.id, {
                player_ids: Array.from(picked),
                added_by: persona.name,
            });
            onDone(updated);
            onClose();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="add-players-dialog">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">{funnel.funnel_no} · {currentStage}</div>
                        <div className="font-serif text-xl mt-1">Add Players to {currentStage}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-4 border-b border-mpca-brass/30 bg-mpca-cream/30">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="input-heritage" data-testid="player-search" />
                    <div className="text-xs text-mpca-gray-dark mt-2">
                        Current: <strong>{stageEntries}</strong> / {cap} · Picked: <strong>{picked.size}</strong>
                        {!canPick && <span className="text-mpca-oxblood ml-2">⚠ Exceeds cap</span>}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                    {filtered.length === 0 ? (
                        <div className="text-center text-mpca-gray-dark text-sm py-8">No matching players (or all already at this stage).</div>
                    ) : filtered.map((p) => (
                        <label key={p.id} className={"flex items-center gap-3 p-2 border cursor-pointer " + (picked.has(p.id) ? "border-mpca-oxblood bg-mpca-oxblood/5" : "border-mpca-brass/30 hover:bg-mpca-cream/30")} data-testid={`player-pick-${p.id}`}>
                            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-mpca-navy truncate">{p.full_name || p.name || "—"}</div>
                                <div className="text-xs text-mpca-gray-dark">{(p.role || "—").replace(/_/g, " ")} · {p.date_of_birth ? `b. ${p.date_of_birth.slice(0,4)}` : "DOB unknown"} · {p.body_id}</div>
                            </div>
                        </label>
                    ))}
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button onClick={submit} disabled={busy || picked.size === 0 || !canPick} className="btn-heritage-primary" data-testid="confirm-add-players">
                        {busy ? "Adding…" : `Add ${picked.size} Player(s)`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────── Advance Stage Dialog ───────────
const AdvanceDialog = ({ funnel, persona, onClose, onDone }) => {
    const [picked, setPicked] = useState(new Set());
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    if (!funnel) return null;
    const cur = funnel.current_stage;
    const STAGE_NEXT_MAP = { LongList: "ShortList", ShortList: "Pool", Pool: "Squad" };
    const nxt = STAGE_NEXT_MAP[cur];
    const nxtCap = STAGE_LIMITS[nxt] || 9999;
    const eligible = (funnel.entries || []).filter((e) => e.stage === cur);
    const toggle = (pid) => {
        setPicked((s) => {
            const n = new Set(s);
            if (n.has(pid)) n.delete(pid); else n.add(pid);
            return n;
        });
    };
    const submit = async () => {
        setBusy(true);
        try {
            const u = await advanceFunnelStage(funnel.id, {
                player_ids: Array.from(picked),
                actor_name: persona.name,
                actor_post: persona.post,
                notes: notes.trim() || null,
            });
            onDone(u);
            onClose();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="advance-dialog">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">{funnel.funnel_no}</div>
                        <div className="font-serif text-xl mt-1">{cur} <ArrowRight className="inline w-4 h-4" /> {nxt}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-4 border-b border-mpca-brass/30 bg-mpca-cream/30 text-xs text-mpca-gray-dark">
                    Eligible: <strong>{eligible.length}</strong> · Picked: <strong>{picked.size}</strong> · Next cap: <strong>{nxtCap}</strong>
                    {picked.size > nxtCap && <span className="text-mpca-oxblood ml-2">⚠ Exceeds next stage cap</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                    {eligible.map((e) => (
                        <label key={e.player_id} className={"flex items-center gap-3 p-2 border cursor-pointer " + (picked.has(e.player_id) ? "border-mpca-oxblood bg-mpca-oxblood/5" : "border-mpca-brass/30 hover:bg-mpca-cream/30")} data-testid={`advance-pick-${e.player_id}`}>
                            <input type="checkbox" checked={picked.has(e.player_id)} onChange={() => toggle(e.player_id)} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-mpca-navy truncate">{e.player_name || "—"}</div>
                                <div className="text-xs text-mpca-gray-dark">{(e.role || "—").replace(/_/g, " ")} {e.age ? `· age ${e.age}` : ""}</div>
                            </div>
                        </label>
                    ))}
                </div>
                <div className="p-4 border-t border-mpca-brass/30">
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the audit trail (optional)" className="input-heritage" />
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button onClick={submit} disabled={busy || picked.size === 0 || picked.size > nxtCap} className="btn-heritage-primary" data-testid="confirm-advance">
                        {busy ? "Advancing…" : `Advance ${picked.size} → ${nxt}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────── Page ───────────
export default function SelectionFunnel() {
    const { persona } = useAuth();
    const [funnels, setFunnels] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newOpen, setNewOpen] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [addPlayersFor, setAddPlayersFor] = useState(null);
    const [advanceFor, setAdvanceFor] = useState(null);

    const reload = async () => {
        setLoading(true);
        try {
            const [f, s] = await Promise.all([fetchSelectionFunnels(), fetchFunnelStats()]);
            setFunnels(f); setStats(s);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); }, []);

    const canCreate = persona && ["president", "secretary", "selection-committee-chair"].includes(persona.id);
    const canSelect = canCreate || (persona && persona.id === "treasurer"); // demo: treasurer also gets selector rights
    const canDivisionRecommend = persona && persona.id === "division-secretary";
    const canMPCAValidate = persona && persona.id === "president" && persona.body_code === "MPCA";

    const updateFunnel = (u) => setFunnels((prev) => prev.map((x) => x.id === u.id ? u : x));

    const handleDivisionRec = async (f) => {
        try {
            const u = await divisionRecommendFunnel(f.id, { actor_name: persona.name });
            updateFunnel(u);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const handleMPCAVal = async (f) => {
        try {
            const u = await mpcaValidateFunnel(f.id, { actor_name: persona.name });
            updateFunnel(u);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const handleBCCISubmit = async (f) => {
        const ref = window.prompt("BCCI submission reference (leave blank to auto-generate):");
        try {
            const u = await submitFunnelToBCCI(f.id, { actor_name: persona.name, bcci_submission_ref: ref || null });
            updateFunnel(u);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const handleDelete = async (f) => {
        if (!window.confirm(`Delete funnel ${f.funnel_no}?`)) return;
        try { await deleteSelectionFunnel(f.id); reload(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    return (
        <div className="space-y-8" data-testid="selection-funnel-page">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <div className="overline">Operations · Player Selection</div>
                    <h1 className="font-serif text-4xl text-mpca-navy mt-1">Selection Funnel</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Per-tournament 4-stage selection: <strong>LongList (150) → ShortList (30) → Pool (20) → Squad (12)</strong>. International tournaments require <strong>Division → MPCA validation</strong> before BCCI submission.
                    </p>
                </div>
                {canCreate && (
                    <button onClick={() => setNewOpen(true)} className="btn-heritage-primary flex items-center gap-2" data-testid="new-funnel-btn">
                        <Plus className="w-4 h-4" /> Open New Funnel
                    </button>
                )}
            </div>

            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="border-l-4 border-mpca-navy bg-mpca-cream/70 p-3">
                        <div className="overline">Total Funnels</div>
                        <div className="font-serif text-3xl text-mpca-navy mt-1" data-testid="stat-total-funnels">{stats.total_funnels}</div>
                    </div>
                    {STAGES.slice(0, 4).map((s) => (
                        <div key={s} className="border-l-4 border-mpca-brass bg-mpca-cream/70 p-3">
                            <div className="overline">{s}</div>
                            <div className="font-serif text-2xl text-mpca-navy mt-1" data-testid={`stat-stage-${s}`}>{stats.by_stage[s] || 0}</div>
                        </div>
                    ))}
                </div>
            )}

            {loading ? (
                <CricketLoader label="Loading funnels…" />
            ) : funnels.length === 0 ? (
                <div className="text-center py-16 text-mpca-gray-dark" data-testid="empty-funnels">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    No selection funnels yet.
                </div>
            ) : (
                <div className="space-y-3">
                    {funnels.map((f) => {
                        const isOpen = expandedId === f.id;
                        const stageMeta = STAGE_META[f.current_stage] || { label: f.current_stage, tone: "lapsed" };
                        const stageCounts = STAGES.reduce((acc, s) => ({ ...acc, [s]: (f.entries || []).filter((e) => e.stage === s).length }), {});
                        const cur = f.current_stage;
                        return (
                            <div key={f.id} className="border border-mpca-brass/40 bg-mpca-ivory" data-testid={`funnel-${f.id}`}>
                                <button onClick={() => setExpandedId(isOpen ? null : f.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-mpca-cream/40">
                                    <Award className="w-7 h-7 text-mpca-navy shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="overline">{f.funnel_no}</span>
                                            <Pill tone={stageMeta.tone} label={stageMeta.label} testId={`funnel-stage-${f.id}`} />
                                            {f.is_international && (
                                                <span className="px-1.5 py-0.5 bg-mpca-saffron/10 text-mpca-saffron text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1" data-testid={`intl-${f.id}`}>
                                                    <Globe className="w-3 h-3" /> International
                                                </span>
                                            )}
                                            <span className="text-xs text-mpca-gray-dark">{(f.format || "").replace(/_/g, " ")} · {f.season_year}</span>
                                        </div>
                                        <div className="font-serif text-lg text-mpca-navy mt-1 truncate">{f.tournament_name}</div>
                                        <div className="text-xs text-mpca-gray-dark mt-1">
                                            Pipeline: {STAGES.slice(0, 4).map((s) => `${s} ${stageCounts[s] || 0}`).join(" · ")}
                                        </div>
                                    </div>
                                    <ChevronRight className={"w-5 h-5 text-mpca-gray-dark transition-transform " + (isOpen ? "rotate-90" : "")} />
                                </button>
                                {isOpen && (
                                    <div className="border-t border-mpca-brass/30 p-4 space-y-4 bg-mpca-cream/30">
                                        {/* Stage pipeline bar */}
                                        <div className="flex items-center gap-2">
                                            {STAGES.slice(0, 4).map((s, i) => (
                                                <div key={s} className="flex-1">
                                                    <div className={"text-[10px] uppercase tracking-wider font-semibold mb-1 " + (s === f.current_stage ? "text-mpca-oxblood" : "text-mpca-gray-dark")}>
                                                        {s} · {stageCounts[s] || 0} / {STAGE_LIMITS[s]}
                                                    </div>
                                                    <div className={"h-2 " + (s === f.current_stage ? "bg-mpca-oxblood" : ((stageCounts[s] || 0) > 0 ? "bg-mpca-green-dark/40" : "bg-mpca-brass/20"))} />
                                                </div>
                                            ))}
                                        </div>

                                        {/* International workflow status */}
                                        {f.is_international && (
                                            <div className="bg-mpca-cream border-l-4 border-mpca-saffron p-3 text-xs space-y-1" data-testid={`intl-status-${f.id}`}>
                                                <div className="font-serif font-semibold text-mpca-navy">International Squad Workflow</div>
                                                <div>{f.division_recommended_at ? "✓" : "○"} Division recommended {f.division_recommended_by && `by ${f.division_recommended_by}`}</div>
                                                <div>{f.mpca_validated_at ? "✓" : "○"} MPCA validated {f.mpca_validated_by && `by ${f.mpca_validated_by}`}</div>
                                                <div>{f.bcci_submitted_at ? "✓" : "○"} Submitted to BCCI {f.bcci_submission_ref && <code className="text-mpca-saffron">{f.bcci_submission_ref}</code>}</div>
                                            </div>
                                        )}

                                        {/* Players at current stage */}
                                        {cur !== "Submitted" && (
                                            <div>
                                                <div className="overline mb-2">{cur} · Players ({stageCounts[cur] || 0})</div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                                    {(f.entries || []).filter((e) => e.stage === cur).map((e) => (
                                                        <div key={e.player_id} className="text-xs border border-mpca-brass/30 bg-mpca-ivory p-2 flex items-center gap-2" data-testid={`entry-${f.id}-${e.player_id}`}>
                                                            <Trophy className="w-3 h-3 text-mpca-saffron shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-semibold text-mpca-navy truncate">{e.player_name || "—"}</div>
                                                                <div className="text-mpca-gray-dark text-[10px]">{(e.role || "—").replace(/_/g, " ")} {e.age ? `· age ${e.age}` : ""}</div>
                                                            </div>
                                                            {canSelect && (
                                                                <button onClick={async () => {
                                                                    try { const u = await removePlayerFromFunnel(f.id, { player_id: e.player_id, actor_name: persona.name }); updateFunnel(u); }
                                                                    catch (err) { alert(err?.response?.data?.detail || err.message); }
                                                                }} className="text-mpca-oxblood" data-testid={`rm-entry-${e.player_id}`}>
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Action bar */}
                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-mpca-brass/30">
                                            {cur !== "Submitted" && canSelect && (
                                                <button onClick={() => setAddPlayersFor(f)} className="btn-heritage-ghost text-xs px-3 py-1 flex items-center gap-1" data-testid={`add-players-${f.id}`}>
                                                    <Plus className="w-3 h-3" /> Add Players to {cur}
                                                </button>
                                            )}
                                            {["LongList", "ShortList", "Pool"].includes(cur) && canSelect && (
                                                <button onClick={() => setAdvanceFor(f)} className="btn-heritage-primary text-xs px-3 py-1 flex items-center gap-1" data-testid={`advance-${f.id}`}>
                                                    <ArrowRight className="w-3 h-3" /> Advance to {STAGE_META[STAGES[STAGES.indexOf(cur) + 1]].label.split(" ·")[0]}
                                                </button>
                                            )}
                                            {cur === "Squad" && f.is_international && !f.division_recommended_at && canDivisionRecommend && (
                                                <button onClick={() => handleDivisionRec(f)} className="btn-heritage-primary text-xs px-3 py-1 flex items-center gap-1" data-testid={`div-rec-${f.id}`}>
                                                    <Send className="w-3 h-3" /> Recommend to MPCA
                                                </button>
                                            )}
                                            {cur === "Squad" && f.is_international && f.division_recommended_at && !f.mpca_validated_at && canMPCAValidate && (
                                                <button onClick={() => handleMPCAVal(f)} className="btn-heritage-primary text-xs px-3 py-1 flex items-center gap-1" data-testid={`mpca-val-${f.id}`}>
                                                    <CheckCircle2 className="w-3 h-3" /> Validate as MPCA
                                                </button>
                                            )}
                                            {cur === "Squad" && (!f.is_international || f.mpca_validated_at) && canCreate && (
                                                <button onClick={() => handleBCCISubmit(f)} className="btn-heritage-primary text-xs px-3 py-1 flex items-center gap-1" data-testid={`submit-bcci-${f.id}`}>
                                                    <Sparkles className="w-3 h-3" /> Submit to BCCI App
                                                </button>
                                            )}
                                            {cur !== "Submitted" && canCreate && (
                                                <button onClick={() => handleDelete(f)} className="btn-heritage-ghost text-xs px-3 py-1 flex items-center gap-1 ml-auto text-mpca-oxblood" data-testid={`del-funnel-${f.id}`}>
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                        {f.notes && (
                                            <div className="text-xs text-mpca-gray-dark italic">{f.notes}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <NewFunnelDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); reload(); }} persona={persona || {}} />
            {addPlayersFor && (
                <AddPlayersDialog
                    funnel={addPlayersFor}
                    currentStage={addPlayersFor.current_stage}
                    persona={persona || {}}
                    onClose={() => setAddPlayersFor(null)}
                    onDone={updateFunnel}
                />
            )}
            {advanceFor && (
                <AdvanceDialog
                    funnel={advanceFor}
                    persona={persona || {}}
                    onClose={() => setAdvanceFor(null)}
                    onDone={updateFunnel}
                />
            )}
        </div>
    );
}
