import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBankAccounts, fetchTransactions } from "@/lib/api";
import { Landmark, ChevronRight, ArrowDownLeft, ArrowUpRight } from "lucide-react";

const inr = (n) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);

const Bank = () => {
    const [accounts, setAccounts] = useState([]);
    const [txns, setTxns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [a, t] = await Promise.all([fetchBankAccounts(), fetchTransactions()]);
                setAccounts(a);
                setTxns(t.slice(0, 12));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const totalBalance = accounts.reduce((acc, a) => acc + (a.current_balance || 0), 0);

    if (loading) {
        return <div className="p-16 text-center font-serif text-mpca-gray-dark">Loading the banker's ledger…</div>;
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="bank-page">
            <div className="mb-10">
                <div className="overline">Article XIV · Bank Operations</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                    Bank Operations
                </h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                    Accounts maintained by the Association, with joint-signatory norms per
                    Article XIV and resolutions of the Managing Committee.
                </p>
                <div className="crest-divider mt-10" />
            </div>

            {/* Total balance hero */}
            <div
                className="border border-mpca-brass/40 p-10 mb-12 relative overflow-hidden"
                style={{
                    backgroundImage: "linear-gradient(135deg, var(--mpca-green-dark) 0%, #0a1e15 100%)",
                }}
                data-testid="bank-total"
            >
                <div className="text-mpca-ivory relative">
                    <div className="overline !text-mpca-gold-light">Consolidated Position · All Accounts</div>
                    <div className="font-serif text-6xl md:text-7xl text-mpca-gold-light mt-4">
                        ₹{inr(totalBalance)}
                    </div>
                    <div className="mt-3 text-mpca-ivory/70 text-sm">
                        Across {accounts.length} active account{accounts.length !== 1 ? "s" : ""} ·
                        As on {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                </div>
            </div>

            {/* Accounts */}
            <div className="grid lg:grid-cols-2 gap-6 mb-12">
                {accounts.map((a) => (
                    <Link
                        to={`/bank/${a.id}`}
                        key={a.id}
                        className="bulletin-card p-7 group hover:-translate-y-0.5 hover:shadow-lg transition-all duration-500"
                        data-testid={`bank-account-${a.id}`}
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <Landmark className="text-mpca-brass" size={22} strokeWidth={1.25} />
                            <span className="overline">{a.account_type.replace(/_/g, " ")}</span>
                        </div>
                        <div className="font-serif text-2xl text-mpca-green-dark leading-tight group-hover:text-mpca-oxblood transition-colors duration-300">
                            {a.name}
                        </div>
                        <div className="text-sm text-mpca-charcoal mt-1">{a.bank} · {a.branch || ""}</div>
                        <div className="mt-4 font-mono text-[11px] text-mpca-brass tracking-wider">
                            A/c № {a.account_no} · {a.ifsc}
                        </div>

                        <div className="mt-5 pt-4 border-t border-mpca-brass/15 flex items-end justify-between">
                            <div>
                                <div className="overline">Balance</div>
                                <div className="font-serif text-3xl text-mpca-green-dark mt-1">₹{inr(a.current_balance)}</div>
                            </div>
                            <ChevronRight className="text-mpca-brass group-hover:translate-x-1 transition-transform duration-300" size={20} strokeWidth={1.5} />
                        </div>

                        {a.signatories?.length > 0 && (
                            <div className="mt-4 text-[10px] text-mpca-gray-dark tracking-wide">
                                Signatories: {a.signatories.join(" · ")}
                            </div>
                        )}
                    </Link>
                ))}
            </div>

            {/* Recent transactions across all accounts */}
            <div className="mb-4 flex items-baseline justify-between">
                <div>
                    <div className="overline">Activity</div>
                    <h3 className="font-serif text-3xl text-mpca-green-dark mt-1">Recent Transactions</h3>
                </div>
                <div className="text-xs text-mpca-gray-dark">Across all accounts</div>
            </div>

            {txns.length === 0 ? (
                <div className="bulletin-card px-8 py-12 text-center text-mpca-gray-dark italic font-serif">
                    No transactions on record.
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden" data-testid="bank-txns">
                    {txns.map((t) => (
                        <div key={t.id} className="ledger-row grid grid-cols-12 gap-4 px-6 py-4 items-center" data-testid={`txn-${t.id}`}>
                            <div className="col-span-1">
                                {t.txn_type === "Credit" ? (
                                    <ArrowDownLeft className="text-mpca-green-dark" size={20} strokeWidth={1.5} />
                                ) : (
                                    <ArrowUpRight className="text-mpca-oxblood" size={20} strokeWidth={1.5} />
                                )}
                            </div>
                            <div className="col-span-2 font-mono text-[11px] text-mpca-charcoal">
                                {new Date(t.date).toLocaleDateString("en-GB")}
                            </div>
                            <div className="col-span-6">
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
                            <div className="col-span-1 text-right font-mono text-[10px] text-mpca-gray-dark">
                                ₹{inr(t.balance_after)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Bank;
