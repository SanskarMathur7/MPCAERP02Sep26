import { useEffect, useState } from "react";
import { Save, Loader2, Plus, Trash2, Users as UsersIcon, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { getTypeByCode } from "@/lib/tournamentCatalog";

const inputCls = "input-heritage !py-1.5 !text-xs";
const CAMP_TYPES = ["pre_camp", "coaching_camp", "vacation_camp"];

/**
 * Sprint M24 · Tournament Basics Panel
 * ────────────────────────────────────
 * Fills in the MPCA 7-step process gaps that weren't captured before:
 *   Step 2 — Category & Age Group
 *   Step 4 — Teams / Pools & Hosts        (tournament flavour)
 *            OR Player Group              (camp flavour)
 *   Step 5 — Grounds Assigned
 *
 * All data persists to `tournament.setup_meta` via PATCH
 * /api/tournaments/{tid}/setup-meta. Progress bar reads these fields and
 * lights up the corresponding sub-steps.
 */
const TournamentBasicsPanel = ({ tournament, canEdit, onChange }) => {
    const type = getTypeByCode(tournament.tournament_type_code);
    const isCamp = CAMP_TYPES.includes(tournament.tournament_type_code);
    const [meta, setMeta] = useState({
        category: "Senior",
        age_group: "Senior",
        teams: [],
        pools: [],
        grounds: [],
        player_group: "",
        player_count: 20,
        ...(tournament.setup_meta || {}),
    });
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [venues, setVenues] = useState([]);
    const [newTeam, setNewTeam] = useState({ name: "", pool: "A", is_host: false });
    const [newGround, setNewGround] = useState({ venue_name: "", ground_name: "" });

    useEffect(() => {
        api.get("/venues").then((r) => setVenues(r.data || [])).catch(() => setVenues([]));
    }, []);

    const setField = (k, v) => { setMeta((m) => ({ ...m, [k]: v })); setDirty(true); };
    const addTeam = () => {
        if (!newTeam.name) return;
        setField("teams", [...(meta.teams || []), { ...newTeam, id: Date.now() }]);
        setNewTeam({ name: "", pool: "A", is_host: false });
    };
    const removeTeam = (id) => setField("teams", (meta.teams || []).filter((t) => t.id !== id));
    const addGround = () => {
        if (!newGround.venue_name) return;
        setField("grounds", [...(meta.grounds || []), { ...newGround, id: Date.now() }]);
        setNewGround({ venue_name: "", ground_name: "" });
    };
    const removeGround = (id) => setField("grounds", (meta.grounds || []).filter((g) => g.id !== id));

    const save = async () => {
        setSaving(true);
        try {
            await api.patch(`/tournaments/${tournament.id}/setup-meta`, { setup_meta: meta });
            setDirty(false);
            onChange?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const pools = Array.from(new Set((meta.teams || []).map((t) => t.pool))).sort();

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-5" data-testid="panel-basics">
            <div>
                <div className="overline text-[9px]">MPCA Setup Process · Steps 2, 4 & 5</div>
                <div className="font-serif text-lg text-mpca-green-dark mt-1">Tournament Basics · {type?.name}</div>
                <div className="text-[11px] text-mpca-gray-dark mt-1">
                    Capture the category, {isCamp ? "player group, and camp venue" : "teams / pools & hosts, and the grounds"}.
                    These feed the auto-budget and light up the setup progress phase.
                </div>
            </div>

            {/* Step 2 · Category + Age Group */}
            <div className="grid md:grid-cols-2 gap-3" data-testid="basics-category-row">
                <label className="block">
                    <div className="overline text-[9px] mb-1">Category</div>
                    <select className={inputCls} value={meta.category} onChange={(e) => setField("category", e.target.value)} disabled={!canEdit} data-testid="basics-category">
                        <option>Senior Men</option>
                        <option>Senior Women</option>
                        <option>Boys</option>
                        <option>Girls</option>
                        <option>A-Grade Clubs</option>
                        <option>Schools</option>
                        <option>Senior</option>
                    </select>
                </label>
                <label className="block">
                    <div className="overline text-[9px] mb-1">Age Group</div>
                    <select className={inputCls} value={meta.age_group} onChange={(e) => setField("age_group", e.target.value)} disabled={!canEdit} data-testid="basics-age">
                        <option>Senior</option>
                        <option>U-25</option>
                        <option>U-23</option>
                        <option>U-22</option>
                        <option>U-19</option>
                        <option>U-18</option>
                        <option>U-16</option>
                        <option>U-15</option>
                        <option>U-14</option>
                    </select>
                </label>
            </div>

            {/* Step 4 · Teams / Pools OR Player Group */}
            {isCamp ? (
                <div className="border-t border-mpca-brass/20 pt-4" data-testid="basics-player-group">
                    <div className="overline text-[9px] mb-2 flex items-center gap-2"><UsersIcon size={11} /> Step 4 · Group of Players (Camp)</div>
                    <div className="grid md:grid-cols-2 gap-3">
                        <label className="block">
                            <div className="text-[10px] text-mpca-brass mb-1">Player group / description</div>
                            <input className={inputCls} value={meta.player_group || ""} onChange={(e) => setField("player_group", e.target.value)} disabled={!canEdit} placeholder="e.g. Divisional U-19 Squad shortlist" data-testid="basics-player-group-input" />
                        </label>
                        <label className="block">
                            <div className="text-[10px] text-mpca-brass mb-1">Approx player count</div>
                            <input type="number" className={inputCls} value={meta.player_count || 0} onChange={(e) => setField("player_count", Number(e.target.value))} disabled={!canEdit} data-testid="basics-player-count" />
                        </label>
                    </div>
                </div>
            ) : (
                <div className="border-t border-mpca-brass/20 pt-4" data-testid="basics-teams">
                    <div className="overline text-[9px] mb-2 flex items-center gap-2"><UsersIcon size={11} /> Step 4 · Teams · Pools · Hosts</div>
                    <div className="border border-mpca-brass/20 overflow-hidden mb-2">
                        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                            <div className="col-span-5">Team / Division / District / Club / School</div>
                            <div className="col-span-3">Pool</div>
                            <div className="col-span-3">Host?</div>
                            <div className="col-span-1"></div>
                        </div>
                        {(meta.teams || []).length === 0 ? (
                            <div className="px-3 py-3 text-[11px] text-mpca-gray-dark italic">No teams added yet.</div>
                        ) : (meta.teams || []).map((t) => (
                            <div key={t.id} className="grid grid-cols-12 gap-2 px-3 py-1.5 border-b border-mpca-brass/10 text-xs items-center" data-testid={`basics-team-row-${t.id}`}>
                                <div className="col-span-5 font-serif text-mpca-green-dark">{t.name}</div>
                                <div className="col-span-3 font-mono text-mpca-brass">Pool {t.pool}</div>
                                <div className="col-span-3">{t.is_host ? <span className="text-[9px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-1.5 py-0.5">Host</span> : <span className="text-[9px] text-mpca-gray-dark">Visitor</span>}</div>
                                <div className="col-span-1 text-right">
                                    {canEdit && <button onClick={() => removeTeam(t.id)} className="text-mpca-oxblood/70 hover:text-mpca-oxblood" data-testid={`basics-team-del-${t.id}`}><Trash2 size={11} /></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                    {canEdit && (
                        <div className="grid grid-cols-12 gap-2 items-end" data-testid="basics-team-add-form">
                            <input placeholder="Team name" className={`${inputCls} col-span-5`} value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} data-testid="basics-team-name" />
                            <select className={`${inputCls} col-span-3`} value={newTeam.pool} onChange={(e) => setNewTeam({ ...newTeam, pool: e.target.value })}>
                                {["A", "B", "C", "D", "E"].map((p) => <option key={p}>{p}</option>)}
                            </select>
                            <label className="col-span-3 flex items-center gap-2 text-xs text-mpca-charcoal">
                                <input type="checkbox" checked={newTeam.is_host} onChange={(e) => setNewTeam({ ...newTeam, is_host: e.target.checked })} data-testid="basics-team-host" />
                                Host pool
                            </label>
                            <button onClick={addTeam} className="col-span-1 text-[10px] uppercase bg-mpca-oxblood text-mpca-ivory px-2 py-1.5" data-testid="basics-team-add-btn"><Plus size={11} /></button>
                        </div>
                    )}
                    {pools.length > 0 && (
                        <div className="text-[10px] font-mono text-mpca-brass mt-2">{(meta.teams || []).length} teams · {pools.length} pool(s) · {(meta.teams || []).filter((t) => t.is_host).length} host(s)</div>
                    )}
                </div>
            )}

            {/* Step 5 · Grounds Listed */}
            <div className="border-t border-mpca-brass/20 pt-4" data-testid="basics-grounds">
                <div className="overline text-[9px] mb-2 flex items-center gap-2"><MapPin size={11} /> Step 5 · Grounds {isCamp ? "(Camp Venue)" : "Assigned"}</div>
                <div className="border border-mpca-brass/20 overflow-hidden mb-2">
                    <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                        <div className="col-span-7">Venue</div>
                        <div className="col-span-4">Ground</div>
                        <div className="col-span-1"></div>
                    </div>
                    {(meta.grounds || []).length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-mpca-gray-dark italic">No grounds listed yet.</div>
                    ) : (meta.grounds || []).map((g) => (
                        <div key={g.id} className="grid grid-cols-12 gap-2 px-3 py-1.5 border-b border-mpca-brass/10 text-xs items-center" data-testid={`basics-ground-row-${g.id}`}>
                            <div className="col-span-7 font-serif text-mpca-green-dark">{g.venue_name}</div>
                            <div className="col-span-4 text-mpca-gray-dark">{g.ground_name || "—"}</div>
                            <div className="col-span-1 text-right">
                                {canEdit && <button onClick={() => removeGround(g.id)} className="text-mpca-oxblood/70 hover:text-mpca-oxblood" data-testid={`basics-ground-del-${g.id}`}><Trash2 size={11} /></button>}
                            </div>
                        </div>
                    ))}
                </div>
                {canEdit && (
                    <div className="grid grid-cols-12 gap-2 items-end" data-testid="basics-ground-add-form">
                        <input list="basics-venues-list" placeholder="Venue name (pick or type)" className={`${inputCls} col-span-7`} value={newGround.venue_name} onChange={(e) => setNewGround({ ...newGround, venue_name: e.target.value })} data-testid="basics-ground-venue" />
                        <datalist id="basics-venues-list">
                            {venues.slice(0, 200).map((v) => <option key={v.id} value={v.name}>{v.city} · {v.category}</option>)}
                        </datalist>
                        <input placeholder="Ground (optional)" className={`${inputCls} col-span-4`} value={newGround.ground_name} onChange={(e) => setNewGround({ ...newGround, ground_name: e.target.value })} />
                        <button onClick={addGround} className="col-span-1 text-[10px] uppercase bg-mpca-oxblood text-mpca-ivory px-2 py-1.5" data-testid="basics-ground-add-btn"><Plus size={11} /></button>
                    </div>
                )}
            </div>

            {canEdit && (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-mpca-brass/20">
                    {dirty && <span className="text-[10px] text-mpca-oxblood uppercase tracking-widest">Unsaved changes</span>}
                    <button onClick={save} disabled={!dirty || saving} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="basics-save-btn">
                        {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Basics
                    </button>
                </div>
            )}
        </div>
    );
};

export default TournamentBasicsPanel;
