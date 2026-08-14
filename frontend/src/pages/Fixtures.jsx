import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchFixtures, fetchTournaments, createFixture, setFixtureStatus,
    allocateOfficial, logWorkHours, fetchFixtureStats, fetchHRWorkHours,
    fetchBattingRankings, fetchBowlingRankings,
} from "@/lib/api";
import {
    Trophy, Calendar, MapPin, Filter, Plus, X, Clock, Users, Award, BarChart3, ShieldCheck,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_META = {
    Scheduled:  { label: "Scheduled",  tone: "pending" },
    In_Progress:{ label: "In Progress",tone: "active" },
    Completed:  { label: "Completed",  tone: "lapsed" },
    Abandoned:  { label: "Abandoned",  tone: "suspended" },
    Cancelled:  { label: "Cancelled",  tone: "suspended" },
};

const ROLE_LABEL = {
    Umpire_On_Field_1: "On-Field Umpire 1",
    Umpire_On_Field_2: "On-Field Umpire 2",
    Umpire_Third: "Third Umpire",
    Umpire_Reserve: "Reserve Umpire",
    Match_Referee: "Match Referee",
    Scorer_1: "Scorer 1",
    Scorer_2: "Scorer 2",
    Physio: "Physio",
    Ground_Manager: "Ground Manager",
    Curator: "Curator",
};

const Pill = ({ tone, label, testId }) => {
    const map = {
        active: "pill pill-active",
        pending: "pill pill-pending",
        suspended: "pill pill-suspended",
        lapsed: "pill pill-lapsed",
    };
    return <span className={map[tone] || "pill pill-lapsed"} data-testid={testId}>{label}</span>;
};

const NewFixtureDialog = ({ open, tournaments, onClose, onCreated }) => {
    const initial = {
        tournament_id: "", round: "",
        home_team: "", away_team: "",
        scheduled_date: "", scheduled_time: "10:00 AM",
        format: "Multi_Day", days: 4, venue_name: "", ground_name: "",
    };
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    if (!open) return null;

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
            const fx = await createFixture(form);
            onCreated(fx);
            setForm(initial);
        } catch (e) {
            setError(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 overflow-y-auto" data-testid="new-fixture-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full my-8">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">New Fixture</div>
                        <div className="font-serif text-2xl mt-1">Schedule a Match</div>
                    </div>
                    <button type="button" onClick={onClose}><X className="text-mpca-gold-light" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="label-heritage">Tournament *</label>
                        <select required value={form.tournament_id} onChange={(e) => setForm((f) => ({ ...f, tournament_id: e.target.value }))} className="input-heritage" data-testid="nfx-tournament">
                            <option value="">— Select tournament —</option>
                            {tournaments.map((t) => <option key={t.id} value={t.id}>{t.tournament_no} · {t.name}</option>)}
                        </select>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Round *</label>
                            <input required value={form.round} onChange={(e) => setForm((f) => ({ ...f, round: e.target.value }))} placeholder="Group A · Match 1" className="input-heritage" data-testid="nfx-round" />
                        </div>
                        <div>
                            <label className="label-heritage">Format *</label>
                            <select value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))} className="input-heritage" data-testid="nfx-format">
                                {["Multi_Day","One_Day","T20","Pink_Ball","FiveDay","ThreeDay","FortyOver","ThirtyOver"].map((k) => <option key={k} value={k}>{k.replace(/_/g, "-")}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Home Team *</label>
                            <input required value={form.home_team} onChange={(e) => setForm((f) => ({ ...f, home_team: e.target.value }))} className="input-heritage" data-testid="nfx-home" />
                        </div>
                        <div>
                            <label className="label-heritage">Away Team *</label>
                            <input required value={form.away_team} onChange={(e) => setForm((f) => ({ ...f, away_team: e.target.value }))} className="input-heritage" data-testid="nfx-away" />
                        </div>
                        <div>
                            <label className="label-heritage">Date *</label>
                            <input required type="date" value={form.scheduled_date} onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} className="input-heritage" data-testid="nfx-date" />
                        </div>
                        <div>
                            <label className="label-heritage">Time</label>
                            <input value={form.scheduled_time} onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))} className="input-heritage" data-testid="nfx-time" />
                        </div>
                        <div>
                            <label className="label-heritage">Days</label>
                            <input type="number" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: parseInt(e.target.value) || 1 }))} className="input-heritage" data-testid="nfx-days" />
                        </div>
                        <div>
                            <label className="label-heritage">Venue</label>
                            <input value={form.venue_name} onChange={(e) => setForm((f) => ({ ...f, venue_name: e.target.value }))} className="input-heritage" data-testid="nfx-venue" />
                        </div>
                    </div>
                    {error && <div className="border border-mpca-oxblood/50 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-sm">{error}</div>}
                </div>
                <div className="px-6 pb-5 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="nfx-create">
                        <Plus size={14} /> {busy ? "Creating…" : "Schedule Fixture"}
                    </button>
                </div>
            </form>
        </div>
    );
};

const AllocateDialog = ({ open, fixture, onClose, onDone }) => {
    const initial = { role: "Umpire_On_Field_1", name: "", body_id: "", phone: "", honorarium_inr: 0, work_hours: 0 };
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);
    if (!open || !fixture) return null;
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const u = await allocateOfficial(fixture.id, {
                ...form,
                honorarium_inr: parseFloat(form.honorarium_inr) || 0,
                work_hours: parseFloat(form.work_hours) || 0,
            });
            onDone(u);
            setForm(initial);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="allocate-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-md w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood">
                    <div className="overline !text-mpca-gold-light">HR Allocation</div>
                    <div className="font-serif text-xl mt-1">Allocate Official · {fixture.fixture_no}</div>
                </div>
                <div className="p-6 space-y-3">
                    <div>
                        <label className="label-heritage">Role *</label>
                        <select required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input-heritage" data-testid="alloc-role">
                            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label-heritage">Name *</label>
                        <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-heritage" data-testid="alloc-name" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="label-heritage">Phone</label>
                            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input-heritage" data-testid="alloc-phone" />
                        </div>
                        <div>
                            <label className="label-heritage">Honorarium (₹)</label>
                            <input type="number" value={form.honorarium_inr} onChange={(e) => setForm((f) => ({ ...f, honorarium_inr: e.target.value }))} className="input-heritage" data-testid="alloc-honor" />
                        </div>
                        <div className="col-span-2">
                            <label className="label-heritage">Work Hours (initial log)</label>
                            <input type="number" step="0.5" value={form.work_hours} onChange={(e) => setForm((f) => ({ ...f, work_hours: e.target.value }))} className="input-heritage" data-testid="alloc-hours" />
                        </div>
                    </div>
                </div>
                <div className="px-6 pb-5 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="alloc-save">
                        <Users size={14} /> {busy ? "Saving…" : "Allocate"}
                    </button>
                </div>
            </form>
        </div>
    );
};

const Fixtures = () => {
    const { persona } = useAuth();
    const [fixtures, setFixtures] = useState([]);
    const [tournaments, setTournaments] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("fixtures");   // fixtures | rankings | hr
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterTournament, setFilterTournament] = useState("");
    const [selected, setSelected] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [allocFor, setAllocFor] = useState(null);
    const [batting, setBatting] = useState([]);
    const [bowling, setBowling] = useState([]);
    const [hrHours, setHrHours] = useState([]);

    const load = async () => {
        const params = filterTournament ? { tournament_id: filterTournament } : {};
        const [fx, ts, st] = await Promise.all([fetchFixtures(params), fetchTournaments(), fetchFixtureStats(params)]);
        setFixtures(fx);
        setTournaments(ts);
        setStats(st);
    };
    useEffect(() => {
        (async () => {
            try { await load(); } finally { setLoading(false); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterTournament]);

    useEffect(() => {
        if (tab === "rankings") {
            const params = filterTournament ? { tournament_id: filterTournament } : {};
            fetchBattingRankings(params).then(setBatting).catch(() => setBatting([]));
            fetchBowlingRankings(params).then(setBowling).catch(() => setBowling([]));
        } else if (tab === "hr") {
            const params = filterTournament ? { tournament_id: filterTournament } : {};
            fetchHRWorkHours(params).then(setHrHours).catch(() => setHrHours([]));
        }
    }, [tab, filterTournament]);

    const filtered = useMemo(() => {
        if (filterStatus === "all") return fixtures;
        return fixtures.filter((f) => f.status === filterStatus);
    }, [fixtures, filterStatus]);

    const canManage = persona && (persona.body_type === "State" || persona.body_type === "Division");

    if (loading) return <div className="p-16" data-testid="fixtures-loading"><CricketLoader size="lg" label="Loading fixtures…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="fixtures-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
                <div>
                    <div className="overline">Article VII.2 · Fixtures & Rankings</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Match Fixtures</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Match scheduling · Ground / Umpire / Scorer / HR allocation · Work-hour ledger · Rankings & special performances.
                    </p>
                </div>
                {canManage && tab === "fixtures" && (
                    <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="new-fixture-btn">
                        <Plus size={14} /> Schedule Fixture
                    </button>
                )}
            </div>

            <div className="crest-divider mb-8" />

            {/* Tabs */}
            <div className="flex gap-6 border-b border-mpca-brass/30 mb-6">
                {[
                    ["fixtures", "Fixtures", Calendar],
                    ["rankings", "Rankings", BarChart3],
                    ["hr", "HR · Work Hours", ShieldCheck],
                ].map(([k, l, I]) => (
                    <button key={k} onClick={() => setTab(k)} data-testid={"fx-tab-" + k}
                        className={"pb-3 flex items-center gap-2 text-[13px] uppercase tracking-wider font-semibold transition-colors " + (tab === k ? "text-mpca-oxblood border-b-2 border-mpca-oxblood -mb-px" : "text-mpca-gray-dark hover:text-mpca-green-dark")}>
                        <I size={14} /> {l}
                    </button>
                ))}
            </div>

            {/* Tournament filter */}
            <div className="flex items-center gap-3 mb-6">
                <label className="text-[11px] uppercase tracking-wider text-mpca-gray-dark">Tournament</label>
                <select value={filterTournament} onChange={(e) => setFilterTournament(e.target.value)} className="input-heritage max-w-md" data-testid="fx-filter-tournament">
                    <option value="">All tournaments</option>
                    {tournaments.map((t) => <option key={t.id} value={t.id}>{t.tournament_no} · {t.name}</option>)}
                </select>
            </div>

            {tab === "fixtures" && (
                <>
                    {stats && (
                        <div className="grid sm:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-8" data-testid="fx-stats">
                            {[["Total", stats.total_fixtures, "navy"], ["Scheduled", stats.scheduled, "saffron"], ["In Progress", stats.in_progress, "marigold"], ["Completed", stats.completed, "maroon"]].map(([l, v, a]) => (
                                <div key={l} className="bulletin-card p-5 border-0 rounded-none">
                                    <div className="overline">{l}</div>
                                    <div className="font-serif text-3xl text-mpca-green-dark mt-2 leading-none">{v}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <Filter size={12} className="text-mpca-gray-dark" />
                        {[["all", "All"], ["Scheduled", "Scheduled"], ["In_Progress", "In Progress"], ["Completed", "Completed"]].map(([k, l]) => (
                            <button key={k} onClick={() => setFilterStatus(k)} data-testid={"fx-filter-" + k}
                                className={"px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold border transition-colors " + (filterStatus === k ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:bg-mpca-parchment")}>
                                {l}
                            </button>
                        ))}
                    </div>

                    <div className="bulletin-card overflow-hidden" data-testid="fx-list">
                        {filtered.length === 0 ? (
                            <div className="p-10 text-center text-mpca-gray-dark italic font-serif">No fixtures scheduled yet.</div>
                        ) : (
                            filtered.map((f) => {
                                const st = STATUS_META[f.status] || { label: f.status, tone: "lapsed" };
                                return (
                                    <button key={f.id} onClick={() => setSelected(f)} className="ledger-row w-full text-left flex flex-wrap items-center gap-4 px-6 py-4" data-testid={"fx-row-" + f.fixture_no}>
                                        <div className="w-9 h-9 rounded-full bg-mpca-green-dark text-mpca-gold-light flex items-center justify-center shrink-0">
                                            <Trophy size={14} />
                                        </div>
                                        <div className="font-mono text-[10px] text-mpca-brass tracking-wider w-32">{f.fixture_no}</div>
                                        <div className="flex-1 min-w-[240px]">
                                            <div className="font-serif text-base text-mpca-green-dark leading-tight">{f.home_team} <span className="text-mpca-brass text-xs">v</span> {f.away_team}</div>
                                            <div className="text-[11px] text-mpca-gray-dark mt-1 flex items-center gap-2 flex-wrap">
                                                <span>{f.round}</span>
                                                <span>·</span>
                                                <Calendar size={11} /> {fmtDate(f.scheduled_date)} · {f.scheduled_time}
                                                {f.venue_name && <><span>·</span><MapPin size={11} /> {f.venue_name}</>}
                                                {f.tournament_name && <span className="text-mpca-oxblood">· 🏆 {f.tournament_name}</span>}
                                            </div>
                                        </div>
                                        <span className="font-mono text-[10px] uppercase tracking-wider text-mpca-gray-dark">{f.format.replace(/_/g, "-")} · {f.days}d</span>
                                        <span className="text-[10px] text-mpca-brass">{(f.officials || []).length} officials</span>
                                        <Pill tone={st.tone} label={st.label} testId={"fx-status-" + f.status} />
                                    </button>
                                );
                            })
                        )}
                    </div>
                </>
            )}

            {tab === "rankings" && (
                <div className="grid md:grid-cols-2 gap-8" data-testid="rankings-view">
                    <div>
                        <div className="overline mb-3 flex items-center gap-2"><BarChart3 size={12} /> Top Batting · By Runs</div>
                        <div className="bulletin-card">
                            {batting.length === 0 ? (
                                <div className="p-8 text-center text-mpca-gray-dark italic">No matches played yet.</div>
                            ) : batting.map((row, i) => (
                                <div key={i} className="ledger-row flex items-center gap-3 px-4 py-3" data-testid={"bat-row-" + i}>
                                    <span className="w-6 text-mpca-brass font-mono text-[10px]">#{i + 1}</span>
                                    <div className="flex-1">
                                        <div className="font-serif text-mpca-green-dark">{row.player_name}</div>
                                        <div className="text-[10px] text-mpca-gray-dark">{row.team} · {row.innings} inn · SR {row.strike_rate?.toFixed(1)}</div>
                                    </div>
                                    <span className="font-serif text-xl text-mpca-oxblood">{row.runs}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="overline mb-3 flex items-center gap-2"><Award size={12} /> Top Bowling · By Wickets</div>
                        <div className="bulletin-card">
                            {bowling.length === 0 ? (
                                <div className="p-8 text-center text-mpca-gray-dark italic">No matches played yet.</div>
                            ) : bowling.map((row, i) => (
                                <div key={i} className="ledger-row flex items-center gap-3 px-4 py-3" data-testid={"bowl-row-" + i}>
                                    <span className="w-6 text-mpca-brass font-mono text-[10px]">#{i + 1}</span>
                                    <div className="flex-1">
                                        <div className="font-serif text-mpca-green-dark">{row.player_name}</div>
                                        <div className="text-[10px] text-mpca-gray-dark">{row.team} · Econ {row.economy?.toFixed(2)} · Avg {row.average?.toFixed(1)}</div>
                                    </div>
                                    <span className="font-serif text-xl text-mpca-oxblood">{row.wickets}w</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {tab === "hr" && (
                <div data-testid="hr-view">
                    <div className="overline mb-3 flex items-center gap-2"><Clock size={12} /> HR Work Hours · Aggregated Per Person</div>
                    <div className="bulletin-card overflow-x-auto">
                        {hrHours.length === 0 ? (
                            <div className="p-8 text-center text-mpca-gray-dark italic">No HR allocations yet.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                                    <tr>
                                        {["Name", "Role", "Matches", "Hours", "Honorarium (₹)"].map((h) => (
                                            <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-mpca-brass">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {hrHours.map((row, i) => (
                                        <tr key={i} className="border-b border-mpca-brass/20" data-testid={"hr-row-" + i}>
                                            <td className="px-4 py-3 font-serif text-mpca-green-dark">{row.name}</td>
                                            <td className="px-4 py-3 text-mpca-charcoal">{ROLE_LABEL[row.role] || row.role}</td>
                                            <td className="px-4 py-3 font-mono">{row.matches}</td>
                                            <td className="px-4 py-3 font-mono">{row.total_hours?.toFixed(1)}</td>
                                            <td className="px-4 py-3 font-mono">{row.total_honorarium_inr?.toLocaleString("en-IN")}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Fixture detail drawer */}
            {selected && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" data-testid="fx-drawer">
                    <div className="bg-mpca-ivory w-full max-w-2xl h-full overflow-y-auto border-l-2 border-mpca-brass">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-7 py-6 border-b-4 border-mpca-oxblood relative">
                            <button onClick={() => setSelected(null)} className="absolute top-4 right-5 text-mpca-gold-light text-2xl" data-testid="fx-drawer-close">×</button>
                            <div className="overline !text-mpca-gold-light font-mono">{selected.fixture_no}</div>
                            <div className="font-serif text-3xl mt-2 leading-tight">{selected.home_team} <span className="text-mpca-gold-light">v</span> {selected.away_team}</div>
                            <div className="text-sm text-mpca-gold-light/85 mt-1">{selected.round} · {selected.tournament_name}</div>
                            <div className="text-sm text-mpca-gold-light/85 mt-2 flex items-center gap-2">
                                <Calendar size={12} /> {fmtDate(selected.scheduled_date)} · {selected.scheduled_time}
                                {selected.venue_name && <><span>·</span><MapPin size={12} /> {selected.venue_name}</>}
                            </div>
                        </div>
                        <div className="p-7 space-y-6">
                            {canManage && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-3">
                                        {selected.status === "Scheduled" && (
                                            <>
                                                <button onClick={async () => { const u = await setFixtureStatus(selected.id, "In_Progress"); setSelected(u); await load(); }} className="btn-heritage-primary" data-testid="fx-start">
                                                    <Trophy size={14} /> Start Match
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (!window.confirm("Mark this match as Cancelled? DA/TA counters for allocated officials will refresh automatically.")) return;
                                                        const u = await setFixtureStatus(selected.id, "Cancelled");
                                                        setSelected(u); await load();
                                                    }}
                                                    className="btn-heritage-ghost !border-mpca-oxblood !text-mpca-oxblood"
                                                    data-testid="fx-cancel"
                                                >
                                                    Cancel Match
                                                </button>
                                            </>
                                        )}
                                        {selected.status === "In_Progress" && (
                                            <>
                                                <button onClick={async () => { const u = await setFixtureStatus(selected.id, "Completed"); setSelected(u); await load(); }} className="btn-heritage-primary" data-testid="fx-complete">
                                                    <Trophy size={14} /> Mark Completed
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (!window.confirm("Abandon this match? DA/TA counters will refresh.")) return;
                                                        const u = await setFixtureStatus(selected.id, "Abandoned");
                                                        setSelected(u); await load();
                                                    }}
                                                    className="btn-heritage-ghost !border-mpca-oxblood !text-mpca-oxblood"
                                                    data-testid="fx-abandon"
                                                >
                                                    Abandon Match
                                                </button>
                                            </>
                                        )}
                                        <button onClick={() => setAllocFor(selected)} className="btn-heritage-secondary" data-testid="fx-allocate">
                                            <Users size={14} /> Allocate Official
                                        </button>
                                    </div>
                                    {["Cancelled", "Abandoned", "Completed"].includes(selected.status) && (selected.officials || []).length > 0 && (
                                        <div className="text-[10px] text-mpca-brass italic">
                                            Officials&apos; Match Fee is paid for this scheduled day. DA/TA will only be paid if the match was played (In Progress or Completed).
                                        </div>
                                    )}
                                </div>
                            )}
                            <div>
                                <div className="overline mb-3 flex items-center gap-2"><Users size={12} /> Officials Allocated ({(selected.officials || []).length})</div>
                                {(selected.officials || []).length === 0 ? (
                                    <div className="text-sm text-mpca-gray-dark italic border border-mpca-brass/30 p-4">No officials allocated yet.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {selected.officials.map((o) => (
                                            <div key={o.id} className="border border-mpca-brass/30 bg-mpca-parchment/30 p-3 flex items-center gap-3" data-testid={"fx-official-" + o.id}>
                                                <div className="flex-1">
                                                    <div className="font-serif text-mpca-green-dark">{o.name}</div>
                                                    <div className="text-[11px] text-mpca-gray-dark">{ROLE_LABEL[o.role] || o.role}{o.phone && ` · ${o.phone}`}</div>
                                                </div>
                                                <div className="text-right font-mono text-[11px]">
                                                    <div>{o.work_hours || 0} hrs</div>
                                                    <div className="text-mpca-brass">₹{(o.honorarium_inr || 0).toLocaleString("en-IN")}</div>
                                                </div>
                                                <button onClick={async () => {
                                                    const hrs = window.prompt(`Log additional work hours for ${o.name}:`, "1");
                                                    if (!hrs) return;
                                                    try {
                                                        await logWorkHours(selected.id, { official_id: o.id, hours: parseFloat(hrs) });
                                                        const list = await fetchFixtures(filterTournament ? { tournament_id: filterTournament } : {});
                                                        const u = list.find((x) => x.id === selected.id);
                                                        setSelected(u);
                                                    } catch (e) { alert(e?.response?.data?.detail || e.message); }
                                                }} className="text-[10px] uppercase tracking-wider text-mpca-oxblood underline" data-testid={"fx-log-hours-" + o.id}>+ hrs</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <NewFixtureDialog
                open={showNew}
                tournaments={tournaments}
                onClose={() => setShowNew(false)}
                onCreated={async () => { setShowNew(false); await load(); }}
            />
            <AllocateDialog
                open={!!allocFor}
                fixture={allocFor}
                onClose={() => setAllocFor(null)}
                onDone={async (u) => { setAllocFor(null); setSelected(u); await load(); }}
            />
        </div>
    );
};

export default Fixtures;
