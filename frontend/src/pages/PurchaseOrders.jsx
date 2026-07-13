/**
 * PurchaseOrders page · Sprint 2 · P4.x
 * PO lifecycle: Draft → Submitted → Approved → Issued → Received → Invoiced → Paid
 * TDS auto-calc, GST snapshot, PO burn-down (invoiced vs remaining).
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchPurchaseOrders, fetchPoStats, poAction, createPurchaseOrder,
    linkPoBill, fetchVendors, fetchPoBurndown,
} from "@/lib/api";
import {
    ShoppingCart, Plus, X, Send, CheckCircle2, RotateCcw, Ban, ArrowRight,
    Package, FileText, TrendingUp, AlertTriangle, ChevronRight, Truck, Coins, Percent,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const STATUS_STYLE = {
    Draft:               { bg: "bg-mpca-brass/10",      tx: "text-mpca-brass",       label: "Draft" },
    Submitted:           { bg: "bg-mpca-navy/10",       tx: "text-mpca-navy",        label: "Submitted" },
    Approved:            { bg: "bg-mpca-green-deep/10", tx: "text-mpca-green-deep",  label: "Approved" },
    Issued:              { bg: "bg-mpca-gold-light/25", tx: "text-mpca-gold-dark",   label: "Issued" },
    Partially_Received:  { bg: "bg-mpca-gold-light/25", tx: "text-mpca-gold-dark",   label: "Partial Receipt" },
    Received:            { bg: "bg-mpca-green-dark/15", tx: "text-mpca-green-dark",  label: "Received" },
    Invoiced:            { bg: "bg-mpca-brass/25",      tx: "text-mpca-oxblood",     label: "Invoiced" },
    Paid:                { bg: "bg-mpca-green-dark/25", tx: "text-mpca-green-dark",  label: "Paid" },
    Cancelled:           { bg: "bg-mpca-oxblood/15",    tx: "text-mpca-oxblood",     label: "Cancelled" },
    Sent_Back:           { bg: "bg-mpca-oxblood/10",    tx: "text-mpca-oxblood",     label: "Sent Back" },
};

const canAct = (persona, po) => {
    if (!persona || !po) return {};
    const isState = persona.body_type === "State";
    const isAccounts = ["treasurer", "secretary", "president"].includes(persona.role_id);
    const acts = {};
    if ((po.status === "Draft" || po.status === "Sent_Back") && isState) acts.submit = true;
    if (po.status === "Submitted" && isState) acts.approve = true;
    if (po.status === "Approved" && isState) acts.issue = true;
    if ((po.status === "Issued" || po.status === "Partially_Received") && isState) acts.receive = true;
    if (["Received", "Partially_Received", "Invoiced"].includes(po.status) && isAccounts) acts.link_bill = true;
    if (!["Paid", "Cancelled"].includes(po.status) && isState) acts.send_back = true;
    if (!["Paid", "Cancelled"].includes(po.status) && isState) acts.cancel = true;
    return acts;
};

const KpiTile = ({ label, value, sub, icon: Icon, tone = "green", testid }) => {
    const toneMap = { green: "text-mpca-green-dark", oxblood: "text-mpca-oxblood", brass: "text-mpca-brass", gold: "text-mpca-gold-dark" };
    return (
        <div className="bulletin-card p-5" data-testid={testid}>
            <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
            <div className={`font-serif text-2xl ${toneMap[tone]}`}>{value}</div>
            <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
            {sub && <div className="text-[10px] text-mpca-gray-dark mt-1">{sub}</div>}
        </div>
    );
};

const BurnDown = ({ po }) => {
    const total = po.total_amount_inr || 0;
    const invoiced = po.invoiced_amount_inr || 0;
    const paid = po.paid_amount_inr || 0;
    const invPct = total ? Math.min(100, (invoiced / total) * 100) : 0;
    const paidPct = total ? Math.min(100, (paid / total) * 100) : 0;
    return (
        <div className="bg-mpca-parchment/40 border border-mpca-brass/30 p-4" data-testid="po-burndown">
            <div className="flex justify-between items-center mb-2 text-[10px] uppercase tracking-widest">
                <span className="text-mpca-brass">PO Burn-Down</span>
                <span className="text-mpca-gray-dark">Remaining {fmtINR(total - invoiced)}</span>
            </div>
            <div className="relative h-3 bg-mpca-brass/15 mb-1">
                <div className="absolute inset-y-0 left-0 bg-mpca-brass" style={{ width: `${invPct}%` }} />
                <div className="absolute inset-y-0 left-0 bg-mpca-green-deep" style={{ width: `${paidPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-mpca-gray-dark">
                <span>Paid {fmtINR(paid)} ({paidPct.toFixed(1)}%)</span>
                <span>Invoiced {fmtINR(invoiced)} ({invPct.toFixed(1)}%)</span>
                <span>Total {fmtINR(total)}</span>
            </div>
        </div>
    );
};

const PurchaseOrders = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [actionOpen, setActionOpen] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [r, s] = await Promise.all([fetchPurchaseOrders(), fetchPoStats()]);
            setRows(r);
            setStats(s);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        if (filter === "all") return rows;
        if (filter === "active") return rows.filter(p => !["Paid", "Cancelled"].includes(p.status));
        if (filter === "outstanding") return rows.filter(p => (p.total_amount_inr || 0) > (p.invoiced_amount_inr || 0) && !["Cancelled", "Draft"].includes(p.status));
        return rows.filter(p => p.status === filter);
    }, [rows, filter]);

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
            if (action === "link-bill") {
                await linkPoBill(actionOpen.po.id, payload);
            } else {
                await poAction(actionOpen.po.id, action, payload);
            }
            const refreshed = await fetchPurchaseOrders();
            setRows(refreshed);
            const s = await fetchPoStats();
            setStats(s);
            const cur = refreshed.find(p => p.id === actionOpen.po.id);
            setSelected(cur || null);
            setActionOpen(null);
        } catch (e) {
            alert("Action failed: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading purchase orders…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="purchase-orders-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><ShoppingCart size={12} /> Sprint 2 · Procurement Rails</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Purchase Orders</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Formal PO lifecycle with 2/3-step approval, TDS auto-calc, GST snapshot, and live burn-down against vendor invoices.
                    </p>
                </div>
                <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="new-po-btn">
                    <Plus size={14} /> New PO
                </button>
            </div>

            <div className="crest-divider mb-8" />

            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Total Committed" value={fmtINR(stats.committed_inr)} sub={`${stats.count} POs`} icon={FileText} testid="kpi-committed" />
                    <KpiTile label="Invoiced" value={fmtINR(stats.invoiced_inr)} sub="Bills received" icon={Package} tone="gold" testid="kpi-invoiced" />
                    <KpiTile label="Outstanding" value={fmtINR(stats.outstanding_inr)} sub="Yet to invoice" icon={AlertTriangle} tone="oxblood" testid="kpi-outstanding" />
                    <KpiTile label="TDS Accrued" value={fmtINR(stats.tds_accrued_inr)} sub="Payable to IT dept." icon={Percent} tone="brass" testid="kpi-tds" />
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-6" data-testid="po-filters">
                {["all", "active", "outstanding", "Draft", "Submitted", "Approved", "Issued", "Received", "Invoiced", "Paid", "Cancelled"].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        data-testid={`po-filter-${f}`}
                        className={"px-3 py-1 text-[10px] tracking-widest uppercase border transition-colors " +
                            (filter === f ? "bg-mpca-green-dark text-white border-mpca-green-dark" :
                                "bg-white text-mpca-charcoal border-mpca-brass/30 hover:border-mpca-brass")}>
                        {f.replace(/_/g, " ")}
                    </button>
                ))}
            </div>

            <div className="bulletin-card overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No POs match this filter.</div>
                ) : (
                    <table className="w-full text-sm" data-testid="po-table">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["PO No.", "Vendor", "Subject", "Total", "Invoiced", "Status", ""].map((h) => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p) => {
                                const st = STATUS_STYLE[p.status] || {};
                                const invPct = p.total_amount_inr ? (p.invoiced_amount_inr / p.total_amount_inr) * 100 : 0;
                                return (
                                    <tr key={p.id} onClick={() => setSelected(p)}
                                        className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40 cursor-pointer"
                                        data-testid={`po-row-${p.id}`}>
                                        <td className="px-4 py-3 font-mono text-[11px] text-mpca-charcoal">{p.po_no}</td>
                                        <td className="px-4 py-3 text-mpca-green-dark text-[12px]">{p.vendor_name}</td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[11px] truncate max-w-[240px]">{p.subject}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-green-dark">{fmtINR(p.total_amount_inr)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-16 bg-mpca-brass/15">
                                                    <div className="h-full bg-mpca-brass" style={{ width: `${Math.min(100, invPct)}%` }} />
                                                </div>
                                                <span className="text-[10px] font-mono text-mpca-gray-dark">{invPct.toFixed(0)}%</span>
                                            </div>
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

            {selected && <PoDrawer po={selected} onClose={() => setSelected(null)} onAction={(a) => setActionOpen({ action: a, po: selected })} persona={persona} />}
            {showNew && <NewPoDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} persona={persona} />}
            {actionOpen && <PoActionDialog action={actionOpen.action} po={actionOpen.po} onClose={() => setActionOpen(null)} onSubmit={handleAction} busy={busy} />}
        </div>
    );
};

// -------- Drawer --------

const PoDrawer = ({ po, onClose, onAction, persona }) => {
    const actions = canAct(persona, po);
    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-3xl bg-mpca-ivory h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="po-drawer">
                <div className="border-b border-mpca-brass/40 px-6 py-5 flex justify-between items-start gap-4 bg-mpca-parchment">
                    <div>
                        <div className="overline">{po.vendor_name}</div>
                        <div className="font-mono text-[11px] text-mpca-brass mt-1">{po.po_no}</div>
                        <h2 className="font-serif text-2xl text-mpca-green-dark mt-2">{po.subject}</h2>
                        {po.description && <p className="text-mpca-charcoal text-sm mt-1">{po.description}</p>}
                    </div>
                    <button onClick={onClose} data-testid="close-po-drawer" className="text-mpca-gray-dark hover:text-mpca-oxblood"><X size={20} /></button>
                </div>

                <div className="px-6 py-5 space-y-6">
                    <div className="grid grid-cols-4 gap-3 text-center">
                        <div><div className="overline">Sub-total</div><div className="font-mono text-mpca-charcoal text-sm mt-1">{fmtINR(po.subtotal_inr)}</div></div>
                        <div><div className="overline">GST</div><div className="font-mono text-mpca-charcoal text-sm mt-1">{fmtINR(po.gst_total_inr)}</div></div>
                        <div><div className="overline">Total</div><div className="font-mono text-mpca-green-dark text-sm mt-1">{fmtINR(po.total_amount_inr)}</div></div>
                        <div><div className="overline">TDS ({po.tds_rate_pct}%)</div><div className="font-mono text-mpca-oxblood text-sm mt-1">{fmtINR(po.tds_amount_inr)}</div></div>
                    </div>

                    <BurnDown po={po} />

                    <div>
                        <div className="overline mb-2">Line Items ({(po.items || []).length})</div>
                        <table className="w-full text-[11px] border border-mpca-brass/20" data-testid="po-items-table">
                            <thead className="bg-mpca-parchment/60">
                                <tr>
                                    {["Description", "HSN", "Qty · UoM", "Unit ₹", "GST %", "Total"].map(h => (
                                        <th key={h} className="text-left px-2 py-1.5 text-[9px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(po.items || []).map((it, i) => {
                                    const sub = (it.quantity || 0) * (it.unit_price_inr || 0);
                                    const gst = sub * ((it.gst_pct || 0) / 100);
                                    return (
                                        <tr key={i} className="border-t border-mpca-brass/10">
                                            <td className="px-2 py-1.5 text-mpca-charcoal">{it.description}</td>
                                            <td className="px-2 py-1.5 font-mono text-[10px] text-mpca-gray-dark">{it.hsn_sac || "—"}</td>
                                            <td className="px-2 py-1.5 font-mono">{it.quantity} {it.uom}</td>
                                            <td className="px-2 py-1.5 font-mono">{fmtINR(it.unit_price_inr)}</td>
                                            <td className="px-2 py-1.5 font-mono">{it.gst_pct}%</td>
                                            <td className="px-2 py-1.5 font-mono text-mpca-green-dark">{fmtINR(sub + gst)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {(po.approval_chain || []).length > 0 && (
                        <div className="border-t border-mpca-brass/30 pt-4" data-testid="po-chain">
                            <div className="overline mb-3">Approval Trail</div>
                            <div className="space-y-2">
                                {po.approval_chain.map((c, i) => (
                                    <div key={i} className="text-[11px] flex items-start gap-2">
                                        <span className="font-mono text-mpca-brass uppercase w-20 flex-shrink-0">{c.action}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-mpca-charcoal">{c.actor_name} <span className="text-mpca-gray-dark">· {c.stage}</span></div>
                                            {c.note && <div className="text-mpca-gray-dark italic mt-0.5">&ldquo;{c.note}&rdquo;</div>}
                                        </div>
                                        <span className="text-[9px] font-mono text-mpca-gray-dark">{new Date(c.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {Object.keys(actions).length > 0 && (
                        <div className="border-t border-mpca-brass/30 pt-5 flex flex-wrap gap-2" data-testid="po-actions">
                            {actions.submit && <button onClick={() => onAction("submit")} className="btn-heritage-primary" data-testid="po-action-submit"><Send size={12} /> Submit</button>}
                            {actions.approve && <button onClick={() => onAction("approve")} className="btn-heritage-primary" data-testid="po-action-approve"><CheckCircle2 size={12} /> Approve</button>}
                            {actions.issue && <button onClick={() => onAction("issue")} className="btn-heritage-primary bg-mpca-green-deep" data-testid="po-action-issue"><ArrowRight size={12} /> Issue to Vendor</button>}
                            {actions.receive && <button onClick={() => onAction("mark-received")} className="btn-heritage-primary" data-testid="po-action-receive"><Truck size={12} /> Mark Received</button>}
                            {actions.link_bill && <button onClick={() => onAction("link-bill")} className="btn-heritage-primary" data-testid="po-action-link-bill"><Coins size={12} /> Link Invoice</button>}
                            {actions.send_back && <button onClick={() => onAction("send-back")} className="btn-heritage-secondary" data-testid="po-action-send-back"><RotateCcw size={12} /> Send Back</button>}
                            {actions.cancel && <button onClick={() => onAction("cancel")} className="btn-heritage-secondary text-mpca-oxblood" data-testid="po-action-cancel"><Ban size={12} /> Cancel</button>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// -------- New PO --------

const NewPoDialog = ({ onClose, onCreated, persona }) => {
    const [vendors, setVendors] = useState([]);
    const [form, setForm] = useState({
        body_id: "MPCA",
        vendor_id: "",
        category: "General",
        subject: "",
        description: "",
        delivery_date: "",
        payment_terms: "Net 30",
        items: [{ description: "", quantity: 1, uom: "nos", unit_price_inr: "", gst_pct: 18 }],
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        fetchVendors().then(v => setVendors(v.filter(x => x.kyc_status === "KYC_Verified" && !x.is_blacklisted)));
    }, []);

    const totals = useMemo(() => {
        let sub = 0, gst = 0;
        form.items.forEach(it => {
            const q = parseFloat(it.quantity) || 0;
            const p = parseFloat(it.unit_price_inr) || 0;
            const g = parseFloat(it.gst_pct) || 0;
            const s = q * p;
            sub += s;
            gst += s * (g / 100);
        });
        return { sub, gst, total: sub + gst };
    }, [form.items]);

    const updateItem = (i, k, v) => {
        const items = [...form.items];
        items[i] = { ...items[i], [k]: v };
        setForm({ ...form, items });
    };
    const addItem = () => setForm({ ...form, items: [...form.items, { description: "", quantity: 1, uom: "nos", unit_price_inr: "", gst_pct: 18 }] });
    const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, j) => j !== i) });

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
            await createPurchaseOrder({
                body_id: form.body_id,
                vendor_id: form.vendor_id,
                category: form.category,
                subject: form.subject,
                description: form.description || undefined,
                delivery_date: form.delivery_date || undefined,
                payment_terms: form.payment_terms,
                items: form.items.map(it => ({
                    description: it.description,
                    hsn_sac: it.hsn_sac || undefined,
                    quantity: parseFloat(it.quantity),
                    uom: it.uom,
                    unit_price_inr: parseFloat(it.unit_price_inr),
                    gst_pct: parseFloat(it.gst_pct),
                })),
                created_by_name: persona ? `${persona.honorific} ${persona.name}` : "MPCA Accounts",
                created_by_user_id: persona?.id,
            });
            onCreated();
        } catch (e) {
            setErr(e.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="new-po-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment sticky top-0 z-10 flex justify-between items-center">
                    <div>
                        <div className="overline">New Purchase Order</div>
                        <div className="font-serif text-lg text-mpca-green-dark mt-1">Draft PO</div>
                    </div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Vendor (KYC-verified only)</label>
                            <select required value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className="input-heritage" data-testid="input-vendor">
                                <option value="">— select vendor —</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name} · {v.vendor_no}</option>
                                ))}
                            </select>
                            {vendors.length === 0 && <div className="text-[10px] text-mpca-oxblood mt-1">No KYC-verified vendors available. Complete KYC first.</div>}
                        </div>
                        <div>
                            <label className="label-heritage">Category</label>
                            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-heritage" data-testid="input-po-category" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Subject</label>
                        <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input-heritage" placeholder="e.g. Kits · U-19 Winter Camp" data-testid="input-po-subject" />
                    </div>
                    <div>
                        <label className="label-heritage">Description (optional)</label>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="input-heritage" data-testid="input-po-desc" />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Delivery Date</label>
                            <input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} className="input-heritage" data-testid="input-po-delivery" />
                        </div>
                        <div>
                            <label className="label-heritage">Payment Terms</label>
                            <input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className="input-heritage" data-testid="input-po-terms" />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="label-heritage m-0">Line Items</label>
                            <button type="button" onClick={addItem} className="text-[10px] tracking-widest uppercase text-mpca-brass hover:text-mpca-oxblood" data-testid="add-item-btn">
                                + add row
                            </button>
                        </div>
                        <div className="border border-mpca-brass/30 divide-y divide-mpca-brass/20">
                            {form.items.map((it, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 p-2 items-center text-[11px]" data-testid={`item-row-${i}`}>
                                    <input placeholder="Description" required value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} className="col-span-5 input-heritage py-1 text-[11px]" data-testid={`item-desc-${i}`} />
                                    <input type="number" step="0.01" placeholder="Qty" required value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className="col-span-1 input-heritage py-1 text-[11px]" data-testid={`item-qty-${i}`} />
                                    <input placeholder="uom" value={it.uom} onChange={(e) => updateItem(i, "uom", e.target.value)} className="col-span-1 input-heritage py-1 text-[11px]" />
                                    <input type="number" step="0.01" placeholder="Unit ₹" required value={it.unit_price_inr} onChange={(e) => updateItem(i, "unit_price_inr", e.target.value)} className="col-span-2 input-heritage py-1 text-[11px]" data-testid={`item-price-${i}`} />
                                    <select value={it.gst_pct} onChange={(e) => updateItem(i, "gst_pct", e.target.value)} className="col-span-2 input-heritage py-1 text-[11px]" data-testid={`item-gst-${i}`}>
                                        <option value="0">GST 0%</option>
                                        <option value="5">GST 5%</option>
                                        <option value="12">GST 12%</option>
                                        <option value="18">GST 18%</option>
                                        <option value="28">GST 28%</option>
                                    </select>
                                    <button type="button" onClick={() => removeItem(i)} disabled={form.items.length === 1} className="col-span-1 text-mpca-oxblood disabled:opacity-30" data-testid={`item-del-${i}`}>
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex justify-end gap-6 text-[11px]" data-testid="po-totals-preview">
                            <span className="text-mpca-gray-dark">Sub: <span className="font-mono text-mpca-charcoal">{fmtINR(totals.sub)}</span></span>
                            <span className="text-mpca-gray-dark">GST: <span className="font-mono text-mpca-charcoal">{fmtINR(totals.gst)}</span></span>
                            <span className="text-mpca-green-dark font-medium">Total: <span className="font-mono">{fmtINR(totals.total)}</span></span>
                        </div>
                    </div>

                    {err && <div className="text-mpca-oxblood text-sm" data-testid="new-po-error">{err}</div>}
                    <div className="flex justify-end gap-3 pt-2 border-t border-mpca-brass/20">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button type="submit" disabled={busy || !form.vendor_id} className="btn-heritage-primary" data-testid="submit-new-po">
                            {busy ? "Saving…" : "Save Draft"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// -------- Action Dialog --------

const PoActionDialog = ({ action, po, onClose, onSubmit, busy }) => {
    const [note, setNote] = useState("");
    const [receivedPct, setReceivedPct] = useState(100);
    const [billAmount, setBillAmount] = useState("");
    const [billId, setBillId] = useState(`bill-${Date.now()}`);
    const [isPaid, setIsPaid] = useState(false);

    const needsNote = action === "send-back" || action === "cancel";
    const isReceive = action === "mark-received";
    const isLinkBill = action === "link-bill";
    const remaining = (po.total_amount_inr || 0) - (po.invoiced_amount_inr || 0);

    const submit = () => {
        const extra = { note };
        if (isReceive) extra.received_qty_pct = receivedPct;
        if (isLinkBill) {
            extra.bill_id = billId;
            extra.amount_inr = parseFloat(billAmount);
            extra.is_paid = isPaid;
        }
        onSubmit(action, extra);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="po-action-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment">
                    <div className="overline">Action · {action}</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">{po.po_no}</div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {isReceive && (
                        <div>
                            <label className="label-heritage">Received %</label>
                            <input type="number" min={1} max={100} value={receivedPct} onChange={(e) => setReceivedPct(parseFloat(e.target.value))} className="input-heritage" data-testid="input-received-pct" />
                            <div className="text-[10px] text-mpca-gray-dark mt-1">{receivedPct >= 100 ? "Full receipt · moves to Ready to Invoice" : "Partial receipt · stays in Awaiting Delivery"}</div>
                        </div>
                    )}
                    {isLinkBill && (
                        <>
                            <div>
                                <label className="label-heritage">Bill Reference</label>
                                <input value={billId} onChange={(e) => setBillId(e.target.value)} className="input-heritage" data-testid="input-bill-id" />
                            </div>
                            <div>
                                <label className="label-heritage">Amount (₹) · Remaining {fmtINR(remaining)}</label>
                                <input type="number" step="0.01" min={1} max={remaining} value={billAmount} onChange={(e) => setBillAmount(e.target.value)} className="input-heritage" required data-testid="input-bill-amount" />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-mpca-charcoal cursor-pointer">
                                <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} data-testid="input-is-paid" /> Also mark this bill as paid
                            </label>
                        </>
                    )}
                    <div>
                        <label className="label-heritage">Note {needsNote ? "(required)" : "(optional)"}</label>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input-heritage" data-testid="input-po-note" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button disabled={busy || (needsNote && !note) || (isLinkBill && (!billAmount || parseFloat(billAmount) <= 0))}
                                onClick={submit} className="btn-heritage-primary" data-testid="confirm-po-action">
                            {busy ? "Working…" : "Confirm"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseOrders;
