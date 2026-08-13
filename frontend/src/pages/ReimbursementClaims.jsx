import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, MessageSquare, CheckCircle2, XCircle, Send, ClipboardList } from "lucide-react";
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
                            <div className="col-span-3 font-serif text-sm text-mpca-green-dark">{c.tournament_name}</div>
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

// ═══════════════════ MPCA-168 · Line-Item Review Panel ═══════════════════
// MPCA walks every attached invoice and records the accepted amount +
// reason. Sum of accepted becomes the final `approved_amount_inr` at
// approve-time. MPCA must sign & upload their review PDF before the
// Approve button on the parent page is unlocked.
const MpcaLineItemReviewPanel = ({ claim, invoices, persona, onChange }) => {
    const [summary, setSummary] = useState(null);
    const [editing, setEditing] = useState(null);      // invoice_id being edited
    const [editAmt, setEditAmt] = useState("");
    const [editReason, setEditReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get(`/reimbursement-claims/${claim.id}/review-summary`);
            setSummary(data);
        } catch { /* ignore */ }
    };
    useEffect(() => { load(); }, [claim.id, claim.mpca_invoice_reviews?.length, claim.updated_at]);

    const reviewsByIid = Object.fromEntries((claim.mpca_invoice_reviews || []).map((r) => [r.invoice_id, r]));

    const openEdit = (inv) => {
        const prev = reviewsByIid[inv.id];
        setEditing(inv.id);
        setEditAmt(prev?.accepted_inr ?? inv.total_inr ?? 0);
        setEditReason(prev?.reason || "");
    };
    const acceptFull = async (inv) => {
        setBusy(true);
        try {
            await api.post(`/reimbursement-claims/${claim.id}/invoice-review`, {
                invoice_id: inv.id,
                accepted_inr: Number(inv.total_inr) || 0,
                reason: null,
                reviewed_by: persona?.name,
            });
            await onChange();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const saveEdit = async () => {
        setBusy(true);
        try {
            await api.post(`/reimbursement-claims/${claim.id}/invoice-review`, {
                invoice_id: editing,
                accepted_inr: parseFloat(editAmt) || 0,
                reason: editReason.trim() || null,
                reviewed_by: persona?.name,
            });
            setEditing(null); setEditAmt(""); setEditReason("");
            await onChange();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const clearReview = async (invId) => {
        if (!window.confirm("Reset MPCA acceptance for this invoice?")) return;
        setBusy(true);
        try {
            await api.delete(`/reimbursement-claims/${claim.id}/invoice-review/${invId}`);
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

    const totalTotal = invoices.reduce((s, i) => s + Number(i.total_inr || 0), 0);
    const totalAccepted = (claim.mpca_invoice_reviews || []).reduce((s, r) => s + Number(r.accepted_inr || 0), 0);
    const totalBudget = summary?.totals?.budget_inr ?? claim.summary?.budget_total_inr ?? 0;
    const totalSpent = summary?.totals?.spent_inr ?? claim.summary?.invoiced_total_inr ?? 0;
    const allReviewed = summary?.all_reviewed;
    const hasMpcaSigned = !!claim.mpca_signed_pdf_url;

    return (
        <div className="bulletin-card p-0 overflow-hidden mb-6 border-mpca-navy" data-testid="mpca-line-item-review-panel">
            <div className="p-4 bg-mpca-navy/10 border-b border-mpca-navy/40">
                <div className="overline text-[9px] text-mpca-navy">MPCA-168 · Line-Item Review</div>
                <div className="font-serif text-lg text-mpca-green-dark mt-1">Accept each invoice · Sign the decision PDF · Approve</div>
                <div className="text-[11px] text-mpca-gray-dark mt-1">
                    Reviewed {summary?.invoices_reviewed || 0} of {invoices.length} invoices.
                    Total accepted so far: <b className="text-mpca-green-dark">{fmt(totalAccepted)}</b>
                    {" "}(of ₹{totalTotal.toLocaleString("en-IN")} invoiced).
                </div>
            </div>

            {/* Per-head Budget / Spent / Accepted table */}
            {summary?.heads?.length > 0 && (
                <div>
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                        <div className="col-span-6">Head</div>
                        <div className="col-span-2 text-right">Budget</div>
                        <div className="col-span-2 text-right">Spent by Division</div>
                        <div className="col-span-2 text-right">Accepted by MPCA</div>
                    </div>
                    {summary.heads.map((h, i) => (
                        <div key={h.head + i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-mpca-brass/10 text-xs" data-testid={`mpca-head-row-${i}`}>
                            <div className="col-span-6">{h.head}</div>
                            <div className="col-span-2 text-right font-mono">{fmt(h.budget_inr)}</div>
                            <div className="col-span-2 text-right font-mono text-mpca-oxblood">{fmt(h.spent_inr)}</div>
                            <div className="col-span-2 text-right font-mono text-mpca-green-dark font-semibold">{fmt(h.accepted_inr)}</div>
                        </div>
                    ))}
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-parchment font-semibold border-y-2 border-mpca-brass/40 text-xs" data-testid="mpca-head-totals">
                        <div className="col-span-6 uppercase text-[10px] tracking-widest">Total</div>
                        <div className="col-span-2 text-right font-mono">{fmt(totalBudget)}</div>
                        <div className="col-span-2 text-right font-mono text-mpca-oxblood">{fmt(totalSpent)}</div>
                        <div className="col-span-2 text-right font-mono text-mpca-green-dark">{fmt(totalAccepted)}</div>
                    </div>
                </div>
            )}

            {/* Per-invoice review rows */}
            <div className="p-3 border-b border-mpca-brass/20 text-[11px] font-semibold uppercase tracking-widest text-mpca-brass">Invoices — Accept per line</div>
            {invoices.map((inv) => {
                const r = reviewsByIid[inv.id];
                const reviewed = !!r;
                const isEditingThis = editing === inv.id;
                return (
                    <div key={inv.id} className={"px-3 py-2.5 border-b border-mpca-brass/10 " + (reviewed ? "bg-mpca-green-dark/5" : "")} data-testid={`mpca-inv-review-${inv.id}`}>
                        <div className="grid grid-cols-12 gap-2 items-center text-xs">
                            <div className="col-span-4">
                                <div className="font-mono text-[10px] text-mpca-brass">{inv.invoice_ref || inv.invoice_no}</div>
                                <div className="text-mpca-green-dark">{inv.vendor_name || "—"}</div>
                            </div>
                            <div className="col-span-2 text-right font-mono">{fmt(inv.total_inr)}</div>
                            <div className="col-span-3 text-right">
                                {reviewed ? (
                                    <div>
                                        <div className="font-mono text-mpca-green-dark font-semibold">{fmt(r.accepted_inr)}</div>
                                        <div className="text-[9px] uppercase tracking-widest text-mpca-brass">Accepted</div>
                                    </div>
                                ) : <div className="text-[10px] italic text-mpca-gray-dark">Pending review</div>}
                            </div>
                            <div className="col-span-3 text-right flex justify-end gap-1.5">
                                {!isEditingThis && (
                                    <>
                                        <button onClick={() => acceptFull(inv)} disabled={busy}
                                            className="text-[9px] uppercase tracking-widest bg-mpca-green-dark text-mpca-parchment px-2 py-1 disabled:opacity-40"
                                            data-testid={`mpca-inv-accept-full-${inv.id}`}
                                            title="Accept the full invoice amount">
                                            Accept full
                                        </button>
                                        <button onClick={() => openEdit(inv)} disabled={busy}
                                            className="text-[9px] uppercase tracking-widest border border-mpca-oxblood text-mpca-oxblood px-2 py-1 disabled:opacity-40"
                                            data-testid={`mpca-inv-partial-${inv.id}`}
                                            title="Accept a partial amount + record a reason">
                                            {reviewed ? "Edit" : "Partial"}
                                        </button>
                                        {reviewed && (
                                            <button onClick={() => clearReview(inv.id)} disabled={busy}
                                                className="text-[9px] uppercase tracking-widest text-mpca-brass" data-testid={`mpca-inv-clear-${inv.id}`}>
                                                reset
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        {isEditingThis && (
                            <div className="mt-2 border border-mpca-oxblood/40 bg-mpca-oxblood/5 p-2 space-y-2" data-testid={`mpca-inv-form-${inv.id}`}>
                                <div className="grid grid-cols-12 gap-2 items-end">
                                    <label className="col-span-4">
                                        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">Accepted Amount (₹)</div>
                                        <input type="number" min="0" max={inv.total_inr} value={editAmt}
                                            onChange={(e) => setEditAmt(e.target.value)}
                                            className="input-heritage !py-1.5 !text-xs font-mono text-right"
                                            data-testid={`mpca-inv-amt-${inv.id}`} />
                                    </label>
                                    <label className="col-span-6">
                                        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">Reason / Remarks</div>
                                        <input type="text" value={editReason}
                                            onChange={(e) => setEditReason(e.target.value)}
                                            placeholder="e.g. Bill amount partially outside sanctioned head"
                                            className="input-heritage !py-1.5 !text-xs"
                                            data-testid={`mpca-inv-reason-${inv.id}`} />
                                    </label>
                                    <div className="col-span-2 flex gap-1.5 justify-end">
                                        <button onClick={saveEdit} disabled={busy || parseFloat(editAmt) < 0 || parseFloat(editAmt) > inv.total_inr}
                                            className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-parchment px-2 py-1.5 disabled:opacity-40"
                                            data-testid={`mpca-inv-save-${inv.id}`}>Save</button>
                                        <button onClick={() => setEditing(null)} className="text-[9px] uppercase tracking-widest border border-mpca-brass/40 px-2 py-1.5">Cancel</button>
                                    </div>
                                </div>
                                {r?.reason && (
                                    <div className="text-[10px] italic text-mpca-brass">Previous reason: {r.reason}</div>
                                )}
                            </div>
                        )}
                        {!isEditingThis && r?.reason && (
                            <div className="mt-1.5 text-[10px] italic text-mpca-brass">MPCA remark: {r.reason}</div>
                        )}
                    </div>
                );
            })}

            {/* MPCA signed decision PDF */}
            <div className="p-3 border-t-2 border-mpca-navy/40 bg-mpca-navy/5 flex items-center gap-3 flex-wrap" data-testid="mpca-signed-pdf-strip">
                <div className="flex-1 min-w-[200px] text-[11px] text-mpca-charcoal/85">
                    {!allReviewed ? (
                        <>Complete acceptance on every invoice, then generate the MPCA Review PDF, sign it and upload back to unlock <b>Approve</b>.</>
                    ) : hasMpcaSigned ? (
                        <>MPCA-signed decision PDF uploaded on {new Date(claim.mpca_signed_pdf_uploaded_at || Date.now()).toLocaleDateString("en-IN")}. Ready to <b>Approve</b> ₹{totalAccepted.toLocaleString("en-IN")}.</>
                    ) : (
                        <>All invoices reviewed. Generate the MPCA Review PDF, sign it and upload back to unlock <b>Approve</b>.</>
                    )}
                </div>
                {allReviewed && (
                    <a
                        href={`/reimbursement-claims/${claim.id}/mpca-review-form`}
                        target="_blank" rel="noreferrer"
                        className="text-[10px] uppercase tracking-widest bg-mpca-navy text-mpca-parchment px-3 py-1.5"
                        data-testid="mpca-review-pdf-btn"
                    >
                        Print MPCA Review PDF
                    </a>
                )}
                {allReviewed && hasMpcaSigned && (
                    <a href={claim.mpca_signed_pdf_url} target="_blank" rel="noreferrer"
                        className="text-[10px] uppercase tracking-widest text-mpca-green-dark hover:underline">
                        View signed PDF
                    </a>
                )}
                {allReviewed && (
                    <label className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-parchment px-3 py-1.5 cursor-pointer" data-testid="mpca-signed-pdf-upload">
                        {uploadingPdf ? "Uploading…" : (hasMpcaSigned ? "Replace signed" : "Upload signed PDF")}
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                            className="hidden" disabled={uploadingPdf}
                            onChange={(e) => uploadMpcaSignedPdf(e.target.files?.[0])} />
                    </label>
                )}
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
    const [commentText, setCommentText] = useState("");
    const [approveOpen, setApproveOpen] = useState(false);
    const [approveAmt, setApproveAmt] = useState(0);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/reimbursement-claims/${id}`);
            setClaim(data);
            setApproveAmt(data.summary?.eligible_total_inr || 0);
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
    const addComment = async () => {
        if (!commentText.trim()) return;
        try {
            await api.post(`/reimbursement-claims/${id}/comment`, {
                actor_name: persona?.name, actor_role: persona?.post || "Reviewer",
                actor_body_id: persona?.body_code || "MPCA",
                comment_text: commentText,
            });
            setCommentText("");
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const approve = async () => {
        try {
            const hasInvoiceReviews = (claim.mpca_invoice_reviews || []).length > 0;
            const payload = {
                actor_name: persona?.name, actor_role: persona?.post || "MPCA Secretary",
                actor_body_id: "MPCA",
                notes: "Approved by MPCA Secretary",
            };
            // When line-item review is active, the backend computes approved_amount_inr
            // from the sum of accepted amounts — don't send an override.
            if (!hasInvoiceReviews) {
                payload.approved_amount_inr = parseFloat(approveAmt) || 0;
            }
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
                                const hasReviews = (claim.mpca_invoice_reviews || []).length > 0;
                                const reviewed = new Set((claim.mpca_invoice_reviews || []).map((r) => r.invoice_id));
                                const invIds = claim.invoice_ids || [];
                                const allReviewed = invIds.length > 0 && invIds.every((iid) => reviewed.has(iid));
                                const hasSigned = !!claim.mpca_signed_pdf_url;
                                // If line-item review is in use, gate Approve on all-reviewed + signed PDF.
                                const gate = hasReviews && (!allReviewed || !hasSigned);
                                const tip = gate
                                    ? (!allReviewed ? `Accept all ${invIds.length} invoices first` : "Upload the MPCA-signed decision PDF first")
                                    : "Approve this claim";
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

            {/* Comments */}
            <div className="bulletin-card p-4 mb-6" data-testid="comments-section">
                <div className="overline text-[9px] mb-3 flex items-center gap-2"><MessageSquare size={11} /> Discussion ({(claim.comments || []).length})</div>
                {(claim.comments || []).map((c) => (
                    <div key={c.id} className="mb-3 pb-3 border-b border-mpca-brass/10 last:border-0" data-testid={`comment-${c.id}`}>
                        <div className="text-[10px] text-mpca-brass">{c.author_name} · <span className="text-mpca-gray-dark">{c.author_role}</span> · {new Date(c.created_at).toLocaleString()}</div>
                        <div className="text-sm text-mpca-green-dark mt-1 whitespace-pre-wrap">{c.text}</div>
                    </div>
                ))}
                <div className="mt-4 flex gap-2">
                    <textarea rows={2} className="input-heritage flex-1" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment..." data-testid="comment-input" />
                    <button className="btn-heritage-secondary" onClick={addComment} disabled={!commentText.trim()} data-testid="add-comment-btn"><Send size={12} /></button>
                </div>
            </div>

            {/* Approval trail */}
            {(claim.approval_chain || []).length > 0 && (
                <div className="bulletin-card p-4">
                    <div className="overline text-[9px] mb-3">Approval Trail</div>
                    {claim.approval_chain.map((s, i) => (
                        <div key={i} className="text-[11px] mb-2 pb-2 border-b border-mpca-brass/10 last:border-0">
                            <div className="font-mono text-mpca-brass">{s.stage}</div>
                            <div className="text-mpca-green-dark">{s.actor_name} · {s.actor_post}</div>
                            {s.notes && <div className="text-mpca-gray-dark italic">{s.notes}</div>}
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
                            Eligible: {fmt(s.eligible_total_inr)} — you may approve any amount up to this eligible cap.
                        </div>
                        <label className="block mb-4">
                            <div className="overline text-[9px] mb-1">Approved Amount (₹)</div>
                            <input type="number" className="input-heritage" value={approveAmt} onChange={(e) => setApproveAmt(e.target.value)} max={s.eligible_total_inr} data-testid="approve-amt-input" />
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
