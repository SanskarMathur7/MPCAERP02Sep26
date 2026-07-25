import { useEffect, useState, Fragment } from "react";
import { RefreshCw, Home, Plane, Loader2, Check, X, Info, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";

const fmtInr = (n) => {
    const v = Number(n || 0);
    if (v === 0) return "—";
    return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const AcceptChip = ({ status }) => {
    const cls = {
        Accepted: "bg-mpca-green-dark text-mpca-gold-light",
        Declined: "bg-mpca-oxblood text-mpca-ivory",
        Pending: "bg-mpca-brass/20 text-mpca-brass",
        Not_Required: "bg-mpca-gray-dark/20 text-mpca-gray-dark",
    }[status] || "bg-mpca-brass/20 text-mpca-brass";
    return <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 ${cls}`}>{status.replace("_", " ")}</span>;
};

const StatusChip = ({ label, tone = "muted" }) => {
    const cls = {
        muted: "bg-mpca-brass/10 text-mpca-brass",
        good: "bg-mpca-green-dark/15 text-mpca-green-dark",
        warn: "bg-mpca-oxblood/15 text-mpca-oxblood",
    }[tone] || "bg-mpca-brass/10 text-mpca-brass";
    return <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 ${cls}`}>{label}</span>;
};

const budgetTone = (s) => s === "Approved" ? "good" : (s === "Draft" || s === "Submitted") ? "muted" : "warn";
const claimTone = (s) => s === "Approved" ? "good" : (s === "Submitted" || s === "Under_Review") ? "muted" : (s === "Rejected" ? "warn" : "muted");

/**
 * Sprint M26 · Tournament Participants Matrix
 * ─────────────────────────────────────────────
 * Renders one row per participating body (Division/District) with lifecycle
 * columns: Role · Acceptance · Budget · Invoices · Claim · Payment. MPCA and
 * the participant's own persona can act on each row.
 */
const ParticipantsMatrix = ({ tournament, persona, canManage, onChange }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyCode, setBusyCode] = useState(null);
    const [err, setErr] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const [expandedCode, setExpandedCode] = useState(null);
    const [drilldown, setDrilldown] = useState({}); // body_code -> finance snapshot
    const [drillLoading, setDrillLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/participants`, { params: { include_removed: showHistory } });
            setRows(data || []);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [tournament.id, showHistory]);

    const resync = async () => {
        setErr("");
        setBusyCode("__resync");
        try {
            await api.post(`/tournaments/${tournament.id}/participants/resync`);
            await load();
            onChange?.();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyCode(null); }
    };

    const setAcceptance = async (row, status) => {
        setErr("");
        setBusyCode(row.body_code);
        try {
            await api.patch(`/tournaments/${tournament.id}/participants/${row.body_code}`, {
                acceptance_status: status,
                acceptance_by_name: persona?.full_name || persona?.name || "",
            });
            await load();
            onChange?.();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyCode(null); }
    };

    const toggleExpand = async (body_code) => {
        if (expandedCode === body_code) { setExpandedCode(null); return; }
        setExpandedCode(body_code);
        if (drilldown[body_code]) return;
        setDrillLoading(true);
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/participants/${body_code}/finance`);
            setDrilldown((m) => ({ ...m, [body_code]: data }));
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setDrillLoading(false); }
    };

    const activeRows = rows.filter((r) => !r.removed_at);
    const removedRows = rows.filter((r) => r.removed_at);

    // Roll-up totals for MPCA view
    const totalBudget = activeRows.reduce((s, r) => s + Number(r.budget_total_inr || 0), 0);
    const totalInvoice = activeRows.reduce((s, r) => s + Number(r.invoice_total_inr || 0), 0);
    const totalClaimReq = activeRows.reduce((s, r) => s + Number(r.claim_requested_inr || 0), 0);
    const totalReceipts = activeRows.reduce((s, r) => s + Number(r.receipt_total_inr || 0), 0);
    const totalOutstanding = activeRows.reduce((s, r) => s + Number(r.outstanding_inr || 0), 0);

    if (loading) return <div className="border border-mpca-brass/30 bg-mpca-ivory p-8 flex items-center gap-2 text-xs text-mpca-brass" data-testid="participants-loading"><Loader2 className="animate-spin" size={12} /> Loading participants…</div>;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-4" data-testid="panel-participants">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <div className="overline text-[9px]">MPCA Multi-Division Ledger</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">Participants · {activeRows.length} bodies</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl">
                        One row per participating Division/District. MPCA tracks each body&apos;s acceptance, budget, invoices, claim and payment for this tournament in one place. Auto-synced from the Division Pools setup.
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-mpca-brass" data-testid="participants-history-toggle-wrap">
                        <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} data-testid="participants-history-toggle" />
                        Show removed history
                    </label>
                    <button onClick={resync} disabled={busyCode === "__resync" || !canManage} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="participants-resync-btn">
                        {busyCode === "__resync" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Re-sync
                    </button>
                </div>
            </div>

            {err && <div className="text-[10px] text-mpca-oxblood bg-mpca-oxblood/5 px-2 py-1 border border-mpca-oxblood/30" data-testid="participants-error">{err}</div>}

            {activeRows.length === 0 ? (
                <div className="border border-dashed border-mpca-brass/40 px-4 py-8 text-center text-[11px] text-mpca-gray-dark" data-testid="participants-empty">
                    No participants yet. Set up Division Pools in the Tournament Basics panel first.
                </div>
            ) : (
                <div className="border border-mpca-brass/20 overflow-x-auto">
                    <table className="w-full text-xs" data-testid="participants-table">
                        <thead>
                            <tr className="bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                                <th className="px-3 py-1.5 text-left">Body</th>
                                <th className="px-3 py-1.5 text-left">Role</th>
                                <th className="px-3 py-1.5 text-left">Pool</th>
                                <th className="px-3 py-1.5 text-left">Accept</th>
                                <th className="px-3 py-1.5 text-right">Budget</th>
                                <th className="px-3 py-1.5 text-right">Invoices</th>
                                <th className="px-3 py-1.5 text-right">Claim</th>
                                <th className="px-3 py-1.5 text-right">Received</th>
                                <th className="px-3 py-1.5 text-right">Outstanding</th>
                                <th className="px-3 py-1.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeRows.map((r) => {
                                const isSelf = persona?.body_code === r.body_code;
                                const canAct = isSelf || canManage;
                                const isExpanded = expandedCode === r.body_code;
                                const drill = drilldown[r.body_code];
                                return (
                                    <Fragment key={r.body_code}>
                                    <tr className="border-b border-mpca-brass/10 hover:bg-mpca-cream/40" data-testid={`participants-row-${r.body_code}`}>
                                        <td className="px-3 py-2 font-serif text-mpca-green-dark">
                                            <button onClick={() => toggleExpand(r.body_code)} className="inline-flex items-center gap-1 text-left hover:text-mpca-oxblood" data-testid={`participants-expand-${r.body_code}`}>
                                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                <span>
                                                    <div>{r.body_name}</div>
                                                    <div className="text-[9px] font-mono text-mpca-brass">{r.body_code}</div>
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-3 py-2">
                                            {r.role === "Host" ? (
                                                <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-1.5 py-0.5"><Home size={10} />Host</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest bg-mpca-brass/20 text-mpca-brass px-1.5 py-0.5"><Plane size={10} />Visitor</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-mpca-brass text-[11px]">{r.pool_name || "—"}</td>
                                        <td className="px-3 py-2"><AcceptChip status={r.acceptance_status} /></td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="font-mono">{fmtInr(r.budget_total_inr)}</div>
                                            {r.budget_status && <StatusChip label={r.budget_status} tone={budgetTone(r.budget_status)} />}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            <div>{fmtInr(r.invoice_total_inr)}</div>
                                            {r.invoice_count > 0 && <span className="text-[9px] text-mpca-brass">{r.invoice_count} inv.</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="font-mono">{fmtInr(r.claim_requested_inr)}</div>
                                            {r.claim_status && <StatusChip label={r.claim_status} tone={claimTone(r.claim_status)} />}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-green-dark">{fmtInr(r.receipt_total_inr)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-oxblood">{fmtInr(r.outstanding_inr)}</td>
                                        <td className="px-3 py-2 text-right">
                                            {r.acceptance_status === "Pending" && canAct && (
                                                <div className="inline-flex gap-1">
                                                    <button onClick={() => setAcceptance(r, "Accepted")} disabled={busyCode === r.body_code} className="text-[9px] uppercase bg-mpca-green-dark text-mpca-gold-light px-1.5 py-0.5 disabled:opacity-40" title="Accept" data-testid={`participants-accept-${r.body_code}`}><Check size={10} /></button>
                                                    <button onClick={() => setAcceptance(r, "Declined")} disabled={busyCode === r.body_code} className="text-[9px] uppercase bg-mpca-oxblood text-mpca-ivory px-1.5 py-0.5 disabled:opacity-40" title="Decline" data-testid={`participants-decline-${r.body_code}`}><X size={10} /></button>
                                                </div>
                                            )}
                                            {(r.acceptance_status === "Accepted" || r.acceptance_status === "Declined") && canAct && (
                                                <button onClick={() => setAcceptance(r, "Pending")} disabled={busyCode === r.body_code} className="text-[9px] uppercase text-mpca-brass hover:text-mpca-oxblood" title="Reset to pending" data-testid={`participants-reset-${r.body_code}`}>reset</button>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-mpca-cream/20" data-testid={`participants-drill-${r.body_code}`}>
                                            <td colSpan={10} className="px-4 py-3">
                                                {drillLoading && !drill ? (
                                                    <div className="text-[11px] text-mpca-brass flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Loading finance snapshot…</div>
                                                ) : !drill ? (
                                                    <div className="text-[11px] text-mpca-gray-dark italic">No drill-down data yet.</div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-[11px]">
                                                        <div>
                                                            <div className="overline text-[9px] mb-1">Budget</div>
                                                            {drill.budget ? (
                                                                <div className="font-mono text-mpca-charcoal">
                                                                    <div>{drill.budget.budget_no}</div>
                                                                    <div>₹{Number(drill.budget.total_ceiling_inr || 0).toLocaleString("en-IN")}</div>
                                                                    <div className="text-[9px] text-mpca-brass">{drill.budget.status}</div>
                                                                </div>
                                                            ) : <div className="text-mpca-gray-dark italic">No budget yet</div>}
                                                        </div>
                                                        <div>
                                                            <div className="overline text-[9px] mb-1">Invoices ({drill.invoices?.length || 0})</div>
                                                            {(drill.invoices || []).length === 0 ? (
                                                                <div className="text-mpca-gray-dark italic">None</div>
                                                            ) : (
                                                                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                                                    {drill.invoices.slice(0, 6).map((inv) => (
                                                                        <div key={inv.id} className="flex justify-between font-mono">
                                                                            <span className="truncate max-w-[10rem]">{inv.vendor_name || inv.invoice_ref}</span>
                                                                            <span>₹{Number(inv.total_inr || 0).toLocaleString("en-IN")}</span>
                                                                        </div>
                                                                    ))}
                                                                    {drill.invoices.length > 6 && <div className="text-[9px] text-mpca-brass">+{drill.invoices.length - 6} more…</div>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="overline text-[9px] mb-1">Claim</div>
                                                            {drill.claim ? (
                                                                <div className="font-mono text-mpca-charcoal">
                                                                    <div>{drill.claim.claim_ref}</div>
                                                                    <div>Approved ₹{Number(drill.claim.approved_amount_inr || 0).toLocaleString("en-IN")}</div>
                                                                    <div className="text-[9px] text-mpca-brass">{drill.claim.status}</div>
                                                                </div>
                                                            ) : <div className="text-mpca-gray-dark italic">Not filed</div>}
                                                        </div>
                                                        <div>
                                                            <div className="overline text-[9px] mb-1">Receipts ({drill.receipts?.length || 0})</div>
                                                            {(drill.receipts || []).length === 0 ? (
                                                                <div className="text-mpca-gray-dark italic">None</div>
                                                            ) : (
                                                                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                                                    {drill.receipts.slice(0, 6).map((rc) => (
                                                                        <div key={rc.id} className="flex justify-between font-mono text-mpca-green-dark">
                                                                            <span>{rc.receipt_date}</span>
                                                                            <span>₹{Number(rc.amount_inr || 0).toLocaleString("en-IN")}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-mpca-cream/40 border-t border-mpca-brass/30 text-[10px] font-mono">
                                <td className="px-3 py-2 font-serif text-mpca-green-dark" colSpan={4}>Totals ({activeRows.length} bodies)</td>
                                <td className="px-3 py-2 text-right" data-testid="participants-total-budget">{fmtInr(totalBudget)}</td>
                                <td className="px-3 py-2 text-right" data-testid="participants-total-invoices">{fmtInr(totalInvoice)}</td>
                                <td className="px-3 py-2 text-right" data-testid="participants-total-claim">{fmtInr(totalClaimReq)}</td>
                                <td className="px-3 py-2 text-right text-mpca-green-dark" data-testid="participants-total-receipts">{fmtInr(totalReceipts)}</td>
                                <td className="px-3 py-2 text-right text-mpca-oxblood" data-testid="participants-total-outstanding">{fmtInr(totalOutstanding)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {showHistory && removedRows.length > 0 && (
                <div className="border border-mpca-brass/20 overflow-hidden" data-testid="participants-history-list">
                    <div className="bg-mpca-gray-dark/10 px-3 py-1.5 text-[9px] uppercase tracking-widest text-mpca-gray-dark">Removed history</div>
                    {removedRows.map((r) => (
                        <div key={r.body_code} className="grid grid-cols-6 gap-2 px-3 py-1.5 text-[11px] text-mpca-gray-dark border-b border-mpca-brass/10" data-testid={`participants-removed-${r.body_code}`}>
                            <div className="col-span-2 font-serif">{r.body_name} <span className="font-mono text-[9px]">({r.body_code})</span></div>
                            <div>{r.role}</div>
                            <div>{r.pool_name || "—"}</div>
                            <div>Last accept: {r.acceptance_status}</div>
                            <div className="text-right">Removed {new Date(r.removed_at).toLocaleDateString()}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="text-[10px] text-mpca-gray-dark flex items-start gap-1">
                <Info size={11} className="mt-0.5 flex-shrink-0" />
                <div>
                    Once each body&apos;s Division Secretary accepts, they can file their own <b>budget</b>, upload <b>invoices</b>, submit a <b>reimbursement claim</b>, and mark receipts via the existing Finance / Invoice / Reimbursement modules — each row of this matrix will reflect their live status automatically (linked via <code>participant_body_code</code>).
                </div>
            </div>
        </div>
    );
};

export default ParticipantsMatrix;
