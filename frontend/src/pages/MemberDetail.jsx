import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchMember, deleteMember, updateMember, fetchMemberCategories } from "@/lib/api";
import { ArrowLeft, Trash2, Mail, Phone, MapPin, Calendar, ShieldCheck, FileSignature, User, IdCard, Wallet, Pencil, Save, X } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import MembershipAssignments from "@/components/MembershipAssignments";
import { useAuth } from "@/context/AuthContext";

const EDITABLE_FIELDS = [
    { key: "name", label: "Full Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "date_of_birth", label: "Date of Birth", type: "date" },
    { key: "address", label: "Address", type: "textarea", required: true },
    { key: "role", label: "Role / Designation", type: "text" },
    { key: "membership_id", label: "Membership Id", type: "text" },
    { key: "member_type", label: "Member Type", type: "select", options: ["MPCA", "Division"] },
    { key: "division_body_id", label: "Division Body Id", type: "text" },
    { key: "category", label: "Constitutional Category", type: "select", options: ["Individual", "Institutional", "Honorary", "Patron"], bearerOnly: true },
    { key: "sub_category", label: "Sub-Category", type: "sub-select" },
    { key: "status", label: "Status", type: "select", options: ["Active", "Pending", "Suspended", "Lapsed", "Transferred"], bearerOnly: true },
    { key: "membership_date", label: "Membership Date", type: "date" },
    { key: "effectiveness", label: "Effectiveness", type: "text" },
    { key: "fee_structure", label: "Fee Structure", type: "text" },
    { key: "approving_authority", label: "Approving Authority", type: "text" },
    { key: "eligibility_factor", label: "Eligibility Factor", type: "textarea" },
    { key: "representative_name", label: "Representative Name", type: "text" },
    { key: "representative_contact", label: "Representative Contact", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
];

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
    const { persona, isOfficeBearer } = useAuth();
    const [member, setMember] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({});
    const [subCats, setSubCats] = useState([]);
    const [saveErr, setSaveErr] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const [m, cats] = await Promise.all([
                    fetchMember(id),
                    fetchMemberCategories({ active_only: true }).catch(() => []),
                ]);
                setMember(m);
                setSubCats(cats);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const canEdit = useMemo(() => {
        if (!persona || !member) return false;
        if (isOfficeBearer) return true;
        // A logged-in member with a matching email may edit only their own profile.
        if (persona.email && member.email && persona.email.toLowerCase() === member.email.toLowerCase()) return true;
        return false;
    }, [persona, member, isOfficeBearer]);

    const startEdit = () => {
        setForm({
            name: member.name || "",
            email: member.email || "",
            phone: member.phone || "",
            date_of_birth: member.date_of_birth || "",
            address: member.address || "",
            role: member.role || "",
            membership_id: member.membership_id || "",
            member_type: member.member_type || "MPCA",
            division_body_id: member.division_body_id || "",
            category: member.category || "Individual",
            sub_category: member.sub_category || "",
            status: member.status || "Active",
            membership_date: member.membership_date || "",
            effectiveness: member.effectiveness || "",
            fee_structure: member.fee_structure || "",
            approving_authority: member.approving_authority || "",
            eligibility_factor: member.eligibility_factor || "",
            representative_name: member.representative_name || "",
            representative_contact: member.representative_contact || "",
            notes: member.notes || "",
        });
        setSaveErr(null);
        setEditMode(true);
    };

    const cancelEdit = () => {
        setEditMode(false);
        setSaveErr(null);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveErr(null);
        try {
            const payload = { ...form };
            // strip empties that are not required
            Object.keys(payload).forEach((k) => {
                if (payload[k] === "" && k !== "name" && k !== "address") payload[k] = null;
            });
            const updated = await updateMember(id, payload);
            setMember(updated);
            setEditMode(false);
        } catch (e) {
            setSaveErr(e?.response?.data?.detail || e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("Delete this member from the register? This action is recorded for audit.")) return;
        try {
            await deleteMember(id);
            navigate("/members");
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        }
    };

    if (loading) {
        return (
            <div className="p-16" data-testid="member-detail-loading">
                <CricketLoader size="lg" label="Fetching the member entry…" />
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

            <div className="flex justify-end gap-3 mb-4 print:hidden flex-wrap">
                {!editMode && canEdit && (
                    <button className="btn-heritage-secondary" onClick={startEdit} data-testid="edit-member-btn">
                        <Pencil size={14} strokeWidth={1.5} /> Edit Details
                    </button>
                )}
                <Link to={`/member-profile/${member.uid}`} className="btn-heritage-ghost" data-testid="open-portal-btn">
                    <Wallet size={14} strokeWidth={1.5} /> Member Portal
                </Link>
                <Link to={`/members/${id}/card`} className="btn-heritage-secondary" data-testid="view-card-btn">
                    <IdCard size={14} strokeWidth={1.5} /> View Identity Card
                </Link>
            </div>

            {/* Header card */}
            <div
                className="border border-mpca-brass/40 p-10 mb-10 relative"
                style={{ backgroundImage: "linear-gradient(135deg, var(--mpca-ivory) 0%, var(--mpca-parchment) 100%)" }}
                data-testid="member-header"
            >
                {["top-3 left-3", "top-3 right-3", "bottom-3 left-3", "bottom-3 right-3"].map((pos) => (
                    <div key={pos} className={`absolute ${pos} w-3 h-3 border-mpca-brass`}
                        style={{
                            borderTopWidth: pos.includes("top") ? 1 : 0,
                            borderBottomWidth: pos.includes("bottom") ? 1 : 0,
                            borderLeftWidth: pos.includes("left") ? 1 : 0,
                            borderRightWidth: pos.includes("right") ? 1 : 0,
                            borderStyle: "solid",
                        }} />
                ))}
                <div className="grid md:grid-cols-3 gap-8 items-center">
                    <div className="md:col-span-1 flex justify-center">
                        {member.photo_url ? (
                            <img src={member.photo_url} alt={member.name} className="w-40 h-40 object-cover border-2 border-mpca-brass/60" data-testid="member-photo" />
                        ) : (
                            <div className="w-40 h-40 border-2 border-mpca-brass/60 flex items-center justify-center bg-mpca-parchment" data-testid="member-photo-placeholder">
                                <User className="text-mpca-brass" size={56} strokeWidth={1} />
                            </div>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <div className="overline">{(member.member_type || "MPCA") === "Division" ? `Division · ${member.division_body_id || ""}` : "MPCA · Member"}</div>
                        <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-2 leading-tight">{member.name}</h1>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <span className="font-mono text-[11px] tracking-[0.2em] text-mpca-brass px-3 py-1 border border-mpca-brass/40">{member.uid}</span>
                            {member.membership_id && (
                                <span className="font-mono text-[11px] text-mpca-gray-dark">#{member.membership_id}</span>
                            )}
                            <span className={`pill ${
                                member.status === "Active" ? "pill-active"
                                    : member.status === "Pending" ? "pill-pending"
                                    : member.status === "Suspended" ? "pill-suspended" : "pill-lapsed"}`}>
                                {member.status}
                            </span>
                            {member.role && (
                                <span className="text-xs uppercase tracking-wider text-mpca-brass font-serif">{member.role}</span>
                            )}
                            <span className="text-xs uppercase tracking-wider text-mpca-gray-dark">{member.category}{member.sub_category ? ` · ${member.sub_category}` : ""}</span>
                        </div>
                        {/* M6.1 · Multi-category pills for currently held assignments */}
                        {(member.memberships || []).filter((a) => !a.end_date || new Date(a.end_date) >= new Date()).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2" data-testid="current-positions-pills">
                                {(member.memberships || [])
                                    .filter((a) => !a.end_date || new Date(a.end_date) >= new Date())
                                    .map((a) => (
                                        <span
                                            key={a.id}
                                            className={`text-[10px] uppercase tracking-wider px-2.5 py-1 border ${a.is_primary ? "bg-mpca-brass/15 border-mpca-brass text-mpca-brass" : "border-mpca-brass/30 text-mpca-charcoal"}`}
                                            data-testid={`pill-position-${a.id}`}
                                        >
                                            {a.category}{a.role ? ` · ${a.role}` : ""}
                                        </span>
                                    ))}
                            </div>
                        )}
                        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-start gap-2 text-mpca-charcoal">
                                <Calendar size={14} className="text-mpca-brass mt-0.5" strokeWidth={1.5} />
                                <span>Enrolled{" "}{member.membership_date ? new Date(member.membership_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}</span>
                            </div>
                            <div className="flex items-start gap-2 text-mpca-charcoal">
                                <ShieldCheck size={14} className="text-mpca-brass mt-0.5" strokeWidth={1.5} />
                                <span className="text-xs">{member.effectiveness || "—"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit form OR display grid */}
            {editMode ? (
                <div className="bulletin-card p-8" data-testid="member-edit-form">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="overline">Editing Record</div>
                            <h3 className="font-serif text-2xl text-mpca-green-dark">Modify Constitutional Details</h3>
                        </div>
                        <button className="btn-heritage-ghost" onClick={cancelEdit} data-testid="cancel-edit-btn">
                            <X size={14} strokeWidth={1.5} /> Cancel
                        </button>
                    </div>
                    {!isOfficeBearer && (
                        <div className="mb-4 text-xs bg-mpca-parchment border border-mpca-brass/30 p-3 text-mpca-charcoal">
                            You are editing your own profile. Fields marked <em className="text-mpca-brass">Bearer-only</em> require an office bearer.
                        </div>
                    )}
                    {saveErr && (
                        <div className="mb-4 bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-3 text-sm text-mpca-oxblood" data-testid="edit-error">
                            {typeof saveErr === "string" ? saveErr : JSON.stringify(saveErr)}
                        </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                        {EDITABLE_FIELDS.map((f) => {
                            const disabled = f.bearerOnly && !isOfficeBearer;
                            const val = form[f.key] ?? "";
                            const testId = `edit-${f.key}`;
                            const commonProps = {
                                value: val,
                                onChange: (e) => setForm({ ...form, [f.key]: e.target.value }),
                                disabled,
                                "data-testid": testId,
                                className: `input-heritage ${disabled ? "opacity-50 cursor-not-allowed" : ""}`,
                            };
                            return (
                                <label key={f.key} className={`block ${f.type === "textarea" ? "md:col-span-2" : ""}`}>
                                    <div className="overline text-[9px] mb-1">
                                        {f.label} {f.required && <span className="text-mpca-oxblood">*</span>}
                                        {f.bearerOnly && <span className="ml-2 text-mpca-brass italic normal-case tracking-normal">bearer-only</span>}
                                    </div>
                                    {f.type === "textarea" ? (
                                        <textarea {...commonProps} className={`${commonProps.className} min-h-[70px]`} />
                                    ) : f.type === "select" ? (
                                        <select {...commonProps}>
                                            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    ) : f.type === "sub-select" ? (
                                        <select {...commonProps}>
                                            <option value="">— None —</option>
                                            {subCats.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                                            {form.sub_category && !subCats.some((s) => s.name === form.sub_category) && (
                                                <option value={form.sub_category}>{form.sub_category} (legacy)</option>
                                            )}
                                        </select>
                                    ) : (
                                        <input type={f.type} {...commonProps} />
                                    )}
                                </label>
                            );
                        })}
                    </div>
                    <div className="mt-8 pt-6 border-t border-mpca-brass/20 flex justify-end gap-3">
                        <button
                            className="btn-heritage-primary"
                            onClick={handleSave}
                            disabled={saving || !form.name || !form.address}
                            data-testid="save-edit-btn"
                        >
                            <Save size={14} strokeWidth={1.5} /> {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid lg:grid-cols-3 gap-8">
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
                                <div className="flex items-start gap-3" data-testid="member-dob">
                                    <Calendar size={14} className="text-mpca-brass mt-1" strokeWidth={1.5} />
                                    <span className="text-mpca-charcoal font-mono">{member.date_of_birth || <span className="text-mpca-gray italic">DOB not on record</span>}</span>
                                </div>
                                <div className="flex items-start gap-3" data-testid="member-address">
                                    <MapPin size={14} className="text-mpca-brass mt-1" strokeWidth={1.5} />
                                    <span className="text-mpca-charcoal">{member.address}</span>
                                </div>
                            </div>
                        </div>

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

                    <div className="lg:col-span-2 bulletin-card p-8" data-testid="member-particulars">
                        <div className="overline mb-1">Particulars</div>
                        <h3 className="font-serif text-2xl text-mpca-green-dark mb-6">Constitutional Record</h3>

                        <div className="grid md:grid-cols-2 gap-x-10 gap-y-0">
                            <Field label="Member Type" value={member.member_type || "MPCA"} />
                            {member.division_body_id && <Field label="Division Body" value={member.division_body_id} mono />}
                            <Field label="Role / Designation" value={member.role} />
                            <Field label="Membership Id" value={member.membership_id} mono />
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
                                <p className="text-sm text-mpca-charcoal leading-relaxed italic font-serif">{member.notes}</p>
                            </div>
                        )}

                        {member.updated_at && (
                            <div className="mt-6 pt-4 border-t border-mpca-brass/15 text-[11px] text-mpca-gray-dark font-mono">
                                Last updated {new Date(member.updated_at).toLocaleString("en-IN")} by {member.updated_by || "system"}
                            </div>
                        )}

                        {isOfficeBearer && (
                            <div className="mt-8 pt-6 border-t border-mpca-brass/20 flex justify-end">
                                <button onClick={handleDelete} className="btn-heritage-ghost !text-mpca-oxblood" data-testid="delete-btn">
                                    <Trash2 size={14} strokeWidth={1.5} /> Remove from Register
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* M6.1 · Multi-category positions & tenure history */}
            {!editMode && (
                <div className="mt-8">
                    <MembershipAssignments
                        member={member}
                        canManage={isOfficeBearer}
                        onChange={(updated) => setMember(updated)}
                    />
                </div>
            )}
        </div>
    );
};

export default MemberDetail;
