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
    full_name: "", dob: "", gender: "M", role: "Batter",
    batting_style: "Right_Hand", bowling_style: "None",
    mobile: "", email: "", home_district_code: "", category: "Local_MP",
    guardian_name: "", address: "", aadhaar_no: "",
    consent: false, photo_url: "", aadhaar_url: "",
    bank_account_no: "", bank_ifsc: "",
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
            const { data } = await public_api.post("/public/player-registration/submit", { token, player: form });
            setDone(data);
        } catch (e) {
            const msg = e?.response?.data?.detail || e.message;
            setSubmitErr(msg);
            // scroll to top so the user sees the banner
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
                    <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-5 border-b-4 border-mpca-oxblood">
                        <div className="overline !text-mpca-gold-light">Madhya Pradesh Cricket Association · {env.body_name || env.body_code}</div>
                        <div className="font-serif text-2xl mt-1">{env.campaign_title}</div>
                        <div className="text-[11px] text-mpca-ivory/70 mt-1">Season {env.cycle_code}{env.expires_on ? ` · closes ${env.expires_on}` : ""}</div>
                    </div>

                    <form onSubmit={submit} className="p-6 space-y-4" data-testid="pr-public-form">
                        {submitErr && (
                            <div className="border-2 border-mpca-oxblood bg-mpca-oxblood/10 p-3 text-[11px] text-mpca-oxblood flex items-start gap-2" data-testid="pr-pub-submit-err">
                                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                                <div>{submitErr}</div>
                            </div>
                        )}
                        <div className="text-[10px] text-mpca-brass uppercase tracking-widest bg-mpca-gold-light/20 border border-mpca-brass/40 px-3 py-2" data-testid="pr-pub-once-note">
                            Note · One registration per email on this link. Please double-check your email before submitting.
                        </div>
                        <Section title="Personal Details">
                            <Grid>
                                <Field label="Full name" required><input required value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-name" /></Field>
                                <Field label="Date of birth" required><input required type="date" value={form.dob} onChange={(e) => setField("dob", e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-dob" /></Field>
                                <Field label="Gender" required>
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
                                <Field label="Role" required>
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
                                        {["None", "Right_Arm_Fast", "Right_Arm_Medium", "Right_Arm_Off_Spin", "Right_Arm_Leg_Spin", "Left_Arm_Fast", "Left_Arm_Medium", "Left_Arm_Orthodox", "Left_Arm_Chinaman"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                                    </select>
                                </Field>
                                <Field label="Home district (code)">
                                    <input value={form.home_district_code} onChange={(e) => setField("home_district_code", e.target.value)} placeholder="e.g. DIST-IND" className="input-heritage font-mono !py-1.5 !text-xs" />
                                </Field>
                            </Grid>
                        </Section>

                        <Section title="Contact">
                            <Grid>
                                <Field label="Mobile" required><input required value={form.mobile} onChange={(e) => setField("mobile", e.target.value)} placeholder="10-digit mobile" className="input-heritage font-mono !py-1.5 !text-xs" data-testid="pr-pub-mobile" /></Field>
                                <Field label="Email" required><input required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="you@example.com" className="input-heritage !py-1.5 !text-xs" data-testid="pr-pub-email" /></Field>
                                <Field label="Guardian name (if under 18)"><input value={form.guardian_name} onChange={(e) => setField("guardian_name", e.target.value)} className="input-heritage !py-1.5 !text-xs" /></Field>
                                <Field label="Aadhaar no."><input value={form.aadhaar_no} onChange={(e) => setField("aadhaar_no", e.target.value)} placeholder="12-digit" className="input-heritage font-mono !py-1.5 !text-xs" /></Field>
                                <Field label="Address" span={2}><textarea rows={2} value={form.address} onChange={(e) => setField("address", e.target.value)} className="input-heritage !py-1.5 !text-xs" /></Field>
                            </Grid>
                        </Section>

                        <Section title="Attachments">
                            <div className="grid grid-cols-2 gap-3">
                                {[["photo_url", "Passport photo"], ["aadhaar_url", "Aadhaar card"], ["address_proof_url", "Address proof"], ["birth_cert_url", "Birth certificate (if under 18)"]].map(([key, label]) => (
                                    <div key={key} className="border border-mpca-brass/30 bg-mpca-parchment p-3">
                                        <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-1">{label}</div>
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
                        </Section>

                        <Section title="Bank details (optional — needed later for DA/reimbursements)">
                            <Grid>
                                <Field label="Account no."><input value={form.bank_account_no} onChange={(e) => setField("bank_account_no", e.target.value)} className="input-heritage font-mono !py-1.5 !text-xs" /></Field>
                                <Field label="IFSC"><input value={form.bank_ifsc} onChange={(e) => setField("bank_ifsc", e.target.value)} placeholder="e.g. HDFC0001234" className="input-heritage font-mono !py-1.5 !text-xs" /></Field>
                            </Grid>
                        </Section>

                        <label className="flex items-start gap-2 text-[11px] text-mpca-gray-dark" data-testid="pr-pub-consent-row">
                            <input type="checkbox" checked={form.consent} onChange={(e) => setField("consent", e.target.checked)} className="mt-1" data-testid="pr-pub-consent" />
                            <span>I confirm that the information above is true to the best of my knowledge. I authorise MPCA and its bodies to verify and store this data for the {env.cycle_code} season.</span>
                        </label>

                        <button type="submit" disabled={submitting || !form.consent} className="w-full bg-mpca-oxblood text-mpca-ivory text-sm uppercase tracking-widest py-3 flex items-center justify-center gap-2 disabled:opacity-40 border-2 border-mpca-oxblood hover:bg-mpca-burgundy-dark transition-colors" data-testid="pr-pub-submit-btn">
                            {submitting ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Submit Registration
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
        <div className="overline mb-2">{title}</div>
        {children}
    </div>
);
const Grid = ({ children }) => <div className="grid grid-cols-2 gap-3">{children}</div>;
const Field = ({ label, children, required, span = 1 }) => (
    <label className={`block ${span === 2 ? "col-span-2" : ""}`}>
        <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-1">{label}{required && <span className="text-mpca-oxblood ml-1">*</span>}</div>
        {children}
    </label>
);

export default PublicPlayerRegistration;
