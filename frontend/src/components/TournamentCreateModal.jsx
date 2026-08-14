import { useEffect, useMemo, useState } from "react";
import { X, Trophy, Save, MapPin, Landmark, BookOpen, ChevronLeft, ArrowRight, ShieldAlert } from "lucide-react";
import {
    createTournament,
    fetchBodies,
    fetchVenues,
    fetchGrounds,
} from "@/lib/api";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSeason } from "@/context/SeasonContext";
import { TOURNAMENT_TYPE_CATALOG, getTypeByCode, getCreatableTournamentTypes, groupTypesBySection } from "@/lib/tournamentCatalog";
import { getDirectoryFor } from "@/lib/tournamentDirectory";

// Visual palette per section (matches the user's mockup: BCCI = navy tint,
// MPCA = green tint, Division = brass/marigold tint)
const SECTION_STYLES = {
    "BCCI ALLOTS TO MPCA":                                             { header: "bg-mpca-navy/20 text-mpca-navy", cardBorder: "border-mpca-navy/40" },
    "MPCA ALLOTS TO DIVISION":                                         { header: "bg-mpca-green-dark/20 text-mpca-green-dark", cardBorder: "border-mpca-green-dark/40" },
    "A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS": { header: "bg-mpca-brass/20 text-mpca-brass", cardBorder: "border-mpca-brass/40" },
};

const TYPE_OPTIONS = [
    { value: "MPCA_InterDivisional", label: "MPCA · Inter-Divisional (MY Memorial, Madhavrao Scindia, JN Bhaya…)" },
    { value: "MPCA_Championship", label: "MPCA · Championship (CT Sarwate, CS Nayudu, Nimbalkar…)" },
    { value: "BCCI", label: "BCCI (Ranji, Vijay Hazare, Duleep, U-23, U-19, U-16)" },
    { value: "Invitational", label: "Invitational" },
    { value: "Other", label: "Other" },
];

// Trimmed to formats that MPCA / Divisions actually schedule. Kept aligned with backend Literal.
const FORMAT_OPTIONS = [
    { value: "Multi_Day", label: "Multi-Day" },
    { value: "One_Day", label: "Limited Overs" },
    { value: "T20", label: "T20" },
    { value: "Pink_Ball", label: "Pink-Ball" },
    { value: "FourDay_Senior", label: "4-Day Senior" },
    { value: "FourDay_U23", label: "4-Day U-23" },
    { value: "FourDay_U19", label: "4-Day U-19" },
    { value: "OneDay_Senior", label: "One-Day Senior" },
    { value: "OneDay_U23", label: "One-Day U-23" },
    { value: "OneDay_U19", label: "One-Day U-19" },
    { value: "OneDay_Womens", label: "One-Day Women's" },
    { value: "T20_Senior", label: "T20 Senior" },
    { value: "T20_U23", label: "T20 U-23" },
    { value: "T20_U19", label: "T20 U-19" },
    { value: "T20_Womens", label: "T20 Women's" },
    { value: "U16_League", label: "U-16 League" },
];

const SCOPE_OPTIONS = [
    { value: "Inter_Divisional", label: "Inter-Divisional" },
    { value: "Inter_District", label: "Inter-District" },
    { value: "Championship", label: "Championship" },
    { value: "Invitational", label: "Invitational" },
];

// MPCA-102 · Category & Age-group taxonomy used across every tournament form.
// Gender is a top-level filter; `age_group` maps 1-1 to `age_cap_years` on
// the Tournament model (Open → null, U-11 → 11, … U-25 → 25).
const GENDER_OPTIONS = [
    { value: "Male", label: "Male" },
    { value: "Female", label: "Female" },
];
const AGE_GROUP_OPTIONS = [
    { value: "Open", cap: null },
    { value: "U-11", cap: 11 },
    { value: "U-12", cap: 12 },
    { value: "U-13", cap: 13 },
    { value: "U-14", cap: 14 },
    { value: "U-15", cap: 15 },
    { value: "U-16", cap: 16 },
    { value: "U-17", cap: 17 },
    { value: "U-18", cap: 18 },
    { value: "U-19", cap: 19 },
    { value: "U-20", cap: 20 },
    { value: "U-21", cap: 21 },
    { value: "U-22", cap: 22 },
    { value: "U-23", cap: 23 },
    { value: "U-24", cap: 24 },
    { value: "U-25", cap: 25 },
];

const emptyForm = {
    name: "",
    short_name: "",
    tournament_type: "MPCA_InterDivisional",
    tournament_type_code: "",
    format: "Multi_Day",
    scope: "Inter_Divisional",
    fiscal_cycle: (typeof window !== "undefined" && window.__mpca_season) || "2026-27",
    host_body_id: "MPCA",
    scheme_code: "",
    start_date: "",
    end_date: "",
    venue_id: "",
    ground_id: "",
    // MPCA-102 · Gender + Age Group. is_womens mirrors gender==='Female'
    // (kept for backwards compatibility with M2-A code paths that read it).
    gender: "Male",
    age_group: "Open",
    is_womens: false,
    age_cap_years: "",
    age_floor_years: "",
    // MPCA-108 · Medical clearance requirement (per-tournament, editable later).
    medical_required: false,
    max_squad_size: 18,
    trophy_name: "",
    notes: "",
};

// Tournament-eligible scheme codes (reimbursement matrix). Non-tournament grants excluded.
const TOURNAMENT_SCHEME_CODES = new Set(["2-A", "2-B", "2-C", "2-D", "2-E", "3-A", "3-B", "3-C", "3-D", "9-BCCI"]);

const TournamentCreateModal = ({ open, onClose, onDone }) => {
    const { persona } = useAuth();
    const { season, seasons } = useSeason();
    const [step, setStep] = useState(1); // 1 = type picker, 2 = detail form
    const [form, setForm] = useState({ ...emptyForm, fiscal_cycle: season });

    // RBAC-filtered catalog for the current persona (Sprint M22)
    const creatableTypes = useMemo(() => getCreatableTournamentTypes(persona), [persona]);
    const sectionedTypes = useMemo(() => groupTypesBySection(creatableTypes), [creatableTypes]);
    const [bodies, setBodies] = useState([]);
    const [venues, setVenues] = useState([]);
    const [grounds, setGrounds] = useState([]);
    const [schemes, setSchemes] = useState([]);
    const [masterByType, setMasterByType] = useState({});
    const [budgetPreview, setBudgetPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [refsLoading, setRefsLoading] = useState(true);

    useEffect(() => {
        if (!open) return;
        setStep(1);
        setRefsLoading(true);
        setBodies([]);
        setVenues([]);
        setGrounds([]);
        setSchemes([]);
        setForm({ ...emptyForm, fiscal_cycle: season });
        setBudgetPreview(null);
        setErr(null);
        (async () => {
            try {
                const [b, v, g, s, master] = await Promise.all([
                    fetchBodies().catch(() => []),
                    fetchVenues().catch(() => []),
                    fetchGrounds().catch(() => []),
                    api.get("/reimbursement-schemes", { params: { active_only: true } }).then((r) => r.data).catch(() => []),
                    api.get("/tournament-master/grouped").then((r) => r.data).catch(() => ({})),
                ]);
                setBodies(b || []);
                setVenues(v || []);
                setGrounds(g || []);
                setSchemes((s || []).filter((x) => TOURNAMENT_SCHEME_CODES.has(x.scheme_code) || x.scheme_type === "Reimbursement"));
                setMasterByType(master || {});
            } finally {
                setRefsLoading(false);
            }
        })();
    }, [open]);

    // Sprint M28 · Host body dropdown scoping by persona
    //   MPCA (State) creates → list all 10 MP Divisions (they are the operational hosts).
    //   Division persona creates → list all Districts UNDER that division (parent_code match).
    //   District persona creates → self only (rare, e.g. a district-hosted invitational).
    //   Fallback (Public / no persona) → State + Division + District — everything host-eligible.
    const hostOptions = useMemo(() => {
        const eligible = bodies.filter((b) => ["State", "Division", "District"].includes(b.body_type));
        if (!persona) return eligible;
        const bt = persona.body_type;
        if (bt === "State") {
            // MPCA: divisions are the practical hosts. Retain State (MPCA itself) for
            // BCCI-scope tournaments where MPCA hosts state-wide events.
            return eligible.filter((b) => b.body_type === "Division" || b.code === "MPCA")
                .sort((a, b) => a.body_type.localeCompare(b.body_type) || a.name.localeCompare(b.name));
        }
        if (bt === "Division") {
            // Districts under my division + myself (some Div hosts a tournament directly).
            return eligible
                .filter((b) => (b.body_type === "District" && b.parent_code === persona.body_code) || b.code === persona.body_code)
                .sort((a, b) => a.body_type.localeCompare(b.body_type) || a.name.localeCompare(b.name));
        }
        if (bt === "District") {
            return eligible.filter((b) => b.code === persona.body_code);
        }
        return eligible;
    }, [bodies, persona]);

    // Auto-default host_body_id when persona-scoped options load.
    useEffect(() => {
        if (!open || refsLoading || hostOptions.length === 0) return;
        if (!hostOptions.some((b) => b.code === form.host_body_id)) {
            // First option is the sensible default (division for MPCA, self for others).
            setForm((f) => ({ ...f, host_body_id: hostOptions[0].code }));
        }
    }, [hostOptions, refsLoading, open]);

    // Fix 4: Filter venues by host body's HQ city.
    // MPCA (State) → all venues. Division/District → venues in the same city as the
    // body's seat, plus any venue explicitly owned/managed by that body.
    const hostBody = useMemo(
        () => bodies.find((b) => b.code === form.host_body_id) || null,
        [bodies, form.host_body_id],
    );
    const filteredVenues = useMemo(() => {
        if (!form.host_body_id || form.host_body_id === "MPCA") return venues;
        const seat = (hostBody?.seat || hostBody?.name || "").replace(/\s+(Division|District)$/i, "").trim().toLowerCase();
        return venues.filter((v) => {
            if (v.owner_body_id === form.host_body_id) return true;
            if (v.managed_by_body_id === form.host_body_id) return true;
            if (v.body_id === form.host_body_id) return true;
            if (seat && (v.city || "").toLowerCase().includes(seat)) return true;
            return false;
        });
    }, [venues, form.host_body_id, hostBody]);

    const groundsForVenue = useMemo(() => {
        if (!form.venue_id) return [];
        return grounds.filter((g) => g.venue_id === form.venue_id);
    }, [grounds, form.venue_id]);

    // Sprint M23c · Removed: live budget preview on create. Budget is now
    // computed inside the tournament workspace's Input Variables panel.

    if (!open) return null;

    const pickType = (t) => {
        setForm((f) => ({
            ...f,
            tournament_type_code: t.code,
            tournament_type: t.family,
            format: t.default_format || f.format,
            scope: t.default_scope || f.scope,
            // Use explicit scheme_code from catalog (maps to backend calculator code like 2-B).
            scheme_code: t.scheme_code || "",
        }));
        setStep(2);
    };

    const handleSave = async () => {
        setBusy(true);
        setErr(null);
        try {
            // MPCA-102 · Derive age_cap_years from age_group + backwards-compat
            // is_womens from gender.
            const ageOpt = AGE_GROUP_OPTIONS.find((o) => o.value === form.age_group);
            const derivedCap = ageOpt ? ageOpt.cap : null;
            const payload = {
                ...form,
                name: form.name === "__other__" ? "" : form.name,
                short_name: form.short_name || null,
                trophy_name: form.trophy_name || null,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                venue_id: form.venue_id || null,
                ground_id: form.ground_id || null,
                scheme_code: form.scheme_code || null,
                tournament_type_code: form.tournament_type_code || null,
                age_cap_years: derivedCap !== null ? derivedCap : (form.age_cap_years ? Number(form.age_cap_years) : null),
                age_floor_years: form.age_floor_years ? Number(form.age_floor_years) : null,
                is_womens: form.gender === "Female",
                medical_required: !!form.medical_required,
                max_squad_size: Number(form.max_squad_size) || 18,
                notes: form.notes || null,
            };
            const t = await createTournament(payload);
            // Sprint M23c · Auto-budget moved out of the create flow — the
            // Input Variables panel on the tournament workspace now owns budget
            // creation once the user fills the scheme-specific variables.
            onDone?.(t);
            onClose();
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" data-testid="tournament-create-modal">
            <div
                className="w-full max-w-3xl bg-mpca-ivory border border-mpca-brass/40 shadow-2xl relative my-8"
                style={{ backgroundImage: "linear-gradient(135deg, var(--mpca-ivory) 0%, var(--mpca-parchment) 100%)" }}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-mpca-brass hover:text-mpca-oxblood transition"
                    data-testid="close-modal-btn"
                >
                    <X size={20} strokeWidth={1.5} />
                </button>

                <div className="p-8 border-b border-mpca-brass/30">
                    <div className="overline">Article VII · Add Tournament · Step {step} of 2</div>
                    <h2 className="font-serif text-3xl text-mpca-green-dark mt-2 flex items-center gap-2">
                        <Trophy size={22} strokeWidth={1.5} className="text-mpca-brass" />
                        {step === 1 ? "Pick a Tournament Type" : "Tournament Details"}
                    </h2>
                    <p className="text-mpca-gray-dark text-sm mt-2">
                        {step === 1 ? (
                            creatableTypes.length === 0 ? (
                                <>Your role does not have permission to create tournaments. Please contact the MPCA Secretariat.</>
                            ) : (
                                <>
                                    You are signed in as <b>{persona?.name}</b> ({persona?.body_type}) — the {creatableTypes.length} tournament categories below are the ones your role may create. The category drives budget formulas, input variables and eligibility.
                                </>
                            )
                        ) : (
                            <>You picked <b>{getTypeByCode(form.tournament_type_code)?.name}</b>. Enter the trophy name, host body and dates. Detailed input-variable data can be filled from the tournament workspace.</>
                        )}
                    </p>
                </div>

                {step === 1 && (
                    <div className="p-8" data-testid="trn-type-picker">
                        {creatableTypes.length === 0 ? (
                            <div className="p-10 text-center border border-mpca-oxblood/30 bg-mpca-oxblood/5" data-testid="trn-type-picker-empty">
                                <ShieldAlert size={28} className="mx-auto text-mpca-oxblood mb-3" strokeWidth={1.2} />
                                <div className="font-serif text-lg text-mpca-oxblood">No tournament types available to you.</div>
                                <div className="text-[11px] text-mpca-gray-dark mt-2">Only MPCA-level and Division/District personas may create tournaments.</div>
                            </div>
                        ) : (
                            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                                {Object.entries(sectionedTypes).map(([sectionLabel, types]) => {
                                    const style = SECTION_STYLES[sectionLabel] || { header: "bg-mpca-parchment text-mpca-green-dark", cardBorder: "border-mpca-brass/30" };
                                    return (
                                        <div key={sectionLabel} data-testid={`trn-type-section-${sectionLabel.slice(0, 30).toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                                            <div className="overline text-[9px] mb-2 text-mpca-brass">
                                                {sectionLabel}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {types.map((t) => (
                                                    <button
                                                        key={t.code}
                                                        onClick={() => pickType(t)}
                                                        className={`text-left p-4 border ${style.cardBorder} hover:border-mpca-oxblood hover:bg-mpca-cream/30 transition-all group relative`}
                                                        data-testid={`trn-type-card-${t.code}`}
                                                    >
                                                        <div className={`inline-block text-[9px] uppercase tracking-widest px-2 py-0.5 ${style.header} mb-2`}>
                                                            {sectionLabel.replace("A DIVISION ALLOTS TO ITS DISTRICTS, CLUBS, SCHOOLS OR ITS OWN TEAMS", "DIVISION ALLOTS TO " + (t.flow.split("→")[1] || "").trim().toUpperCase())}
                                                        </div>
                                                        <div className="font-serif text-base text-mpca-green-dark group-hover:text-mpca-oxblood">{t.name}</div>
                                                        <div className="text-[11px] text-mpca-gray-dark mt-2 leading-snug line-clamp-3">{t.one_liner}</div>
                                                        <div className="mt-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
                                                            <span className="border border-mpca-brass/40 text-mpca-brass px-1.5 py-0.5">{t.flow.split("→")[0].trim()}</span>
                                                            <ArrowRight size={10} className="text-mpca-gray-dark" />
                                                            <span className="border border-mpca-brass/40 text-mpca-brass px-1.5 py-0.5">{(t.flow.split("→")[1] || "").trim()}</span>
                                                        </div>
                                                        {t.scheme_ref && (
                                                            <div className="text-[9px] font-mono text-mpca-gray-dark italic mt-2">{t.scheme_ref}</div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                <>
                <div className="p-8 pb-2">
                    <button onClick={() => setStep(1)} className="text-[10px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood flex items-center gap-1" data-testid="trn-back-to-picker">
                        <ChevronLeft size={11} /> Back to type picker
                    </button>
                </div>
                <div className="p-8 space-y-5">
                    {/* Read-only type badge — locked from Step 1 */}
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-4 py-3 flex items-center gap-3" data-testid="trn-type-badge">
                        <Trophy size={16} strokeWidth={1.5} className="text-mpca-brass" />
                        <div className="flex-1">
                            <div className="overline text-[9px]">Selected Tournament Type</div>
                            <div className="font-serif text-base text-mpca-green-dark mt-0.5">{getTypeByCode(form.tournament_type_code)?.name || form.tournament_type}</div>
                        </div>
                        <div className="text-[10px] text-mpca-brass italic max-w-xs text-right">
                            Rate-card + input variables for this type are pre-defined by MPCA and will be applied when you open the tournament workspace.
                        </div>
                    </div>

                    {/* Master information — 4 essentials to identify the tournament */}
                    <label className="block">
                        <div className="overline text-[9px] mb-1">Tournament Name *</div>
                        {(() => {
                            // MPCA-205 · Prefer master registry entries; fallback to legacy directory.
                            const registryCategory = ({
                                MPCA_InterDivisional: "Inter_Divisional",
                                MPCA_Championship: "Inter_Divisional",
                                BCCI: "BCCI",
                                Inter_District: "Inter_District",
                                inter_div: "Inter_Divisional",
                                inter_district: "Inter_District",
                                bcci: "BCCI",
                            })[form.tournament_type] || ({
                                MPCA_InterDivisional: "Inter_Divisional",
                                BCCI: "BCCI",
                            })[form.tournament_type_code];
                            const registryEntries = registryCategory
                                ? (masterByType[registryCategory] || []).map((m) => ({
                                    name: m.name,
                                    age: m.age_grp || m.description || m.short_name || "",
                                    _master: m,   // MPCA-206 · retain full row for auto-fill
                                }))
                                : [];
                            const legacyDir = registryCategory ? [] : getDirectoryFor(form.tournament_type_code);
                            // Merge unique by name — registry takes precedence
                            const seenNames = new Set(registryEntries.map((e) => e.name));
                            const dir = [
                                ...registryEntries,
                                ...legacyDir.filter((d) => !seenNames.has(d.name)),
                            ];
                            const isOther = form.name === "__other__" || (!!form.name && form.name !== "__other__" && !dir.some((d) => d.name === form.name));
                            return (
                                <>
                                    {dir.length > 0 && (
                                        <select
                                            className="input-heritage"
                                            value={dir.some((d) => d.name === form.name) ? form.name : (form.name ? "__other__" : "")}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v === "__other__") { setForm({ ...form, name: "__other__" }); return; }
                                                const picked = dir.find((d) => d.name === v);
                                                const m = picked?._master;
                                                if (m) {
                                                    // MPCA-206 · Auto-fill format/age/gender/scope from Registry
                                                    setForm({
                                                        ...form,
                                                        name: v,
                                                        trophy_name: (m.short_name || v.split(" · ")[0] || v),
                                                        format: m.default_format || form.format,
                                                        scope: m.default_scope || form.scope,
                                                        gender: m.gender === "Women" ? "Female" : (m.gender === "Men" ? "Male" : form.gender),
                                                        is_womens: m.gender === "Women",
                                                        age_group: m.age_grp || form.age_group,
                                                        age_cap_years: (m.age_grp || "").match(/^U(\d+)$/i)?.[1] || form.age_cap_years,
                                                    });
                                                } else {
                                                    setForm({ ...form, name: v, trophy_name: v.split(" · ")[0] || v });
                                                }
                                            }}
                                            data-testid="trn-name-select"
                                        >
                                            <option value="">— Pick from MPCA registry —</option>
                                            {dir.map((d) => (
                                                <option key={d.name} value={d.name}>{d.name}{d.age ? ` · ${d.age}` : ""}</option>
                                            ))}
                                            <option value="__other__">➕ Other · type manually</option>
                                        </select>
                                    )}
                                    {(dir.length === 0 || isOther) && (
                                        <input
                                            className={`input-heritage ${dir.length > 0 ? "mt-2" : ""}`}
                                            value={form.name === "__other__" ? "" : form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            placeholder={dir.length > 0 ? "Type the tournament name manually…" : "e.g. MY Memorial Trophy"}
                                            data-testid="trn-name-input"
                                            autoFocus={isOther}
                                        />
                                    )}
                                </>
                            );
                        })()}
                    </label>

                    <label className="block">
                        <div className="overline text-[9px] mb-1">Trophy / Short Name (optional)</div>
                        <input
                            className="input-heritage"
                            value={form.trophy_name}
                            onChange={(e) => setForm({ ...form, trophy_name: e.target.value })}
                            placeholder="Auto-fills from directory · edit if needed"
                            data-testid="trn-trophy-input"
                        />
                    </label>

                    <div className="grid md:grid-cols-2 gap-4">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Cricketing Season *</div>
                            <select
                                className="input-heritage font-mono"
                                value={form.fiscal_cycle}
                                onChange={(e) => setForm({ ...form, fiscal_cycle: e.target.value })}
                                data-testid="trn-fy-input"
                            >
                                {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Format *</div>
                            <select
                                className="input-heritage"
                                value={form.format}
                                onChange={(e) => setForm({ ...form, format: e.target.value })}
                                data-testid="trn-format-select"
                            >
                                {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </label>
                    </div>

                    {/* MPCA-102 · Gender + Age Group. MPCA-105 · Max Squad
                        editable. MPCA-108 · Medical clearance flag. */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Category *</div>
                            <select
                                className="input-heritage"
                                value={form.gender}
                                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                                data-testid="trn-gender-select"
                            >
                                {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Age Group *</div>
                            <select
                                className="input-heritage font-mono"
                                value={form.age_group}
                                onChange={(e) => setForm({ ...form, age_group: e.target.value })}
                                data-testid="trn-age-group-select"
                            >
                                {AGE_GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Max Squad Size *</div>
                            <input
                                type="number"
                                min={11}
                                max={30}
                                className="input-heritage font-mono"
                                value={form.max_squad_size}
                                onChange={(e) => setForm({ ...form, max_squad_size: e.target.value })}
                                data-testid="trn-max-squad-input"
                            />
                            <div className="text-[10px] text-mpca-gray-dark mt-1 italic">Editable later from Tournament Basics.</div>
                        </label>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer" data-testid="trn-medical-wrap">
                        <input
                            type="checkbox"
                            checked={!!form.medical_required}
                            onChange={(e) => setForm({ ...form, medical_required: e.target.checked })}
                            data-testid="trn-medical-check"
                        />
                        <span className="text-[11px] text-mpca-charcoal">
                            <span className="font-semibold text-mpca-oxblood">Medical clearance required</span>
                            <span className="text-mpca-gray-dark"> — players without a medical stamp will be flagged in Squad Selection.</span>
                        </span>
                    </label>

                    <label className="block">
                        <div className="overline text-[9px] mb-1 flex items-center gap-2">
                            <Landmark size={11} /> {persona?.body_type === "State" ? "Host Division *" : persona?.body_type === "Division" ? "Host District *" : "Host Body *"}
                            {refsLoading && <span className="text-[9px] text-mpca-brass italic normal-case tracking-normal">loading…</span>}
                        </div>
                        <select
                            className="input-heritage"
                            value={form.host_body_id}
                            onChange={(e) => setForm({ ...form, host_body_id: e.target.value })}
                            disabled={refsLoading || hostOptions.length === 0}
                            data-testid="trn-host-select"
                        >
                            {refsLoading && <option value="">Loading…</option>}
                            {!refsLoading && hostOptions.length === 0 && <option value="">No hosts available for your role</option>}
                            {!refsLoading && hostOptions.map((b) => (
                                <option key={b.code} value={b.code}>
                                    {b.name} ({b.code})
                                </option>
                            ))}
                        </select>
                        {persona?.body_type === "State" && (
                            <div className="text-[10px] text-mpca-gray-dark mt-1 italic">MPCA tournaments are hosted by a Division. Pick which Division will physically host.</div>
                        )}
                        {persona?.body_type === "Division" && (
                            <div className="text-[10px] text-mpca-gray-dark mt-1 italic">Divisional tournaments are hosted by one of the Districts under {persona?.body_name || persona?.body_code}.</div>
                        )}
                    </label>

                    <div className="grid md:grid-cols-2 gap-4">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Start Date</div>
                            <input
                                type="date"
                                className="input-heritage font-mono"
                                value={form.start_date}
                                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                                data-testid="trn-start-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">End Date</div>
                            <input
                                type="date"
                                className="input-heritage font-mono"
                                value={form.end_date}
                                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                                data-testid="trn-end-input"
                            />
                        </label>
                    </div>

                    <label className="block">
                        <div className="overline text-[9px] mb-1">Notes (optional)</div>
                        <textarea
                            className="input-heritage min-h-[60px]"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            placeholder="Any additional context for the tournament…"
                            data-testid="trn-notes-input"
                        />
                    </label>

                    <div className="border-l-4 border-mpca-brass/50 bg-mpca-cream/30 px-4 py-3">
                        <div className="text-[10px] text-mpca-brass uppercase tracking-widest">Next steps</div>
                        <div className="text-[11px] text-mpca-gray-dark mt-1 leading-snug">
                            After you save, open the tournament workspace to fill the scheme-specific input variables — those drive the auto-budget and reimbursement flow. Venue, squad, and match calendar are also assigned from the workspace.
                        </div>
                    </div>

                    {err && (
                        <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-3 text-sm text-mpca-oxblood" data-testid="trn-error">
                            {typeof err === "string" ? err : JSON.stringify(err)}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-mpca-brass/20">
                        <button className="btn-heritage-ghost" onClick={onClose} data-testid="trn-cancel-btn">Cancel</button>
                        <button
                            className="btn-heritage-primary"
                            onClick={handleSave}
                            disabled={busy || refsLoading || !form.name || form.name === "__other__" || !form.host_body_id}
                            data-testid="trn-save-btn"
                        >
                            <Save size={14} strokeWidth={1.5} /> {busy ? "Saving…" : "Add to Calendar"}
                        </button>
                    </div>
                </div>
                </>
                )}
            </div>
        </div>
    );
};

export default TournamentCreateModal;
