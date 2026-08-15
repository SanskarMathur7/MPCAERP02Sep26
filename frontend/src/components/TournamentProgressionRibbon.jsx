// MPCA-235 · Ship 2 · Progression Ribbon
// Reads /api/tournaments/{tid}/wiring-status and renders a horizontal 9-dot
// ribbon using the MPCA palette (navy/saffron/brass/parchment/ivory only).
//
// Every dot is clickable and scrolls to the corresponding setup box on the
// same page — advisory, never blocking.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Check, Circle, Info, Loader2 } from "lucide-react";

// ─── State → MPCA-palette style (Tailwind classes only, all mpca-* tokens) ───
// Done      → navy fill · gold check
// Current   → saffron/oxblood fill · ivory dot · subtle pulse
// Pending   → parchment bg · brass border · gray-dark text
// NA        → cream bg · dashed gray border · gray text (dimmed)
// Info      → brass tint · brass border
const DOT_STYLE = {
    done: {
        wrap:  "bg-mpca-green-dark border-mpca-green-dark text-mpca-gold-light",
        line:  "bg-mpca-green-dark",
        label: "text-mpca-green-dark",
    },
    current: {
        wrap:  "bg-mpca-oxblood border-mpca-oxblood text-mpca-ivory ring-2 ring-mpca-oxblood/25 animate-pulse",
        line:  "bg-mpca-brass/30",
        label: "text-mpca-oxblood font-semibold",
    },
    pending: {
        wrap:  "bg-mpca-parchment border-mpca-brass/40 text-mpca-gray-dark",
        line:  "bg-mpca-brass/20",
        label: "text-mpca-gray-dark",
    },
    na: {
        wrap:  "bg-mpca-ivory border-mpca-gray/30 text-mpca-gray border-dashed opacity-60",
        line:  "bg-mpca-gray/15",
        label: "text-mpca-gray opacity-70",
    },
    info: {
        wrap:  "bg-mpca-brass/15 border-mpca-brass/50 text-mpca-brass",
        line:  "bg-mpca-brass/25",
        label: "text-mpca-brass",
    },
};

const BUCKET_LABEL = {
    Pre_Tournament:  "Pre-Tournament",
    In_Tournament:   "In-Tournament",
    Post_Tournament: "Post-Tournament",
};

// ─── Full ribbon — used on Tournament Detail page ─────────────────────────────
const TournamentProgressionRibbon = ({ tournamentId, refreshKey = 0 }) => {
    const [data, setData]   = useState(null);
    const [loading, setLoad] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoad(true);
        api.get(`/tournaments/${tournamentId}/wiring-status`)
            .then(r => { if (alive) setData(r.data); })
            .catch(() => { if (alive) setData(null); })
            .finally(() => { if (alive) setLoad(false); });
        return () => { alive = false; };
    }, [tournamentId, refreshKey]);

    const scrollTo = (anchor) => {
        if (!anchor) return;
        const el = document.querySelector(`[data-testid="${anchor}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    if (loading) {
        return (
            <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-4 flex items-center gap-3" data-testid="wiring-ribbon-loading">
                <Loader2 size={14} className="animate-spin text-mpca-brass" />
                <span className="text-[11px] uppercase tracking-widest text-mpca-brass">Loading progression…</span>
            </div>
        );
    }
    if (!data) return null;

    const { steps, type_name, type_sub, progress_pct, wiring_version } = data;
    let lastBucket = null;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="wiring-ribbon">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-mpca-brass mb-1">
                        Tournament Progression · {type_name}
                    </div>
                    <div className="text-[11px] text-mpca-gray-dark">{type_sub}</div>
                </div>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest">
                    <span className="text-mpca-gray-dark" data-testid="wiring-ribbon-progress">{progress_pct}% complete</span>
                    <span className="text-mpca-brass">·</span>
                    <span className="text-mpca-brass" data-testid="wiring-ribbon-version">Wiring v{wiring_version}</span>
                </div>
            </div>

            {/* Ribbon */}
            <div className="flex items-start overflow-x-auto pb-2" data-testid="wiring-ribbon-steps">
                {steps.map((s, idx) => {
                    const style = DOT_STYLE[s.status] || DOT_STYLE.pending;
                    const showBucket = s.bucket !== lastBucket;
                    lastBucket = s.bucket;
                    return (
                        <div key={s.key} className="flex-1 min-w-[80px] flex flex-col items-center relative">
                            {/* Bucket cap above pre/in/post divider (subtle) */}
                            {showBucket && (
                                <div className="absolute -top-3 left-0 right-0 text-center">
                                    <span className="text-[8px] uppercase tracking-widest text-mpca-brass/80 font-mono">{BUCKET_LABEL[s.bucket]}</span>
                                </div>
                            )}
                            {/* Row with connector line + dot */}
                            <div className="flex items-center w-full pt-4">
                                {idx === 0
                                    ? <div className="flex-1" />
                                    : <div className={`flex-1 h-0.5 ${style.line}`} />
                                }
                                <button
                                    type="button"
                                    onClick={() => scrollTo(s.anchor)}
                                    data-testid={`wiring-dot-${s.key}`}
                                    title={`${s.label} — ${s.note || s.text || ""}`}
                                    className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all shrink-0 cursor-pointer hover:scale-110 ${style.wrap}`}
                                >
                                    {s.status === "done" ? (
                                        <Check size={14} strokeWidth={2.5} />
                                    ) : s.status === "info" ? (
                                        <Info size={12} strokeWidth={2} />
                                    ) : s.status === "current" ? (
                                        <span className="w-2 h-2 bg-mpca-ivory rounded-full" />
                                    ) : (
                                        <span className="text-[10px] font-mono font-bold">{idx + 1}</span>
                                    )}
                                </button>
                                {idx === steps.length - 1
                                    ? <div className="flex-1" />
                                    : <div className={`flex-1 h-0.5 ${DOT_STYLE[steps[idx + 1]?.status]?.line || style.line}`} />
                                }
                            </div>
                            {/* Label + flag + note */}
                            <div className="mt-2 text-center px-1">
                                <div className={`text-[10px] font-serif leading-tight ${style.label}`}>{s.label}</div>
                                <div className="mt-0.5 flex items-center justify-center gap-1 flex-wrap">
                                    {s.flag && (
                                        <span className={
                                            "text-[8px] font-mono px-1 border " +
                                            (s.flag === "M"    ? "bg-mpca-oxblood/10 border-mpca-oxblood/40 text-mpca-oxblood" :
                                             s.flag === "O"    ? "bg-mpca-brass/15 border-mpca-brass/40 text-mpca-brass" :
                                             s.flag === "INFO" ? "bg-mpca-brass/10 border-mpca-brass/30 text-mpca-brass" :
                                                                 "border-mpca-gray/30 text-mpca-gray")
                                        }>{s.flag}</span>
                                    )}
                                    {s.owner && s.flag !== "NA" && (
                                        <span className="text-[8px] font-mono text-mpca-gray-dark">{s.owner}</span>
                                    )}
                                </div>
                                {s.note && (
                                    <div className="mt-0.5 text-[9px] text-mpca-gray-dark leading-tight truncate max-w-[110px] mx-auto" title={s.note}>
                                        {s.note}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-mpca-brass/20 flex items-center gap-4 flex-wrap text-[10px] uppercase tracking-widest">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-mpca-green-dark inline-block" /> <span className="text-mpca-gray-dark">Done</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-mpca-oxblood inline-block" /> <span className="text-mpca-gray-dark">Current</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-mpca-parchment border border-mpca-brass/40 inline-block" /> <span className="text-mpca-gray-dark">Pending</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-mpca-ivory border border-dashed border-mpca-gray/40 inline-block" /> <span className="text-mpca-gray">N/A</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-mpca-brass/15 border border-mpca-brass/50 inline-block" /> <span className="text-mpca-gray-dark">Info</span>
                </span>
                <span className="ml-auto text-mpca-brass italic normal-case tracking-normal">Advisory — every step remains open · click a dot to jump</span>
            </div>
        </div>
    );
};

// ─── Mini ribbon — used on Tournaments list rows (compact 9-dot strip) ───────
// Derives client-side from the tournament object to avoid one API call per row.
// Uses `tournament.status` + `setup_meta` fields already in the list payload.
export const TournamentProgressionRibbonMini = ({ tournament }) => {
    const dots = deriveMiniDots(tournament);
    return (
        <div className="flex items-center gap-0.5" data-testid={`ribbon-mini-${tournament.tournament_no || tournament.id}`}>
            {dots.map((d, i) => {
                const style = DOT_STYLE[d.status] || DOT_STYLE.pending;
                return (
                    <span
                        key={i}
                        title={`${d.label}${d.note ? " — " + d.note : ""}`}
                        className={`w-2.5 h-2.5 rounded-full border ${style.wrap}`.replace("animate-pulse", "").replace("ring-2 ring-mpca-oxblood/25", "")}
                    />
                );
            })}
        </div>
    );
};

// Compact 9-step derivation from list-level tournament data.
// Not as precise as the backend endpoint but fast and never triggers extra I/O.
function deriveMiniDots(t) {
    const status = t.status || "Draft";
    const acc    = (t.acceptance || {}).status || "Not_Required";
    const meta   = t.setup_meta || {};
    const pools  = (meta.division_pools || []).concat(meta.district_pools || []);
    const poolsSet = pools.length > 0 || !!meta.teams;
    const calendarSet = !!t.calendar_fixed;
    const budgetSet   = !!(t.unified_budget_snapshot && t.unified_budget_snapshot.is_locked);
    const cancelled   = status === "Cancelled";

    // Crude status mapping — same for every tournament type in the mini strip.
    // Full ribbon (on Detail) uses the backend derivation which honours the wiring config.
    const done = (b) => b ? "done" : "pending";
    const inFlight = ["In_Progress", "Completed"].includes(status);
    const later    = status === "Completed";
    return [
        { label: "Creation",     status: "done" },
        { label: "Pool / Basics", status: done(poolsSet) },
        { label: "Officials",    status: acc === "Accepted" || inFlight ? "done" : "pending" },
        { label: "Squad",        status: ["Squad_Selection", "In_Progress", "Completed"].includes(status) ? "done" : "pending" },
        { label: "Squad Approval", status: ["In_Progress", "Completed"].includes(status) ? "done" : "pending" },
        { label: "Calendar",     status: calendarSet || inFlight ? "done" : "pending" },
        { label: "Budget",       status: budgetSet ? "done" : (inFlight ? "current" : "pending") },
        { label: "Finance",      status: later ? "current" : "pending" },
        { label: "MPCA",         status: "info" },
    ].map(d => (cancelled ? { ...d, status: "na" } : d));
}

export default TournamentProgressionRibbon;
