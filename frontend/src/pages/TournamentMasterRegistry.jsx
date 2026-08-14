// MPCA-205 · Master Tournament Registry
// Canonical list of tournament names bucketed by category. Feeds the
// create-tournament wizard's name dropdown. Pre-Tournament Camps are a
// read-only mirror of the Inter-Divisional entries.
import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Loader2, X, BookOpen, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const CATEGORIES = [
    { code: "BCCI", label: "BCCI", subtitle: "Ranji · Vijay Hazare · SMAT · Duleep etc." },
    { code: "Inter_Divisional", label: "Inter-Divisional", subtitle: "MPCA-hosted trophies across Divisions" },
    { code: "Pre_Tournament_Camp", label: "Pre-Tournament Camp", subtitle: "Auto-mirrors Inter-Divisional entries", readOnly: true },
    { code: "Inter_District", label: "Inter-District", subtitle: "Division-hosted trophies across Districts" },
];

const emptyForm = () => ({
    name: "", short_name: "", description: "",
    gender: "", age_grp: "", play_type: "",
    born_on_or_before: "", born_on_or_after: "",
    default_format: "", default_scope: "", sort_order: 100,
});

const PLAY_TYPE_LABEL = { Multi_Day: "Multi Day", Limited_Overs: "Ltd Overs" };

export default function TournamentMasterRegistry() {
    const { persona } = useAuth();
    const canEdit = persona?.body_type === "State" || persona?.body_code === "MPCA";
    const [buckets, setBuckets] = useState({ BCCI: [], Inter_Divisional: [], Pre_Tournament_Camp: [], Inter_District: [] });
    const [tab, setTab] = useState("BCCI");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [editingId, setEditingId] = useState(null);
    const [editingForm, setEditingForm] = useState(emptyForm());
    const [showInactive, setShowInactive] = useState(false);

    const activeCategory = useMemo(() => CATEGORIES.find((c) => c.code === tab), [tab]);
    const isReadOnly = activeCategory?.readOnly || !canEdit;

    const load = async () => {
        setLoading(true); setError(null);
        try {
            const { data } = await api.get("/tournament-master/grouped", { params: { include_inactive: showInactive } });
            setBuckets({ BCCI: [], Inter_Divisional: [], Pre_Tournament_Camp: [], Inter_District: [], ...data });
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [showInactive]);

    const save = async () => {
        if (!form.name.trim()) { setError("Name is required."); return; }
        setBusy(true); setError(null);
        try {
            const payload = {
                category: tab, name: form.name.trim(),
                short_name: form.short_name.trim() || null,
                description: form.description.trim() || null,
                gender: form.gender || null,
                age_grp: form.age_grp.trim() || null,
                play_type: form.play_type || null,
                born_on_or_before: form.born_on_or_before || null,
                born_on_or_after: form.born_on_or_after || null,
                default_format: form.default_format || null,
                default_scope: form.default_scope || null,
                sort_order: parseInt(form.sort_order) || 100,
            };
            await api.post("/tournament-master", payload);
            setAdding(false); setForm(emptyForm());
            await load();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const beginEdit = (row) => {
        setEditingId(row.id);
        setEditingForm({
            name: row.name || "", short_name: row.short_name || "",
            description: row.description || "",
            gender: row.gender || "",
            age_grp: row.age_grp || "",
            play_type: row.play_type || "",
            born_on_or_before: row.born_on_or_before || "",
            born_on_or_after: row.born_on_or_after || "",
            default_format: row.default_format || "",
            default_scope: row.default_scope || "",
            sort_order: row.sort_order ?? 100,
        });
    };

    const saveEdit = async () => {
        setBusy(true); setError(null);
        try {
            const payload = {
                name: editingForm.name.trim(),
                short_name: editingForm.short_name.trim() || null,
                description: editingForm.description.trim() || null,
                gender: editingForm.gender || null,
                age_grp: editingForm.age_grp.trim() || null,
                play_type: editingForm.play_type || null,
                born_on_or_before: editingForm.born_on_or_before || null,
                born_on_or_after: editingForm.born_on_or_after || null,
                default_format: editingForm.default_format || null,
                default_scope: editingForm.default_scope || null,
                sort_order: parseInt(editingForm.sort_order) || 100,
            };
            await api.patch(`/tournament-master/${editingId}`, payload);
            setEditingId(null);
            await load();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const softDelete = async (id) => {
        if (!window.confirm("Deactivate this master entry? Historical tournaments referencing it will keep working.")) return;
        setBusy(true);
        try {
            await api.delete(`/tournament-master/${id}`);
            await load();
        } catch (e) { setError(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const rows = buckets[tab] || [];

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="tournament-master-registry">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
                <div>
                    <div className="overline text-mpca-oxblood flex items-center gap-2"><BookOpen size={12} /> Master Data</div>
                    <h1 className="font-serif text-4xl text-mpca-green-dark mt-2">Tournament Registry</h1>
                    <p className="text-sm text-mpca-gray-dark mt-2 max-w-2xl">
                        Canonical list of tournament names for every category. When Divisions or MPCA create a new tournament, the name is picked from here — keeping the data clean and reportable across seasons.
                    </p>
                </div>
                <label className="text-[10px] uppercase tracking-widest text-mpca-brass flex items-center gap-2">
                    <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} data-testid="show-inactive-toggle" />
                    Show inactive
                </label>
            </div>

            <div className="flex flex-wrap gap-2 mb-6" data-testid="registry-tabs">
                {CATEGORIES.map((c) => {
                    const n = (buckets[c.code] || []).length;
                    const isActive = tab === c.code;
                    return (
                        <button
                            key={c.code}
                            onClick={() => { setTab(c.code); setAdding(false); setEditingId(null); }}
                            className={`px-4 py-2 border-2 text-left ${isActive ? "bg-mpca-green-dark text-mpca-gold-light border-mpca-green-dark" : "bg-mpca-parchment/40 text-mpca-green-dark border-mpca-brass/30 hover:border-mpca-brass"}`}
                            data-testid={`registry-tab-${c.code}`}
                        >
                            <div className="text-xs uppercase tracking-widest font-mono flex items-center gap-2">
                                {c.label} · <span className="opacity-70">{n}</span>
                            </div>
                            <div className={`text-[10px] mt-1 ${isActive ? "text-mpca-gold-light/70" : "text-mpca-brass"}`}>{c.subtitle}</div>
                        </button>
                    );
                })}
            </div>

            {error && (
                <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-xs mb-4" data-testid="registry-err">{error}</div>
            )}

            <div className="bulletin-card p-0 overflow-hidden">
                <div className="bg-mpca-navy text-mpca-gold-light px-4 py-3 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-widest">{activeCategory?.label} · {rows.length} entries</div>
                    {!isReadOnly && (
                        <button
                            onClick={() => { setAdding((s) => !s); setForm(emptyForm()); }}
                            className="text-[10px] uppercase tracking-widest bg-mpca-gold-light text-mpca-green-dark px-3 py-1.5 flex items-center gap-1"
                            data-testid="registry-add-btn"
                        >
                            {adding ? <><X size={12}/> Cancel</> : <><Plus size={12}/> Add Entry</>}
                        </button>
                    )}
                    {isReadOnly && activeCategory?.code === "Pre_Tournament_Camp" && (
                        <span className="text-[10px] italic opacity-80">Auto-syncs from Inter-Divisional</span>
                    )}
                    {isReadOnly && activeCategory?.code !== "Pre_Tournament_Camp" && (
                        <span className="text-[10px] italic opacity-80">Read-only · State-scope required to edit</span>
                    )}
                </div>

                {adding && !isReadOnly && (
                    <div className="bg-mpca-parchment/60 border-b-2 border-mpca-brass/30 p-4 grid md:grid-cols-6 gap-3 items-end" data-testid="registry-add-form">
                        <label className="md:col-span-3">
                            <div className="overline text-[9px] mb-1">Name *</div>
                            <input className="input-heritage" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MY Memorial Trophy" data-testid="registry-name-input" />
                        </label>
                        <label className="md:col-span-2">
                            <div className="overline text-[9px] mb-1">Short Name</div>
                            <input className="input-heritage" value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} placeholder="MY Memorial" />
                        </label>
                        <label>
                            <div className="overline text-[9px] mb-1">Sort</div>
                            <input type="number" className="input-heritage" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                        </label>
                        <label>
                            <div className="overline text-[9px] mb-1">Category</div>
                            <select className="input-heritage" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} data-testid="registry-gender-input">
                                <option value="">—</option>
                                <option value="Men">MEN</option>
                                <option value="Women">WOMEN</option>
                            </select>
                        </label>
                        <label>
                            <div className="overline text-[9px] mb-1">Age Group</div>
                            <select className="input-heritage" value={form.age_grp} onChange={(e) => setForm({ ...form, age_grp: e.target.value })} data-testid="registry-agegrp-input">
                                <option value="">—</option>
                                {["Senior", "U25", "U23", "U22", "U19", "U18", "U16", "U15", "U14", "U11"].map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </label>
                        <label>
                            <div className="overline text-[9px] mb-1">Type</div>
                            <select className="input-heritage" value={form.play_type} onChange={(e) => setForm({ ...form, play_type: e.target.value })} data-testid="registry-playtype-input">
                                <option value="">—</option>
                                <option value="Multi_Day">MULTI DAY</option>
                                <option value="Limited_Overs">LTD OVERS</option>
                            </select>
                        </label>
                        <label>
                            <div className="overline text-[9px] mb-1">Born on or Before</div>
                            <input type="date" className="input-heritage" value={form.born_on_or_before || ""} onChange={(e) => setForm({ ...form, born_on_or_before: e.target.value })} data-testid="registry-boob-input" />
                        </label>
                        <label>
                            <div className="overline text-[9px] mb-1">Born on or After</div>
                            <input type="date" className="input-heritage" value={form.born_on_or_after || ""} onChange={(e) => setForm({ ...form, born_on_or_after: e.target.value })} data-testid="registry-boa-input" />
                        </label>
                        <label className="md:col-span-6">
                            <div className="overline text-[9px] mb-1">Description</div>
                            <input className="input-heritage" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional context shown in tooltips" />
                        </label>
                        <div className="md:col-span-6 flex justify-end gap-3">
                            <button onClick={() => { setAdding(false); setForm(emptyForm()); }} className="btn-heritage-ghost">Cancel</button>
                            <button onClick={save} disabled={busy || !form.name.trim()} className="btn-heritage-primary disabled:opacity-40" data-testid="registry-save-btn">
                                {busy ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save Entry
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-mpca-brass text-xs">Loading…</div>
                ) : rows.length === 0 ? (
                    <div className="p-8 text-center text-mpca-brass text-xs italic" data-testid="registry-empty">
                        No entries yet in this category. {isReadOnly ? "" : "Click ‘Add Entry’ above to create one."}
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Sort", "Name", "Category", "Age Group", "Type", "Born on/before", "Born on/after", "Status", "Actions"].map((h) => (
                                    <th key={h} className="text-left px-3 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const isEditing = editingId === r.id;
                                return (
                                    <tr key={r.id + (isReadOnly ? "-ro" : "")} className={`border-b border-mpca-brass/20 ${!r.is_active ? "opacity-50" : ""}`} data-testid={`registry-row-${r.name.replace(/\s+/g, "-").toLowerCase()}`}>
                                        <td className="px-3 py-2 font-mono text-[10px] text-mpca-brass">{r.sort_order}</td>
                                        <td className="px-3 py-2 font-serif text-mpca-green-dark">
                                            {isEditing
                                                ? <input className="input-heritage !py-1 !text-xs" value={editingForm.name} onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })} />
                                                : (<>
                                                    <div>{r.name}</div>
                                                    {r.short_name && <div className="text-[9px] uppercase text-mpca-brass mt-0.5">{r.short_name}</div>}
                                                </>)}
                                        </td>
                                        <td className="px-3 py-2 text-[10px]">
                                            {isEditing ? (
                                                <select className="input-heritage !py-1 !text-xs" value={editingForm.gender || ""} onChange={(e) => setEditingForm({ ...editingForm, gender: e.target.value })}>
                                                    <option value="">—</option>
                                                    <option value="Men">MEN</option>
                                                    <option value="Women">WOMEN</option>
                                                </select>
                                            ) : (
                                                <span className={`uppercase tracking-widest ${r.gender === "Women" ? "text-mpca-oxblood" : "text-mpca-navy"}`}>{r.gender || "—"}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-[10px] font-mono uppercase">
                                            {isEditing ? (
                                                <input className="input-heritage !py-1 !text-xs" value={editingForm.age_grp || ""} onChange={(e) => setEditingForm({ ...editingForm, age_grp: e.target.value })} placeholder="Senior · U22 · U18" />
                                            ) : (
                                                <span className="text-mpca-green-dark">{r.age_grp || "—"}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-[10px] uppercase tracking-widest">
                                            {isEditing ? (
                                                <select className="input-heritage !py-1 !text-xs" value={editingForm.play_type || ""} onChange={(e) => setEditingForm({ ...editingForm, play_type: e.target.value })}>
                                                    <option value="">—</option>
                                                    <option value="Multi_Day">MULTI DAY</option>
                                                    <option value="Limited_Overs">LTD OVERS</option>
                                                </select>
                                            ) : (
                                                <span className="text-mpca-brass">{PLAY_TYPE_LABEL[r.play_type] || (r.play_type || "—")}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-[10px] font-mono text-mpca-navy">
                                            {isEditing
                                                ? <input type="date" className="input-heritage !py-1 !text-xs" value={editingForm.born_on_or_before || ""} onChange={(e) => setEditingForm({ ...editingForm, born_on_or_before: e.target.value })} />
                                                : (r.born_on_or_before || "—")}
                                        </td>
                                        <td className="px-3 py-2 text-[10px] font-mono text-mpca-navy">
                                            {isEditing
                                                ? <input type="date" className="input-heritage !py-1 !text-xs" value={editingForm.born_on_or_after || ""} onChange={(e) => setEditingForm({ ...editingForm, born_on_or_after: e.target.value })} />
                                                : (r.born_on_or_after || "—")}
                                        </td>
                                        <td className="px-3 py-2 text-[10px]">
                                            {r.is_active
                                                ? <span className="uppercase tracking-widest text-mpca-green-dark">Active</span>
                                                : <span className="uppercase tracking-widest text-mpca-brass">Inactive</span>}
                                        </td>
                                        <td className="px-3 py-2 text-[10px]">
                                            {isReadOnly ? (
                                                <span className="italic text-mpca-brass">—</span>
                                            ) : isEditing ? (
                                                <div className="flex gap-2">
                                                    <button onClick={saveEdit} disabled={busy} className="text-mpca-green-dark underline uppercase tracking-widest" data-testid={`registry-save-edit-${r.id}`}>Save</button>
                                                    <button onClick={() => setEditingId(null)} className="text-mpca-gray-dark underline uppercase tracking-widest">Cancel</button>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button onClick={() => beginEdit(r)} className="text-mpca-navy underline uppercase tracking-widest" data-testid={`registry-edit-${r.id}`}>Edit</button>
                                                    {r.is_active && (
                                                        <button onClick={() => softDelete(r.id)} className="text-mpca-oxblood underline uppercase tracking-widest" data-testid={`registry-delete-${r.id}`}>
                                                            <Trash2 size={11} className="inline" /> Deactivate
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
