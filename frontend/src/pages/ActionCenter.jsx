import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Filter, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";
import { useAuth } from "@/context/AuthContext";

const KIND_LABEL = {
    squad_review: "Squad Review",
    squad_pick: "Squad Draft",
    budget_approval: "Budget Approval",
    budget_send: "Send Budget",                       // M39r
    budget_acceptance: "Accept Budget",                // M39r
    budget_sanction: "Sanction Budget",                // M39r
    budget_revise: "Revise Budget",                    // M39r
    claim_review: "Reimbursement Claim",
    tournament_approval: "Tournament Approval",
    tournament_submit: "Submit for Approval",
    input_vars: "Input Variables",
    closure_letter: "Closure Letter",
    da_fill: "DA Form · Pending fill",
    extra_expense: "Extra Expense",
};
const KIND_TONE = {
    squad_review: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40",
    squad_pick: "bg-mpca-gold-light/20 text-mpca-brass border-mpca-brass/40",
    budget_approval: "bg-mpca-gold-light/20 text-mpca-brass border-mpca-brass/40",
    budget_send: "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40",
    budget_acceptance: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40",
    budget_sanction: "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/40",
    budget_revise: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40",
    claim_review: "bg-mpca-navy/10 text-mpca-navy border-mpca-navy/40",
    tournament_approval: "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/40",
    tournament_submit: "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40",
    input_vars: "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40",
    closure_letter: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40",
    da_fill: "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40",
    extra_expense: "bg-mpca-gold-light/20 text-mpca-brass border-mpca-brass/40",
};

/** M39 · Persona-scoped Action Center */
const ActionCenter = () => {
    const { persona } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/pending-actions/me", { params: { limit: 500 } });
                setItems(data?.items || []);
            } catch { setItems([]); }
            finally { setLoading(false); }
        })();
    }, []);

    const counts = useMemo(() => {
        const c = {};
        for (const it of items) c[it.kind] = (c[it.kind] || 0) + 1;
        return c;
    }, [items]);

    const filtered = filter === "all" ? items : items.filter((it) => it.kind === filter);

    if (loading) return <CricketLoader label="Loading your action inbox…" />;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="action-center-page">
            <div className="mb-6">
                <div className="overline">Action Center</div>
                <h1 className="font-serif text-4xl text-mpca-green-dark mt-1">
                    Pending With {persona?.body_type === "State" ? "MPCA" : persona?.body_code || "You"}
                </h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                    Everything across the ERP that is waiting on you to act on. Click any item to jump straight to the record and clear it. Filter by action type on the strip below.
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="ac-stats">
                <Stat label="Total" value={items.length} tone="oxblood" />
                <Stat label="Squad Approvals" value={(counts.squad_review || 0) + (counts.squad_pick || 0)} tone="brass" />
                <Stat label="Financial" value={(counts.budget_approval || 0) + (counts.claim_review || 0) + (counts.budget_send || 0) + (counts.budget_acceptance || 0) + (counts.budget_sanction || 0) + (counts.budget_revise || 0) + (counts.extra_expense || 0)} tone="green" />
                <Stat label="Tournament" value={(counts.tournament_approval || 0) + (counts.tournament_submit || 0) + (counts.input_vars || 0)} tone="brass" />
            </div>

            <div className="mb-4 flex items-center gap-2 flex-wrap">
                <Filter size={12} className="text-mpca-brass" />
                <FilterChip on={filter === "all"} onClick={() => setFilter("all")} label={`All (${items.length})`} testId="ac-filter-all" />
                {Object.keys(counts).map((k) => (
                    <FilterChip
                        key={k}
                        on={filter === k}
                        onClick={() => setFilter(k)}
                        label={`${KIND_LABEL[k] || k} (${counts[k]})`}
                        testId={`ac-filter-${k}`}
                    />
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="bulletin-card p-16 text-center" data-testid="ac-empty">
                    <CheckCircle2 className="mx-auto text-mpca-green-dark mb-4" size={40} />
                    <div className="font-serif text-2xl text-mpca-green-dark">All caught up.</div>
                    <p className="text-[11px] text-mpca-gray-dark mt-2">You have no pending actions right now.</p>
                </div>
            ) : (
                <div className="space-y-2" data-testid="ac-items">
                    {filtered.map((it, i) => (
                        <Link
                            to={it.link || `/tournaments/${it.tournament_id}`}
                            key={`${it.record_id || it.tournament_id}-${i}`}
                            className="bulletin-card p-4 flex items-center justify-between hover:bg-mpca-cream/40 transition-colors gap-3"
                            data-testid={`ac-item-${it.kind}-${i}`}
                        >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                <span className={`inline-block text-[9px] uppercase tracking-widest px-2 py-0.5 border ${KIND_TONE[it.kind] || "border-mpca-brass/40 text-mpca-brass"}`}>
                                    {KIND_LABEL[it.kind] || it.kind}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-serif text-base text-mpca-green-dark truncate">{it.label}</div>
                                    <div className="text-[10px] text-mpca-gray-dark mt-0.5">
                                        {it.tournament_no && <span className="font-mono">{it.tournament_no}</span>}
                                        {it.tournament_name && <> · {it.tournament_name}</>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-mpca-oxblood shrink-0">
                                {it.cta || "Open"} <ArrowRight size={11} />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

const Stat = ({ label, value, tone = "brass" }) => (
    <div className="bulletin-card p-3">
        <div className="overline">{label}</div>
        <div className={`font-serif text-3xl mt-1 ${tone === "green" ? "text-mpca-green-dark" : tone === "oxblood" ? "text-mpca-oxblood" : "text-mpca-brass"}`}>{value}</div>
    </div>
);
const FilterChip = ({ on, onClick, label, testId }) => (
    <button
        onClick={onClick}
        data-testid={testId}
        className={`text-[10px] uppercase tracking-widest px-3 py-1 border ${on ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass/10"}`}
    >
        {label}
    </button>
);

export default ActionCenter;
