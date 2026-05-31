import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchVendorBills, fetchVendors, createVendorBill, submitVendorBill,
    verifyVendorBill, sanctionVendorBill, payVendorBill, rejectVendorBill,
    returnVendorBill, deleteVendorBill, fetchVendorBillStats,
} from "@/lib/api";
import {
    FileCheck, Plus, ChevronRight, CheckCircle2, XCircle, RotateCcw,
    Hotel, Plane, Boxes, HardHat, UtensilsCrossed, Printer, Wrench, Package, X, Send, Wallet,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import FileUpload from "@/components/FileUpload";

const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const CAT_ICON = {
    Hotel, Travel: Plane, Material: Boxes, Infra: HardHat,
    Catering: UtensilsCrossed, Printing: Printer, Services: Wrench, Other: Package,
};
const STATUS_META = {
    Draft:      { label: "Draft",      tone: "lapsed" },
    Submitted:  { label: "Submitted",  tone: "pending" },
    Verified:   { label: "Verified",   tone: "pending" },
    Sanctioned: { label: "Sanctioned", tone: "pending" },
    Paid:       { label: "Paid",       tone: "active" },
    Rejected:   { label: "Rejected",   tone: "suspended" },
    Returned:   { label: "Returned",   tone: "suspended" },
};

const RETURN_CODES = [
    { code: "DOCS_MISSING",     label: "Supporting documents missing" },
    { code: "AMOUNT_MISMATCH",  label: "Bill amount does not match supporting docs" },
    { code: "GST_INCORRECT",    label: "GST / TDS computation incorrect" },
    { code: "DUPLICATE_BILL",   label: "Possible duplicate of existing bill" },
    { code: "OUT_OF_SCOPE",     label: "Expense not within sanctioned scope" },
    { code: "OTHER",            label: "Other (see notes)" },
];

const Pill = ({ tone, label, testId }) => (
    <span className={"pill pill-" + tone} data-testid={testId}>{label}</span>
);

// ────────── New Bill Form ──────────
const NewBillDialog = ({ open, persona, onClose, onCreated }) => {
    const [vendors, setVendors] = useState([]);
    const [form, setForm] = useState({
        vendor_id: "", category: "Hotel", bill_no_external: "",
        bill_date: new Date().toISOString().slice(0, 10), description: "",
        base_amount_inr: "", gst_inr: "0", tds_inr: "0",
        fiscal_cycle: "2025-26",
    });
    const [docs, setDocs] = useState([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        fetchVendors({ include_blacklisted: false }).then(setVendors).catch(() => setVendors([]));
    }, [open]);

    // Auto-derive category from chosen vendor
    useEffect(() => {
        const v = vendors.find((x) => x.id === form.vendor_id);
        if (v && v.category !== form.category) {
            setForm((f) => ({ ...f, category: v.category }));
        }
        // eslint-disable-next-line
    }, [form.vendor_id]);

    if (!open) return null;

    const total = (parseFloat(form.base_amount_inr) || 0)
        + (parseFloat(form.gst_inr) || 0)
        - (parseFloat(form.tds_inr) || 0);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = {
                body_id: persona.body_code || "MPCA",
                vendor_id: form.vendor_id,
                category: form.category,
                bill_no_external: form.bill_no_external.trim() || null,
                bill_date: form.bill_date,
                description: form.description.trim(),
                base_amount_inr: parseFloat(form.base_amount_inr),
                gst_inr: parseFloat(form.gst_inr) || 0,
                tds_inr: parseFloat(form.tds_inr) || 0,
                total_amount_inr: total,
                fiscal_cycle: form.fiscal_cycle,
                supporting_doc_urls: docs.map((d) => d.url),
                created_by: persona.name,
            };
            const bill = await createVendorBill(payload);
            onCreated(bill);
            setDocs([]);
            setForm({
                vendor_id: "", category: "Hotel", bill_no_external: "",
                bill_date: new Date().toISOString().slice(0, 10), description: "",
                base_amount_inr: "", gst_inr: "0", tds_inr: "0",
                fiscal_cycle: "2025-26",
            });
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="new-bill-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between sticky top-0 z-10">
                    <div>
                        <div className="overline !text-mpca-gold-light">Vendor Bills · New</div>
                        <div className="font-serif text-2xl mt-1">Raise a Vendor Bill</div>
                    </div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-5">
                    <div>
                        <label className="label-heritage">Vendor *</label>
                        <select required value={form.vendor_id} onChange={(e) => setForm((f) => ({ ...f, vendor_id: e.target.value }))} className="input-heritage" data-testid="bill-vendor">
                            <option value="">— Choose a vendor —</option>
                            {vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name} · {v.category} {v.gstin ? `(${v.gstin})` : ""}
                                </option>
                            ))}
                        </select>
                        {vendors.length === 0 && (
                            <div className="text-xs text-mpca-oxblood mt-1">No active vendors found. Empanel one first under Vendor Master.</div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Vendor's Bill / Invoice No.</label>
                            <input value={form.bill_no_external} onChange={(e) => setForm((f) => ({ ...f, bill_no_external: e.target.value }))} className="input-heritage" data-testid="bill-no-external" />
                        </div>
                        <div>
                            <label className="label-heritage">Bill Date *</label>
                            <input required type="date" value={form.bill_date} onChange={(e) => setForm((f) => ({ ...f, bill_date: e.target.value }))} className="input-heritage" data-testid="bill-date" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Description *</label>
                        <textarea required rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-heritage" data-testid="bill-description" placeholder="e.g. Team accommodation · 12 rooms × 3 nights · MY Memorial Trophy" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="label-heritage">Base Amount (₹) *</label>
                            <input required type="number" min="0" step="0.01" value={form.base_amount_inr} onChange={(e) => setForm((f) => ({ ...f, base_amount_inr: e.target.value }))} className="input-heritage" data-testid="bill-base" />
                        </div>
                        <div>
                            <label className="label-heritage">GST (₹)</label>
                            <input type="number" min="0" step="0.01" value={form.gst_inr} onChange={(e) => setForm((f) => ({ ...f, gst_inr: e.target.value }))} className="input-heritage" data-testid="bill-gst" />
                        </div>
                        <div>
                            <label className="label-heritage">TDS Withheld (₹)</label>
                            <input type="number" min="0" step="0.01" value={form.tds_inr} onChange={(e) => setForm((f) => ({ ...f, tds_inr: e.target.value }))} className="input-heritage" data-testid="bill-tds" />
                        </div>
                    </div>
                    <div className="bg-mpca-cream border-l-4 border-mpca-gold-light p-3 flex items-center justify-between">
                        <span className="overline">Net Payable</span>
                        <span className="font-serif text-2xl text-mpca-navy" data-testid="bill-total">{fmtINR(total)}</span>
                    </div>
                    <div>
                        <label className="label-heritage">Supporting Documents (invoice copy, GST cert, etc.)</label>
                        <FileUpload
                            uploadedBy={persona.name}
                            relatedType="vendor_bill"
                            bodyId={persona.body_code || "MPCA"}
                            files={docs}
                            onChange={setDocs}
                        />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy || !form.vendor_id || !form.description.trim() || !form.base_amount_inr} className="btn-heritage-primary" data-testid="bill-save">
                        {busy ? "Saving…" : "Save as Draft"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ────────── Action dialog (for verify / sanction / pay / reject / return / submit) ──────────
const ActionDialog = ({ bill, action, persona, onClose, onDone }) => {
    const [notes, setNotes] = useState("");
    const [returnCode, setReturnCode] = useState("DOCS_MISSING");
    const [busy, setBusy] = useState(false);
    if (!bill || !action) return null;

    const META = {
        submit:   { title: "Submit for Verification",   verb: "Submit",   color: "primary" },
        verify:   { title: "Verify Bill (Accounts)",    verb: "Verify",   color: "primary" },
        sanction: { title: "Sanction Bill (Treasurer)", verb: "Sanction", color: "primary" },
        pay:      { title: "Release Payment",           verb: "Pay",      color: "primary" },
        reject:   { title: "Reject Bill",               verb: "Reject",   color: "secondary" },
        ret:      { title: "Return for Correction",     verb: "Return",   color: "secondary" },
    }[action];

    const handleConfirm = async () => {
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
            const fn = {
                submit: submitVendorBill, verify: verifyVendorBill,
                sanction: sanctionVendorBill, pay: payVendorBill,
                reject: rejectVendorBill, ret: returnVendorBill,
            }[action];
            const updated = await fn(bill.id, payload);
            onDone(updated);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid={`action-${action}-dialog`}>
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-md w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">{bill.bill_no}</div>
                        <div className="font-serif text-2xl mt-1">{META.title}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-mpca-cream border-l-4 border-mpca-gold-light p-3 text-sm">
                        <div><span className="overline mr-2">Vendor</span> {bill.vendor_name}</div>
                        <div><span className="overline mr-2">Net Payable</span> <strong>{fmtINR(bill.total_amount_inr)}</strong></div>
                    </div>
                    {action === "ret" && (
                        <div>
                            <label className="label-heritage">Reason Code *</label>
                            <select value={returnCode} onChange={(e) => setReturnCode(e.target.value)} className="input-heritage" data-testid="return-code">
                                {RETURN_CODES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="label-heritage">{action === "ret" ? "Details / Specifics" : "Notes"}</label>
                        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-heritage" data-testid="action-notes" placeholder={action === "pay" ? "e.g. NEFT released via SBI General A/c" : "Optional notes for the audit trail"} />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button onClick={handleConfirm} disabled={busy} className={`btn-heritage-${META.color}`} data-testid="action-confirm">
                        {busy ? "Working…" : META.verb}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ────────── Page ──────────
export default function VendorBills() {
    const { persona } = useAuth();
    const [bills, setBills] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("All");
    const [filterCat, setFilterCat] = useState("All");
    const [newOpen, setNewOpen] = useState(false);
    const [actionState, setActionState] = useState({ bill: null, action: null });
    const [expanded, setExpanded] = useState({});

    const reload = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterStatus !== "All") params.status = filterStatus;
            if (filterCat !== "All") params.category = filterCat;
            const [data, s] = await Promise.all([fetchVendorBills(params), fetchVendorBillStats()]);
            setBills(data);
            setStats(s);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [filterStatus, filterCat]);

    const canCreate = persona && ["president", "secretary", "treasurer", "division-secretary", "district-secretary"].includes(persona.id);
    const canVerify = persona && persona.id === "secretary" && persona.body_code === "MPCA";   // MPCA Secretary acts as Accounts in MVP
    const canSanction = persona && persona.id === "treasurer" && persona.body_code === "MPCA";
    const canPay = canSanction;

    const handleDelete = async (b) => {
        if (!window.confirm(`Delete bill ${b.bill_no}?`)) return;
        try { await deleteVendorBill(b.id); reload(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const actionButtons = (b) => {
        const buttons = [];
        const isOriginator = persona && (b.created_by === persona.name);
        if (b.status === "Draft" && (isOriginator || canCreate)) {
            buttons.push(
                <button key="submit" onClick={() => setActionState({ bill: b, action: "submit" })} className="btn-heritage-primary flex items-center gap-1 text-xs px-3 py-1" data-testid={`submit-${b.id}`}>
                    <Send className="w-3 h-3" /> Submit
                </button>
            );
            buttons.push(
                <button key="del" onClick={() => handleDelete(b)} className="btn-heritage-ghost flex items-center gap-1 text-xs px-3 py-1" data-testid={`delete-${b.id}`}>
                    <X className="w-3 h-3" /> Delete
                </button>
            );
        }
        if (b.status === "Returned" && (isOriginator || canCreate)) {
            buttons.push(
                <button key="resub" onClick={() => setActionState({ bill: b, action: "submit" })} className="btn-heritage-primary flex items-center gap-1 text-xs px-3 py-1" data-testid={`resubmit-${b.id}`}>
                    <RotateCcw className="w-3 h-3" /> Re-Submit
                </button>
            );
        }
        if (b.status === "Submitted" && canVerify) {
            buttons.push(
                <button key="verify" onClick={() => setActionState({ bill: b, action: "verify" })} className="btn-heritage-primary flex items-center gap-1 text-xs px-3 py-1" data-testid={`verify-${b.id}`}>
                    <CheckCircle2 className="w-3 h-3" /> Verify
                </button>
            );
            buttons.push(
                <button key="ret" onClick={() => setActionState({ bill: b, action: "ret" })} className="btn-heritage-secondary flex items-center gap-1 text-xs px-3 py-1" data-testid={`return-${b.id}`}>
                    <RotateCcw className="w-3 h-3" /> Return
                </button>
            );
            buttons.push(
                <button key="rej" onClick={() => setActionState({ bill: b, action: "reject" })} className="btn-heritage-ghost flex items-center gap-1 text-xs px-3 py-1 text-mpca-oxblood" data-testid={`reject-${b.id}`}>
                    <XCircle className="w-3 h-3" /> Reject
                </button>
            );
        }
        if (b.status === "Verified" && canSanction) {
            buttons.push(
                <button key="sanc" onClick={() => setActionState({ bill: b, action: "sanction" })} className="btn-heritage-primary flex items-center gap-1 text-xs px-3 py-1" data-testid={`sanction-${b.id}`}>
                    <CheckCircle2 className="w-3 h-3" /> Sanction
                </button>
            );
            buttons.push(
                <button key="ret" onClick={() => setActionState({ bill: b, action: "ret" })} className="btn-heritage-secondary flex items-center gap-1 text-xs px-3 py-1" data-testid={`return-${b.id}`}>
                    <RotateCcw className="w-3 h-3" /> Return
                </button>
            );
        }
        if (b.status === "Sanctioned" && canPay) {
            buttons.push(
                <button key="pay" onClick={() => setActionState({ bill: b, action: "pay" })} className="btn-heritage-primary flex items-center gap-1 text-xs px-3 py-1" data-testid={`pay-${b.id}`}>
                    <Wallet className="w-3 h-3" /> Release Payment
                </button>
            );
        }
        return buttons;
    };

    return (
        <div className="space-y-8" data-testid="vendor-bills-page">
            <div className="flex items-center justify-between">
                <div>
                    <div className="overline">Financial · Vendor Bills</div>
                    <h1 className="font-serif text-4xl text-mpca-navy mt-1">Vendor Bills</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Submit → Verify (Accounts) → Sanction (Treasurer) → Pay. Every bill traces back to an empanelled vendor and books a Debit transaction on payment.
                    </p>
                </div>
                {canCreate && (
                    <button onClick={() => setNewOpen(true)} className="btn-heritage-primary flex items-center gap-2" data-testid="new-bill-btn">
                        <Plus className="w-4 h-4" /> Raise Bill
                    </button>
                )}
            </div>

            {/* Stats strip */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="border-l-4 border-mpca-navy bg-mpca-cream/70 p-4">
                        <div className="overline">Total Bills</div>
                        <div className="font-serif text-3xl text-mpca-navy mt-1" data-testid="stat-total-bills">{stats.total_bills}</div>
                    </div>
                    <div className="border-l-4 border-mpca-saffron bg-mpca-cream/70 p-4">
                        <div className="overline">In Flight</div>
                        <div className="font-serif text-2xl text-mpca-saffron mt-1" data-testid="stat-inflight">{fmtINR(stats.amount_in_flight_inr)}</div>
                        <div className="text-xs text-mpca-gray-dark mt-1">{stats.pending_bills} pending</div>
                    </div>
                    <div className="border-l-4 border-mpca-green-dark bg-mpca-cream/70 p-4">
                        <div className="overline">Paid</div>
                        <div className="font-serif text-2xl text-mpca-green-dark mt-1" data-testid="stat-paid">{fmtINR(stats.amount_paid_inr)}</div>
                        <div className="text-xs text-mpca-gray-dark mt-1">{stats.paid_bills} bills</div>
                    </div>
                    <div className="border-l-4 border-mpca-oxblood bg-mpca-cream/70 p-4">
                        <div className="overline">Rejected</div>
                        <div className="font-serif text-2xl text-mpca-oxblood mt-1" data-testid="stat-rejected">{fmtINR(stats.amount_rejected_inr)}</div>
                        <div className="text-xs text-mpca-gray-dark mt-1">{stats.rejected_bills} bills</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4 border-b border-mpca-brass/30 pb-4">
                <div>
                    <label className="label-heritage">Status</label>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-heritage" data-testid="filter-status">
                        <option value="All">All</option>
                        {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label-heritage">Category</label>
                    <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="input-heritage" data-testid="filter-category">
                        <option value="All">All</option>
                        {Object.keys(CAT_ICON).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {loading ? (
                <CricketLoader label="Loading bills…" />
            ) : bills.length === 0 ? (
                <div className="text-center py-16 text-mpca-gray-dark" data-testid="empty-bills">
                    <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    No bills match these filters.
                </div>
            ) : (
                <div className="space-y-3">
                    {bills.map((b) => {
                        const Icon = CAT_ICON[b.category] || Package;
                        const isOpen = expanded[b.id];
                        const meta = STATUS_META[b.status] || { label: b.status, tone: "lapsed" };
                        return (
                            <div key={b.id} className="border border-mpca-brass/40 bg-mpca-ivory" data-testid={`bill-${b.id}`}>
                                <button onClick={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))} className="w-full flex items-center gap-4 p-4 text-left hover:bg-mpca-cream/40 transition-colors">
                                    <Icon className="w-8 h-8 text-mpca-navy shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="overline">{b.bill_no}</span>
                                            <Pill tone={meta.tone} label={meta.label} testId={`status-${b.id}`} />
                                            <span className="text-xs text-mpca-gray-dark">{b.category}</span>
                                        </div>
                                        <div className="font-serif text-lg text-mpca-navy mt-1 truncate">{b.vendor_name}</div>
                                        <div className="text-xs text-mpca-gray-dark mt-1 truncate">{b.description}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-serif text-xl text-mpca-navy" data-testid={`amount-${b.id}`}>{fmtINR(b.total_amount_inr)}</div>
                                        <div className="text-xs text-mpca-gray-dark">{fmtDate(b.bill_date)}</div>
                                    </div>
                                    <ChevronRight className={"w-5 h-5 text-mpca-gray-dark transition-transform " + (isOpen ? "rotate-90" : "")} />
                                </button>
                                {isOpen && (
                                    <div className="border-t border-mpca-brass/30 p-4 space-y-4 bg-mpca-cream/30">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                            <div><span className="overline">Vendor Bill No</span><div>{b.bill_no_external || "—"}</div></div>
                                            <div><span className="overline">Base</span><div>{fmtINR(b.base_amount_inr)}</div></div>
                                            <div><span className="overline">GST</span><div>{fmtINR(b.gst_inr)}</div></div>
                                            <div><span className="overline">TDS</span><div>{fmtINR(b.tds_inr)}</div></div>
                                        </div>
                                        {b.supporting_doc_urls?.length > 0 && (
                                            <div className="text-sm">
                                                <div className="overline mb-1">Supporting Documents ({b.supporting_doc_urls.length})</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {b.supporting_doc_urls.map((url, i) => (
                                                        <a key={i} href={`${process.env.REACT_APP_BACKEND_URL}${url}`} target="_blank" rel="noreferrer" className="px-2 py-1 bg-mpca-ivory border border-mpca-brass/40 text-xs hover:bg-mpca-cream">
                                                            📎 Doc {i + 1}
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {b.return_reason_code && (
                                            <div className="bg-mpca-oxblood/10 border-l-2 border-mpca-oxblood text-mpca-oxblood text-xs p-2">
                                                <strong>Returned for:</strong> {b.return_reason_code}
                                                {b.return_reason_detail && <div className="mt-1">{b.return_reason_detail}</div>}
                                            </div>
                                        )}
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
                                            {actionButtons(b)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <NewBillDialog open={newOpen} persona={persona || {}} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); reload(); }} />
            <ActionDialog
                bill={actionState.bill}
                action={actionState.action}
                persona={persona || {}}
                onClose={() => setActionState({ bill: null, action: null })}
                onDone={() => reload()}
            />
        </div>
    );
}
