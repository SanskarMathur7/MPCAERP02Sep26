// MPCA-217 · Sprint 3 · Days Engine Panel
// ─────────────────────────────────────────
// Shows the auto-derived Match Days / Non-Match Days per fixture, a calendar
// strip, and lets MPCA/host override actual_days, nmd_manual, other_pax
// per fixture (fields feed the unified budget engine).
import { useEffect, useMemo, useState } from "react";
import { Loader2, Calendar as CalendarIcon, Save } from "lucide-react";
import { api } from "@/lib/api";

const TILE = "border border-mpca-brass/30 bg-white px-4 py-3 flex flex-col gap-1";

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
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-5" data-testid="days-engine-panel">
            <div>
                <div className="overline text-[9px]">Article X · Days Engine · Auto-derived</div>
                <div className="font-serif text-lg text-mpca-green-dark mt-1 flex items-center gap-2">
                    <CalendarIcon size={16} strokeWidth={1.5} /> Match Days · Non-Match Days
                </div>
                <div className="text-[11px] text-mpca-gray-dark mt-1">
                    Match Days come from each fixture&apos;s <code>from → to</code> dates.
                    Non-Match Days are automatically inferred from the calendar gap immediately before each match
                    (1 for the first, larger for later rounds). Override per fixture below when needed.
                </div>
            </div>

            {err && (
                <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-3 text-xs text-mpca-oxblood" data-testid="days-engine-err">{err}</div>
            )}

            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="days-engine-tiles">
                <div className={TILE}>
                    <div className="overline text-[9px]">Match Days</div>
                    <div className="font-mono text-2xl text-mpca-green-dark" data-testid="tile-total-md">{totals.match_days || 0}</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[9px]">NMD (Auto)</div>
                    <div className="font-mono text-2xl text-mpca-brass" data-testid="tile-total-nmd-auto">{totals.non_match_days_auto || 0}</div>
                    <div className="text-[9px] text-mpca-gray-dark">calendar-derived</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[9px]">NMD (Effective)</div>
                    <div className="font-mono text-2xl text-mpca-oxblood" data-testid="tile-total-nmd-eff">{totals.non_match_days_effective || 0}</div>
                    <div className="text-[9px] text-mpca-gray-dark">after manual overrides</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[9px]">Days Span</div>
                    <div className="font-mono text-2xl text-mpca-charcoal" data-testid="tile-days-span">{totals.days_span || 0}</div>
                    <div className="text-[9px] text-mpca-gray-dark">first → last date</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[9px]">Matches</div>
                    <div className="font-mono text-2xl text-mpca-navy" data-testid="tile-match-count">{totals.match_count || 0}</div>
                    <div className="text-[9px] text-mpca-gray-dark">{totals.overrides_used || 0} manual override(s)</div>
                </div>
            </div>

            {/* Calendar strip */}
            {calendar.length > 0 && (
                <div>
                    <div className="overline text-[9px] mb-2">Tournament Calendar</div>
                    <div className="flex items-center gap-4 mb-2 text-[10px] text-mpca-gray-dark">
                        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-mpca-green-dark"></span>Match Day</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 border border-dashed border-mpca-brass bg-mpca-parchment/60"></span>Non-Match Day</span>
                    </div>
                    <div className="space-y-1" data-testid="days-engine-calendar">
                        {calendarByWeek.map((wk, wi) => (
                            <div key={wi} className="flex gap-1">
                                {wk.map((cell, ci) => {
                                    if (!cell) return <div key={ci} className="w-10 h-10" />;
                                    const isMD = cell.status === "MD";
                                    const d = new Date(cell.date + "T12:00:00");
                                    return (
                                        <div
                                            key={ci}
                                            title={cell.date}
                                            className={`w-10 h-10 flex flex-col items-center justify-center text-[9px] font-mono border ${isMD ? "bg-mpca-green-dark text-mpca-gold-light border-mpca-green-dark" : "bg-mpca-parchment/60 border-dashed border-mpca-brass text-mpca-brass"}`}
                                            data-testid={`cal-${cell.date}-${cell.status}`}
                                        >
                                            <span>{d.getDate()}</span>
                                            <span className="text-[7px] opacity-80">{d.toLocaleDateString("en-IN", { month: "short" })}</span>
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
                <div className="overline text-[9px] mb-2">Per-Match Breakdown</div>
                <div className="overflow-x-auto border border-mpca-brass/30">
                    <table className="w-full text-xs" data-testid="days-engine-table">
                        <thead className="bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                            <tr>
                                <th className="px-2 py-2 text-left">Match</th>
                                <th className="px-2 py-2 text-left">Teams</th>
                                <th className="px-2 py-2 text-left">From → To</th>
                                <th className="px-2 py-2 text-right">Span</th>
                                <th className="px-2 py-2 text-right">MD</th>
                                <th className="px-2 py-2 text-right">NMD (Auto)</th>
                                <th className="px-2 py-2 text-right w-24">Actual Days</th>
                                <th className="px-2 py-2 text-right w-24">NMD Manual</th>
                                <th className="px-2 py-2 text-right w-20">Other Pax</th>
                                <th className="px-2 py-2 text-right">Officials</th>
                                <th className="px-2 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {matches.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="px-3 py-6 text-center italic text-mpca-gray-dark">
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
                                        <td className="px-2 py-2 font-serif text-mpca-green-dark">{m.label || "—"}</td>
                                        <td className="px-2 py-2 text-mpca-charcoal">
                                            <span className="text-[10px] font-mono">{m.team_a || "?"} v {m.team_b || "?"}</span>
                                        </td>
                                        <td className="px-2 py-2 font-mono text-[10px] text-mpca-brass">
                                            {m.from_date || "—"} → {m.to_date || "—"}
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono">{m.match_days + m.shortfall_days}</td>
                                        <td className="px-2 py-2 text-right font-mono font-semibold text-mpca-green-dark">{m.match_days}</td>
                                        <td className="px-2 py-2 text-right font-mono text-mpca-brass">{m.non_match_days_auto}</td>
                                        <td className="px-2 py-2 text-right">
                                            <input
                                                type="number" min={0}
                                                className="input-heritage !py-1 !text-xs font-mono w-16 text-right"
                                                value={e.actual_days ?? ""}
                                                disabled={!canEdit}
                                                onChange={(ev) => patchField(m.id, "actual_days", ev.target.value)}
                                                placeholder={String(m.match_days + m.shortfall_days)}
                                                data-testid={`de-actual-days-${m.id}`}
                                            />
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            <input
                                                type="number" min={0}
                                                className="input-heritage !py-1 !text-xs font-mono w-16 text-right"
                                                value={e.nmd_manual ?? ""}
                                                disabled={!canEdit}
                                                onChange={(ev) => patchField(m.id, "nmd_manual", ev.target.value)}
                                                placeholder={`auto ${m.non_match_days_auto}`}
                                                data-testid={`de-nmd-manual-${m.id}`}
                                            />
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            <input
                                                type="number" min={0}
                                                className="input-heritage !py-1 !text-xs font-mono w-14 text-right"
                                                value={e.other_pax ?? 0}
                                                disabled={!canEdit}
                                                onChange={(ev) => patchField(m.id, "other_pax", ev.target.value)}
                                                data-testid={`de-other-pax-${m.id}`}
                                            />
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono text-mpca-navy">{m.officials_count}</td>
                                        <td className="px-2 py-2 text-right">
                                            {canEdit && dirty && (
                                                <button
                                                    onClick={() => saveRow(m.id)}
                                                    disabled={saving[m.id]}
                                                    className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40 ml-auto"
                                                    data-testid={`de-save-${m.id}`}
                                                >
                                                    {saving[m.id] ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="text-[10px] text-mpca-gray-dark italic mt-2">
                    <b>Actual Days</b> — for multi-day matches that ended early (e.g. Ranji Day-2 finish). Blank = play the full span.
                    &nbsp;·&nbsp;<b>NMD Manual</b> — override the auto-derived NMD for this match. Blank = use auto value.
                    &nbsp;·&nbsp;<b>Other Pax</b> — VIPs / ground staff / support counted in the AllPax driver.
                </div>
            </div>
        </div>
    );
}
