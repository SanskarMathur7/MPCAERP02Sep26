import { useEffect, useMemo, useState } from "react";
import {
    Loader2, Plus, Trash2, Upload, Save, ShieldAlert, CheckCircle2,
    FileText, Plane, Clock3, Bike, Coffee, BedDouble, Receipt, Paperclip,
    Landmark, ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWiringStep } from "@/lib/useWiring";

/**
 * MPCA-234 · Redesigned T.A. Expense Claim Form
 * ────────────────────────────────────────────────
 * A cleaner, larger-font, card-per-head UI. Sections:
 *   1. Travel Fare (multi-leg with e-tickets)
 *   2. Journey Expenses (₹300 × ceil(hours/12))
 *   3. Conveyance (rate × count)
 *   4. Incidental (rate × days)
 *   5. Night Halt (place + amount + hotel bill)
 *   6. Misc / Other (per-line receipts)
 *   7. Additional supporting docs
 *   8. Bank Details
 *
 * DA / Match Fee are shown as a read-only strip at the top since they're
 * pre-computed from the Master Rate Card × assigned days (see Budget
 * Allocated card on the parent finance page).
 *
 * Props:
 *   tournamentId (string, required)
 *   readOnly (bool)          — force viewer mode
 *   viewerBadges (bool)      — show scheme-breach ⚠ badges for MPCA reviewers
 *   onChange (fn)            — parent callback on save/submit
 */
const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const emptySeg = () => ({ from_place: "", to_place: "", fare_class: "III_AC", one_way_fare_inr: 0, both_ways_amount_inr: 0, ticket_url: "" });
const emptyMisc = () => ({ description: "", amount_inr: 0, receipt_url: "" });
const FARE_CLASSES = ["III_AC", "II_AC", "I_AC", "Sleeper", "Chair_Car", "Air", "Bus", "Own_Vehicle"];

// ────────────────────── Small primitives ──────────────────────
const Label = ({ children, required = false }) => (
    <div className="text-[11px] uppercase tracking-widest text-mpca-brass font-semibold mb-1.5">
        {children}{required && <span className="text-mpca-oxblood ml-0.5">*</span>}
    </div>
);

const TextInput = ({ value, onChange, disabled, placeholder, type = "text", mono = false, testId, className = "" }) => (
    <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full px-3 py-2 text-sm bg-mpca-ivory border border-mpca-brass/30 focus:border-mpca-oxblood focus:outline-none disabled:bg-mpca-parchment/40 disabled:cursor-not-allowed text-mpca-charcoal placeholder:text-mpca-brass/50 ${mono ? "font-mono" : ""} ${className}`}
        data-testid={testId}
    />
);

const NumInput = (props) => <TextInput {...props} type="number" mono />;

const ComputedField = ({ value, testId }) => (
    <div className="w-full px-3 py-2 text-sm font-mono bg-mpca-green-dark/8 border border-mpca-green-dark/40 text-mpca-green-dark font-semibold" data-testid={testId}>
        {fmt(value)}
    </div>
);

const SectionCard = ({ icon: Icon, title, subtitle, subtotal, subtotalTestId, children, testId }) => (
    <div className="border border-mpca-brass/30 bg-mpca-ivory" data-testid={testId}>
        <div className="flex items-center justify-between px-4 py-3 bg-mpca-navy border-b border-mpca-brass/30">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-mpca-gold-light/20 border border-mpca-gold-light/40 flex items-center justify-center">
                    <Icon size={16} className="text-mpca-gold-light" />
                </div>
                <div>
                    <div className="font-serif text-mpca-ivory text-base leading-tight">{title}</div>
                    {subtitle && <div className="text-[10px] text-mpca-gold-light/70 italic mt-0.5">{subtitle}</div>}
                </div>
            </div>
            {subtotal !== undefined && (
                <div className="text-right">
                    <div className="text-[9px] uppercase tracking-widest text-mpca-gold-light/70">Sub-total</div>
                    <div className="font-mono text-mpca-gold-light text-base font-semibold" data-testid={subtotalTestId}>{fmt(subtotal)}</div>
                </div>
            )}
        </div>
        <div className="p-4">{children}</div>
    </div>
);

const StatusPill = ({ status }) => {
    const cls =
        status === "Approved" ? "bg-mpca-green-dark text-mpca-ivory"
        : status === "Rejected" ? "bg-mpca-oxblood text-mpca-ivory"
        : status === "Submitted" ? "bg-mpca-brass text-mpca-ivory"
        : status === "Paid" ? "bg-mpca-navy text-mpca-ivory"
        : "bg-mpca-parchment text-mpca-gray-dark border border-mpca-brass/30";
    return <span className={`text-[10px] font-mono uppercase tracking-widest px-3 py-1 ${cls}`} data-testid="da-status-pill">{status}</span>;
};

// ────────────────────── Main component ──────────────────────
const MatchOfficialDAPanel = ({ tournamentId, formId: formIdProp, readOnly = false, viewerBadges = false, onChange }) => {
    // MPCA-243 · Ship 2 · Copy for "awaiting review" is wiring-driven —
    // finance_console.approver tells us who reviews (MPCA vs Division).
    const financeStep = useWiringStep(tournamentId, "finance_console");
    const reviewer = financeStep?.approver && financeStep.approver !== "None"
        ? financeStep.approver
        : "MPCA";
    const { persona } = useAuth();
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(null);

    const isMatchOfficial = persona?.role_id === "match_official" || persona?.id === "match-official";
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
                const { data } = await api.get(`/match-official-da`, { params: { tournament_id: tournamentId } });
                doc = (data || [])[0];
                if (!doc) { setErr("No DA forms yet for this tournament."); setLoading(false); return; }
            }
            setForm(doc);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { bootstrap(); /* eslint-disable-next-line */ }, [tournamentId, formIdProp, persona?.name]);

    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // Local live preview — server is truth on save
    const preview = useMemo(() => {
        if (!form) return null;
        const travel = (form.travel_segments || []).reduce((s, x) => s + (Number(x.both_ways_amount_inr) || 0), 0);
        const jUnits = form.journey_hours > 0 ? Math.ceil(Number(form.journey_hours) / 12) : 0;
        const journey = jUnits * (Number(form.journey_rate_per_12h_inr) || 300);
        const fee = (Number(form.scheduled_days) || 0) * (Number(form.match_fee_rate_inr) || 0);
        const da = (Number(form.played_days) || 0) * (Number(form.da_rate_inr) || 0);
        const conv = (Number(form.conveyance_rate_inr) || 0) * (Number(form.conveyance_count) || 0);
        const inc = (Number(form.incidental_rate_inr) || 0) * (Number(form.incidental_days) || 0);
        const misc = (form.misc_items || []).reduce((s, x) => s + (Number(x.amount_inr) || 0), 0);
        const nh = Number(form.night_halt_amount_inr) || 0;
        return { travel, journey, fee, da, conv, inc, misc, nh, total: travel + journey + fee + da + conv + inc + misc + nh };
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
                conveyance_rate_inr: Number(form.conveyance_rate_inr) || 0,
                conveyance_count: Number(form.conveyance_count) || 0,
                incidental_rate_inr: Number(form.incidental_rate_inr) || 0,
                incidental_days: Number(form.incidental_days) || 0,
                night_halt_place: form.night_halt_place || null,
                night_halt_amount_inr: Number(form.night_halt_amount_inr) || 0,
                night_halt_bill_url: form.night_halt_bill_url || null,
                misc_items: (form.misc_items || []).map((m) => ({ ...m, amount_inr: Number(m.amount_inr) || 0 })),
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

    if (loading) return <div className="p-8 flex items-center gap-2 text-mpca-brass text-sm"><Loader2 size={16} className="animate-spin" /> Loading claim form…</div>;
    if (err) return <div className="p-6 border border-mpca-oxblood/30 bg-mpca-oxblood/5 text-mpca-oxblood text-sm" data-testid="da-panel-error">{err}</div>;
    if (!form) return null;

    // Compliance flags map for viewer mode
    const flagsByField = {};
    for (const f of form.compliance_flags || []) flagsByField[f.field] = f;

    return (
        <div className="space-y-5" data-testid="da-form-panel">
            {/* Compact identity strip */}
            <div className="border border-mpca-brass/30 bg-mpca-parchment/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-brass mr-1.5">Ref</span>
                        <span className="font-mono text-mpca-green-dark font-semibold">{form.da_ref}</span>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-brass mr-1.5">Name</span>
                        <span className="font-serif text-mpca-charcoal">{form.official_name}</span>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-brass mr-1.5">Role</span>
                        <span className="font-serif text-mpca-charcoal">{form.official_role}</span>
                    </div>
                </div>
                <StatusPill status={form.status} />
            </div>

            {/* Fee + DA · read-only strip · already computed from Master Rate Card */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="border-l-4 border-l-mpca-brass bg-mpca-ivory p-3">
                    <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-1">Match Fee (auto)</div>
                    <div className="font-mono text-xl text-mpca-charcoal font-semibold">{fmt(form.match_fee_amount_inr || preview.fee)}</div>
                    <div className="text-[10px] text-mpca-gray-dark italic mt-0.5">{form.scheduled_days || 0} scheduled day(s) × {fmt(form.match_fee_rate_inr)}/day</div>
                </div>
                <div className="border-l-4 border-l-mpca-oxblood bg-mpca-ivory p-3">
                    <div className="text-[10px] uppercase tracking-widest text-mpca-oxblood mb-1">Daily Allowance (auto)</div>
                    <div className="font-mono text-xl text-mpca-charcoal font-semibold">{fmt(form.da_amount_inr || preview.da)}</div>
                    <div className="text-[10px] text-mpca-gray-dark italic mt-0.5">{form.played_days || 0} played day(s) × {fmt(form.da_rate_inr)}/day</div>
                </div>
                <div className="border-l-4 border-l-mpca-green-dark bg-mpca-green-dark/5 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-mpca-green-dark mb-1">Your Grand Total</div>
                    <div className="font-mono text-2xl text-mpca-green-dark font-bold" data-testid="da-grand-total">{fmt(preview.total)}</div>
                    <div className="text-[10px] text-mpca-gray-dark italic mt-0.5">Fee + DA + Travel + all expenses below</div>
                </div>
            </div>

            {/* Compliance banner (viewer mode) */}
            {viewerBadges && form.status !== "Draft" && (form.compliance_flags || []).length > 0 && (
                <div className="border-2 border-mpca-brass bg-mpca-gold-light/20 p-4 flex items-start gap-3" data-testid="da-compliance-banner">
                    <ShieldAlert size={18} className="text-mpca-brass mt-0.5 shrink-0" />
                    <div className="text-sm text-mpca-green-dark">
                        <b>MPCA Review · {(form.compliance_flags || []).length} advisory flag(s):</b>
                        <ul className="mt-1 space-y-0.5 list-disc list-inside text-mpca-oxblood">
                            {(form.compliance_flags || []).map((f, i) => <li key={i}>{f.note}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            {/* Trip context */}
            <SectionCard icon={FileText} title="Trip Context" subtitle="Where and why you travelled" testId="da-sec-context">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Place of Visit</Label>
                        <TextInput value={form.place_of_visit || ""} onChange={(v) => setField("place_of_visit", v)} disabled={!canEdit} placeholder="e.g. Bhopal + Indore" testId="da-place-of-visit" />
                    </div>
                    <div>
                        <Label>Purpose of Visit</Label>
                        <TextInput value={form.purpose_of_visit || ""} onChange={(v) => setField("purpose_of_visit", v)} disabled={!canEdit} placeholder="e.g. Umpire for League matches" testId="da-purpose" />
                    </div>
                </div>
            </SectionCard>

            {/* 1) Travel Fare */}
            <SectionCard icon={Plane} title="Travel Fare" subtitle="Air / A.C. / Bus fare · attach ticket for each leg" subtotal={preview.travel} subtotalTestId="da-travel-total" testId="da-sec-travel">
                <div className="space-y-3">
                    {(form.travel_segments || []).length === 0 && !canEdit && (
                        <div className="text-center italic text-sm text-mpca-gray-dark py-2">No travel legs added.</div>
                    )}
                    {(form.travel_segments || []).map((s, i) => (
                        <div key={i} className="grid grid-cols-12 gap-3 items-end p-3 bg-mpca-parchment/40 border border-mpca-brass/20" data-testid={`da-seg-${i}`}>
                            <div className="col-span-12 md:col-span-3">
                                <Label>From</Label>
                                <TextInput value={s.from_place} onChange={(v) => updateSeg(setForm, i, "from_place", v)} disabled={!canEdit} placeholder="Bhopal" testId={`da-seg-from-${i}`} />
                            </div>
                            <div className="col-span-12 md:col-span-3">
                                <Label>To</Label>
                                <TextInput value={s.to_place} onChange={(v) => updateSeg(setForm, i, "to_place", v)} disabled={!canEdit} placeholder="Indore" testId={`da-seg-to-${i}`} />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                                <Label>Class</Label>
                                <select value={s.fare_class} onChange={(e) => updateSeg(setForm, i, "fare_class", e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 text-sm bg-mpca-ivory border border-mpca-brass/30 focus:border-mpca-oxblood focus:outline-none disabled:bg-mpca-parchment/40 disabled:cursor-not-allowed" data-testid={`da-seg-class-${i}`}>
                                    {FARE_CLASSES.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                                </select>
                            </div>
                            <div className="col-span-6 md:col-span-2">
                                <Label>Both-ways ₹</Label>
                                <NumInput value={s.both_ways_amount_inr} onChange={(v) => updateSeg(setForm, i, "both_ways_amount_inr", v)} disabled={!canEdit} testId={`da-seg-amt-${i}`} />
                            </div>
                            <div className="col-span-12 md:col-span-2 flex items-end gap-2">
                                {s.ticket_url ? (
                                    <a href={s.ticket_url} target="_blank" rel="noreferrer" className="flex-1 text-xs text-mpca-green-dark bg-mpca-green-dark/10 border border-mpca-green-dark/40 px-2 py-2 flex items-center justify-center gap-1">
                                        <ExternalLink size={11} /> Ticket ✓
                                    </a>
                                ) : canEdit ? (
                                    <label className="flex-1 text-xs text-mpca-brass border border-dashed border-mpca-brass/60 px-2 py-2 flex items-center justify-center gap-1 cursor-pointer hover:bg-mpca-brass/5">
                                        <Upload size={11} /> Ticket
                                        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload(`seg-${i}`, e.target.files?.[0], (url) => updateSeg(setForm, i, "ticket_url", url))} />
                                    </label>
                                ) : <span className="text-xs text-mpca-gray-dark">—</span>}
                                {canEdit && (
                                    <button type="button" onClick={() => setForm((f) => ({ ...f, travel_segments: f.travel_segments.filter((_, ix) => ix !== i) }))} className="text-mpca-oxblood hover:bg-mpca-oxblood/10 p-1.5 border border-mpca-oxblood/30"><Trash2 size={13} /></button>
                                )}
                                {uploading === `seg-${i}` && <Loader2 size={12} className="animate-spin" />}
                            </div>
                        </div>
                    ))}
                    {canEdit && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, travel_segments: [...(f.travel_segments || []), emptySeg()] }))} className="w-full py-2.5 text-sm text-mpca-oxblood border border-dashed border-mpca-oxblood/50 hover:bg-mpca-oxblood/5 flex items-center justify-center gap-1.5" data-testid="da-add-seg">
                            <Plus size={14} /> Add travel leg
                        </button>
                    )}
                </div>
            </SectionCard>

            {/* 2) Journey Expenses */}
            <SectionCard icon={Clock3} title="Journey Expenses" subtitle="₹300 for every 12 hours of travel (or part thereof)" subtotal={preview.journey} subtotalTestId="da-journey-total" testId="da-sec-journey">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label>Total travel hours</Label>
                        <NumInput value={form.journey_hours} onChange={(v) => setField("journey_hours", v)} disabled={!canEdit} testId="da-journey-hours" />
                    </div>
                    <div>
                        <Label>Rate per 12 hrs (₹)</Label>
                        <NumInput value={form.journey_rate_per_12h_inr} onChange={(v) => setField("journey_rate_per_12h_inr", v)} disabled={!canEdit} testId="da-journey-rate" />
                    </div>
                    <div>
                        <Label>Journey Amount</Label>
                        <ComputedField value={preview.journey} testId="da-journey-amt" />
                    </div>
                </div>
            </SectionCard>

            {/* 3) Conveyance */}
            <SectionCard icon={Bike} title="Conveyance Allowance" subtitle="Local trips (auto / cab) at rate × count" subtotal={preview.conv} subtotalTestId="da-conv-total" testId="da-sec-conv">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label>Rate per trip (₹)</Label>
                        <NumInput value={form.conveyance_rate_inr} onChange={(v) => setField("conveyance_rate_inr", v)} disabled={!canEdit} testId="da-conv-rate" />
                    </div>
                    <div>
                        <Label>No. of trips</Label>
                        <NumInput value={form.conveyance_count} onChange={(v) => setField("conveyance_count", v)} disabled={!canEdit} testId="da-conv-count" />
                    </div>
                    <div>
                        <Label>Conveyance Amount</Label>
                        <ComputedField value={preview.conv} testId="da-conv-amt" />
                    </div>
                </div>
            </SectionCard>

            {/* 4) Incidental */}
            <SectionCard icon={Coffee} title="Incidental Charges" subtitle="Meals, tips, small purchases · rate × days" subtotal={preview.inc} subtotalTestId="da-inc-total" testId="da-sec-inc">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label>Rate / day (₹)</Label>
                        <NumInput value={form.incidental_rate_inr} onChange={(v) => setField("incidental_rate_inr", v)} disabled={!canEdit} testId="da-inc-rate" />
                    </div>
                    <div>
                        <Label>Days</Label>
                        <NumInput value={form.incidental_days} onChange={(v) => setField("incidental_days", v)} disabled={!canEdit} testId="da-inc-days" />
                    </div>
                    <div>
                        <Label>Incidental Amount</Label>
                        <ComputedField value={preview.inc} testId="da-inc-amt" />
                    </div>
                </div>
            </SectionCard>

            {/* 5) Night Halt */}
            <SectionCard icon={BedDouble} title="Night Halt" subtitle="Hotel accommodation · attach hotel bill" subtotal={preview.nh} subtotalTestId="da-nh-total" testId="da-sec-nh">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <Label>Place</Label>
                        <TextInput value={form.night_halt_place || ""} onChange={(v) => setField("night_halt_place", v)} disabled={!canEdit} placeholder="e.g. Hotel Fortune, Indore" testId="da-nh-place" />
                    </div>
                    <div>
                        <Label>Amount (₹)</Label>
                        <NumInput value={form.night_halt_amount_inr} onChange={(v) => setField("night_halt_amount_inr", v)} disabled={!canEdit} testId="da-nh-amt" />
                    </div>
                    <div>
                        <Label>Hotel Bill</Label>
                        {form.night_halt_bill_url ? (
                            <div className="flex items-center gap-2">
                                <a href={form.night_halt_bill_url} target="_blank" rel="noreferrer" className="flex-1 text-xs text-mpca-green-dark bg-mpca-green-dark/10 border border-mpca-green-dark/40 px-3 py-2 flex items-center justify-center gap-1">
                                    <ExternalLink size={11} /> Uploaded ✓
                                </a>
                                {canEdit && <button className="text-xs text-mpca-oxblood hover:bg-mpca-oxblood/10 p-2 border border-mpca-oxblood/30" onClick={() => setField("night_halt_bill_url", "")}><Trash2 size={13} /></button>}
                            </div>
                        ) : canEdit ? (
                            <label className="w-full text-sm text-mpca-brass border border-dashed border-mpca-brass/60 px-3 py-2 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-mpca-brass/5">
                                <Upload size={13} /> Upload hotel bill
                                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload("nh-bill", e.target.files?.[0], (url) => setField("night_halt_bill_url", url))} />
                            </label>
                        ) : <span className="text-sm text-mpca-gray-dark italic">Not uploaded</span>}
                        {uploading === "nh-bill" && <Loader2 size={12} className="animate-spin mt-1" />}
                    </div>
                </div>
            </SectionCard>

            {/* 6) Misc */}
            <SectionCard icon={Receipt} title="Miscellaneous / Other Expenses" subtitle="Line-item receipts (booking agent, ticket cancellation, etc.)" subtotal={preview.misc} subtotalTestId="da-misc-total" testId="da-sec-misc">
                <div className="space-y-3">
                    {(form.misc_items || []).length === 0 && !canEdit && (
                        <div className="text-center italic text-sm text-mpca-gray-dark py-2">No misc items added.</div>
                    )}
                    {(form.misc_items || []).map((m, i) => (
                        <div key={i} className="grid grid-cols-12 gap-3 items-end p-3 bg-mpca-parchment/40 border border-mpca-brass/20" data-testid={`da-misc-${i}`}>
                            <div className="col-span-12 md:col-span-6">
                                <Label>Description</Label>
                                <TextInput value={m.description} onChange={(v) => updateMisc(setForm, i, "description", v)} disabled={!canEdit} placeholder="e.g. Ticket agent charge 300 × 2 legs" testId={`da-misc-desc-${i}`} />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                                <Label>Amount ₹</Label>
                                <NumInput value={m.amount_inr} onChange={(v) => updateMisc(setForm, i, "amount_inr", v)} disabled={!canEdit} testId={`da-misc-amt-${i}`} />
                            </div>
                            <div className="col-span-6 md:col-span-3 flex items-end gap-2">
                                {m.receipt_url ? (
                                    <a href={m.receipt_url} target="_blank" rel="noreferrer" className="flex-1 text-xs text-mpca-green-dark bg-mpca-green-dark/10 border border-mpca-green-dark/40 px-2 py-2 flex items-center justify-center gap-1">
                                        <ExternalLink size={11} /> Receipt ✓
                                    </a>
                                ) : canEdit ? (
                                    <label className="flex-1 text-xs text-mpca-brass border border-dashed border-mpca-brass/60 px-2 py-2 flex items-center justify-center gap-1 cursor-pointer hover:bg-mpca-brass/5">
                                        <Upload size={11} /> Receipt
                                        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload(`misc-${i}`, e.target.files?.[0], (url) => updateMisc(setForm, i, "receipt_url", url))} />
                                    </label>
                                ) : <span className="text-xs text-mpca-gray-dark">—</span>}
                                {uploading === `misc-${i}` && <Loader2 size={12} className="animate-spin" />}
                            </div>
                            <div className="col-span-6 md:col-span-1 flex justify-end">
                                {canEdit && <button type="button" onClick={() => setForm((f) => ({ ...f, misc_items: f.misc_items.filter((_, ix) => ix !== i) }))} className="text-mpca-oxblood hover:bg-mpca-oxblood/10 p-1.5 border border-mpca-oxblood/30"><Trash2 size={13} /></button>}
                            </div>
                        </div>
                    ))}
                    {canEdit && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, misc_items: [...(f.misc_items || []), emptyMisc()] }))} className="w-full py-2.5 text-sm text-mpca-oxblood border border-dashed border-mpca-oxblood/50 hover:bg-mpca-oxblood/5 flex items-center justify-center gap-1.5" data-testid="da-add-misc">
                            <Plus size={14} /> Add misc line
                        </button>
                    )}
                </div>
            </SectionCard>

            {/* 7) Additional supporting docs */}
            <SectionCard icon={Paperclip} title="Additional Supporting Documents" subtitle="Overflow bucket for any other proofs" testId="da-sec-attach">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(form.attachments || []).map((a, i) => (
                        <div key={i} className="p-3 border border-mpca-brass/20 bg-mpca-parchment/40 flex items-center gap-2" data-testid={`da-attach-${i}`}>
                            <TextInput className="flex-1" value={a.label} onChange={(v) => updateAttach(setForm, i, "label", v)} disabled={!canEdit} placeholder="Document label" />
                            {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-mpca-green-dark underline">Open ✓</a>
                                : canEdit ? <label className="text-xs text-mpca-brass cursor-pointer flex items-center gap-1 hover:bg-mpca-brass/5 px-2 py-1"><Upload size={11} /> Upload<input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => upload(`attach-${i}`, e.target.files?.[0], (url) => updateAttach(setForm, i, "url", url))} /></label>
                                : null}
                            {canEdit && <button type="button" onClick={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, ix) => ix !== i) }))} className="text-mpca-oxblood"><Trash2 size={13} /></button>}
                        </div>
                    ))}
                    {canEdit && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, attachments: [...(f.attachments || []), { label: "", url: "" }] }))} className="text-sm text-mpca-oxblood flex items-center gap-1.5 border border-dashed border-mpca-oxblood/50 px-3 py-2.5 hover:bg-mpca-oxblood/5 justify-center" data-testid="da-add-attach">
                            <Plus size={14} /> Add supporting document
                        </button>
                    )}
                </div>
            </SectionCard>

            {/* 8) Bank */}
            <SectionCard icon={Landmark} title="Bank Details (for DA credit)" subtitle="Where MPCA should transfer the approved amount" testId="da-sec-bank">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label>Bank Account No.</Label>
                        <TextInput value={form.bank_account_no || ""} onChange={(v) => setField("bank_account_no", v)} disabled={!canEdit} placeholder="123456789012" mono testId="da-bank-acc" />
                    </div>
                    <div>
                        <Label>IFSC Code</Label>
                        <TextInput value={form.bank_ifsc || ""} onChange={(v) => setField("bank_ifsc", v)} disabled={!canEdit} placeholder="SBIN0000123" mono testId="da-bank-ifsc" />
                    </div>
                    <div>
                        <Label>PAN</Label>
                        <TextInput value={form.pan || ""} onChange={(v) => setField("pan", v)} disabled={!canEdit} placeholder="ABCDE1234F" mono testId="da-pan" />
                    </div>
                </div>
            </SectionCard>

            {/* Sticky action bar */}
            {canEdit && (
                <div className="border-2 border-mpca-oxblood bg-mpca-ivory sticky bottom-4 shadow-xl z-10 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-mpca-brass">Live Grand Total</div>
                        <div className="font-serif text-3xl text-mpca-oxblood font-bold" data-testid="da-sticky-total">{fmt(preview.total)}</div>
                    </div>
                    <button
                        className="bg-mpca-green-dark text-mpca-ivory px-6 py-3 hover:opacity-90 disabled:opacity-40 flex items-center gap-2 text-sm uppercase tracking-widest"
                        onClick={save} disabled={saving}
                        data-testid="da-save-btn"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Draft
                    </button>
                </div>
            )}

            {form.status === "Submitted" && (
                <div className="border-2 border-mpca-brass bg-mpca-brass/5 p-4 text-sm text-mpca-brass flex items-center gap-2 italic">
                    <CheckCircle2 size={16} /> Submitted on {form.submitted_at ? new Date(form.submitted_at).toLocaleDateString("en-IN") : "—"} · awaiting {reviewer} review
                </div>
            )}
        </div>
    );
};

// ────────────────────── Shared field updaters ──────────────────────
const updateSeg = (setForm, i, k, v) => setForm((f) => ({
    ...f, travel_segments: (f.travel_segments || []).map((s, ix) => ix === i ? { ...s, [k]: v } : s),
}));
const updateMisc = (setForm, i, k, v) => setForm((f) => ({
    ...f, misc_items: (f.misc_items || []).map((s, ix) => ix === i ? { ...s, [k]: v } : s),
}));
const updateAttach = (setForm, i, k, v) => setForm((f) => ({
    ...f, attachments: (f.attachments || []).map((s, ix) => ix === i ? { ...s, [k]: v } : s),
}));

export default MatchOfficialDAPanel;
