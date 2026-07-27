import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, AlertTriangle, Send, IndianRupee, Sparkles, FileText, XCircle } from "lucide-react";
import { api, BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import VaultDocumentPicker from "@/components/VaultDocumentPicker";

// M33 · Best-effort mapping of a scheme's `required_label` (free-text) to
// the closest Data Warehouse doc_kind so the picker only shows relevant docs.
// Falls back to null → picker lists every kind.
const inferDocKindFromLabel = (label = "") => {
    const s = label.toLowerCase();
    if (/gst/.test(s)) return "GST_Certificate";
    if (/\bpan\b/.test(s)) return "PAN_Card";
    if (/bank|cheque|passbook|nach|neft|ifsc|account.*detail/.test(s)) return "Bank_Account";
    if (/balance\s*sheet/.test(s)) return "Balance_Sheet";
    if (/(profit.*loss|income.*expense|receipts.*payments)/.test(s)) return "Profit_Loss";
    if (/audit/.test(s)) return "Audit_Report";
    if (/constitution|bye.*law/.test(s)) return "Constitution_Bye_Laws";
    if (/(moa|aoa|memorandum|articles)/.test(s)) return "MOA_AOA";
    if (/registration.*cert|regd.*cert|reg\.?\s*no/.test(s)) return "Registration_Certificate";
    if (/resolution/.test(s)) return "Board_Resolution";
    if (/address.*proof|utility.*bill/.test(s)) return "Address_Proof";
    if (/insurance|policy/.test(s)) return "Insurance_Policy";
    return null;   // no filter → picker shows all vault docs
};

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

// Tournament schemes flow through Tournament Reimbursement Matrix, not Grant Claims.
const TOURNAMENT_SCHEME_CODES = new Set(["2-A", "2-B", "2-C", "2-D", "2-E", "3-C", "3-D", "9-BCCI"]);
const isTournamentScheme = (s) => s && (TOURNAMENT_SCHEME_CODES.has(s.scheme_code) || s.scheme_type === "Reimbursement" || (s.frequency || "").toLowerCase().includes("tournament"));

const GrantClaims = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const preSchemeCode = searchParams.get("scheme");
    const [claims, setClaims] = useState([]);
    const [schemes, setSchemes] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newClaim, setNewClaim] = useState({ scheme_code: preSchemeCode || "", claimed_amount_inr: 0, notes: "" });
    const [uploadingDoc, setUploadingDoc] = useState(null);

    const isMPCA = persona?.body_type === "State";

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: c }, { data: s }] = await Promise.all([
                api.get("/grant-claims"),
                api.get("/reimbursement-schemes"),
            ]);
            setClaims(c || []);
            setSchemes(s || []);
            if (preSchemeCode && !creating) setCreating(true);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const createClaim = async () => {
        try {
            const payload = { ...newClaim, body_id: persona?.body_code || "MPCA", fiscal_cycle: (typeof window !== "undefined" && window.__mpca_season) || "2026-27" };
            const { data } = await api.post("/grant-claims", payload);
            setClaims((prev) => [data, ...prev]);
            setSelected(data);
            setCreating(false);
            setNewClaim({ scheme_code: "", claimed_amount_inr: 0, notes: "" });
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const uploadDoc = async (claim, docSlot, file) => {
        setUploadingDoc(docSlot.doc_id);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "grant_claim");
            fd.append("related_id", claim.id);
            const { data: upload } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            const { data: updated } = await api.post(`/grant-claims/${claim.id}/document/${docSlot.doc_id}`, null, {
                params: { file_url: upload.url, filename: upload.original_name },
            });
            setSelected(updated);
            setClaims((prev) => prev.map((c) => c.id === updated.id ? updated : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploadingDoc(null); }
    };

    // M33 · Attach a document from the body's Data Warehouse without re-uploading.
    const attachFromVault = async (claim, docSlot, vaultDoc) => {
        if (!vaultDoc?.file_url) return alert("This vault entry has no file attached — upload one to the vault first.");
        setUploadingDoc(docSlot.doc_id);
        try {
            const { data: updated } = await api.post(`/grant-claims/${claim.id}/document/${docSlot.doc_id}`, null, {
                params: {
                    file_url: vaultDoc.file_url,
                    filename: vaultDoc.file_name || vaultDoc.label,
                    from_vault: true,
                    vault_doc_id: vaultDoc.id,
                },
            });
            setSelected(updated);
            setClaims((prev) => prev.map((c) => c.id === updated.id ? updated : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploadingDoc(null); }
    };

    const submitClaim = async () => {
        try {
            const { data } = await api.post(`/grant-claims/${selected.id}/submit`, null, { params: { actor_name: persona?.name } });
            setSelected(data);
            setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const approveClaim = async () => {
        const amt = window.prompt("Approved amount (₹):", selected.claimed_amount_inr);
        if (!amt) return;
        try {
            const { data } = await api.post(`/grant-claims/${selected.id}/approve`, null, {
                params: { approved_amount_inr: parseFloat(amt), actor_name: persona?.name, notes: "Approved by MPCA" },
            });
            setSelected(data);
            setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const rejectClaim = async () => {
        const reason = window.prompt("Rejection reason:");
        if (!reason) return;
        try {
            const { data } = await api.post(`/grant-claims/${selected.id}/reject`, null, {
                params: { actor_name: persona?.name, reason },
            });
            setSelected(data);
            setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // M38 · Manually re-run Gemini on a single doc (retry low-confidence / errored verdicts)
    const [reVerifyingId, setReVerifyingId] = useState(null);
    const reVerifyDoc = async (claim, docSlot) => {
        setReVerifyingId(docSlot.doc_id);
        try {
            const { data } = await api.post(`/grant-claims/${claim.id}/documents/${docSlot.doc_id}/re-verify`);
            setSelected(data);
            setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setReVerifyingId(null); }
    };

    // M38 · Full-claim AI review — cross-doc consistency + rolled-up verdict for MPCA reviewers
    const [aiReviewing, setAiReviewing] = useState(false);
    const runAiReview = async () => {
        if (!selected) return;
        setAiReviewing(true);
        try {
            const { data } = await api.post(`/grant-claims/${selected.id}/ai-review`, null, { params: { actor_name: persona?.name } });
            setSelected(data);
            setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setAiReviewing(false); }
    };

    if (loading) return <CricketLoader label="Loading grant claims..." />;

    const allDocsUploaded = selected && (selected.documents || []).every((d) => d.file_url);
    // Only Division/District (non-MPCA) can submit; MPCA is approval authority only
    const canSubmit = !isMPCA && selected && ["Draft", "Documents_Pending", "Rejected"].includes(selected.status) && allDocsUploaded;
    const canReview = isMPCA && selected && ["Submitted", "Under_Review"].includes(selected.status);
    const scheme = selected ? schemes.find((s) => s.scheme_code === selected.scheme_code) : null;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="grant-claims-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Financial · Grant Claims</div>
                    <h1 className="font-serif text-4xl text-mpca-green-dark mt-3">Grant Claims</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        {isMPCA ? "Review and approve grant claims submitted by Divisions and Districts. Each uploaded document is AI-verified for authenticity."
                                : "Claim MPCA grants (annual, coaching, admin, welfare, infrastructure). Upload required documents — AI will verify each before you submit."}
                    </p>
                </div>
                {!isMPCA && (
                    <button className="btn-heritage-primary" onClick={() => setCreating(true)} data-testid="new-claim-btn">
                        <IndianRupee size={12} /> New Grant Claim
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
                {/* Claims list */}
                <div className="space-y-2" data-testid="claims-list">
                    {claims.length === 0 ? (
                        <div className="bulletin-card p-8 text-center text-sm text-mpca-gray-dark">No grant claims yet.</div>
                    ) : claims.map((c) => (
                        <button key={c.id} onClick={() => setSelected(c)}
                            className={`w-full text-left p-3 border ${selected?.id === c.id ? "border-mpca-oxblood bg-mpca-cream/40" : "border-mpca-brass/30 hover:bg-mpca-cream/30"}`}
                            data-testid={`claim-row-${c.id}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-mono text-[10px] text-mpca-brass">{c.claim_ref}</div>
                                    <div className="font-serif text-sm text-mpca-green-dark mt-0.5">{c.scheme_name}</div>
                                    <div className="text-[10px] text-mpca-gray-dark">{c.body_name} · {fmt(c.claimed_amount_inr)}</div>
                                </div>
                                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border ${
                                    c.status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" :
                                    c.status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" :
                                    c.status === "Submitted" || c.status === "Under_Review" ? "border-mpca-brass text-mpca-brass" :
                                    "border-mpca-gray-dark text-mpca-gray-dark"
                                }`}>{c.status.replace(/_/g, " ")}</span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Detail */}
                <div className="bulletin-card p-6 h-fit" data-testid="claim-detail">
                    {!selected ? (
                        <div className="text-center py-12 text-mpca-gray-dark">Select a claim to view details</div>
                    ) : (
                        <>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="overline text-[9px]">Scheme {selected.scheme_code} · {selected.claim_ref}</div>
                                    <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">{selected.scheme_name}</h2>
                                    <div className="text-[11px] text-mpca-gray-dark mt-1">
                                        {selected.body_name} · Claimed <span className="font-mono">{fmt(selected.claimed_amount_inr)}</span>
                                        {selected.approved_amount_inr != null && <> · Approved <span className="font-mono text-mpca-green-dark">{fmt(selected.approved_amount_inr)}</span></>}
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass text-mpca-brass flex items-center gap-1 hover:bg-mpca-brass/10 disabled:opacity-40"
                                        onClick={runAiReview}
                                        disabled={aiReviewing || !(selected.documents || []).some((d) => d.file_url)}
                                        title="Run Gemini cross-doc consistency check + rolled-up verdict"
                                        data-testid="ai-review-claim-btn"
                                    >
                                        <Sparkles size={11} className={aiReviewing ? "animate-pulse" : ""} /> {aiReviewing ? "AI Reviewing…" : "AI Review"}
                                    </button>
                                    {canSubmit && (
                                        <button className="btn-heritage-primary" onClick={submitClaim} data-testid="submit-claim-btn"><Send size={12} /> Submit</button>
                                    )}
                                    {canReview && (
                                        <>
                                            <button className="btn-heritage-primary" onClick={approveClaim} data-testid="approve-claim-btn"><CheckCircle2 size={12} /> Approve</button>
                                            <button className="border border-mpca-oxblood text-mpca-oxblood px-3 py-1.5 text-[11px] uppercase tracking-widest" onClick={rejectClaim} data-testid="reject-claim-btn"><XCircle size={12} className="inline mr-1" /> Reject</button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* M38 · Claim-level AI Summary — visible whenever AI has run at least once */}
                            {selected.ai_summary && (
                                <div className={`mb-4 p-4 border-2 ${
                                    selected.ai_summary.overall_verdict === "Recommend_Approve" ? "border-mpca-green-dark bg-mpca-green-dark/5" :
                                    selected.ai_summary.overall_verdict === "Recommend_Reject" ? "border-mpca-oxblood bg-mpca-oxblood/5" :
                                    "border-mpca-brass bg-mpca-gold-light/10"
                                }`} data-testid="ai-summary-panel">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Sparkles size={14} className={`${selected.ai_summary.overall_verdict === "Recommend_Approve" ? "text-mpca-green-dark" : selected.ai_summary.overall_verdict === "Recommend_Reject" ? "text-mpca-oxblood" : "text-mpca-brass"}`} />
                                                <div className={`font-serif text-lg ${selected.ai_summary.overall_verdict === "Recommend_Approve" ? "text-mpca-green-dark" : selected.ai_summary.overall_verdict === "Recommend_Reject" ? "text-mpca-oxblood" : "text-mpca-brass"}`} data-testid="ai-verdict">
                                                    {selected.ai_summary.overall_verdict.replace(/_/g, " ")}
                                                </div>
                                                <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                                                    {selected.ai_summary.docs_verified} / {selected.ai_summary.docs_total} docs verified · avg confidence {Math.round((selected.ai_summary.overall_confidence || 0) * 100)}%
                                                </span>
                                            </div>
                                            {selected.ai_summary.amount_match_note && (
                                                <div className="text-[11px] text-mpca-gray-dark mt-2 italic" data-testid="ai-amount-note">
                                                    <IndianRupee size={10} className="inline mr-0.5" /> {selected.ai_summary.amount_match_note}
                                                </div>
                                            )}
                                            {(selected.ai_summary.critical_issues || []).length > 0 && (
                                                <ul className="mt-2 space-y-0.5" data-testid="ai-critical-issues">
                                                    {selected.ai_summary.critical_issues.map((c, i) => (
                                                        <li key={i} className="text-[11px] text-mpca-oxblood flex items-start gap-1"><AlertTriangle size={10} className="mt-0.5 shrink-0" /> {c}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            {(selected.ai_summary.advisory_notes || []).length > 0 && (
                                                <ul className="mt-2 space-y-0.5" data-testid="ai-advisory-notes">
                                                    {selected.ai_summary.advisory_notes.map((a, i) => (
                                                        <li key={i} className="text-[11px] text-mpca-brass flex items-start gap-1">· {a}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div className="text-right text-[9px] text-mpca-gray-dark shrink-0">
                                            {selected.ai_summary.validated_at && (
                                                <div>{new Date(selected.ai_summary.validated_at).toLocaleString("en-IN")}</div>
                                            )}
                                            {selected.ai_summary.validated_by && (
                                                <div className="italic">by {selected.ai_summary.validated_by}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Documents */}
                            <div>
                                <div className="overline text-[9px] mb-3">Required Documents ({(selected.documents || []).length})</div>
                                <div className="space-y-2">
                                    {(selected.documents || []).map((d) => (
                                        <div key={d.doc_id} className={`p-3 border ${d.file_url ? (d.ai_verified ? "border-mpca-green-dark/40 bg-mpca-green-dark/5" : "border-mpca-brass/40 bg-mpca-brass/5") : "border-mpca-gray-dark/20"}`} data-testid={`doc-${d.doc_id}`}>
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex-1">
                                                    <div className="font-serif text-sm text-mpca-green-dark flex items-center gap-2">
                                                        {d.required_label}
                                                        {d.from_vault && (
                                                            <span className="text-[8px] uppercase tracking-widest bg-mpca-brass/20 text-mpca-brass border border-mpca-brass/40 px-1 py-0.5" data-testid={`doc-from-vault-${d.doc_id}`} title="Attached from the body's Data Warehouse">
                                                                From Vault
                                                            </span>
                                                        )}
                                                    </div>
                                                    {d.filename && (
                                                        <a href={`${BACKEND_URL}${d.file_url}`} target="_blank" rel="noreferrer" className="text-[10px] text-mpca-brass mt-1 flex items-center gap-1">
                                                            <FileText size={10} /> {d.filename}
                                                        </a>
                                                    )}
                                                    {d.file_url && (
                                                        <div className="mt-1 text-[11px] flex items-center gap-2 flex-wrap">
                                                            {d.ai_verified ? (
                                                                <span className="text-mpca-green-dark flex items-center gap-1">
                                                                    <CheckCircle2 size={11} /> AI verified · {Math.round((d.ai_confidence || 0) * 100)}% confidence
                                                                </span>
                                                            ) : (
                                                                <span className="text-mpca-oxblood flex items-center gap-1">
                                                                    <AlertTriangle size={11} /> AI flag · {d.ai_notes}
                                                                </span>
                                                            )}
                                                            <button
                                                                onClick={() => reVerifyDoc(selected, d)}
                                                                disabled={reVerifyingId === d.doc_id}
                                                                className="text-[9px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood underline underline-offset-2 disabled:opacity-40"
                                                                data-testid={`doc-reverify-${d.doc_id}`}
                                                                title="Retry Gemini verification on this document"
                                                            >
                                                                {reVerifyingId === d.doc_id ? "Re-verifying…" : "Re-verify"}
                                                            </button>
                                                            {d.ai_extracted?.document_type_detected && (
                                                                <span className="text-mpca-gray-dark text-[10px]">· Detected: {d.ai_extracted.document_type_detected}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {["Draft", "Documents_Pending", "Rejected"].includes(selected.status) && !isMPCA && (
                                                    <div className="flex flex-col gap-1 shrink-0">
                                                        <label className="btn-heritage-secondary cursor-pointer">
                                                            <Upload size={11} /> {uploadingDoc === d.doc_id ? "Uploading & verifying..." : d.file_url ? "Replace" : "Upload"}
                                                            <input type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && uploadDoc(selected, d, e.target.files[0])} data-testid={`doc-upload-${d.doc_id}`} />
                                                        </label>
                                                        <VaultDocumentPicker
                                                            bodyCode={selected.body_id || persona?.body_code}
                                                            docKind={inferDocKindFromLabel(d.required_label)}
                                                            onPick={(vaultDoc) => attachFromVault(selected, d, vaultDoc)}
                                                            triggerLabel="From Vault"
                                                            testId={`doc-vault-${d.doc_id}`}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selected.rejection_reason && (
                                <div className="mt-4 p-3 bg-mpca-oxblood/10 border border-mpca-oxblood/40">
                                    <div className="overline text-[9px] text-mpca-oxblood mb-1">Rejection Reason</div>
                                    <div className="text-sm text-mpca-oxblood">{selected.rejection_reason}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* New Claim modal */}
            {creating && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setCreating(false)}>
                    <div className="bulletin-card p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()} data-testid="new-claim-modal">
                        <div className="font-serif text-2xl text-mpca-green-dark mb-4">New Grant Claim</div>
                        <div className="space-y-3">
                            <label>
                                <div className="overline text-[9px] mb-1">Scheme *</div>
                                <select className="input-heritage" value={newClaim.scheme_code} onChange={(e) => setNewClaim({ ...newClaim, scheme_code: e.target.value })} data-testid="new-claim-scheme">
                                    <option value="">Select scheme...</option>
                                    {schemes.filter((s) => !isTournamentScheme(s)).map((s) => <option key={s.scheme_code} value={s.scheme_code}>Scheme {s.scheme_code} · {s.name}</option>)}
                                </select>
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Claimed Amount (₹)</div>
                                <input type="number" className="input-heritage" value={newClaim.claimed_amount_inr} onChange={(e) => setNewClaim({ ...newClaim, claimed_amount_inr: e.target.value })} data-testid="new-claim-amount" />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Notes</div>
                                <textarea rows={2} className="input-heritage" value={newClaim.notes} onChange={(e) => setNewClaim({ ...newClaim, notes: e.target.value })} data-testid="new-claim-notes" />
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button className="btn-heritage-secondary" onClick={() => setCreating(false)}>Cancel</button>
                            <button className="btn-heritage-primary" onClick={createClaim} disabled={!newClaim.scheme_code} data-testid="save-new-claim">Create & Upload Docs</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrantClaims;
