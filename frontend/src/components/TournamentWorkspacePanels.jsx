import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Save, X, Loader2, Lock, LockOpen, Calendar as CalIcon, Upload, FileDown, Info } from "lucide-react";
import Papa from "papaparse";
import { api } from "@/lib/api";
import MatchFixtureCard from "@/components/MatchFixtureCard";
import { useWiringStep, useWiringOwnerMatch } from "@/lib/useWiring";

const inputCls = "input-heritage !py-1.5 !text-xs";

/**
 * Sprint M19 · Match Calendar Panel
 * User adds matches (date, teams, venue, stage) manually.
 * "Lock Calendar" flips `tournaments.calendar_fixed = true` which lights
 * up the corresponding step on the progress bar.
 */
const MatchCalendarPanel = ({ tournament, canEdit, onChange }) => {
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    // Iter 123d · CSV dry-run preview — parsed rows are shown in a modal
    // so the user can eyeball everything BEFORE anything hits the DB.
    const [previewRows, setPreviewRows] = useState(null);
    // Iter 123f · Multi-select + bulk delete
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const toggleSelected = (mid) => setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(mid)) next.delete(mid); else next.add(mid);
        return next;
    });
    const clearSelection = () => setSelectedIds(new Set());
    const selectAllVisible = () => setSelectedIds(new Set(matches.map((m) => m.id)));
    const bulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (!window.confirm(`Delete ${ids.length} match${ids.length === 1 ? "" : "es"}? This cannot be undone.`)) return;
        setBulkDeleting(true);
        let ok = 0, failed = 0;
        for (const mid of ids) {
            try { await api.delete(`/tournaments/${tournament.id}/matches/${mid}`); ok++; }
            catch { failed++; }
        }
        setBulkDeleting(false);
        clearSelection();
        await load(); onChange?.();
        if (failed) alert(`Deleted ${ok} · ${failed} failed`);
    };
    const fileRef = useRef(null);
    // MPCA-243 · Ship 2 · Read the wiring step for advisory copy. When
    // `match_calendar.mode == "Manual_PDF"` (BCCI/School/Club/etc.), the
    // panel hints that team names should be free-text (e.g. away = other
    // states) rather than picked from pools. When `flag == "O"` (Optional)
    // for camps, the panel shows a "Optional · No downstream impact" chip.
    const calStep = useWiringStep(tournament?.id, "match_calendar");
    const [form, setForm] = useState({
        stage: "League", match_date: "", start_time: "10:00",
        home_team: "", away_team: "", venue_name: tournament?.venue_name_snapshot || "",
        ground_name: tournament?.ground_name_snapshot || "", notes: "",
        // MPCA-217 · Days-engine fields
        days: 1, actual_days: "", nmd_manual: "", other_pax: 0, pool_id: "",
    });

    // MPCA-217 · Pool options for the fixture (Inter-Div → division_pools · Inter-Dist → district_pools)
    const poolOptions = useMemo(() => {
        const meta = tournament?.setup_meta || {};
        return [...(meta.division_pools || []), ...(meta.district_pools || [])];
    }, [tournament?.setup_meta]);

    // M29 · Derive team options from tournament pools + ground options from Step 5 grounds.
    const teamOptions = useMemo(() => {
        const meta = tournament?.setup_meta || {};
        const codes = new Set();
        (meta.division_pools || []).forEach((p) => (p.division_codes || []).forEach((c) => codes.add(c)));
        (meta.district_pools || []).forEach((p) => (p.district_codes || []).forEach((c) => codes.add(c)));
        (meta.teams || []).forEach((t) => codes.add(t.name));
        return Array.from(codes);
    }, [tournament?.setup_meta]);

    // M30 · Fallback ground pool — if Basics hasn't been configured with grounds yet,
    // hydrate the dropdown directly from /grounds scoped to MPCA + host + participating bodies
    // so the user isn't blocked on Match Calendar entry.
    const [fallbackGrounds, setFallbackGrounds] = useState([]);
    const basicsGrounds = tournament?.setup_meta?.grounds || [];

    useEffect(() => {
        if (basicsGrounds.length > 0) return;   // Basics already configured — skip fetch
        const owners = new Set(["MPCA"]);
        if (tournament?.host_body_id) owners.add(tournament.host_body_id);
        const meta = tournament?.setup_meta || {};
        (meta.division_pools || []).forEach((p) => (p.division_codes || []).forEach((c) => owners.add(c)));
        (meta.district_pools || []).forEach((p) => (p.district_codes || []).forEach((c) => owners.add(c)));
        const ownerParam = Array.from(owners).join(",");
        api.get("/grounds", { params: { owner_body_codes: ownerParam } })
            .then((r) => setFallbackGrounds(
                (r.data || []).map((g) => ({
                    id: g.id,
                    ground_id: g.id,
                    ground_no: g.ground_no,
                    ground_name: g.name,
                    venue_name: g.venue_name,
                    owner_body_code: g.managed_by_body_id || g.owner_body_id,
                }))
            ))
            .catch(() => setFallbackGrounds([]));
    }, [basicsGrounds.length, tournament?.host_body_id, tournament?.setup_meta]);

    const groundOptions = basicsGrounds.length > 0 ? basicsGrounds : fallbackGrounds;
    const usingFallbackGrounds = basicsGrounds.length === 0 && fallbackGrounds.length > 0;

    const load = async () => {
        setLoading(true);
        try {
            const list = await api.get(`/tournaments/${tournament.id}/matches`).then((r) => r.data);
            setMatches(list || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { if (tournament?.id) load(); }, [tournament?.id]); // eslint-disable-line

    // MPCA-218 · Fetch officials MPCA has assigned to this tournament.
    // The Match Fixture Card multi-selects source their options from here.
    const [tournamentOfficials, setTournamentOfficials] = useState([]);
    useEffect(() => {
        if (!tournament?.id) return;
        api.get(`/tournaments/${tournament.id}/match-officials`)
            .then((r) => setTournamentOfficials(r.data || []))
            .catch(() => setTournamentOfficials([]));
    }, [tournament?.id]);

    // Group by role. Accepted-only (MPCA-133+ workflow). Fall back to all if none accepted.
    const officialsByRole = useMemo(() => {
        const accepted = tournamentOfficials.filter((o) => o.acceptance_status === "Accepted");
        const source = accepted.length > 0 ? accepted : tournamentOfficials;
        const bucketOf = (role) => {
            const r = String(role || "").toLowerCase();
            if (r.startsWith("umpire")) return "umpires";
            if (r.startsWith("scorer")) return "scorers";
            if (r.startsWith("selector")) return "selectors";
            if (r.startsWith("observer") || r === "match_referee" || r === "referee") return "observers";
            return null;
        };
        const out = { umpires: [], scorers: [], selectors: [], observers: [] };
        source.forEach((o) => {
            const bucket = bucketOf(o.role);
            if (bucket) out[bucket].push({ id: o.official_id, name: o.official_name || o.official_id });
        });
        return out;
    }, [tournamentOfficials]);

    const legacyAddMatch = async () => {
        if (!form.home_team || !form.away_team || !form.match_date) return alert("Date, Team 1 and Team 2 are required.");
        const payload = {
            ...form,
            days: Number(form.days) || 1,
            actual_days: form.actual_days === "" ? null : Number(form.actual_days),
            nmd_manual: form.nmd_manual === "" ? null : Number(form.nmd_manual),
            other_pax: Number(form.other_pax) || 0,
            pool_id: form.pool_id || null,
        };
        await api.post(`/tournaments/${tournament.id}/matches`, payload);
        setForm({ ...form, home_team: "", away_team: "", match_date: "", notes: "", actual_days: "", nmd_manual: "" });
        setCreating(false);
        await load();
        onChange?.();
    };
    const removeMatch = async (mid) => {
        if (!window.confirm("Delete this match?")) return;
        await api.delete(`/tournaments/${tournament.id}/matches/${mid}`);
        await load();
        onChange?.();
    };

    const lockCalendar = async (locked) => {
        await api.patch(`/tournaments/${tournament.id}/calendar-lock`, null, { params: { locked } });
        onChange?.();
    };

    // M29 · CSV bulk import · Iter 123 — template + parser aligned with
    // the TournamentMatch model. Columns:
    //   match_label   → maps to `label`     (e.g. "League R1", "SF-1")
    //   stage         → League / Quarter_Final / Semi_Final / Final / Practice
    //   pool_id       → optional pool id (A / B / … or blank)
    //   team_a_code   → home_team body_code (e.g. DIV-IND)
    //   team_b_code   → away_team body_code
    //   date_from     → YYYY-MM-DD  (match start date)
    //   date_to       → YYYY-MM-DD  (match end date — same as date_from for 1-day matches)
    //   start_time    → HH:MM 24h (default 10:00)
    //   ground_id     → Ground.id from Grounds master (preferred) OR
    //   ground_name   → free-text ground name (fallback)
    //   venue_name    → free-text stadium/complex name
    //   squad         → per-match squad-size override (blank = tournament default)
    //   notes         → free-text
    // Officials (umpires / scorers / selectors) are assigned in a follow-up
    // "Assign Officials" screen — NOT part of this CSV.
    const downloadTemplate = () => {
        const header = "match_label,stage,pool_id,team_a_code,team_b_code,date_from,date_to,start_time,ground_id,ground_name,venue_name,squad,notes\n";
        const sample =
            'League R1,League,A,DIV-IND,DIV-BPL,2026-09-01,2026-09-01,10:00,GRD-MPCA-01,MPCA Main Ground,MPCA Stadium Bhopal,18,Opening match\n' +
            'League R2,League,A,DIV-JBP,DIV-GWL,2026-09-02,2026-09-02,14:00,,Jabalpur Main Ground,Jabalpur Cricket Complex,18,\n' +
            'SF-1,Semi_Final,,DIV-IND,DIV-JBP,2026-09-15,2026-09-17,10:00,GRD-MPCA-01,MPCA Main Ground,MPCA Stadium Bhopal,18,Multi-day SF (3 days auto-calculated)\n';
        const blob = new Blob([header + sample], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `match-calendar-template-${tournament.id.slice(0,6)}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    // Helper — days between two ISO dates inclusive; 1 if invalid / missing to_date.
    const _daysBetween = (from_iso, to_iso) => {
        if (!from_iso || !to_iso) return 1;
        try {
            const f = new Date(from_iso + "T00:00:00Z");
            const t = new Date(to_iso + "T00:00:00Z");
            const diff = Math.round((t - f) / 86400000) + 1;
            return diff >= 1 ? diff : 1;
        } catch { return 1; }
    };
    // Iter 123e · Normalise a CSV date cell into ISO `YYYY-MM-DD`.
    // Accepts:
    //   • 2026-04-18        (already ISO)
    //   • 4/18/2026         (M/D/YYYY — US / Excel default)
    //   • 18/4/2026         (D/M/YYYY — Indian / EU)         ← ambiguous with above, so we check month>12
    //   • 18-04-2026        (D-M-YYYY)
    //   • 18-Apr-2026       (D-Mon-YYYY)
    //   • 2026/04/18        (Y/M/D)
    // Returns `null` for unparseable cells so the preview flags them BLOCKED.
    const _MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const _isoDate = (raw) => {
        if (!raw) return null;
        const s = String(raw).trim();
        if (!s) return null;
        // Already ISO
        let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) return `${m[1]}-${String(+m[2]).padStart(2,"0")}-${String(+m[3]).padStart(2,"0")}`;
        // YYYY/MM/DD
        m = s.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
        if (m) return `${m[1]}-${String(+m[2]).padStart(2,"0")}-${String(+m[3]).padStart(2,"0")}`;
        // Numeric with 4-digit year at the end · separator / or - or .
        m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (m) {
            let a = +m[1], b = +m[2], y = +m[3];
            // If first slot > 12, it must be D/M; else assume D/M (Indian default).
            // Fallback to M/D only when day slot would be invalid (>12) and other is valid.
            let day, month;
            if (a > 12 && b <= 12)      { day = a; month = b; }
            else if (b > 12 && a <= 12) { day = b; month = a; }        // M/D/YYYY (Excel US)
            else                        { day = a; month = b; }        // Ambiguous → D/M (India)
            if (month < 1 || month > 12 || day < 1 || day > 31) return null;
            return `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        }
        // D-Mon-YYYY  or  D Mon YYYY
        m = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{4})$/);
        if (m) {
            const mon = _MONTHS[m[2].slice(0,3).toLowerCase()];
            if (!mon) return null;
            return `${m[3]}-${String(mon).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;
        }
        return null;
    };
    // Iter 123d · Parse the CSV and open a DRY-RUN preview modal. Nothing hits
    // the DB until the user confirms via commitImport().
    const importCsv = async (file) => {
        if (!file) return;
        setImportResult(null);
        try {
            const text = await file.text();
            // M37 · Use PapaParse so commas inside quoted `notes` values don't break parsing
            const parsed = Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (h) => h.trim(),
                transform: (v) => (typeof v === "string" ? v.trim() : v),
            });
            if (parsed.errors?.length) {
                console.warn("[CSV import] parse warnings:", parsed.errors.slice(0, 3));
            }
            const teamSet = new Set(teamOptions);
            const groundSet = new Set(groundOptions.map((g) => g.ground_id || g.id));
            const previews = (parsed.data || []).map((r, idx) => {
                // Iter 123 · Prefer explicit date_from/date_to; fall back to legacy match_date + days.
                const raw_from = r.date_from || r.match_date;
                const raw_to   = r.date_to   || null;
                const from_iso = _isoDate(raw_from);
                const to_iso   = raw_to ? _isoDate(raw_to) : null;
                const days     = to_iso && from_iso ? _daysBetween(from_iso, to_iso) : (Number(r.days) || 1);
                const row = {
                    stage:      r.stage      || "League",
                    match_date: from_iso,
                    to_date:    to_iso || null,
                    home_team:  r.team_a_code || r.home_team,
                    away_team:  r.team_b_code || r.away_team,
                    start_time: r.start_time || "10:00",
                    label:      r.match_label || null,
                    pool_id:    r.pool_id || null,
                    days:       days,
                    ground_id:  r.ground_id || null,
                    ground_name:r.ground_name || "",
                    venue_name: r.venue_name || "",
                    squad:      r.squad ? Number(r.squad) : null,
                    notes:      r.notes || "",
                };
                // Validation errors (blocking) + warnings (non-blocking)
                const errs = [];
                const warns = [];
                if (!raw_from) errs.push("missing date_from");
                else if (!from_iso) errs.push(`unparseable date_from "${raw_from}" — use YYYY-MM-DD`);
                if (raw_to && !to_iso) errs.push(`unparseable date_to "${raw_to}" — use YYYY-MM-DD`);
                if (!row.home_team) errs.push("missing team_a_code");
                if (!row.away_team) errs.push("missing team_b_code");
                if (row.home_team && row.away_team && row.home_team === row.away_team) errs.push("home = away");
                if (row.home_team && teamSet.size > 0 && !teamSet.has(row.home_team)) warns.push(`team_a "${row.home_team}" not in tournament pools`);
                if (row.away_team && teamSet.size > 0 && !teamSet.has(row.away_team)) warns.push(`team_b "${row.away_team}" not in tournament pools`);
                if (row.ground_id && groundSet.size > 0 && !groundSet.has(row.ground_id)) warns.push(`ground_id "${row.ground_id}" not in Grounds master`);
                if (row.to_date && row.match_date && row.to_date < row.match_date) errs.push("date_to < date_from");
                return { line: idx + 2, row, errs, warns, ok: errs.length === 0 };
            });
            if (!previews.length) throw new Error("No rows found. Ensure the CSV header matches the downloaded template.");
            setPreviewRows(previews);
        } catch (e) {
            setImportResult({ created: 0, errors: 1, total: 0, error: e.message });
        } finally { if (fileRef.current) fileRef.current.value = ""; }
    };
    // Iter 123d · Actually POST the previewed rows once the user confirms.
    const commitImport = async () => {
        if (!previewRows) return;
        const valid = previewRows.filter((p) => p.ok);
        if (!valid.length) return;
        setImporting(true);
        let created = 0, errors = 0;
        for (const p of valid) {
            try { await api.post(`/tournaments/${tournament.id}/matches`, p.row); created++; }
            catch { errors++; }
        }
        setImportResult({ created, errors, total: valid.length, skipped: previewRows.length - valid.length });
        setPreviewRows(null);
        setImporting(false);
        await load(); onChange?.();
    };

    const locked = !!tournament?.calendar_fixed;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-match-calendar">
            {calStep && (calStep.mode === "Manual_PDF" || calStep.flag === "O") && (
                <div className="mb-3 border border-mpca-brass/40 bg-mpca-parchment/60 px-3 py-2 text-[10px] uppercase tracking-widest text-mpca-brass flex items-center gap-2" data-testid="calendar-wiring-hint">
                    <Info size={11} />
                    <span className="font-mono">
                        {calStep.mode === "Manual_PDF" && calStep.flag === "O" && "Optional · Manual team names — no downstream impact for this tournament type"}
                        {calStep.mode === "Manual_PDF" && calStep.flag !== "O" && "Manual team names — free-text (e.g. away = other states) per wiring"}
                        {calStep.mode !== "Manual_PDF" && calStep.flag === "O" && "Optional · Calendar entries have no downstream impact for this tournament type"}
                    </span>
                </div>
            )}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="overline text-[9px]">Match Calendar · Fixture Generator</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {matches.length} {matches.length === 1 ? "match" : "matches"} scheduled
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <a href={`/tournaments/${tournament.id}/schedule`} target="_blank" rel="noreferrer"
                        className="text-[10px] uppercase tracking-widest border border-mpca-oxblood/40 text-mpca-oxblood px-2 py-1 flex items-center gap-1 hover:bg-mpca-oxblood/5"
                        title="Print-ready Match Schedule (Save as PDF)"
                        data-testid="calendar-export-pdf-btn">
                        <FileDown size={11} /> Schedule PDF
                    </a>
                    {canEdit && (
                        locked ? (
                            <button onClick={() => lockCalendar(false)} className="text-[10px] uppercase tracking-widest bg-mpca-brass/20 text-mpca-brass border border-mpca-brass px-2 py-1 flex items-center gap-1" data-testid="calendar-unlock-btn">
                                <Lock size={11} /> Locked · Unlock
                            </button>
                        ) : (
                            <button onClick={() => lockCalendar(true)} disabled={matches.length === 0} className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="calendar-lock-btn">
                                <LockOpen size={11} /> Lock Calendar
                            </button>
                        )
                    )}
                    {canEdit && !locked && (
                        <>
                        <button onClick={downloadTemplate} className="text-[10px] uppercase tracking-widest border border-mpca-brass/40 text-mpca-brass px-2 py-1 flex items-center gap-1" title="Download CSV template" data-testid="calendar-template-btn">
                            <Upload size={11} /> Template
                        </button>
                        <button onClick={() => fileRef.current?.click()} disabled={importing} className="text-[10px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" title="Parse the CSV and preview all rows before anything is saved" data-testid="calendar-import-csv-btn">
                            {importing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Import CSV · Preview
                        </button>
                        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} data-testid="calendar-import-file" />
                        <button onClick={() => setCreating(true)} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1" data-testid="calendar-add-match-btn">
                            <Plus size={11} /> Add Match
                        </button>
                        </>
                    )}
                </div>
            </div>

            {importResult && (
                <div className={`mb-3 text-[11px] px-3 py-1.5 border ${importResult.error ? "border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood" : "border-mpca-green-dark/40 bg-mpca-green-dark/5 text-mpca-green-dark"}`} data-testid="calendar-import-result">
                    {importResult.error
                        ? `Import failed: ${importResult.error}`
                        : `Imported ${importResult.created} / ${importResult.total} matches` + (importResult.errors ? ` · ${importResult.errors} failed` : "")}
                </div>
            )}

            {/* Iter 123f · Bulk-select toolbar (only when canEdit & !locked & at least one selection) */}
            {canEdit && !locked && matches.length > 0 && (
                <div className="mb-3 flex items-center justify-between gap-2 px-3 py-1.5 border border-mpca-brass/40 bg-mpca-parchment/60" data-testid="bulk-select-toolbar">
                    <div className="flex items-center gap-3 text-[11px] text-mpca-gray-dark">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none" data-testid="bulk-select-all-label">
                            <input
                                type="checkbox"
                                className="accent-mpca-green-dark"
                                checked={selectedIds.size === matches.length && matches.length > 0}
                                onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                                data-testid="bulk-select-all-checkbox"
                            />
                            <span className="uppercase tracking-widest text-[9px] font-mono">Select all</span>
                        </label>
                        {selectedIds.size > 0 && (
                            <span className="font-mono text-mpca-green-dark font-semibold" data-testid="bulk-selected-count">
                                {selectedIds.size} of {matches.length} selected
                            </span>
                        )}
                    </div>
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={clearSelection}
                                disabled={bulkDeleting}
                                className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-gray-dark hover:bg-mpca-brass/10"
                                data-testid="bulk-clear-btn"
                            >
                                Clear
                            </button>
                            <button
                                onClick={bulkDelete}
                                disabled={bulkDeleting}
                                className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-oxblood text-mpca-ivory disabled:opacity-40 flex items-center gap-1"
                                data-testid="bulk-delete-btn"
                            >
                                {bulkDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div className="py-6 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={14} className="inline animate-spin mr-1" /> Loading matches…</div>
            ) : matches.length === 0 && !creating ? (
                <div className="py-6 text-center text-mpca-gray-dark italic font-serif border border-dashed border-mpca-brass/30">
                    <CalIcon size={22} className="mx-auto mb-2 text-mpca-brass" strokeWidth={1.2} />
                    No fixtures added yet. Use &laquo;Add Match&raquo; to build the calendar.
                </div>
            ) : (
                <div className="space-y-3" data-testid="match-list">
                    {creating && (
                        <MatchFixtureCard
                            match={{ stage: "League", days: 1, other_pax: 0 }}
                            idx={matches.length + 1}
                            canEdit={canEdit && !locked}
                            tournament={tournament}
                            teamOptions={teamOptions}
                            poolOptions={poolOptions}
                            groundOptions={groundOptions}
                            officialsByRole={officialsByRole}
                            manualTeamNames={calStep?.mode === "Manual_PDF"}
                            onSaved={async () => { setCreating(false); await load(); onChange?.(); }}
                            onCancel={() => setCreating(false)}
                            startExpanded
                        />
                    )}
                    {matches.map((m, idx) => (
                        <div key={m.id} className="flex items-start gap-2" data-testid={`match-row-${m.id}`}>
                            {canEdit && !locked && (
                                <label className="pt-4 pl-1 cursor-pointer select-none" title="Select for bulk actions">
                                    <input
                                        type="checkbox"
                                        className="accent-mpca-green-dark w-4 h-4"
                                        checked={selectedIds.has(m.id)}
                                        onChange={() => toggleSelected(m.id)}
                                        data-testid={`match-select-${m.id}`}
                                    />
                                </label>
                            )}
                            <div className={`flex-1 ${selectedIds.has(m.id) ? "ring-2 ring-mpca-oxblood/40" : ""}`}>
                                <MatchFixtureCard
                                    match={m}
                                    idx={idx + 1}
                                    canEdit={canEdit && !locked}
                                    tournament={tournament}
                                    teamOptions={teamOptions}
                                    poolOptions={poolOptions}
                                    groundOptions={groundOptions}
                                    officialsByRole={officialsByRole}
                                    manualTeamNames={calStep?.mode === "Manual_PDF"}
                                    onSaved={async () => { await load(); onChange?.(); }}
                                    onDeleted={async () => { await load(); onChange?.(); }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {/* Iter 123d · CSV Dry-Run Preview Modal */}
            {previewRows && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="csv-preview-modal" onClick={() => !importing && setPreviewRows(null)}>
                    <div className="bg-mpca-ivory border border-mpca-brass/60 shadow-2xl max-w-6xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-mpca-brass/40 bg-mpca-parchment">
                            <div>
                                <div className="overline text-[9px] text-mpca-brass">Dry Run · CSV Import Preview</div>
                                <div className="font-serif text-lg text-mpca-green-dark">Review before committing to ERP</div>
                            </div>
                            <div className="text-[11px] text-mpca-gray-dark">
                                <span className="text-mpca-green-dark font-semibold">{previewRows.filter(p => p.ok).length}</span> ready ·
                                <span className="text-mpca-oxblood font-semibold ml-1">{previewRows.filter(p => !p.ok).length}</span> blocked ·
                                <span className="text-mpca-brass font-semibold ml-1">{previewRows.filter(p => p.warns.length > 0).length}</span> warnings
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-3">
                            <table className="w-full text-[11px]">
                                <thead className="sticky top-0 bg-mpca-parchment">
                                    <tr className="text-[9px] uppercase tracking-widest text-mpca-gray-dark border-b border-mpca-brass/40">
                                        <th className="px-2 py-1.5 text-left">Row</th>
                                        <th className="px-2 py-1.5 text-left">Status</th>
                                        <th className="px-2 py-1.5 text-left">Label</th>
                                        <th className="px-2 py-1.5 text-left">Stage</th>
                                        <th className="px-2 py-1.5 text-left">Team A → Team B</th>
                                        <th className="px-2 py-1.5 text-left">Date From → Date To (Days)</th>
                                        <th className="px-2 py-1.5 text-left">Time</th>
                                        <th className="px-2 py-1.5 text-left">Ground</th>
                                        <th className="px-2 py-1.5 text-left">Issues</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((p, i) => (
                                        <tr key={i} className={`border-b border-mpca-brass/20 ${!p.ok ? "bg-mpca-oxblood/5" : p.warns.length ? "bg-mpca-brass/5" : ""}`} data-testid={`csv-preview-row-${i}`}>
                                            <td className="px-2 py-1.5 text-mpca-gray-dark font-mono">{p.line}</td>
                                            <td className="px-2 py-1.5">
                                                {p.ok ? (
                                                    <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 bg-mpca-green-dark/15 text-mpca-green-dark border border-mpca-green-dark/40">READY</span>
                                                ) : (
                                                    <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 bg-mpca-oxblood/15 text-mpca-oxblood border border-mpca-oxblood/40">BLOCKED</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 font-serif text-mpca-green-dark">{p.row.label || "—"}</td>
                                            <td className="px-2 py-1.5 text-mpca-gray-dark">{p.row.stage}</td>
                                            <td className="px-2 py-1.5 font-mono">
                                                <span className={teamOptions.includes(p.row.home_team) ? "text-mpca-ink" : "text-mpca-brass"}>{p.row.home_team || "—"}</span>
                                                <span className="mx-1 text-mpca-gray-dark">vs</span>
                                                <span className={teamOptions.includes(p.row.away_team) ? "text-mpca-ink" : "text-mpca-brass"}>{p.row.away_team || "—"}</span>
                                            </td>
                                            <td className="px-2 py-1.5 font-mono">
                                                {p.row.match_date || "—"}
                                                <span className="text-mpca-gray-dark mx-1">→</span>
                                                {p.row.to_date || p.row.match_date || "—"}
                                                <span className="ml-1 text-mpca-brass">({p.row.days}d)</span>
                                            </td>
                                            <td className="px-2 py-1.5 font-mono text-mpca-gray-dark">{p.row.start_time}</td>
                                            <td className="px-2 py-1.5 text-mpca-gray-dark text-[10px]">{p.row.ground_id || p.row.ground_name || "—"}</td>
                                            <td className="px-2 py-1.5 text-[10px]">
                                                {p.errs.map((e, j) => <div key={`e-${j}`} className="text-mpca-oxblood">✗ {e}</div>)}
                                                {p.warns.map((w, j) => <div key={`w-${j}`} className="text-mpca-brass italic">⚠ {w}</div>)}
                                                {p.ok && p.warns.length === 0 && <span className="text-mpca-green-dark">✓ clean</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-mpca-brass/40 bg-mpca-parchment">
                            <div className="text-[10px] text-mpca-gray-dark italic">
                                Only rows marked <span className="text-mpca-green-dark font-semibold">READY</span> will be imported. Warnings are advisory — those rows will still be created.
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPreviewRows(null)}
                                    disabled={importing}
                                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40 text-mpca-gray-dark hover:bg-mpca-brass/10"
                                    data-testid="csv-preview-cancel-btn"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={commitImport}
                                    disabled={importing || previewRows.filter(p => p.ok).length === 0}
                                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-mpca-green-dark text-mpca-ivory disabled:opacity-40 flex items-center gap-1"
                                    data-testid="csv-preview-commit-btn"
                                >
                                    {importing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                    {importing ? "Importing…" : `Import ${previewRows.filter(p => p.ok).length} matches`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Sprint M19 · MPCA Receipts Panel
 * Records money received from MPCA against this tournament (bank transfers,
 * cheques). Backend `POST /tournaments/{tid}/receipts`.
 */
const TournamentReceiptsPanel = ({ tournament, canEdit }) => {
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ receipt_date: "", amount_inr: "", mode: "NEFT", reference_no: "", remarks: "" });

    const load = async () => {
        setLoading(true);
        try {
            const list = await api.get(`/tournaments/${tournament.id}/receipts`).then((r) => r.data);
            setReceipts(list || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { if (tournament?.id) load(); }, [tournament?.id]); // eslint-disable-line

    const addReceipt = async () => {
        if (!form.receipt_date || !form.amount_inr) return alert("Date and amount are required.");
        await api.post(`/tournaments/${tournament.id}/receipts`, {
            ...form, amount_inr: parseFloat(form.amount_inr),
        });
        setForm({ receipt_date: "", amount_inr: "", mode: "NEFT", reference_no: "", remarks: "" });
        setCreating(false);
        await load();
    };
    const removeReceipt = async (rid) => {
        if (!window.confirm("Delete this receipt?")) return;
        await api.delete(`/tournaments/${tournament.id}/receipts/${rid}`);
        await load();
    };

    const total = receipts.reduce((s, r) => s + (r.amount_inr || 0), 0);
    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-mpca-receipts">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="overline text-[9px]">Receipts from MPCA</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        ₹{Math.round(total).toLocaleString("en-IN")}
                        <span className="text-[10px] font-mono text-mpca-brass ml-2 uppercase tracking-widest">
                            {receipts.length} receipt(s)
                        </span>
                    </div>
                </div>
                {canEdit && (
                    <button onClick={() => setCreating(true)} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1" data-testid="receipt-add-btn">
                        <Plus size={11} /> Record Receipt
                    </button>
                )}
            </div>

            {loading ? (
                <div className="py-6 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={14} className="inline animate-spin mr-1" /> Loading receipts…</div>
            ) : receipts.length === 0 && !creating ? (
                <div className="py-6 text-center text-mpca-gray-dark italic font-serif border border-dashed border-mpca-brass/30">
                    No MPCA payments recorded yet.
                </div>
            ) : (
                <div className="space-y-1" data-testid="receipt-list">
                    {receipts.map((r, idx) => (
                        <div key={r.id} className="grid grid-cols-12 gap-2 items-center border border-mpca-brass/20 px-3 py-2 text-xs" data-testid={`receipt-row-${idx}`}>
                            <div className="col-span-2 font-mono text-mpca-brass text-[10px]">{r.receipt_no}</div>
                            <div className="col-span-2 font-mono text-mpca-green-dark">{r.receipt_date}</div>
                            <div className="col-span-2 text-[9px] uppercase tracking-widest text-mpca-oxblood">{r.mode}</div>
                            <div className="col-span-2 text-mpca-gray-dark text-[11px] font-mono">{r.reference_no || "—"}</div>
                            <div className="col-span-3 text-right font-mono text-mpca-green-dark font-semibold">₹{Math.round(r.amount_inr).toLocaleString("en-IN")}</div>
                            <div className="col-span-1 text-right">
                                {canEdit && (
                                    <button onClick={() => removeReceipt(r.id)} className="text-mpca-oxblood/70 hover:text-mpca-oxblood" data-testid={`receipt-delete-${idx}`}>
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && (
                <div className="mt-4 border border-mpca-oxblood/40 bg-mpca-parchment/30 p-3" data-testid="receipt-create-form">
                    <div className="overline text-[9px] mb-2">Record MPCA receipt</div>
                    <div className="grid grid-cols-4 gap-2">
                        <input type="date" className={inputCls} value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} data-testid="receipt-date-input" />
                        <input type="number" placeholder="Amount ₹" className={inputCls} value={form.amount_inr} onChange={(e) => setForm({ ...form, amount_inr: e.target.value })} data-testid="receipt-amount-input" />
                        <select className={inputCls} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                            <option>NEFT</option>
                            <option>RTGS</option>
                            <option>Cheque</option>
                            <option>Cash</option>
                        </select>
                        <input placeholder="UTR / Cheque No" className={inputCls} value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} />
                        <input placeholder="Remarks" className={inputCls + " col-span-4"} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <button onClick={() => setCreating(false)} className="text-[10px] uppercase tracking-widest text-mpca-gray-dark px-3 py-1.5 hover:text-mpca-oxblood flex items-center gap-1"><X size={11} /> Cancel</button>
                        <button onClick={addReceipt} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1" data-testid="receipt-save-btn"><Save size={11} /> Save Receipt</button>
                    </div>
                </div>
            )}
        </div>
    );
};

/** Sprint M19 · Financial Summary — auto-rolled up. */
const FinancialSummaryPanel = ({ tournament }) => {
    const [data, setData] = useState(null);
    useEffect(() => {
        if (!tournament?.id) return;
        api.get(`/tournaments/${tournament.id}/financial-summary`).then((r) => setData(r.data)).catch(() => setData(null));
    }, [tournament?.id]);

    if (!data) return <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 text-[11px] text-mpca-gray-dark" data-testid="panel-financial-summary-loading">Loading financial summary…</div>;
    const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
    const rows = [
        ["Approved Budget", data.budget.total_inr, data.budget.status],
        ["Invoices Uploaded", data.actuals.invoices_inr, `${data.actuals.invoice_count} invoice(s)`],
        ["Extra Expenses Approved", data.actuals.extras_inr, "Approved-only"],
        ["Match Officials DA", data.actuals.match_officials_da_inr, "Approved-only"],
        ["Total Actual Spend", data.actuals.total_spend_inr, ""],
        ["Claim Requested", data.claim.requested_inr, data.claim.status],
        ["Claim Approved by MPCA", data.claim.approved_inr, ""],
        ["Payment Received", data.receipts.total_inr, ""],
        ["Outstanding Payment", data.receipts.outstanding_inr, ""],
    ];
    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-financial-summary">
            <div className="overline text-[9px]">Financial Summary · Auto-rolled up</div>
            <div className="font-serif text-lg text-mpca-green-dark mt-1 mb-3">
                Variance: <span className={data.variance_inr >= 0 ? "text-mpca-green-dark" : "text-mpca-oxblood"} data-testid="summary-variance">{fmt(Math.abs(data.variance_inr))}</span>
                <span className="text-[9px] font-mono ml-2 uppercase tracking-widest text-mpca-brass">{data.variance_inr >= 0 ? "UNDER BUDGET" : "OVER BUDGET"}</span>
            </div>
            <div className="border border-mpca-brass/20">
                {rows.map(([label, amount, meta], i) => (
                    <div key={i} className="grid grid-cols-12 px-3 py-1.5 text-xs items-center border-b border-mpca-brass/10 last:border-b-0">
                        <div className="col-span-5 font-serif text-mpca-green-dark">{label}</div>
                        <div className="col-span-3 text-[10px] uppercase tracking-widest text-mpca-brass font-mono">{meta}</div>
                        <div className="col-span-4 text-right font-mono text-mpca-oxblood">{fmt(amount)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Sprint M19 + MPCA-244 · Closure Letter — generate, upload signed copy, close tournament. */
const ClosureLetterPanel = ({ tournament, persona, canGenerate, onChange }) => {
    const [letter, setLetter] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notes, setNotes] = useState("");
    const [tourn, setTourn] = useState(tournament); // local mirror so we can reflect Close status
    useEffect(() => { setTourn(tournament); }, [tournament]);

    // MPCA-243 · Ship 2 · wiring owner check for GENERATE (finance_console).
    // MPCA-244 · Ship 3 · wiring owner check for SIGN + CLOSE (tournament_closure).
    const wiringCanGenerate = useWiringOwnerMatch(tournament?.id, "finance_console", persona);
    const wiringCanClose = useWiringOwnerMatch(tournament?.id, "tournament_closure", persona);
    const finalCanGenerate = canGenerate && (wiringCanGenerate ?? true);
    const financeStep = useWiringStep(tournament?.id, "finance_console");
    const closureStep = useWiringStep(tournament?.id, "tournament_closure");

    const load = async () => {
        try {
            const doc = await api.get(`/tournaments/${tournament.id}/closure-letter`).then((r) => r.data);
            setLetter(doc);
        } catch (_) { setLetter(null); }
    };
    useEffect(() => { if (tournament?.id) load(); }, [tournament?.id]); // eslint-disable-line

    const generate = async () => {
        if (!window.confirm("Generate closure letter with current financial data?")) return;
        setBusy(true);
        try {
            const res = await api.post(`/tournaments/${tournament.id}/closure-letter`, {
                issued_by_name: persona?.name,
                issued_by_post: persona?.post,
                additional_notes: notes,
            }).then((r) => r.data);
            setLetter(res);
        } finally { setBusy(false); }
    };

    // MPCA-244 · Upload the signed closure letter (any URL — the app currently
    // stores the URL string; a file-upload UI is a future enhancement).
    const uploadSigned = async () => {
        const url = window.prompt("Paste the URL of the signed closure PDF (Google Drive / S3 / any public link):");
        if (!url) return;
        setBusy(true);
        try {
            const updated = await api.post(`/tournaments/${tournament.id}/closure-signed-upload`, { signed_url: url })
                .then((r) => r.data);
            setTourn(updated);
            onChange?.();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    // MPCA-244 · Final close.
    const closeTournament = async () => {
        if (!window.confirm("Close this tournament? Once closed, no further edits are possible.")) return;
        setBusy(true);
        try {
            const updated = await api.post(`/tournaments/${tournament.id}/close`).then((r) => r.data);
            setTourn(updated);
            onChange?.();
            alert("Tournament closed.");
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    const isClosed = tourn?.status === "Completed";
    const hasSignedPdf = !!tourn?.closure_signed_url;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-closure-letter">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="overline text-[9px]">Tournament Closure Certificate</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {isClosed ? "Tournament closed ✓" : letter ? "Certificate on file" : "Not yet generated"}
                    </div>
                    {letter?.generated_at && <div className="text-[10px] text-mpca-brass font-mono mt-0.5">Draft generated {new Date(letter.generated_at).toLocaleString("en-IN")}</div>}
                    {tourn?.closure_signed_at && (
                        <div className="text-[10px] text-mpca-green-dark font-mono mt-0.5" data-testid="closure-signed-info">
                            Signed uploaded {new Date(tourn.closure_signed_at).toLocaleString("en-IN")} by {tourn.closure_signed_by}
                        </div>
                    )}
                    {tourn?.closed_at && (
                        <div className="text-[10px] text-mpca-green-dark font-mono mt-0.5" data-testid="closure-closed-info">
                            Tournament closed {new Date(tourn.closed_at).toLocaleString("en-IN")} by {tourn.closed_by}
                        </div>
                    )}
                    {closureStep?.owner && (
                        <div className="text-[9px] text-mpca-brass mt-1 uppercase tracking-widest flex items-center gap-1" data-testid="closure-owner-hint">
                            <Info size={10} /> Closure owned by {closureStep.owner} · Signed PDF required to close
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {finalCanGenerate && !isClosed && (
                        <button onClick={generate} disabled={busy} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="closure-generate-btn">
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} {letter ? "Regenerate" : "Generate"}
                        </button>
                    )}
                    {/* MPCA-257 · Print-page closure certificate — same visual
                        language as /schedule (MPCA ERP header, serif title,
                        numbered black-and-white sections). Opens in a new tab
                        with a native "Print / Save as PDF" call-to-action. */}
                    <a
                        href={`/tournaments/${tournament.id}/closure`}
                        target="_blank" rel="noreferrer"
                        className="text-[10px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-2 py-1 flex items-center gap-1"
                        data-testid="closure-rich-pdf-btn"
                    >
                        <FileDown size={11} /> Rich PDF
                    </a>
                    {letter && !isClosed && wiringCanClose && (
                        <button onClick={uploadSigned} disabled={busy} className="text-[10px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="closure-upload-signed-btn">
                            <Upload size={11} /> {hasSignedPdf ? "Replace Signed" : "Upload Signed"}
                        </button>
                    )}
                    {hasSignedPdf && !isClosed && wiringCanClose && (
                        <button onClick={closeTournament} disabled={busy} className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="closure-close-tournament-btn">
                            <Lock size={11} /> Close Tournament
                        </button>
                    )}
                </div>
            </div>

            {finalCanGenerate && !letter && (
                <textarea placeholder="Additional notes to include in the certificate (optional)…" className="input-heritage !text-xs w-full h-16 mb-3" value={notes} onChange={(e) => setNotes(e.target.value)} />
            )}

            {letter ? (
                <pre className="bg-mpca-parchment/40 border border-mpca-brass/30 p-4 text-[11px] font-mono whitespace-pre-wrap max-h-96 overflow-auto" data-testid="closure-letter-body">
                    {letter.body_text}
                </pre>
            ) : (
                <div className="py-6 text-center text-mpca-gray-dark italic font-serif border border-dashed border-mpca-brass/30">
                    No closure certificate on file. Generate one after all payments have been received.
                </div>
            )}
            {hasSignedPdf && (
                <div className="mt-3 text-[11px]" data-testid="closure-signed-link">
                    <a href={tourn.closure_signed_url} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline">View signed closure PDF ↗</a>
                </div>
            )}
        </div>
    );
};

export { MatchCalendarPanel, TournamentReceiptsPanel, FinancialSummaryPanel, ClosureLetterPanel };
