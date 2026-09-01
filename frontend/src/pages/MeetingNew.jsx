import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createMeeting, api } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Check, Users, FileText, Paperclip } from "lucide-react";

const initial = {
    title: "",
    meeting_type: "Committee",
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time: "",
    venue: "",
    notice_date: "",
    quorum_required: 9,
    quorum_present: 0,
    chairperson: "",
    convened_by: "",
    agenda: [{ number: 1, title: "", description: "" }],
    attendees: [],
    // MPCA-113 · Sub-committee auto-select + external attendees
    sub_committee_code: "",
    external_attendees: [],
    // MPCA-114 · Documents attached at creation
    documents: [],
    status: "Scheduled",
};

const MeetingNew = () => {
    const [form, setForm] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();
    // MPCA-113 · Sub-committee registry + preview
    const [committees, setCommittees] = useState([]);
    const [subCommitteeMembers, setSubCommitteeMembers] = useState([]);
    const [newExternal, setNewExternal] = useState({ name: "", email: "", org: "" });
    const [uploadingDoc, setUploadingDoc] = useState(false);

    // MPCA-114 · Upload a real file (PDF/image) to /api/uploads and push
    // { name, url } into form.documents. Replaces the previous free-text
    // URL entry which was error-prone and unfriendly.
    const uploadDoc = async (file) => {
        if (!file) return;
        setUploadingDoc(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "meeting");
            const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setForm((f) => ({
                ...f,
                documents: [
                    ...f.documents,
                    {
                        name: file.name,
                        url: data.url,
                        uploaded_at: new Date().toISOString(),
                        uploaded_by: "Current User",
                    },
                ],
            }));
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setUploadingDoc(false);
        }
    };

    useEffect(() => {
        api.get("/sub-committees").then((r) => setCommittees(r.data || [])).catch(() => setCommittees([]));
    }, []);

    // When user picks a sub-committee → preview members that will be auto-added.
    useEffect(() => {
        if (!form.sub_committee_code) { setSubCommitteeMembers([]); return; }
        api.get(`/sub-committees/${form.sub_committee_code}/members`)
            .then((r) => setSubCommitteeMembers(r.data?.members || []))
            .catch(() => setSubCommitteeMembers([]));
    }, [form.sub_committee_code]);

    const update = (e) => {
        const v = e.target.type === "number" ? Number(e.target.value) : e.target.value;
        setForm((f) => ({ ...f, [e.target.name]: v }));
    };

    const updateAgendaItem = (idx, field, value) => {
        setForm((f) => {
            const ag = [...f.agenda];
            ag[idx] = { ...ag[idx], [field]: value };
            return { ...f, agenda: ag };
        });
    };

    const addAgendaItem = () => {
        setForm((f) => ({
            ...f,
            agenda: [...f.agenda, { number: f.agenda.length + 1, title: "", description: "" }],
        }));
    };

    const removeAgendaItem = (idx) => {
        setForm((f) => {
            const ag = f.agenda.filter((_, i) => i !== idx).map((a, i) => ({ ...a, number: i + 1 }));
            return { ...f, agenda: ag.length ? ag : [{ number: 1, title: "", description: "" }] };
        });
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const payload = {
                ...form,
                agenda: form.agenda.filter((a) => a.title.trim()),
            };
            const m = await createMeeting(payload);
            navigate(`/meetings/${m.id}`);
        } catch (err) {
            setError(err.response?.data?.detail || err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="meeting-new-page">
            <Link to="/meetings" className="btn-heritage-ghost mb-6 inline-flex">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Proceedings
            </Link>
            <div className="mb-10">
                <div className="overline">Convening</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                    Convene a New Meeting
                </h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                    A formal notice shall be issued to all eligible members upon recording
                    of these particulars. Quorum norms apply per Article IX.
                </p>
                <div className="crest-divider mt-10" />
            </div>

            <form onSubmit={onSubmit} className="space-y-8">
                <div className="bulletin-card p-8">
                    <div className="overline mb-1">Identity</div>
                    <h3 className="font-serif text-2xl text-mpca-green-dark mb-6">Meeting Particulars</h3>
                    <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                        <div className="md:col-span-2">
                            <label className="label-heritage">Title *</label>
                            <input name="title" required value={form.title} onChange={update} className="input-heritage" data-testid="mt-title" />
                        </div>
                        <div>
                            <label className="label-heritage">Meeting Type *</label>
                            <select name="meeting_type" value={form.meeting_type} onChange={update} className="input-heritage" data-testid="mt-type">
                                <option>AGM</option>
                                <option>SGM</option>
                                <option>Committee</option>
                                <option value="Sub_Committee">Sub-Committee</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Status</label>
                            <select name="status" value={form.status} onChange={update} className="input-heritage">
                                <option>Scheduled</option>
                                <option value="Notice_Issued">Notice Issued</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Scheduled Date *</label>
                            <input type="date" name="scheduled_date" required value={form.scheduled_date} onChange={update} className="input-heritage" data-testid="mt-date" />
                        </div>
                        <div>
                            <label className="label-heritage">Scheduled Time</label>
                            <input name="scheduled_time" value={form.scheduled_time} onChange={update} placeholder="e.g. 11:00 AM" className="input-heritage" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="label-heritage">Venue *</label>
                            <input name="venue" required value={form.venue} onChange={update} className="input-heritage" data-testid="mt-venue" />
                        </div>
                        <div>
                            <label className="label-heritage">Notice Date</label>
                            <input type="date" name="notice_date" value={form.notice_date} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Quorum Required</label>
                            <input type="number" name="quorum_required" min="0" value={form.quorum_required} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Chairperson</label>
                            <input name="chairperson" value={form.chairperson} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Convened By</label>
                            <input name="convened_by" value={form.convened_by} onChange={update} className="input-heritage" />
                        </div>
                    </div>
                </div>

                <div className="bulletin-card p-8" data-testid="subcommittee-section">
                    <div className="overline mb-1">MPCA-113 · Attendees</div>
                    <h3 className="font-serif text-2xl text-mpca-green-dark mb-6">Sub-Committee &amp; Invitees</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="label-heritage">Pick a Sub-Committee (auto-invites all its members)</label>
                            <select
                                value={form.sub_committee_code}
                                onChange={(e) => setForm({ ...form, sub_committee_code: e.target.value })}
                                className="input-heritage"
                                data-testid="mt-subcommittee-select"
                            >
                                <option value="">— none / pick manually —</option>
                                {committees.map((c) => (
                                    <option key={c.code} value={c.code}>
                                        {c.label} · {c.member_count} member{c.member_count === 1 ? "" : "s"}
                                    </option>
                                ))}
                            </select>
                            {form.sub_committee_code && (
                                <div className="mt-3 border-l-4 border-mpca-brass bg-mpca-brass/10 px-3 py-2 text-[11px]" data-testid="subcommittee-preview">
                                    <div className="flex items-center gap-1 overline text-[9px] text-mpca-oxblood mb-1"><Users size={11} /> Will Auto-Invite ({subCommitteeMembers.length})</div>
                                    <div className="max-h-32 overflow-y-auto text-mpca-charcoal">
                                        {subCommitteeMembers.slice(0, 20).map((m) => (
                                            <div key={m.id} className="py-0.5">
                                                <span className="font-serif">{m.full_name}</span>
                                                {m.email && <span className="text-mpca-gray-dark ml-2 text-[10px]">· {m.email}</span>}
                                            </div>
                                        ))}
                                        {subCommitteeMembers.length > 20 && <div className="italic text-mpca-gray-dark">+{subCommitteeMembers.length - 20} more…</div>}
                                        {subCommitteeMembers.length === 0 && <div className="italic text-mpca-oxblood">No members currently tagged to this committee.</div>}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="label-heritage">External Attendees (not on MPCA rolls)</label>
                            <div className="space-y-2" data-testid="external-attendees-list">
                                {form.external_attendees.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 border border-mpca-brass/40 px-2 py-1 text-[11px]">
                                        <span className="flex-1 font-serif text-mpca-green-dark">{e.name}</span>
                                        <span className="text-mpca-gray-dark text-[10px]">{e.email}</span>
                                        <button type="button" onClick={() => setForm({ ...form, external_attendees: form.external_attendees.filter((_, idx) => idx !== i) })} className="text-mpca-oxblood" data-testid={`external-remove-${i}`}>
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5 mt-2">
                                <input placeholder="Name" value={newExternal.name} onChange={(e) => setNewExternal({ ...newExternal, name: e.target.value })} className="input-heritage !py-1 !text-xs" data-testid="external-name-input" />
                                <input placeholder="Email" type="email" value={newExternal.email} onChange={(e) => setNewExternal({ ...newExternal, email: e.target.value })} className="input-heritage !py-1 !text-xs" data-testid="external-email-input" />
                                <button type="button" className="btn-heritage-ghost !py-1 !text-[10px]" data-testid="external-add-btn" onClick={() => {
                                    if (!newExternal.name.trim()) return;
                                    setForm({ ...form, external_attendees: [...form.external_attendees, { ...newExternal }] });
                                    setNewExternal({ name: "", email: "", org: "" });
                                }}>
                                    <Plus size={11} /> Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bulletin-card p-8" data-testid="documents-section">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="overline mb-1">MPCA-114 · Attachments</div>
                            <h3 className="font-serif text-2xl text-mpca-green-dark">Meeting Documents</h3>
                            <p className="text-[11px] text-mpca-gray-dark italic mt-1">These will be visible to every invitee on the meeting page.</p>
                        </div>
                    </div>
                    <div className="space-y-2 mb-3" data-testid="documents-list">
                        {form.documents.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 border border-mpca-brass/40 px-2 py-1.5 text-[11px]">
                                <FileText size={11} className="text-mpca-oxblood shrink-0" />
                                <span className="flex-1 font-serif text-mpca-green-dark truncate">{d.name}</span>
                                <a href={d.url} target="_blank" rel="noreferrer" className="text-[10px] text-mpca-brass hover:underline">View</a>
                                <button type="button" onClick={() => setForm({ ...form, documents: form.documents.filter((_, idx) => idx !== i) })} className="text-mpca-oxblood" data-testid={`doc-remove-${i}`}>
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <label className="inline-flex items-center gap-2 border-2 border-dashed border-mpca-brass/50 bg-mpca-parchment px-3 py-2 cursor-pointer hover:border-mpca-oxblood/50 text-[11px] text-mpca-brass hover:text-mpca-oxblood">
                        <Paperclip size={11} />
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => { uploadDoc(e.target.files?.[0]); e.target.value = ""; }}
                            data-testid="doc-file-input"
                        />
                        <span className="italic">{uploadingDoc ? "Uploading…" : "+ Attach a document (PDF or image)"}</span>
                    </label>
                </div>

                <div className="bulletin-card p-8" data-testid="agenda-section">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="overline mb-1">Agenda</div>
                            <h3 className="font-serif text-2xl text-mpca-green-dark">Order of Business</h3>
                        </div>
                        <button type="button" onClick={addAgendaItem} className="btn-heritage-ghost" data-testid="add-agenda">
                            <Plus size={14} strokeWidth={1.5} /> Add Item
                        </button>
                    </div>
                    <div className="space-y-4">
                        {form.agenda.map((item, idx) => (
                            <div key={idx} className="flex gap-4 items-start" data-testid={`agenda-row-${idx}`}>
                                <div className="font-serif text-2xl text-mpca-brass w-8 pt-5">{item.number}.</div>
                                <div className="flex-1 grid md:grid-cols-2 gap-4">
                                    <input
                                        placeholder="Title"
                                        value={item.title}
                                        onChange={(e) => updateAgendaItem(idx, "title", e.target.value)}
                                        className="input-heritage"
                                    />
                                    <input
                                        placeholder="Description (optional)"
                                        value={item.description}
                                        onChange={(e) => updateAgendaItem(idx, "description", e.target.value)}
                                        className="input-heritage"
                                    />
                                </div>
                                <button type="button" onClick={() => removeAgendaItem(idx)} className="text-mpca-oxblood pt-5">
                                    <Trash2 size={14} strokeWidth={1.5} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {error && <div className="text-mpca-oxblood text-sm italic">{error}</div>}

                <div className="flex justify-end gap-3">
                    <Link to="/meetings" className="btn-heritage-secondary">Cancel</Link>
                    <button type="submit" disabled={saving} className="btn-heritage-primary" data-testid="mt-submit">
                        <Check size={14} strokeWidth={1.5} />
                        {saving ? "Convening…" : "Convene Meeting"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default MeetingNew;
