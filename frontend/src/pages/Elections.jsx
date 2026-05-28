import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchElections } from "@/lib/api";
import { Vote, Plus, ChevronRight, Calendar, User as UserIcon } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const STATUS_PILL = {
    Announced: "pill-pending",
    Nominations_Open: "pill-active",
    Nominations_Closed: "pill-pending",
    Voting_Open: "pill-active",
    Concluded: "pill-lapsed",
    Cancelled: "pill-suspended",
};

const Elections = () => {
    const [elections, setElections] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchElections();
                setElections(data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="elections-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article XI · Elections</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Elections of Office Bearers
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Conducted by an independent Electoral Officer in accordance with
                        the Constitution. Tenure, cooling period and eligibility norms
                        apply per Article XI.
                    </p>
                </div>
                <Link to="/elections/new" className="btn-heritage-primary" data-testid="add-election-btn">
                    <Plus size={14} strokeWidth={1.5} /> Announce Election
                </Link>
            </div>

            <div className="crest-divider mb-10" />

            {loading ? (
                <CricketLoader label="Loading the rolls…" />
            ) : elections.length === 0 ? (
                <div className="text-center py-20 bulletin-card" data-testid="elections-empty">
                    <Vote className="mx-auto text-mpca-brass mb-4" size={36} strokeWidth={1} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No elections on the roll.</div>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-6">
                    {elections.map((e) => (
                        <Link
                            to={`/elections/${e.id}`}
                            key={e.id}
                            className="bulletin-card p-7 group hover:-translate-y-0.5 hover:shadow-lg transition-all duration-500"
                            data-testid={`election-${e.id}`}
                        >
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="overline">Election · {e.tenure_years}-year tenure</div>
                                <span className={`pill ${STATUS_PILL[e.status] || "pill-pending"}`}>
                                    {e.status.replace(/_/g, " ")}
                                </span>
                            </div>
                            <div className="font-serif text-2xl text-mpca-green-dark leading-tight group-hover:text-mpca-oxblood transition-colors duration-300">
                                {e.title}
                            </div>
                            <div className="mt-1 text-sm text-mpca-charcoal">
                                Post: <em className="text-mpca-brass not-italic font-medium">{e.post}</em>
                            </div>

                            <div className="mt-5 space-y-2 text-sm text-mpca-charcoal">
                                <div className="flex items-center gap-2">
                                    <UserIcon size={13} className="text-mpca-brass" strokeWidth={1.5} />
                                    Electoral Officer: {e.electoral_officer}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar size={13} className="text-mpca-brass" strokeWidth={1.5} />
                                    Voting:{" "}
                                    {new Date(e.voting_date).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </div>
                            </div>

                            <div className="mt-5 pt-4 border-t border-mpca-brass/15 flex items-center justify-between">
                                <div className="text-[11px] text-mpca-gray-dark">
                                    Eligible voters: <span className="font-mono">{e.eligible_voters_count}</span>
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

export default Elections;
