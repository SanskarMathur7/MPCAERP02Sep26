/**
 * Iter 126 · Body-wise financial summary for the Finance Console.
 *
 * Requested by user: "As in some cases MPCA may give advance to the division
 * against the tournament — then how much pending to pay to division after
 * reimbursement claim should be shown somewhere in the finance console."
 *
 * Reads GET /api/tournaments/{tid}/finance-summary-by-body — a per-body table
 * of eligible / MPCA-approved / already-paid / remaining amounts.
 */
import { useEffect, useState } from "react";
import { fetchFinanceSummaryByBody } from "@/lib/api";
import { Loader2, RefreshCw, HandCoins, AlertTriangle } from "lucide-react";

const fmt = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const statusTone = (s) => {
    switch (s) {
        case "Approved":     return "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40";
        case "Submitted":
        case "Under_Review": return "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40";
        case "Rejected":     return "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/40";
        case "Draft":        return "bg-mpca-parchment text-mpca-gray-dark border-mpca-brass/30";
        default:             return "bg-mpca-parchment/60 text-mpca-gray-dark border-mpca-brass/20";
    }
};

const FinanceSummaryByBodyPanel = ({ tournamentId, personaBodyType }) => {
    const [summary, setSummary] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [expanded, setExpanded] = useState(true);

    const load = async () => {
        setBusy(true); setErr(null);
        try {
            const data = await fetchFinanceSummaryByBody(tournamentId);
            setSummary(data);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    useEffect(() => { load(); }, [tournamentId]);

    if (busy && !summary) {
        return (
            <div className="border border-mpca-brass/30 bg-mpca-ivory p-4 mb-6" data-testid="fs-by-body-loading">
                <Loader2 size={14} className="inline animate-spin mr-2" /> Loading division-wise financial summary…
            </div>
        );
    }
    if (!summary) return null;

    // Divisions only see their own row; MPCA sees everyone.
    const rows = summary.rows || [];
    const isDivision = personaBodyType && personaBodyType !== "State";
    // For the current UI we render every row that has ANY financial activity;
    // rows with zero eligible + zero paid + no claim are dropped so the panel
    // stays focussed on the bodies MPCA actually owes money to.
    const activeRows = rows.filter((r) => r.eligible_amount_inr > 0 || r.paid_amount_inr > 0 || r.claim_status);
    if (activeRows.length === 0) return null;

    return (
        <div className="border-2 border-mpca-oxblood/40 bg-mpca-ivory mb-6" data-testid="fs-by-body-panel">
            <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-mpca-parchment/60" data-testid="fs-by-body-toggle">
                <div className="flex items-center gap-2">
                    <HandCoins size={14} className="text-mpca-oxblood" />
                    <span className="font-serif text-sm text-mpca-green-dark font-semibold">Financial Summary · Division-wise</span>
                    <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                        · {activeRows.length} {activeRows.length === 1 ? "body" : "bodies"}
                    </span>
                </div>
                <span className="text-mpca-oxblood font-mono text-[10px]">{expanded ? "▼" : "▶"}</span>
            </button>
            {expanded && (
                <div className="border-t border-mpca-oxblood/30">
                    {err && (
                        <div className="p-3 text-xs text-mpca-oxblood bg-mpca-oxblood/5 flex items-center gap-2">
                            <AlertTriangle size={12} /> {err}
                        </div>
                    )}
                    <table className="w-full text-[12px]" data-testid="fs-by-body-table">
                        <thead className="bg-mpca-parchment/60">
                            <tr className="border-b border-mpca-brass/30">
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Division / Body</th>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass w-24">Claim</th>
                                <th className="text-right px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Eligible ₹</th>
                                <th className="text-right px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">MPCA Approved ₹</th>
                                <th className="text-right px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass" title="Sum of MPCA receipts paid to this Division (advances + reimbursements).">Paid ₹</th>
                                <th className="text-right px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass" title="Payments made BEFORE claim approval — treated as advances.">Advance ₹</th>
                                <th className="text-right px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass" title="What MPCA still needs to pay after netting off receipts.">Remaining ₹</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeRows.map((r) => {
                                const dim = isDivision && r.body_code !== null; // MPCA sees all; Divisions still see all for context
                                const overpaid = r.overpaid_amount_inr > 0;
                                return (
                                    <tr key={r.body_code || "u"} className="border-b border-mpca-brass/10 hover:bg-mpca-parchment/40" data-testid={`fs-row-${r.body_code || "u"}`}>
                                        <td className="px-3 py-2">
                                            <div className="font-serif text-mpca-green-dark font-semibold">{r.body_name}</div>
                                            <div className="text-[9px] font-mono text-mpca-gray-dark">{r.body_code}</div>
                                        </td>
                                        <td className="px-3 py-2">
                                            {r.claim_status ? (
                                                <div className="space-y-0.5">
                                                    <span className={`inline-block text-[9px] uppercase tracking-widest border px-1.5 py-0.5 ${statusTone(r.claim_status)}`}>{r.claim_status}</span>
                                                    {r.claim_ref && <div className="text-[9px] font-mono text-mpca-brass">{r.claim_ref}</div>}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] italic text-mpca-gray-dark">no claim</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">{fmt(r.eligible_amount_inr)}</td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            {r.mpca_approved_inr != null ? (
                                                <span className="text-mpca-green-dark font-semibold">{fmt(r.mpca_approved_inr)}</span>
                                            ) : "—"}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            {r.paid_amount_inr > 0 ? fmt(r.paid_amount_inr) : "—"}
                                            {r.receipts_count > 0 && <div className="text-[9px] text-mpca-gray-dark">{r.receipts_count} rcpt</div>}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            {r.advance_before_claim > 0 ? (
                                                <span className="text-mpca-brass" title="Paid before claim was approved — treated as advance">{fmt(r.advance_before_claim)}</span>
                                            ) : "—"}
                                        </td>
                                        <td className={"px-3 py-2 text-right font-mono " + (overpaid ? "text-mpca-oxblood" : r.remaining_amount_inr > 0 ? "text-mpca-oxblood font-semibold" : "text-mpca-green-dark")}>
                                            {overpaid ? (
                                                <span title="Advances exceed MPCA-approved amount">−{fmt(r.overpaid_amount_inr)} (over)</span>
                                            ) : fmt(r.remaining_amount_inr)}
                                        </td>
                                    </tr>
                                );
                            })}
                            {/* Totals row */}
                            {summary.totals && (
                                <tr className="border-t-2 border-mpca-oxblood/50 bg-mpca-parchment/50 font-semibold" data-testid="fs-totals-row">
                                    <td className="px-3 py-2 text-mpca-oxblood uppercase tracking-widest text-[10px]">Total</td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(summary.totals.eligible_amount_inr)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(summary.totals.mpca_approved_inr)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(summary.totals.paid_amount_inr)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(summary.totals.advance_before_claim)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-mpca-oxblood">{fmt(summary.totals.remaining_amount_inr)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="flex items-center justify-between px-4 py-2 border-t border-mpca-brass/20 text-[10px] text-mpca-gray-dark">
                        <span>
                            Advance = paid BEFORE MPCA approval · Remaining = MPCA-approved − Paid. Refresh after logging a receipt.
                        </span>
                        <button
                            onClick={load}
                            disabled={busy}
                            className="uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood inline-flex items-center gap-1 disabled:opacity-40"
                            data-testid="fs-refresh-btn"
                        >
                            <RefreshCw size={10} className={busy ? "animate-spin" : ""} /> Refresh
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceSummaryByBodyPanel;
