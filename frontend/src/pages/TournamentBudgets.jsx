import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchTournamentBudgets, fetchTournamentBudgetStats,
    fetchTournaments, fetchBodies,
    createTournamentBudget, submitTournamentBudget,
    approveTournamentBudget, returnTournamentBudget, rejectTournamentBudget,
    deleteTournamentBudget, addVariableItem, decideVariableItem,
} from "@/lib/api";
import {
    Wallet, Plus, ChevronRight, CheckCircle2, RotateCcw, XCircle, Trash2,
    Send, X, Sparkles, Trophy, Building2,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const HEADS = [
    { id: "Travel", label: "Travel" },
    { id: "Hotel", label: "Hotel / Accommodation" },
    { id: "Road_BLP_Lunch_Rain", label: "Road · BLP + Lunch + Rain" },
    { id: "TA_DA", label: "TA / DA" },
    { id: "Match_Officials", label: "Match Officials Fees" },
    { id: "Equipment", label: "Equipment" },
    { id: "Ground_Expenses", label: "Ground Expenses" },
    { id: "Miscellaneous", label: "Miscellaneous" },
];

const STATUS_META = {
    Draft:     { label: "Draft",     tone: "lapsed" },
    Submitted: { label: "Submitted", tone: "pending" },
    Approved:  { label: "Approved",  tone: "active" },
    Returned:  { label: "Returned",  tone: "suspended" },
    Rejected:  { label: "Rejected",  tone: "suspended" },
};

const RETURN_CODES = [
    { code: "DOCS_MISSING",     label: "Supporting documents missing" },
    { code: "OVER_BUDGET",      label: "Total exceeds available pool / scheme" },
    { code: "HEAD_MIX_INVALID", label: "Head sub-limit allocation needs revision" },
    { code: "SCHEME_MISMATCH",  label: "Tournament format not matching scheme" },
    { code: "OTHER",            label: "Other (see notes)" },
];

const Pill = ({ tone, label, testId }) => (
    <span className={"pill pill-" + tone} data-testid={testId}>{label}</span>
);

// ────────── New Budget Dialog ──────────
const NewBudgetDialog = ({ open, persona, onClose, onCreated }) => {
    const [tournaments, setTournaments] = useState([]);
    const [bodies, setBodies] = useState([]);
    const [form, setForm] = useState({
        tournament_id: "", body_id: "", total_ceiling_inr: "",
        fiscal_cycle: (typeof window !== "undefined" && window.__mpca_season) || "2026-27", notes: "",
    });
    const [heads, setHeads] = useState(HEADS.map((h) => ({ ...h, limit: "" })));
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        Promise.all([fetchTournaments(), fetchBodies({ body_type: "Division" })])
            .then(([t, b]) => { setTournaments(t); setBodies(b); })
            .catch(() => {});
        if (persona?.body_code && persona.body_code !== "MPCA") {
            setForm((f) => ({ ...f, body_id: persona.body_code }));
        }
    }, [open, persona]);

    if (!open) return null;

    const sumHeads = heads.reduce((s, h) => s + (parseFloat(h.limit) || 0), 0);
    const total = parseFloat(form.total_ceiling_inr) || 0;
    const excess = sumHeads > total;

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = {
                tournament_id: form.tournament_id,
                body_id: form.body_id,
                fiscal_cycle: form.fiscal_cycle,
                total_ceiling_inr: total,
                notes: form.notes.trim() || null,
                head_allocations: heads
                    .filter((h) => parseFloat(h.limit) > 0)
                    .map((h) => ({ head: h.id, limit_inr: parseFloat(h.limit) })),
                variable_items: [],
                created_by: persona.name,
            };
            const b = await createTournamentBudget(payload);
            onCreated(b);
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="new-budget-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between sticky top-0 z-10">
                    <div>
                        <div className="overline !text-mpca-gold-light">Auto-Budget · New</div>
                        <div className="font-serif text-2xl mt-1">Propose Tournament Budget</div>
                    </div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Tournament *</label>
                            <select required value={form.tournament_id} onChange={(e) => setForm((f) => ({ ...f, tournament_id: e.target.value }))} className="input-heritage" data-testid="tb-tournament">
                                <option value="">— Choose —</option>
                                {tournaments.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name} · {t.format}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Division (Body) *</label>
                            <select required value={form.body_id} onChange={(e) => setForm((f) => ({ ...f, body_id: e.target.value }))} className="input-heritage" data-testid="tb-body">
                                <option value="">— Choose —</option>
                                {bodies.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Total Ceiling (₹) *</label>
                        <input required type="number" min="1" value={form.total_ceiling_inr} onChange={(e) => setForm((f) => ({ ...f, total_ceiling_inr: e.target.value }))} className="input-heritage" data-testid="tb-total" />
                    </div>
                    <div className="border-t border-mpca-brass/30 pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="font-serif text-lg text-mpca-navy">Head-Under Sub-Limits</h4>
                            <div className={"text-xs " + (excess ? "text-mpca-oxblood font-semibold" : "text-mpca-gray-dark")}>
                                Allocated: {fmtINR(sumHeads)} / {fmtINR(total)} {excess && "⚠ over budget"}
                            </div>
                        </div>
                        <div className="space-y-2">
                            {heads.map((h, idx) => (
                                <div key={h.id} className="flex items-center gap-3">
                                    <label className="text-sm w-56 text-mpca-gray-dark">{h.label}</label>
                                    <input type="number" min="0" step="100" value={h.limit} onChange={(e) => {
                                        const v = e.target.value;
                                        setHeads((prev) => prev.map((p, i) => i === idx ? { ...p, limit: v } : p));
                                    }} className="input-heritage flex-1" data-testid={`tb-head-${h.id}`} placeholder="0" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Notes</label>
                        <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-heritage" placeholder="Scheme reference, justification, etc." />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy || excess || !form.tournament_id || !form.body_id || !form.total_ceiling_inr} className="btn-heritage-primary" data-testid="tb-save">
                        {busy ? "Saving…" : "Save as Draft"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ────────── Approval Dialog (also lets MPCA revise total + heads) ──────────
const ApproveDialog = ({ budget, persona, onClose, onDone }) => {
    const [approvedTotal, setApprovedTotal] = useState(budget?.total_ceiling_inr || 0);
    const [headOverrides, setHeadOverrides] = useState(
        (budget?.head_allocations || []).map((h) => ({ ...h, approved: h.limit_inr })),
    );
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    if (!budget) return null;
    const sumApproved = headOverrides.reduce((s, h) => s + (parseFloat(h.approved) || 0), 0);
    const excess = sumApproved > approvedTotal;

    const submit = async () => {
        setBusy(true);
        try {
            const updated = await approveTournamentBudget(budget.id, {
                actor_post: persona.post,
                actor_name: persona.name,
                actor_body_id: persona.body_code || "MPCA",
                notes: notes.trim() || null,
                approved_total_inr: parseFloat(approvedTotal),
                approved_head_allocations: headOverrides.map((h) => ({ head: h.head, limit_inr: parseFloat(h.approved) || 0 })),
            });
            onDone(updated);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="approve-dialog">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                    <div>
                        <div className="overline !text-mpca-gold-light">{budget.budget_no}</div>
                        <div className="font-serif text-2xl mt-1">Approve Tournament Budget</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-mpca-cream border-l-4 border-mpca-gold-light p-3 text-sm">
                        <div><span className="overline mr-2">Proposed Total</span><strong>{fmtINR(budget.total_ceiling_inr)}</strong></div>
                        <div className="mt-1"><span className="overline mr-2">By</span> {budget.body_name}</div>
                    </div>
                    <div>
                        <label className="label-heritage">Approved Total (₹) *</label>
                        <input type="number" min="0" max={budget.total_ceiling_inr} value={approvedTotal} onChange={(e) => setApprovedTotal(e.target.value)} className="input-heritage" data-testid="approved-total" />
                        <div className="text-xs text-mpca-gray-dark mt-1">May approve ≤ proposed; not above.</div>
                    </div>
                    <div className="border-t border-mpca-brass/30 pt-4">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-serif text-sm text-mpca-navy">Approved Head Limits</h4>
                            <div className={"text-xs " + (excess ? "text-mpca-oxblood font-semibold" : "text-mpca-gray-dark")}>
                                {fmtINR(sumApproved)} / {fmtINR(approvedTotal)}
                            </div>
                        </div>
                        {headOverrides.map((h, idx) => (
                            <div key={h.head} className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs w-44 text-mpca-gray-dark">{HEADS.find((x) => x.id === h.head)?.label || h.head}</span>
                                <span className="text-[10px] text-mpca-gray-dark line-through w-20 text-right">{fmtINR(h.limit_inr)}</span>
                                <input type="number" min="0" value={h.approved} onChange={(e) => {
                                    const v = e.target.value;
                                    setHeadOverrides((prev) => prev.map((p, i) => i === idx ? { ...p, approved: v } : p));
                                }} className="input-heritage flex-1 text-sm" data-testid={`head-override-${h.head}`} />
                            </div>
                        ))}
                    </div>
                    <div>
                        <label className="label-heritage">Notes</label>
                        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-heritage" data-testid="approve-notes" />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40 sticky bottom-0">
                    <button onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button onClick={submit} disabled={busy || excess} className="btn-heritage-primary" data-testid="approve-confirm">
                        {busy ? "Approving…" : "Approve"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ────────── Generic action dialog (submit / return / reject) ──────────
const SimpleActionDialog = ({ budget, action, persona, onClose, onDone }) => {
    const [notes, setNotes] = useState("");
    const [returnCode, setReturnCode] = useState("DOCS_MISSING");
    const [busy, setBusy] = useState(false);
    if (!budget || !action) return null;
    const META = {
        submit: { title: "Submit to MPCA",   verb: "Submit",  color: "primary" },
        ret:    { title: "Return for Revision", verb: "Return", color: "secondary" },
        reject: { title: "Reject Budget",    verb: "Reject",  color: "secondary" },
    }[action];

    const handle = async () => {
        setBusy(true);
        try {
            const payload = {
                actor_post: persona.post,
                actor_name: persona.name,
                actor_body_id: persona.body_code || "MPCA",
                notes: notes.trim() || null,
            };
            if (action === "ret") {
                payload.return_reason_code = returnCode;
                payload.return_reason_detail = notes.trim() || null;
            }
            const fn = { submit: submitTournamentBudget, ret: returnTournamentBudget, reject: rejectTournamentBudget }[action];
            const updated = await fn(budget.id, payload);
            onDone(updated);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid={`tb-action-${action}`}>
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-md w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">{budget.budget_no}</div>
                        <div className="font-serif text-2xl mt-1">{META.title}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    {action === "ret" && (
                        <div>
                            <label className="label-heritage">Reason Code *</label>
                            <select value={returnCode} onChange={(e) => setReturnCode(e.target.value)} className="input-heritage">
                                {RETURN_CODES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="label-heritage">{action === "ret" ? "Details" : "Notes"}</label>
                        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-heritage" data-testid="tb-action-notes" />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button onClick={handle} disabled={busy} className={`btn-heritage-${META.color}`} data-testid="tb-action-confirm">
                        {busy ? "Working…" : META.verb}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ────────── Variable item add + decide inline ──────────
const VariableItemRow = ({ item, budget, persona, canDecide, onChange }) => {
    const [busy, setBusy] = useState(false);
    const handle = async (decision) => {
        setBusy(true);
        try {
            const updated = await decideVariableItem(budget.id, item.id, {
                decision,
                approved_amount_inr: decision === "Approved" ? item.proposed_amount_inr : null,
                decided_by: persona.name,
                decision_notes: null,
            });
            onChange(updated);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };
    const tone = item.status === "Approved" ? "active" : item.status === "Rejected" ? "suspended" : "pending";
    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-3 flex items-center gap-3" data-testid={`var-item-${item.id}`}>
            <Sparkles className="w-4 h-4 text-mpca-saffron shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="text-sm text-mpca-navy">{item.description}</div>
                <div className="text-xs text-mpca-gray-dark">
                    {item.head ? <span className="mr-2">Head: {item.head}</span> : null}
                    Proposed: <strong>{fmtINR(item.proposed_amount_inr)}</strong>
                    {item.approved_amount_inr ? <span> · Approved: <strong>{fmtINR(item.approved_amount_inr)}</strong></span> : null}
                    {item.decided_by ? <span> · by {item.decided_by}</span> : null}
                </div>
            </div>
            <Pill tone={tone} label={item.status} testId={`var-status-${item.id}`} />
            {item.status === "Pending" && canDecide && (
                <div className="flex gap-1">
                    <button onClick={() => handle("Approved")} disabled={busy} className="btn-heritage-ghost text-xs px-2 py-1 text-mpca-green-dark" data-testid={`var-approve-${item.id}`}>
                        ✓ Approve
                    </button>
                    <button onClick={() => handle("Rejected")} disabled={busy} className="btn-heritage-ghost text-xs px-2 py-1 text-mpca-oxblood" data-testid={`var-reject-${item.id}`}>
                        ✕ Reject
                    </button>
                </div>
            )}
        </div>
    );
};

const AddVariableInline = ({ budget, persona, onChange, allowed }) => {
    const [desc, setDesc] = useState("");
    const [amt, setAmt] = useState("");
    const [head, setHead] = useState("");
    const [busy, setBusy] = useState(false);
    if (!allowed) return null;
    const handle = async () => {
        setBusy(true);
        try {
            const updated = await addVariableItem(budget.id, {
                description: desc.trim(),
                proposed_amount_inr: parseFloat(amt),
                head: head || null,
                status: "Pending",
            });
            onChange(updated);
            setDesc(""); setAmt(""); setHead("");
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="border-2 border-dashed border-mpca-brass/40 p-3 flex flex-wrap gap-2 items-end" data-testid="add-variable-row">
            <div className="flex-1 min-w-[200px]">
                <label className="label-heritage">Variable Item Description</label>
                <input value={desc} onChange={(e) => setDesc(e.target.value)} className="input-heritage" placeholder="e.g. Emergency physio fee" data-testid="var-desc" />
            </div>
            <div className="w-32">
                <label className="label-heritage">Amount (₹)</label>
                <input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} className="input-heritage" data-testid="var-amount" />
            </div>
            <div className="w-44">
                <label className="label-heritage">Head (optional)</label>
                <select value={head} onChange={(e) => setHead(e.target.value)} className="input-heritage" data-testid="var-head">
                    <option value="">—</option>
                    {HEADS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                </select>
            </div>
            <button onClick={handle} disabled={!desc.trim() || !amt || busy} className="btn-heritage-primary text-xs px-3 py-2" data-testid="var-add">
                <Plus className="w-3 h-3 inline" /> Add Variable
            </button>
        </div>
    );
};

// ────────── Main page ──────────
export default function TournamentBudgets() {
    const { persona } = useAuth();
    const [list, setList] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("All");
    const [newOpen, setNewOpen] = useState(false);
    const [approveTarget, setApproveTarget] = useState(null);
    const [action, setAction] = useState({ budget: null, kind: null });
    const [expanded, setExpanded] = useState({});

    const reload = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterStatus !== "All") params.status = filterStatus;
            const [docs, s] = await Promise.all([fetchTournamentBudgets(params), fetchTournamentBudgetStats()]);
            setList(docs);
            setStats(s);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [filterStatus]);

    const canCreate = persona && ["division-secretary", "secretary", "treasurer", "president"].includes(persona.id);
    const canApproveBudget = persona && persona.id === "treasurer" && persona.body_code === "MPCA";
    const canDecideVars = canApproveBudget;

    const handleDelete = async (b) => {
        if (!window.confirm(`Delete budget ${b.budget_no}?`)) return;
        try { await deleteTournamentBudget(b.id); reload(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const updateLocal = (updated) => {
        setList((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    };

    const actions = (b) => {
        const out = [];
        const isOriginator = persona && (b.created_by === persona.name || b.body_id === persona.body_code);
        if (b.status === "Draft" && (isOriginator || canCreate)) {
            out.push(
                <button key="sub" onClick={() => setAction({ budget: b, kind: "submit" })} className="btn-heritage-primary text-xs px-3 py-1 flex items-center gap-1" data-testid={`tb-submit-${b.id}`}>
                    <Send className="w-3 h-3" /> Submit
                </button>
            );
            out.push(
                <button key="del" onClick={() => handleDelete(b)} className="btn-heritage-ghost text-xs px-3 py-1 flex items-center gap-1" data-testid={`tb-delete-${b.id}`}>
                    <Trash2 className="w-3 h-3" />
                </button>
            );
        }
        if (b.status === "Returned" && (isOriginator || canCreate)) {
            out.push(
                <button key="resub" onClick={() => setAction({ budget: b, kind: "submit" })} className="btn-heritage-primary text-xs px-3 py-1 flex items-center gap-1" data-testid={`tb-resubmit-${b.id}`}>
                    <RotateCcw className="w-3 h-3" /> Re-Submit
                </button>
            );
        }
        if (b.status === "Submitted" && canApproveBudget) {
            out.push(
                <button key="appr" onClick={() => setApproveTarget(b)} className="btn-heritage-primary text-xs px-3 py-1 flex items-center gap-1" data-testid={`tb-approve-${b.id}`}>
                    <CheckCircle2 className="w-3 h-3" /> Approve
                </button>
            );
            out.push(
                <button key="ret" onClick={() => setAction({ budget: b, kind: "ret" })} className="btn-heritage-secondary text-xs px-3 py-1 flex items-center gap-1" data-testid={`tb-return-${b.id}`}>
                    <RotateCcw className="w-3 h-3" /> Return
                </button>
            );
            out.push(
                <button key="rej" onClick={() => setAction({ budget: b, kind: "reject" })} className="btn-heritage-ghost text-xs px-3 py-1 flex items-center gap-1 text-mpca-oxblood" data-testid={`tb-reject-${b.id}`}>
                    <XCircle className="w-3 h-3" /> Reject
                </button>
            );
        }
        return out;
    };

    const pendingVarCount = useMemo(() => list.reduce((s, b) => s + (b.variable_items || []).filter((v) => v.status === "Pending").length, 0), [list]);

    return (
        <div className="space-y-8" data-testid="tournament-budgets-page">
            <div className="flex items-center justify-between">
                <div>
                    <div className="overline">Financial · Auto-Budget</div>
                    <h1 className="font-serif text-4xl text-mpca-navy mt-1">Tournament Budgets</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Per-tournament budget envelopes proposed by Divisions and approved by MPCA. Each budget has a <strong>Total ceiling</strong>, <strong>Head-Under sub-limits</strong>, and <strong>Variable line items</strong> that MPCA can approve case-by-case.
                    </p>
                </div>
                {canCreate && (
                    <button onClick={() => setNewOpen(true)} className="btn-heritage-primary flex items-center gap-2" data-testid="new-budget-btn">
                        <Plus className="w-4 h-4" /> Propose Budget
                    </button>
                )}
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="border-l-4 border-mpca-navy bg-mpca-cream/70 p-4">
                        <div className="overline">Total Budgets</div>
                        <div className="font-serif text-3xl text-mpca-navy mt-1" data-testid="stat-total">{stats.total_budgets}</div>
                    </div>
                    <div className="border-l-4 border-mpca-saffron bg-mpca-cream/70 p-4">
                        <div className="overline">Proposed</div>
                        <div className="font-serif text-xl text-mpca-saffron mt-1" data-testid="stat-proposed">{fmtINR(stats.proposed_inr)}</div>
                    </div>
                    <div className="border-l-4 border-mpca-green-dark bg-mpca-cream/70 p-4">
                        <div className="overline">Approved</div>
                        <div className="font-serif text-xl text-mpca-green-dark mt-1" data-testid="stat-approved">{fmtINR(stats.approved_inr)}</div>
                        <div className="text-xs text-mpca-gray-dark mt-1">{stats.approved_budgets} approved</div>
                    </div>
                    <div className="border-l-4 border-mpca-brass bg-mpca-cream/70 p-4">
                        <div className="overline">Pending</div>
                        <div className="font-serif text-3xl text-mpca-navy mt-1" data-testid="stat-pending">{stats.pending_budgets}</div>
                    </div>
                    <div className="border-l-4 border-mpca-gold-light bg-mpca-cream/70 p-4">
                        <div className="overline">Variable · Pending</div>
                        <div className="font-serif text-3xl text-mpca-saffron mt-1" data-testid="stat-var-pending">{pendingVarCount}</div>
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className="flex items-end gap-4 border-b border-mpca-brass/30 pb-4">
                <div>
                    <label className="label-heritage">Status</label>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-heritage" data-testid="tb-filter-status">
                        <option value="All">All</option>
                        {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            {loading ? (
                <CricketLoader label="Loading budgets…" />
            ) : list.length === 0 ? (
                <div className="text-center py-16 text-mpca-gray-dark" data-testid="empty-budgets">
                    <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    No tournament budgets yet.
                </div>
            ) : (
                <div className="space-y-3">
                    {list.map((b) => {
                        const meta = STATUS_META[b.status] || { label: b.status, tone: "lapsed" };
                        const isOpen = expanded[b.id];
                        return (
                            <div key={b.id} className="border border-mpca-brass/40 bg-mpca-ivory" data-testid={`budget-${b.id}`}>
                                <button onClick={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))} className="w-full flex items-center gap-4 p-4 text-left hover:bg-mpca-cream/40 transition-colors">
                                    <Trophy className="w-7 h-7 text-mpca-navy shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="overline">{b.budget_no}</span>
                                            <Pill tone={meta.tone} label={meta.label} testId={`tb-status-${b.id}`} />
                                            <span className="text-xs text-mpca-gray-dark flex items-center gap-1"><Building2 className="w-3 h-3" /> {b.body_name}</span>
                                        </div>
                                        <div className="font-serif text-lg text-mpca-navy mt-1 truncate">{b.tournament_name}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        {b.approved_total_inr ? (
                                            <>
                                                <div className="font-serif text-xl text-mpca-green-dark" data-testid={`tb-amount-${b.id}`}>{fmtINR(b.approved_total_inr)}</div>
                                                <div className="text-[10px] text-mpca-gray-dark line-through">{fmtINR(b.total_ceiling_inr)}</div>
                                            </>
                                        ) : (
                                            <div className="font-serif text-xl text-mpca-navy">{fmtINR(b.total_ceiling_inr)}</div>
                                        )}
                                    </div>
                                    <ChevronRight className={"w-5 h-5 text-mpca-gray-dark transition-transform " + (isOpen ? "rotate-90" : "")} />
                                </button>
                                {isOpen && (
                                    <div className="border-t border-mpca-brass/30 p-4 space-y-4 bg-mpca-cream/30">
                                        {/* Head Limits comparison */}
                                        <div>
                                            <div className="overline mb-2">Head-Under Sub-Limits</div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm">
                                                {(b.head_allocations || []).map((h) => {
                                                    const approved = (b.approved_head_allocations || []).find((x) => x.head === h.head);
                                                    return (
                                                        <div key={h.head} className="flex items-center justify-between border-b border-mpca-brass/20 py-1">
                                                            <span className="text-mpca-gray-dark text-xs">{HEADS.find((x) => x.id === h.head)?.label || h.head}</span>
                                                            <span className="font-mono text-xs">
                                                                {approved ? (
                                                                    <>
                                                                        <span className="text-mpca-green-dark font-semibold">{fmtINR(approved.limit_inr)}</span>
                                                                        {" / "}
                                                                        <span className="text-mpca-gray-dark line-through">{fmtINR(h.limit_inr)}</span>
                                                                    </>
                                                                ) : fmtINR(h.limit_inr)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Variable Items */}
                                        <div>
                                            <div className="overline mb-2">Variable Line Items ({(b.variable_items || []).length})</div>
                                            <div className="space-y-2">
                                                {(b.variable_items || []).map((v) => (
                                                    <VariableItemRow key={v.id} item={v} budget={b} persona={persona} canDecide={canDecideVars && b.status !== "Rejected"} onChange={updateLocal} />
                                                ))}
                                                {b.status !== "Rejected" && (
                                                    <AddVariableInline budget={b} persona={persona} allowed={canCreate || canDecideVars} onChange={updateLocal} />
                                                )}
                                            </div>
                                        </div>

                                        {b.return_reason_code && (
                                            <div className="bg-mpca-oxblood/10 border-l-2 border-mpca-oxblood text-mpca-oxblood text-xs p-2">
                                                <strong>Returned for:</strong> {b.return_reason_code}
                                                {b.return_reason_detail && <div className="mt-1">{b.return_reason_detail}</div>}
                                            </div>
                                        )}
                                        {b.notes && (
                                            <div className="text-xs text-mpca-gray-dark italic">{b.notes}</div>
                                        )}

                                        {/* Approval Trail */}
                                        {b.approval_chain?.length > 0 && (
                                            <div>
                                                <div className="overline mb-2">Approval Trail</div>
                                                <ol className="space-y-1">
                                                    {b.approval_chain.map((s, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-xs text-mpca-gray-dark">
                                                            <span className="text-mpca-saffron">●</span>
                                                            <span><strong>{s.stage}</strong> · {s.actor_post}{s.actor_name && ` (${s.actor_name})`} · {fmtDate(s.timestamp)}{s.notes && <span className="block italic mt-0.5">{s.notes}</span>}</span>
                                                        </li>
                                                    ))}
                                                </ol>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-mpca-brass/30">
                                            {actions(b)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <NewBudgetDialog open={newOpen} persona={persona || {}} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); reload(); }} />
            <ApproveDialog budget={approveTarget} persona={persona || {}} onClose={() => setApproveTarget(null)} onDone={() => reload()} />
            <SimpleActionDialog budget={action.budget} action={action.kind} persona={persona || {}} onClose={() => setAction({ budget: null, kind: null })} onDone={() => reload()} />
        </div>
    );
}
