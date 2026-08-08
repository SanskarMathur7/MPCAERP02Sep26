import { useEffect, useMemo, useState } from "react";
import { Calendar, Plus, Cake, MapPin, Clock, Trash2, X, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const EVENT_TYPES = [
    { code: "meeting", label: "Meeting", tone: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40" },
    { code: "tournament", label: "Tournament", tone: "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40" },
    { code: "announcement", label: "Announcement", tone: "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/40" },
    { code: "holiday", label: "Holiday", tone: "bg-amber-100 text-amber-800 border-amber-300" },
    { code: "other", label: "Other", tone: "bg-mpca-gray-dark/10 text-mpca-gray-dark border-mpca-gray-dark/40" },
];
const typeTone = (t) => EVENT_TYPES.find((e) => e.code === t)?.tone || EVENT_TYPES[2].tone;
const typeLabel = (t) => EVENT_TYPES.find((e) => e.code === t)?.label || t;

const monthMatrix = (year, month /* 0-indexed */) => {
    const first = new Date(year, month, 1);
    const startDow = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
};

const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const EventCalendar = () => {
    const { persona } = useAuth();
    const isMPCA = persona?.body_type === "State";

    const [events, setEvents] = useState([]);
    const [birthdays, setBirthdays] = useState({ members: [], count: 0, date: "" });
    const [upcoming, setUpcoming] = useState({ members: [], count: 0 });
    const [loading, setLoading] = useState(true);
    const [cursor, setCursor] = useState(() => {
        const t = new Date();
        return { year: t.getFullYear(), month: t.getMonth() };
    });
    const [selectedDay, setSelectedDay] = useState(fmtISO(new Date()));
    const [showNew, setShowNew] = useState(false);
    const [draft, setDraft] = useState(null);
    // MPCA-115 · Event type filter — "all" shows every event, else limit
    // the day-cell paint to a single event_type.
    const [typeFilter, setTypeFilter] = useState("all");

    const load = async () => {
        setLoading(true);
        try {
            const monthStr = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
            const [ev, bday, up] = await Promise.all([
                api.get("/events", { params: { month: monthStr } }),
                api.get("/events/birthdays/today"),
                api.get("/events/birthdays/upcoming", { params: { days: 14 } }),
            ]);
            setEvents(ev.data || []);
            setBirthdays(bday.data || { members: [], count: 0, date: "" });
            setUpcoming(up.data || { members: [], count: 0 });
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [cursor.year, cursor.month]);

    const cells = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);
    const eventsByDay = useMemo(() => {
        const map = new Map();
        // MPCA-115 · Apply the type filter before bucketing so calendar +
        // right-rail selection both respect it.
        const filtered = typeFilter === "all" ? events : events.filter((e) => e.event_type === typeFilter);
        for (const e of filtered) {
            if (!map.has(e.event_date)) map.set(e.event_date, []);
            map.get(e.event_date).push(e);
        }
        return map;
    }, [events, typeFilter]);
    const selectedEvents = eventsByDay.get(selectedDay) || [];

    const openNew = (dateStr) => {
        setDraft({
            title: "",
            description: "",
            event_date: dateStr || selectedDay,
            end_date: "",
            start_time: "",
            end_time: "",
            location: "",
            event_type: "announcement",
        });
        setShowNew(true);
    };

    const saveEvent = async () => {
        if (!draft.title.trim()) { alert("Title is required."); return; }
        if (!draft.event_date) { alert("Date is required."); return; }
        try {
            const payload = { ...draft };
            if (!payload.end_date) delete payload.end_date;
            if (!payload.start_time) delete payload.start_time;
            if (!payload.end_time) delete payload.end_time;
            if (draft.id) {
                await api.patch(`/events/${draft.id}`, payload);
            } else {
                await api.post("/events", payload);
            }
            setShowNew(false); setDraft(null);
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        }
    };

    const deleteEvent = async (id) => {
        if (!window.confirm("Delete this event?")) return;
        try {
            await api.delete(`/events/${id}`);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const editEvent = (ev) => {
        setDraft({ ...ev });
        setShowNew(true);
    };

    const jumpMonth = (delta) => {
        setCursor((c) => {
            const d = new Date(c.year, c.month + delta, 1);
            return { year: d.getFullYear(), month: d.getMonth() };
        });
    };
    const jumpToday = () => {
        const t = new Date();
        setCursor({ year: t.getFullYear(), month: t.getMonth() });
        setSelectedDay(fmtISO(t));
    };

    if (loading && !events.length && !birthdays.count) return <CricketLoader label="Loading calendar…" />;

    const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const todayISO = fmtISO(new Date());

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="event-calendar-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Secretarial · Shared Calendar</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Event Calendar</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        {isMPCA
                            ? "Add meetings, tournaments, holidays, and announcements. Every MPCA and Division user sees this feed. Only MPCA may edit."
                            : "Shared calendar of MPCA-published events plus today's birthdays across the ecosystem. Read-only."}
                    </p>
                </div>
                {isMPCA && (
                    <button
                        onClick={() => openNew(selectedDay)}
                        className="btn-heritage-primary"
                        data-testid="add-event-btn"
                    >
                        <Plus size={14} /> New Event
                    </button>
                )}
            </div>

            {/* Month controls */}
            <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-1">
                    <button onClick={() => jumpMonth(-1)} className="p-1.5 border border-mpca-brass/30 hover:bg-mpca-cream/60" data-testid="prev-month" title="Previous month"><ChevronLeft size={14} /></button>
                    <div className="font-serif text-xl text-mpca-green-dark px-3" data-testid="month-label">{monthLabel}</div>
                    <button onClick={() => jumpMonth(1)} className="p-1.5 border border-mpca-brass/30 hover:bg-mpca-cream/60" data-testid="next-month" title="Next month"><ChevronRight size={14} /></button>
                </div>
                <button onClick={jumpToday} className="text-[10px] uppercase tracking-widest border border-mpca-brass/40 px-3 py-1.5 text-mpca-green-dark hover:bg-mpca-cream/60" data-testid="today-btn">Today</button>
                {/* MPCA-115 · Event type filter */}
                <div className="flex items-center gap-2 ml-auto" data-testid="event-type-filter">
                    <label className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">Type</label>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="input-heritage !py-1 !text-xs !w-auto"
                        data-testid="event-type-filter-select"
                    >
                        <option value="all">All</option>
                        <option value="meeting">Meetings</option>
                        <option value="tournament">Tournaments</option>
                        <option value="announcement">Announcements</option>
                        <option value="holiday">Holidays</option>
                        <option value="other">Other</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
                {/* Calendar grid */}
                <div className="bulletin-card p-4" data-testid="calendar-grid">
                    <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-widest text-mpca-brass/80 mb-2 px-1">
                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                            <div key={d} className="text-center">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {cells.map((d, i) => {
                            if (!d) return <div key={i} className="h-24 bg-mpca-cream/20 border border-transparent" />;
                            const iso = fmtISO(d);
                            const dayEvents = eventsByDay.get(iso) || [];
                            const isSelected = iso === selectedDay;
                            const isToday = iso === todayISO;
                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedDay(iso)}
                                    onDoubleClick={() => isMPCA && openNew(iso)}
                                    className={`h-24 text-left p-1.5 border transition-colors overflow-hidden
                                        ${isSelected ? "border-mpca-oxblood bg-mpca-cream/60" : "border-mpca-brass/20 hover:bg-mpca-cream/40"}
                                        ${isToday ? "ring-1 ring-mpca-brass" : ""}`}
                                    data-testid={`day-cell-${iso}`}
                                >
                                    <div className={`text-[11px] font-mono ${isToday ? "text-mpca-oxblood font-bold" : "text-mpca-green-dark"}`}>
                                        {d.getDate()}
                                    </div>
                                    <div className="mt-1 space-y-0.5">
                                        {dayEvents.slice(0, 2).map((e) => (
                                            <div key={e.id} className={`text-[9px] px-1 py-0.5 border ${typeTone(e.event_type)} truncate`} title={e.title}>
                                                {e.title}
                                            </div>
                                        ))}
                                        {dayEvents.length > 2 && (
                                            <div className="text-[9px] text-mpca-brass">+{dayEvents.length - 2} more</div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right rail: selected-day events + birthdays */}
                <div className="space-y-4">
                    {/* Selected day details */}
                    <div className="bulletin-card p-4" data-testid="day-panel">
                        <div className="overline text-[9px] mb-1">Events on</div>
                        <div className="font-serif text-lg text-mpca-green-dark">{selectedDay}</div>
                        <div className="mt-3 space-y-2">
                            {selectedEvents.length === 0 && (
                                <div className="text-[11px] text-mpca-gray-dark italic">No events on this date{isMPCA ? " — click New Event to add one." : "."}</div>
                            )}
                            {selectedEvents.map((e) => (
                                <div key={e.id} className="border border-mpca-brass/25 p-2.5" data-testid={`event-item-${e.id}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className={`text-[8px] uppercase tracking-widest px-1.5 py-0.5 border ${typeTone(e.event_type)}`}>{typeLabel(e.event_type)}</span>
                                            </div>
                                            <div className="font-serif text-sm text-mpca-green-dark">{e.title}</div>
                                            {e.description && <div className="text-[11px] text-mpca-gray-dark mt-1 whitespace-pre-line">{e.description}</div>}
                                            <div className="text-[10px] text-mpca-brass mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                                {(e.start_time || e.end_time) && (
                                                    <span className="inline-flex items-center gap-1"><Clock size={9} /> {e.start_time || "—"}{e.end_time ? ` – ${e.end_time}` : ""}</span>
                                                )}
                                                {e.location && <span className="inline-flex items-center gap-1"><MapPin size={9} /> {e.location}</span>}
                                            </div>
                                        </div>
                                        {isMPCA && (
                                            <div className="flex flex-col gap-1">
                                                <button onClick={() => editEvent(e)} className="text-[9px] uppercase tracking-widest text-mpca-oxblood hover:underline" data-testid={`edit-event-${e.id}`}>Edit</button>
                                                <button onClick={() => deleteEvent(e.id)} className="text-[9px] uppercase tracking-widest text-mpca-oxblood/70 hover:text-mpca-oxblood" data-testid={`delete-event-${e.id}`}><Trash2 size={10} /></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Birthdays today */}
                    <div className="bulletin-card p-4" data-testid="birthdays-panel">
                        <div className="flex items-center gap-2 mb-2">
                            <Cake size={14} className="text-mpca-oxblood" />
                            <div className="overline text-[9px]">Birthdays Today</div>
                        </div>
                        <div className="font-serif text-lg text-mpca-green-dark mb-2">{birthdays.date || todayISO} · {birthdays.count} member{birthdays.count === 1 ? "" : "s"}</div>
                        {birthdays.count === 0 ? (
                            <div className="text-[11px] text-mpca-gray-dark italic">No birthdays today across MPCA + Divisions.</div>
                        ) : (
                            <ul className="space-y-1.5">
                                {birthdays.members.map((m) => (
                                    <li key={m.id} className="flex items-center justify-between gap-2 text-[12px]" data-testid={`birthday-${m.id}`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-6 h-6 rounded-full bg-mpca-brass/15 text-mpca-brass font-mono text-[9px] flex items-center justify-center shrink-0">
                                                {m.name?.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "—"}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="text-mpca-green-dark truncate">{m.name}</div>
                                                <div className="text-[9px] text-mpca-brass/80 uppercase tracking-widest truncate">{m.body_id}{m.role ? ` · ${m.role}` : ""}</div>
                                            </div>
                                        </div>
                                        {m.age != null && <span className="text-[10px] text-mpca-oxblood font-mono shrink-0">Turns {m.age}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="text-[9px] text-mpca-brass/70 mt-3 italic">Automated 9 AM email blast: dashboard-only for now (SMTP to be wired later).</div>
                    </div>

                    {/* Upcoming birthdays */}
                    <div className="bulletin-card p-4" data-testid="upcoming-birthdays-panel">
                        <div className="overline text-[9px] mb-2">Next 14 Days</div>
                        {upcoming.count === 0 ? (
                            <div className="text-[11px] text-mpca-gray-dark italic">No birthdays in the next fortnight.</div>
                        ) : (
                            <ul className="space-y-1 text-[11px]">
                                {upcoming.members.slice(0, 8).map((m) => (
                                    <li key={m.id} className="flex items-center justify-between gap-2">
                                        <span className="text-mpca-green-dark truncate">{m.name}</span>
                                        <span className="text-mpca-brass font-mono text-[9px] shrink-0">{m.upcoming_date}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* New / Edit event modal */}
            {showNew && draft && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
                    <div className="bulletin-card p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()} data-testid="event-modal">
                        <div className="flex items-center justify-between mb-4">
                            <div className="font-serif text-2xl text-mpca-green-dark">{draft.id ? "Edit Event" : "New Event"}</div>
                            <button onClick={() => setShowNew(false)} className="text-mpca-gray-dark hover:text-mpca-oxblood"><X size={18} /></button>
                        </div>
                        <div className="space-y-3">
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Title *</div>
                                <input className="input-heritage w-full" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="event-title" />
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Description</div>
                                <textarea rows={2} className="input-heritage w-full text-sm" value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="event-desc" />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <div className="overline text-[9px] mb-1">Date *</div>
                                    <input type="date" className="input-heritage w-full" value={draft.event_date} onChange={(e) => setDraft({ ...draft, event_date: e.target.value })} data-testid="event-date" />
                                </label>
                                <label className="block">
                                    <div className="overline text-[9px] mb-1">End Date</div>
                                    <input type="date" className="input-heritage w-full" value={draft.end_date || ""} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
                                </label>
                                <label className="block">
                                    <div className="overline text-[9px] mb-1">Start Time</div>
                                    <input type="time" className="input-heritage w-full" value={draft.start_time || ""} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
                                </label>
                                <label className="block">
                                    <div className="overline text-[9px] mb-1">End Time</div>
                                    <input type="time" className="input-heritage w-full" value={draft.end_time || ""} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
                                </label>
                            </div>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Location</div>
                                <input className="input-heritage w-full" value={draft.location || ""} onChange={(e) => setDraft({ ...draft, location: e.target.value })} data-testid="event-location" />
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Type</div>
                                <select className="input-heritage w-full" value={draft.event_type} onChange={(e) => setDraft({ ...draft, event_type: e.target.value })} data-testid="event-type">
                                    {EVENT_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowNew(false)} className="btn-heritage-secondary"><X size={12} /> Cancel</button>
                            <button onClick={saveEvent} className="btn-heritage-primary" data-testid="save-event-btn"><Save size={12} /> Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EventCalendar;
