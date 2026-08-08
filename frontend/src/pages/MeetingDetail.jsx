import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchMeeting, fetchResolutions, addResolution, updateMeeting } from "@/lib/api";
import { api, API_BASE } from "@/lib/api";
import { ArrowLeft, Calendar, MapPin, Clock, Users, CheckCircle2, XCircle, Plus, Gavel, Upload, Sparkles, FileText, RefreshCw, Loader2, Paperclip } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import DocumentPreview from "@/components/DocumentPreview";

const STATUS_PILL = {
    Scheduled: "pill-pending",
    Notice_Issued: "pill-pending",
    In_Progress: "pill-active",
    Concluded: "pill-lapsed",
    Cancelled: "pill-suspended",
};

const NewResolution = ({ meetingId, onAdded }) => {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [proposedBy, setProposedBy] = useState("");
    const [secondedBy, setSecondedBy] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await addResolution(meetingId, {
                meeting_id: meetingId,
                number: 0, // overwritten server-side later if needed; or rely on order
                title,
                text,
                proposed_by: proposedBy,
                seconded_by: secondedBy,
            });
            setTitle("");
            setText("");
            setProposedBy("");
            setSecondedBy("");
            setOpen(false);
            onAdded();
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="btn-heritage-secondary" data-testid="open-resolution-form">
                <Plus size={14} strokeWidth={1.5} /> Record Resolution
            </button>
        );
    }
    return (
        <form onSubmit={submit} className="bulletin-card p-6 space-y-4 bg-mpca-parchment/50" data-testid="resolution-form">
            <div className="overline">New Resolution</div>
            <div>
                <label className="label-heritage">Title *</label>
                <input className="input-heritage" required value={title} onChange={(e) => setTitle(e.target.value)} data-testid="res-title" />
            </div>
            <div>
                <label className="label-heritage">Text *</label>
                <textarea className="input-heritage" rows={3} required value={text} onChange={(e) => setText(e.target.value)} data-testid="res-text" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="label-heritage">Proposed By</label>
                    <input className="input-heritage" value={proposedBy} onChange={(e) => setProposedBy(e.target.value)} data-testid="res-proposed" />
                </div>
                <div>
                    <label className="label-heritage">Seconded By</label>
                    <input className="input-heritage" value={secondedBy} onChange={(e) => setSecondedBy(e.target.value)} data-testid="res-seconded" />
                </div>
            </div>
            <div className="flex justify-end gap-3">
                <button type="button" className="btn-heritage-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-heritage-primary" data-testid="res-submit">
                    {saving ? "Recording…" : "Record"}
                </button>
            </div>
        </form>
    );
};

const SignedMinutesPanel = ({ meeting, onReload }) => {
    const { persona } = useAuth();
    const isMPCA = persona?.body_type === "State";
    const [uploading, setUploading] = useState(false);
    const [running, setRunning] = useState(false);
    const fileRef = useRef(null);

    const upload = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("body_id", persona?.body_code || "MPCA");
            form.append("uploaded_by", persona?.name || "MPCA");
            form.append("related_type", "meeting_minutes");
            form.append("related_id", meeting.id);
            const { data: rec } = await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
            await api.post(`/meetings/${meeting.id}/signed-minutes`, {
                signed_minutes_url: rec.url,
                uploaded_by: persona?.name,
            });
            // Auto-run AI summary
            setRunning(true);
            await api.post(`/meetings/${meeting.id}/ai-summary`);
            await onReload();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setUploading(false); setRunning(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const rerunAI = async () => {
        setRunning(true);
        try {
            await api.post(`/meetings/${meeting.id}/ai-summary`);
            await onReload();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setRunning(false); }
    };

    const status = meeting.ai_summary_status;
    return (
        <section className="mb-12" data-testid="signed-minutes-section">
            <div className="flex items-end justify-between mb-4 flex-wrap gap-4">
                <div>
                    <div className="overline mb-2">Signed Minutes · AI Summariser</div>
                    <h2 className="font-serif text-3xl text-mpca-green-dark">Upload signed minutes for AI summary</h2>
                </div>
                {isMPCA && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => fileRef.current?.click()} disabled={uploading || running} className="btn-heritage-primary disabled:opacity-60" data-testid="upload-signed-minutes-btn">
                            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            {meeting.signed_minutes_url ? "Re-upload Signed Minutes" : "Upload Signed Minutes"}
                        </button>
                        {meeting.signed_minutes_url && (
                            <button onClick={rerunAI} disabled={running || uploading} className="btn-heritage-secondary disabled:opacity-60" data-testid="rerun-ai-summary-btn" title="Re-run AI summary">
                                {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-run AI
                            </button>
                        )}
                        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="signed-minutes-input" />
                    </div>
                )}
            </div>
            {!meeting.signed_minutes_url ? (
                <div className="bulletin-card p-6 text-sm text-mpca-gray-dark italic">
                    {isMPCA
                        ? "Upload the signed minutes PDF (or image). Gemini will read it and drop each identified resolution into the register below — no manual re-entry needed."
                        : "MPCA has not yet uploaded signed minutes for this meeting."}
                </div>
            ) : (
                <div className="bulletin-card p-6 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <a href={`${API_BASE.replace(/\/api$/, "")}${meeting.signed_minutes_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-mpca-oxblood hover:underline text-sm" data-testid="view-signed-minutes">
                            <FileText size={14} /> View Signed Minutes
                        </a>
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                            {status === "Pending" && <span className="text-mpca-brass inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> AI running…</span>}
                            {status === "Completed" && <span className="text-emerald-700 inline-flex items-center gap-1"><Sparkles size={10} /> AI summary complete</span>}
                            {status === "Failed" && <span className="text-mpca-oxblood inline-flex items-center gap-1"><XCircle size={10} /> AI failed — retry</span>}
                        </div>
                    </div>
                    {meeting.ai_summary_text && (
                        <div className="text-sm text-mpca-charcoal leading-relaxed border-l-2 border-mpca-brass/40 pl-4 italic" data-testid="ai-summary-text">
                            {meeting.ai_summary_text}
                        </div>
                    )}
                    {meeting.signed_minutes_uploaded_at && (
                        <div className="text-[10px] text-mpca-brass/80 uppercase tracking-widest">
                            Uploaded {new Date(meeting.signed_minutes_uploaded_at).toLocaleString("en-IN")} by {meeting.signed_minutes_uploaded_by || "MPCA"}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};


const MeetingDetail = () => {
    const { id } = useParams();
    const [meeting, setMeeting] = useState(null);
    const [resolutions, setResolutions] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        const [m, r] = await Promise.all([fetchMeeting(id), fetchResolutions(id)]);
        setMeeting(m);
        setResolutions(r);
    };

    useEffect(() => {
        (async () => {
            try {
                await load();
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const advanceStatus = async (status) => {
        const updated = await updateMeeting(id, { ...meeting, status });
        setMeeting(updated);
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Fetching proceedings…" /></div>;
    if (!meeting) return <div className="p-16 text-center font-serif text-2xl">Meeting not found.</div>;

    const quorumMet = meeting.quorum_present >= meeting.quorum_required && meeting.quorum_required > 0;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="meeting-detail-page">
            <Link to="/meetings" className="btn-heritage-ghost mb-6 inline-flex" data-testid="meeting-back">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Proceedings
            </Link>

            <div className="border border-mpca-brass/40 p-10 mb-10 bg-gradient-to-br from-mpca-ivory to-mpca-parchment" data-testid="meeting-header">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <div className="font-mono text-[11px] text-mpca-brass tracking-widest">{meeting.meeting_no}</div>
                        <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-2 leading-tight">
                            {meeting.title}
                        </h1>
                        <div className="overline mt-3">{meeting.meeting_type.replace(/_/g, " ")}</div>
                    </div>
                    <span className={`pill ${STATUS_PILL[meeting.status] || "pill-pending"}`}>
                        {meeting.status.replace(/_/g, " ")}
                    </span>
                </div>

                <div className="grid md:grid-cols-3 gap-6 mt-8 pt-6 border-t border-mpca-brass/20">
                    <div>
                        <div className="overline">Schedule</div>
                        <div className="mt-2 flex items-center gap-2 text-mpca-charcoal">
                            <Calendar size={14} className="text-mpca-brass" strokeWidth={1.5} />
                            {new Date(meeting.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                        {meeting.scheduled_time && (
                            <div className="mt-1 flex items-center gap-2 text-mpca-charcoal">
                                <Clock size={14} className="text-mpca-brass" strokeWidth={1.5} />
                                {meeting.scheduled_time}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="overline">Venue</div>
                        <div className="mt-2 flex items-start gap-2 text-mpca-charcoal">
                            <MapPin size={14} className="text-mpca-brass mt-1" strokeWidth={1.5} />
                            {meeting.venue}
                        </div>
                    </div>
                    <div>
                        <div className="overline">Convened By</div>
                        <div className="mt-2 text-mpca-charcoal">{meeting.convened_by || "—"}</div>
                        <div className="overline mt-3">Chairperson</div>
                        <div className="mt-1 text-mpca-charcoal">{meeting.chairperson || "—"}</div>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-mpca-brass/20 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2" data-testid="quorum-info">
                        <Users size={16} className={quorumMet ? "text-mpca-green-dark" : "text-mpca-oxblood"} strokeWidth={1.5} />
                        <span className="text-sm text-mpca-charcoal">
                            Quorum:{" "}
                            <span className="font-mono">
                                {meeting.quorum_present}/{meeting.quorum_required}
                            </span>{" "}
                            {meeting.quorum_required > 0 &&
                                (quorumMet ? (
                                    <span className="text-mpca-green-dark font-medium">· Met</span>
                                ) : (
                                    <span className="text-mpca-oxblood font-medium">· Not Met</span>
                                ))}
                        </span>
                    </div>

                    <div className="flex-1" />

                    {meeting.status === "Scheduled" && (
                        <button onClick={() => advanceStatus("Notice_Issued")} className="btn-heritage-secondary" data-testid="issue-notice-btn">
                            Issue Notice
                        </button>
                    )}
                    {meeting.status === "Notice_Issued" && (
                        <button onClick={() => advanceStatus("In_Progress")} className="btn-heritage-secondary" data-testid="commence-btn">
                            Commence Meeting
                        </button>
                    )}
                    {meeting.status === "In_Progress" && (
                        <button onClick={() => advanceStatus("Concluded")} className="btn-heritage-primary" data-testid="conclude-btn">
                            Conclude Meeting
                        </button>
                    )}
                </div>
            </div>

            {/* MPCA-114/129 · Meeting Documents with inline preview */}
            {(meeting.documents || []).length > 0 && (
                <section className="mb-12" data-testid="documents-section">
                    <div className="overline mb-2">Attachments</div>
                    <h2 className="font-serif text-3xl text-mpca-green-dark mb-6">Meeting Documents</h2>
                    <div className="bulletin-card p-4 space-y-2">
                        {meeting.documents.map((d, i) => (
                            <div key={i} className="flex items-center gap-3 border-l-4 border-mpca-brass bg-mpca-parchment/40 px-3 py-2" data-testid={`meeting-doc-${i}`}>
                                <Paperclip size={12} className="text-mpca-oxblood shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-serif text-sm text-mpca-green-dark truncate">{d.name}</div>
                                    {d.uploaded_at && <div className="text-[10px] text-mpca-gray-dark">Uploaded {String(d.uploaded_at).slice(0, 10)}{d.uploaded_by ? ` · by ${d.uploaded_by}` : ""}</div>}
                                </div>
                                <DocumentPreview url={d.url} name={d.name} triggerLabel="Preview" />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Agenda */}
            <section className="mb-12">
                <div className="overline mb-2">Agenda</div>
                <h2 className="font-serif text-3xl text-mpca-green-dark mb-6">Order of Business</h2>
                <div className="bulletin-card divide-y divide-mpca-brass/15">
                    {meeting.agenda.length === 0 ? (
                        <div className="px-8 py-10 text-center text-mpca-gray-dark italic font-serif">
                            No agenda items recorded.
                        </div>
                    ) : (
                        meeting.agenda.map((item) => (
                            <div key={item.number} className="px-7 py-5 flex gap-5 items-start" data-testid={`agenda-${item.number}`}>
                                <div className="font-serif text-3xl text-mpca-brass leading-none w-10 flex-shrink-0">
                                    {item.number}.
                                </div>
                                <div className="flex-1">
                                    <div className="font-serif text-xl text-mpca-green-dark leading-tight">
                                        {item.title}
                                    </div>
                                    {item.description && (
                                        <div className="text-sm text-mpca-charcoal mt-1 italic">
                                            {item.description}
                                        </div>
                                    )}
                                    {item.decided && item.decision && (
                                        <div className="mt-3 flex items-start gap-2 text-sm text-mpca-green-dark">
                                            <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                                            <span><span className="overline !text-[9px] mr-2">Decision</span>{item.decision}</span>
                                        </div>
                                    )}
                                </div>
                                <span className={`pill ${item.decided ? "pill-active" : "pill-pending"}`}>
                                    {item.decided ? "Decided" : "Pending"}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </section>

            {/* M39f · Signed Minutes AI Summary */}
            <SignedMinutesPanel meeting={meeting} onReload={load} />

            {/* Resolutions */}
            <section className="mb-12" data-testid="resolutions-section">
                <div className="flex items-end justify-between mb-6">
                    <div>
                        <div className="overline mb-2">Resolutions</div>
                        <h2 className="font-serif text-3xl text-mpca-green-dark">Recorded Resolutions</h2>
                    </div>
                    <NewResolution meetingId={meeting.id} onAdded={load} />
                </div>

                {resolutions.length === 0 ? (
                    <div className="bulletin-card px-8 py-12 text-center text-mpca-gray-dark italic font-serif">
                        No resolutions recorded yet.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {resolutions.map((r, idx) => (
                            <div key={r.id} className="bulletin-card p-7" data-testid={`resolution-${r.id}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <Gavel className="text-mpca-brass mt-1" size={18} strokeWidth={1.5} />
                                        <div>
                                            <div className="overline flex items-center gap-1.5">Resolution № {idx + 1}
                                                {r.ai_generated && <span className="inline-flex items-center gap-0.5 text-[8px] uppercase tracking-widest bg-mpca-brass/15 text-mpca-brass px-1 py-0.5" title="Auto-generated from signed minutes"><Sparkles size={8} /> AI</span>}
                                            </div>
                                            <div className="font-serif text-xl text-mpca-green-dark mt-1 leading-tight">
                                                {r.title}
                                            </div>
                                        </div>
                                    </div>
                                    <span className={`pill ${r.status === "Carried" || r.status === "Carried_Unanimously" ? "pill-active" : r.status === "Rejected" ? "pill-suspended" : "pill-pending"}`}>
                                        {r.status.replace(/_/g, " ")}
                                    </span>
                                </div>
                                <p className="text-sm text-mpca-charcoal mt-3 font-serif italic leading-relaxed">
                                    "{r.text}"
                                </p>
                                <div className="mt-4 pt-4 border-t border-mpca-brass/15 flex flex-wrap items-center justify-between gap-3 text-[11px] text-mpca-gray-dark">
                                    <div>
                                        {r.proposed_by && <span>Proposed by <em className="text-mpca-charcoal not-italic">{r.proposed_by}</em></span>}
                                        {r.seconded_by && <span> · Seconded by <em className="text-mpca-charcoal not-italic">{r.seconded_by}</em></span>}
                                    </div>
                                    <div className="font-mono">
                                        For {r.votes_for} · Against {r.votes_against} · Abstain {r.votes_abstain}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Minutes */}
            {meeting.minutes && (
                <section data-testid="minutes-section">
                    <div className="overline mb-2">Minutes</div>
                    <h2 className="font-serif text-3xl text-mpca-green-dark mb-6">Record of Proceedings</h2>
                    <div className="bulletin-card p-8 text-mpca-charcoal italic font-serif leading-relaxed">
                        {meeting.minutes}
                    </div>
                </section>
            )}
        </div>
    );
};

export default MeetingDetail;
