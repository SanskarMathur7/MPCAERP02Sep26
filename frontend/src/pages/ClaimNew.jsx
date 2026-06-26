import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { createClaim, fetchTournamentBudgets } from "@/lib/api";
import { HandCoins, ChevronLeft, CheckCircle2, AlertTriangle, Plus, X } from "lucide-react";
import FileUpload from "@/components/FileUpload";

const CATEGORIES = [
    { value: "Annual_Grant",       label: "Annual Grant",        hint: "District statutory grant per Art. 28(v)" },
    { value: "Tournament_Expense", label: "Tournament Expense",  hint: "Travel · boarding · officiating costs" },
    { value: "Tournament_Funding", label: "Tournament Funding",  hint: "MoM · 1:1 matched tournament funding" },
    { value: "Admin_Grant",        label: "Admin Grant",         hint: "MoM · MPCA admin grant to Div / Dist" },
    { value: "Coaching_Grant",     label: "Coaching Grant",      hint: "MoM · coaching staff & camps" },
    { value: "District_Travel",    label: "District Travel",     hint: "MoM · district-level travel funding" },
    { value: "MRA_Management",     label: "MRA Management",      hint: "MoM · Match Referee management amount" },
    { value: "Infrastructure",     label: "Infrastructure",      hint: "Equipment · ground upkeep · stadium works" },
    { value: "Honorarium",         label: "Honorarium",          hint: "Umpire panel · coaching staff · scorers" },
    { value: "Special_Sanction",   label: "Special Sanction",    hint: "One-off MC-approved expenditure" },
];

const HEADS = [
    { id: "Travel", label: "Travel" },
    { id: "Hotel", label: "Hotel" },
    { id: "Road_BLP_Lunch_Rain", label: "Road (BLP + Lunch + Rain)" },
    { id: "TA_DA", label: "TA / DA" },
    { id: "Match_Officials", label: "Match Officials" },
    { id: "Equipment", label: "Equipment" },
    { id: "Ground_Expenses", label: "Ground Expenses" },
    { id: "Miscellaneous", label: "Miscellaneous" },
];

const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const ClaimNew = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "Tournament_Funding",
        amount_inr: "",
        fiscal_cycle: "2025-26",
        claim_path: "Bulk_Budget",
        tournament_budget_id: "",
    });
    const [budgets, setBudgets] = useState([]);
    const [subBills, setSubBills] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Load approved tournament budgets for this body whenever As_per_Budget is chosen
    useEffect(() => {
        if (form.claim_path !== "As_per_Budget" || !persona?.body_code) return;
        fetchTournamentBudgets({ status: "Approved", body_id: persona.body_code })
            .then(setBudgets)
            .catch(() => setBudgets([]));
    }, [form.claim_path, persona]);

    if (!persona || persona.body_type === "Public") {
        return (
            <div className="page-enter px-8 py-16 max-w-2xl mx-auto text-center" data-testid="claim-new-denied">
                <div className="overline">Access Denied</div>
                <h1 className="font-serif text-3xl text-mpca-green-dark mt-3">
                    A District or State persona is required to raise claims.
                </h1>
            </div>
        );
    }

    const selectedBudget = budgets.find((b) => b.id === form.tournament_budget_id);

    // Derive approved head-limits + claimed-by-head for live excess preview
    const headLimits = selectedBudget
        ? Object.fromEntries((selectedBudget.approved_head_allocations || []).map((h) => [h.head, h.limit_inr]))
        : {};
    const claimedByHead = subBills.reduce((acc, sb) => {
        acc[sb.head] = (acc[sb.head] || 0) + (parseFloat(sb.amount_inr) || 0);
        return acc;
    }, {});
    const excessHeads = Object.entries(claimedByHead)
        .filter(([h, v]) => selectedBudget && v > (headLimits[h] || 0))
        .map(([h, v]) => ({ head: h, claimed: v, limit: headLimits[h] || 0, excess: v - (headLimits[h] || 0) }));
    const subBillSum = subBills.reduce((s, sb) => s + (parseFloat(sb.amount_inr) || 0), 0);

    const addSubBill = () => setSubBills((prev) => [...prev, { head: "Travel", description: "", amount_inr: "" }]);
    const updateSubBill = (idx, patch) => setSubBills((prev) => prev.map((sb, i) => i === idx ? { ...sb, ...patch } : sb));
    const removeSubBill = (idx) => setSubBills((prev) => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const payload = {
                body_id: persona.body_code,
                title: form.title.trim(),
                description: form.description.trim() || null,
                category: form.category,
                amount_inr: parseFloat(form.amount_inr),
                fiscal_cycle: form.fiscal_cycle,
                created_by: persona.name,
                supporting_doc_urls: attachments.map((a) => a.url),
                claim_path: form.claim_path,
                tournament_budget_id: form.claim_path === "As_per_Budget" ? form.tournament_budget_id : null,
                sub_bills: subBills
                    .filter((sb) => parseFloat(sb.amount_inr) > 0)
                    .map((sb) => ({
                        head: sb.head,
                        description: sb.description.trim() || sb.head,
                        amount_inr: parseFloat(sb.amount_inr),
                    })),
            };
            const created = await createClaim(payload);
            navigate("/claims", { state: { highlight: created.id } });
        } catch (e) {
            setError(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-3xl mx-auto" data-testid="claim-new-page">
            <button
                onClick={() => navigate("/claims")}
                className="btn-heritage-ghost mb-6"
                data-testid="claim-new-back"
            >
                <ChevronLeft size={14} strokeWidth={2} /> Back to Claims
            </button>

            <div className="overline">Article XIV · Raise a Claim</div>
            <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                A new entry in the grant ledger.
            </h1>
            <p className="text-mpca-gray-dark mt-3">
                Once drafted, this claim travels: <strong>{persona.body_code}</strong> → its parent body → MPCA Treasurer → disbursement. <span className="text-mpca-saffron font-semibold">TAT: 2 days per stage.</span>
            </p>

            <div className="crest-divider my-10" />

            <form onSubmit={handleSubmit} className="bulletin-card p-8 space-y-6" data-testid="claim-new-form">
                <div className="flex items-center gap-3">
                    <HandCoins className="text-mpca-oxblood" size={22} strokeWidth={1.5} />
                    <div>
                        <div className="overline">Originator</div>
                        <div className="font-serif text-lg text-mpca-green-dark">
                            {persona.honorific} {persona.name} · {persona.body_name}
                        </div>
                    </div>
                </div>

                {/* Phase B · Claim Path picker */}
                <div>
                    <label className="label-heritage">Claim Path *</label>
                    <div className="grid grid-cols-2 gap-3" data-testid="claim-path-group">
                        {[
                            { value: "As_per_Budget", title: "As per Budget", hint: "Itemised — must match an Approved Tournament Budget" },
                            { value: "Bulk_Budget", title: "Bulk Budget", hint: "Off-envelope / excess / ad-hoc — needs separate MPCA sanction" },
                        ].map((p) => (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, claim_path: p.value }))}
                                data-testid={"claim-path-" + p.value}
                                className={
                                    "text-left px-4 py-3 border transition-colors " +
                                    (form.claim_path === p.value
                                        ? "border-mpca-oxblood bg-mpca-oxblood/10 text-mpca-oxblood"
                                        : "border-mpca-brass/40 hover:border-mpca-brass text-mpca-green-dark")
                                }
                            >
                                <div className="font-serif text-sm">{p.title}</div>
                                <div className="text-[11px] text-mpca-gray-dark mt-0.5">{p.hint}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* As-per-Budget · Tournament Budget selector */}
                {form.claim_path === "As_per_Budget" && (
                    <div data-testid="tb-picker-block">
                        <label className="label-heritage">Tournament Budget *</label>
                        <select
                            required
                            value={form.tournament_budget_id}
                            onChange={(e) => setForm((f) => ({ ...f, tournament_budget_id: e.target.value }))}
                            className="input-heritage"
                            data-testid="claim-tb-select"
                        >
                            <option value="">— Choose an Approved budget for {persona.body_name} —</option>
                            {budgets.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.budget_no} · {b.tournament_name} · approved {fmtINR(b.approved_total_inr)}
                                </option>
                            ))}
                        </select>
                        {budgets.length === 0 && (
                            <div className="text-xs text-mpca-oxblood mt-1">
                                No Approved tournament budgets for {persona.body_name}. Use Bulk Budget path or have your Division Sec propose one first.
                            </div>
                        )}
                        {selectedBudget && (
                            <div className="mt-3 bg-mpca-cream border-l-2 border-mpca-gold-light p-3 text-xs">
                                <div className="overline mb-1">Approved Head Limits</div>
                                <div className="grid grid-cols-2 gap-y-1 font-mono">
                                    {(selectedBudget.approved_head_allocations || []).map((h) => (
                                        <div key={h.head} className="flex justify-between gap-2">
                                            <span className="text-mpca-gray-dark">{HEADS.find((x) => x.id === h.head)?.label || h.head}</span>
                                            <span>{fmtINR(h.limit_inr)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <label className="label-heritage" htmlFor="title">Claim Title *</label>
                    <input
                        id="title"
                        required
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Travel + Stay for MY Memorial Trophy U-19"
                        className="input-heritage"
                        data-testid="claim-title-input"
                    />
                </div>

                <div>
                    <label className="label-heritage" htmlFor="description">Description / Justification</label>
                    <textarea
                        id="description"
                        rows={3}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Brief justification, references to MC resolutions, attachments etc."
                        className="input-heritage"
                        data-testid="claim-description-input"
                    />
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                        <label className="label-heritage">Category *</label>
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1" data-testid="claim-category-group">
                            {CATEGORIES.map((c) => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, category: c.value }))}
                                    data-testid={"claim-cat-" + c.value}
                                    className={
                                        "w-full text-left px-3 py-2 border transition-colors " +
                                        (form.category === c.value
                                            ? "border-mpca-oxblood bg-mpca-oxblood/10 text-mpca-oxblood"
                                            : "border-mpca-brass/40 hover:border-mpca-brass text-mpca-green-dark")
                                    }
                                >
                                    <div className="font-serif text-sm">{c.label}</div>
                                    <div className="text-[10px] text-mpca-gray-dark mt-0.5">{c.hint}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="label-heritage" htmlFor="amount">Total Amount (INR) *</label>
                            <input
                                id="amount"
                                required
                                type="number"
                                step="1"
                                min="1"
                                value={form.amount_inr}
                                onChange={(e) => setForm((f) => ({ ...f, amount_inr: e.target.value }))}
                                placeholder="110000"
                                className="input-heritage"
                                data-testid="claim-amount-input"
                            />
                            {form.claim_path === "As_per_Budget" && subBillSum > 0 && Math.abs(subBillSum - parseFloat(form.amount_inr || 0)) > 1 && (
                                <div className="text-[10px] text-mpca-oxblood mt-1">
                                    Sub-bill sum is {fmtINR(subBillSum)} — total amount should match.
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="label-heritage" htmlFor="cycle">Fiscal Cycle</label>
                            <input
                                id="cycle"
                                value={form.fiscal_cycle}
                                onChange={(e) => setForm((f) => ({ ...f, fiscal_cycle: e.target.value }))}
                                placeholder="2025-26"
                                className="input-heritage"
                                data-testid="claim-cycle-input"
                            />
                        </div>
                    </div>
                </div>

                {/* Phase B · Sub-bills (Summary Form) */}
                {form.claim_path === "As_per_Budget" && (
                    <div className="border-t border-mpca-brass/20 pt-4" data-testid="sub-bills-block">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="overline">Summary Form · Travel / Hotel / Road / TA-DA breakdown</div>
                                <div className="text-xs text-mpca-gray-dark mt-1">Each sub-bill is checked against the approved head limit live.</div>
                            </div>
                            <button type="button" onClick={addSubBill} className="btn-heritage-ghost text-xs px-3 py-1 flex items-center gap-1" data-testid="add-subbill-btn">
                                <Plus className="w-3 h-3" /> Add Sub-bill
                            </button>
                        </div>
                        <div className="space-y-2">
                            {subBills.map((sb, idx) => {
                                const limit = headLimits[sb.head] || 0;
                                const claimedForThisHead = claimedByHead[sb.head] || 0;
                                const overLimit = selectedBudget && claimedForThisHead > limit;
                                return (
                                    <div key={idx} className="flex flex-wrap gap-2 items-start border border-mpca-brass/30 bg-mpca-cream/30 p-2" data-testid={`subbill-${idx}`}>
                                        <select value={sb.head} onChange={(e) => updateSubBill(idx, { head: e.target.value })} className="input-heritage w-44 text-sm" data-testid={`subbill-head-${idx}`}>
                                            {HEADS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                                        </select>
                                        <input value={sb.description} onChange={(e) => updateSubBill(idx, { description: e.target.value })} placeholder="Description" className="input-heritage flex-1 min-w-[200px] text-sm" data-testid={`subbill-desc-${idx}`} />
                                        <input type="number" min="0" value={sb.amount_inr} onChange={(e) => updateSubBill(idx, { amount_inr: e.target.value })} placeholder="₹" className={"input-heritage w-32 text-sm " + (overLimit ? "border-mpca-oxblood" : "")} data-testid={`subbill-amount-${idx}`} />
                                        <button type="button" onClick={() => removeSubBill(idx)} className="btn-heritage-ghost text-mpca-oxblood text-xs px-2 py-1" data-testid={`subbill-remove-${idx}`}>
                                            <X className="w-3 h-3" />
                                        </button>
                                        {selectedBudget && limit > 0 && (
                                            <div className="text-[10px] w-full mt-1">
                                                Limit for {HEADS.find((x) => x.id === sb.head)?.label}: <strong>{fmtINR(limit)}</strong>
                                                {overLimit && <span className="text-mpca-oxblood ml-2">⚠ over limit by {fmtINR(claimedForThisHead - limit)}</span>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {excessHeads.length > 0 && (
                            <div className="mt-3 bg-mpca-oxblood/10 border border-mpca-oxblood/40 text-mpca-oxblood p-3 text-xs flex items-start gap-2" data-testid="excess-warning">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <div>
                                    <strong>Excess Sanction Flag</strong> — this claim exceeds approved limits on {excessHeads.length} head(s). It will be marked <code>is_excess=true</code> and require separate MPCA approval over the approved tournament budget envelope.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 text-mpca-oxblood px-4 py-3 text-sm" data-testid="claim-new-error">
                        {error}
                    </div>
                )}

                <div className="pt-2 border-t border-mpca-brass/20">
                    <FileUpload
                        value={attachments}
                        onChange={setAttachments}
                        metadata={{
                            body_id: persona.body_code,
                            uploaded_by: persona.name,
                            related_type: "claim",
                        }}
                        label="Supporting Documents (bills · resolutions · sanctions · scheme docs)"
                    />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-mpca-brass/20">
                    <button type="button" onClick={() => navigate("/claims")} className="btn-heritage-ghost" data-testid="claim-new-cancel">
                        Cancel
                    </button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="claim-new-submit">
                        <CheckCircle2 size={14} strokeWidth={2} />
                        {busy ? "Saving…" : "Save as Draft"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ClaimNew;
