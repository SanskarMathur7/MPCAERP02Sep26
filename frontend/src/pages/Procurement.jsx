import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchProcurement, createProcurement, addQuotation, awardProcurement, closeProcurement, cancelProcurement,
} from "@/lib/api";
import {
    ShoppingCart, Plus, ChevronRight, Building2, MapPin, Landmark, FileText, Trophy, X, CheckCircle2,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const METHOD_META = {
    Direct:       { label: "Direct",        hint: "< ₹1,00,000",         tone: "lapsed" },
    Three_Quote:  { label: "3-Quote",       hint: "₹1L – ₹75L",          tone: "pending" },
    QCBS:         { label: "QCBS",          hint: "> ₹75L",              tone: "suspended" },
    Open_Tender:  { label: "Open Tender",   hint: "Manual",              tone: "active" },
};
const STATUS_META = {
    Draft:            { label: "Draft",            tone: "lapsed" },
    Quotes_Collected: { label: "Quotes Collected", tone: "pending" },
    Awarded:          { label: "Awarded",          tone: "active" },
    Linked_To_Claim:  { label: "Linked to Claim",  tone: "active" },
    Closed:           { label: "Closed",           tone: "active" },
    Cancelled:        { label: "Cancelled",        tone: "suspended" },
};

const Pill = ({ tone, label, testId }) => (
    <span className={"pill pill-" + tone} data-testid={testId}>{label}</span>
);

// ---------- New PR form ----------
const NewProcurementDialog = ({ open, persona, onClose, onCreated }) => {
    const [form, setForm] = useState({ title: "", description: "", estimated_amount_inr: "", fiscal_cycle: "2025-26" });
    const [busy, setBusy] = useState(false);
    if (!open) return null;
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const pr = await createProcurement({
                body_id: persona.body_code,
                title: form.title.trim(),
                description: form.description.trim() || null,
                estimated_amount_inr: parseFloat(form.estimated_amount_inr),
                fiscal_cycle: form.fiscal_cycle,
            });
            onCreated(pr);
            setForm({ title: "", description: "", estimated_amount_inr: "", fiscal_cycle: "2025-26" });
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="new-pr-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">Procurement · New</div>
                        <div className="font-serif text-2xl mt-1">Raise a Procurement Request</div>
                    </div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-5">
                    <div>
                        <label className="label-heritage">Title *</label>
                        <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input-heritage" data-testid="pr-title" />
                    </div>
                    <div>
                        <label className="label-heritage">Description</label>
                        <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-heritage" data-testid="pr-description" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Estimated Amount (₹) *</label>
                            <input required type="number" min="1" step="1" value={form.estimated_amount_inr} onChange={(e) => setForm((f) => ({ ...f, estimated_amount_inr: e.target.value }))} className="input-heritage" data-testid="pr-amount" />
                            <div className="text-[10px] text-mpca-gray-dark mt-1">
                                {form.estimated_amount_inr && parseFloat(form.estimated_amount_inr) >= 100000 ? "→ 3-Quote rule" : form.estimated_amount_inr && parseFloat(form.estimated_amount_inr) > 7500000 ? "→ QCBS rule" : "→ Direct purchase"}
                            </div>
                        </div>
                        <div>
                            <label className="label-heritage">Cycle</label>
                            <input value={form.fiscal_cycle} onChange={(e) => setForm((f) => ({ ...f, fiscal_cycle: e.target.value }))} className="input-heritage" data-testid="pr-cycle" />
                        </div>
                    </div>
                </div>
                <div className="px-6 pb-5 flex items-center justify-end gap-3">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost" data-testid="pr-cancel">Cancel</button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="pr-create">
                        {busy ? "Creating…" : "Create Draft"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ---------- Quotation dialog ----------
const QuoteDialog = ({ open, pr, onClose, onAdded }) => {
    const [q, setQ] = useState({ vendor_name: "", vendor_gstin: "", quote_amount_inr: "", quote_date: new Date().toISOString().slice(0, 10), notes: "" });
    const [busy, setBusy] = useState(false);
    if (!open || !pr) return null;
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const upd = await addQuotation(pr.id, {
                ...q,
                quote_amount_inr: parseFloat(q.quote_amount_inr),
                vendor_gstin: q.vendor_gstin.trim() || null,
                notes: q.notes.trim() || null,
            });
            onAdded(upd);
            setQ({ vendor_name: "", vendor_gstin: "", quote_amount_inr: "", quote_date: new Date().toISOString().slice(0, 10), notes: "" });
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="quote-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood">
                    <div className="overline !text-mpca-gold-light">Add Quotation · {pr.pr_no}</div>
                    <div className="font-serif text-2xl mt-1">{pr.title}</div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Vendor Name *</label>
                            <input required value={q.vendor_name} onChange={(e) => setQ((s) => ({ ...s, vendor_name: e.target.value }))} className="input-heritage" data-testid="q-vendor" />
                        </div>
                        <div>
                            <label className="label-heritage">Vendor GSTIN</label>
                            <input value={q.vendor_gstin} onChange={(e) => setQ((s) => ({ ...s, vendor_gstin: e.target.value }))} className="input-heritage font-mono" data-testid="q-gstin" />
                        </div>
                        <div>
                            <label className="label-heritage">Quote Amount (₹) *</label>
                            <input required type="number" min="1" value={q.quote_amount_inr} onChange={(e) => setQ((s) => ({ ...s, quote_amount_inr: e.target.value }))} className="input-heritage" data-testid="q-amount" />
                        </div>
                        <div>
                            <label className="label-heritage">Quote Date *</label>
                            <input required type="date" value={q.quote_date} onChange={(e) => setQ((s) => ({ ...s, quote_date: e.target.value }))} className="input-heritage" data-testid="q-date" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Notes</label>
                        <textarea rows={2} value={q.notes} onChange={(e) => setQ((s) => ({ ...s, notes: e.target.value }))} className="input-heritage" data-testid="q-notes" />
                    </div>
                </div>
                <div className="px-6 pb-5 flex items-center justify-end gap-3">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost" data-testid="q-cancel">Cancel</button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="q-add">{busy ? "Adding…" : "Add Quote"}</button>
                </div>
            </form>
        </div>
    );
};

// ---------- Award dialog ----------
const AwardDialog = ({ open, pr, onClose, onAwarded }) => {
    const [vendor, setVendor] = useState("");
    const [amount, setAmount] = useState("");
    const [sec, setSec] = useState("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    if (!open || !pr) return null;
    const quotes = pr.quotations || [];
    const lowest = quotes.length ? quotes.reduce((a, b) => a.quote_amount_inr <= b.quote_amount_inr ? a : b) : null;
    const requiresJustification = vendor && lowest && vendor !== lowest.vendor_name;

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const upd = await awardProcurement(pr.id, {
                awarded_vendor: vendor,
                awarded_amount_inr: parseFloat(amount),
                security_deposit_inr: sec ? parseFloat(sec) : 0,
                notes: notes.trim() || null,
            });
            onAwarded(upd);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="award-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood">
                    <div className="overline !text-mpca-gold-light">Award · {pr.pr_no}</div>
                    <div className="font-serif text-2xl mt-1">{pr.title}</div>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="label-heritage">Award To *</label>
                        <select required value={vendor} onChange={(e) => { setVendor(e.target.value); const q = quotes.find((x) => x.vendor_name === e.target.value); if (q) setAmount(q.quote_amount_inr); }} className="input-heritage" data-testid="aw-vendor">
                            <option value="">— Select vendor —</option>
                            {quotes.map((q) => (
                                <option key={q.vendor_name} value={q.vendor_name}>
                                    {q.vendor_name} · {fmtINR(q.quote_amount_inr)}{lowest && q.vendor_name === lowest.vendor_name ? " · L1" : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Award Amount (₹) *</label>
                            <input required type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-heritage" data-testid="aw-amount" />
                        </div>
                        <div>
                            <label className="label-heritage">Security Deposit (₹)</label>
                            <input type="number" min="0" value={sec} onChange={(e) => setSec(e.target.value)} className="input-heritage" data-testid="aw-sec" />
                        </div>
                    </div>
                    {requiresJustification && (
                        <div className="border border-mpca-oxblood/50 bg-mpca-oxblood/10 p-3 text-xs text-mpca-oxblood" data-testid="aw-justification-warning">
                            ⚠ Awarding to <strong>{vendor}</strong> over L1 <strong>{lowest.vendor_name}</strong> ({fmtINR(lowest.quote_amount_inr)}). A justification note &gt;10 chars is required.
                        </div>
                    )}
                    <div>
                        <label className="label-heritage">Justification / Notes {requiresJustification && "*"}</label>
                        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} required={requiresJustification} className="input-heritage" data-testid="aw-notes" />
                    </div>
                </div>
                <div className="px-6 pb-5 flex items-center justify-end gap-3">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost" data-testid="aw-cancel">Cancel</button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="aw-confirm"><CheckCircle2 size={14} />{busy ? "Awarding…" : "Award"}</button>
                </div>
            </form>
        </div>
    );
};

// ---------- Detail drawer ----------
const DetailDrawer = ({ pr, persona, onClose, onAddQuote, onAward, onClosed, onCancelled }) => {
    if (!pr) return null;
    const quotes = pr.quotations || [];
    const lowest = quotes.length ? quotes.reduce((a, b) => a.quote_amount_inr <= b.quote_amount_inr ? a : b) : null;
    const canManage = persona && (persona.body_code === pr.body_id || persona.body_type === "State");
    return (
        <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" data-testid="pr-drawer">
            <div className="bg-mpca-ivory w-full max-w-2xl h-full overflow-y-auto border-l-2 border-mpca-brass">
                <div className="bg-mpca-green-dark text-mpca-ivory px-7 py-6 border-b-4 border-mpca-oxblood relative">
                    <button onClick={onClose} data-testid="pr-drawer-close" className="absolute top-4 right-5 text-mpca-gold-light hover:text-mpca-oxblood text-2xl">×</button>
                    <div className="overline !text-mpca-gold-light">{pr.pr_no} · {pr.fiscal_cycle}</div>
                    <div className="font-serif text-3xl mt-2 leading-tight">{pr.title}</div>
                    <div className="text-sm text-mpca-gold-light/85 mt-3">From <strong>{pr.body_id}</strong></div>
                    <div className="font-serif text-4xl text-mpca-gold-light mt-4">{fmtINR(pr.estimated_amount_inr)}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Pill tone={METHOD_META[pr.method]?.tone} label={METHOD_META[pr.method]?.label + " · " + METHOD_META[pr.method]?.hint} testId={"pr-method-" + pr.method} />
                        <Pill tone={STATUS_META[pr.status]?.tone} label={STATUS_META[pr.status]?.label} testId={"pr-status-" + pr.status} />
                    </div>
                </div>
                <div className="p-7 space-y-7">
                    {pr.description && (
                        <div>
                            <div className="overline mb-2">Description</div>
                            <p className="text-sm text-mpca-charcoal leading-relaxed">{pr.description}</p>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="overline">Quotations Received ({quotes.length})</div>
                            {canManage && pr.status === "Draft" || pr.status === "Quotes_Collected" ? (
                                <button onClick={() => onAddQuote(pr)} className="btn-heritage-ghost" data-testid="add-quote-btn">
                                    <Plus size={12} /> Add Quote
                                </button>
                            ) : null}
                        </div>
                        {quotes.length === 0 ? (
                            <div className="text-sm italic text-mpca-gray-dark border border-dashed border-mpca-brass/40 p-4">
                                No quotations yet. {pr.method !== "Direct" && "At least 3 are required before award."}
                            </div>
                        ) : (
                            <div className="border border-mpca-brass/30">
                                {quotes.map((q, i) => (
                                    <div key={i} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0 border-mpca-brass/20" data-testid={"q-row-" + i}>
                                        <div>
                                            <div className="font-serif text-base text-mpca-green-dark">
                                                {q.vendor_name}
                                                {lowest && q.vendor_name === lowest.vendor_name && (
                                                    <span className="ml-2 text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 bg-mpca-green-dark text-mpca-ivory">L1</span>
                                                )}
                                                {pr.awarded_vendor === q.vendor_name && (
                                                    <span className="ml-2 text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 bg-mpca-oxblood text-mpca-ivory">Awarded</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-mpca-gray-dark mt-0.5 font-mono">
                                                {q.vendor_gstin || "—"} · {fmtDate(q.quote_date)}
                                            </div>
                                        </div>
                                        <div className="font-mono text-lg text-mpca-green-dark">{fmtINR(q.quote_amount_inr)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {pr.awarded_vendor && (
                        <div className="border border-mpca-oxblood/40 p-4 bg-mpca-oxblood/5">
                            <div className="overline !text-mpca-oxblood">Awarded</div>
                            <div className="font-serif text-xl text-mpca-green-dark mt-1">{pr.awarded_vendor}</div>
                            <div className="text-sm text-mpca-charcoal mt-1">{fmtINR(pr.awarded_amount_inr)} · Security {fmtINR(pr.security_deposit_inr)} · EMD {fmtINR(pr.emd_inr)}</div>
                            {pr.notes && <p className="text-xs italic text-mpca-gray-dark mt-2">"{pr.notes}"</p>}
                        </div>
                    )}

                    {canManage && (
                        <div className="pt-6 border-t border-mpca-brass/30">
                            <div className="overline mb-3">Actions</div>
                            <div className="flex flex-wrap gap-3">
                                {(pr.status === "Draft" || pr.status === "Quotes_Collected") && (
                                    <button onClick={() => onAward(pr)} className="btn-heritage-primary" data-testid="pr-award-btn">
                                        <Trophy size={14} /> Award Contract
                                    </button>
                                )}
                                {pr.status === "Awarded" && (
                                    <button onClick={() => onClosed(pr)} className="btn-heritage-primary" data-testid="pr-close-btn">
                                        <CheckCircle2 size={14} /> Mark Closed
                                    </button>
                                )}
                                {!["Closed", "Cancelled"].includes(pr.status) && (
                                    <button onClick={() => onCancelled(pr)} className="btn-heritage-secondary" data-testid="pr-cancel-btn">
                                        <X size={14} /> Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Procurement = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [quoteTarget, setQuoteTarget] = useState(null);
    const [awardTarget, setAwardTarget] = useState(null);

    const load = async () => {
        const d = await fetchProcurement();
        setRows(d);
    };
    useEffect(() => {
        (async () => {
            try { await load(); } finally { setLoading(false); }
        })();
    }, []);

    const filtered = useMemo(() => {
        if (filter === "all") return rows;
        if (filter === "mine") return persona ? rows.filter((r) => r.body_id === persona.body_code) : rows;
        return rows.filter((r) => r.status === filter);
    }, [rows, filter, persona]);

    const canCreate = persona && persona.body_type !== "Public";

    const refresh = async (updatedPr) => {
        await load();
        if (updatedPr) setSelected(updatedPr);
    };

    if (loading) return <div className="p-16" data-testid="proc-loading"><CricketLoader size="lg" label="Loading procurement register…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="procurement-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Phase III.8 · Procurement Protocol</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Procurement Register
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        3-quote for ₹1L–₹75L · QCBS for &gt;₹75L · L1-or-justify · EMD &amp; Security tracked.
                    </p>
                </div>
                {canCreate && (
                    <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="new-pr-btn">
                        <Plus size={14} /> New Procurement Request
                    </button>
                )}
            </div>

            <div className="crest-divider mb-10" />

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                {[
                    ["all",              "All"],
                    ["mine",             "From My Body"],
                    ["Draft",            "Draft"],
                    ["Quotes_Collected", "Quotes Collected"],
                    ["Awarded",          "Awarded"],
                    ["Closed",           "Closed"],
                    ["Cancelled",        "Cancelled"],
                ].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setFilter(k)}
                        data-testid={"proc-filter-" + k}
                        className={"px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold border transition-colors " + (filter === k ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:bg-mpca-parchment")}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="bulletin-card overflow-hidden" data-testid="proc-list">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No procurement requests match this filter.</div>
                ) : (
                    filtered.map((p) => {
                        const TypeIcon = p.body_id.startsWith("DIV") ? Building2 : p.body_id.startsWith("DIST") ? MapPin : Landmark;
                        return (
                            <button key={p.id} onClick={() => setSelected(p)} data-testid={"proc-row-" + p.pr_no} className="ledger-row w-full text-left flex flex-wrap items-center gap-4 px-6 py-4">
                                <div className="font-mono text-[10px] text-mpca-brass tracking-wider w-28">{p.pr_no}</div>
                                <div className="flex-1 min-w-[280px]">
                                    <div className="font-serif text-lg text-mpca-green-dark leading-tight">{p.title}</div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-1 flex items-center gap-2">
                                        <TypeIcon size={11} />{p.body_id} · {p.quotations?.length || 0} quote{(p.quotations?.length || 0) === 1 ? "" : "s"}
                                        {p.awarded_vendor && <> · awarded to <strong>{p.awarded_vendor}</strong></>}
                                    </div>
                                </div>
                                <div className="font-serif text-xl text-mpca-green-dark whitespace-nowrap">{fmtINR(p.awarded_amount_inr || p.estimated_amount_inr)}</div>
                                <Pill tone={METHOD_META[p.method]?.tone} label={METHOD_META[p.method]?.label} testId={"row-method-" + p.method} />
                                <Pill tone={STATUS_META[p.status]?.tone} label={STATUS_META[p.status]?.label} testId={"row-status-" + p.status} />
                                <ChevronRight size={14} className="text-mpca-gray" />
                            </button>
                        );
                    })
                )}
            </div>

            <DetailDrawer
                pr={selected}
                persona={persona}
                onClose={() => setSelected(null)}
                onAddQuote={(p) => setQuoteTarget(p)}
                onAward={(p) => setAwardTarget(p)}
                onClosed={async (p) => { try { const u = await closeProcurement(p.id); await refresh(u); } catch (e) { alert(e?.response?.data?.detail || e.message); } }}
                onCancelled={async (p) => { try { const u = await cancelProcurement(p.id); await refresh(u); } catch (e) { alert(e?.response?.data?.detail || e.message); } }}
            />
            <NewProcurementDialog
                open={showNew}
                persona={persona}
                onClose={() => setShowNew(false)}
                onCreated={async (pr) => { setShowNew(false); await load(); setSelected(pr); }}
            />
            <QuoteDialog
                open={!!quoteTarget}
                pr={quoteTarget}
                onClose={() => setQuoteTarget(null)}
                onAdded={async (u) => { setQuoteTarget(null); await refresh(u); }}
            />
            <AwardDialog
                open={!!awardTarget}
                pr={awardTarget}
                onClose={() => setAwardTarget(null)}
                onAwarded={async (u) => { setAwardTarget(null); await refresh(u); }}
            />
        </div>
    );
};

export default Procurement;
