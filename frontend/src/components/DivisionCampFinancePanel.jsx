/**
 * Feb 2026 · Fix D + E · Division-side camp finance panel
 * ────────────────────────────────────────────────────────
 * Rendered on the Finance Console for the host Division persona when the
 * tournament wiring says the budget is Division-owned (Pre-Camp / Inter-
 * District / Inter-School / Inter-Club A-Grade / Periodical Coaching /
 * Vacation Camp). Drives the four-stage lifecycle from within a single
 * card:
 *   1. Prepare  → auto-compute the budget from the rate card
 *   2. Lock     → division-self-sanction the Draft
 *   3. Upload   → add invoices against the locked budget
 *   4. Submit   → bundle into a single reimbursement claim to MPCA
 * Once submitted, shows "Awaiting MPCA" and finally "Reimbursed · UTR X".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, Lock, Upload, Send, CheckCircle2, Clock, IndianRupee, ChevronRight, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

const STAGE_ORDER = ["Prepare", "Lock", "Upload", "Submit", "Awaiting", "Reimbursed"];
const STAGE_META = {
    Prepare:    { icon: Calculator,   copy: "Compute the auto-budget from the rate card × your locked match calendar.", cta: "Prepare Budget" },
    Lock:       { icon: Lock,          copy: "Lock the draft — you can then start uploading invoices against these heads.", cta: "Lock Budget" },
    Upload:     { icon: Upload,        copy: "Upload invoices as the camp progresses. MPCA still sees nothing.", cta: "Add Invoice" },
    Submit:     { icon: Send,          copy: "Bundle every invoice into a single reimbursement claim to MPCA.", cta: "Submit Claim" },
    Awaiting:   { icon: Clock,         copy: "MPCA is reviewing your reimbursement claim. Track it under Grant Claims.", cta: "Open Grant Claims" },
    Reimbursed: { icon: CheckCircle2,  copy: "Camp fully closed. Reimbursement received.", cta: null },
};

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function DivisionCampFinancePanel({ tournament, persona }) {
    const [budget, setBudget] = useState(null);
    const [invoiceCount, setInvoiceCount] = useState(0);
    const [invoiceTotal, setInvoiceTotal] = useState(0);
    const [linkedClaim, setLinkedClaim] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const hostCode = tournament?.host_body_id;

    const refresh = useCallback(async () => {
        if (!tournament?.id || !hostCode) return;
        try {
            // Latest budget for (tid, host)
            const { data: bs } = await api.get("/tournament-budgets", {
                params: { tournament_id: tournament.id, body_id: hostCode }
            });
            const b = (bs || []).sort((a, z) => (z.created_at || "").localeCompare(a.created_at || ""))[0] || null;
            setBudget(b);
            // Invoice tally
            const { data: invs } = await api.get("/tournament-invoices", {
                params: { tournament_id: tournament.id, body_id: hostCode }
            });
            setInvoiceCount((invs || []).length);
            setInvoiceTotal((invs || []).reduce((s, x) => s + Number(x.amount_inr || 0), 0));
            // Linked claim (if any)
            if (b?.status === "Submitted_To_MPCA" || b?.status === "Reimbursed") {
                const { data: claims } = await api.get("/grant-claims", {
                    params: { body_id: hostCode }
                });
                const c = (claims || []).find((x) => x.attached_tournament_id === tournament.id) || null;
                setLinkedClaim(c);
            } else {
                setLinkedClaim(null);
            }
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        }
    }, [tournament?.id, hostCode]);

    useEffect(() => { refresh(); }, [refresh]);

    const stage = useMemo(() => {
        if (!budget) return "Prepare";
        if (budget.status === "Draft" || budget.status === "Revision_Requested") return "Lock";
        if (budget.status === "Division_Sanctioned") return invoiceCount === 0 ? "Upload" : "Submit";
        if (budget.status === "Submitted_To_MPCA") return "Awaiting";
        if (budget.status === "Reimbursed") return "Reimbursed";
        return "Prepare";
    }, [budget, invoiceCount]);

    const act = useCallback(async () => {
        setBusy(true); setErr(null);
        try {
            const headers = { "X-User-Body-Code": hostCode };
            if (stage === "Prepare") {
                await api.post(`/tournaments/${tournament.id}/finance/division-prepare-budget`,
                    { prepared_by_name: persona?.name }, { headers });
            } else if (stage === "Lock") {
                await api.post(`/tournament-budgets/${budget.id}/division-self-sanction`,
                    { sanctioned_by_name: persona?.name }, { headers });
            } else if (stage === "Submit") {
                await api.post(`/tournaments/${tournament.id}/finance/submit-reimbursement-claim`,
                    { submitted_by_name: persona?.name,
                      purpose_of_claim: `Reimbursement for ${tournament?.name}` }, { headers });
            }
            await refresh();
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message || "Action failed");
        } finally {
            setBusy(false);
        }
    }, [stage, tournament, budget, persona, hostCode, refresh]);

    const StageIcon = STAGE_META[stage]?.icon || Calculator;
    const stageIdx = STAGE_ORDER.indexOf(stage);

    return (
        <div className="max-w-5xl mx-auto mt-6" data-testid="division-camp-finance-panel">
            {/* Timeline strip */}
            <ol className="flex items-center gap-1 mb-6 overflow-x-auto pb-2" data-testid="camp-finance-timeline">
                {STAGE_ORDER.filter((s) => s !== "Reimbursed" || stage === "Reimbursed").map((s, i) => {
                    const active = s === stage;
                    const done = stageIdx > i;
                    return (
                        <li key={s} className="flex items-center gap-1 shrink-0">
                            <span className={"px-2.5 py-1 border font-mono text-[10px] uppercase tracking-widest " +
                                (active ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood"
                                        : done ? "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/40"
                                               : "text-mpca-gray-dark border-mpca-brass/30")}
                                  data-testid={`camp-finance-stage-${s.toLowerCase()}`}>
                                {done && "✓ "}{s}
                            </span>
                            {i < 4 && <ChevronRight size={12} className="text-mpca-brass/60" />}
                        </li>
                    );
                })}
            </ol>

            {/* Active-stage card */}
            <div className="bulletin-card p-6" data-testid={`camp-finance-active-${stage.toLowerCase()}`}>
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-mpca-oxblood/10 border border-mpca-oxblood/30 flex-shrink-0">
                        <StageIcon size={22} className="text-mpca-oxblood" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                        <div className="overline text-[10px] text-mpca-brass">Stage {stageIdx + 1} of 5 · Division-owned camp finance</div>
                        <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">
                            {stage === "Prepare" && "Prepare the camp budget"}
                            {stage === "Lock" && `Lock the draft · ${money(budget?.total_ceiling_inr)}`}
                            {stage === "Upload" && `Upload invoices · budget ${money(budget?.total_ceiling_inr)}`}
                            {stage === "Submit" && `Submit reimbursement · ${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"} · ${money(invoiceTotal)}`}
                            {stage === "Awaiting" && (linkedClaim ? `Awaiting MPCA · ${linkedClaim.claim_ref}` : "Awaiting MPCA review")}
                            {stage === "Reimbursed" && `Reimbursed · UTR ${budget?.reimbursed_utr || "—"}`}
                        </h2>
                        <p className="text-sm text-mpca-charcoal mt-2 leading-relaxed">{STAGE_META[stage].copy}</p>

                        {stage === "Reimbursed" && (
                            <div className="mt-4 flex flex-wrap gap-6 border-t border-mpca-brass/20 pt-4">
                                <div>
                                    <div className="overline text-[9px] text-mpca-gray-dark">Reimbursed amount</div>
                                    <div className="font-serif text-xl text-mpca-green-dark">{money(budget?.reimbursed_amount_inr)}</div>
                                </div>
                                <div>
                                    <div className="overline text-[9px] text-mpca-gray-dark">UTR</div>
                                    <div className="font-mono text-sm text-mpca-charcoal">{budget?.reimbursed_utr || "—"}</div>
                                </div>
                                <div>
                                    <div className="overline text-[9px] text-mpca-gray-dark">On</div>
                                    <div className="text-sm text-mpca-charcoal">{(budget?.reimbursed_at || "").slice(0, 10) || "—"}</div>
                                </div>
                            </div>
                        )}

                        {err && (
                            <div className="mt-4 bg-mpca-oxblood/10 border border-mpca-oxblood/30 text-mpca-oxblood px-3 py-2 text-xs flex items-start gap-2" data-testid="camp-finance-error">
                                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                <span>{err}</span>
                            </div>
                        )}

                        <div className="mt-5 flex flex-wrap gap-3">
                            {(stage === "Prepare" || stage === "Lock" || stage === "Submit") && (
                                <button onClick={act} disabled={busy || !hostCode}
                                        className="btn-heritage-primary disabled:opacity-50"
                                        data-testid={`camp-finance-action-${stage.toLowerCase()}`}>
                                    {busy ? "Working…" : STAGE_META[stage].cta}
                                </button>
                            )}
                            {stage === "Upload" && (
                                <div className="text-[11px] text-mpca-gray-dark italic">
                                    Scroll below to add invoices via the standard Finance Console.
                                </div>
                            )}
                            {stage === "Awaiting" && linkedClaim && (
                                <Link to={`/grant-claims?open=${linkedClaim.id}`} className="btn-heritage-primary"
                                      data-testid="camp-finance-open-claim">
                                    Open Grant Claim →
                                </Link>
                            )}
                        </div>
                    </div>
                    {(budget?.total_ceiling_inr || 0) > 0 && (
                        <div className="text-right border-l border-mpca-brass/20 pl-6 hidden md:block">
                            <div className="overline text-[9px] text-mpca-gray-dark">Sanctioned budget</div>
                            <div className="font-serif text-3xl text-mpca-oxblood leading-none mt-1">
                                <IndianRupee size={20} className="inline -mt-1" strokeWidth={1.5} />{Number(budget.total_ceiling_inr).toLocaleString("en-IN")}
                            </div>
                            {invoiceCount > 0 && (
                                <>
                                    <div className="overline text-[9px] text-mpca-gray-dark mt-3">Invoices logged</div>
                                    <div className="text-sm text-mpca-charcoal mt-0.5">{invoiceCount} · {money(invoiceTotal)}</div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
