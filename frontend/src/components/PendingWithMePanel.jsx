import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Sprint M30 · Pending With MPCA
 * ──────────────────────────────
 * Dashboard widget that aggregates every item across the ERP that is
 * currently waiting on MPCA action — squad reviews, budget approvals,
 * reimbursement claims, tournament sanctions, closure letters.
 * Powered by GET /api/pending-actions/mpca.
 */

const KIND_LABEL = {
    squad_review: "Squad Review",
    squad_pick: "Squad Draft",
    budget_approval: "Budget Approval",
    claim_review: "Claim Review",
    tournament_approval: "Tournament Approval",
    tournament_submit: "Submit for Approval",
    input_vars: "Input Variables",
    closure_letter: "Closure Letter",
};

const KIND_TONE = {
    squad_review: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40",
    budget_approval: "bg-mpca-gold-light/20 text-mpca-brass border-mpca-brass/40",
    claim_review: "bg-mpca-navy/10 text-mpca-navy border-mpca-navy/40",
    tournament_approval: "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/40",
    input_vars: "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40",
    closure_letter: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40",
};

const PendingWithMePanel = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/pending-actions/mpca", { params: { limit: 30 } });
                setItems(data?.items || []);
            } catch (_) { setItems([]); }
            finally { setLoading(false); }
        })();
    }, []);

    // Group by kind for a summary strip
    const byKind = items.reduce((acc, it) => {
        acc[it.kind] = (acc[it.kind] || 0) + 1;
        return acc;
    }, {});

    return (
        <section className="mb-10" data-testid="pending-with-me-panel">
            <div className="flex items-end justify-between mb-4">
                <div>
                    <div className="overline">Pending With MPCA</div>
                    <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">
                        Action Inbox {loading && <Loader2 size={16} className="inline animate-spin ml-2 text-mpca-brass" />}
                    </h2>
                    <p className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl">
                        Everything across all tournaments that is waiting on MPCA to sign off. Click any item to jump straight to the record.
                    </p>
                </div>
                <div className="text-right">
                    <div className="overline">Total</div>
                    <div className="font-serif text-3xl text-mpca-oxblood mt-1" data-testid="pending-total-count">
                        {items.length}
                    </div>
                </div>
            </div>

            {/* Summary chips */}
            {items.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4" data-testid="pending-summary-chips">
                    {Object.keys(KIND_LABEL).filter((k) => byKind[k]).map((k) => (
                        <span key={k} className={`text-[10px] uppercase tracking-widest px-2 py-1 border font-mono ${KIND_TONE[k] || "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40"}`} data-testid={`pending-chip-${k}`}>
                            {KIND_LABEL[k]} · {byKind[k]}
                        </span>
                    ))}
                </div>
            )}

            {/* Item list */}
            {loading ? (
                <div className="bulletin-card p-8 text-center text-[11px] text-mpca-gray-dark italic">
                    <Loader2 size={14} className="inline animate-spin mr-1" /> Loading pending items…
                </div>
            ) : items.length === 0 ? (
                <div className="bulletin-card p-8 text-center" data-testid="pending-empty">
                    <Inbox size={24} className="mx-auto text-mpca-brass mb-2" />
                    <div className="font-serif text-lg text-mpca-green-dark">Inbox zero.</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1">No tournament items are waiting on MPCA action right now.</div>
                </div>
            ) : (
                <div className="bulletin-card divide-y divide-mpca-brass/15">
                    {items.slice(0, 12).map((it) => (
                        <Link
                            key={`${it.kind}-${it.record_id}`}
                            to={it.deep_link}
                            className="flex items-center gap-4 px-5 py-3 hover:bg-mpca-parchment/50 transition-colors"
                            data-testid={`pending-item-${it.kind}-${it.record_id}`}
                        >
                            <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border font-mono shrink-0 ${KIND_TONE[it.kind] || "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40"}`}>
                                {KIND_LABEL[it.kind] || it.kind}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="font-serif text-sm text-mpca-green-dark truncate">{it.label}</div>
                                <div className="text-[10px] text-mpca-gray-dark font-mono truncate">
                                    {it.tournament_no ? <>{it.tournament_no} · {it.tournament_name}</> : it.tournament_id}
                                    {it.body_code && <> · {it.body_code}</>}
                                </div>
                            </div>
                            <ArrowRight size={13} className="text-mpca-brass shrink-0" />
                        </Link>
                    ))}
                    {items.length > 12 && (
                        <div className="px-5 py-2 text-[10px] text-mpca-gray-dark italic text-center">
                            + {items.length - 12} more · scroll or filter to find them
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default PendingWithMePanel;
