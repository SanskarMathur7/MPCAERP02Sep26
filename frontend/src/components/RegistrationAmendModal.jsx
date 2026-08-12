import { useState } from "react";
import { X, Save, Upload, Loader2, Edit3 } from "lucide-react";
import { api } from "@/lib/api";
import { REGISTRATION_DOC_SPEC, isDocApplicable } from "@/lib/registrationDocs";

/**
 * MPCA-153 · Feb 2026 — Inline Amendment Modal
 * ─────────────────────────────────────────────
 * Replaces the old prompt-driven amend flow (`window.prompt("Which field?")`)
 * with a full editable UI. Every scalar field is directly editable in the
 * modal; every doc slot has an inline "Upload replacement" button. On Save,
 * the diff is sent to the backend which stamps a `PlayerRegistrationAuditEvent`
 * with `diff: {field: [old, new]}` — full audit trail preserved.
 *
 * Docs get uploaded first (each upload also appends its own audit event),
 * then the scalar patch is sent in a single call.
 */

const SCALAR_FIELDS = [
    { key: "full_name", label: "Full name" },
    { key: "first_name", label: "First name" },
    { key: "surname", label: "Surname" },
    { key: "father_name", label: "Father's name" },
    { key: "dob", label: "Date of birth", type: "date" },
    { key: "gender", label: "Gender", type: "select", options: ["M", "F", "Other"] },
    { key: "role", label: "Playing role", type: "select", options: ["Batter", "Bowler", "All_Rounder", "Wicket_Keeper"] },
    { key: "batting_style", label: "Batting style", type: "select", options: ["Right_Hand", "Left_Hand"] },
    { key: "bowling_style", label: "Bowling style", type: "select", options: ["None", "Right_Arm_Fast", "Right_Arm_Off_Spin", "Right_Arm_Leg_Spin", "Left_Arm_Fast", "Left_Arm_Orthodox", "Left_Arm_Chinaman"] },
    { key: "mobile", label: "Mobile" },
    { key: "email", label: "Email", type: "email" },
    { key: "preferred_division_code", label: "Home Division (code)" },
    { key: "category", label: "Category", type: "select", options: ["Local_MP", "Guest", "Foreign"] },
    { key: "guardian_name", label: "Guardian name" },
    { key: "aadhaar_no", label: "Aadhaar no." },
    { key: "pan_no", label: "PAN no." },
    { key: "gst_no", label: "GST no." },
    { key: "bank_name", label: "Bank name" },
    { key: "bank_account_no", label: "Bank account no." },
    { key: "bank_ifsc", label: "IFSC" },
    { key: "address", label: "Address", multiline: true },
    // MPCA-151 · Extended scalar fields
    { key: "place_of_birth_city", label: "Place of birth · City" },
    { key: "place_of_birth_state", label: "Place of birth · State" },
    { key: "last_season_division_code", label: "Last-season Division" },
    { key: "bcci_registered", label: "BCCI Registered?", type: "bool" },
    { key: "bcci_registration_year", label: "BCCI Registration Year", type: "number" },
    { key: "is_employed", label: "Currently Employed?", type: "bool" },
    { key: "no_recent_studies", label: "No recent studies (U-23 path)?", type: "bool" },
];

const RegistrationAmendModal = ({ registration, persona, onClose, onSaved }) => {
    const initial = registration.player_data || {};
    const [form, setForm] = useState({ ...initial });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [uploadingKey, setUploadingKey] = useState(null);

    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const uploadReplacementDoc = async (docKey, file) => {
        if (!file) return;
        setUploadingKey(docKey); setErr("");
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "player_registration");
            fd.append("related_id", registration.id);
            fd.append("body_id", persona?.body_code || "MPCA");
            fd.append("uploaded_by", persona?.name || "");
            const { data: rec } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            // Persist immediately via the /upload-doc endpoint (adds audit event)
            await api.post(`/player-registrations/${registration.id}/upload-doc`, {
                doc_key: docKey, doc_url: rec.url, actor_name: persona?.name,
            });
            setForm((f) => ({ ...f, [docKey]: rec.url }));
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally {
            setUploadingKey(null);
        }
    };

    const save = async () => {
        setBusy(true); setErr("");
        try {
            // Compute scalar diff — only send changed fields
            const patch = {};
            for (const s of SCALAR_FIELDS) {
                const before = initial[s.key];
                const after = form[s.key];
                // Normalize empty vs null
                const eq = (before ?? "") === (after ?? "") ||
                    (typeof before === "boolean" && before === Boolean(after));
                if (!eq) patch[s.key] = after;
            }
            if (Object.keys(patch).length === 0) {
                setErr("No changes to save.");
                setBusy(false);
                return;
            }
            await api.post(`/player-registrations/${registration.id}/edit`, {
                patch,
                actor_name: persona?.name,
            });
            onSaved?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto" data-testid="pr-amend-modal">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-4xl w-full my-8">
                <div className="bg-mpca-navy text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Edit3 size={16} />
                        <div className="font-serif text-xl">Amend Registration · {initial.full_name || "—"}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light hover:text-white"><X /></button>
                </div>
                <div className="p-5 space-y-5">
                    {err && (
                        <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2" data-testid="pr-amend-err">
                            {err}
                        </div>
                    )}
                    <div className="text-[11px] text-mpca-gray-dark bg-mpca-cream/40 border border-mpca-brass/30 px-3 py-2">
                        Every field is directly editable. Doc slots let you upload a fresh copy which replaces the existing one — the previous file stays in the audit trail. Every change is logged with your name.
                    </div>

                    {/* Scalar fields grid */}
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-2">Personal & Cricket Data</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {SCALAR_FIELDS.map((s) => (
                                <label key={s.key} className="block" data-testid={`amend-field-${s.key}-row`}>
                                    <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-brass mb-1">{s.label}</div>
                                    {s.type === "select" ? (
                                        <select
                                            className="input-heritage !py-1.5 !text-xs"
                                            value={form[s.key] ?? ""}
                                            onChange={(e) => setField(s.key, e.target.value)}
                                            data-testid={`amend-field-${s.key}`}
                                        >
                                            <option value="">—</option>
                                            {s.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                                        </select>
                                    ) : s.type === "bool" ? (
                                        <select
                                            className="input-heritage !py-1.5 !text-xs"
                                            value={form[s.key] ? "Yes" : "No"}
                                            onChange={(e) => setField(s.key, e.target.value === "Yes")}
                                            data-testid={`amend-field-${s.key}`}
                                        >
                                            <option value="No">No</option>
                                            <option value="Yes">Yes</option>
                                        </select>
                                    ) : s.multiline ? (
                                        <textarea
                                            rows={2}
                                            className="input-heritage !py-1.5 !text-xs"
                                            value={form[s.key] ?? ""}
                                            onChange={(e) => setField(s.key, e.target.value)}
                                            data-testid={`amend-field-${s.key}`}
                                        />
                                    ) : (
                                        <input
                                            type={s.type || "text"}
                                            className="input-heritage !py-1.5 !text-xs"
                                            value={form[s.key] ?? ""}
                                            onChange={(e) => setField(s.key, s.type === "number" ? (parseInt(e.target.value, 10) || "") : e.target.value)}
                                            data-testid={`amend-field-${s.key}`}
                                        />
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Docs section */}
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-2">Documents (upload to replace)</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {REGISTRATION_DOC_SPEC.filter((s) => isDocApplicable(s, form)).map((spec) => (
                                <div key={spec.field} className="border border-mpca-brass/30 bg-mpca-parchment p-3" data-testid={`amend-doc-${spec.field}`}>
                                    <div className="text-[11px] font-semibold text-mpca-green-dark mb-1">
                                        {spec.label}{spec.required && <span className="text-mpca-oxblood ml-1">*</span>}
                                    </div>
                                    {form[spec.field] ? (
                                        <div className="flex items-center gap-2 text-[11px]">
                                            <a href={form[spec.field]} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline truncate flex-1">
                                                Uploaded ✓
                                            </a>
                                            <label className="text-[9px] uppercase tracking-widest text-mpca-brass cursor-pointer border border-mpca-brass/40 px-2 py-1 hover:bg-mpca-brass hover:text-mpca-ivory">
                                                {uploadingKey === spec.field ? <Loader2 size={9} className="animate-spin" /> : "Replace"}
                                                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => uploadReplacementDoc(spec.field, e.target.files?.[0])} data-testid={`amend-doc-replace-${spec.field}`} />
                                            </label>
                                        </div>
                                    ) : (
                                        <label className="flex items-center gap-2 text-[11px] cursor-pointer text-mpca-brass">
                                            <Upload size={11} />
                                            {uploadingKey === spec.field ? <Loader2 size={11} className="animate-spin" /> : "Upload"}
                                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => uploadReplacementDoc(spec.field, e.target.files?.[0])} data-testid={`amend-doc-upload-${spec.field}`} />
                                        </label>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="border-t border-mpca-brass/20 px-5 py-3 flex justify-end gap-2 bg-mpca-parchment sticky bottom-0">
                    <button type="button" onClick={onClose} className="text-[11px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40 text-mpca-gray-dark" data-testid="pr-amend-cancel">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={busy}
                        className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-1.5 flex items-center gap-1 disabled:opacity-40"
                        data-testid="pr-amend-save"
                    >
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RegistrationAmendModal;
