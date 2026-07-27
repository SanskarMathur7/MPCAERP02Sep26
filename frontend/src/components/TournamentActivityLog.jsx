import { useEffect, useState } from "react";
import { Clock, User, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/**
 * M39 · Tournament Activity Log
 * Reads /api/shared/audit-log?record_id={tournament_id} + related modules
 * (squads, budgets, claims, DA forms) to render a chronological timeline.
 */
const TournamentActivityLog = ({ tournamentId }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                // Fetch audit logs across modules that relate to this tournament
                const params = { limit: 400, record_id: tournamentId };
                const { data } = await api.get("/shared/audit-log", { params });
                setRows(data || []);
            } catch { setRows([]); }
            finally { setLoading(false); }
        })();
    }, [tournamentId]);

    return (
        <div className="bulletin-card p-6" data-testid="tournament-activity-log">
            <div className="overline mb-2">Activity Log</div>
            <div className="font-serif text-xl text-mpca-green-dark mb-4">
                Chronological trail of every action taken on this tournament
            </div>
            {loading ? (
                <div className="text-[11px] text-mpca-brass flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading…</div>
            ) : rows.length === 0 ? (
                <div className="text-[11px] text-mpca-gray-dark italic text-center py-10" data-testid="activity-empty">
                    No logged activity yet. Actions like approvals, budget submissions, squad reviews and DA reviews are logged here as they happen.
                </div>
            ) : (
                <div className="relative pl-6 space-y-3" data-testid="activity-timeline">
                    <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-mpca-brass/20" />
                    {rows.map((r, i) => (
                        <div key={r.id || i} className="relative" data-testid={`activity-row-${i}`}>
                            <div className="absolute -left-6 top-2 w-3 h-3 rounded-full bg-mpca-oxblood border-2 border-mpca-ivory" />
                            <div className="border border-mpca-brass/20 p-3 bg-mpca-parchment/30">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[9px] uppercase tracking-widest text-mpca-brass border border-mpca-brass/30 px-1.5 py-0.5">{r.module}</span>
                                    <span className="text-[9px] uppercase tracking-widest text-mpca-oxblood">{r.action}</span>
                                    <span className="text-[10px] text-mpca-gray-dark font-mono ml-auto flex items-center gap-1">
                                        <Clock size={9} /> {new Date(r.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                    </span>
                                </div>
                                <div className="text-[11px] text-mpca-green-dark mt-1 flex items-center gap-1">
                                    <User size={10} /> {r.actor_name || "System"} {r.actor_role && <span className="text-mpca-gray-dark">· {r.actor_role}</span>} {r.actor_body_id && <span className="text-mpca-gray-dark">· {r.actor_body_id}</span>}
                                </div>
                                {r.details && Object.keys(r.details).length > 0 && (
                                    <div className="text-[10px] text-mpca-gray-dark mt-1 font-mono">
                                        {Object.entries(r.details).slice(0, 5).map(([k, v]) => (
                                            <span key={k} className="mr-3">{k}={typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40)}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TournamentActivityLog;
