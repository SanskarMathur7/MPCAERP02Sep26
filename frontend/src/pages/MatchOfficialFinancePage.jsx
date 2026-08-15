import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    Loader2, ArrowLeft, ShieldCheck, Landmark, FileText, Upload,
    CheckCircle2, ClipboardEdit, Wallet, Award, PenLine, X, Send,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MatchOfficialDAPanel from "@/components/MatchOfficialDAPanel";

/**
 * MPCA-234 · Match Official · Per-Tournament Finance Page
 * ────────────────────────────────────────────────────────
 * Route: `/my-finance/:tid`
 * The official's dedicated workspace for a single tournament:
 *   1. 6-stage progress bar (Budget Allocated → Running → Completed → Claim → Approved → Paid)
 *   2. Budget Allocated card — Fee + DA that MPCA has already earmarked
 *   3. TA / Expenses form — reuses MatchOfficialDAPanel
 *   4. Download Draft Claim PDF button + Signed-scan upload
 *   5. Submit for MPCA Review (gated on signed scan)
 */
const fmt = (v) => `₹${Math.round(Number(v || 0)).toLocaleString("en-IN")}`;

const MatchOfficialFinancePage = () => {
    const { tid } = useParams();
    const { persona } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true); setErr("");
        try {
            const { data } = await api.get(`/tournaments/${tid}/my-finance-page`);
            setData(data);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    }, [tid]);
    useEffect(() => { load(); }, [load]);

    const stages = data?.stages || [];
    const currentIdx = data?.current_stage_index ?? 0;
    const daForm = data?.da_form;
    const assignment = data?.assignment;
    const tournament = data?.tournament;
    const canEditDA = daForm && (daForm.status === "Draft" || daForm.status === "Rejected");
    const canSubmit = canEditDA && Number(daForm?.total_inr || 0) > 0 && !!daForm?.official_signed_claim_url;

    // ── Upload signed scan (draft claim) ──
    const uploadSignedScan = async (file) => {
        if (!file || !daForm) return;
        setUploading(true); setErr("");
        try {
            // Reuse the shared uploads endpoint
            const form = new FormData();
            form.append("file", file);
            const { data: up } = await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
            const url = up?.url || up?.file_url;
            if (!url) throw new Error("Upload succeeded but URL missing.");
            await api.post(`/match-official-da/${daForm.id}/official-signed-scan`, { url });
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setUploading(false); }
    };

    const submitClaim = async () => {
        if (!daForm) return;
        setSubmitting(true); setErr("");
        try {
            await api.post(`/match-official-da/${daForm.id}/submit`);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSubmitting(false); }
    };

    if (loading) {
        return <div className="p-16 text-center text-mpca-brass"><Loader2 className="inline animate-spin mr-2" /> Loading finance page…</div>;
    }
    if (err && !data) {
        return (
            <div className="p-16 text-center max-w-2xl mx-auto" data-testid="mo-finance-err">
                <div className="text-mpca-oxblood font-mono text-sm mb-3">{err}</div>
                <Link to="/my-assignments" className="text-mpca-oxblood underline text-sm">← Back to My Assignments</Link>
            </div>
        );
    }
    if (!data) return null;

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-8" data-testid="mo-finance-page">
            {/* Back link */}
            <Link to="/my-assignments" className="text-[11px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood inline-flex items-center gap-1 mb-4" data-testid="mo-back">
                <ArrowLeft size={11} /> Back to My Assignments
            </Link>

            {/* Header */}
            <div className="flex items-start gap-3 mb-6">
                <ShieldCheck size={22} className="text-mpca-oxblood mt-1" />
                <div>
                    <div className="overline text-[10px] text-mpca-brass">Match Official · Per-Tournament Finance</div>
                    <h1 className="font-serif text-3xl text-mpca-green-dark">{tournament?.name}</h1>
                    <div className="text-[11px] text-mpca-gray-dark italic mt-1">
                        <b>{persona?.name}</b> · {assignment?.role} · {assignment?.days || 0} day(s) · Season {tournament?.fiscal_cycle}
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="bulletin-card p-4 mb-6" data-testid="mo-progress-bar">
                <div className="flex items-center justify-between mb-3">
                    <div className="overline text-[10px]">Claim Progress</div>
                    <div className="text-[10px] font-mono text-mpca-oxblood">{stages.filter(s => s.done).length} of {stages.length} complete</div>
                </div>
                <div className="flex items-center gap-0">
                    {stages.map((s, i) => {
                        const isCurrent = i === currentIdx && !s.done;
                        const active = s.done || isCurrent;
                        return (
                            <div key={s.key} className="flex-1 flex items-center" data-testid={`mo-stage-${s.key}`}>
                                <div className="flex flex-col items-center flex-1">
                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                                        s.done ? "bg-mpca-green-dark border-mpca-green-dark text-mpca-ivory"
                                        : isCurrent ? "border-mpca-oxblood text-mpca-oxblood bg-mpca-ivory animate-pulse"
                                        : "border-mpca-brass/40 text-mpca-brass bg-mpca-ivory"
                                    }`}>
                                        {s.done ? <CheckCircle2 size={14} /> : <span className="font-mono text-[10px] font-bold">{i + 1}</span>}
                                    </div>
                                    <div className={`text-[9px] uppercase tracking-widest mt-1.5 text-center font-semibold ${active ? "text-mpca-green-dark" : "text-mpca-gray-dark"}`}>{s.label}</div>
                                </div>
                                {i < stages.length - 1 && (
                                    <div className={`h-0.5 flex-1 mt-[-18px] ${stages[i + 1]?.done ? "bg-mpca-green-dark" : "bg-mpca-brass/30"}`}></div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {err && <div className="text-[11px] text-mpca-oxblood font-mono mb-3" data-testid="mo-err">{err}</div>}

            {/* Budget Allocated card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" data-testid="mo-budget-allocated">
                <div className="bulletin-card p-4 border-l-4 border-l-mpca-brass">
                    <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1 flex items-center gap-1"><Award size={11} /> Match Fee (Scheduled)</div>
                    <div className="font-mono text-2xl text-mpca-brass">{fmt(assignment?.fee_allocated_inr)}</div>
                    <div className="text-[10px] text-mpca-gray-dark italic mt-1">{assignment?.days} day(s) × ₹{Math.round(assignment?.per_day_fee_inr || 0).toLocaleString("en-IN")}/day</div>
                </div>
                <div className="bulletin-card p-4 border-l-4 border-l-mpca-oxblood">
                    <div className="text-[9px] uppercase tracking-widest text-mpca-oxblood mb-1 flex items-center gap-1"><Wallet size={11} /> Daily Allowance (Played)</div>
                    <div className="font-mono text-2xl text-mpca-oxblood">{fmt(assignment?.da_allocated_inr)}</div>
                    <div className="text-[10px] text-mpca-gray-dark italic mt-1">{assignment?.days} day(s) × ₹{Math.round(assignment?.per_day_da_inr || 0).toLocaleString("en-IN")}/day</div>
                </div>
                <div className="bulletin-card p-4 border-l-4 border-l-mpca-green-dark bg-mpca-parchment/50">
                    <div className="text-[9px] uppercase tracking-widest text-mpca-green-dark mb-1 flex items-center gap-1"><Landmark size={11} /> MPCA-Allocated Total</div>
                    <div className="font-mono text-2xl text-mpca-green-dark">{fmt(assignment?.grand_allocated_inr)}</div>
                    <div className="text-[10px] text-mpca-gray-dark italic mt-1">
                        {tournament?.budget_locked ? "Locked to MPCA budget snapshot" : "Provisional — budget not yet locked"}
                    </div>
                </div>
            </div>

            {/* Section: TA / Expenses claim */}
            <div className="bulletin-card p-4 mb-6" data-testid="mo-da-editor">
                <div className="mb-4">
                    <div className="overline text-[10px] mb-1">Step 1</div>
                    <div className="font-serif text-lg text-mpca-green-dark">Fill your Travel + Expense claim</div>
                    <p className="text-[11px] text-mpca-gray-dark italic mt-1 max-w-3xl">
                        Add travel legs (with e-tickets), night halt bill, misc receipts and other expenses. Match Fee &amp; DA are auto-calculated from the MPCA-locked rate above.
                    </p>
                </div>
                {daForm ? (
                    <MatchOfficialDAPanel tournamentId={tid} onChange={load} />
                ) : (
                    <div className="p-6 text-center italic text-mpca-gray-dark">
                        Your DA form will be auto-created once the tournament starts. If you believe this is a mistake, please contact MPCA.
                    </div>
                )}
            </div>

            {/* Section: Sign + Submit */}
            {daForm && canEditDA && (
                <div className="bulletin-card p-4 mb-6 border-l-4 border-l-mpca-oxblood" data-testid="mo-sign-submit-block">
                    <div className="mb-4">
                        <div className="overline text-[10px] mb-1">Step 2</div>
                        <div className="font-serif text-lg text-mpca-green-dark">Sign &amp; Submit for MPCA Review</div>
                        <p className="text-[11px] text-mpca-gray-dark italic mt-1 max-w-3xl">
                            Download the draft claim as PDF, sign the last page, scan/photo it, and upload here. Your claim can only be submitted to MPCA once the signed scan is attached.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Step A: Download PDF */}
                        <Link
                            to={`/match-official-da/${daForm.id}/voucher`}
                            className="border border-mpca-brass/40 p-3 flex items-center gap-3 hover:border-mpca-oxblood hover:bg-mpca-parchment/50 transition-colors"
                            data-testid="mo-download-draft-pdf"
                        >
                            <FileText size={20} className="text-mpca-brass" />
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-widest">Download Draft PDF</div>
                                <div className="text-[10px] text-mpca-gray-dark italic">Print → Sign → Scan</div>
                            </div>
                        </Link>

                        {/* Step B: Upload signed scan */}
                        <label className={`border p-3 flex items-center gap-3 cursor-pointer transition-colors ${
                            daForm.official_signed_claim_url ? "border-mpca-green-dark bg-mpca-green-dark/5" : "border-mpca-brass/40 hover:border-mpca-oxblood hover:bg-mpca-parchment/50"
                        }`} data-testid="mo-upload-signed-scan">
                            {daForm.official_signed_claim_url ? <CheckCircle2 size={20} className="text-mpca-green-dark" /> : <Upload size={20} className="text-mpca-brass" />}
                            <div className="flex-1">
                                <div className="text-[11px] font-semibold uppercase tracking-widest">
                                    {daForm.official_signed_claim_url ? "Signed Scan Uploaded" : "Upload Signed Scan"}
                                </div>
                                <div className="text-[10px] text-mpca-gray-dark italic">
                                    {daForm.official_signed_claim_url ? (
                                        <a href={daForm.official_signed_claim_url} target="_blank" rel="noopener noreferrer" className="text-mpca-oxblood underline">View uploaded scan</a>
                                    ) : "PDF / JPG / PNG"}
                                </div>
                            </div>
                            <input
                                type="file"
                                accept=".pdf,image/*"
                                onChange={(e) => e.target.files?.[0] && uploadSignedScan(e.target.files[0])}
                                className="hidden"
                                disabled={uploading}
                            />
                        </label>

                        {/* Step C: Submit */}
                        <button
                            onClick={submitClaim}
                            disabled={!canSubmit || submitting}
                            className="bg-mpca-oxblood text-mpca-ivory px-4 py-3 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!daForm.official_signed_claim_url ? "Upload signed scan first" : ""}
                            data-testid="mo-submit-claim"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            <span className="text-[11px] uppercase tracking-widest font-semibold">Submit to MPCA</span>
                        </button>
                    </div>
                    {uploading && <div className="text-[10px] text-mpca-brass mt-2 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Uploading…</div>}
                </div>
            )}

            {/* Post-submit status blocks */}
            {daForm && daForm.status === "Submitted" && (
                <div className="bulletin-card p-4 mb-6 border-l-4 border-l-mpca-brass" data-testid="mo-under-review">
                    <div className="font-serif text-lg text-mpca-green-dark mb-1">Under MPCA Review</div>
                    <p className="text-[11px] text-mpca-gray-dark italic">
                        Your claim of <b>{fmt(daForm.total_inr)}</b> was submitted on {daForm.submitted_at ? new Date(daForm.submitted_at).toLocaleDateString("en-IN") : "—"}. MPCA is reviewing it. You&apos;ll be notified when a decision is made.
                    </p>
                </div>
            )}
            {daForm && daForm.status === "Approved" && (
                <div className="bulletin-card p-4 mb-6 border-l-4 border-l-mpca-green-dark" data-testid="mo-approved">
                    <div className="font-serif text-lg text-mpca-green-dark mb-1">Approved by MPCA</div>
                    <p className="text-[11px] text-mpca-gray-dark italic">
                        Approved amount: <b className="text-mpca-green-dark">{fmt(daForm.total_inr)}</b> · Awaiting Treasurer payment. <Link to={`/match-official-da/${daForm.id}/voucher`} className="text-mpca-oxblood underline">View voucher</Link>
                    </p>
                </div>
            )}
            {daForm && daForm.status === "Paid" && (
                <div className="bulletin-card p-4 mb-6 border-l-4 border-l-mpca-navy" data-testid="mo-paid">
                    <div className="font-serif text-lg text-mpca-navy mb-1 flex items-center gap-2"><Landmark size={16} /> Payment Received</div>
                    <p className="text-[11px] text-mpca-gray-dark">
                        <b className="text-mpca-navy">{fmt(daForm.paid_amount_inr)}</b> paid via <b>{daForm.payment_mode}</b> · Ref <span className="font-mono">{daForm.payment_ref}</span> on {daForm.paid_at ? new Date(daForm.paid_at).toLocaleDateString("en-IN") : "—"}.
                    </p>
                    <Link to={`/match-official-da/${daForm.id}/voucher`} className="text-[10px] uppercase tracking-widest text-mpca-oxblood underline mt-1 inline-block" data-testid="mo-final-voucher">
                        Download final paid voucher →
                    </Link>
                </div>
            )}
        </div>
    );
};

export default MatchOfficialFinancePage;
