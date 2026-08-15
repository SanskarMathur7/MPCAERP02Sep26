/**
 * TournamentOps.jsx — Phase T1-T4 operations panel embedded in TournamentDetail.
 * Tabs: Plan · Budget & Tracker · Invoices (AI) · DA Forms
 */
import { useEffect, useMemo, useState, useRef } from "react";
import {
    getTournamentPlan, saveTournamentPlan, previewAutoBudget,
    submitTournamentPlan, approveTournamentPlan, returnTournamentPlan,
    fetchGrantRates, fetchBudgetTracker, fetchTournamentBudgets,
    fetchTournamentInvoices, createTournamentInvoice, aiExtractInvoice,
    submitTournamentInvoice, approveTournamentInvoice, rejectTournamentInvoice,
    updateTournamentInvoice, bulkSubmitTournamentInvoices, bulkApproveTournamentInvoices,
    bulkSubmitExtraExpenses, bulkApproveExtraExpenses,
    fetchDAForms, updateDAForm, submitDAForm, approveDAForm, rejectDAForm, rebuildDAForms,
    fetchExtraExpenseRequests, createExtraExpenseRequest, submitExtraExpenseRequest,
    approveExtraExpenseRequest, rejectExtraExpenseRequest, requestInfoOnExtraExpense,
    fetchTournamentExpenseEvents,
} from "@/lib/api";
import { api } from "@/lib/api";
import {
    ClipboardList, IndianRupee, FileText, Users, Save, Send, CheckCircle2, X,
    Sparkles, Upload, AlertTriangle, Loader2, ArrowUpRight, RotateCcw,
    Plus, HelpCircle, ScrollText, Gavel, Trash2,
} from "lucide-react";
import WorkflowTimeline from "@/components/WorkflowTimeline";

const API = process.env.REACT_APP_BACKEND_URL;
const fmtINR = (v) => `₹${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const PLAN_META = {
    Draft:            { tone: "lapsed",    label: "Draft" },
    Plan_Submitted:   { tone: "pending",   label: "Submitted · Awaits MPCA" },
    Plan_Approved:    { tone: "active",    label: "Plan Approved" },
    Plan_Returned:    { tone: "suspended", label: "Returned for Revision" },
    Plan_Rejected:    { tone: "suspended", label: "Rejected" },
};

const Pill = ({ tone, label, testId }) => {
    const map = { active: "pill pill-active", pending: "pill pill-pending", suspended: "pill pill-suspended", lapsed: "pill pill-lapsed" };
    return <span className={map[tone] || "pill pill-lapsed"} data-testid={testId}>{label}</span>;
};

// ═══════════════════ Plan Tab ═══════════════════
const PlanTab = ({ tournament, persona, onChanged }) => {
    const initial = tournament.plan || {
        days: (tournament.plan_status === "Draft" ? 0 : 0),
        num_teams: 10, num_players_per_team: 18, num_match_officials: 6,
        num_umpires: 4, num_scorers: 2, match_days: 0, venue_place: tournament.venue || "",
        from_date: tournament.start_date || "", to_date: tournament.end_date || "",
        remarks: "",
    };
    const [plan, setPlan] = useState(initial);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const status = tournament.plan_status || "Draft";
    const meta = PLAN_META[status];
    const isDivision = persona?.body_type === "Division";
    const isMPCA = persona?.body_type === "State";
    const editable = ["Draft", "Plan_Returned"].includes(status);
    const canSubmit = editable && isDivision;
    const canApprove = status === "Plan_Submitted" && isMPCA;

    const save = async () => {
        setBusy(true); setError(null);
        try {
            await saveTournamentPlan(tournament.id, plan);
            const p = await previewAutoBudget(tournament.id);
            setPreview(p);
            onChanged();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const doPreview = async () => {
        setBusy(true); setError(null);
        try {
            await saveTournamentPlan(tournament.id, plan);
            const p = await previewAutoBudget(tournament.id);
            setPreview(p);
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const submit = async () => {
        if (!window.confirm("Submit plan to MPCA for approval? A budget will be auto-generated from the Grant Scheme rate card.")) return;
        setBusy(true); setError(null);
        try {
            await submitTournamentPlan(tournament.id, {
                actor_name: persona?.display_name || "Division", actor_body_id: persona?.body_code || "DIV",
                actor_post: persona?.role_label || "Division Secretary",
            });
            onChanged();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const approve = async () => {
        if (!window.confirm("Approve plan + auto-budget? Tournament will move to Upcoming and DA forms will be pre-built.")) return;
        setBusy(true);
        try {
            await approveTournamentPlan(tournament.id, {
                actor_name: persona?.display_name || "MPCA", actor_body_id: persona?.body_code || "MPCA",
                actor_post: persona?.role_label || "Hon. Secretary",
            });
            onChanged();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const returnToDiv = async () => {
        const notes = window.prompt("Return reason (required):"); if (!notes) return;
        try {
            await returnTournamentPlan(tournament.id, { actor_name: persona?.display_name || "MPCA", actor_body_id: "MPCA", notes });
            onChanged();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // Inline input helper; extracted to a static component to keep React reconciliation stable.
    const inputProps = (k) => ({
        value: plan[k] ?? "",
        disabled: !editable,
        "data-testid": `plan-${k}`,
        className: "input-heritage",
    });

    return (
        <div className="space-y-6" data-testid="plan-tab">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">Tournament Plan Submission</div>
                    <p className="text-sm text-mpca-gray-dark mt-1 max-w-2xl">
                        Division fills the plan → auto-budget is generated from Grant Scheme rate card → MPCA approves plan + budget → tournament goes live.
                    </p>
                </div>
                <Pill tone={meta.tone} label={meta.label} testId={`plan-status-${status}`} />
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="label-heritage">Tournament Days *</label>
                    <input type="number" {...inputProps("days")} onChange={(e) => setPlan((p) => ({ ...p, days: parseInt(e.target.value) || 0 }))} /></div>
                <div><label className="label-heritage">Match Days</label>
                    <input type="number" {...inputProps("match_days")} onChange={(e) => setPlan((p) => ({ ...p, match_days: parseInt(e.target.value) || 0 }))} /></div>
                <div><label className="label-heritage">No. of Teams *</label>
                    <input type="number" {...inputProps("num_teams")} onChange={(e) => setPlan((p) => ({ ...p, num_teams: parseInt(e.target.value) || 0 }))} /></div>
                <div><label className="label-heritage">Players per Team</label>
                    <input type="number" {...inputProps("num_players_per_team")} onChange={(e) => setPlan((p) => ({ ...p, num_players_per_team: parseInt(e.target.value) || 0 }))} /></div>
                <div><label className="label-heritage">Match Officials *</label>
                    <input type="number" {...inputProps("num_match_officials")} onChange={(e) => setPlan((p) => ({ ...p, num_match_officials: parseInt(e.target.value) || 0 }))} /></div>
                <div><label className="label-heritage">Umpires</label>
                    <input type="number" {...inputProps("num_umpires")} onChange={(e) => setPlan((p) => ({ ...p, num_umpires: parseInt(e.target.value) || 0 }))} /></div>
                <div><label className="label-heritage">Scorers</label>
                    <input type="number" {...inputProps("num_scorers")} onChange={(e) => setPlan((p) => ({ ...p, num_scorers: parseInt(e.target.value) || 0 }))} /></div>
                <div>
                    <label className="label-heritage">Venue / Place</label>
                    <input value={plan.venue_place || ""} disabled={!editable} onChange={(e) => setPlan((p) => ({ ...p, venue_place: e.target.value }))} className="input-heritage" data-testid="plan-venue" />
                </div>
                <div>
                    <label className="label-heritage">From Date</label>
                    <input type="date" value={plan.from_date || ""} disabled={!editable} onChange={(e) => setPlan((p) => ({ ...p, from_date: e.target.value }))} className="input-heritage" data-testid="plan-from" />
                </div>
                <div>
                    <label className="label-heritage">To Date</label>
                    <input type="date" value={plan.to_date || ""} disabled={!editable} onChange={(e) => setPlan((p) => ({ ...p, to_date: e.target.value }))} className="input-heritage" data-testid="plan-to" />
                </div>
                <div className="sm:col-span-2 md:col-span-4">
                    <label className="label-heritage">Remarks</label>
                    <textarea rows={2} value={plan.remarks || ""} disabled={!editable} onChange={(e) => setPlan((p) => ({ ...p, remarks: e.target.value }))} className="input-heritage" />
                </div>
            </div>

            {preview && (
                <div className="border border-mpca-brass/40 p-5 bg-mpca-parchment/30" data-testid="plan-preview">
                    <div className="flex items-center justify-between mb-3">
                        <div className="overline flex items-center gap-2"><IndianRupee size={12} /> Auto-Budget Preview</div>
                        <div className="font-serif text-2xl text-mpca-green-dark">{fmtINR(preview.total_inr)}</div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        {preview.heads.map((h) => (
                            <div key={h.head} className="flex justify-between border-b border-mpca-brass/15 py-1">
                                <span className="text-mpca-charcoal">{h.head}</span>
                                <span className="font-mono text-mpca-green-dark">{fmtINR(h.limit_inr)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {error && <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-sm">{error}</div>}

            <div className="flex flex-wrap gap-3">
                {editable && (
                    <>
                        <button onClick={save} disabled={busy} className="btn-heritage-ghost" data-testid="plan-save">
                            <Save size={12} /> Save Draft
                        </button>
                        <button onClick={doPreview} disabled={busy} className="btn-heritage-secondary" data-testid="plan-preview-btn">
                            <IndianRupee size={12} /> Preview Auto-Budget
                        </button>
                        {canSubmit && (
                            <button onClick={submit} disabled={busy} className="btn-heritage-primary" data-testid="plan-submit">
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Submit for MPCA Approval
                            </button>
                        )}
                    </>
                )}
                {canApprove && (
                    <>
                        <button onClick={approve} disabled={busy} className="btn-heritage-primary" data-testid="plan-approve">
                            <CheckCircle2 size={12} /> Approve Plan + Budget
                        </button>
                        <button onClick={returnToDiv} disabled={busy} className="btn-heritage-secondary !border-mpca-oxblood !text-mpca-oxblood" data-testid="plan-return">
                            <RotateCcw size={12} /> Return with Notes
                        </button>
                    </>
                )}
            </div>

            {tournament.plan_approval_chain?.length > 0 && (
                <div>
                    <div className="overline mb-2">Approval Trail</div>
                    <WorkflowTimeline chain={tournament.plan_approval_chain} testId="plan-approval-timeline" />
                </div>
            )}
        </div>
    );
};

// ═══════════════════ Budget Tracker Tab ═══════════════════
const BudgetTab = ({ tournament }) => {
    const [tracker, setTracker] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!tournament.auto_budget_id) { setLoading(false); return; }
        fetchBudgetTracker(tournament.auto_budget_id).then((t) => { setTracker(t); setLoading(false); }).catch(() => setLoading(false));
    }, [tournament.auto_budget_id]);
    if (!tournament.auto_budget_id) return <div className="p-8 text-center text-mpca-gray-dark italic" data-testid="no-budget">No budget yet — submit the Plan first.</div>;
    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin inline" size={16} /> Loading tracker…</div>;
    if (!tracker) return <div className="p-8 text-center">No tracker data.</div>;
    const totals = tracker.totals;
    return (
        <div className="space-y-6" data-testid="budget-tab">
            <div className="grid sm:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20" data-testid="budget-totals">
                {[
                    ["Approved", totals.approved_inr],
                    ["Spent", totals.spent_inr],
                    ["Remaining", totals.remaining_inr],
                    ["Over-Budget", totals.over_budget_inr],
                ].map(([l, v]) => (
                    <div key={l} className="bulletin-card p-5 border-0 rounded-none">
                        <div className="overline">{l}</div>
                        <div className={"font-serif text-2xl mt-2 " + (l === "Over-Budget" && v > 0 ? "text-mpca-oxblood" : "text-mpca-green-dark")}>
                            {fmtINR(v)}
                        </div>
                    </div>
                ))}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="budget-tracker-table">
                    <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                        <tr>
                            {["Head", "Limit", "Spent", "Remaining", "Over", "Util %"].map((h) => (
                                <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-mpca-brass">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tracker.heads.map((h) => {
                            const over = h.over_budget_inr > 0;
                            return (
                                <tr key={h.head_code} className={"border-b border-mpca-brass/20 " + (over ? "bg-mpca-oxblood/5" : "")} data-testid={`bhead-${h.head_code}`}>
                                    <td className="px-4 py-2 font-serif text-mpca-green-dark">
                                        {h.head}
                                        {over && <span className="ml-2 text-[9px] uppercase tracking-widest text-mpca-oxblood font-semibold">Ineligible for grant</span>}
                                    </td>
                                    <td className="px-4 py-2 font-mono">{fmtINR(h.limit_inr)}</td>
                                    <td className="px-4 py-2 font-mono">{fmtINR(h.spent_inr)}</td>
                                    <td className="px-4 py-2 font-mono">{fmtINR(h.remaining_inr)}</td>
                                    <td className={"px-4 py-2 font-mono " + (over ? "text-mpca-oxblood font-semibold" : "text-mpca-gray-dark")}>{over ? fmtINR(h.over_budget_inr) : "—"}</td>
                                    <td className="px-4 py-2">
                                        <div className="w-24 h-2 bg-mpca-parchment relative overflow-hidden">
                                            <div className={"absolute inset-y-0 left-0 " + (over ? "bg-mpca-oxblood" : "bg-mpca-green-dark")} style={{ width: Math.min(h.utilisation_pct, 100) + "%" }} />
                                        </div>
                                        <div className="text-[10px] font-mono mt-1">{h.utilisation_pct}%</div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ═══════════════════ Invoices Tab (with AI extractor) ═══════════════════
// MPCA-124 · Exported so the Tournament Finance Console renders this rich
// upload UI directly on its Invoices tab (previously showed a read-only
// summary that redirected to a broken URL).
// Sprint T-RIM · Single invoice can now be set off against multiple budget
// heads. Head dropdown is filtered to only the approved budget line-items
// for THIS tournament + spending body.
export const InvoicesTab = ({ tournament, persona, onChanged }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [editing, setEditing] = useState(null);                 // MPCA-201 · invoice being edited
    const [selected, setSelected] = useState({});                 // MPCA-201 · id → true
    const [aiExtracting, setAiExtracting] = useState(false);
    const [aiPreview, setAiPreview] = useState(null);
    const [approvedBudget, setApprovedBudget] = useState(null);
    // MPCA-234 · Multi-pool: expose ALL approved budgets so Divisions can pick
    // which one an invoice belongs to at upload time.
    const [approvedBudgets, setApprovedBudgets] = useState([]);
    const [selectedBudgetId, setSelectedBudgetId] = useState("");
    const [activeClaim, setActiveClaim] = useState(null);         // MPCA-201 · lock flag
    const emptyForm = () => ({
        vendor_name: "", invoice_no: "", invoice_date: "",
        amount_inr: 0, gst_inr: 0, total_inr: 0,
        allocations: [{ head_code: "", head_label: "", amount_inr: 0 }],
        file_url: "", filename: "", ai_extracted: false,
        budget_id: "",   // MPCA-234 · which budget this invoice claims against
    });
    const [form, setForm] = useState(emptyForm());
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Master label ↔ code map (mirrors backend HEAD_CODE_TO_LABEL)
    const HEAD_CODE_TO_LABEL = {
        MATCH_OFFICIAL_DA:     "Match Official DA",
        MATCH_OFFICIAL_TRAVEL: "Match Official Travel",
        PLAYER_DA_FOOD:        "Player DA / Food",
        PLAYER_TRAVEL:         "Player Travel",
        PLAYER_STAY:           "Player Stay (Hotel)",
        GROUND_FEES:           "Ground Fees",
        KIT_CONSUMABLES:       "Balls / Kit Consumables",
        UMPIRE_HONORARIUM:     "Umpire Honorarium",
        SCORER_HONORARIUM:     "Scorer Honorarium",
        PHYSIO_HONORARIUM:     "Physio Honorarium",
        CONTINGENCY:           "Contingency",
    };
    const labelToCode = (label) => {
        const entry = Object.entries(HEAD_CODE_TO_LABEL).find(([, l]) => l === label);
        return entry ? entry[0] : (label || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    };

    // Keep budgetHeads reactive to the currently-selected budget.
    useEffect(() => {
        if (!selectedBudgetId) return;
        const b = approvedBudgets.find((x) => x.id === selectedBudgetId);
        if (b) {
            setApprovedBudget(b);
            setForm((f) => ({ ...f, budget_id: b.id }));
        }
    }, [selectedBudgetId, approvedBudgets]);

    // Approved budget heads → options for the dropdown. Falls back to empty list.
    const budgetHeads = useMemo(() => {
        if (!approvedBudget) return [];
        const heads = approvedBudget.approved_head_allocations?.length
            ? approvedBudget.approved_head_allocations
            : (approvedBudget.head_allocations || []);
        return heads
            .filter((h) => (h.limit_inr || 0) > 0)
            .map((h) => ({
                code: labelToCode(h.head),
                label: h.head,
                limit_inr: h.limit_inr || 0,
            }));
    }, [approvedBudget]);

    const load = async () => {
        setLoading(true);
        try {
            const [inv, budgets] = await Promise.all([
                fetchTournamentInvoices({ tournament_id: tournament.id }),
                fetchTournamentBudgets({
                    tournament_id: tournament.id,
                    body_id: persona?.body_code,
                    status: "Approved",
                }).catch(() => []),
            ]);
            setInvoices(inv);
            const list = budgets || [];
            setApprovedBudgets(list);
            // Prefer keeping the current selection if still valid, else pick first.
            const stillValid = list.find((b) => b.id === selectedBudgetId);
            const active = stillValid || list[0] || null;
            setApprovedBudget(active);
            setSelectedBudgetId(active?.id || "");
            // MPCA-201 · detect active reimbursement claim (Division-side lock).
            try {
                const claims = await api.get("/reimbursement-claims", { params: {
                    tournament_id: tournament.id, body_id: persona?.body_code,
                } }).then((r) => r.data).catch(() => []);
                const locked = (claims || []).find((c) => ["Submitted", "Under_Review", "Approved"].includes(c.status));
                setActiveClaim(locked || null);
            } catch { setActiveClaim(null); }
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [tournament.id, persona?.body_code]);

    const canAdd = persona && (persona.body_type === "State" || persona.body_type === "Division" || persona.body_type === "District");

    const uploadAndExtract = async (file) => {
        setAiExtracting(true); setAiPreview(null); setError(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "tournament_invoice");
            fd.append("related_id", tournament.id);
            const res = await fetch(`${API}/api/uploads`, { method: "POST", body: fd });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Upload failed`);
            const rec = await res.json();
            const preview = await aiExtractInvoice(rec.url);
            setAiPreview(preview.ai_extraction);
            const aiHeadCode = preview.prefill.budget_head_code || "";
            const aiTotal = preview.prefill.total_inr || 0;
            // Seed the first allocation with AI-suggested head ONLY if that head
            // is present in the tournament's approved budget; otherwise blank.
            const matched = budgetHeads.find((h) => h.code === aiHeadCode);
            setForm((f) => ({
                ...f,
                file_url: rec.url,
                filename: rec.original_name,
                vendor_name: preview.prefill.vendor_name || f.vendor_name,
                invoice_no: preview.prefill.invoice_no || f.invoice_no,
                invoice_date: preview.prefill.invoice_date || f.invoice_date,
                amount_inr: preview.prefill.amount_inr || 0,
                gst_inr: preview.prefill.gst_inr || 0,
                total_inr: aiTotal,
                allocations: [{
                    head_code: matched?.code || "",
                    head_label: matched?.label || "",
                    amount_inr: matched ? aiTotal : 0,
                }],
                ai_extracted: true,
            }));
        } catch (e) { setError(e.message); }
        finally { setAiExtracting(false); if (inputRef.current) inputRef.current.value = ""; }
    };

    // Derived totals for the allocations block
    const invoiceTotal = useMemo(
        () => parseFloat(form.total_inr) || (parseFloat(form.amount_inr) + parseFloat(form.gst_inr)) || 0,
        [form.total_inr, form.amount_inr, form.gst_inr]
    );
    const allocSum = useMemo(
        () => (form.allocations || []).reduce((s, a) => s + (parseFloat(a.amount_inr) || 0), 0),
        [form.allocations]
    );
    const allocDelta = round2(invoiceTotal - allocSum);
    const allocMismatch = Math.abs(allocDelta) > 0.5;
    const allHeadsPicked = (form.allocations || []).every((a) => a.head_code);

    const updateAllocation = (idx, patch) => {
        setForm((f) => {
            const next = [...f.allocations];
            next[idx] = { ...next[idx], ...patch };
            return { ...f, allocations: next };
        });
    };
    const addAllocation = () => setForm((f) => ({
        ...f,
        allocations: [...f.allocations, { head_code: "", head_label: "", amount_inr: 0 }],
    }));
    const removeAllocation = (idx) => setForm((f) => ({
        ...f,
        allocations: f.allocations.filter((_, i) => i !== idx),
    }));

    // MPCA-201 · Division-side lock once claim is Submitted/Under_Review/Approved.
    const isDivisionScope = persona?.body_type === "Division" || persona?.body_type === "District";
    const isStateScope = persona?.body_type === "State";
    const locked = !!activeClaim && isDivisionScope;

    const selectedIds = Object.keys(selected).filter((k) => selected[k]);
    const toggleSel = (id) => setSelected((m) => ({ ...m, [id]: !m[id] }));

    // Group by body for MPCA bulk-approve buttons
    const invoicesByBody = useMemo(() => {
        const g = {};
        for (const i of invoices) {
            if (!g[i.body_id]) g[i.body_id] = { body_id: i.body_id, body_name: i.body_name || i.body_id, rows: [] };
            g[i.body_id].rows.push(i);
        }
        return Object.values(g);
    }, [invoices]);

    const draftRejected = invoices.filter((i) => ["Draft", "Rejected"].includes(i.status));

    const bulkSubmit = async () => {
        setBusy(true); setError(null);
        try {
            const ids = selectedIds.length ? selectedIds : draftRejected.map((i) => i.id);
            if (!ids.length) throw new Error("No draft/rejected invoices to submit.");
            await bulkSubmitTournamentInvoices({ ids });
            setSelected({});
            await load(); onChanged?.();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const bulkApproveBody = async (bodyId) => {
        setBusy(true); setError(null);
        try {
            await bulkApproveTournamentInvoices({ tournament_id: tournament.id, body_id: bodyId });
            await load(); onChanged?.();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const beginEdit = (inv) => {
        setEditing(inv);
        setForm({
            vendor_name: inv.vendor_name || "", invoice_no: inv.invoice_no || "",
            invoice_date: inv.invoice_date || "",
            amount_inr: inv.amount_inr || 0, gst_inr: inv.gst_inr || 0, total_inr: inv.total_inr || 0,
            allocations: (inv.allocations && inv.allocations.length)
                ? inv.allocations.map((a) => ({ head_code: a.head_code, head_label: a.head_label, amount_inr: a.amount_inr }))
                : [{ head_code: inv.budget_head_code || "", head_label: HEAD_CODE_TO_LABEL[inv.budget_head_code] || "", amount_inr: inv.total_inr || 0 }],
            file_url: inv.file_url || "", filename: inv.filename || "", ai_extracted: inv.ai_extracted || false,
        });
        setAddOpen(true);
    };

    const saveEdit = async () => {
        setBusy(true); setError(null);
        try {
            const total = round2(invoiceTotal);
            const cleanedAllocs = (form.allocations || [])
                .filter((a) => a.head_code)
                .map((a) => ({
                    head_code: a.head_code,
                    head_label: a.head_label || HEAD_CODE_TO_LABEL[a.head_code] || a.head_code,
                    amount_inr: parseFloat(a.amount_inr) || 0,
                }));
            if (!cleanedAllocs.length) throw new Error("Pick at least one budget head.");
            const sum = round2(cleanedAllocs.reduce((s, a) => s + a.amount_inr, 0));
            if (Math.abs(sum - total) > 0.5)
                throw new Error(`Sum of head allocations (₹${sum.toLocaleString("en-IN")}) must equal total (₹${total.toLocaleString("en-IN")}).`);
            await updateTournamentInvoice(editing.id, {
                vendor_name: form.vendor_name, invoice_no: form.invoice_no, invoice_date: form.invoice_date,
                amount_inr: parseFloat(form.amount_inr) || 0, gst_inr: parseFloat(form.gst_inr) || 0,
                total_inr: total, allocations: cleanedAllocs, budget_head_code: cleanedAllocs[0].head_code,
            });
            setEditing(null); setAddOpen(false); setForm(emptyForm()); setAiPreview(null);
            await load(); onChanged?.();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const save = async () => {
        setBusy(true); setError(null);
        try {
            const total = round2(invoiceTotal);
            const cleanedAllocs = (form.allocations || [])
                .filter((a) => a.head_code)
                .map((a) => ({
                    head_code: a.head_code,
                    head_label: a.head_label || HEAD_CODE_TO_LABEL[a.head_code] || a.head_code,
                    amount_inr: parseFloat(a.amount_inr) || 0,
                }));
            if (!cleanedAllocs.length) throw new Error("Pick at least one budget head to set off this invoice against.");
            const sum = round2(cleanedAllocs.reduce((s, a) => s + a.amount_inr, 0));
            if (Math.abs(sum - total) > 0.5)
                throw new Error(`Sum of head allocations (₹${sum.toLocaleString("en-IN")}) must equal invoice total (₹${total.toLocaleString("en-IN")}).`);

            await createTournamentInvoice({
                tournament_id: tournament.id,
                body_id: persona?.body_code || "MPCA",
                // MPCA-234 · Explicit budget picker when a Division has 2+ approved
                // budgets on the same tournament (Host in one pool + Visitor in another).
                budget_id: selectedBudgetId || approvedBudget?.id,
                vendor_name: form.vendor_name,
                invoice_no: form.invoice_no,
                invoice_date: form.invoice_date,
                amount_inr: parseFloat(form.amount_inr) || 0,
                gst_inr: parseFloat(form.gst_inr) || 0,
                total_inr: total,
                file_url: form.file_url,
                filename: form.filename,
                ai_extracted: form.ai_extracted,
                allocations: cleanedAllocs,
                budget_head_code: cleanedAllocs[0].head_code, // legacy compat
            });
            setAddOpen(false); setAiPreview(null);
            setForm(emptyForm());
            await load(); onChanged?.();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-6" data-testid="invoices-tab">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">Tournament Invoices · AI-Extracted</div>
                    <p className="text-sm text-mpca-gray-dark mt-1 max-w-2xl">
                        Upload vendor invoices — Gemini extracts vendor/date/amount/GST. Any amount over the sanctioned head becomes <strong>ineligible for grant</strong>.
                    </p>
                </div>
                {canAdd && (
                    <div className="flex items-center gap-2">
                        {isStateScope && invoicesByBody.length > 0 && (
                            <select
                                onChange={(e) => { if (e.target.value) { bulkApproveBody(e.target.value); e.target.value = ""; } }}
                                className="input-heritage !py-1.5 !text-xs !w-auto"
                                defaultValue=""
                                data-testid="bulk-approve-body-select"
                            >
                                <option value="">— Bulk Approve by Body —</option>
                                {invoicesByBody.filter((g) => g.rows.some((r) => r.status === "Submitted")).map((g) => {
                                    const n = g.rows.filter((r) => r.status === "Submitted").length;
                                    return <option key={g.body_id} value={g.body_id}>{g.body_name} · Approve {n} Submitted</option>;
                                })}
                            </select>
                        )}
                        {isDivisionScope && !locked && draftRejected.length > 0 && (
                            <button
                                onClick={bulkSubmit}
                                disabled={busy}
                                className="text-[10px] uppercase tracking-widest border-2 border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory px-3 py-1.5 disabled:opacity-40"
                                data-testid="bulk-submit-invoices-btn"
                            >
                                <Send size={11} className="inline mr-1" />
                                Submit {selectedIds.length ? `${selectedIds.length} Selected` : `All ${draftRejected.length}`} to MPCA
                            </button>
                        )}
                        <button
                            onClick={() => { setEditing(null); setForm(emptyForm()); setAddOpen(true); }}
                            disabled={budgetHeads.length === 0 || locked}
                            title={locked ? `Locked · claim ${activeClaim.claim_ref} is ${activeClaim.status}` : (budgetHeads.length === 0 ? "This tournament has no approved budget yet — invoices can only be added after MPCA sanctions the budget." : "")}
                            className="btn-heritage-primary disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid="add-invoice-btn"
                        >
                            <Upload size={12} /> Upload Invoice
                        </button>
                    </div>
                )}
            </div>

            {locked && (
                <div className="border-2 border-mpca-oxblood bg-mpca-oxblood/5 p-3 text-xs text-mpca-oxblood flex items-start gap-2" data-testid="invoices-locked-banner">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <div>
                        <strong>Finance Console Locked.</strong> Reimbursement claim <span className="font-mono">{activeClaim.claim_ref}</span> is <em>{activeClaim.status.replace("_", " ")}</em> with MPCA — all invoices are frozen. Ask MPCA to reject the claim if you need to edit or add invoices.
                    </div>
                </div>
            )}

            {budgetHeads.length === 0 && canAdd && (
                <div className="border border-mpca-brass/40 bg-mpca-parchment/40 p-3 text-xs text-mpca-gray-dark" data-testid="no-approved-budget-msg">
                    <AlertTriangle size={12} className="inline mr-1 text-mpca-oxblood" />
                    No <strong>approved budget</strong> found for {persona?.body_code || "this body"} on this tournament yet. Invoices can only be logged after MPCA sanctions the budget.
                </div>
            )}

            {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin inline" /></div> : (
                invoices.length === 0 ? (
                    <div className="p-10 border border-mpca-brass/30 text-center text-mpca-gray-dark italic font-serif" data-testid="no-invoices">
                        No invoices yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="invoices-table">
                            <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                                <tr>
                                    {isDivisionScope && !locked && <th className="px-2 py-3 w-8"></th>}
                                    {["Ref", "Vendor", "Head(s)", "Date", "Amount", "GST", "Total", "Eligible", "Status"].map((h) => (
                                        <th key={h} className="text-left px-3 py-3 text-[11px] uppercase tracking-wider text-mpca-brass">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((i) => {
                                    const over = i.over_budget_amount_inr > 0;
                                    const allocs = (i.allocations && i.allocations.length) ? i.allocations : null;
                                    const canEditRow = isDivisionScope && !locked;
                                    return (
                                        <tr key={i.id} className={"border-b border-mpca-brass/20 " + (over ? "bg-mpca-oxblood/5" : "")} data-testid={`inv-row-${i.invoice_ref}`}>
                                            {isDivisionScope && !locked && (
                                                <td className="px-2 py-2 text-center">
                                                    {["Draft", "Rejected"].includes(i.status) && (
                                                        <input type="checkbox" checked={!!selected[i.id]} onChange={() => toggleSel(i.id)} data-testid={`inv-select-${i.invoice_ref}`} />
                                                    )}
                                                </td>
                                            )}
                                            <td className="px-3 py-2 font-mono text-[10px]">{i.invoice_ref}
                                                {i.ai_extracted && <span title="AI extracted"><Sparkles size={10} className="inline ml-1 text-mpca-oxblood" /></span>}
                                                {i.manually_overridden && <span className="ml-1 text-[9px] text-mpca-brass">EDITED</span>}
                                            </td>
                                            <td className="px-3 py-2">{i.vendor_name || "—"}</td>
                                            <td className="px-3 py-2 text-[11px]">
                                                {allocs ? (
                                                    <div className="space-y-0.5" data-testid={`inv-heads-${i.invoice_ref}`}>
                                                        {allocs.map((a, idx) => (
                                                            <div key={idx} className="flex items-baseline gap-1">
                                                                <span>{a.head_label || HEAD_CODE_TO_LABEL[a.head_code] || a.head_code}</span>
                                                                <span className="font-mono text-[10px] text-mpca-brass">· {fmtINR(a.amount_inr)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (HEAD_CODE_TO_LABEL[i.budget_head_code] || "—")}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-[11px]">{i.invoice_date || "—"}</td>
                                            <td className="px-3 py-2 font-mono">{fmtINR(i.amount_inr)}</td>
                                            <td className="px-3 py-2 font-mono">{fmtINR(i.gst_inr)}</td>
                                            <td className="px-3 py-2 font-mono font-semibold">{fmtINR(i.total_inr)}</td>
                                            <td className="px-3 py-2 font-mono">
                                                <span className="text-mpca-green-dark">{fmtINR(i.eligible_for_grant_inr)}</span>
                                                {over && <div className="text-[10px] text-mpca-oxblood">−{fmtINR(i.ineligible_for_grant_inr)}</div>}
                                            </td>
                                            <td className="px-3 py-2">
                                                <Pill tone={i.status === "Approved" ? "active" : i.status === "Rejected" ? "suspended" : "pending"} label={i.status} />
                                                {canEditRow && (
                                                    <button onClick={() => beginEdit(i)} className="block text-[9px] uppercase text-mpca-navy underline mt-1" data-testid={`inv-edit-${i.invoice_ref}`}>edit</button>
                                                )}
                                                {i.status === "Draft" && (
                                                    <button onClick={async () => { await submitTournamentInvoice(i.id); await load(); }} className="block text-[9px] uppercase text-mpca-oxblood underline mt-1" data-testid={`inv-submit-${i.invoice_ref}`}>submit</button>
                                                )}
                                                {i.status === "Submitted" && persona?.body_type === "State" && (
                                                    <div className="flex gap-1 mt-1">
                                                        <button onClick={async () => { await approveTournamentInvoice(i.id); await load(); onChanged?.(); }} className="text-[9px] uppercase text-mpca-green-dark underline" data-testid={`inv-approve-${i.invoice_ref}`}>approve</button>
                                                        <button onClick={async () => { const r = window.prompt("Rejection reason:"); if (r) { await rejectTournamentInvoice(i.id, r); await load(); } }} className="text-[9px] uppercase text-mpca-oxblood underline">reject</button>
                                                    </div>
                                                )}
                                                {i.file_url && <a href={`${API}${i.file_url}`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-mpca-brass underline block mt-1">view file</a>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {addOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 overflow-y-auto" data-testid="new-invoice-dialog">
                    <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full my-8">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                            <div>
                                <div className="overline !text-mpca-gold-light">{editing ? "Edit Invoice" : "New Invoice"}</div>
                                <div className="font-serif text-2xl mt-1">{editing ? `Edit · ${editing.invoice_ref}` : "Upload & AI-Extract"}</div>
                            </div>
                            <button onClick={() => { setAddOpen(false); setEditing(null); setForm(emptyForm()); setAiPreview(null); }}><X className="text-mpca-gold-light" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* MPCA-234 · Budget picker for multi-pool tournaments */}
                            {approvedBudgets.length > 1 && (
                                <div className="border-2 border-mpca-oxblood/40 bg-mpca-oxblood/5 p-3" data-testid="inv-budget-picker">
                                    <label className="label-heritage flex items-center gap-2 mb-2">
                                        Which budget does this invoice claim against?
                                        <span className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-0.5">Multi-pool tournament</span>
                                    </label>
                                    <select
                                        className="input-heritage w-full"
                                        value={selectedBudgetId}
                                        onChange={(e) => setSelectedBudgetId(e.target.value)}
                                        disabled={!!editing}
                                        data-testid="inv-budget-select"
                                    >
                                        {approvedBudgets.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.budget_no} · {b.pool_name || "—"} · {b.role_flavour || "—"} · ₹{Number(b.total_ceiling_inr || 0).toLocaleString("en-IN")}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="text-[10px] text-mpca-gray-dark mt-1 italic">
                                        The head list below changes based on the selected budget. Invoice will be tagged with this budget for MPCA reconciliation.
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="label-heritage">Invoice File (PDF / JPG / PNG)</label>
                                <button
                                    type="button" onClick={() => inputRef.current?.click()} disabled={aiExtracting}
                                    className="w-full border-2 border-dashed border-mpca-brass/40 hover:border-mpca-oxblood py-4 text-mpca-green-dark text-sm flex items-center justify-center gap-2"
                                    data-testid="inv-upload-btn"
                                >
                                    {aiExtracting ? <><Loader2 size={14} className="animate-spin" /> AI extracting…</> :
                                     form.file_url ? <><Sparkles size={14} /> {form.filename || "Attached"} · click to replace</> :
                                     <><Upload size={14} /> Click to upload & AI extract</>}
                                </button>
                                <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndExtract(f); }} />
                            </div>

                            {aiPreview && (
                                <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 p-3 text-xs" data-testid="ai-invoice-preview">
                                    <div className="flex items-center gap-2 font-serif text-mpca-oxblood">
                                        <Sparkles size={12} /> AI Extraction (Gemini 3 Flash) · confidence {Math.round((aiPreview.confidence || 0) * 100)}%
                                    </div>
                                    <div className="mt-1 text-mpca-charcoal">
                                        {aiPreview.error ? aiPreview.error : "Fields pre-filled below. Edit manually if AI defaults are wrong."}
                                    </div>
                                </div>
                            )}

                            <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="label-heritage">Vendor</label>
                                    <input value={form.vendor_name} onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))} className="input-heritage" data-testid="inv-vendor" />
                                </div>
                                <div>
                                    <label className="label-heritage">Invoice No</label>
                                    <input value={form.invoice_no} onChange={(e) => setForm((f) => ({ ...f, invoice_no: e.target.value }))} className="input-heritage" data-testid="inv-no" />
                                </div>
                                <div>
                                    <label className="label-heritage">Invoice Date</label>
                                    <input type="date" value={form.invoice_date} onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))} className="input-heritage" data-testid="inv-date" />
                                </div>
                                <div>
                                    <label className="label-heritage">Amount (pre-GST)</label>
                                    <input type="number" value={form.amount_inr} onChange={(e) => setForm((f) => ({ ...f, amount_inr: e.target.value }))} className="input-heritage" data-testid="inv-amount" />
                                </div>
                                <div>
                                    <label className="label-heritage">GST</label>
                                    <input type="number" value={form.gst_inr} onChange={(e) => setForm((f) => ({ ...f, gst_inr: e.target.value }))} className="input-heritage" data-testid="inv-gst" />
                                </div>
                                <div>
                                    <label className="label-heritage">Total</label>
                                    <input type="number" value={form.total_inr || ((+form.amount_inr || 0) + (+form.gst_inr || 0))} onChange={(e) => setForm((f) => ({ ...f, total_inr: e.target.value }))} className="input-heritage" data-testid="inv-total" />
                                </div>
                            </div>

                            {/* Sprint T-RIM · Multi-Head Set-Off */}
                            <div className="border border-mpca-brass/40 bg-mpca-parchment/30 p-3 space-y-2" data-testid="inv-allocations-block">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="overline">Budget Head Set-Off</div>
                                        <div className="text-[11px] text-mpca-gray-dark mt-0.5">
                                            Split this invoice across the tournament&apos;s approved budget heads. The sum of allocations must equal the invoice total.
                                        </div>
                                    </div>
                                    <button
                                        type="button" onClick={addAllocation}
                                        className="text-[10px] uppercase tracking-wider text-mpca-oxblood underline"
                                        data-testid="inv-add-alloc"
                                    >
                                        + Add head
                                    </button>
                                </div>

                                {budgetHeads.length === 0 ? (
                                    <div className="text-xs text-mpca-oxblood italic">
                                        No approved budget heads found. Please sanction the budget first.
                                    </div>
                                ) : (form.allocations.map((a, idx) => {
                                    const usedHeads = form.allocations
                                        .filter((_, i2) => i2 !== idx)
                                        .map((x) => x.head_code)
                                        .filter(Boolean);
                                    const options = budgetHeads.filter((h) => !usedHeads.includes(h.code));
                                    return (
                                        <div key={idx} className="grid grid-cols-[1fr_140px_28px] gap-2 items-end" data-testid={`inv-alloc-row-${idx}`}>
                                            <div>
                                                <label className="label-heritage text-[10px]">Budget Head #{idx + 1}</label>
                                                <select
                                                    value={a.head_code}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const match = budgetHeads.find((h) => h.code === code);
                                                        updateAllocation(idx, {
                                                            head_code: code,
                                                            head_label: match?.label || "",
                                                        });
                                                    }}
                                                    className="input-heritage"
                                                    data-testid={`inv-alloc-head-${idx}`}
                                                >
                                                    <option value="">— Select head —</option>
                                                    {options.map((h) => (
                                                        <option key={h.code} value={h.code}>
                                                            {h.label} · limit {fmtINR(h.limit_inr)}
                                                        </option>
                                                    ))}
                                                    {a.head_code && !options.find((h) => h.code === a.head_code) && (
                                                        <option value={a.head_code}>
                                                            {a.head_label || a.head_code}
                                                        </option>
                                                    )}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="label-heritage text-[10px]">Amount</label>
                                                <input
                                                    type="number" min="0" step="0.01"
                                                    value={a.amount_inr}
                                                    onChange={(e) => updateAllocation(idx, { amount_inr: e.target.value })}
                                                    className="input-heritage"
                                                    data-testid={`inv-alloc-amt-${idx}`}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeAllocation(idx)}
                                                disabled={form.allocations.length === 1}
                                                className="text-mpca-oxblood disabled:opacity-30 pb-2"
                                                title="Remove"
                                                data-testid={`inv-alloc-del-${idx}`}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                }))}

                                {budgetHeads.length > 0 && (
                                    <div className={"text-[11px] flex items-center justify-between mt-1 pt-2 border-t border-mpca-brass/30 " + (allocMismatch ? "text-mpca-oxblood font-semibold" : "text-mpca-green-dark")} data-testid="inv-alloc-summary">
                                        <span>Allocated: <span className="font-mono">{fmtINR(allocSum)}</span> · Invoice total: <span className="font-mono">{fmtINR(invoiceTotal)}</span></span>
                                        <span>
                                            {allocMismatch ? (
                                                allocDelta > 0
                                                    ? <>Short by {fmtINR(Math.abs(allocDelta))}</>
                                                    : <>Over by {fmtINR(Math.abs(allocDelta))}</>
                                            ) : <>Balanced ✓</>}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {error && <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-2 text-xs" data-testid="inv-error">{error}</div>}
                        </div>
                        <div className="px-6 pb-5 flex justify-end gap-3">
                            <button onClick={() => { setAddOpen(false); setEditing(null); setForm(emptyForm()); setAiPreview(null); }} className="btn-heritage-ghost">Cancel</button>
                            <button
                                onClick={editing ? saveEdit : save}
                                disabled={busy || !allHeadsPicked || allocMismatch || budgetHeads.length === 0 || invoiceTotal <= 0}
                                className="btn-heritage-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                data-testid="inv-save"
                            >
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {editing ? "Save Changes" : "Save Invoice"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════ DA Forms Tab ═══════════════════
const DATab = ({ tournament, persona, onChanged }) => {
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const canManage = persona && (persona.body_type === "State" || persona.body_type === "Division");

    const load = async () => {
        setLoading(true);
        try {
            const f = await fetchDAForms({ tournament_id: tournament.id });
            setForms(f);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [tournament.id]);

    const rebuild = async () => {
        try {
            const r = await rebuildDAForms(tournament.id);
            alert(`${r.created} new DA form(s) pre-built.`);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const saveEdit = async () => {
        try {
            await updateDAForm(editing.id, editing);
            setEditing(null); await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    return (
        <div className="space-y-5" data-testid="da-tab">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">Match Official Daily Allowance Forms</div>
                    <p className="text-sm text-mpca-gray-dark mt-1 max-w-2xl">
                        Auto pre-built per allocated official (fixture officials × days × rate). Officials fill in travel/food/bank details and submit → Division approves → posted to expense ledger.
                    </p>
                </div>
                {canManage && (
                    <button onClick={rebuild} className="btn-heritage-secondary" data-testid="rebuild-da">
                        <ClipboardList size={12} /> Rebuild Missing DA Forms
                    </button>
                )}
            </div>
            {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin inline" /></div> : forms.length === 0 ? (
                <div className="p-10 border border-mpca-brass/30 text-center text-mpca-gray-dark italic font-serif" data-testid="no-da">
                    No DA forms yet. Allocate officials to fixtures first, then rebuild.
                </div>
            ) : (
                <div className="space-y-3">
                    {forms.map((d) => (
                        <div key={d.id} className="border border-mpca-brass/30 bg-mpca-ivory/40 p-4" data-testid={`da-row-${d.da_ref}`}>
                            <div className="flex items-start justify-between flex-wrap gap-3">
                                <div>
                                    <div className="font-mono text-[10px] text-mpca-brass">{d.da_ref}</div>
                                    <div className="font-serif text-lg text-mpca-green-dark">{d.official_name}</div>
                                    <div className="text-[11px] text-mpca-gray-dark">{d.official_role.replace(/_/g, " ")} · {d.body_id || "—"}</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-serif text-xl text-mpca-oxblood">{fmtINR(d.total_inr)}</div>
                                    <div className="text-[10px] text-mpca-brass uppercase tracking-wider">
                                        Sched {d.scheduled_days ?? d.days ?? 0} d · Played {d.played_days ?? d.days ?? 0} d
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 grid sm:grid-cols-6 gap-3 text-xs">
                                <div title="Officiating fee — paid for every scheduled day (even if cancelled)">
                                    <div className="overline">Match Fee</div>
                                    <div className="font-mono text-mpca-navy">{fmtINR(d.match_fee_amount_inr || 0)}</div>
                                    <div className="text-[9px] text-mpca-gray-dark">{d.scheduled_days ?? 0} × ₹{d.match_fee_rate_inr || 0}</div>
                                </div>
                                <div title="DA/TA — paid only for days actually played">
                                    <div className="overline">DA</div>
                                    <div className="font-mono">{fmtINR(d.da_amount_inr)}</div>
                                    <div className="text-[9px] text-mpca-gray-dark">{d.played_days ?? d.days ?? 0} × ₹{d.da_rate_inr || 0}</div>
                                </div>
                                <div><div className="overline">Travel</div><div className="font-mono">{fmtINR(d.travel_amount_inr)}</div></div>
                                <div><div className="overline">Food</div><div className="font-mono">{fmtINR(d.food_amount_inr)}</div></div>
                                <div><div className="overline">Misc</div><div className="font-mono">{fmtINR(d.misc_amount_inr)}</div></div>
                                <div><div className="overline">Status</div><Pill tone={d.status === "Approved" ? "active" : d.status === "Rejected" ? "suspended" : "pending"} label={d.status} /></div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {(d.status === "Draft" || d.status === "Rejected") && (
                                    <button onClick={() => setEditing(d)} className="text-[10px] uppercase tracking-wider text-mpca-oxblood underline" data-testid={`da-fill-${d.da_ref}`}>Fill / Edit</button>
                                )}
                                {d.status === "Draft" && (
                                    <button onClick={async () => { try { await submitDAForm(d.id); await load(); } catch (e) { alert(e?.response?.data?.detail || e.message); } }} className="text-[10px] uppercase text-mpca-green-dark underline" data-testid={`da-submit-${d.da_ref}`}>Submit</button>
                                )}
                                {d.status === "Submitted" && canManage && (
                                    <>
                                        <button onClick={async () => { await approveDAForm(d.id, { actor_name: persona?.display_name || "Reviewer" }); await load(); onChanged?.(); }} className="text-[10px] uppercase text-mpca-green-dark underline" data-testid={`da-approve-${d.da_ref}`}>Approve</button>
                                        <button onClick={async () => { const r = window.prompt("Rejection reason:"); if (r) { await rejectDAForm(d.id, { actor_name: persona?.display_name || "Reviewer", reason: r }); await load(); } }} className="text-[10px] uppercase text-mpca-oxblood underline">Reject</button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="da-edit-dialog">
                    <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood">
                            <div className="overline !text-mpca-gold-light">{editing.da_ref}</div>
                            <div className="font-serif text-xl mt-1">DA Form · {editing.official_name}</div>
                        </div>
                        <div className="p-6 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label-heritage">Scheduled Days <span className="text-[9px] normal-case text-mpca-gray-dark">(match-fee driver)</span></label>
                                    <input type="number" value={editing.scheduled_days ?? editing.days ?? 0} onChange={(e) => setEditing((d) => ({ ...d, scheduled_days: parseInt(e.target.value) || 0 }))} className="input-heritage" data-testid="da-edit-scheduled-days" />
                                </div>
                                <div>
                                    <label className="label-heritage">Match-Fee Rate (₹/day)</label>
                                    <input type="number" value={editing.match_fee_rate_inr || 0} onChange={(e) => setEditing((d) => ({ ...d, match_fee_rate_inr: parseFloat(e.target.value) || 0 }))} className="input-heritage" data-testid="da-edit-fee-rate" />
                                </div>
                                <div>
                                    <label className="label-heritage">Played Days <span className="text-[9px] normal-case text-mpca-gray-dark">(DA/TA driver)</span></label>
                                    <input type="number" value={editing.played_days ?? editing.days ?? 0} onChange={(e) => setEditing((d) => ({ ...d, played_days: parseInt(e.target.value) || 0 }))} className="input-heritage" data-testid="da-edit-played-days" />
                                </div>
                                <div>
                                    <label className="label-heritage">DA Rate (₹/day)</label>
                                    <input type="number" value={editing.da_rate_inr || 0} disabled className="input-heritage opacity-60" />
                                </div>
                                <div>
                                    <label className="label-heritage">Travel (₹)</label>
                                    <input type="number" value={editing.travel_amount_inr || 0} onChange={(e) => setEditing((d) => ({ ...d, travel_amount_inr: parseFloat(e.target.value) || 0 }))} className="input-heritage" data-testid="da-edit-travel" />
                                </div>
                                <div>
                                    <label className="label-heritage">Food (₹)</label>
                                    <input type="number" value={editing.food_amount_inr || 0} onChange={(e) => setEditing((d) => ({ ...d, food_amount_inr: parseFloat(e.target.value) || 0 }))} className="input-heritage" data-testid="da-edit-food" />
                                </div>
                                <div>
                                    <label className="label-heritage">Misc (₹)</label>
                                    <input type="number" value={editing.misc_amount_inr || 0} onChange={(e) => setEditing((d) => ({ ...d, misc_amount_inr: parseFloat(e.target.value) || 0 }))} className="input-heritage" />
                                </div>
                                <div>
                                    <label className="label-heritage">Bank A/c No</label>
                                    <input value={editing.bank_account_no || ""} onChange={(e) => setEditing((d) => ({ ...d, bank_account_no: e.target.value }))} className="input-heritage" data-testid="da-edit-bank" />
                                </div>
                                <div>
                                    <label className="label-heritage">IFSC</label>
                                    <input value={editing.bank_ifsc || ""} onChange={(e) => setEditing((d) => ({ ...d, bank_ifsc: e.target.value }))} className="input-heritage" data-testid="da-edit-ifsc" />
                                </div>
                                <div>
                                    <label className="label-heritage">PAN</label>
                                    <input value={editing.pan || ""} onChange={(e) => setEditing((d) => ({ ...d, pan: e.target.value }))} className="input-heritage" data-testid="da-edit-pan" />
                                </div>
                            </div>
                        </div>
                        <div className="px-6 pb-5 flex justify-end gap-2">
                            <button onClick={() => setEditing(null)} className="btn-heritage-ghost">Cancel</button>
                            <button onClick={saveEdit} className="btn-heritage-primary" data-testid="da-edit-save"><Save size={12} /> Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════ Extra Expense Approval Tab ═══════════════════
const EER_STATUS_META = {
    Draft:          { tone: "lapsed",    label: "Draft" },
    Submitted:      { tone: "pending",   label: "Submitted · Awaits MPCA" },
    Approved:       { tone: "active",    label: "Approved" },
    Rejected:       { tone: "suspended", label: "Rejected" },
    Info_Requested: { tone: "pending",   label: "Info Requested" },
};

const HEAD_CHOICES = [
    ["GROUND_FEES",           "Ground Fees"],
    ["MATCH_OFFICIAL_DA",     "Match Official DA"],
    ["MATCH_OFFICIAL_TRAVEL", "Match Official Travel"],
    ["PLAYER_DA_FOOD",        "Player DA / Food"],
    ["PLAYER_TRAVEL",         "Player Travel"],
    ["PLAYER_STAY",           "Player Stay (Hotel)"],
    ["KIT_CONSUMABLES",       "Balls / Kit Consumables"],
    ["UMPIRE_HONORARIUM",     "Umpire Honorarium"],
    ["SCORER_HONORARIUM",     "Scorer Honorarium"],
    ["PHYSIO_HONORARIUM",     "Physio Honorarium"],
    ["CONTINGENCY",           "Contingency"],
    ["MISCELLANEOUS",         "Miscellaneous"],
    ["NEW_HEAD",              "── New head (specify below) ──"],
];

const ExtraExpenseTab = ({ tournament, persona, onChanged }) => {
    const [requests, setRequests] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNew, setShowNew] = useState(false);
    // MPCA-236 · Divisions with 2 approved budgets on the same tournament must
    // tag each extra request with the target budget so MPCA-approved lines land
    // in the right budget's per-head allocation.
    const [approvedBudgets, setApprovedBudgets] = useState([]);
    const [selectedBudgetId, setSelectedBudgetId] = useState("");
    const [form, setForm] = useState({
        head_choice: "GROUND_FEES", head_code: "GROUND_FEES", head_label: "Ground Fees",
        is_new_head: false, custom_head: "", amount_inr: 0, justification: "",
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // M39z.a · Only Divisions & Districts can raise/submit Extra Expense requests.
    // MPCA is the approver — never the requester — so hide the create/submit UI from State personas.
    const canRequest = persona && (persona.body_type === "Division" || persona.body_type === "District");
    const canApprove = persona && persona.body_type === "State";

    const load = async () => {
        setLoading(true);
        try {
            const [r, ev, bud] = await Promise.all([
                fetchExtraExpenseRequests({ tournament_id: tournament.id }),
                fetchTournamentExpenseEvents(tournament.id),
                canRequest
                    ? fetchTournamentBudgets({ tournament_id: tournament.id, body_id: persona?.body_code, status: "Approved" }).catch(() => [])
                    : Promise.resolve([]),
            ]);
            setRequests(r);
            setEvents(ev.events || []);
            setApprovedBudgets(bud || []);
            if ((bud || []).length && !selectedBudgetId) {
                setSelectedBudgetId(bud[0].id);
            }
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [tournament.id]);

    const create = async () => {
        setBusy(true); setError(null);
        try {
            const isNew = form.head_choice === "NEW_HEAD";
            const label = isNew ? (form.custom_head || "").trim() : form.head_label;
            const code = isNew ? label.toUpperCase().replace(/\s+/g, "_") : form.head_code;
            if (!label) throw new Error("Please enter the new head name.");
            await createExtraExpenseRequest({
                tournament_id: tournament.id,
                body_id: persona?.body_code || "DIV",
                // MPCA-236 · Multi-pool: tag against the selected budget so the
                // approved line item lands in the right budget's allocation.
                budget_id: selectedBudgetId || undefined,
                head_code: code,
                head_label: label,
                is_new_head: isNew,
                amount_inr: parseFloat(form.amount_inr) || 0,
                justification: form.justification,
                requested_by: persona?.display_name,
            });
            setShowNew(false);
            setForm({ head_choice: "GROUND_FEES", head_code: "GROUND_FEES", head_label: "Ground Fees", is_new_head: false, custom_head: "", amount_inr: 0, justification: "" });
            await load(); onChanged?.();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const submit = async (r) => {
        try {
            await submitExtraExpenseRequest(r.id, {
                actor_name: persona?.display_name || "Division", actor_body_id: persona?.body_code || "DIV",
                actor_post: persona?.role_label,
            });
            await load(); onChanged?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const approve = async (r) => {
        const custom = window.prompt(`Sanction amount (₹). Leave blank to sanction full ₹${r.amount_inr}:`, "");
        try {
            await approveExtraExpenseRequest(r.id, {
                actor_name: persona?.display_name || "MPCA", actor_body_id: "MPCA", actor_post: persona?.role_label || "Hon. Secretary",
                approved_amount_inr: custom && custom.trim() ? parseFloat(custom) : undefined,
                notes: "Approved by MPCA",
            });
            await load(); onChanged?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const reject = async (r) => {
        const notes = window.prompt("Rejection reason:"); if (!notes) return;
        try {
            await rejectExtraExpenseRequest(r.id, { actor_name: persona?.display_name || "MPCA", actor_body_id: "MPCA", notes });
            await load(); onChanged?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const askInfo = async (r) => {
        const notes = window.prompt("What information do you need from the Division?"); if (!notes) return;
        try {
            await requestInfoOnExtraExpense(r.id, { actor_name: persona?.display_name || "MPCA", actor_body_id: "MPCA", notes });
            await load(); onChanged?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // MPCA-201 · Bulk actions
    const draftExtras = requests.filter((r) => ["Draft", "Info_Requested"].includes(r.status));
    const submittedByBody = useMemo(() => {
        const g = {};
        for (const r of requests) {
            if (r.status !== "Submitted") continue;
            if (!g[r.body_id]) g[r.body_id] = { body_id: r.body_id, rows: [] };
            g[r.body_id].rows.push(r);
        }
        return Object.values(g);
    }, [requests]);
    const bulkSubmitAll = async () => {
        if (!draftExtras.length) return;
        setBusy(true); setError(null);
        try {
            await bulkSubmitExtraExpenses({
                ids: draftExtras.map((r) => r.id),
                actor_name: persona?.display_name, actor_post: persona?.role_label,
                actor_body_id: persona?.body_code, notes: "Bulk submit",
            });
            await load(); onChanged?.();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const bulkApproveBody = async (bodyId) => {
        setBusy(true); setError(null);
        try {
            await bulkApproveExtraExpenses({
                tournament_id: tournament.id, body_id: bodyId,
                actor_name: persona?.display_name, actor_post: persona?.role_label,
                actor_body_id: "MPCA", notes: "Bulk approve",
            });
            await load(); onChanged?.();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-6" data-testid="extra-expense-tab">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">Extra Expense Approvals</div>
                    <p className="text-sm text-mpca-gray-dark mt-1 max-w-2xl">
                        Request MPCA approval for expenses not in the auto-budget. Every action is logged on the tournament for full audit.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {canApprove && submittedByBody.length > 0 && (
                        <select
                            onChange={(e) => { if (e.target.value) { bulkApproveBody(e.target.value); e.target.value = ""; } }}
                            defaultValue=""
                            className="input-heritage !py-1.5 !text-xs !w-auto"
                            data-testid="bulk-approve-extra-body-select"
                        >
                            <option value="">— Bulk Approve by Division —</option>
                            {submittedByBody.map((g) => (
                                <option key={g.body_id} value={g.body_id}>{g.body_id} · Approve {g.rows.length} Submitted</option>
                            ))}
                        </select>
                    )}
                    {canRequest && draftExtras.length > 0 && (
                        <button onClick={bulkSubmitAll} disabled={busy}
                            className="text-[10px] uppercase tracking-widest border-2 border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory px-3 py-1.5 disabled:opacity-40"
                            data-testid="bulk-submit-extras-btn"
                        >
                            <Send size={11} className="inline mr-1" /> Submit All {draftExtras.length} to MPCA
                        </button>
                    )}
                    {canRequest && (
                        <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="new-eer-btn">
                            <Plus size={12} /> Request Extra Approval
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-2 text-xs" data-testid="eer-bulk-err">{error}</div>}

            {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin inline" /></div> : requests.length === 0 ? (
                <div className="p-10 border border-mpca-brass/30 text-center text-mpca-gray-dark italic font-serif" data-testid="no-eer">
                    No extra expense requests raised yet.
                </div>
            ) : (
                <div className="space-y-3">
                    {requests.map((r) => {
                        const meta = EER_STATUS_META[r.status];
                        return (
                            <div key={r.id} className="border border-mpca-brass/30 bg-mpca-ivory/40 p-4" data-testid={`eer-row-${r.request_ref}`}>
                                <div className="flex items-start justify-between flex-wrap gap-3">
                                    <div className="flex-1">
                                        <div className="font-mono text-[10px] text-mpca-brass">{r.request_ref}</div>
                                        <div className="font-serif text-lg text-mpca-green-dark mt-1">
                                            {r.head_label}
                                            {r.is_new_head && <span className="ml-2 text-[9px] uppercase tracking-widest text-mpca-oxblood font-semibold">New Head</span>}
                                        </div>
                                        <div className="text-[11px] text-mpca-gray-dark mt-1">
                                            Requested by {r.body_id} · {new Date(r.created_at).toLocaleDateString("en-IN")}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-serif text-xl text-mpca-oxblood">₹{r.amount_inr.toLocaleString("en-IN")}</div>
                                        {r.status === "Approved" && r.approved_amount_inr !== r.amount_inr && (
                                            <div className="text-[10px] text-mpca-green-dark">Sanctioned ₹{r.approved_amount_inr.toLocaleString("en-IN")}</div>
                                        )}
                                        <div className="mt-1"><Pill tone={meta.tone} label={meta.label} testId={`eer-status-${r.request_ref}`} /></div>
                                    </div>
                                </div>
                                <div className="mt-3 text-sm text-mpca-charcoal border-l-4 border-mpca-brass/30 pl-3 italic">
                                    {r.justification}
                                </div>
                                {r.info_request_notes && (
                                    <div className="mt-2 text-xs text-mpca-oxblood border border-mpca-oxblood/30 bg-mpca-oxblood/5 p-2">
                                        <strong>MPCA needs info:</strong> {r.info_request_notes}
                                    </div>
                                )}
                                {r.rejection_reason && (
                                    <div className="mt-2 text-xs text-mpca-oxblood border border-mpca-oxblood/30 bg-mpca-oxblood/5 p-2">
                                        <strong>Rejected:</strong> {r.rejection_reason}
                                    </div>
                                )}
                                {/* Actions */}
                                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
                                    {r.status === "Draft" && canRequest && (
                                        <button onClick={() => submit(r)} className="text-mpca-green-dark underline" data-testid={`eer-submit-${r.request_ref}`}>Submit to MPCA</button>
                                    )}
                                    {r.status === "Info_Requested" && canRequest && (
                                        <button onClick={() => submit(r)} className="text-mpca-green-dark underline">Re-submit after edits</button>
                                    )}
                                    {r.status === "Submitted" && canApprove && (
                                        <>
                                            <button onClick={() => approve(r)} className="text-mpca-green-dark underline" data-testid={`eer-approve-${r.request_ref}`}>Approve</button>
                                            <button onClick={() => reject(r)} className="text-mpca-oxblood underline" data-testid={`eer-reject-${r.request_ref}`}>Reject</button>
                                            <button onClick={() => askInfo(r)} className="text-mpca-brass underline" data-testid={`eer-info-${r.request_ref}`}>Ask for Info</button>
                                        </>
                                    )}
                                </div>
                                {/* Per-request approval trail */}
                                {r.approval_chain && r.approval_chain.length > 0 && (
                                    <div className="mt-3 border-t border-mpca-brass/20 pt-2">
                                        <div className="overline mb-1 text-[9px]">Trail</div>
                                        <ol className="text-[11px] font-mono space-y-1">
                                            {r.approval_chain.map((s, i) => (
                                                <li key={i}>
                                                    <span className="text-mpca-brass">{s.stage}</span> · {s.actor_name}{s.actor_post ? ` (${s.actor_post})` : ""} · <span className="italic text-mpca-gray-dark">{s.notes || ""}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Tournament-wide expense event log */}
            {events.length > 0 && (
                <div className="mt-8 border-t border-mpca-brass/30 pt-6">
                    <div className="overline mb-3 flex items-center gap-2"><ScrollText size={12} /> Tournament Expense Log · {events.length} events</div>
                    <WorkflowTimeline chain={events} testId="expense-events-log" />
                </div>
            )}

            {/* New request modal */}
            {showNew && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 overflow-y-auto" data-testid="new-eer-dialog">
                    <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full my-8">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                            <div>
                                <div className="overline !text-mpca-gold-light">Extra Expense</div>
                                <div className="font-serif text-2xl mt-1">Request MPCA Approval</div>
                            </div>
                            <button onClick={() => setShowNew(false)}><X className="text-mpca-gold-light" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* MPCA-236 · Budget picker for multi-pool tournaments */}
                            {approvedBudgets.length > 1 && (
                                <div className="border-2 border-mpca-oxblood/40 bg-mpca-oxblood/5 p-3" data-testid="eer-budget-picker">
                                    <label className="label-heritage flex items-center gap-2 mb-2">
                                        Which budget will this extra be added to?
                                        <span className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-0.5">Multi-pool tournament</span>
                                    </label>
                                    <select
                                        className="input-heritage w-full"
                                        value={selectedBudgetId}
                                        onChange={(e) => setSelectedBudgetId(e.target.value)}
                                        data-testid="eer-budget-select"
                                    >
                                        {approvedBudgets.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.budget_no} · {b.pool_name || "—"} · {b.role_flavour || "—"} · ₹{Number(b.total_ceiling_inr || 0).toLocaleString("en-IN")}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="text-[10px] text-mpca-gray-dark mt-1 italic">
                                        Once MPCA approves this extra, the line item is added to the selected budget&apos;s per-head allocation.
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="label-heritage">Head *</label>
                                <select value={form.head_choice} onChange={(e) => {
                                    const val = e.target.value;
                                    const choice = HEAD_CHOICES.find(([c]) => c === val);
                                    setForm((f) => ({
                                        ...f,
                                        head_choice: val,
                                        head_code: val === "NEW_HEAD" ? "" : val,
                                        head_label: val === "NEW_HEAD" ? "" : (choice ? choice[1] : val),
                                        is_new_head: val === "NEW_HEAD",
                                    }));
                                }} className="input-heritage" data-testid="eer-head">
                                    {HEAD_CHOICES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                                </select>
                            </div>
                            {form.head_choice === "NEW_HEAD" && (
                                <div>
                                    <label className="label-heritage">New Head Name *</label>
                                    <input value={form.custom_head} onChange={(e) => setForm((f) => ({ ...f, custom_head: e.target.value }))} placeholder="e.g., Ambulance Standby" className="input-heritage" data-testid="eer-custom-head" />
                                </div>
                            )}
                            <div>
                                <label className="label-heritage">Additional Amount Requested (₹) *</label>
                                <input type="number" value={form.amount_inr} onChange={(e) => setForm((f) => ({ ...f, amount_inr: e.target.value }))} className="input-heritage" data-testid="eer-amount" />
                            </div>
                            <div>
                                <label className="label-heritage">Justification * <span className="text-[10px] text-mpca-gray-dark">(min 10 characters)</span></label>
                                <textarea rows={4} value={form.justification} onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))} className="input-heritage" placeholder="Why is this expense necessary and why wasn't it in the original budget?" data-testid="eer-justification" />
                            </div>
                            {error && <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-2 text-xs">{error}</div>}
                        </div>
                        <div className="px-6 pb-5 flex justify-end gap-3">
                            <button onClick={() => setShowNew(false)} className="btn-heritage-ghost">Cancel</button>
                            <button onClick={create} disabled={busy || !form.justification || form.justification.length < 10 || form.amount_inr <= 0} className="btn-heritage-primary" data-testid="eer-create">
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save as Draft
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// ═══════════════════ Master TournamentOps ═══════════════════
const TournamentOps = ({ tournament, persona, onChanged }) => {
    const [tab, setTab] = useState("plan");
    return (
        <div className="mt-12 border-t-2 border-mpca-brass/40 pt-8" data-testid="tournament-ops">
            <div className="overline mb-4">Tournament Operations</div>
            <div className="flex gap-4 flex-wrap border-b border-mpca-brass/30 mb-6">
                {[
                    ["plan",      "Plan · Approval",       ClipboardList],
                    ["budget",    "Budget Tracker",        IndianRupee],
                    ["invoices",  "Invoices · AI",         FileText],
                    ["da",        "DA Forms",              Users],
                    ["extra",     "Extra Expense",         Gavel],
                ].map(([k, l, I]) => (
                    <button key={k} onClick={() => setTab(k)} data-testid={`ops-tab-${k}`}
                        className={"pb-3 flex items-center gap-2 text-[13px] uppercase tracking-wider font-semibold transition-colors " + (tab === k ? "text-mpca-oxblood border-b-2 border-mpca-oxblood -mb-px" : "text-mpca-gray-dark hover:text-mpca-green-dark")}>
                        <I size={13} /> {l}
                    </button>
                ))}
            </div>
            {tab === "plan"     && <PlanTab          tournament={tournament} persona={persona} onChanged={onChanged} />}
            {tab === "budget"   && <BudgetTab        tournament={tournament} />}
            {tab === "invoices" && <InvoicesTab      tournament={tournament} persona={persona} onChanged={onChanged} />}
            {tab === "da"       && <DATab            tournament={tournament} persona={persona} onChanged={onChanged} />}
            {tab === "extra"    && <ExtraExpenseTab  tournament={tournament} persona={persona} onChanged={onChanged} />}
        </div>
    );
};

export default TournamentOps;
export { ExtraExpenseTab };
