/**
 * BudgetVsActual page · Sprint 1 · P3.9
 * Per-body budget consumption dashboard with utilisation bars & variance.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchBudgetVsActual } from "@/lib/api";
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, Filter, Building2, MapPin } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
    if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)}`;
};

const STATUS_STYLE = {
    on_track:        { label: "On Track",       tx: "text-mpca-green-deep",  bar: "bg-mpca-green-deep" },
    under_utilised:  { label: "Under Utilised", tx: "text-mpca-brass",       bar: "bg-mpca-brass" },
    over_budget:     { label: "Over Budget",    tx: "text-mpca-oxblood",     bar: "bg-mpca-oxblood" },
};

const BudgetVsActual = () => {
    const [data, setData] = useState(null);
    const [fy, setFy] = useState("2026-27");
    const [typeFilter, setTypeFilter] = useState("all");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const d = await fetchBudgetVsActual({ fiscal_cycle: fy });
                setData(d);
            } finally { setLoading(false); }
        })();
    }, [fy]);

    const filtered = useMemo(() => {
        if (!data) return [];
        if (typeFilter === "all") return data.rows;
        if (typeFilter === "activity") return data.rows.filter(r => r.actual_inr > 0);
        return data.rows.filter(r => r.body_type === typeFilter);
    }, [data, typeFilter]);

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Reconciling budgets…" /></div>;
    if (!data) return null;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="budget-vs-actual-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><BarChart3 size={12} /> Sprint 1 · Finance Rails</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Budget vs Actual</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Live per-body reconciliation of annual budget against disbursed grants — variance, utilisation & risk flags.
                    </p>
                </div>
                <div>
                    <label className="label-heritage">Fiscal Cycle</label>
                    <select value={fy} onChange={(e) => setFy(e.target.value)} className="input-heritage" data-testid="input-fy">
                        <option value="2024-25">2024-25</option>
                        <option value="2025-26">2025-26</option>
                        <option value="2026-27">2026-27</option>
                    </select>
                </div>
            </div>

            <div className="crest-divider mb-8" />

            <div className="grid sm:grid-cols-4 gap-4 mb-8">
                <div className="bulletin-card p-5" data-testid="kpi-total-budget">
                    <TrendingUp size={16} className="text-mpca-brass mb-3" />
                    <div className="font-serif text-2xl text-mpca-green-dark">{fmtINR(data.total_budget_inr)}</div>
                    <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">Total Annual Budget</div>
                </div>
                <div className="bulletin-card p-5" data-testid="kpi-total-actual">
                    <TrendingDown size={16} className="text-mpca-brass mb-3" />
                    <div className="font-serif text-2xl text-mpca-oxblood">{fmtINR(data.total_actual_inr)}</div>
                    <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">Total Disbursed (Actual)</div>
                </div>
                <div className="bulletin-card p-5" data-testid="kpi-total-variance">
                    <BarChart3 size={16} className="text-mpca-brass mb-3" />
                    <div className={`font-serif text-2xl ${data.total_variance_inr >= 0 ? "text-mpca-green-deep" : "text-mpca-oxblood"}`}>
                        {fmtINR(data.total_variance_inr)}
                    </div>
                    <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">Variance (available)</div>
                </div>
                <div className="bulletin-card p-5" data-testid="kpi-util">
                    <BarChart3 size={16} className="text-mpca-brass mb-3" />
                    <div className="font-serif text-2xl text-mpca-green-dark">{data.overall_utilisation_pct}%</div>
                    <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">Overall Utilisation</div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center mb-6" data-testid="bva-filters">
                <Filter size={12} className="text-mpca-brass" />
                {[["all", "All Bodies"], ["Division", "Divisions"], ["District", "Districts"], ["activity", "With Activity"]].map(([k, l]) => (
                    <button
                        key={k}
                        onClick={() => setTypeFilter(k)}
                        data-testid={`bva-filter-${k}`}
                        className={"px-3 py-1 text-[10px] tracking-widest uppercase border transition-colors " +
                            (typeFilter === k ? "bg-mpca-green-dark text-white border-mpca-green-dark" :
                                "bg-white text-mpca-charcoal border-mpca-brass/30 hover:border-mpca-brass")}>
                        {l}
                    </button>
                ))}
                <span className="text-[10px] text-mpca-gray-dark ml-auto">{filtered.length} of {data.rows.length} bodies</span>
            </div>

            <div className="bulletin-card overflow-hidden" data-testid="bva-table">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No bodies match this filter.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Body", "Type", "Budget", "Actual", "Variance", "Utilisation", "Status"].map((h) => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => {
                                const st = STATUS_STYLE[r.status] || STATUS_STYLE.on_track;
                                const util = Math.max(0, Math.min(100, r.utilisation_pct));
                                const Icon = r.body_type === "Division" ? Building2 : MapPin;
                                return (
                                    <tr key={r.body_id} className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/30" data-testid={`bva-row-${r.body_id}`}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Icon size={12} className="text-mpca-brass" />
                                                <div>
                                                    <div className="font-mono text-[10px] text-mpca-brass">{r.body_id}</div>
                                                    <div className="text-[12px] text-mpca-charcoal">{r.body_name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-gray-dark">{r.body_type}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-green-dark">{fmtINR(r.annual_budget_inr)}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-oxblood">{fmtINR(r.actual_inr)}</td>
                                        <td className="px-4 py-3 font-mono">
                                            <span className={r.variance_inr >= 0 ? "text-mpca-green-deep" : "text-mpca-oxblood"}>{fmtINR(r.variance_inr)}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-24 bg-mpca-brass/15 overflow-hidden">
                                                    <div className={`h-full ${st.bar} transition-all`} style={{ width: `${util}%` }} />
                                                </div>
                                                <span className="text-[11px] font-mono text-mpca-charcoal">{r.utilisation_pct}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] tracking-widest uppercase ${st.tx}`}>
                                                {r.status === "over_budget" && <AlertTriangle size={10} />}
                                                {st.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default BudgetVsActual;
