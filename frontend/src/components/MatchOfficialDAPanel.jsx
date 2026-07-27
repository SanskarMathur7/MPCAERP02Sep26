import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Upload, Send, Save, ShieldAlert, CheckCircle2, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * Sprint M36 · Rich DA Form Panel (mirrors MPCA T.A. & D.A. Claim Form / FMPCA 037)
 * ─────────────────────────────────────────────────────────────────────────────────
 * Renders the 8-section physical form:
 *   1. Header (auto-filled from Match Official profile)
 *   2. Travel Fare (multi-leg segments with ticket uploads)
 *   3. Journey Expenses (₹300 × ceil(hours/12))
 *   4. DA (days × rate, date range)
 *   5. Conveyance Allowance (rate × count)
 *   6. Incidental Charges (rate × days)
 *   7. Night Halt (place + amount + hotel bill upload)
 *   8. Misc Expenses (per-line items + optional receipts)
 * Plus overflow attachment bucket. Server recomputes all derived totals on
 * every PATCH so no arithmetic trust needed here.
 *
 * Props:
 *   tournamentId (string, required)
 *   readOnly (bool)          — force viewer mode even for own draft
 *   viewerBadges (bool)      — show scheme-breach ⚠️ badges (for MPCA/Division)
 *   onChange (fn)            — parent callback on save/submit
 */
const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const emptySeg = () => ({ from_place: "", to_place: "", fare_class: "III_AC", one_way_fare_inr: 0, both_ways_amount_inr: 0, ticket_url: "" });
const emptyMisc = () => ({ description: "", amount_inr: 0, receipt_url: "" });

const FARE_CLASSES = ["III_AC", "II_AC", "I_AC", "Sleeper", "Chair_Car", "Air", "Bus", "Own_Vehicle"];

const MatchOfficialDAPanel = ({ tournamentId, formId: formIdProp, readOnly = false, viewerBadges = false, onChange }) => {
    const { persona } = useAuth();
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(null);      // key currently uploading

    const isMatchOfficial = persona?.id === "match-official";
    const canEdit = !readOnly && isMatchOfficial && (form?.status === "Draft" || form?.status === "Rejected");

    // ── Load or self-create the DA form ──
    const bootstrap = async () => {
        setLoading(true); setErr("");
        try {
            let doc = null;
            if (formIdProp) {
                const { data } = await api.get(`/match-official-da/${formIdProp}`);
                doc = data;
            } else if (isMatchOfficial && tournamentId) {
                const { data } = await api.post(
                    "/match-official-da/self-create",
                    null,
                    { params: { tournament_id: tournamentId, official_name: persona?.name } },
                );
                doc = data;
            } else if (tournamentId) {
                // MPCA/Division landing on the panel without a specific formId — take the first form.
                const { data } = await api.get(`/match-official-da`, { params: { tournament_id: tournamentId } });
                doc = (data || [])[0];
                if (!doc) { setErr("No DA forms yet for this tournament."); setLoading(false); return; }
            }
            setForm(doc);
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally { setLoading(false); }
    };
    useEffect(() => { bootstrap(); /* eslint-disable-next-line */ }, [tournamentId, formIdProp, persona?.name]);

    // Field editor (local optimistic update — server truth returned on save)
    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // Compute previews locally for immediate UX (server is source of truth on save)
    const preview = useMemo(() => {
        if (!form) return null;
        const travel = (form.travel_segments || []).reduce((s, x) => s + (Number(x.both_ways_amount_inr) || 0), 0);
        const jUnits = form.journey_hours > 0 ? Math.ceil(Number(form.journey_hours) / 12) : 0;
        const journey = jUnits * (Number(form.journey_rate_per_12h_inr) || 300);
        const da = (Number(form.days) || 0) * (Number(form.da_rate_inr) || 0);
        const conv = (Number(form.conveyance_rate_inr) || 0) * (Number(form.conveyance_count) || 0);
        const inc = (Number(form.incidental_rate_inr) || 0) * (Number(form.incidental_days) || 0);
        const misc = (form.misc_items || []).reduce((s, x) => s + (Number(x.amount_inr) || 0), 0);
        const nh = Number(form.night_halt_amount_inr) || 0;
        return { travel, journey, da, conv, inc, misc, nh, total: travel + journey + da + conv + inc + misc + nh };
    }, [form]);

    // ── Upload helper ──
    const upload = async (key, file, onUrl) => {
        if (!file) return;
        setUploading(key);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("related_type", "match_official_da");
            const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
            onUrl(data.url);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setUploading(null); }
    };

    const save = async () => {
        if (!form) return;
        setSaving(true);
        try {
            const patch = {
                place_of_visit: form.place_of_visit || null,
                purpose_of_visit: form.purpose_of_visit || null,
                travel_segments: (form.travel_segments || []).map((s) => ({
                    ...s,
                    one_way_fare_inr: Number(s.one_way_fare_inr) || 0,
                    both_ways_amount_inr: Number(s.both_ways_amount_inr) || 0,
                })),
                journey_hours: Number(form.journey_hours) || 0,
                journey_rate_per_12h_inr: Number(form.journey_rate_per_12h_inr) || 300,
                days: Number(form.days) || 0,
                da_rate_inr: Number(form.da_rate_inr) || 0,
                da_date_from: form.da_date_from || null,
                da_date_to: form.da_date_to || null,
                conveyance_rate_inr: Number(form.conveyance_rate_inr) || 0,
                conveyance_count: Number(form.conveyance_count) || 0,
                incidental_rate_inr: Number(form.incidental_rate_inr) || 0,
                incidental_days: Number(form.incidental_days) || 0,
                night_halt_place: form.night_halt_place || null,
                night_halt_amount_inr: Number(form.night_halt_amount_inr) || 0,
                night_halt_bill_url: form.night_halt_bill_url || null,
                misc_items: (form.misc_items || []).map((m) => ({
                    ...m, amount_inr: Number(m.amount_inr) || 0,
                })),
                attachments: form.attachments || [],
                bank_account_no: form.bank_account_no || null,
                bank_ifsc: form.bank_ifsc || null,
                pan: form.pan || null,
                notes: form.notes || null,
            };
            const { data } = await api.patch(`/match-official-da/${form.id}`, patch);
            setForm(data);
            onChange && onChange();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    const submitForm = async () => {
        if (!window.confirm("Submit this DA form? You cannot edit after submission.")) return;
        setSubmitting(true);
        try {
            await save();                                    // persist latest edits first
            const { data } = await api.post(`/match-official-da/${form.id}/submit`);
            setForm(data);
            onChange && onChange();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setSubmitting(false); }
    };

    if (loading) return <div className="p-6 flex items-center gap-2 text-mpca-brass text-xs"><Loader2 size={14} className="animate-spin" /> Loading DA form…</div>;
    if (err) return <div className="p-6 border border-mpca-oxblood/30 bg-mpca-oxblood/5 text-mpca-oxblood text-xs" data-testid="da-panel-error">{err}</div>;
    if (!form) return null;

    // Compliance flags map (only shown in viewerBadges mode)
    const flagsByField = {};
    for (const f of form.compliance_flags || []) flagsByField[f.field] = f;

    return (
        <div className="bulletin-card p-6 space-y-6" data-testid="da-form-panel">
            {/* ── Header ── */}
            <div className="border-b-2 border-mpca-oxblood pb-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="overline text-[9px]">Madhya Pradesh Cricket Association · FMPCA 037</div>
                        <div className="font-serif text-2xl text-mpca-green-dark">T.A. & D.A. Claim Form</div>
                        <div className="text-[10px] text-mpca-gray-dark mt-0.5 italic">Applicable for Selector, Office Bearer and Others including service providers</div>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-[10px] text-mpca-brass">{form.da_ref}</div>
                        <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 border mt-1 ${form.status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" : form.status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" : form.status === "Submitted" ? "border-mpca-brass text-mpca-brass" : form.status === "Paid" ? "border-mpca-green-dark bg-mpca-green-dark text-mpca-ivory" : "border-mpca-gray-dark text-mpca-gray-dark"}`} data-testid="da-status-pill">
                            {form.status}
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <ReadRow label="Name" value={form.official_name} />
                    <ReadRow label="Designation" value={form.official_role} />
                    <ReadRow label="Association / Division" value={form.association_division || form.body_id} />
                    <ReadRow label="Phone" value={form.official_phone || "—"} />
                    <Editable label="Place of visit" value={form.place_of_visit || ""} onChange={(v) => setField("place_of_visit", v)} disabled={!canEdit} testId="da-place-of-visit" />
                    <Editable label="Purpose of visit" value={form.purpose_of_visit || ""} onChange={(v) => setField("purpose_of_visit", v)} disabled={!canEdit} testId="da-purpose" />
                </div>
            </div>

            {/* ── Scheme compliance banner (viewer mode only) ── */}
            {viewerBadges && form.status !== "Draft" && (form.compliance_flags || []).length > 0 && (
                <div className="border-2 border-mpca-brass bg-mpca-gold-light/20 p-3 flex items-start gap-2" data-testid="da-compliance-banner">
                    <ShieldAlert size={16} className="text-mpca-brass mt-0.5 shrink-0" />
                    <div className="text-[11px] text-mpca-green-dark">
                        <b>Scheme review · {(form.compliance_flags || []).length} advisory flag(s):</b>
                        <ul className="mt-1 space-y-0.5 list-disc list-inside">
                            {(form.compliance_flags || []).map((f, i) => (
                                <li key={i} className="text-mpca-oxblood">{f.note}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* ── 1) Travel Fare (segments) ── */}
            <Section title="Travel Fare · Air / A.C. Fare / Bus Fare (attach tickets)" testId="da-sec-travel">
                <div className="space-y-2">
                    {(form.travel_segments || []).map((s, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center border border-mpca-brass/20 p-2 bg-mpca-parchment/50" data-testid={`da-seg-${i}`}>
                            <Inp className="col-span-3" placeholder="From" value={s.from_place} onChange={(v) => updateSeg(setForm, i, "from_place", v)} disabled={!canEdit} testId={`da-seg-from-${i}`} />
                            <Inp className="col-span-3" placeholder="To" value={s.to_place} onChange={(v) => updateSeg(setForm, i, "to_place", v)} disabled={!canEdit} testId={`da-seg-to-${i}`} />
                            <Sel className="col-span-2" value={s.fare_class} options={FARE_CLASSES} onChange={(v) => updateSeg(setForm, i, "fare_class", v)} disabled={!canEdit} testId={`da-seg-class-${i}`} />
                            <Inp className="col-span-2" placeholder="Both-ways ₹" type="number" value={s.both_ways_amount_inr} onChange={(v) => updateSeg(setForm, i, "both_ways_amount_inr", v)} disabled={!canEdit} testId={`da-seg-amt-${i}`} />
                            <div className="col-span-2 flex items-center gap-1">
                                {s.ticket_url ? (
                                    <a href={s.ticket_url} target="_blank" rel="noreferrer" className="text-[10px] text-mpca-oxblood underline flex items-center gap-1"><FileText size={10} /> ticket</a>
                                ) : canEdit ? (
                                    <label className="text-[10px] text-mpca-brass cursor-pointer flex items-center gap-1">
                                        <Upload size={10} /> ticket
                                        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload(`seg-${i}`, e.target.files?.[0], (url) => updateSeg(setForm, i, "ticket_url", url))} />
                                    </label>
                                ) : <span className="text-[10px] text-mpca-gray-dark">—</span>}
                                {uploading === `seg-${i}` && <Loader2 size={10} className="animate-spin" />}
                                {canEdit && (
                                    <button type="button" onClick={() => setForm((f) => ({ ...f, travel_segments: f.travel_segments.filter((_, ix) => ix !== i) }))} className="text-mpca-oxblood ml-auto"><Trash2 size={11} /></button>
                                )}
                            </div>
                        </div>
                    ))}
                    {canEdit && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, travel_segments: [...(f.travel_segments || []), emptySeg()] }))} className="text-[11px] text-mpca-oxblood flex items-center gap-1" data-testid="da-add-seg">
                            <Plus size={12} /> Add travel leg
                        </button>
                    )}
                    <div className="text-right text-[11px] text-mpca-brass">Sub-total (Travel): <b className="font-mono text-mpca-green-dark ml-2" data-testid="da-travel-total">{fmt(preview.travel)}</b></div>
                </div>
            </Section>

            {/* ── 2) Journey Expenses ── */}
            <Section title="Journey Expenses (₹300 per every 12 hrs or part thereof)" testId="da-sec-journey">
                <Grid>
                    <NumField label="Total travel hours" value={form.journey_hours} onChange={(v) => setField("journey_hours", v)} disabled={!canEdit} testId="da-journey-hours" />
                    <NumField label="Rate per 12 hrs (₹)" value={form.journey_rate_per_12h_inr} onChange={(v) => setField("journey_rate_per_12h_inr", v)} disabled={!canEdit} testId="da-journey-rate" flag={viewerBadges && flagsByField.journey_rate_per_12h_inr} />
                    <Computed label="Journey amount" value={preview.journey} testId="da-journey-amt" />
                </Grid>
            </Section>

            {/* ── 3) DA (days × rate) ── */}
            <Section title="Daily Allowance" testId="da-sec-da">
                <Grid>
                    <NumField label="Days" value={form.days} onChange={(v) => setField("days", v)} disabled={!canEdit} testId="da-days" />
                    <NumField label="Rate / day (₹)" value={form.da_rate_inr} onChange={(v) => setField("da_rate_inr", v)} disabled={!canEdit} testId="da-rate" flag={viewerBadges && flagsByField.da_rate_inr} />
                    <Computed label="DA amount" value={preview.da} testId="da-amount" />
                    <DateField label="Date from" value={form.da_date_from} onChange={(v) => setField("da_date_from", v)} disabled={!canEdit} testId="da-date-from" />
                    <DateField label="Date to" value={form.da_date_to} onChange={(v) => setField("da_date_to", v)} disabled={!canEdit} testId="da-date-to" />
                </Grid>
            </Section>

            {/* ── 4) Conveyance ── */}
            <Section title="Conveyance Allowance" testId="da-sec-conv">
                <Grid>
                    <NumField label="Rate per trip (₹)" value={form.conveyance_rate_inr} onChange={(v) => setField("conveyance_rate_inr", v)} disabled={!canEdit} testId="da-conv-rate" />
                    <NumField label="No. of trips" value={form.conveyance_count} onChange={(v) => setField("conveyance_count", v)} disabled={!canEdit} testId="da-conv-count" />
                    <Computed label="Conveyance amount" value={preview.conv} testId="da-conv-amt" />
                </Grid>
            </Section>

            {/* ── 5) Incidental ── */}
            <Section title="Incidental Charges" testId="da-sec-inc">
                <Grid>
                    <NumField label="Rate / day (₹)" value={form.incidental_rate_inr} onChange={(v) => setField("incidental_rate_inr", v)} disabled={!canEdit} testId="da-inc-rate" />
                    <NumField label="Days" value={form.incidental_days} onChange={(v) => setField("incidental_days", v)} disabled={!canEdit} testId="da-inc-days" />
                    <Computed label="Incidental amount" value={preview.inc} testId="da-inc-amt" />
                </Grid>
            </Section>

            {/* ── 6) Night Halt ── */}
            <Section title="Night Halt (attach hotel bill)" testId="da-sec-nh">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <Editable label="Place" value={form.night_halt_place || ""} onChange={(v) => setField("night_halt_place", v)} disabled={!canEdit} testId="da-nh-place" />
                    <NumField label="Amount (₹)" value={form.night_halt_amount_inr} onChange={(v) => setField("night_halt_amount_inr", v)} disabled={!canEdit} testId="da-nh-amt" flag={viewerBadges && flagsByField.night_halt_amount_inr} />
                    <div>
                        <div className="overline text-[9px] mb-1">Hotel bill</div>
                        {form.night_halt_bill_url ? (
                            <div className="flex items-center gap-2 text-[11px]"><a href={form.night_halt_bill_url} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline">Uploaded ✓</a>{canEdit && <button className="text-[9px] uppercase text-mpca-brass" onClick={() => setField("night_halt_bill_url", "")}>Remove</button>}</div>
                        ) : canEdit ? (
                            <label className="text-[11px] text-mpca-brass cursor-pointer flex items-center gap-1"><Upload size={11} /> Upload<input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload("nh-bill", e.target.files?.[0], (url) => setField("night_halt_bill_url", url))} /></label>
                        ) : <span className="text-[11px] text-mpca-gray-dark">—</span>}
                        {uploading === "nh-bill" && <Loader2 size={11} className="animate-spin" />}
                    </div>
                </div>
            </Section>

            {/* ── 7) Misc Expenses ── */}
            <Section title="Misc. Expenses (per-line)" testId="da-sec-misc">
                <div className="space-y-2">
                    {(form.misc_items || []).map((m, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center border border-mpca-brass/20 p-2 bg-mpca-parchment/50" data-testid={`da-misc-${i}`}>
                            <Inp className="col-span-6" placeholder="Description (e.g. Ticket Agent Charge 300×2)" value={m.description} onChange={(v) => updateMisc(setForm, i, "description", v)} disabled={!canEdit} testId={`da-misc-desc-${i}`} />
                            <Inp className="col-span-2" placeholder="Amount ₹" type="number" value={m.amount_inr} onChange={(v) => updateMisc(setForm, i, "amount_inr", v)} disabled={!canEdit} testId={`da-misc-amt-${i}`} />
                            <div className="col-span-3 flex items-center gap-1">
                                {m.receipt_url ? (
                                    <a href={m.receipt_url} target="_blank" rel="noreferrer" className="text-[10px] text-mpca-oxblood underline flex items-center gap-1"><FileText size={10} /> receipt</a>
                                ) : canEdit ? (
                                    <label className="text-[10px] text-mpca-brass cursor-pointer flex items-center gap-1"><Upload size={10} /> receipt<input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload(`misc-${i}`, e.target.files?.[0], (url) => updateMisc(setForm, i, "receipt_url", url))} /></label>
                                ) : <span className="text-[10px] text-mpca-gray-dark">—</span>}
                                {uploading === `misc-${i}` && <Loader2 size={10} className="animate-spin" />}
                            </div>
                            <div className="col-span-1 flex justify-end">
                                {canEdit && <button type="button" onClick={() => setForm((f) => ({ ...f, misc_items: f.misc_items.filter((_, ix) => ix !== i) }))} className="text-mpca-oxblood"><Trash2 size={11} /></button>}
                            </div>
                        </div>
                    ))}
                    {canEdit && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, misc_items: [...(f.misc_items || []), emptyMisc()] }))} className="text-[11px] text-mpca-oxblood flex items-center gap-1" data-testid="da-add-misc"><Plus size={12} /> Add misc line</button>
                    )}
                    <div className="text-right text-[11px] text-mpca-brass">Sub-total (Misc): <b className="font-mono text-mpca-green-dark ml-2" data-testid="da-misc-total">{fmt(preview.misc)}</b></div>
                </div>
            </Section>

            {/* ── Overflow attachments ── */}
            <Section title="Additional Supporting Documents (overflow bucket)" testId="da-sec-attach">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(form.attachments || []).map((a, i) => (
                        <div key={i} className="border border-mpca-brass/20 p-2 flex items-center gap-2 bg-mpca-parchment/50" data-testid={`da-attach-${i}`}>
                            <Inp className="flex-1" placeholder="Label" value={a.label} onChange={(v) => updateAttach(setForm, i, "label", v)} disabled={!canEdit} />
                            {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-[10px] text-mpca-oxblood underline">open</a> :
                                canEdit ? <label className="text-[10px] text-mpca-brass cursor-pointer flex items-center gap-1"><Upload size={10} /> Upload<input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload(`attach-${i}`, e.target.files?.[0], (url) => updateAttach(setForm, i, "url", url))} /></label> : null}
                            {canEdit && <button type="button" onClick={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, ix) => ix !== i) }))} className="text-mpca-oxblood"><Trash2 size={11} /></button>}
                        </div>
                    ))}
                    {canEdit && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, attachments: [...(f.attachments || []), { label: "", url: "" }] }))} className="text-[11px] text-mpca-oxblood flex items-center gap-1 border border-dashed border-mpca-brass/40 p-2" data-testid="da-add-attach"><Plus size={12} /> Add supporting doc</button>
                    )}
                </div>
            </Section>

            {/* ── Bank + PAN ── */}
            <Section title="Bank Details (for DA credit)" testId="da-sec-bank">
                <Grid>
                    <Editable label="Bank Account No." value={form.bank_account_no || ""} onChange={(v) => setField("bank_account_no", v)} disabled={!canEdit} testId="da-bank-acc" mono />
                    <Editable label="IFSC" value={form.bank_ifsc || ""} onChange={(v) => setField("bank_ifsc", v)} disabled={!canEdit} testId="da-bank-ifsc" mono />
                    <Editable label="PAN" value={form.pan || ""} onChange={(v) => setField("pan", v)} disabled={!canEdit} testId="da-pan" mono />
                </Grid>
            </Section>

            {/* ── Grand Total ── */}
            <div className="border-t-4 border-mpca-oxblood pt-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="overline text-[10px]">Total (Auto-computed)</div>
                    <div className="font-serif text-4xl text-mpca-oxblood" data-testid="da-grand-total">{fmt(preview.total)}</div>
                    {form.total_in_words && <div className="text-[10px] italic text-mpca-gray-dark mt-1">In words · {form.total_in_words}</div>}
                </div>
                <div className="flex gap-2">
                    {canEdit && (
                        <>
                            <button className="btn-heritage-secondary" onClick={save} disabled={saving} data-testid="da-save-btn">
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Draft
                            </button>
                            <button className="btn-heritage-primary" onClick={submitForm} disabled={submitting || preview.total <= 0} data-testid="da-submit-btn">
                                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Submit to MPCA / Division
                            </button>
                        </>
                    )}
                    {form.status === "Submitted" && (
                        <div className="text-[11px] text-mpca-brass italic flex items-center gap-1"><CheckCircle2 size={12} /> Submitted · awaiting approval</div>
                    )}
                    {form.status === "Rejected" && form.rejection_reason && (
                        <div className="text-[11px] text-mpca-oxblood italic max-w-md">Rejected · {form.rejection_reason}</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ────────────────────── Sub-components ──────────────────────
const Section = ({ title, testId, children }) => (
    <div data-testid={testId}>
        <div className="overline text-[10px] mb-2">{title}</div>
        {children}
    </div>
);
const Grid = ({ children }) => <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>;
const ReadRow = ({ label, value }) => (
    <div>
        <div className="overline text-[9px] mb-0.5">{label}</div>
        <div className="text-[12px] text-mpca-green-dark font-serif">{value || "—"}</div>
    </div>
);
const Editable = ({ label, value, onChange, disabled, testId, mono = false }) => (
    <label className="block">
        <div className="overline text-[9px] mb-1">{label}</div>
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`input-heritage !py-1.5 !text-xs ${mono ? "font-mono" : ""} disabled:bg-mpca-parchment/50 disabled:cursor-not-allowed`} data-testid={testId} />
    </label>
);
const NumField = ({ label, value, onChange, disabled, testId, flag = null }) => (
    <label className="block">
        <div className="overline text-[9px] mb-1 flex items-center justify-between">
            <span>{label}</span>
            {flag && <span className="text-[9px] text-mpca-oxblood normal-case tracking-normal font-serif" data-testid={`${testId}-flag`}>⚠ over scheme</span>}
        </div>
        <input type="number" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`input-heritage !py-1.5 !text-xs font-mono ${flag ? "!border-mpca-oxblood" : ""} disabled:bg-mpca-parchment/50 disabled:cursor-not-allowed`} data-testid={testId} />
    </label>
);
const DateField = ({ label, value, onChange, disabled, testId }) => (
    <label className="block">
        <div className="overline text-[9px] mb-1">{label}</div>
        <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="input-heritage !py-1.5 !text-xs disabled:bg-mpca-parchment/50 disabled:cursor-not-allowed" data-testid={testId} />
    </label>
);
const Computed = ({ label, value, testId }) => (
    <div>
        <div className="overline text-[9px] mb-1">{label}</div>
        <div className="input-heritage !py-1.5 !text-xs font-mono bg-mpca-parchment/70 text-mpca-green-dark" data-testid={testId}>{`₹${Math.round(value || 0).toLocaleString("en-IN")}`}</div>
    </div>
);
const Inp = ({ className = "", value, onChange, disabled, placeholder, type = "text", testId }) => (
    <input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`input-heritage !py-1.5 !text-xs disabled:bg-mpca-parchment/50 disabled:cursor-not-allowed ${className}`} data-testid={testId} />
);
const Sel = ({ className = "", value, options, onChange, disabled, testId }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`input-heritage !py-1.5 !text-xs disabled:bg-mpca-parchment/50 ${className}`} data-testid={testId}>
        {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
    </select>
);

const updateSeg = (setForm, i, k, v) => setForm((f) => ({
    ...f,
    travel_segments: (f.travel_segments || []).map((s, ix) => ix === i ? { ...s, [k]: v } : s),
}));
const updateMisc = (setForm, i, k, v) => setForm((f) => ({
    ...f,
    misc_items: (f.misc_items || []).map((s, ix) => ix === i ? { ...s, [k]: v } : s),
}));
const updateAttach = (setForm, i, k, v) => setForm((f) => ({
    ...f,
    attachments: (f.attachments || []).map((s, ix) => ix === i ? { ...s, [k]: v } : s),
}));

export default MatchOfficialDAPanel;
