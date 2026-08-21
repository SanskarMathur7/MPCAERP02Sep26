/**
 * Feb 2026 · Attached Camp View · Grant Claims
 * ─────────────────────────────────────────────
 * When a grant claim was auto-materialised from a Division-owned camp
 * (scheme `camp_reimbursement` · `attached_tournament_id` + `attached_invoice_ids`
 * populated), this panel surfaces the source camp header and the bundled
 * invoice evidence so MPCA reviewers see everything in one click.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileText, Package, IndianRupee, CheckCircle2, ChevronRight } from "lucide-react";
import { api, BACKEND_URL } from "@/lib/api";

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const fmtDate = (d) => (d || "").slice(0, 10) || "—";

export default function AttachedCampView({ claim }) {
    const [tournament, setTournament] = useState(null);
    const [budget, setBudget] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    const tid = claim?.attached_tournament_id;
    const bid = claim?.attached_tournament_budget_id;
    const invIds = claim?.attached_invoice_ids || [];

    useEffect(() => {
        if (!tid) { setLoading(false); return; }
        (async () => {
            setLoading(true); setErr(null);
            try {
                const [{ data: t }, { data: allBudgets }, { data: allInv }] = await Promise.all([
                    api.get(`/tournaments/${tid}`),
                    bid ? api.get(`/tournament-budgets/${bid}`).then((r) => ({ data: [r.data] })).catch(() => ({ data: [] }))
                        : api.get("/tournament-budgets", { params: { tournament_id: tid, body_id: claim?.body_id } }),
                    api.get("/tournament-invoices", { params: { tournament_id: tid, body_id: claim?.body_id } }),
                ]);
                setTournament(t);
                setBudget((allBudgets || [])[0] || null);
                // Prefer the exact linked invoices; fall back to any invoices on this camp
                const linked = (allInv || []).filter((x) => invIds.includes(x.id));
                setInvoices(linked.length ? linked : (allInv || []));
            } catch (e) {
                setErr(e?.response?.data?.detail || e.message || "Failed to load attached camp");
            } finally {
                setLoading(false);
            }
        })();
    }, [tid, bid, claim?.body_id, invIds.join(",")]);

    if (!tid) return null;   // Not a camp claim — render nothing

    const claimed = Number(claim?.claimed_amount_inr || 0);
    const ceiling = Number(budget?.total_ceiling_inr || 0);
    const utilisation = ceiling ? Math.min(100, Math.round((claimed / ceiling) * 100)) : 0;
    const variance = ceiling ? claimed - ceiling : 0;
    const invoiceSum = invoices.reduce((s, x) => s + Number(x.amount_inr || 0), 0);
    const headTallies = invoices.reduce((acc, x) => {
        const k = x.head_label || x.head || "Misc";
        acc[k] = (acc[k] || 0) + Number(x.amount_inr || 0);
        return acc;
    }, {});

    return (
        <section className="bulletin-card border-l-4 border-mpca-oxblood mb-4" data-testid="attached-camp-view">
            {/* Header pill + drill-through */}
            <header className="px-4 py-3 border-b border-mpca-brass/20 bg-mpca-ivory flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-mpca-oxblood text-mpca-ivory font-mono text-[9px] uppercase tracking-widest" data-testid="attached-camp-badge">
                            From Camp
                        </span>
                        <span className="font-mono text-[10px] text-mpca-gray-dark uppercase tracking-widest">
                            {tournament?.tournament_type_code?.replace(/_/g, " ") || "camp"}
                        </span>
                    </div>
                    <h3 className="font-serif text-xl text-mpca-green-dark leading-tight">
                        {tournament?.name || (loading ? "Loading…" : "Unknown camp")}
                    </h3>
                    {tournament && (
                        <p className="text-[11px] text-mpca-gray-dark mt-1">
                            {fmtDate(tournament.start_date)} → {fmtDate(tournament.end_date)} · {tournament.host_body_id}
                        </p>
                    )}
                </div>
                {tid && (
                    <Link to={`/tournaments/${tid}/finance`} target="_blank"
                          className="btn-heritage-secondary text-[10px] flex items-center gap-1 shrink-0"
                          data-testid="attached-camp-open-tournament">
                        Open camp <ArrowUpRight size={12} />
                    </Link>
                )}
            </header>

            {/* Metrics strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-mpca-brass/20">
                <div>
                    <div className="overline text-[9px] text-mpca-gray-dark">Sanctioned Ceiling</div>
                    <div className="font-serif text-xl text-mpca-green-dark mt-0.5"><IndianRupee size={14} className="inline -mt-0.5" strokeWidth={1.5}/>{Number(ceiling).toLocaleString("en-IN")}</div>
                    {budget?.budget_no && <div className="text-[9px] font-mono text-mpca-gray-dark mt-0.5">{budget.budget_no}</div>}
                </div>
                <div>
                    <div className="overline text-[9px] text-mpca-gray-dark">Claimed</div>
                    <div className="font-serif text-xl text-mpca-oxblood mt-0.5"><IndianRupee size={14} className="inline -mt-0.5" strokeWidth={1.5}/>{Number(claimed).toLocaleString("en-IN")}</div>
                    <div className="text-[9px] font-mono text-mpca-gray-dark mt-0.5">{utilisation}% of ceiling</div>
                </div>
                <div>
                    <div className="overline text-[9px] text-mpca-gray-dark">Variance</div>
                    <div className={"font-serif text-xl mt-0.5 " + (variance > 0 ? "text-mpca-oxblood" : "text-mpca-green-dark")}>
                        <IndianRupee size={14} className="inline -mt-0.5" strokeWidth={1.5}/>{Math.abs(variance).toLocaleString("en-IN")}
                    </div>
                    <div className="text-[9px] font-mono text-mpca-gray-dark mt-0.5">{variance > 0 ? "over" : "under"} ceiling</div>
                </div>
                <div>
                    <div className="overline text-[9px] text-mpca-gray-dark">Invoices Bundled</div>
                    <div className="font-serif text-xl text-mpca-green-dark mt-0.5">{invoices.length}</div>
                    <div className="text-[9px] font-mono text-mpca-gray-dark mt-0.5">{money(invoiceSum)} across {Object.keys(headTallies).length} head(s)</div>
                </div>
            </div>

            {/* Invoice table */}
            <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="overline text-[10px] text-mpca-brass">Bundled invoices · evidence</div>
                    {budget?.reimbursed_utr && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-mpca-green-dark">
                            <CheckCircle2 size={12} strokeWidth={1.5}/> Reimbursed · UTR {budget.reimbursed_utr}
                        </span>
                    )}
                </div>
                {loading ? (
                    <div className="text-xs text-mpca-gray-dark italic py-4">Loading bundled evidence…</div>
                ) : err ? (
                    <div className="text-xs text-mpca-oxblood py-2">{err}</div>
                ) : invoices.length === 0 ? (
                    <div className="text-xs text-mpca-gray-dark italic py-4 border border-dashed border-mpca-brass/30 px-3" data-testid="attached-camp-empty">No invoices attached.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]" data-testid="attached-camp-invoice-table">
                            <thead className="bg-mpca-ivory text-mpca-gray-dark uppercase tracking-widest text-[9px]">
                                <tr>
                                    <th className="text-left px-2 py-1.5">Invoice #</th>
                                    <th className="text-left px-2 py-1.5">Vendor</th>
                                    <th className="text-left px-2 py-1.5">Head</th>
                                    <th className="text-right px-2 py-1.5">Amount</th>
                                    <th className="text-left px-2 py-1.5">Date</th>
                                    <th className="text-left px-2 py-1.5">File</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={inv.id} className="border-t border-mpca-brass/20 hover:bg-mpca-ivory/50" data-testid={`attached-camp-invoice-${inv.id}`}>
                                        <td className="px-2 py-1.5 font-mono text-mpca-charcoal">{inv.invoice_no || "—"}</td>
                                        <td className="px-2 py-1.5 text-mpca-charcoal truncate max-w-[180px]" title={inv.vendor_name}>{inv.vendor_name || "—"}</td>
                                        <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 bg-mpca-brass/10 text-mpca-brass font-mono text-[9px] uppercase">{inv.head_label || inv.head || "Misc"}</span></td>
                                        <td className="px-2 py-1.5 text-right font-mono text-mpca-charcoal">{money(inv.amount_inr)}</td>
                                        <td className="px-2 py-1.5 text-mpca-gray-dark">{fmtDate(inv.invoice_date || inv.created_at)}</td>
                                        <td className="px-2 py-1.5">
                                            {inv.file_url ? (
                                                <a href={`${BACKEND_URL}${inv.file_url}`} target="_blank" rel="noopener noreferrer" className="text-mpca-oxblood hover:text-mpca-green-dark inline-flex items-center gap-1">
                                                    <FileText size={11} strokeWidth={1.5} /> View
                                                </a>
                                            ) : <span className="text-mpca-gray-dark italic">—</span>}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="border-t-2 border-mpca-brass/40 bg-mpca-ivory font-mono text-[10px] uppercase">
                                    <td colSpan={3} className="px-2 py-2 text-right text-mpca-gray-dark">Total bundled</td>
                                    <td className="px-2 py-2 text-right text-mpca-oxblood font-serif text-sm">{money(invoiceSum)}</td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Head-wise summary chips */}
                {Object.keys(headTallies).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-mpca-brass/20">
                        <div className="overline text-[9px] text-mpca-gray-dark mb-1.5">Head-wise breakdown</div>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(headTallies)
                                .sort(([, a], [, b]) => b - a)
                                .map(([head, amt]) => (
                                    <span key={head} className="inline-flex items-center gap-1 px-2 py-1 bg-mpca-parchment border border-mpca-brass/30 text-[10px]" data-testid={`attached-camp-head-${head}`}>
                                        <Package size={10} className="text-mpca-brass" strokeWidth={1.5} />
                                        <span className="text-mpca-charcoal font-medium">{head}</span>
                                        <ChevronRight size={10} className="text-mpca-brass/60" />
                                        <span className="text-mpca-oxblood font-mono">{money(amt)}</span>
                                    </span>
                                ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
