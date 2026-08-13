import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { UserPlus, Loader2, ShieldCheck, ShieldAlert, CheckCircle2, Upload } from "lucide-react";
import axios from "axios";

/**
 * Sprint M35 · Public Player Registration Form
 * ────────────────────────────────────────────
 * Route:   /register/player/:token   (NO auth — anyone with the link)
 * Resolves either a campaign public_token or a per-player invite token,
 * shows a friendly form pre-filled from the invite when available, and
 * posts to /public/player-registration/submit.
 */
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const public_api = axios.create({ baseURL: `${BACKEND_URL}/api` });

const emptyPlayer = {
    full_name: "", first_name: "", surname: "", father_name: "", dob: "", gender: "M", role: "Batter",
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
    // MPCA-151 · Feb-2026 · Extended fields
    samagra_id_player_url: "", samagra_id_family_url: "",
    consent_form_url: "", no_study_affidavit_url: "", bonafide_school_cert_url: "",
    is_employed: false,
    appointment_letter_url: "", salary_slip_url: "", bank_statement_1yr_url: "",
    last_season_division_code: "", noc_previous_division_url: "",
    place_of_birth_city: "", place_of_birth_state: "",
    bcci_registered: false, bcci_registration_year: "",
    other_docs: [],
};

// M39o · Batch A · Bilingual labels — EN default, HI toggle
const t_dict = {
    title: { en: "Player Registration", hi: "खिलाड़ी पंजीकरण" },
    personal: { en: "Personal Information", hi: "व्यक्तिगत जानकारी" },
    full_name: { en: "Full name", hi: "पूरा नाम" },
    first_name: { en: "First name", hi: "प्रथम नाम" },
    surname: { en: "Surname", hi: "उपनाम" },
    father_name: { en: "Father's name", hi: "पिता का नाम" },
    dob: { en: "Date of birth (DD/MM/YYYY)", hi: "जन्म तिथि (DD/MM/YYYY)" },
    gender: { en: "Gender", hi: "लिंग" },
    role: { en: "Playing role", hi: "खेल भूमिका" },
    mobile: { en: "Mobile", hi: "मोबाइल" },
    email: { en: "Email", hi: "ईमेल" },
    home_div: { en: "Home Division", hi: "मूल संभाग" },
    address: { en: "Current Address", hi: "वर्तमान पता" },
    bank: { en: "Bank Information", hi: "बैंक जानकारी" },
    bank_name: { en: "Bank name", hi: "बैंक का नाम" },
    acct_no: { en: "Account no.", hi: "खाता संख्या" },
    ifsc: { en: "IFSC", hi: "आईएफएससी" },
    aadhaar_no: { en: "Aadhaar no. (unique — one submission per Aadhaar)", hi: "आधार संख्या (एक आधार, एक पंजीकरण)" },
    pan_no: { en: "PAN no. (mandatory for age 18+)", hi: "पैन नंबर (18+ के लिए अनिवार्य)" },
    gst_no: { en: "GST no. (if applicable)", hi: "जीएसटी नंबर (यदि लागू हो)" },
    docs: { en: "Identity & Document Uploads", hi: "पहचान एवं दस्तावेज़ अपलोड" },
    checklist: { en: "Keep these documents ready before you begin", hi: "शुरू करने से पहले ये दस्तावेज़ तैयार रखें" },
    upload_note: { en: "PDF, JPG or PNG · Max 5 MB per file · Min 300 DPI recommended", hi: "पीडीएफ, जेपीजी या पीएनजी · अधिकतम 5 एमबी · न्यूनतम 300 डीपीआई" },
    aadhaar_recent: { en: "Aadhaar card must be recent (issued/updated within last 3 years).", hi: "आधार कार्ड हाल का होना चाहिए (पिछले 3 वर्षों में जारी/अद्यतन)।" },
    ack: { en: "Acknowledgement & Consent", hi: "स्वीकृति एवं सहमति" },
    dpdp: { en: "I acknowledge the DPDP Act, 2023 and consent to MPCA processing my personal data for player registration & selection purposes.", hi: "मैं DPDP अधिनियम 2023 को स्वीकार करता/करती हूँ और MPCA द्वारा खिलाड़ी पंजीकरण एवं चयन हेतु मेरे व्यक्तिगत डेटा के प्रसंस्करण के लिए सहमति देता/देती हूँ।" },
    consent: { en: "I certify all information above is true and complete to the best of my knowledge.", hi: "मैं प्रमाणित करता/करती हूँ कि उपरोक्त सभी जानकारी मेरी जानकारी के अनुसार सत्य एवं पूर्ण है।" },
    no_studies: { en: "I did not study in the last 3 years (upload affidavit below instead of marksheets)", hi: "मैंने पिछले 3 वर्षों में अध्ययन नहीं किया (मार्कशीट के बजाय शपथ पत्र अपलोड करें)" },
    submit: { en: "Submit Registration", hi: "पंजीकरण जमा करें" },
    other_docs: { en: "Other supporting documents", hi: "अन्य सहायक दस्तावेज़" },
    add_doc: { en: "+ Add another document", hi: "+ अन्य दस्तावेज़ जोड़ें" },
};

const PublicPlayerRegistration = () => {
    const { token } = useParams();
    const [env, setEnv] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [form, setForm] = useState(emptyPlayer);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(null);
    const [submitErr, setSubmitErr] = useState("");
    const [uploadingKey, setUploadingKey] = useState(null);
    const [lang, setLang] = useState("en");
    const tr = (k) => (t_dict[k] && t_dict[k][lang]) || k;

    useEffect(() => {
        (async () => {
            try {
                const { data } = await public_api.get(`/public/player-registration/token/${token}`);
                setEnv(data);
                setForm((f) => {
                    const pref = data.prefill?.full_name || "";
                    const parts = pref.trim().split(/\s+/);
                    const first = parts.length >= 2 ? parts.slice(0, -1).join(" ") : (parts[0] || "");
                    const last = parts.length >= 2 ? parts[parts.length - 1] : "";
                    return {
                        ...f,
                        full_name: pref,
                        first_name: first,
                        surname: last,
                        email: data.prefill?.email || "",
                        mobile: data.prefill?.mobile || "",
                    };
                });
            } catch (e) {
                setErr(e?.response?.data?.detail || "Invalid or expired link.");
            } finally { setLoading(false); }
        })();
    }, [token]);

    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const upload = async (key, file) => {
        if (!file) return;
        setUploadingKey(key);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "player_registration");
            const { data } = await public_api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setField(key, data.url);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploadingKey(null); }
    };

    const submit = async (e) => {
        e.preventDefault();
        setSubmitErr("");
        if (!form.consent) return alert("Please tick the consent box before submitting.");
        if (!form.email?.trim()) { setSubmitErr("Email is required."); return; }
        setSubmitting(true);
        try {
            // Feb 2026 · Coerce empty numeric-optional fields to null so Pydantic
            // doesn't reject the submission with an int_parsing 422. Historically
            // `bcci_registration_year` was the culprit — the input is a text-mode
            // number that stays as "" until the user explicitly types a year.
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
            // Pydantic v2 validation errors come back as an array — surface the
            // first field-level message rather than the raw JSON blob.
            if (Array.isArray(msg)) {
                const first = msg[0];
                msg = first?.msg
                    ? `${(first.loc || []).slice(-1)[0] || "field"}: ${first.msg}`
                    : "Some fields are invalid — please review the highlighted fields and try again.";
            }
            setSubmitErr(msg);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        finally { setSubmitting(false); }
    };

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
                <div className="text-[10px] text-mpca-brass mt-4">Please contact your Division secretary for a fresh registration link.</div>
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

    return (
        <div className="min-h-screen bg-mpca-parchment py-10" data-testid="pr-public-form-page">
            <div className="max-w-2xl mx-auto px-4">
                <div className="bulletin-card overflow-hidden">
                    {/* Header */}
                    <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-5 border-b-4 border-mpca-oxblood flex items-center gap-4">
                        <img src="/assets/mpca-logo.png" alt="MPCA"
                             className="w-14 h-16 object-contain bg-white/95 rounded p-1 shrink-0" />
                        <div className="min-w-0">
                            <div className="overline !text-mpca-gold-light">Madhya Pradesh Cricket Association · {env.body_name || env.body_code}</div>
                            <div className="font-serif text-2xl mt-1">{env.campaign_title}</div>
                            <div className="text-[11px] text-mpca-ivory/70 mt-1">Season {env.cycle_code}{env.expires_on ? ` · closes ${env.expires_on}` : ""}</div>
                        </div>
                    </div>

                    <form onSubmit={submit} className="p-6 space-y-4" data-testid="pr-public-form">
                        {submitErr && (
                            <div className="border-2 border-mpca-oxblood bg-mpca-oxblood/10 p-3 text-[11px] text-mpca-oxblood flex items-start gap-2" data-testid="pr-pub-submit-err">
                                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                                <div>{submitErr}</div>
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-2 -mt-2" data-testid="lang-toggle">
                            <button type="button" onClick={() => setLang("en")} className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${lang === "en" ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-brass/40 text-mpca-brass"}`} data-testid="lang-en">EN</button>
                            <button type="button" onClick={() => setLang("hi")} className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${lang === "hi" ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-brass/40 text-mpca-brass"}`} data-testid="lang-hi">हिं</button>
                        </div>

                        {/* M39o · Bold yellow note box · prominent per user's UI ask */}
                        <div className="border-2 border-mpca-brass bg-mpca-gold-light/40 text-mpca-oxblood px-4 py-3 flex items-start gap-3 shadow-sm" data-testid="pr-pub-once-note">
                            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-mpca-oxblood" />
                            <div>
                                <div className="text-[12px] font-bold uppercase tracking-wide">NOTE · Aadhaar-linked unique submission</div>
                                <div className="text-[11px] mt-1 font-semibold">One registration per Aadhaar. Please double-check every detail before submission — it cannot be edited by the player once sent.</div>
                            </div>
                        </div>

                        {/* M39o · Pre-start checklist */}
                        <div className="border-2 border-mpca-brass/60 bg-mpca-gold-light/25 px-4 py-3" data-testid="pr-pub-checklist">
                            <div className="text-[11px] font-bold text-mpca-oxblood uppercase tracking-wide mb-2">{tr("checklist")}</div>
                            <ul className="text-[11px] text-mpca-charcoal grid grid-cols-2 gap-x-3 gap-y-0.5 list-disc pl-5">
                                <li>Passport-size photo</li>
                                <li>Aadhaar (unmasked)</li>
                                <li>Aadhaar update history</li>
                                <li>PAN (required if 18+)</li>
                                <li>Cancelled cheque</li>
                                <li>Current address proof</li>
                                <li>Birth certificate (with QR)</li>
                                <li>Marksheets — last 3 years (single PDF)</li>
                                <li>Bank passbook / cheque</li>
                                <li>Passport / DL / Voter ID (any one alt)</li>
                            </ul>
                            <div className="text-[10px] text-mpca-brass mt-2 italic">{tr("upload_note")}</div>
                        </div>

                        <Section title={tr("personal")}>
                            <Grid>
                                <Field label={tr("first_name")} required>
                                    <input
                                        required
                                        value={form.first_name}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setForm((f) => ({ ...f, first_name: v, full_name: `${v} ${f.surname || ""}`.trim() }));
                                        }}
                                        className="input-heritage !py-1.5 !text-xs"
                                        data-testid="pr-pub-first-name"
                                    />
                                </Field>
                                <Field label={tr("surname")} required>
                                    <input
                                        required
                                        value={form.surname}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setForm((f) => ({ ...f, surname: v, full_name: `${f.first_name || ""} ${v}`.trim() }));
                                        }}
                                        className="input-heritage !py-1.5 !text-xs"
                                        data-testid="pr-pub-surname"
                                    />
                                </Field>
                                <Field label={tr("father_name")} required><input required value={form.father_name} onChange={(e) => setField("father_name", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-father-name" /></Field>
                                <Field label={tr("dob")} required><input required type="date" value={form.dob} onChange={(e) => setField("dob", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-dob" />
                                    {form.dob && <div className="text-[9px] text-mpca-brass mt-1 font-mono">{form.dob.split("-").reverse().join("/")}</div>}
                                </Field>
                                <Field label={tr("gender")} required>
                                    <select value={form.gender} onChange={(e) => setField("gender", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-gender">
                                        <option value="M">Male</option><option value="F">Female</option><option value="Other">Other</option>
                                    </select>
                                </Field>
                                <Field label="Category">
                                    <select value={form.category} onChange={(e) => setField("category", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-category">
                                        <option value="Local_MP">Local MP</option><option value="Guest">Guest</option><option value="Foreign">Foreign</option>
                                    </select>
                                </Field>
                            </Grid>
                        </Section>

                        <Section title="Cricket Profile">
                            <Grid>
                                <Field label={tr("role")} required>
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
                                        {["None", "Right_Arm_Fast", "Right_Arm_Off_Spin", "Right_Arm_Leg_Spin", "Left_Arm_Fast", "Left_Arm_Orthodox", "Left_Arm_Chinaman"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                                    </select>
                                </Field>
                            </Grid>
                        </Section>

                        <Section title="Contact">
                            <Grid>
                                <Field label={tr("mobile")} required><input required value={form.mobile} onChange={(e) => setField("mobile", e.target.value)} placeholder="10-digit mobile" className="input-heritage font-mono !py-1.5 !text-xs" data-testid="pr-pub-mobile" /></Field>
                                <Field label={tr("email")} required><input required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="you@example.com" className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-email" /></Field>
                                <Field label={tr("home_div")} required>
                                    <select
                                        required
                                        value={form.preferred_division_code}
                                        onChange={(e) => setField("preferred_division_code", e.target.value)}
                                        className="input-heritage !py-1.5 !text-xs"
                                        data-testid="pr-pub-home-division"
                                    >
                                        <option value="">— Select your Home Division —</option>
                                        {(env?.divisions || []).map((d) => (
                                            <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Guardian name (if under 18)"><input value={form.guardian_name} onChange={(e) => setField("guardian_name", e.target.value)} className="input-heritage !py-1.5 !text-xs" /></Field>
                                <Field label={tr("aadhaar_no")}><input value={form.aadhaar_no} onChange={(e) => setField("aadhaar_no", e.target.value)} placeholder="12-digit" className="input-heritage font-mono !py-1.5 !text-xs" data-testid="pr-pub-aadhaar-no" /></Field>
                                <Field label={tr("pan_no")}><input value={form.pan_no} onChange={(e) => setField("pan_no", e.target.value)} placeholder="ABCDE1234F" className="input-heritage font-mono !py-1.5 !text-xs" data-testid="pr-pub-pan-no" /></Field>
                                <Field label={tr("gst_no")}><input value={form.gst_no} onChange={(e) => setField("gst_no", e.target.value)} placeholder="15-char GSTIN" className="input-heritage font-mono !py-1.5 !text-xs" data-testid="pr-pub-gst-no" /></Field>
                                <Field label={tr("address")} span={2}><textarea rows={2} value={form.address} onChange={(e) => setField("address", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-address" /></Field>
                            </Grid>
                        </Section>

                        {/* MPCA-151 · Feb 2026 · Place of birth + cross-division audit + BCCI history */}
                        <Section title="Place of Birth · Cross-Division · BCCI">
                            <Grid>
                                <Field label="Place of birth · City"><input value={form.place_of_birth_city} onChange={(e) => setField("place_of_birth_city", e.target.value)} placeholder="e.g. Indore" className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-pob-city" /></Field>
                                <Field label="Place of birth · State"><input value={form.place_of_birth_state} onChange={(e) => setField("place_of_birth_state", e.target.value)} placeholder="e.g. Madhya Pradesh" className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-pob-state" /></Field>
                                <Field label="Division played from LAST season">
                                    <select value={form.last_season_division_code} onChange={(e) => setField("last_season_division_code", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-last-season-div">
                                        <option value="">— None / new to cricket —</option>
                                        {(env?.divisions || []).map((d) => (
                                            <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="BCCI Registered?">
                                    <select value={form.bcci_registered ? "Yes" : "No"} onChange={(e) => setField("bcci_registered", e.target.value === "Yes")} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-bcci-registered">
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </Field>
                                {form.bcci_registered && (
                                    <Field label="BCCI Registration Year" required>
                                        <input required type="number" min="1990" max="2100" value={form.bcci_registration_year} onChange={(e) => setField("bcci_registration_year", e.target.value)} placeholder="e.g. 2021" className="input-heritage font-mono !py-1.5 !text-xs" data-testid="pr-pub-bcci-year" />
                                    </Field>
                                )}
                            </Grid>
                        </Section>

                        {/* MPCA-151 · Employment toggle (alternative to marksheets) */}
                        <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal border border-mpca-brass/40 bg-mpca-parchment px-3 py-2" data-testid="is-employed-row">
                            <input type="checkbox" checked={form.is_employed} onChange={(e) => setField("is_employed", e.target.checked)} className="mt-0.5" data-testid="pr-pub-is-employed" />
                            <span>I am currently employed — I will upload <strong>appointment letter, salary slip and 1-year bank statement</strong> in place of the 3-year marksheet + school bonafide.</span>
                        </label>

                        <Section title={tr("bank")}>
                            <Grid>
                                <Field label={tr("bank_name")}><input value={form.bank_name} onChange={(e) => setField("bank_name", e.target.value)} placeholder="e.g. HDFC Bank" className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-bank-name" /></Field>
                                <Field label={tr("acct_no")}><input value={form.bank_account_no} onChange={(e) => setField("bank_account_no", e.target.value)} className="input-heritage font-mono !py-1.5 !text-xs" /></Field>
                                <Field label={tr("ifsc")}><input value={form.bank_ifsc} onChange={(e) => setField("bank_ifsc", e.target.value)} placeholder="e.g. HDFC0001234" className="input-heritage font-mono !py-1.5 !text-xs" /></Field>
                            </Grid>
                        </Section>

                        {/* M39o · U23 · no-recent-studies toggle switches marksheets ↔ affidavit */}
                        <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal border border-mpca-brass/40 bg-mpca-parchment px-3 py-2" data-testid="no-recent-studies-row">
                            <input type="checkbox" checked={form.no_recent_studies} onChange={(e) => setField("no_recent_studies", e.target.checked)} className="mt-0.5" data-testid="pr-pub-no-studies" />
                            <span>{tr("no_studies")}</span>
                        </label>

                        <Section title={tr("docs")}>
                            <div className="border-2 border-mpca-brass/70 bg-mpca-gold-light/30 px-3 py-2 mb-3 text-[11px] font-semibold text-mpca-oxblood" data-testid="aadhaar-recent-note">
                                ⚠ {tr("aadhaar_recent")}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    ["photo_url", "Passport photo *"],
                                    ["aadhaar_url", "Aadhaar (Unmasked) *"],
                                    ["aadhaar_history_url", "Aadhaar update history"],
                                    ["pan_url", "PAN Card (required if 18+)"],
                                    ["passport_url", "Passport"],
                                    ["driving_licence_url", "Driving Licence"],
                                    ["voter_id_url", "Voter ID"],
                                    ["birth_cert_url", "Birth Certificate * (with QR)"],
                                    ["address_proof_url", "Current Address Proof *"],
                                    // MPCA-151 · New required docs
                                    ["samagra_id_player_url", "Samagra ID · Player *"],
                                    ["samagra_id_family_url", "Samagra ID · Family *"],
                                    ["consent_form_url", "Consent Form (Notarized) *", { template: "/api/uploads/consent_form_template.pdf" }],
                                    ...(form.no_recent_studies
                                        ? [["no_study_affidavit_url", "No-Study Affidavit *", { template: "/api/uploads/no_study_affidavit_template.pdf" }]]
                                        : []),
                                    ["cancelled_cheque_url", "Cancelled Cheque"],
                                    // Employment path vs Marksheet + Bonafide path
                                    ...(form.is_employed
                                        ? [
                                            ["appointment_letter_url", "Appointment Letter *"],
                                            ["salary_slip_url", "Latest Salary Slip *"],
                                            ["bank_statement_1yr_url", "1-Year Bank Statement (PDF) *"],
                                        ]
                                        : [
                                            ["marksheet_3yr_url", "Marksheets · last 3 yrs (single PDF) *"],
                                            ["bonafide_school_cert_url", "School Bonafide Certificate *"],
                                        ]),
                                    // NOC only if last-season division differs from current
                                    ...(form.last_season_division_code && form.last_season_division_code !== form.preferred_division_code
                                        ? [["noc_previous_division_url", `NOC from ${form.last_season_division_code} (Previous Division) *`]]
                                        : []),
                                    ...(form.gst_no ? [["gst_certificate_url", "GST Certificate"]] : []),
                                ].map(([key, label, extra]) => (
                                    <div key={key} className="border border-mpca-brass/30 bg-mpca-parchment p-3">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark">{label}</div>
                                            {extra?.template && (
                                                <a href={extra.template} target="_blank" rel="noreferrer" className="text-[9px] uppercase tracking-widest text-mpca-brass hover:underline" data-testid={`pr-pub-template-${key}`}>
                                                    Sample →
                                                </a>
                                            )}
                                        </div>
                                        {form[key] ? (
                                            <div className="flex items-center justify-between text-[11px]"><a href={form[key]} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline truncate">Uploaded ✓</a><button type="button" onClick={() => setField(key, "")} className="text-[9px] uppercase text-mpca-brass">Remove</button></div>
                                        ) : (
                                            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                                                <Upload size={11} className="text-mpca-brass" />
                                                <input type="file" accept="image/*,application/pdf" onChange={(e) => upload(key, e.target.files?.[0])} className="text-[11px]" data-testid={`pr-pub-upload-${key}`} />
                                                {uploadingKey === key && <Loader2 size={11} className="animate-spin" />}
                                            </label>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {/* Other Documents · multi-upload */}
                            <div className="mt-3 border border-dashed border-mpca-brass/50 p-3" data-testid="other-docs-block">
                                <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-2">{tr("other_docs")}</div>
                                {(form.other_docs || []).map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[11px] mb-1">
                                        <span className="flex-1 truncate">{d.label}</span>
                                        <a href={d.url} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline">✓</a>
                                        <button type="button" onClick={() => setField("other_docs", form.other_docs.filter((_, x) => x !== i))} className="text-[9px] uppercase text-mpca-brass">Remove</button>
                                    </div>
                                ))}
                                <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                                    <Upload size={11} className="text-mpca-brass" />
                                    <input type="file" accept="image/*,application/pdf" onChange={async (e) => {
                                        const file = e.target.files?.[0]; if (!file) return;
                                        const label = window.prompt("Label this document (e.g. Domicile certificate)");
                                        if (!label) return;
                                        setUploadingKey("__other__");
                                        try {
                                            const fd = new FormData();
                                            fd.append("file", file); fd.append("related_type", "player_registration_public"); fd.append("body_id", env.body_code); fd.append("uploaded_by", form.full_name || "public");
                                            const { data } = await public_api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
                                            setField("other_docs", [...(form.other_docs || []), { label, url: data.url }]);
                                        } catch (err) { alert(err?.response?.data?.detail || err.message); }
                                        finally { setUploadingKey(""); }
                                    }} data-testid="pr-pub-upload-other" />
                                    {uploadingKey === "__other__" && <Loader2 size={11} className="animate-spin" />}
                                    <span className="text-mpca-brass italic">{tr("add_doc")}</span>
                                </label>
                            </div>
                        </Section>

                        {/* M39o · Rich Acknowledgement card */}
                        <div className="border-2 border-mpca-oxblood bg-mpca-parchment px-4 py-4 space-y-3" data-testid="ack-card">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={16} className="text-mpca-oxblood" />
                                <div className="font-serif text-lg text-mpca-oxblood">{tr("ack")}</div>
                            </div>
                            <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal" data-testid="pr-pub-dpdp-row">
                                <input type="checkbox" checked={form.dpdp_consent} onChange={(e) => setField("dpdp_consent", e.target.checked)} className="mt-1" data-testid="pr-pub-dpdp" required />
                                <span>{tr("dpdp")}</span>
                            </label>
                            <label className="flex items-start gap-2 text-[11px] text-mpca-charcoal" data-testid="pr-pub-consent-row">
                                <input type="checkbox" checked={form.consent} onChange={(e) => setField("consent", e.target.checked)} className="mt-1" data-testid="pr-pub-consent" required />
                                <span>{tr("consent")}</span>
                            </label>
                        </div>

                        <button type="submit" disabled={submitting || !form.consent || !form.dpdp_consent} className="w-full bg-mpca-oxblood text-mpca-ivory text-sm uppercase tracking-widest py-3 flex items-center justify-center gap-2 disabled:opacity-40 border-2 border-mpca-oxblood hover:bg-mpca-burgundy-dark transition-colors" data-testid="pr-pub-submit-btn">
                            {submitting ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} {tr("submit")}
                        </button>
                    </form>
                </div>
                <div className="text-[10px] text-mpca-gray-dark text-center mt-4 flex items-center justify-center gap-1">
                    <UserPlus size={10} /> Powered by MPCA ERP · {env.body_name || env.body_code}
                </div>
            </div>
        </div>
    );
};

const Section = ({ title, children }) => (
    <div>
        <div className="text-[13px] font-serif font-bold text-mpca-oxblood mb-2 pb-1 border-b border-mpca-brass/40 uppercase tracking-wider">{title}</div>
        {children}
    </div>
);
const Grid = ({ children }) => <div className="grid grid-cols-2 gap-3">{children}</div>;
const Field = ({ label, children, required, span = 1 }) => (
    <label className={`block ${span === 2 ? "col-span-2" : ""}`}>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1">{label}{required && <span className="text-mpca-oxblood ml-1">*</span>}</div>
        {children}
    </label>
);

export default PublicPlayerRegistration;
