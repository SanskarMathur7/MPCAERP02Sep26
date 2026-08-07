import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info } from "lucide-react";

// ─────────── Colour palette by tournament_type ───────────
const TYPE_STYLE = {
    MPCA_InterDivisional: { bg: "bg-mpca-green/20", border: "border-mpca-green", text: "text-mpca-green-dark", label: "Inter-Divisional" },
    MPCA_Championship:    { bg: "bg-mpca-oxblood/15", border: "border-mpca-oxblood", text: "text-mpca-oxblood", label: "Championship" },
    BCCI:                 { bg: "bg-mpca-brass/20", border: "border-mpca-brass", text: "text-mpca-brass", label: "BCCI" },
    Invitational:         { bg: "bg-mpca-charcoal/15", border: "border-mpca-charcoal", text: "text-mpca-charcoal", label: "Invitational" },
    Other:                { bg: "bg-mpca-gray/20", border: "border-mpca-gray-dark", text: "text-mpca-gray-dark", label: "Other" },
};
const styleFor = (t) => TYPE_STYLE[t?.tournament_type] || TYPE_STYLE.Other;

// ─────────── Date helpers ───────────
const startOfMonth = (y, m) => new Date(y, m, 1);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const toISODate = (d) => d.toISOString().slice(0, 10);
const parseDate = (s) => (s ? new Date(s + "T00:00:00") : null);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// day-of-week starting Monday (0=Mon..6=Sun)
const dowMon = (d) => (d.getDay() + 6) % 7;

const TournamentCalendarView = ({ tournaments, bodies, matches }) => {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [scope, setScope] = useState("All"); // All | State | Division | District
    const [bodyId, setBodyId] = useState("all"); // specific body code or 'all'

    // MPCA-132 · Index fixtures by (tournament_id, ISO date) so the calendar
    // paints a tournament ONLY on actual match days (not every day between
    // start_date and end_date). Falls back to span-paint when a tournament
    // has no fixtures yet — with a dashed "unscheduled" style so the user
    // knows the calendar is showing a placeholder window, not real matches.
    const matchesByTid = useMemo(() => {
        const map = new Map();   // tid → { dates:Set<ISO>, byDate:Map<ISO, [fixtures]> }
        (matches || []).forEach((f) => {
            const d = (f.match_date || f.scheduled_date || "").slice(0, 10);
            if (!d) return;
            const tid = f.tournament_id;
            if (!tid) return;
            let bucket = map.get(tid);
            if (!bucket) {
                bucket = { dates: new Set(), byDate: new Map() };
                map.set(tid, bucket);
            }
            bucket.dates.add(d);
            const arr = bucket.byDate.get(d) || [];
            arr.push(f);
            bucket.byDate.set(d, arr);
        });
        return map;
    }, [matches]);

    // Filter tournaments by host body scope + selection
    const filtered = useMemo(() => {
        return (tournaments || []).filter((t) => {
            if (scope === "All" && bodyId === "all") return true;
            const host = (bodies || []).find((b) => b.code === t.host_body_id);
            if (!host) return scope === "All";
            if (scope !== "All" && host.body_type !== scope) return false;
            if (bodyId !== "all" && t.host_body_id !== bodyId) return false;
            return true;
        });
    }, [tournaments, scope, bodyId, bodies]);

    // Build the month grid
    const monthStart = startOfMonth(year, month);
    const dim = daysInMonth(year, month);
    const gridStartOffset = dowMon(monthStart); // how many blank cells before day 1
    const totalCells = Math.ceil((gridStartOffset + dim) / 7) * 7;

    const cells = [];
    for (let i = 0; i < totalCells; i++) {
        const dayNum = i - gridStartOffset + 1;
        const inMonth = dayNum >= 1 && dayNum <= dim;
        const date = inMonth ? new Date(year, month, dayNum) : null;
        cells.push({ dayNum, inMonth, date });
    }

    // Group tournaments by day (for the current month range)
    const monthFirst = new Date(year, month, 1);
    const monthLast = new Date(year, month, dim);

    // MPCA-132 · Prefer match-day paint. For each tournament with fixtures,
    // include it in the day only if that ISO date is a match day. If a
    // tournament has NO fixtures yet, fall back to start→end span paint but
    // mark those cells as "unscheduled" so we can visually distinguish.
    const tournamentsForDate = (date) => {
        if (!date) return [];
        const iso = toISODate(date);
        return filtered.reduce((acc, t) => {
            const bucket = matchesByTid.get(t.id);
            if (bucket && bucket.dates.size > 0) {
                // Match-scheduled tournament — only paint on actual match days.
                if (bucket.dates.has(iso)) {
                    acc.push({ tournament: t, fixtures: bucket.byDate.get(iso) || [], unscheduled: false });
                }
                return acc;
            }
            // Fallback: no fixtures yet — paint the span as an "unscheduled" window
            const s = parseDate(t.start_date);
            const e = parseDate(t.end_date) || s;
            if (s && s <= date && e >= date) {
                acc.push({ tournament: t, fixtures: [], unscheduled: true });
            }
            return acc;
        }, []).sort((a, b) => Number(a.unscheduled) - Number(b.unscheduled));
    };

    const undated = filtered.filter((t) => !t.start_date);
    const monthTournaments = filtered.filter((t) => {
        const s = parseDate(t.start_date);
        const e = parseDate(t.end_date) || s;
        if (!s) return false;
        return s <= monthLast && e >= monthFirst;
    });

    const goPrev = () => {
        if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
    };
    const goNext = () => {
        if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
    };
    const goToday = () => { setMonth(now.getMonth()); setYear(now.getFullYear()); };

    // Body options for the specific-body dropdown, filtered by scope
    const bodyOptions = useMemo(() => {
        const list = (bodies || []).filter((b) => ["State", "Division", "District"].includes(b.body_type));
        if (scope === "All") return list;
        return list.filter((b) => b.body_type === scope);
    }, [bodies, scope]);

    const scopeChips = [
        { id: "All", label: "All" },
        { id: "State", label: "MPCA" },
        { id: "Division", label: "Divisions" },
        { id: "District", label: "Districts" },
    ];

    return (
        <div data-testid="tournament-calendar-view">
            {/* Toolbar */}
            <div className="bulletin-card p-4 mb-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={goPrev}
                            className="btn-heritage-ghost !p-2"
                            data-testid="cal-prev-btn"
                            aria-label="Previous month"
                        >
                            <ChevronLeft size={16} strokeWidth={1.5} />
                        </button>
                        <div className="font-serif text-2xl text-mpca-green-dark min-w-[200px] text-center" data-testid="cal-title">
                            {MONTH_NAMES[month]} <span className="text-mpca-brass">{year}</span>
                        </div>
                        <button
                            onClick={goNext}
                            className="btn-heritage-ghost !p-2"
                            data-testid="cal-next-btn"
                            aria-label="Next month"
                        >
                            <ChevronRight size={16} strokeWidth={1.5} />
                        </button>
                        <button onClick={goToday} className="btn-heritage-ghost !text-[10px]" data-testid="cal-today-btn">Today</button>
                    </div>

                    <div className="h-6 w-px bg-mpca-brass/30" />

                    {/* Scope filter */}
                    <div className="flex items-center gap-1 flex-wrap">
                        {scopeChips.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => { setScope(s.id); setBodyId("all"); }}
                                className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] border transition ${
                                    scope === s.id
                                        ? "bg-mpca-brass text-mpca-ivory border-mpca-brass"
                                        : "bg-transparent text-mpca-brass border-mpca-brass/40 hover:border-mpca-brass"
                                }`}
                                data-testid={`cal-scope-${s.id.toLowerCase()}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    {/* Body picker — narrows within the selected scope */}
                    {scope !== "All" && (
                        <select
                            value={bodyId}
                            onChange={(e) => setBodyId(e.target.value)}
                            className="input-heritage !py-1.5 !text-xs max-w-[240px]"
                            data-testid="cal-body-select"
                        >
                            <option value="all">All {scope === "State" ? "MPCA" : scope + "s"}</option>
                            {bodyOptions.map((b) => (
                                <option key={b.code} value={b.code}>{b.name} ({b.code})</option>
                            ))}
                        </select>
                    )}

                    <div className="ml-auto text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                        <span data-testid="cal-month-count">{monthTournaments.length}</span> in this month · {filtered.length} total
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-mpca-gray-dark">
                <span className="uppercase tracking-widest text-[9px] font-mono">Legend:</span>
                {Object.entries(TYPE_STYLE).map(([k, s]) => (
                    <span key={k} className={`inline-flex items-center gap-1.5 px-2 py-0.5 border ${s.border} ${s.bg} ${s.text}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> {s.label}
                    </span>
                ))}
                {/* MPCA-132 · "Unscheduled" style — dashed border + faded text —
                    marks tournaments whose fixtures aren't published yet. */}
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-dashed border-mpca-gray-dark opacity-60 italic text-mpca-gray-dark">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" /> Unscheduled
                </span>
            </div>

            {/* Calendar Grid */}
            <div className="bulletin-card overflow-hidden mb-8" data-testid="cal-grid">
                {/* Weekday header */}
                <div className="grid grid-cols-7 bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-[0.2em] font-mono">
                    {WEEKDAYS.map((w) => (
                        <div key={w} className="py-2 px-2 text-center border-r border-mpca-brass/30 last:border-r-0">{w}</div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                    {cells.map((c, i) => {
                        const trns = tournamentsForDate(c.date);
                        const isToday = c.date && toISODate(c.date) === toISODate(now);
                        return (
                            <div
                                key={i}
                                className={`min-h-[110px] border-r border-b border-mpca-brass/15 p-1.5 last-of-row:border-r-0 relative ${
                                    !c.inMonth ? "bg-mpca-parchment/30" : ""
                                } ${isToday ? "bg-mpca-brass/8" : ""}`}
                                data-testid={c.date ? `cal-cell-${toISODate(c.date)}` : undefined}
                            >
                                {c.inMonth && (
                                    <div className={`text-[10px] font-mono ${isToday ? "text-mpca-oxblood font-bold" : "text-mpca-gray-dark"}`}>
                                        {c.dayNum}
                                    </div>
                                )}
                                <div className="mt-1 space-y-0.5">
                                    {trns.slice(0, 3).map(({ tournament: t, fixtures, unscheduled }) => {
                                        const s = styleFor(t);
                                        // MPCA-132 · Compose tooltip from actual fixtures if any.
                                        const fixTip = fixtures.length > 0
                                            ? " · " + fixtures.slice(0, 3).map((f) => `${f.home_team} v ${f.away_team}${(f.start_time || f.scheduled_time) ? " @ " + (f.start_time || f.scheduled_time) : ""}`).join(", ")
                                            : (unscheduled ? " · Unscheduled — no match fixtures yet" : "");
                                        return (
                                            <Link
                                                key={t.id + (fixtures[0]?.id || "span")}
                                                to={`/tournaments/${t.id}`}
                                                className={`block text-[10px] px-1.5 py-0.5 border-l-2 ${s.border} ${s.bg} ${s.text} truncate hover:opacity-80 transition ${unscheduled ? "opacity-60 italic border-dashed" : ""}`}
                                                title={`${t.name} · Host ${t.host_body_id}${t.venue_name_snapshot ? " · " + t.venue_name_snapshot : ""}${fixTip}`}
                                                data-testid={unscheduled ? `cal-trn-unsched-${t.id}` : `cal-trn-${t.id}`}
                                            >
                                                {t.name}{fixtures.length > 1 ? ` (×${fixtures.length})` : ""}
                                            </Link>
                                        );
                                    })}
                                    {trns.length > 3 && (
                                        <div className="text-[9px] text-mpca-gray-dark italic px-1.5">+{trns.length - 3} more</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Undated tournaments */}
            {undated.length > 0 && (
                <div className="bulletin-card p-6" data-testid="cal-undated">
                    <div className="flex items-center gap-2 mb-3">
                        <Info size={14} className="text-mpca-oxblood" strokeWidth={1.5} />
                        <div className="overline">Undated — Awaiting Schedule ({undated.length})</div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                        {undated.map((t) => {
                            const s = styleFor(t);
                            return (
                                <Link
                                    key={t.id}
                                    to={`/tournaments/${t.id}`}
                                    className={`flex items-center justify-between gap-2 border-l-4 ${s.border} ${s.bg} px-3 py-2 hover:opacity-80 transition`}
                                    data-testid={`cal-undated-${t.id}`}
                                >
                                    <span className={`text-sm font-serif ${s.text} truncate`}>{t.name}</span>
                                    <span className="text-[10px] font-mono uppercase tracking-wider text-mpca-gray-dark shrink-0">
                                        {t.host_body_id}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {filtered.length === 0 && (
                <div className="text-center py-16 bulletin-card">
                    <CalendarIcon className="mx-auto text-mpca-brass mb-4" size={36} strokeWidth={1} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No tournaments match this filter.</div>
                    <p className="text-mpca-gray-dark text-sm mt-2">Try widening the scope or picking a different body.</p>
                </div>
            )}
        </div>
    );
};

export default TournamentCalendarView;
