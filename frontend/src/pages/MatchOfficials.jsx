import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, Trash2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const ROLES = ["Umpire", "Scorer", "Referee", "Manager", "Coach", "Trainer", "Physio"];
const GRADES = ["BCCI_Panel", "State_Panel", "Division_Panel", "District_Panel", "Trainee"];

const empty = { full_name: "", role: "Umpire", grade: "State_Panel", body_id: "MPCA", phone: "", email: "", accreditation_no: "", years_of_experience: 0, fee_per_match_inr: "", is_active: true, notes: "" };

const MatchOfficials = () => {
    const { persona, isOfficeBearer } = useAuth();
    const [list, setList] = useState([]);
    const [bodies, setBodies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...empty, body_id: persona?.body_code || "MPCA" });
    const [roleFilter, setRoleFilter] = useState("all");

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: officials }, { data: bs }] = await Promise.all([
                api.get("/match-officials"),
                api.get("/bodies"),
            ]);
            setList(officials);
            setBodies(bs);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const save = async () => {
        try {
            const payload = { ...form, years_of_experience: parseInt(form.years_of_experience) || 0, fee_per_match_inr: form.fee_per_match_inr ? parseFloat(form.fee_per_match_inr) : null };
            await api.post("/match-officials", payload);
            setShowForm(false);
            setForm({ ...empty, body_id: persona?.body_code || "MPCA" });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const del = async (id) => {
        if (!window.confirm("Remove this official?")) return;
        try { await api.delete(`/match-officials/${id}`); await load(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const bodyOpts = bodies.filter((b) => ["State", "Division", "District"].includes(b.body_type));
    const filtered = roleFilter === "all" ? list : list.filter((o) => o.role === roleFilter);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="match-officials-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Article VII.4 · Officials Directory</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Match Officials</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">Roster of umpires, scorers, referees and team support staff. Divisions pick from their own body&apos;s list when submitting squads to MPCA.</p>
                </div>
                {isOfficeBearer && (
                    <button className="btn-heritage-primary" onClick={() => setShowForm(true)} data-testid="new-official-btn">
                        <Plus size={14} /> Add Official
                    </button>
                )}
            </div>

            <div className="flex gap-1 mb-4 flex-wrap">
                {["all", ...ROLES].map((r) => (
                    <button key={r} onClick={() => setRoleFilter(r)}
                        className={`px-3 py-1.5 text-[11px] uppercase tracking-widest border ${roleFilter === r ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-brass/40 text-mpca-green-dark"}`}
                        data-testid={`off-filter-${r}`}>{r}</button>
                ))}
            </div>

            {showForm && (
                <div className="bulletin-card p-6 mb-6 relative" data-testid="official-form">
                    <button onClick={() => setShowForm(false)} className="absolute top-3 right-3 text-mpca-brass"><X size={18} /></button>
                    <div className="grid md:grid-cols-2 gap-4">
                        <label><div className="overline text-[9px] mb-1">Full Name *</div><input className="input-heritage" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="off-name" /></label>
                        <label><div className="overline text-[9px] mb-1">Role *</div><select className="input-heritage" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="off-role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
                        <label><div className="overline text-[9px] mb-1">Grade</div><select className="input-heritage" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>{GRADES.map((g) => <option key={g} value={g}>{g.replace(/_/g, " ")}</option>)}</select></label>
                        <label><div className="overline text-[9px] mb-1">Body *</div><select className="input-heritage" value={form.body_id} onChange={(e) => setForm({ ...form, body_id: e.target.value })} data-testid="off-body">{bodyOpts.map((b) => <option key={b.code} value={b.code}>[{b.body_type}] {b.name}</option>)}</select></label>
                        <label><div className="overline text-[9px] mb-1">Phone</div><input className="input-heritage" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                        <label><div className="overline text-[9px] mb-1">Email</div><input className="input-heritage" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                        <label><div className="overline text-[9px] mb-1">Accreditation No.</div><input className="input-heritage" value={form.accreditation_no} onChange={(e) => setForm({ ...form, accreditation_no: e.target.value })} /></label>
                        <label><div className="overline text-[9px] mb-1">Experience (yrs)</div><input type="number" className="input-heritage" value={form.years_of_experience} onChange={(e) => setForm({ ...form, years_of_experience: e.target.value })} /></label>
                        <label><div className="overline text-[9px] mb-1">Fee / Match (₹)</div><input type="number" className="input-heritage" value={form.fee_per_match_inr} onChange={(e) => setForm({ ...form, fee_per_match_inr: e.target.value })} /></label>
                    </div>
                    <div className="mt-4 flex justify-end"><button className="btn-heritage-primary" onClick={save} disabled={!form.full_name} data-testid="save-official-btn">Save Official</button></div>
                </div>
            )}

            {loading ? <CricketLoader label="Loading…" /> : filtered.length === 0 ? (
                <div className="bulletin-card p-16 text-center"><ShieldCheck className="mx-auto text-mpca-brass mb-4" size={36} /><div className="font-serif text-2xl text-mpca-green-dark">No officials on record yet.</div></div>
            ) : (
                <div className="bulletin-card overflow-hidden">
                    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-mpca-green-dark text-mpca-gold-light text-[10px] uppercase tracking-widest">
                        <div className="col-span-3">Name</div><div className="col-span-2">Role · Grade</div><div className="col-span-2">Body</div><div className="col-span-1">Exp</div><div className="col-span-2">Contact</div><div className="col-span-1">Fee</div><div className="col-span-1"></div>
                    </div>
                    {filtered.map((o) => (
                        <div key={o.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center border-b border-mpca-brass/10" data-testid={`off-row-${o.id}`}>
                            <div className="col-span-3 font-serif text-mpca-green-dark">{o.full_name}{o.accreditation_no && <div className="text-[10px] font-mono text-mpca-brass">{o.accreditation_no}</div>}</div>
                            <div className="col-span-2 text-xs"><div>{o.role}</div><div className="text-[10px] text-mpca-gray-dark">{o.grade.replace(/_/g, " ")}</div></div>
                            <div className="col-span-2 text-xs font-mono text-mpca-brass">{o.body_id}</div>
                            <div className="col-span-1 text-xs font-mono">{o.years_of_experience}y</div>
                            <div className="col-span-2 text-[11px] text-mpca-gray-dark truncate">{o.phone || o.email || "—"}</div>
                            <div className="col-span-1 text-xs font-mono">{o.fee_per_match_inr ? `₹${o.fee_per_match_inr}` : "—"}</div>
                            <div className="col-span-1 text-right flex items-center justify-end gap-2">
                                <Link to={`/match-officials/${o.id}`} className="text-[9px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood underline underline-offset-2" data-testid={`view-off-${o.id}`}>View</Link>
                                {isOfficeBearer && <button onClick={() => del(o.id)} className="text-mpca-oxblood" data-testid={`del-off-${o.id}`}><Trash2 size={12} /></button>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MatchOfficials;
