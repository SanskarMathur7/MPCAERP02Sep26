import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createMember } from "@/lib/api";
import { ArrowLeft, Check } from "lucide-react";

const initial = {
    name: "",
    category: "Individual",
    sub_category: "",
    address: "",
    phone: "",
    email: "",
    date_of_birth: "",
    eligibility_factor: "",
    membership_date: new Date().toISOString().slice(0, 10),
    effectiveness: "",
    fee_structure: "",
    photo_url: "",
    signature_url: "",
    approving_authority: "",
    representative_name: "",
    representative_contact: "",
    status: "Active",
    notes: "",
};

const CATEGORY_SUBS = {
    Individual: ["Life Member", "Annual Member", "Associate"],
    Institutional: ["Affiliated Club", "District Association", "School", "University"],
    Honorary: ["Honorary Member for Services", "Distinguished Cricketer"],
    Patron: ["Founding Patron", "Patron"],
};

const Section = ({ title, children }) => (
    <div className="bulletin-card p-8 mb-8">
        <div className="overline mb-1">{title.split(" ")[0]}</div>
        <h3 className="font-serif text-2xl text-mpca-green-dark mb-6">{title}</h3>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">{children}</div>
    </div>
);

const FormField = ({ label, name, value, onChange, type = "text", required, ...rest }) => (
    <div>
        <label className="label-heritage" htmlFor={name}>
            {label} {required && <span className="text-mpca-oxblood">*</span>}
        </label>
        <input
            id={name}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            required={required}
            className="input-heritage"
            data-testid={`field-${name}`}
            {...rest}
        />
    </div>
);

const MemberNew = () => {
    const [form, setForm] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

    const onSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const payload = Object.fromEntries(
                Object.entries(form).filter(([_, v]) => v !== "" && v !== null && v !== undefined)
            );
            const created = await createMember(payload);
            navigate(`/members/${created.id}`);
        } catch (err) {
            setError(err.response?.data?.detail || err.message);
        } finally {
            setSaving(false);
        }
    };

    const subOptions = CATEGORY_SUBS[form.category] || [];

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="member-new-page">
            <Link to="/members" className="btn-heritage-ghost mb-6 inline-flex">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Register
            </Link>

            <div className="mb-10">
                <div className="overline">Article V · Enrolment</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                    Enrol a New Member
                </h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                    Particulars entered below shall be entered into the digital register
                    upon approval. Fields marked with{" "}
                    <span className="text-mpca-oxblood">*</span> are mandatory under
                    constitutional norm.
                </p>
                <div className="crest-divider mt-10" />
            </div>

            <form onSubmit={onSubmit}>
                <Section title="Identity & Category">
                    <div className="md:col-span-2">
                        <FormField label="Full Name" name="name" value={form.name} onChange={update} required />
                    </div>
                    <div>
                        <label className="label-heritage" htmlFor="category">Category *</label>
                        <select
                            id="category"
                            name="category"
                            value={form.category}
                            onChange={update}
                            className="input-heritage"
                            data-testid="field-category"
                        >
                            <option>Individual</option>
                            <option>Institutional</option>
                            <option>Honorary</option>
                            <option>Patron</option>
                        </select>
                    </div>
                    <div>
                        <label className="label-heritage" htmlFor="sub_category">Sub-Category</label>
                        <select
                            id="sub_category"
                            name="sub_category"
                            value={form.sub_category}
                            onChange={update}
                            className="input-heritage"
                            data-testid="field-sub_category"
                        >
                            <option value="">— Select —</option>
                            {subOptions.map((s) => (
                                <option key={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label-heritage" htmlFor="status">Status</label>
                        <select id="status" name="status" value={form.status} onChange={update} className="input-heritage" data-testid="field-status">
                            <option>Active</option>
                            <option>Pending</option>
                            <option>Suspended</option>
                            <option>Lapsed</option>
                        </select>
                    </div>
                    <FormField label="Eligibility Factor" name="eligibility_factor" value={form.eligibility_factor} onChange={update} placeholder="e.g. Former Ranji player, BCCI L-2 Coach" />
                </Section>

                <Section title="Contact & Address">
                    <FormField label="Phone" name="phone" value={form.phone} onChange={update} placeholder="+91 …" />
                    <FormField label="Email" name="email" type="email" value={form.email} onChange={update} />
                    <FormField label="Date of Birth" name="date_of_birth" type="date" value={form.date_of_birth} onChange={update} />
                    <div className="md:col-span-2">
                        <FormField label="Address" name="address" value={form.address} onChange={update} required />
                    </div>
                </Section>

                <Section title="Membership Particulars">
                    <FormField label="Membership Date" name="membership_date" type="date" value={form.membership_date} onChange={update} />
                    <FormField label="Effectiveness / Validity" name="effectiveness" value={form.effectiveness} onChange={update} placeholder="e.g. 01.09.2025 – 31.08.2026" />
                    <FormField label="Fee Structure" name="fee_structure" value={form.fee_structure} onChange={update} placeholder="e.g. ₹3,000/year" />
                    <FormField label="Approving Authority" name="approving_authority" value={form.approving_authority} onChange={update} placeholder="e.g. Hon. Secretary" />
                    <FormField label="Photograph URL" name="photo_url" value={form.photo_url} onChange={update} placeholder="https://…" />
                    <FormField label="Signature URL" name="signature_url" value={form.signature_url} onChange={update} placeholder="https://…" />
                </Section>

                {form.category === "Institutional" && (
                    <Section title="Institutional Representative">
                        <FormField label="Representative Name" name="representative_name" value={form.representative_name} onChange={update} />
                        <FormField label="Representative Contact" name="representative_contact" value={form.representative_contact} onChange={update} />
                    </Section>
                )}

                <Section title="Notes">
                    <div className="md:col-span-2">
                        <label className="label-heritage" htmlFor="notes">Remarks (optional)</label>
                        <textarea
                            id="notes"
                            name="notes"
                            value={form.notes}
                            onChange={update}
                            rows={4}
                            className="input-heritage"
                            data-testid="field-notes"
                        />
                    </div>
                </Section>

                {error && (
                    <div className="text-mpca-oxblood text-sm mb-4 italic" data-testid="form-error">{error}</div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <Link to="/members" className="btn-heritage-secondary">Cancel</Link>
                    <button
                        type="submit"
                        disabled={saving}
                        className="btn-heritage-primary disabled:opacity-50"
                        data-testid="submit-btn"
                    >
                        <Check size={14} strokeWidth={1.5} />
                        {saving ? "Recording…" : "Enter into Register"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default MemberNew;
