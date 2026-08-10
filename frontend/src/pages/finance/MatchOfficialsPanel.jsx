import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldCheck, Info, Save } from "lucide-react";
import { api } from "@/lib/api";
import { fmt } from "./financeShared";

/**
 * MPCA-133 · Central Match-Official Assignment panel.
 *
 * MPCA picks umpires / scorers / referees / physios for the whole tournament,
 * standard per-day fees + DA are applied automatically, and MPCA foots the
 * bill centrally (never charged to Division / District budgets).
 */
const MatchOfficialsPanel = ({ tournament, persona }) => {
    const isMPCA = persona?.body_type === "State";
    const [assignments, setAssignments] = useState([]);
    const [officials, setOfficials] = useState([]);
    const [rates, setRates] = useState({ fee_per_day: {}, da_per_day: {} });
    const [summary, setSummary] = useState(null);
    const [form, setForm] = useState({ official_id: "", role: "Umpire", days: tournament?.total_days || 3, notes: "" });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const [a, o, r, s] = await Promise.all([
                api.get(`/tournaments/${tournament.id}/match-officials`),
                api.get("/match-officials", { params: { active_only: true } }),
                api.get("/match-officials/rates/standard"),
                api.get(`/tournaments/${tournament.id}/match-officials/summary`),
            ]);
            setAssignments(a.data || []);
            setOfficials(o.data || []);
            setRates(r.data || { fee_per_day: {}, da_per_day: {} });
            setSummary(s.data || null);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
    };
    useEffect(() => { if (tournament?.id) load(); /* eslint-disable-next-line */ }, [tournament?.id]);

    const assign = async () => {
        if (!form.official_id) { setErr("Pick an official first."); return; }
        setBusy(true); setErr("");
        try {
            await api.post(`/tournaments/${tournament.id}/match-officials`, form);
            setForm({ official_id: "", role: "Umpire", days: tournament?.total_days || 3, notes: "" });
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const removeAssignment = async (aid) => {
        if (!window.confirm("Remove this match-official assignment?")) return;
        setBusy(true); setErr("");
        try {
            await api.delete(`/tournaments/${tournament.id}/match-officials/${aid}`);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const updateDays = async (aid, days) => {
        setBusy(true);
        try {
            await api.patch(`/tournaments/${tournament.id}/match-officials/${aid}`, { days: Math.max(1, Number(days) || 1) });
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    // Filter directory to the picked role (only show umpires when role=Umpire etc.)
    const officialsForRole = officials.filter((o) => o.role === form.role || (form.role === "Umpire" && o.role === "Umpire"));

    return (
        <div className="space-y-4" data-testid="mo-panel">
            <div className="bulletin-card p-4">
                <div className="flex items-start gap-2 mb-3">
                    <ShieldCheck size={16} className="text-mpca-oxblood shrink-0 mt-0.5" />
                    <div>
                        <div className="font-serif text-base text-mpca-green-dark">Match Officials · Central Assignment (MPCA)</div>
                        <div className="text-[11px] text-mpca-gray-dark italic">
                            MPCA-133 · Umpires, scorers, referees and physios for this tournament are picked by MPCA and paid centrally from the officiating pool.
                            Standard per-day fees + DA apply automatically and never appear on Division / District budgets.
                        </div>
                    </div>
                </div>

                {/* Standard rate card */}
                <div className="mb-3 border-l-4 border-mpca-brass bg-mpca-brass/10 px-3 py-2 text-[11px]" data-testid="mo-rate-card">
                    <div className="overline text-[9px] text-mpca-oxblood mb-1">Standard Rate Card (₹ / day)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 font-mono text-mpca-charcoal">
                        {Object.keys(rates.fee_per_day || {}).map((k) => (
                            <div key={k}>
                                <span className="text-mpca-gray-dark">{k}</span> · Fee {fmt(rates.fee_per_day[k])} · DA {fmt(rates.da_per_day[k])}
                            </div>
                        ))}
                    </div>
                </div>

                {/* MPCA-only assign form */}
                {isMPCA && (
                    <div className="grid md:grid-cols-[1.5fr_1fr_0.7fr_1fr_auto] gap-2 items-end" data-testid="mo-assign-form">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Match Official</div>
                            <select className="input-heritage !py-1.5" value={form.official_id} onChange={(e) => setForm({ ...form, official_id: e.target.value })} data-testid="mo-official-select">
                                <option value="">— pick a person —</option>
                                {officialsForRole.map((o) => (
                                    <option key={o.id} value={o.id}>{o.full_name} · {o.grade}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Role</div>
                            <select className="input-heritage !py-1.5" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="mo-role-select">
                                {Object.keys(rates.fee_per_day || {}).map((k) => <option key={k} value={k}>{k}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Days</div>
                            <input type="number" min={1} className="input-heritage !py-1.5 font-mono" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) || 1 })} data-testid="mo-days-input" />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Notes (optional)</div>
                            <input type="text" className="input-heritage !py-1.5" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="mo-notes-input" />
                        </label>
                        <button className="btn-heritage-primary" onClick={assign} disabled={busy} data-testid="mo-assign-btn">
                            <Plus size={12} /> Assign
                        </button>
                    </div>
                )}
                {!isMPCA && (
                    <div className="text-[11px] text-mpca-gray-dark italic flex items-center gap-1">
                        <Info size={12} /> Only MPCA can assign match officials centrally. Contact MPCA to raise a request.
                    </div>
                )}
                {err && <div className="text-[11px] text-mpca-oxblood mt-2 font-mono" data-testid="mo-error">{err}</div>}
            </div>

            {/* Assignments list */}
            <div className="bulletin-card p-4" data-testid="mo-list-card">
                <div className="overline mb-2">Assigned Officials ({assignments.length})</div>
                {assignments.length === 0 && (
                    <div className="text-[11px] text-mpca-gray-dark italic" data-testid="mo-empty">
                        No match officials assigned yet.
                    </div>
                )}
                {assignments.length > 0 && (
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="border-b border-mpca-brass/40 text-mpca-gray-dark uppercase text-[9px] tracking-widest">
                                <th className="text-left py-1">Name</th>
                                <th className="text-left py-1">Role</th>
                                <th className="text-left py-1">Body</th>
                                <th className="text-right py-1">Days</th>
                                <th className="text-right py-1">Fee/Day</th>
                                <th className="text-right py-1">DA/Day</th>
                                <th className="text-right py-1">Total (Fee + DA)</th>
                                {isMPCA && <th className="text-right py-1"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {assignments.map((a) => {
                                const feeTotal = (a.per_day_fee_inr || 0) * (a.days || 0);
                                const daTotal = (a.per_day_da_inr || 0) * (a.days || 0);
                                const status = a.acceptance_status || "Pending";
                                const pillCls =
                                    status === "Accepted" ? "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/50"
                                    : status === "Rejected" ? "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40 animate-pulse"
                                    : "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40";
                                return (
                                    <tr key={a.id} className="border-b border-mpca-brass/20" data-testid={`mo-row-${a.id}`}>
                                        <td className="py-1.5 font-serif text-mpca-green-dark">
                                            {a.official_name}
                                            <span className={`ml-2 text-[8px] font-mono uppercase tracking-widest px-1 py-0.5 border ${pillCls}`} data-testid={`mo-status-${a.id}`}>{status}</span>
                                            {status === "Rejected" && a.rejection_reason && (
                                                <div className="text-[10px] text-mpca-oxblood italic mt-0.5">Reason: {a.rejection_reason}</div>
                                            )}
                                        </td>
                                        <td className="py-1.5">{a.role}</td>
                                        <td className="py-1.5 text-mpca-gray-dark">{a.body_id || "—"}</td>
                                        <td className="py-1.5 text-right font-mono">
                                            {isMPCA ? (
                                                <input type="number" min={1} className="w-14 text-right font-mono border border-mpca-brass/40 px-1 py-0.5" defaultValue={a.days} onBlur={(e) => e.target.value != a.days && updateDays(a.id, e.target.value)} data-testid={`mo-days-${a.id}`} />
                                            ) : a.days}
                                        </td>
                                        <td className="py-1.5 text-right font-mono">{fmt(a.per_day_fee_inr)}</td>
                                        <td className="py-1.5 text-right font-mono">{fmt(a.per_day_da_inr)}</td>
                                        <td className="py-1.5 text-right font-mono font-semibold">{fmt(feeTotal + daTotal)}</td>
                                        {isMPCA && (
                                            <td className="py-1.5 text-right">
                                                <button className="text-mpca-oxblood hover:bg-mpca-oxblood/10 p-1" onClick={() => removeAssignment(a.id)} title="Remove / re-post" data-testid={`mo-remove-${a.id}`}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* Summary strip */}
                {summary && summary.assignments > 0 && (
                    <div className="mt-3 pt-3 border-t border-mpca-brass/30 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono" data-testid="mo-summary">
                        <div><span className="text-mpca-gray-dark">Fee Total</span> · <b>{fmt(summary.fee_total_inr)}</b></div>
                        <div><span className="text-mpca-gray-dark">DA Total</span> · <b>{fmt(summary.da_total_inr)}</b></div>
                        <div><span className="text-mpca-gray-dark">Grand Total</span> · <b className="text-mpca-oxblood">{fmt(summary.grand_total_inr)}</b></div>
                        <div className="text-mpca-brass italic">Paid by · <b>MPCA</b> (not Divisions)</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MatchOfficialsPanel;
