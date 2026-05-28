import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFees, generateInvoices, payInvoice } from "@/lib/api";
import { Receipt, Plus, CheckCircle2, AlertCircle, IndianRupee } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const STATUS_PILL = {
    Pending: "pill-pending",
    Paid: "pill-active",
    Overdue: "pill-suspended",
    Waived: "pill-lapsed",
};

const FILTERS = ["All", "Pending", "Paid", "Overdue", "Waived"];

const inr = (n) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);

const Fees = () => {
    const [fees, setFees] = useState([]);
    const [filter, setFilter] = useState("All");
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [msg, setMsg] = useState("");

    const load = async () => {
        const data = await fetchFees();
        setFees(data);
    };

    useEffect(() => {
        (async () => {
            try {
                await load();
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        if (filter === "All") return fees;
        return fees.filter((f) => f.status === filter);
    }, [fees, filter]);

    const totals = useMemo(() => {
        const total = fees.length;
        const paid = fees.filter((f) => f.status === "Paid").length;
        const outstanding = fees
            .filter((f) => f.status === "Pending" || f.status === "Overdue")
            .reduce((acc, f) => acc + f.amount + (f.late_fee || 0), 0);
        const collected = fees
            .filter((f) => f.status === "Paid")
            .reduce((acc, f) => acc + f.amount, 0);
        return { total, paid, outstanding, collected, pct: total ? Math.round((paid / total) * 100) : 0 };
    }, [fees]);

    const handleGenerate = async () => {
        if (!window.confirm("Generate invoices for cycle 2025-26 for all active members? Existing invoices will be skipped.")) return;
        setGenerating(true);
        setMsg("");
        try {
            const r = await generateInvoices("2025-26", 3000, "2025-12-31");
            setMsg(`Generated ${r.created} new invoices.`);
            await load();
        } catch (e) {
            setMsg(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const handlePay = async (inv) => {
        if (!window.confirm(`Mark invoice ${inv.invoice_no} for ${inv.member_name} as Paid?`)) return;
        await payInvoice(inv.id);
        await load();
    };

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="fees-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article XIII · Fees & Subscriptions</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        The Subscription Ledger
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The annual subscription cycle runs 1 September – 31 August.
                        Defaulters beyond 31 December attract a penalty per Article 17(c)
                        and lose voting rights at the AGM.
                    </p>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="btn-heritage-primary disabled:opacity-50"
                    data-testid="generate-invoices-btn"
                >
                    <Plus size={14} strokeWidth={1.5} /> {generating ? "Generating…" : "Generate Cycle 2025-26"}
                </button>
            </div>
            {msg && (
                <div className="text-sm text-mpca-green-dark italic mb-6" data-testid="generate-msg">{msg}</div>
            )}

            <div className="crest-divider mb-10" />

            {/* Summary tiles */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-12">
                <div className="bulletin-card p-7" data-testid="summary-collected">
                    <div className="flex items-center justify-between mb-5">
                        <IndianRupee className="text-mpca-green-dark" size={20} strokeWidth={1.25} />
                        <div className="overline">Collected</div>
                    </div>
                    <div className="font-serif text-4xl text-mpca-green-dark leading-none">₹{inr(totals.collected)}</div>
                    <div className="mt-2 text-xs text-mpca-gray-dark">From {totals.paid} paid invoices</div>
                </div>
                <div className="bulletin-card p-7" data-testid="summary-outstanding">
                    <div className="flex items-center justify-between mb-5">
                        <AlertCircle className="text-mpca-oxblood" size={20} strokeWidth={1.25} />
                        <div className="overline">Outstanding</div>
                    </div>
                    <div className="font-serif text-4xl text-mpca-oxblood leading-none">₹{inr(totals.outstanding)}</div>
                    <div className="mt-2 text-xs text-mpca-gray-dark">
                        {fees.filter((f) => f.status !== "Paid" && f.status !== "Waived").length} pending / overdue
                    </div>
                </div>
                <div className="bulletin-card p-7">
                    <div className="flex items-center justify-between mb-5">
                        <Receipt className="text-mpca-brass" size={20} strokeWidth={1.25} />
                        <div className="overline">Total Invoices</div>
                    </div>
                    <div className="font-serif text-4xl text-mpca-green-dark leading-none">{totals.total}</div>
                    <div className="mt-2 text-xs text-mpca-gray-dark">Across all cycles</div>
                </div>
                <div className="bulletin-card p-7">
                    <div className="flex items-center justify-between mb-5">
                        <CheckCircle2 className="text-mpca-green-dark" size={20} strokeWidth={1.25} />
                        <div className="overline">Collection Rate</div>
                    </div>
                    <div className="font-serif text-4xl text-mpca-green-dark leading-none">{totals.pct}%</div>
                    <div className="h-[3px] bg-mpca-brass/15 relative mt-3">
                        <div
                            className="absolute inset-y-0 left-0 bg-mpca-green-dark transition-all duration-1000"
                            style={{ width: `${totals.pct}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-2 mb-6">
                {FILTERS.map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        data-testid={`fee-filter-${f.toLowerCase()}`}
                        className={`px-4 py-2 text-xs uppercase tracking-[0.18em] border transition-all duration-300 ${
                            filter === f
                                ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:border-mpca-brass"
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Ledger */}
            {loading ? (
                <CricketLoader label="Reading the ledger…" />
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bulletin-card" data-testid="fees-empty">
                    <Receipt className="mx-auto text-mpca-brass mb-4" size={36} strokeWidth={1} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No invoices in this view.</div>
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden" data-testid="fees-ledger">
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-mpca-green-dark text-mpca-gold-light border-b border-mpca-brass/40">
                        <div className="col-span-2 overline !text-mpca-gold-light">Invoice №</div>
                        <div className="col-span-3 overline !text-mpca-gold-light">Member</div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Cycle</div>
                        <div className="col-span-2 overline !text-mpca-gold-light text-right">Amount</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Due</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Status</div>
                        <div className="col-span-1"></div>
                    </div>

                    {filtered.map((inv) => (
                        <div
                            key={inv.id}
                            className="ledger-row grid grid-cols-12 gap-4 px-6 py-4 items-center"
                            data-testid={`fee-row-${inv.invoice_no}`}
                        >
                            <div className="col-span-2 font-mono text-[10px] text-mpca-brass tracking-wider">
                                {inv.invoice_no}
                            </div>
                            <div className="col-span-3">
                                <div className="font-serif text-base text-mpca-green-dark leading-tight">
                                    {inv.member_name}
                                </div>
                                <div className="font-mono text-[10px] text-mpca-gray-dark mt-0.5 tracking-wider">
                                    {inv.member_uid}
                                </div>
                            </div>
                            <div className="col-span-2 text-xs text-mpca-charcoal">{inv.cycle}</div>
                            <div className="col-span-2 text-right font-mono text-mpca-charcoal">
                                ₹{inr(inv.amount + (inv.late_fee || 0))}
                                {inv.late_fee > 0 && (
                                    <div className="text-[10px] text-mpca-oxblood">+ ₹{inr(inv.late_fee)} penalty</div>
                                )}
                            </div>
                            <div className="col-span-1 font-mono text-[11px] text-mpca-charcoal">
                                {new Date(inv.due_date).toLocaleDateString("en-GB")}
                            </div>
                            <div className="col-span-1">
                                <span className={`pill ${STATUS_PILL[inv.status]}`}>{inv.status}</span>
                            </div>
                            <div className="col-span-1 text-right">
                                {inv.status !== "Paid" && inv.status !== "Waived" ? (
                                    <button
                                        onClick={() => handlePay(inv)}
                                        className="btn-heritage-ghost"
                                        data-testid={`mark-paid-${inv.invoice_no}`}
                                    >
                                        Mark Paid
                                    </button>
                                ) : inv.payment_ref ? (
                                    <span className="text-[10px] text-mpca-gray-dark font-mono tracking-wider">
                                        {inv.payment_ref}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-6 text-xs text-mpca-gray-dark italic font-serif">
                Members may pay their dues directly via the public Pay Dues portal at <span className="font-mono">/member-profile/&#123;UID&#125;</span> — scan their MPCA ID card QR.
            </div>
        </div>
    );
};

export default Fees;
