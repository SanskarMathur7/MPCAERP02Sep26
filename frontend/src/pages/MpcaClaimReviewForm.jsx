import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";

/**
 * MPCA-168 · Phase D · MPCA Review Decision PDF (MPCA letterhead)
 * ────────────────────────────────────────────────────────────────
 * After MPCA walks every invoice on a reimbursement claim and records
 * per-invoice acceptance, this PDF captures their FINAL decision:
 *   · Tournament + Division details
 *   · Per-invoice line-item review with accepted amount + reason
 *   · Head-wise Budget / Spent by Division / Accepted by MPCA table
 *   · MPCA signature blocks
 * MPCA signs the printout and uploads the scan back — that upload is the
 * unlock gate for the final "Approve Claim" button on ReimbursementClaimDetail.
 */
const MpcaClaimReviewForm = () => {
    const { id } = useParams();
    const [claim, setClaim] = useState(null);
    const [tournament, setTournament] = useState(null);
    const [body, setBody] = useState(null);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data: c } = await api.get(`/reimbursement-claims/${id}`);
                setClaim(c);
                const [t, s, b] = await Promise.all([
                    api.get(`/tournaments/${c.tournament_id}`).then((r) => r.data).catch(() => null),
                    api.get(`/reimbursement-claims/${id}/review-summary`).then((r) => r.data).catch(() => null),
                    api.get(`/bodies/${c.body_id}`).then((r) => r.data).catch(() => null),
                ]);
                setTournament(t); setSummary(s); setBody(b);
            } finally { setLoading(false); }
        })();
    }, [id]);

    if (loading) return <CricketLoader label="Preparing MPCA decision sheet…" />;
    if (!claim || !tournament || !summary) return <div className="p-16 text-center">Data unavailable</div>;

    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—";
    const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const heads = (summary.heads || []).filter((h) => (h.budget_inr || 0) > 0 || (h.spent_inr || 0) > 0 || (h.accepted_inr || 0) > 0);
    const totals = summary.totals || {};
    const bodyName = body?.name || claim.body_name || claim.body_id;

    return (
        <div className="min-h-screen bg-white text-black px-8 md:px-16 py-10 max-w-4xl mx-auto print:px-0 print:py-4" data-testid="mpca-claim-review-form">
            <div className="flex items-center justify-between print:hidden mb-6">
                <div className="text-[11px] text-gray-500">MPCA decision on MPCA letterhead · Ctrl+P → Save → Sign → Upload back → Approve Claim</div>
                <button onClick={() => window.print()} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-white px-4 py-2 flex items-center gap-1" data-testid="mpca-claim-print-btn">
                    <Printer size={12} /> Download PDF
                </button>
            </div>

            {/* MPCA letterhead */}
            <div className="text-center border-b-4 border-double border-black pb-4 mb-6">
                <div className="flex items-center justify-center gap-4 mb-2">
                    <img src="/assets/mpca-logo.png" alt="Madhya Pradesh Cricket Association"
                         className="w-20 h-24 object-contain" />
                    <div>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Madhya Pradesh</h1>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Cricket Association</h1>
                        <div className="text-[10px] italic mt-1">(Affiliated to the Board of Control for Cricket in India)</div>
                        <div className="text-[9px] uppercase tracking-widest mt-0.5">Holkar Stadium, Race Course Road, Indore — 452001 · Madhya Pradesh</div>
                    </div>
                </div>
                <div className="text-[9px] uppercase tracking-widest mt-3">Form FMPCA · RC-02</div>
                <div className="font-serif text-lg mt-1 border-t border-b border-black py-1 uppercase tracking-widest">Reimbursement Claim · MPCA Review & Decision</div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] mb-6">
                <TRow label="Tournament" value={tournament.name} />
                <TRow label="Tournament No." value={tournament.tournament_no} />
                <TRow label="Fiscal Cycle" value={tournament.fiscal_cycle} />
                <TRow label="Category / Age" value={`${tournament.setup_meta?.category || "—"} · ${tournament.setup_meta?.age_group || "—"}`} />
                <TRow label="Claiming Body" value={bodyName} />
                <TRow label="Claim Ref." value={claim.claim_ref} />
                <TRow label="Submitted on" value={fmtDate(claim.submitted_at || claim.created_at)} />
                <TRow label="Invoices" value={`${summary.invoices_reviewed}/${summary.invoice_count} reviewed`} />
            </div>

            {/* Head-wise Budget / Spent / Accepted */}
            <h3 className="font-serif text-lg border-b border-black mb-2 mt-6">A. Head-wise Budget vs. Spent vs. Accepted by MPCA</h3>
            <table className="w-full text-[10.5px] border-collapse mb-6">
                <thead>
                    <tr className="border-y border-black">
                        <th className="text-left py-1 px-2 w-6">#</th>
                        <th className="text-left py-1 px-2">Head</th>
                        <th className="text-right py-1 px-2 w-28">Sanctioned Budget</th>
                        <th className="text-right py-1 px-2 w-28">Spent by Division</th>
                        <th className="text-right py-1 px-2 w-28">Accepted by MPCA</th>
                    </tr>
                </thead>
                <tbody>
                    {heads.map((h, i) => (
                        <tr key={h.head + i} className="border-b border-gray-300">
                            <td className="py-1.5 px-2">{i + 1}</td>
                            <td className="py-1.5 px-2">{h.head}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{fmtINR(h.budget_inr)}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{fmtINR(h.spent_inr)}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-semibold text-green-700">{fmtINR(h.accepted_inr)}</td>
                        </tr>
                    ))}
                    <tr className="border-y-2 border-black bg-gray-50 font-semibold">
                        <td />
                        <td className="py-2 px-2 uppercase text-[10px] tracking-widest">Total</td>
                        <td className="py-2 px-2 text-right font-mono">{fmtINR(totals.budget_inr)}</td>
                        <td className="py-2 px-2 text-right font-mono">{fmtINR(totals.spent_inr)}</td>
                        <td className="py-2 px-2 text-right font-mono text-green-800">{fmtINR(totals.accepted_inr)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Per-invoice review */}
            <h3 className="font-serif text-lg border-b border-black mb-2 mt-6">B. Per-Invoice Acceptance</h3>
            <table className="w-full text-[10px] border-collapse mb-6">
                <thead>
                    <tr className="border-y border-black">
                        <th className="text-left py-1 px-2 w-6">#</th>
                        <th className="text-left py-1 px-2 w-28">Invoice Ref</th>
                        <th className="text-left py-1 px-2">Vendor</th>
                        <th className="text-right py-1 px-2 w-20">Total (₹)</th>
                        <th className="text-right py-1 px-2 w-20">Accepted (₹)</th>
                        <th className="text-left py-1 px-2">Remark</th>
                    </tr>
                </thead>
                <tbody>
                    {(summary.invoices || []).map((inv, i) => (
                        <tr key={inv.invoice_id + i} className="border-b border-gray-300">
                            <td className="py-1.5 px-2">{i + 1}</td>
                            <td className="py-1.5 px-2 font-mono">{inv.invoice_ref || "—"}</td>
                            <td className="py-1.5 px-2">{inv.vendor_name || "—"}<div className="text-[9px] text-gray-500">{inv.invoice_date}</div></td>
                            <td className="py-1.5 px-2 text-right font-mono">{fmtINR(inv.total_inr)}</td>
                            <td className={"py-1.5 px-2 text-right font-mono font-semibold " + (inv.reviewed ? (inv.accepted_inr < inv.total_inr ? "text-red-700" : "text-green-700") : "text-gray-400")}>
                                {inv.reviewed ? fmtINR(inv.accepted_inr) : "PENDING"}
                            </td>
                            <td className="py-1.5 px-2 text-[10px] italic">{inv.reason || (inv.reviewed && inv.accepted_inr === inv.total_inr ? "Accepted in full" : "—")}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Declaration */}
            <div className="border border-black p-4 text-[11px] mb-8">
                <b>MPCA DECISION —</b> The MPCA Selection &amp; Reimbursement Committee has reviewed the reimbursement claim <b className="font-mono">{claim.claim_ref}</b> submitted by <b>{bodyName}</b> for <b>{tournament.name}</b>. The total amount accepted for reimbursement is <b>{fmtINR(totals.accepted_inr)}</b> against the invoiced ₹{Number(totals.spent_inr || 0).toLocaleString("en-IN")}. Any variance between spent and accepted is explained per invoice under Section B above.
            </div>

            {/* Signature block */}
            <div className="grid grid-cols-3 gap-6 mt-16">
                <SigBlock title="Reimbursement In-Charge" body="MPCA" />
                <SigBlock title="Hon. Treasurer" body="MPCA" />
                <SigBlock title="Hon. Secretary" body="MPCA" />
            </div>

            <div className="mt-16 text-center text-[9px] uppercase tracking-widest text-gray-500 print:hidden">
                Print → Sign → Upload back to the claim to unlock the Approve button.
            </div>
        </div>
    );
};

const TRow = ({ label, value }) => (
    <div className="border-b border-dotted border-gray-400 py-1">
        <span className="text-[9px] uppercase tracking-widest text-gray-600">{label}</span>
        <div className="font-serif">{value || "—"}</div>
    </div>
);
const SigBlock = ({ title, body }) => (
    <div className="text-center">
        <div className="h-16" />
        <div className="border-t border-black pt-1 text-[10px] uppercase tracking-widest">{title}</div>
        {body && <div className="text-[9px] text-gray-600 mt-0.5">{body}</div>}
    </div>
);

export default MpcaClaimReviewForm;
