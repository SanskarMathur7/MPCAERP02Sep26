/**
 * DivisionGrants page · Sprint 1 · P3.1
 * Full end-to-end 3-step Division Grant workflow:
 *   Division · Request  →  State Finance · Review  →  State Secretary · Approve  →  Disburse (auto-voucher)
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchDivisionGrants, createDivisionGrant, grantAction, fetchDivisionGrantStats,
} from "@/lib/api";
import {
    HandCoins, Plus, Filter, X, Send, CheckCircle2, RotateCcw, Ban, ArrowRight,
    CircleDollarSign, TrendingUp, Inbox, AlertTriangle, ChevronRight, Building2,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const STATUS_STYLE = {
    Draft:              { bg: "bg-mpca-brass/10",     tx: "text-mpca-brass",       label: "Draft" },
    Submitted:          { bg: "bg-mpca-navy/10",      tx: "text-mpca-navy",        label: "Submitted" },
    Finance_Reviewed:   { bg: "bg-mpca-gold-light/20",tx: "text-mpca-gold-dark",   label: "Finance Reviewed" },
    Approved:           { bg: "bg-mpca-green-deep/10",tx: "text-mpca-green-deep",  label: "Approved" },
    Disbursed:          { bg: "bg-mpca-green-dark/20",tx: "text-mpca-green-dark",  label: "Disbursed" },
    Sent_Back:          { bg: "bg-mpca-oxblood/10",   tx: "text-mpca-oxblood",     label: "Sent Back" },
    Rejected:           { bg: "bg-mpca-oxblood/20",   tx: "text-mpca-oxblood",     label: "Rejected" },
};

const CATEGORY_OPTIONS = [
    "Admin_Grant", "Coaching_Grant", "Tournament_Funding",
    "District_Travel", "MRA_Management", "Infrastructure", "Other",
];

const STAGE_ORDER = ["Division_Request", "Finance_Review", "Secretary_Approve", "Disbursed"];
const STAGE_LABEL = {
    Division_Request:  "Division · Request",
    Finance_Review:    "State Finance · Review",
    Secretary_Approve: "State Secretary · Approve",
    Disbursed:         "Disbursed",
};

// Determine which action a given persona can take at the current stage
const canAct = (persona, grant) => {
    if (!persona || !grant) return {};
    const isState = persona.body_type === "State";
    const isDivision = persona.body_type === "Division";
    const acts = {};
    if (grant.status === "Draft" || grant.status === "Sent_Back") {
        if (isDivision && persona.body_code === grant.body_id) acts.submit = true;
    }
    if (grant.status === "Submitted" && isState) {
        // Finance Officer role — for demo, Treasurer + Secretary both count
        acts.finance_review = true;
        acts.send_back = true;
        acts.reject = true;
    }
    if (grant.status === "Finance_Reviewed" && isState) {
        acts.secretary_approve = true;
        acts.send_back = true;
        acts.reject = true;
    }
    if (grant.status === "Approved" && isState) {
        acts.disburse = true;
    }
    return acts;
};

const Timeline = ({ grant }) => {
    // status → current stage progress
    const chain = grant.approval_chain || [];
    const idx = STAGE_ORDER.indexOf(grant.current_stage);
    return (
        <div className="pt-2" data-testid="grant-timeline">
            <div className="grid grid-cols-4 gap-2 mb-4">
                {STAGE_ORDER.map((s, i) => {
                    const done = i < idx || grant.status === "Disbursed";
                    const active = i === idx;
                    return (
                        <div key={s} className="flex flex-col items-center text-center">
                            <div className={
                                "w-8 h-8 rounded-full border-2 flex items-center justify-center font-serif text-xs " +
                                (done ? "bg-mpca-green-deep border-mpca-green-deep text-white" :
                                 active ? "bg-mpca-brass/20 border-mpca-brass text-mpca-brass" :
                                          "bg-white border-mpca-brass/30 text-mpca-gray-dark")
                            }>
                                {done ? <CheckCircle2 size={14} /> : i + 1}
                            </div>
                            <div className="text-[9px] tracking-wider uppercase mt-1.5 text-mpca-gray-dark">{STAGE_LABEL[s]}</div>
                        </div>
                    );
                })}
            </div>
            {chain.length > 0 && (
                <div className="border-t border-mpca-brass/20 pt-3 space-y-2" data-testid="grant-chain">
                    {chain.map((c, i) => (
                        <div key={i} className="text-[11px] flex items-start gap-2">
                            <span className="font-mono text-mpca-brass uppercase w-16 flex-shrink-0">{c.action}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-mpca-charcoal">{c.actor_name} <span className="text-mpca-gray-dark">· {c.stage}</span></div>
                                {c.note && <div className="text-mpca-gray-dark italic mt-0.5">&ldquo;{c.note}&rdquo;</div>}
                            </div>
                            <span className="text-[9px] font-mono text-mpca-gray-dark flex-shrink-0">
                                {new Date(c.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const KpiTile = ({ label, value, sub, icon: Icon, testid }) => (
    <div className="bulletin-card p-5" data-testid={testid}>
        <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
        <div className="font-serif text-3xl text-mpca-green-dark leading-none">{value}</div>
        <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
        {sub && <div className="text-[10px] text-mpca-gray-dark mt-1">{sub}</div>}
    </div>
);

const DivisionGrants = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [actionOpen, setActionOpen] = useState(null); // {action, grant}
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [r, s] = await Promise.all([fetchDivisionGrants(), fetchDivisionGrantStats()]);
            setRows(r);
            setStats(s);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        let out = rows;
        if (filter === "my_scope") {
            if (persona?.body_type === "Division") out = out.filter(g => g.body_id === persona.body_code);
            if (persona?.body_type === "State") out = out.filter(g => g.status !== "Draft");
        } else if (filter !== "all") {
            out = out.filter(g => g.status === filter);
        }
        return out;
    }, [rows, filter, persona]);

    const handleAction = async (action, extra = {}) => {
        if (!actionOpen) return;
        setBusy(true);
        try {
            const payload = {
                actor_name: persona ? `${persona.honorific} ${persona.name}` : "Guest",
                actor_role: persona?.role_id || "viewer",
                actor_user_id: persona?.id,
                ...extra,
            };
            await grantAction(actionOpen.grant.id, action, payload);
            await load();
            setActionOpen(null);
        } catch (e) {
            alert("Action failed: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading division grants…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="division-grants-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><HandCoins size={12} /> Sprint 1 · Finance Rails</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Division Grants</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Three-step maker-checker: Division raises → State Finance reviews → State Secretary approves & disburses.
                        Disbursement auto-generates a Payment Voucher in the general ledger.
                    </p>
                </div>
                {persona?.body_type === "Division" && (
                    <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="new-grant-btn">
                        <Plus size={14} /> New Grant Request
                    </button>
                )}
            </div>

            <div className="crest-divider mb-8" />

            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Total Requests" value={stats.count || 0} icon={Inbox} testid="kpi-total" />
                    <KpiTile label="In Approval Chain" value={(stats.by_status?.Submitted || 0) + (stats.by_status?.Finance_Reviewed || 0) + (stats.by_status?.Approved || 0)} sub="Awaiting decision" icon={TrendingUp} testid="kpi-inflight" />
                    <KpiTile label="Total Disbursed" value={fmtINR(stats.total_disbursed_inr)} sub={`${stats.by_status?.Disbursed || 0} grants paid`} icon={CircleDollarSign} testid="kpi-disbursed" />
                    <KpiTile label="Needs Attention" value={stats.by_status?.Sent_Back || 0} sub="Sent-back grants" icon={AlertTriangle} testid="kpi-sentback" />
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-6" data-testid="grants-filters">
                <Filter size={12} className="text-mpca-brass" />
                {["all", "my_scope", "Draft", "Submitted", "Finance_Reviewed", "Approved", "Disbursed", "Sent_Back", "Rejected"].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        data-testid={`filter-${f}`}
                        className={"px-3 py-1 text-[10px] tracking-widest uppercase border transition-colors " +
                            (filter === f ? "bg-mpca-green-dark text-white border-mpca-green-dark" :
                                "bg-white text-mpca-charcoal border-mpca-brass/30 hover:border-mpca-brass")}>
                        {f === "my_scope" ? "My Scope" : (STATUS_STYLE[f]?.label || f)}
                    </button>
                ))}
            </div>

            <div className="bulletin-card overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No grants match this filter.</div>
                ) : (
                    <table className="w-full text-sm" data-testid="grants-table">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Code", "Division", "Category", "Purpose", "Amount", "Status", ""].map((h) => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((g) => {
                                const st = STATUS_STYLE[g.status] || {};
                                return (
                                    <tr
                                        key={g.id}
                                        onClick={() => setSelected(g)}
                                        className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40 cursor-pointer"
                                        data-testid={`grant-row-${g.id}`}
                                    >
                                        <td className="px-4 py-3 font-mono text-[11px] text-mpca-charcoal">{g.code}</td>
                                        <td className="px-4 py-3 text-mpca-green-dark">{g.body_id}</td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[11px]">{g.category?.replace(/_/g, " ")}</td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[11px] truncate max-w-[280px]">{g.purpose}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-green-dark">
                                            {g.approved_amount_inr && g.approved_amount_inr !== g.amount_inr ? (
                                                <>
                                                    <div className="text-mpca-gold-dark">{fmtINR(g.approved_amount_inr)}</div>
                                                    <div className="text-[10px] line-through text-mpca-gray-dark">{fmtINR(g.amount_inr)}</div>
                                                </>
                                            ) : fmtINR(g.amount_inr)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase ${st.bg} ${st.tx}`}>
                                                {st.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right"><ChevronRight size={14} className="text-mpca-gray-dark inline" /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
                    <div
                        className="w-full max-w-2xl bg-mpca-ivory h-full overflow-y-auto shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="grant-drawer"
                    >
                        <div className="border-b border-mpca-brass/40 px-6 py-5 flex justify-between items-start gap-4 bg-mpca-parchment">
                            <div>
                                <div className="overline">{selected.body_id} · {selected.fiscal_cycle}</div>
                                <div className="font-mono text-[11px] text-mpca-brass mt-1">{selected.code}</div>
                                <h2 className="font-serif text-2xl text-mpca-green-dark mt-2">{selected.category?.replace(/_/g, " ")}</h2>
                                <p className="text-mpca-charcoal text-sm mt-1">{selected.purpose}</p>
                            </div>
                            <button onClick={() => setSelected(null)} data-testid="close-drawer" className="text-mpca-gray-dark hover:text-mpca-oxblood"><X size={20} /></button>
                        </div>

                        <div className="px-6 py-5 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="overline">Requested</div>
                                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">{fmtINR(selected.amount_inr)}</div>
                                </div>
                                {selected.approved_amount_inr != null && (
                                    <div>
                                        <div className="overline">Approved</div>
                                        <div className="font-serif text-2xl text-mpca-gold-dark mt-1">{fmtINR(selected.approved_amount_inr)}</div>
                                    </div>
                                )}
                            </div>

                            <Timeline grant={selected} />

                            {(() => {
                                const actions = canAct(persona, selected);
                                if (!Object.keys(actions).length) return null;
                                return (
                                    <div className="border-t border-mpca-brass/30 pt-5 flex flex-wrap gap-2" data-testid="grant-actions">
                                        {actions.submit && (
                                            <button onClick={() => setActionOpen({ action: "submit", grant: selected })} className="btn-heritage-primary" data-testid="action-submit">
                                                <Send size={12} /> Submit to Finance
                                            </button>
                                        )}
                                        {actions.finance_review && (
                                            <button onClick={() => setActionOpen({ action: "finance-review", grant: selected })} className="btn-heritage-primary" data-testid="action-finance-review">
                                                <CheckCircle2 size={12} /> Finance Review
                                            </button>
                                        )}
                                        {actions.secretary_approve && (
                                            <button onClick={() => setActionOpen({ action: "secretary-approve", grant: selected })} className="btn-heritage-primary" data-testid="action-secretary-approve">
                                                <CheckCircle2 size={12} /> Secretary Approve
                                            </button>
                                        )}
                                        {actions.disburse && (
                                            <button onClick={() => setActionOpen({ action: "disburse", grant: selected })} className="btn-heritage-primary bg-mpca-green-deep" data-testid="action-disburse">
                                                <ArrowRight size={12} /> Disburse & Post Voucher
                                            </button>
                                        )}
                                        {actions.send_back && (
                                            <button onClick={() => setActionOpen({ action: "send-back", grant: selected })} className="btn-heritage-secondary" data-testid="action-send-back">
                                                <RotateCcw size={12} /> Send Back
                                            </button>
                                        )}
                                        {actions.reject && (
                                            <button onClick={() => setActionOpen({ action: "reject", grant: selected })} className="btn-heritage-secondary text-mpca-oxblood" data-testid="action-reject">
                                                <Ban size={12} /> Reject
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}

                            {selected.voucher_id && (
                                <div className="bg-mpca-gold-light/20 border border-mpca-gold-light px-4 py-3 text-[11px] text-mpca-charcoal" data-testid="linked-voucher">
                                    <span className="uppercase tracking-widest text-mpca-brass text-[9px]">Payment Voucher</span>
                                    <div className="font-mono mt-1">{selected.voucher_id}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showNew && <NewGrantDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} persona={persona} />}
            {actionOpen && <ActionDialog action={actionOpen.action} grant={actionOpen.grant} onClose={() => setActionOpen(null)} onSubmit={handleAction} busy={busy} />}
        </div>
    );
};

const NewGrantDialog = ({ onClose, onCreated, persona }) => {
    const [form, setForm] = useState({
        body_id: persona?.body_code || "",
        category: "Coaching_Grant",
        purpose: "",
        amount_inr: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
            await createDivisionGrant({
                body_id: form.body_id,
                category: form.category,
                purpose: form.purpose,
                amount_inr: parseFloat(form.amount_inr),
                created_by_name: persona ? `${persona.honorific} ${persona.name}` : "Unknown",
                created_by_user_id: persona?.id,
            });
            onCreated();
        } catch (e) {
            setErr(e.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg" onClick={(e) => e.stopPropagation()} data-testid="new-grant-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment flex justify-between items-center">
                    <div>
                        <div className="overline">New Grant Request</div>
                        <div className="font-serif text-lg text-mpca-green-dark mt-1">Raise Division Grant</div>
                    </div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-4">
                    <div>
                        <label className="label-heritage">Division Code</label>
                        <input value={form.body_id} onChange={(e) => setForm({ ...form, body_id: e.target.value })} required className="input-heritage" placeholder="DIV-IND" data-testid="input-body-id" />
                    </div>
                    <div>
                        <label className="label-heritage">Category</label>
                        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-heritage" data-testid="input-category">
                            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label-heritage">Purpose</label>
                        <textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} required rows={2} className="input-heritage" data-testid="input-purpose" />
                    </div>
                    <div>
                        <label className="label-heritage">Amount (₹)</label>
                        <input type="number" min="1" value={form.amount_inr} onChange={(e) => setForm({ ...form, amount_inr: e.target.value })} required className="input-heritage" data-testid="input-amount" />
                    </div>
                    {err && <div className="text-mpca-oxblood text-sm" data-testid="new-grant-error">{err}</div>}
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="submit-new-grant">
                            {busy ? "Saving…" : "Save Draft"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ActionDialog = ({ action, grant, onClose, onSubmit, busy }) => {
    const [note, setNote] = useState("");
    const [approvedAmount, setApprovedAmount] = useState(grant.amount_inr);
    const needsNote = action === "send-back" || action === "reject";
    const needsAmount = action === "secretary-approve";
    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="action-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment">
                    <div className="overline">Action · {action}</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">{grant.code}</div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {needsAmount && (
                        <div>
                            <label className="label-heritage">Approved Amount (₹) · Max {fmtINR(grant.amount_inr)}</label>
                            <input type="number" value={approvedAmount} onChange={(e) => setApprovedAmount(parseFloat(e.target.value))}
                                   max={grant.amount_inr} min={1} className="input-heritage" data-testid="input-approved-amount" />
                        </div>
                    )}
                    <div>
                        <label className="label-heritage">Note {needsNote ? "(required)" : "(optional)"}</label>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input-heritage" placeholder={needsNote ? "Reason for send-back / rejection…" : "Optional context…"} data-testid="input-note" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button
                            disabled={busy || (needsNote && !note)}
                            onClick={() => onSubmit(action, { note, ...(needsAmount ? { approved_amount_inr: approvedAmount } : {}) })}
                            className="btn-heritage-primary"
                            data-testid="confirm-action"
                        >
                            {busy ? "Working…" : "Confirm"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DivisionGrants;
