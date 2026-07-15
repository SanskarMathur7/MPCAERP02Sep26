import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Wallet, Calendar, ArrowRight, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const CAMP_TYPES = [
    { code: "Periodical_Coaching", label: "Periodical Coaching", scheme: "3-A" },
    { code: "Vacation_Camp", label: "Vacation Camp", scheme: "3-B" },
    { code: "Reciprocal_Match", label: "Reciprocal Match", scheme: "3-C" },
    { code: "Pre_Tournament_Camp", label: "Pre-Tournament Camp", scheme: "3-D" },
];

const emptyForm = {
    name: "", camp_type: "Periodical_Coaching", body_id: "", scheme_code: "3-A",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    venue_hint: "", coach_name: "", trainer_name: "", manager_name: "",
    target_age_group: "U-18", planned_participants: 20, notes: "",
};

const CampsPage = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [camps, setCamps] = useState([]);
    const [schemes, setSchemes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: c }, { data: s }] = await Promise.all([
                api.get("/camps"),
                api.get("/reimbursement-schemes"),
            ]);
            setCamps(c || []);
            setSchemes(s || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const canCreate = ["division-secretary", "district-secretary", "secretary", "president"].includes(persona?.id);

    const openForm = () => {
        setForm({ ...emptyForm, body_id: persona?.body_code || "" });
        setShowForm(true);
    };

    const saveCamp = async () => {
        try {
            const payload = { ...form, planned_participants: parseInt(form.planned_participants) || 0, created_by: persona?.name };
            await api.post("/camps", payload);
            setShowForm(false);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading) return <CricketLoader label="Loading camps..." />;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="camps-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Operations · Camps & Coaching</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Camps & Coaching</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Coaching camps organised under MPCA schemes 3-A (Periodical), 3-B (Vacation), 3-C (Reciprocal) and 3-D (Pre-Tournament). Assign the scheme, auto-budget is created, invoices are managed in the same Tournament Reimbursement Matrix pipeline.
                    </p>
                </div>
                {canCreate && (
                    <button className="btn-heritage-primary" onClick={openForm} data-testid="new-camp-btn">
                        <Plus size={12} /> New Camp
                    </button>
                )}
            </div>

            {/* Camp-type overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {CAMP_TYPES.map((t) => {
                    const count = camps.filter((c) => c.camp_type === t.code).length;
                    const sch = schemes.find((s) => s.scheme_code === t.scheme);
                    return (
                        <div key={t.code} className="bulletin-card p-4" data-testid={`camp-type-${t.code}`}>
                            <div className="overline text-[9px]">Scheme {t.scheme}</div>
                            <div className="font-serif text-lg text-mpca-green-dark mt-1">{t.label}</div>
                            <div className="text-[11px] text-mpca-gray-dark mt-2">{count} camp(s)</div>
                            {sch && <div className="text-[10px] text-mpca-brass mt-1">{sch.heads.length} budget heads</div>}
                        </div>
                    );
                })}
            </div>

            {camps.length === 0 ? (
                <div className="bulletin-card p-12 text-center">
                    <Users className="mx-auto text-mpca-brass mb-3" size={32} />
                    <div className="font-serif text-xl text-mpca-green-dark">No camps yet.</div>
                    <p className="text-[11px] text-mpca-gray-dark mt-2">Create your first camp to plan participants, coaching staff, and access the scheme budget.</p>
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden">
                    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                        <div className="col-span-4">Camp · Scheme</div>
                        <div className="col-span-2">Type</div>
                        <div className="col-span-2">Dates</div>
                        <div className="col-span-1 text-right">Pax</div>
                        <div className="col-span-2">Body</div>
                        <div className="col-span-1">Status</div>
                    </div>
                    {camps.map((c) => (
                        <div key={c.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center border-b border-mpca-brass/10 cursor-pointer hover:bg-mpca-cream/40" onClick={() => navigate(`/tournaments/${c.id}/finance`)} data-testid={`camp-row-${c.id}`}>
                            <div className="col-span-4">
                                <div className="font-serif text-sm text-mpca-green-dark">{c.name}</div>
                                <div className="text-[10px] font-mono text-mpca-brass">{c.camp_no} · Scheme {c.scheme_code}</div>
                            </div>
                            <div className="col-span-2 text-[11px]">{CAMP_TYPES.find((t) => t.code === c.camp_type)?.label || c.camp_type}</div>
                            <div className="col-span-2 text-[10px] text-mpca-gray-dark">{c.start_date} → {c.end_date}</div>
                            <div className="col-span-1 text-right font-mono">{c.planned_participants}</div>
                            <div className="col-span-2 text-[10px] font-mono text-mpca-brass">{c.body_id}</div>
                            <div className="col-span-1">
                                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-mpca-brass/40 text-mpca-brass">{c.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* New Camp form */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setShowForm(false)}>
                    <div className="bulletin-card p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="new-camp-modal">
                        <div className="font-serif text-2xl text-mpca-green-dark mb-4">New Camp</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="md:col-span-2"><div className="overline text-[9px] mb-1">Camp Name *</div><input className="input-heritage" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Winter Coaching Camp — Indore Division U-18" data-testid="camp-name" /></label>
                            <label>
                                <div className="overline text-[9px] mb-1">Camp Type *</div>
                                <select className="input-heritage" value={form.camp_type} onChange={(e) => {
                                    const type = CAMP_TYPES.find((t) => t.code === e.target.value);
                                    setForm({ ...form, camp_type: e.target.value, scheme_code: type?.scheme || form.scheme_code });
                                }} data-testid="camp-type-select">
                                    {CAMP_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label} (Scheme {t.scheme})</option>)}
                                </select>
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Body (Organising) *</div>
                                <input className="input-heritage" value={form.body_id} onChange={(e) => setForm({ ...form, body_id: e.target.value })} placeholder="DIV-IND" data-testid="camp-body" />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Start Date *</div>
                                <input type="date" className="input-heritage" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="camp-start" />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">End Date *</div>
                                <input type="date" className="input-heritage" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="camp-end" />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Target Age Group</div>
                                <input className="input-heritage" value={form.target_age_group} onChange={(e) => setForm({ ...form, target_age_group: e.target.value })} placeholder="U-18" />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Planned Participants</div>
                                <input type="number" className="input-heritage" value={form.planned_participants} onChange={(e) => setForm({ ...form, planned_participants: e.target.value })} />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Venue / Location</div>
                                <input className="input-heritage" value={form.venue_hint} onChange={(e) => setForm({ ...form, venue_hint: e.target.value })} placeholder="Nehru Stadium, Indore" />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Coach</div>
                                <input className="input-heritage" value={form.coach_name} onChange={(e) => setForm({ ...form, coach_name: e.target.value })} />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Trainer</div>
                                <input className="input-heritage" value={form.trainer_name} onChange={(e) => setForm({ ...form, trainer_name: e.target.value })} />
                            </label>
                            <label>
                                <div className="overline text-[9px] mb-1">Manager</div>
                                <input className="input-heritage" value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} />
                            </label>
                            <label className="md:col-span-2">
                                <div className="overline text-[9px] mb-1">Notes</div>
                                <textarea rows={2} className="input-heritage" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button className="btn-heritage-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                            <button className="btn-heritage-primary" onClick={saveCamp} disabled={!form.name || !form.body_id} data-testid="save-camp-btn">Create Camp</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CampsPage;
