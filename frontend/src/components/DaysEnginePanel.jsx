// MPCA-217 · Sprint 3 · Days Engine Panel
// ─────────────────────────────────────────
// Shows the auto-derived Match Days / Non-Match Days per fixture, a calendar
// strip, and lets MPCA/host override actual_days, nmd_manual, other_pax
// per fixture (fields feed the unified budget engine).
import { useEffect, useMemo, useState } from "react";
import { Loader2, Calendar as CalendarIcon, Save } from "lucide-react";
import { api } from "@/lib/api";

const TILE = "border border-mpca-brass/30 bg-white px-5 py-4 flex flex-col gap-1";

export default function DaysEnginePanel({ tournament, canEdit }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [saving, setSaving] = useState({});   // fid → bool
    const [edits, setEdits] = useState({});     // fid → { actual_days, nmd_manual, other_pax }

    const load = async () => {
        setLoading(true); setErr(null);
        try {
            const { data: d } = await api.get(`/tournaments/${tournament.id}/days-engine`);
            setData(d);
            // Initialise edits with current values so onChange is comparable.
            const initial = {};
            (d.matches || []).forEach((m) => {
                initial[m.id] = {
                    actual_days: m.match_days ?? "",
                    nmd_manual: m.nmd_manual ?? "",
                    other_pax: m.other_pax ?? 0,
                };
            });
            setEdits(initial);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [tournament.id]);

    const patchField = async (fid, field, value) => {
        setEdits((e) => ({ ...e, [fid]: { ...(e[fid] || {}), [field]: value } }));
    };

    const saveRow = async (fid) => {
        const patch = edits[fid] || {};
        const clean = {};
        // Empty → null (clear override); non-empty → coerce to number
        for (const k of ["actual_days", "nmd_manual", "other_pax"]) {
            const v = patch[k];
            if (v === "" || v === null || v === undefined) {
                clean[k] = null;
            } else {
                const n = Number(v);
                clean[k] = Number.isFinite(n) ? n : null;
            }
        }
        setSaving((s) => ({ ...s, [fid]: true }));
        try {
            await api.patch(`/fixtures/${fid}`, clean);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving((s) => ({ ...s, [fid]: false })); }
    };

    const totals = data?.totals || {};
    const calendar = data?.calendar || [];
    const perMatch = data?.matches || [];
    // MPCA-232 · Build a date → matches lookup so calendar cells can overlay fixtures.
    const matchesByDate = useMemo(() => {
        const map = {};
        (perMatch || []).forEach((m) => {
            const from = m.from_date || m.match_date;
            const to = m.to_date || from;
            if (!from) return;
            const start = new Date(from + "T12:00:00");
            const end = new Date(to + "T12:00:00");
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const iso = d.toISOString().split("T")[0];
                (map[iso] = map[iso] || []).push(m);
            }
        });
        return map;
    }, [perMatch]);
    const matches = data?.matches || [];

    // Rough day-of-week + week labels for the strip
    const calendarByWeek = useMemo(() => {
        const weeks = [];
        let current = [];
        calendar.forEach((cell, i) => {
            const dow = new Date(cell.date + "T12:00:00").getDay();   // 0=Sun
            if (i === 0) {
                // pad left so week starts on Mon
                const pad = (dow + 6) % 7;
                for (let k = 0; k < pad; k++) current.push(null);
            }
            current.push(cell);
            if (((dow + 6) % 7) === 6) {
                weeks.push(current); current = [];
            }
        });
        if (current.length) weeks.push(current);
        return weeks;
    }, [calendar]);

    if (loading) {
        return (
            <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 text-center text-mpca-brass text-sm flex items-center gap-2 justify-center" data-testid="days-engine-loading">
                <Loader2 size={16} className="animate-spin" /> Loading days engine…
            </div>
        );
    }

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-6 space-y-6" data-testid="days-engine-panel">
            <div>
                <div className="overline text-[10px]">Article X · Days Engine · Auto-derived</div>
                <div className="font-serif text-2xl text-mpca-green-dark mt-2 flex items-center gap-2">
                    <CalendarIcon size={22} strokeWidth={1.5} /> Match Days · Non-Match Days
                </div>
                <div className="text-sm text-mpca-gray-dark mt-2 leading-relaxed max-w-4xl">
                    Match Days come from each fixture&apos;s <code className="bg-mpca-parchment/60 px-1 rounded">scheduled_date + days</code> (or <code className="bg-mpca-parchment/60 px-1 rounded">from → to</code> when present).
                    Non-Match Days are auto-inferred from the calendar gap immediately before each match — <b>1 day</b> for the very first match (arrival day)
                    and <b>the number of empty days</b> before every later round. Override per fixture below when needed.
                </div>
                {/* Data source hint */}
                <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-3 py-1.5 flex items-center gap-2">
                        <span className="overline text-[9px] text-mpca-brass">Data Source</span>
                        <code className="font-mono text-mpca-charcoal">GET /api/tournaments/{tournament.id?.slice(0, 8)}…/days-engine</code>
                    </div>
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-3 py-1.5 flex items-center gap-2">
                        <span className="overline text-[9px] text-mpca-brass">Reads From</span>
                        <code className="font-mono text-mpca-charcoal">Match Calendar · fixtures collection</code>
                    </div>
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-3 py-1.5 flex items-center gap-2">
                        <span className="overline text-[9px] text-mpca-brass">Feeds Into</span>
                        <code className="font-mono text-mpca-charcoal">Unified Budget compute (Sprint 4)</code>
                    </div>
                </div>
            </div>

            {err && (
                <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-3 text-xs text-mpca-oxblood" data-testid="days-engine-err">{err}</div>
            )}

            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="days-engine-tiles">
                <div className={TILE}>
                    <div className="overline text-[10px]">Match Days</div>
                    <div className="font-mono text-4xl text-mpca-green-dark leading-none" data-testid="tile-total-md">{totals.match_days || 0}</div>
                    <div className="text-[10px] text-mpca-gray-dark">days actually played</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[10px]">NMD (Auto)</div>
                    <div className="font-mono text-4xl text-mpca-brass leading-none" data-testid="tile-total-nmd-auto">{totals.non_match_days_auto || 0}</div>
                    <div className="text-[10px] text-mpca-gray-dark">calendar-derived</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[10px]">NMD (Effective)</div>
                    <div className="font-mono text-4xl text-mpca-oxblood leading-none" data-testid="tile-total-nmd-eff">{totals.non_match_days_effective || 0}</div>
                    <div className="text-[10px] text-mpca-gray-dark">after manual overrides</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[10px]">Days Span</div>
                    <div className="font-mono text-4xl text-mpca-charcoal leading-none" data-testid="tile-days-span">{totals.days_span || 0}</div>
                    <div className="text-[10px] text-mpca-gray-dark">first → last date</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[10px]">Matches</div>
                    <div className="font-mono text-4xl text-mpca-navy leading-none" data-testid="tile-match-count">{totals.match_count || 0}</div>
                    <div className="text-[10px] text-mpca-gray-dark">{totals.overrides_used || 0} manual override(s)</div>
                </div>
            </div>

            {/* Calendar strip */}
            {calendar.length > 0 && (
                <div>
                    <div className="overline text-[10px] mb-2">Tournament Calendar</div>
                    <div className="flex items-center gap-4 mb-3 text-xs text-mpca-gray-dark">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 bg-mpca-green-dark"></span>Match Day</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-4 border border-dashed border-mpca-brass bg-mpca-parchment/60"></span>Non-Match Day</span>
                        <span className="text-mpca-brass italic ml-4">Hover a cell for the full fixture list</span>
                    </div>
                    <div className="space-y-2" data-testid="days-engine-calendar">
                        {calendarByWeek.map((wk, wi) => (
                            <div key={wi} className="flex gap-2">
                                {wk.map((cell, ci) => {
                                    if (!cell) return <div key={ci} className="w-32 h-24" />;
                                    const isMD = cell.status === "MD";
                                    const d = new Date(cell.date + "T12:00:00");
                                    const dayMatches = matchesByDate[cell.date] || [];
                                    const tooltip = dayMatches.length
                                        ? `${cell.date}\n${dayMatches.map((m) => `${m.label || ""} · ${m.home_team} v ${m.away_team}${m.ground_name ? " · " + m.ground_name : ""}`).join("\n")}`
                                        : cell.date;
                                    return (
                                        <div
                                            key={ci}
                                            title={tooltip}
                                            className={`w-32 h-24 flex flex-col p-1.5 text-xs border-2 relative overflow-hidden ${isMD ? "bg-mpca-green-dark text-mpca-gold-light border-mpca-green-dark" : "bg-mpca-parchment/60 border-dashed border-mpca-brass text-mpca-brass"}`}
                                            data-testid={`cal-${cell.date}-${cell.status}`}
                                        >
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-lg font-bold font-mono leading-none">{d.getDate()}</span>
                                                <span className="text-[9px] opacity-80 uppercase tracking-widest">{d.toLocaleDateString("en-IN", { month: "short" })}</span>
                                            </div>
                                            <div className="mt-1 flex-1 overflow-hidden space-y-0.5">
                                                {dayMatches.slice(0, 3).map((m, mi) => (
                                                    <div key={mi} className={`text-[9px] leading-tight font-mono ${isMD ? "bg-mpca-gold-light/20 text-mpca-gold-light" : "bg-mpca-brass/10 text-mpca-brass"} px-1 py-0.5 truncate`}>
                                                        {(m.home_team || "?").replace(/^DIV-/, "").replace(/^DIS-/, "").slice(0, 4)} v {(m.away_team || "?").replace(/^DIV-/, "").replace(/^DIS-/, "").slice(0, 4)}
                                                    </div>
                                                ))}
                                                {dayMatches.length > 3 && (
                                                    <div className="text-[8px] opacity-70 italic">+{dayMatches.length - 3} more</div>
                                                )}
                                                {dayMatches.length === 0 && !isMD && (
                                                    <div className="text-[9px] italic opacity-60">no match</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Per-match table */}
            <div>
                <div className="overline text-[10px] mb-2">Per-Match Breakdown</div>
                <div className="overflow-x-auto border border-mpca-brass/30">
                    <table className="w-full text-sm" data-testid="days-engine-table">
                        <thead className="bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                            <tr>
                                <th className="px-3 py-3 text-left">Match</th>
                                <th className="px-3 py-3 text-left">Teams</th>
                                <th className="px-3 py-3 text-left">From → To</th>
                                <th className="px-3 py-3 text-right">Span</th>
                                <th className="px-3 py-3 text-right">MD</th>
                                <th className="px-3 py-3 text-right">NMD (Auto)</th>
                                <th className="px-3 py-3 text-right w-32">Actual Days</th>
                                <th className="px-3 py-3 text-right w-32">NMD Manual</th>
                                <th className="px-3 py-3 text-right w-24">Other Pax</th>
                                <th className="px-3 py-3 text-right">Officials</th>
                                <th className="px-3 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {matches.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="px-4 py-8 text-center italic text-mpca-gray-dark">
                                        No fixtures scheduled yet. Add matches from the Match Calendar tab first.
                                    </td>
                                </tr>
                            )}
                            {matches.map((m) => {
                                const e = edits[m.id] || {};
                                const dirty = ["actual_days", "nmd_manual", "other_pax"].some((k) => {
                                    const initial = k === "actual_days" ? (m.match_days ?? "")
                                        : k === "nmd_manual" ? (m.nmd_manual ?? "")
                                        : (m.other_pax ?? 0);
                                    return String(e[k] ?? "") !== String(initial ?? "");
                                });
                                return (
                                    <tr key={m.id} className="border-t border-mpca-brass/10" data-testid={`de-row-${m.id}`}>
                                        <td className="px-3 py-3 font-serif text-mpca-green-dark">{m.label || "—"}</td>
                                        <td className="px-3 py-3 text-mpca-charcoal">
                                            <span className="text-xs font-mono">{m.team_a || "?"} v {m.team_b || "?"}</span>
                                        </td>
                                        <td className="px-3 py-3 font-mono text-xs text-mpca-brass">
                                            {m.from_date || "—"} → {m.to_date || "—"}
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono">{m.match_days + m.shortfall_days}</td>
                                        <td className="px-3 py-3 text-right font-mono font-semibold text-mpca-green-dark text-base">{m.match_days}</td>
                                        <td className="px-3 py-3 text-right font-mono text-mpca-brass">{m.non_match_days_auto}</td>
                                        <td className="px-3 py-3 text-right">
                                            <input
                                                type="number" min={0}
                                                className="input-heritage !py-1.5 !text-sm font-mono w-20 text-right"
                                                value={e.actual_days ?? ""}
                                                disabled={!canEdit}
                                                onChange={(ev) => patchField(m.id, "actual_days", ev.target.value)}
                                                placeholder={String(m.match_days + m.shortfall_days)}
                                                data-testid={`de-actual-days-${m.id}`}
                                            />
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <input
                                                type="number" min={0}
                                                className="input-heritage !py-1.5 !text-sm font-mono w-20 text-right"
                                                value={e.nmd_manual ?? ""}
                                                disabled={!canEdit}
                                                onChange={(ev) => patchField(m.id, "nmd_manual", ev.target.value)}
                                                placeholder={`auto ${m.non_match_days_auto}`}
                                                data-testid={`de-nmd-manual-${m.id}`}
                                            />
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <input
                                                type="number" min={0}
                                                className="input-heritage !py-1.5 !text-sm font-mono w-16 text-right"
                                                value={e.other_pax ?? 0}
                                                disabled={!canEdit}
                                                onChange={(ev) => patchField(m.id, "other_pax", ev.target.value)}
                                                data-testid={`de-other-pax-${m.id}`}
                                            />
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono text-mpca-navy">{m.officials_count}</td>
                                        <td className="px-3 py-3 text-right">
                                            {canEdit && dirty && (
                                                <button
                                                    onClick={() => saveRow(m.id)}
                                                    disabled={saving[m.id]}
                                                    className="text-xs uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 ml-auto"
                                                    data-testid={`de-save-${m.id}`}
                                                >
                                                    {saving[m.id] ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="text-xs text-mpca-gray-dark italic mt-3 leading-relaxed">
                    <b>Actual Days</b> — for multi-day matches that ended early (e.g. Ranji Day-2 finish). Blank = play the full span.
                    &nbsp;·&nbsp;<b>NMD Manual</b> — override the auto-derived NMD for this match. Blank = use auto value.
                    &nbsp;·&nbsp;<b>Other Pax</b> — VIPs / ground staff / support counted in the AllPax driver.
                </div>
            </div>
        </div>
    );
}
