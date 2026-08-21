import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    fetchPlayer, updatePlayer, addPlayerDocument, verifyPlayerDocument,
    startPlayerReview, raisePlayerDiscrepancy, divisionApprovePlayer,
    approvePlayer, reinstatePlayer, reopenPlayer, disqualifyPlayer,
    aiValidatePlayerDocuments,
} from "@/lib/api";
import {
    ArrowLeft, User, FileText, ShieldCheck, ClipboardList, Upload, X, CheckCircle2, AlertTriangle,
    Ban, Loader2, ExternalLink, Trash2, Edit3, Save, Gavel, ScrollText, Sparkles, ShieldAlert, Award, Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";
import { DL } from "@/lib/designSystem";
import DocumentPreview from "@/components/DocumentPreview";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const ageYears = (dob) => { if (!dob) return "—"; const d = new Date(dob); const t = new Date(); let a = t.getFullYear() - d.getFullYear(); const m = t.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--; return a; };

const CATEGORY_META = {
    Local_MP:     { label: "Local-MP",     tone: "active" },
    Born_Outside: { label: "Born-Outside", tone: "pending" },
    Guest:        { label: "Guest",        tone: "saffron" },
};
const STATUS_META = {
    Active:                { label: "Active",                    tone: "active" },
    Pending:               { label: "Pending Approval",          tone: "pending" },
    Under_Division_Review: { label: "Under Division Review",     tone: "pending" },
    Discrepancy_Raised:    { label: "Discrepancy Raised",        tone: "suspended" },
    Division_Approved:     { label: "Div-Approved · Awaits MPCA", tone: "pending" },
    Suspended:             { label: "Suspended",                 tone: "suspended" },
    Banned:                { label: "Banned",                    tone: "suspended" },
    Transferred:           { label: "Transferred",               tone: "lapsed" },
    Retired:               { label: "Retired",                   tone: "lapsed" },
};

// Standard KYC / permanent-record document slots
// MPCA-Feb 2026 — ONLY the docs collected on the public registration form.
// Legacy Class-10 / Class-12 marksheet / TC / Affidavit / Hospital Cert /
// Signature Specimen were removed because they are not in the reg form.
// "Other Documents" (doc_type prefixed with `other:`) are rendered
// dynamically at the bottom of the KYC page.
const DOC_SLOTS = [
    { key: "photo",                     label: "Player Photograph",            required: true,  hint: "Recent passport-size photo." },
    { key: "aadhar",                    label: "Aadhaar Card",                 required: true,  hint: "Front + back scan, or e-Aadhaar PDF." },
    { key: "aadhaar_history",           label: "Aadhaar Update History",       required: false, hint: "UIDAI download." },
    { key: "pan",                       label: "PAN Card",                     required: false, hint: "For players ≥ 18 years." },
    { key: "passport",                  label: "Passport",                     required: false, hint: "For international / out-of-MP guests." },
    { key: "driving_licence",           label: "Driving Licence",              required: false },
    { key: "voter_id",                  label: "Voter ID",                     required: false },
    { key: "birth_certificate",         label: "Birth Certificate (with QR)",  required: true,  hint: "Municipal certificate with QR verification code." },
    { key: "address_proof",             label: "Current Address Proof",        required: true,  hint: "Utility bill / rent agreement / bank passbook." },
    { key: "samagra_id_player",         label: "Samagra ID · Player",          required: true,  hint: "MP state Samagra — player's own ID." },
    { key: "samagra_id_family",         label: "Samagra ID · Family",          required: true,  hint: "MP state Samagra — family SSSM ID." },
    { key: "consent_form",              label: "Consent Form (Notarized)",     required: true,  hint: "MPCA template — notarized." },
    { key: "no_study_affidavit",        label: "No-Study Affidavit",           required: false, hint: "If not currently studying (U-23 path)." },
    { key: "bonafide_school_cert",      label: "School Bonafide Certificate",  required: false, hint: "For education-eligible players." },
    { key: "marksheet_3yr",             label: "Marksheets · last 3 yrs",      required: false, hint: "Bundled PDF from previous school." },
    { key: "appointment_letter",        label: "Appointment Letter",           required: false, hint: "Employed players only." },
    { key: "salary_slip",               label: "Salary Slip (latest)",         required: false, hint: "Employed players only." },
    { key: "bank_statement_1yr",        label: "1-Year Bank Statement",        required: false, hint: "Employed players only." },
    { key: "noc_previous_division",     label: "NOC · Previous Division",      required: false, hint: "Required if player played from a different Division last season." },
    { key: "cancelled_cheque",          label: "Cancelled Cheque",             required: false, hint: "Bank account verification." },
    { key: "gst_certificate",           label: "GST Certificate",              required: false, hint: "Only if player provided a GST number." },
];

const Pill = ({ tone, label, testId }) => {
    const map = { active: "pill pill-active", pending: "pill pill-pending", suspended: "pill pill-suspended", lapsed: "pill pill-lapsed", saffron: "pill pill-saffron" };
    return <span className={map[tone] || "pill pill-lapsed"} data-testid={testId}>{label}</span>;
};

/** Single doc-slot uploader — picks file, POSTs to /uploads, then attaches via /players/{id}/documents. */
const DocSlot = ({ slot, existing, playerId, persona, locked, onChanged }) => {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const canManage = persona && (persona.body_type === "State" || persona.body_type === "Division" || existing == null);
    const canVerify = persona && (persona.body_type === "State" || persona.body_type === "Division");

    const doUpload = async (file) => {
        setError(null); setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "player");
            fd.append("related_id", playerId);
            if (persona?.body_code) fd.append("body_id", persona.body_code);
            if (persona?.display_name) fd.append("uploaded_by", persona.display_name);
            const res = await fetch(`${API}/api/uploads`, { method: "POST", body: fd });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || `Upload failed (${res.status})`);
            }
            const record = await res.json();
            const updated = await addPlayerDocument(playerId, slot.key, record.url, record.original_name);
            onChanged(updated);
            // Sprint M16 · Auto-run AI KYC validation after upload
            try {
                const aiUpdated = await aiValidatePlayerDocuments(playerId);
                onChanged(aiUpdated);
            } catch (_) { /* non-fatal — user can retry manually */ }
        } catch (e) {
            setError(e.message || "Upload failed");
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const verify = async () => {
        try {
            const updated = await verifyPlayerDocument(playerId, slot.key, {
                actor_name: persona?.display_name || "Reviewer",
                actor_body_id: persona?.body_code || "MPCA",
                actor_post: persona?.role_label,
            });
            onChanged(updated);
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
    };

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory/40 p-4" data-testid={`doc-slot-${slot.key}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <FileText size={14} className="text-mpca-brass" strokeWidth={1.5} />
                        <div className="font-serif text-mpca-green-dark">{slot.label}</div>
                        {slot.required && <span className="text-[9px] uppercase tracking-widest text-mpca-oxblood font-semibold">Required</span>}
                        {existing?.verified && (
                            <span className="pill pill-active !py-0.5 !px-2" data-testid={`doc-verified-${slot.key}`}>
                                <CheckCircle2 size={10} /> Verified
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1">{slot.hint}</div>
                </div>
            </div>

            {existing ? (
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                    {/* Feb-2026 · Inline preview (no download) — mirrors review-drawer pattern. */}
                    <DocumentPreview
                        url={existing.url?.startsWith("http") ? existing.url : `${API}${existing.url}`}
                        name={existing.filename || slot.label}
                        hideExport
                        renderTrigger={(openPreview) => (
                            <button
                                type="button"
                                onClick={openPreview}
                                className="text-xs font-semibold text-mpca-green-dark hover:text-mpca-oxblood inline-flex items-center gap-1"
                                data-testid={`doc-view-${slot.key}`}
                            >
                                <ExternalLink size={12} /> {existing.filename || "Preview document"}
                            </button>
                        )}
                    />
                    <span className="text-[10px] font-mono text-mpca-gray-dark">
                        Uploaded {fmtDateTime(existing.uploaded_at)}
                    </span>
                    {existing.verified && existing.verified_by && (
                        <span className="text-[10px] font-mono text-mpca-green-dark">
                            · Verified by {existing.verified_by} on {fmtDate(existing.verified_at)}
                        </span>
                    )}
                    <div className="flex-1" />
                    {!existing.verified && canVerify && (
                        <button onClick={verify} className="btn-heritage-secondary !py-1 !px-3 !text-[10px]" data-testid={`doc-verify-${slot.key}`}>
                            <ShieldCheck size={11} /> Mark Verified
                        </button>
                    )}
                    {canManage && !locked && (
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="btn-heritage-ghost !py-1 !px-3 !text-[10px]"
                            data-testid={`doc-replace-${slot.key}`}
                        >
                            <Upload size={11} /> Replace
                        </button>
                    )}
                </div>
            ) : (
                canManage && !locked && (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={busy}
                        className="mt-3 w-full border-2 border-dashed border-mpca-brass/40 hover:border-mpca-oxblood py-4 text-mpca-green-dark text-sm flex items-center justify-center gap-2 transition-colors"
                        data-testid={`doc-upload-${slot.key}`}
                    >
                        {busy ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> :
                                <><Upload size={14} /> Click to upload {slot.label}</>}
                    </button>
                )
            )}
            {!canManage && !existing && (
                <div className="mt-3 text-xs text-mpca-gray-dark italic">Not uploaded yet.</div>
            )}
            {locked && !existing && (
                <div className="mt-3 text-xs text-mpca-oxblood">🔒 Record is locked. Ask MPCA to reopen before uploading.</div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }}
                data-testid={`doc-input-${slot.key}`}
            />
            {error && (
                <div className="mt-2 text-[11px] text-mpca-oxblood border border-mpca-oxblood/30 bg-mpca-oxblood/5 px-3 py-2" data-testid={`doc-error-${slot.key}`}>
                    {error}
                </div>
            )}
        </div>
    );
};

/** Editable overview section — writes back via PATCH /players/{id}. */
const OFieldStatic = ({ label, value }) => (
    <div>
        <div className="overline">{label}</div>
        <div className="text-mpca-charcoal text-sm mt-1">{value || "—"}</div>
    </div>
);
const OInput = ({ draft, setDraft, k, label, type = "text", options = null }) => (
    <div>
        <label className="label-heritage">{label}</label>
        {options ? (
            <select value={draft[k] || ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} className="input-heritage" data-testid={`edit-${k}`}>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        ) : (
            <input type={type} value={draft[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} className="input-heritage" data-testid={`edit-${k}`} />
        )}
    </div>
);

const ELIGIBILITY_TAGS = [
    "Local/Birth", "Local/Residence", "Local/Employment", "Local/Education",
    "Guest/MP-Domicile", "Guest/Education", "Guest/Out-of-MP", "Ineligible",
];

// MPCA-209 · Eligibility Tag panel — surfaces the decision-tree verdict + a Recompute button.
const EligibilityTagPanel = ({ player, persona, onChanged }) => {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [ovForm, setOvForm] = useState({ eligibility_tag: player.eligibility_tag || "Local/Birth", reason: "" });
    const canRecompute = persona && (persona.body_type === "State" || persona.body_code === player.body_id);

    const recompute = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post(`/players/${player.id}/eligibility-tag/compute`);
            onChanged?.(data);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const saveOverride = async () => {
        if (!ovForm.reason.trim() || ovForm.reason.trim().length < 3) { setErr("Reason must be at least 3 characters."); return; }
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post(`/players/${player.id}/eligibility-tag/override`, {
                eligibility_tag: ovForm.eligibility_tag,
                reason: ovForm.reason.trim(),
                actor_name: persona?.display_name || persona?.name,
                actor_body_id: persona?.body_code,
            });
            onChanged?.(data);
            setOverrideOpen(false); setOvForm({ eligibility_tag: data.eligibility_tag, reason: "" });
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const tag = player.eligibility_tag;
    const tagTone = tag?.startsWith("Local/") ? "bg-mpca-green-dark text-mpca-gold-light"
        : tag?.startsWith("Guest/") ? "bg-mpca-navy text-mpca-gold-light"
        : "bg-mpca-oxblood text-mpca-ivory";
    return (
        <div className="bulletin-card p-0 overflow-hidden" data-testid="eligibility-tag-panel">
            <div className="bg-mpca-parchment px-4 py-3 border-b border-mpca-brass/30 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline text-[9px] text-mpca-oxblood">MPCA Eligibility · Season 2025-26</div>
                    <div className="mt-1">
                        {tag ? (
                            <span className={`inline-block text-[11px] uppercase tracking-widest px-3 py-1 font-mono ${tagTone}`} data-testid="eligibility-tag-badge">{tag}</span>
                        ) : (
                            <span className="text-[11px] italic text-mpca-brass" data-testid="eligibility-tag-unset">Not yet computed — click Recompute</span>
                        )}
                        {player.eligibility_computed_at && (
                            <span className="ml-3 text-[10px] text-mpca-gray-dark font-mono">as of {new Date(player.eligibility_computed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                        )}
                    </div>
                </div>
                {canRecompute && (
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={recompute} disabled={busy} className="text-[10px] uppercase tracking-widest border border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory px-3 py-1.5 disabled:opacity-40" data-testid="eligibility-recompute-btn">
                            {busy ? <Loader2 size={11} className="inline animate-spin" /> : "Recompute"}
                        </button>
                        <button onClick={() => setOverrideOpen((s) => !s)} className="text-[10px] uppercase tracking-widest border border-mpca-brass text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory px-3 py-1.5" data-testid="eligibility-override-btn">
                            {overrideOpen ? "Cancel" : "Override Tag"}
                        </button>
                    </div>
                )}
            </div>
            {overrideOpen && canRecompute && (
                <div className="bg-mpca-cream/40 border-b border-mpca-brass/20 p-4 grid md:grid-cols-3 gap-3 items-end" data-testid="eligibility-override-form">
                    <label>
                        <div className="overline text-[9px] mb-1">Set Tag</div>
                        <select className="input-heritage" value={ovForm.eligibility_tag} onChange={(e) => setOvForm({ ...ovForm, eligibility_tag: e.target.value })} data-testid="override-tag-select">
                            {ELIGIBILITY_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </label>
                    <label className="md:col-span-2">
                        <div className="overline text-[9px] mb-1">Reason / Evidence *</div>
                        <input className="input-heritage" value={ovForm.reason} onChange={(e) => setOvForm({ ...ovForm, reason: e.target.value })} placeholder="e.g. Bonafide employment letter from XYZ Ltd verified; residency proof attached" data-testid="override-reason-input" />
                    </label>
                    <div className="md:col-span-3 flex justify-end">
                        <button onClick={saveOverride} disabled={busy || !ovForm.reason.trim()} className="btn-heritage-primary disabled:opacity-40" data-testid="override-save-btn">
                            {busy ? <Loader2 size={11} className="inline animate-spin" /> : <Save size={12} className="inline mr-1" />} Save Override
                        </button>
                    </div>
                </div>
            )}
            {err && <div className="p-3 text-[11px] text-mpca-oxblood bg-mpca-oxblood/5">{err}</div>}
            {(player.eligibility_reasons || []).length > 0 && (
                <ul className="p-4 space-y-1.5 text-[11px] text-mpca-green-dark" data-testid="eligibility-reasons">
                    {player.eligibility_reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className="text-mpca-brass mt-0.5">·</span>
                            <span>{r}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};


const OverviewTab = ({ player, persona, locked, onChanged }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const startEdit = () => {
        setDraft({
            father_name: player.father_name || "",
            guardian_name: player.guardian_name || "",
            place_of_birth_city: player.place_of_birth_city || "",
            place_of_birth_state: player.place_of_birth_state || "",
            last_season_division_code: player.last_season_division_code || "",
            bcci_registration_year: player.bcci_registration_year || "",
            address_line: player.address_line || "",
            contact_phone: player.contact_phone || "",
            contact_email: player.contact_email || "",
        });
        setEditing(true);
    };
    const save = async () => {
        setBusy(true); setError(null);
        try {
            const patch = { ...draft };
            if (patch.bcci_registration_year) patch.bcci_registration_year = parseInt(patch.bcci_registration_year, 10);
            const u = await updatePlayer(player.id, patch);
            onChanged(u);
            setEditing(false);
        } catch (e) {
            setError(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    const canEdit = persona && !locked && (persona.body_type === "State" || persona.body_type === "Division" || persona.body_code === player.body_id);
    const Field = OFieldStatic;

    return (
        <div className="space-y-8" data-testid="overview-tab">
            {/* MPCA-209 · Eligibility Tag panel — computed from decision tree */}
            <EligibilityTagPanel player={player} persona={persona} onChanged={onChanged} />

            <div className="flex items-center justify-between">
                <div className="overline">Personal & Family</div>
                {canEdit && !editing && (
                    <button onClick={startEdit} className="btn-heritage-ghost !py-1 !px-3" data-testid="edit-toggle">
                        <Edit3 size={12} /> Edit
                    </button>
                )}
                {editing && (
                    <div className="flex gap-2">
                        <button onClick={() => setEditing(false)} className="btn-heritage-ghost !py-1 !px-3" data-testid="edit-cancel">Cancel</button>
                        <button onClick={save} disabled={busy} className="btn-heritage-primary !py-1 !px-3" data-testid="edit-save">
                            <Save size={12} /> {busy ? "Saving…" : "Save"}
                        </button>
                    </div>
                )}
            </div>

            {editing ? (
                <div className="grid sm:grid-cols-2 gap-4">
                    {/* MPCA-Feb2026 · Editable fields mirror the public registration form ONLY */}
                    <OInput draft={draft} setDraft={setDraft} k="father_name" label="Father's Name" />
                    <OInput draft={draft} setDraft={setDraft} k="guardian_name" label="Guardian Name (if under 18)" />
                    <OInput draft={draft} setDraft={setDraft} k="place_of_birth_city" label="Place of Birth · City" />
                    <OInput draft={draft} setDraft={setDraft} k="place_of_birth_state" label="Place of Birth · State" />
                    <OInput draft={draft} setDraft={setDraft} k="last_season_division_code" label="Previous Home Division (code)" />
                    <OInput draft={draft} setDraft={setDraft} k="bcci_registration_year" label="BCCI Registration Year" type="number" />
                    <div className="sm:col-span-2"><OInput draft={draft} setDraft={setDraft} k="address_line" label="Full Address" /></div>
                    <OInput draft={draft} setDraft={setDraft} k="contact_phone" label="Mobile" />
                    <OInput draft={draft} setDraft={setDraft} k="contact_email" label="Email" type="email" />
                    {error && <div className="sm:col-span-2 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-sm">{error}</div>}
                </div>
            ) : (
                <>
                    {/* MPCA-Feb2026 · Overview surfaces ONLY the fields captured on
                        the public registration form. Legacy Mother/Siblings/
                        Height/Weight/Club/Domicile/Residency-Since etc. removed. */}
                    <div className="grid sm:grid-cols-3 gap-6">
                        <Field label="Father" value={player.father_name} />
                        <Field label="Date of Birth" value={`${fmtDate(player.date_of_birth)} (age ${ageYears(player.date_of_birth)})`} />
                        <Field label="Gender" value={player.gender} />
                    </div>

                    <div>
                        <div className="overline mb-3">Cricket Profile</div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            <Field label="Role" value={player.role?.replace(/_/g, " ")} />
                            <Field label="Batting" value={player.batting_style?.replace("_", "-")} />
                            <Field label="Bowling" value={player.bowling_style?.replace(/_/g, "-")} />
                        </div>
                    </div>

                    <div>
                        <div className="overline mb-3">Place of Birth · Cross-Division · BCCI</div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            <Field label="Place of Birth · City" value={player.place_of_birth_city} />
                            <Field label="Place of Birth · State" value={player.place_of_birth_state} />
                            <Field label="Previous Home Division" value={player.last_season_division_code} />
                            <Field label="BCCI Registered?" value={player.bcci_registered ? "Yes" : "No"} />
                            {player.bcci_registered && (
                                <Field label="BCCI Registration Year" value={player.bcci_registration_year} />
                            )}
                            <Field label="Currently Employed?" value={player.is_employed ? "Yes" : "No"} />
                        </div>
                    </div>

                    <div>
                        <div className="overline mb-3">Residence & Category</div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            <div className="sm:col-span-3"><Field label="Full Address" value={player.address_line} /></div>
                            <Field label="Category" value={<Pill tone={CATEGORY_META[player.category]?.tone} label={CATEGORY_META[player.category]?.label} />} />
                            <Field label="Home Division" value={`${player.division_folder || "—"} · ${player.season_year || "—"}`} />
                        </div>
                    </div>

                    <div>
                        <div className="overline mb-3">Contact</div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            <Field label="Mobile" value={player.contact_phone} />
                            <Field label="Email" value={player.contact_email} />
                            <Field label="Guardian" value={player.guardian_name || "—"} />
                            <Field label="Aadhaar (last 4)" value={player.aadhaar_last4} />
                            <Field label="Registered On" value={fmtDateTime(player.registered_on)} />
                        </div>
                    </div>

                    {/* MPCA-Feb2026 · Other Information — Division/MPCA can annotate
                        with anything NOT captured on the reg form (free-form kv). */}
                    <OtherInfoSection player={player} canEdit={canEdit} onChanged={onChanged} />

                    {player.court_order_flag && (
                        <div className="border border-mpca-burgundy-dark/40 bg-mpca-burgundy-dark/5 p-4">
                            <div className="overline !text-mpca-burgundy-dark">⚑ Court Order Reference</div>
                            <div className="text-mpca-charcoal mt-2 text-sm">{player.court_order_ref || "No reference recorded."}</div>
                        </div>
                    )}

                    {player.eligibility_notes?.length > 0 && (
                        <div>
                            <div className="overline mb-2">Eligibility Validator · At Registration</div>
                            <ul className="text-xs text-mpca-charcoal list-disc list-inside space-y-1 border border-mpca-brass/30 p-3">
                                {player.eligibility_notes.map((n, i) => <li key={i}>{n}</li>)}
                            </ul>
                        </div>
                    )}

                    {player.review_notes?.length > 0 && (
                        <div>
                            <div className="overline mb-2 !text-mpca-oxblood">Discrepancy Notes</div>
                            <ul className="text-xs text-mpca-charcoal list-disc list-inside space-y-1 border border-mpca-oxblood/30 bg-mpca-oxblood/5 p-3" data-testid="review-notes">
                                {player.review_notes.map((n, i) => <li key={i}>{n}</li>)}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const AI_DECISION_META = {
    CLEAN:           { label: "Clean · No Issues Found", tone: "active",    icon: CheckCircle2, color: "bg-mpca-green-dark/10 border-mpca-green-dark/40 text-mpca-green-dark" },
    MINOR_ISSUES:    { label: "Minor Issues",            tone: "pending",   icon: AlertTriangle, color: "bg-mpca-gold/10 border-mpca-gold/50 text-mpca-gold-dark" },
    FLAGGED:         { label: "Flagged for Review",      tone: "suspended", icon: AlertTriangle, color: "bg-mpca-oxblood/10 border-mpca-oxblood/40 text-mpca-oxblood" },
    SUSPECTED_FRAUD: { label: "SUSPECTED FRAUD",         tone: "suspended", icon: ShieldAlert,   color: "bg-mpca-burgundy-dark/15 border-mpca-burgundy-dark text-mpca-burgundy-dark" },
};

const MATCH_ICON = {
    match:         { char: "✓", cls: "text-mpca-green-dark" },
    partial:       { char: "≈", cls: "text-mpca-gold-dark" },
    mismatch:      { char: "✗", cls: "text-mpca-oxblood" },
    not_visible:   { char: "?", cls: "text-mpca-gray-dark" },
    not_applicable:{ char: "—", cls: "text-mpca-gray-dark" },
};

const AIReportCard = ({ player, onRerun, running }) => {
    const v = player.ai_document_validation;
    if (!v) return null;
    const meta = AI_DECISION_META[v.decision] || AI_DECISION_META.FLAGGED;
    const Icon = meta.icon;
    return (
        <div className={`border-2 ${meta.color} p-5`} data-testid="ai-report-card">
            <div className="flex items-start gap-3">
                <div className="mt-1"><Sparkles size={16} strokeWidth={1.75} /></div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Icon size={18} />
                        <div className="font-serif text-lg" data-testid="ai-decision">{meta.label}</div>
                        <span className="text-[10px] font-mono uppercase tracking-widest ml-auto opacity-70">
                            Confidence {Math.round((v.confidence || 0) * 100)}%
                        </span>
                    </div>
                    <div className="text-sm mt-2 leading-relaxed">{v.reasoning}</div>
                    <div className="text-[10px] font-mono mt-3 opacity-70">
                        Last validated {player.ai_validated_at ? new Date(player.ai_validated_at).toLocaleString("en-IN") : "—"} · Gemini 3 Flash
                    </div>
                </div>
                <button onClick={onRerun} disabled={running} className="btn-heritage-ghost !text-xs !py-1 !px-3" data-testid="ai-rerun">
                    {running ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Re-run
                </button>
            </div>

            {v.warnings && v.warnings.length > 0 && (
                <div className="mt-4 border-t border-current/20 pt-3">
                    <div className="overline mb-2 !text-current opacity-75">Cross-Document Warnings</div>
                    <ul className="text-xs list-disc list-inside space-y-1">
                        {v.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}

            {v.documents && v.documents.length > 0 && (
                <div className="mt-4 border-t border-current/20 pt-3">
                    <div className="overline mb-2 !text-current opacity-75">Per-Document Extraction</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse" data-testid="ai-doc-table">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider opacity-75 border-b border-current/20">
                                    <th className="text-left py-2 pr-3">Document</th>
                                    <th className="text-left py-2 pr-3">Extracted Name</th>
                                    <th className="text-left py-2 pr-3">Extracted DOB</th>
                                    <th className="text-center py-2 pr-3">Name</th>
                                    <th className="text-center py-2 pr-3">DOB</th>
                                    <th className="text-right py-2">OCR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {v.documents.map((d, i) => {
                                    const nm = MATCH_ICON[d.name_match] || MATCH_ICON.not_visible;
                                    const dm = MATCH_ICON[d.dob_match]  || MATCH_ICON.not_visible;
                                    return (
                                        <tr key={i} className="border-b border-current/10" data-testid={`ai-doc-row-${d.doc_type}`}>
                                            <td className="py-2 pr-3 font-serif">{(d.doc_type || "").replace(/_/g, " ")}</td>
                                            <td className="py-2 pr-3 font-mono text-[11px]">{d.extracted_name || "—"}</td>
                                            <td className="py-2 pr-3 font-mono text-[11px]">{d.extracted_dob || "—"}</td>
                                            <td className={`py-2 pr-3 text-center font-bold ${nm.cls}`}>{nm.char}</td>
                                            <td className={`py-2 pr-3 text-center font-bold ${dm.cls}`}>{dm.char}</td>
                                            <td className="py-2 text-right font-mono text-[11px]">{Math.round((d.ocr_confidence || 0) * 100)}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {v.documents.some((d) => d.issues && d.issues.length > 0) && (
                        <div className="mt-3 space-y-1">
                            {v.documents.filter((d) => d.issues && d.issues.length > 0).map((d, i) => (
                                <div key={i} className="text-[11px]">
                                    <span className="font-mono uppercase opacity-75">{(d.doc_type || "").replace(/_/g, " ")}:</span>{" "}
                                    <span>{d.issues.join(" · ")}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/** MPCA-Feb2026 · Other Information — Division/MPCA appends free-form key/value
 * pairs (e.g. Sponsor, Nickname, Coach's Notes) that were NOT part of the
 * public registration form. Persisted to `player.extra_info` (Dict[str,str]). */
const OtherInfoSection = ({ player, canEdit, onChanged }) => {
    const extra = player.extra_info || {};
    const [addKey, setAddKey] = useState("");
    const [addVal, setAddVal] = useState("");
    const [busy, setBusy] = useState(false);

    const persist = async (nextExtra) => {
        setBusy(true);
        try {
            const u = await updatePlayer(player.id, { extra_info: nextExtra });
            onChanged(u);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const addRow = async () => {
        if (!addKey.trim() || !addVal.trim()) return;
        const next = { ...extra, [addKey.trim()]: addVal.trim() };
        await persist(next);
        setAddKey(""); setAddVal("");
    };
    const removeRow = async (k) => {
        const next = { ...extra }; delete next[k];
        await persist(next);
    };

    return (
        <div data-testid="other-info-section">
            <div className="overline mb-3">Other Information</div>
            {Object.keys(extra).length === 0 ? (
                <div className="text-[11px] italic text-mpca-gray-dark mb-3">
                    No extra information yet. Division/MPCA can add anything the player didn&apos;t include on the registration form.
                </div>
            ) : (
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    {Object.entries(extra).map(([k, v]) => (
                        <div key={k} className="border border-mpca-brass/30 bg-mpca-parchment px-3 py-2 flex items-center gap-3" data-testid={`extra-info-${k}`}>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-brass">{k}</div>
                                <div className="text-[13px] text-mpca-charcoal truncate">{v}</div>
                            </div>
                            {canEdit && (
                                <button onClick={() => removeRow(k)} disabled={busy} className="text-[10px] uppercase tracking-widest text-mpca-oxblood" data-testid={`extra-info-remove-${k}`}>Remove</button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {canEdit && (
                <div className="border border-dashed border-mpca-brass/40 bg-mpca-cream/40 px-3 py-3 grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end" data-testid="extra-info-add">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1">Field</div>
                        <input value={addKey} onChange={(e) => setAddKey(e.target.value)} placeholder="e.g. Sponsor" className="input-heritage !py-1.5 !text-xs w-full" data-testid="extra-info-key" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1">Value</div>
                        <input value={addVal} onChange={(e) => setAddVal(e.target.value)} placeholder="e.g. Aditya Birla" className="input-heritage !py-1.5 !text-xs w-full" data-testid="extra-info-value" />
                    </div>
                    <button onClick={addRow} disabled={busy || !addKey.trim() || !addVal.trim()} className="btn-heritage-primary !py-1.5 !px-3 !text-xs" data-testid="extra-info-add-btn">
                        Add
                    </button>
                </div>
            )}
        </div>
    );
};

/** KYC / permanent document repository. */
const DocumentsTab = ({ player, persona, onChanged }) => {
    const [aiRunning, setAiRunning] = useState(false);
    const [aiError, setAiError] = useState(null);
    const uploaded = useMemo(() => {
        const m = {};
        (player.documents || []).forEach((d) => { m[d.doc_type] = d; });
        return m;
    }, [player.documents]);
    const locked = !!player.submission_locked;
    const requiredMissing = DOC_SLOTS.filter((s) => s.required && !uploaded[s.key]);
    const canValidate = persona && (persona.body_type === "State" || persona.body_type === "Division");

    const runAi = async () => {
        setAiRunning(true); setAiError(null);
        try {
            const updated = await aiValidatePlayerDocuments(player.id);
            onChanged(updated);
        } catch (e) {
            setAiError(e?.response?.data?.detail || e.message);
        } finally { setAiRunning(false); }
    };

    return (
        <div className="space-y-6" data-testid="documents-tab">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">KYC · Permanent Records</div>
                    <p className="text-sm text-mpca-gray-dark mt-2 max-w-2xl">
                        Upload birth certificate, ID proofs, marksheets and other permanent information for this player.
                        Files are stored on the MPCA server; Division Reviewer can mark each document as verified.
                        Run the AI validator to cross-check name/DOB across all documents.
                    </p>
                </div>
                <div className="text-right">
                    <div className="font-serif text-2xl text-mpca-green-dark">
                        {(player.documents || []).filter((d) => d.verified).length} <span className="text-mpca-gray-dark text-sm">/ {(player.documents || []).length}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-mpca-brass">Verified</div>
                </div>
            </div>

            {/* AI Validator control */}
            {canValidate && (player.documents || []).length > 0 && !player.ai_document_validation && (
                <div className="border-2 border-dashed border-mpca-brass/40 p-5 bg-mpca-parchment/30 flex items-center gap-4 flex-wrap">
                    <Sparkles size={20} className="text-mpca-oxblood" />
                    <div className="flex-1 min-w-[280px]">
                        <div className="font-serif text-lg text-mpca-green-dark">AI Document Validator</div>
                        <div className="text-xs text-mpca-gray-dark mt-1">
                            Gemini 3 Flash reads every uploaded KYC document, extracts name / DOB / father, and flags mismatches or tampering signals.
                        </div>
                    </div>
                    <button onClick={runAi} disabled={aiRunning} className="btn-heritage-primary" data-testid="ai-run-btn">
                        {aiRunning ? <><Loader2 size={14} className="animate-spin" /> Analysing…</> : <><Sparkles size={14} /> Run AI Validation</>}
                    </button>
                </div>
            )}

            {player.ai_document_validation && (
                <AIReportCard player={player} onRerun={runAi} running={aiRunning} />
            )}

            {aiError && (
                <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-sm" data-testid="ai-error">
                    {aiError}
                </div>
            )}

            {locked && (
                <div className="border border-mpca-brass/40 bg-mpca-parchment/60 p-3 text-xs text-mpca-charcoal flex items-center gap-2">
                    <ShieldCheck size={14} className="text-mpca-brass" />
                    Record is locked — only Division/MPCA Reviewer can add / replace documents. Reopen (Actions bar) to allow applicant edits.
                </div>
            )}

            {requiredMissing.length > 0 && (
                <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 p-3 text-xs text-mpca-oxblood">
                    <AlertTriangle size={14} className="inline mr-1" />
                    Missing required documents: <strong>{requiredMissing.map((s) => s.label).join(" · ")}</strong>
                </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4" data-testid="doc-slot-grid">
                {DOC_SLOTS.map((slot) => (
                    <DocSlot
                        key={slot.key}
                        slot={slot}
                        existing={uploaded[slot.key]}
                        playerId={player.id}
                        persona={persona}
                        locked={locked}
                        onChanged={onChanged}
                    />
                ))}
            </div>

            {/* MPCA-Feb2026 · Other Documents — free-form uploads with a
                label prefix `other:*`. Includes both docs the player
                submitted via the reg form AND any extras added later by
                Division / MPCA directly on this profile. */}
            {(() => {
                const otherDocs = (player.documents || []).filter((d) => (d.doc_type || "").startsWith("other:"));
                if (otherDocs.length === 0 && !canValidate) return null;
                return (
                    <div className="mt-8" data-testid="doc-other-list">
                        <div className="overline mb-3">Other Documents</div>
                        {otherDocs.length > 0 && (
                            <div className="grid sm:grid-cols-2 gap-4">
                                {otherDocs.map((d, i) => (
                                    <DocSlot
                                        key={`other-${i}`}
                                        slot={{ key: d.doc_type, label: d.doc_type.replace(/^other:/, "Other · "), required: false }}
                                        existing={d}
                                        playerId={player.id}
                                        persona={persona}
                                        locked={locked}
                                        onChanged={onChanged}
                                    />
                                ))}
                            </div>
                        )}
                        {/* Add-new-other-doc utility — MPCA / Division only */}
                        {canValidate && !locked && (
                            <AddOtherDoc playerId={player.id} persona={persona} onChanged={onChanged} />
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

/** MPCA-Feb2026 · Add an "Other Document" directly on the profile (KYC tab).
 * MPCA/Division uploads a file, gives it a label, and it lands in
 * `player.documents` with `doc_type=other:{label}`. */
const AddOtherDoc = ({ playerId, persona, onChanged }) => {
    const [label, setLabel] = useState("");
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const submit = async () => {
        if (!file || !label.trim()) { setErr("Give the document a label and pick a file first."); return; }
        setBusy(true); setErr(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "player");
            fd.append("related_id", playerId);
            if (persona?.body_code) fd.append("body_id", persona.body_code);
            if (persona?.display_name) fd.append("uploaded_by", persona.display_name);
            const res = await fetch(`${API}/api/uploads`, { method: "POST", body: fd });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || `Upload failed (${res.status})`);
            }
            const record = await res.json();
            const doc_type = `other:${label.trim()}`;
            const updated = await addPlayerDocument(playerId, doc_type, record.url, record.original_name);
            onChanged(updated);
            setLabel(""); setFile(null);
        } catch (e) { setErr(e.message || "Upload failed"); }
        finally { setBusy(false); }
    };

    return (
        <div className="mt-4 border border-dashed border-mpca-brass/50 bg-mpca-cream/40 p-4" data-testid="kyc-add-other-doc">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-oxblood mb-2">Add another document</div>
            <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1">Label</div>
                    <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. School TC, Coach Reference, Character Certificate"
                        className="input-heritage !py-1.5 !text-xs w-full"
                        data-testid="kyc-other-label"
                    />
                </div>
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1">File</div>
                    <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="text-[11px]"
                        data-testid="kyc-other-file"
                    />
                </div>
                <button
                    onClick={submit}
                    disabled={busy || !file || !label.trim()}
                    className="btn-heritage-primary !py-1.5 !px-3 !text-xs"
                    data-testid="kyc-other-add-btn"
                >
                    {busy ? <><Loader2 size={12} className="animate-spin" /> Uploading…</> : <><Upload size={12} /> Add</>}
                </button>
            </div>
            {err && <div className="text-[11px] text-mpca-oxblood mt-2">{err}</div>}
        </div>
    );
};

const SanctionsTab = ({ player, persona, onChanged }) => {
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ kind: "Two_Year_Ban", reason: "", imposed_on: new Date().toISOString().slice(0, 10), expires_on: "", penalty_inr: 0, notes: "" });
    const [busy, setBusy] = useState(false);
    const canSanction = persona && (persona.body_type === "State" || persona.body_type === "Division");
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const u = await disqualifyPlayer(player.id, {
                ...form,
                imposed_by: persona?.body_code || "MPCA",
                penalty_inr: parseFloat(form.penalty_inr) || 0,
            });
            onChanged(u); setShowAdd(false);
        } catch (e) { alert(e?.response?.data?.detail || e.message); } finally { setBusy(false); }
    };
    return (
        <div className="space-y-5" data-testid="sanctions-tab">
            <div className="flex items-center justify-between">
                <div className="overline">Disqualifications & Sanctions</div>
                {canSanction && player.status !== "Banned" && (
                    <button onClick={() => setShowAdd(true)} className="btn-heritage-secondary !py-1 !px-3 !text-xs" data-testid="add-sanction">
                        <Gavel size={12} /> Add Sanction
                    </button>
                )}
            </div>
            {(!player.disqualifications || player.disqualifications.length === 0) ? (
                <div className="p-10 border border-mpca-brass/30 text-center text-mpca-gray-dark italic font-serif" data-testid="no-sanctions">
                    No sanctions on this player&apos;s record.
                </div>
            ) : (
                <div className="space-y-3">
                    {player.disqualifications.map((d, i) => (
                        <div key={i} className="border border-mpca-burgundy-dark/40 bg-mpca-burgundy-dark/5 p-4" data-testid={`sanction-${i}`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <div className="font-serif text-lg text-mpca-burgundy-dark">{d.kind.replace(/_/g, " ")}</div>
                                    <div className="text-[10px] font-mono text-mpca-gray-dark uppercase tracking-wider mt-1">
                                        Imposed by {d.imposed_by} · {fmtDate(d.imposed_on)}
                                        {d.expires_on && ` · expires ${fmtDate(d.expires_on)}`}
                                    </div>
                                </div>
                                {d.penalty_inr > 0 && (
                                    <div className="text-right">
                                        <div className="font-serif text-lg text-mpca-oxblood">₹{d.penalty_inr.toLocaleString("en-IN")}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-mpca-brass">Penalty</div>
                                    </div>
                                )}
                            </div>
                            <div className="text-sm text-mpca-charcoal mt-3">{d.reason}</div>
                            {d.notes && <div className="text-[11px] italic text-mpca-gray-dark mt-1">{d.notes}</div>}
                        </div>
                    ))}
                </div>
            )}

            {showAdd && (
                <form onSubmit={submit} className="border-2 border-mpca-brass bg-mpca-ivory p-5 space-y-3" data-testid="sanction-form">
                    <div className="overline">New Sanction</div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Type</label>
                            <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} className="input-heritage" data-testid="sanction-kind">
                                <option>Two_Year_Ban</option>
                                <option>Lifetime_Ban</option>
                                <option>Division_Penalty</option>
                                <option>Age_Misrepresentation</option>
                                <option>Fake_Document</option>
                                <option>Repeat_Offender</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Imposed On</label>
                            <input type="date" value={form.imposed_on} onChange={(e) => setForm((f) => ({ ...f, imposed_on: e.target.value }))} className="input-heritage" required />
                        </div>
                        <div>
                            <label className="label-heritage">Expires On</label>
                            <input type="date" value={form.expires_on} onChange={(e) => setForm((f) => ({ ...f, expires_on: e.target.value }))} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Penalty (₹)</label>
                            <input type="number" value={form.penalty_inr} onChange={(e) => setForm((f) => ({ ...f, penalty_inr: e.target.value }))} className="input-heritage" data-testid="sanction-penalty" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="label-heritage">Reason *</label>
                            <input required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="input-heritage" data-testid="sanction-reason" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="label-heritage">Notes</label>
                            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-heritage" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowAdd(false)} className="btn-heritage-ghost">Cancel</button>
                        <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="sanction-save">
                            <Ban size={12} /> {busy ? "Imposing…" : "Impose Sanction"}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SECTION 4.5 · PERFORMANCE TAB (Sprint M16 · rich player workbook)
 * ═══════════════════════════════════════════════════════════════════════════
 */
const PerformanceTab = ({ player }) => {
    const meta = player.selection_meta || {};
    const records = meta.season_records || [];
    const stats = meta.stats || {};
    const cf = meta.career_figures || {};

    // Filters
    const [seasonFilter, setSeasonFilter] = useState("All");
    const [formatFilter, setFormatFilter] = useState("All"); // All | Multi-Day | List A | T20

    // Group records by season
    const bySeason = records.reduce((acc, r) => {
        (acc[r.season] = acc[r.season] || []).push(r);
        return acc;
    }, {});
    const allSeasons = Object.keys(bySeason).sort();

    // Format detection heuristic: tournament_code suffix or format field
    const recordFormat = (r) => {
        const s = ((r.format || r.tournament_code || "") + "").toUpperCase();
        if (s.includes("T20")) return "T20";
        if (s.includes("LA") || s.includes("OD") || s.includes("50")) return "List A";
        return "Multi-Day";
    };

    const filteredRecords = records.filter((r) =>
        (seasonFilter === "All" || r.season === seasonFilter) &&
        (formatFilter === "All" || recordFormat(r) === formatFilter)
    );

    const filteredSeasons = Array.from(new Set(filteredRecords.map((r) => r.season))).sort();

    // Career totals from stats  [m, runs, ballsFaced?, avg, sr, hs, 100s, 50s]
    const totals = ["fc", "la", "t20"].reduce((acc, k) => {
        const s = stats[k] || [];
        acc[k] = { m: s[0] || 0, runs: s[1] || 0, avg: s[3] || 0, sr: s[4] || 0, hundreds: s[6] || 0, fifties: s[7] || 0 };
        return acc;
    }, {});
    const totalMatches = totals.fc.m + totals.la.m + totals.t20.m;
    const totalRuns = totals.fc.runs + totals.la.runs + totals.t20.runs;
    const battingAvg = totalMatches > 0 ? ((totals.fc.runs + totals.la.runs + totals.t20.runs) / Math.max(1, totalMatches)).toFixed(1) : "0.0";

    // ─────────── Chart data ───────────
    // Runs / Wickets per season (from filtered records)
    const seasonAgg = filteredSeasons.map((s) => {
        const rows = filteredRecords.filter((r) => r.season === s);
        const runs = rows.reduce((a, r) => a + (r.runs || 0), 0);
        const wkt = rows.reduce((a, r) => a + (r.wkt || 0), 0);
        const matches = rows.reduce((a, r) => a + (r.m || 0), 0);
        return { season: s, runs, wkt, matches };
    });

    // Format distribution (career totals)
    const formatDist = [
        { name: "Multi-Day", value: totals.fc.runs, color: "#5b2223" },
        { name: "List A", value: totals.la.runs, color: "#c99a2e" },
        { name: "T20", value: totals.t20.runs, color: "#1f4c37" },
    ].filter((f) => f.value > 0);

    // Career progression (cumulative runs over seasons)
    let cum = 0;
    const cumProgression = seasonAgg.map((s) => {
        cum += s.runs;
        return { season: s.season, cumulative: cum, seasonRuns: s.runs };
    });

    // Group filtered records by season (for the table)
    const filteredBySeason = filteredRecords.reduce((acc, r) => {
        (acc[r.season] = acc[r.season] || []).push(r);
        return acc;
    }, {});

    return (
        <div data-testid="performance-tab" className="space-y-8">
            {/* Overview stat cards */}
            <div>
                <div className="overline mb-3">Career Overview</div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <StatCard label="Matches" value={totalMatches} testId="stat-matches" />
                    <StatCard label="Runs" value={totalRuns.toLocaleString("en-IN")} testId="stat-runs" />
                    <StatCard label="Batting Avg" value={battingAvg} testId="stat-avg" />
                    <StatCard label="FC Avg" value={totals.fc.avg} tone="green" testId="stat-fc-avg" />
                    <StatCard label="Quality Index" value={meta.quality_index ? Math.round(meta.quality_index * 100) : "—"} tone="brass" testId="stat-quality" />
                    <StatCard label="Yo-Yo" value={meta.yo_yo || "—"} testId="stat-yoyo" />
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end border-t border-mpca-brass/20 pt-6" data-testid="perf-filters">
                <div>
                    <div className="overline text-[9px] mb-1">Filter Season</div>
                    <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}
                        className="input-heritage !py-1.5 !text-xs" data-testid="filter-season">
                        <option value="All">All Seasons</option>
                        {allSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <div className="overline text-[9px] mb-1">Filter Format</div>
                    <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}
                        className="input-heritage !py-1.5 !text-xs" data-testid="filter-format">
                        <option value="All">All Formats</option>
                        <option value="Multi-Day">Multi-Day</option>
                        <option value="List A">List A (50-ov)</option>
                        <option value="T20">T20</option>
                    </select>
                </div>
                <div className="ml-auto text-[10px] text-mpca-gray-dark uppercase tracking-widest font-mono">
                    {filteredRecords.length} record(s) · {filteredSeasons.length} season(s)
                </div>
            </div>

            {/* Charts */}
            {seasonAgg.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Runs per season */}
                    <div className="border border-mpca-brass/20 p-4 bg-mpca-cream/10" data-testid="chart-runs-per-season">
                        <div className="overline mb-3">Runs · Season-wise</div>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={seasonAgg}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#d7c9a3" />
                                <XAxis dataKey="season" tick={{ fontSize: 10, fill: "#5b2223" }} />
                                <YAxis tick={{ fontSize: 10, fill: "#5b2223" }} />
                                <Tooltip contentStyle={{ background: "#faf6ec", border: "1px solid #b58a3a", fontSize: 11 }} />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="runs" fill="#5b2223" name="Runs" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="wkt" fill="#c99a2e" name="Wickets" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Career progression (cumulative) */}
                    <div className="border border-mpca-brass/20 p-4 bg-mpca-cream/10" data-testid="chart-progression">
                        <div className="overline mb-3">Career Progression · Cumulative Runs</div>
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={cumProgression}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#d7c9a3" />
                                <XAxis dataKey="season" tick={{ fontSize: 10, fill: "#5b2223" }} />
                                <YAxis tick={{ fontSize: 10, fill: "#5b2223" }} />
                                <Tooltip contentStyle={{ background: "#faf6ec", border: "1px solid #b58a3a", fontSize: 11 }} />
                                <Line type="monotone" dataKey="cumulative" stroke="#1f4c37" strokeWidth={2} dot={{ fill: "#c99a2e", r: 3 }} name="Cumulative Runs" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Format distribution */}
                    {formatDist.length > 0 && (
                        <div className="border border-mpca-brass/20 p-4 bg-mpca-cream/10" data-testid="chart-format-dist">
                            <div className="overline mb-3">Runs by Format · Career</div>
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={formatDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.name}: ${e.value}`}>
                                        {formatDist.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: "#faf6ec", border: "1px solid #b58a3a", fontSize: 11 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Matches per season */}
                    <div className="border border-mpca-brass/20 p-4 bg-mpca-cream/10" data-testid="chart-matches-per-season">
                        <div className="overline mb-3">Matches Played · Season-wise</div>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={seasonAgg}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#d7c9a3" />
                                <XAxis dataKey="season" tick={{ fontSize: 10, fill: "#5b2223" }} />
                                <YAxis tick={{ fontSize: 10, fill: "#5b2223" }} />
                                <Tooltip contentStyle={{ background: "#faf6ec", border: "1px solid #b58a3a", fontSize: 11 }} />
                                <Bar dataKey="matches" fill="#1f4c37" name="Matches" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Format-wise stats */}
            <div>
                <div className="overline mb-3">Format-wise Career</div>
                <div className="border border-mpca-brass/20 overflow-hidden">
                    <div className="grid grid-cols-8 gap-2 px-3 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                        <div>Format</div>
                        <div className="text-right">Career figs</div>
                        <div className="text-right">M</div>
                        <div className="text-right">Runs</div>
                        <div className="text-right">Avg</div>
                        <div className="text-right">SR</div>
                        <div className="text-right">100s</div>
                        <div className="text-right">50s</div>
                    </div>
                    {[["Multi-day", "fc", cf.fc], ["List A", "la", cf.la], ["T20", "t20", cf.t20]].map(([label, key, careerFig]) => (
                        <div key={key} className="grid grid-cols-8 gap-2 px-3 py-2 items-center border-b border-mpca-brass/10 text-xs" data-testid={`stat-row-${key}`}>
                            <div className="font-serif text-mpca-green-dark">{label}</div>
                            <div className="text-right font-mono text-mpca-brass">{careerFig ?? "—"}</div>
                            <div className="text-right font-mono">{totals[key].m}</div>
                            <div className="text-right font-mono">{totals[key].runs}</div>
                            <div className="text-right font-mono">{totals[key].avg}</div>
                            <div className="text-right font-mono">{totals[key].sr}</div>
                            <div className="text-right font-mono">{totals[key].hundreds}</div>
                            <div className="text-right font-mono">{totals[key].fifties}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Season-wise records table */}
            <div>
                <div className="overline mb-3">Season-by-Season Record · {filteredRecords.length} entries across {filteredSeasons.length} seasons</div>
                {filteredRecords.length === 0 ? (
                    <div className="p-10 border border-mpca-brass/30 text-center text-mpca-gray-dark italic font-serif">No records match the selected filters.</div>
                ) : (
                    <div className="space-y-4">
                        {filteredSeasons.map((s) => (
                            <div key={s} className="border border-mpca-brass/20 overflow-hidden">
                                <div className="px-3 py-2 bg-mpca-oxblood text-mpca-ivory font-serif text-sm">Season {s}</div>
                                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-mpca-cream/40 text-[9px] uppercase tracking-widest text-mpca-gray-dark">
                                    <div className="col-span-3">Tournament</div>
                                    <div className="text-right">M</div>
                                    <div className="text-right">INN</div>
                                    <div className="text-right">NO</div>
                                    <div className="text-right">RUNS</div>
                                    <div className="text-right">HS</div>
                                    <div className="text-right">100</div>
                                    <div className="text-right">50</div>
                                    <div className="text-right">OV</div>
                                    <div className="text-right">WKT</div>
                                    <div className="text-right">B.AVG</div>
                                </div>
                                {filteredBySeason[s].map((r, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-mpca-brass/10 text-xs" data-testid={`record-${s}-${r.tournament_code}`}>
                                        <div className="col-span-3">
                                            <div className="font-serif text-mpca-green-dark">{r.tournament_name}</div>
                                            <div className="text-[9px] font-mono text-mpca-brass">{r.tournament_code}</div>
                                        </div>
                                        <div className="text-right font-mono">{r.m}</div>
                                        <div className="text-right font-mono">{r.inn}</div>
                                        <div className="text-right font-mono">{r.no}</div>
                                        <div className="text-right font-mono text-mpca-oxblood font-semibold">{r.runs}</div>
                                        <div className="text-right font-mono">{r.hs}</div>
                                        <div className="text-right font-mono">{r.hundreds}</div>
                                        <div className="text-right font-mono">{r.fifties}</div>
                                        <div className="text-right font-mono">{r.ov}</div>
                                        <div className="text-right font-mono">{r.wkt}</div>
                                        <div className="text-right font-mono">{r.b_avg || "—"}</div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const StatCard = ({ label, value, tone, testId }) => (
    <div className="border border-mpca-brass/20 p-3 bg-mpca-cream/20" data-testid={testId}>
        <div className="text-[9px] uppercase tracking-widest text-mpca-gray-dark">{label}</div>
        <div className={`font-serif text-2xl mt-1 ${tone === "green" ? "text-mpca-green-dark" : tone === "brass" ? "text-mpca-brass" : "text-mpca-oxblood"}`}>{value}</div>
    </div>
);



const AuditTab = ({ player }) => (
    <div data-testid="audit-tab">
        <div className="overline mb-4">Audit Trail · {(player.audit_trail || []).length} events</div>
        {(!player.audit_trail || player.audit_trail.length === 0) ? (
            <div className="p-10 border border-mpca-brass/30 text-center text-mpca-gray-dark italic font-serif">
                No events recorded yet.
            </div>
        ) : (
            <ol className="relative border-l-2 border-mpca-brass/40 ml-3 space-y-4">
                {[...player.audit_trail].reverse().map((e, i) => (
                    <li key={i} className="pl-6 relative" data-testid={`audit-${i}`}>
                        <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-mpca-green-dark ring-4 ring-mpca-ivory" />
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="font-serif text-mpca-green-dark uppercase tracking-wider text-sm">{e.event.replace(/_/g, " ")}</span>
                            <span className="text-[10px] font-mono text-mpca-brass">{fmtDateTime(e.timestamp)}</span>
                        </div>
                        {(e.actor_name || e.actor_post || e.actor_body_id) && (
                            <div className="text-[11px] text-mpca-charcoal mt-1">
                                {e.actor_name || "—"}{e.actor_post ? ` · ${e.actor_post}` : ""}{e.actor_body_id ? ` · ${e.actor_body_id}` : ""}
                            </div>
                        )}
                        {e.notes && <div className="text-[11px] italic text-mpca-gray-dark mt-1">{e.notes}</div>}
                        {e.diff && Object.keys(e.diff).length > 0 && (
                            <ul className="text-[10px] font-mono text-mpca-charcoal mt-1 list-disc list-inside">
                                {Object.entries(e.diff).map(([k, [oldV, newV]]) => (
                                    <li key={k}>{k}: <span className="text-mpca-oxblood">{JSON.stringify(oldV)}</span> → <span className="text-mpca-green-dark">{JSON.stringify(newV)}</span></li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ol>
        )}
    </div>
);

// MPCA-207 · Eligible Tournaments Tab — computed from Tournament Registry
// against the player's DOB + gender via GET /players/{id}/eligible-tournaments.
const EligibilityTab = ({ player }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const { data } = await api.get(`/players/${player.id}/eligible-tournaments`);
                if (alive) setData(data);
            } catch (e) { if (alive) setErr(e?.response?.data?.detail || e.message); }
            finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [player.id]);

    if (loading) return <div className="p-8 text-center text-mpca-brass text-xs">Checking eligibility…</div>;
    if (err) return <div className="border border-mpca-oxblood/30 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-xs">{err}</div>;

    const grouped = (data?.tournaments || []).reduce((acc, m) => {
        (acc[m.category] = acc[m.category] || []).push(m); return acc;
    }, {});
    const catLabel = { BCCI: "BCCI", Inter_Divisional: "Inter-Divisional", Inter_District: "Inter-District" };
    const playLabel = { Multi_Day: "Multi Day", Limited_Overs: "Ltd Overs" };

    return (
        <div className="space-y-4" data-testid="eligibility-tab">
            <div className="bulletin-card p-4 flex flex-wrap items-center gap-4 justify-between">
                <div>
                    <div className="overline text-[9px]">Eligibility Snapshot</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {data?.player_name || player.full_name}
                    </div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1">
                        DOB {data?.player_dob || player.dob || "—"} · Gender {data?.player_gender || player.gender || "—"}
                    </div>
                </div>
                <div className="text-right">
                    <div className="overline text-[9px]">Eligible Tournaments</div>
                    <div className="font-mono text-2xl text-mpca-oxblood">{data?.eligible_count || 0}</div>
                </div>
            </div>

            {(!data || data.eligible_count === 0) && (
                <div className="bulletin-card p-6 text-[11px] text-mpca-brass italic text-center" data-testid="eligibility-empty">
                    No tournaments match this player&apos;s age/gender window. Ensure the master registry rows have the correct <span className="font-mono">born-on-or-before / born-on-or-after</span> dates.
                </div>
            )}

            {Object.entries(grouped).map(([cat, rows]) => (
                <div key={cat} className="bulletin-card p-0 overflow-hidden" data-testid={`eligibility-group-${cat}`}>
                    <div className="bg-mpca-navy text-mpca-gold-light px-4 py-2 text-[10px] uppercase tracking-widest">
                        {catLabel[cat] || cat} · {rows.length}
                    </div>
                    <table className="w-full text-sm">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Name", "Category", "Age Group", "Type", "Window"].map((h) => (
                                    <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((m) => (
                                <tr key={m.id} className="border-b border-mpca-brass/20" data-testid={`eligibility-row-${m.id}`}>
                                    <td className="px-3 py-2 font-serif text-mpca-green-dark">
                                        {m.name}
                                        {m.short_name && <div className="text-[9px] uppercase text-mpca-brass mt-0.5">{m.short_name}</div>}
                                    </td>
                                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest">{m.gender || "—"}</td>
                                    <td className="px-3 py-2 text-[10px] font-mono uppercase text-mpca-green-dark">{m.age_grp || "—"}</td>
                                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-mpca-brass">{playLabel[m.play_type] || (m.play_type || "—")}</td>
                                    <td className="px-3 py-2 text-[10px] font-mono text-mpca-navy">
                                        {(m.born_on_or_after || m.born_on_or_before)
                                            ? <>{m.born_on_or_after || "—"} → {m.born_on_or_before || "—"}</>
                                            : <span className="italic text-mpca-gray-dark">Open (no window)</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};


const PlayerDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { persona } = useAuth();
    const [player, setPlayer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("overview");

    const load = async () => {
        try {
            const p = await fetchPlayer(id);
            setPlayer(p);
        } catch (e) {
            setError(e?.response?.data?.detail || e.message);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading player…" /></div>;
    if (error) return (
        <div className="p-16 text-center">
            <div className="font-serif text-2xl text-mpca-oxblood mb-3">Player not found</div>
            <div className="text-mpca-gray-dark">{error}</div>
            <button onClick={() => navigate("/players")} className="btn-heritage-secondary mt-6" data-testid="back-to-players">
                <ArrowLeft size={12} /> Back to Player Register
            </button>
        </div>
    );

    const catMeta = CATEGORY_META[player.category];
    const stMeta = STATUS_META[player.status] || { label: player.status, tone: "pending" };
    const isDivision = persona && persona.body_type === "Division";
    const isMPCA = persona && persona.body_type === "State";
    const canManage = isDivision || isMPCA || (persona && persona.body_code === player.body_id);

    const doAction = async (fn, needsNotes) => {
        const notes = needsNotes ? window.prompt("Enter notes for this action:") : null;
        if (needsNotes && !notes) return;
        try {
            const u = await fn({
                actor_name: persona?.display_name || "Reviewer",
                actor_body_id: persona?.body_code || "MPCA",
                actor_post: persona?.role_label,
                ...(notes ? { notes } : {}),
            });
            setPlayer(u);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    return (
        <div className="page-enter min-h-screen" data-testid="player-detail-page" style={{ backgroundColor: DL.ivory, fontFamily: DL.fontBody, color: DL.ink }}>
            {/* Sticky header — embossed emerald slab */}
            <div style={{
                background: `linear-gradient(180deg, ${DL.emerald} 0%, #0a2f24 100%)`,
                color: DL.paper,
                borderBottom: `4px solid ${DL.gold}`,
                boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.35), 0 20px 40px -30px rgba(14,31,27,0.55)",
            }}>
                <div className="max-w-[1280px] mx-auto px-8 md:px-12 py-8">
                    <button
                        onClick={() => navigate("/players")}
                        className="text-[11px] uppercase tracking-[0.22em] font-bold inline-flex items-center gap-1.5 mb-5"
                        style={{ color: DL.gold, fontFamily: DL.fontMono }}
                        data-testid="back-btn"
                    >
                        <ArrowLeft size={13} strokeWidth={2.5} /> Back to Player Register
                    </button>
                    <div className="flex items-start gap-6 flex-wrap">
                        {(() => {
                            // MPCA-208 · Player-photo placeholder.
                            // Priority: 1) player.photo_url, 2) photo in KYC documents, 3) initials tile.
                            const photoDoc = (player.documents || []).find((d) => d.type === "photo" && d.file_url);
                            const photoSrc = player.photo_url || photoDoc?.file_url || null;
                            const initials = (player.full_name || "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                            return photoSrc ? (
                                <img
                                    src={photoSrc.startsWith("http") ? photoSrc : `${API}${photoSrc}`}
                                    alt={player.full_name}
                                    className="w-28 h-36 md:w-32 md:h-40 object-cover shrink-0"
                                    style={{ border: `4px solid ${DL.gold}`, borderRadius: "4px", backgroundColor: "rgba(184,131,40,0.1)" }}
                                    data-testid="player-photo"
                                    onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                                />
                            ) : (
                                <div
                                    className="w-28 h-36 md:w-32 md:h-40 shrink-0 flex flex-col items-center justify-center gap-1"
                                    style={{ border: `4px solid ${DL.gold}`, borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.25)" }}
                                    data-testid="player-photo-placeholder"
                                    title="Passport-size photograph"
                                >
                                    <User size={40} style={{ color: "rgba(184,131,40,0.6)" }} />
                                    <div className="text-2xl font-bold" style={{ fontFamily: DL.fontDisplay, color: DL.gold }}>{initials || "—"}</div>
                                    <div className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ fontFamily: DL.fontMono, color: "rgba(184,131,40,0.6)" }}>Photo</div>
                                </div>
                            );
                        })()}
                        <div className="flex-1 min-w-[280px]">
                            {player.player_display_id && (
                                <div className="text-[11px] uppercase tracking-[0.22em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.gold }}>{player.player_display_id}</div>
                            )}
                            <div className="text-[10px] font-bold" style={{ fontFamily: DL.fontMono, color: "rgba(184,131,40,0.7)" }}>{player.player_id}</div>
                            <h1 className="text-[40px] md:text-[52px] mt-2 leading-[1.05] tracking-tight" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}>{player.full_name}</h1>
                            {player.father_name && (
                                <div className="text-[14px] mt-2 font-semibold" style={{ color: "rgba(251,248,241,0.85)" }}>
                                    s/o {player.father_name}{player.mother_name ? ` · d/o ${player.mother_name}` : ""}
                                </div>
                            )}
                            <div className="text-[14px] mt-2 font-semibold" style={{ color: "rgba(251,248,241,0.85)" }}>
                                {player.body_id} · {player.role?.replace(/_/g, " ")} · age {ageYears(player.date_of_birth)}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Pill tone={catMeta.tone} label={catMeta.label} testId={`hdr-cat-${player.category}`} />
                                <Pill tone={stMeta.tone} label={stMeta.label} testId={`hdr-status-${player.status}`} />
                                {player.court_order_flag && <span className="pill pill-suspended" data-testid="hdr-court-order">⚑ Court Order</span>}
                                {player.guest_subtype && <span className="pill pill-pending">{player.guest_subtype.replace(/_/g, " ")}</span>}
                                {player.submission_locked && <span className="pill pill-lapsed" data-testid="hdr-locked"><ShieldCheck size={10} /> Locked</span>}
                                {player.ai_document_validation && (
                                    <span className={"pill " + (AI_DECISION_META[player.ai_document_validation.decision]?.tone === "active" ? "pill-active" : AI_DECISION_META[player.ai_document_validation.decision]?.tone === "pending" ? "pill-pending" : "pill-suspended")}
                                          data-testid={`hdr-ai-${player.ai_document_validation.decision}`}>
                                        <Sparkles size={10} /> AI · {AI_DECISION_META[player.ai_document_validation.decision]?.label.split(' ·')[0] || player.ai_document_validation.decision}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action bar */}
                    {canManage && (
                        <div className="mt-6 flex flex-wrap gap-2" data-testid="detail-actions">
                            {(player.status === "Pending" || player.status === "Discrepancy_Raised") && isDivision && (
                                <button onClick={() => doAction(startPlayerReview.bind(null, player.id), false)} className="btn-heritage-secondary" data-testid="act-review">
                                    <ClipboardList size={12} /> Start Review
                                </button>
                            )}
                            {(player.status === "Pending" || player.status === "Under_Division_Review") && isDivision && (
                                <>
                                    <button onClick={() => doAction(raisePlayerDiscrepancy.bind(null, player.id), true)} className="btn-heritage-secondary !border-mpca-oxblood !text-mpca-oxblood" data-testid="act-discrepancy">
                                        <AlertTriangle size={12} /> Raise Discrepancy
                                    </button>
                                    <button onClick={() => doAction(divisionApprovePlayer.bind(null, player.id), false)} className="btn-heritage-primary" data-testid="act-div-approve">
                                        <CheckCircle2 size={12} /> Division Approve
                                    </button>
                                </>
                            )}
                            {(player.status === "Division_Approved" || player.status === "Pending" || player.status === "Under_Division_Review") && (isMPCA || isDivision) && (
                                <button onClick={() => doAction(approvePlayer.bind(null, player.id), false)} className="btn-heritage-primary" data-testid="act-approve">
                                    <CheckCircle2 size={12} /> MPCA Approve → Active
                                </button>
                            )}
                            {player.submission_locked && (isMPCA || isDivision) && (
                                <button onClick={() => doAction(reopenPlayer.bind(null, player.id), true)} className="btn-heritage-ghost" data-testid="act-reopen">
                                    <ScrollText size={12} /> Reopen for Edits
                                </button>
                            )}
                            {player.status === "Suspended" && (
                                <button onClick={async () => { try { const u = await reinstatePlayer(player.id); setPlayer(u); } catch (e) { alert(e?.response?.data?.detail || e.message); } }} className="btn-heritage-primary" data-testid="act-reinstate">
                                    <ShieldCheck size={12} /> Reinstate
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="max-w-7xl mx-auto px-8 md:px-12">
                <div className="flex gap-6 border-b border-mpca-brass/30">
                    {[
                        ["overview",    "Overview",           User],
                        ["performance", "Performance",        Award],
                        ["eligibility", "Eligible Tournaments", Trophy],
                        ["documents",   "KYC & Documents",    FileText],
                        ["sanctions",   "Sanctions",          Gavel],
                        ["audit",       "Audit Trail",        ClipboardList],
                    ].map(([k, l, I]) => (
                        <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
                            className={"pb-3 pt-6 flex items-center gap-2 text-[13px] uppercase tracking-wider font-semibold transition-colors " + (tab === k ? "text-mpca-oxblood border-b-2 border-mpca-oxblood -mb-px" : "text-mpca-gray-dark hover:text-mpca-green-dark")}>
                            <I size={13} /> {l}
                            {k === "performance" && player.selection_meta?.season_records?.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded bg-mpca-brass text-mpca-green-dark text-[10px] font-mono">{player.selection_meta.season_records.length}</span>
                            )}
                            {k === "documents" && (player.documents?.length > 0) && (
                                <span className="ml-1 px-1.5 py-0.5 rounded bg-mpca-parchment text-mpca-brass text-[10px] font-mono">{player.documents.length}</span>
                            )}
                            {k === "sanctions" && (player.disqualifications?.length > 0) && (
                                <span className="ml-1 px-1.5 py-0.5 rounded bg-mpca-oxblood text-mpca-ivory text-[10px] font-mono">{player.disqualifications.length}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="py-10">
                    {tab === "overview"    && <OverviewTab    player={player} persona={persona} locked={player.submission_locked} onChanged={setPlayer} />}
                    {tab === "performance" && <PerformanceTab player={player} />}
                    {tab === "eligibility" && <EligibilityTab  player={player} />}
                    {tab === "documents"   && <DocumentsTab   player={player} persona={persona} onChanged={setPlayer} />}
                    {tab === "sanctions"   && <SanctionsTab   player={player} persona={persona} onChanged={setPlayer} />}
                    {tab === "audit"       && <AuditTab       player={player} />}
                </div>
            </div>
        </div>
    );
};

export default PlayerDetail;
