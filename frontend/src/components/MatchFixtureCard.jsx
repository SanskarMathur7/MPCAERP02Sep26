// MPCA-218 · Match Fixture Card — inline expandable editor for one match.
// Replicates the MPCA Inter-Division Utility card UX: all 15 fields in a
// clean grid + a live-computed footer summary. Officials multi-selects pull
// from the tournament's Match Officials tab (MPCA-assigned roster).
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Save, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";

const inputCls = "input-heritage !py-1.5 !text-sm w-full";
const labelCls = "text-[10px] uppercase tracking-widest text-mpca-brass mb-1";

const STAGE_COLORS = {
    League:        "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40",
    Practice:      "bg-mpca-gray-dark/15 text-mpca-gray-dark border-mpca-gray-dark/40",
    Quarter_Final: "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40",
    Semi_Final:    "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/40",
    Final:         "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood",
};

// A pill-style multi-select — click a chip to remove; select from dropdown to add.
function OfficialsPicker({ label, count, options, selected, onChange, testId, disabled }) {
    // Filter out already-selected from the dropdown
    const remaining = options.filter((o) => !selected.includes(o.id));
    return (
        <div>
            <div className={labelCls} data-testid={`${testId}-label`}>
                {label} <span className="text-mpca-gray-dark normal-case tracking-normal ml-1">count {count}</span>
            </div>
            <div className="border border-mpca-brass/30 bg-white px-2 py-1.5 flex flex-wrap gap-1 min-h-[38px]" data-testid={testId}>
                {selected.map((id) => {
                    const opt = options.find((o) => o.id === id);
                    return (
                        <span
                            key={id}
                            className="inline-flex items-center gap-1 bg-mpca-parchment/70 border border-mpca-brass/30 px-2 py-0.5 text-xs text-mpca-charcoal"
                            data-testid={`${testId}-chip-${id}`}
                        >
                            {opt?.name || id}
                            {!disabled && (
                                <button
                                    onClick={() => onChange(selected.filter((x) => x !== id))}
                                    className="text-mpca-oxblood hover:text-mpca-oxblood/70"
                                    data-testid={`${testId}-chip-remove-${id}`}
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </span>
                    );
                })}
                {!disabled && (
                    <select
                        className="bg-transparent text-xs text-mpca-gray-dark focus:outline-none min-w-[100px] flex-1"
                        value=""
                        onChange={(e) => e.target.value && onChange([...selected, e.target.value])}
                        data-testid={`${testId}-add`}
                    >
                        <option value="">+ add…</option>
                        {remaining.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                )}
            </div>
        </div>
    );
}

export default function MatchFixtureCard({
    match,           // TournamentMatch or new draft (id may be null)
    idx,             // display number (M01, M02…)
    canEdit,
    tournament,
    teamOptions,     // ["DIV-BPL", ...]
    poolOptions,     // [{id, name, host_division_code, ...}]
    officialsByRole, // {umpires:[{id,name}], scorers:[...], selectors:[...], observers:[...]}
    onSaved,         // callback after successful save
    onDeleted,       // callback after successful delete
    onCancel,        // callback for cancelling a new draft
    startExpanded = false,
}) {
    const [expanded, setExpanded] = useState(startExpanded);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);

    // Local editable copy
    const [form, setForm] = useState(() => ({
        label: match.label || match.round || "",
        stage: match.stage || "League",
        pool_id: match.pool_id || "",
        home_team: match.home_team || "",
        away_team: match.away_team || "",
        squad: match.squad ?? "",
        match_date: match.match_date || "",
        to_date: match.to_date || "",
        actual_days: match.actual_days ?? "",
        nmd_manual: match.nmd_manual ?? "",
        other_pax: match.other_pax ?? 0,
        officials_ids: {
            umpires:   match.officials_ids?.umpires   || [],
            scorers:   match.officials_ids?.scorers   || [],
            selectors: match.officials_ids?.selectors || [],
            observers: match.officials_ids?.observers || [],
        },
    }));

    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const setOfficials = (role, list) => setForm((f) => ({ ...f, officials_ids: { ...f.officials_ids, [role]: list } }));

    // Compute date "days" and derived to_date
    const derivedDays = useMemo(() => {
        if (!form.match_date) return 1;
        if (!form.to_date) return 1;
        const a = new Date(form.match_date + "T12:00:00");
        const b = new Date(form.to_date + "T12:00:00");
        const d = Math.round((b - a) / 86400000) + 1;
        return Math.max(d, 1);
    }, [form.match_date, form.to_date]);

    // Live-computed footer summary (matches the utility)
    const defaultSquad = Number(tournament?.max_squad_size) || 18;
    const summary = useMemo(() => {
        const days = derivedDays;
        const actual = form.actual_days === "" || form.actual_days == null ? days : Math.min(Number(form.actual_days) || 0, days);
        const idle = Math.max(days - actual, 0);
        const nmdManual = form.nmd_manual === "" || form.nmd_manual == null ? null : Number(form.nmd_manual) || 0;
        // For a solo-card view we can't know calendar gap → show manual/idle only
        const nmd = (nmdManual ?? 0) + idle;
        const sq = form.squad === "" || form.squad == null ? defaultSquad : Number(form.squad) || defaultSquad;
        const pool = poolOptions.find((p) => p.id === form.pool_id);
        const hostCode = pool?.host_division_code || pool?.host_district_code || null;
        const sides = [form.home_team, form.away_team].filter(Boolean);
        const hostPlaying = !!(hostCode && sides.includes(hostCode));
        const teams = sides.length || 0;
        const hostPax = hostPlaying ? sq : 0;
        const awayPax = hostPlaying ? sq * (teams - 1) : sq * teams;
        const off = ["umpires", "scorers", "selectors", "observers"].reduce((a, k) => a + form.officials_ids[k].length, 0);
        const otherPax = Number(form.other_pax) || 0;
        const allPax = hostPax + awayPax + off + otherPax;
        return { days, actual, idle, nmd, teams, hostPax, awayPax, hostTeams: hostPlaying ? 1 : 0, off, allPax };
    }, [form, derivedDays, defaultSquad, poolOptions]);

    const isDraft = !match.id;
    const stagePill = STAGE_COLORS[form.stage] || STAGE_COLORS.League;
    const dateRange = form.match_date
        ? (form.to_date && form.to_date !== form.match_date
            ? `${new Date(form.match_date + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} → ${new Date(form.to_date + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
            : new Date(form.match_date + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }))
        : "no date";

    const save = async () => {
        if (!form.home_team || !form.away_team || !form.match_date) {
            setErr("Team A, Team B and Date from are required.");
            return;
        }
        setSaving(true); setErr(null);
        const payload = {
            ...form,
            squad: form.squad === "" ? null : Number(form.squad),
            actual_days: form.actual_days === "" ? null : Number(form.actual_days),
            nmd_manual: form.nmd_manual === "" ? null : Number(form.nmd_manual),
            other_pax: Number(form.other_pax) || 0,
            days: derivedDays,
            to_date: form.to_date || null,
            pool_id: form.pool_id || null,
            label: form.label || null,
        };
        try {
            if (isDraft) {
                await api.post(`/tournaments/${tournament.id}/matches`, payload);
            } else {
                await api.patch(`/tournaments/${tournament.id}/matches/${match.id}`, payload);
            }
            onSaved?.();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        if (!window.confirm("Delete this match?")) return;
        setSaving(true);
        try {
            await api.delete(`/tournaments/${tournament.id}/matches/${match.id}`);
            onDeleted?.();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory" data-testid={`fixture-card-${match.id || "draft"}`}>
            {/* Collapsed header — click to expand */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-mpca-parchment/50 text-left"
                data-testid={`fixture-card-toggle-${match.id || "draft"}`}
            >
                <span className={`px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold border ${stagePill}`}>{form.stage.replace(/_/g, " ")}</span>
                <span className="font-serif text-mpca-green-dark font-semibold text-base">{form.label || `Match ${idx || "?"}`}</span>
                <span className="text-xs text-mpca-gray-dark font-mono">
                    · {form.home_team || "?"} v {form.away_team || "?"}
                    <span className="mx-1">·</span>
                    {dateRange}
                    <span className="mx-1">·</span>
                    {summary.actual} match {summary.actual === 1 ? "day" : "days"}
                </span>
                <span className="ml-auto">
                    {expanded ? <ChevronUp size={16} className="text-mpca-brass" /> : <ChevronDown size={16} className="text-mpca-brass" />}
                </span>
            </button>

            {expanded && (
                <div className="px-4 pb-4 pt-2 border-t border-mpca-brass/20" data-testid={`fixture-card-body-${match.id || "draft"}`}>
                    {err && (
                        <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-2 text-xs text-mpca-oxblood mb-3" data-testid={`fixture-card-err-${match.id || "draft"}`}>{err}</div>
                    )}

                    {/* Row 1: Label · Type · Pool · Teams-from hint */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <div className={labelCls}>Match label</div>
                            <input className={inputCls} value={form.label} onChange={(e) => setField("label", e.target.value)} disabled={!canEdit} placeholder="League R1" data-testid="fx-label" />
                        </div>
                        <div>
                            <div className={labelCls}>Type of match</div>
                            <select className={inputCls} value={form.stage} onChange={(e) => setField("stage", e.target.value)} disabled={!canEdit} data-testid="fx-stage">
                                <option value="League">League</option>
                                <option value="Practice">Practice</option>
                                <option value="Quarter_Final">Quarter Final</option>
                                <option value="Semi_Final">Semi Final</option>
                                <option value="Final">Final</option>
                            </select>
                        </div>
                        <div>
                            <div className={labelCls}>Pool</div>
                            <select className={inputCls} value={form.pool_id} onChange={(e) => setField("pool_id", e.target.value)} disabled={!canEdit} data-testid="fx-pool">
                                <option value="">— none —</option>
                                {poolOptions.map((p) => {
                                    const host = p.host_division_code || p.host_district_code || "";
                                    return <option key={p.id} value={p.id}>{p.name}{host ? ` (host ${host})` : ""}</option>;
                                })}
                            </select>
                        </div>
                        <div className="flex items-center pt-6 text-xs text-mpca-gray-dark">
                            {form.pool_id && (() => {
                                const pool = poolOptions.find((p) => p.id === form.pool_id);
                                const host = pool?.host_division_code || pool?.host_district_code;
                                return <span>Teams from <b>{pool?.name}</b>{host ? <> · host <b>{host}</b></> : null}</span>;
                            })()}
                        </div>
                    </div>

                    {/* Row 2: Team A · Team B · Squad · Umpires */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <div className={labelCls}>Team A</div>
                            <select className={inputCls} value={form.home_team} onChange={(e) => setField("home_team", e.target.value)} disabled={!canEdit} data-testid="fx-team-a">
                                <option value="">— pick —</option>
                                {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className={labelCls}>Team B</div>
                            <select className={inputCls} value={form.away_team} onChange={(e) => setField("away_team", e.target.value)} disabled={!canEdit} data-testid="fx-team-b">
                                <option value="">— pick —</option>
                                {teamOptions.filter((t) => t !== form.home_team).map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className={labelCls}>Squad size per team <span className="text-mpca-gray-dark normal-case tracking-normal">pax · blank = {defaultSquad}</span></div>
                            <input type="number" min={0} className={inputCls} value={form.squad} onChange={(e) => setField("squad", e.target.value)} disabled={!canEdit} placeholder={String(defaultSquad)} data-testid="fx-squad" />
                        </div>
                        <OfficialsPicker
                            label="Umpires"
                            count={form.officials_ids.umpires.length}
                            options={officialsByRole.umpires}
                            selected={form.officials_ids.umpires}
                            onChange={(v) => setOfficials("umpires", v)}
                            testId="fx-umpires"
                            disabled={!canEdit}
                        />
                    </div>

                    {/* Row 3: Scorers · Selectors · Observers · Other pax */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <OfficialsPicker
                            label="Scorers"
                            count={form.officials_ids.scorers.length}
                            options={officialsByRole.scorers}
                            selected={form.officials_ids.scorers}
                            onChange={(v) => setOfficials("scorers", v)}
                            testId="fx-scorers"
                            disabled={!canEdit}
                        />
                        <OfficialsPicker
                            label="Selectors"
                            count={form.officials_ids.selectors.length}
                            options={officialsByRole.selectors}
                            selected={form.officials_ids.selectors}
                            onChange={(v) => setOfficials("selectors", v)}
                            testId="fx-selectors"
                            disabled={!canEdit}
                        />
                        <OfficialsPicker
                            label="Observers"
                            count={form.officials_ids.observers.length}
                            options={officialsByRole.observers}
                            selected={form.officials_ids.observers}
                            onChange={(v) => setOfficials("observers", v)}
                            testId="fx-observers"
                            disabled={!canEdit}
                        />
                        <div>
                            <div className={labelCls}>Other pax count <span className="text-mpca-gray-dark normal-case tracking-normal">ground staff, guests…</span></div>
                            <input type="number" min={0} className={inputCls} value={form.other_pax} onChange={(e) => setField("other_pax", e.target.value)} disabled={!canEdit} data-testid="fx-other-pax" />
                        </div>
                    </div>

                    {/* Row 4: Date from · Date to · Actual days */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <div className={labelCls}>Date from</div>
                            <input type="date" className={inputCls} value={form.match_date} onChange={(e) => setField("match_date", e.target.value)} disabled={!canEdit} data-testid="fx-date-from" />
                        </div>
                        <div>
                            <div className={labelCls}>Date to</div>
                            <input type="date" className={inputCls} value={form.to_date} onChange={(e) => setField("to_date", e.target.value)} disabled={!canEdit} min={form.match_date || undefined} data-testid="fx-date-to" />
                        </div>
                        <div>
                            <div className={labelCls}>Actual days played <span className="text-mpca-gray-dark normal-case tracking-normal">of {summary.days} scheduled · blank = full {summary.days}</span></div>
                            <input type="number" min={0} max={summary.days} className={inputCls} value={form.actual_days} onChange={(e) => setField("actual_days", e.target.value)} disabled={!canEdit} placeholder={String(summary.days)} data-testid="fx-actual-days" />
                        </div>
                        <div>
                            <div className={labelCls}>NMD manual override <span className="text-mpca-gray-dark normal-case tracking-normal">blank = calendar-derived</span></div>
                            <input type="number" min={0} className={inputCls} value={form.nmd_manual} onChange={(e) => setField("nmd_manual", e.target.value)} disabled={!canEdit} placeholder="auto" data-testid="fx-nmd-manual" />
                        </div>
                    </div>

                    {/* Live footer — mirrors the utility */}
                    <div className="border-t border-mpca-brass/20 pt-3 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" data-testid={`fx-summary-${match.id || "draft"}`}>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">Match days</span> <b className="text-mpca-green-dark ml-1">{summary.actual}</b>{summary.idle > 0 && <span className="text-mpca-oxblood ml-1">({summary.actual} of {summary.days}; {summary.idle} idle)</span>}</span>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">Non-match days</span> <b className="text-mpca-brass ml-1">{summary.nmd}</b>{summary.idle > 0 && <span className="text-mpca-gray-dark ml-1">(incl. idle)</span>}</span>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">Host pax</span> <b className="text-mpca-charcoal ml-1">{summary.hostPax}</b></span>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">Away pax</span> <b className="text-mpca-charcoal ml-1">{summary.awayPax}</b></span>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">Teams</span> <b className="text-mpca-charcoal ml-1">{summary.teams}</b></span>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">Host teams</span> <b className="text-mpca-charcoal ml-1">{summary.hostTeams}</b></span>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">Officials</span> <b className="text-mpca-navy ml-1">{summary.off}</b></span>
                        <span><span className="text-mpca-gray-dark uppercase tracking-widest text-[10px]">All pax</span> <b className="text-mpca-oxblood ml-1">{summary.allPax}</b></span>

                        <div className="ml-auto flex items-center gap-2">
                            {canEdit && !isDraft && (
                                <button
                                    onClick={remove}
                                    disabled={saving}
                                    className="text-[11px] uppercase tracking-widest border border-mpca-oxblood/60 text-mpca-oxblood px-3 py-1.5 hover:bg-mpca-oxblood/10 flex items-center gap-1 disabled:opacity-40"
                                    data-testid={`fx-delete-${match.id}`}
                                >
                                    <Trash2 size={11} /> Delete match
                                </button>
                            )}
                            {canEdit && isDraft && (
                                <button onClick={onCancel} className="text-[11px] uppercase tracking-widest text-mpca-gray-dark px-3 py-1.5 hover:text-mpca-oxblood flex items-center gap-1">
                                    <X size={11} /> Cancel
                                </button>
                            )}
                            {canEdit && (
                                <button
                                    onClick={save}
                                    disabled={saving}
                                    className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"
                                    data-testid={`fx-save-${match.id || "draft"}`}
                                >
                                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                    {isDraft ? "Add match" : "Save"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
