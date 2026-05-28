import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMeetings } from "@/lib/api";
import { Plus, Calendar, ChevronRight, MapPin, Clock } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const TYPE_LABELS = {
    All: "All",
    AGM: "AGM",
    SGM: "Special GM",
    Committee: "Committee",
    Sub_Committee: "Sub-Committee",
};

const STATUS_PILL = {
    Scheduled: "pill-pending",
    Notice_Issued: "pill-pending",
    In_Progress: "pill-active",
    Concluded: "pill-lapsed",
    Cancelled: "pill-suspended",
};

const Meetings = () => {
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState("All");

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchMeetings();
                setMeetings(data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        if (typeFilter === "All") return meetings;
        return meetings.filter((m) => m.meeting_type === typeFilter);
    }, [meetings, typeFilter]);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="meetings-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article VIII–X · Proceedings</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        AGM & Committee Meetings
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The proceedings of the Annual General Meeting, Special General
                        Meetings, Managing Committee and its Sub-Committees — convened in
                        accordance with the Constitution.
                    </p>
                </div>
                <Link to="/meetings/new" className="btn-heritage-primary" data-testid="add-meeting-btn">
                    <Plus size={14} strokeWidth={1.5} /> Convene Meeting
                </Link>
            </div>

            <div className="crest-divider mb-10" />

            <div className="flex flex-wrap gap-2 mb-8">
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <button
                        key={k}
                        onClick={() => setTypeFilter(k)}
                        data-testid={`mt-filter-${k.toLowerCase()}`}
                        className={`px-4 py-2 text-xs uppercase tracking-[0.18em] border transition-all duration-300 ${
                            typeFilter === k
                                ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:border-mpca-brass"
                        }`}
                    >
                        {v}
                    </button>
                ))}
            </div>

            {loading ? (
                <CricketLoader label="Reading the proceedings…" />
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bulletin-card" data-testid="meetings-empty">
                    <Calendar className="mx-auto text-mpca-brass mb-4" size={36} strokeWidth={1} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No proceedings on record.</div>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-6">
                    {filtered.map((m) => (
                        <Link
                            to={`/meetings/${m.id}`}
                            key={m.id}
                            className="bulletin-card p-7 group hover:-translate-y-0.5 hover:shadow-lg transition-all duration-500"
                            data-testid={`meeting-${m.meeting_no}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="font-mono text-[10px] text-mpca-brass tracking-widest">
                                    {m.meeting_no}
                                </div>
                                <span className={`pill ${STATUS_PILL[m.status] || "pill-pending"}`}>
                                    {m.status.replace(/_/g, " ")}
                                </span>
                            </div>
                            <div className="font-serif text-2xl text-mpca-green-dark mt-3 leading-tight group-hover:text-mpca-oxblood transition-colors duration-300">
                                {m.title}
                            </div>
                            <div className="overline mt-2 !text-mpca-gray-dark">
                                {m.meeting_type.replace(/_/g, " ")}
                            </div>

                            <div className="mt-5 space-y-2 text-sm text-mpca-charcoal">
                                <div className="flex items-center gap-2">
                                    <Calendar size={13} className="text-mpca-brass" strokeWidth={1.5} />
                                    {new Date(m.scheduled_date).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    })}
                                    {m.scheduled_time && (
                                        <>
                                            <Clock size={13} className="text-mpca-brass ml-3" strokeWidth={1.5} />
                                            {m.scheduled_time}
                                        </>
                                    )}
                                </div>
                                <div className="flex items-start gap-2">
                                    <MapPin size={13} className="text-mpca-brass mt-1" strokeWidth={1.5} />
                                    <span>{m.venue}</span>
                                </div>
                            </div>

                            <div className="mt-5 pt-4 border-t border-mpca-brass/15 flex items-center justify-between">
                                <div className="text-[11px] text-mpca-gray-dark">
                                    {m.agenda.length} agenda items · Quorum {m.quorum_present}/{m.quorum_required}
                                </div>
                                <ChevronRight className="text-mpca-brass group-hover:translate-x-1 transition-transform duration-300" size={16} strokeWidth={1.5} />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Meetings;
