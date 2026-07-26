import { useEffect, useMemo, useState } from "react";
import { Save, Send, Loader2, Calculator, AlertTriangle, ChevronRight, Split } from "lucide-react";
import { api } from "@/lib/api";
import { getTypeByCode, INLINE_INPUT_SPECS } from "@/lib/tournamentCatalog";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

/**
 * Sprint M20 · Input Variables Panel
 * ──────────────────────────────────
 * Renders a dynamic form for the tournament's category. Two sources:
 *   (a) Backend `/api/schemes/{scheme_code}/input-spec` — used when the
 *       category maps to an existing deterministic calculator (2-A/2-B/2-C/
 *       2-D/3-A/3-D).
 *   (b) Frontend `INLINE_INPUT_SPECS` — fallback for categories with no
 *       backend calculator (reciprocal, inter_school, inter_club,
 *       vacation_camp, away_participation). Vars are still stored on the
 *       tournament document; the Division fills a manual budget for these.
 *
 * Save flow:
 *   1. PATCH /tournaments/{tid}/input-variables  (persist inputs)
 *   2. If scheme_code present → POST /schemes/{code}/compute-budget with
 *      inputs, then upsert `tournament_budgets` (create if none, PATCH if
 *      exists — as long as status is not Approved).
 *   3. Optional "Submit Budget to MPCA" — POSTs to the existing
 *      `/tournament-budgets/{bid}/submit` endpoint.
 */
const InputVariablesPanel = ({ tournament, persona, onChange }) => {
    const type = getTypeByCode(tournament.tournament_type_code);
    const schemeCode = tournament.scheme_code || type?.scheme_code || null;
    const usesBackend = !!schemeCode;

    const [spec, setSpec] = useState(null);
    const [values, setValues] = useState(tournament.input_variables || {});
    const [budgetPreview, setBudgetPreview] = useState(null);
    const [existingBudget, setExistingBudget] = useState(null);
    const [loadingSpec, setLoadingSpec] = useState(true);
    const [saving, setSaving] = useState(false);
    const [computing, setComputing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [dirty, setDirty] = useState(false);

    // M29 · Only MPCA (State) office-bearers can edit tournament input variables.
    // Division/District personas can only VIEW their allocated budget line (they
    // filter budgets/invoices by participant_body_code elsewhere).
    const canEdit = persona?.body_type === "State" && ["secretary", "president", "treasurer"].includes(persona?.id);

    // 1) Load input spec (backend or inline) and seed default values
    useEffect(() => {
        setLoadingSpec(true);
        (async () => {
            try {
                let ivars = [];
                if (usesBackend) {
                    const s = await api.get(`/schemes/${schemeCode}/input-spec`).then((r) => r.data);
                    ivars = s.input_variables || [];
                    setSpec({ source: "backend", label: s.label || schemeCode, input_variables: ivars });
                } else {
                    ivars = INLINE_INPUT_SPECS[tournament.tournament_type_code] || [];
                    setSpec({ source: "inline", label: type?.name || tournament.tournament_type_code, input_variables: ivars });
                }
                // Seed defaults for keys not already on the tournament document
                setValues((v) => {
                    const out = { ...v };
                    ivars.forEach((iv) => { if (out[iv.key] === undefined) out[iv.key] = iv.default; });
                    return out;
                });
            } finally {
                setLoadingSpec(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournament.id, schemeCode]);

    // 2) Load existing budget for this tournament (if any)
    useEffect(() => {
        (async () => {
            try {
                const list = await api.get("/tournament-budgets", { params: { tournament_id: tournament.id } }).then((r) => r.data);
                setExistingBudget(list && list.length ? list[0] : null);
            } catch (_) { setExistingBudget(null); }
        })();
    }, [tournament.id]);

    const setField = (key, val) => {
        setValues((v) => ({ ...v, [key]: val }));
        setDirty(true);
    };

    const recalcBudget = async () => {
        if (!usesBackend) return;
        setComputing(true);
        try {
            const preview = await api.post(`/schemes/${schemeCode}/compute-budget`, { inputs: values }).then((r) => r.data);
            setBudgetPreview(preview);
        } finally { setComputing(false); }
    };

    // Auto-recalc when values change (with debounce)
    useEffect(() => {
        if (!usesBackend || loadingSpec) return;
        const t = setTimeout(() => { recalcBudget().catch(() => { }); }, 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values, usesBackend, loadingSpec]);

    // 3) Save inputs + upsert budget doc
    const saveAndUpsertBudget = async () => {
        setSaving(true);
        try {
            // Persist input variables on the tournament
            await api.patch(`/tournaments/${tournament.id}/input-variables`, { input_variables: values });
            setDirty(false);  // inputs saved, clear dirty flag immediately (budget upsert may still fail)

            if (usesBackend && budgetPreview) {
                if (existingBudget && existingBudget.status !== "Approved") {
                    // Update existing draft/submitted budget with new figures
                    await api.patch(`/tournament-budgets/${existingBudget.id}`, {
                        total_ceiling_inr: budgetPreview.total_ceiling_inr,
                        head_allocations: (budgetPreview.head_allocations || []).map((h) => ({
                            head: h.head, limit_inr: h.limit_inr, notes: h.formula,
                        })),
                        notes: `Recomputed from ${schemeCode} inputs on ${new Date().toLocaleString("en-IN")}`,
                    });
                    // Refresh
                    const list = await api.get("/tournament-budgets", { params: { tournament_id: tournament.id } }).then((r) => r.data);
                    setExistingBudget(list && list.length ? list[0] : null);
                } else if (!existingBudget) {
                    // Create a fresh draft budget
                    const created = await api.post("/tournament-budgets", {
                        tournament_id: tournament.id,
                        body_id: tournament.host_body_id,
                        fiscal_cycle: tournament.fiscal_cycle,
                        total_ceiling_inr: budgetPreview.total_ceiling_inr,
                        head_allocations: (budgetPreview.head_allocations || []).map((h) => ({
                            head: h.head, limit_inr: h.limit_inr, notes: h.formula,
                        })),
                        notes: `Auto-computed from scheme ${schemeCode}`,
                    }).then((r) => r.data);
                    setExistingBudget(created);
                }
            }
            setDirty(false);
            onChange?.();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setSaving(false); }
    };

    // 4) Submit budget → MPCA
    const submitBudget = async () => {
        if (!existingBudget) return alert("Save the budget first.");
        if (existingBudget.status === "Submitted" || existingBudget.status === "Approved") {
            return alert(`Budget already ${existingBudget.status.toLowerCase()}.`);
        }
        if (!window.confirm(`Submit budget ${existingBudget.budget_no} of ${fmt(existingBudget.total_ceiling_inr)} to MPCA for approval?`)) return;
        setSubmitting(true);
        try {
            await api.post(`/tournament-budgets/${existingBudget.id}/submit`, {
                actor_name: persona?.name,
                actor_post: persona?.post,
                actor_body_id: persona?.body_code,
                notes: `Submitted from Input Variables workspace with ${Object.keys(values).length} parameters.`,
            });
            const list = await api.get("/tournament-budgets", { params: { tournament_id: tournament.id } }).then((r) => r.data);
            setExistingBudget(list && list.length ? list[0] : null);
            onChange?.();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setSubmitting(false); }
    };

    const inputVars = spec?.input_variables || [];
    const budgetIsLocked = existingBudget && existingBudget.status === "Approved";
    const [splitting, setSplitting] = useState(false);

    // M31 · Auto-Split Budget — fan out Input Variables into per-body sub-budgets.
    // Host body gets the full hosting scheme; visitor bodies get travel/DA/stay
    // subsidy only. Existing budgets for any (tournament, body) pair are preserved.
    const runAutoSplit = async () => {
        if (dirty) {
            if (!window.confirm("You have unsaved input variables. Save them first?\n\nOK = Save then Auto-Split · Cancel = abort")) return;
            await saveAndUpsertBudget();
        }
        if (!window.confirm(
            "Auto-Split Budget?\n\n" +
            "This creates one DRAFT budget per accepted participant:\n" +
            "· Host body → full hosting scheme allocation\n" +
            "· Visitor bodies → travel + DA + stay subsidy only\n\n" +
            "Existing budgets are preserved (not overwritten)."
        )) return;
        setSplitting(true);
        try {
            const { data } = await api.post(`/tournaments/${tournament.id}/budget/auto-split`);
            const created = data.created || [];
            const skipped = data.skipped || [];
            const msg = [
                `Auto-Split complete for ${tournament.name}.`,
                `${created.length} draft budget${created.length === 1 ? "" : "s"} created.`,
                skipped.length ? `${skipped.length} skipped (existing budget preserved).` : "",
                created.length ? "\nBreakdown:\n" + created.map((c) => `  · ${c.body_code} (${c.role}) — ${c.budget_no} · ₹${(c.total_inr || 0).toLocaleString("en-IN")}`).join("\n") : "",
            ].filter(Boolean).join("\n");
            alert(msg);
            onChange?.();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setSplitting(false); }
    };

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-5" data-testid="panel-input-variables">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="overline text-[9px]">Input Variables · {type?.name || "Tournament"}</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {usesBackend ? (
                            <>Scheme <span className="text-mpca-brass">{schemeCode}</span> · Auto-Budget Enabled</>
                        ) : (
                            <>Manual budgeting · No auto-calc</>
                        )}
                    </div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1">
                        {usesBackend
                            ? "Change any variable — the budget recalculates instantly. Save to lock the numbers into a draft budget, then submit to MPCA."
                            : "This category uses actuals-based reimbursement. Enter parameters for record; then create a manual budget in the Budget & Extras screen."}
                    </div>
                </div>
                {existingBudget && (
                    <div className="text-right">
                        <div className="overline text-[9px]">Current Budget</div>
                        <div className="font-serif text-xl text-mpca-oxblood" data-testid="iv-existing-budget-total">
                            {fmt(existingBudget.approved_total_inr || existingBudget.total_ceiling_inr)}
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-widest mt-1">
                            {existingBudget.budget_no} ·
                            <span className={`ml-1 ${existingBudget.status === "Approved" ? "text-mpca-green-dark" : existingBudget.status === "Submitted" ? "text-mpca-brass" : "text-mpca-oxblood"}`} data-testid="iv-budget-status">
                                {existingBudget.status}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* MPCA-only banner for non-editable personas */}
            {!canEdit && (
                <div className="border border-mpca-brass/40 bg-mpca-brass/10 text-mpca-brass px-3 py-2 text-[11px] flex items-start gap-2" data-testid="iv-readonly-banner">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <div>
                        <b className="uppercase tracking-widest text-[10px]">MPCA-only</b> · Only MPCA office-bearers (President, Hon. Secretary, Hon. Treasurer) can set the tournament input variables. You are viewing this panel in read-only mode.
                    </div>
                </div>
            )}

            {loadingSpec ? (
                <div className="py-10 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={14} className="inline animate-spin mr-1" /> Loading specification…</div>
            ) : inputVars.length === 0 ? (
                <div className="p-6 border border-dashed border-mpca-brass/40 text-center text-[11px] text-mpca-gray-dark italic">
                    No input variables defined yet for this category.
                </div>
            ) : (
                <>
                    {/* Input grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="iv-input-grid">
                        {inputVars.map((iv) => (
                            <label key={iv.key} className="block" data-testid={`iv-field-${iv.key}`}>
                                <div className="text-[10px] uppercase tracking-widest text-mpca-brass font-mono">
                                    {iv.label}
                                    {iv.unit && <span className="ml-1 text-mpca-gray-dark">({iv.unit})</span>}
                                </div>
                                {iv.type === "select" ? (
                                    <select
                                        className="input-heritage !py-1.5 !text-xs mt-1"
                                        value={values[iv.key] ?? iv.default ?? ""}
                                        onChange={(e) => setField(iv.key, e.target.value)}
                                        disabled={!canEdit || budgetIsLocked}
                                    >
                                        {(iv.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                ) : iv.type === "text" ? (
                                    <input
                                        type="text"
                                        className="input-heritage !py-1.5 !text-xs mt-1"
                                        value={values[iv.key] ?? iv.default ?? ""}
                                        onChange={(e) => setField(iv.key, e.target.value)}
                                        disabled={!canEdit || budgetIsLocked}
                                    />
                                ) : (
                                    <input
                                        type="number"
                                        className="input-heritage !py-1.5 !text-xs mt-1"
                                        value={values[iv.key] ?? iv.default ?? 0}
                                        onChange={(e) => setField(iv.key, e.target.value === "" ? "" : Number(e.target.value))}
                                        disabled={!canEdit || budgetIsLocked}
                                    />
                                )}
                                {iv.hint && <div className="text-[9px] text-mpca-gray-dark italic mt-1">{iv.hint}</div>}
                            </label>
                        ))}
                    </div>

                    {/* Live budget preview */}
                    {usesBackend && (
                        <div className="border border-mpca-brass/40 bg-mpca-parchment/40 p-4" data-testid="iv-budget-preview">
                            <div className="flex items-center justify-between">
                                <div className="overline text-[9px] flex items-center gap-2">
                                    <Calculator size={11} /> Auto-Budget · Live preview {computing && <Loader2 size={11} className="animate-spin ml-1" />}
                                </div>
                                <div className="font-mono text-2xl text-mpca-oxblood" data-testid="iv-computed-total">
                                    {budgetPreview ? fmt(budgetPreview.total_ceiling_inr) : "—"}
                                </div>
                            </div>
                            {budgetPreview && (
                                <div className="mt-2 border border-mpca-brass/20">
                                    {(budgetPreview.head_allocations || []).map((h, i) => (
                                        <div key={i} className="grid grid-cols-12 px-3 py-1.5 text-xs items-center border-b border-mpca-brass/10 last:border-b-0" data-testid={`iv-head-${i}`}>
                                            <div className="col-span-4 font-serif text-mpca-green-dark truncate">{h.head}</div>
                                            <div className="col-span-5 text-[9px] font-mono text-mpca-brass truncate italic">{h.formula}</div>
                                            <div className="col-span-3 text-right font-mono text-mpca-oxblood">{fmt(h.limit_inr)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {budgetIsLocked && (
                                <div className="mt-2 text-[10px] uppercase tracking-widest text-mpca-green-dark bg-mpca-green-dark/10 border border-mpca-green-dark px-2 py-1 flex items-center gap-1">
                                    <AlertTriangle size={10} /> Budget already approved · edit locked
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions — MPCA save/submit strip */}
                    {canEdit && !budgetIsLocked && (
                        <div className="sticky bottom-0 -mx-5 -mb-5 mt-3 px-5 py-3 bg-mpca-green-dark text-mpca-ivory border-t-4 border-mpca-oxblood flex flex-wrap items-center justify-between gap-3" data-testid="iv-action-bar">
                            <div className="text-[11px]">
                                {dirty ? (
                                    <span className="uppercase tracking-widest text-mpca-gold-light">● Unsaved changes — click Save to fill this step</span>
                                ) : Object.keys(tournament.input_variables || {}).length > 0 ? (
                                    <span className="uppercase tracking-widest text-mpca-green-light">✓ Input variables saved</span>
                                ) : (
                                    <span className="uppercase tracking-widest text-mpca-ivory/70">Fill the variables above, then click Save Input Variables</span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={saveAndUpsertBudget}
                                    disabled={saving || (usesBackend && !budgetPreview)}
                                    className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-2 flex items-center gap-1 disabled:opacity-40 hover:bg-mpca-burgundy-dark transition-colors border border-mpca-oxblood"
                                    data-testid="iv-save-btn"
                                >
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                    Save Input Variables{existingBudget ? " & Update Budget" : " & Create Draft Budget"}
                                </button>
                                {usesBackend && (
                                    <button
                                        onClick={runAutoSplit}
                                        disabled={splitting || saving || !budgetPreview}
                                        className="text-[11px] uppercase tracking-widest bg-mpca-ivory/10 text-mpca-gold-light px-4 py-2 flex items-center gap-1 disabled:opacity-40 hover:bg-mpca-ivory/20 transition-colors border border-mpca-gold-light/50"
                                        data-testid="iv-auto-split-btn"
                                        title="Create per-body sub-budgets: Host gets full hosting scheme, Visitors get travel+DA subsidy only."
                                    >
                                        {splitting ? <Loader2 size={12} className="animate-spin" /> : <Split size={12} />}
                                        Auto-Split Budget
                                    </button>
                                )}
                                {existingBudget && ["Draft", "Returned"].includes(existingBudget.status) && (
                                    <button
                                        onClick={submitBudget}
                                        disabled={submitting || dirty}
                                        className="text-[11px] uppercase tracking-widest bg-mpca-gold-light text-mpca-green-dark px-4 py-2 flex items-center gap-1 disabled:opacity-40 hover:bg-mpca-gold transition-colors border border-mpca-gold-light"
                                        data-testid="iv-submit-budget-btn"
                                        title={dirty ? "Save changes before submitting" : "Send to MPCA Treasurer for approval"}
                                    >
                                        {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                        Submit Budget to MPCA
                                        <ChevronRight size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default InputVariablesPanel;
