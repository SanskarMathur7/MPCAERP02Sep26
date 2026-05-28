import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchMemberProfile, payInvoice } from "@/lib/api";
import { CheckCircle2, IndianRupee, Receipt, Download, ShieldCheck, User } from "lucide-react";
import { MpcaEmblem as MPCAEmblem, MpcaLogoMark } from "@/components/MpcaEmblem";

const inr = (n) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);

const Receipt2 = ({ invoice, member, onClose }) => (
    <div className="fixed inset-0 bg-mpca-wood-dark/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" data-testid="receipt-modal">
        <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full p-10 relative print:border-mpca-charcoal">
            {/* Brass corners */}
            {["top-3 left-3", "top-3 right-3", "bottom-3 left-3", "bottom-3 right-3"].map((pos) => (
                <div
                    key={pos}
                    className={`absolute ${pos} w-3 h-3`}
                    style={{
                        borderTop: pos.includes("top") ? "1px solid var(--mpca-brass)" : 0,
                        borderBottom: pos.includes("bottom") ? "1px solid var(--mpca-brass)" : 0,
                        borderLeft: pos.includes("left") ? "1px solid var(--mpca-brass)" : 0,
                        borderRight: pos.includes("right") ? "1px solid var(--mpca-brass)" : 0,
                    }}
                />
            ))}
            <div className="text-center mb-6">
                <MPCAEmblem className="w-14 h-14 text-mpca-green-dark mx-auto mb-2" />
                <div className="font-serif text-2xl text-mpca-green-dark">Madhya Pradesh Cricket Association</div>
                <div className="overline mt-1">Official Receipt</div>
            </div>
            <div className="border-t border-b border-mpca-brass/40 py-5 space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="overline">Receipt №</span><span className="font-mono text-mpca-charcoal">{invoice.payment_ref}</span></div>
                <div className="flex justify-between"><span className="overline">Invoice №</span><span className="font-mono text-mpca-charcoal">{invoice.invoice_no}</span></div>
                <div className="flex justify-between"><span className="overline">Member</span><span className="font-serif text-mpca-green-dark">{member.name}</span></div>
                <div className="flex justify-between"><span className="overline">UID</span><span className="font-mono text-mpca-charcoal">{member.uid}</span></div>
                <div className="flex justify-between"><span className="overline">Cycle</span><span className="text-mpca-charcoal">{invoice.cycle}</span></div>
                <div className="flex justify-between"><span className="overline">Paid On</span><span className="font-mono text-mpca-charcoal">{new Date(invoice.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span></div>
            </div>
            <div className="text-center my-6">
                <div className="overline">Amount Received</div>
                <div className="font-serif text-5xl text-mpca-green-dark mt-2">₹{inr(invoice.amount + (invoice.late_fee || 0))}</div>
                <div className="text-xs italic font-serif text-mpca-gray-dark mt-2">
                    Rupees {inr(invoice.amount + (invoice.late_fee || 0))} only — with thanks.
                </div>
            </div>
            <div className="flex items-center justify-between pt-5 border-t border-mpca-brass/30">
                <div className="text-[10px] tracking-wider text-mpca-gray-dark uppercase flex items-center gap-1.5">
                    <ShieldCheck size={11} /> Digitally Issued
                </div>
                <div className="font-serif italic text-xs text-mpca-charcoal/70">Hon. Treasurer</div>
            </div>
            <div className="flex justify-center gap-3 mt-6 print:hidden">
                <button onClick={() => window.print()} className="btn-heritage-secondary" data-testid="print-receipt">
                    <Download size={14} strokeWidth={1.5} /> Print / Save PDF
                </button>
                <button onClick={onClose} className="btn-heritage-primary" data-testid="close-receipt">
                    Close
                </button>
            </div>
        </div>
    </div>
);

const STATUS_PILL = {
    Pending: "pill-pending",
    Paid: "pill-active",
    Overdue: "pill-suspended",
    Waived: "pill-lapsed",
};

const MemberProfile = () => {
    const { uid } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [receipt, setReceipt] = useState(null);

    const load = async () => {
        const r = await fetchMemberProfile(uid);
        setData(r);
    };

    useEffect(() => {
        (async () => {
            try {
                await load();
            } catch (_) {}
            finally {
                setLoading(false);
            }
        })();
    }, [uid]);

    const handlePay = async (inv) => {
        setPaying(true);
        try {
            const r = await payInvoice(inv.id);
            setReceipt(r.invoice);
            await load();
        } finally {
            setPaying(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mpca-ivory">
                <div className="font-serif text-mpca-gray-dark">Loading your profile…</div>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mpca-ivory">
                <div className="text-center">
                    <div className="font-serif text-4xl text-mpca-green-dark">Profile not found.</div>
                    <Link to="/" className="btn-heritage-secondary mt-6 inline-flex">Return to MPCA</Link>
                </div>
            </div>
        );
    }

    const { member, invoices, total_outstanding } = data;
    const outstanding = invoices.filter((i) => i.status !== "Paid" && i.status !== "Waived");
    const paid = invoices.filter((i) => i.status === "Paid");

    return (
        <div className="min-h-screen bg-mpca-ivory" data-testid="member-profile-page">
            {/* Header */}
            <header className="bg-mpca-green-dark text-mpca-ivory px-8 md:px-16 py-6 border-b border-mpca-brass/30">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-mpca-ivory flex items-center justify-center p-1">
                            <MpcaLogoMark className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <div className="font-serif text-lg">MPCA</div>
                            <div className="overline text-[9px] text-mpca-gold-light/70">Member Portal</div>
                        </div>
                    </Link>
                    <Link to={`/verify/${uid}`} className="btn-heritage-secondary !text-mpca-gold-light !border-mpca-brass/60">
                        <ShieldCheck size={14} strokeWidth={1.5} /> Verify Identity
                    </Link>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-8 md:px-16 py-12">
                {/* Member header */}
                <div className="text-center mb-12 stately-reveal">
                    <div className="overline mb-3">Welcome</div>
                    <div className="flex justify-center mb-4">
                        {member.photo_url ? (
                            <img src={member.photo_url} alt={member.name} className="w-24 h-24 object-cover border-2 border-mpca-brass rounded-full" />
                        ) : (
                            <div className="w-24 h-24 border-2 border-mpca-brass rounded-full flex items-center justify-center bg-mpca-parchment">
                                <User size={36} className="text-mpca-brass" strokeWidth={1} />
                            </div>
                        )}
                    </div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark leading-tight">
                        {member.name}
                    </h1>
                    <div className="mt-3 flex justify-center flex-wrap items-center gap-3">
                        <span className="font-mono text-[11px] tracking-[0.2em] text-mpca-brass px-3 py-1 border border-mpca-brass/40">
                            {member.uid}
                        </span>
                        <span className="overline">{member.category} · {member.sub_category}</span>
                    </div>
                    <div className="crest-divider mt-10" />
                </div>

                {/* Outstanding hero */}
                {total_outstanding > 0 ? (
                    <div className="bulletin-card p-10 mb-10 bg-gradient-to-br from-mpca-parchment to-mpca-ivory border-mpca-oxblood/30" data-testid="outstanding-card">
                        <div className="flex items-start gap-5 mb-6">
                            <IndianRupee className="text-mpca-oxblood" size={36} strokeWidth={1.25} />
                            <div>
                                <div className="overline !text-mpca-oxblood">Outstanding Dues</div>
                                <div className="font-serif text-5xl md:text-6xl text-mpca-oxblood leading-none mt-2">
                                    ₹{inr(total_outstanding)}
                                </div>
                                <p className="text-sm text-mpca-charcoal mt-3 italic font-serif">
                                    Kindly settle the dues below to avoid forfeiture of voting rights at the next AGM.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {outstanding.map((inv) => (
                                <div key={inv.id} className="border-t border-mpca-brass/15 pt-4 flex items-center justify-between gap-4 flex-wrap" data-testid={`outstanding-${inv.invoice_no}`}>
                                    <div>
                                        <div className="font-mono text-[10px] text-mpca-brass tracking-wider">{inv.invoice_no}</div>
                                        <div className="font-serif text-lg text-mpca-green-dark mt-1">{inv.description || `Subscription · ${inv.cycle}`}</div>
                                        <div className="text-[11px] text-mpca-gray-dark mt-1">
                                            Due {new Date(inv.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`pill ${STATUS_PILL[inv.status]}`}>{inv.status}</span>
                                        <div className="text-right">
                                            <div className="font-mono text-xl text-mpca-charcoal">₹{inr(inv.amount + (inv.late_fee || 0))}</div>
                                            {inv.late_fee > 0 && <div className="text-[10px] text-mpca-oxblood">incl. ₹{inr(inv.late_fee)} penalty</div>}
                                        </div>
                                        <button
                                            onClick={() => handlePay(inv)}
                                            disabled={paying}
                                            className="btn-heritage-primary disabled:opacity-50"
                                            data-testid={`pay-${inv.invoice_no}`}
                                        >
                                            {paying ? "Processing…" : "Pay Now"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 pt-4 border-t border-mpca-brass/20 text-[10px] text-mpca-gray-dark italic font-serif text-center">
                            Note: This demo uses a mocked payment gateway. Real cards / UPI / NEFT integration will be enabled in a forthcoming release.
                        </div>
                    </div>
                ) : (
                    <div className="bulletin-card p-10 mb-10 text-center" data-testid="all-clear-card" style={{ borderColor: "var(--mpca-green-dark)", borderWidth: 2 }}>
                        <CheckCircle2 className="mx-auto text-mpca-green-dark mb-4" size={48} strokeWidth={1.25} />
                        <div className="overline">All Clear</div>
                        <h2 className="font-serif text-3xl text-mpca-green-dark mt-3">No outstanding dues.</h2>
                        <p className="text-mpca-gray-dark mt-2 italic font-serif">Your subscription is up-to-date. Thank you for your continued patronage.</p>
                    </div>
                )}

                {/* Payment history */}
                {paid.length > 0 && (
                    <div data-testid="payment-history">
                        <div className="mb-5">
                            <div className="overline">History</div>
                            <h3 className="font-serif text-2xl text-mpca-green-dark mt-1">Past Payments</h3>
                        </div>
                        <div className="bulletin-card overflow-hidden">
                            {paid.map((inv) => (
                                <div key={inv.id} className="ledger-row grid grid-cols-12 gap-4 px-6 py-4 items-center" data-testid={`paid-${inv.invoice_no}`}>
                                    <div className="col-span-1">
                                        <Receipt className="text-mpca-green-dark" size={18} strokeWidth={1.5} />
                                    </div>
                                    <div className="col-span-3 font-mono text-[10px] text-mpca-brass tracking-wider">
                                        {inv.invoice_no}
                                    </div>
                                    <div className="col-span-4 text-sm">
                                        <div className="text-mpca-charcoal">Subscription · {inv.cycle}</div>
                                        <div className="text-[10px] text-mpca-gray-dark mt-0.5">
                                            Paid {new Date(inv.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                        </div>
                                    </div>
                                    <div className="col-span-2 font-mono text-[10px] text-mpca-gray-dark">{inv.payment_ref}</div>
                                    <div className="col-span-2 text-right font-mono text-mpca-charcoal">₹{inr(inv.amount)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-16 text-xs text-mpca-gray-dark italic font-serif text-center">
                    For any discrepancy, kindly write to the Hon. Treasurer at the registered office.
                </div>
            </main>

            {receipt && <Receipt2 invoice={receipt} member={member} onClose={() => setReceipt(null)} />}
        </div>
    );
};

export default MemberProfile;
