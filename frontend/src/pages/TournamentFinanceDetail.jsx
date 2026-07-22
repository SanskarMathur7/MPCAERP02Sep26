import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Sparkles, Plus, Trash2, FileText, Send, CheckCircle2, AlertTriangle, MessageSquare, ExternalLink, ClipboardList } from "lucide-react";
import { api, BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import TournamentSubTabs from "@/components/TournamentSubTabs";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const TABS = ["Budget Sheet", "Invoices", "Extra Expense", "Budget vs Actual"];

const emptyAlloc = { head_code: "", head_label: "", amount_inr: 0, notes: "" };
const emptyInvoice = {
    vendor_name: "", invoice_no: "", invoice_date: new Date().toISOString().slice(0, 10),
    amount_inr: 0, gst_inr: 0, total_inr: 0, notes: "",
    file_url: "", filename: "",
    allocations: [],
};

const TournamentFinanceDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { persona } = useAuth();
    const [tab, setTab] = useState("Budget Sheet");
    const [tournament, setTournament] = useState(null);
    const [budget, setBudget] = useState(null);
    const [scheme, setScheme] = useState(null);
    const [allSchemes, setAllSchemes] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [extras, setExtras] = useState([]);
    const [claim, setClaim] = useState(null);
    const [tracker, setTracker] = useState(null);
    const [loading, setLoading] = useState(true);

    // Local form state for invoice creation
    const [showInvForm, setShowInvForm] = useState(false);
    const [invForm, setInvForm] = useState(emptyInvoice);
    const [uploading, setUploading] = useState(false);
    const [aiRunning, setAiRunning] = useState(false);

    // Extra expense form
    const [showExtraForm, setShowExtraForm] = useState(false);
    const [extraForm, setExtraForm] = useState({ head_code: "", head_label: "", amount_inr: 0, justification: "", is_new_head: false });

    // Assign scheme
    const [showSchemePicker, setShowSchemePicker] = useState(false);

    const bodyForClaims = persona?.body_type === "State" ? "DIV-IND" : persona?.body_code || "MPCA";

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: t }, { data: schemes }] = await Promise.all([
                api.get(`/tournaments/${id}`),
                api.get("/reimbursement-schemes"),
            ]);
            setTournament(t);
            setAllSchemes(schemes || []);
            if (t.scheme_code) {
                setScheme((schemes || []).find((s) => s.scheme_code === t.scheme_code) || null);
            }
            const bodyForFetch = t.host_body_id?.startsWith("DIV-") ? t.host_body_id : t.host_body_id?.startsWith("DIST-") ? t.host_body_id : bodyForClaims;

            // Try to get budget for this tournament + body
            const { data: budgets } = await api.get(`/tournament-budgets`, { params: { tournament_id: id } });
            const activeBudget = (budgets || []).find((b) => b.status === "Approved") || (budgets || [])[0];
            setBudget(activeBudget || null);

            const [{ data: invs }, { data: exps }, { data: claims }] = await Promise.all([
                api.get(`/tournament-invoices`, { params: { tournament_id: id } }),
                api.get(`/extra-expense-requests`, { params: { tournament_id: id } }),
                api.get(`/reimbursement-claims`, { params: { tournament_id: id } }),
            ]);
            setInvoices(invs || []);
            setExtras(exps || []);
            setClaim((claims || [])[0] || null);

            if (activeBudget) {
                const { data: tr } = await api.get(`/tournament-budgets/${activeBudget.id}/tracker`);
                setTracker(tr);
            } else {
                setTracker(null);
            }
        } catch (e) {
            console.error(e);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [id]);

    // ─── Scheme assignment: create budget from scheme heads using calculator ───
    const [schemePickerStep, setSchemePickerStep] = useState("choose"); // choose | inputs
    const [schemeInputSpec, setSchemeInputSpec] = useState(null);
    const [calcInputs, setCalcInputs] = useState({});
    const [computedBudget, setComputedBudget] = useState(null);
    const [computing, setComputing] = useState(false);

    const chooseScheme = async (scheme_code) => {
        setComputing(true);
        try {
            const { data: spec } = await api.get(`/schemes/${scheme_code}/input-spec`);
            setSchemeInputSpec(spec);
            const defaults = {};
            (spec.input_variables || []).forEach((v) => { defaults[v.key] = v.default; });
            setCalcInputs(defaults);
            // Auto-compute with defaults immediately
            const { data: computed } = await api.post(`/schemes/${scheme_code}/compute-budget`, { inputs: defaults });
            setComputedBudget(computed);
            setSchemePickerStep("inputs");
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setComputing(false); }
    };

    const recompute = async (newInputs) => {
        if (!schemeInputSpec) return;
        setComputing(true);
        try {
            const { data } = await api.post(`/schemes/${schemeInputSpec.scheme_code}/compute-budget`, { inputs: newInputs });
            setComputedBudget(data);
        } catch (e) { console.error(e); }
        finally { setComputing(false); }
    };

    const setInput = (k, v) => {
        const next = { ...calcInputs, [k]: v };
        setCalcInputs(next);
        // Debounced recompute
        clearTimeout(setInput._t);
        setInput._t = setTimeout(() => recompute(next), 300);
    };

    const assignScheme = async () => {
        try {
            if (!computedBudget || !schemeInputSpec) return;
            const scheme_code = schemeInputSpec.scheme_code;
            try { await api.patch(`/tournaments/${id}`, { scheme_code }); } catch (_) { /* not fatal */ }
            const payload = {
                tournament_id: id,
                body_id: tournament.host_body_id || "MPCA",
                fiscal_cycle: tournament.fiscal_cycle || "2025-26",
                total_ceiling_inr: computedBudget.total_ceiling_inr,
                head_allocations: computedBudget.head_allocations.map((h) => ({
                    head: h.head, limit_inr: h.limit_inr, notes: h.formula,
                })),
                notes: `Auto-computed from scheme ${scheme_code} — ${schemeInputSpec.scheme_name}. Inputs: ${JSON.stringify(calcInputs)}`,
                created_by: persona?.name,
            };
            await api.post("/tournament-budgets", payload);
            setShowSchemePicker(false);
            setSchemePickerStep("choose");
            setSchemeInputSpec(null);
            setComputedBudget(null);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // ─── Invoice ops ───
    const onFileUpload = async (file) => {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "tournament_invoice");
            const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setInvForm((f) => ({ ...f, file_url: data.url, filename: data.original_name || file.name }));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploading(false); }
    };

    const runAIExtract = async () => {
        if (!invForm.file_url) { alert("Upload the invoice file first"); return; }
        setAiRunning(true);
        try {
            const { data } = await api.post(`/tournament-invoices/ai-extract?file_url=${encodeURIComponent(invForm.file_url)}`);
            const p = data.prefill || {};
            setInvForm((f) => ({
                ...f,
                vendor_name: p.vendor_name || f.vendor_name,
                invoice_no: p.invoice_no || f.invoice_no,
                invoice_date: p.invoice_date || f.invoice_date,
                amount_inr: p.amount_inr || f.amount_inr,
                gst_inr: p.gst_inr || f.gst_inr,
                total_inr: p.total_inr || (p.amount_inr || 0) + (p.gst_inr || 0),
                // seed one allocation to the suggested head
                allocations: p.budget_head_code && f.allocations.length === 0
                    ? [{ head_code: p.budget_head_code, head_label: p.budget_head_code, amount_inr: p.total_inr || 0, notes: "AI-suggested head" }]
                    : f.allocations,
            }));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setAiRunning(false); }
    };

    const addAllocation = () => {
        const remaining = (invForm.total_inr || 0) - invForm.allocations.reduce((s, a) => s + (a.amount_inr || 0), 0);
        const firstHead = (budget?.approved_head_allocations || budget?.head_allocations || [])[0];
        setInvForm((f) => ({
            ...f,
            allocations: [...f.allocations, { head_code: firstHead?.head?.replace(/\s+/g, "_").toUpperCase() || "", head_label: firstHead?.head || "", amount_inr: Math.max(remaining, 0), notes: "" }],
        }));
    };

    const removeAllocation = (idx) => {
        setInvForm((f) => ({ ...f, allocations: f.allocations.filter((_, i) => i !== idx) }));
    };

    const updateAllocation = (idx, key, val) => {
        setInvForm((f) => ({
            ...f,
            allocations: f.allocations.map((a, i) => (i === idx ? { ...a, [key]: val } : a)),
        }));
    };

    const saveInvoice = async () => {
        try {
            const total = parseFloat(invForm.total_inr) || 0;
            const allocSum = invForm.allocations.reduce((s, a) => s + (parseFloat(a.amount_inr) || 0), 0);
            if (invForm.allocations.length > 0 && Math.abs(allocSum - total) > 1) {
                alert(`Head allocations (${fmt(allocSum)}) must sum to invoice total (${fmt(total)}).`);
                return;
            }
            const primary = invForm.allocations[0];
            const payload = {
                tournament_id: id,
                body_id: tournament.host_body_id || "MPCA",
                budget_id: budget?.id,
                budget_head_code: primary?.head_code,
                allocations: invForm.allocations.map((a) => ({ ...a, amount_inr: parseFloat(a.amount_inr) || 0 })),
                vendor_name: invForm.vendor_name,
                invoice_no: invForm.invoice_no,
                invoice_date: invForm.invoice_date,
                amount_inr: parseFloat(invForm.amount_inr) || 0,
                gst_inr: parseFloat(invForm.gst_inr) || 0,
                total_inr: total,
                file_url: invForm.file_url,
                filename: invForm.filename,
                notes: invForm.notes,
                entered_by: persona?.name,
            };
            await api.post("/tournament-invoices", payload);
            setShowInvForm(false);
            setInvForm(emptyInvoice);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const submitInvoice = async (iid) => {
        try { await api.post(`/tournament-invoices/${iid}/submit`); await load(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const approveInvoice = async (iid) => {
        try { await api.post(`/tournament-invoices/${iid}/approve`); await load(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // ─── Extra expense ops ───
    const submitExtra = async () => {
        try {
            const payload = {
                tournament_id: id,
                body_id: tournament.host_body_id || "MPCA",
                head_code: extraForm.head_code || "OTHER",
                head_label: extraForm.head_label || extraForm.head_code || "Other",
                is_new_head: extraForm.is_new_head,
                amount_inr: parseFloat(extraForm.amount_inr) || 0,
                justification: extraForm.justification,
                requested_by: persona?.name,
            };
            const { data: created } = await api.post("/extra-expense-requests", payload);
            // Immediately submit (Division sends up)
            await api.post(`/extra-expense-requests/${created.id}/submit`, {
                actor_name: persona?.name, actor_post: persona?.post, actor_body_id: persona?.body_code,
                notes: extraForm.justification,
            });
            setShowExtraForm(false);
            setExtraForm({ head_code: "", head_label: "", amount_inr: 0, justification: "", is_new_head: false });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const approveExtra = async (rid) => {
        try {
            await api.post(`/extra-expense-requests/${rid}/approve`, {
                actor_name: persona?.name, actor_post: persona?.post, actor_body_id: "MPCA",
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // ─── Budget submit workflow (Fix 6) ───
    const submitBudgetSheet = async () => {
        if (!budget) return;
        if (!window.confirm(`Submit budget ${budget.budget_no} to MPCA Treasurer for approval?`)) return;
        try {
            await api.post(`/tournament-budgets/${budget.id}/submit`, {
                actor_name: persona?.name,
                actor_post: persona?.post || "Division Secretary",
                actor_body_id: persona?.body_code,
                notes: `Submitted from Tournament Finance console for ${tournament.name}`,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // ─── Reimbursement claim submission ───
    const submitClaim = async () => {
        try {
            let target = claim;
            if (!target) {
                const { data: created } = await api.post("/reimbursement-claims", {
                    tournament_id: id,
                    body_id: tournament.host_body_id || "MPCA",
                    fiscal_cycle: tournament.fiscal_cycle || "2025-26",
                    scheme_code: tournament.scheme_code,
                    notes: "Submitted from Tournament Finance console",
                    submitted_by: persona?.name,
                });
                target = created;
            }
            await api.post(`/reimbursement-claims/${target.id}/submit`, {
                actor_name: persona?.name,
                actor_role: persona?.post || "Division Secretary",
                actor_body_id: persona?.body_code || "MPCA",
                notes: `Submitting claim for ${tournament.name}`,
            });
            await load();
            alert("Reimbursement claim submitted to MPCA Secretary for review.");
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading || !tournament) return <CricketLoader label="Loading finance..." />;

    const totalsForAlloc = invForm.allocations.reduce((s, a) => s + (parseFloat(a.amount_inr) || 0), 0);
    const isOfficeBearer = ["president", "secretary", "treasurer", "division-secretary", "district-secretary"].includes(persona?.id);
    const canSubmitClaim = ["division-secretary", "district-secretary"].includes(persona?.id) && (!claim || claim.status === "Draft" || claim.status === "Rejected");
    const budgetHeads = budget ? (budget.approved_head_allocations?.length ? budget.approved_head_allocations : budget.head_allocations) : [];
    // Fix 6: Division/District can submit budget sheet to MPCA when Draft or Returned.
    const canSubmitBudget = budget && ["Draft", "Returned"].includes(budget.status) &&
        ["division-secretary", "district-secretary"].includes(persona?.id);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="tournament-finance-detail-page">
            <TournamentSubTabs tournamentId={id} active="finance" />
            <button className="text-[11px] text-mpca-brass uppercase tracking-widest mb-4 flex items-center gap-1" onClick={() => navigate("/tournaments")} data-testid="back-to-finance">
                <ArrowLeft size={12} /> Back to Tournaments
            </button>

            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Tournament · Finance</div>
                    <h1 className="font-serif text-4xl text-mpca-green-dark mt-3 leading-tight" data-testid="tournament-name">{tournament.name}</h1>
                    <div className="text-[11px] mt-2 flex gap-3 flex-wrap items-center">
                        <span className="font-mono text-mpca-brass">{tournament.tournament_no}</span>
                        <span className="text-mpca-gray-dark">·</span>
                        <span className="text-mpca-gray-dark">{tournament.format}</span>
                        <span className="text-mpca-gray-dark">·</span>
                        <span className="text-mpca-gray-dark">Host: {tournament.host_body_id}</span>
                        {tournament.scheme_code && (
                            <>
                                <span className="text-mpca-gray-dark">·</span>
                                <span className="font-mono text-mpca-green-dark bg-mpca-brass/15 px-2 py-0.5">Scheme {tournament.scheme_code}</span>
                            </>
                        )}
                    </div>
                </div>
                {canSubmitClaim && budget && (
                    <button className="btn-heritage-primary" onClick={submitClaim} data-testid="submit-claim-btn">
                        <Send size={12} /> Submit Reimbursement to MPCA
                    </button>
                )}
                {claim?.status === "Submitted" && (
                    <span className="inline-block px-3 py-1.5 text-[10px] uppercase tracking-widest bg-mpca-brass/20 border border-mpca-brass text-mpca-brass" data-testid="claim-submitted-badge">
                        Claim {claim.claim_ref} · Awaiting MPCA
                    </span>
                )}
                {claim?.status === "Approved" && (
                    <span className="inline-block px-3 py-1.5 text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory">
                        Reimbursement Approved · {fmt(claim.approved_amount_inr)}
                    </span>
                )}
                {claim?.status === "Rejected" && (
                    <span className="inline-block px-3 py-1.5 text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory">
                        Rejected
                    </span>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-mpca-brass/30 mb-6">
                {TABS.map((t) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-2 text-[11px] uppercase tracking-widest border-b-2 -mb-px ${tab === t ? "border-mpca-oxblood text-mpca-oxblood font-semibold" : "border-transparent text-mpca-gray-dark"}`}
                        data-testid={`tab-${t.toLowerCase().replace(/\s+/g, "-")}`}>{t}</button>
                ))}
            </div>

            {/* ============= Tab 1: Budget Sheet ============= */}
            {tab === "Budget Sheet" && (
                <div data-testid="tab-panel-budget-sheet">
                    {!budget ? (
                        <div className="bulletin-card p-8 text-center">
                            <ClipboardList className="mx-auto text-mpca-brass mb-3" size={32} />
                            <div className="font-serif text-xl text-mpca-green-dark mb-3">No budget set yet</div>
                            <p className="text-sm text-mpca-gray-dark mb-4 max-w-xl mx-auto">
                                Assign an MPCA reimbursement scheme (e.g., Scheme 2-D for Inter-Divisional Hosting) to auto-generate the pre-defined budget with all applicable heads and rates.
                            </p>
                            <button className="btn-heritage-primary" onClick={() => setShowSchemePicker(true)} data-testid="pick-scheme-btn">
                                <Plus size={12} /> Assign Reimbursement Scheme
                            </button>
                        </div>
                    ) : (
                        <div className="bulletin-card p-0 overflow-hidden">
                            <div className="p-4 bg-mpca-cream/40 border-b border-mpca-brass/20 flex justify-between items-center">
                                <div>
                                    <div className="overline text-[9px]">Budget · {budget.budget_no}</div>
                                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                                        {scheme?.name || tournament.name}
                                    </div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-0.5">
                                        Status: <span className="font-semibold text-mpca-green-dark">{budget.status}</span> · Fiscal {budget.fiscal_cycle}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="overline text-[9px]">Total Ceiling</div>
                                    <div className="font-mono text-2xl text-mpca-green-dark" data-testid="budget-total">
                                        {fmt(budget.approved_total_inr || budget.total_ceiling_inr)}
                                    </div>
                                    {canSubmitBudget && (
                                        <button
                                            className="btn-heritage-primary mt-3 !py-1.5 !px-3 !text-[11px]"
                                            onClick={submitBudgetSheet}
                                            data-testid="submit-budget-btn"
                                        >
                                            <Send size={11} /> Submit Budget to MPCA
                                        </button>
                                    )}
                                    {budget.status === "Submitted" && (
                                        <div className="mt-3 text-[10px] uppercase tracking-widest bg-mpca-brass/20 border border-mpca-brass text-mpca-brass px-2 py-1 inline-block" data-testid="budget-submitted-badge">
                                            Awaiting MPCA Approval
                                        </div>
                                    )}
                                    {budget.status === "Approved" && (
                                        <div className="mt-3 text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-2 py-1 inline-block" data-testid="budget-approved-badge">
                                            Approved by MPCA
                                        </div>
                                    )}
                                    {budget.status === "Returned" && (
                                        <div className="mt-3 text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 inline-block" data-testid="budget-returned-badge">
                                            Returned — please revise
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                                <div className="col-span-7">Budget Head</div>
                                <div className="col-span-3 text-right">Limit (₹)</div>
                                <div className="col-span-2 text-right">Notes</div>
                            </div>
                            {budgetHeads.map((h, i) => (
                                <div key={i} className="grid grid-cols-12 gap-3 px-4 py-2.5 items-center border-b border-mpca-brass/10 text-sm" data-testid={`budget-head-row-${i}`}>
                                    <div className="col-span-7 text-mpca-green-dark">{h.head}</div>
                                    <div className="col-span-3 text-right font-mono">{fmt(h.limit_inr)}</div>
                                    <div className="col-span-2 text-right text-[10px] text-mpca-gray-dark truncate">{h.notes || "—"}</div>
                                </div>
                            ))}
                            {scheme && scheme.conditions?.length > 0 && (
                                <div className="p-4 bg-mpca-cream/30">
                                    <div className="overline text-[9px] mb-2">Scheme Conditions</div>
                                    <ul className="text-[11px] text-mpca-gray-dark list-disc pl-4 space-y-1">
                                        {scheme.conditions.map((c, i) => <li key={i}>{c}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Scheme picker modal with inputs + auto-compute */}
                    {showSchemePicker && (
                        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => { setShowSchemePicker(false); setSchemePickerStep("choose"); }}>
                            <div className="bulletin-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="scheme-picker-modal">
                                {schemePickerStep === "choose" ? (
                                    <>
                                        <div className="font-serif text-2xl text-mpca-green-dark mb-4">① Choose Reimbursement Scheme</div>
                                        <div className="space-y-2">
                                            {allSchemes.filter((s) => ["Reimbursement", "Camp"].includes(s.scheme_type) || ["2-A","2-B","2-C","2-D","2-E","3-A","3-B","3-C","3-D","9-BCCI"].includes(s.scheme_code)).map((s) => (
                                                <button key={s.scheme_code} onClick={() => chooseScheme(s.scheme_code)} disabled={computing} className="w-full text-left p-3 border border-mpca-brass/30 hover:border-mpca-oxblood hover:bg-mpca-cream/40 transition-colors" data-testid={`scheme-opt-${s.scheme_code}`}>
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-serif text-base text-mpca-green-dark">Scheme {s.scheme_code} · {s.name}</div>
                                                            <div className="text-[11px] text-mpca-gray-dark mt-1">{s.description}</div>
                                                            <div className="text-[10px] text-mpca-brass mt-1">{s.heads.length} budget heads · {(s.categories || []).join(", ")}</div>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <div className="overline text-[9px]">Step 2</div>
                                                <div className="font-serif text-2xl text-mpca-green-dark">② Tournament Parameters</div>
                                                <div className="text-[11px] text-mpca-brass mt-1 font-mono">Scheme {schemeInputSpec?.scheme_code} · {schemeInputSpec?.scheme_name}</div>
                                            </div>
                                            <button className="text-[11px] text-mpca-brass uppercase tracking-widest" onClick={() => setSchemePickerStep("choose")}>← Back</button>
                                        </div>
                                        {schemeInputSpec?.input_variables?.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                                                {schemeInputSpec.input_variables.map((v) => (
                                                    <label key={v.key} className="block">
                                                        <div className="overline text-[9px] mb-1">{v.label}{v.unit && <span className="text-mpca-gray-dark ml-1">({v.unit})</span>}</div>
                                                        {v.type === "select" ? (
                                                            <select className="input-heritage" value={calcInputs[v.key] ?? v.default} onChange={(e) => setInput(v.key, e.target.value)} data-testid={`calc-${v.key}`}>
                                                                {(v.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                        ) : (
                                                            <input type="number" className="input-heritage" value={calcInputs[v.key] ?? v.default ?? 0} onChange={(e) => setInput(v.key, e.target.value)} data-testid={`calc-${v.key}`} />
                                                        )}
                                                        {v.hint && <div className="text-[9px] text-mpca-gray-dark mt-0.5">{v.hint}</div>}
                                                    </label>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mb-4 p-3 border border-mpca-brass/30 text-[11px] text-mpca-gray-dark italic">
                                                No input formula defined for this scheme. Budget will use scheme base rates as head limits.
                                            </div>
                                        )}
                                        {computedBudget && (
                                            <div className="bulletin-card p-4">
                                                <div className="flex justify-between items-center mb-3">
                                                    <div className="overline text-[9px]">Computed Budget {computing && <span className="ml-2 text-mpca-brass">recalculating...</span>}</div>
                                                    <div className="font-serif text-2xl text-mpca-oxblood" data-testid="computed-total">₹{Math.round(computedBudget.total_ceiling_inr).toLocaleString("en-IN")}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    {computedBudget.head_allocations.map((h, i) => (
                                                        <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs border-b border-mpca-brass/10 pb-1" data-testid={`computed-head-${i}`}>
                                                            <div className="col-span-6 text-mpca-green-dark">{h.head}</div>
                                                            <div className="col-span-4 text-[10px] text-mpca-brass font-mono truncate">{h.formula}</div>
                                                            <div className="col-span-2 text-right font-mono text-mpca-green-dark">₹{Math.round(h.limit_inr).toLocaleString("en-IN")}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="mt-4 flex justify-end gap-2">
                                            <button className="btn-heritage-secondary" onClick={() => { setShowSchemePicker(false); setSchemePickerStep("choose"); }}>Cancel</button>
                                            <button className="btn-heritage-primary" onClick={assignScheme} disabled={!computedBudget || computing} data-testid="assign-scheme-btn">Assign Scheme &amp; Create Budget</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ============= Tab 2: Invoices ============= */}
            {tab === "Invoices" && (
                <div data-testid="tab-panel-invoices">
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-sm text-mpca-gray-dark">{invoices.length} invoice(s) · Total {fmt(invoices.reduce((s, i) => s + (i.total_inr || 0), 0))}</div>
                        {isOfficeBearer && budget && (
                            <button className="btn-heritage-primary" onClick={() => setShowInvForm(true)} data-testid="add-invoice-btn">
                                <Plus size={12} /> Add Invoice
                            </button>
                        )}
                    </div>

                    {invoices.length === 0 ? (
                        <div className="bulletin-card p-12 text-center">
                            <FileText className="mx-auto text-mpca-brass mb-3" size={32} />
                            <div className="font-serif text-lg text-mpca-green-dark">No invoices submitted yet.</div>
                            <p className="text-[11px] text-mpca-gray-dark mt-2">Upload invoices to claim reimbursement. AI will auto-extract details.</p>
                        </div>
                    ) : (
                        <div className="bulletin-card overflow-hidden">
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                                <div className="col-span-3">Vendor · Invoice #</div>
                                <div className="col-span-2">Date</div>
                                <div className="col-span-3">Head Allocations</div>
                                <div className="col-span-2 text-right">Total</div>
                                <div className="col-span-1">Status</div>
                                <div className="col-span-1 text-right">Action</div>
                            </div>
                            {invoices.map((inv) => (
                                <div key={inv.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center border-b border-mpca-brass/10 text-xs" data-testid={`invoice-row-${inv.id}`}>
                                    <div className="col-span-3">
                                        <div className="text-mpca-green-dark">{inv.vendor_name || "—"}</div>
                                        <div className="text-[10px] font-mono text-mpca-brass">{inv.invoice_no || inv.invoice_ref}</div>
                                    </div>
                                    <div className="col-span-2 text-[11px] text-mpca-gray-dark">{inv.invoice_date || "—"}</div>
                                    <div className="col-span-3 text-[11px]">
                                        {(inv.allocations || []).length > 0 ? (
                                            <div className="space-y-0.5">
                                                {inv.allocations.slice(0, 2).map((a, i) => (
                                                    <div key={i}><span className="text-mpca-brass">{a.head_label}</span>: <span className="font-mono">{fmt(a.amount_inr)}</span></div>
                                                ))}
                                                {inv.allocations.length > 2 && <div className="text-[10px] text-mpca-gray-dark">+ {inv.allocations.length - 2} more</div>}
                                            </div>
                                        ) : (
                                            <span className="text-mpca-gray-dark italic">{inv.budget_head_code || "Unallocated"}</span>
                                        )}
                                    </div>
                                    <div className="col-span-2 text-right font-mono text-mpca-green-dark font-semibold">{fmt(inv.total_inr)}</div>
                                    <div className="col-span-1">
                                        <span className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 border ${
                                            inv.status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" :
                                            inv.status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" :
                                            inv.status === "Submitted" ? "border-mpca-brass text-mpca-brass" :
                                            "border-mpca-gray-dark text-mpca-gray-dark"
                                        }`}>{inv.status}</span>
                                    </div>
                                    <div className="col-span-1 text-right flex justify-end gap-1">
                                        {inv.file_url && (
                                            <a href={`${BACKEND_URL}${inv.file_url}`} target="_blank" rel="noreferrer" className="text-mpca-brass" title="Open file" data-testid={`open-file-${inv.id}`}>
                                                <ExternalLink size={12} />
                                            </a>
                                        )}
                                        {inv.status === "Draft" && (
                                            <button onClick={() => submitInvoice(inv.id)} className="text-[10px] text-mpca-green-dark" data-testid={`submit-inv-${inv.id}`}>Submit</button>
                                        )}
                                        {inv.status === "Submitted" && persona?.body_type === "State" && (
                                            <button onClick={() => approveInvoice(inv.id)} className="text-[10px] text-mpca-brass" data-testid={`approve-inv-${inv.id}`}>Approve</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Invoice form modal */}
                    {showInvForm && (
                        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setShowInvForm(false)}>
                            <div className="bulletin-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="invoice-form-modal">
                                <div className="font-serif text-2xl text-mpca-green-dark mb-4">Add Invoice</div>

                                {/* Upload area */}
                                <div className="mb-4 border-2 border-dashed border-mpca-brass/40 p-4 rounded">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="overline text-[9px]">Invoice File (PDF / Image)</div>
                                            {invForm.file_url ? (
                                                <div className="text-xs text-mpca-green-dark mt-1 flex items-center gap-2">
                                                    <FileText size={12} /> {invForm.filename}
                                                    <a href={`${BACKEND_URL}${invForm.file_url}`} target="_blank" rel="noreferrer" className="text-mpca-brass"><ExternalLink size={11} /></a>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-mpca-gray-dark mt-1">Upload the invoice PDF or image, then let AI extract details.</div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <label className="btn-heritage-secondary cursor-pointer">
                                                <Upload size={12} /> {uploading ? "Uploading..." : "Upload"}
                                                <input type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])} data-testid="invoice-file-input" />
                                            </label>
                                            {invForm.file_url && (
                                                <button className="btn-heritage-primary" onClick={runAIExtract} disabled={aiRunning} data-testid="ai-extract-btn">
                                                    <Sparkles size={12} /> {aiRunning ? "Extracting..." : "AI Extract"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Manual fields */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                                    <label><div className="overline text-[9px] mb-1">Vendor Name *</div><input className="input-heritage" value={invForm.vendor_name} onChange={(e) => setInvForm({ ...invForm, vendor_name: e.target.value })} data-testid="inv-vendor" /></label>
                                    <label><div className="overline text-[9px] mb-1">Invoice #</div><input className="input-heritage" value={invForm.invoice_no} onChange={(e) => setInvForm({ ...invForm, invoice_no: e.target.value })} data-testid="inv-no" /></label>
                                    <label><div className="overline text-[9px] mb-1">Date</div><input type="date" className="input-heritage" value={invForm.invoice_date} onChange={(e) => setInvForm({ ...invForm, invoice_date: e.target.value })} data-testid="inv-date" /></label>
                                    <label><div className="overline text-[9px] mb-1">Amount (₹, ex-GST)</div><input type="number" className="input-heritage" value={invForm.amount_inr} onChange={(e) => setInvForm({ ...invForm, amount_inr: e.target.value, total_inr: (parseFloat(e.target.value) || 0) + (parseFloat(invForm.gst_inr) || 0) })} data-testid="inv-amount" /></label>
                                    <label><div className="overline text-[9px] mb-1">GST (₹)</div><input type="number" className="input-heritage" value={invForm.gst_inr} onChange={(e) => setInvForm({ ...invForm, gst_inr: e.target.value, total_inr: (parseFloat(invForm.amount_inr) || 0) + (parseFloat(e.target.value) || 0) })} data-testid="inv-gst" /></label>
                                    <label><div className="overline text-[9px] mb-1">Total (₹)</div><input type="number" className="input-heritage bg-mpca-cream/40" value={invForm.total_inr} onChange={(e) => setInvForm({ ...invForm, total_inr: e.target.value })} data-testid="inv-total" /></label>
                                </div>

                                {/* Multi-head allocations */}
                                <div className="mt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="overline text-[9px]">Budget Head Allocations (one invoice can span multiple heads)</div>
                                        <button onClick={addAllocation} className="text-[10px] text-mpca-brass uppercase tracking-widest flex items-center gap-1" data-testid="add-alloc-btn">
                                            <Plus size={11} /> Add Head
                                        </button>
                                    </div>
                                    {invForm.allocations.length === 0 && (
                                        <div className="p-3 border border-dashed border-mpca-brass/30 text-[11px] text-mpca-gray-dark italic">
                                            No head allocations yet. If skipped, entire amount will be classified under &quot;Unallocated&quot;.
                                        </div>
                                    )}
                                    {invForm.allocations.map((a, i) => (
                                        <div key={i} className="grid grid-cols-12 gap-2 items-end mb-2" data-testid={`alloc-row-${i}`}>
                                            <div className="col-span-6">
                                                <div className="overline text-[9px] mb-1">Head</div>
                                                <select className="input-heritage" value={a.head_label} onChange={(e) => {
                                                    const opt = budgetHeads.find((h) => h.head === e.target.value);
                                                    updateAllocation(i, "head_label", e.target.value);
                                                    updateAllocation(i, "head_code", (e.target.value || "").replace(/\s+/g, "_").toUpperCase());
                                                }} data-testid={`alloc-head-${i}`}>
                                                    <option value="">Select head...</option>
                                                    {budgetHeads.map((h) => <option key={h.head} value={h.head}>{h.head}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-4">
                                                <div className="overline text-[9px] mb-1">Amount (₹)</div>
                                                <input type="number" className="input-heritage" value={a.amount_inr} onChange={(e) => updateAllocation(i, "amount_inr", e.target.value)} data-testid={`alloc-amount-${i}`} />
                                            </div>
                                            <div className="col-span-2">
                                                <button onClick={() => removeAllocation(i)} className="text-mpca-oxblood" data-testid={`del-alloc-${i}`}><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                    {invForm.allocations.length > 0 && (
                                        <div className={`text-[11px] mt-2 ${Math.abs(totalsForAlloc - (parseFloat(invForm.total_inr) || 0)) < 1 ? "text-mpca-green-dark" : "text-mpca-oxblood"}`}>
                                            Allocated {fmt(totalsForAlloc)} of Invoice Total {fmt(invForm.total_inr)}
                                            {Math.abs(totalsForAlloc - (parseFloat(invForm.total_inr) || 0)) >= 1 && <span> · <AlertTriangle size={10} className="inline" /> Must match total exactly</span>}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 flex justify-end gap-2">
                                    <button className="btn-heritage-secondary" onClick={() => setShowInvForm(false)}>Cancel</button>
                                    <button className="btn-heritage-primary" onClick={saveInvoice} disabled={!invForm.vendor_name || !invForm.total_inr} data-testid="save-invoice-btn">
                                        Save Invoice
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ============= Tab 3: Extra Expense ============= */}
            {tab === "Extra Expense" && (
                <div data-testid="tab-panel-extra-expense">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <div className="text-sm text-mpca-gray-dark">{extras.length} extra-expense request(s)</div>
                            <div className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl">
                                Divisions can request MPCA approval for expenses not covered by the pre-defined budget. MPCA Secretary approves/rejects.
                            </div>
                        </div>
                        {(persona?.body_type === "Division" || persona?.body_type === "District") && (
                            <button className="btn-heritage-primary" onClick={() => setShowExtraForm(true)} data-testid="new-extra-btn">
                                <Plus size={12} /> Request Extra Expense
                            </button>
                        )}
                    </div>

                    {extras.length === 0 ? (
                        <div className="bulletin-card p-8 text-center text-mpca-gray-dark text-sm">No extra expense requests yet.</div>
                    ) : (
                        <div className="bulletin-card overflow-hidden">
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                                <div className="col-span-4">Head</div>
                                <div className="col-span-2 text-right">Requested</div>
                                <div className="col-span-2 text-right">Approved</div>
                                <div className="col-span-2">Status</div>
                                <div className="col-span-2 text-right">Action</div>
                            </div>
                            {extras.map((e) => (
                                <div key={e.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center border-b border-mpca-brass/10 text-xs" data-testid={`extra-row-${e.id}`}>
                                    <div className="col-span-4">
                                        <div className="text-mpca-green-dark">{e.head_label}</div>
                                        <div className="text-[10px] text-mpca-gray-dark truncate">{e.justification}</div>
                                    </div>
                                    <div className="col-span-2 text-right font-mono">{fmt(e.amount_inr)}</div>
                                    <div className="col-span-2 text-right font-mono text-mpca-green-dark">{fmt(e.approved_amount_inr || 0)}</div>
                                    <div className="col-span-2">
                                        <span className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 border ${
                                            e.status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" :
                                            e.status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" :
                                            e.status === "Submitted" ? "border-mpca-brass text-mpca-brass" :
                                            "border-mpca-gray-dark text-mpca-gray-dark"
                                        }`}>{e.status}</span>
                                    </div>
                                    <div className="col-span-2 text-right">
                                        {e.status === "Submitted" && persona?.id === "secretary" && (
                                            <button onClick={() => approveExtra(e.id)} className="text-[10px] text-mpca-brass uppercase tracking-widest" data-testid={`approve-extra-${e.id}`}>MPCA Approve</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {showExtraForm && (
                        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setShowExtraForm(false)}>
                            <div className="bulletin-card p-6 max-w-2xl w-full" onClick={(e) => e.stopPropagation()} data-testid="extra-form-modal">
                                <div className="font-serif text-2xl text-mpca-green-dark mb-4">Request Extra Expense Approval</div>
                                <div className="grid gap-3">
                                    <label><div className="overline text-[9px] mb-1">Head Label *</div><input className="input-heritage" value={extraForm.head_label} onChange={(e) => setExtraForm({ ...extraForm, head_label: e.target.value, head_code: e.target.value.replace(/\s+/g, "_").toUpperCase() })} placeholder="e.g. Emergency Medical Supplies" data-testid="extra-head-label" /></label>
                                    <label><div className="overline text-[9px] mb-1">Amount (₹) *</div><input type="number" className="input-heritage" value={extraForm.amount_inr} onChange={(e) => setExtraForm({ ...extraForm, amount_inr: e.target.value })} data-testid="extra-amount" /></label>
                                    <label><div className="overline text-[9px] mb-1">Justification * (min 10 chars)</div><textarea rows={4} className="input-heritage" value={extraForm.justification} onChange={(e) => setExtraForm({ ...extraForm, justification: e.target.value })} placeholder="Why is this required outside the pre-defined budget?" data-testid="extra-justification" /></label>
                                    <label className="flex items-center gap-2 text-sm text-mpca-gray-dark">
                                        <input type="checkbox" checked={extraForm.is_new_head} onChange={(e) => setExtraForm({ ...extraForm, is_new_head: e.target.checked })} />
                                        This is a new budget head not covered by the scheme
                                    </label>
                                </div>
                                <div className="mt-4 flex justify-end gap-2">
                                    <button className="btn-heritage-secondary" onClick={() => setShowExtraForm(false)}>Cancel</button>
                                    <button className="btn-heritage-primary" onClick={submitExtra} disabled={!extraForm.head_label || (extraForm.justification || "").length < 10} data-testid="save-extra-btn">Submit Request</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ============= Tab 4: Budget vs Actual ============= */}
            {tab === "Budget vs Actual" && (
                <div data-testid="tab-panel-budget-vs-actual">
                    {!tracker ? (
                        <div className="bulletin-card p-8 text-center text-mpca-gray-dark text-sm">No budget tracker available yet — assign a scheme first.</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
                                <div className="bulletin-card p-4" data-testid="tracker-approved">
                                    <div className="overline text-[9px]">Approved Budget</div>
                                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">{fmt(tracker.totals.approved_inr)}</div>
                                </div>
                                <div className="bulletin-card p-4" data-testid="tracker-spent">
                                    <div className="overline text-[9px]">Spent</div>
                                    <div className="font-serif text-2xl text-mpca-oxblood mt-1">{fmt(tracker.totals.spent_inr)}</div>
                                </div>
                                <div className="bulletin-card p-4" data-testid="tracker-remaining">
                                    <div className="overline text-[9px]">Remaining</div>
                                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">{fmt(tracker.totals.remaining_inr)}</div>
                                </div>
                                <div className="bulletin-card p-4" data-testid="tracker-over">
                                    <div className="overline text-[9px]">Over-Budget</div>
                                    <div className="font-serif text-2xl text-mpca-oxblood mt-1">{fmt(tracker.totals.over_budget_inr)}</div>
                                </div>
                            </div>

                            <div className="bulletin-card overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                                    <div className="col-span-4">Head</div>
                                    <div className="col-span-2 text-right">Limit</div>
                                    <div className="col-span-2 text-right">Spent</div>
                                    <div className="col-span-2 text-right">Remaining</div>
                                    <div className="col-span-2">Utilisation</div>
                                </div>
                                {tracker.heads.map((h, i) => (
                                    <div key={i} className={`grid grid-cols-12 gap-2 px-3 py-2.5 items-center border-b border-mpca-brass/10 text-xs ${h.over_budget_inr > 0 ? "bg-mpca-oxblood/5" : ""}`} data-testid={`bva-head-${i}`}>
                                        <div className="col-span-4 text-mpca-green-dark">{h.head}</div>
                                        <div className="col-span-2 text-right font-mono">{fmt(h.limit_inr)}</div>
                                        <div className={`col-span-2 text-right font-mono ${h.over_budget_inr > 0 ? "text-mpca-oxblood" : ""}`}>{fmt(h.spent_inr)}</div>
                                        <div className="col-span-2 text-right font-mono">{fmt(h.remaining_inr)}</div>
                                        <div className="col-span-2">
                                            <div className="h-1.5 bg-mpca-brass/15">
                                                <div className={`h-full ${h.utilisation_pct > 100 ? "bg-mpca-oxblood" : h.utilisation_pct > 80 ? "bg-mpca-brass" : "bg-mpca-green-dark"}`} style={{ width: `${Math.min(h.utilisation_pct, 100)}%` }} />
                                            </div>
                                            <div className="text-[9px] font-mono mt-0.5">{h.utilisation_pct}%</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {canSubmitClaim && (
                                <div className="mt-6 p-5 border-2 border-mpca-brass/40 bg-mpca-cream/40">
                                    <div className="font-serif text-lg text-mpca-green-dark mb-2">Ready to Claim Reimbursement?</div>
                                <p className="text-sm text-mpca-gray-dark mt-2 max-w-2xl">
                                    Once the tournament is complete and all invoices are uploaded, submit the reimbursement claim to MPCA. A summary sheet will be auto-generated and sent to the MPCA Secretary for review.
                                    </p>
                                    <button className="btn-heritage-primary" onClick={submitClaim} data-testid="submit-claim-bva-btn">
                                        <Send size={12} /> Submit Reimbursement Claim to MPCA
                                    </button>
                                </div>
                            )}

                            {claim && (
                                <div className="mt-6 bulletin-card p-4" data-testid="claim-status-card">
                                    <div className="overline text-[9px] mb-2">Reimbursement Claim · {claim.claim_ref}</div>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="text-sm text-mpca-green-dark">Status: <span className="font-semibold">{claim.status.replace(/_/g, " ")}</span></div>
                                            {claim.submitted_at && <div className="text-[11px] text-mpca-gray-dark">Submitted {new Date(claim.submitted_at).toLocaleString()}</div>}
                                        </div>
                                        <button className="btn-heritage-secondary" onClick={() => navigate(`/reimbursement-claims/${claim.id}`)} data-testid="view-claim-btn">
                                            View Claim →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const ChevronRightIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-mpca-brass"><path d="m9 6 6 6-6 6" /></svg>
);

export default TournamentFinanceDetail;
