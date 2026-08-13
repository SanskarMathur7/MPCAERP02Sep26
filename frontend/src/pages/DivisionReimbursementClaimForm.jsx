import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";

/**
 * MPCA-168 · Phase B · Division Reimbursement Claim PDF (Division letterhead)
 * ──────────────────────────────────────────────────────────────────────────
 * When the Division has completed the tournament and is ready to raise a
 * reimbursement request against MPCA, they print this letter on their OWN
 * letterhead (Division name/seat, no MPCA emblem — MPCA is the addressee).
 * Sections: Tournament details · Head-wise Budget/Spent/Difference · Summary
 * of claim · Signing-off language · Division signature blocks.
 * Division office bearers physically sign, upload the scan back via
 * ClaimsPanel, then submit to MPCA.
 */
const DivisionReimbursementClaimForm = () => {
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
                const [tRes, sumRes, bRes] = await Promise.all([
                    api.get(`/tournaments/${c.tournament_id}`).then((r) => r.data).catch(() => null),
                    api.get(`/reimbursement-claims/${id}/review-summary`).then((r) => r.data).catch(() => null),
                    api.get(`/bodies/${c.body_id}`).then((r) => r.data).catch(() => null),
                ]);
                setTournament(tRes); setSummary(sumRes); setBody(bRes);
            } finally { setLoading(false); }
        })();
    }, [id]);

    if (loading) return <CricketLoader label="Preparing reimbursement letter…" />;
    if (!claim || !tournament) return <div className="p-16 text-center">Claim not found</div>;

    const heads = (summary?.heads || []).filter((h) => (h.budget_inr || 0) > 0 || (h.spent_inr || 0) > 0);
    const totalBudget = summary?.totals?.budget_inr || 0;
    const totalSpent = summary?.totals?.spent_inr || 0;
    const totalDiff = totalBudget - totalSpent;
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—";
    const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

    const bodyName = body?.name || claim.body_name || claim.body_id;
    const bodySeat = body?.seat || "";
    const bodyState = body?.state || "Madhya Pradesh";
    const bodyKind = body?.body_type === "Division" ? "Division" : (body?.body_type || "");

    return (
        <div className="min-h-screen bg-white text-black px-8 md:px-16 py-10 max-w-4xl mx-auto print:px-0 print:py-4" data-testid="division-reimb-claim-form">
            <div className="flex items-center justify-between print:hidden mb-6">
                <div className="text-[11px] text-gray-500">Reimbursement claim on {bodyName} letterhead · Ctrl+P → Save as PDF → Print → Sign → Upload back</div>
                <button onClick={() => window.print()} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-white px-4 py-2 flex items-center gap-1" data-testid="reimb-print-btn">
                    <Printer size={12} /> Print / Save as PDF
                </button>
            </div>

            {/* Division letterhead (NOT MPCA — this is FROM Division TO MPCA) */}
            <div className="text-center border-b-4 border-double border-black pb-4 mb-6">
                <h1 className="font-serif text-3xl uppercase tracking-widest">{bodyName}</h1>
                <div className="text-[10px] italic mt-1">
                    ({bodyKind ? `${bodyKind} of ` : ""}Madhya Pradesh Cricket Association · Affiliated to BCCI)
                </div>
                {bodySeat && (
                    <div className="text-[9px] uppercase tracking-widest mt-0.5">
                        {bodySeat}{bodyState ? ` · ${bodyState}` : ""}
                    </div>
                )}
                <div className="text-[9px] uppercase tracking-widest mt-3">Form {bodyKind ? bodyKind.slice(0,3).toUpperCase() : "DIV"}-RC-01</div>
                <div className="font-serif text-lg mt-1 border-t border-b border-black py-1 uppercase tracking-widest">Tournament Reimbursement Claim</div>
            </div>

            {/* Addressee */}
            <div className="text-[12px] mb-6">
                <div className="mb-1"><b>To,</b></div>
                <div>The Hon. Secretary</div>
                <div>Madhya Pradesh Cricket Association</div>
                <div>Holkar Stadium, Race Course Road, Indore — 452001</div>
                <div className="mt-4 flex items-center justify-between">
                    <div><b>Claim Ref.:</b> <span className="font-mono">{claim.claim_ref}</span></div>
                    <div><b>Date:</b> {fmtDate(claim.created_at)}</div>
                </div>
            </div>

            <div className="text-[12px] mb-4">
                <b>Subject:</b> Reimbursement claim for <b>{tournament.name}</b> under the {claim.fiscal_cycle} scheme.
            </div>

            <div className="text-[12px] mb-6">
                Dear Sir,<br/><br/>
                On behalf of the <b>{bodyName}</b>, we hereby submit our reimbursement claim towards the eligible expenses incurred for the captioned tournament conducted under the aegis of MPCA. Kindly find below the tournament details, the head-wise account of sanctioned versus actual expenditure, and the summary of our claim.
            </div>

            {/* Tournament details */}
            <h3 className="font-serif text-lg border-b border-black mb-2 mt-6">1. Tournament Details</h3>
            <table className="w-full text-[11px] border-collapse mb-6">
                <tbody>
                    <TRow label="Name" value={tournament.name} />
                    <TRow label="Tournament No." value={tournament.tournament_no} />
                    <TRow label="Category / Age Group" value={`${tournament.setup_meta?.category || "—"} · ${tournament.setup_meta?.age_group || "—"}`} />
                    <TRow label="Fiscal Cycle" value={tournament.fiscal_cycle} />
                    <TRow label="Host / Scope" value={`${tournament.host_body_id || "—"} · ${tournament.scope?.replace(/_/g, " ") || "—"}`} />
                    <TRow label="Dates" value={`${fmtDate(tournament.start_date)} → ${fmtDate(tournament.end_date)}`} />
                    <TRow label="Venue(s)" value={(tournament.venues || []).join(", ") || tournament.setup_meta?.venue || "—"} />
                </tbody>
            </table>

            {/* Head-wise Budget/Spent/Difference */}
            <h3 className="font-serif text-lg border-b border-black mb-2 mt-6">2. Head-wise Budget vs. Actual Expenditure</h3>
            <table className="w-full text-[10.5px] border-collapse mb-3">
                <thead>
                    <tr className="border-y border-black">
                        <th className="text-left py-1 px-2 w-6">#</th>
                        <th className="text-left py-1 px-2">Budget Head</th>
                        <th className="text-right py-1 px-2 w-24">Sanctioned</th>
                        <th className="text-right py-1 px-2 w-24">Spent by Division</th>
                        <th className="text-right py-1 px-2 w-24">Difference</th>
                        <th className="text-left py-1 px-2">Remark</th>
                    </tr>
                </thead>
                <tbody>
                    {heads.length === 0 && (
                        <tr><td colSpan={6} className="py-3 px-2 text-center italic text-gray-500">No expenses recorded yet.</td></tr>
                    )}
                    {heads.map((h, i) => {
                        const diff = (h.budget_inr || 0) - (h.spent_inr || 0);
                        const remark = (summary?.division_head_remarks || claim?.division_head_remarks || {})[h.head];
                        return (
                            <tr key={h.head + i} className="border-b border-gray-300">
                                <td className="py-1.5 px-2 align-top">{i + 1}</td>
                                <td className="py-1.5 px-2 align-top">{h.head}</td>
                                <td className="py-1.5 px-2 align-top text-right font-mono">{fmtINR(h.budget_inr)}</td>
                                <td className="py-1.5 px-2 align-top text-right font-mono">{fmtINR(h.spent_inr)}</td>
                                <td className={"py-1.5 px-2 align-top text-right font-mono " + (diff < 0 ? "text-red-700" : "text-green-800")}>
                                    {diff < 0 ? "(-)" : ""} {fmtINR(Math.abs(diff))}
                                </td>
                                <td className="py-1.5 px-2 align-top text-[10px] italic text-gray-700">{remark || "—"}</td>
                            </tr>
                        );
                    })}
                    <tr className="border-y-2 border-black bg-gray-50 font-semibold">
                        <td className="py-2 px-2" />
                        <td className="py-2 px-2 uppercase text-[10px] tracking-widest">Total</td>
                        <td className="py-2 px-2 text-right font-mono">{fmtINR(totalBudget)}</td>
                        <td className="py-2 px-2 text-right font-mono">{fmtINR(totalSpent)}</td>
                        <td className={"py-2 px-2 text-right font-mono " + (totalDiff < 0 ? "text-red-700" : "text-green-800")}>
                            {totalDiff < 0 ? "(-)" : ""} {fmtINR(Math.abs(totalDiff))}
                        </td>
                        <td className="py-2 px-2" />
                    </tr>
                </tbody>
            </table>

            {/* Summary of claim */}
            <h3 className="font-serif text-lg border-b border-black mb-2 mt-6">3. Summary of Claim</h3>
            <table className="w-full text-[11px] border-collapse mb-6">
                <tbody>
                    <TRow label="Invoices Submitted" value={String(claim.invoice_ids?.length || 0)} />
                    <TRow label="Total Invoiced" value={fmtINR((claim.summary || {}).invoiced_total_inr)} />
                    <TRow label="Eligible for Reimbursement" value={<b>{fmtINR((claim.summary || {}).eligible_total_inr)}</b>} />
                    <TRow label="Over-Budget (Ineligible)" value={fmtINR((claim.summary || {}).over_budget_inr)} />
                </tbody>
            </table>

            {/* Signing-off language */}
            <div className="border border-black p-4 text-[11px] mb-8" data-testid="reimb-signing-language">
                <b>Declaration —</b> We, the undersigned office bearers of {bodyName}, hereby certify that:
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>The tournament <b>{tournament.name}</b> was conducted in accordance with the sanctioned budget and MPCA guidelines.</li>
                    <li>All invoices submitted are true, correct, and pertain solely to the said tournament.</li>
                    <li>The claimed amount does not include any expenditure recovered from another source.</li>
                    <li>The physical vouchers / invoices are preserved with us and shall be produced for MPCA audit on demand.</li>
                    <li>We request MPCA to sanction and disburse the eligible reimbursement of <b>{fmtINR((claim.summary || {}).eligible_total_inr)}</b> under the {claim.fiscal_cycle} reimbursement scheme.</li>
                </ul>
            </div>

            <div className="text-[11px] mb-8">
                Thanking you,<br/><br/>
                <b>For and on behalf of {bodyName}</b>
            </div>

            {/* Division signature block */}
            <div className="grid grid-cols-3 gap-6 mt-16">
                <SigBlock title="Hon. Secretary" body={bodyName} />
                <SigBlock title="Treasurer" body={bodyName} />
                <SigBlock title="President" body={bodyName} />
            </div>

            <div className="mt-16 text-center text-[9px] uppercase tracking-widest text-gray-500 print:hidden">
                Print → Sign → Upload back on the Finance Console to close this step. Ref: {claim.claim_ref}
            </div>
        </div>
    );
};

const TRow = ({ label, value }) => (
    <tr className="border-b border-dotted border-gray-400">
        <td className="py-1.5 px-2 w-56 text-[10px] uppercase tracking-widest text-gray-600">{label}</td>
        <td className="py-1.5 px-2">{value || "—"}</td>
    </tr>
);
const SigBlock = ({ title, body }) => (
    <div className="text-center">
        <div className="h-16" />
        <div className="border-t border-black pt-1 text-[10px] uppercase tracking-widest">{title}</div>
        {body && <div className="text-[9px] text-gray-600 mt-0.5">{body}</div>}
    </div>
);

export default DivisionReimbursementClaimForm;
