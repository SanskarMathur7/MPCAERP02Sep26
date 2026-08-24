/**
 * Iter 128 · Public Player Correction Page
 * ────────────────────────────────────────
 * Route:   /register/player/correct/:token   (NO auth — anyone with the link)
 *
 * Fetches the correction request via the tokenised endpoint, shows the
 * player their previously-submitted data (read-only) plus the specific
 * fields/documents the reviewer flagged (editable + highlighted). Player
 * submits only the flagged corrections.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { CheckCircle2, Loader2, ShieldAlert, Upload, AlertTriangle } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const publicApi = axios.create({ baseURL: `${BACKEND_URL}/api` });

export default function PublicPlayerCorrection() {
    const { token } = useParams();
    const [state, setState] = useState({ loading: true });
    const [values, setValues] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await publicApi.get(`/public/player-registrations/correction/${token}`);
                setState({ loading: false, data });
                const seed = {};
                (data?.field_flags || []).forEach((f) => {
                    seed[f.key] = data.player_data?.[f.key] ?? "";
                });
                setValues(seed);
            } catch (e) {
                setState({ loading: false, error: e?.response?.data?.detail || "Unable to open this link." });
            }
        })();
    }, [token]);

    const submit = async () => {
        setSubmitting(true);
        setError("");
        try {
            const patch = {};
            for (const [k, v] of Object.entries(values)) {
                if (v !== "" && v !== null && v !== undefined) patch[k] = v;
            }
            await publicApi.post(`/public/player-registrations/correction/${token}/submit`, { patch });
            setDone(true);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to submit. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    if (state.loading) {
        return <FullScreen><Loader2 className="animate-spin text-mpca-brass" size={24} /></FullScreen>;
    }
    if (state.error) {
        return <FullScreen>
            <ShieldAlert size={32} className="text-mpca-oxblood mb-3" />
            <h2 className="font-serif text-xl text-mpca-green-dark mb-2">Cannot open this link</h2>
            <p className="text-[13px] text-mpca-gray-dark max-w-md text-center">{state.error}</p>
        </FullScreen>;
    }
    if (state.data?.already_resubmitted) {
        return <FullScreen>
            <CheckCircle2 size={32} className="text-emerald-600 mb-3" />
            <h2 className="font-serif text-xl text-mpca-green-dark mb-2">Already Submitted</h2>
            <p className="text-[13px] text-mpca-gray-dark max-w-md text-center">Your corrections have been received on {state.data.resubmitted_at?.slice(0, 10)}. The MPCA / Division team is reviewing them.</p>
        </FullScreen>;
    }
    if (done) {
        return <FullScreen>
            <CheckCircle2 size={40} className="text-emerald-600 mb-4" />
            <h2 className="font-serif text-2xl text-mpca-green-dark mb-2">Thank you</h2>
            <p className="text-[13px] text-mpca-gray-dark max-w-md text-center">Your Division will review the changes and notify you again if anything else is needed.</p>
        </FullScreen>;
    }

    const { data } = state;
    const pd = data.player_data || {};
    const fieldFlags = data.field_flags || [];
    const docFlags = data.document_flags || [];
    const expiresOn = data.expires_at?.slice(0, 10);

    return (
        <div className="min-h-screen bg-mpca-parchment py-8">
            <div className="max-w-2xl mx-auto bg-white shadow-lg border border-mpca-brass/25">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-mpca-gold opacity-80">MPCA</div>
                    <h1 className="font-serif text-2xl mt-1">Please correct your registration</h1>
                    <p className="text-[12px] mt-1 opacity-80">Link valid until {expiresOn}</p>
                </div>

                <div className="p-6 space-y-6">
                    <div className="border-l-4 border-mpca-brass bg-mpca-brass/5 p-4 text-[13px]">
                        <div className="overline text-mpca-brass mb-1">Reviewer&apos;s Note</div>
                        <p className="italic">{data.overall_note}</p>
                    </div>

                    {fieldFlags.length > 0 && (
                        <section>
                            <h3 className="overline text-mpca-brass mb-3">Fields to Correct</h3>
                            <div className="space-y-4">
                                {fieldFlags.map((f) => (
                                    <div key={f.key} className="border border-amber-300 bg-amber-50 p-3">
                                        <label className="block text-[12px] font-semibold text-mpca-charcoal mb-1">{f.label}</label>
                                        <p className="text-[11px] italic text-amber-900 mb-2">
                                            <AlertTriangle size={11} className="inline mr-1" />{f.remark}
                                        </p>
                                        <div className="text-[10px] text-mpca-gray-dark mb-1">
                                            Previously submitted: <span className="font-mono">{pd[f.key] === "" || pd[f.key] === null || pd[f.key] === undefined ? "—" : String(pd[f.key])}</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={values[f.key] ?? ""}
                                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                                            placeholder="Corrected value"
                                            className="w-full text-[12px] p-2 border border-amber-400 bg-white"
                                            data-testid={`correct-input-${f.key}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {docFlags.length > 0 && (
                        <section>
                            <h3 className="overline text-mpca-brass mb-3">Documents to Provide</h3>
                            <div className="space-y-3">
                                {docFlags.map((d, i) => (
                                    <DocumentUploadRow
                                        key={`${d.key}-${i}`}
                                        flag={d}
                                        token={token}
                                        currentUrl={d.is_new ? "" : pd[d.key]}
                                        value={values[d.key] || ""}
                                        onChange={(url) => setValues((v) => ({ ...v, [d.is_new ? "other_docs" : d.key]: d.is_new ? [...(v.other_docs || []), { label: d.label, url }] : url }))}
                                    />
                                ))}
                            </div>
                            <p className="text-[10px] italic text-mpca-gray-dark mt-2">
                                Note: document re-uploads are captured in the review notes — the reviewer will attach the files back to your record.
                            </p>
                        </section>
                    )}

                    {error && (
                        <div className="p-3 border border-mpca-oxblood/40 bg-mpca-oxblood/10 text-[12px] text-mpca-oxblood">{error}</div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-mpca-brass/20">
                        <button
                            onClick={submit}
                            disabled={submitting}
                            className="text-[12px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-5 py-2.5 flex items-center gap-2 disabled:opacity-40"
                            data-testid="correction-submit"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Submit Corrections
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const DocumentUploadRow = ({ flag, token, currentUrl, value, onChange }) => {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const handleUpload = async (file) => {
        if (!file) return;
        setUploading(true);
        setUploadError("");
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "player_registration_correction");
            fd.append("registration_token", token);
            const { data } = await publicApi.post("/public/uploads", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            onChange(data.url);
        } catch (e) {
            setUploadError(e?.response?.data?.detail || "Upload failed.");
        } finally {
            setUploading(false);
        }
    };
    return (
        <div className="border border-amber-300 bg-amber-50 p-3">
            <div className="text-[12px] font-semibold text-mpca-charcoal">{flag.label} {flag.is_new && <span className="text-[9px] uppercase tracking-wider ml-1 text-mpca-navy">New</span>}</div>
            <p className="text-[11px] italic text-amber-900 mb-2">
                <AlertTriangle size={11} className="inline mr-1" />{flag.remark}
            </p>
            {currentUrl && (
                <div className="text-[10px] text-mpca-gray-dark mb-2 font-mono truncate">Currently on file: {currentUrl}</div>
            )}
            <label className="inline-flex items-center gap-2 text-[11px] cursor-pointer bg-white border border-amber-400 px-2.5 py-1.5 hover:bg-mpca-parchment">
                <Upload size={11} />
                {value ? "Replace file" : (uploading ? "Uploading…" : "Choose file")}
                <input type="file" className="hidden" disabled={uploading} onChange={(e) => handleUpload(e.target.files?.[0])} data-testid={`correct-doc-${flag.key}-${flag.label.replace(/\s+/g, "_")}`} />
            </label>
            {value && <div className="text-[10px] text-emerald-700 mt-1">Uploaded ✓</div>}
            {uploadError && <div className="text-[10px] text-mpca-oxblood mt-1">{uploadError}</div>}
        </div>
    );
};

const FullScreen = ({ children }) => (
    <div className="min-h-screen bg-mpca-parchment flex flex-col items-center justify-center p-6">
        {children}
    </div>
);
