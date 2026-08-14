// MPCA-215 · Rate Card Admin — MPCA-only editor for the unified budget engine's
// rate cards. One card per (tournament_type, format_group, season). Values
// mirror the MPCA Inter-Division Utility HTML (v20).
import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, RotateCcw, Wallet, Plane } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const TOURNAMENT_TYPES = [
    { code: "Inter_Divisional",  label: "Inter-Divisional" },
    { code: "Inter_District",    label: "Inter-District" },
    { code: "BCCI",              label: "BCCI" },
    { code: "Championship",      label: "Championship" },
    { code: "Pre_Tournament_Camp", label: "Pre-Tournament Camp" },
];

const FORMAT_GROUPS = [
    { code: "ltd_overs", label: "Limited Overs · T20" },
    { code: "multi_day", label: "Multi-Day · 4-Day" },
];

const OWNER_COLORS = {
    Host:      "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/30",
    Visitor:   "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/30",
    Officials: "bg-mpca-navy/10 text-mpca-navy border-mpca-navy/30",
    Common:    "bg-mpca-gray-dark/10 text-mpca-gray-dark border-mpca-gray-dark/30",
};

const INR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function RateCardMaster() {
    const { persona } = useAuth();
    const canEdit = persona?.body_type === "State" || persona?.body_code === "MPCA";

    const [season] = useState("2026-27");
    const [tt, setTt] = useState("Inter_Divisional");
    const [fg, setFg] = useState("multi_day");
    const [card, setCard] = useState(null);
    const [heads, setHeads] = useState({ budget_heads: [], travel_heads: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [err, setErr] = useState(null);
    const [msg, setMsg] = useState(null);

    // Load head metadata (17 budget + 8 travel) once
    useEffect(() => {
        api.get("/rate-cards/heads").then((r) => setHeads(r.data || { budget_heads: [], travel_heads: [] })).catch(() => {});
    }, []);

    const loadCard = async () => {
        setLoading(true); setErr(null);
        try {
            const { data } = await api.get(`/rate-cards/for/${tt}/${fg}`, { params: { season } });
            setCard(data);
            setDirty(false);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { loadCard(); }, [tt, fg]);

    const setBudgetRate = (headKey, mdOrNmd, val) => {
        const next = { ...card, budget_rates: { ...(card.budget_rates || {}) } };
        next.budget_rates[headKey] = { ...(next.budget_rates[headKey] || { md: 0, nmd: 0 }), [mdOrNmd]: Number(val) || 0 };
        setCard(next); setDirty(true);
    };
    const setTravelRate = (headKey, mdOrNmd, val) => {
        const next = { ...card, travel_rates: { ...(card.travel_rates || {}) } };
        next.travel_rates[headKey] = { ...(next.travel_rates[headKey] || { md: 0, nmd: 0 }), [mdOrNmd]: Number(val) || 0 };
        setCard(next); setDirty(true);
    };

    const save = async () => {
        if (!card) return;
        setSaving(true); setErr(null); setMsg(null);
        try {
            const { data } = await api.patch(`/rate-cards/${card.id}`, {
                budget_rates: card.budget_rates,
                travel_rates: card.travel_rates,
            });
            setCard(data); setDirty(false); setMsg("Saved.");
            setTimeout(() => setMsg(null), 2000);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const resetToDefault = async () => {
        if (!card) return;
        if (!window.confirm("Reset this rate card to the seeded defaults? This overwrites any custom values.")) return;
        setSaving(true); setErr(null); setMsg(null);
        try {
            const { data } = await api.post(`/rate-cards/reset/${card.id}`);
            setCard(data); setDirty(false); setMsg("Reset to defaults.");
            setTimeout(() => setMsg(null), 2000);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const budgetHeads = heads.budget_heads || [];
    const travelHeads = heads.travel_heads || [];
    const budgetSubtotal = useMemo(() => budgetHeads.reduce((acc, h) => {
        const r = (card?.budget_rates || {})[h.key] || { md: 0, nmd: 0 };
        return acc + (r.md || 0) + (r.nmd || 0);
    }, 0), [card, budgetHeads]);

    return (
        <div className="p-8 max-w-7xl mx-auto" data-testid="rate-card-page">
            <div className="mb-6">
                <div className="overline text-[9px] mb-1">Article X · Unified Budget Engine · Rate Cards</div>
                <h1 className="font-serif text-3xl text-mpca-green-dark">Master Rate Card</h1>
                <p className="text-mpca-gray-dark text-sm mt-2 max-w-3xl">
                    Per-day / per-match rates that feed the unified budget engine. One card per <b>tournament type × format</b> pair.
                    Values here apply to <b>every</b> tournament of that combination in the current season.
                    {canEdit ? "" : " Only MPCA-level personas may edit; you are viewing in read-only mode."}
                </p>
            </div>

            {/* Tournament type + format switcher */}
            <div className="flex flex-wrap items-center gap-4 mb-6 pb-4 border-b border-mpca-brass/30">
                <label className="flex items-center gap-2">
                    <span className="overline text-[9px]">Tournament Type</span>
                    <select className="input-heritage !py-1.5 !text-xs" value={tt} onChange={(e) => setTt(e.target.value)} data-testid="rc-tt-select">
                        {TOURNAMENT_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    </select>
                </label>
                <label className="flex items-center gap-2">
                    <span className="overline text-[9px]">Format</span>
                    <select className="input-heritage !py-1.5 !text-xs" value={fg} onChange={(e) => setFg(e.target.value)} data-testid="rc-fg-select">
                        {FORMAT_GROUPS.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
                    </select>
                </label>
                <div className="text-[10px] text-mpca-gray-dark font-mono ml-auto">Season {season}</div>
            </div>

            {loading || !card ? (
                <div className="p-10 text-center text-mpca-brass text-sm flex items-center gap-2 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Loading rate card…
                </div>
            ) : (
                <>
                {/* Owner legend */}
                <div className="flex flex-wrap gap-2 mb-4 text-[10px]">
                    <span className="overline text-mpca-brass">Owner:</span>
                    {["Host", "Visitor", "Officials", "Common"].map((k) => (
                        <span key={k} className={`px-2 py-0.5 border ${OWNER_COLORS[k]} uppercase tracking-widest`}>{k}</span>
                    ))}
                </div>

                {/* Budget heads (17) */}
                <div className="border border-mpca-brass/30 bg-mpca-ivory mb-8" data-testid="rc-budget-table">
                    <div className="px-4 py-2 bg-mpca-green-dark text-mpca-gold-light flex items-center gap-2">
                        <Wallet size={13} />
                        <div className="font-serif text-sm">Tournament Rate Card · {budgetHeads.length} heads</div>
                        <div className="text-[10px] uppercase tracking-widest opacity-80 ml-auto">md × qty × MatchDays  +  nmd × qty × NonMatchDays</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-mpca-parchment/60 text-mpca-brass uppercase text-[9px] tracking-widest">
                                <tr>
                                    <th className="px-3 py-2 text-left w-1/3">Head</th>
                                    <th className="px-3 py-2 text-left">Driver</th>
                                    <th className="px-3 py-2 text-left">Owner</th>
                                    <th className="px-3 py-2 text-right w-28">MD rate (₹)</th>
                                    <th className="px-3 py-2 text-right w-28">NMD rate (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {budgetHeads.map((h) => {
                                    const r = (card.budget_rates || {})[h.key] || { md: 0, nmd: 0 };
                                    return (
                                        <tr key={h.key} className="border-b border-mpca-brass/10" data-testid={`rc-b-row-${h.key}`}>
                                            <td className="px-3 py-2 font-serif text-mpca-green-dark">
                                                {h.name}
                                                {h.rooms && <span className="ml-1 text-[9px] text-mpca-brass italic">· rooms = ceil/2</span>}
                                                {h.basis === "Match" && <span className="ml-1 text-[9px] text-mpca-oxblood italic">· once per match</span>}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-[10px] text-mpca-brass">{h.driver || "flat"}</td>
                                            <td className="px-3 py-2">
                                                <span className={`px-1.5 py-0.5 text-[9px] border ${OWNER_COLORS[h.owner] || ""} uppercase tracking-widest`}>{h.owner}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="number" min={0}
                                                    className="input-heritage !py-1 !text-xs font-mono w-24 text-right"
                                                    value={r.md ?? 0}
                                                    disabled={!canEdit}
                                                    onChange={(e) => setBudgetRate(h.key, "md", e.target.value)}
                                                    data-testid={`rc-b-md-${h.key}`}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="number" min={0}
                                                    className="input-heritage !py-1 !text-xs font-mono w-24 text-right"
                                                    value={r.nmd ?? 0}
                                                    disabled={!canEdit || h.basis === "Match"}
                                                    onChange={(e) => setBudgetRate(h.key, "nmd", e.target.value)}
                                                    data-testid={`rc-b-nmd-${h.key}`}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-mpca-parchment/40 border-t border-mpca-brass/40">
                                    <td colSpan={3} className="px-3 py-2 text-right font-mono text-[10px] text-mpca-brass uppercase tracking-widest">Sum of unit rates (advisory)</td>
                                    <td colSpan={2} className="px-3 py-2 text-right font-mono text-mpca-oxblood" data-testid="rc-b-subtotal">{INR(budgetSubtotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Travel-grant heads (8) */}
                <div className="border border-mpca-brass/30 bg-mpca-ivory mb-8" data-testid="rc-travel-table">
                    <div className="px-4 py-2 bg-mpca-navy text-mpca-gold-light flex items-center gap-2">
                        <Plane size={13} />
                        <div className="font-serif text-sm">Travel-Grant Rate Card · {travelHeads.length} heads</div>
                        <div className="text-[10px] uppercase tracking-widest opacity-80 ml-auto">Per-pax RT + per-day fees + per-trip flats</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-mpca-parchment/60 text-mpca-brass uppercase text-[9px] tracking-widest">
                                <tr>
                                    <th className="px-3 py-2 text-left w-1/3">Head</th>
                                    <th className="px-3 py-2 text-left">Basis</th>
                                    <th className="px-3 py-2 text-left">Hint</th>
                                    <th className="px-3 py-2 text-right w-28">MD (₹)</th>
                                    <th className="px-3 py-2 text-right w-28">NMD (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {travelHeads.map((h) => {
                                    const r = (card.travel_rates || {})[h.key] || { md: 0, nmd: 0 };
                                    return (
                                        <tr key={h.key} className="border-b border-mpca-brass/10" data-testid={`rc-t-row-${h.key}`}>
                                            <td className="px-3 py-2 font-serif text-mpca-green-dark">{h.name}</td>
                                            <td className="px-3 py-2 font-mono text-[10px] text-mpca-brass">{h.basis}</td>
                                            <td className="px-3 py-2 text-[10px] text-mpca-gray-dark italic">{h.hint}</td>
                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="number" min={0}
                                                    className="input-heritage !py-1 !text-xs font-mono w-24 text-right"
                                                    value={r.md ?? 0}
                                                    disabled={!canEdit}
                                                    onChange={(e) => setTravelRate(h.key, "md", e.target.value)}
                                                    data-testid={`rc-t-md-${h.key}`}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="number" min={0}
                                                    className="input-heritage !py-1 !text-xs font-mono w-24 text-right"
                                                    value={r.nmd ?? 0}
                                                    disabled={!canEdit || h.basis !== "day"}
                                                    onChange={(e) => setTravelRate(h.key, "nmd", e.target.value)}
                                                    data-testid={`rc-t-nmd-${h.key}`}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Save / Reset bar (sticky) */}
                {canEdit && (
                    <div className="sticky bottom-0 bg-mpca-ivory border-t-2 border-mpca-brass/40 px-4 py-3 -mx-8 flex items-center gap-3 shadow-inner" data-testid="rc-action-bar">
                        {err && <span className="text-[10px] text-mpca-oxblood uppercase tracking-widest" data-testid="rc-err">{err}</span>}
                        {msg && <span className="text-[10px] text-mpca-green-dark uppercase tracking-widest" data-testid="rc-msg">{msg}</span>}
                        {dirty && !err && <span className="text-[10px] text-mpca-oxblood uppercase tracking-widest">Unsaved changes</span>}
                        <button
                            onClick={resetToDefault}
                            disabled={saving}
                            className="ml-auto text-[11px] uppercase tracking-widest border border-mpca-brass/40 text-mpca-brass px-3 py-1.5 hover:bg-mpca-brass/10 flex items-center gap-1"
                            data-testid="rc-reset-btn"
                        >
                            <RotateCcw size={11} /> Reset to defaults
                        </button>
                        <button
                            onClick={save}
                            disabled={!dirty || saving}
                            className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"
                            data-testid="rc-save-btn"
                        >
                            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                            Save Rate Card
                        </button>
                    </div>
                )}
                </>
            )}
        </div>
    );
}
