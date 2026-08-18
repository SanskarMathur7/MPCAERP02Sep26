/**
 * MPCA-257 · Tournament Closure Certificate (PDF-ready view)
 * ──────────────────────────────────────────────────────────
 * Same visual language as TournamentSchedulePDF — MPCA ERP branding, serif
 * title, monospace meta line, numbered black-and-white sections, and a
 * "Print / Save as PDF" toolbar. Replaces the legacy reportlab-generated
 * closure PDF so every tournament artefact (schedule · closure · grant
 * summary) shares one consistent format.
 *
 * Route: /tournaments/:id/closure
 * Data pulled:
 *   - /tournaments/:id                        (basics)
 *   - /tournaments/:id/matches                (match schedule)
 *   - /tournaments/:id/participants           (bodies · pools)
 *   - /tournaments/:id/spent-by-head?body_id  (financial rollup per body)
 *   - /tournaments/:id/match-officials/rollup (officials + DA)
 *   - /tournament-invoices?tid=…              (invoice ledger)
 *   - /tournaments/:id/closure-letter         (body text · optional)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const fmtDate = (s) => (s ? new Date(s + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const INR = (n) => `\u20B9${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

export default function TournamentClosurePDF() {
    const { id } = useParams();
    const [t, setT]                 = useState(null);
    const [matches, setMatches]     = useState([]);
    const [participants, setParts]  = useState([]);
    const [officialsR, setOffR]     = useState(null);
    const [invoices, setInvoices]   = useState([]);
    const [spentByBody, setSpent]   = useState({});
    const [letter, setLetter]       = useState(null);
    const [loading, setLoading]     = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [tRes, mRes, pRes, oRes, iRes, lRes] = await Promise.all([
                    api.get(`/tournaments/${id}`),
                    api.get(`/tournaments/${id}/matches`),
                    api.get(`/tournaments/${id}/participants`).catch(() => ({ data: [] })),
                    api.get(`/tournaments/${id}/match-officials/rollup`).catch(() => ({ data: null })),
                    api.get(`/tournament-invoices`, { params: { tid: id } }).catch(() => ({ data: [] })),
                    api.get(`/tournaments/${id}/closure-letter`).catch(() => ({ data: null })),
                ]);
                setT(tRes.data);
                setMatches(mRes.data || []);
                setParts(pRes.data || []);
                setOffR(oRes.data);
                setInvoices(iRes.data || []);
                setLetter(lRes.data);

                // Per-body head-wise spend (only for participants that have a body_code)
                const bodies = Array.from(new Set(
                    [tRes.data.host_body_id, ...(pRes.data || []).map((p) => p.body_code)].filter(Boolean)
                ));
                const per = {};
                await Promise.all(bodies.map(async (bid) => {
                    try {
                        const { data } = await api.get(`/tournaments/${id}/spent-by-head`, { params: { body_id: bid } });
                        per[bid] = data;
                    } catch { /* no budget for this body */ }
                }));
                setSpent(per);
            } finally { setLoading(false); }
        })();
    }, [id]);

    // Group matches by stage for the schedule section (Leagues · SF · Final).
    const matchesByStage = useMemo(() => {
        const g = {};
        (matches || []).forEach((m) => {
            const k = m.stage === "Semi_Final" || m.stage === "Final" || m.stage === "Quarter_Final"
                    ? "Knockouts" : (m.stage === "League" ? "League" : "Other");
            (g[k] = g[k] || []).push(m);
        });
        Object.values(g).forEach((arr) => arr.sort((a, b) => (a.match_date || "").localeCompare(b.match_date || "")));
        return g;
    }, [matches]);

    // Invoice by-head roll-up (aggregate all bodies · for the ledger overview).
    const invHeadsAgg = useMemo(() => {
        const map = {};
        (invoices || []).forEach((inv) => {
            const allocs = inv.allocations && inv.allocations.length ? inv.allocations
                : [{ head_label: inv.budget_head_code || "Unallocated", amount_inr: inv.total_inr || 0 }];
            allocs.forEach((a) => {
                const k = a.head_label || a.head_code || "Unallocated";
                map[k] = (map[k] || 0) + Number(a.amount_inr || 0);
            });
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [invoices]);

    if (loading || !t) {
        return <div className="flex items-center justify-center h-64 text-mpca-brass"><Loader2 className="animate-spin" size={16} /> Loading closure certificate…</div>;
    }

    return (
        <div className="max-w-[900px] mx-auto p-8 bg-white text-black font-serif print:p-4" data-testid="tournament-closure-pdf">
            {/* Screen-only toolbar */}
            <div className="print:hidden mb-4 flex items-center justify-between border-b-2 border-black pb-2">
                <div className="text-sm">
                    <span className="uppercase tracking-widest text-[10px] text-gray-500">MPCA ERP · Tournament Closure</span>
                </div>
                <button onClick={() => window.print()} data-testid="closure-print-btn"
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest bg-black text-white px-3 py-1.5 hover:bg-gray-800">
                    <Printer size={12} /> Print / Save as PDF
                </button>
            </div>

            {/* Header — mirrors schedule PDF exactly */}
            <div className="text-center mb-4 border-b border-black pb-3">
                <div className="text-[9px] uppercase tracking-[0.3em] mb-1">Madhya Pradesh Cricket Association · Since 1957</div>
                <div className="text-[10px] uppercase tracking-[0.25em] mb-2 text-gray-700">Tournament Closure Certificate</div>
                <h1 className="text-3xl font-bold" data-testid="closure-title">{t.name}</h1>
                <div className="text-[11px] mt-1 flex gap-3 justify-center flex-wrap">
                    <span>Tournament No. <b>{t.tournament_no}</b></span>
                    <span>·</span>
                    <span>{t.setup_meta?.category || "—"} · {t.setup_meta?.age_group || t.age_bracket || "—"}</span>
                    <span>·</span>
                    <span>{t.format}</span>
                    <span>·</span>
                    <span>Fiscal <b>{t.fiscal_cycle}</b></span>
                </div>
                <div className="text-[11px] mt-1">
                    <b>{fmtDate(t.start_date)}</b> → <b>{fmtDate(t.end_date)}</b> · Host <b>{t.host_body_id}</b>
                </div>
                {t.status === "Completed" && (
                    <div className="mt-3 text-[10px] uppercase tracking-widest inline-block border border-black px-2 py-0.5">Certified · Completed</div>
                )}
            </div>

            <p className="text-[11px] mb-4 leading-relaxed">
                This is to certify that the tournament described above has been concluded and all financial obligations
                summarised herein have been reconciled against the sanctioned budget. This document, along with any
                attached signed appendices, forms the complete record of tournament closure for archival purposes.
            </p>

            {/* Section 1 · Participating Bodies */}
            <h3 className="text-lg border-b border-black mb-2 mt-6">1. Participating Bodies</h3>
            {participants.length === 0 ? (
                <div className="text-[11px] italic text-gray-600 mb-4">No participants recorded.</div>
            ) : (
                <table className="w-full text-[11px] border-collapse mb-4" data-testid="closure-parts-table">
                    <thead>
                        <tr className="border-b border-black">
                            <th className="text-left py-1 pr-2 w-6">#</th>
                            <th className="text-left py-1 pr-2">Body</th>
                            <th className="text-left py-1 pr-2">Role</th>
                            <th className="text-left py-1 pr-2">Pool</th>
                            <th className="text-left py-1 pr-2">Acceptance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {participants.map((p, i) => (
                            <tr key={p.id || i} className="border-b border-gray-300">
                                <td className="py-1 pr-2">{i + 1}</td>
                                <td className="py-1 pr-2"><b>{p.body_name || p.body_code}</b> <span className="text-gray-600">({p.body_code})</span></td>
                                <td className="py-1 pr-2">{p.body_code === t.host_body_id ? "Host" : (p.role || "Visitor")}</td>
                                <td className="py-1 pr-2">{p.pool_name || "—"}</td>
                                <td className="py-1 pr-2">{p.acceptance_status || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Section 2 · Match Schedule (compact) */}
            <h3 className="text-lg border-b border-black mb-2 mt-6">2. Match Schedule &amp; Results</h3>
            {matches.length === 0 && (
                <div className="text-[11px] italic text-gray-600 mb-4">No matches recorded.</div>
            )}
            {["League", "Knockouts", "Other"].map((stage) => {
                const arr = matchesByStage[stage];
                if (!arr || !arr.length) return null;
                return (
                    <div key={stage} className="mb-3">
                        <div className="inline-block bg-black text-white px-2 py-0.5 text-[10px] uppercase tracking-widest mb-1">{stage} · {arr.length} match(es)</div>
                        <table className="w-full text-[11px] border-collapse" data-testid={`closure-schedule-${stage.toLowerCase()}`}>
                            <thead>
                                <tr className="border-b border-black">
                                    <th className="text-left py-1 pr-2 w-6">#</th>
                                    <th className="text-left py-1 pr-2">Label</th>
                                    <th className="text-left py-1 pr-2">Fixture</th>
                                    <th className="text-left py-1 pr-2">Dates</th>
                                    <th className="text-left py-1 pr-2">Ground</th>
                                    <th className="text-left py-1 pr-2">Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {arr.map((m, i) => (
                                    <tr key={m.id} className="border-b border-gray-300">
                                        <td className="py-1 pr-2">{i + 1}</td>
                                        <td className="py-1 pr-2">{m.label || "—"}</td>
                                        <td className="py-1 pr-2"><b>{m.home_team}</b> v <b>{m.away_team}</b></td>
                                        <td className="py-1 pr-2">{fmtDate(m.match_date)}</td>
                                        <td className="py-1 pr-2">{m.ground_name || m.venue_name || "—"}</td>
                                        <td className="py-1 pr-2">{m.result || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })}

            {/* Section 3 · Match Officials rollup */}
            {officialsR?.per_role?.length > 0 && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-6">3. Match Officials · Fees &amp; DA</h3>
                    <table className="w-full text-[11px] border-collapse mb-4" data-testid="closure-officials-table">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="text-left py-1 pr-2">Role</th>
                                <th className="text-right py-1 pr-2">Pax</th>
                                <th className="text-right py-1 pr-2">Fees</th>
                                <th className="text-right py-1 pr-2">DA</th>
                                <th className="text-right py-1 pr-2">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {officialsR.per_role.map((r) => (
                                <tr key={r.role} className="border-b border-gray-300">
                                    <td className="py-1 pr-2"><b>{r.role}</b></td>
                                    <td className="py-1 pr-2 text-right font-mono">{r.count}</td>
                                    <td className="py-1 pr-2 text-right font-mono">{INR(r.fees)}</td>
                                    <td className="py-1 pr-2 text-right font-mono">{INR(r.da)}</td>
                                    <td className="py-1 pr-2 text-right font-mono"><b>{INR(r.total)}</b></td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-black">
                                <td className="py-1 pr-2 uppercase tracking-widest text-[10px]">Officials Grand Total</td>
                                <td colSpan={3}></td>
                                <td className="py-1 pr-2 text-right font-mono"><b>{INR(officialsR.grand_total)}</b></td>
                            </tr>
                        </tbody>
                    </table>
                </>
            )}

            {/* Section 4 · Budget vs Spent per body */}
            <h3 className="text-lg border-b border-black mb-2 mt-6">4. Budget Utilisation</h3>
            {Object.keys(spentByBody).length === 0 ? (
                <div className="text-[11px] italic text-gray-600 mb-4">No approved budget on file.</div>
            ) : (
                Object.entries(spentByBody).map(([bid, sb]) => (
                    <div key={bid} className="mb-4" data-testid={`closure-budget-${bid}`}>
                        <div className="text-[11px] mb-1"><b>{bid}</b> · Sanctioned <b>{INR(sb.budget_total_inr)}</b> · Spent <b>{INR(sb.invoiced_total_inr)}</b> · Eligible <b>{INR(sb.eligible_total_inr)}</b> {sb.over_budget_inr > 0 && <span>· Over <b>{INR(sb.over_budget_inr)}</b></span>}</div>
                        <table className="w-full text-[11px] border-collapse">
                            <thead>
                                <tr className="border-b border-black">
                                    <th className="text-left py-1 pr-2">Head</th>
                                    <th className="text-right py-1 pr-2">Sanctioned</th>
                                    <th className="text-right py-1 pr-2">Spent</th>
                                    <th className="text-right py-1 pr-2">Remaining</th>
                                    <th className="text-right py-1 pr-2 w-14">Util%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(sb.heads || []).filter((h) => h.spent_inr > 0 || h.limit_inr > 0).map((h) => (
                                    <tr key={h.head} className="border-b border-gray-300">
                                        <td className="py-1 pr-2">{h.head}</td>
                                        <td className="py-1 pr-2 text-right font-mono">{INR(h.limit_inr)}</td>
                                        <td className="py-1 pr-2 text-right font-mono">{INR(h.spent_inr)}</td>
                                        <td className="py-1 pr-2 text-right font-mono">{INR(h.limit_inr - h.spent_inr)}</td>
                                        <td className="py-1 pr-2 text-right font-mono">{h.utilisation_pct?.toFixed(0) || 0}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))
            )}

            {/* Section 5 · Invoice ledger */}
            {invoices.length > 0 && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-6">5. Invoice Ledger &middot; {invoices.length} invoice(s)</h3>
                    <table className="w-full text-[10px] border-collapse mb-4" data-testid="closure-invoices-table">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="text-left py-1 pr-2">Ref</th>
                                <th className="text-left py-1 pr-2">Date</th>
                                <th className="text-left py-1 pr-2">Vendor</th>
                                <th className="text-left py-1 pr-2">Head</th>
                                <th className="text-right py-1 pr-2">Amount</th>
                                <th className="text-right py-1 pr-2">GST</th>
                                <th className="text-right py-1 pr-2">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv) => (
                                <tr key={inv.id} className="border-b border-gray-200">
                                    <td className="py-1 pr-2 font-mono">{inv.invoice_ref}</td>
                                    <td className="py-1 pr-2">{fmtDate(inv.invoice_date)}</td>
                                    <td className="py-1 pr-2">{inv.vendor_name}</td>
                                    <td className="py-1 pr-2">{(inv.allocations?.[0]?.head_label) || inv.budget_head_code}</td>
                                    <td className="py-1 pr-2 text-right font-mono">{INR(inv.amount_inr)}</td>
                                    <td className="py-1 pr-2 text-right font-mono">{INR(inv.gst_inr)}</td>
                                    <td className="py-1 pr-2 text-right font-mono"><b>{INR(inv.total_inr)}</b></td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-black">
                                <td colSpan={4} className="py-1 pr-2 uppercase tracking-widest text-[10px]">Invoice Grand Total</td>
                                <td className="py-1 pr-2 text-right font-mono">{INR(invoices.reduce((a, b) => a + Number(b.amount_inr || 0), 0))}</td>
                                <td className="py-1 pr-2 text-right font-mono">{INR(invoices.reduce((a, b) => a + Number(b.gst_inr || 0), 0))}</td>
                                <td className="py-1 pr-2 text-right font-mono"><b>{INR(invoices.reduce((a, b) => a + Number(b.total_inr || 0), 0))}</b></td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Invoice roll-up by head (aggregate) */}
                    <div className="text-[10px] uppercase tracking-widest mb-1">Aggregate Spend by Head</div>
                    <table className="w-full text-[11px] border-collapse mb-4">
                        <tbody>
                            {invHeadsAgg.map(([head, amt]) => (
                                <tr key={head} className="border-b border-gray-200">
                                    <td className="py-1 pr-2">{head}</td>
                                    <td className="py-1 pr-2 text-right font-mono">{INR(amt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Section 6 · Closure note (from backend closure_letter) */}
            {letter?.body_text && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-6">6. Closure Notes</h3>
                    <pre className="whitespace-pre-wrap font-serif text-[11px] leading-relaxed">{letter.body_text}</pre>
                </>
            )}

            {/* Signature block */}
            <div className="mt-10 grid grid-cols-2 gap-8 text-[11px]">
                <div>
                    <div className="border-t border-black pt-1"><b>Hon. Secretary, MPCA</b></div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Date: __________________</div>
                </div>
                <div>
                    <div className="border-t border-black pt-1"><b>Hon. Treasurer, MPCA</b></div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Date: __________________</div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-3 border-t border-black text-[9px] uppercase tracking-widest flex justify-between text-gray-600">
                <span>MPCA ERP · Tournament Closure Certificate · {t.tournament_no}</span>
                <span>Generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>

            {/* Print-only page-break tune */}
            <style>{`@media print { @page { size: A4; margin: 12mm 10mm; } h3 { break-after: avoid; } table { break-inside: avoid; } }`}</style>
        </div>
    );
}
