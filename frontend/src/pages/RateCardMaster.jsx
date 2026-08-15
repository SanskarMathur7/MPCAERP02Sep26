// MPCA-215 · Rate Card Admin — MPCA-only editor for the unified budget engine's
// rate cards. One card per (tournament_type, format_group, season). Values
// mirror the MPCA Inter-Division Utility HTML (v20).
import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, RotateCcw, Wallet, Plane, Plus, Trash2, X, Gavel } from "lucide-react";
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

// MPCA-223 · Drivers available on custom heads. Match compute engine's driver_qty().
const DRIVERS = [
    { value: "",                   label: "Flat · no driver (once per day)" },
    { value: "AwayTeamPax",        label: "Away Team Pax (squad × visiting teams)" },
    { value: "HostTeamPax",        label: "Host Team Pax (squad × 1 when host plays)" },
    { value: "MatchOfficialsPax",  label: "Match Officials Pax (assigned officials)" },
    { value: "AllPax",             label: "All Pax (host + away + officials + other)" },
    { value: "TeamCount",          label: "Team Count (teams in match, usually 2)" },
    { value: "HostTeamCount",      label: "Host Team Count (1 if host plays, else 0)" },
];

const INR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// MPCA-232 · Match Official role rows shown in the Master Rate Card. The
// "Observer / Referee" row writes to BOTH `Observer` and `Referee` keys so
// assignments under either role name resolve to the same fee/DA.
const OFFICIAL_ROLE_ROWS = [
    { key: "Umpire",   label: "Umpire",              writes: ["Umpire"] },
    { key: "Scorer",   label: "Scorer",              writes: ["Scorer"] },
    { key: "Selector", label: "Selector",            writes: ["Selector"] },
    { key: "Observer", label: "Observer / Referee",  writes: ["Observer", "Referee"] },
];

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
    // MPCA-223 · Add-line-item modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [newHead, setNewHead] = useState({ name: "", driver: "", rooms: false, basis: "MatchDays", owner: "Host", md_rate: 0, nmd_rate: 0 });

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

    // MPCA-224 · Effective head metadata after applying overrides
    const effectiveDefaultHeads = useMemo(() => {
        const overrides = card?.head_meta_overrides || {};
        return (heads.budget_heads || []).map((h) => ({ ...h, ...(overrides[h.key] || {}) }));
    }, [heads.budget_heads, card?.head_meta_overrides]);

    // MPCA-224 · Patch a head's metadata (name / driver / owner). Works for
    // both default 17 heads and custom line items — backend routes to
    // `head_meta_overrides` or updates the custom row in-place.
    const patchHeadMeta = async (key, field, value) => {
        setSaving(true); setErr(null);
        try {
            const { data } = await api.patch(`/rate-cards/${card.id}/heads/${key}`, { [field]: value });
            setCard(data);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };
    const setTravelRate = (headKey, mdOrNmd, val) => {
        const next = { ...card, travel_rates: { ...(card.travel_rates || {}) } };
        next.travel_rates[headKey] = { ...(next.travel_rates[headKey] || { md: 0, nmd: 0 }), [mdOrNmd]: Number(val) || 0 };
        setCard(next); setDirty(true);
    };

    // MPCA-232 · Officials rates setter — updates ALL role keys mirrored by a
    // single UI row (e.g. Observer / Referee share one editor).
    const setOfficialRate = (roleKeys, field, val) => {
        const numeric = Number(val) || 0;
        const nextOff = { ...(card.officials_rates || {}) };
        roleKeys.forEach((r) => {
            nextOff[r] = { ...(nextOff[r] || { fee_per_day: 0, da_per_day: 0 }), [field]: numeric };
        });
        setCard({ ...card, officials_rates: nextOff });
        setDirty(true);
    };

    const save = async () => {
        if (!card) return;
        setSaving(true); setErr(null); setMsg(null);
        try {
            const { data } = await api.patch(`/rate-cards/${card.id}`, {
                budget_rates: card.budget_rates,
                travel_rates: card.travel_rates,
                officials_rates: card.officials_rates || {},
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

    // MPCA-223 · Custom head handlers
    const addCustomHead = async () => {
        if (!newHead.name?.trim()) { setErr("Line item name is required."); return; }
        setSaving(true); setErr(null);
        try {
            const { data } = await api.post(`/rate-cards/${card.id}/custom-heads`, {
                ...newHead,
                md_rate: Number(newHead.md_rate) || 0,
                nmd_rate: Number(newHead.nmd_rate) || 0,
            });
            setCard(data);
            setShowAddModal(false);
            setNewHead({ name: "", driver: "", rooms: false, basis: "MatchDays", owner: "Host", md_rate: 0, nmd_rate: 0 });
            setMsg("Line item added.");
            setTimeout(() => setMsg(null), 2000);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };
    const removeCustomHead = async (key) => {
        if (!window.confirm("Delete this custom line item? Any per-match qty for it will also be dropped.")) return;
        setSaving(true); setErr(null);
        try {
            const { data } = await api.delete(`/rate-cards/${card.id}/custom-heads/${key}`);
            setCard(data);
            setMsg("Line item removed.");
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
                                {effectiveDefaultHeads.map((h) => {
                                    const r = (card.budget_rates || {})[h.key] || { md: 0, nmd: 0 };
                                    return (
                                        <tr key={h.key} className="border-b border-mpca-brass/10" data-testid={`rc-b-row-${h.key}`}>
                                            <td className="px-3 py-2 font-serif text-mpca-green-dark">
                                                <input
                                                    type="text"
                                                    className="input-heritage !py-1 !text-xs w-full font-serif"
                                                    value={h.name}
                                                    disabled={!canEdit}
                                                    onBlur={(e) => e.target.value !== h.name && patchHeadMeta(h.key, "name", e.target.value)}
                                                    onChange={(e) => setCard((c) => ({ ...c, head_meta_overrides: { ...(c.head_meta_overrides || {}), [h.key]: { ...(c.head_meta_overrides?.[h.key] || {}), name: e.target.value } } }))}
                                                    data-testid={`rc-b-name-${h.key}`}
                                                />
                                                <div className="mt-1 text-[9px] text-mpca-brass italic space-x-1">
                                                    {h.rooms && <span>rooms = ceil/2</span>}
                                                    {h.basis === "Match" && <span>once per match</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    className="input-heritage !py-1 !text-[10px] font-mono w-full"
                                                    value={h.driver || ""}
                                                    disabled={!canEdit}
                                                    onChange={(e) => patchHeadMeta(h.key, "driver", e.target.value || null)}
                                                    data-testid={`rc-b-driver-${h.key}`}
                                                >
                                                    <option value="">flat</option>
                                                    <option value="AwayTeamPax">AwayTeamPax</option>
                                                    <option value="HostTeamPax">HostTeamPax</option>
                                                    <option value="MatchOfficialsPax">MatchOfficialsPax</option>
                                                    <option value="AllPax">AllPax</option>
                                                    <option value="TeamCount">TeamCount</option>
                                                    <option value="HostTeamCount">HostTeamCount</option>
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    className={`input-heritage !py-1 !text-[10px] uppercase tracking-widest w-full ${OWNER_COLORS[h.owner] || ""}`}
                                                    value={h.owner}
                                                    disabled={!canEdit}
                                                    onChange={(e) => patchHeadMeta(h.key, "owner", e.target.value)}
                                                    data-testid={`rc-b-owner-${h.key}`}
                                                >
                                                    <option>Host</option>
                                                    <option>Visitor</option>
                                                    <option>Officials</option>
                                                    <option>Common</option>
                                                </select>
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

                {/* MPCA-223 · Custom line items */}
                <div className="border border-mpca-brass/30 bg-mpca-ivory mb-8" data-testid="rc-custom-table">
                    <div className="px-4 py-2 bg-mpca-oxblood text-mpca-ivory flex items-center gap-2">
                        <Wallet size={13} />
                        <div className="font-serif text-sm">Custom Line Items · {(card.custom_heads || []).length}</div>
                        <div className="text-[10px] uppercase tracking-widest opacity-80 ml-auto flex items-center gap-2">
                            Extend the 17 defaults with tournament-type-specific rows
                            {canEdit && (
                                <button onClick={() => setShowAddModal(true)} className="ml-2 bg-mpca-ivory text-mpca-oxblood px-2 py-1 flex items-center gap-1 hover:bg-mpca-gold-light" data-testid="rc-add-line-item-btn">
                                    <Plus size={10} /> Add Line Item
                                </button>
                            )}
                        </div>
                    </div>
                    {(card.custom_heads || []).length === 0 ? (
                        <div className="p-4 text-center text-xs text-mpca-gray-dark italic">
                            No custom line items yet. Click <b>Add Line Item</b> to extend this rate card.
                        </div>
                    ) : (
                        <table className="w-full text-xs">
                            <thead className="bg-mpca-parchment/60 text-mpca-brass uppercase text-[9px] tracking-widest">
                                <tr>
                                    <th className="px-3 py-2 text-left">Head</th>
                                    <th className="px-3 py-2 text-left">Driver</th>
                                    <th className="px-3 py-2 text-left">Basis</th>
                                    <th className="px-3 py-2 text-left">Owner</th>
                                    <th className="px-3 py-2 text-right w-28">MD rate (₹)</th>
                                    <th className="px-3 py-2 text-right w-28">NMD rate (₹)</th>
                                    <th className="px-3 py-2 text-right w-12"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {(card.custom_heads || []).map((h) => {
                                    const r = (card.budget_rates || {})[h.key] || { md: h.md_rate, nmd: h.nmd_rate };
                                    return (
                                        <tr key={h.key} className="border-b border-mpca-brass/10" data-testid={`rc-custom-row-${h.key}`}>
                                            <td className="px-3 py-2 font-serif text-mpca-green-dark">
                                                <input
                                                    type="text"
                                                    className="input-heritage !py-1 !text-xs w-full font-serif"
                                                    value={h.name}
                                                    disabled={!canEdit}
                                                    onBlur={(e) => e.target.value !== h.name && patchHeadMeta(h.key, "name", e.target.value)}
                                                    onChange={(e) => setCard((c) => ({ ...c, custom_heads: (c.custom_heads || []).map((x) => x.key === h.key ? { ...x, name: e.target.value } : x) }))}
                                                    data-testid={`rc-custom-name-${h.key}`}
                                                />
                                                <div className="mt-1 text-[9px] text-mpca-brass italic space-x-1">
                                                    {h.rooms && <span>rooms = ceil/2</span>}
                                                    {h.basis === "Match" && <span>once per match</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    className="input-heritage !py-1 !text-[10px] font-mono w-full"
                                                    value={h.driver || ""}
                                                    disabled={!canEdit}
                                                    onChange={(e) => patchHeadMeta(h.key, "driver", e.target.value || null)}
                                                    data-testid={`rc-custom-driver-${h.key}`}
                                                >
                                                    <option value="">flat</option>
                                                    <option value="AwayTeamPax">AwayTeamPax</option>
                                                    <option value="HostTeamPax">HostTeamPax</option>
                                                    <option value="MatchOfficialsPax">MatchOfficialsPax</option>
                                                    <option value="AllPax">AllPax</option>
                                                    <option value="TeamCount">TeamCount</option>
                                                    <option value="HostTeamCount">HostTeamCount</option>
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select className="input-heritage !py-1 !text-[10px] font-mono w-full" value={h.basis} disabled={!canEdit} onChange={(e) => patchHeadMeta(h.key, "basis", e.target.value)} data-testid={`rc-custom-basis-${h.key}`}>
                                                    <option value="MatchDays">MatchDays</option>
                                                    <option value="Match">Match</option>
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    className={`input-heritage !py-1 !text-[10px] uppercase tracking-widest w-full ${OWNER_COLORS[h.owner] || ""}`}
                                                    value={h.owner}
                                                    disabled={!canEdit}
                                                    onChange={(e) => patchHeadMeta(h.key, "owner", e.target.value)}
                                                    data-testid={`rc-custom-owner-${h.key}`}
                                                >
                                                    <option>Host</option>
                                                    <option>Visitor</option>
                                                    <option>Officials</option>
                                                    <option>Common</option>
                                                </select>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <input type="number" min={0} className="input-heritage !py-1 !text-xs font-mono w-24 text-right" value={r.md ?? 0} disabled={!canEdit} onChange={(e) => setBudgetRate(h.key, "md", e.target.value)} data-testid={`rc-custom-md-${h.key}`} />
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <input type="number" min={0} className="input-heritage !py-1 !text-xs font-mono w-24 text-right" value={r.nmd ?? 0} disabled={!canEdit || h.basis === "Match"} onChange={(e) => setBudgetRate(h.key, "nmd", e.target.value)} data-testid={`rc-custom-nmd-${h.key}`} />
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {canEdit && (
                                                    <button onClick={() => removeCustomHead(h.key)} className="text-mpca-oxblood/70 hover:text-mpca-oxblood" title="Delete line item" data-testid={`rc-custom-del-${h.key}`}>
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* MPCA-232 · Match Officials Rates */}
                <div className="border border-mpca-brass/30 bg-mpca-ivory mb-8" data-testid="rc-officials-table">
                    <div className="px-4 py-2 bg-mpca-navy text-mpca-gold-light flex items-center gap-2">
                        <Gavel size={13} />
                        <div className="font-serif text-sm">Match Officials Rates · per role</div>
                        <div className="text-[10px] uppercase tracking-widest opacity-80 ml-auto">
                            Fee/day + DA/day · propagates to new assignments in {fg === "multi_day" ? "Multi-Day / 4-Day" : "Ltd Overs / T20"} tournaments
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-mpca-parchment/60 text-mpca-brass uppercase text-[9px] tracking-widest">
                                <tr>
                                    <th className="px-3 py-2 text-left w-1/3">Role</th>
                                    <th className="px-3 py-2 text-right w-40">Fee / day (₹)</th>
                                    <th className="px-3 py-2 text-right w-40">DA / day (₹)</th>
                                    <th className="px-3 py-2 text-left text-[9px] italic">Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {OFFICIAL_ROLE_ROWS.map((row) => {
                                    const rate = (card.officials_rates || {})[row.key] || { fee_per_day: 0, da_per_day: 0 };
                                    return (
                                        <tr key={row.key} className="border-b border-mpca-brass/10" data-testid={`rc-off-row-${row.key}`}>
                                            <td className="px-3 py-2 font-serif text-mpca-green-dark">{row.label}</td>
                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    className="input-heritage !py-1 !text-xs font-mono w-32 text-right"
                                                    value={rate.fee_per_day ?? 0}
                                                    disabled={!canEdit}
                                                    onChange={(e) => setOfficialRate(row.writes, "fee_per_day", e.target.value)}
                                                    data-testid={`rc-off-fee-${row.key}`}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    className="input-heritage !py-1 !text-xs font-mono w-32 text-right"
                                                    value={rate.da_per_day ?? 0}
                                                    disabled={!canEdit}
                                                    onChange={(e) => setOfficialRate(row.writes, "da_per_day", e.target.value)}
                                                    data-testid={`rc-off-da-${row.key}`}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-[9px] text-mpca-brass italic">
                                                {row.writes.length > 1 ? `shared across ${row.writes.join(" & ")}` : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-2 bg-mpca-parchment/40 border-t border-mpca-brass/20 text-[10px] text-mpca-brass italic">
                        Fee is paid on <b>scheduled</b> days. DA is paid on <b>actual</b> days played. Existing assignments keep their snapshot rates — new assignments will inherit these values.
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

            {/* MPCA-223 · Add-Line-Item modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-mpca-charcoal/60 flex items-center justify-center z-50 p-4" data-testid="rc-add-modal">
                    <div className="bg-mpca-ivory border border-mpca-brass/40 max-w-lg w-full p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="font-serif text-lg text-mpca-green-dark">New Line Item</div>
                            <button onClick={() => setShowAddModal(false)} className="text-mpca-gray-dark hover:text-mpca-oxblood"><X size={16} /></button>
                        </div>
                        <div className="text-xs text-mpca-gray-dark italic">
                            Extends this rate card with an additional budget head. Every match will get this row in its per-head breakdown.
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="col-span-2 block">
                                <div className="overline text-[9px] mb-1">Line item name</div>
                                <input className="input-heritage !py-1.5" value={newHead.name} onChange={(e) => setNewHead({ ...newHead, name: e.target.value })} placeholder="e.g. Trophy engraving, VIP hospitality" data-testid="rc-new-name" />
                            </label>
                            <label className="col-span-2 block">
                                <div className="overline text-[9px] mb-1">Driver</div>
                                <select className="input-heritage !py-1.5" value={newHead.driver} onChange={(e) => setNewHead({ ...newHead, driver: e.target.value })} data-testid="rc-new-driver">
                                    {DRIVERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Basis</div>
                                <select className="input-heritage !py-1.5" value={newHead.basis} onChange={(e) => setNewHead({ ...newHead, basis: e.target.value })} data-testid="rc-new-basis">
                                    <option value="MatchDays">MatchDays (× MD + × NMD)</option>
                                    <option value="Match">Match (once per match)</option>
                                </select>
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">Owner</div>
                                <select className="input-heritage !py-1.5" value={newHead.owner} onChange={(e) => setNewHead({ ...newHead, owner: e.target.value })} data-testid="rc-new-owner">
                                    <option>Host</option>
                                    <option>Visitor</option>
                                    <option>Officials</option>
                                    <option>Common</option>
                                </select>
                            </label>
                            <label className="flex items-center gap-2 col-span-2 pt-1">
                                <input type="checkbox" checked={newHead.rooms} onChange={(e) => setNewHead({ ...newHead, rooms: e.target.checked })} data-testid="rc-new-rooms" />
                                <span className="text-xs">Rooms rule — qty = ceil(driver ÷ 2)</span>
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">MD rate (₹)</div>
                                <input type="number" min={0} className="input-heritage !py-1.5 font-mono" value={newHead.md_rate} onChange={(e) => setNewHead({ ...newHead, md_rate: e.target.value })} data-testid="rc-new-md" />
                            </label>
                            <label className="block">
                                <div className="overline text-[9px] mb-1">NMD rate (₹)</div>
                                <input type="number" min={0} className="input-heritage !py-1.5 font-mono" value={newHead.nmd_rate} onChange={(e) => setNewHead({ ...newHead, nmd_rate: e.target.value })} disabled={newHead.basis === "Match"} data-testid="rc-new-nmd" />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-mpca-brass/20">
                            <button onClick={() => setShowAddModal(false)} className="text-xs uppercase tracking-widest text-mpca-gray-dark px-3 py-1.5 hover:text-mpca-oxblood">Cancel</button>
                            <button onClick={addCustomHead} disabled={saving || !newHead.name?.trim()} className="text-xs uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="rc-new-save">
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add Line Item
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
