import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    fetchPlayer, updatePlayer, addPlayerDocument, verifyPlayerDocument,
    startPlayerReview, raisePlayerDiscrepancy, divisionApprovePlayer,
    approvePlayer, reinstatePlayer, reopenPlayer, disqualifyPlayer,
} from "@/lib/api";
import {
    ArrowLeft, User, FileText, ShieldCheck, ClipboardList, Upload, X, CheckCircle2, AlertTriangle,
    Ban, Loader2, ExternalLink, Trash2, Edit3, Save, Gavel, ScrollText,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

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
const DOC_SLOTS = [
    { key: "birth_certificate",   label: "Birth Certificate (with QR)", required: true,  hint: "Municipal certificate with QR verification code." },
    { key: "aadhar",              label: "Aadhaar Card",                required: true,  hint: "Front + back scan, or e-Aadhaar PDF." },
    { key: "pan",                 label: "PAN Card",                    required: false, hint: "For players ≥ 18 years." },
    { key: "passport",            label: "Passport",                    required: false, hint: "For international / out-of-MP guests." },
    { key: "samagra_id",          label: "Samagra ID",                  required: false, hint: "MP state family / individual Samagra." },
    { key: "marksheet_10",        label: "Class-10 Marksheet",          required: false, hint: "For education-eligible guest players." },
    { key: "marksheet_12",        label: "Class-12 Marksheet",          required: false, hint: "For senior category." },
    { key: "transfer_certificate",label: "Transfer Certificate (TC)",   required: false, hint: "From previous institution." },
    { key: "affidavit",           label: "Affidavit / Guardian Consent",required: false, hint: "Notarised affidavit if under 18." },
    { key: "hospital_cert",       label: "Hospital Birth Certificate",  required: false, hint: "Alternative proof of age (TW3 corroboration)." },
    { key: "photo",               label: "Player Photograph",           required: true,  hint: "Recent passport-size photo." },
    { key: "signature",           label: "Signature Specimen",          required: false, hint: "On white paper, scanned." },
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
                    <a href={`${API}${existing.url}`} target="_blank" rel="noopener noreferrer"
                       className="text-xs font-semibold text-mpca-green-dark hover:text-mpca-oxblood inline-flex items-center gap-1"
                       data-testid={`doc-view-${slot.key}`}>
                        <ExternalLink size={12} /> {existing.filename || "View document"}
                    </a>
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

const OverviewTab = ({ player, persona, locked, onChanged }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const startEdit = () => {
        setDraft({
            mother_name: player.mother_name || "",
            sibling_names: player.sibling_names || "",
            club_academy: player.club_academy || "",
            proficiency: player.proficiency || "Club",
            height_cm: player.height_cm || "",
            weight_kg: player.weight_kg || "",
            employment: player.employment || "",
            education: player.education || "",
            address_line: player.address_line || "",
            residency_since: player.residency_since || "",
            contact_phone: player.contact_phone || "",
            contact_email: player.contact_email || "",
            guardian_name: player.guardian_name || "",
            guardian_phone: player.guardian_phone || "",
        });
        setEditing(true);
    };
    const save = async () => {
        setBusy(true); setError(null);
        try {
            const patch = { ...draft };
            if (patch.height_cm) patch.height_cm = parseFloat(patch.height_cm);
            if (patch.weight_kg) patch.weight_kg = parseFloat(patch.weight_kg);
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
                    <OInput draft={draft} setDraft={setDraft} k="mother_name" label="Mother's Name" />
                    <OInput draft={draft} setDraft={setDraft} k="sibling_names" label="Sibling(s)" />
                    <OInput draft={draft} setDraft={setDraft} k="club_academy" label="Club / Academy" />
                    <OInput draft={draft} setDraft={setDraft} k="proficiency" label="Proficiency" options={["Beginner", "Club", "District", "State", "National"]} />
                    <OInput draft={draft} setDraft={setDraft} k="height_cm" label="Height (cm)" type="number" />
                    <OInput draft={draft} setDraft={setDraft} k="weight_kg" label="Weight (kg)" type="number" />
                    <OInput draft={draft} setDraft={setDraft} k="employment" label="Employment" />
                    <OInput draft={draft} setDraft={setDraft} k="education" label="Education" />
                    <div className="sm:col-span-2"><OInput draft={draft} setDraft={setDraft} k="address_line" label="Full Address" /></div>
                    <OInput draft={draft} setDraft={setDraft} k="residency_since" label="Residency Since (MP)" type="date" />
                    <OInput draft={draft} setDraft={setDraft} k="contact_phone" label="Contact Phone" />
                    <OInput draft={draft} setDraft={setDraft} k="contact_email" label="Contact Email" type="email" />
                    <OInput draft={draft} setDraft={setDraft} k="guardian_name" label="Guardian Name" />
                    <OInput draft={draft} setDraft={setDraft} k="guardian_phone" label="Guardian Phone" />
                    {error && <div className="sm:col-span-2 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-sm">{error}</div>}
                </div>
            ) : (
                <>
                    <div className="grid sm:grid-cols-3 gap-6">
                        <Field label="Father" value={player.father_name} />
                        <Field label="Mother" value={player.mother_name} />
                        <Field label="Sibling(s)" value={player.sibling_names} />
                        <Field label="Date of Birth" value={`${fmtDate(player.date_of_birth)} (age ${ageYears(player.date_of_birth)})`} />
                        <Field label="Place of Birth" value={player.place_of_birth} />
                        <Field label="Gender" value={player.gender} />
                    </div>

                    <div>
                        <div className="overline mb-3">Cricket Profile</div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            <Field label="Role" value={player.role?.replace(/_/g, " ")} />
                            <Field label="Batting" value={player.batting_style?.replace("_", "-")} />
                            <Field label="Bowling" value={player.bowling_style?.replace(/_/g, "-")} />
                            <Field label="Proficiency" value={player.proficiency} />
                            <Field label="Club / Academy" value={player.club_academy} />
                            <Field label="Height / Weight" value={`${player.height_cm || "—"} cm · ${player.weight_kg || "—"} kg`} />
                        </div>
                    </div>

                    <div>
                        <div className="overline mb-3">Residence & Eligibility</div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            <Field label="Domicile" value={player.domicile_state} />
                            <Field label="Address District" value={player.address_district} />
                            <Field label="Residency Since" value={fmtDate(player.residency_since)} />
                            <div className="sm:col-span-3"><Field label="Full Address" value={player.address_line} /></div>
                            <Field label="Category" value={<Pill tone={CATEGORY_META[player.category]?.tone} label={CATEGORY_META[player.category]?.label} />} />
                            {player.guest_subtype && <Field label="Guest Sub-Type" value={player.guest_subtype.replace(/_/g, " ")} />}
                            {player.category === "Guest" && (
                                <Field label="TW3 / Disclosure" value={`${player.tw3_verified ? "✓ TW3" : "✗ TW3"} · ${player.guest_disclosure_signed ? "✓ Disclosure" : "✗ Disclosure"}`} />
                            )}
                            <Field label="Employment" value={player.employment} />
                            <Field label="Education" value={player.education} />
                        </div>
                    </div>

                    <div>
                        <div className="overline mb-3">Contact</div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            <Field label="Phone" value={player.contact_phone} />
                            <Field label="Email" value={player.contact_email} />
                            <Field label="Guardian" value={player.guardian_name ? `${player.guardian_name} · ${player.guardian_phone || "—"}` : "—"} />
                            <Field label="Aadhaar (last 4)" value={player.aadhaar_last4} />
                            <Field label="Registered On" value={fmtDateTime(player.registered_on)} />
                            <Field label="Division Folder" value={`${player.division_folder || "—"} · ${player.season_year || "—"}`} />
                        </div>
                    </div>

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

/** KYC / permanent document repository. */
const DocumentsTab = ({ player, persona, onChanged }) => {
    const uploaded = useMemo(() => {
        const m = {};
        (player.documents || []).forEach((d) => { m[d.doc_type] = d; });
        return m;
    }, [player.documents]);
    const locked = !!player.submission_locked;
    const requiredMissing = DOC_SLOTS.filter((s) => s.required && !uploaded[s.key]);
    return (
        <div className="space-y-6" data-testid="documents-tab">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">KYC · Permanent Records</div>
                    <p className="text-sm text-mpca-gray-dark mt-2 max-w-2xl">
                        Upload birth certificate, ID proofs, marksheets and other permanent information for this player.
                        Files are stored on the MPCA server; Division Reviewer can mark each document as verified.
                    </p>
                </div>
                <div className="text-right">
                    <div className="font-serif text-2xl text-mpca-green-dark">
                        {(player.documents || []).filter((d) => d.verified).length} <span className="text-mpca-gray-dark text-sm">/ {(player.documents || []).length}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-mpca-brass">Verified</div>
                </div>
            </div>

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
        <div className="page-enter" data-testid="player-detail-page">
            {/* Sticky header */}
            <div className="bg-mpca-green-dark text-mpca-ivory border-b-4 border-mpca-oxblood">
                <div className="max-w-7xl mx-auto px-8 md:px-12 py-8">
                    <button onClick={() => navigate("/players")} className="text-mpca-gold-light text-xs uppercase tracking-widest hover:text-mpca-oxblood inline-flex items-center gap-1 mb-4" data-testid="back-btn">
                        <ArrowLeft size={12} /> Back to Player Register
                    </button>
                    <div className="flex items-start gap-6 flex-wrap">
                        <div className="w-16 h-16 rounded-full bg-mpca-oxblood text-mpca-gold-light flex items-center justify-center font-serif text-2xl shrink-0">
                            {player.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </div>
                        <div className="flex-1 min-w-[280px]">
                            {player.player_display_id && (
                                <div className="text-[11px] font-mono uppercase tracking-widest text-mpca-gold-light">{player.player_display_id}</div>
                            )}
                            <div className="text-[10px] font-mono text-mpca-gold-light/70">{player.player_id}</div>
                            <h1 className="font-serif text-4xl md:text-5xl mt-2 leading-tight">{player.full_name}</h1>
                            {player.father_name && (
                                <div className="text-sm text-mpca-gold-light/85 mt-1">
                                    s/o {player.father_name}{player.mother_name ? ` · d/o ${player.mother_name}` : ""}
                                </div>
                            )}
                            <div className="text-sm text-mpca-gold-light/85 mt-2">
                                {player.body_id} · {player.role?.replace(/_/g, " ")} · age {ageYears(player.date_of_birth)}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Pill tone={catMeta.tone} label={catMeta.label} testId={`hdr-cat-${player.category}`} />
                                <Pill tone={stMeta.tone} label={stMeta.label} testId={`hdr-status-${player.status}`} />
                                {player.court_order_flag && <span className="pill pill-suspended" data-testid="hdr-court-order">⚑ Court Order</span>}
                                {player.guest_subtype && <span className="pill pill-pending">{player.guest_subtype.replace(/_/g, " ")}</span>}
                                {player.submission_locked && <span className="pill pill-lapsed" data-testid="hdr-locked"><ShieldCheck size={10} /> Locked</span>}
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
                        ["overview",  "Overview",           User],
                        ["documents", "KYC & Documents",    FileText],
                        ["sanctions", "Sanctions",          Gavel],
                        ["audit",     "Audit Trail",        ClipboardList],
                    ].map(([k, l, I]) => (
                        <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
                            className={"pb-3 pt-6 flex items-center gap-2 text-[13px] uppercase tracking-wider font-semibold transition-colors " + (tab === k ? "text-mpca-oxblood border-b-2 border-mpca-oxblood -mb-px" : "text-mpca-gray-dark hover:text-mpca-green-dark")}>
                            <I size={13} /> {l}
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
                    {tab === "overview"  && <OverviewTab   player={player} persona={persona} locked={player.submission_locked} onChanged={setPlayer} />}
                    {tab === "documents" && <DocumentsTab  player={player} persona={persona} onChanged={setPlayer} />}
                    {tab === "sanctions" && <SanctionsTab  player={player} persona={persona} onChanged={setPlayer} />}
                    {tab === "audit"     && <AuditTab      player={player} />}
                </div>
            </div>
        </div>
    );
};

export default PlayerDetail;
