import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createMeeting } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Check } from "lucide-react";

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
    status: "Scheduled",
};

const MeetingNew = () => {
    const [form, setForm] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

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
