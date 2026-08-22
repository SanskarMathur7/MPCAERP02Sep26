/**
 * Iter 125 · SysAdmin · Eligibility Rules Admin
 * ──────────────────────────────────────────────
 * Season-scoped config for the sequential MPCA player-eligibility decision
 * tree. Lists the 8 canonical tags with their pseudocode + editable numeric
 * thresholds that the backend reads at /players/{id}/eligibility-tag/compute
 * time. Also lets SysAdmin duplicate a season's config into the next season
 * (classic "carry forward" workflow).
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
    Loader2, Save, ShieldCheck, Copy, RefreshCw, AlertTriangle,
} from "lucide-react";

const NUM_FIELDS = [
    { key: "residency_min_months", label: "Local residency minimum (months)", hint: "Applies to Local/Residence, Employment, Education" },
    { key: "education_min_months_local", label: "Local education minimum (months)", hint: "Local/Education path" },
    { key: "education_min_months_guest", label: "Guest education minimum (months)", hint: "Guest/Education path (typically ≥ 1 academic year)" },
    { key: "guest_prior_years_min", label: "Guest prior domestic play (years)", hint: "Guest/Out-of-MP path" },
    { key: "age_of_majority_for_parent", label: "Age of majority (parent-employment cutoff)", hint: "Below this age, parent's employment counts for Local/Employment" },
];

const EligibilityRulesAdmin = () => {
    const [seasons, setSeasons] = useState([]);
    const [tags, setTags] = useState([]);
    const [activeSeason, setActiveSeason] = useState("2026-27");
    const [config, setConfig] = useState(null);
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);
    const [ok, setOk] = useState(null);

    const load = async () => {
        setBusy(true); setErr(null); setOk(null);
        try {
            const [seasonsRes, tagsRes] = await Promise.all([
                api.get("/eligibility-rules"),
                api.get("/eligibility-rules/tags"),
            ]);
            setSeasons(seasonsRes.data || []);
            setTags(tagsRes.data || []);
            // Load active season's config (may 404 the first time — treat as unsaved defaults).
            try {
                const { data } = await api.get(`/eligibility-rules/${activeSeason}`);
                setConfig(data);
            } catch (e) {
                if (e?.response?.status === 404) {
                    setConfig({
                        season: activeSeason,
                        residency_min_months: 3,
                        education_min_months_local: 3,
                        education_min_months_guest: 12,
                        guest_prior_years_min: 2,
                        age_of_majority_for_parent: 21,
                        medical_required_by_default: true,
                        updated_at: null,
                        updated_by: null,
                    });
                } else { throw e; }
            }
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    useEffect(() => { load(); }, [activeSeason]);

    const patchField = (k, v) => setConfig((c) => ({ ...c, [k]: v }));

    const save = async () => {
        setSaving(true); setErr(null); setOk(null);
        try {
            const payload = NUM_FIELDS.reduce((o, f) => ({ ...o, [f.key]: parseInt(config[f.key], 10) || 0 }), {});
            payload.medical_required_by_default = !!config.medical_required_by_default;
            const { data } = await api.patch(`/eligibility-rules/${activeSeason}`, payload);
            setConfig(data);
            setOk("Saved. Next Recompute uses these thresholds.");
            // Refresh season list so the newly-created season appears.
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const duplicateSeason = async () => {
        const target = window.prompt(`Duplicate rules from ${activeSeason} to which target season? (e.g. 2027-28)`);
        if (!target || !target.trim()) return;
        setSaving(true); setErr(null); setOk(null);
        try {
            await api.post("/eligibility-rules/duplicate", {
                source_season: activeSeason, target_season: target.trim(),
            });
            setOk(`Duplicated ${activeSeason} → ${target.trim()}. Switch to that season to edit.`);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    if (busy && !config) return (
        <div className="p-12 text-center text-mpca-brass"><Loader2 className="inline animate-spin" /> Loading rules…</div>
    );

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="eligibility-rules-admin">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">SysAdmin · Season-Scoped Configuration</div>
                    <h1 className="font-serif text-3xl text-mpca-green-dark">Player Eligibility Rules</h1>
                    <p className="text-sm text-mpca-gray-dark max-w-2xl mt-1">
                        These thresholds power the MPCA sequential eligibility decision tree.
                        Changes take effect the next time any player is recomputed. Edit here
                        instead of asking developers for a redeploy.
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <select
                        className="input-heritage !w-auto"
                        value={activeSeason}
                        onChange={(e) => setActiveSeason(e.target.value)}
                        data-testid="rules-season-select"
                    >
                        {[activeSeason, ...seasons.map((s) => s.season).filter((s) => s !== activeSeason), "2027-28"].filter((v, i, arr) => arr.indexOf(v) === i).map((s) => (
                            <option key={s} value={s}>Season {s}</option>
                        ))}
                    </select>
                    <button onClick={load} disabled={busy} className="text-[10px] uppercase tracking-widest border border-mpca-brass text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory px-3 py-1.5 inline-flex items-center gap-1 disabled:opacity-40" data-testid="rules-reload-btn">
                        <RefreshCw size={11} /> Reload
                    </button>
                    <button onClick={duplicateSeason} disabled={saving} className="text-[10px] uppercase tracking-widest border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory px-3 py-1.5 inline-flex items-center gap-1 disabled:opacity-40" data-testid="rules-duplicate-btn">
                        <Copy size={11} /> Duplicate for next season
                    </button>
                </div>
            </div>

            {err && <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/10 text-mpca-oxblood text-xs p-3" data-testid="rules-error"><AlertTriangle size={12} className="inline mr-1" /> {err}</div>}
            {ok && <div className="border border-mpca-green-dark/40 bg-mpca-green-dark/10 text-mpca-green-dark text-xs p-3" data-testid="rules-ok"><ShieldCheck size={12} className="inline mr-1" /> {ok}</div>}

            {/* Editable numeric thresholds */}
            {config && (
                <div className="bulletin-card p-0 overflow-hidden" data-testid="rules-thresholds-card">
                    <div className="bg-mpca-green-dark text-mpca-ivory px-4 py-3 border-b-4 border-mpca-oxblood">
                        <div className="overline !text-mpca-gold-light">Editable Thresholds · Season {activeSeason}</div>
                        <div className="font-serif text-lg mt-0.5">
                            {config.updated_at ? `Last saved ${new Date(config.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${config.updated_by ? ` · ${config.updated_by}` : ""}` : "Not yet saved — showing defaults."}
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 p-4">
                        {NUM_FIELDS.map((f) => (
                            <label key={f.key} className="block" data-testid={`rules-field-${f.key}`}>
                                <div className="overline text-[9px] mb-1">{f.label}</div>
                                <input
                                    type="number" min="0" max="120"
                                    className="input-heritage"
                                    value={config[f.key] ?? 0}
                                    onChange={(e) => patchField(f.key, e.target.value)}
                                    data-testid={`rules-input-${f.key}`}
                                />
                                <div className="text-[10px] text-mpca-gray-dark mt-1 italic">{f.hint}</div>
                            </label>
                        ))}
                        <label className="flex items-center gap-2 mt-2" data-testid="rules-field-medical">
                            <input
                                type="checkbox"
                                checked={!!config.medical_required_by_default}
                                onChange={(e) => patchField("medical_required_by_default", e.target.checked)}
                                data-testid="rules-input-medical"
                            />
                            <span className="text-sm text-mpca-green-dark">Medical fitness certificate required by default</span>
                        </label>
                    </div>
                    <div className="border-t border-mpca-brass/30 px-4 py-3 flex justify-end">
                        <button onClick={save} disabled={saving} className="btn-heritage-primary disabled:opacity-40 inline-flex items-center gap-1" data-testid="rules-save-btn">
                            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Rules
                        </button>
                    </div>
                </div>
            )}

            {/* Read-only tag catalog */}
            <div className="bulletin-card p-0 overflow-hidden" data-testid="rules-tags-card">
                <div className="bg-mpca-parchment px-4 py-3 border-b border-mpca-brass/30">
                    <div className="overline">Canonical Tags · Decision Tree Order</div>
                    <div className="font-serif text-mpca-green-dark mt-0.5">
                        The engine walks these tags top-to-bottom until one qualifies. The catalog itself is not editable — thresholds above shape each tag&apos;s outcome.
                    </div>
                </div>
                <table className="w-full text-xs" data-testid="rules-tags-table">
                    <thead className="bg-mpca-parchment/60 border-b border-mpca-brass/30">
                        <tr>
                            <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass w-8">#</th>
                            <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Tag</th>
                            <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Description</th>
                            <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Primary Check</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tags.map((t) => (
                            <tr key={t.code} className="border-t border-mpca-brass/10">
                                <td className="px-3 py-2 font-mono text-mpca-brass">{t.order}</td>
                                <td className="px-3 py-2 font-mono text-mpca-green-dark font-semibold">{t.code}</td>
                                <td className="px-3 py-2 text-mpca-gray-dark">{t.description}</td>
                                <td className="px-3 py-2 font-mono text-[10.5px] text-mpca-brass">{t.primary_check}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Season timeline */}
            {seasons.length > 0 && (
                <div className="bulletin-card p-0 overflow-hidden" data-testid="rules-history-card">
                    <div className="bg-mpca-parchment px-4 py-3 border-b border-mpca-brass/30">
                        <div className="overline">Rule Versions on File</div>
                    </div>
                    <table className="w-full text-xs">
                        <thead className="bg-mpca-parchment/60 border-b border-mpca-brass/30">
                            <tr>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Season</th>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Residency</th>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Edu · Local</th>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Edu · Guest</th>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Prior Play</th>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Medical</th>
                                <th className="text-left px-3 py-2 uppercase tracking-widest text-[9px] text-mpca-brass">Last Saved</th>
                            </tr>
                        </thead>
                        <tbody>
                            {seasons.map((s) => (
                                <tr key={s.id} className={"border-t border-mpca-brass/10 " + (s.season === activeSeason ? "bg-mpca-green-dark/5" : "")}>
                                    <td className="px-3 py-2 font-mono font-semibold">{s.season}</td>
                                    <td className="px-3 py-2 font-mono">{s.residency_min_months} mo</td>
                                    <td className="px-3 py-2 font-mono">{s.education_min_months_local} mo</td>
                                    <td className="px-3 py-2 font-mono">{s.education_min_months_guest} mo</td>
                                    <td className="px-3 py-2 font-mono">{s.guest_prior_years_min} yr</td>
                                    <td className="px-3 py-2 font-mono">{s.medical_required_by_default ? "required" : "optional"}</td>
                                    <td className="px-3 py-2 font-mono text-[10px] text-mpca-gray-dark">{s.updated_at ? new Date(s.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default EligibilityRulesAdmin;
