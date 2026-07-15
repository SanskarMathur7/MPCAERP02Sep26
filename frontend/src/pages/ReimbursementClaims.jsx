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
            await api.post(`/reimbursement-claims/${id}/approve`, {
                actor_name: persona?.name, actor_role: persona?.post || "MPCA Secretary",
                actor_body_id: "MPCA", approved_amount_inr: parseFloat(approveAmt) || 0,
                notes: "Approved by MPCA Secretary",
            });
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
                            <button className="btn-heritage-primary" onClick={() => setApproveOpen(true)} data-testid="approve-claim-btn"><CheckCircle2 size={12} /> Approve</button>
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
