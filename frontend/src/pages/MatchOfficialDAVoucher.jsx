import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";

/**
 * MPCA-233 · Match Official Payment Voucher (MPCA letterhead)
 * ────────────────────────────────────────────────────────────
 * Auditable printable voucher generated after MPCA Approves the DA/TA form.
 * When the Treasurer records payment (UTR + mode + date) via the Finance
 * Console TA/DA tab, this voucher also stamps a green "PAID" watermark
 * with the transfer reference so the Official has proof of disbursement.
 *
 * Route: `/match-official-da/{did}/voucher`
 */
const fmtINR = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—");

const TRow = ({ label, value }) => (
    <div className="flex gap-2">
        <div className="uppercase text-[9px] tracking-widest text-gray-600 w-40 shrink-0 pt-0.5">{label}</div>
        <div className="font-serif text-[12px]">{value ?? "—"}</div>
    </div>
);

const MatchOfficialDAVoucher = () => {
    const { did } = useParams();
    const [form, setForm] = useState(null);
    const [tournament, setTournament] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data: f } = await api.get(`/match-official-da/${did}`);
                setForm(f);
                if (f?.tournament_id) {
                    const { data: t } = await api.get(`/tournaments/${f.tournament_id}`).catch(() => ({ data: null }));
                    setTournament(t);
                }
            } finally { setLoading(false); }
        })();
    }, [did]);

    if (loading) return <CricketLoader label="Preparing payment voucher…" />;
    if (!form) return <div className="p-16 text-center" data-testid="voucher-not-found">Voucher data unavailable</div>;

    const isPaid = form.status === "Paid";
    const isApproved = form.status === "Approved" || isPaid;

    const heads = [
        { label: "Match Fee", detail: `${form.scheduled_days || 0} scheduled day(s) × ${fmtINR(form.match_fee_rate_inr)}/day`, amt: form.match_fee_amount_inr },
        { label: "Daily Allowance (DA)", detail: `${form.played_days || 0} played day(s) × ${fmtINR(form.da_rate_inr)}/day`, amt: form.da_amount_inr },
        { label: "Travel Fare", detail: `${(form.travel_segments || []).length} leg(s)`, amt: form.travel_amount_inr },
        { label: "Journey Expenses", detail: `${form.journey_hours || 0} hour(s) @ ${fmtINR(form.journey_rate_per_12h_inr)}/12h`, amt: form.journey_amount_inr },
        { label: "Conveyance Allowance", detail: `${form.conveyance_count || 0} trip(s) × ${fmtINR(form.conveyance_rate_inr)}`, amt: form.conveyance_amount_inr },
        { label: "Incidental Charges", detail: `${form.incidental_days || 0} day(s) × ${fmtINR(form.incidental_rate_inr)}`, amt: form.incidental_amount_inr },
        { label: "Night Halt", detail: form.night_halt_place || "—", amt: form.night_halt_amount_inr },
        { label: "Misc / Other", detail: `${(form.misc_items || []).length} line(s)`, amt: form.misc_amount_inr },
    ].filter((h) => Number(h.amt || 0) > 0);

    return (
        <div className="min-h-screen bg-white text-black px-8 md:px-16 py-10 max-w-4xl mx-auto print:px-0 print:py-4 relative" data-testid="da-voucher-page">
            {/* PAID watermark */}
            {isPaid && (
                <div className="absolute top-24 right-16 border-4 border-mpca-green-dark text-mpca-green-dark px-5 py-2 -rotate-12 pointer-events-none z-10 print:opacity-80" data-testid="voucher-paid-stamp">
                    <div className="font-serif text-3xl tracking-widest">PAID</div>
                    <div className="text-[10px] uppercase tracking-widest text-center">{fmtDate(form.paid_at)}</div>
                </div>
            )}

            <div className="flex items-center justify-between print:hidden mb-6">
                <div className="text-[11px] text-gray-500">Payment voucher · MPCA letterhead · Ctrl+P → Save PDF</div>
                <button onClick={() => window.print()} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-white px-4 py-2 flex items-center gap-1" data-testid="voucher-print-btn">
                    <Printer size={12} /> Download PDF
                </button>
            </div>

            {/* MPCA letterhead */}
            <div className="text-center border-b-4 border-double border-black pb-4 mb-6">
                <div className="flex items-center justify-center gap-4 mb-2">
                    <img src="/assets/mpca-logo.png" alt="Madhya Pradesh Cricket Association" className="w-20 h-24 object-contain" />
                    <div>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Madhya Pradesh</h1>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Cricket Association</h1>
                        <div className="text-[10px] italic mt-1">(Affiliated to the Board of Control for Cricket in India)</div>
                        <div className="text-[9px] uppercase tracking-widest mt-0.5">Holkar Stadium, Race Course Road, Indore — 452001 · Madhya Pradesh</div>
                    </div>
                </div>
                <div className="text-[9px] uppercase tracking-widest mt-3">Form FMPCA · MO-037 · Payment Voucher</div>
                <div className="font-serif text-lg mt-1 border-t border-b border-black py-1 uppercase tracking-widest">Match Official · TA / DA Payment Voucher</div>
            </div>

            {/* Voucher meta */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-6">
                <TRow label="Voucher Ref" value={<span className="font-mono">{form.da_ref}</span>} />
                <TRow label="Status" value={<b className={isPaid ? "text-mpca-green-dark" : isApproved ? "text-mpca-oxblood" : "text-mpca-brass"}>{form.status}</b>} />
                <TRow label="Tournament" value={tournament?.name || form.tournament_name} />
                <TRow label="Fiscal Cycle" value={tournament?.fiscal_cycle || "—"} />
                <TRow label="Official Name" value={<b>{form.official_name}</b>} />
                <TRow label="Role" value={form.official_role} />
                <TRow label="Association / Division" value={form.association_division || "—"} />
                <TRow label="Place of Visit" value={form.place_of_visit || "—"} />
                <TRow label="Purpose" value={form.purpose_of_visit || "—"} />
                <TRow label="Approved On" value={fmtDate(form.approved_at)} />
            </div>

            {/* Head-wise table */}
            <div className="border border-black mb-6" data-testid="voucher-heads-table">
                <div className="bg-gray-100 border-b border-black px-3 py-1.5 font-serif text-sm uppercase tracking-widest">Head-wise Payment Breakup</div>
                <table className="w-full text-[12px]">
                    <thead className="bg-gray-50 text-[9px] uppercase tracking-widest">
                        <tr className="border-b border-black">
                            <th className="text-left px-3 py-2 w-8">#</th>
                            <th className="text-left px-3 py-2">Budget Head</th>
                            <th className="text-left px-3 py-2">Basis</th>
                            <th className="text-right px-3 py-2 w-40">Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {heads.map((h, i) => (
                            <tr key={h.label} className="border-b border-gray-300">
                                <td className="px-3 py-2 font-mono">{i + 1}</td>
                                <td className="px-3 py-2 font-serif">{h.label}</td>
                                <td className="px-3 py-2 text-[11px] italic text-gray-600">{h.detail}</td>
                                <td className="px-3 py-2 text-right font-mono">{fmtINR(h.amt)}</td>
                            </tr>
                        ))}
                        {heads.length === 0 && (
                            <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500 italic">No line items with amounts recorded.</td></tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-black bg-gray-50">
                            <td colSpan={3} className="px-3 py-2 text-right font-serif uppercase tracking-widest">Grand Total (approved)</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-mpca-oxblood" data-testid="voucher-grand-total">{fmtINR(form.total_inr)}</td>
                        </tr>
                        {isPaid && Number(form.paid_amount_inr || 0) !== Number(form.total_inr || 0) && (
                            <tr className="bg-mpca-green-dark/10">
                                <td colSpan={3} className="px-3 py-2 text-right font-serif uppercase tracking-widest text-mpca-green-dark">Paid amount</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-mpca-green-dark">{fmtINR(form.paid_amount_inr)}</td>
                            </tr>
                        )}
                    </tfoot>
                </table>
            </div>

            {/* Payment details */}
            {isPaid ? (
                <div className="border-2 border-mpca-green-dark bg-mpca-green-dark/5 p-4 mb-6" data-testid="voucher-payment-block">
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 size={16} className="text-mpca-green-dark" />
                        <div className="font-serif text-sm uppercase tracking-widest text-mpca-green-dark">Payment Recorded</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                        <TRow label="Paid Amount" value={<b>{fmtINR(form.paid_amount_inr)}</b>} />
                        <TRow label="Payment Mode" value={form.payment_mode} />
                        <TRow label="Reference / UTR" value={<span className="font-mono">{form.payment_ref}</span>} />
                        <TRow label="Paid On" value={fmtDate(form.paid_at)} />
                        <TRow label="Recorded By" value={form.paid_by || "MPCA Treasurer"} />
                        {form.payment_notes && <TRow label="Notes" value={<span className="italic">{form.payment_notes}</span>} />}
                    </div>
                </div>
            ) : isApproved ? (
                <div className="border border-dashed border-mpca-oxblood bg-mpca-oxblood/5 p-4 mb-6 text-center text-[12px] text-mpca-oxblood italic" data-testid="voucher-awaiting-payment">
                    Approved by MPCA — payment will be recorded by the Treasurer via the Finance Console TA/DA tab. This voucher will re-issue with a PAID stamp once the transfer reference is entered.
                </div>
            ) : (
                <div className="border border-dashed border-gray-400 bg-gray-50 p-4 mb-6 text-center text-[12px] text-gray-600 italic">
                    Voucher not yet approved. Status: <b>{form.status}</b>.
                </div>
            )}

            {/* Bank details */}
            {(form.bank_account_no || form.bank_ifsc) && (
                <div className="border border-gray-400 p-3 mb-6 text-[11px]">
                    <div className="uppercase tracking-widest text-[9px] text-gray-600 mb-1">Beneficiary Bank Account</div>
                    <div className="grid grid-cols-3 gap-3 font-mono">
                        <div>A/c: {form.bank_account_no || "—"}</div>
                        <div>IFSC: {form.bank_ifsc || "—"}</div>
                        <div>PAN: {form.pan || "—"}</div>
                    </div>
                </div>
            )}

            {/* MPCA signature blocks */}
            <div className="grid grid-cols-3 gap-6 mt-16 mb-8 text-center text-[11px]">
                <div>
                    <div className="border-t border-black pt-1">Hon. Treasurer</div>
                    <div className="italic text-gray-600">MPCA</div>
                </div>
                <div>
                    <div className="border-t border-black pt-1">Hon. Secretary</div>
                    <div className="italic text-gray-600">MPCA</div>
                </div>
                <div>
                    <div className="border-t border-black pt-1">Received by</div>
                    <div className="italic text-gray-600">{form.official_name}</div>
                </div>
            </div>

            <div className="border-t border-double border-black pt-2 mt-8 text-[9px] text-gray-500 text-center italic">
                Generated {fmtDate(new Date().toISOString())} · This is a system-issued voucher. For queries write to secretariat@mpcaonline.com
            </div>
        </div>
    );
};

export default MatchOfficialDAVoucher;
