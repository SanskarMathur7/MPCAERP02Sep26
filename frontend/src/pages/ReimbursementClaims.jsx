import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, CheckCircle2, XCircle, ClipboardList } from "lucide-react";
import { api, BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const StatusBadge = ({ status }) => {
    const map = {
        Approved: "border-mpca-green-dark text-mpca-green-dark bg-mpca-green-dark/5",
        Rejected: "border-mpca-oxblood text-mpca-oxblood bg-mpca-oxblood/5",
        Submitted: "border-mpca-brass text-mpca-brass bg-mpca-brass/5",
        Under_Review: "border-mpca-brass text-mpca-brass bg-mpca-brass/10",
        Draft: "border-mpca-gray-dark text-mpca-gray-dark bg-mpca-cream",
    };
    return (
        <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 border ${map[status] || map.Draft}`}>
            {status.replace(/_/g, " ")}
        </span>
    );
};

// ═══════════════════ LIST PAGE ═══════════════════
export const ReimbursementClaimsList = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [claims, setClaims] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("Submitted");

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/reimbursement-claims");
            setClaims(data || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        let list = claims;
        if (persona?.body_type === "Division") list = list.filter((c) => c.body_id === persona.body_code);
        else if (persona?.body_type === "District") list = list.filter((c) => c.body_id === persona.body_code);
        if (filter !== "all") list = list.filter((c) => c.status === filter);
        return list;
    }, [claims, filter, persona]);

    const filters = ["Submitted", "Under_Review", "Approved", "Rejected", "all"];
    const counts = claims.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {});

    if (loading) return <CricketLoader label="Loading claims..." />;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="reimbursement-claims-list-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Financial · Reimbursement Review</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Reimbursement Claims</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Tournament-completion claims submitted by Divisions/Districts for MPCA reimbursement. MPCA Secretary reviews with auto-generated summary sheets.
                    </p>
                </div>
            </div>

            <div className="flex gap-1 mb-5 flex-wrap">
                {filters.map((f) => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 text-[11px] uppercase tracking-widest border ${filter === f ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-brass/40 text-mpca-green-dark"}`}
                        data-testid={`claims-filter-${f}`}>
                        {f === "all" ? "All" : f.replace(/_/g, " ")} {counts[f] ? `(${counts[f]})` : ""}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="bulletin-card p-12 text-center">
                    <ClipboardList className="mx-auto text-mpca-brass mb-3" size={32} />
                    <div className="font-serif text-xl text-mpca-green-dark">No claims in this bucket.</div>
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden">
                    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                        <div className="col-span-3">Claim · Ref</div>
                        <div className="col-span-3">Tournament</div>
                        <div className="col-span-2">Division</div>
                        <div className="col-span-2 text-right">Eligible</div>
                        <div className="col-span-2">Status</div>
                    </div>
                    {filtered.map((c) => (
                        <div key={c.id}
                            className="grid grid-cols-12 gap-3 px-4 py-3 items-center border-b border-mpca-brass/10 cursor-pointer hover:bg-mpca-cream/40"
                            onClick={() => navigate(`/reimbursement-claims/${c.id}`)}
                            data-testid={`claim-row-${c.id}`}>
                            <div className="col-span-3">
                                <div className="font-mono text-mpca-brass text-xs">{c.claim_ref}</div>
                                <div className="text-[10px] text-mpca-gray-dark">{c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : "—"}</div>
                            </div>
                            <div className="col-span-3 font-serif text-sm text-mpca-green-dark">
                                {c.tournament_name}
                                {(c.pool_name || c.role_flavour) && (
                                    <div className="text-[9px] uppercase tracking-widest text-mpca-oxblood mt-0.5" data-testid={`claim-scope-${c.id}`}>
                                        {c.pool_name}{c.pool_name && c.role_flavour ? " · " : ""}{c.role_flavour}
                                    </div>
                                )}
                            </div>
                            <div className="col-span-2 text-xs">{c.body_name}</div>
                            <div className="col-span-2 text-right font-mono text-sm text-mpca-green-dark">{fmt((c.summary || {}).eligible_total_inr)}</div>
                            <div className="col-span-2"><StatusBadge status={c.status} /></div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ═══════════════════ MPCA-168 v2 · Head-Level Deductions Panel ═══════════════════
// MPCA reviews the Division's claim by adding DEDUCTIONS against budget heads
// (instead of per-invoice accept/reject). Accepted-by-MPCA per head =
// Spent by Division − Σ deductions on that head. MPCA still signs & uploads
// the review PDF; Approve button unlocks after upload.
const MpcaLineItemReviewPanel = ({ claim, invoices, persona, onChange }) => {
    const [summary, setSummary] = useState(null);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ head: "", amount_inr: "", reason: "" });
    const [busy, setBusy] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get(`/reimbursement-claims/${claim.id}/review-summary`);
            setSummary(data);
        } catch { /* ignore */ }
    };
    useEffect(() => { load(); }, [claim.id, claim.mpca_deductions?.length, claim.updated_at]);

    const deductions = summary?.mpca_deductions || claim.mpca_deductions || [];
    const heads = summary?.heads || [];
    const totals = summary?.totals || {};
    const remarks = summary?.division_head_remarks || claim.division_head_remarks || {};
    const totalSpent = totals.spent_inr || 0;
    const totalDeducted = deductions.reduce((s, d) => s + Number(d.amount_inr || 0), 0);
    const totalAccepted = Math.max(totalSpent - totalDeducted, 0);
    const hasMpcaSigned = !!claim.mpca_signed_pdf_url;
    // Heads eligible for a new deduction — show ALL budget heads submitted by
    // the Division (any head with sanctioned budget OR actual spend). This
    // lets MPCA add a deduction against a head even before an invoice hits it.
    const deductibleHeads = heads.filter((h) => (h.budget_inr || 0) > 0 || (h.spent_inr || 0) > 0);

    const addDeduction = async () => {
        if (!form.head || !(parseFloat(form.amount_inr) > 0)) return;
        setBusy(true);
        try {
            await api.post(`/reimbursement-claims/${claim.id}/deduction`, {
                head: form.head,
                amount_inr: parseFloat(form.amount_inr),
                reason: form.reason.trim() || null,
            });
            setForm({ head: "", amount_inr: "", reason: "" });
            setAdding(false);
            await onChange();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const removeDeduction = async (ded_id) => {
        if (!window.confirm("Remove this deduction row?")) return;
        setBusy(true);
        try {
            await api.delete(`/reimbursement-claims/${claim.id}/deduction/${ded_id}`);
            await onChange();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const uploadMpcaSignedPdf = async (file) => {
        if (!file) return;
        setUploadingPdf(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "reimbursement_claim_mpca_signed");
            fd.append("related_id", claim.id);
            const upRes = await fetch(`${BACKEND_URL}/api/uploads`, { method: "POST", body: fd });
            if (!upRes.ok) throw new Error("Upload failed");
            const up = await upRes.json();
            await api.post(`/reimbursement-claims/${claim.id}/mpca-signed-pdf`, {
                signed_pdf_url: up.url,
                uploaded_by: persona?.name,
            });
            await onChange();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploadingPdf(false); }
    };

    // Aggregate deductions per head for the summary table.
    const dedByHead = {};
    for (const d of deductions) {
        const h = (d.head || "").trim();
        dedByHead[h] = (dedByHead[h] || 0) + Number(d.amount_inr || 0);
    }

    return (
        <div className="bulletin-card p-0 overflow-hidden mb-6 border-mpca-navy" data-testid="mpca-line-item-review-panel">
            <div className="p-4 bg-mpca-navy/10 border-b border-mpca-navy/40">
                <div className="overline text-[9px] text-mpca-navy">MPCA-168 · Head-Level Deductions</div>
                <div className="font-serif text-lg text-mpca-green-dark mt-1">Add deductions per budget head · Sign PDF · Approve</div>
                <div className="text-[11px] text-mpca-gray-dark mt-1">
                    {deductions.length} deduction(s) recorded · Total accepted so far:
                    <b className="text-mpca-green-dark"> ₹{totalAccepted.toLocaleString("en-IN")}</b>
                    {" "}(Spent ₹{totalSpent.toLocaleString("en-IN")} − Deducted ₹{totalDeducted.toLocaleString("en-IN")})
                </div>
            </div>

            {/* Head-wise Budget / Spent / Deducted / Accepted table (+ Division Remarks) */}
            <div>
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                    <div className="col-span-3">Head</div>
                    <div className="col-span-1 text-right">Budget</div>
                    <div className="col-span-2 text-right">Spent by Division</div>
                    <div className="col-span-1 text-right">Deducted</div>
                    <div className="col-span-2 text-right">Accepted by MPCA</div>
                    <div className="col-span-3">Division Remark</div>
                </div>
                {heads.map((h, i) => {
                    const dh = dedByHead[h.head] || 0;
                    const accepted = Math.max((h.spent_inr || 0) - dh, 0);
                    return (
                        <div key={h.head + i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-mpca-brass/10 text-xs" data-testid={`mpca-head-row-${i}`}>
                            <div className="col-span-3">{h.head}</div>
                            <div className="col-span-1 text-right font-mono">{fmt(h.budget_inr)}</div>
                            <div className="col-span-2 text-right font-mono text-mpca-navy">{fmt(h.spent_inr)}</div>
                            <div className="col-span-1 text-right font-mono text-mpca-oxblood">{dh ? "−" + fmt(dh) : "—"}</div>
                            <div className="col-span-2 text-right font-mono text-mpca-green-dark font-semibold">{fmt(accepted)}</div>
                            <div className="col-span-3 text-[10px] italic text-mpca-brass truncate" title={remarks[h.head] || ""}>
                                {remarks[h.head] || "—"}
                            </div>
                        </div>
                    );
                })}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-parchment font-semibold border-y-2 border-mpca-brass/40 text-xs" data-testid="mpca-head-totals">
                    <div className="col-span-3 uppercase text-[10px] tracking-widest">Total</div>
                    <div className="col-span-1 text-right font-mono">{fmt(totals.budget_inr)}</div>
                    <div className="col-span-2 text-right font-mono text-mpca-navy">{fmt(totalSpent)}</div>
                    <div className="col-span-1 text-right font-mono text-mpca-oxblood">{totalDeducted ? "−" + fmt(totalDeducted) : "—"}</div>
                    <div className="col-span-2 text-right font-mono text-mpca-green-dark">{fmt(totalAccepted)}</div>
                    <div className="col-span-3" />
                </div>
            </div>

            {/* Deduction rows + Add form */}
            <div className="p-3 border-b border-mpca-brass/20 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-brass">Deductions ({deductions.length})</div>
                {!adding && (
                    <button onClick={() => setAdding(true)} disabled={busy}
                        className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-parchment px-3 py-1.5 disabled:opacity-40"
                        data-testid="mpca-add-deduction-btn">
                        + Add Deduction
                    </button>
                )}
            </div>
            {deductions.length === 0 && !adding && (
                <div className="px-4 py-3 text-xs italic text-mpca-gray-dark">No deductions recorded — the full amount spent by Division will be accepted on approval.</div>
            )}
            {deductions.map((d) => (
                <div key={d.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-mpca-brass/10 text-xs bg-mpca-oxblood/5" data-testid={`mpca-deduction-row-${d.id}`}>
                    <div className="col-span-3 text-mpca-oxblood font-semibold">{d.head}</div>
                    <div className="col-span-2 text-right font-mono text-mpca-oxblood">−{fmt(d.amount_inr)}</div>
                    <div className="col-span-6 text-[10px] italic text-mpca-brass">{d.reason || "—"}</div>
                    <div className="col-span-1 text-right">
                        <button onClick={() => removeDeduction(d.id)} disabled={busy}
                            className="text-mpca-oxblood hover:text-mpca-oxblood/70 text-[10px] uppercase" title="Remove">×</button>
                    </div>
                </div>
            ))}
            {adding && (
                <div className="p-3 bg-mpca-oxblood/5 border-b border-mpca-brass/20 space-y-2" data-testid="mpca-add-deduction-form">
                    <div className="grid grid-cols-12 gap-2 items-end">
                        <label className="col-span-4">
                            <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">Budget Head</div>
                            <select value={form.head} onChange={(e) => setForm((f) => ({ ...f, head: e.target.value }))}
                                className="input-heritage !py-1.5 !text-xs" data-testid="ded-form-head">
                                <option value="">— Select head —</option>
                                {deductibleHeads.map((h) => {
                                    const spent = h.spent_inr || 0;
                                    const label = spent > 0
                                        ? `${h.head} · spent ${fmt(spent)}`
                                        : `${h.head} · budget ${fmt(h.budget_inr || 0)} · no spend yet`;
                                    return (
                                        <option key={h.head} value={h.head}>{label}</option>
                                    );
                                })}
                            </select>
                        </label>
                        <label className="col-span-3">
                            <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">Deduction ₹</div>
                            <input type="number" min="1" value={form.amount_inr}
                                onChange={(e) => setForm((f) => ({ ...f, amount_inr: e.target.value }))}
                                className="input-heritage !py-1.5 !text-xs font-mono text-right" data-testid="ded-form-amount" />
                        </label>
                        <label className="col-span-4">
                            <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">Reason</div>
                            <input type="text" value={form.reason}
                                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                                placeholder="e.g. Hotel bill lacks GST invoice"
                                className="input-heritage !py-1.5 !text-xs" data-testid="ded-form-reason" />
                        </label>
                        <div className="col-span-1 flex flex-col gap-1">
                            <button onClick={addDeduction} disabled={busy || !form.head || !(parseFloat(form.amount_inr) > 0)}
                                className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-parchment px-2 py-1.5 disabled:opacity-40"
                                data-testid="ded-form-save">Save</button>
                            <button onClick={() => { setAdding(false); setForm({ head: "", amount_inr: "", reason: "" }); }}
                                className="text-[9px] uppercase tracking-widest border border-mpca-brass/40 px-2 py-1">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MPCA signed decision PDF strip */}
            <div className="p-3 border-t-2 border-mpca-navy/40 bg-mpca-navy/5 flex items-center gap-3 flex-wrap" data-testid="mpca-signed-pdf-strip">
                <div className="flex-1 min-w-[200px] text-[11px] text-mpca-charcoal/85">
                    {hasMpcaSigned ? (
                        <>MPCA-signed decision PDF uploaded on {new Date(claim.mpca_signed_pdf_uploaded_at || Date.now()).toLocaleDateString("en-IN")}. Ready to <b>Approve</b> ₹{totalAccepted.toLocaleString("en-IN")}.</>
                    ) : (
                        <>Generate the MPCA Review PDF, sign it and upload back to unlock <b>Approve</b>.</>
                    )}
                </div>
                <a href={`/reimbursement-claims/${claim.id}/mpca-review-form`} target="_blank" rel="noreferrer"
                    className="text-[10px] uppercase tracking-widest bg-mpca-navy text-mpca-parchment px-3 py-1.5"
                    data-testid="mpca-review-pdf-btn">Print MPCA Review PDF</a>
                {hasMpcaSigned && (
                    <a href={claim.mpca_signed_pdf_url} target="_blank" rel="noreferrer"
                        className="text-[10px] uppercase tracking-widest text-mpca-green-dark hover:underline">View signed PDF</a>
                )}
                <label className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-parchment px-3 py-1.5 cursor-pointer" data-testid="mpca-signed-pdf-upload">
                    {uploadingPdf ? "Uploading…" : (hasMpcaSigned ? "Replace signed" : "Upload signed PDF")}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                        className="hidden" disabled={uploadingPdf}
                        onChange={(e) => uploadMpcaSignedPdf(e.target.files?.[0])} />
                </label>
            </div>
        </div>
    );
};

// ═══════════════════ DETAIL PAGE ═══════════════════
export const ReimbursementClaimDetail = () => {
    const { id } = useParams();
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [claim, setClaim] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [extras, setExtras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [approveOpen, setApproveOpen] = useState(false);
    const [approveAmt, setApproveAmt] = useState(0);
    const [liveSpent, setLiveSpent] = useState(0);
    const [reviewSummary, setReviewSummary] = useState(null);
    const [tournament, setTournament] = useState(null);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/reimbursement-claims/${id}`);
            setClaim(data);
            // Load tournament for locked-snapshot watermark
            if (data.tournament_id) {
                api.get(`/tournaments/${data.tournament_id}`).then((r) => setTournament(r.data)).catch(() => {});
            }
            // Live spent from review-summary (top-level claim.summary.spent_inr is stale-at-submit).
            let spent = Number(data.summary?.spent_inr || 0);
            try {
                const rs = await api.get(`/reimbursement-claims/${id}/review-summary`);
                setReviewSummary(rs?.data || null);
                if (rs?.data?.totals?.spent_inr != null) spent = Number(rs.data.totals.spent_inr);
            } catch { /* ignore — fall back to summary */ }
            const ded = (data.mpca_deductions || []).reduce((t, d) => t + Number(d.amount_inr || 0), 0);
            setApproveAmt(Math.max(spent - ded, 0));
            setLiveSpent(spent);
            // Load referenced invoices + extras
            if (data.invoice_ids?.length) {
                const invRes = await Promise.all(data.invoice_ids.map((iid) => api.get(`/tournament-invoices/${iid}`).catch(() => ({ data: null }))));
                setInvoices(invRes.map((r) => r.data).filter(Boolean));
            }
            if (data.extra_expense_ids?.length) {
                const eRes = await Promise.all(data.extra_expense_ids.map((eid) => api.get(`/extra-expense-requests/${eid}`).catch(() => ({ data: null }))));
                setExtras(eRes.map((r) => r.data).filter(Boolean));
            }
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [id]);

    const isMPCA = persona?.body_type === "State";
    const canStartReview = isMPCA && claim?.status === "Submitted";
    const canDecide = isMPCA && (claim?.status === "Submitted" || claim?.status === "Under_Review");

    const startReview = async () => {
        try {
            await api.post(`/reimbursement-claims/${id}/start-review`, {
                actor_name: persona?.name, actor_role: persona?.post || "MPCA Secretary",
                actor_body_id: "MPCA", notes: "Opening for review",
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const approve = async () => {
        try {
            const payload = {
                actor_name: persona?.name, actor_role: persona?.post || "MPCA Secretary",
                actor_body_id: "MPCA",
                notes: "Approved by MPCA Secretary",
                approved_amount_inr: parseFloat(approveAmt) || 0,
            };
            await api.post(`/reimbursement-claims/${id}/approve`, payload);
            setApproveOpen(false);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const reject = async () => {
        if (!rejectReason.trim()) { alert("Reason required"); return; }
        try {
            await api.post(`/reimbursement-claims/${id}/reject`, {
                actor_name: persona?.name, actor_role: persona?.post || "MPCA Secretary",
                actor_body_id: "MPCA", notes: rejectReason,
            });
            setRejectOpen(false);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading || !claim) return <CricketLoader label="Loading claim..." />;
    const s = claim.summary || {};

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="reimbursement-claim-detail-page">
            <button className="text-[11px] text-mpca-brass uppercase tracking-widest mb-4 flex items-center gap-1" onClick={() => navigate("/reimbursement-claims")}>
                <ArrowLeft size={12} /> Back to Claims
            </button>

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                    <div className="overline">Reimbursement Claim</div>
                    <h1 className="font-serif text-3xl text-mpca-green-dark mt-2" data-testid="claim-tournament-name">{claim.tournament_name}</h1>
                    <div className="text-[11px] mt-1 flex gap-3 flex-wrap">
                        <span className="font-mono text-mpca-brass">{claim.claim_ref}</span>
                        <span className="text-mpca-gray-dark">·</span>
                        <span>{claim.body_name}</span>
                        {claim.scheme_code && <><span className="text-mpca-gray-dark">·</span><span className="font-mono text-mpca-green-dark">Scheme {claim.scheme_code}</span></>}
                        {(claim.pool_name || claim.role_flavour) && (
                            <span className="inline-flex items-center gap-1.5 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest" data-testid="claim-scope-chip">
                                {claim.pool_name}{claim.pool_name && claim.role_flavour ? " · " : ""}{claim.role_flavour}
                            </span>
                        )}
                        {tournament?.unified_budget_snapshot?.is_locked && (
                            <span className="ml-2 inline-flex items-center gap-1.5 border border-mpca-oxblood bg-mpca-oxblood/5 text-mpca-oxblood px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest" data-testid="claim-locked-snapshot-chip">
                                <span aria-hidden>🔒</span>
                                Locked Budget v{tournament.unified_budget_snapshot.locked_version}
                                {tournament.unified_budget_snapshot.locked_at ? ` · ${new Date(tournament.unified_budget_snapshot.locked_at).toLocaleDateString("en-IN")}` : ""}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={claim.status} />
                    {canStartReview && (
                        <button className="btn-heritage-secondary" onClick={startReview} data-testid="start-review-btn">Start Review</button>
                    )}
                    {canDecide && (
                        <div className="flex gap-2">
                            {(() => {
                                const hasDeductions = (claim.mpca_deductions || []).length > 0;
                                const hasReviews = (claim.mpca_invoice_reviews || []).length > 0;
                                const hasSigned = !!claim.mpca_signed_pdf_url;
                                // MPCA-168 v2 · Deductions-only: signed PDF gates Approve.
                                // Legacy invoice-review path also gates on all-reviewed.
                                let gate = false;
                                let tip = "Approve this claim";
                                if (hasDeductions) {
                                    gate = !hasSigned;
                                    if (gate) tip = "Upload the MPCA-signed decision PDF first";
                                } else if (hasReviews) {
                                    const reviewed = new Set((claim.mpca_invoice_reviews || []).map((r) => r.invoice_id));
                                    const invIds = claim.invoice_ids || [];
                                    const allReviewed = invIds.length > 0 && invIds.every((iid) => reviewed.has(iid));
                                    gate = !allReviewed || !hasSigned;
                                    tip = gate ? (!allReviewed ? `Accept all ${invIds.length} invoices first` : "Upload the MPCA-signed decision PDF first") : tip;
                                }
                                return (
                                    <button
                                        className="btn-heritage-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                        onClick={() => setApproveOpen(true)}
                                        disabled={gate}
                                        title={tip}
                                        data-testid="approve-claim-btn"
                                    >
                                        <CheckCircle2 size={12} /> Approve
                                    </button>
                                );
                            })()}
                            <button className="text-mpca-oxblood border border-mpca-oxblood px-3 py-1.5 text-[11px] uppercase tracking-widest" onClick={() => setRejectOpen(true)} data-testid="reject-claim-btn"><XCircle size={12} className="inline mr-1" /> Reject</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Auto-generated Summary Sheet */}
            <div className="bulletin-card p-0 overflow-hidden mb-6" data-testid="summary-sheet">
                <div className="p-4 bg-mpca-cream/40 border-b border-mpca-brass/20">
                    <div className="overline text-[9px]">Auto-Generated Summary Sheet</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">Budget vs Invoiced · Head-wise Breakdown</div>
                </div>
                <div className="grid grid-cols-4 gap-2 p-4 bg-mpca-cream/20">
                    <div>
                        <div className="overline text-[9px]">Budget</div>
                        <div className="font-mono text-lg text-mpca-green-dark" data-testid="sum-budget">{fmt(s.budget_total_inr)}</div>
                    </div>
                    <div>
                        <div className="overline text-[9px]">Invoiced</div>
                        <div className="font-mono text-lg text-mpca-oxblood" data-testid="sum-invoiced">{fmt(s.invoiced_total_inr)}</div>
                    </div>
                    <div>
                        <div className="overline text-[9px]">Eligible</div>
                        <div className="font-mono text-lg text-mpca-green-dark" data-testid="sum-eligible">{fmt(s.eligible_total_inr)}</div>
                    </div>
                    <div>
                        <div className="overline text-[9px]">Over-budget</div>
                        <div className="font-mono text-lg text-mpca-oxblood" data-testid="sum-over">{fmt(s.over_budget_inr)}</div>
                    </div>
                </div>
                {(s.heads || []).length > 0 && (
                    <>
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                            <div className="col-span-5">Head</div>
                            <div className="col-span-2 text-right">Limit</div>
                            <div className="col-span-2 text-right">Spent</div>
                            <div className="col-span-2 text-right">Eligible</div>
                            <div className="col-span-1 text-right">Util</div>
                        </div>
                        {s.heads.map((h, i) => (
                            <div key={i} className={`grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-mpca-brass/10 text-xs ${h.over_inr > 0 ? "bg-mpca-oxblood/5" : ""}`} data-testid={`sum-head-${i}`}>
                                <div className="col-span-5">{h.head}{h.unmatched && <span className="text-[9px] text-mpca-oxblood ml-2">unmatched</span>}</div>
                                <div className="col-span-2 text-right font-mono">{fmt(h.limit_inr)}</div>
                                <div className={`col-span-2 text-right font-mono ${h.over_inr > 0 ? "text-mpca-oxblood" : ""}`}>{fmt(h.spent_inr)}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-green-dark">{fmt(h.eligible_inr)}</div>
                                <div className="col-span-1 text-right font-mono text-[10px]">{h.utilisation_pct}%</div>
                            </div>
                        ))}
                    </>
                )}
                {s.extra_expense_approved_inr > 0 && (
                    <div className="p-3 border-t-2 border-mpca-brass/40 text-xs text-mpca-green-dark">
                        + Extra-Expense pre-approved (added to ceiling): <span className="font-mono font-semibold">{fmt(s.extra_expense_approved_inr)}</span>
                    </div>
                )}
            </div>

            {/* Invoices linked */}
            <div className="bulletin-card p-0 overflow-hidden mb-6">
                <div className="p-3 bg-mpca-cream/40 border-b border-mpca-brass/20 text-sm font-serif text-mpca-green-dark">Attached Invoices ({invoices.length})</div>
                {invoices.length === 0 ? <div className="p-4 text-xs text-mpca-gray-dark">No invoices referenced.</div> : (
                    <div>
                        {invoices.map((inv) => (
                            <div key={inv.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-mpca-brass/10 text-xs">
                                <div className="col-span-3 font-mono text-mpca-brass">{inv.invoice_no || inv.invoice_ref}</div>
                                <div className="col-span-4">{inv.vendor_name}</div>
                                <div className="col-span-2 text-[10px] text-mpca-gray-dark">{inv.invoice_date}</div>
                                <div className="col-span-2 text-right font-mono">{fmt(inv.total_inr)}</div>
                                <div className="col-span-1 text-right">
                                    {inv.file_url && <a href={`${BACKEND_URL}${inv.file_url}`} target="_blank" rel="noreferrer" className="text-mpca-brass" data-testid={`view-inv-file-${inv.id}`}><FileText size={12} /></a>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* MPCA-168 · Line-Item Review — visible to MPCA once claim is Submitted/Under_Review */}
            {isMPCA && (claim.status === "Submitted" || claim.status === "Under_Review") && (
                <MpcaLineItemReviewPanel
                    claim={claim}
                    invoices={invoices}
                    persona={persona}
                    onChange={load}
                />
            )}

            {/* MPCA Decision — visible to everyone once claim is Approved/Rejected */}
            {(claim.status === "Approved" || claim.status === "Rejected") && (
                <div className="bulletin-card p-0 overflow-hidden mb-6 border-mpca-green-dark" data-testid="mpca-decision-panel">
                    <div className="p-4 bg-mpca-green-dark/10 border-b border-mpca-brass/30 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="overline text-[9px] text-mpca-oxblood">MPCA-168 · Final Decision</div>
                            <div className="font-serif text-xl text-mpca-green-dark mt-1">
                                {claim.status === "Approved" ? "Approved by MPCA" : "Rejected by MPCA"}
                                {claim.status === "Approved" && (
                                    <span className="ml-3 font-mono text-mpca-oxblood" data-testid="decision-approved-amount">{fmt(claim.approved_amount_inr || 0)}</span>
                                )}
                            </div>
                        </div>
                        {claim.mpca_signed_pdf_url && (
                            <a href={`${BACKEND_URL}${claim.mpca_signed_pdf_url}`} target="_blank" rel="noreferrer"
                                className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-parchment px-3 py-1.5 flex items-center gap-1"
                                data-testid="decision-signed-pdf-link">
                                <FileText size={12} /> MPCA-Signed Review PDF
                            </a>
                        )}
                    </div>
                    {(reviewSummary?.heads || []).length > 0 && (
                        <>
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-navy text-mpca-gold-light text-[9px] uppercase tracking-widest">
                                <div className="col-span-4">Head</div>
                                <div className="col-span-2 text-right">Budget</div>
                                <div className="col-span-2 text-right">Spent by Division</div>
                                <div className="col-span-2 text-right">Deducted</div>
                                <div className="col-span-2 text-right">Accepted by MPCA</div>
                            </div>
                            {reviewSummary.heads.map((h, i) => (
                                <div key={h.head + i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-mpca-brass/10 text-xs" data-testid={`decision-head-row-${i}`}>
                                    <div className="col-span-4">{h.head}</div>
                                    <div className="col-span-2 text-right font-mono">{fmt(h.budget_inr || 0)}</div>
                                    <div className="col-span-2 text-right font-mono text-mpca-navy">{fmt(h.spent_inr || 0)}</div>
                                    <div className="col-span-2 text-right font-mono text-mpca-oxblood">{(h.deducted_inr || 0) > 0 ? `−${fmt(h.deducted_inr)}` : "—"}</div>
                                    <div className="col-span-2 text-right font-mono font-semibold text-mpca-green-dark">{fmt(h.accepted_inr || 0)}</div>
                                </div>
                            ))}
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-parchment font-semibold border-y-2 border-mpca-brass/40 text-xs">
                                <div className="col-span-4 uppercase tracking-widest text-[10px]">Total</div>
                                <div className="col-span-2 text-right font-mono">{fmt(reviewSummary.totals?.budget_inr || 0)}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-navy">{fmt(reviewSummary.totals?.spent_inr || 0)}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-oxblood">{(reviewSummary.mpca_deductions || []).reduce((t, d) => t + Number(d.amount_inr || 0), 0) > 0 ? `−${fmt((reviewSummary.mpca_deductions || []).reduce((t, d) => t + Number(d.amount_inr || 0), 0))}` : "—"}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-green-dark">{fmt(reviewSummary.totals?.accepted_inr || 0)}</div>
                            </div>
                        </>
                    )}
                    {(reviewSummary?.mpca_deductions || []).length > 0 && (
                        <div className="p-4 bg-mpca-oxblood/5 border-t border-mpca-brass/20">
                            <div className="overline text-[9px] mb-2 text-mpca-oxblood">Deductions Recorded ({reviewSummary.mpca_deductions.length})</div>
                            {reviewSummary.mpca_deductions.map((d, i) => (
                                <div key={d.id || i} className="grid grid-cols-12 gap-2 text-[11px] py-1 border-b border-mpca-brass/10 last:border-0" data-testid={`decision-deduction-row-${i}`}>
                                    <div className="col-span-5 text-mpca-green-dark">{d.head}</div>
                                    <div className="col-span-2 text-right font-mono text-mpca-oxblood">−{fmt(d.amount_inr || 0)}</div>
                                    <div className="col-span-5 italic text-mpca-gray-dark">{d.reason || "—"}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Approval trail */}
            {(claim.approval_chain || []).length > 0 && (
                <div className="bulletin-card p-4">
                    <div className="overline text-[9px] mb-3">Approval Trail</div>
                    {claim.approval_chain.map((step, i) => (
                        <div key={i} className="text-[11px] mb-2 pb-2 border-b border-mpca-brass/10 last:border-0" data-testid={`approval-step-${i}`}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="font-mono text-mpca-brass">{step.stage}</div>
                                {step.timestamp && (
                                    <div className="text-[10px] text-mpca-gray-dark font-mono" data-testid={`approval-step-time-${i}`}>
                                        {new Date(step.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                    </div>
                                )}
                            </div>
                            <div className="text-mpca-green-dark">{step.actor_name} · {step.actor_post}</div>
                            {step.notes && <div className="text-mpca-gray-dark italic">{step.notes}</div>}
                        </div>
                    ))}
                </div>
            )}

            {/* Approve modal */}
            {approveOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setApproveOpen(false)}>
                    <div className="bulletin-card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="approve-modal">
                        <div className="font-serif text-xl text-mpca-green-dark mb-3">Approve Reimbursement</div>
                        <div className="text-[11px] text-mpca-gray-dark mb-3">
                            Spent by Division {fmt(liveSpent)}
                            {(claim.mpca_deductions || []).length > 0 && (
                                <> − Deductions {fmt((claim.mpca_deductions || []).reduce((t, d) => t + Number(d.amount_inr || 0), 0))}</>
                            )}
                            {" "}= <span className="font-mono text-mpca-green-dark">{fmt(Math.max(liveSpent - (claim.mpca_deductions || []).reduce((t, d) => t + Number(d.amount_inr || 0), 0), 0))}</span> proposed for approval.
                        </div>
                        <label className="block mb-4">
                            <div className="overline text-[9px] mb-1">Approved Amount (₹)</div>
                            <input type="number" className="input-heritage" value={approveAmt} onChange={(e) => setApproveAmt(e.target.value)} data-testid="approve-amt-input" />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button className="btn-heritage-secondary" onClick={() => setApproveOpen(false)}>Cancel</button>
                            <button className="btn-heritage-primary" onClick={approve} data-testid="confirm-approve-btn">Confirm Approve</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject modal */}
            {rejectOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setRejectOpen(false)}>
                    <div className="bulletin-card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="reject-modal">
                        <div className="font-serif text-xl text-mpca-oxblood mb-3">Reject Reimbursement</div>
                        <label className="block mb-4">
                            <div className="overline text-[9px] mb-1">Rejection Reason (required)</div>
                            <textarea rows={4} className="input-heritage" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why this claim is being rejected..." data-testid="reject-reason-input" />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button className="btn-heritage-secondary" onClick={() => setRejectOpen(false)}>Cancel</button>
                            <button className="border border-mpca-oxblood text-mpca-oxblood px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-mpca-oxblood hover:text-mpca-ivory" onClick={reject} disabled={!rejectReason.trim()} data-testid="confirm-reject-btn">Confirm Reject</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReimbursementClaimsList;
