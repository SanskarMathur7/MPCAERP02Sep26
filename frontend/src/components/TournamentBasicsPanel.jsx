import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, Plus, Trash2, Users as UsersIcon, MapPin, Home, Plane } from "lucide-react";
import { api } from "@/lib/api";
import { getTypeByCode } from "@/lib/tournamentCatalog";

const inputCls = "input-heritage !py-1.5 !text-xs";
const CAMP_TYPES = ["pre_camp", "coaching_camp", "vacation_camp"];
const POOL_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Sprint M24/M25 · Tournament Basics Panel
 * ────────────────────────────────────────
 * MPCA 7-step process:
 *   Step 2 — Category & Age Group
 *   Step 4 — Division Pools & Host  (Inter-divisional tournaments)
 *            + Extra teams (clubs, schools, districts) as free-text
 *            OR Player Group        (camp flavour)
 *   Step 5 — Grounds Assigned
 *
 * Division Pools data-shape stored under `setup_meta.division_pools`:
 *   [{ id, name: "Pool A", division_codes: ["DIV-BHO", …], host_division_code: "DIV-BHO" }]
 * A host is REQUIRED for every pool. Divisions cannot appear in two pools.
 *
 * All data persists to `tournament.setup_meta` via PATCH /api/tournaments/{tid}/setup-meta.
 */
const TournamentBasicsPanel = ({ tournament, canEdit, onChange }) => {
    const type = getTypeByCode(tournament.tournament_type_code);
    const isCamp = CAMP_TYPES.includes(tournament.tournament_type_code);
    const [meta, setMeta] = useState({
        category: "Senior",
        age_group: "Senior",
        teams: [],
        division_pools: [],
        grounds: [],
        player_group: "",
        player_count: 20,
        ...(tournament.setup_meta || {}),
    });
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [venues, setVenues] = useState([]);
    const [divisions, setDivisions] = useState([]);
    const [newTeam, setNewTeam] = useState({ name: "", pool: "A" });
    const [newGround, setNewGround] = useState({ venue_name: "", ground_name: "" });

    useEffect(() => {
        api.get("/venues").then((r) => setVenues(r.data || [])).catch(() => setVenues([]));
        api.get("/bodies", { params: { body_type: "Division" } })
            .then((r) => setDivisions(r.data || []))
            .catch(() => setDivisions([]));
    }, []);

    const setField = (k, v) => { setMeta((m) => ({ ...m, [k]: v })); setDirty(true); };

    // ─── Division Pools helpers ────────────────────────────
    const dpools = meta.division_pools || [];
    const usedDivisionCodes = useMemo(
        () => new Set(dpools.flatMap((p) => p.division_codes || [])),
        [dpools]
    );
    const divisionByCode = useMemo(() => {
        const m = {};
        divisions.forEach((d) => { m[d.code] = d; });
        return m;
    }, [divisions]);

    const addPool = () => {
        const nextLetter = POOL_LABELS[dpools.length] || `${dpools.length + 1}`;
        const newPool = { id: uid(), name: `Pool ${nextLetter}`, division_codes: [], host_division_code: null };
        setField("division_pools", [...dpools, newPool]);
    };
    const removePool = (pid) => setField("division_pools", dpools.filter((p) => p.id !== pid));
    const patchPool = (pid, patch) => {
        setField(
            "division_pools",
            dpools.map((p) => (p.id === pid ? { ...p, ...patch } : p))
        );
    };
    const toggleDivisionInPool = (pid, code) => {
        const pool = dpools.find((p) => p.id === pid);
        if (!pool) return;
        const included = (pool.division_codes || []).includes(code);
        // Prevent putting a division into more than one pool
        if (!included && usedDivisionCodes.has(code)) return;
        const next_codes = included
            ? pool.division_codes.filter((c) => c !== code)
            : [...(pool.division_codes || []), code];
        const next_host = pool.host_division_code && next_codes.includes(pool.host_division_code)
            ? pool.host_division_code
            : (next_codes[0] || null);
        patchPool(pid, { division_codes: next_codes, host_division_code: next_host });
    };
    const setPoolHost = (pid, code) => patchPool(pid, { host_division_code: code });
    const renamePool = (pid, name) => patchPool(pid, { name });

    // ─── Free-text extra teams (clubs/schools/districts) ────
    const addTeam = () => {
        if (!newTeam.name.trim()) return;
        setField("teams", [...(meta.teams || []), { ...newTeam, id: Date.now() }]);
        setNewTeam({ name: "", pool: "A" });
    };
    const removeTeam = (id) => setField("teams", (meta.teams || []).filter((t) => t.id !== id));

    // ─── Grounds ──────────────────────────────────────
    const addGround = () => {
        if (!newGround.venue_name) return;
        setField("grounds", [...(meta.grounds || []), { ...newGround, id: Date.now() }]);
        setNewGround({ venue_name: "", ground_name: "" });
    };
    const removeGround = (id) => setField("grounds", (meta.grounds || []).filter((g) => g.id !== id));

    // ─── Save with validation ───────────────────────────
    const validate = () => {
        for (const p of dpools) {
            if ((p.division_codes || []).length === 0) {
                return `${p.name} has no divisions — add at least one or remove the pool.`;
            }
            if (!p.host_division_code) {
                return `${p.name} needs a host division marked.`;
            }
            if (!p.division_codes.includes(p.host_division_code)) {
                return `${p.name}'s host must be one of its divisions.`;
            }
        }
        return "";
    };

    const save = async () => {
        const err = validate();
        if (err) { setSaveError(err); return; }
        setSaveError("");
        setSaving(true);
        try {
            await api.patch(`/tournaments/${tournament.id}/setup-meta`, { setup_meta: meta });
            setDirty(false);
            onChange?.();
        } catch (e) { setSaveError(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const teamPools = Array.from(new Set((meta.teams || []).map((t) => t.pool))).sort();
    const totalDivisions = dpools.reduce((n, p) => n + (p.division_codes || []).length, 0);
    const totalHosts = dpools.filter((p) => p.host_division_code).length;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-5" data-testid="panel-basics">
            <div>
                <div className="overline text-[9px]">MPCA Setup Process · Steps 2, 4 & 5</div>
                <div className="font-serif text-lg text-mpca-green-dark mt-1">Tournament Basics · {type?.name}</div>
                <div className="text-[11px] text-mpca-gray-dark mt-1">
                    Capture the category, {isCamp ? "player group, and camp venue" : "division pools with a host, extra teams, and grounds"}.
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

            {/* Step 4 · Division Pools + Host  OR  Camp Player Group */}
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
                <>
                {/* Step 4a · Division Pools & Host */}
                <div className="border-t border-mpca-brass/20 pt-4" data-testid="basics-division-pools">
                    <div className="flex items-center justify-between mb-2">
                        <div className="overline text-[9px] flex items-center gap-2"><UsersIcon size={11} /> Step 4 · Division Pools & Host</div>
                        {canEdit && (
                            <button
                                onClick={addPool}
                                disabled={dpools.length >= POOL_LABELS.length}
                                className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-1 flex items-center gap-1 disabled:opacity-40"
                                data-testid="basics-add-pool-btn"
                            >
                                <Plus size={11} /> Add Pool
                            </button>
                        )}
                    </div>
                    <div className="text-[10px] text-mpca-gray-dark italic mb-3">
                        Add one or more pools. Tick the divisions travelling in each pool and mark the host division (where matches are played).
                        A division can appear in only one pool.
                    </div>

                    {dpools.length === 0 && (
                        <div className="border border-dashed border-mpca-brass/40 px-4 py-6 text-center text-[11px] text-mpca-gray-dark" data-testid="basics-pools-empty">
                            No division pools added yet. {canEdit && <span>Click <b>Add Pool</b> to start.</span>}
                        </div>
                    )}

                    <div className="space-y-3">
                        {dpools.map((pool) => (
                            <div key={pool.id} className="border border-mpca-brass/30 bg-white" data-testid={`basics-pool-${pool.id}`}>
                                <div className="flex items-center justify-between px-3 py-2 bg-mpca-green-dark text-mpca-gold-light">
                                    <div className="flex items-center gap-2">
                                        {canEdit ? (
                                            <input
                                                value={pool.name}
                                                onChange={(e) => renamePool(pool.id, e.target.value)}
                                                className="bg-transparent border-b border-mpca-gold-light/40 text-mpca-gold-light font-serif text-sm focus:outline-none"
                                                data-testid={`basics-pool-name-${pool.id}`}
                                            />
                                        ) : (
                                            <div className="font-serif text-sm">{pool.name}</div>
                                        )}
                                        <span className="text-[9px] uppercase tracking-widest opacity-80">
                                            · {(pool.division_codes || []).length} divs
                                            {pool.host_division_code ? ` · host: ${divisionByCode[pool.host_division_code]?.name || pool.host_division_code}` : " · no host set"}
                                        </span>
                                    </div>
                                    {canEdit && (
                                        <button onClick={() => removePool(pool.id)} className="text-mpca-ivory/80 hover:text-mpca-ivory" data-testid={`basics-pool-del-${pool.id}`}>
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="px-3 py-2">
                                    {divisions.length === 0 ? (
                                        <div className="text-[10px] italic text-mpca-gray-dark py-2">Loading divisions…</div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                                            {divisions.map((d) => {
                                                const inThisPool = (pool.division_codes || []).includes(d.code);
                                                const inOtherPool = !inThisPool && usedDivisionCodes.has(d.code);
                                                const isHost = pool.host_division_code === d.code;
                                                return (
                                                    <div
                                                        key={d.code}
                                                        className={`flex items-center gap-2 py-1 px-1 text-xs ${inOtherPool ? "opacity-40" : ""}`}
                                                        data-testid={`basics-pool-${pool.id}-div-${d.code}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={inThisPool}
                                                            disabled={!canEdit || inOtherPool}
                                                            onChange={() => toggleDivisionInPool(pool.id, d.code)}
                                                            data-testid={`basics-pool-${pool.id}-div-${d.code}-check`}
                                                        />
                                                        <span className="flex-1 truncate text-mpca-charcoal">
                                                            {d.name} <span className="text-[9px] text-mpca-brass">({d.code})</span>
                                                            {inOtherPool && <span className="ml-1 text-[9px] text-mpca-oxblood">in other pool</span>}
                                                        </span>
                                                        {inThisPool && (
                                                            <label className="flex items-center gap-1 text-[10px] text-mpca-oxblood cursor-pointer" title="Mark as Host">
                                                                <input
                                                                    type="radio"
                                                                    name={`host-${pool.id}`}
                                                                    checked={isHost}
                                                                    disabled={!canEdit}
                                                                    onChange={() => setPoolHost(pool.id, d.code)}
                                                                    data-testid={`basics-pool-${pool.id}-host-${d.code}`}
                                                                />
                                                                {isHost ? <Home size={11} /> : <Plane size={11} className="opacity-60" />}
                                                                <span className="uppercase tracking-widest">{isHost ? "Host" : "Host?"}</span>
                                                            </label>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {dpools.length > 0 && (
                        <div className="text-[10px] font-mono text-mpca-brass mt-2" data-testid="basics-pools-summary">
                            {dpools.length} pool(s) · {totalDivisions} division(s) · {totalHosts} host(s) assigned
                        </div>
                    )}
                </div>

                {/* Step 4b · Extra teams (clubs / schools / districts) */}
                <div className="border-t border-mpca-brass/20 pt-4" data-testid="basics-teams">
                    <div className="overline text-[9px] mb-2 flex items-center gap-2"><UsersIcon size={11} /> Step 4b · Extra Teams (Clubs / Schools / Districts)</div>
                    <div className="text-[10px] text-mpca-gray-dark italic mb-2">
                        Optional — use when the tournament involves non-division entrants (e.g. A-grade clubs, school teams, districts). Add each team by name.
                    </div>
                    <div className="border border-mpca-brass/20 overflow-hidden mb-2">
                        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                            <div className="col-span-8">Team name</div>
                            <div className="col-span-3">Pool</div>
                            <div className="col-span-1"></div>
                        </div>
                        {(meta.teams || []).length === 0 ? (
                            <div className="px-3 py-3 text-[11px] text-mpca-gray-dark italic">No extra teams added.</div>
                        ) : (meta.teams || []).map((t) => (
                            <div key={t.id} className="grid grid-cols-12 gap-2 px-3 py-1.5 border-b border-mpca-brass/10 text-xs items-center" data-testid={`basics-team-row-${t.id}`}>
                                <div className="col-span-8 font-serif text-mpca-green-dark">{t.name}</div>
                                <div className="col-span-3 font-mono text-mpca-brass">Pool {t.pool}</div>
                                <div className="col-span-1 text-right">
                                    {canEdit && <button onClick={() => removeTeam(t.id)} className="text-mpca-oxblood/70 hover:text-mpca-oxblood" data-testid={`basics-team-del-${t.id}`}><Trash2 size={11} /></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                    {canEdit && (
                        <div className="grid grid-cols-12 gap-2 items-end" data-testid="basics-team-add-form">
                            <input placeholder="Team name" className={`${inputCls} col-span-8`} value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} data-testid="basics-team-name" />
                            <select className={`${inputCls} col-span-3`} value={newTeam.pool} onChange={(e) => setNewTeam({ ...newTeam, pool: e.target.value })} data-testid="basics-team-pool">
                                {POOL_LABELS.map((p) => <option key={p}>{p}</option>)}
                            </select>
                            <button onClick={addTeam} className="col-span-1 text-[10px] uppercase bg-mpca-oxblood text-mpca-ivory px-2 py-1.5" data-testid="basics-team-add-btn"><Plus size={11} /></button>
                        </div>
                    )}
                    {teamPools.length > 0 && (
                        <div className="text-[10px] font-mono text-mpca-brass mt-2">{(meta.teams || []).length} extra team(s) · {teamPools.length} pool(s)</div>
                    )}
                </div>
                </>
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
                    {saveError && <span className="text-[10px] text-mpca-oxblood uppercase tracking-widest" data-testid="basics-save-error">{saveError}</span>}
                    {dirty && !saveError && <span className="text-[10px] text-mpca-oxblood uppercase tracking-widest">Unsaved changes</span>}
                    <button onClick={save} disabled={!dirty || saving} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="basics-save-btn">
                        {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Basics
                    </button>
                </div>
            )}
        </div>
    );
};

export default TournamentBasicsPanel;
