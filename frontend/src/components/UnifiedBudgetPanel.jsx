// MPCA-220 · Sprint 4 · Unified Budget Workspace Tab
// ────────────────────────────────────────────────────
// Ties everything together: Match Calendar × Rate Card × Days Engine ×
// Officials → rupee totals. Reads the compute engine's snapshot and renders:
//   1. 4 hero tiles (Grand total · MD subtotal · NMD subtotal · Avg per match)
//   2. Budget by Head — 17 rows with owner tag + MD / NMD / total columns
//   3. Budget by Host/Pool — one row per pool
//   4. Budget by Match — expandable rows showing per-head qty × MD/NMD
//   5. Travel Grant — one row per visiting-division trip + by-division rollup
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Save, Wallet, Users as UsersIcon, Plane, ClipboardList } from "lucide-react";
import { api } from "@/lib/api";

const INR = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
const INR_MINI = (n) => (n ? INR(n) : "—");
const OWNER_COLORS = {
    Host:      "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/30",
    Visitor:   "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/30",
    Officials: "bg-mpca-navy/10 text-mpca-navy border-mpca-navy/30",
    Common:    "bg-mpca-gray-dark/10 text-mpca-gray-dark border-mpca-gray-dark/30",
};
const TILE = "border border-mpca-brass/30 bg-white px-5 py-4 flex flex-col gap-1";

export default function UnifiedBudgetPanel({ tournament, canEdit }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);
    const [tab, setTab] = useState("head");   // "head" | "pool" | "match" | "travel"
    const [printMode, setPrintMode] = useState(false);
    const [expandedMatch, setExpandedMatch] = useState(null);
    const [savedMsg, setSavedMsg] = useState(null);

    const handlePrint = () => {
        setPrintMode(true);
        setTimeout(() => {
            window.print();
            setPrintMode(false);
        }, 250);
    };

    // MPCA-222 · Driver overrides — PATCH the match's driver_overrides dict.
    const setDriverOverride = async (matchId, headKey, value) => {
        try {
            const cur = matches.find((mm) => mm.id === matchId);
            const existing = { ...(cur?.per_head?.[headKey] ? {} : {}) };   // placeholder
            const overrides = {};
            (matches.find((mm) => mm.id === matchId)?.per_head && Object.entries(matches.find((mm) => mm.id === matchId).per_head).forEach(([k, v]) => {
                if (v.is_override) overrides[k] = v.qty;
            }));
            overrides[headKey] = value === "" ? null : Number(value);
            await api.patch(`/tournaments/${tournament.id}/matches/${matchId}`, { driver_overrides: overrides });
            await compute(false);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
    };
    const resetDriverOverride = async (matchId, headKey) => {
        try {
            const overrides = {};
            const cur = matches.find((mm) => mm.id === matchId);
            if (cur?.per_head) {
                Object.entries(cur.per_head).forEach(([k, v]) => {
                    if (v.is_override && k !== headKey) overrides[k] = v.qty;
                });
            }
            await api.patch(`/tournaments/${tournament.id}/matches/${matchId}`, { driver_overrides: overrides });
            await compute(false);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
    };

    const compute = async (save = false) => {
        setLoading(true); setErr(null);
        try {
            const { data: d } = await api.post(`/tournaments/${tournament.id}/unified-budget/compute`, null, { params: { save } });
            setData(d);
            if (save) { setSavedMsg("Snapshot saved."); setTimeout(() => setSavedMsg(null), 2000); }
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { compute(false); }, [tournament?.id]);

    const budget = data?.budget || {};
    const travel = data?.travel_grant || {};
    const grand = Number(budget.grand_total || 0);
    const totMd = Number(budget.total_md_amount || 0);
    const totNmd = Number(budget.total_nmd_amount || 0);
    const matches = budget.match_rows || [];
    const avgPerMatch = matches.length ? grand / matches.length : 0;

    // Owner rollup — sums heads by owner tag (Host / Visitor / Officials / Common)
    const byOwner = useMemo(() => {
        const acc = { Host: 0, Visitor: 0, Officials: 0, Common: 0 };
        (budget.head_totals || []).forEach((h) => {
            const o = h.owner || "Common";
            acc[o] = (acc[o] || 0) + Number(h.total || 0);
        });
        return acc;
    }, [budget.head_totals]);

    const save = () => compute(true);

    if (loading && !data) {
        return (
            <div className="border border-mpca-brass/30 bg-mpca-ivory p-6 text-center text-mpca-brass text-sm flex items-center gap-2 justify-center" data-testid="ub-loading">
                <Loader2 size={18} className="animate-spin" /> Computing unified budget…
            </div>
        );
    }

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-6 space-y-6" data-testid="unified-budget-panel">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <div className="overline text-[10px]">Article X · Unified Budget · Auto-computed</div>
                    <div className="font-serif text-2xl text-mpca-green-dark mt-2 flex items-center gap-2">
                        <Wallet size={22} strokeWidth={1.5} /> Tournament Budget
                    </div>
                    <div className="text-sm text-mpca-gray-dark mt-2 leading-relaxed max-w-4xl">
                        Every ₹ below is derived from your <b>Match Calendar</b> × <b>Rate Card</b> × <b>Days Engine</b> × <b>Assigned Officials</b>.
                        Change any of those and this budget updates instantly. No manual entry.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                        <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-3 py-1.5 flex items-center gap-2">
                            <span className="overline text-[9px] text-mpca-brass">Rate Card</span>
                            <code className="font-mono text-mpca-charcoal">{data?.tournament_type} · {data?.format_group}</code>
                        </div>
                        <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-3 py-1.5 flex items-center gap-2">
                            <span className="overline text-[9px] text-mpca-brass">Fixtures</span>
                            <code className="font-mono text-mpca-charcoal">{matches.length} match{matches.length === 1 ? "" : "es"}</code>
                        </div>
                        <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-3 py-1.5 flex items-center gap-2">
                            <span className="overline text-[9px] text-mpca-brass">Snapshot Endpoint</span>
                            <code className="font-mono text-mpca-charcoal">POST /tournaments/{tournament.id?.slice(0, 8)}…/unified-budget/compute</code>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handlePrint} className="text-[11px] uppercase tracking-widest border border-mpca-brass/40 text-mpca-brass px-3 py-1.5 hover:bg-mpca-brass/10 flex items-center gap-1" data-testid="ub-print">
                        <ClipboardList size={11} /> Print / PDF
                    </button>
                    <button onClick={() => compute(false)} disabled={loading} className="text-[11px] uppercase tracking-widest border border-mpca-brass/40 text-mpca-brass px-3 py-1.5 hover:bg-mpca-brass/10 flex items-center gap-1 disabled:opacity-40" data-testid="ub-refresh">
                        {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />} Refresh
                    </button>
                    {canEdit && (
                        <button onClick={save} disabled={saving} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="ub-save-snapshot">
                            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Snapshot
                        </button>
                    )}
                </div>
            </div>

            {err && (
                <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-3 text-xs text-mpca-oxblood" data-testid="ub-err">{err}</div>
            )}
            {savedMsg && (
                <div className="bg-mpca-green-dark/10 border border-mpca-green-dark/40 p-3 text-xs text-mpca-green-dark" data-testid="ub-saved">{savedMsg}</div>
            )}

            {/* Hero tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="ub-tiles">
                <div className={TILE}>
                    <div className="overline text-[10px]">Grand Total</div>
                    <div className="font-mono text-3xl text-mpca-oxblood leading-none" data-testid="ub-tile-grand">{INR(grand)}</div>
                    <div className="text-[10px] text-mpca-gray-dark">tournament budget</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[10px]">Match-Day cost</div>
                    <div className="font-mono text-3xl text-mpca-green-dark leading-none" data-testid="ub-tile-md">{INR(totMd)}</div>
                    <div className="text-[10px] text-mpca-gray-dark">{grand ? Math.round((totMd / grand) * 100) : 0}% of grand</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[10px]">Non-Match-Day cost</div>
                    <div className="font-mono text-3xl text-mpca-brass leading-none" data-testid="ub-tile-nmd">{INR(totNmd)}</div>
                    <div className="text-[10px] text-mpca-gray-dark">{grand ? Math.round((totNmd / grand) * 100) : 0}% of grand</div>
                </div>
                <div className={TILE}>
                    <div className="overline text-[10px]">Avg per match</div>
                    <div className="font-mono text-3xl text-mpca-charcoal leading-none" data-testid="ub-tile-avg">{INR(avgPerMatch)}</div>
                    <div className="text-[10px] text-mpca-gray-dark">grand ÷ {matches.length || 0} matches</div>
                </div>
            </div>

            {/* Owner rollup pills */}
            <div className="flex flex-wrap gap-2 items-center" data-testid="ub-owner-rollup">
                <span className="overline text-[10px] text-mpca-brass">By Owner:</span>
                {["Host", "Visitor", "Officials", "Common"].map((o) => (
                    <span key={o} className={`px-3 py-1 border ${OWNER_COLORS[o]} text-xs uppercase tracking-widest`} data-testid={`ub-owner-${o}`}>
                        {o} · <b className="ml-1">{INR(byOwner[o] || 0)}</b>
                    </span>
                ))}
            </div>

            {matches.length === 0 && (
                <div className="border border-dashed border-mpca-brass/40 bg-mpca-parchment/40 px-6 py-8 text-center text-sm italic text-mpca-gray-dark" data-testid="ub-empty">
                    No fixtures in the Match Calendar yet — add matches (with dates and pool assignments) to see a budget here.
                </div>
            )}

            {matches.length > 0 && (
                <>
                {/* Tab strip */}
                <div className="flex gap-1 border-b border-mpca-brass/30" data-testid="ub-tabs">
                    <TabButton active={tab === "head"} onClick={() => setTab("head")} icon={<ClipboardList size={12} />} testId="ub-tab-head">Budget by Head</TabButton>
                    <TabButton active={tab === "pool"} onClick={() => setTab("pool")} icon={<UsersIcon size={12} />} testId="ub-tab-pool">Budget by Pool</TabButton>
                    <TabButton active={tab === "match"} onClick={() => setTab("match")} icon={<Wallet size={12} />} testId="ub-tab-match">Budget by Match</TabButton>
                    <TabButton active={tab === "travel"} onClick={() => setTab("travel")} icon={<Plane size={12} />} testId="ub-tab-travel">Travel Grant · {INR(travel.grand_total || 0)}</TabButton>
                </div>

                {(tab === "head" || printMode) && (
                    <div className="border border-mpca-brass/30 overflow-x-auto" data-testid="ub-head-table">
                        <table className="w-full text-sm">
                            <thead className="bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-3 py-2 text-left w-1/3">Head</th>
                                    <th className="px-3 py-2 text-left">Owner</th>
                                    <th className="px-3 py-2 text-right">MD ₹</th>
                                    <th className="px-3 py-2 text-right">NMD ₹</th>
                                    <th className="px-3 py-2 text-right">Total ₹</th>
                                    <th className="px-3 py-2 text-right w-16">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(budget.head_totals || []).map((h) => (
                                    <tr key={h.key} className="border-t border-mpca-brass/10 hover:bg-mpca-parchment/40" data-testid={`ub-head-row-${h.key}`}>
                                        <td className="px-3 py-2 font-serif text-mpca-green-dark">{h.name}</td>
                                        <td className="px-3 py-2">
                                            <span className={`px-1.5 py-0.5 text-[9px] border ${OWNER_COLORS[h.owner] || ""} uppercase tracking-widest`}>{h.owner}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-green-dark">{INR_MINI(h.md_amount)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-brass">{INR_MINI(h.nmd_amount)}</td>
                                        <td className="px-3 py-2 text-right font-mono font-semibold">{INR(h.total)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-gray-dark text-xs">{grand ? Math.round((h.total / grand) * 100) : 0}%</td>
                                    </tr>
                                ))}
                                <tr className="bg-mpca-parchment/60 border-t-2 border-mpca-brass/40 font-semibold">
                                    <td className="px-3 py-2 uppercase tracking-widest text-[10px] text-mpca-brass" colSpan={2}>Total</td>
                                    <td className="px-3 py-2 text-right font-mono text-mpca-green-dark">{INR(totMd)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-mpca-brass">{INR(totNmd)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-mpca-oxblood">{INR(grand)}</td>
                                    <td className="px-3 py-2 text-right font-mono">100%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}

                {(tab === "pool" || printMode) && (
                    <div className="border border-mpca-brass/30 overflow-x-auto" data-testid="ub-pool-table">
                        <table className="w-full text-sm">
                            <thead className="bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-3 py-2 text-left">Pool</th>
                                    <th className="px-3 py-2 text-left">Host</th>
                                    <th className="px-3 py-2 text-right">Matches</th>
                                    <th className="px-3 py-2 text-right">MD ₹</th>
                                    <th className="px-3 py-2 text-right">NMD ₹</th>
                                    <th className="px-3 py-2 text-right">Total ₹</th>
                                    <th className="px-3 py-2 text-right w-16">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(budget.pool_totals || []).map((p, i) => (
                                    <tr key={p.pool_id || i} className="border-t border-mpca-brass/10 hover:bg-mpca-parchment/40" data-testid={`ub-pool-row-${p.pool_id || i}`}>
                                        <td className="px-3 py-2 font-serif text-mpca-green-dark">{p.pool_name || <span className="italic text-mpca-gray-dark">unassigned</span>}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{p.host_code || "—"}</td>
                                        <td className="px-3 py-2 text-right font-mono">{p.match_count}</td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-green-dark">{INR_MINI(p.md_amount)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-brass">{INR_MINI(p.nmd_amount)}</td>
                                        <td className="px-3 py-2 text-right font-mono font-semibold">{INR(p.total)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-mpca-gray-dark text-xs">{grand ? Math.round((p.total / grand) * 100) : 0}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {(tab === "match" || printMode) && (
                    <div className="border border-mpca-brass/30" data-testid="ub-match-table">
                        <table className="w-full text-sm">
                            <thead className="bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-3 py-2 text-left">Match</th>
                                    <th className="px-3 py-2 text-left">Teams</th>
                                    <th className="px-3 py-2 text-left">Pool</th>
                                    <th className="px-3 py-2 text-right">MD</th>
                                    <th className="px-3 py-2 text-right">NMD</th>
                                    <th className="px-3 py-2 text-right">MD ₹</th>
                                    <th className="px-3 py-2 text-right">NMD ₹</th>
                                    <th className="px-3 py-2 text-right">Total ₹</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matches.map((m) => (
                                    <>
                                        <tr
                                            key={m.id}
                                            className="border-t border-mpca-brass/10 hover:bg-mpca-parchment/40 cursor-pointer"
                                            onClick={() => setExpandedMatch(expandedMatch === m.id ? null : m.id)}
                                            data-testid={`ub-match-row-${m.id}`}
                                        >
                                            <td className="px-3 py-2 font-serif text-mpca-green-dark">{m.label || m.id?.slice(0, 6)}</td>
                                            <td className="px-3 py-2 font-mono text-xs">{m.team_a} v {m.team_b}</td>
                                            <td className="px-3 py-2 text-xs">{m.pool_name || <span className="italic text-mpca-gray-dark">—</span>}</td>
                                            <td className="px-3 py-2 text-right font-mono">{m.match_days}</td>
                                            <td className="px-3 py-2 text-right font-mono text-mpca-brass">{m.non_match_days}</td>
                                            <td className="px-3 py-2 text-right font-mono text-mpca-green-dark">{INR_MINI(m.md_amount)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-mpca-brass">{INR_MINI(m.nmd_amount)}</td>
                                            <td className="px-3 py-2 text-right font-mono font-semibold">{INR(m.total)}</td>
                                        </tr>
                                        {expandedMatch === m.id && (
                                            <tr className="bg-white" data-testid={`ub-match-details-${m.id}`}>
                                                <td colSpan={8} className="px-4 py-3">
                                                    <div className="text-[10px] text-mpca-gray-dark italic mb-2">
                                                        Drivers are editable — squad-derived / official-derived numbers can be manually overridden by MPCA. Rates stay fixed at the Rate Card. Leave blank / click &laquo;reset&raquo; to restore the auto value.
                                                    </div>
                                                    <table className="w-full text-xs border border-mpca-brass/20">
                                                        <thead className="bg-mpca-parchment/60 text-mpca-brass uppercase text-[9px] tracking-widest">
                                                            <tr>
                                                                <th className="text-left px-3 py-1.5 w-1/4">Budget head</th>
                                                                <th className="text-left px-3 py-1.5">Driver</th>
                                                                <th className="text-left px-3 py-1.5">Match-day calc</th>
                                                                <th className="text-left px-3 py-1.5">Non-match calc</th>
                                                                <th className="text-right px-3 py-1.5">Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {Object.entries(m.per_head || {}).map(([key, v]) => {
                                                                const headMeta = (budget.head_totals || []).find((h) => h.key === key);
                                                                const label = v.driver === "AwayTeamPax" ? (v.rooms ? "rooms" : "away pax")
                                                                    : v.driver === "HostTeamPax" ? (v.rooms ? "rooms" : "host pax")
                                                                    : v.driver === "MatchOfficialsPax" ? (v.rooms ? "rooms" : "officials")
                                                                    : v.driver === "AllPax" ? "all pax"
                                                                    : v.driver === "TeamCount" ? "teams"
                                                                    : v.driver === "HostTeamCount" ? "host teams"
                                                                    : "flat";
                                                                const total = (v.md_amount || 0) + (v.nmd_amount || 0);
                                                                return (
                                                                    <tr key={key} className="border-t border-mpca-brass/10">
                                                                        <td className="px-3 py-1.5 font-serif text-mpca-green-dark">{headMeta?.name || key}</td>
                                                                        <td className="px-3 py-1.5">
                                                                            {v.driver ? (
                                                                                <span className="inline-flex items-center gap-1.5">
                                                                                    <input
                                                                                        type="number" min={0}
                                                                                        className={`input-heritage !py-0.5 !text-xs font-mono w-14 text-right ${v.is_override ? "border-mpca-oxblood/60 bg-mpca-oxblood/5" : ""}`}
                                                                                        value={v.qty}
                                                                                        disabled={!canEdit}
                                                                                        onChange={(e) => setDriverOverride(m.id, key, e.target.value)}
                                                                                        data-testid={`ub-driver-${m.id}-${key}`}
                                                                                    />
                                                                                    <span className="text-[10px] text-mpca-gray-dark">{label}</span>
                                                                                    {v.is_override && canEdit && (
                                                                                        <button
                                                                                            onClick={() => resetDriverOverride(m.id, key, v.auto_qty)}
                                                                                            className="text-[9px] text-mpca-brass hover:text-mpca-oxblood underline"
                                                                                            data-testid={`ub-driver-reset-${m.id}-${key}`}
                                                                                            title={`Auto = ${v.auto_qty}`}
                                                                                        >
                                                                                            reset
                                                                                        </button>
                                                                                    )}
                                                                                    {!v.is_override && (
                                                                                        <span className="text-[9px] text-mpca-gray-dark italic">auto</span>
                                                                                    )}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-[10px] text-mpca-gray-dark font-mono">flat</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-1.5 font-mono text-[11px] text-mpca-charcoal">
                                                                            {v.basis === "Match"
                                                                                ? `${INR(v.md_rate)} × ${v.qty} = ${INR(v.md_amount)}`
                                                                                : `${INR(v.md_rate)} × ${v.qty} × ${m.match_days}d = ${INR(v.md_amount)}`}
                                                                        </td>
                                                                        <td className="px-3 py-1.5 font-mono text-[11px] text-mpca-brass">
                                                                            {v.basis === "Match" ? "—"
                                                                                : `${INR(v.nmd_rate)} × ${v.qty} × ${m.non_match_days}d = ${INR(v.nmd_amount)}`}
                                                                        </td>
                                                                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-mpca-oxblood">{INR(total)}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                            <tr className="border-t-2 border-mpca-brass/40 bg-mpca-parchment/40 font-semibold">
                                                                <td colSpan={2} className="px-3 py-1.5 text-right uppercase tracking-widest text-[10px] text-mpca-brass">Match total</td>
                                                                <td className="px-3 py-1.5 font-mono text-mpca-green-dark">{INR(m.md_amount)}</td>
                                                                <td className="px-3 py-1.5 font-mono text-mpca-brass">{INR(m.nmd_amount)}</td>
                                                                <td className="px-3 py-1.5 text-right font-mono text-mpca-oxblood">{INR(m.total)}</td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {(tab === "travel" || printMode) && (
                    <div className="space-y-4" data-testid="ub-travel-panel">
                        {(!travel.trips || travel.trips.length === 0) ? (
                            <div className="border border-dashed border-mpca-brass/40 bg-mpca-parchment/40 px-6 py-8 text-center text-sm italic text-mpca-gray-dark">
                                No visiting-division trips computed. Assign fixture pools + host to see travel grants here.
                            </div>
                        ) : (
                            <>
                            <div className="border border-mpca-brass/30 overflow-x-auto" data-testid="ub-travel-by-div">
                                <div className="px-4 py-2 bg-mpca-navy text-mpca-gold-light font-serif text-sm">Travel Grant · by Division</div>
                                <table className="w-full text-sm">
                                    <thead className="bg-mpca-parchment/60 text-mpca-brass uppercase text-[9px] tracking-widest">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Division</th>
                                            <th className="px-3 py-2 text-right">Trips</th>
                                            <th className="px-3 py-2 text-right">Total ₹</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(travel.by_division || []).map((d, i) => (
                                            <tr key={i} className="border-t border-mpca-brass/10">
                                                <td className="px-3 py-2 font-serif text-mpca-green-dark">{d.division}</td>
                                                <td className="px-3 py-2 text-right font-mono">{d.trips}</td>
                                                <td className="px-3 py-2 text-right font-mono font-semibold">{INR(d.total)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-mpca-parchment/60 border-t-2 border-mpca-brass/40 font-semibold">
                                            <td className="px-3 py-2 uppercase tracking-widest text-[10px] text-mpca-brass">Grand</td>
                                            <td className="px-3 py-2"></td>
                                            <td className="px-3 py-2 text-right font-mono text-mpca-oxblood">{INR(travel.grand_total)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="border border-mpca-brass/30 overflow-x-auto" data-testid="ub-travel-trips">
                                <div className="px-4 py-2 bg-mpca-navy text-mpca-gold-light font-serif text-sm flex items-center justify-between">
                                    <span>Travel Grant · by Trip</span>
                                    <span className="text-[10px] uppercase tracking-widest opacity-80">Edit Pax / MD / NMD inline to override auto-derived values</span>
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-mpca-parchment/60 text-mpca-brass uppercase text-[9px] tracking-widest">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Division</th>
                                            <th className="px-3 py-2 text-left">Pool</th>
                                            <th className="px-3 py-2 text-left">Host</th>
                                            <th className="px-3 py-2 text-right w-24">Pax</th>
                                            <th className="px-3 py-2 text-right w-20">MD</th>
                                            <th className="px-3 py-2 text-right w-20">NMD</th>
                                            <th className="px-3 py-2 text-right">Total ₹</th>
                                            <th className="px-3 py-2 text-right w-20"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(travel.trips || []).map((t) => (
                                            <TripRow
                                                key={t.id}
                                                trip={t}
                                                canEdit={canEdit}
                                                tournamentId={tournament.id}
                                                onSaved={() => compute(false)}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            </>
                        )}
                    </div>
                )}
                </>
            )}
        </div>
    );
}

function TabButton({ active, onClick, children, icon, testId }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-1.5 border-b-2 transition-colors ${active ? "border-mpca-oxblood text-mpca-oxblood bg-mpca-oxblood/5" : "border-transparent text-mpca-gray-dark hover:text-mpca-brass"}`}
            data-testid={testId}
        >
            {icon} {children}
        </button>
    );
}

// MPCA-221 · Editable Trip row — override pax / md / nmd per trip.
function TripRow({ trip, canEdit, tournamentId, onSaved }) {
    const [edit, setEdit] = useState({ pax: trip.pax, md: trip.match_days, nmd: trip.non_match_days });
    const [saving, setSaving] = useState(false);
    const dirty =
        Number(edit.pax) !== Number(trip.pax) ||
        Number(edit.md) !== Number(trip.match_days) ||
        Number(edit.nmd) !== Number(trip.non_match_days);

    const save = async () => {
        setSaving(true);
        try {
            const patch = { [trip.id]: { pax: Number(edit.pax) || 0, md: Number(edit.md) || 0, nmd: Number(edit.nmd) || 0 } };
            await api.patch(`/tournaments/${tournamentId}/travel-trip-overrides`, patch);
            await onSaved?.();
        } finally { setSaving(false); }
    };
    const reset = async () => {
        setSaving(true);
        try {
            await api.patch(`/tournaments/${tournamentId}/travel-trip-overrides`, { [trip.id]: null });
            await onSaved?.();
        } finally { setSaving(false); }
    };

    const inputCls = "input-heritage !py-1 !text-xs font-mono w-16 text-right";
    return (
        <tr className="border-t border-mpca-brass/10 hover:bg-mpca-parchment/40" data-testid={`ub-trip-${trip.id}`}>
            <td className="px-3 py-2 font-serif text-mpca-green-dark">{trip.division}</td>
            <td className="px-3 py-2 text-xs">{trip.pool_name}</td>
            <td className="px-3 py-2 font-mono text-xs">{trip.host_code}</td>
            <td className="px-3 py-2 text-right">
                <input type="number" min={0} className={inputCls} value={edit.pax} disabled={!canEdit} onChange={(e) => setEdit({ ...edit, pax: e.target.value })} data-testid={`ub-trip-pax-${trip.id}`} />
            </td>
            <td className="px-3 py-2 text-right">
                <input type="number" min={0} className={inputCls} value={edit.md} disabled={!canEdit} onChange={(e) => setEdit({ ...edit, md: e.target.value })} data-testid={`ub-trip-md-${trip.id}`} />
            </td>
            <td className="px-3 py-2 text-right">
                <input type="number" min={0} className={inputCls} value={edit.nmd} disabled={!canEdit} onChange={(e) => setEdit({ ...edit, nmd: e.target.value })} data-testid={`ub-trip-nmd-${trip.id}`} />
            </td>
            <td className="px-3 py-2 text-right font-mono font-semibold">{INR(trip.total)}</td>
            <td className="px-3 py-2 text-right">
                {canEdit && dirty && (
                    <button onClick={save} disabled={saving} className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 disabled:opacity-40" data-testid={`ub-trip-save-${trip.id}`}>
                        {saving ? "…" : "Save"}
                    </button>
                )}
                {canEdit && !dirty && (
                    <button onClick={reset} disabled={saving} className="text-[9px] uppercase tracking-widest text-mpca-brass border border-mpca-brass/40 px-2 py-1 disabled:opacity-40" title="Clear override & restore auto values" data-testid={`ub-trip-reset-${trip.id}`}>
                        Reset
                    </button>
                )}
            </td>
        </tr>
    );
}
