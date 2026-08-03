import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Loader2, ArrowRight, Send, PlusCircle, Info, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

// M39v · Higher-contrast pills. Every pill uses a dark text colour on a
// tinted background so it's legible on the mpca-parchment sheet.
const STATUS_TONE = {
    Draft:                "bg-mpca-brass/25 text-mpca-green-dark border-mpca-brass",
    Submitted:            "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/60",
    Approved:             "bg-mpca-green-dark/20 text-mpca-green-dark border-mpca-green-dark/60",
    Rejected:             "bg-mpca-oxblood/20 text-mpca-oxblood border-mpca-oxblood/60",
    Returned:             "bg-mpca-brass/25 text-mpca-green-dark border-mpca-brass",
    // M39r · new console states
    Sent_To_Division:     "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/60",
    Accepted_By_Division: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/60",
    Revision_Requested:   "bg-mpca-oxblood/20 text-mpca-oxblood border-mpca-oxblood",
};

/**
 * Sprint M32 · Tournament Budgets Panel (inline)
 * ──────────────────────────────────────────────
 * Compact view of every draft/submitted/approved budget for THIS tournament,
 * scoped by persona (Division/District see only their own row; MPCA sees all).
 * Replaces the redirect to /tournaments/:tid/finance so the workflow stays
 * inside the tournament overview.
 */
const TournamentBudgetsPanel = ({ tournament, persona, onChange }) => {
    const [budgets, setBudgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(null);

    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    const load = async () => {
        setLoading(true);
        try {
            const params = { tournament_id: tournament.id };
            if (!isMPCA && myBody) params.body_id = myBody;
            const { data } = await api.get("/tournament-budgets", { params });
            // M32.1 · Hide Cancelled (dedupe leftover) rows from the panel
            setBudgets((data || []).filter((b) => b.status !== "Cancelled"));
        } catch (_) { setBudgets([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [tournament.id, isMPCA, myBody]);

    const generateForMe = async () => {
        if (!myBody) return;
        setSubmitting("generate");
        try {
            await api.post(`/tournaments/${tournament.id}/participants/${myBody}/budget/generate`);
            await load();
            onChange?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setSubmitting(null); }
    };

    const submitToMpca = async (b) => {
        if (!window.confirm(`Submit budget ${b.budget_no} (${fmt(b.total_ceiling_inr)}) to MPCA for approval?`)) return;
        setSubmitting(b.id);
        try {
            await api.post(`/tournament-budgets/${b.id}/submit`, {
                actor_name: persona?.name, actor_post: persona?.post, actor_body_id: persona?.body_code,
                notes: "Submitted via Tournament Budgets panel.",
            });
            await load();
            onChange?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setSubmitting(null); }
    };

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-tournament-budgets">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="overline text-[9px] flex items-center gap-2"><Wallet size={11} /> Budget & Extras</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {isMPCA ? `${budgets.length} budget${budgets.length === 1 ? "" : "s"} · all bodies` : `Your body (${myBody})`}
                    </div>
                </div>
                <div className="flex gap-2">
                    {!isMPCA && myBody && !budgets.some((b) => ["Draft", "Submitted", "Approved", "Returned"].includes(b.status)) && (
                        <button onClick={generateForMe} disabled={submitting === "generate"} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="tb-generate-mine-btn">
                            {submitting === "generate" ? <Loader2 size={11} className="animate-spin" /> : <PlusCircle size={11} />} Generate My Budget
                        </button>
                    )}
                    <Link to={`/tournaments/${tournament.id}/finance`} className="text-[10px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood inline-flex items-center gap-1" data-testid="tb-open-full-btn">
                        Full Finance Screen <ArrowRight size={10} />
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="py-8 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading…</div>
            ) : budgets.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-mpca-brass/30 text-[11px] text-mpca-gray-dark italic" data-testid="tb-empty">
                    {isMPCA
                        ? "No budgets yet. Set the tournament Input Variables and click Auto-Split, or wait for participating bodies to generate theirs."
                        : "You don't have a budget for this tournament yet. Click 'Generate My Budget' to create one from your input variables."}
                </div>
            ) : (
                <div className="divide-y divide-mpca-brass/15" data-testid="tb-list">
                    {budgets.map((b) => {
                        const isMine = b.body_id === myBody;
                        const canSubmit = (isMine || isMPCA) && ["Draft", "Returned"].includes(b.status);
                        return (
                            <div key={b.id} className="grid grid-cols-12 items-center gap-3 py-3 text-xs" data-testid={`tb-row-${b.id}`}>
                                <div className="col-span-3 min-w-0">
                                    <div className="font-serif text-sm text-mpca-green-dark truncate">{b.body_name || b.body_id}</div>
                                    <div className="text-[10px] font-mono text-mpca-charcoal/70 truncate">{b.budget_no}</div>
                                </div>
                                <div className="col-span-2">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 border-2 ${STATUS_TONE[b.status] || "bg-mpca-brass/25 text-mpca-green-dark border-mpca-brass"}`}>
                                        {(b.status || "").replace(/_/g, " ")}
                                    </span>
                                </div>
                                <div className="col-span-3 text-right font-mono">
                                    <div className="text-sm font-semibold text-mpca-oxblood">{fmt(b.total_ceiling_inr)}</div>
                                    <div className="text-[10px] text-mpca-gray-dark">{(b.head_allocations || []).length} heads</div>
                                </div>
                                <div className="col-span-4 flex justify-end gap-1.5">
                                    {canSubmit && (
                                        <button onClick={() => submitToMpca(b)} disabled={submitting === b.id} className="text-[10px] font-semibold uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2.5 py-1.5 disabled:opacity-40 hover:bg-mpca-oxblood/90" data-testid={`tb-submit-${b.id}`}>
                                            {submitting === b.id ? <Loader2 size={10} className="animate-spin inline" /> : <Send size={10} className="inline mr-0.5" />} Submit
                                        </button>
                                    )}
                                    {isMPCA && b.status === "Submitted" && (
                                        <Link to={`/tournaments/${tournament.id}/finance`} className="text-[10px] font-semibold uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-2.5 py-1.5 inline-flex items-center gap-0.5 hover:bg-mpca-green-dark/90" data-testid={`tb-review-${b.id}`}>
                                            Review <ArrowRight size={10} />
                                        </Link>
                                    )}
                                    <Link to={`/tournaments/${tournament.id}/finance`} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2.5 py-1.5 border-2 border-mpca-oxblood transition-colors" data-testid={`tb-open-${b.id}`}>
                                        Open
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {isMPCA && budgets.length > 0 && (
                <div className="mt-4 border-t border-mpca-brass/20 pt-3 text-[10px] text-mpca-gray-dark flex items-center gap-2">
                    <Info size={10} /> Tip: click Review on any Submitted row to see the Division diff vs the MPCA master values.
                </div>
            )}
        </div>
    );
};

export default TournamentBudgetsPanel;
