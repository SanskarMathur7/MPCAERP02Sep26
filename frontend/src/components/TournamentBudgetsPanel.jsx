import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Loader2, ArrowRight, Send, PlusCircle, Info, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

// M39v · Higher-contrast pills. Every pill uses a dark text colour on a
// tinted background so it's legible on the mpca-parchment sheet.
const STATUS_TONE = {
    Draft:                "bg-mpca-brass/25 text-mpca-green-dark border-mpca-brass",
    Submitted:            "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/60",
    Approved:             "bg-mpca-green-dark/25 text-mpca-green-dark border-mpca-green-dark",
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
 *
 * M39z.b · For Divisions we auto-expand the row (they only see their own)
 * and render the full head-wise breakdown so they can see WHERE their
 * sanctioned rupees sit and reconcile invoices head-by-head.
 */
const TournamentBudgetsPanel = ({ tournament, persona, onChange, hideConsoleLinks = false }) => {
    const [budgets, setBudgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(null);
    const [openIds, setOpenIds] = useState({});
    // M39z.c · Head-wise spend tally per body_id. Keyed by body_id so MPCA
    // (who may open multiple bodies) can view each row's live spend.
    const [spendByBody, setSpendByBody] = useState({});

    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    const load = async () => {
        setLoading(true);
        try {
            const params = { tournament_id: tournament.id };
            if (!isMPCA && myBody) params.body_id = myBody;
            const { data } = await api.get("/tournament-budgets", { params });
            const list = (data || []).filter((b) => b.status !== "Cancelled");
            setBudgets(list);
            // M39z.b · Auto-expand: for Divisions (single row), or every Approved row for MPCA.
            const next = {};
            list.forEach((b) => { if (!isMPCA || b.status === "Approved") next[b.id] = true; });
            if (!isMPCA && list.length === 1) next[list[0].id] = true;
            setOpenIds(next);
            // M39z.c · Fetch live spend tally for every body we're showing
            const spendMap = {};
            await Promise.all(list.map(async (b) => {
                if (!b.body_id) return;
                try {
                    const { data: s } = await api.get(`/tournaments/${tournament.id}/spent-by-head`, { params: { body_id: b.body_id } });
                    spendMap[b.body_id] = s;
                } catch (_) { /* skip on error (e.g. 403 for other bodies) */ }
            }));
            setSpendByBody(spendMap);
        } catch (_) { setBudgets([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [tournament.id, isMPCA, myBody]);

    const toggle = (id) => setOpenIds((s) => ({ ...s, [id]: !s[id] }));

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
        <div className="border border-mpca-brass/40 bg-mpca-ivory p-5" data-testid="panel-tournament-budgets">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="overline text-[10px] font-semibold text-mpca-oxblood flex items-center gap-2"><Wallet size={12} /> Budget &amp; Extras</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1 font-semibold">
                        {isMPCA ? `${budgets.length} budget${budgets.length === 1 ? "" : "s"} · all bodies` : `Your body (${myBody})`}
                    </div>
                </div>
                <div className="flex gap-2">
                    {/* MPCA-134 · Hide redundant "Full Finance Screen" link
                        when panel already renders inside the Finance Console. */}
                    {!hideConsoleLinks && (
                    <Link to={`/tournaments/${tournament.id}/finance`} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2.5 py-1.5 border-2 border-mpca-oxblood transition-colors inline-flex items-center gap-1" data-testid="tb-open-full-btn">
                        Full Finance Screen <ArrowRight size={10} />
                    </Link>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="py-8 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading…</div>
            ) : budgets.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-mpca-brass/30 text-[11px] text-mpca-gray-dark italic" data-testid="tb-empty">
                    {isMPCA
                        ? "No budgets yet. Set the tournament Input Variables and click Prepare on the Finance Console."
                        : "MPCA has not sent you a budget yet. You'll be notified in the Action Centre once your budget is ready to accept."}
                </div>
            ) : (
                <div className="divide-y divide-mpca-brass/25" data-testid="tb-list">
                    {budgets.map((b) => {
                        const isMine = b.body_id === myBody;
                        const canSubmit = isMPCA && ["Draft", "Returned"].includes(b.status);
                        const isOpen = !!openIds[b.id];
                        const heads = b.approved_head_allocations?.length ? b.approved_head_allocations : (b.head_allocations || []);
                        const approvedTotal = (b.approved_head_allocations || []).reduce((s, h) => s + (h.limit_inr || 0), 0);
                        return (
                            <div key={b.id} data-testid={`tb-row-${b.id}`}>
                                <div className="grid grid-cols-12 items-center gap-3 py-3 text-xs">
                                    <div className="col-span-3 min-w-0">
                                        <div className="font-serif text-sm text-mpca-green-dark truncate font-semibold">{b.body_name || b.body_id}</div>
                                        <div className="text-[10px] font-mono text-mpca-charcoal/80 truncate">{b.budget_no}</div>
                                    </div>
                                    <div className="col-span-2">
                                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 border-2 ${STATUS_TONE[b.status] || "bg-mpca-brass/25 text-mpca-green-dark border-mpca-brass"}`}>
                                            {(b.status || "").replace(/_/g, " ")}
                                        </span>
                                    </div>
                                    <div className="col-span-3 text-right font-mono">
                                        <div className="text-sm font-semibold text-mpca-oxblood">{fmt(b.approved_total_inr || b.total_ceiling_inr)}</div>
                                        <div className="text-[10px] text-mpca-charcoal/70">{heads.length} heads</div>
                                    </div>
                                    <div className="col-span-4 flex justify-end gap-1.5 items-center">
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
                                        <button onClick={() => toggle(b.id)} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark hover:text-mpca-oxblood inline-flex items-center gap-1" data-testid={`tb-toggle-${b.id}`}>
                                            {isOpen ? "Hide" : "View"} heads <ChevronRight size={10} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                        </button>
                                        {!hideConsoleLinks && (
                                        <Link to={`/tournaments/${tournament.id}/finance`} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2.5 py-1.5 border-2 border-mpca-oxblood transition-colors" data-testid={`tb-open-${b.id}`}>
                                            Full detail
                                        </Link>
                                        )}
                                    </div>
                                </div>

                                {/* M39z.b · Head-wise breakdown with live spend (M39z.c) */}
                                {isOpen && heads.length > 0 && (() => {
                                    const spend = spendByBody[b.body_id];
                                    const spendByHead = {};
                                    (spend?.heads || []).forEach((r) => { spendByHead[r.head] = r; });
                                    const totalSpent = (spend?.heads || []).reduce((s, r) => s + (r.spent_inr || 0), 0);
                                    const totalOver  = (spend?.heads || []).reduce((s, r) => s + (r.over_inr  || 0), 0);
                                    return (
                                    <div className="mb-3 border-2 border-mpca-brass/30 bg-mpca-parchment/40" data-testid={`tb-heads-${b.id}`}>
                                        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2 border-b border-mpca-brass/25 bg-mpca-brass/10">
                                            <div className="col-span-4 overline text-[9px] font-semibold text-mpca-green-dark">Head</div>
                                            <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Sanctioned ₹</div>
                                            <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Spent ₹</div>
                                            <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Remaining ₹</div>
                                            <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Utilised</div>
                                        </div>
                                        {(b.head_allocations || []).map((h) => {
                                            const app = (b.approved_head_allocations || []).find((x) => x.head === h.head);
                                            const sanctioned = app ? app.limit_inr : h.limit_inr;
                                            const row = spendByHead[h.head] || {};
                                            const spent = row.spent_inr || 0;
                                            const remaining = sanctioned - spent;
                                            const util = row.utilisation_pct || 0;
                                            const isOver = spent > sanctioned && sanctioned > 0;
                                            const isExtra = (h.head || "").startsWith("Extra ");
                                            return (
                                                <div key={h.head} className={`grid grid-cols-12 items-center gap-2 px-3 py-1.5 text-xs border-b border-mpca-brass/15 last:border-b-0 ${isExtra ? "bg-mpca-oxblood/8 border-l-4 border-l-mpca-oxblood" : ""} ${isOver ? "bg-mpca-oxblood/12" : ""}`} data-testid={`tb-head-${b.id}-${(h.head || "").replace(/\s+/g,"_")}`}>
                                                    <div className={`col-span-4 ${isExtra ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal font-medium"}`}>
                                                        {h.head}
                                                        {isExtra && <span className="ml-2 text-[9px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood px-1.5 py-0.5">Extra</span>}
                                                    </div>
                                                    <div className="col-span-2 text-right font-mono text-mpca-charcoal font-semibold">{fmt(sanctioned)}</div>
                                                    <div className={`col-span-2 text-right font-mono font-semibold ${spent > 0 ? "text-mpca-navy" : "text-mpca-charcoal/50"}`}>{fmt(spent)}</div>
                                                    <div className={`col-span-2 text-right font-mono font-semibold ${remaining < 0 ? "text-mpca-oxblood" : remaining === 0 ? "text-mpca-charcoal/70" : "text-mpca-green-dark"}`}>
                                                        {remaining < 0 ? `−${fmt(Math.abs(remaining))}` : fmt(remaining)}
                                                    </div>
                                                    <div className="col-span-2 text-right">
                                                        {sanctioned > 0 ? (
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <div className="w-16 h-1.5 bg-mpca-brass/20 relative overflow-hidden">
                                                                    <div className={`absolute top-0 left-0 h-full ${isOver ? "bg-mpca-oxblood" : util > 80 ? "bg-mpca-brass" : "bg-mpca-green-dark"}`} style={{ width: `${Math.min(100, util)}%` }} />
                                                                </div>
                                                                <span className={`text-[10px] font-mono w-9 ${isOver ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal/80"}`}>{util.toFixed(0)}%</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-mpca-charcoal/50">—</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2 border-t-2 border-mpca-brass/40 bg-mpca-brass/10">
                                            <div className="col-span-4 overline text-[9px] font-semibold text-mpca-oxblood">Totals</div>
                                            <div className="col-span-2 text-right font-mono text-mpca-oxblood font-bold text-sm">{fmt(b.approved_total_inr || approvedTotal)}</div>
                                            <div className="col-span-2 text-right font-mono text-mpca-navy font-bold text-sm">{fmt(totalSpent)}</div>
                                            <div className={`col-span-2 text-right font-mono font-bold text-sm ${(b.approved_total_inr || approvedTotal) - totalSpent < 0 ? "text-mpca-oxblood" : "text-mpca-green-dark"}`}>
                                                {fmt((b.approved_total_inr || approvedTotal) - totalSpent)}
                                            </div>
                                            <div className="col-span-2 text-right">
                                                {totalOver > 0 && <span className="text-[9px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood px-1.5 py-0.5">Over ₹{Math.round(totalOver).toLocaleString("en-IN")}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
            )}

            {isMPCA && budgets.length > 0 && (
                <div className="mt-4 border-t border-mpca-brass/25 pt-3 text-[11px] text-mpca-charcoal/80 flex items-center gap-2">
                    <Info size={11} /> Tip: click Review on any Submitted row to see the Division diff vs the MPCA master values.
                </div>
            )}
        </div>
    );
};

export default TournamentBudgetsPanel;
