import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, Plus, Trash2, Users as UsersIcon, MapPin, Home, Plane, BookMarked, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { getTypeByCode } from "@/lib/tournamentCatalog";
import TournamentSchemeBadge from "@/components/TournamentSchemeBadge";

// MPCA-213 · Derive Category + Age Group from a Master Tournament Registry row
// so Tournament Basics stays locked to the single source of truth.
const REGISTRY_AGE_TO_LABEL = { Senior: "Senior", U25: "U-25", U23: "U-23", U22: "U-22", U19: "U-19", U18: "U-18", U16: "U-16", U15: "U-15", U14: "U-14" };
const deriveCategoryFromMaster = (m) => {
    if (!m) return null;
    const isWomen = m.gender === "Women";
    const isSenior = (m.age_grp || "Senior") === "Senior";
    if (isSenior) return isWomen ? "Senior Women" : "Senior Men";
    return isWomen ? "Girls" : "Boys";
};
const deriveAgeGroupFromMaster = (m) => {
    if (!m) return null;
    return REGISTRY_AGE_TO_LABEL[m.age_grp || "Senior"] || m.age_grp || "Senior";
};

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
    // Phase C · derive body-mode from tournament scope
    const isDistrictScope = tournament.scope === "Inter_District";
    // M39z.i · Club / School tournaments — the entrants are free-text teams
    // (no body records exist for individual clubs/schools). Show the extra-
    // teams panel as the PRIMARY entrant list and hide the confusing
    // District-pools step.
    const isClubish = ["inter_club", "inter_school"].includes(tournament.tournament_type_code);
    const poolKey = isDistrictScope ? "district_pools" : "division_pools";
    const bodyLabel = isDistrictScope ? "District" : "Division";
    const bodyLabelPlural = isDistrictScope ? "Districts" : "Divisions";
    const teamLabelSingular = isClubish
        ? (tournament.tournament_type_code === "inter_school" ? "School team" : "Club")
        : "Team";

    const [meta, setMeta] = useState({
        category: "Senior",
        age_group: "Senior",
        teams: [],
        division_pools: [],
        district_pools: [],
        grounds: [],
        player_group: "",
        player_count: 20,
        ...(tournament.setup_meta || {}),
    });
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [availableGrounds, setAvailableGrounds] = useState([]);
    const [bodies, setBodies] = useState([]);   // divisions OR districts depending on scope
    const [newTeam, setNewTeam] = useState({ name: "", pool: "A" });
    const [newGround, setNewGround] = useState({ ground_id: "" });
    // MPCA-213 · Registry match — locks Category, Age Group, and Medical to
    // the Master Tournament Registry entry that gave birth to this tournament.
    const [registryMatch, setRegistryMatch] = useState(null);
    // MPCA-105 / MPCA-108 · Direct tournament field edits (max_squad_size,
    // medical_required) — separate from setup_meta because they live on the
    // Tournament model itself.
    const [tournamentPatch, setTournamentPatch] = useState({});
    const setTournamentField = (k, v) => {
        setTournamentPatch((p) => ({ ...p, [k]: v }));
        setDirty(true);
    };

    useEffect(() => {
        // M39z.ii · Inter-District pool step must list every District under
        // the tournament's parent Division. `host_body_id` may itself be a
        // Division (organiser) OR a specific hosting District (venue owner),
        // so we resolve the parent Division first before fetching siblings.
        if (!isDistrictScope) {
            api.get("/bodies", { params: { body_type: "Division" } })
                .then((r) => setBodies(r.data || []))
                .catch(() => setBodies([]));
            return;
        }
        const host = tournament.host_body_id;
        if (!host) { setBodies([]); return; }
        const fetchDistricts = async () => {
            let divisionCode = host;
            if (String(host).startsWith("DIST-")) {
                try {
                    const hostBody = await api.get(`/bodies/${host}`);
                    divisionCode = hostBody.data?.parent_code || host;
                } catch { /* fall back to host as-is */ }
            }
            try {
                const r = await api.get("/bodies", {
                    params: { body_type: "District", parent_code: divisionCode },
                });
                setBodies(r.data || []);
            } catch {
                setBodies([]);
            }
        };
        fetchDistricts();
    }, [isDistrictScope, tournament.host_body_id]);

    // M29 · Fetch grounds owned by MPCA + tournament host + participants.
    useEffect(() => {
        const owners = new Set(["MPCA"]);
        if (tournament.host_body_id) owners.add(tournament.host_body_id);
        const pools = (meta.division_pools || []).concat(meta.district_pools || []);
        pools.forEach((p) => (p.division_codes || p.district_codes || []).forEach((c) => owners.add(c)));
        const ownerParam = Array.from(owners).join(",");
        if (!ownerParam) return;
        api.get("/grounds", { params: { owner_body_codes: ownerParam } })
            .then((r) => setAvailableGrounds(r.data || []))
            .catch(() => setAvailableGrounds([]));
    }, [tournament.host_body_id, meta.division_pools, meta.district_pools]);

    // MPCA-213 · Look up the Master Tournament Registry row for THIS tournament
    // and force Category / Age Group / Medical to match. Match on scope→category
    // + name (case-insensitive).
    useEffect(() => {
        if (!tournament?.name) { setRegistryMatch(null); return; }
        const scopeToCategory = {
            Inter_Divisional: "Inter_Divisional",
            Inter_District: "Inter_District",
            Championship: "Inter_Divisional",
            Invitational: null,
        };
        const category = scopeToCategory[tournament.scope];
        if (!category) { setRegistryMatch(null); return; }
        let cancelled = false;
        api.get("/tournament-master", { params: { category } })
            .then((r) => {
                if (cancelled) return;
                const rows = r.data || [];
                const target = String(tournament.name || "").trim().toLowerCase();
                const found = rows.find((m) => String(m.name || "").trim().toLowerCase() === target);
                setRegistryMatch(found || null);
                if (found) {
                    // Force meta to mirror the registry — this is the single source of truth.
                    const cat = deriveCategoryFromMaster(found);
                    const age = deriveAgeGroupFromMaster(found);
                    setMeta((m) => ({
                        ...m,
                        category: cat || m.category,
                        age_group: age || m.age_group,
                    }));
                    // Medical + age_cap live on Tournament itself. Only queue a
                    // patch if the current value diverges from the registry.
                    const cap = AGE_GROUP_TO_CAP[age] ?? null;
                    const patch = {};
                    if ((tournament.medical_required || false) !== !!found.medical_required) {
                        patch.medical_required = !!found.medical_required;
                    }
                    if ((tournament.age_cap_years ?? null) !== cap) {
                        patch.age_cap_years = cap;
                    }
                    if (Object.keys(patch).length > 0) {
                        setTournamentPatch((p) => ({ ...p, ...patch }));
                        setDirty(true);
                    }
                }
            })
            .catch(() => setRegistryMatch(null));
        return () => { cancelled = true; };
    }, [tournament?.name, tournament?.scope]);

    const setField = (k, v) => { setMeta((m) => ({ ...m, [k]: v })); setDirty(true); };

    // MPCA-137 · Sync numeric age_cap_years / age_floor_years to the age_group
    // label so downstream code (Squad Selection age filter · Player age
    // eligibility · Participation basics) always sees one consistent truth.
    // Numeric fields live on the Tournament model itself (not setup_meta).
    const AGE_GROUP_TO_CAP = {
        "Senior": null, "U-25": 25, "U-23": 23, "U-22": 22,
        "U-19": 19, "U-18": 18, "U-16": 16, "U-15": 15, "U-14": 14,
    };
    const setAgeGroup = (label) => {
        setField("age_group", label);
        const cap = AGE_GROUP_TO_CAP[label] ?? null;
        setTournamentField("age_cap_years", cap);
        // Floor stays None unless the user explicitly sets it — U-groups are
        // typically OPEN below the cap, so we don't guess a floor.
    };

    // ─── Body Pools helpers (Division or District) ──────────
    const dpools = meta[poolKey] || [];
    const usedBodyCodes = useMemo(
        () => new Set(dpools.flatMap((p) => p.division_codes || p.district_codes || [])),
        [dpools]
    );
    const bodyByCode = useMemo(() => {
        const m = {};
        bodies.forEach((d) => { m[d.code] = d; });
        return m;
    }, [bodies]);
    const codesKey = isDistrictScope ? "district_codes" : "division_codes";
    const hostKey = isDistrictScope ? "host_district_code" : "host_division_code";

    const addPool = () => {
        const nextLetter = POOL_LABELS[dpools.length] || `${dpools.length + 1}`;
        const newPool = { id: uid(), name: `Pool ${nextLetter}`, [codesKey]: [], [hostKey]: null };
        setField(poolKey, [...dpools, newPool]);
    };
    const removePool = (pid) => setField(poolKey, dpools.filter((p) => p.id !== pid));
    const patchPool = (pid, patch) => {
        setField(
            poolKey,
            dpools.map((p) => (p.id === pid ? { ...p, ...patch } : p))
        );
    };
    const toggleBodyInPool = (pid, code) => {
        const pool = dpools.find((p) => p.id === pid);
        if (!pool) return;
        const currentCodes = pool[codesKey] || [];
        const included = currentCodes.includes(code);
        // Prevent putting a body into more than one pool
        if (!included && usedBodyCodes.has(code)) return;
        const next_codes = included
            ? currentCodes.filter((c) => c !== code)
            : [...currentCodes, code];
        const next_host = pool[hostKey] && next_codes.includes(pool[hostKey])
            ? pool[hostKey]
            : (next_codes[0] || null);
        patchPool(pid, { [codesKey]: next_codes, [hostKey]: next_host });
    };
    const setPoolHost = (pid, code) => patchPool(pid, { [hostKey]: code });
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
        if (!newGround.ground_id) return;
        const g = availableGrounds.find((x) => x.id === newGround.ground_id);
        if (!g) return;
        // Prevent duplicate
        if ((meta.grounds || []).some((x) => x.ground_id === g.id)) {
            setNewGround({ ground_id: "" });
            return;
        }
        setField("grounds", [
            ...(meta.grounds || []),
            {
                id: Date.now(),
                ground_id: g.id,
                ground_no: g.ground_no,
                ground_name: g.name,
                venue_name: g.venue_name,
                owner_body_code: g.owner_body_id || g.managed_by_body_id,
            },
        ]);
        setNewGround({ ground_id: "" });
    };
    const removeGround = (id) => setField("grounds", (meta.grounds || []).filter((g) => g.id !== id));

    // ─── Save with validation ───────────────────────────
    const validate = () => {
        for (const p of dpools) {
            const memberCodes = p[codesKey] || [];
            if (memberCodes.length === 0) {
                return `${p.name} has no ${bodyLabelPlural.toLowerCase()} — add at least one or remove the pool.`;
            }
            if (!p[hostKey]) {
                return `${p.name} needs a host ${bodyLabel.toLowerCase()} marked.`;
            }
            if (!memberCodes.includes(p[hostKey])) {
                return `${p.name}'s host must be one of its ${bodyLabelPlural.toLowerCase()}.`;
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
            // MPCA-105 + MPCA-108 · Persist Tournament-level fields separately.
            if (Object.keys(tournamentPatch).length > 0) {
                await api.patch(`/tournaments/${tournament.id}`, tournamentPatch);
            }
            setTournamentPatch({});
            setDirty(false);
            onChange?.();
        } catch (e) { setSaveError(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const teamPools = Array.from(new Set((meta.teams || []).map((t) => t.pool))).sort();
    const totalBodies = dpools.reduce((n, p) => n + ((p[codesKey] || []).length), 0);
    const totalHosts = dpools.filter((p) => p[hostKey]).length;

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-5" data-testid="panel-basics">
            <div>
                <div className="overline text-[9px]">MPCA Setup Process · Steps 2, 4 & 5</div>
                <div className="font-serif text-lg text-mpca-green-dark mt-1">Tournament Basics · {type?.name}</div>
                <div className="text-[11px] text-mpca-gray-dark mt-1">
                    Capture the category, {isCamp ? "player group, and camp venue" : "division pools with a host, extra teams, and grounds"}.
                    These feed the auto-budget and light up the setup progress phase.
                </div>
                <TournamentSchemeBadge tournament={tournament} />
            </div>

            {/* Step 2 · Category + Age Group */}
            {registryMatch && (
                <div className="border border-mpca-brass/40 bg-mpca-parchment/60 px-3 py-2 flex items-center gap-2" data-testid="basics-registry-chip">
                    <BookMarked size={12} className="text-mpca-brass" />
                    <div className="text-[10px] uppercase tracking-widest text-mpca-brass">Sourced from Master Tournament Registry</div>
                    <div className="text-[11px] text-mpca-charcoal font-serif ml-2">{registryMatch.name}</div>
                    <div className="text-[10px] text-mpca-gray-dark ml-auto italic flex items-center gap-1">
                        <Lock size={10} /> Category · Age Group · Medical locked
                    </div>
                </div>
            )}
            <div className="grid md:grid-cols-2 gap-3" data-testid="basics-category-row">
                <label className="block">
                    <div className="overline text-[9px] mb-1">Category</div>
                    <select className={inputCls} value={meta.category} onChange={(e) => setField("category", e.target.value)} disabled={!canEdit || !!registryMatch} data-testid="basics-category">
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
                    <select className={inputCls} value={meta.age_group} onChange={(e) => setAgeGroup(e.target.value)} disabled={!canEdit || !!registryMatch} data-testid="basics-age">
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

            {/* MPCA-105 + MPCA-108 · Editable Max Squad + Medical Required */}
            <div className="grid md:grid-cols-2 gap-3 pt-2" data-testid="basics-config-row">
                <label className="block">
                    <div className="overline text-[9px] mb-1">Max Squad Size</div>
                    <input
                        type="number"
                        min={11}
                        max={30}
                        className={`${inputCls} font-mono`}
                        value={tournamentPatch.max_squad_size ?? tournament.max_squad_size ?? 18}
                        onChange={(e) => setTournamentField("max_squad_size", Number(e.target.value) || 18)}
                        disabled={!canEdit}
                        data-testid="basics-max-squad"
                    />
                    <div className="text-[10px] text-mpca-gray-dark mt-1 italic">Caps the final squad selection (probables list stays open).</div>
                </label>
                <label className="flex items-start gap-2 pt-4" data-testid="basics-medical-wrap">
                    <input
                        type="checkbox"
                        checked={!!(tournamentPatch.medical_required ?? tournament.medical_required)}
                        onChange={(e) => setTournamentField("medical_required", e.target.checked)}
                        disabled={!canEdit || !!registryMatch}
                        className="mt-1"
                        data-testid="basics-medical-check"
                    />
                    <span className="text-[11px] text-mpca-charcoal">
                        <span className="font-semibold text-mpca-oxblood">Medical clearance required</span>
                        <span className="text-mpca-gray-dark"> — Selection Console will flag any player without a MED stamp.</span>
                    </span>
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
                {/* M39z.i · Skip Step 4 (District/Division pools) entirely for
                    Club / School tournaments — the entrants are free-text
                    teams (there are no body records for clubs). */}
                {!isClubish && (
                <div className="border-t border-mpca-brass/20 pt-4" data-testid="basics-division-pools">
                    <div className="flex items-center justify-between mb-2">
                        <div className="overline text-[9px] flex items-center gap-2"><UsersIcon size={11} /> Step 4 · {bodyLabel} Pools & Host</div>
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
                        Add one or more pools. Tick the {bodyLabelPlural.toLowerCase()} travelling in each pool and mark the host {bodyLabel.toLowerCase()} (where matches are played).
                        A {bodyLabel.toLowerCase()} can appear in only one pool.
                        {isDistrictScope && !tournament.host_body_id && (
                            <span className="block mt-1 text-mpca-oxblood">Note: this Inter-District tournament has no host Division set — pick one from the tournament header first.</span>
                        )}
                    </div>

                    {dpools.length === 0 && (
                        <div className="border border-dashed border-mpca-brass/40 px-4 py-6 text-center text-[11px] text-mpca-gray-dark" data-testid="basics-pools-empty">
                            No {bodyLabel.toLowerCase()} pools added yet. {canEdit && <span>Click <b>Add Pool</b> to start.</span>}
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
                                            · {(pool[codesKey] || []).length} {isDistrictScope ? "distr." : "divs"}
                                            {pool[hostKey] ? ` · host: ${bodyByCode[pool[hostKey]]?.name || pool[hostKey]}` : " · no host set"}
                                        </span>
                                    </div>
                                    {canEdit && (
                                        <button onClick={() => removePool(pool.id)} className="text-mpca-ivory/80 hover:text-mpca-ivory" data-testid={`basics-pool-del-${pool.id}`}>
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="px-3 py-2">
                                    {bodies.length === 0 ? (
                                        <div className="text-[10px] italic text-mpca-gray-dark py-2">Loading {bodyLabelPlural.toLowerCase()}…</div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                                            {bodies.map((d) => {
                                                const inThisPool = (pool[codesKey] || []).includes(d.code);
                                                const inOtherPool = !inThisPool && usedBodyCodes.has(d.code);
                                                const isHost = pool[hostKey] === d.code;
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
                                                            onChange={() => toggleBodyInPool(pool.id, d.code)}
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
                            {dpools.length} pool(s) · {totalBodies} {bodyLabel.toLowerCase()}(s) · {totalHosts} host(s) assigned
                        </div>
                    )}
                </div>
                )}

                {/* Step 4b · Extra teams (clubs / schools / districts).
                    MPCA-104 · Extra Teams section now renders ONLY for Club /
                    School tournaments (isClubish) where it is the PRIMARY
                    entrant list. Non-club tournaments (Inter-Divisional,
                    Inter-District) rely on the pool-based body selection
                    above and don't need the free-text entrant panel.       */}
                {isClubish && (
                <div className={`${isClubish ? "" : "border-t border-mpca-brass/20"} pt-4`} data-testid="basics-teams">
                    <div className="overline text-[9px] mb-2 flex items-center gap-2">
                        <UsersIcon size={11} />
                        {isClubish
                            ? `Step 4 · ${teamLabelSingular}s entering the tournament`
                            : "Step 4b · Extra Teams (Clubs / Schools / Districts)"}
                    </div>
                    <div className="text-[10px] text-mpca-gray-dark italic mb-2">
                        {isClubish
                            ? `Add every ${teamLabelSingular.toLowerCase()} playing this tournament as a free-text entry — no body record needed. Assign each to a pool if you're using group-stage format.`
                            : "Optional — use when the tournament involves non-division entrants (e.g. A-grade clubs, school teams, districts). Add each team by name."}
                    </div>
                    <div className="border border-mpca-brass/20 overflow-hidden mb-2">
                        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                            <div className="col-span-8">{teamLabelSingular} name</div>
                            <div className="col-span-3">Pool</div>
                            <div className="col-span-1"></div>
                        </div>
                        {(meta.teams || []).length === 0 ? (
                            <div className="px-3 py-3 text-[11px] text-mpca-gray-dark italic">
                                {isClubish
                                    ? `No ${teamLabelSingular.toLowerCase()}s added yet. Type each ${teamLabelSingular.toLowerCase()}'s name in the row below and hit +.`
                                    : "No extra teams added."}
                            </div>
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
                            <input placeholder={`${teamLabelSingular} name (e.g. ${tournament.tournament_type_code === "inter_school" ? "Green Valley School XI" : (isClubish ? "Indore Cricket Club" : "Green Valley XI")})`} className={`${inputCls} col-span-8`} value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} data-testid="basics-team-name" />
                            <select className={`${inputCls} col-span-3`} value={newTeam.pool} onChange={(e) => setNewTeam({ ...newTeam, pool: e.target.value })} data-testid="basics-team-pool">
                                {POOL_LABELS.map((p) => <option key={p}>{p}</option>)}
                            </select>
                            <button onClick={addTeam} className="col-span-1 text-[10px] uppercase bg-mpca-oxblood text-mpca-ivory px-2 py-1.5" data-testid="basics-team-add-btn"><Plus size={11} /></button>
                        </div>
                    )}
                    {teamPools.length > 0 && (
                        <div className="text-[10px] font-mono text-mpca-brass mt-2">
                            {(meta.teams || []).length} {teamLabelSingular.toLowerCase()}{(meta.teams || []).length === 1 ? "" : "s"} · {teamPools.length} pool(s)
                        </div>
                    )}
                </div>
                )}
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
                            <div className="col-span-7 font-serif text-mpca-green-dark">
                                {g.ground_name}
                                <span className="text-[9px] text-mpca-brass ml-1">
                                    @ {g.venue_name}{g.owner_body_code ? ` · owner: ${g.owner_body_code}` : ""}
                                </span>
                            </div>
                            <div className="col-span-4 text-mpca-gray-dark font-mono text-[10px]">{g.ground_no || "—"}</div>
                            <div className="col-span-1 text-right">
                                {canEdit && <button onClick={() => removeGround(g.id)} className="text-mpca-oxblood/70 hover:text-mpca-oxblood" data-testid={`basics-ground-del-${g.id}`}><Trash2 size={11} /></button>}
                            </div>
                        </div>
                    ))}
                </div>
                {canEdit && (
                    <div className="grid grid-cols-12 gap-2 items-end" data-testid="basics-ground-add-form">
                        <select
                            className={`${inputCls} col-span-11`}
                            value={newGround.ground_id}
                            onChange={(e) => setNewGround({ ground_id: e.target.value })}
                            data-testid="basics-ground-select"
                        >
                            <option value="">Pick a ground (owned by MPCA / host / participants)…</option>
                            {availableGrounds.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.name}{g.venue_name ? ` @ ${g.venue_name}` : ""} · {g.owner_body_id || g.managed_by_body_id || "MPCA"}
                                </option>
                            ))}
                        </select>
                        <button onClick={addGround} disabled={!newGround.ground_id} className="col-span-1 text-[10px] uppercase bg-mpca-oxblood text-mpca-ivory px-2 py-1.5 disabled:opacity-40" data-testid="basics-ground-add-btn"><Plus size={11} /></button>
                    </div>
                )}
                {availableGrounds.length === 0 && canEdit && (
                    <div className="text-[10px] text-mpca-gray-dark italic mt-1">
                        No grounds available yet for the involved bodies. Configure grounds in the Grounds module first (owner = MPCA / host division / participating bodies).
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
