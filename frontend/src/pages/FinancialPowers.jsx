import { useEffect, useState } from "react";
import { fetchFinancialPowers } from "@/lib/api";
import { Scale, ShieldCheck } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const inr = (n) =>
    n == null ? "Unlimited" : "₹" + new Intl.NumberFormat("en-IN").format(n);

const FinancialPowers = () => {
    const [powers, setPowers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetchFinancialPowers();
                setPowers(r.powers);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="financial-powers-page">
            <div className="mb-10">
                <div className="overline">Article XIV · Financial Powers</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                    Schedule of Financial Powers
                </h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                    The schedule below, derived from Article XIV of the MPCA Constitution,
                    enumerates the financial authority vested in each office-bearer and
                    the body politic of the Association.
                </p>
                <div className="crest-divider mt-10" />
            </div>

            {loading ? (
                <CricketLoader label="Reading the schedule…" />
            ) : (
                <div className="space-y-4">
                    {powers.map((p, idx) => (
                        <div key={p.post} className="bulletin-card p-7 group" data-testid={`power-${idx}`}>
                            <div className="grid md:grid-cols-12 gap-6 items-center">
                                <div className="md:col-span-4 flex items-start gap-3">
                                    <Scale className="text-mpca-brass flex-shrink-0 mt-1" size={20} strokeWidth={1.25} />
                                    <div>
                                        <div className="overline">Authority</div>
                                        <div className="font-serif text-xl text-mpca-green-dark mt-1 leading-tight">
                                            {p.post}
                                        </div>
                                    </div>
                                </div>
                                <div className="md:col-span-3">
                                    <div className="overline">Single-Txn Limit</div>
                                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">
                                        {inr(p.single_txn_limit)}
                                    </div>
                                </div>
                                <div className="md:col-span-5">
                                    <div className="overline">Approval Required</div>
                                    <div className="text-sm text-mpca-charcoal mt-1 italic font-serif leading-relaxed">
                                        {p.approval_required}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-5 pt-4 border-t border-mpca-brass/15 text-sm text-mpca-charcoal">
                                <span className="overline mr-3">Scope</span>
                                {p.scope}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-12 bulletin-card p-7 bg-mpca-parchment/50 flex items-start gap-4" data-testid="powers-note">
                <ShieldCheck className="text-mpca-brass mt-1" size={20} strokeWidth={1.25} />
                <div className="text-sm text-mpca-charcoal italic font-serif leading-relaxed">
                    All transactions exceeding the office-bearer's prescribed limit must be ratified by the
                    next sitting of the Managing Committee, and the minutes thereof entered into the official
                    register. Joint signatures are mandatory for cheques and digital transfers above ₹50,000.
                </div>
            </div>
        </div>
    );
};

export default FinancialPowers;
