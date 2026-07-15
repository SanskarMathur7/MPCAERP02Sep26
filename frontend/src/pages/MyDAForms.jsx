import { useEffect, useState } from "react";
import { Send, Save, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const MyDAForms = () => {
    const { persona } = useAuth();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // form being edited (local copy)

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/match-official-da`, { params: { official_name: persona?.name } });
            setForms(data || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const startEdit = (f) => setEditing({ ...f, days: f.days || 0, travel_amount_inr: f.travel_amount_inr || 0, food_amount_inr: f.food_amount_inr || 0, misc_amount_inr: f.misc_amount_inr || 0 });

    const saveEdit = async () => {
        try {
            const patch = {
                days: parseInt(editing.days) || 0,
                travel_amount_inr: parseFloat(editing.travel_amount_inr) || 0,
                food_amount_inr: parseFloat(editing.food_amount_inr) || 0,
                misc_amount_inr: parseFloat(editing.misc_amount_inr) || 0,
                bank_account_no: editing.bank_account_no || null,
                bank_ifsc: editing.bank_ifsc || null,
                pan: editing.pan || null,
                notes: editing.notes || null,
            };
            await api.patch(`/match-official-da/${editing.id}`, patch);
            setEditing(null);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const submitForm = async (id) => {
        if (!window.confirm("Submit this DA form? You will not be able to edit after submission.")) return;
        try { await api.post(`/match-official-da/${id}/submit`); await load(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading) return <CricketLoader label="Loading DA forms..." />;

    // Live-compute totals if editing
    const computeTotal = (f) => {
        const days = parseInt(f.days) || 0;
        const rate = f.da_rate_inr || 0;
        return days * rate + (parseFloat(f.travel_amount_inr) || 0) + (parseFloat(f.food_amount_inr) || 0) + (parseFloat(f.misc_amount_inr) || 0);
    };

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-4xl mx-auto" data-testid="my-da-forms-page">
            <div className="mb-6">
                <div className="overline">Match Official Portal</div>
                <h1 className="font-serif text-4xl text-mpca-green-dark mt-3">My DA / TA Forms</h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                    Submit your Daily Allowance (DA) forms for tournaments you officiated. Enter days worked, travel, food, and misc expenses. Once submitted, the Division and MPCA will review for approval.
                </p>
            </div>

            {forms.length === 0 ? (
                <div className="bulletin-card p-16 text-center">
                    <CheckCircle2 className="mx-auto text-mpca-brass mb-4" size={36} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No DA forms assigned yet.</div>
                    <p className="text-[11px] text-mpca-gray-dark mt-2">Forms are auto-created when you're allocated to a tournament as a match official.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {forms.map((f) => {
                        const isEdit = editing?.id === f.id;
                        const cur = isEdit ? editing : f;
                        const total = computeTotal(cur);
                        const daAmount = (parseInt(cur.days) || 0) * (cur.da_rate_inr || 0);
                        return (
                            <div key={f.id} className="bulletin-card p-5" data-testid={`da-form-${f.id}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="font-mono text-[10px] text-mpca-brass">{f.da_ref}</div>
                                        <div className="font-serif text-xl text-mpca-green-dark mt-0.5">{f.tournament_name}</div>
                                        <div className="text-[11px] text-mpca-gray-dark">{f.official_role} · Rate ₹{f.da_rate_inr}/day</div>
                                    </div>
                                    <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                                        f.status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" :
                                        f.status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" :
                                        f.status === "Submitted" ? "border-mpca-brass text-mpca-brass" :
                                        f.status === "Paid" ? "border-mpca-green-dark bg-mpca-green-dark text-mpca-ivory" :
                                        "border-mpca-gray-dark text-mpca-gray-dark"
                                    }`}>
                                        {f.status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <label>
                                        <div className="overline text-[9px] mb-1">Days Officiated</div>
                                        {isEdit ? (
                                            <input type="number" className="input-heritage" value={cur.days} onChange={(e) => setEditing({ ...editing, days: e.target.value })} data-testid={`edit-days-${f.id}`} />
                                        ) : <div className="font-mono text-lg">{cur.days || 0}</div>}
                                    </label>
                                    <div>
                                        <div className="overline text-[9px] mb-1">DA (auto)</div>
                                        <div className="font-mono text-lg">{fmt(daAmount)}</div>
                                    </div>
                                    <label>
                                        <div className="overline text-[9px] mb-1">Travel (₹)</div>
                                        {isEdit ? (
                                            <input type="number" className="input-heritage" value={cur.travel_amount_inr} onChange={(e) => setEditing({ ...editing, travel_amount_inr: e.target.value })} data-testid={`edit-travel-${f.id}`} />
                                        ) : <div className="font-mono">{fmt(cur.travel_amount_inr)}</div>}
                                    </label>
                                    <label>
                                        <div className="overline text-[9px] mb-1">Food (₹)</div>
                                        {isEdit ? (
                                            <input type="number" className="input-heritage" value={cur.food_amount_inr} onChange={(e) => setEditing({ ...editing, food_amount_inr: e.target.value })} data-testid={`edit-food-${f.id}`} />
                                        ) : <div className="font-mono">{fmt(cur.food_amount_inr)}</div>}
                                    </label>
                                    <label>
                                        <div className="overline text-[9px] mb-1">Misc (₹)</div>
                                        {isEdit ? (
                                            <input type="number" className="input-heritage" value={cur.misc_amount_inr} onChange={(e) => setEditing({ ...editing, misc_amount_inr: e.target.value })} data-testid={`edit-misc-${f.id}`} />
                                        ) : <div className="font-mono">{fmt(cur.misc_amount_inr)}</div>}
                                    </label>
                                    <label className="md:col-span-2">
                                        <div className="overline text-[9px] mb-1">Bank Account No.</div>
                                        {isEdit ? (
                                            <input className="input-heritage" value={cur.bank_account_no || ""} onChange={(e) => setEditing({ ...editing, bank_account_no: e.target.value })} data-testid={`edit-bank-${f.id}`} />
                                        ) : <div className="font-mono text-xs">{cur.bank_account_no || "—"}</div>}
                                    </label>
                                    <label>
                                        <div className="overline text-[9px] mb-1">IFSC</div>
                                        {isEdit ? (
                                            <input className="input-heritage" value={cur.bank_ifsc || ""} onChange={(e) => setEditing({ ...editing, bank_ifsc: e.target.value })} />
                                        ) : <div className="font-mono text-xs">{cur.bank_ifsc || "—"}</div>}
                                    </label>
                                    <label>
                                        <div className="overline text-[9px] mb-1">PAN</div>
                                        {isEdit ? (
                                            <input className="input-heritage" value={cur.pan || ""} onChange={(e) => setEditing({ ...editing, pan: e.target.value })} />
                                        ) : <div className="font-mono text-xs">{cur.pan || "—"}</div>}
                                    </label>
                                </div>

                                <div className="mt-4 flex justify-between items-center border-t border-mpca-brass/20 pt-3">
                                    <div>
                                        <div className="overline text-[9px]">Total Claim</div>
                                        <div className="font-serif text-2xl text-mpca-green-dark">{fmt(total)}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        {f.status === "Rejected" && f.rejection_reason && (
                                            <div className="text-[11px] text-mpca-oxblood italic mr-2 max-w-xs">Rejected: {f.rejection_reason}</div>
                                        )}
                                        {(f.status === "Draft" || f.status === "Rejected") && !isEdit && (
                                            <button className="btn-heritage-secondary" onClick={() => startEdit(f)} data-testid={`edit-form-${f.id}`}>Edit</button>
                                        )}
                                        {isEdit && (
                                            <>
                                                <button className="btn-heritage-secondary" onClick={() => setEditing(null)}>Cancel</button>
                                                <button className="btn-heritage-primary" onClick={saveEdit} data-testid={`save-form-${f.id}`}><Save size={12} /> Save</button>
                                            </>
                                        )}
                                        {(f.status === "Draft" || f.status === "Rejected") && !isEdit && (
                                            <button className="btn-heritage-primary" onClick={() => submitForm(f.id)} disabled={(cur.days || 0) === 0} data-testid={`submit-form-${f.id}`}>
                                                <Send size={12} /> Submit
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {f.submitted_at && (
                                    <div className="text-[10px] text-mpca-gray-dark mt-2">
                                        Submitted {new Date(f.submitted_at).toLocaleString()}
                                        {f.approved_by && ` · Approved by ${f.approved_by}`}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MyDAForms;
