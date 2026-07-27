import { useEffect, useState, Fragment } from "react";
import { RefreshCw, Home, Plane, Loader2, Check, X, Info, ChevronDown, ChevronRight, ExternalLink, Landmark, ShieldCheck, ShieldAlert, BellRing, Download } from "lucide-react";
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
    // Phase D · Bulk NEFT
    const [showNeft, setShowNeft] = useState(false);
    const [neftBatch, setNeftBatch] = useState(null);
    const [neftLoading, setNeftLoading] = useState(false);
    const [neftSelected, setNeftSelected] = useState({}); // body_code -> bool
    const [neftBusy, setNeftBusy] = useState(false);
    const [readiness, setReadiness] = useState(null);
    // Phase E · reminders
    const [reminders, setReminders] = useState(null);
    const [reminderBusy, setReminderBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/participants`, { params: { include_removed: showHistory } });
            setRows(data || []);
            // Phase D · fetch closure readiness in parallel
            api.get(`/tournaments/${tournament.id}/closure-readiness`).then((r) => setReadiness(r.data)).catch((e) => setErr((prev) => prev || `readiness: ${e?.response?.data?.detail || e.message}`));
            // Phase E · fetch reminders
            api.get(`/tournaments/${tournament.id}/participation-reminders`).then((r) => setReminders(r.data)).catch((e) => setErr((prev) => prev || `reminders: ${e?.response?.data?.detail || e.message}`));
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

    // Phase E · dispatch reminders
    const dispatchReminders = async () => {
        setReminderBusy(true);
        setErr("");
        try {
            const { data } = await api.post(`/tournaments/${tournament.id}/participation-reminders/dispatch`);
            setErr(""); // clear
            // Show success toast-ish inline
            setReminders((r) => r ? { ...r, _last_dispatched: data.dispatched_count } : r);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setReminderBusy(false); }
    };

    // ─── Phase D · Bulk NEFT helpers ────────────────────
    const openNeft = async () => {
        setShowNeft(true);
        setNeftLoading(true);
        setErr("");
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/neft-batch`);
            setNeftBatch(data);
            // Pre-select every ready row
            const sel = {};
            (data.participants || []).forEach((p) => { if (p.ready_for_neft) sel[p.body_code] = true; });
            setNeftSelected(sel);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setNeftLoading(false); }
    };
    const toggleNeftSel = (code) => setNeftSelected((s) => ({ ...s, [code]: !s[code] }));
    const runNeftExport = async () => {
        const codes = Object.keys(neftSelected).filter((k) => neftSelected[k]);
        if (codes.length === 0) { setErr("Select at least one participant to export."); return; }
        setNeftBusy(true);
        try {
            const res = await api.post(
                `/tournaments/${tournament.id}/neft-export`,
                { body_codes: codes, recorded_by_name: persona?.full_name || persona?.name || "MPCA Treasurer" },
                { responseType: "blob" }
            );
            const disp = res.headers?.["content-disposition"] || "";
            const filename = disp.match(/filename="?([^"]+)"?/)?.[1] || `NEFT-batch-${Date.now()}.csv`;
            const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
            const a = document.createElement("a");
            a.href = url; a.download = filename; document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            setShowNeft(false); setNeftBatch(null); setNeftSelected({});
            await load();
            onChange?.();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setNeftBusy(false); }
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
                    <button onClick={dispatchReminders} disabled={reminderBusy || !canManage || (reminders?.reminder_count || 0) === 0} className="text-[10px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" title={`Send ${reminders?.reminder_count || 0} reminder(s) to lagging bodies`} data-testid="participants-reminders-btn">
                        {reminderBusy ? <Loader2 size={11} className="animate-spin" /> : <BellRing size={11} />} Reminders {reminders?.reminder_count ? `(${reminders.reminder_count})` : ""}
                    </button>
                    <a href={`${api.defaults.baseURL}/tournaments/${tournament.id}/participants.csv`} target="_blank" rel="noreferrer" className="text-[10px] uppercase tracking-widest border border-mpca-brass/40 text-mpca-brass px-2 py-1 flex items-center gap-1 hover:bg-mpca-brass/10" title="Download participants matrix as CSV" data-testid="participants-export-csv-btn">
                        <Download size={11} /> CSV
                    </a>
                    <button onClick={openNeft} disabled={!canManage || totalOutstanding <= 0} className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-gold-light px-2 py-1 flex items-center gap-1 disabled:opacity-40" title="Generate NEFT batch for outstanding participants" data-testid="participants-neft-btn">
                        <Landmark size={11} /> Bulk NEFT
                    </button>
                    <button onClick={resync} disabled={busyCode === "__resync" || !canManage} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="participants-resync-btn">
                        {busyCode === "__resync" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Re-sync
                    </button>
                </div>
            </div>

            {readiness && activeRows.length > 0 && (
                <div className={`text-[11px] flex items-center gap-2 px-3 py-1.5 border ${readiness.ready_for_closure ? "border-mpca-green-dark/40 bg-mpca-green-dark/5 text-mpca-green-dark" : "border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood"}`} data-testid="participants-readiness-badge">
                    {readiness.ready_for_closure ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                    <span className="uppercase tracking-widest text-[9px] font-semibold">
                        {readiness.ready_for_closure ? "Ready for Closure" : "Not Ready for Closure"}
                    </span>
                    <span className="text-mpca-gray-dark">
                        · {readiness.total_active} active · {readiness.unsettled_count} unsettled
                    </span>
                </div>
            )}

            {reminders && reminders.reminder_count > 0 && (
                <div className="text-[11px] border border-mpca-brass/30 bg-mpca-brass/5 text-mpca-brass px-3 py-1.5 space-y-1" data-testid="participants-reminders-summary">
                    <div className="flex items-center gap-2 uppercase tracking-widest text-[9px] font-semibold">
                        <BellRing size={11} /> {reminders.reminder_count} Lifecycle Reminder(s)
                        {reminders._last_dispatched != null && (
                            <span className="text-mpca-green-dark ml-2">✓ {reminders._last_dispatched} dispatched</span>
                        )}
                    </div>
                    <div className="text-mpca-charcoal text-[10px]">
                        {reminders.reminders.slice(0, 4).map((r) => (
                            <div key={r.body_code} data-testid={`participants-reminder-${r.body_code}`}>
                                <b>{r.body_name}</b> ({r.role}) · {r.reasons.map((rs) => rs.replace(/_/g, " ")).join(", ")}
                                {r.outstanding_inr > 0 && <span className="text-mpca-oxblood ml-1">· ₹{Number(r.outstanding_inr).toLocaleString("en-IN")}</span>}
                            </div>
                        ))}
                        {reminders.reminders.length > 4 && <div className="italic">+{reminders.reminders.length - 4} more…</div>}
                    </div>
                </div>
            )}

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
                                // M39d · Strict acceptance — only the exact participant body may
                                // flip its own acceptance. MPCA / higher bodies no longer act on
                                // behalf of a Division.
                                const canAct = isSelf;
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

            {/* Phase D · Bulk NEFT dialog */}
            {showNeft && (
                <div className="fixed inset-0 bg-mpca-charcoal/50 z-40 flex items-center justify-center p-4" data-testid="neft-modal-backdrop" onClick={() => !neftBusy && setShowNeft(false)}>
                    <div className="bg-mpca-ivory max-w-3xl w-full border border-mpca-brass shadow-xl" onClick={(e) => e.stopPropagation()} data-testid="neft-modal">
                        <div className="bg-mpca-green-dark text-mpca-gold-light px-4 py-2 flex items-center justify-between">
                            <div>
                                <div className="overline text-[9px] opacity-80">MPCA Treasury</div>
                                <div className="font-serif text-base">Bulk NEFT · {tournament.name}</div>
                            </div>
                            <button onClick={() => setShowNeft(false)} disabled={neftBusy} className="text-mpca-ivory/80 hover:text-mpca-ivory" data-testid="neft-modal-close"><X size={14} /></button>
                        </div>
                        <div className="p-4 max-h-[70vh] overflow-y-auto">
                            {neftLoading ? (
                                <div className="text-[11px] text-mpca-brass flex items-center gap-1 py-6"><Loader2 className="animate-spin" size={11} /> Preparing batch…</div>
                            ) : !neftBatch || neftBatch.batch_count === 0 ? (
                                <div className="text-[11px] text-mpca-gray-dark italic py-4" data-testid="neft-empty">No participant has an outstanding balance. Nothing to disburse right now.</div>
                            ) : (
                                <>
                                <div className="text-[11px] text-mpca-gray-dark mb-3">
                                    {neftBatch.batch_count} participant(s) with a combined outstanding of <b>₹{Number(neftBatch.total_outstanding_inr).toLocaleString("en-IN")}</b>.
                                    Tick the rows to include in this NEFT batch, then export the bank-ready CSV. Each exported row will also be posted as a Receipt against that participant.
                                </div>
                                <div className="border border-mpca-brass/20">
                                    <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                                        <div className="col-span-1"></div>
                                        <div className="col-span-4">Body</div>
                                        <div className="col-span-3">Bank / IFSC</div>
                                        <div className="col-span-3 text-right">Outstanding</div>
                                        <div className="col-span-1 text-right">Ready</div>
                                    </div>
                                    {neftBatch.participants.map((p) => (
                                        <div key={p.body_code} className={`grid grid-cols-12 gap-2 px-3 py-1.5 text-xs items-center border-b border-mpca-brass/10 ${!p.ready_for_neft ? "opacity-50" : ""}`} data-testid={`neft-row-${p.body_code}`}>
                                            <div className="col-span-1">
                                                <input type="checkbox" checked={!!neftSelected[p.body_code]} disabled={!p.ready_for_neft || neftBusy} onChange={() => toggleNeftSel(p.body_code)} data-testid={`neft-check-${p.body_code}`} />
                                            </div>
                                            <div className="col-span-4 font-serif text-mpca-green-dark">
                                                <div>{p.body_name} <span className="text-[9px] font-mono text-mpca-brass">{p.body_code}</span></div>
                                                <div className="text-[9px] text-mpca-brass">{p.role} · {p.pool_name}</div>
                                            </div>
                                            <div className="col-span-3 font-mono text-[10px] text-mpca-charcoal">
                                                {p.bank_account ? (
                                                    <>
                                                        <div>{p.bank_account.bank} · {p.bank_account.branch || "—"}</div>
                                                        <div className="text-[9px] text-mpca-brass">{p.bank_account.account_no} · {p.bank_account.ifsc || "no IFSC"}</div>
                                                    </>
                                                ) : <span className="text-mpca-oxblood">No bank account on file</span>}
                                            </div>
                                            <div className="col-span-3 text-right font-mono text-mpca-oxblood">₹{Number(p.outstanding_inr).toLocaleString("en-IN")}</div>
                                            <div className="col-span-1 text-right">
                                                {p.ready_for_neft ? <span className="text-mpca-green-dark text-[9px]">✓</span> : <span className="text-mpca-oxblood text-[9px]">—</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </>
                            )}
                        </div>
                        <div className="px-4 py-3 bg-mpca-cream/40 border-t border-mpca-brass/20 flex items-center justify-between">
                            <div className="text-[10px] text-mpca-gray-dark">
                                {Object.values(neftSelected).filter(Boolean).length} selected · CSV batch will create a Receipt per row.
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowNeft(false)} disabled={neftBusy} className="text-[10px] uppercase tracking-widest border border-mpca-brass/40 text-mpca-brass px-3 py-1.5" data-testid="neft-cancel-btn">Cancel</button>
                                <button onClick={runNeftExport} disabled={neftBusy || Object.values(neftSelected).filter(Boolean).length === 0} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="neft-export-btn">
                                    {neftBusy ? <Loader2 size={11} className="animate-spin" /> : <Landmark size={11} />} Export & Post Receipts
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ParticipantsMatrix;
