import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, ArrowUpRight, Clock, Check, X, AlertCircle } from "lucide-react";
import { fetchTournaments, api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

// Tournament-scoped selection stages (mirrors squad.submission_status)
const STATUS_META = {
    Draft: { label: "Draft · Division composing squad", tone: "border-mpca-brass/40 text-mpca-brass", icon: Clock },
    Awaiting_MPCA_Approval: { label: "Awaiting MPCA Approval", tone: "border-mpca-oxblood/40 text-mpca-oxblood", icon: AlertCircle },
    Approved: { label: "Approved · Final Squad", tone: "border-mpca-green/40 text-mpca-green", icon: Check },
    Rejected: { label: "Rejected · Back to Division", tone: "border-mpca-oxblood/40 text-mpca-oxblood", icon: X },
};

const SelectionFunnel = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        (async () => {
            try {
                const ts = await fetchTournaments();
                const eligible = ts.filter((t) => ["Accepted", "Not_Required"].includes(t?.acceptance?.status));

                const scoped = eligible.filter((t) => {
                    if (persona?.body_type === "State") return true;
                    if (persona?.body_type === "Division") {
                        // own division OR any district whose parent is this division
                        return t.host_body_id === persona.body_code || (t.host_body_id || "").includes("-" + persona.body_code.split("-")[1]);
                    }
                    if (persona?.body_type === "District") return t.host_body_id === persona.body_code;
                    return false;
                });

                // pull selection status for each in parallel
                const withStatus = await Promise.all(scoped.map(async (t) => {
                    try {
                        const { data } = await api.get(`/tournaments/${t.id}/selection`);
                        return { ...t, _selection_status: data.submission_status || "Draft", _squad_size: (data.members || []).length };
                    } catch { return { ...t, _selection_status: "Draft", _squad_size: 0 }; }
                }));
                setRows(withStatus);
            } finally { setLoading(false); }
        })();
    }, [persona]);

    const filtered = filter === "all" ? rows : rows.filter((t) => t._selection_status === filter);

    const bucketCount = (k) => rows.filter((t) => t._selection_status === k).length;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="selection-funnel-page">
            <div className="mb-8">
                <div className="overline">Article VII · Selection Pipeline</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Selection Funnel</h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl">All tournaments where a squad has to be drafted, submitted and approved. Each row deep-links to its Selection Console.</p>
            </div>

            {/* Kanban-style stage counters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {["Draft", "Awaiting_MPCA_Approval", "Approved", "Rejected"].map((k) => {
                    const m = STATUS_META[k];
                    return (
                        <button key={k} onClick={() => setFilter(k === filter ? "all" : k)}
                            className={`p-4 text-left border transition ${filter === k ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "bg-mpca-parchment/40 border-mpca-brass/30 hover:border-mpca-brass"}`}
                            data-testid={`funnel-bucket-${k}`}>
                            <div className={`overline text-[9px] ${filter === k ? "!text-mpca-gold-light" : ""}`}>{m.label.split(" · ")[0]}</div>
                            <div className="font-serif text-3xl mt-1">{bucketCount(k)}</div>
                        </button>
                    );
                })}
            </div>

            {loading ? <CricketLoader label="Loading funnel…" /> : filtered.length === 0 ? (
                <div className="bulletin-card p-16 text-center" data-testid="funnel-empty">
                    <Users className="mx-auto text-mpca-brass mb-4" size={36} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No tournaments in this pipeline yet.</div>
                    <p className="text-mpca-gray-dark text-sm mt-2">Once MPCA creates a tournament and the host body accepts it, it will appear here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((t) => {
                        const m = STATUS_META[t._selection_status] || STATUS_META.Draft;
                        const Icon = m.icon;
                        return (
                            <Link key={t.id} to={`/tournaments/${t.id}/selection`}
                                className="bulletin-card p-5 flex flex-wrap items-center gap-4 hover:bg-mpca-parchment/60 transition"
                                data-testid={`funnel-row-${t.tournament_no}`}>
                                <div className="w-12 h-12 rounded-full bg-mpca-green-dark text-mpca-gold-light flex items-center justify-center"><Users size={16} /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-serif text-lg text-mpca-green-dark">{t.name}</div>
                                    <div className="text-[11px] text-mpca-gray-dark font-mono">{t.tournament_no} · Host {t.host_body_id} · Squad {t._squad_size}/{t.max_squad_size}</div>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-widest border ${m.tone}`}>
                                    <Icon size={11} /> {m.label}
                                </span>
                                <ArrowUpRight size={16} className="text-mpca-brass" />
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SelectionFunnel;
