import { Check, RotateCcw, PackageOpen, CheckCircle2 } from "lucide-react";
import { fmt, StatusPill } from "./financeShared";

/** M39z.f · DivisionBudgetCard — the self-view Divisions see for their own
 *  budget row (extracted from TournamentFinanceConsole). Handles the four
 *  possible states: no-budget · sent-awaiting-accept · legacy-transitional ·
 *  sanctioned. Accept-and-Sanction wire-up is done by the console.
 */
export const DivisionBudgetCard = ({ row, onAccept, onRequestRevision, busy }) => {
    if (!row.budget_id) {
        return (
            <div className="bulletin-card p-6 mb-6 border-l-4 border-mpca-gray/40" data-testid="fc-div-nobudget">
                <div className="flex items-center gap-2">
                    <PackageOpen size={20} className="text-mpca-gray-dark" />
                    <div>
                        <div className="font-serif text-lg text-mpca-gray-dark">No budget yet</div>
                        <p className="text-sm text-mpca-gray-dark">MPCA has not prepared a budget for your role in this tournament yet. Check back after MPCA prepares it.</p>
                    </div>
                </div>
            </div>
        );
    }
    const canAct = row.budget_status === "Sent_To_Division";
    const isAwaitingSanction = row.budget_status === "Accepted_By_Division";   // legacy transitional
    const isRevisionRequested = row.budget_status === "Revision_Requested";
    const isSanctioned = row.budget_status === "Approved";

    return (
        <div className={`bulletin-card p-6 mb-6 border-l-4 ${
            canAct ? "border-mpca-oxblood" : isSanctioned ? "border-mpca-green-dark" : "border-mpca-brass"
        }`} data-testid="fc-div-budget-card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="overline">Your Budget · {row.role}</div>
                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">{fmt(row.budget_total_inr)}</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1">{row.budget_no}</div>
                    <div className="mt-2"><StatusPill status={row.budget_status} /></div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                    {canAct && (
                        <>
                            <button onClick={onAccept} disabled={busy}
                                className="btn-heritage flex items-center gap-2" data-testid="fc-div-accept-btn">
                                <Check size={14} /> Accept &amp; Sanction
                            </button>
                            <button onClick={onRequestRevision} disabled={busy}
                                className="btn-heritage-secondary flex items-center gap-2 !border-mpca-oxblood !text-mpca-oxblood"
                                data-testid="fc-div-revise-btn">
                                <RotateCcw size={14} /> Request Revision
                            </button>
                            <div className="text-[10px] text-mpca-gray-dark max-w-[220px] text-right leading-tight italic">
                                MPCA authored this budget — accepting sanctions it immediately and unlocks spending.
                            </div>
                        </>
                    )}
                    {isAwaitingSanction && (
                        <div className="text-[11px] text-mpca-navy max-w-[220px] text-right italic">
                            Legacy state · this budget was accepted under the old flow and is awaiting MPCA&apos;s manual sanction.
                        </div>
                    )}
                    {isRevisionRequested && <div className="text-[11px] text-mpca-oxblood">MPCA notified · awaiting revision</div>}
                    {isSanctioned && (
                        <div className="text-[11px] text-mpca-green-dark flex items-center gap-1">
                            <CheckCircle2 size={12} /> Sanctioned · you may now upload invoices, DA/TA & claims
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
