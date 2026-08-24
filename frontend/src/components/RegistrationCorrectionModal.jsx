/**
 * Iter 128 · Registration Correction Request Modal
 * ────────────────────────────────────────────────
 * Reviewer flags specific fields / documents on a Submitted registration
 * and sends the player a tokenised link (email + SMS). Player pattern:
 *   1. Tick a field row → "Needs correction" + per-row remark
 *   2. Tick a document slot → optional "replace" remark
 *   3. Add net-new documents the reviewer wants (label + remark)
 *   4. Overall note
 *   5. Send → backend mints token, fires email + SMS, flips reg to
 *      Correction_Requested.
 */
import { useMemo, useState } from "react";
import { X, Send, Loader2, Plus, Trash2, Mail, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const FIELD_GROUPS = [
    {
        title: "Personal",
        fields: [
            ["first_name", "First Name"],
            ["surname", "Surname"],
            ["father_name", "Father's Name"],
            ["guardian_name", "Guardian Name"],
            ["dob", "Date of Birth"],
            ["gender", "Gender"],
            ["mobile", "Mobile"],
            ["email", "Email"],
            ["address", "Address"],
            ["place_of_birth_city", "Place of Birth · City"],
            ["place_of_birth_state", "Place of Birth · State"],
        ],
    },
    {
        title: "Identity & Bank",
        fields: [
            ["aadhaar_no", "Aadhaar Number"],
            ["pan_no", "PAN Number"],
            ["gst_no", "GST Number"],
            ["bank_name", "Bank Name"],
            ["bank_account_no", "Bank Account Number"],
            ["bank_ifsc", "IFSC Code"],
        ],
    },
    {
        title: "Cricket",
        fields: [
            ["role", "Role"],
            ["batting_style", "Batting Style"],
            ["bowling_style", "Bowling Style"],
            ["category", "Category"],
            ["preferred_division_code", "Home Division"],
            ["home_district_code", "Home District"],
            ["bcci_registered", "BCCI Registered"],
            ["bcci_registration_year", "BCCI Registration Year"],
            ["last_season_division_code", "Last Season Division"],
        ],
    },
];

const DOCUMENT_SLOTS = [
    ["photo_url", "Passport Size Photo"],
    ["aadhaar_url", "Aadhaar Card"],
    ["aadhaar_history_url", "Aadhaar Update History"],
    ["pan_url", "PAN Card"],
    ["address_proof_url", "Current Address Proof"],
    ["birth_cert_url", "Birth Certificate"],
    ["marksheet_3yr_url", "Marksheets · Last 3 years"],
    ["affidavit_url", "No-Study Affidavit"],
    ["consent_form_url", "Notarised Consent Form"],
    ["cancelled_cheque_url", "Cancelled Cheque"],
    ["samagra_id_player_url", "Samagra ID · Player"],
    ["samagra_id_family_url", "Samagra ID · Family"],
    ["bonafide_school_cert_url", "School Bonafide Certificate"],
    ["appointment_letter_url", "Appointment Letter"],
    ["salary_slip_url", "Salary Slip"],
    ["bank_statement_1yr_url", "Bank Statement · 12 months"],
    ["noc_previous_division_url", "NOC · Previous Division"],
    ["gst_certificate_url", "GST Certificate"],
];

export default function RegistrationCorrectionModal({ registration, onClose, onSent }) {
    const { persona } = useAuth();
    const pd = registration.player_data || {};
    const [flags, setFlags] = useState({});          // { [key]: {label, remark, kind: 'field'|'doc'} }
    const [extraDocs, setExtraDocs] = useState([]);  // [{key, label, remark}]
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const toggle = (key, label, kind) => {
        setFlags((f) => {
            const next = { ...f };
            if (next[key]) delete next[key];
            else next[key] = { label, remark: "", kind };
            return next;
        });
    };
    const setRemark = (key, remark) => setFlags((f) => ({ ...f, [key]: { ...f[key], remark } }));

    const addExtraDoc = () => setExtraDocs((d) => [
        ...d,
        { key: `extra_${Date.now()}`, label: "", remark: "" },
    ]);
    const updateExtra = (idx, patch) => setExtraDocs((d) => d.map((r, i) => i === idx ? { ...r, ...patch } : r));
    const removeExtra = (idx) => setExtraDocs((d) => d.filter((_, i) => i !== idx));

    const { fieldFlags, documentFlags } = useMemo(() => {
        const fFlags = [];
        const dFlags = [];
        for (const [key, v] of Object.entries(flags)) {
            const payload = { key, label: v.label, remark: v.remark || "Please review" };
            if (v.kind === "field") fFlags.push(payload);
            else dFlags.push({ ...payload, is_new: false });
        }
        for (const e of extraDocs) {
            if (!e.label.trim()) continue;
            // Route extra documents into other_docs on the player_data payload.
            dFlags.push({
                key: "other_docs",
                label: e.label.trim(),
                remark: e.remark.trim() || "Please upload",
                is_new: true,
            });
        }
        return { fieldFlags: fFlags, documentFlags: dFlags };
    }, [flags, extraDocs]);

    const canSend = note.trim().length >= 5 && (fieldFlags.length + documentFlags.length) > 0 && !busy;

    const send = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(
                `/player-registrations/${registration.id}/request-correction`,
                {
                    actor_name: persona?.name,
                    overall_note: note.trim(),
                    field_flags: fieldFlags,
                    document_flags: documentFlags,
                    origin: window.location.origin,
                },
            );
            setResult(data);
            onSent?.(data);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message || "Failed to send correction request.");
        } finally {
            setBusy(false);
        }
    };

    if (result) {
        return (
            <ModalShell onClose={onClose} title="Correction Request Sent">
                <div className="p-6 space-y-4 text-[13px]">
                    <div className="p-4 border border-emerald-200 bg-emerald-50 text-emerald-900 rounded">
                        The player has been notified. Registration is now in <strong>Correction Requested</strong> state.
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[12px]">
                        <div className="flex items-center gap-2">
                            <Mail size={13} /> Email · <strong className="uppercase tracking-wider">{result?.request?.notification_result?.email?.status || "—"}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone size={13} /> SMS · <strong className="uppercase tracking-wider">{result?.request?.notification_result?.sms?.status || "—"}</strong>
                        </div>
                    </div>
                    <div className="p-3 border border-mpca-brass/30 bg-mpca-parchment text-[11px] break-all font-mono" data-testid="correction-link-preview">
                        Correction link (for your records): {result?.link}
                    </div>
                    <div className="text-right">
                        <button onClick={onClose} className="text-[11px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-4 py-1.5" data-testid="correction-modal-close">
                            Close
                        </button>
                    </div>
                </div>
            </ModalShell>
        );
    }

    return (
        <ModalShell onClose={onClose} title={`Request Correction — ${pd.full_name || pd.first_name || "Player"}`}>
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div>
                    <label className="overline block mb-1 text-mpca-brass">Overall note to the player *</label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Explain briefly what needs to change (min 5 chars)"
                        className="w-full text-[12px] p-2 border border-mpca-brass/40 bg-mpca-ivory"
                        data-testid="correction-note"
                    />
                </div>

                {FIELD_GROUPS.map((g) => (
                    <FieldGroup key={g.title} title={g.title} fields={g.fields} pd={pd} flags={flags} onToggle={toggle} onRemark={setRemark} />
                ))}

                <div>
                    <h4 className="overline mb-2 text-mpca-brass">Documents</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {DOCUMENT_SLOTS.map(([k, lbl]) => {
                            const has = !!pd[k];
                            const on = !!flags[k];
                            return (
                                <div key={k} className={`border p-2 ${on ? "border-amber-400 bg-amber-50" : "border-mpca-brass/25"}`}>
                                    <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            onChange={() => toggle(k, lbl, "doc")}
                                            data-testid={`correction-flag-doc-${k}`}
                                        />
                                        <span className="font-semibold">{lbl}</span>
                                        <span className={`ml-auto text-[9px] ${has ? "text-emerald-700" : "text-mpca-gray-dark"}`}>
                                            {has ? "on file" : "missing"}
                                        </span>
                                    </label>
                                    {on && (
                                        <input
                                            type="text"
                                            value={flags[k]?.remark || ""}
                                            onChange={(e) => setRemark(k, e.target.value)}
                                            placeholder="What's wrong?"
                                            className="mt-2 w-full text-[11px] p-1.5 border border-mpca-brass/30 bg-white"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="overline text-mpca-brass">Additional documents to request</h4>
                        <button onClick={addExtraDoc} className="text-[10px] uppercase tracking-wider flex items-center gap-1 text-mpca-navy" data-testid="correction-add-extra-doc">
                            <Plus size={11} /> Add
                        </button>
                    </div>
                    {extraDocs.length === 0 ? (
                        <p className="text-[11px] italic text-mpca-gray-dark">Ask for any new document not already collected (e.g. school certificate, character certificate).</p>
                    ) : (
                        <div className="space-y-2">
                            {extraDocs.map((e, i) => (
                                <div key={e.key} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                                    <input value={e.label} onChange={(ev) => updateExtra(i, { label: ev.target.value })} placeholder="Document name" className="text-[11px] p-1.5 border border-mpca-brass/40 bg-mpca-ivory" data-testid={`correction-extra-label-${i}`} />
                                    <input value={e.remark} onChange={(ev) => updateExtra(i, { remark: ev.target.value })} placeholder="What / why" className="text-[11px] p-1.5 border border-mpca-brass/40 bg-mpca-ivory" data-testid={`correction-extra-remark-${i}`} />
                                    <button onClick={() => removeExtra(i)} className="text-mpca-oxblood">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="border-t border-mpca-brass/25 px-6 py-3 flex justify-between items-center bg-mpca-parchment/60">
                <div className="text-[11px] text-mpca-gray-dark">
                    Player will be emailed at <strong>{pd.email || "—"}</strong> and SMS&apos;d on <strong>{pd.mobile || "—"}</strong>. Link valid 7 days.
                </div>
                <button onClick={send} disabled={!canSend} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-2 flex items-center gap-2 disabled:opacity-40" data-testid="correction-send-btn">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Send Correction Request
                </button>
            </div>
        </ModalShell>
    );
}

const FieldGroup = ({ title, fields, pd, flags, onToggle, onRemark }) => (
    <div>
        <h4 className="overline mb-2 text-mpca-brass">{title}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            {fields.map(([k, lbl]) => {
                const on = !!flags[k];
                const value = pd[k];
                const shown = value === null || value === undefined || value === "" ? "—" : String(value);
                return (
                    <div key={k} className={`border-l-2 pl-3 py-2 ${on ? "border-amber-400 bg-amber-50/60" : "border-transparent"}`}>
                        <label className="flex items-start gap-2 text-[11px] cursor-pointer">
                            <input type="checkbox" checked={on} onChange={() => onToggle(k, lbl, "field")} className="mt-0.5" data-testid={`correction-flag-${k}`} />
                            <div className="flex-1">
                                <div className="flex items-baseline justify-between">
                                    <span className="font-semibold text-mpca-charcoal">{lbl}</span>
                                    <span className="text-[10px] font-mono text-mpca-gray-dark truncate ml-2 max-w-[140px]">{shown}</span>
                                </div>
                                {on && (
                                    <input
                                        type="text"
                                        value={flags[k]?.remark || ""}
                                        onChange={(e) => onRemark(k, e.target.value)}
                                        placeholder="Why does this need correction?"
                                        className="mt-1.5 w-full text-[11px] p-1.5 border border-mpca-brass/30 bg-white"
                                    />
                                )}
                            </div>
                        </label>
                    </div>
                );
            })}
        </div>
    </div>
);

const ModalShell = ({ children, onClose, title }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="correction-modal">
        <div className="bg-white w-full max-w-3xl max-h-[90vh] shadow-xl flex flex-col">
            <div className="flex justify-between items-center px-6 py-3 border-b border-mpca-brass/25 bg-mpca-green-dark text-mpca-ivory">
                <h3 className="font-serif text-base">{title}</h3>
                <button onClick={onClose} data-testid="correction-modal-x"><X size={16} /></button>
            </div>
            {children}
        </div>
    </div>
);
