import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, ChevronRight, FileText, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const TournamentFinance = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: tournaments }, { data: budgets }, { data: invoices }, { data: claims }, { data: schemes }] = await Promise.all([
                api.get("/tournaments"),
                api.get("/tournament-budgets"),
                api.get("/tournament-invoices"),
                api.get("/reimbursement-claims"),
                api.get("/reimbursement-schemes"),
            ]);
            const schemeMap = Object.fromEntries((schemes || []).map((s) => [s.scheme_code, s]));
            const budgetsByT = {};
            (budgets || []).forEach((b) => { budgetsByT[b.tournament_id] = b; });
            const invByT = {};
            (invoices || []).forEach((inv) => {
                const arr = invByT[inv.tournament_id] || [];
                arr.push(inv);
                invByT[inv.tournament_id] = arr;
            });
            const claimByT = {};
            (claims || []).forEach((c) => { claimByT[c.tournament_id] = c; });

            const out = (tournaments || []).map((t) => {
                const b = budgetsByT[t.id];
                const invs = invByT[t.id] || [];
                const spent = invs.reduce((s, i) => s + (i.total_inr || 0), 0);
                const budgetTotal = (b && (b.approved_total_inr || b.total_ceiling_inr)) || 0;
                const remaining = Math.max(budgetTotal - spent, 0);
                const claim = claimByT[t.id];
                return {
                    ...t,
                    budget_total_inr: budgetTotal,
                    spent_inr: spent,
                    remaining_inr: remaining,
                    invoice_count: invs.length,
                    claim_status: claim?.status || "None",
                    claim_ref: claim?.claim_ref,
                    scheme_name: t.scheme_code ? schemeMap[t.scheme_code]?.name : null,
                };
            });
            setRows(out);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        // Scope by persona body
        let list = rows;
        if (persona?.body_type === "Division") {
            list = list.filter((r) => r.host_body_id === persona.body_code || r.host_body_id?.startsWith(`DIST-`));
        } else if (persona?.body_type === "District") {
            list = list.filter((r) => r.host_body_id === persona.body_code);
        }
        if (filter === "over-budget") list = list.filter((r) => r.spent_inr > r.budget_total_inr);
        if (filter === "with-claim") list = list.filter((r) => r.claim_status !== "None");
        if (filter === "no-budget") list = list.filter((r) => r.budget_total_inr === 0);
        return list;
    }, [rows, filter, persona]);

    const totals = filtered.reduce(
        (acc, r) => ({
            budget: acc.budget + (r.budget_total_inr || 0),
            spent: acc.spent + (r.spent_inr || 0),
            claims: acc.claims + (r.claim_status === "Submitted" || r.claim_status === "Under_Review" ? 1 : 0),
        }),
        { budget: 0, spent: 0, claims: 0 }
    );

    if (loading) return <CricketLoader label="Loading tournament finance..." />;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="tournament-finance-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Financial · Tournament Reimbursement Matrix</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Tournament Finance</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Per-tournament budgets, invoice tracking, extra-expense approvals, and reimbursement claims — mapped to MPCA scheme rate cards from the Master Document.
                    </p>
                </div>
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bulletin-card p-4" data-testid="stat-total-tournaments">
                    <div className="overline text-[9px]">Tournaments</div>
                    <div className="font-serif text-3xl text-mpca-green-dark mt-1">{filtered.length}</div>
                </div>
                <div className="bulletin-card p-4" data-testid="stat-total-budget">
                    <div className="overline text-[9px]">Budget Allotted</div>
                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">{fmt(totals.budget)}</div>
                </div>
                <div className="bulletin-card p-4" data-testid="stat-total-spent">
                    <div className="overline text-[9px]">Invoiced (Spent)</div>
                    <div className="font-serif text-2xl text-mpca-oxblood mt-1">{fmt(totals.spent)}</div>
                </div>
                <div className="bulletin-card p-4" data-testid="stat-open-claims">
                    <div className="overline text-[9px]">Open Reimbursement Claims</div>
                    <div className="font-serif text-3xl text-mpca-brass mt-1">{totals.claims}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-1 mb-5 flex-wrap">
                {[
                    { k: "all", l: "All" },
                    { k: "over-budget", l: "⚠ Over Budget" },
                    { k: "with-claim", l: "With Claim" },
                    { k: "no-budget", l: "No Budget Set" },
                ].map((f) => (
                    <button
                        key={f.k}
                        onClick={() => setFilter(f.k)}
                        className={`px-3 py-1.5 text-[11px] uppercase tracking-widest border ${filter === f.k ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-brass/40 text-mpca-green-dark"}`}
                        data-testid={`finance-filter-${f.k}`}
                    >
                        {f.l}
                    </button>
                ))}
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="bulletin-card p-16 text-center">
                    <Wallet className="mx-auto text-mpca-brass mb-4" size={36} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No tournaments match this filter.</div>
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden">
                    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                        <div className="col-span-4">Tournament · Scheme</div>
                        <div className="col-span-1">Host</div>
                        <div className="col-span-2 text-right">Budget</div>
                        <div className="col-span-2 text-right">Spent</div>
                        <div className="col-span-1 text-right">Inv</div>
                        <div className="col-span-2">Claim</div>
                    </div>
                    {filtered.map((r) => {
                        const overBudget = r.spent_inr > r.budget_total_inr && r.budget_total_inr > 0;
                        const util = r.budget_total_inr > 0 ? Math.min(100, (r.spent_inr / r.budget_total_inr) * 100) : 0;
                        return (
                            <div
                                key={r.id}
                                className={`grid grid-cols-12 gap-3 px-4 py-3 items-center border-b border-mpca-brass/10 cursor-pointer hover:bg-mpca-cream/40 ${overBudget ? "bg-mpca-oxblood/5" : ""}`}
                                onClick={() => navigate(`/tournaments/${r.id}/finance`)}
                                data-testid={`finance-row-${r.id}`}
                            >
                                <div className="col-span-4">
                                    <div className="font-serif text-mpca-green-dark text-base">{r.name}</div>
                                    <div className="text-[10px] mt-0.5 flex gap-2 items-center">
                                        {r.scheme_code && (
                                            <span className="font-mono text-mpca-brass">Scheme {r.scheme_code}</span>
                                        )}
                                        <span className="text-mpca-gray-dark">{r.format}</span>
                                        {overBudget && (
                                            <span className="text-mpca-oxblood font-semibold flex items-center gap-1">
                                                <AlertTriangle size={11} /> Over budget
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="col-span-1 text-[10px] font-mono text-mpca-brass">{r.host_body_id || "—"}</div>
                                <div className="col-span-2 text-right">
                                    <div className="font-mono text-sm text-mpca-green-dark">{fmt(r.budget_total_inr)}</div>
                                    {r.budget_total_inr > 0 && (
                                        <div className="h-1 bg-mpca-brass/15 mt-1">
                                            <div className={`h-full ${overBudget ? "bg-mpca-oxblood" : util > 80 ? "bg-mpca-brass" : "bg-mpca-green-dark"}`} style={{ width: `${util}%` }} />
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-2 text-right font-mono text-sm text-mpca-oxblood">{fmt(r.spent_inr)}</div>
                                <div className="col-span-1 text-right font-mono text-sm">{r.invoice_count}</div>
                                <div className="col-span-2">
                                    {r.claim_status === "None" ? (
                                        <span className="text-[10px] text-mpca-gray-dark">— No claim yet</span>
                                    ) : (
                                        <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                                            r.claim_status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" :
                                            r.claim_status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" :
                                            r.claim_status === "Submitted" || r.claim_status === "Under_Review" ? "border-mpca-brass text-mpca-brass" :
                                            "border-mpca-gray-dark text-mpca-gray-dark"
                                        }`}>{r.claim_status.replace(/_/g, " ")}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TournamentFinance;
