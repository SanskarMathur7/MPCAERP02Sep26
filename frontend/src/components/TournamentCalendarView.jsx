import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info } from "lucide-react";

// Iter 126 · Colour palette aligned with the Tournament Registry categories
// (Inter-Divisional / Inter-District / BCCI / Championship / Invitational /
// Inter-School / Inter-Club / Camps). Both `tournament_type` and `scope`
// on the tournament doc are consulted.
const TYPE_STYLE = {
    MPCA_InterDivisional: { bg: "bg-mpca-green-dark/15", border: "border-mpca-green-dark", text: "text-mpca-green-dark", label: "Inter-Divisional" },
    Inter_District:       { bg: "bg-mpca-brass/15",      border: "border-mpca-brass",      text: "text-mpca-brass",      label: "Inter-District"  },
    MPCA_Championship:    { bg: "bg-mpca-oxblood/15",    border: "border-mpca-oxblood",    text: "text-mpca-oxblood",    label: "Championship"    },
    BCCI:                 { bg: "bg-mpca-brass/25",      border: "border-mpca-brass",      text: "text-mpca-brass",      label: "BCCI"            },
    Invitational:         { bg: "bg-mpca-charcoal/15",   border: "border-mpca-charcoal",   text: "text-mpca-charcoal",   label: "Invitational"    },
    Inter_School:         { bg: "bg-mpca-navy/15",       border: "border-mpca-navy",       text: "text-mpca-navy",       label: "Inter-School"    },
    Inter_Club:           { bg: "bg-mpca-navy/10",       border: "border-mpca-navy",       text: "text-mpca-navy",       label: "Inter-Club"      },
    Camp:                 { bg: "bg-mpca-gold/15",       border: "border-mpca-gold",       text: "text-mpca-brass",      label: "Camps"           },
    Other:                { bg: "bg-mpca-gray/20",       border: "border-mpca-gray-dark",  text: "text-mpca-gray-dark",  label: "Other"           },
};
const styleFor = (t) => {
    if (!t) return TYPE_STYLE.Other;
    if (TYPE_STYLE[t.tournament_type]) return TYPE_STYLE[t.tournament_type];
    if (t.scope && TYPE_STYLE[t.scope]) return TYPE_STYLE[t.scope];
    // Registry category fallback (e.g. Vacation_Camp / Periodical_Coaching_Camp)
    const cat = (t.master_category || t.category || "").toLowerCase();
    if (cat.includes("camp")) return TYPE_STYLE.Camp;
    if (cat.includes("school")) return TYPE_STYLE.Inter_School;
    if (cat.includes("club")) return TYPE_STYLE.Inter_Club;
    if (cat.includes("district")) return TYPE_STYLE.Inter_District;
    if (cat.includes("divisional")) return TYPE_STYLE.MPCA_InterDivisional;
    if (cat.includes("bcci")) return TYPE_STYLE.BCCI;
    return TYPE_STYLE.Other;
};

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
    // Iter 126b · Ground filter — pick a ground to see its availability across
    // the month (dates with a match at that ground are lit up; every other
    // cell is a "free" ground-slot when a ground is selected).
    const [groundId, setGroundId] = useState("all");

    // MPCA-132 · Index fixtures by (tournament_id, ISO date) so the calendar
    // paints a tournament ONLY on actual match days (not every day between
    // start_date and end_date). Falls back to span-paint when a tournament
    // has no fixtures yet — with a dashed "unscheduled" style so the user
    // knows the calendar is showing a placeholder window, not real matches.
    // Iter 126b · Fixtures pre-filtered by ground_id when a specific ground is
    // selected — so the tile paint below and the ground-availability sidebar
    // both work off the same subset.
    const filteredMatches = useMemo(() => {
        if (groundId === "all") return matches || [];
        return (matches || []).filter((m) => (m.ground_id || "") === groundId);
    }, [matches, groundId]);

    const matchesByTid = useMemo(() => {
        const map = new Map();   // tid → { dates:Set<ISO>, byDate:Map<ISO, [fixtures]> }
        filteredMatches.forEach((f) => {
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
    }, [filteredMatches]);

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

    // Iter 126 · Calendar shows only ACTUAL match days (from the tournament's
    // Match Calendar). Tournaments without any published fixtures don't paint
    // the day grid at all — they surface in the "Undated / Awaiting Schedule"
    // section below, so the month view never looks like every tournament runs
    // every day of the month just because a span was declared.
    const tournamentsForDate = (date) => {
        if (!date) return [];
        const iso = toISODate(date);
        return filtered.reduce((acc, t) => {
            const bucket = matchesByTid.get(t.id);
            if (bucket && bucket.dates.has(iso)) {
                acc.push({ tournament: t, fixtures: bucket.byDate.get(iso) || [], unscheduled: false });
            }
            return acc;
        }, []);
    };

    // Iter 126 · A tournament is "unscheduled" if it has no fixtures yet
    // (regardless of whether start_date was set). Truly undated OR fixture-less
    // tournaments land in the bottom "Awaiting Schedule" section.
    const unscheduled = filtered.filter((t) => {
        const bucket = matchesByTid.get(t.id);
        return !bucket || bucket.dates.size === 0;
    });
    const monthTournaments = filtered.filter((t) => {
        // A tournament is "in this month" iff any of its fixtures fall in it.
        const bucket = matchesByTid.get(t.id);
        if (!bucket || bucket.dates.size === 0) return false;
        for (const iso of bucket.dates) {
            const d = new Date(iso + "T00:00:00");
            if (d >= monthFirst && d <= monthLast) return true;
        }
        return false;
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

    // Iter 126b · Ground options gathered from all fixtures. `ground_name`
    // snapshot is what gets displayed; grounds without an id are grouped
    // under a synthetic "By name" bucket so old fixtures still filter.
    const groundOptions = useMemo(() => {
        const seen = new Map(); // id → name
        (matches || []).forEach((m) => {
            const gid = m.ground_id || (m.ground_name ? `name:${m.ground_name}` : "");
            if (!gid) return;
            if (!seen.has(gid)) seen.set(gid, m.ground_name || m.venue_name || gid);
        });
        return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [matches]);

    // Iter 126b · When a specific ground is selected, compute per-day booking
    // status for that ground within the current month so the availability
    // strip can render busy/free days.
    const groundAvailability = useMemo(() => {
        if (groundId === "all") return null;
        const busy = new Map(); // ISO → [fixtures]
        filteredMatches.forEach((f) => {
            const d = (f.match_date || f.scheduled_date || "").slice(0, 10);
            if (!d) return;
            const arr = busy.get(d) || [];
            arr.push(f);
            busy.set(d, arr);
        });
        const days = [];
        for (let day = 1; day <= daysInMonth(year, month); day += 1) {
            const iso = toISODate(new Date(year, month, day));
            days.push({ iso, day, fixtures: busy.get(iso) || [] });
        }
        return {
            groundName: (groundOptions.find((g) => g.id === groundId) || {}).name || groundId,
            days,
            busyDays: Array.from(busy.keys()).filter((k) => {
                const d = new Date(k + "T00:00:00");
                return d >= monthFirst && d <= monthLast;
            }).length,
        };
    }, [groundId, groundOptions, filteredMatches, year, month, monthFirst, monthLast]);

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

                    {/* Iter 126b · Ground filter */}
                    {groundOptions.length > 0 && (
                        <select
                            value={groundId}
                            onChange={(e) => setGroundId(e.target.value)}
                            className="input-heritage !py-1.5 !text-xs max-w-[240px]"
                            data-testid="cal-ground-select"
                            title="Filter fixtures by ground to see day-by-day availability"
                        >
                            <option value="all">All grounds ({groundOptions.length})</option>
                            {groundOptions.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
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
                {/* Iter 126 · Unscheduled tournaments no longer paint the grid;
                    they show at the bottom of the page. */}
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-dashed border-mpca-gray-dark opacity-60 italic text-mpca-gray-dark">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" /> Unscheduled (see below)
                </span>
            </div>

            {/* Iter 126b · Ground availability strip — shows busy/free days for
                the selected ground so schedulers can eyeball capacity before
                booking a fixture. */}
            {groundAvailability && (
                <div className="bulletin-card p-4 mb-4" data-testid="cal-ground-availability">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div>
                            <div className="overline text-mpca-oxblood">Ground Availability</div>
                            <div className="font-serif text-lg text-mpca-green-dark">{groundAvailability.groundName}</div>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                            <span className="text-mpca-oxblood font-semibold">{groundAvailability.busyDays}</span> busy · <span className="text-mpca-green-dark font-semibold">{groundAvailability.days.length - groundAvailability.busyDays}</span> free · {MONTH_NAMES[month]} {year}
                        </div>
                    </div>
                    <div className="grid grid-cols-16 md:grid-cols-31 gap-1" style={{ gridTemplateColumns: `repeat(${groundAvailability.days.length}, minmax(0, 1fr))` }}>
                        {groundAvailability.days.map((d) => {
                            const busy = d.fixtures.length > 0;
                            const tip = busy
                                ? d.fixtures.map((f) => `${f.home_team || "?"} v ${f.away_team || "?"}${(f.start_time || f.scheduled_time) ? " @ " + (f.start_time || f.scheduled_time) : ""}`).join(" · ")
                                : "Free · ground is available on this date";
                            return (
                                <div
                                    key={d.iso}
                                    title={`${d.iso} — ${tip}`}
                                    className={`aspect-square flex items-center justify-center text-[10px] font-mono border ${
                                        busy
                                            ? "bg-mpca-oxblood/70 text-mpca-ivory border-mpca-oxblood"
                                            : "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/30"
                                    }`}
                                    data-testid={`ground-cell-${d.iso}`}
                                >
                                    {d.day}
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-[10px] text-mpca-gray-dark">
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-mpca-oxblood/70" /> Booked</span>
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-mpca-green-dark/10 border border-mpca-green-dark/30" /> Available</span>
                        <span className="italic ml-auto">Hover a cell for the fixtures on that day. Change ground from the toolbar.</span>
                    </div>
                </div>
            )}

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
                                    {trns.slice(0, 3).map(({ tournament: t, fixtures }) => {
                                        const s = styleFor(t);
                                        // Iter 126 · Fixtures always populated (span-fallback removed).
                                        const fixTip = fixtures.length > 0
                                            ? " · " + fixtures.slice(0, 3).map((f) => `${f.home_team} v ${f.away_team}${(f.start_time || f.scheduled_time) ? " @ " + (f.start_time || f.scheduled_time) : ""}`).join(", ")
                                            : "";
                                        return (
                                            <Link
                                                key={t.id + (fixtures[0]?.id || "-")}
                                                to={`/tournaments/${t.id}`}
                                                className={`block text-[10px] px-1.5 py-0.5 border-l-2 ${s.border} ${s.bg} ${s.text} truncate hover:opacity-80 transition`}
                                                title={`${t.name} · Host ${t.host_body_id}${t.venue_name_snapshot ? " · " + t.venue_name_snapshot : ""}${fixTip}`}
                                                data-testid={`cal-trn-${t.id}`}
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

            {/* Iter 126 · Unscheduled tournaments (no match calendar fixtures yet). */}
            {unscheduled.length > 0 && (
                <div className="bulletin-card p-6" data-testid="cal-undated">
                    <div className="flex items-center gap-2 mb-3">
                        <Info size={14} className="text-mpca-oxblood" strokeWidth={1.5} />
                        <div className="overline">Awaiting Match Calendar ({unscheduled.length})</div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                        {unscheduled.map((t) => {
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
                                        {t.host_body_id}{t.start_date ? " · " + t.start_date : ""}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                    <div className="mt-3 text-[10px] italic text-mpca-gray-dark">
                        These tournaments have no fixtures in the Match Calendar yet. Publish fixtures in the tournament workspace to have them light up here on the correct dates.
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
