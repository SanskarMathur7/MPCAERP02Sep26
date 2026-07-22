import { useEffect, useState } from "react";
import { Check, Circle, Loader2, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Sprint M19 · Tournament Progress Stepper (5 phases · derived from backend)
 * ───────────────────────────────────────────────────────────────────────────
 * Fetches `/api/tournaments/{id}/progress` and renders a horizontal 5-phase
 * stepper. Each phase expands (hover + click) to reveal its sub-steps.
 * User's chosen layout: "Horizontal stepper with 5 phase groups, each
 * expanding to sub-steps".
 */

const PHASE_ORDER = ["setup", "squad", "play", "claim", "payment"];

const PHASE_COLOR = {
    setup: { done: "bg-mpca-green-dark text-mpca-ivory", pending: "bg-mpca-parchment text-mpca-green-dark" },
    squad: { done: "bg-mpca-green-dark text-mpca-ivory", pending: "bg-mpca-parchment text-mpca-green-dark" },
    play: { done: "bg-mpca-green-dark text-mpca-ivory", pending: "bg-mpca-parchment text-mpca-green-dark" },
    claim: { done: "bg-mpca-oxblood text-mpca-ivory", pending: "bg-mpca-parchment text-mpca-green-dark" },
    payment: { done: "bg-mpca-brass text-mpca-cream-dark", pending: "bg-mpca-parchment text-mpca-green-dark" },
};

const TournamentProgress = ({ tournamentId, refreshKey = 0 }) => {
    const [progress, setProgress] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tournamentId) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const p = await api.get(`/tournaments/${tournamentId}/progress`).then((r) => r.data);
                if (!cancelled) setProgress(p);
            } catch (_) { /* silent */ }
            finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tournamentId, refreshKey]);

    if (loading || !progress) {
        return (
            <div className="border border-mpca-brass/30 bg-mpca-cream/30 p-4 flex items-center gap-3" data-testid="tournament-progress-loading">
                <Loader2 size={14} className="animate-spin text-mpca-brass" />
                <span className="text-[11px] uppercase tracking-widest text-mpca-gray-dark">Computing progress…</span>
            </div>
        );
    }

    const currentPhase = progress.current_phase;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-cream/20 p-4" data-testid="tournament-progress">
            {/* Overall progress bar */}
            <div className="flex items-center justify-between mb-3">
                <div>
                    <div className="overline text-[9px]">Tournament Progress · derived from data</div>
                    <div className="font-serif text-xl text-mpca-green-dark mt-0.5">
                        {progress.percent}%
                        <span className="text-[10px] font-mono text-mpca-brass ml-2 uppercase tracking-widest">
                            Current Phase: {progress.current_phase}
                        </span>
                    </div>
                </div>
            </div>
            <div className="h-1 w-full bg-mpca-parchment rounded-sm overflow-hidden mb-4" data-testid="progress-bar-track">
                <div
                    className="h-full bg-gradient-to-r from-mpca-green-dark via-mpca-brass to-mpca-oxblood transition-all"
                    style={{ width: `${progress.percent}%` }}
                    data-testid="progress-bar-fill"
                />
            </div>

            {/* 5 phase pills */}
            <div className="grid grid-cols-5 gap-2">
                {PHASE_ORDER.map((key) => {
                    const phase = progress.phases.find((p) => p.key === key);
                    if (!phase) return null;
                    const total = phase.steps.length;
                    const done = phase.steps.filter((s) => s.done).length;
                    const complete = done === total;
                    const active = key === currentPhase;
                    const tone = PHASE_COLOR[key];
                    return (
                        <button
                            key={key}
                            onClick={() => setExpanded(expanded === key ? null : key)}
                            className={`text-left px-3 py-2 border-2 transition-all ${complete ? tone.done + " border-transparent" : tone.pending + (active ? " border-mpca-oxblood ring-1 ring-mpca-oxblood/40" : " border-mpca-brass/30")}`}
                            data-testid={`progress-phase-${key}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="font-serif text-sm">{phase.label}</div>
                                <ChevronDown size={11} className={`transition-transform ${expanded === key ? "rotate-180" : ""}`} />
                            </div>
                            <div className={`text-[9px] uppercase tracking-widest mt-1 font-mono ${complete ? "opacity-90" : "text-mpca-gray-dark"}`}>
                                {done} / {total} · {complete ? "COMPLETE" : (active ? "IN PROGRESS" : "PENDING")}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Expanded sub-steps */}
            {expanded && (
                <div className="mt-3 border border-mpca-brass/30 bg-mpca-ivory p-3" data-testid={`progress-phase-detail-${expanded}`}>
                    <div className="overline text-[9px] mb-2">{progress.phases.find((p) => p.key === expanded)?.label} · Sub-steps</div>
                    <div className="space-y-1.5">
                        {progress.phases.find((p) => p.key === expanded)?.steps.map((s) => (
                            <div key={s.key} className="flex items-start gap-2 text-xs" data-testid={`progress-step-${s.key}`}>
                                {s.done ? (
                                    <Check size={13} strokeWidth={2.5} className="text-mpca-green-dark shrink-0 mt-0.5" />
                                ) : (
                                    <Circle size={13} strokeWidth={1.5} className="text-mpca-gray-dark shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <div className={s.done ? "text-mpca-green-dark font-medium" : "text-mpca-gray-dark"}>{s.label}</div>
                                    {s.note && <div className="text-[10px] text-mpca-brass italic mt-0.5">{s.note}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TournamentProgress;
