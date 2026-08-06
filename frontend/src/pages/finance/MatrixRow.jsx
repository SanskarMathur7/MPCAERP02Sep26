import { Link } from "react-router-dom";
import {
    Send, Check, RotateCcw, ShieldCheck, ChevronRight,
} from "lucide-react";
import { fmt, StatusPill } from "./financeShared";

/** M39z.f · MatrixRow + PoolGroup extracted from TournamentFinanceConsole.
 *  Renders one body's row (Host or Visitor) in the finance matrix, plus a
 *  group header for pooled tournaments.
 */

export const MatrixRow = ({ r, isMPCA, myBody, onSend, onSanction, onAccept, onRevise, busy }) => {
    const isMine = myBody === r.body_code;
    const canDivisionAct = !isMPCA && isMine && r.budget_status === "Sent_To_Division";
    const canSend = isMPCA && r.budget_status === "Draft";
    const canSanction = isMPCA && r.budget_status === "Accepted_By_Division";
    const isRevision = isMPCA && r.budget_status === "Revision_Requested";

    return (
        <tr className={`border-b border-mpca-brass/15 hover:bg-mpca-parchment/40 ${isMine ? "bg-mpca-gold-light/10" : ""}`}
            data-testid={`fc-row-${r.body_code}`}>
            <td className="px-3 py-3 font-serif text-mpca-green-dark">
                <div>{r.body_name}</div>
                <div className="text-[9px] font-mono text-mpca-gray-dark">{r.body_code}</div>
            </td>
            <td className="px-3 py-3">
                <span className={`text-[10px] uppercase tracking-widest font-semibold ${r.role === "Host" ? "text-mpca-green-dark" : "text-mpca-brass"}`}>
                    {r.role}
                </span>
            </td>
            <td className="px-3 py-3">
                <StatusPill status={r.budget_status} />
                {r.revision_reason && (
                    <div className="text-[9px] text-mpca-oxblood mt-1 italic truncate max-w-[180px]" title={r.revision_reason}>
                        &ldquo;{r.revision_reason.slice(0, 60)}{r.revision_reason.length > 60 ? '…' : ''}&rdquo;
                    </div>
                )}
            </td>
            <td className="px-3 py-3 text-right font-mono text-mpca-charcoal">
                {r.budget_total_inr > 0 ? fmt(r.budget_total_inr) : "—"}
            </td>
            <td className="px-3 py-3 text-right font-mono">
                {r.approved_total_inr ? (
                    <span className="text-mpca-green-dark">{fmt(r.approved_total_inr)}</span>
                ) : <span className="text-mpca-gray-dark">—</span>}
            </td>
            <td className="px-3 py-3 text-right font-mono text-mpca-gray-dark">
                {(r.invoice_total_inr + r.extras_total_inr + r.da_total_inr) > 0
                    ? fmt(r.invoice_total_inr + r.extras_total_inr + r.da_total_inr)
                    : "—"}
                {r.invoice_count > 0 && <div className="text-[9px] text-mpca-gray-dark">{r.invoice_count} invoices</div>}
            </td>
            <td className="px-3 py-3">
                {r.claim_status ? (
                    <div>
                        <StatusPill status={r.claim_status === "Approved" ? "Approved" : "Submitted"} />
                        <div className="text-[9px] font-mono text-mpca-gray-dark mt-1">{r.claim_ref}</div>
                    </div>
                ) : <span className="text-mpca-gray-dark text-[11px]">—</span>}
            </td>
            <td className="px-3 py-3">
                <div className="text-[10px] uppercase tracking-widest text-mpca-oxblood">→ {r.next_action_for?.waiting_on}</div>
                <div className="text-[11px] text-mpca-charcoal">{r.next_action_for?.action}</div>
            </td>
            <td className="px-3 py-3 text-right whitespace-nowrap">
                {canSend && (
                    <button onClick={onSend} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-brass/15 text-mpca-brass border border-mpca-brass/40 hover:bg-mpca-brass/25 mr-1"
                        data-testid={`fc-send-${r.body_code}`}>
                        <Send size={10} className="inline mr-1" />Send
                    </button>
                )}
                {canSanction && (
                    <button onClick={onSanction} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-green-dark/10 text-mpca-green-dark border border-mpca-green-dark/40 hover:bg-mpca-green-dark/20 mr-1"
                        data-testid={`fc-sanction-${r.body_code}`}>
                        <ShieldCheck size={10} className="inline mr-1" />Sanction
                    </button>
                )}
                {isRevision && (
                    <span className="text-[10px] text-mpca-oxblood mr-1">Edit IVs above & re-prepare</span>
                )}
                {canDivisionAct && (
                    <>
                        <button onClick={onAccept} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-green-dark/10 text-mpca-green-dark border border-mpca-green-dark/40 hover:bg-mpca-green-dark/20 mr-1"
                            data-testid={`fc-accept-${r.body_code}`}>
                            <Check size={10} className="inline mr-1" />Accept &amp; Sanction
                        </button>
                        <button onClick={onRevise} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-oxblood/10 text-mpca-oxblood border border-mpca-oxblood/40 hover:bg-mpca-oxblood/20"
                            data-testid={`fc-revise-${r.body_code}`}>
                            <RotateCcw size={10} className="inline mr-1" />Revise
                        </button>
                    </>
                )}
                {r.budget_id && (
                    <Link to={`/tournament-budgets/${r.budget_id}`} className="ml-1 inline-block text-mpca-brass hover:text-mpca-oxblood" title="Open budget detail"
                        data-testid={`fc-view-${r.body_code}`}>
                        <ChevronRight size={14} />
                    </Link>
                )}
            </td>
        </tr>
    );
};

export const PoolGroup = ({ pool, hostRow, visitorRows, isMPCA, myBody, onSend, onSanction, onAccept, onRevise, busy }) => {
    const memberCount = (hostRow ? 1 : 0) + visitorRows.length;
    return (
        <>
            <tr className="bg-mpca-navy/5 border-y-2 border-mpca-navy/30" data-testid={`fc-pool-group-${pool.pool_id || "main"}`}>
                <td colSpan={9} className="px-3 py-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-serif text-mpca-navy font-semibold text-base">{pool.pool_name || "Main"}</span>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                            Host: {pool.host_body_name || pool.host_body_code || "TBD"}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                            · {memberCount} {memberCount === 1 ? "body" : "bodies"}
                        </span>
                        <span className="ml-auto text-[10px] uppercase tracking-widest text-mpca-oxblood font-mono">
                            Pool total: {fmt(pool.budget_total_inr)}
                            {pool.approved_total_inr > 0 && <> · Sanctioned {fmt(pool.approved_total_inr)}</>}
                        </span>
                    </div>
                </td>
            </tr>
            {hostRow && <MatrixRow r={hostRow} isMPCA={isMPCA} myBody={myBody}
                onSend={() => onSend(hostRow.budget_id)}
                onSanction={() => onSanction(hostRow.budget_id)}
                onAccept={() => onAccept(hostRow.budget_id)}
                onRevise={() => onRevise(hostRow.budget_id)}
                busy={busy} />}
            {visitorRows.map((r) => (
                <MatrixRow key={r.body_code + (r.pool_id || "")} r={r} isMPCA={isMPCA} myBody={myBody}
                    onSend={() => onSend(r.budget_id)}
                    onSanction={() => onSanction(r.budget_id)}
                    onAccept={() => onAccept(r.budget_id)}
                    onRevise={() => onRevise(r.budget_id)}
                    busy={busy} />
            ))}
        </>
    );
};
