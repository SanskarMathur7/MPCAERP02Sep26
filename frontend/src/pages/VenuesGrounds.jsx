import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchVenues, createVenue, deleteVenue,
    fetchGrounds, createGround, deleteGround, addGroundStaff, removeGroundStaff,
    fetchGroundExpenses, createGroundExpense, submitGroundExpense,
    approveGroundExpense, rejectGroundExpense, deleteGroundExpense,
    fetchGroundExpenseStats, fetchGroundPayroll, fetchBodies,
} from "@/lib/api";
import {
    MapPin, Plus, Trash2, Users, Wallet, Calendar, ChevronRight, Send,
    CheckCircle2, XCircle, Building2, Sparkles, X, Trophy,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const VENUE_CATS = [
    { id: "BCCI_International", label: "BCCI · International", tone: "active" },
    { id: "BCCI_Domestic_A",    label: "BCCI · Domestic-A",     tone: "active" },
    { id: "BCCI_Domestic_B",    label: "BCCI · Domestic-B",     tone: "pending" },
    { id: "MPCA_State",         label: "MPCA State",            tone: "pending" },
    { id: "Divisional",         label: "Divisional",            tone: "lapsed" },
    { id: "District",           label: "District",              tone: "lapsed" },
    { id: "Private",            label: "Private",               tone: "suspended" },
];
const CAT_LABEL = Object.fromEntries(VENUE_CATS.map((c) => [c.id, c.label]));
const CAT_TONE = Object.fromEntries(VENUE_CATS.map((c) => [c.id, c.tone]));

const GROUND_TYPES = ["Main", "Practice_A", "Practice_B", "Net_Practice", "Other"];
const FORMATS = [
    "FourDay_Senior", "FourDay_U23", "FourDay_U19",
    "OneDay_Senior", "OneDay_U23", "OneDay_U19", "OneDay_Womens",
    "T20_Senior", "T20_U23", "T20_U19", "T20_Womens", "U16_League",
];
const EXPENSE_TYPES = [
    "Staff_Salary", "Pitch_Maintenance", "Equipment_Repair",
    "Water_Electricity", "Cleaning", "Security", "Miscellaneous",
];
const EXP_STATUS_META = {
    Draft:     { label: "Draft",     tone: "lapsed" },
    Submitted: { label: "Submitted", tone: "pending" },
    Approved:  { label: "Approved",  tone: "active" },
    Rejected:  { label: "Rejected",  tone: "suspended" },
    Paid:      { label: "Paid",      tone: "active" },
};

const Pill = ({ tone, label, testId }) => (
    <span className={"pill pill-" + tone} data-testid={testId}>{label}</span>
);

// ─────────── Venue form ───────────
const VenueForm = ({ open, onClose, onSaved, persona, bodies }) => {
    const [form, setForm] = useState({
        name: "", category: "MPCA_State",
        owner_body_id: "MPCA", managed_by_body_id: "", bcci_approval: "None",
        city: "", address_line: "", pincode: "",
        capacity_seats: "", floodlights: false, bcci_calendar_eligible: false,
    });
    const [busy, setBusy] = useState(false);
    if (!open) return null;
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const v = await createVenue({
                ...form,
                body_id: form.owner_body_id || persona.body_code || "MPCA",
                owner_body_id: form.owner_body_id || persona.body_code || "MPCA",
                managed_by_body_id: form.managed_by_body_id || null,
                capacity_seats: form.capacity_seats ? parseInt(form.capacity_seats, 10) : null,
            });
            onSaved(v);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };
    const bodyOptions = (bodies || []).filter((b) => ["State", "Division", "District"].includes(b.body_type));
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="venue-form">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-xl w-full max-h-[90vh] overflow-y-auto">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 sticky top-0 flex items-center justify-between">
                    <div className="font-serif text-xl">Empanel New Venue</div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="label-heritage">Venue Name *</label>
                        <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-heritage" data-testid="venue-name" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Category *</label>
                            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input-heritage" data-testid="venue-category">
                                {VENUE_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">City *</label>
                            <input required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="input-heritage" data-testid="venue-city" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Owner Body *</label>
                            <select
                                value={form.owner_body_id}
                                onChange={(e) => setForm((f) => ({ ...f, owner_body_id: e.target.value }))}
                                className="input-heritage"
                                data-testid="venue-owner-select"
                            >
                                {bodyOptions.map((b) => (
                                    <option key={b.code} value={b.code}>[{b.body_type}] {b.name} ({b.code})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Managed By (optional)</label>
                            <select
                                value={form.managed_by_body_id}
                                onChange={(e) => setForm((f) => ({ ...f, managed_by_body_id: e.target.value }))}
                                className="input-heritage"
                                data-testid="venue-manager-select"
                            >
                                <option value="">— Same as owner —</option>
                                {bodyOptions.map((b) => (
                                    <option key={b.code} value={b.code}>[{b.body_type}] {b.name} ({b.code})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">BCCI Approval</label>
                        <select
                            value={form.bcci_approval}
                            onChange={(e) => setForm((f) => ({ ...f, bcci_approval: e.target.value, bcci_calendar_eligible: e.target.value !== "None" }))}
                            className="input-heritage"
                            data-testid="venue-bcci-approval-select"
                        >
                            <option value="None">Not Approved</option>
                            <option value="Domestic">BCCI · Domestic (Ranji / Vijay Hazare / etc.)</option>
                            <option value="International">BCCI · International (Test / ODI / T20I)</option>
                        </select>
                    </div>
                    <div>
                        <label className="label-heritage">Address</label>
                        <input value={form.address_line} onChange={(e) => setForm((f) => ({ ...f, address_line: e.target.value }))} className="input-heritage" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="label-heritage">Pincode</label>
                            <input value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Capacity</label>
                            <input type="number" value={form.capacity_seats} onChange={(e) => setForm((f) => ({ ...f, capacity_seats: e.target.value }))} className="input-heritage" data-testid="venue-capacity" />
                        </div>
                        <div className="flex flex-col gap-2 pt-5 text-xs">
                            <label className="flex items-center gap-1"><input type="checkbox" checked={form.floodlights} onChange={(e) => setForm((f) => ({ ...f, floodlights: e.target.checked }))} /> Floodlights</label>
                        </div>
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40 sticky bottom-0">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy || !form.name || !form.city} className="btn-heritage-primary" data-testid="venue-save">
                        {busy ? "Saving…" : "Empanel Venue"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ─────────── Ground form ───────────
const GroundForm = ({ open, onClose, onSaved, venues, bodies }) => {
    const [form, setForm] = useState({
        venue_id: "", name: "", type: "Main", pitch_type: "Red Soil",
        boundaries_metres: "", is_active: true,
        bcci_approval: "None", managed_by_body_id: "",
        suitable_formats: [],
    });
    const [busy, setBusy] = useState(false);
    if (!open) return null;
    const toggleFormat = (f) => setForm((p) => ({
        ...p,
        suitable_formats: p.suitable_formats.includes(f) ? p.suitable_formats.filter((x) => x !== f) : [...p.suitable_formats, f],
    }));
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const g = await createGround({
                ...form,
                boundaries_metres: form.boundaries_metres ? parseInt(form.boundaries_metres, 10) : null,
                managed_by_body_id: form.managed_by_body_id || null,
                ground_staff: [],
            });
            onSaved(g);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };
    const bodyOptions = (bodies || []).filter((b) => ["State", "Division", "District"].includes(b.body_type));
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="ground-form">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-xl w-full max-h-[90vh] overflow-y-auto">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 sticky top-0 flex items-center justify-between">
                    <div className="font-serif text-xl">Add Ground to Venue</div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="label-heritage">Parent Venue *</label>
                        <select required value={form.venue_id} onChange={(e) => setForm((f) => ({ ...f, venue_id: e.target.value }))} className="input-heritage" data-testid="ground-venue">
                            <option value="">— Choose venue —</option>
                            {venues.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.city}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Ground Name *</label>
                            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-heritage" data-testid="ground-name" />
                        </div>
                        <div>
                            <label className="label-heritage">Type</label>
                            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-heritage">
                                {GROUND_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Pitch Type</label>
                            <input value={form.pitch_type} onChange={(e) => setForm((f) => ({ ...f, pitch_type: e.target.value }))} className="input-heritage" placeholder="Red Soil / Black Soil / Turf" />
                        </div>
                        <div>
                            <label className="label-heritage">Boundaries (m)</label>
                            <input type="number" value={form.boundaries_metres} onChange={(e) => setForm((f) => ({ ...f, boundaries_metres: e.target.value }))} className="input-heritage" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">BCCI Approval (this ground)</label>
                            <select
                                value={form.bcci_approval}
                                onChange={(e) => setForm((f) => ({ ...f, bcci_approval: e.target.value }))}
                                className="input-heritage"
                                data-testid="ground-bcci-approval-select"
                            >
                                <option value="None">Not Approved</option>
                                <option value="Domestic">BCCI · Domestic</option>
                                <option value="International">BCCI · International</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Managed By (override venue)</label>
                            <select
                                value={form.managed_by_body_id}
                                onChange={(e) => setForm((f) => ({ ...f, managed_by_body_id: e.target.value }))}
                                className="input-heritage"
                                data-testid="ground-manager-select"
                            >
                                <option value="">— Inherit from venue —</option>
                                {bodyOptions.map((b) => (
                                    <option key={b.code} value={b.code}>[{b.body_type}] {b.name} ({b.code})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Suitable Formats</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {FORMATS.map((f) => (
                                <button type="button" key={f} onClick={() => toggleFormat(f)} className={"px-2 py-1 text-[10px] border " + (form.suitable_formats.includes(f) ? "border-mpca-oxblood bg-mpca-oxblood/10 text-mpca-oxblood" : "border-mpca-brass/40 text-mpca-gray-dark")} data-testid={`fmt-${f}`}>
                                    {f.replace(/_/g, " ")}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40 sticky bottom-0">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy || !form.venue_id || !form.name} className="btn-heritage-primary" data-testid="ground-save">
                        {busy ? "Saving…" : "Add Ground"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ─────────── New ground-expense dialog ───────────
const ExpenseForm = ({ open, onClose, onSaved, grounds, persona }) => {
    const [form, setForm] = useState({
        ground_id: "", expense_type: "Pitch_Maintenance",
        expense_date: new Date().toISOString().slice(0, 10),
        description: "", amount_inr: "",
    });
    const [busy, setBusy] = useState(false);
    if (!open) return null;
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const ge = await createGroundExpense({
                ...form,
                body_id: persona.body_code || "MPCA",
                amount_inr: parseFloat(form.amount_inr),
                created_by: persona.name,
            });
            onSaved(ge);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="expense-form">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-xl w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex items-center justify-between">
                    <div className="font-serif text-xl">Record Ground Expense</div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="label-heritage">Ground *</label>
                        <select required value={form.ground_id} onChange={(e) => setForm((f) => ({ ...f, ground_id: e.target.value }))} className="input-heritage" data-testid="exp-ground">
                            <option value="">— Choose —</option>
                            {grounds.map((g) => <option key={g.id} value={g.id}>{g.venue_name} · {g.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label-heritage">Expense Type *</label>
                            <select value={form.expense_type} onChange={(e) => setForm((f) => ({ ...f, expense_type: e.target.value }))} className="input-heritage">
                                {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Date *</label>
                            <input required type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} className="input-heritage" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Description *</label>
                        <textarea required rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-heritage" />
                    </div>
                    <div>
                        <label className="label-heritage">Amount (₹) *</label>
                        <input required type="number" min="1" value={form.amount_inr} onChange={(e) => setForm((f) => ({ ...f, amount_inr: e.target.value }))} className="input-heritage" data-testid="exp-amount" />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost">Cancel</button>
                    <button type="submit" disabled={busy || !form.ground_id || !form.description || !form.amount_inr} className="btn-heritage-primary" data-testid="exp-save">
                        {busy ? "Saving…" : "Save as Draft"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ─────────── Main page ───────────
export default function VenuesGrounds() {
    const { persona } = useAuth();
    const [tab, setTab] = useState("venues");
    const [venues, setVenues] = useState([]);
    const [grounds, setGrounds] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [expStats, setExpStats] = useState(null);
    const [bodies, setBodies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [venueFormOpen, setVenueFormOpen] = useState(false);
    const [groundFormOpen, setGroundFormOpen] = useState(false);
    const [expFormOpen, setExpFormOpen] = useState(false);
    const [expandedGroundId, setExpandedGroundId] = useState(null);
    const [payrollMap, setPayrollMap] = useState({}); // gid → payroll

    const reload = async () => {
        setLoading(true);
        try {
            const [v, g, e, s, b] = await Promise.all([
                fetchVenues(), fetchGrounds(), fetchGroundExpenses(), fetchGroundExpenseStats(),
                fetchBodies().catch(() => []),
            ]);
            setVenues(v); setGrounds(g); setExpenses(e); setExpStats(s); setBodies(b);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); }, []);

    const canEdit = persona && ["president", "secretary", "treasurer"].includes(persona.id);
    const canApprove = persona && persona.id === "treasurer" && persona.body_code === "MPCA";

    const venueCounts = useMemo(() => {
        const out = {};
        for (const v of venues) out[v.category] = (out[v.category] || 0) + 1;
        return out;
    }, [venues]);

    const groundsByVenue = useMemo(() => {
        const m = {};
        for (const g of grounds) {
            if (!m[g.venue_id]) m[g.venue_id] = [];
            m[g.venue_id].push(g);
        }
        return m;
    }, [grounds]);

    const loadPayroll = async (gid) => {
        if (payrollMap[gid]) return;
        try {
            const p = await fetchGroundPayroll(gid);
            setPayrollMap((m) => ({ ...m, [gid]: p }));
        } catch (e) { /* swallow */ }
    };

    const handleExpenseAction = async (id, kind) => {
        const action = {
            actor_post: persona.post, actor_name: persona.name,
            actor_body_id: persona.body_code || "MPCA", notes: null,
        };
        try {
            const fn = { submit: submitGroundExpense, approve: approveGroundExpense, reject: rejectGroundExpense }[kind];
            await fn(id, action);
            reload();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const handleAddStaff = async (gid) => {
        const name = prompt("Staff Name?");
        if (!name) return;
        const role = prompt("Role (Head Groundsman / Curator / Helper / ...)?") || "Helper";
        const salary = parseFloat(prompt("Monthly Salary (₹)?") || "0");
        try {
            await addGroundStaff(gid, { name, role, monthly_salary_inr: salary, joined_date: new Date().toISOString().slice(0, 10) });
            setPayrollMap((m) => { const c = { ...m }; delete c[gid]; return c; });
            reload();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const handleRemoveStaff = async (gid, sid, name) => {
        if (!window.confirm(`Remove ${name} from ground staff?`)) return;
        try {
            await removeGroundStaff(gid, sid);
            setPayrollMap((m) => { const c = { ...m }; delete c[gid]; return c; });
            reload();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    return (
        <div className="space-y-8" data-testid="venues-grounds-page">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <div className="overline">Operations · Infrastructure</div>
                    <h1 className="font-serif text-4xl text-mpca-navy mt-1">Venues & Grounds</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        BCCI-categorised venue master, per-venue grounds with playable-format mapping + ground-staff salary register, and a ground-expense sub-ledger covering pitch maintenance, payroll, utilities and equipment.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-mpca-brass/30" data-testid="vg-tabs">
                {[
                    { id: "venues", label: `Venues (${venues.length})`, icon: Building2 },
                    { id: "grounds", label: `Grounds (${grounds.length})`, icon: MapPin },
                    { id: "expenses", label: `Ground Expenses (${expenses.length})`, icon: Wallet },
                ].map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
                        className={"px-4 py-2 text-sm border-b-2 -mb-px flex items-center gap-2 " + (tab === t.id ? "border-mpca-oxblood text-mpca-oxblood font-semibold" : "border-transparent text-mpca-gray-dark hover:text-mpca-navy")}>
                        <t.icon className="w-4 h-4" /> {t.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <CricketLoader label="Loading…" />
            ) : tab === "venues" ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {VENUE_CATS.slice(0, 4).map((c) => (
                            <div key={c.id} className="border-l-4 border-mpca-navy bg-mpca-cream/70 p-3" data-testid={`venue-stat-${c.id}`}>
                                <div className="overline text-[10px]">{c.label}</div>
                                <div className="font-serif text-2xl text-mpca-navy mt-1">{venueCounts[c.id] || 0}</div>
                            </div>
                        ))}
                    </div>
                    {canEdit && (
                        <button onClick={() => setVenueFormOpen(true)} className="btn-heritage-primary flex items-center gap-2" data-testid="new-venue-btn">
                            <Plus className="w-4 h-4" /> Empanel Venue
                        </button>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {venues.map((v) => (
                            <div key={v.id} className="border-2 border-mpca-brass/40 bg-mpca-ivory p-5 space-y-2" data-testid={`venue-card-${v.id}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="overline">{v.venue_no}</div>
                                        <div className="font-serif text-xl text-mpca-navy mt-1">{v.name}</div>
                                    </div>
                                    <Pill tone={CAT_TONE[v.category]} label={CAT_LABEL[v.category]} testId={`vcat-${v.id}`} />
                                </div>
                                <div className="text-sm text-mpca-gray-dark space-y-1">
                                    <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {v.city}{v.address_line ? ` · ${v.address_line}` : ""}</div>
                                    <div className="flex items-center gap-3 text-xs flex-wrap">
                                        {v.capacity_seats ? <span>👥 {v.capacity_seats.toLocaleString("en-IN")} seats</span> : null}
                                        {v.floodlights && <span>💡 Floodlights</span>}
                                    </div>
                                    {/* M9 · Ownership & BCCI approval */}
                                    <div className="flex flex-wrap items-center gap-2 pt-2 text-[10px] font-mono uppercase tracking-wider">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-mpca-brass/40 text-mpca-charcoal">
                                            Owner · {v.owner_body_id || v.body_id || "—"}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 border ${v.managed_by_body_id && v.managed_by_body_id !== (v.owner_body_id || v.body_id) ? "border-mpca-oxblood/50 text-mpca-oxblood" : "border-mpca-brass/40 text-mpca-charcoal"}`}>
                                            Mgr · {v.managed_by_body_id || v.owner_body_id || v.body_id || "—"}
                                        </span>
                                        {v.bcci_approval && v.bcci_approval !== "None" ? (
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${v.bcci_approval === "International" ? "bg-mpca-oxblood text-mpca-ivory" : "bg-mpca-brass/20 text-mpca-brass border border-mpca-brass/50"}`} data-testid={`bcci-${v.id}`}>
                                                ★ BCCI · {v.bcci_approval}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-mpca-gray/30 text-mpca-gray-dark">
                                                Not BCCI-approved
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs pt-1">{(groundsByVenue[v.id] || []).length} ground(s) registered</div>
                                </div>
                                {canEdit && (
                                    <div className="flex gap-2 pt-2 border-t border-mpca-brass/30">
                                        <button onClick={async () => { if (!window.confirm(`Delete ${v.name}?`)) return; try { await deleteVenue(v.id); reload(); } catch (e) { alert(e?.response?.data?.detail || e.message); } }} className="btn-heritage-ghost text-xs flex items-center gap-1" data-testid={`del-venue-${v.id}`}>
                                            <Trash2 className="w-3 h-3" /> Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : tab === "grounds" ? (
                <div className="space-y-4">
                    {canEdit && (
                        <button onClick={() => setGroundFormOpen(true)} className="btn-heritage-primary flex items-center gap-2" data-testid="new-ground-btn">
                            <Plus className="w-4 h-4" /> Add Ground
                        </button>
                    )}
                    <div className="space-y-3">
                        {grounds.map((g) => {
                            const open = expandedGroundId === g.id;
                            const payroll = payrollMap[g.id];
                            return (
                                <div key={g.id} className="border border-mpca-brass/40 bg-mpca-ivory" data-testid={`ground-${g.id}`}>
                                    <button onClick={() => { setExpandedGroundId(open ? null : g.id); if (!open) loadPayroll(g.id); }} className="w-full flex items-center gap-3 p-4 text-left hover:bg-mpca-cream/40">
                                        <Trophy className="w-6 h-6 text-mpca-navy shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="overline">{g.ground_no} · {g.type.replace(/_/g, " ")}</div>
                                            <div className="font-serif text-lg text-mpca-navy mt-1 truncate">{g.name} <span className="text-mpca-gray-dark text-sm">· {g.venue_name}</span></div>
                                            <div className="text-xs text-mpca-gray-dark mt-1 flex flex-wrap gap-x-3">
                                                <span>Pitch: {g.pitch_type || "—"}</span>
                                                {g.boundaries_metres && <span>Boundaries: {g.boundaries_metres}m</span>}
                                                <span>Staff: {(g.ground_staff || []).length}</span>
                                                <span>Formats: {(g.suitable_formats || []).length}</span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wider">
                                                {g.bcci_approval && g.bcci_approval !== "None" ? (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${g.bcci_approval === "International" ? "bg-mpca-oxblood text-mpca-ivory" : "bg-mpca-brass/20 text-mpca-brass border border-mpca-brass/50"}`} data-testid={`ground-bcci-${g.id}`}>
                                                        ★ BCCI · {g.bcci_approval}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-mpca-gray/30 text-mpca-gray-dark">
                                                        Not BCCI-approved
                                                    </span>
                                                )}
                                                {g.managed_by_body_id && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-mpca-oxblood/50 text-mpca-oxblood">
                                                        Mgr · {g.managed_by_body_id}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className={"w-5 h-5 text-mpca-gray-dark transition-transform " + (open ? "rotate-90" : "")} />
                                    </button>
                                    {open && (
                                        <div className="border-t border-mpca-brass/30 p-4 space-y-4 bg-mpca-cream/30">
                                            {(g.suitable_formats?.length || 0) > 0 && (
                                                <div>
                                                    <div className="overline mb-2">Suitable Formats</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {g.suitable_formats.map((f) => (
                                                            <span key={f} className="px-1.5 py-0.5 bg-mpca-navy/10 text-mpca-navy text-[10px] uppercase tracking-wider">{f.replace(/_/g, " ")}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="overline">Ground Staff Register ({(g.ground_staff || []).length})</div>
                                                    {canEdit && (
                                                        <button onClick={() => handleAddStaff(g.id)} className="btn-heritage-ghost text-xs px-2 py-1 flex items-center gap-1" data-testid={`add-staff-${g.id}`}>
                                                            <Plus className="w-3 h-3" /> Add Staff
                                                        </button>
                                                    )}
                                                </div>
                                                {(g.ground_staff || []).length === 0 ? (
                                                    <div className="text-xs italic text-mpca-gray-dark">No staff registered.</div>
                                                ) : (
                                                    <table className="w-full text-xs border border-mpca-brass/30 bg-mpca-ivory" data-testid={`staff-table-${g.id}`}>
                                                        <thead className="bg-mpca-navy text-mpca-ivory">
                                                            <tr><th className="text-left px-2 py-1">Name</th><th className="text-left px-2 py-1">Role</th><th className="text-right px-2 py-1">Salary / mo</th>{canEdit && <th className="w-8" />}</tr>
                                                        </thead>
                                                        <tbody>
                                                            {g.ground_staff.map((s) => (
                                                                <tr key={s.id} className="border-t border-mpca-brass/20">
                                                                    <td className="px-2 py-1">{s.name}</td>
                                                                    <td className="px-2 py-1 text-mpca-gray-dark">{s.role}</td>
                                                                    <td className="px-2 py-1 text-right font-mono">{fmtINR(s.monthly_salary_inr)}</td>
                                                                    {canEdit && (
                                                                        <td className="text-center"><button onClick={() => handleRemoveStaff(g.id, s.id, s.name)} className="text-mpca-oxblood" data-testid={`rm-staff-${s.id}`}><X className="w-3 h-3 inline" /></button></td>
                                                                    )}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                                {payroll && payroll.staff_count > 0 && (
                                                    <div className="text-xs mt-2 bg-mpca-saffron/10 border-l-2 border-mpca-saffron p-2">
                                                        Monthly payroll: <strong>{fmtINR(payroll.monthly_total_inr)}</strong> · Annual: <strong>{fmtINR(payroll.annual_total_inr)}</strong>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                // Expenses tab
                <div className="space-y-4">
                    {expStats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="border-l-4 border-mpca-navy bg-mpca-cream/70 p-3">
                                <div className="overline">Total</div>
                                <div className="font-serif text-2xl text-mpca-navy mt-1" data-testid="stat-exp-total">{expStats.total_expenses}</div>
                            </div>
                            <div className="border-l-4 border-mpca-saffron bg-mpca-cream/70 p-3">
                                <div className="overline">Pending</div>
                                <div className="font-serif text-lg text-mpca-saffron mt-1" data-testid="stat-exp-pending">{fmtINR(expStats.amount_pending_inr)}</div>
                            </div>
                            <div className="border-l-4 border-mpca-gold-light bg-mpca-cream/70 p-3">
                                <div className="overline">Approved</div>
                                <div className="font-serif text-lg text-mpca-gold-light mt-1" data-testid="stat-exp-approved">{fmtINR(expStats.amount_approved_inr)}</div>
                            </div>
                            <div className="border-l-4 border-mpca-green-dark bg-mpca-cream/70 p-3">
                                <div className="overline">Paid</div>
                                <div className="font-serif text-lg text-mpca-green-dark mt-1" data-testid="stat-exp-paid">{fmtINR(expStats.amount_paid_inr)}</div>
                            </div>
                        </div>
                    )}
                    {canEdit && (
                        <button onClick={() => setExpFormOpen(true)} className="btn-heritage-primary flex items-center gap-2" data-testid="new-exp-btn">
                            <Plus className="w-4 h-4" /> Record Expense
                        </button>
                    )}
                    <div className="space-y-2">
                        {expenses.map((e) => {
                            const meta = EXP_STATUS_META[e.status] || { label: e.status, tone: "lapsed" };
                            return (
                                <div key={e.id} className="border border-mpca-brass/40 bg-mpca-ivory p-4 flex items-center gap-3" data-testid={`exp-${e.id}`}>
                                    <Sparkles className="w-5 h-5 text-mpca-saffron shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="overline">{e.expense_no}</span>
                                            <Pill tone={meta.tone} label={meta.label} testId={`exp-status-${e.id}`} />
                                            <span className="text-xs text-mpca-gray-dark">{e.expense_type.replace(/_/g, " ")}</span>
                                        </div>
                                        <div className="text-sm text-mpca-navy mt-1">{e.description}</div>
                                        <div className="text-xs text-mpca-gray-dark mt-0.5">{e.venue_name} · {e.ground_name} · {fmtDate(e.expense_date)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-serif text-lg text-mpca-navy" data-testid={`exp-amount-${e.id}`}>{fmtINR(e.amount_inr)}</div>
                                    </div>
                                    <div className="flex gap-1">
                                        {e.status === "Draft" && canEdit && (
                                            <button onClick={() => handleExpenseAction(e.id, "submit")} className="btn-heritage-ghost text-xs px-2 py-1 flex items-center gap-1" data-testid={`exp-submit-${e.id}`}>
                                                <Send className="w-3 h-3" /> Submit
                                            </button>
                                        )}
                                        {e.status === "Submitted" && canApprove && (
                                            <>
                                                <button onClick={() => handleExpenseAction(e.id, "approve")} className="btn-heritage-ghost text-xs px-2 py-1 flex items-center gap-1 text-mpca-green-dark" data-testid={`exp-approve-${e.id}`}>
                                                    <CheckCircle2 className="w-3 h-3" /> Approve
                                                </button>
                                                <button onClick={() => handleExpenseAction(e.id, "reject")} className="btn-heritage-ghost text-xs px-2 py-1 flex items-center gap-1 text-mpca-oxblood" data-testid={`exp-reject-${e.id}`}>
                                                    <XCircle className="w-3 h-3" /> Reject
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <VenueForm open={venueFormOpen} onClose={() => setVenueFormOpen(false)} onSaved={() => reload()} persona={persona || {}} bodies={bodies} />
            <GroundForm open={groundFormOpen} onClose={() => setGroundFormOpen(false)} onSaved={() => reload()} venues={venues} bodies={bodies} />
            <ExpenseForm open={expFormOpen} onClose={() => setExpFormOpen(false)} onSaved={() => reload()} grounds={grounds} persona={persona || {}} />
        </div>
    );
}
