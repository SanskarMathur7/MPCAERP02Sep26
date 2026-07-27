import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
    ArrowLeft, Save, Upload, Loader2, ShieldCheck, ShieldAlert, CheckCircle2,
    Phone, Mail, MapPin, Landmark, CreditCard, FileText, User,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

/**
 * M38g · Match Official Detail + KYC editor
 * ─────────────────────────────────────────
 * MPCA / owning Division office bearers / the Official themselves can edit.
 * Server enforces the same 3-way permission (see routes/match_officials.py).
 */
const KYC_STATUSES = ["Not_Started", "Docs_Submitted", "KYC_Verified", "Rejected"];

const MatchOfficialDetail = () => {
    const { id } = useParams();
    const { persona } = useAuth();
    const [off, setOff] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(null);
    const [err, setErr] = useState("");
    const [dirty, setDirty] = useState(false);

    const isMPCA = persona?.body_type === "State";
    const isOwningBody = off && persona?.body_code === off.body_id;
    const isSelf = off && persona?.name && off.full_name && persona.name.trim().toLowerCase() === off.full_name.trim().toLowerCase();
    const canEdit = isMPCA || isOwningBody || isSelf;
    const canFullEdit = isMPCA || isOwningBody;      // Non-self editors can also change grade / body / role / KYC status

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/match-officials/${id}`);
                setOff(data);
            } catch (e) {
                setErr(e?.response?.data?.detail || "Match Official not found");
            } finally { setLoading(false); }
        })();
    }, [id]);

    const setField = (k, v) => { setOff((o) => ({ ...o, [k]: v })); setDirty(true); };

    const upload = async (key, file) => {
        if (!file) return;
        setUploading(key);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "match_official_kyc");
            const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setField(key, data.url);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploading(null); }
    };

    const save = async () => {
        setSaving(true); setErr("");
        try {
            const payload = { ...off };
            delete payload.id; delete payload.created_at;
            const { data } = await api.patch(`/match-officials/${id}`, payload);
            setOff(data); setDirty(false);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    if (loading) return <CricketLoader label="Loading match official…" />;
    if (err && !off) return <div className="p-16 text-center text-mpca-oxblood text-sm">{err}</div>;
    if (!off) return null;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-4xl mx-auto" data-testid="match-official-detail">
            <Link to="/match-officials" className="btn-heritage-ghost mb-4" data-testid="mo-back-link">
                <ArrowLeft size={12} /> Back to Match Officials
            </Link>

            {/* Header */}
            <div className="bulletin-card p-6 mb-6" data-testid="mo-header-card">
                <div className="flex items-start gap-4 flex-wrap">
                    <div className="w-20 h-20 border-2 border-mpca-brass bg-mpca-parchment flex items-center justify-center overflow-hidden shrink-0">
                        {off.photo_url ? (
                            <img src={off.photo_url} alt={off.full_name} className="w-full h-full object-cover" />
                        ) : <User size={32} className="text-mpca-brass" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="overline">Match Officials · {off.role}</div>
                        <h1 className="font-serif text-3xl text-mpca-green-dark mt-1" data-testid="mo-name">{off.full_name}</h1>
                        <div className="mt-2 text-[11px] text-mpca-brass flex flex-wrap items-center gap-2">
                            <span className="font-mono">{off.grade?.replace(/_/g, " ")}</span>
                            <span>·</span>
                            <span>{off.body_id === "MPCA" ? "MPCA State Panel" : off.body_id}</span>
                            <span>·</span>
                            <span>{off.years_of_experience} yrs experience</span>
                            {off.is_active ? (
                                <span className="ml-2 text-mpca-green-dark border border-mpca-green-dark/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest">Active</span>
                            ) : (
                                <span className="ml-2 text-mpca-oxblood border border-mpca-oxblood/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest">Inactive</span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 border ${off.kyc_status === "KYC_Verified" ? "border-mpca-green-dark text-mpca-green-dark" : off.kyc_status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" : off.kyc_status === "Docs_Submitted" ? "border-mpca-brass text-mpca-brass" : "border-mpca-gray-dark text-mpca-gray-dark"}`} data-testid="mo-kyc-badge">
                            <ShieldCheck size={10} /> KYC · {(off.kyc_status || "Not_Started").replace(/_/g, " ")}
                        </div>
                    </div>
                </div>
                {canEdit && dirty && (
                    <div className="mt-4 flex items-center justify-end gap-2">
                        {err && <span className="text-[10px] text-mpca-oxblood">{err}</span>}
                        <button onClick={save} disabled={saving} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-2 flex items-center gap-1 disabled:opacity-40" data-testid="mo-save-btn">
                            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Changes
                        </button>
                    </div>
                )}
            </div>

            {/* Contact & Basics */}
            <Section title="Contact & Basics" testId="mo-sec-basics">
                <Grid cols={2}>
                    <TextField label="Full Name" value={off.full_name} onChange={(v) => setField("full_name", v)} disabled={!canFullEdit} testId="mo-full-name" />
                    <TextField label="Phone" value={off.phone} onChange={(v) => setField("phone", v)} disabled={!canEdit} icon={Phone} testId="mo-phone" />
                    <TextField label="Email" value={off.email} onChange={(v) => setField("email", v)} disabled={!canEdit} icon={Mail} testId="mo-email" />
                    <TextField label="Date of Birth" value={off.date_of_birth} onChange={(v) => setField("date_of_birth", v)} disabled={!canEdit} type="date" testId="mo-dob" />
                    <SelectField label="Gender" value={off.gender || ""} options={["", "M", "F", "Other"]} onChange={(v) => setField("gender", v || null)} disabled={!canEdit} testId="mo-gender" />
                    <TextField label="Accreditation No." value={off.accreditation_no} onChange={(v) => setField("accreditation_no", v)} disabled={!canFullEdit} mono testId="mo-accred" />
                    <NumField label="Years of Experience" value={off.years_of_experience} onChange={(v) => setField("years_of_experience", Number(v) || 0)} disabled={!canFullEdit} testId="mo-yoe" />
                    <NumField label="Fee per match (₹)" value={off.fee_per_match_inr || 0} onChange={(v) => setField("fee_per_match_inr", Number(v) || 0)} disabled={!canFullEdit} testId="mo-fee" />
                    <SelectField label="Grade" value={off.grade} options={["BCCI_Panel", "State_Panel", "Division_Panel", "District_Panel", "Trainee"]} onChange={(v) => setField("grade", v)} disabled={!canFullEdit} testId="mo-grade" />
                </Grid>
            </Section>

            {/* Address */}
            <Section title="Address" testId="mo-sec-address">
                <Grid cols={2}>
                    <TextField label="Address" value={off.address} onChange={(v) => setField("address", v)} disabled={!canEdit} span={2} multiline testId="mo-address" />
                    <TextField label="City" value={off.city} onChange={(v) => setField("city", v)} disabled={!canEdit} testId="mo-city" />
                    <TextField label="State" value={off.state} onChange={(v) => setField("state", v)} disabled={!canEdit} testId="mo-state" />
                    <TextField label="Pincode" value={off.pincode} onChange={(v) => setField("pincode", v)} disabled={!canEdit} mono testId="mo-pincode" />
                </Grid>
            </Section>

            {/* KYC — Documents */}
            <Section title="KYC Documents" testId="mo-sec-kyc">
                <Grid cols={2}>
                    <TextField label="PAN No." value={off.pan_no} onChange={(v) => setField("pan_no", v)} disabled={!canEdit} mono icon={CreditCard} testId="mo-pan" />
                    <UploadField label="PAN Card (upload)" url={off.pan_doc_url} disabled={!canEdit} uploading={uploading === "pan"} onUpload={(f) => upload("pan_doc_url", f)} onClear={() => setField("pan_doc_url", "")} testId="mo-pan-doc" />
                    <TextField label="Aadhaar (last 4 digits)" value={off.aadhaar_last4} onChange={(v) => setField("aadhaar_last4", v)} disabled={!canEdit} mono maxLength={4} testId="mo-aadhaar-last4" />
                    <UploadField label="Aadhaar Card (upload)" url={off.aadhaar_doc_url} disabled={!canEdit} uploading={uploading === "aadhaar"} onUpload={(f) => upload("aadhaar_doc_url", f)} onClear={() => setField("aadhaar_doc_url", "")} testId="mo-aadhaar-doc" />
                    <UploadField label="Photo" url={off.photo_url} disabled={!canEdit} uploading={uploading === "photo"} onUpload={(f) => upload("photo_url", f)} onClear={() => setField("photo_url", "")} testId="mo-photo-doc" span={2} />
                </Grid>
            </Section>

            {/* Bank Details */}
            <Section title="Bank Details (for DA / fee credit)" testId="mo-sec-bank">
                <Grid cols={2}>
                    <TextField label="Bank Name" value={off.bank_name} onChange={(v) => setField("bank_name", v)} disabled={!canEdit} icon={Landmark} testId="mo-bank-name" />
                    <TextField label="Account No." value={off.bank_account_no} onChange={(v) => setField("bank_account_no", v)} disabled={!canEdit} mono testId="mo-bank-acc" />
                    <TextField label="IFSC" value={off.bank_ifsc} onChange={(v) => setField("bank_ifsc", v)} disabled={!canEdit} mono testId="mo-bank-ifsc" />
                    <UploadField label="Cancelled Cheque (upload)" url={off.bank_cancelled_cheque_url} disabled={!canEdit} uploading={uploading === "cheque"} onUpload={(f) => upload("bank_cancelled_cheque_url", f)} onClear={() => setField("bank_cancelled_cheque_url", "")} testId="mo-cheque-doc" />
                </Grid>
            </Section>

            {/* KYC Verification — MPCA / Owning body only */}
            {canFullEdit && (
                <Section title="KYC Verification" testId="mo-sec-kyc-status">
                    <Grid cols={2}>
                        <SelectField label="KYC Status" value={off.kyc_status || "Not_Started"} options={KYC_STATUSES} onChange={(v) => setField("kyc_status", v)} disabled={!canFullEdit} testId="mo-kyc-status" />
                        <TextField label="Verified By" value={off.kyc_verified_by} onChange={(v) => setField("kyc_verified_by", v)} disabled={!canFullEdit} testId="mo-kyc-verified-by" />
                        <TextField label="KYC Notes" value={off.kyc_notes} onChange={(v) => setField("kyc_notes", v)} disabled={!canFullEdit} span={2} multiline testId="mo-kyc-notes" />
                    </Grid>
                </Section>
            )}
        </div>
    );
};

const Section = ({ title, testId, children }) => (
    <div className="bulletin-card p-5 mb-4" data-testid={testId}>
        <div className="overline mb-3">{title}</div>
        {children}
    </div>
);
const Grid = ({ cols = 2, children }) => <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>;
const TextField = ({ label, value, onChange, disabled, mono, icon: Icon, span = 1, multiline = false, type = "text", testId, maxLength }) => (
    <label className={`block ${span === 2 ? "md:col-span-2" : ""}`}>
        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1 flex items-center gap-1">
            {Icon && <Icon size={10} />}
            {label}
        </div>
        {multiline ? (
            <textarea rows={2} value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`input-heritage !py-1.5 !text-xs ${mono ? "font-mono" : ""} disabled:bg-mpca-parchment/50 disabled:cursor-not-allowed w-full`} data-testid={testId} />
        ) : (
            <input type={type} value={value || ""} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`input-heritage !py-1.5 !text-xs ${mono ? "font-mono" : ""} disabled:bg-mpca-parchment/50 disabled:cursor-not-allowed`} data-testid={testId} />
        )}
    </label>
);
const NumField = (p) => <TextField {...p} type="number" mono />;
const SelectField = ({ label, value, options, onChange, disabled, testId }) => (
    <label className="block">
        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1">{label}</div>
        <select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="input-heritage !py-1.5 !text-xs disabled:bg-mpca-parchment/50" data-testid={testId}>
            {options.map((o) => <option key={o} value={o}>{o ? o.replace(/_/g, " ") : "—"}</option>)}
        </select>
    </label>
);
const UploadField = ({ label, url, disabled, uploading, onUpload, onClear, span = 1, testId }) => (
    <div className={`${span === 2 ? "md:col-span-2" : ""}`} data-testid={testId}>
        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-1 flex items-center gap-1"><FileText size={10} /> {label}</div>
        {url ? (
            <div className="flex items-center gap-2 text-[11px] border border-mpca-brass/30 bg-mpca-parchment/50 p-2">
                <CheckCircle2 size={12} className="text-mpca-green-dark shrink-0" />
                <a href={url} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline truncate flex-1">Open uploaded document</a>
                {!disabled && <button type="button" onClick={onClear} className="text-[9px] uppercase text-mpca-brass">Remove</button>}
            </div>
        ) : disabled ? (
            <div className="border border-dashed border-mpca-brass/30 p-2 text-[10px] text-mpca-gray-dark italic">Not uploaded</div>
        ) : (
            <label className="border border-dashed border-mpca-brass/40 p-2 flex items-center gap-1 cursor-pointer hover:bg-mpca-parchment/50 text-[11px]">
                <Upload size={11} className="text-mpca-brass" /> Choose file
                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => onUpload(e.target.files?.[0])} />
                {uploading && <Loader2 size={11} className="animate-spin ml-auto" />}
            </label>
        )}
    </div>
);

export default MatchOfficialDetail;
