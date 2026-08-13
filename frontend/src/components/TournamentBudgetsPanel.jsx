import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Loader2, ArrowRight, Send, PlusCircle, Info, TrendingUp, TrendingDown, ChevronRight, Pencil, Save, X, Plus } from "lucide-react";
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
    // MPCA-168 · Draft/Under_Review claim per body — powers the inline
    // "Division remark" input on each head row. Keyed by body_id.
    const [draftClaimByBody, setDraftClaimByBody] = useState({});

    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    // Auto-drafted budget editing (MPCA for BCCI + Inter_Divisional; Divisions
    // for every other scope). See backend `_may_edit_heads`.
    const editableScopes = ["BCCI", "Inter_Divisional"];
    const scope = tournament?.scope;
    const canEditHeads = isMPCA
        ? editableScopes.includes(scope)
        : (persona?.body_type === "Division" || persona?.body_type === "District") && !editableScopes.includes(scope);
    const [editing, setEditing] = useState(null);     // budget_id being edited
    const [draftHeads, setDraftHeads] = useState([]); // [{head, limit_inr, notes?}]
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState("");

    const startEdit = (b) => {
        setEditing(b.id);
        setDraftHeads((b.head_allocations || []).map((h) => ({ ...h, limit_inr: Number(h.limit_inr) || 0 })));
        setEditError("");
    };
    const cancelEdit = () => { setEditing(null); setDraftHeads([]); setEditError(""); };
    const updateDraft = (idx, patch) => {
        setDraftHeads((prev) => prev.map((h, i) => i === idx ? { ...h, ...patch } : h));
    };
    const removeDraft = (idx) => setDraftHeads((prev) => prev.filter((_, i) => i !== idx));
    const addDraft = () => setDraftHeads((prev) => [...prev, { head: "", limit_inr: 0, notes: "" }]);
    const saveEdit = async (b) => {
        const cleaned = draftHeads
            .map((h) => ({ head: (h.head || "").trim(), limit_inr: Number(h.limit_inr) || 0, notes: h.notes || null }))
            .filter((h) => h.head.length > 0);
        if (cleaned.length === 0) { setEditError("Add at least one line item."); return; }
        const total = cleaned.reduce((s, h) => s + h.limit_inr, 0);
        setSavingEdit(true); setEditError("");
        try {
            await api.patch(`/tournament-budgets/${b.id}/heads`, {
                head_allocations: cleaned,
                total_ceiling_inr: total,
                edited_by: persona?.name || "Unknown",
            });
            cancelEdit();
            await load();
            onChange?.();
        } catch (e) { setEditError(e?.response?.data?.detail || e.message); }
        finally { setSavingEdit(false); }
    };

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
            // MPCA-168 · Pull Draft/Submitted/Under_Review reimbursement claims
            // so we can render Division-editable remarks against each head.
            try {
                const { data: cs } = await api.get("/reimbursement-claims", { params });
                const dcMap = {};
                (cs || []).forEach((c) => {
                    if (["Draft", "Submitted", "Under_Review"].includes(c.status)) {
                        dcMap[c.body_id] = c;
                    }
                });
                setDraftClaimByBody(dcMap);
            } catch (_) { /* silent */ }
        } catch (_) { setBudgets([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [tournament.id, isMPCA, myBody]);

    // MPCA-168 · Persist a Division head-remark on the claim. Called on blur
    // from the inline input in the head-row table above.
    const onSetRemark = async (claimId, head, remark) => {
        try {
            const { data: updated } = await api.post(
                `/reimbursement-claims/${claimId}/head-remark`,
                { head, remark },
            );
            setDraftClaimByBody((prev) => ({ ...prev, [updated.body_id]: updated }));
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        }
    };

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
                                        {/* Auto-draft edit — MPCA (BCCI + Inter-Div) / Division (others). */}
                                        {canEditHeads && editing !== b.id && ["Draft", "Returned", "Sent_To_Division", "Accepted_By_Division", "Revision_Requested", "Submitted"].includes(b.status) && (isMPCA || b.body_id === myBody) && (
                                            <button onClick={() => startEdit(b)} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood inline-flex items-center gap-1" data-testid={`tb-edit-${b.id}`}>
                                                <Pencil size={10} /> Edit lines
                                            </button>
                                        )}
                                        {!hideConsoleLinks && (
                                        <Link to={`/tournaments/${tournament.id}/finance`} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2.5 py-1.5 border-2 border-mpca-oxblood transition-colors" data-testid={`tb-open-${b.id}`}>
                                            Full detail
                                        </Link>
                                        )}
                                    </div>
                                </div>

                                {/* Inline line-item editor — replaces the read-only breakdown while active. */}
                                {editing === b.id && (
                                    <div className="mb-3 border-2 border-mpca-oxblood bg-mpca-parchment/60 p-3" data-testid={`tb-edit-form-${b.id}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="overline text-[9px] text-mpca-oxblood">Editing line items · {isMPCA ? "MPCA authority" : "Division authority"}</div>
                                            <div className="text-[10px] font-mono text-mpca-charcoal/80">
                                                New total: <b className="text-mpca-oxblood">{fmt(draftHeads.reduce((s, h) => s + (Number(h.limit_inr) || 0), 0))}</b>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            {draftHeads.map((h, i) => (
                                                <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`tb-edit-row-${b.id}-${i}`}>
                                                    <input
                                                        className="col-span-6 input-heritage !py-1 !text-xs"
                                                        placeholder="Head / line description"
                                                        value={h.head}
                                                        onChange={(e) => updateDraft(i, { head: e.target.value })}
                                                        data-testid={`tb-edit-head-${b.id}-${i}`}
                                                    />
                                                    <input
                                                        className="col-span-3 input-heritage !py-1 !text-xs font-mono text-right"
                                                        type="number"
                                                        min={0}
                                                        placeholder="Amount ₹"
                                                        value={h.limit_inr}
                                                        onChange={(e) => updateDraft(i, { limit_inr: e.target.value })}
                                                        data-testid={`tb-edit-amt-${b.id}-${i}`}
                                                    />
                                                    <input
                                                        className="col-span-2 input-heritage !py-1 !text-xs"
                                                        placeholder="Notes (optional)"
                                                        value={h.notes || ""}
                                                        onChange={(e) => updateDraft(i, { notes: e.target.value })}
                                                    />
                                                    <button onClick={() => removeDraft(i)} className="col-span-1 text-mpca-oxblood hover:bg-mpca-oxblood/10 p-1 justify-self-center" title="Remove line" data-testid={`tb-edit-remove-${b.id}-${i}`}>
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            <button onClick={addDraft} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2 py-1 border border-dashed border-mpca-oxblood inline-flex items-center gap-1" data-testid={`tb-edit-add-${b.id}`}>
                                                <Plus size={10} /> Add Line Item
                                            </button>
                                        </div>
                                        {editError && <div className="mt-2 text-[10px] text-mpca-oxblood font-mono" data-testid={`tb-edit-error-${b.id}`}>{editError}</div>}
                                        <div className="mt-3 flex gap-2 justify-end">
                                            <button onClick={cancelEdit} disabled={savingEdit} className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40 text-mpca-charcoal hover:bg-mpca-parchment" data-testid={`tb-edit-cancel-${b.id}`}>Cancel</button>
                                            <button onClick={() => saveEdit(b)} disabled={savingEdit} className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-mpca-green-dark text-mpca-ivory hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1" data-testid={`tb-edit-save-${b.id}`}>
                                                {savingEdit ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save changes
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* M39z.b · Head-wise breakdown with live spend (M39z.c) */}
                                {isOpen && editing !== b.id && heads.length > 0 && (() => {
                                    const spend = spendByBody[b.body_id];
                                    const spendByHead = {};
                                    (spend?.heads || []).forEach((r) => { spendByHead[r.head] = r; });
                                    const totalSpent = (spend?.heads || []).reduce((s, r) => s + (r.spent_inr || 0), 0);
                                    const totalOver  = (spend?.heads || []).reduce((s, r) => s + (r.over_inr  || 0), 0);
                                    // MPCA-168 · Show Division-editable remarks inline for their own body.
                                    const isOwnDraftClaim = draftClaimByBody[b.body_id];
                                    const remarks = isOwnDraftClaim?.division_head_remarks || {};
                                    return (
                                    <div className="mb-3 border-2 border-mpca-brass/30 bg-mpca-parchment/40" data-testid={`tb-heads-${b.id}`}>
                                        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2 border-b border-mpca-brass/25 bg-mpca-brass/10">
                                            <div className="col-span-3 overline text-[9px] font-semibold text-mpca-green-dark">Head</div>
                                            <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Sanctioned ₹</div>
                                            <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Spent ₹</div>
                                            <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Remaining ₹</div>
                                            <div className="col-span-1 text-right overline text-[9px] font-semibold text-mpca-green-dark">Util</div>
                                            <div className="col-span-2 overline text-[9px] font-semibold text-mpca-green-dark">Division Remark</div>
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
                                            const remark = remarks[h.head] || "";
                                            return (
                                                <div key={h.head} className={`grid grid-cols-12 items-center gap-2 px-3 py-1.5 text-xs border-b border-mpca-brass/15 last:border-b-0 ${isExtra ? "bg-mpca-oxblood/8 border-l-4 border-l-mpca-oxblood" : ""} ${isOver ? "bg-mpca-oxblood/12" : ""}`} data-testid={`tb-head-${b.id}-${(h.head || "").replace(/\s+/g,"_")}`}>
                                                    <div className={`col-span-3 ${isExtra ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal font-medium"}`}>
                                                        {h.head}
                                                        {isExtra && <span className="ml-2 text-[9px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood px-1.5 py-0.5">Extra</span>}
                                                    </div>
                                                    <div className="col-span-2 text-right font-mono text-mpca-charcoal font-semibold">{fmt(sanctioned)}</div>
                                                    <div className={`col-span-2 text-right font-mono font-semibold ${spent > 0 ? "text-mpca-navy" : "text-mpca-charcoal/50"}`}>{fmt(spent)}</div>
                                                    <div className={`col-span-2 text-right font-mono font-semibold ${remaining < 0 ? "text-mpca-oxblood" : remaining === 0 ? "text-mpca-charcoal/70" : "text-mpca-green-dark"}`}>
                                                        {remaining < 0 ? `−${fmt(Math.abs(remaining))}` : fmt(remaining)}
                                                    </div>
                                                    <div className="col-span-1 text-right">
                                                        {sanctioned > 0 ? (
                                                            <span className={`text-[10px] font-mono ${isOver ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal/80"}`}>{util.toFixed(0)}%</span>
                                                        ) : (
                                                            <span className="text-[10px] text-mpca-charcoal/50">—</span>
                                                        )}
                                                    </div>
                                                    <div className="col-span-2" data-testid={`tb-remark-cell-${b.id}-${(h.head || "").replace(/\s+/g,"_")}`}>
                                                        {isOwnDraftClaim ? (
                                                            <input
                                                                type="text"
                                                                defaultValue={remark}
                                                                placeholder="Add remark…"
                                                                onBlur={(e) => {
                                                                    const v = e.target.value.trim();
                                                                    if (v === remark) return;
                                                                    onSetRemark?.(isOwnDraftClaim.id, h.head, v);
                                                                }}
                                                                className="w-full text-[10px] px-1.5 py-1 border border-mpca-brass/30 bg-white text-mpca-charcoal focus:outline-none focus:border-mpca-navy"
                                                                data-testid={`tb-remark-input-${b.id}-${(h.head || "").replace(/\s+/g,"_")}`}
                                                            />
                                                        ) : (
                                                            <span className="text-[10px] italic text-mpca-charcoal/70">{remark || "—"}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2 border-t-2 border-mpca-brass/40 bg-mpca-brass/10">
                                            <div className="col-span-3 overline text-[9px] font-semibold text-mpca-oxblood">Totals</div>
                                            <div className="col-span-2 text-right font-mono text-mpca-oxblood font-bold text-sm">{fmt(b.approved_total_inr || approvedTotal)}</div>
                                            <div className="col-span-2 text-right font-mono text-mpca-navy font-bold text-sm">{fmt(totalSpent)}</div>
                                            <div className={`col-span-2 text-right font-mono font-bold text-sm ${(b.approved_total_inr || approvedTotal) - totalSpent < 0 ? "text-mpca-oxblood" : "text-mpca-green-dark"}`}>
                                                {fmt((b.approved_total_inr || approvedTotal) - totalSpent)}
                                            </div>
                                            <div className="col-span-3 text-right">
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
