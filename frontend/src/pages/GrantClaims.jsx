import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, AlertTriangle, Send, IndianRupee, Sparkles, FileText, XCircle, Download, Lock, MessageSquare, Filter } from "lucide-react";
import { api, BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import VaultDocumentPicker from "@/components/VaultDocumentPicker";
import SignedPdfUploadModal from "@/components/SignedPdfUploadModal";
import AttachedCampView from "@/components/AttachedCampView";

// MPCA-245 · Progress ribbon steps for grant claim lifecycle
const GRANT_STEPS = [
    { key: "Draft",           label: "Draft" },
    { key: "Submitted",       label: "Submitted" },
    { key: "Under_Review",    label: "Under MPCA Review" },
    { key: "Approved",        label: "Approved" },
    { key: "Payment_Made",    label: "Payment Made" },
];
const _stepIndex = (status) => {
    if (status === "Rejected") return -1;
    const idx = GRANT_STEPS.findIndex((s) => s.key === status);
    // Documents_Pending + Sanctioned map to closest visible stage
    if (idx >= 0) return idx;
    if (status === "Documents_Pending") return 0;
    if (status === "Sanctioned") return 3;
    return 0;
};

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

// Feb 2026 · Payment modal — replaces the 4 chained window.prompt() calls
// with a proper 4-field form + optional signed-receipt drop zone.
const PaymentModal = ({ claim, persona, onClose, onSubmit }) => {
    const [utr, setUtr] = useState("");
    const [amount, setAmount] = useState(claim?.approved_amount_inr ?? "");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [receiptRec, setReceiptRec] = useState(null);
    const [showDropzone, setShowDropzone] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const canSubmit = utr.trim() && amount !== "" && !isNaN(parseFloat(amount)) && date && !submitting;

    const doSubmit = async () => {
        setError(null);
        setSubmitting(true);
        try {
            await onSubmit({
                utr: utr.trim(),
                amount_inr: parseFloat(amount),
                payment_date: date,
                receipt_url: receiptRec?.url || null,
            });
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || "Failed to record payment");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" data-testid="payment-modal">
            <div className="bg-mpca-parchment w-full max-w-lg border-2 border-mpca-brass shadow-2xl">
                <div className="flex items-start justify-between px-5 py-4 border-b border-mpca-brass/40 bg-mpca-ivory">
                    <div className="flex items-start gap-3">
                        <IndianRupee size={22} strokeWidth={1.5} className="text-mpca-green-dark mt-0.5 flex-shrink-0" />
                        <div>
                            <h2 className="font-serif text-lg text-mpca-green-dark leading-snug">Mark Payment Made</h2>
                            <p className="text-[11px] text-mpca-gray-dark italic mt-1">Records the disbursal against this approved claim and moves it to <em>Payment Made</em>.</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-mpca-gray-dark hover:text-mpca-oxblood transition-colors" data-testid="payment-modal-close-btn">
                        <XCircle size={18} strokeWidth={1.5} />
                    </button>
                </div>
                <div className="p-5 space-y-3">
                    <label className="block">
                        <div className="overline text-[9px] mb-1">UTR / Transaction Ref *</div>
                        <input type="text" className="input-heritage" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. AXISN2026021712345678" data-testid="payment-utr" />
                    </label>
                    <label className="block">
                        <div className="overline text-[9px] mb-1">Amount (₹) *</div>
                        <input type="number" step="0.01" className="input-heritage" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="payment-amount" />
                    </label>
                    <label className="block">
                        <div className="overline text-[9px] mb-1">Payment Date *</div>
                        <input type="date" className="input-heritage" value={date} onChange={(e) => setDate(e.target.value)} data-testid="payment-date" />
                    </label>
                    <div>
                        <div className="overline text-[9px] mb-1">Signed Receipt PDF <span className="text-mpca-gray-dark normal-case tracking-normal">(optional)</span></div>
                        {receiptRec ? (
                            <div className="flex items-center gap-2 bg-mpca-ivory border border-mpca-brass/40 px-3 py-2">
                                <CheckCircle2 size={14} className="text-mpca-oxblood flex-shrink-0" />
                                <a href={`${BACKEND_URL}${receiptRec.url}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-mpca-green-dark hover:text-mpca-oxblood truncate flex-1" data-testid="payment-receipt-link">{receiptRec.original_name}</a>
                                <button type="button" onClick={() => setReceiptRec(null)} className="text-mpca-gray-dark hover:text-mpca-oxblood" aria-label="Remove receipt" data-testid="payment-receipt-remove">
                                    <XCircle size={14} />
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowDropzone(true)} className="w-full border border-dashed border-mpca-brass/40 hover:border-mpca-brass px-3 py-4 text-xs text-mpca-gray-dark hover:text-mpca-green-dark transition-colors flex items-center justify-center gap-2" data-testid="payment-receipt-open-dropzone">
                                <Upload size={12} strokeWidth={1.5} /> Attach signed receipt (drag &amp; drop)
                            </button>
                        )}
                    </div>
                    {error && (
                        <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 text-mpca-oxblood px-3 py-2 text-xs" data-testid="payment-modal-error">{error}</div>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-mpca-brass/40 bg-mpca-ivory flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={submitting} className="border border-mpca-gray-dark text-mpca-gray-dark px-4 py-1.5 text-[11px] uppercase tracking-widest hover:bg-mpca-gray-dark hover:text-mpca-ivory transition-colors disabled:opacity-50" data-testid="payment-cancel-btn">Cancel</button>
                    <button type="button" onClick={doSubmit} disabled={!canSubmit} className="btn-heritage-primary disabled:opacity-50" data-testid="payment-submit-btn">
                        {submitting ? "Recording…" : "Record Payment"}
                    </button>
                </div>
            </div>
            <SignedPdfUploadModal
                open={showDropzone}
                onClose={() => setShowDropzone(false)}
                title="Attach Signed Receipt"
                description="Drop the payment receipt PDF here. It will be linked to this payment record."
                metadata={{ related_type: "grant_claim_payment", related_id: claim?.id, uploaded_by: persona?.name, body_id: persona?.body_code }}
                onUploaded={(rec) => { setReceiptRec(rec); }}
                testidPrefix="payment-receipt-modal"
            />
        </div>
    );
};

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
    // MPCA-245 · Discussions + division filter + tab state
    const [tab, setTab] = useState("details");
    const [discussions, setDiscussions] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [bodies, setBodies] = useState([]);
    const [divisionFilter, setDivisionFilter] = useState("all");
    // Feb 2026 · Signed-PDF drop-zone modal state (replaces window.prompt URL flow)
    // signedUploadModal.kind ∈ { "submission", "approval" } · null = closed
    const [signedUploadModal, setSignedUploadModal] = useState(null);
    // Feb 2026 · Payment modal state (replaces the 4-chained window.prompt calls)
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);

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

    // MPCA-245 · Load bodies list once for the MPCA "filter by division" dropdown
    useEffect(() => {
        if (!isMPCA) return;
        api.get("/bodies").then(({ data }) => setBodies((data || []).filter(b => b.body_type === "Division" || b.body_type === "District")))
            .catch(() => {});
    }, [isMPCA]);

    // MPCA-245 · Load discussions when a claim is selected + on tab switch
    const loadDiscussions = async (cid) => {
        try { const { data } = await api.get(`/grant-claims/${cid}/discussions`); setDiscussions(data || []); }
        catch { setDiscussions([]); }
    };
    useEffect(() => { if (selected?.id) loadDiscussions(selected.id); else setDiscussions([]); }, [selected?.id]);

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

    // ─────────── MPCA-245 · Signed-artifact + payment + discussion handlers ───────────
    const downloadSummaryPdf = (variant = "submission") => {
        if (!selected) return;
        // MPCA-257 · Route through the new print page (same MPCA ERP visual
        // language as the tournament schedule / closure PDFs). User hits
        // "Print / Save as PDF" from the print-optimised page.
        window.open(`/grant-claims/${selected.id}/summary?variant=${variant}`, "_blank");
    };

    // MPCA-250 · Purpose editor (long-text) + extra supporting document handlers
    const [purposeDraft, setPurposeDraft] = useState("");
    useEffect(() => { setPurposeDraft(selected?.purpose_of_claim || ""); }, [selected?.id, selected?.purpose_of_claim]);
    const savePurpose = async () => {
        try {
            const { data } = await api.patch(`/grant-claims/${selected.id}/purpose`, { purpose_of_claim: purposeDraft });
            setSelected(data);
            setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const [uploadingExtra, setUploadingExtra] = useState(false);
    const addExtraDocument = async () => {
        const description = window.prompt("Description of this supporting document:");
        if (!description) return;
        const inp = document.createElement("input");
        inp.type = "file";
        inp.onchange = async () => {
            const file = inp.files?.[0];
            if (!file) return;
            setUploadingExtra(true);
            try {
                const fd = new FormData();
                fd.append("file", file);
                fd.append("related_type", "grant_claim");
                fd.append("related_id", selected.id);
                const { data: up } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
                const { data } = await api.post(`/grant-claims/${selected.id}/extra-document`, {
                    description, file_url: up.url, filename: up.original_name,
                });
                setSelected(data);
                setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
            } catch (e) { alert(e?.response?.data?.detail || e.message); }
            finally { setUploadingExtra(false); }
        };
        inp.click();
    };
    const removeExtraDocument = async (docId) => {
        if (!window.confirm("Remove this supporting document?")) return;
        try {
            const { data } = await api.delete(`/grant-claims/${selected.id}/extra-document/${docId}`);
            setSelected(data);
            setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const uploadSignedSubmission = () => setSignedUploadModal({ kind: "submission" });
    const uploadMpcaSignedApproval = () => setSignedUploadModal({ kind: "approval" });
    // Feb 2026 · replaces window.prompt() chains with a proper form modal.
    // markPaymentMade now just opens the modal; the modal calls
    // `submitPayment()` with the collected fields (utr, amount, date, optional
    // receipt drop-zone).
    const markPaymentMade = () => setPaymentModalOpen(true);
    const submitPayment = async ({ utr, amount_inr, payment_date, receipt_url }) => {
        const { data } = await api.post(`/grant-claims/${selected.id}/payment`, {
            utr, amount_inr, payment_date, receipt_url: receipt_url || null,
        });
        setSelected(data);
        setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
    };
    const sendMessage = async () => {
        if (!newMessage.trim() || !selected) return;
        try {
            const { data } = await api.post(`/grant-claims/${selected.id}/discussions`, {
                author_name: persona?.name || "Anonymous",
                author_body: persona?.body_code,
                author_body_type: persona?.body_type,
                message: newMessage.trim(),
            });
            setDiscussions((prev) => [...prev, data]);
            setNewMessage("");
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    // MPCA-245 · Client-side division filter for MPCA — must be declared
    // before any conditional early-return per React hook rules.
    const filteredClaims = useMemo(() => {
        if (!isMPCA || divisionFilter === "all") return claims;
        return claims.filter(c => c.body_id === divisionFilter);
    }, [claims, isMPCA, divisionFilter]);

    if (loading) return <CricketLoader label="Loading grant claims..." />;

    const allDocsUploaded = selected && (selected.documents || []).every((d) => d.file_url);
    // MPCA-245 · Signed submission PDF is a submission pre-req for Division
    const canUploadSignedSubmission = !isMPCA && selected && allDocsUploaded && ["Draft", "Documents_Pending", "Rejected"].includes(selected.status);
    const canSubmit = !isMPCA && selected && ["Draft", "Documents_Pending", "Rejected"].includes(selected.status) && allDocsUploaded && !!selected.signed_submission_url;
    // MPCA-245 · MPCA must upload signed approval PDF before Approve unlocks
    const canUploadMpcaSigned = isMPCA && selected && ["Submitted", "Under_Review"].includes(selected.status);
    const canReview = isMPCA && selected && ["Submitted", "Under_Review"].includes(selected.status) && !!selected.signed_approval_url;
    // MPCA-245 · Payment_Made — MPCA marks after approval
    const canMarkPayment = isMPCA && selected && ["Approved", "Sanctioned"].includes(selected.status);
    // MPCA-112 · MPCA can also REJECT a claim after it was Approved
    const canPostApprovalReject = isMPCA && selected && selected.status === "Approved";
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
                    {isMPCA && (
                        <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-2 mb-1 flex items-center gap-2" data-testid="claims-division-filter">
                            <Filter size={11} className="text-mpca-brass" />
                            <select
                                className="input-heritage !text-[11px] flex-1"
                                value={divisionFilter}
                                onChange={(e) => setDivisionFilter(e.target.value)}
                                data-testid="claims-division-filter-select"
                            >
                                <option value="all">All Divisions / Districts ({claims.length})</option>
                                {bodies.map(b => {
                                    const count = claims.filter(c => c.body_id === b.code).length;
                                    if (count === 0) return null;
                                    return <option key={b.code} value={b.code}>{b.name} ({count})</option>;
                                })}
                            </select>
                        </div>
                    )}
                    {filteredClaims.length === 0 ? (
                        <div className="bulletin-card p-8 text-center text-sm text-mpca-gray-dark">No grant claims yet.</div>
                    ) : filteredClaims.map((c) => {
                        // M38 · AI verdict badge on list — reviewers can triage without opening each claim
                        const v = c.ai_summary?.overall_verdict;
                        const aiBadge = v === "Recommend_Approve"
                            ? { txt: "AI ✓", cls: "bg-mpca-green-dark text-mpca-ivory", title: "AI recommends approval" }
                            : v === "Recommend_Reject"
                                ? { txt: "AI ⚠", cls: "bg-mpca-oxblood text-mpca-ivory", title: "AI recommends rejection · critical issues found" }
                                : v === "Manual_Review"
                                    ? { txt: "AI ?", cls: "bg-mpca-brass text-mpca-ivory", title: "AI recommends manual review" }
                                    : null;
                        return (
                        <button key={c.id} onClick={() => setSelected(c)}
                            className={`w-full text-left p-3 border ${selected?.id === c.id ? "border-mpca-oxblood bg-mpca-cream/40" : "border-mpca-brass/30 hover:bg-mpca-cream/30"}`}
                            data-testid={`claim-row-${c.id}`}>
                            <div className="flex justify-between items-start">
                                <div className="min-w-0 flex-1">
                                    <div className="font-mono text-[10px] text-mpca-brass">{c.claim_ref}</div>
                                    <div className="font-serif text-sm text-mpca-green-dark mt-0.5 truncate">{c.scheme_name}</div>
                                    <div className="text-[10px] text-mpca-gray-dark">{c.body_name} · {fmt(c.claimed_amount_inr)}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                                    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border ${
                                        c.status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" :
                                        c.status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" :
                                        c.status === "Submitted" || c.status === "Under_Review" ? "border-mpca-brass text-mpca-brass" :
                                        "border-mpca-gray-dark text-mpca-gray-dark"
                                    }`}>{c.status.replace(/_/g, " ")}</span>
                                    {aiBadge && (
                                        <span
                                            title={aiBadge.title}
                                            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 font-mono ${aiBadge.cls}`}
                                            data-testid={`claim-row-ai-badge-${c.id}`}
                                        >{aiBadge.txt}</span>
                                    )}
                                </div>
                            </div>
                        </button>
                        );
                    })}
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
                                    {/* MPCA-245 · Download signable summary PDF */}
                                    {selected && (
                                        <button
                                            className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass text-mpca-brass flex items-center gap-1 hover:bg-mpca-brass/10"
                                            onClick={() => downloadSummaryPdf(isMPCA ? "approval" : "submission")}
                                            data-testid="download-summary-pdf-btn"
                                        >
                                            <Download size={11} /> Summary PDF
                                        </button>
                                    )}
                                    {/* MPCA-245 · Division upload signed submission PDF */}
                                    {canUploadSignedSubmission && (
                                        <button
                                            className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-mpca-brass text-mpca-ivory flex items-center gap-1"
                                            onClick={uploadSignedSubmission}
                                            data-testid="upload-signed-submission-btn"
                                        >
                                            <Upload size={11} /> {selected?.signed_submission_url ? "Replace Signed" : "Upload Signed"}
                                        </button>
                                    )}
                                    {canSubmit && (
                                        <button className="btn-heritage-primary" onClick={submitClaim} data-testid="submit-claim-btn"><Send size={12} /> Submit</button>
                                    )}
                                    {/* MPCA-245 · MPCA upload signed approval PDF */}
                                    {canUploadMpcaSigned && (
                                        <button
                                            className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-mpca-brass text-mpca-ivory flex items-center gap-1"
                                            onClick={uploadMpcaSignedApproval}
                                            data-testid="upload-mpca-signed-btn"
                                        >
                                            <Upload size={11} /> {selected?.signed_approval_url ? "Replace MPCA Signed" : "Upload MPCA Signed"}
                                        </button>
                                    )}
                                    {canReview && (
                                        <>
                                            <button className="btn-heritage-primary" onClick={approveClaim} data-testid="approve-claim-btn"><CheckCircle2 size={12} /> Approve</button>
                                            <button className="border border-mpca-oxblood text-mpca-oxblood px-3 py-1.5 text-[11px] uppercase tracking-widest" onClick={rejectClaim} data-testid="reject-claim-btn"><XCircle size={12} className="inline mr-1" /> Reject</button>
                                        </>
                                    )}
                                    {/* MPCA-245 · Payment_Made stage */}
                                    {canMarkPayment && (
                                        <button
                                            className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-mpca-green-dark text-mpca-ivory flex items-center gap-1"
                                            onClick={markPaymentMade}
                                            data-testid="mark-payment-made-btn"
                                        >
                                            <IndianRupee size={11} /> Mark Payment Made
                                        </button>
                                    )}
                                    {canPostApprovalReject && (
                                        <button
                                            className="border border-mpca-oxblood text-mpca-oxblood px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors"
                                            onClick={rejectClaim}
                                            data-testid="reject-approved-claim-btn"
                                            title="Reject this claim on post-approval audit — Division will see the reason on their side."
                                        >
                                            <XCircle size={12} className="inline mr-1" /> Reject (Audit)
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* MPCA-245 · Progress ribbon */}
                            {selected.status !== "Rejected" && (
                                <div className="mb-5 border border-mpca-brass/30 bg-mpca-parchment/40 p-3" data-testid="grant-progress-ribbon">
                                    <div className="flex items-center justify-between gap-1 relative">
                                        {GRANT_STEPS.map((step, i) => {
                                            const currentIdx = _stepIndex(selected.status);
                                            const done = i < currentIdx;
                                            const active = i === currentIdx;
                                            return (
                                                <div key={step.key} className="flex-1 flex flex-col items-center relative" data-testid={`ribbon-step-${step.key}`}>
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 text-[10px] font-mono ${
                                                        done ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" :
                                                        active ? "bg-mpca-brass text-mpca-ivory border-mpca-brass animate-pulse" :
                                                        "bg-mpca-ivory text-mpca-brass border-mpca-brass/30"
                                                    }`}>
                                                        {done ? "✓" : i + 1}
                                                    </div>
                                                    <div className={`text-[9px] uppercase tracking-widest mt-1 text-center ${active ? "text-mpca-brass font-semibold" : done ? "text-mpca-green-dark" : "text-mpca-gray-dark"}`}>
                                                        {step.label}
                                                    </div>
                                                    {i < GRANT_STEPS.length - 1 && (
                                                        <div className={`absolute top-3.5 left-[calc(50%+14px)] right-[calc(-50%+14px)] h-0.5 ${done ? "bg-mpca-green-dark" : "bg-mpca-brass/30"}`}></div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {selected.status === "Rejected" && (
                                <div className="mb-5 border-2 border-mpca-oxblood bg-mpca-oxblood/5 p-3 text-[11px] text-mpca-oxblood" data-testid="grant-rejected-banner">
                                    <b>REJECTED</b> — {selected.rejection_reason || "no reason recorded"}
                                </div>
                            )}

                            {/* MPCA-245 · Tabs */}
                            <div className="border-b border-mpca-brass/30 mb-4 flex gap-1" data-testid="grant-tabs">
                                {[
                                    { key: "details",     label: "Details" },
                                    { key: "documents",   label: `Documents (${(selected.documents || []).length})` },
                                    { key: "discussion",  label: `Discussion (${discussions.length})` },
                                    { key: "history",     label: "History" },
                                ].map(t => (
                                    <button
                                        key={t.key}
                                        onClick={() => setTab(t.key)}
                                        className={`px-3 py-1.5 text-[10px] uppercase tracking-widest ${tab === t.key ? "border-b-2 border-mpca-oxblood text-mpca-oxblood" : "text-mpca-gray-dark hover:text-mpca-brass"}`}
                                        data-testid={`grant-tab-${t.key}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* MPCA-245 · Tab content — Details tab keeps existing AI summary + docs */}
                            {(tab === "details" || tab === "documents") && (
                            <>
                            {/* Feb 2026 · Attached Camp View — shown only when this claim was
                                auto-materialised from a Division-owned camp reimbursement flow */}
                            {tab === "details" && selected.attached_tournament_id && (
                                <AttachedCampView claim={selected} />
                            )}
                            {/* MPCA-250 · Purpose of claim (long-text) — editable in Draft/Documents_Pending/Rejected */}
                            {tab === "details" && (
                            <div className="mb-4 border border-mpca-brass/30 p-3 bg-mpca-parchment/40" data-testid="purpose-editor">
                                <div className="overline text-[9px] mb-1">Purpose of Claim</div>
                                {!isMPCA && ["Draft", "Documents_Pending", "Rejected"].includes(selected.status) ? (
                                    <>
                                        <textarea
                                            rows={4}
                                            className="input-heritage !text-sm w-full"
                                            placeholder="Describe in detail the purpose for which this grant is being claimed…"
                                            value={purposeDraft}
                                            onChange={(e) => setPurposeDraft(e.target.value)}
                                            data-testid="purpose-input"
                                        />
                                        <div className="mt-2 flex justify-end">
                                            <button
                                                onClick={savePurpose}
                                                disabled={purposeDraft === (selected.purpose_of_claim || "")}
                                                className="text-[10px] uppercase tracking-widest px-3 py-1 bg-mpca-oxblood text-mpca-ivory disabled:opacity-40"
                                                data-testid="save-purpose-btn"
                                            >Save Purpose</button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-[13px] text-mpca-charcoal whitespace-pre-wrap italic" data-testid="purpose-readonly">
                                        {selected.purpose_of_claim || <span className="text-mpca-gray-dark">— No purpose recorded —</span>}
                                    </div>
                                )}
                            </div>
                            )}

                            {/* MPCA-250 · Extra supporting docs — visible in both details + documents tabs */}
                            <div className="mb-4 border border-mpca-brass/30 p-3" data-testid="extra-docs-panel">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="overline text-[9px]">Supporting Documents (Optional) · {(selected.extra_documents || []).length}</div>
                                    {!isMPCA && ["Draft", "Documents_Pending", "Rejected"].includes(selected.status) && (
                                        <button
                                            onClick={addExtraDocument}
                                            disabled={uploadingExtra}
                                            className="text-[10px] uppercase tracking-widest px-3 py-1 border border-mpca-brass text-mpca-brass hover:bg-mpca-brass/10 disabled:opacity-40"
                                            data-testid="add-extra-doc-btn"
                                        >
                                            <Upload size={11} className="inline mr-1" /> {uploadingExtra ? "Uploading…" : "Add Supporting Document"}
                                        </button>
                                    )}
                                </div>
                                {(selected.extra_documents || []).length === 0 ? (
                                    <div className="text-[11px] text-mpca-gray-dark italic py-2">No supporting documents attached. Any extra evidence you upload here will also print in the summary PDF.</div>
                                ) : (
                                    <ul className="space-y-1">
                                        {selected.extra_documents.map(e => (
                                            <li key={e.doc_id} className="flex items-center justify-between text-[11px] p-2 bg-mpca-ivory border border-mpca-brass/20" data-testid={`extra-doc-${e.doc_id}`}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-mpca-charcoal font-medium truncate">{e.description}</div>
                                                    <a href={e.file_url} target="_blank" rel="noreferrer" className="text-[10px] text-mpca-oxblood underline truncate">{e.filename || "view file ↗"}</a>
                                                </div>
                                                {!isMPCA && ["Draft", "Documents_Pending", "Rejected"].includes(selected.status) && (
                                                    <button
                                                        onClick={() => removeExtraDocument(e.doc_id)}
                                                        className="ml-2 text-mpca-oxblood text-[10px]"
                                                        data-testid={`remove-extra-doc-${e.doc_id}`}
                                                    >✕</button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
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

                            {/* MPCA-245 · Discussion tab */}
                            {tab === "discussion" && (
                                <div className="space-y-3" data-testid="grant-discussion-panel">
                                    <div className="border border-mpca-brass/30 bg-mpca-parchment/30 max-h-96 overflow-y-auto p-3 space-y-2">
                                        {discussions.length === 0 ? (
                                            <div className="text-center text-[11px] text-mpca-gray-dark italic py-6">
                                                No messages yet. Start a dialogue with {isMPCA ? "the Division" : "MPCA"} below.
                                            </div>
                                        ) : discussions.map(m => {
                                            const mine = m.author_body === persona?.body_code;
                                            return (
                                                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                                    <div className={`max-w-[75%] p-2 border ${mine ? "bg-mpca-cream border-mpca-brass" : "bg-mpca-ivory border-mpca-brass/30"}`}>
                                                        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-0.5">
                                                            {m.author_name}{m.author_body ? ` · ${m.author_body}` : ""}
                                                        </div>
                                                        <div className="text-[12px] text-mpca-charcoal whitespace-pre-wrap">{m.message}</div>
                                                        <div className="text-[9px] text-mpca-gray-dark mt-1 text-right font-mono">
                                                            {new Date(m.created_at).toLocaleString("en-IN")}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="input-heritage flex-1"
                                            placeholder={`Send a message to ${isMPCA ? "the Division" : "MPCA"}…`}
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                                            data-testid="grant-discussion-input"
                                        />
                                        <button
                                            className="btn-heritage-primary"
                                            onClick={sendMessage}
                                            disabled={!newMessage.trim()}
                                            data-testid="grant-discussion-send"
                                        >
                                            <MessageSquare size={12} /> Send
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* MPCA-245 · History tab — chronological audit trail */}
                            {tab === "history" && (
                                <div className="space-y-2 text-[11px]" data-testid="grant-history-panel">
                                    <div className="border border-mpca-brass/30 p-3">
                                        <div className="overline text-[9px] mb-1">Timeline</div>
                                        <ul className="space-y-1.5 text-mpca-charcoal">
                                            <li className="flex gap-3"><span className="font-mono text-mpca-brass w-40">Created</span> {new Date(selected.created_at).toLocaleString("en-IN")}</li>
                                            {selected.signed_submission_at && (
                                                <li className="flex gap-3"><span className="font-mono text-mpca-brass w-40">Div Signed Uploaded</span> {new Date(selected.signed_submission_at).toLocaleString("en-IN")} by {selected.signed_submission_by}</li>
                                            )}
                                            {selected.submitted_at && (
                                                <li className="flex gap-3"><span className="font-mono text-mpca-brass w-40">Submitted</span> {new Date(selected.submitted_at).toLocaleString("en-IN")} by {selected.submitted_by}</li>
                                            )}
                                            {selected.signed_approval_at && (
                                                <li className="flex gap-3"><span className="font-mono text-mpca-brass w-40">MPCA Signed Uploaded</span> {new Date(selected.signed_approval_at).toLocaleString("en-IN")} by {selected.signed_approval_by}</li>
                                            )}
                                            {selected.reviewed_at && (
                                                <li className="flex gap-3"><span className="font-mono text-mpca-brass w-40">{selected.status === "Rejected" ? "Rejected" : "Approved"}</span> {new Date(selected.reviewed_at).toLocaleString("en-IN")} by {selected.reviewed_by}</li>
                                            )}
                                            {selected.payment_made_at && (
                                                <li className="flex gap-3"><span className="font-mono text-mpca-green-dark w-40">Payment Made</span> {new Date(selected.payment_made_at).toLocaleString("en-IN")} · UTR {selected.payment_utr} · ₹{Math.round(selected.payment_amount_inr || 0).toLocaleString("en-IN")}</li>
                                            )}
                                        </ul>
                                    </div>
                                    {selected.signed_submission_url && (
                                        <a href={selected.signed_submission_url} target="_blank" rel="noreferrer" className="block text-mpca-oxblood underline text-[11px]" data-testid="signed-submission-link">
                                            View Division-signed submission PDF ↗
                                        </a>
                                    )}
                                    {selected.signed_approval_url && (
                                        <a href={selected.signed_approval_url} target="_blank" rel="noreferrer" className="block text-mpca-oxblood underline text-[11px]" data-testid="signed-approval-link">
                                            View MPCA-signed approval PDF ↗
                                        </a>
                                    )}
                                    {selected.payment_receipt_url && (
                                        <a href={selected.payment_receipt_url} target="_blank" rel="noreferrer" className="block text-mpca-oxblood underline text-[11px]" data-testid="payment-receipt-link">
                                            View payment receipt ↗
                                        </a>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Feb 2026 · Signed-PDF drop-zone modal (replaces the legacy URL prompts) */}
            <SignedPdfUploadModal
                open={signedUploadModal?.kind === "submission"}
                onClose={() => setSignedUploadModal(null)}
                title="Upload Signed Submission PDF"
                description="Drop the signed submission summary PDF here. MPCA will see it under the History tab once submitted."
                metadata={{ related_type: "grant_claim", related_id: selected?.id, uploaded_by: persona?.name, body_id: persona?.body_code }}
                onUploaded={async (rec) => {
                    const { data } = await api.post(`/grant-claims/${selected.id}/signed-upload`, { signed_url: rec.url });
                    setSelected(data);
                    setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
                }}
                testidPrefix="signed-submission-modal"
            />
            <SignedPdfUploadModal
                open={signedUploadModal?.kind === "approval"}
                onClose={() => setSignedUploadModal(null)}
                title="Upload MPCA-Signed Approval PDF"
                description="Drop the MPCA-office-bearer-signed approval summary PDF here. Only State personas can perform this action."
                metadata={{ related_type: "grant_claim", related_id: selected?.id, uploaded_by: persona?.name, body_id: persona?.body_code }}
                onUploaded={async (rec) => {
                    const { data } = await api.post(`/grant-claims/${selected.id}/mpca-signed-upload`, { signed_url: rec.url });
                    setSelected(data);
                    setClaims((prev) => prev.map((c) => c.id === data.id ? data : c));
                }}
                testidPrefix="signed-approval-modal"
            />

            {/* Feb 2026 · Payment modal (replaces the 4 chained window.prompt calls) */}
            {paymentModalOpen && (
                <PaymentModal
                    claim={selected}
                    persona={persona}
                    onClose={() => setPaymentModalOpen(false)}
                    onSubmit={async (payload) => {
                        await submitPayment(payload);
                        setPaymentModalOpen(false);
                    }}
                />
            )}

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
