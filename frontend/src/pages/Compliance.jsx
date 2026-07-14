/**
 * Compliance page · Sprint 4 · P7.3-P7.4
 * Statutory filing register with due-date maths + Audit Workpapers PDF trigger.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchComplianceDashboard, fetchCompliance, fileCompliance, createCompliance,
    fetchAuditPackPreview, auditPackDownloadUrl,
} from "@/lib/api";
import {
    ShieldCheck, ShieldAlert, Clock, CalendarClock, Plus, X, FileCheck,
    Download, FileArchive, AlertTriangle, Filter, CheckCircle2, ChevronRight,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const STATUS_STYLE = {
    Overdue:   { bg: "bg-mpca-oxblood/15",    tx: "text-mpca-oxblood",     icon: AlertTriangle, label: "Overdue" },
    Due_Soon:  { bg: "bg-mpca-gold-light/30", tx: "text-mpca-gold-dark",   icon: Clock,          label: "Due Soon" },
    Upcoming:  { bg: "bg-mpca-navy/10",       tx: "text-mpca-navy",        icon: CalendarClock,  label: "Upcoming" },
    Filed:     { bg: "bg-mpca-green-dark/15", tx: "text-mpca-green-dark",  icon: CheckCircle2,   label: "Filed" },
};

const FREQ_OPTS = ["Monthly", "Quarterly", "Half_Yearly", "Yearly", "One_Time"];

const KpiTile = ({ label, value, sub, icon: Icon, tone = "green", testid }) => {
    const toneMap = { green: "text-mpca-green-dark", oxblood: "text-mpca-oxblood", brass: "text-mpca-brass", gold: "text-mpca-gold-dark" };
    return (
        <div className="bulletin-card p-5" data-testid={testid}>
            <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
            <div className={`font-serif text-3xl ${toneMap[tone]}`}>{value}</div>
            <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
            {sub && <div className="text-[10px] text-mpca-gray-dark mt-1">{sub}</div>}
        </div>
    );
};

const Compliance = () => {
    const { persona } = useAuth();
    const [dashboard, setDashboard] = useState(null);
    const [items, setItems] = useState([]);
    const [pack, setPack] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState(null);
    const [showFile, setShowFile] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [d, i, p] = await Promise.all([
                fetchComplianceDashboard(), fetchCompliance(), fetchAuditPackPreview(),
            ]);
            setDashboard(d); setItems(i); setPack(p);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filteredRows = useMemo(() => {
        if (!dashboard) return [];
        if (filter === "all") return dashboard.rows;
        return dashboard.rows.filter(r => r.status_label === filter);
    }, [dashboard, filter]);

    const handleFile = async (payload) => {
        if (!selected) return;
        setBusy(true);
        try {
            await fileCompliance(selected.id, payload);
            await load();
            setShowFile(false);
            setSelected(null);
        } catch (e) {
            alert("Filing failed: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading compliance register…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="compliance-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><ShieldCheck size={12} /> Sprint 4 · Governance & Compliance</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Compliance Register</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Statutory filing calendar with next-due maths across GST · TDS · PF · ESI · IT · Registrar · BCCI · Audit. One-click Audit Workpapers PDF for auditors.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowNew(true)} className="btn-heritage-secondary" data-testid="new-compliance-btn">
                        <Plus size={14} /> New Item
                    </button>
                    <button onClick={() => setShowAudit(true)} className="btn-heritage-primary bg-mpca-oxblood" data-testid="audit-pack-btn">
                        <FileArchive size={14} /> Audit Workpapers
                    </button>
                </div>
            </div>

            <div className="crest-divider mb-8" />

            {dashboard && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Overdue" value={dashboard.counts.Overdue || 0} sub="Immediate action" icon={AlertTriangle} tone="oxblood" testid="kpi-overdue" />
                    <KpiTile label="Due Soon (≤15d)" value={dashboard.counts.Due_Soon || 0} icon={Clock} tone="gold" testid="kpi-duesoon" />
                    <KpiTile label="Upcoming" value={dashboard.counts.Upcoming || 0} sub="No action yet" icon={CalendarClock} tone="brass" testid="kpi-upcoming" />
                    <KpiTile label="All Filed" value={dashboard.counts.Filed || 0} sub="Nothing pending" icon={CheckCircle2} tone="green" testid="kpi-filed" />
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-6" data-testid="compliance-filters">
                <Filter size={12} className="text-mpca-brass" />
                {["all", "Overdue", "Due_Soon", "Upcoming", "Filed"].map((f) => (
                    <button key={f} onClick={() => setFilter(f)} data-testid={`compliance-filter-${f}`}
                        className={"px-3 py-1 text-[10px] tracking-widest uppercase border transition-colors " +
                            (filter === f ? "bg-mpca-green-dark text-white border-mpca-green-dark" :
                                "bg-white text-mpca-charcoal border-mpca-brass/30 hover:border-mpca-brass")}>
                        {f.replace(/_/g, " ")}
                    </button>
                ))}
            </div>

            <div className="bulletin-card overflow-hidden">
                {filteredRows.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No compliance items match this filter.</div>
                ) : (
                    <table className="w-full text-sm" data-testid="compliance-table">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Item", "Authority", "Frequency", "Next Due", "Days Left", "Last Filed", "Status", ""].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((r) => {
                                const st = STATUS_STYLE[r.status_label] || STATUS_STYLE.Upcoming;
                                const Icon = st.icon;
                                const full = items.find(x => x.id === r.id);
                                return (
                                    <tr key={r.id} onClick={() => setSelected(full)}
                                        className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40 cursor-pointer"
                                        data-testid={`compliance-row-${r.id}`}>
                                        <td className="px-4 py-3">
                                            <div className="text-mpca-green-dark font-medium text-[12px]">{r.name}</div>
                                            {r.section_ref && <div className="text-[10px] text-mpca-gray-dark">{r.section_ref}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[11px]">{r.authority}</td>
                                        <td className="px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-gray-dark">{r.frequency?.replace(/_/g, " ")}</td>
                                        <td className="px-4 py-3 font-mono text-[11px] text-mpca-charcoal">{r.next_due_date || "—"}</td>
                                        <td className="px-4 py-3 font-mono text-[11px]">
                                            {r.days_left == null ? <span className="text-mpca-gray-dark">—</span> :
                                             r.days_left < 0 ? <span className="text-mpca-oxblood">{r.days_left}d</span> :
                                                                 <span className="text-mpca-green-dark">{r.days_left}d</span>}
                                        </td>
                                        <td className="px-4 py-3 text-[10px] font-mono text-mpca-gray-dark">
                                            {r.last_filed ? `${r.last_filed.period} · ${r.last_filed.filed_date}` : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-widest uppercase ${st.bg} ${st.tx}`}>
                                                <Icon size={10} /> {st.label}
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

            {selected && <ComplianceDrawer item={selected} onClose={() => setSelected(null)} onFile={() => setShowFile(true)} />}
            {showFile && selected && <FileDialog item={selected} onClose={() => setShowFile(false)} onSubmit={handleFile} busy={busy} persona={persona} />}
            {showNew && <NewComplianceDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
            {showAudit && <AuditPackDialog pack={pack} onClose={() => setShowAudit(false)} />}
        </div>
    );
};

const ComplianceDrawer = ({ item, onClose, onFile }) => (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
        <div className="w-full max-w-2xl bg-mpca-ivory h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="compliance-drawer">
            <div className="border-b border-mpca-brass/40 px-6 py-5 flex justify-between items-start gap-4 bg-mpca-parchment">
                <div>
                    <div className="overline">{item.authority}</div>
                    <h2 className="font-serif text-2xl text-mpca-green-dark mt-2">{item.name}</h2>
                    {item.section_ref && <div className="text-[11px] text-mpca-charcoal mt-1">{item.section_ref}</div>}
                    <div className="mt-2">
                        <span className="inline-block px-2 py-0.5 bg-mpca-navy/10 text-mpca-navy text-[10px] tracking-widest uppercase">{item.frequency?.replace(/_/g, " ")}</span>
                    </div>
                </div>
                <button onClick={onClose} data-testid="close-compliance-drawer"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
                {item.penalty_note && (
                    <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/30 px-4 py-3 text-[11px] text-mpca-oxblood" data-testid="penalty-note">
                        <div className="uppercase tracking-widest text-[10px] mb-1">Penalty for late filing</div>
                        <div>{item.penalty_note}</div>
                    </div>
                )}
                {item.notes && <div className="text-[11px] text-mpca-charcoal italic">{item.notes}</div>}
                <div>
                    <div className="overline mb-2">Filing History ({(item.filed_history || []).length})</div>
                    {(item.filed_history || []).length === 0 ? (
                        <div className="text-[11px] italic text-mpca-gray-dark px-3 py-4 border border-dashed border-mpca-brass/30 text-center">No filings recorded yet.</div>
                    ) : (
                        <div className="border border-mpca-brass/30 divide-y divide-mpca-brass/20">
                            {(item.filed_history || []).slice().reverse().map((f, i) => (
                                <div key={i} className="px-3 py-2 text-[11px]" data-testid={`filed-${i}`}>
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono text-mpca-brass">{f.period}</span>
                                        <span className="text-[10px] font-mono text-mpca-gray-dark">Filed {f.filed_date}</span>
                                    </div>
                                    <div className="text-mpca-charcoal mt-0.5">by {f.filed_by}</div>
                                    {f.ack_ref && <div className="font-mono text-[10px] text-mpca-brass mt-0.5">Ack: {f.ack_ref}</div>}
                                    {f.amount_inr != null && <div className="text-[10px] text-mpca-green-dark mt-0.5">Amount: ₹{f.amount_inr.toLocaleString("en-IN")}</div>}
                                    {f.notes && <div className="italic text-mpca-gray-dark text-[10px] mt-0.5">{f.notes}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="border-t border-mpca-brass/30 pt-4 flex justify-end">
                    <button onClick={onFile} className="btn-heritage-primary" data-testid="file-btn">
                        <FileCheck size={12} /> Record Filing
                    </button>
                </div>
            </div>
        </div>
    </div>
);

const FileDialog = ({ item, onClose, onSubmit, busy, persona }) => {
    const [form, setForm] = useState({
        period: "",
        filed_date: new Date().toISOString().split("T")[0],
        ack_ref: "",
        filing_url: "",
        amount_inr: "",
        notes: "",
    });
    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="file-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment sticky top-0 z-10">
                    <div className="overline">Record Filing</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">{item.name}</div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="label-heritage">Period</label>
                        <input required value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="input-heritage" placeholder="e.g. 2026-07 / Q1 2026-27 / 2025-26" data-testid="input-period" />
                    </div>
                    <div>
                        <label className="label-heritage">Filed Date</label>
                        <input type="date" value={form.filed_date} onChange={(e) => setForm({ ...form, filed_date: e.target.value })} className="input-heritage" data-testid="input-filed-date" />
                    </div>
                    <div>
                        <label className="label-heritage">Acknowledgement Reference</label>
                        <input value={form.ack_ref} onChange={(e) => setForm({ ...form, ack_ref: e.target.value })} className="input-heritage font-mono" placeholder="e.g. AA23BM26050004321" data-testid="input-ack" />
                    </div>
                    <div>
                        <label className="label-heritage">Filing URL / Attachment</label>
                        <input type="url" value={form.filing_url} onChange={(e) => setForm({ ...form, filing_url: e.target.value })} className="input-heritage" data-testid="input-url" />
                    </div>
                    <div>
                        <label className="label-heritage">Amount (₹, optional)</label>
                        <input type="number" min="0" value={form.amount_inr} onChange={(e) => setForm({ ...form, amount_inr: e.target.value })} className="input-heritage" data-testid="input-amount" />
                    </div>
                    <div>
                        <label className="label-heritage">Notes (optional)</label>
                        <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-heritage" data-testid="input-notes" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button disabled={busy || !form.period}
                                onClick={() => onSubmit({
                                    ...form,
                                    filed_by: persona ? `${persona.honorific} ${persona.name}` : "MPCA Accounts",
                                    amount_inr: form.amount_inr ? parseFloat(form.amount_inr) : undefined,
                                    ack_ref: form.ack_ref || undefined,
                                    filing_url: form.filing_url || undefined,
                                    notes: form.notes || undefined,
                                })}
                                className="btn-heritage-primary" data-testid="confirm-file">
                            {busy ? "Recording…" : "Record"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const NewComplianceDialog = ({ onClose, onCreated }) => {
    const [form, setForm] = useState({
        name: "", authority: "", frequency: "Monthly", due_day: 10, due_month: "",
        section_ref: "", penalty_note: "", notes: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
            await createCompliance({
                name: form.name, authority: form.authority,
                frequency: form.frequency, due_day: parseInt(form.due_day, 10),
                due_month: form.due_month ? parseInt(form.due_month, 10) : undefined,
                section_ref: form.section_ref || undefined,
                penalty_note: form.penalty_note || undefined,
                notes: form.notes || undefined,
            });
            onCreated();
        } catch (e) {
            setErr(e.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="new-compliance-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment sticky top-0 z-10 flex justify-between items-center">
                    <div><div className="overline">New Compliance Item</div><div className="font-serif text-lg text-mpca-green-dark mt-1">Add to Register</div></div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-3">
                    <div>
                        <label className="label-heritage">Name</label>
                        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-heritage" data-testid="input-comp-name" />
                    </div>
                    <div>
                        <label className="label-heritage">Authority</label>
                        <input required value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} className="input-heritage" data-testid="input-comp-authority" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Frequency</label>
                            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="input-heritage" data-testid="input-comp-frequency">
                                {FREQ_OPTS.map(f => <option key={f}>{f}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Due Day (of period-end)</label>
                            <input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} className="input-heritage" data-testid="input-comp-day" />
                        </div>
                    </div>
                    {form.frequency === "Yearly" && (
                        <div>
                            <label className="label-heritage">Due Month (1-12)</label>
                            <input type="number" min="1" max="12" value={form.due_month} onChange={(e) => setForm({ ...form, due_month: e.target.value })} className="input-heritage" data-testid="input-comp-month" />
                        </div>
                    )}
                    <div>
                        <label className="label-heritage">Section Reference (optional)</label>
                        <input value={form.section_ref} onChange={(e) => setForm({ ...form, section_ref: e.target.value })} className="input-heritage" data-testid="input-comp-section" />
                    </div>
                    <div>
                        <label className="label-heritage">Penalty Note (optional)</label>
                        <input value={form.penalty_note} onChange={(e) => setForm({ ...form, penalty_note: e.target.value })} className="input-heritage" data-testid="input-comp-penalty" />
                    </div>
                    {err && <div className="text-mpca-oxblood text-sm" data-testid="new-comp-error">{err}</div>}
                    <div className="flex justify-end gap-2 pt-2 border-t border-mpca-brass/20">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="submit-new-comp">
                            {busy ? "Saving…" : "Add"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AuditPackDialog = ({ pack, onClose }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-lg" onClick={(e) => e.stopPropagation()} data-testid="audit-pack-dialog">
            <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment flex justify-between items-center">
                <div><div className="overline">Audit Workpapers</div><div className="font-serif text-lg text-mpca-green-dark mt-1">Consolidated PDF · {pack?.fiscal_cycle}</div></div>
                <button onClick={onClose}><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
                <p className="text-[12px] text-mpca-charcoal">
                    Generates a single audit-ready PDF containing the executive summary, ledger snapshot, fixed-asset register, payroll register list, compliance filings, and outstanding purchase-order commitments. Hand this straight to your statutory auditor.
                </p>
                <div className="grid grid-cols-2 gap-3 border border-mpca-brass/20 divide-x divide-mpca-brass/15" data-testid="pack-preview">
                    {pack && Object.entries(pack.counts).map(([k, v]) => (
                        <div key={k} className="p-3">
                            <div className="text-[10px] uppercase tracking-widest text-mpca-brass">{k.replace(/_/g, " ")}</div>
                            <div className="font-serif text-2xl text-mpca-green-dark mt-1">{v}</div>
                        </div>
                    ))}
                </div>
                {pack && <div className="text-[10px] text-mpca-gray-dark italic">~{pack.estimated_pages} pages · fiscal cycle {pack.fiscal_cycle}</div>}
                <div className="flex justify-end gap-2 pt-2 border-t border-mpca-brass/20">
                    <button onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                    <a href={auditPackDownloadUrl(pack?.fiscal_cycle)} className="btn-heritage-primary bg-mpca-oxblood" data-testid="download-audit-pack">
                        <Download size={12} /> Download PDF
                    </a>
                </div>
            </div>
        </div>
    </div>
);

export default Compliance;
