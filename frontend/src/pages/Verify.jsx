import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { verifyMember } from "@/lib/api";
import { CheckCircle2, XCircle, ShieldCheck, ArrowLeft } from "lucide-react";
import { MpcaLogoMark } from "@/components/MpcaEmblem";

const Verify = () => {
    const { uid } = useParams();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const r = await verifyMember(uid);
                setResult(r);
            } finally {
                setLoading(false);
            }
        })();
    }, [uid]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mpca-ivory">
                <div className="font-serif text-mpca-gray-dark">Verifying with the registrar…</div>
            </div>
        );
    }

    const valid = result?.valid && result?.is_active;

    return (
        <div className="min-h-screen bg-mpca-ivory" data-testid="verify-page">
            {/* Header */}
            <header className="bg-mpca-green-dark text-mpca-ivory px-8 md:px-16 py-6 border-b border-mpca-brass/30">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-mpca-ivory flex items-center justify-center p-1">
                            <MpcaLogoMark className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <div className="font-serif text-lg">MPCA</div>
                            <div className="overline text-[9px] text-mpca-gold-light/70">Public Verification</div>
                        </div>
                    </Link>
                    <Link to="/" className="btn-heritage-secondary !text-mpca-gold-light !border-mpca-brass/60">
                        <ArrowLeft size={14} strokeWidth={1.5} /> Pavilion
                    </Link>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-8 md:px-16 py-16">
                <div className="text-center mb-10 stately-reveal">
                    <div className="overline mb-3">Member Verification</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark leading-tight">
                        Identity Verification
                    </h1>
                    <p className="mt-3 text-mpca-gray-dark">
                        Result for UID <span className="font-mono text-mpca-charcoal">{uid}</span>
                    </p>
                    <div className="crest-divider mt-8" />
                </div>

                {valid ? (
                    <div
                        className="bulletin-card p-10 relative overflow-hidden stately-reveal"
                        data-delay="2"
                        data-testid="verify-valid"
                        style={{
                            backgroundImage: "linear-gradient(135deg, #FDFBF7 0%, #F4F1EA 100%)",
                            borderColor: "var(--mpca-green-dark)",
                            borderWidth: 2,
                        }}
                    >
                        {/* Decorative brass corners */}
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

                        <div className="flex items-start gap-6">
                            <CheckCircle2 className="text-mpca-green-dark flex-shrink-0" size={48} strokeWidth={1.25} />
                            <div className="flex-1">
                                <div className="overline !text-mpca-green-dark">Verified · Active Member</div>
                                <div className="font-serif text-4xl text-mpca-green-dark mt-2 leading-tight">
                                    {result.name}
                                </div>
                                <div className="mt-2 flex items-center gap-3 flex-wrap">
                                    <span className="font-mono text-[11px] text-mpca-brass tracking-[0.2em] px-3 py-1 border border-mpca-brass/40">
                                        {result.uid}
                                    </span>
                                    <span className="pill pill-active">{result.status}</span>
                                </div>

                                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-8 pt-6 border-t border-mpca-brass/20">
                                    <div>
                                        <div className="overline">Category</div>
                                        <div className="mt-1 text-mpca-charcoal">{result.category}</div>
                                    </div>
                                    <div>
                                        <div className="overline">Sub-Category</div>
                                        <div className="mt-1 text-mpca-charcoal">{result.sub_category || "—"}</div>
                                    </div>
                                    <div>
                                        <div className="overline">Enrolled</div>
                                        <div className="mt-1 text-mpca-charcoal font-mono text-sm">
                                            {result.membership_date
                                                ? new Date(result.membership_date).toLocaleDateString("en-IN", {
                                                      day: "numeric",
                                                      month: "long",
                                                      year: "numeric",
                                                  })
                                                : "—"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="overline">Validity</div>
                                        <div className="mt-1 text-mpca-charcoal text-sm italic font-serif">
                                            {result.effectiveness || "—"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-mpca-brass/30 flex items-center gap-2 text-[11px] tracking-wider text-mpca-gray-dark uppercase">
                            <ShieldCheck size={12} strokeWidth={1.5} />
                            Verified against the MPCA digital register · {new Date().toLocaleString("en-IN")}
                        </div>
                    </div>
                ) : (
                    <div
                        className="bulletin-card p-10 stately-reveal"
                        data-delay="2"
                        data-testid="verify-invalid"
                        style={{ borderColor: "var(--mpca-oxblood)", borderWidth: 2 }}
                    >
                        <div className="flex items-start gap-6">
                            <XCircle className="text-mpca-oxblood flex-shrink-0" size={48} strokeWidth={1.25} />
                            <div>
                                <div className="overline !text-mpca-oxblood">Not Verified</div>
                                <div className="font-serif text-3xl text-mpca-green-dark mt-2">
                                    {result?.valid ? "Membership Inactive" : "UID Not Found in Register"}
                                </div>
                                <p className="text-mpca-gray-dark mt-3 leading-relaxed">
                                    {result?.valid
                                        ? `The member exists on record but is currently marked as ${result.status}. This card is not currently valid for entry or member privileges.`
                                        : `The UID '${uid}' could not be matched against any active or historical record of the MPCA. The card may have been incorrectly transcribed, forged, or belong to a deactivated record.`}
                                </p>
                                <p className="mt-4 text-sm text-mpca-charcoal italic font-serif">
                                    If you believe this is an error, kindly contact the Hon. Secretary, MPCA at the registered office.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-12 text-xs text-mpca-gray-dark italic font-serif text-center">
                    This verification reflects the latest record in the MPCA digital register at the moment of the query.
                </div>
            </main>
        </div>
    );
};

export default Verify;
