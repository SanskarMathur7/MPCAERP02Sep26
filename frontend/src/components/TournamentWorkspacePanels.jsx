import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Save, X, Loader2, Lock, LockOpen, Calendar as CalIcon, Upload, FileDown } from "lucide-react";
import Papa from "papaparse";
import { api } from "@/lib/api";
import MatchFixtureCard from "@/components/MatchFixtureCard";

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
    const fileRef = useRef(null);
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

    // M29 · CSV bulk import
    const downloadTemplate = () => {
        const header = "stage,match_date,start_time,home_team,away_team,venue_name,ground_name,notes\n";
        const sample = 'League,2026-09-01,10:00,DIV-IND,DIV-BPL,MPCA Stadium Bhopal,MPCA Stadium Main Ground,Round 1\nLeague,2026-09-02,14:00,DIV-JBP,DIV-GWL,Jabalpur Cricket Complex,Jabalpur Main Ground,\n';
        const blob = new Blob([header + sample], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `match-calendar-template-${tournament.id.slice(0,6)}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    const importCsv = async (file) => {
        if (!file) return;
        setImporting(true); setImportResult(null);
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
                // Non-fatal — surface a soft warning; still process rows that parsed
                console.warn("[CSV import] parse warnings:", parsed.errors.slice(0, 3));
            }
            const rows = (parsed.data || [])
                .map((r) => ({
                    stage: r.stage || "League",
                    match_date: r.match_date,
                    start_time: r.start_time || "10:00",
                    home_team: r.home_team,
                    away_team: r.away_team,
                    venue_name: r.venue_name || "",
                    ground_name: r.ground_name || "",
                    notes: r.notes || "",
                }))
                .filter((r) => r.home_team && r.away_team && r.match_date);
            if (!rows.length) throw new Error("No valid rows found. Ensure the CSV has a header row and columns: stage, match_date, start_time, home_team, away_team, venue_name, ground_name, notes.");
            let created = 0, errors = 0;
            for (const row of rows) {
                try { await api.post(`/tournaments/${tournament.id}/matches`, row); created++; }
                catch { errors++; }
            }
            setImportResult({ created, errors, total: rows.length });
            await load(); onChange?.();
        } catch (e) {
            setImportResult({ created: 0, errors: 1, total: 0, error: e.message });
        } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
    };

    const locked = !!tournament?.calendar_fixed;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-match-calendar">
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
                        <button onClick={() => fileRef.current?.click()} disabled={importing} className="text-[10px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="calendar-import-csv-btn">
                            {importing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Import CSV
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
                            onSaved={async () => { setCreating(false); await load(); onChange?.(); }}
                            onCancel={() => setCreating(false)}
                            startExpanded
                        />
                    )}
                    {matches.map((m, idx) => (
                        <MatchFixtureCard
                            key={m.id}
                            match={m}
                            idx={idx + 1}
                            canEdit={canEdit && !locked}
                            tournament={tournament}
                            teamOptions={teamOptions}
                            poolOptions={poolOptions}
                            groundOptions={groundOptions}
                            officialsByRole={officialsByRole}
                            onSaved={async () => { await load(); onChange?.(); }}
                            onDeleted={async () => { await load(); onChange?.(); }}
                        />
                    ))}
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

/** Sprint M19 · Closure Letter — POST generate, GET fetch. */
const ClosureLetterPanel = ({ tournament, persona, canGenerate }) => {
    const [letter, setLetter] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notes, setNotes] = useState("");

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

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-closure-letter">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="overline text-[9px]">Tournament Closure Certificate</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {letter ? "Certificate on file" : "Not yet generated"}
                    </div>
                    {letter?.generated_at && <div className="text-[10px] text-mpca-brass font-mono mt-0.5">Generated {new Date(letter.generated_at).toLocaleString("en-IN")}</div>}
                </div>
                {canGenerate && (
                    <button onClick={generate} disabled={busy} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40" data-testid="closure-generate-btn">
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} {letter ? "Regenerate" : "Generate"}
                    </button>
                )}
            </div>

            {canGenerate && !letter && (
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
        </div>
    );
};

export { MatchCalendarPanel, TournamentReceiptsPanel, FinancialSummaryPanel, ClosureLetterPanel };
