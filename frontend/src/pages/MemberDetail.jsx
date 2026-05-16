import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchMember, deleteMember } from "@/lib/api";
import { ArrowLeft, Trash2, Mail, Phone, MapPin, Calendar, ShieldCheck, FileSignature, User } from "lucide-react";

const Field = ({ label, value, mono }) => (
    <div className="py-3 border-b border-mpca-brass/15">
        <div className="overline text-[9px]">{label}</div>
        <div className={`mt-1 text-sm text-mpca-charcoal ${mono ? "font-mono" : ""}`}>
            {value || <span className="text-mpca-gray italic">Not on record</span>}
        </div>
    </div>
);

const MemberDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [member, setMember] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const m = await fetchMember(id);
                setMember(m);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const handleDelete = async () => {
        if (!window.confirm("Delete this member from the register? This action is recorded for audit.")) return;
        await deleteMember(id);
        navigate("/members");
    };

    if (loading) {
        return (
            <div className="p-16 text-center text-mpca-gray-dark font-serif text-lg" data-testid="member-detail-loading">
                Fetching the member entry…
            </div>
        );
    }
    if (!member) {
        return (
            <div className="p-16 text-center" data-testid="member-detail-notfound">
                <div className="font-serif text-3xl text-mpca-green-dark">Entry not found.</div>
                <Link to="/members" className="btn-heritage-secondary mt-6 inline-flex">
                    Return to the Register
                </Link>
            </div>
        );
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="member-detail-page">
            <Link to="/members" className="btn-heritage-ghost mb-6 inline-flex" data-testid="back-btn">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Register
            </Link>

            {/* Header card — formal certificate style */}
            <div
                className="border border-mpca-brass/40 p-10 mb-10 relative"
                style={{
                    backgroundImage: "linear-gradient(135deg, var(--mpca-ivory) 0%, var(--mpca-parchment) 100%)",
                }}
                data-testid="member-header"
            >
                {/* Decorative brass corners */}
                {["top-3 left-3", "top-3 right-3", "bottom-3 left-3", "bottom-3 right-3"].map((pos) => (
                    <div
                        key={pos}
                        className={`absolute ${pos} w-3 h-3 border-mpca-brass`}
                        style={{
                            borderTopWidth: pos.includes("top") ? 1 : 0,
                            borderBottomWidth: pos.includes("bottom") ? 1 : 0,
                            borderLeftWidth: pos.includes("left") ? 1 : 0,
                            borderRightWidth: pos.includes("right") ? 1 : 0,
                            borderStyle: "solid",
                        }}
                    />
                ))}

                <div className="grid md:grid-cols-3 gap-8 items-center">
                    <div className="md:col-span-1 flex justify-center">
                        {member.photo_url ? (
                            <img
                                src={member.photo_url}
                                alt={member.name}
                                className="w-40 h-40 object-cover border-2 border-mpca-brass/60"
                                data-testid="member-photo"
                            />
                        ) : (
                            <div className="w-40 h-40 border-2 border-mpca-brass/60 flex items-center justify-center bg-mpca-parchment" data-testid="member-photo-placeholder">
                                <User className="text-mpca-brass" size={56} strokeWidth={1} />
                            </div>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <div className="overline">MPCA · Member</div>
                        <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-2 leading-tight">
                            {member.name}
                        </h1>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <span className="font-mono text-[11px] tracking-[0.2em] text-mpca-brass px-3 py-1 border border-mpca-brass/40">
                                {member.uid}
                            </span>
                            <span
                                className={`pill ${
                                    member.status === "Active"
                                        ? "pill-active"
                                        : member.status === "Pending"
                                            ? "pill-pending"
                                            : member.status === "Suspended"
                                                ? "pill-suspended"
                                                : "pill-lapsed"
                                }`}
                            >
                                {member.status}
                            </span>
                            <span className="text-xs uppercase tracking-wider text-mpca-gray-dark">
                                {member.category} · {member.sub_category}
                            </span>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-start gap-2 text-mpca-charcoal">
                                <Calendar size={14} className="text-mpca-brass mt-0.5" strokeWidth={1.5} />
                                <span>
                                    Enrolled{" "}
                                    {member.membership_date
                                        ? new Date(member.membership_date).toLocaleDateString("en-IN", {
                                              day: "numeric",
                                              month: "long",
                                              year: "numeric",
                                          })
                                        : "—"}
                                </span>
                            </div>
                            <div className="flex items-start gap-2 text-mpca-charcoal">
                                <ShieldCheck size={14} className="text-mpca-brass mt-0.5" strokeWidth={1.5} />
                                <span className="text-xs">{member.effectiveness || "—"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detail grid */}
            <div className="grid lg:grid-cols-3 gap-8">
                {/* Left: contact + address */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bulletin-card p-7">
                        <div className="overline mb-4">Contact</div>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-start gap-3" data-testid="member-phone">
                                <Phone size={14} className="text-mpca-brass mt-1" strokeWidth={1.5} />
                                <span className="font-mono text-mpca-charcoal">{member.phone || "—"}</span>
                            </div>
                            <div className="flex items-start gap-3" data-testid="member-email">
                                <Mail size={14} className="text-mpca-brass mt-1" strokeWidth={1.5} />
                                <span className="text-mpca-charcoal break-all">{member.email || "—"}</span>
                            </div>
                            <div className="flex items-start gap-3" data-testid="member-address">
                                <MapPin size={14} className="text-mpca-brass mt-1" strokeWidth={1.5} />
                                <span className="text-mpca-charcoal">{member.address}</span>
                            </div>
                        </div>
                    </div>

                    {/* Signature */}
                    <div className="bulletin-card p-7">
                        <div className="overline mb-4">Signature on Record</div>
                        {member.signature_url ? (
                            <img src={member.signature_url} alt="Signature" className="max-h-24" />
                        ) : (
                            <div className="border-b-2 border-mpca-charcoal/40 pb-6 italic font-serif text-2xl text-mpca-charcoal/50" data-testid="member-signature">
                                {member.name.split(" ").map((w) => w[0]).join(".")}.
                            </div>
                        )}
                        <div className="flex items-center gap-2 mt-3 text-[10px] text-mpca-gray-dark tracking-wide uppercase">
                            <FileSignature size={11} /> Verified
                        </div>
                    </div>
                </div>

                {/* Right: detail fields */}
                <div className="lg:col-span-2 bulletin-card p-8" data-testid="member-particulars">
                    <div className="overline mb-1">Particulars</div>
                    <h3 className="font-serif text-2xl text-mpca-green-dark mb-6">Constitutional Record</h3>

                    <div className="grid md:grid-cols-2 gap-x-10 gap-y-0">
                        <Field label="Eligibility Factor" value={member.eligibility_factor} />
                        <Field label="Fee Structure" value={member.fee_structure} mono />
                        <Field label="Approving Authority" value={member.approving_authority} />
                        <Field label="Effectiveness" value={member.effectiveness} />
                        {member.category === "Institutional" && (
                            <>
                                <Field label="Representative" value={member.representative_name} />
                                <Field label="Representative Contact" value={member.representative_contact} mono />
                            </>
                        )}
                        {member.loss_reason && <Field label="Loss of Membership" value={member.loss_reason} />}
                        {member.transferred_to && <Field label="Transferred To" value={member.transferred_to} />}
                    </div>

                    {member.notes && (
                        <div className="mt-6 pt-6 border-t border-mpca-brass/20">
                            <div className="overline mb-2">Notes</div>
                            <p className="text-sm text-mpca-charcoal leading-relaxed italic font-serif">
                                {member.notes}
                            </p>
                        </div>
                    )}

                    <div className="mt-8 pt-6 border-t border-mpca-brass/20 flex justify-end">
                        <button onClick={handleDelete} className="btn-heritage-ghost !text-mpca-oxblood" data-testid="delete-btn">
                            <Trash2 size={14} strokeWidth={1.5} /> Remove from Register
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MemberDetail;
