import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchBankAccount, fetchTransactions, addTransaction } from "@/lib/api";
import { ArrowLeft, Plus, ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";

const inr = (n) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);

const BankAccountDetail = () => {
    const { id } = useParams();
    const [account, setAccount] = useState(null);
    const [txns, setTxns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        account_id: id,
        date: new Date().toISOString().slice(0, 10),
        txn_type: "Credit",
        amount: "",
        narration: "",
        reference: "",
        approved_by: "",
    });
    const [saving, setSaving] = useState(false);

    const load = async () => {
        const [a, t] = await Promise.all([fetchBankAccount(id), fetchTransactions(id)]);
        setAccount(a);
        setTxns(t);
    };

    useEffect(() => {
        (async () => {
            try {
                await load();
            } finally {
                setLoading(false);
            }
        })();
    }, [id]); // eslint-disable-line

    const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await addTransaction({ ...form, amount: parseFloat(form.amount), account_id: id });
            setForm({ ...form, amount: "", narration: "", reference: "", approved_by: "" });
            setShowForm(false);
            await load();
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-16 text-center font-serif text-mpca-gray-dark">Loading account…</div>;
    if (!account) return <div className="p-16 text-center font-serif text-2xl">Account not found.</div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="bank-account-detail-page">
            <Link to="/bank" className="btn-heritage-ghost mb-6 inline-flex" data-testid="bank-back">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Accounts
            </Link>

            <div className="border border-mpca-brass/40 p-10 mb-10 bg-gradient-to-br from-mpca-ivory to-mpca-parchment">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="overline">{account.account_type.replace(/_/g, " ")} Account</div>
                        <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                            {account.name}
                        </h1>
                        <div className="mt-3 text-mpca-charcoal">{account.bank}{account.branch ? ` · ${account.branch}` : ""}</div>
                        <div className="mt-4 flex flex-wrap gap-3 items-center">
                            <span className="font-mono text-[11px] tracking-wider text-mpca-brass px-3 py-1 border border-mpca-brass/40">
                                A/c {account.account_no}
                            </span>
                            <span className="font-mono text-[11px] tracking-wider text-mpca-charcoal">
                                IFSC {account.ifsc}
                            </span>
                        </div>
                    </div>
                    <Landmark className="text-mpca-brass" size={36} strokeWidth={1.25} />
                </div>

                <div className="mt-8 pt-6 border-t border-mpca-brass/20 grid md:grid-cols-3 gap-6">
                    <div>
                        <div className="overline">Current Balance</div>
                        <div className="font-serif text-4xl text-mpca-green-dark mt-2">₹{inr(account.current_balance)}</div>
                    </div>
                    <div>
                        <div className="overline">Opening Balance</div>
                        <div className="font-mono text-lg text-mpca-charcoal mt-2">₹{inr(account.opening_balance)}</div>
                    </div>
                    <div>
                        <div className="overline">Signatories</div>
                        <div className="mt-2 text-sm text-mpca-charcoal">
                            {account.signatories.length > 0 ? account.signatories.join(" · ") : "—"}
                        </div>
                    </div>
                </div>
                {account.notes && (
                    <div className="mt-6 pt-6 border-t border-mpca-brass/20 text-sm text-mpca-charcoal italic font-serif">
                        {account.notes}
                    </div>
                )}
            </div>

            <div className="flex items-end justify-between mb-6">
                <div>
                    <div className="overline">Activity</div>
                    <h2 className="font-serif text-3xl text-mpca-green-dark mt-1">Transaction Ledger</h2>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="btn-heritage-secondary" data-testid="add-txn-btn">
                    <Plus size={14} strokeWidth={1.5} /> Record Transaction
                </button>
            </div>

            {showForm && (
                <form onSubmit={submit} className="bulletin-card p-6 mb-6 bg-mpca-parchment/50 space-y-4" data-testid="txn-form">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Date *</label>
                            <input name="date" type="date" required value={form.date} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Type *</label>
                            <select name="txn_type" value={form.txn_type} onChange={update} className="input-heritage" data-testid="txn-type">
                                <option>Credit</option>
                                <option>Debit</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Amount (₹) *</label>
                            <input name="amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={update} className="input-heritage" data-testid="txn-amount" />
                        </div>
                        <div>
                            <label className="label-heritage">Reference</label>
                            <input name="reference" value={form.reference} onChange={update} placeholder="e.g. NEFT-2025-XYZ" className="input-heritage" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="label-heritage">Narration *</label>
                            <input name="narration" required value={form.narration} onChange={update} className="input-heritage" data-testid="txn-narration" />
                        </div>
                        <div>
                            <label className="label-heritage">Approved By</label>
                            <input name="approved_by" value={form.approved_by} onChange={update} placeholder="Post / officer" className="input-heritage" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn-heritage-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                        <button type="submit" disabled={saving} className="btn-heritage-primary" data-testid="txn-submit">
                            {saving ? "Posting…" : "Post Transaction"}
                        </button>
                    </div>
                </form>
            )}

            {txns.length === 0 ? (
                <div className="bulletin-card px-8 py-12 text-center text-mpca-gray-dark italic font-serif">
                    No transactions on record.
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-mpca-green-dark text-mpca-gold-light border-b border-mpca-brass/40">
                        <div className="col-span-1"></div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Date</div>
                        <div className="col-span-5 overline !text-mpca-gold-light">Narration</div>
                        <div className="col-span-2 overline !text-mpca-gold-light text-right">Amount</div>
                        <div className="col-span-2 overline !text-mpca-gold-light text-right">Balance</div>
                    </div>
                    {txns.map((t) => (
                        <div key={t.id} className="ledger-row grid grid-cols-12 gap-4 px-6 py-4 items-center" data-testid={`acct-txn-${t.id}`}>
                            <div className="col-span-1">
                                {t.txn_type === "Credit" ? (
                                    <ArrowDownLeft className="text-mpca-green-dark" size={18} strokeWidth={1.5} />
                                ) : (
                                    <ArrowUpRight className="text-mpca-oxblood" size={18} strokeWidth={1.5} />
                                )}
                            </div>
                            <div className="col-span-2 font-mono text-[11px] text-mpca-charcoal">
                                {new Date(t.date).toLocaleDateString("en-GB")}
                            </div>
                            <div className="col-span-5">
                                <div className="text-mpca-charcoal text-sm leading-tight">{t.narration}</div>
                                {t.reference && (
                                    <div className="font-mono text-[10px] text-mpca-gray-dark mt-1 tracking-wider">
                                        {t.reference} · approved by {t.approved_by || "—"}
                                    </div>
                                )}
                            </div>
                            <div className="col-span-2 text-right font-mono">
                                <span className={t.txn_type === "Credit" ? "text-mpca-green-dark" : "text-mpca-oxblood"}>
                                    {t.txn_type === "Credit" ? "+" : "−"} ₹{inr(t.amount)}
                                </span>
                            </div>
                            <div className="col-span-2 text-right font-mono text-mpca-charcoal text-sm">
                                ₹{inr(t.balance_after)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BankAccountDetail;
