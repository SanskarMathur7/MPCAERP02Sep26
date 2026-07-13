/**
 * AssetRegister page · Sprint 3 · P5.x
 * Fixed Asset Register with SLM depreciation, tag/QR, disposal flow.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchAssets, fetchAssetsSummary, fetchAssetSchedule, createAsset, disposeAsset,
} from "@/lib/api";
import {
    Landmark, Plus, Filter, X, TrendingDown, Package, Building2, Boxes,
    ChevronRight, ArrowDownRight, Calendar as CalendarIcon,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
    if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)}`;
};

const CAT_OPTS = ["Land", "Building", "Vehicle", "Equipment", "Furniture", "Computer", "Networking", "Sports_Equipment", "Other"];

const STATUS_STYLE = {
    Active:        { bg: "bg-mpca-green-dark/15", tx: "text-mpca-green-dark", label: "Active" },
    Under_Repair:  { bg: "bg-mpca-gold-light/25", tx: "text-mpca-gold-dark",  label: "Under Repair" },
    Idle:          { bg: "bg-mpca-brass/15",      tx: "text-mpca-brass",      label: "Idle" },
    Disposed:      { bg: "bg-mpca-oxblood/15",    tx: "text-mpca-oxblood",    label: "Disposed" },
    Written_Off:   { bg: "bg-mpca-oxblood/25",    tx: "text-mpca-oxblood",    label: "Written Off" },
};

const KpiTile = ({ label, value, sub, icon: Icon, tone = "green", testid }) => {
    const toneMap = { green: "text-mpca-green-dark", oxblood: "text-mpca-oxblood", brass: "text-mpca-brass", gold: "text-mpca-gold-dark" };
    return (
        <div className="bulletin-card p-5" data-testid={testid}>
            <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
            <div className={`font-serif text-2xl ${toneMap[tone]}`}>{value}</div>
            <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
            {sub && <div className="text-[10px] text-mpca-gray-dark mt-1">{sub}</div>}
        </div>
    );
};

const AssetRegister = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState(null);
    const [schedule, setSchedule] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [showDispose, setShowDispose] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [r, s] = await Promise.all([fetchAssets(), fetchAssetsSummary()]);
            setRows(r);
            setStats(s);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    useEffect(() => {
        if (selected) {
            fetchAssetSchedule(selected.id, 24).then(setSchedule).catch(() => setSchedule(null));
        } else {
            setSchedule(null);
        }
    }, [selected]);

    const filtered = useMemo(() => {
        if (filter === "all") return rows;
        if (filter === "depreciating") return rows.filter(r => r.category !== "Land" && r.status !== "Disposed");
        return rows.filter(r => r.category === filter || r.status === filter);
    }, [rows, filter]);

    const handleDispose = async (payload) => {
        if (!selected) return;
        setBusy(true);
        try {
            await disposeAsset(selected.id, payload);
            await load();
            setShowDispose(false);
            setSelected(null);
        } catch (e) {
            alert("Disposal failed: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading asset register…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="asset-register-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><Landmark size={12} /> Sprint 3 · Asset Register</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Fixed Asset Register</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Straight-line depreciation with monthly book-value roll-forward, tag/QR reference, and disposal accounting.
                    </p>
                </div>
                <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="new-asset-btn">
                    <Plus size={14} /> Add Asset
                </button>
            </div>

            <div className="crest-divider mb-8" />

            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Gross Block" value={fmtINR(stats.gross_block_inr)} sub={`${stats.count} assets`} icon={Building2} testid="kpi-gross" />
                    <KpiTile label="Accum. Depreciation" value={fmtINR(stats.accumulated_depreciation_inr)} icon={TrendingDown} tone="oxblood" testid="kpi-depr" />
                    <KpiTile label="Net Block" value={fmtINR(stats.net_block_inr)} sub="Current book value" icon={Boxes} tone="green" testid="kpi-net" />
                    <KpiTile label="Utilisation" value={`${((stats.net_block_inr / stats.gross_block_inr) * 100).toFixed(0)}%`} sub="Net ÷ Gross" icon={Package} tone="brass" testid="kpi-util" />
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-6" data-testid="asset-filters">
                <Filter size={12} className="text-mpca-brass" />
                {["all", "depreciating", ...CAT_OPTS, "Disposed"].map((f) => (
                    <button key={f} onClick={() => setFilter(f)} data-testid={`asset-filter-${f}`}
                        className={"px-3 py-1 text-[10px] tracking-widest uppercase border transition-colors " +
                            (filter === f ? "bg-mpca-green-dark text-white border-mpca-green-dark" :
                                "bg-white text-mpca-charcoal border-mpca-brass/30 hover:border-mpca-brass")}>
                        {f.replace(/_/g, " ")}
                    </button>
                ))}
            </div>

            <div className="bulletin-card overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No assets match this filter.</div>
                ) : (
                    <table className="w-full text-sm" data-testid="asset-table">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Asset No.", "Category", "Description", "Purchase", "Cost", "Book Value", "Status", ""].map((h) => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((a) => {
                                const st = STATUS_STYLE[a.status] || STATUS_STYLE.Active;
                                const util = a.cost_inr ? (a.book_value_inr / a.cost_inr) * 100 : 100;
                                return (
                                    <tr key={a.id} onClick={() => setSelected(a)}
                                        className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40 cursor-pointer"
                                        data-testid={`asset-row-${a.id}`}>
                                        <td className="px-4 py-3 font-mono text-[11px] text-mpca-charcoal">{a.asset_no}</td>
                                        <td className="px-4 py-3 text-mpca-green-dark text-[11px]">{a.category?.replace(/_/g, " ")}</td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[11px] truncate max-w-[280px]">{a.description}</td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-mpca-gray-dark">{a.purchase_date}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-charcoal">{fmtINR(a.cost_inr)}</td>
                                        <td className="px-4 py-3 font-mono">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-14 bg-mpca-brass/15">
                                                    <div className="h-full bg-mpca-green-deep" style={{ width: `${Math.min(100, util)}%` }} />
                                                </div>
                                                <span className="text-mpca-green-dark text-[11px]">{fmtINR(a.book_value_inr)}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase ${st.bg} ${st.tx}`}>
                                                {st.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right"><ChevronRight size={14} className="text-mpca-gray-dark inline" /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <AssetDrawer asset={selected} schedule={schedule} onClose={() => setSelected(null)}
                              onDispose={() => setShowDispose(true)} />
            )}
            {showNew && <NewAssetDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} persona={persona} />}
            {showDispose && selected && (
                <DisposeDialog asset={selected} onClose={() => setShowDispose(false)}
                                onSubmit={handleDispose} busy={busy} />
            )}
        </div>
    );
};

const AssetDrawer = ({ asset, schedule, onClose, onDispose }) => {
    const st = STATUS_STYLE[asset.status] || STATUS_STYLE.Active;
    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-3xl bg-mpca-ivory h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="asset-drawer">
                <div className="border-b border-mpca-brass/40 px-6 py-5 flex justify-between items-start gap-4 bg-mpca-parchment">
                    <div>
                        <div className="overline">{asset.category?.replace(/_/g, " ")} · {asset.body_id}</div>
                        <div className="font-mono text-[11px] text-mpca-brass mt-1">{asset.asset_no}</div>
                        <h2 className="font-serif text-2xl text-mpca-green-dark mt-2">{asset.description}</h2>
                        <div className="text-[11px] text-mpca-charcoal mt-1">{asset.location}</div>
                        <div className="mt-2 flex items-center gap-2">
                            <span className={`inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase ${st.bg} ${st.tx}`}>{st.label}</span>
                            {asset.tag_no && <span className="font-mono text-[10px] text-mpca-brass">🏷 {asset.tag_no}</span>}
                        </div>
                    </div>
                    <button onClick={onClose} data-testid="close-asset-drawer"><X size={20} /></button>
                </div>

                <div className="px-6 py-5 space-y-6">
                    <div className="grid grid-cols-4 gap-3 text-center">
                        <div><div className="overline">Cost</div><div className="font-mono text-mpca-charcoal text-sm mt-1">{fmtINR(asset.cost_inr)}</div></div>
                        <div><div className="overline">Salvage</div><div className="font-mono text-mpca-charcoal text-sm mt-1">{fmtINR(asset.salvage_value_inr)}</div></div>
                        <div><div className="overline">Accum. Dep.</div><div className="font-mono text-mpca-oxblood text-sm mt-1">{fmtINR(asset.accumulated_depreciation_inr)}</div></div>
                        <div><div className="overline">Book Value</div><div className="font-mono text-mpca-green-dark text-sm mt-1">{fmtINR(asset.book_value_inr)}</div></div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-[11px]">
                        <div><div className="overline">Purchase Date</div><div className="mt-1 font-mono text-mpca-charcoal">{asset.purchase_date}</div></div>
                        <div><div className="overline">Life (yrs)</div><div className="mt-1 font-mono text-mpca-charcoal">{asset.useful_life_years || "—"}</div></div>
                        <div><div className="overline">GL Account</div><div className="mt-1 text-mpca-charcoal">{asset.gl_account || "—"}</div></div>
                    </div>

                    {asset.status === "Disposed" && (
                        <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/30 px-4 py-3 text-[11px]" data-testid="disposal-block">
                            <div className="uppercase tracking-widest text-[10px] text-mpca-oxblood mb-1">Disposal Record</div>
                            <div className="text-mpca-charcoal">On <b>{asset.disposal_date}</b> · Received <b>{fmtINR(asset.disposal_amount_inr)}</b> vs Book <b>{fmtINR(asset.book_value_inr)}</b></div>
                            <div className="text-mpca-charcoal mt-1">Gain/Loss: <b className={(asset.gain_loss_on_disposal_inr || 0) >= 0 ? "text-mpca-green-deep" : "text-mpca-oxblood"}>{fmtINR(asset.gain_loss_on_disposal_inr)}</b></div>
                            <div className="italic text-mpca-gray-dark mt-1">&ldquo;{asset.disposal_reason}&rdquo;</div>
                        </div>
                    )}

                    {schedule && schedule.rows?.length > 0 && (
                        <div>
                            <div className="overline mb-2 flex items-center gap-1"><CalendarIcon size={11} /> Depreciation Schedule · next 24 months</div>
                            <div className="border border-mpca-brass/30 max-h-80 overflow-y-auto">
                                <table className="w-full text-[11px]" data-testid="dep-schedule">
                                    <thead className="bg-mpca-parchment/60 sticky top-0">
                                        <tr>
                                            {["Period", "Depreciation", "Accumulated", "Book Value"].map(h => (
                                                <th key={h} className="text-left px-2 py-1.5 text-[9px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schedule.rows.map((r, i) => (
                                            <tr key={i} className="border-t border-mpca-brass/10">
                                                <td className="px-2 py-1 font-mono text-mpca-charcoal">{r.period_label}</td>
                                                <td className="px-2 py-1 font-mono text-mpca-oxblood">{fmtINR(r.depreciation_inr)}</td>
                                                <td className="px-2 py-1 font-mono text-mpca-charcoal">{fmtINR(r.accumulated_inr)}</td>
                                                <td className="px-2 py-1 font-mono text-mpca-green-dark">{fmtINR(r.book_value_inr)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {asset.status !== "Disposed" && (
                        <div className="border-t border-mpca-brass/30 pt-4 flex justify-end">
                            <button onClick={onDispose} className="btn-heritage-secondary text-mpca-oxblood" data-testid="dispose-btn">
                                <ArrowDownRight size={12} /> Dispose Asset
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const NewAssetDialog = ({ onClose, onCreated, persona }) => {
    const [form, setForm] = useState({
        body_id: persona?.body_code || "MPCA",
        category: "Equipment",
        description: "",
        location: "",
        purchase_date: new Date().toISOString().split("T")[0],
        cost_inr: "",
        salvage_value_inr: "0",
        useful_life_years: "",
        tag_no: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
            await createAsset({
                body_id: form.body_id,
                category: form.category,
                description: form.description,
                location: form.location || undefined,
                purchase_date: form.purchase_date,
                cost_inr: parseFloat(form.cost_inr),
                salvage_value_inr: parseFloat(form.salvage_value_inr) || 0,
                useful_life_years: form.useful_life_years ? parseInt(form.useful_life_years, 10) : undefined,
                tag_no: form.tag_no || undefined,
                created_by_name: persona ? `${persona.honorific} ${persona.name}` : "MPCA Accounts",
            });
            onCreated();
        } catch (e) {
            setErr(e.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg" onClick={(e) => e.stopPropagation()} data-testid="new-asset-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment flex justify-between items-center">
                    <div>
                        <div className="overline">New Asset</div>
                        <div className="font-serif text-lg text-mpca-green-dark mt-1">Register Fixed Asset</div>
                    </div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Category</label>
                            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-heritage" data-testid="input-category">
                                {CAT_OPTS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Body</label>
                            <input value={form.body_id} onChange={(e) => setForm({ ...form, body_id: e.target.value })} required className="input-heritage" data-testid="input-body" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Description</label>
                        <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-heritage" data-testid="input-desc" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Location</label>
                            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input-heritage" data-testid="input-location" />
                        </div>
                        <div>
                            <label className="label-heritage">Tag / QR No.</label>
                            <input value={form.tag_no} onChange={(e) => setForm({ ...form, tag_no: e.target.value })} className="input-heritage" data-testid="input-tag" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="label-heritage">Purchase Date</label>
                            <input type="date" required value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="input-heritage" data-testid="input-purchase-date" />
                        </div>
                        <div>
                            <label className="label-heritage">Cost (₹)</label>
                            <input type="number" min="1" required value={form.cost_inr} onChange={(e) => setForm({ ...form, cost_inr: e.target.value })} className="input-heritage" data-testid="input-cost" />
                        </div>
                        <div>
                            <label className="label-heritage">Life (years)</label>
                            <input type="number" min="0" value={form.useful_life_years} onChange={(e) => setForm({ ...form, useful_life_years: e.target.value })} className="input-heritage" placeholder="auto by category" data-testid="input-life" />
                            <div className="text-[10px] text-mpca-gray-dark mt-1">
                                Default for <b className="text-mpca-brass">{form.category?.replace(/_/g, " ")}</b>:{" "}
                                <span className="font-mono">
                                    {({ Land: 0, Building: 30, Vehicle: 8, Equipment: 10, Furniture: 10, Computer: 3, Networking: 5, Sports_Equipment: 5, Other: 5 })[form.category] ?? 5}
                                </span>{" "}
                                years
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Salvage Value (₹)</label>
                        <input type="number" min="0" value={form.salvage_value_inr} onChange={(e) => setForm({ ...form, salvage_value_inr: e.target.value })} className="input-heritage" data-testid="input-salvage" />
                    </div>
                    {err && <div className="text-mpca-oxblood text-sm" data-testid="new-asset-error">{err}</div>}
                    <div className="flex justify-end gap-3 pt-2 border-t border-mpca-brass/20">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="submit-new-asset">
                            {busy ? "Saving…" : "Register Asset"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const DisposeDialog = ({ asset, onClose, onSubmit, busy }) => {
    const [form, setForm] = useState({
        disposal_date: new Date().toISOString().split("T")[0],
        disposal_amount_inr: "0",
        disposal_reason: "",
    });
    const gain = (parseFloat(form.disposal_amount_inr) || 0) - (asset.book_value_inr || 0);
    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="dispose-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment">
                    <div className="overline">Dispose Asset</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">{asset.asset_no}</div>
                    <div className="text-[11px] text-mpca-charcoal mt-0.5">{asset.description}</div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div className="bg-mpca-parchment/40 border border-mpca-brass/30 px-3 py-2 text-[11px]">
                        Current book value: <b className="font-mono text-mpca-green-dark">{fmtINR(asset.book_value_inr)}</b>
                    </div>
                    <div>
                        <label className="label-heritage">Disposal Date</label>
                        <input type="date" value={form.disposal_date} onChange={(e) => setForm({ ...form, disposal_date: e.target.value })} className="input-heritage" data-testid="input-disposal-date" />
                    </div>
                    <div>
                        <label className="label-heritage">Disposal Amount (₹) — received</label>
                        <input type="number" min="0" value={form.disposal_amount_inr} onChange={(e) => setForm({ ...form, disposal_amount_inr: e.target.value })} className="input-heritage" data-testid="input-disposal-amount" />
                    </div>
                    <div className={`px-3 py-2 text-[11px] border ${gain >= 0 ? "border-mpca-green-deep/40 text-mpca-green-deep bg-mpca-green-deep/5" : "border-mpca-oxblood/40 text-mpca-oxblood bg-mpca-oxblood/5"}`} data-testid="gain-loss-preview">
                        {gain >= 0 ? "Projected Gain" : "Projected Loss"}: <b className="font-mono">{fmtINR(Math.abs(gain))}</b>
                    </div>
                    <div>
                        <label className="label-heritage">Reason (required)</label>
                        <textarea required value={form.disposal_reason} onChange={(e) => setForm({ ...form, disposal_reason: e.target.value })} rows={3} className="input-heritage" data-testid="input-disposal-reason" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button disabled={busy || !form.disposal_reason}
                                onClick={() => onSubmit({
                                    disposal_date: form.disposal_date,
                                    disposal_amount_inr: parseFloat(form.disposal_amount_inr) || 0,
                                    disposal_reason: form.disposal_reason,
                                })} className="btn-heritage-primary" data-testid="confirm-dispose">
                            {busy ? "Working…" : "Confirm Dispose"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AssetRegister;
