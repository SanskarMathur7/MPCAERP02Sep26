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
import { TOURNAMENT_TYPE_CATALOG, getTypeByCode, getCreatableTournamentTypes, groupTypesBySection } from "@/lib/tournamentCatalog";

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
    { value: "One_Day", label: "One-Day (50 overs)" },
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

const emptyForm = {
    name: "",
    short_name: "",
    tournament_type: "MPCA_InterDivisional",
    tournament_type_code: "",
    format: "Multi_Day",
    scope: "Inter_Divisional",
    fiscal_cycle: "2025-26",
    host_body_id: "MPCA",
    scheme_code: "",
    start_date: "",
    end_date: "",
    venue_id: "",
    ground_id: "",
    is_womens: false,
    age_cap_years: "",
    age_floor_years: "",
    max_squad_size: 18,
    trophy_name: "",
    notes: "",
};

// Tournament-eligible scheme codes (reimbursement matrix). Non-tournament grants excluded.
const TOURNAMENT_SCHEME_CODES = new Set(["2-A", "2-B", "2-C", "2-D", "2-E", "3-A", "3-B", "3-C", "3-D", "9-BCCI"]);

const TournamentCreateModal = ({ open, onClose, onDone }) => {
    const { persona } = useAuth();
    const [step, setStep] = useState(1); // 1 = type picker, 2 = detail form
    const [form, setForm] = useState(emptyForm);

    // RBAC-filtered catalog for the current persona (Sprint M22)
    const creatableTypes = useMemo(() => getCreatableTournamentTypes(persona), [persona]);
    const sectionedTypes = useMemo(() => groupTypesBySection(creatableTypes), [creatableTypes]);
    const [bodies, setBodies] = useState([]);
    const [venues, setVenues] = useState([]);
    const [grounds, setGrounds] = useState([]);
    const [schemes, setSchemes] = useState([]);
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
        setForm(emptyForm);
        setBudgetPreview(null);
        setErr(null);
        (async () => {
            try {
                const [b, v, g, s] = await Promise.all([
                    fetchBodies().catch(() => []),
                    fetchVenues().catch(() => []),
                    fetchGrounds().catch(() => []),
                    api.get("/reimbursement-schemes", { params: { active_only: true } }).then((r) => r.data).catch(() => []),
                ]);
                setBodies(b || []);
                setVenues(v || []);
                setGrounds(g || []);
                setSchemes((s || []).filter((x) => TOURNAMENT_SCHEME_CODES.has(x.scheme_code) || x.scheme_type === "Reimbursement"));
            } finally {
                setRefsLoading(false);
            }
        })();
    }, [open]);

    const hostOptions = useMemo(() => {
        // Only host-eligible bodies: MPCA, Divisions, Districts (exclude BCCI/Clubs).
        return bodies
            .filter((b) => ["State", "Division", "District"].includes(b.body_type))
            .sort((a, b) => a.body_type.localeCompare(b.body_type) || a.name.localeCompare(b.name));
    }, [bodies]);

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

    // Fix 5: Live budget preview when scheme is selected (uses backend calc with defaults).
    useEffect(() => {
        if (!form.scheme_code) { setBudgetPreview(null); return; }
        let cancelled = false;
        setPreviewLoading(true);
        (async () => {
            try {
                const spec = await api.get(`/schemes/${form.scheme_code}/input-spec`).then((r) => r.data);
                const defaults = {};
                (spec.input_variables || []).forEach((v) => { defaults[v.key] = v.default; });
                const computed = await api.post(`/schemes/${form.scheme_code}/compute-budget`, { inputs: defaults }).then((r) => r.data);
                if (!cancelled) setBudgetPreview(computed);
            } catch (_) {
                if (!cancelled) setBudgetPreview(null);
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [form.scheme_code]);

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
            const payload = {
                ...form,
                short_name: form.short_name || null,
                trophy_name: form.trophy_name || null,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
                venue_id: form.venue_id || null,
                ground_id: form.ground_id || null,
                scheme_code: form.scheme_code || null,
                tournament_type_code: form.tournament_type_code || null,
                age_cap_years: form.age_cap_years ? Number(form.age_cap_years) : null,
                age_floor_years: form.age_floor_years ? Number(form.age_floor_years) : null,
                max_squad_size: Number(form.max_squad_size) || 18,
                notes: form.notes || null,
            };
            const t = await createTournament(payload);

            // If a scheme was chosen, auto-create a draft budget for the tournament
            // so the Division Secretary can immediately submit for MPCA approval.
            if (form.scheme_code && budgetPreview) {
                try {
                    await api.post("/tournament-budgets", {
                        tournament_id: t.id,
                        body_id: form.host_body_id,
                        fiscal_cycle: form.fiscal_cycle,
                        total_ceiling_inr: budgetPreview.total_ceiling_inr,
                        head_allocations: (budgetPreview.head_allocations || []).map((h) => ({
                            head: h.head, limit_inr: h.limit_inr, notes: h.formula,
                        })),
                        notes: `Auto-created from scheme ${form.scheme_code} at tournament creation.`,
                    });
                } catch (_) { /* non-fatal — user can create budget manually later */ }
            }

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
                <div className="p-8 space-y-4">
                    <label className="block">
                        <div className="overline text-[9px] mb-1">Tournament Type *</div>
                        <select
                            className="input-heritage"
                            value={form.tournament_type}
                            onChange={(e) => setForm({ ...form, tournament_type: e.target.value })}
                            data-testid="trn-type-select"
                        >
                            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </label>

                    <div className="grid md:grid-cols-2 gap-4">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Tournament Name *</div>
                            <input
                                className="input-heritage"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. MY Memorial Trophy"
                                data-testid="trn-name-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Trophy / Short Name</div>
                            <input
                                className="input-heritage"
                                value={form.trophy_name}
                                onChange={(e) => setForm({ ...form, trophy_name: e.target.value })}
                                placeholder="e.g. Madhavrao Scindia Trophy"
                                data-testid="trn-trophy-input"
                            />
                        </label>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
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
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Scope *</div>
                            <select
                                className="input-heritage"
                                value={form.scope}
                                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                                data-testid="trn-scope-select"
                            >
                                {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Fiscal Cycle</div>
                            <input
                                className="input-heritage font-mono"
                                value={form.fiscal_cycle}
                                onChange={(e) => setForm({ ...form, fiscal_cycle: e.target.value })}
                                placeholder="2025-26"
                                data-testid="trn-fy-input"
                            />
                        </label>
                    </div>

                    <label className="block">
                        <div className="overline text-[9px] mb-1 flex items-center gap-2">
                            <Landmark size={11} /> Host Body *
                            {refsLoading && <span className="text-[9px] text-mpca-brass italic normal-case tracking-normal">loading…</span>}
                        </div>
                        <select
                            className="input-heritage"
                            value={form.host_body_id}
                            onChange={(e) => setForm({ ...form, host_body_id: e.target.value })}
                            disabled={refsLoading || hostOptions.length === 0}
                            data-testid="trn-host-select"
                        >
                            {refsLoading && <option value="MPCA">Loading bodies…</option>}
                            {!refsLoading && hostOptions.length === 0 && <option value="">No bodies available</option>}
                            {!refsLoading && hostOptions.map((b) => (
                                <option key={b.code} value={b.code}>
                                    [{b.body_type}] {b.name} ({b.code})
                                </option>
                            ))}
                        </select>
                        <div className="text-[10px] text-mpca-gray-dark mt-1 italic">
                            Pick MPCA (State) for state-level events, a Division for Inter-Divisional / Inter-District, a District for local tournaments.
                        </div>
                    </label>

                    {/* Fix 5: MPCA Reimbursement Scheme with live auto-budget preview */}
                    <label className="block">
                        <div className="overline text-[9px] mb-1 flex items-center gap-2">
                            <BookOpen size={11} /> MPCA Reimbursement Scheme
                            {previewLoading && <span className="text-[9px] text-mpca-brass italic normal-case tracking-normal">computing budget…</span>}
                        </div>
                        <select
                            className="input-heritage"
                            value={form.scheme_code}
                            onChange={(e) => setForm({ ...form, scheme_code: e.target.value })}
                            disabled={refsLoading || schemes.length === 0}
                            data-testid="trn-scheme-select"
                        >
                            <option value="">— No scheme / attach later —</option>
                            {schemes.map((s) => (
                                <option key={s.scheme_code} value={s.scheme_code}>
                                    Scheme {s.scheme_code} · {s.name}
                                </option>
                            ))}
                        </select>
                        <div className="text-[10px] text-mpca-gray-dark mt-1 italic">
                            Pick the applicable scheme (e.g. 2-D for Inter-Divisional Hosting) — a draft budget will be auto-created and available for the Division Secretary to submit.
                        </div>
                        {budgetPreview && (
                            <div className="mt-2 border border-mpca-brass/40 bg-mpca-parchment/40 p-3" data-testid="trn-budget-preview">
                                <div className="flex justify-between items-center">
                                    <div className="overline text-[9px]">Auto-Budget Preview (default inputs)</div>
                                    <div className="font-mono text-lg text-mpca-oxblood" data-testid="trn-budget-total">
                                        ₹{Math.round(budgetPreview.total_ceiling_inr || 0).toLocaleString("en-IN")}
                                    </div>
                                </div>
                                <div className="mt-2 space-y-0.5">
                                    {(budgetPreview.head_allocations || []).slice(0, 6).map((h, i) => (
                                        <div key={i} className="flex justify-between text-[10px] font-mono">
                                            <span className="text-mpca-green-dark truncate">{h.head}</span>
                                            <span className="text-mpca-brass">₹{Math.round(h.limit_inr || 0).toLocaleString("en-IN")}</span>
                                        </div>
                                    ))}
                                    {(budgetPreview.head_allocations || []).length > 6 && (
                                        <div className="text-[10px] text-mpca-gray-dark italic">+ {budgetPreview.head_allocations.length - 6} more heads</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </label>

                    <div className="grid md:grid-cols-2 gap-4">
                        <label className="block">
                            <div className="overline text-[9px] mb-1 flex items-center gap-2">
                                <MapPin size={11} /> Venue
                                {refsLoading && <span className="text-[9px] text-mpca-brass italic normal-case tracking-normal">loading…</span>}
                            </div>
                            <select
                                className="input-heritage"
                                value={form.venue_id}
                                onChange={(e) => setForm({ ...form, venue_id: e.target.value, ground_id: "" })}
                                disabled={refsLoading}
                                data-testid="trn-venue-select"
                            >
                                <option value="">{refsLoading ? "Loading venues…" : "— None / TBD —"}</option>
                                {!refsLoading && filteredVenues.map((v) => (
                                    <option key={v.id} value={v.id}>{v.name} ({v.city}) · {v.category}</option>
                                ))}
                            </select>
                            {!refsLoading && form.host_body_id !== "MPCA" && filteredVenues.length < venues.length && (
                                <div className="text-[10px] text-mpca-brass mt-1 italic">
                                    Showing {filteredVenues.length} of {venues.length} venues — filtered to your host body.
                                </div>
                            )}
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Ground (under selected venue)</div>
                            <select
                                className="input-heritage"
                                value={form.ground_id}
                                onChange={(e) => setForm({ ...form, ground_id: e.target.value })}
                                disabled={!form.venue_id}
                                data-testid="trn-ground-select"
                            >
                                <option value="">— None —</option>
                                {groundsForVenue.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name} · {g.type}</option>
                                ))}
                            </select>
                            {form.venue_id && groundsForVenue.length === 0 && (
                                <div className="text-[10px] text-mpca-oxblood mt-1 italic">No grounds defined under this venue yet. Add grounds via the Venues & Grounds page.</div>
                            )}
                        </label>
                    </div>

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

                    <div className="grid md:grid-cols-3 gap-4">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Age Cap (U-)</div>
                            <input
                                type="number"
                                className="input-heritage font-mono"
                                value={form.age_cap_years}
                                onChange={(e) => setForm({ ...form, age_cap_years: e.target.value })}
                                placeholder="e.g. 19"
                                data-testid="trn-agecap-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Age Floor (+)</div>
                            <input
                                type="number"
                                className="input-heritage font-mono"
                                value={form.age_floor_years}
                                onChange={(e) => setForm({ ...form, age_floor_years: e.target.value })}
                                placeholder="e.g. 14"
                                data-testid="trn-agefloor-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Max Squad Size</div>
                            <input
                                type="number"
                                className="input-heritage font-mono"
                                value={form.max_squad_size}
                                onChange={(e) => setForm({ ...form, max_squad_size: e.target.value })}
                                data-testid="trn-squad-input"
                            />
                        </label>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-mpca-charcoal">
                        <input
                            type="checkbox"
                            checked={form.is_womens}
                            onChange={(e) => setForm({ ...form, is_womens: e.target.checked })}
                            data-testid="trn-womens-toggle"
                        />
                        Women&apos;s tournament
                    </label>

                    <label className="block">
                        <div className="overline text-[9px] mb-1">Notes</div>
                        <textarea
                            className="input-heritage min-h-[70px]"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            data-testid="trn-notes-input"
                        />
                    </label>

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
                            disabled={busy || refsLoading || !form.name || !form.host_body_id}
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
