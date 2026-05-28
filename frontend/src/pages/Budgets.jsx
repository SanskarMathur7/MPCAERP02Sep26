import { useEffect, useMemo, useState } from "react";
import { fetchBudgets, fetchSanctionThresholds, fetchABCAnalysis } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Coins, AlertTriangle, ShieldCheck, TrendingUp, Filter, Building2, MapPin, Landmark, BarChart3 } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const TYPE_ICON = {
    BCCI: Landmark,
    State: Landmark,
    Division: Building2,
    District: MapPin,
};

const Budgets = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [thresholds, setThresholds] = useState(null);
    const [abc, setAbc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [cycle, setCycle] = useState("2025-26");
    const [typeFilter, setTypeFilter] = useState("all");
    const [showZero, setShowZero] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [b, t, a] = await Promise.all([
                    fetchBudgets({ fiscal_cycle: cycle }),
                    fetchSanctionThresholds(),
                    fetchABCAnalysis(cycle),
                ]);
                setRows(b);
                setThresholds(t);
                setAbc(a);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, [cycle]);

    const visible = useMemo(() => {
        let r = rows.filter((x) => x.body_type !== "BCCI" && x.body_type !== "State");
        if (typeFilter !== "all") r = r.filter((x) => x.body_type === typeFilter);
        if (!showZero) r = r.filter((x) => x.claim_count > 0 || x.annual_budget_inr > 0);
        // Scope by persona — Division sees own + own districts; District sees own
        if (persona?.body_type === "Division") {
            r = r.filter((x) => x.body_id === persona.body_code || (x.body_type === "District" && x.body_id.endsWith(persona.body_code.slice(-3))));
        } else if (persona?.body_type === "District") {
            r = r.filter((x) => x.body_id === persona.body_code);
        }
        return r.sort((a, b) => b.utilisation_pct - a.utilisation_pct);
    }, [rows, typeFilter, showZero, persona]);

    const totals = useMemo(() => {
        const all = rows.filter((x) => x.body_type !== "BCCI" && x.body_type !== "State");
        return {
            annual:   all.reduce((s, r) => s + (r.annual_budget_inr || 0), 0),
            committed: all.reduce((s, r) => s + (r.committed_inr || 0), 0),
            disbursed: all.reduce((s, r) => s + (r.disbursed_inr || 0), 0),
            avail:    all.reduce((s, r) => s + (r.available_inr || 0), 0),
            bodies:   all.length,
        };
    }, [rows]);

    if (loading) {
        return <div className="p-16" data-testid="budgets-loading"><CricketLoader size="lg" label="Reconciling the budget ledger…" /></div>;
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="budgets-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article XIV · Annual Budget</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        The Budget, Reconciled.
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Annual allocation versus committed (in-flight claims) versus disbursed —
                        across every Division and District. Live, no double-entry drift.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-mpca-gray-dark">
                    <span className="overline">Fiscal Cycle</span>
                    <select
                        value={cycle}
                        onChange={(e) => setCycle(e.target.value)}
                        data-testid="budgets-cycle-select"
                        className="bg-transparent border-b border-mpca-gray/40 font-mono px-1 py-1 text-sm focus:outline-none focus:border-mpca-oxblood"
                    >
                        <option value="2025-26">2025-26</option>
                        <option value="2024-25">2024-25</option>
                    </select>
                </div>
            </div>

            <div className="crest-divider mb-10" />

            {/* Totals */}
            <div className="grid sm:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-10" data-testid="budget-totals">
                <div className="bulletin-card p-6 border-0 rounded-none">
                    <Coins className="text-mpca-green-dark mb-3" size={20} strokeWidth={1.25} />
                    <div className="overline">Total Annual Allocation</div>
                    <div className="font-serif text-3xl text-mpca-green-dark mt-2 leading-none">{fmtINR(totals.annual)}</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-2">Across {totals.bodies} bodies</div>
                </div>
                <div className="bulletin-card p-6 border-0 rounded-none">
                    <TrendingUp className="text-mpca-oxblood mb-3" size={20} strokeWidth={1.25} />
                    <div className="overline">In-Flight</div>
                    <div className="font-serif text-3xl text-mpca-oxblood mt-2 leading-none">{fmtINR(totals.committed)}</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-2">Submitted / Recommended / Sanctioned</div>
                </div>
                <div className="bulletin-card p-6 border-0 rounded-none">
                    <ShieldCheck className="text-mpca-gold mb-3" size={20} strokeWidth={1.25} />
                    <div className="overline">Disbursed</div>
                    <div className="font-serif text-3xl text-mpca-gold mt-2 leading-none">{fmtINR(totals.disbursed)}</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-2">Cheques / NEFT released</div>
                </div>
                <div className="bulletin-card p-6 border-0 rounded-none">
                    <AlertTriangle className="text-mpca-burgundy-dark mb-3" size={20} strokeWidth={1.25} />
                    <div className="overline">Available Headroom</div>
                    <div className="font-serif text-3xl text-mpca-green-dark mt-2 leading-none">{fmtINR(totals.avail)}</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-2">Annual − Committed − Disbursed</div>
                </div>
            </div>

            {/* Threshold reference */}
            {thresholds && (
                <div className="bulletin-card p-6 mb-10 bg-mpca-parchment/40" data-testid="thresholds-card">
                    <div className="flex items-baseline gap-3 mb-3">
                        <ShieldCheck className="text-mpca-burgundy-dark" size={16} />
                        <div className="overline">Art. 28(v) · Sanctioning Matrix</div>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {thresholds.thresholds.map((t) => (
                            <div key={t.post} className="text-xs border border-mpca-brass/30 px-3 py-2" data-testid={"threshold-" + t.post.toLowerCase().replace(/\s+/g, "-")}>
                                <div className="font-serif text-sm text-mpca-green-dark">{t.post}</div>
                                <div className="font-mono text-mpca-oxblood mt-0.5">
                                    {t.limit_inr === null ? "No upper limit" : "≤ " + fmtINR(t.limit_inr)}
                                </div>
                                <div className="text-mpca-gray-dark text-[10px] mt-1">{t.scope}</div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 text-[11px] text-mpca-gray-dark italic">
                        Two-signatory required for bank disbursements above {fmtINR(thresholds.two_signatory_threshold_inr)}.
                        Anti-fragmentation: claims that cumulatively cross the next authority's limit must be consolidated or expressly over-ridden.
                    </div>
                </div>
            )}

            {/* ABC Expenditure Analysis */}
            {abc && abc.rows.length > 0 && (
                <div className="bulletin-card p-6 mb-10" data-testid="abc-card">
                    <div className="flex items-baseline gap-3 mb-4">
                        <BarChart3 className="text-mpca-burgundy-dark" size={16} />
                        <div className="overline">ABC Expenditure Analysis · Cycle {abc.fiscal_cycle}</div>
                        <div className="text-[10px] text-mpca-gray-dark ml-auto font-mono">
                            Total disbursed: {fmtINR(abc.total_disbursed_inr)}
                        </div>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-5">
                        {["A", "B", "C"].map((bk) => {
                            const meta = { A: { tone: "saffron", text: "text-mpca-oxblood", note: "Top ~70% of value · close monitoring" }, B: { tone: "marigold", text: "text-mpca-gold", note: "Next ~20% · periodic review" }, C: { tone: "navy", text: "text-mpca-green-dark", note: "Trailing ~10% · light-touch" } }[bk];
                            const b = abc.buckets[bk] || { count: 0, total_inr: 0 };
                            return (
                                <div key={bk} className="bg-mpca-ivory p-4" data-testid={"abc-bucket-" + bk}>
                                    <div className="overline">{bk} · {meta.note.split(" · ")[0]}</div>
                                    <div className={"font-serif text-3xl mt-2 leading-none " + meta.text}>{fmtINR(b.total_inr)}</div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-2">{b.count} claim{b.count === 1 ? "" : "s"} · {meta.note.split(" · ")[1]}</div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Cumulative bar */}
                    <div className="flex h-3 border border-mpca-brass/30" data-testid="abc-bar">
                        {abc.rows.map((r) => (
                            <div
                                key={r.claim_id}
                                title={r.claim_no + " · " + r.title + " · " + fmtINR(r.amount_inr)}
                                style={{ width: r.share_pct + "%" }}
                                className={
                                    r.bucket === "A" ? "bg-mpca-oxblood" :
                                    r.bucket === "B" ? "bg-mpca-gold" :
                                    "bg-mpca-green-dark"
                                }
                            />
                        ))}
                    </div>
                    <div className="text-[10px] text-mpca-gray-dark mt-2 italic">
                        Hover a band to see the underlying claim. A-items demand strategic oversight; C-items can be delegated.
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="flex items-center gap-2 text-xs">
                    <Filter size={12} className="text-mpca-gray-dark" />
                    <span className="overline">Filter</span>
                </div>
                {[
                    ["all", "All"],
                    ["Division", "Divisions"],
                    ["District", "Districts"],
                ].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setTypeFilter(k)}
                        data-testid={"budget-filter-" + k}
                        className={
                            "px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold border transition-colors " +
                            (typeFilter === k
                                ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:bg-mpca-parchment")
                        }
                    >
                        {label}
                    </button>
                ))}
                <label className="ml-auto flex items-center gap-2 text-xs text-mpca-gray-dark cursor-pointer" data-testid="budget-show-zero">
                    <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
                    Include bodies with no activity
                </label>
            </div>

            {/* Table */}
            <div className="bulletin-card overflow-hidden" data-testid="budget-table">
                <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-mpca-parchment/60 border-b border-mpca-brass/30 text-[10px] uppercase tracking-[0.15em] text-mpca-green-dark font-semibold">
                    <div className="col-span-4">Body</div>
                    <div className="col-span-2 text-right">Annual</div>
                    <div className="col-span-2 text-right">Committed</div>
                    <div className="col-span-2 text-right">Disbursed</div>
                    <div className="col-span-2 text-right">Available</div>
                </div>
                {visible.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-mpca-gray-dark italic font-serif">
                        No bodies match this filter (or none have activity yet — toggle "Include bodies with no activity").
                    </div>
                ) : (
                    visible.map((r) => {
                        const TypeIcon = TYPE_ICON[r.body_type] || MapPin;
                        const overUtilised = r.utilisation_pct > 100;
                        const highUtil = r.utilisation_pct > 80;
                        return (
                            <div
                                key={r.body_id}
                                data-testid={"budget-row-" + r.body_id}
                                className="grid grid-cols-12 gap-2 px-5 py-4 border-b border-mpca-brass/15 hover:bg-mpca-parchment/40 transition-colors"
                            >
                                <div className="col-span-4 flex items-center gap-3 min-w-0">
                                    <TypeIcon size={14} strokeWidth={1.5} className={
                                        r.body_type === "Division" ? "text-mpca-burgundy-dark" : "text-mpca-gold"
                                    } />
                                    <div className="min-w-0">
                                        <div className="font-serif text-base text-mpca-green-dark truncate">{r.body_name}</div>
                                        <div className="font-mono text-[10px] text-mpca-gray-dark tracking-wider">
                                            {r.body_id} · {r.claim_count} claim{r.claim_count === 1 ? "" : "s"}
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-2 text-right font-mono text-sm self-center">{fmtINR(r.annual_budget_inr)}</div>
                                <div className="col-span-2 text-right font-mono text-sm self-center text-mpca-oxblood">{fmtINR(r.committed_inr)}</div>
                                <div className="col-span-2 text-right font-mono text-sm self-center text-mpca-gold">{fmtINR(r.disbursed_inr)}</div>
                                <div className="col-span-2 text-right self-center">
                                    <div className={"font-mono text-sm " + (overUtilised ? "text-mpca-burgundy-dark font-bold" : highUtil ? "text-mpca-oxblood font-semibold" : "text-mpca-green-dark")}>
                                        {fmtINR(r.available_inr)}
                                    </div>
                                    <div className="h-1 bg-mpca-brass/15 mt-1.5 relative">
                                        <div
                                            className={"absolute inset-y-0 left-0 transition-all " + (overUtilised ? "bg-mpca-burgundy-dark" : highUtil ? "bg-mpca-oxblood" : "bg-mpca-green-dark")}
                                            style={{ width: Math.min(100, r.utilisation_pct) + "%" }}
                                        />
                                    </div>
                                    <div className="text-[10px] text-mpca-gray-dark mt-1">{r.utilisation_pct}% utilised</div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Budgets;
