/**
 * /register/player/:token — Public Player Registration (docs-first flow)
 * ─────────────────────────────────────────────────────────────────────
 * Feb 2026 · Rewrite requested by user:
 *   1. Player uploads KYC documents FIRST
 *   2. Player clicks "Start AI Verification"
 *   3. AI reads every document, extracts fields, auto-fills the form
 *   4. Player sees per-document status pills (verified / warning / error)
 *      and can re-upload any document that failed
 *   5. Player sees the same AI summary card used inside the ERP
 *   6. Player edits any manual fields (mobile, email, address, home division,
 *      cricket profile — anything not on a document) and reviews
 *      the AI-parsed values
 *   7. "MPCA holds the power of final approval" notice
 *   8. Consent + Submit to MPCA
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
    UserPlus, Loader2, ShieldCheck, ShieldAlert, CheckCircle2, Upload,
    Sparkles, FileCheck2, AlertTriangle, RefreshCw, Edit3, XCircle,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const public_api = axios.create({ baseURL: `${BACKEND_URL}/api`, timeout: 240000 });

// ─────────────────── Form defaults ───────────────────
const emptyPlayer = {
    full_name: "", first_name: "", surname: "", father_name: "",
    dob: "", gender: "M", role: "Batter",
    batting_style: "Right_Hand", bowling_style: "None",
    mobile: "", email: "", preferred_division_code: "", category: "Local_MP",
    guardian_name: "", address: "", aadhaar_no: "", pan_no: "", gst_no: "",
    bank_name: "", bank_account_no: "", bank_ifsc: "",
    consent: false, dpdp_consent: false, no_recent_studies: false,
    photo_url: "", aadhaar_url: "", aadhaar_history_url: "",
    pan_url: "", passport_url: "", driving_licence_url: "", voter_id_url: "",
    address_proof_url: "", birth_cert_url: "",
    marksheet_3yr_url: "", affidavit_url: "",
    cancelled_cheque_url: "", gst_certificate_url: "",
    samagra_id_player_url: "", samagra_id_family_url: "",
    consent_form_url: "", no_study_affidavit_url: "", bonafide_school_cert_url: "",
    is_employed: false,
    appointment_letter_url: "", salary_slip_url: "", bank_statement_1yr_url: "",
    last_season_division_code: "", noc_previous_division_url: "",
    place_of_birth_city: "", place_of_birth_state: "",
    bcci_registered: false, bcci_registration_year: "",
    other_docs: [],
};

// ─────────────────── Component ───────────────────
export default function PublicPlayerRegistration() {
    const { token } = useParams();
    const [env, setEnv] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [form, setForm] = useState(emptyPlayer);
    const [uploadingKey, setUploadingKey] = useState(null);

    // AI verification state
    const [verifying, setVerifying] = useState(false);
    const [aiReport, setAiReport] = useState(null);   // full report from /verify
    const [aiError, setAiError] = useState("");
    const [aiFilledFields, setAiFilledFields] = useState(new Set());

    const [submitting, setSubmitting] = useState(false);
    const [submitErr, setSubmitErr] = useState("");
    const [done, setDone] = useState(null);

    // ── Resolve token ──
    useEffect(() => {
        (async () => {
            try {
                const { data } = await public_api.get(`/public/player-registration/token/${token}`);
                setEnv(data);
                setForm((f) => ({
                    ...f,
                    full_name: data.prefill?.full_name || "",
                    email: data.prefill?.email || "",
                    mobile: data.prefill?.mobile || "",
                }));
            } catch (e) {
                setErr(e?.response?.data?.detail || "Invalid or expired link.");
            } finally { setLoading(false); }
        })();
    }, [token]);

    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // ── Upload a single doc ──
    const upload = async (key, file) => {
        if (!file) return;
        setUploadingKey(key);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "player_registration");
            fd.append("registration_token", token);
            const { data } = await public_api.post("/public/uploads", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setField(key, data.url);
            // Any change to uploaded docs invalidates the last AI verdict
            setAiReport(null);
            setAiFilledFields(new Set());
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploadingKey(null); }
    };

    // ── Run AI verification ──
    const runVerify = async () => {
        setAiError(""); setVerifying(true);
        try {
            const { data } = await public_api.post("/public/player-registration/verify", {
                token,
                player: form,
            });
            setAiReport(data);
            // Merge AI-suggested values into form fields that are currently empty
            const suggested = data.suggested_fields || {};
            const changed = new Set();
            setForm((f) => {
                const next = { ...f };
                for (const [k, v] of Object.entries(suggested)) {
                    if (v == null || v === "") continue;
                    // Only overwrite blanks or existing AI-filled values,
                    // never touch a field the player has manually edited.
                    if (!next[k] || aiFilledFields.has(k)) {
                        next[k] = v;
                        changed.add(k);
                    }
                }
                return next;
            });
            setAiFilledFields((prev) => new Set([...prev, ...changed]));
        } catch (e) {
            setAiError(e?.response?.data?.detail || e.message || "AI verification failed.");
        } finally { setVerifying(false); }
    };

    // ── Submit to MPCA ──
    const submit = async (e) => {
        e.preventDefault();
        setSubmitErr("");
        if (!form.consent || !form.dpdp_consent) return alert("Please tick both consent boxes before submitting.");
        if (!form.email?.trim()) { setSubmitErr("Email is required."); return; }
        if (!aiReport) { setSubmitErr("Please run AI Verification before submitting."); return; }
        setSubmitting(true);
        try {
            const cleaned = {
                ...form,
                bcci_registration_year: form.bcci_registered && form.bcci_registration_year !== ""
                    ? Number(form.bcci_registration_year) || null
                    : null,
            };
            const { data } = await public_api.post("/public/player-registration/submit", { token, player: cleaned });
            setDone(data);
        } catch (e) {
            let msg = e?.response?.data?.detail || e.message;
            if (Array.isArray(msg)) {
                const first = msg[0];
                msg = first?.msg
                    ? `${(first.loc || []).slice(-1)[0] || "field"}: ${first.msg}`
                    : "Some fields are invalid — please review and try again.";
            }
            setSubmitErr(msg);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        finally { setSubmitting(false); }
    };

    // ── Derived helpers ──
    const uploadedCount = useMemo(
        () => DOC_ROSTER(form).filter(([k]) => form[k]).length,
        [form],
    );

    // ── Early returns ──
    if (loading) return (
        <div className="min-h-screen bg-mpca-parchment flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-mpca-oxblood" />
        </div>
    );
    if (err) return (
        <div className="min-h-screen bg-mpca-parchment flex items-center justify-center p-6">
            <div className="max-w-md bulletin-card p-8 text-center bg-mpca-oxblood/5 border-mpca-oxblood/40" data-testid="pr-public-error">
                <ShieldAlert size={30} className="text-mpca-oxblood mx-auto mb-3" />
                <div className="font-serif text-xl text-mpca-oxblood">Sorry, this link cannot be opened.</div>
                <div className="text-[11px] text-mpca-gray-dark mt-2">{err}</div>
                <div className="text-[10px] text-mpca-brass mt-4">Please contact your Division secretary for a fresh link.</div>
            </div>
        </div>
    );
    if (done) return (
        <div className="min-h-screen bg-mpca-parchment flex items-center justify-center p-6" data-testid="pr-public-done">
            <div className="max-w-md bulletin-card p-8 text-center bg-mpca-green-dark/5 border-mpca-green-dark/40">
                <CheckCircle2 size={36} className="text-mpca-green-dark mx-auto mb-3" />
                <div className="font-serif text-2xl text-mpca-green-dark">Registration Submitted</div>
                <div className="text-[12px] text-mpca-gray-dark mt-2">
                    Thank you, {done.player_data?.full_name}. Your details have been sent to <b>{env.body_name || env.body_code}</b> for approval. You will be notified once your player ID is issued for the <b>{env.cycle_code}</b> season.
                </div>
                <div className="text-[10px] text-mpca-brass mt-4 font-mono">Reference · {done.id.slice(0, 12)}</div>
            </div>
        </div>
    );

    // ── Main form ──
    return (
        <div className="min-h-screen bg-mpca-parchment py-10" data-testid="pr-public-form-page">
            <div className="max-w-3xl mx-auto px-4">
                <div className="bulletin-card overflow-hidden">
                    {/* Header */}
                    <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-5 border-b-4 border-mpca-oxblood flex items-center gap-4">
                        <img src="/assets/mpca-logo.png" alt="MPCA"
                             className="w-14 h-16 object-contain bg-white/95 rounded p-1 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="overline !text-mpca-gold-light">Madhya Pradesh Cricket Association{env.body_code && env.body_code !== "MPCA" ? ` · ${env.body_name || env.body_code}` : ""}</div>
                            <div className="font-serif text-2xl mt-1">{env.campaign_title}</div>
                            <div className="text-[11px] text-mpca-ivory/70 mt-1">Season {env.cycle_code}{env.expires_on ? ` · closes ${env.expires_on}` : ""}</div>
                        </div>
                    </div>

                    <form onSubmit={submit} className="p-6 space-y-6" data-testid="pr-public-form">
                        {submitErr && (
                            <div className="border-2 border-mpca-oxblood bg-mpca-oxblood/10 p-3 text-[11px] text-mpca-oxblood flex items-start gap-2" data-testid="pr-pub-submit-err">
                                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                                <div>{submitErr}</div>
                            </div>
                        )}

                        {/* ── How this works ── */}
                        <HowItWorks />

                        {/* ── Step 1 · Documents ── */}
                        <StepHeader n="1" title="Upload your documents" subtitle="Aadhaar, PAN, Birth certificate, Cheque, Marksheets — anything with your details on it." />
                        <DocumentsGrid
                            form={form}
                            setField={setField}
                            upload={upload}
                            uploadingKey={uploadingKey}
                            perDocStatus={aiReport?.per_doc_status || {}}
                            token={token}
                        />

                        {/* ── Step 2 · AI Verification ── */}
                        <StepHeader n="2" title="Start AI verification" subtitle="Our AI reads every document, fills your details automatically, and flags anything unclear." />
                        <VerifyControl
                            uploadedCount={uploadedCount}
                            verifying={verifying}
                            aiReport={aiReport}
                            aiError={aiError}
                            onVerify={runVerify}
                        />
                        {aiReport && <AiSummaryCard report={aiReport} />}

                        {/* ── Step 3 · Confirm details ── */}
                        {aiReport && (
                            <>
                                <StepHeader n="3" title="Confirm your details" subtitle="AI-filled values are highlighted in gold. Manual fields are below the AI section. Everything remains editable." />
                                <AiFilledFieldsBlock form={form} setField={setField} aiFilledFields={aiFilledFields} />
                                <ManualFieldsBlock form={form} setField={setField} divisions={env.divisions || []} />
                                <DocumentContextTogglesBlock form={form} setField={setField} />
                                <MpcaFinalApprovalNotice />
                                <ConsentBlock form={form} setField={setField} />
                                <div className="text-center text-[11px] text-mpca-brass italic -mb-2" data-testid="submit-approval-caption">
                                    By submitting, you understand this form is <strong className="text-mpca-oxblood not-italic">subject to final approval by MPCA</strong>. AI verification is only an assistive check.
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting || !form.consent || !form.dpdp_consent || !aiReport}
                                    className="w-full bg-mpca-oxblood text-mpca-ivory text-sm uppercase tracking-widest py-3 flex items-center justify-center gap-2 disabled:opacity-40 border-2 border-mpca-oxblood hover:bg-mpca-burgundy-dark transition-colors"
                                    data-testid="pr-pub-submit-btn"
                                >
                                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Submit Registration to MPCA
                                </button>
                                <div className="text-center text-[10px] text-mpca-gray-dark -mt-1" data-testid="submit-hint">
                                    Your registration will be reviewed and finally approved by MPCA before your player ID is issued.
                                </div>
                            </>
                        )}
                    </form>
                </div>
                <div className="text-[10px] text-mpca-gray-dark text-center mt-4 flex items-center justify-center gap-1">
                    <UserPlus size={10} /> Powered by MPCA ERP · {env.body_name || env.body_code}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

const HowItWorks = () => (
    <div className="border-2 border-mpca-brass/60 bg-mpca-gold-light/25 px-4 py-3" data-testid="how-it-works">
        <div className="text-[11px] font-bold text-mpca-oxblood uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Sparkles size={12} /> How this works
        </div>
        <ol className="text-[11px] text-mpca-charcoal grid grid-cols-1 md:grid-cols-3 gap-3">
            <li className="flex items-start gap-2"><span className="w-5 h-5 bg-mpca-oxblood text-mpca-ivory rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">1</span><span><b>Upload your KYC documents</b> — the more you attach, the less you type.</span></li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 bg-mpca-oxblood text-mpca-ivory rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">2</span><span><b>Start AI Verification</b> — our AI reads every document, fills your details and flags any issue.</span></li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 bg-mpca-oxblood text-mpca-ivory rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">3</span><span><b>Review &amp; Submit</b> — check the extracted details, correct anything the AI missed, then submit to MPCA.</span></li>
        </ol>
    </div>
);

const StepHeader = ({ n, title, subtitle }) => (
    <div className="flex items-start gap-3 border-b-2 border-mpca-oxblood pb-2 mt-2">
        <div className="w-8 h-8 bg-mpca-oxblood text-mpca-ivory rounded-full flex items-center justify-center font-serif text-lg font-bold shrink-0" data-testid={`step-${n}-badge`}>{n}</div>
        <div className="min-w-0">
            <div className="font-serif text-lg text-mpca-oxblood leading-tight">{title}</div>
            <div className="text-[11px] text-mpca-gray-dark italic mt-0.5">{subtitle}</div>
        </div>
    </div>
);

// Doc roster — same requirements as the old flow, kept in one place so the
// Documents grid and the "uploaded count" derivation stay in sync.
function DOC_ROSTER(form) {
    return [
        ["photo_url", "Passport Size Photo", true],
        ["aadhaar_url", "Aadhaar (Unmasked)", true],
        ["aadhaar_history_url", "Aadhaar Update History", false],
        ["pan_url", "PAN Card", false],
        ["birth_cert_url", "Birth Certificate (with QR)", true],
        ["address_proof_url", "Current Address Proof", true],
        ["samagra_id_player_url", "Samagra ID · Player", true],
        ["samagra_id_family_url", "Samagra ID · Family", true],
        ["consent_form_url", "Consent Form (Notarized)", true],
        ...(form.no_recent_studies
            ? [["no_study_affidavit_url", "No-Study Affidavit", true]]
            : []),
        ["cancelled_cheque_url", "Cancelled Cheque", false],
        ...(form.is_employed
            ? [
                ["appointment_letter_url", "Appointment Letter", true],
                ["salary_slip_url", "Latest Salary Slip", true],
                ["bank_statement_1yr_url", "1-Year Bank Statement", true],
            ]
            : [
                ["marksheet_3yr_url", "Marksheets · Last 3 years", true],
                ["bonafide_school_cert_url", "School Bonafide", true],
            ]),
        ...(form.last_season_division_code && form.last_season_division_code !== form.preferred_division_code
            ? [["noc_previous_division_url", `NOC from ${form.last_season_division_code}`, true]]
            : []),
        ["passport_url", "Passport (optional alt.)", false],
        ["driving_licence_url", "Driving Licence (optional alt.)", false],
        ["voter_id_url", "Voter ID (optional alt.)", false],
    ];
}

const DocStatusPill = ({ status }) => {
    if (!status) return null;
    const s = status.status;
    // Compact dot + short label. Sits on the "Uploaded ✓" row (right side),
    // never on the header row — so the doc label always has full width.
    const tone =
        s === "verified" ? { dot: "bg-mpca-green-dark", txt: "text-mpca-green-dark", label: "Verified", testid: "doc-status-verified" } :
        s === "warning"  ? { dot: "bg-mpca-brass",     txt: "text-mpca-brass",     label: "Review",   testid: "doc-status-warning"  } :
        s === "error"    ? { dot: "bg-mpca-oxblood",   txt: "text-mpca-oxblood",   label: "Fix",      testid: "doc-status-error"    } :
        null;
    if (!tone) return null;
    return (
        <span className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold ${tone.txt}`} data-testid={tone.testid}>
            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
        </span>
    );
};

const DocumentsGrid = ({ form, setField, upload, uploadingKey, perDocStatus, token }) => {
    const roster = DOC_ROSTER(form);
    return (
        <div>
            <div className="border-2 border-mpca-brass/70 bg-mpca-gold-light/30 px-3 py-2 mb-3 text-[11px] font-semibold text-mpca-oxblood">
                <ShieldAlert size={11} className="inline mr-1" /> PDF / JPG / PNG · Max 5 MB per file · Aadhaar must be issued/updated within last 3 years.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {roster.map(([key, label, required]) => {
                    const st = perDocStatus[key];
                    const hasIssue = st?.issues?.length > 0;
                    return (
                    <div key={key} className="border border-mpca-brass/30 bg-mpca-parchment p-3" data-testid={`doc-tile-${key}`}>
                        {/* Header · always full-width label, no pill competing for space */}
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1.5">
                            {label}{required && <span className="text-mpca-oxblood ml-1">*</span>}
                        </div>
                        {form[key] ? (
                            <>
                                {/* Row 1 · Uploaded + status pill + Replace */}
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <a href={form[key]} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline truncate">Uploaded ✓</a>
                                        <DocStatusPill status={st} />
                                    </div>
                                    <label className="flex items-center gap-1 cursor-pointer text-[9px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood shrink-0">
                                        <RefreshCw size={9} /> Replace
                                        <input type="file" accept="image/*,application/pdf" className="hidden"
                                               onChange={(e) => upload(key, e.target.files?.[0])}
                                               data-testid={`pr-pub-reupload-${key}`} />
                                    </label>
                                </div>
                                {/* Row 2 · Comment (only when an issue exists) */}
                                {hasIssue && (
                                    <div className={`mt-1.5 text-[10px] leading-snug ${st.status === "error" ? "text-mpca-oxblood" : "text-mpca-brass"}`} data-testid={`doc-issues-${key}`}>
                                        {st.issues[0].slice(0, 160)}
                                    </div>
                                )}
                            </>
                        ) : (
                            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                                <Upload size={11} className="text-mpca-brass" />
                                <input type="file" accept="image/*,application/pdf"
                                       onChange={(e) => upload(key, e.target.files?.[0])}
                                       className="text-[11px]"
                                       data-testid={`pr-pub-upload-${key}`} />
                                {uploadingKey === key && <Loader2 size={11} className="animate-spin" />}
                            </label>
                        )}
                    </div>
                    );
                })}
            </div>
        </div>
    );
};

const VerifyControl = ({ uploadedCount, verifying, aiReport, aiError, onVerify }) => {
    const canVerify = uploadedCount > 0 && !verifying;
    return (
        <div className="border-2 border-mpca-oxblood bg-mpca-parchment px-4 py-3 flex items-center justify-between gap-3 flex-wrap" data-testid="ai-verify-control">
            <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold uppercase tracking-widest text-mpca-oxblood">
                    {uploadedCount === 0
                        ? "Upload at least one document to enable verification"
                        : aiReport
                            ? `Re-run AI verification (${uploadedCount} documents attached)`
                            : `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} ready to verify`}
                </div>
                <div className="text-[10px] text-mpca-gray-dark italic mt-0.5">Runs in 30–90 seconds. Nothing is submitted to MPCA until you click Submit at the end.</div>
                {aiError && <div className="text-[10px] text-mpca-oxblood mt-1 font-semibold" data-testid="ai-verify-error">{aiError}</div>}
            </div>
            <button
                type="button"
                onClick={onVerify}
                disabled={!canVerify}
                className="bg-mpca-oxblood text-mpca-ivory text-[12px] uppercase tracking-widest px-4 py-2 flex items-center gap-2 disabled:opacity-40 hover:bg-mpca-burgundy-dark transition-colors border-2 border-mpca-oxblood shrink-0"
                data-testid="ai-verify-btn"
            >
                {verifying ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {verifying ? "Reading documents…" : aiReport ? "Re-run Verification" : "Start AI Verification"}
            </button>
        </div>
    );
};

const AiSummaryCard = ({ report }) => {
    const verdict = report.verdict || "Manual_Review";
    const verdictTone = verdict === "Recommend_Approve"
        ? { bg: "bg-mpca-green-dark", label: "AI · Ready to submit" }
        : verdict === "Recommend_Reject"
            ? { bg: "bg-mpca-oxblood", label: "AI · Please fix the issues below" }
            : { bg: "bg-mpca-brass", label: "AI · Manual review needed" };

    const critical = report.critical_issues || [];
    const warnings = report.warnings || [];
    const info = report.info || [];

    return (
        <div className="border-2 border-mpca-oxblood bg-mpca-parchment" data-testid="ai-summary-card">
            <div className={`${verdictTone.bg} text-mpca-ivory px-4 py-2 flex items-center gap-2`}>
                <Sparkles size={14} />
                <div className="text-[11px] uppercase tracking-widest font-bold">{verdictTone.label}</div>
                <div className="ml-auto text-[10px] font-mono opacity-80">Confidence · {Math.round((report.overall_confidence || 0) * 100)}%</div>
            </div>
            <div className="p-4 space-y-3">
                {critical.length > 0 && (
                    <IssueList tone="error" icon={XCircle} title={`${critical.length} critical issue${critical.length === 1 ? "" : "s"} — please fix and re-verify`} items={critical} testid="ai-critical" />
                )}
                {warnings.length > 0 && (
                    <IssueList tone="warning" icon={AlertTriangle} title={`${warnings.length} warning${warnings.length === 1 ? "" : "s"} — reviewer will double-check`} items={warnings} testid="ai-warnings" />
                )}
                {info.length > 0 && (
                    <IssueList tone="ok" icon={CheckCircle2} title={`${info.length} check${info.length === 1 ? "" : "s"} passed`} items={info} testid="ai-info" />
                )}
                {critical.length === 0 && warnings.length === 0 && (
                    <div className="text-[12px] text-mpca-green-dark flex items-center gap-2"><CheckCircle2 size={13} /> No issues found. Your documents look consistent with the details on this form.</div>
                )}
                {report.age_computed != null && (
                    <div className="text-[10px] font-mono text-mpca-brass uppercase tracking-widest border-t border-mpca-brass/30 pt-2">
                        Computed age · {report.age_computed} years · PAN {report.pan_required ? "required" : "optional"} · Engine {report.model}
                    </div>
                )}
            </div>
        </div>
    );
};

const IssueList = ({ tone, icon: Icon, title, items, testid }) => {
    const cls = tone === "error"
        ? "border-mpca-oxblood bg-mpca-oxblood/5 text-mpca-oxblood"
        : tone === "warning"
            ? "border-mpca-brass bg-mpca-gold-light/40 text-mpca-oxblood"
            : "border-mpca-green-dark bg-mpca-green-dark/5 text-mpca-green-dark";
    return (
        <div className={`border-l-4 ${cls} px-3 py-2`} data-testid={testid}>
            <div className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5"><Icon size={11} /> {title}</div>
            <ul className="text-[11px] mt-1 list-disc pl-5 space-y-0.5">
                {items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
        </div>
    );
};

// ─────────────────── Field blocks ───────────────────

const AiFilledFieldsBlock = ({ form, setField, aiFilledFields }) => (
    <Section title="Personal Details (AI-filled from your documents)" icon={Sparkles}>
        <div className="text-[10px] text-mpca-brass italic mb-2 -mt-1">Values shown here were extracted from your uploaded documents. Edit any field if the AI missed something.</div>
        <Grid>
            <FilledField label="First name" k="first_name" required form={form} setField={(k,v) => { setField(k, v); setField("full_name", `${v} ${form.surname || ""}`.trim()); }} aiSet={aiFilledFields} />
            <FilledField label="Surname" k="surname" required form={form} setField={(k,v) => { setField(k, v); setField("full_name", `${form.first_name || ""} ${v}`.trim()); }} aiSet={aiFilledFields} />
            <FilledField label="Father's name" k="father_name" required form={form} setField={setField} aiSet={aiFilledFields} />
            <FilledField label="Date of birth" k="dob" type="date" required form={form} setField={setField} aiSet={aiFilledFields} />
            <FilledField label="Gender" k="gender" as="select" options={[["M","Male"],["F","Female"],["Other","Other"]]} required form={form} setField={setField} aiSet={aiFilledFields} />
            <FilledField label="Aadhaar no." k="aadhaar_no" form={form} setField={setField} aiSet={aiFilledFields} placeholder="12-digit" />
            <FilledField label="PAN no." k="pan_no" form={form} setField={setField} aiSet={aiFilledFields} placeholder="ABCDE1234F" />
            <FilledField label="Bank name" k="bank_name" form={form} setField={setField} aiSet={aiFilledFields} />
            <FilledField label="Bank IFSC" k="bank_ifsc" form={form} setField={setField} aiSet={aiFilledFields} placeholder="e.g. HDFC0001234" />
        </Grid>
    </Section>
);

const ManualFieldsBlock = ({ form, setField, divisions }) => (
    <Section title="Details Not on Any Document (please fill manually)" icon={Edit3}>
        <div className="text-[10px] text-mpca-brass italic mb-2 -mt-1">These fields are not on any KYC document. Please enter them yourself.</div>
        <Grid>
            <Field label="Mobile" required><input required value={form.mobile} onChange={(e) => setField("mobile", e.target.value)} placeholder="10-digit mobile" className="input-heritage font-mono !py-1.5 !text-xs" data-testid="pr-pub-mobile" /></Field>
            <Field label="Email" required><input required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="you@example.com" className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-email" /></Field>
            <Field label="Home Division" required>
                <select required value={form.preferred_division_code} onChange={(e) => setField("preferred_division_code", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-home-division">
                    <option value="">— Select your Home Division —</option>
                    {divisions.map((d) => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
                </select>
            </Field>
            <Field label="Playing role" required>
                <select value={form.role} onChange={(e) => setField("role", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-role">
                    <option value="Batter">Batter</option><option value="Bowler">Bowler</option><option value="All_Rounder">All-Rounder</option><option value="Wicket_Keeper">Wicket-Keeper</option>
                </select>
            </Field>
            <Field label="Batting style">
                <select value={form.batting_style} onChange={(e) => setField("batting_style", e.target.value)} className="input-heritage !py-1.5 !text-xs">
                    <option value="Right_Hand">Right-Hand</option><option value="Left_Hand">Left-Hand</option>
                </select>
            </Field>
            <Field label="Bowling style">
                <select value={form.bowling_style} onChange={(e) => setField("bowling_style", e.target.value)} className="input-heritage !py-1.5 !text-xs">
                    {["None","Right_Arm_Fast","Right_Arm_Off_Spin","Right_Arm_Leg_Spin","Left_Arm_Fast","Left_Arm_Orthodox","Left_Arm_Chinaman"].map((s) => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                </select>
            </Field>
            <Field label="Guardian name (if under 18)"><input value={form.guardian_name} onChange={(e) => setField("guardian_name", e.target.value)} className="input-heritage !py-1.5 !text-xs" /></Field>
            <Field label="Category">
                <select value={form.category} onChange={(e) => setField("category", e.target.value)} className="input-heritage !py-1.5 !text-xs">
                    <option value="Local_MP">Local MP</option><option value="Guest">Guest</option><option value="Foreign">Foreign</option>
                </select>
            </Field>
            <Field label="Bank account no."><input value={form.bank_account_no} onChange={(e) => setField("bank_account_no", e.target.value)} className="input-heritage font-mono !py-1.5 !text-xs" /></Field>
            <Field label="GST no. (optional)"><input value={form.gst_no} onChange={(e) => setField("gst_no", e.target.value)} placeholder="15-char GSTIN" className="input-heritage font-mono !py-1.5 !text-xs" /></Field>
            <Field label="Place of birth · City"><input value={form.place_of_birth_city} onChange={(e) => setField("place_of_birth_city", e.target.value)} placeholder="e.g. Indore" className="input-heritage !py-1.5 !text-xs" /></Field>
            <Field label="Place of birth · State"><input value={form.place_of_birth_state} onChange={(e) => setField("place_of_birth_state", e.target.value)} placeholder="e.g. Madhya Pradesh" className="input-heritage !py-1.5 !text-xs" /></Field>
            <Field label="Division played last season">
                <select value={form.last_season_division_code} onChange={(e) => setField("last_season_division_code", e.target.value)} className="input-heritage !py-1.5 !text-xs">
                    <option value="">— None / new to cricket —</option>
                    {divisions.map((d) => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
                </select>
            </Field>
            <Field label="BCCI Registered?">
                <select value={form.bcci_registered ? "Yes" : "No"} onChange={(e) => setField("bcci_registered", e.target.value === "Yes")} className="input-heritage !py-1.5 !text-xs">
                    <option value="No">No</option><option value="Yes">Yes</option>
                </select>
            </Field>
            {form.bcci_registered && (
                <Field label="BCCI Registration Year" required>
                    <input required type="number" min="1990" max="2100" value={form.bcci_registration_year} onChange={(e) => setField("bcci_registration_year", e.target.value)} placeholder="e.g. 2021" className="input-heritage font-mono !py-1.5 !text-xs" />
                </Field>
            )}
            <Field label="Current Address" span={2}><textarea rows={2} value={form.address} onChange={(e) => setField("address", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-address" /></Field>
        </Grid>
    </Section>
);

const DocumentContextTogglesBlock = ({ form, setField }) => (
    <div className="space-y-2">
        <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal border border-mpca-brass/40 bg-mpca-parchment px-3 py-2">
            <input type="checkbox" checked={form.is_employed} onChange={(e) => setField("is_employed", e.target.checked)} className="mt-0.5" data-testid="pr-pub-is-employed" />
            <span>I am currently employed — I have uploaded <strong>appointment letter, salary slip and 1-year bank statement</strong> in place of the 3-year marksheet + school bonafide.</span>
        </label>
        <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal border border-mpca-brass/40 bg-mpca-parchment px-3 py-2">
            <input type="checkbox" checked={form.no_recent_studies} onChange={(e) => setField("no_recent_studies", e.target.checked)} className="mt-0.5" data-testid="pr-pub-no-studies" />
            <span>I did not study in the last 3 years — I have uploaded a No-Study affidavit instead of marksheets.</span>
        </label>
    </div>
);

const MpcaFinalApprovalNotice = () => (
    <div className="border-2 border-mpca-oxblood bg-mpca-oxblood/8 px-4 py-3 flex items-start gap-3" data-testid="mpca-final-approval-notice">
        <FileCheck2 size={18} className="text-mpca-oxblood mt-0.5 shrink-0" />
        <div className="text-[12px] text-mpca-oxblood">
            <div className="font-bold uppercase tracking-wide mb-0.5">MPCA holds the power of final approval</div>
            <div className="text-[11px] text-mpca-oxblood/90">AI verification is an assistive check. Your registration is confirmed only after review and sign-off by your Division Secretary and the MPCA Secretariat.</div>
        </div>
    </div>
);

const ConsentBlock = ({ form, setField }) => (
    <div className="border-2 border-mpca-oxblood bg-mpca-parchment px-4 py-4 space-y-3" data-testid="ack-card">
        <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-mpca-oxblood" />
            <div className="font-serif text-lg text-mpca-oxblood">Acknowledgement &amp; Consent</div>
        </div>
        <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal">
            <input type="checkbox" checked={form.dpdp_consent} onChange={(e) => setField("dpdp_consent", e.target.checked)} className="mt-1" data-testid="pr-pub-dpdp" required />
            <span>I acknowledge the DPDP Act, 2023 and consent to MPCA processing my personal data for player registration &amp; selection purposes.</span>
        </label>
        <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal">
            <input type="checkbox" checked={form.consent} onChange={(e) => setField("consent", e.target.checked)} className="mt-1" data-testid="pr-pub-consent" required />
            <span>I certify all information above is true and complete to the best of my knowledge.</span>
        </label>
    </div>
);

// ─────────────────── Field primitives ───────────────────

const Section = ({ title, children, icon: Icon }) => (
    <div>
        <div className="text-[13px] font-serif font-bold text-mpca-oxblood mb-2 pb-1 border-b border-mpca-brass/40 uppercase tracking-wider flex items-center gap-1.5">
            {Icon && <Icon size={13} />} {title}
        </div>
        {children}
    </div>
);
const Grid = ({ children }) => <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
const Field = ({ label, children, required, span = 1 }) => (
    <label className={`block ${span === 2 ? "md:col-span-2" : ""}`}>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1">{label}{required && <span className="text-mpca-oxblood ml-1">*</span>}</div>
        {children}
    </label>
);

const FilledField = ({ label, k, required, type = "text", as, options, placeholder, form, setField, aiSet }) => {
    const aiFilled = aiSet && aiSet.has(k);
    const cls = `input-heritage !py-1.5 !text-xs ${aiFilled ? "!bg-mpca-gold-light/40 !border-mpca-brass" : ""}`;
    return (
        <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1 flex items-center justify-between gap-2">
                <span>{label}{required && <span className="text-mpca-oxblood ml-1">*</span>}</span>
                {aiFilled && <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-widest font-bold text-mpca-brass" data-testid={`ai-filled-${k}`}><Sparkles size={8} /> AI-filled</span>}
            </div>
            {as === "select" ? (
                <select value={form[k]} onChange={(e) => setField(k, e.target.value)} className={cls} data-testid={`pr-pub-${k}`}>
                    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
            ) : (
                <input
                    type={type}
                    required={required}
                    value={form[k] || ""}
                    onChange={(e) => setField(k, e.target.value)}
                    placeholder={placeholder}
                    className={cls}
                    data-testid={`pr-pub-${k}`}
                />
            )}
        </label>
    );
};
