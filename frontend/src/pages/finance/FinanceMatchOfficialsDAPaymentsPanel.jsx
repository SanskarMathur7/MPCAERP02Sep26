import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, CheckCircle2, RotateCcw, Landmark, FileText, X, Save, Gavel, Upload, Send, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * MPCA-233 · Finance Console · TA / DA Payments Tab
 * ──────────────────────────────────────────────────
 * Lists every Match-Official DA form for the tournament with fee/DA/travel/
 * misc split + payment status. MPCA Treasurer records the disbursement
 * (UTR / mode / date) via the "Mark Paid" action; the value shows up on
 * the Match Official's `/my-assignments` portal instantly.
 *
 * Props:
 *   tournamentId (string, required)
 */
const fmt = (v) => `₹${Math.round(Number(v || 0)).toLocaleString("en-IN")}`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN") : "—");

const STATUS_STYLES = {
    Draft:     "bg-mpca-brass/20 text-mpca-brass",
    Submitted: "bg-mpca-oxblood/15 text-mpca-oxblood",
    Approved:  "bg-mpca-green-dark/20 text-mpca-green-dark",
    Rejected:  "bg-mpca-oxblood text-mpca-ivory",
    Paid:      "bg-mpca-navy text-mpca-ivory",
};

const FinanceMatchOfficialsDAPaymentsPanel = ({ tournament }) => {
    const { persona } = useAuth();
    const isMPCA = persona?.body_type === "State";
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [payingForm, setPayingForm] = useState(null);   // form-id being paid via modal
    const [reviewForm, setReviewForm] = useState(null);   // MPCA-234 · form being reviewed
    const [dedn, setDedn] = useState({ head: "", amount_inr: "", reason: "" });
    const [uploadingScan, setUploadingScan] = useState(false);
    const [payload, setPayload] = useState({ payment_ref: "", payment_mode: "NEFT", paid_amount_inr: "", paid_at: "", payment_notes: "" });

    const load = async () => {
        if (!tournament?.id) return;
        setLoading(true); setErr("");
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/match-official-payments`);
            setData(data);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [tournament?.id]);

    const openPayModal = (f) => {
        setPayingForm(f);
        setPayload({
            payment_ref: "",
            payment_mode: "NEFT",
            paid_amount_inr: String(f.total_inr || 0),
            paid_at: new Date().toISOString().slice(0, 10),
            payment_notes: "",
        });
    };

    const submitPayment = async () => {
        if (!payingForm) return;
        if (!payload.payment_ref?.trim()) { setErr("Payment reference / UTR is required."); return; }
        setBusyId(payingForm.id); setErr("");
        try {
            await api.post(`/match-official-da/${payingForm.id}/mark-paid`, {
                payment_ref: payload.payment_ref.trim(),
                payment_mode: payload.payment_mode,
                paid_amount_inr: Number(payload.paid_amount_inr) || undefined,
                paid_at: payload.paid_at ? new Date(payload.paid_at).toISOString() : undefined,
                payment_notes: payload.payment_notes.trim() || undefined,
                actor_name: persona?.name || "MPCA Treasurer",
            });
            setPayingForm(null);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyId(null); }
    };

    const reversePayment = async (f) => {
        if (!window.confirm(`Reverse payment ${f.payment_ref} for ${f.official_name}? Status will roll back to Approved.`)) return;
        setBusyId(f.id); setErr("");
        try {
            await api.post(`/match-official-da/${f.id}/mark-unpaid`, null, { params: { actor_name: persona?.name || "MPCA Treasurer" } });
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyId(null); }
    };

    // MPCA-234 · Review actions
    const refreshForm = async (fid) => {
        const { data } = await api.get(`/tournaments/${tournament.id}/match-official-payments`);
        setData(data);
        const updated = (data?.forms || []).find((x) => x.id === fid);
        if (updated) setReviewForm(updated);
    };
    const addDeduction = async () => {
        if (!reviewForm) return;
        if (!dedn.head?.trim() || !dedn.reason?.trim() || !(Number(dedn.amount_inr) > 0)) {
            setErr("Head, amount and reason are required for a deduction."); return;
        }
        setBusyId(reviewForm.id); setErr("");
        try {
            await api.post(`/match-official-da/${reviewForm.id}/deductions`, {
                head: dedn.head.trim(), amount_inr: Number(dedn.amount_inr), reason: dedn.reason.trim(),
            }, { params: { actor_name: persona?.name || "MPCA Reviewer" } });
            setDedn({ head: "", amount_inr: "", reason: "" });
            await refreshForm(reviewForm.id);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyId(null); }
    };
    const removeDeduction = async (dednId) => {
        if (!reviewForm) return;
        setBusyId(reviewForm.id); setErr("");
        try {
            await api.delete(`/match-official-da/${reviewForm.id}/deductions/${dednId}`);
            await refreshForm(reviewForm.id);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyId(null); }
    };
    const uploadMpcaSignedScan = async (file) => {
        if (!file || !reviewForm) return;
        setUploadingScan(true); setErr("");
        try {
            const form = new FormData();
            form.append("file", file);
            const { data: up } = await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
            const url = up?.url || up?.file_url;
            if (!url) throw new Error("Upload succeeded but URL missing.");
            await api.post(`/match-official-da/${reviewForm.id}/mpca-signed-scan`, { url });
            await refreshForm(reviewForm.id);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setUploadingScan(false); }
    };
    const approveForm = async () => {
        if (!reviewForm) return;
        setBusyId(reviewForm.id); setErr("");
        try {
            await api.post(`/match-official-da/${reviewForm.id}/approve`, null, {
                params: { actor_name: persona?.name || "MPCA Secretary" },
            });
            setReviewForm(null);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyId(null); }
    };
    const rejectForm = async () => {
        if (!reviewForm) return;
        const reason = window.prompt("Reason for sending back to the Match Official?");
        if (!reason?.trim()) return;
        setBusyId(reviewForm.id); setErr("");
        try {
            await api.post(`/match-official-da/${reviewForm.id}/reject`, null, {
                params: { actor_name: persona?.name || "MPCA", reason: reason.trim() },
            });
            setReviewForm(null);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusyId(null); }
    };

    const rollup = data?.rollup || {};
    const forms = data?.forms || [];

    const totalsRow = useMemo(() => forms.reduce((acc, f) => ({
        fee: acc.fee + Number(f.match_fee_amount_inr || 0),
        da:  acc.da + Number(f.da_amount_inr || 0),
        travel: acc.travel + Number(f.travel_amount_inr || 0),
        misc: acc.misc + Number(f.journey_amount_inr || 0) + Number(f.conveyance_amount_inr || 0) + Number(f.incidental_amount_inr || 0) + Number(f.night_halt_amount_inr || 0) + Number(f.misc_amount_inr || 0),
        approved: acc.approved + (f.status === "Approved" || f.status === "Paid" ? Number(f.total_inr || 0) : 0),
        paid: acc.paid + (f.status === "Paid" ? Number(f.paid_amount_inr || 0) : 0),
    }), { fee: 0, da: 0, travel: 0, misc: 0, approved: 0, paid: 0 }), [forms]);

    return (
        <div data-testid="fc-da-payments-panel">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="overline text-[10px] text-mpca-brass">Match Officials · TA / DA</div>
                    <h2 className="font-serif text-2xl text-mpca-green-dark">Payments Tracker</h2>
                    <p className="text-[11px] text-mpca-gray-dark italic mt-1 max-w-2xl">
                        Every DA/TA form submitted by an officiating umpire, scorer, selector or observer. Treasurer records the disbursement here; the match official sees the UTR + date on their portal.
                    </p>
                </div>
                {loading && <Loader2 size={16} className="animate-spin text-mpca-brass" />}
            </div>

            {/* Rollup tiles */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6" data-testid="fc-da-rollup">
                <div className="bulletin-card p-3">
                    <div className="text-[9px] text-mpca-gray-dark uppercase">Forms</div>
                    <div className="font-mono text-xl text-mpca-green-dark">{rollup.count || 0}</div>
                </div>
                <div className="bulletin-card p-3">
                    <div className="text-[9px] text-mpca-brass uppercase">Fee</div>
                    <div className="font-mono text-lg text-mpca-brass">{fmt(totalsRow.fee)}</div>
                </div>
                <div className="bulletin-card p-3">
                    <div className="text-[9px] text-mpca-oxblood uppercase">DA</div>
                    <div className="font-mono text-lg text-mpca-oxblood">{fmt(totalsRow.da)}</div>
                </div>
                <div className="bulletin-card p-3">
                    <div className="text-[9px] text-mpca-navy uppercase">Travel + Misc</div>
                    <div className="font-mono text-lg text-mpca-navy">{fmt(totalsRow.travel + totalsRow.misc)}</div>
                </div>
                <div className="bulletin-card p-3">
                    <div className="text-[9px] text-mpca-green-dark uppercase">Approved</div>
                    <div className="font-mono text-lg text-mpca-green-dark">{fmt(totalsRow.approved)}</div>
                </div>
                <div className="bulletin-card p-3 border-mpca-navy/40">
                    <div className="text-[9px] text-mpca-navy uppercase">Paid</div>
                    <div className="font-mono text-lg text-mpca-navy">{fmt(totalsRow.paid)}</div>
                </div>
            </div>

            {err && <div className="text-[11px] text-mpca-oxblood font-mono mb-3" data-testid="fc-da-err">{err}</div>}

            {/* Forms table */}
            <div className="bulletin-card p-0 overflow-hidden" data-testid="fc-da-forms-table">
                <table className="w-full text-[12px]">
                    <thead>
                        <tr className="border-b-2 border-mpca-brass/40 text-mpca-gray-dark uppercase text-[9px] tracking-widest bg-mpca-parchment/50">
                            <th className="text-left px-3 py-2">Official</th>
                            <th className="text-left px-3 py-2">Role</th>
                            <th className="text-right px-3 py-2">Days (S / P)</th>
                            <th className="text-right px-3 py-2">Fee</th>
                            <th className="text-right px-3 py-2">DA</th>
                            <th className="text-right px-3 py-2">Travel</th>
                            <th className="text-right px-3 py-2">Total</th>
                            <th className="text-center px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2">Payment</th>
                            <th className="text-right px-3 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {forms.length === 0 && !loading && (
                            <tr><td colSpan={10} className="px-4 py-12 text-center italic text-mpca-gray-dark" data-testid="fc-da-empty">No DA/TA forms yet. Forms are auto-created once fixtures move to In Progress / Completed.</td></tr>
                        )}
                        {forms.map((f) => {
                            const style = STATUS_STYLES[f.status] || "bg-mpca-gray-dark/20 text-mpca-gray-dark";
                            const canMarkPaid = isMPCA && f.status === "Approved";
                            const canReverse = isMPCA && f.status === "Paid";
                            return (
                                <tr key={f.id} className="border-b border-mpca-brass/15 hover:bg-mpca-parchment/30" data-testid={`fc-da-row-${f.id}`}>
                                    <td className="px-3 py-2 font-serif text-mpca-green-dark">
                                        {f.official_name}
                                        <div className="text-[9px] font-mono text-mpca-gray-dark">{f.da_ref}</div>
                                    </td>
                                    <td className="px-3 py-2 text-mpca-charcoal">{f.official_role}</td>
                                    <td className="px-3 py-2 text-right font-mono">{f.scheduled_days || 0} / {f.played_days || 0}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(f.match_fee_amount_inr)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(f.da_amount_inr)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmt(f.travel_amount_inr)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold text-mpca-oxblood">{fmt(f.total_inr)}</td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 ${style}`} data-testid={`fc-da-status-${f.id}`}>{f.status}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                        {f.status === "Paid" ? (
                                            <div className="text-[10px]" data-testid={`fc-da-payment-${f.id}`}>
                                                <div className="font-mono text-mpca-navy font-semibold flex items-center gap-1"><Landmark size={9} /> {fmt(f.paid_amount_inr)}</div>
                                                <div className="text-[9px] font-mono text-mpca-gray-dark">{f.payment_mode} · {f.payment_ref}</div>
                                                <div className="text-[9px] italic text-mpca-gray-dark">{fmtDate(f.paid_at)}</div>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] italic text-mpca-gray-dark">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="inline-flex gap-1 items-center">
                                            {isMPCA && f.status === "Submitted" && (
                                                <button
                                                    onClick={() => setReviewForm(f)}
                                                    className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 hover:opacity-90 inline-flex items-center gap-1"
                                                    data-testid={`fc-da-review-${f.id}`}
                                                >
                                                    <Gavel size={10} /> Review
                                                </button>
                                            )}
                                            {(f.status === "Approved" || f.status === "Paid") && (
                                                <Link to={`/match-official-da/${f.id}/voucher`} className="text-[10px] uppercase tracking-widest border border-mpca-brass text-mpca-brass px-2 py-1 hover:bg-mpca-brass/10 inline-flex items-center gap-1" data-testid={`fc-da-voucher-${f.id}`}>
                                                    <FileText size={10} /> Voucher
                                                </Link>
                                            )}
                                            {canMarkPaid && (
                                                <button
                                                    onClick={() => openPayModal(f)}
                                                    disabled={busyId === f.id}
                                                    className="text-[10px] uppercase tracking-widest bg-mpca-navy text-mpca-ivory px-2 py-1 hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1"
                                                    data-testid={`fc-da-mark-paid-${f.id}`}
                                                >
                                                    <CheckCircle2 size={10} /> Mark Paid
                                                </button>
                                            )}
                                            {canReverse && (
                                                <button
                                                    onClick={() => reversePayment(f)}
                                                    disabled={busyId === f.id}
                                                    className="text-[10px] uppercase tracking-widest border border-mpca-oxblood text-mpca-oxblood px-2 py-1 hover:bg-mpca-oxblood/10 disabled:opacity-40 inline-flex items-center gap-1"
                                                    data-testid={`fc-da-reverse-${f.id}`}
                                                >
                                                    <RotateCcw size={10} /> Reverse
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mark-Paid modal */}
            {payingForm && (
                <div className="fixed inset-0 bg-mpca-charcoal/60 flex items-center justify-center z-50 p-4" data-testid="fc-da-pay-modal">
                    <div className="bg-mpca-ivory border border-mpca-brass/40 max-w-lg w-full p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="overline text-[9px]">Record Payment</div>
                                <div className="font-serif text-lg text-mpca-green-dark">{payingForm.official_name} · {payingForm.da_ref}</div>
                            </div>
                            <button onClick={() => setPayingForm(null)} className="text-mpca-gray-dark hover:text-mpca-oxblood"><X size={16} /></button>
                        </div>
                        <div className="text-xs text-mpca-gray-dark">
                            Approved total: <b className="text-mpca-oxblood">{fmt(payingForm.total_inr)}</b>. Enter the bank / cheque reference so the Official sees this payment on their portal.
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="col-span-2 block">
                                <div className="overline text-[9px] mb-1">Payment Mode</div>
                                <select className="input-heritage !py-1.5" value={payload.payment_mode} onChange={(e) => setPayload({ ...payload, payment_mode: e.target.value })} data-testid="fc-da-pay-mode">
                                    <option>NEFT</option>
                                    <option>RTGS</option>
                                    <option>UPI</option>
                                    <option>Cheque</option>
                                    <option>Cash</option>
                                </select>
                            </label>
                            <label className="col-span-2 block">
                                <div className="overline text-[9px] mb-1">Reference / UTR / Cheque No.</div>
                                <input className="input-heritage !py-1.5 font-mono" placeholder="e.g. UTRN123456789012" value={payload.payment_ref} onChange={(e) => setPayload({ ...payload, payment_ref: e.target.value })} data-testid="fc-da-pay-ref" />
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Paid Amount (₹)</div>
                                <input type="number" min={0} className="input-heritage !py-1.5 font-mono" value={payload.paid_amount_inr} onChange={(e) => setPayload({ ...payload, paid_amount_inr: e.target.value })} data-testid="fc-da-pay-amount" />
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Paid On</div>
                                <input type="date" className="input-heritage !py-1.5" value={payload.paid_at} onChange={(e) => setPayload({ ...payload, paid_at: e.target.value })} data-testid="fc-da-pay-date" />
                            </label>
                            <label className="col-span-2 block">
                                <div className="overline text-[9px] mb-1">Notes (optional)</div>
                                <textarea rows={2} className="input-heritage !py-1.5" value={payload.payment_notes} onChange={(e) => setPayload({ ...payload, payment_notes: e.target.value })} data-testid="fc-da-pay-notes" />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-mpca-brass/20">
                            <button onClick={() => setPayingForm(null)} className="text-xs uppercase tracking-widest text-mpca-gray-dark px-3 py-1.5 hover:text-mpca-oxblood">Cancel</button>
                            <button
                                onClick={submitPayment}
                                disabled={busyId === payingForm.id || !payload.payment_ref?.trim()}
                                className="text-xs uppercase tracking-widest bg-mpca-navy text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"
                                data-testid="fc-da-pay-save"
                            >
                                {busyId === payingForm.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Confirm Payment
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MPCA-234 · Review modal — deductions + MPCA-signed scan + Approve/Reject */}
            {reviewForm && (
                <div className="fixed inset-0 bg-mpca-charcoal/60 flex items-center justify-center z-50 p-4" data-testid="fc-da-review-modal">
                    <div className="bg-mpca-ivory border border-mpca-brass/40 max-w-3xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-start justify-between border-b border-mpca-brass/20 pb-3">
                            <div>
                                <div className="overline text-[9px]">MPCA Review · Deductions + Signed Scan</div>
                                <div className="font-serif text-lg text-mpca-green-dark">{reviewForm.official_name} · {reviewForm.da_ref}</div>
                                <div className="text-[10px] font-mono text-mpca-gray-dark">Claim submitted on {fmtDate(reviewForm.submitted_at)}</div>
                            </div>
                            <button onClick={() => setReviewForm(null)} className="text-mpca-gray-dark hover:text-mpca-oxblood"><X size={16} /></button>
                        </div>

                        {/* Head-wise breakup summary */}
                        <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-3 text-[11px]" data-testid="fc-da-review-summary">
                            <div className="overline text-[9px] mb-2">Claimed Breakup</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
                                <div>Fee: <b className="text-mpca-brass">{fmt(reviewForm.match_fee_amount_inr)}</b></div>
                                <div>DA: <b className="text-mpca-oxblood">{fmt(reviewForm.da_amount_inr)}</b></div>
                                <div>Travel: <b>{fmt(reviewForm.travel_amount_inr)}</b></div>
                                <div>Night Halt: <b>{fmt(reviewForm.night_halt_amount_inr)}</b></div>
                                <div>Journey: <b>{fmt(reviewForm.journey_amount_inr)}</b></div>
                                <div>Conveyance: <b>{fmt(reviewForm.conveyance_amount_inr)}</b></div>
                                <div>Incidental: <b>{fmt(reviewForm.incidental_amount_inr)}</b></div>
                                <div>Misc: <b>{fmt(reviewForm.misc_amount_inr)}</b></div>
                            </div>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-mpca-brass/20">
                                <span className="font-serif text-mpca-oxblood">Grand Total Claimed</span>
                                <span className="font-mono font-bold text-mpca-oxblood text-lg">{fmt(reviewForm.total_inr)}</span>
                            </div>
                            {reviewForm.official_signed_claim_url && (
                                <a href={reviewForm.official_signed_claim_url} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-widest text-mpca-oxblood underline mt-1 inline-flex items-center gap-1">
                                    <ExternalLink size={10} /> View Official&apos;s Signed Scan
                                </a>
                            )}
                        </div>

                        {/* Deductions section */}
                        <div>
                            <div className="overline text-[9px] mb-2">MPCA Deductions (optional)</div>
                            {(reviewForm.mpca_deductions || []).length > 0 && (
                                <table className="w-full text-[11px] mb-3" data-testid="fc-da-deductions-table">
                                    <thead className="bg-mpca-parchment/60 text-[9px] uppercase text-mpca-brass tracking-widest">
                                        <tr>
                                            <th className="text-left px-2 py-1">Head</th>
                                            <th className="text-right px-2 py-1">Amount</th>
                                            <th className="text-left px-2 py-1">Reason</th>
                                            <th className="text-right px-2 py-1 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reviewForm.mpca_deductions.map((d) => (
                                            <tr key={d.id} className="border-b border-mpca-brass/10" data-testid={`fc-da-dedn-${d.id}`}>
                                                <td className="px-2 py-1">{d.head}</td>
                                                <td className="px-2 py-1 text-right font-mono text-mpca-oxblood">{fmt(d.amount_inr)}</td>
                                                <td className="px-2 py-1 italic text-mpca-gray-dark">{d.reason}</td>
                                                <td className="px-2 py-1 text-right">
                                                    <button onClick={() => removeDeduction(d.id)} className="text-mpca-oxblood hover:text-mpca-oxblood/80" title="Remove"><X size={10} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <select className="input-heritage !py-1 !text-[11px]" value={dedn.head} onChange={(e) => setDedn({ ...dedn, head: e.target.value })} data-testid="fc-da-dedn-head">
                                    <option value="">Select Head</option>
                                    <option>Match Fee</option>
                                    <option>Daily Allowance</option>
                                    <option>Travel Fare</option>
                                    <option>Journey</option>
                                    <option>Conveyance</option>
                                    <option>Incidental</option>
                                    <option>Night Halt</option>
                                    <option>Misc</option>
                                </select>
                                <input type="number" min={0} placeholder="Amount ₹" className="input-heritage !py-1 !text-[11px] font-mono" value={dedn.amount_inr} onChange={(e) => setDedn({ ...dedn, amount_inr: e.target.value })} data-testid="fc-da-dedn-amount" />
                                <input placeholder="Reason" className="input-heritage !py-1 !text-[11px]" value={dedn.reason} onChange={(e) => setDedn({ ...dedn, reason: e.target.value })} data-testid="fc-da-dedn-reason" />
                                <button onClick={addDeduction} disabled={busyId === reviewForm.id} className="bg-mpca-oxblood text-mpca-ivory text-[10px] uppercase tracking-widest px-2 py-1 disabled:opacity-40 inline-flex items-center gap-1 justify-center" data-testid="fc-da-dedn-add">
                                    <Send size={10} /> Add Deduction
                                </button>
                            </div>
                            <div className="mt-2 flex justify-between items-center text-[11px] bg-mpca-green-dark/5 border border-mpca-green-dark/30 p-2" data-testid="fc-da-net-approved">
                                <span className="font-serif text-mpca-green-dark">Net Approvable (after deductions)</span>
                                <span className="font-mono font-bold text-mpca-green-dark">
                                    {fmt(Number(reviewForm.total_inr || 0) - (reviewForm.mpca_deductions || []).reduce((s, d) => s + Number(d.amount_inr || 0), 0))}
                                </span>
                            </div>
                        </div>

                        {/* MPCA signed scan */}
                        <div className="border border-mpca-brass/30 p-3">
                            <div className="overline text-[9px] mb-2">MPCA Signed Review PDF</div>
                            <div className="text-[10px] text-mpca-gray-dark italic mb-2">
                                Download MPCA voucher → Sign → Upload here → Approve unlocks
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <a href={`/match-official-da/${reviewForm.id}/voucher`} target="_blank" rel="noopener noreferrer" className="border border-mpca-brass/40 p-2 flex items-center gap-2 hover:border-mpca-oxblood transition-colors text-[11px]" data-testid="fc-da-mpca-voucher-link">
                                    <FileText size={13} /> Download MPCA Review PDF
                                </a>
                                <label className={`border p-2 flex items-center gap-2 cursor-pointer text-[11px] ${reviewForm.mpca_signed_review_url ? "border-mpca-green-dark bg-mpca-green-dark/5" : "border-mpca-brass/40 hover:border-mpca-oxblood"}`} data-testid="fc-da-mpca-signed-scan">
                                    {reviewForm.mpca_signed_review_url ? <CheckCircle2 size={13} className="text-mpca-green-dark" /> : <Upload size={13} />}
                                    <div className="flex-1">
                                        <div>{reviewForm.mpca_signed_review_url ? "MPCA scan uploaded" : "Upload signed scan"}</div>
                                        {reviewForm.mpca_signed_review_url && <a href={reviewForm.mpca_signed_review_url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-mpca-oxblood underline">View</a>}
                                    </div>
                                    <input type="file" accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && uploadMpcaSignedScan(e.target.files[0])} className="hidden" disabled={uploadingScan} />
                                </label>
                            </div>
                            {uploadingScan && <div className="text-[10px] text-mpca-brass mt-1"><Loader2 size={10} className="inline animate-spin mr-1" /> Uploading…</div>}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-3 border-t border-mpca-brass/20">
                            <button onClick={rejectForm} disabled={busyId === reviewForm.id} className="text-[11px] uppercase tracking-widest border border-mpca-oxblood text-mpca-oxblood px-3 py-1.5 hover:bg-mpca-oxblood/10 disabled:opacity-40 inline-flex items-center gap-1" data-testid="fc-da-review-reject">
                                Send Back to Official
                            </button>
                            <button
                                onClick={approveForm}
                                disabled={busyId === reviewForm.id || !reviewForm.mpca_signed_review_url}
                                className="text-[11px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-3 py-1.5 hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1"
                                title={!reviewForm.mpca_signed_review_url ? "Upload MPCA-signed scan first" : ""}
                                data-testid="fc-da-review-approve"
                            >
                                {busyId === reviewForm.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Approve Claim
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceMatchOfficialsDAPaymentsPanel;
