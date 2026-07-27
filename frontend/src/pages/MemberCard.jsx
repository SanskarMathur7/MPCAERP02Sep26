import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchMember } from "@/lib/api";
import { Printer, ArrowLeft, ShieldCheck, User } from "lucide-react";
import { MpcaEmblem as MPCAEmblem } from "@/components/MpcaEmblem";

/* Simple barcode-like watermark from UID */
const BarcodeStrip = ({ uid }) => {
    const bars = uid.split("").map((c) => (c.charCodeAt(0) % 5) + 1);
    return (
        <div className="flex items-end gap-[2px] h-6">
            {bars.map((h, i) => (
                <div key={i} className="bg-mpca-charcoal" style={{ width: 1.5, height: `${h * 3 + 6}px` }} />
            ))}
        </div>
    );
};

/* QR code via api.qrserver.com — public, free, no dep */
const QRCode = ({ value, size = 80 }) => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=4&data=${encodeURIComponent(value)}`;
    return <img src={url} alt="QR verification code" width={size} height={size} className="block" />;
};

const MemberCard = () => {
    const { id } = useParams();
    const [member, setMember] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const m = await fetchMember(id);
                setMember(m);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const handlePrint = () => window.print();

    if (loading) {
        return <div className="p-16 text-center text-mpca-gray-dark font-serif text-lg">Drawing the card…</div>;
    }
    if (!member) {
        return (
            <div className="p-16 text-center">
                <div className="font-serif text-3xl text-mpca-green-dark">Member not found.</div>
                <Link to="/members" className="btn-heritage-secondary mt-6 inline-flex">Return</Link>
            </div>
        );
    }

    const validTill = member.effectiveness || "Permanent";
    const issuedOn = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const initials = member.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="member-card-page">
            {/* Toolbar — hidden in print */}
            <div className="flex items-center justify-between mb-8 print:hidden">
                <Link to={`/members/${id}`} className="btn-heritage-ghost inline-flex" data-testid="card-back-btn">
                    <ArrowLeft size={14} strokeWidth={1.5} /> Back to Member
                </Link>
                <button onClick={handlePrint} className="btn-heritage-primary" data-testid="print-card-btn">
                    <Printer size={14} strokeWidth={1.5} /> Print · Save as PDF
                </button>
            </div>

            <div className="mb-8 print:hidden">
                <div className="overline">Article V(d) · Identity Card</div>
                <h1 className="font-serif text-3xl md:text-4xl text-mpca-green-dark mt-2 leading-tight">
                    Membership Identity Card
                </h1>
                <p className="text-mpca-gray-dark text-sm mt-2 max-w-2xl">
                    Use <span className="font-mono text-xs">Ctrl/Cmd + P</span> or click the
                    button to print or save as PDF. The card is sized for ID-1 (credit-card)
                    when printed at 100% scale.
                </p>
            </div>

            {/* ===== THE CARD ===== */}
            <div className="card-print-wrapper flex flex-col items-center gap-6 print:gap-0">
                {/* FRONT */}
                <div className="mpca-card mpca-card-front" data-testid="card-front">
                    {/* Pitch green band header */}
                    <div className="mpca-card-band">
                        <div className="flex items-center gap-3">
                            <MPCAEmblem className="w-12 h-12 text-mpca-gold-light" />
                            <div className="leading-tight">
                                <div className="font-serif text-xl text-mpca-ivory">
                                    Madhya Pradesh
                                </div>
                                <div className="font-serif text-sm text-mpca-gold-light tracking-wider">
                                    Cricket Association
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="overline !text-mpca-gold-light/80 !text-[8px]">Member Card</div>
                            <div className="font-mono text-[10px] text-mpca-gold-light tracking-widest mt-1">
                                MPCA · BCCI
                            </div>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="mpca-card-body">
                        <div className="flex gap-5">
                            {/* Photo */}
                            <div className="flex-shrink-0">
                                {member.photo_url ? (
                                    <img
                                        src={member.photo_url}
                                        alt={member.name}
                                        className="w-24 h-28 object-cover border-2 border-mpca-brass"
                                    />
                                ) : (
                                    <div className="w-24 h-28 border-2 border-mpca-brass flex items-center justify-center bg-mpca-parchment">
                                        <span className="font-serif text-3xl text-mpca-green-dark">{initials}</span>
                                    </div>
                                )}
                                <div className="text-center text-[8px] font-mono text-mpca-gray-dark mt-1 tracking-wider">
                                    PHOTOGRAPH
                                </div>
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                                <div className="overline !text-[8px]">Name</div>
                                <div className="font-serif text-lg text-mpca-green-dark leading-tight mt-0.5 truncate">
                                    {member.name}
                                </div>

                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3">
                                    <div>
                                        <div className="overline !text-[7px]">UID</div>
                                        <div className="font-mono text-[10px] text-mpca-charcoal tracking-wider mt-0.5">
                                            {member.uid}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="overline !text-[7px]">Category</div>
                                        <div className="text-[10px] text-mpca-charcoal mt-0.5">
                                            {member.category}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="overline !text-[7px]">Date of Birth</div>
                                        <div className="font-mono text-[10px] text-mpca-charcoal mt-0.5">
                                            {member.date_of_birth
                                                ? new Date(member.date_of_birth).toLocaleDateString("en-GB")
                                                : "—"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="overline !text-[7px]">Enrolled</div>
                                        <div className="font-mono text-[10px] text-mpca-charcoal mt-0.5">
                                            {member.membership_date
                                                ? new Date(member.membership_date).toLocaleDateString("en-GB")
                                                : "—"}
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <div className="overline !text-[7px]">Phone / Email</div>
                                        <div className="text-[10px] text-mpca-charcoal mt-0.5 truncate">
                                            {member.phone || "—"}{member.email ? ` · ${member.email}` : ""}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 pt-2 border-t border-mpca-brass/30">
                                    <div className="overline !text-[7px]">Valid</div>
                                    <div className="text-[10px] text-mpca-charcoal mt-0.5 italic font-serif">
                                        {validTill}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Decorative crown / brass ribbon */}
                    <div className="mpca-card-ribbon">
                        <div className="text-[8px] italic font-serif text-mpca-green-dark tracking-wider">
                            "Ludus Cum Honore" · The Game with Honour
                        </div>
                    </div>
                </div>

                {/* BACK */}
                <div className="mpca-card mpca-card-back" data-testid="card-back">
                    <div className="mpca-card-body !pt-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="overline !text-[8px]">Issued On Behalf Of</div>
                                <div className="font-serif text-base text-mpca-green-dark leading-tight mt-0.5">
                                    The Managing Committee
                                </div>
                            </div>
                            <MPCAEmblem className="w-10 h-10 text-mpca-green-dark/40" />
                        </div>

                        <div className="text-[8.5px] leading-relaxed text-mpca-charcoal mb-4">
                            This card is the property of the Madhya Pradesh Cricket Association
                            and must be surrendered upon cessation of membership. It is
                            non-transferable. The holder is bound by the Constitution and
                            By-laws of the Association as amended from time to time.
                        </div>

                        <div className="grid grid-cols-3 gap-3 items-end">
                            {/* Signature panel */}
                            <div className="col-span-2">
                                <div className="border-b border-mpca-charcoal/40 pb-1 italic font-serif text-mpca-charcoal/60 text-base h-10 flex items-end">
                                    {member.signature_url ? (
                                        <img src={member.signature_url} alt="sig" className="max-h-8" />
                                    ) : (
                                        <>{member.name.split(" ").map((w) => w[0]).join(".")}.</>
                                    )}
                                </div>
                                <div className="overline !text-[7px] mt-1">Member Signature</div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <QRCode
                                    value={`${window.location.origin}/verify/${member.uid}`}
                                    size={72}
                                />
                                <div className="overline !text-[7px]">Scan to Verify</div>
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-mpca-brass/30 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 text-[8px] text-mpca-gray-dark tracking-wider uppercase">
                                <ShieldCheck size={9} strokeWidth={1.5} />
                                Verified · Issued {issuedOn}
                            </div>
                            <BarcodeStrip uid={member.uid} />
                            <div className="font-serif italic text-[8px] text-mpca-charcoal/70">
                                Hon. Secretary
                            </div>
                        </div>
                    </div>

                    {/* Pitch green footer band */}
                    <div className="mpca-card-band-bottom">
                        <div className="text-[8px] tracking-[0.25em] uppercase text-mpca-gold-light/80">
                            Holkar Stadium · Race Course Road · Indore · MP 452003
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @media print {
                    @page { size: A4; margin: 1cm; }
                    body::before { display: none !important; }
                    aside, .print\\:hidden { display: none !important; }
                    .card-print-wrapper {
                        gap: 1cm !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default MemberCard;
