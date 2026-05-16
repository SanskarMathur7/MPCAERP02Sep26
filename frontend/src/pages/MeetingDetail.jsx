import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchMeeting, fetchResolutions, addResolution, updateMeeting } from "@/lib/api";
import { ArrowLeft, Calendar, MapPin, Clock, Users, CheckCircle2, XCircle, Plus, Gavel } from "lucide-react";

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
    }, [id]); // eslint-disable-line

    const advanceStatus = async (status) => {
        const updated = await updateMeeting(id, { ...meeting, status });
        setMeeting(updated);
    };

    if (loading) return <div className="p-16 text-center font-serif text-mpca-gray-dark">Fetching proceedings…</div>;
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
                                            <div className="overline">Resolution № {idx + 1}</div>
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
