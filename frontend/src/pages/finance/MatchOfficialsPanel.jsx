import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldCheck, Info } from "lucide-react";
import { api } from "@/lib/api";

// MPCA-133 · Central Match-Official Assignment (simplified).
// This tab is a PURE ROSTER — MPCA picks who is officiating this tournament.
// Days, fees and DA are computed downstream by the Unified Budget Engine
// from the Match Calendar (per-match officials × match days). Nothing to
// budget here.
//
// MPCA-220 · Only 4 roles are relevant for CENTRAL assignment: Umpire,
// Scorer, Selector, Observer. Managers / coaches / trainers / physios are
// selected by Divisions when they submit their squad — not MPCA-owned.
const ROLE_OPTIONS = ["Umpire", "Scorer", "Selector", "Observer"];
const ROLE_SET = new Set(ROLE_OPTIONS);

const MatchOfficialsPanel = ({ tournament, persona }) => {
    const isMPCA = persona?.body_type === "State";
    const [assignments, setAssignments] = useState([]);
    const [officials, setOfficials] = useState([]);
    const [form, setForm] = useState({ official_id: "", role: "Umpire", notes: "" });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const [a, o] = await Promise.all([
                api.get(`/tournaments/${tournament.id}/match-officials`),
                api.get("/match-officials", { params: { active_only: true } }),
            ]);
            setAssignments(a.data || []);
            setOfficials(o.data || []);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
    };
    useEffect(() => { if (tournament?.id) load(); }, [tournament?.id]);

    const assign = async () => {
        if (!form.official_id) { setErr("Pick an official first."); return; }
        setBusy(true); setErr("");
        try {
            // Backend still expects `days` — we just default to 1 (unused for
            // budgeting; the unified engine reads days from Match Calendar).
            await api.post(`/tournaments/${tournament.id}/match-officials`, { ...form, days: 1 });
            setForm({ official_id: "", role: form.role, notes: "" });
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

    return (
        <div className="space-y-4" data-testid="mo-panel">
            <div className="bulletin-card p-4">
                <div className="flex items-start gap-2 mb-3">
                    <ShieldCheck size={16} className="text-mpca-oxblood shrink-0 mt-0.5" />
                    <div>
                        <div className="font-serif text-base text-mpca-green-dark">Match Officials · Central Assignment (MPCA)</div>
                        <div className="text-[11px] text-mpca-gray-dark italic">
                            MPCA-133 · Umpires, scorers, selectors and observers for this tournament are picked centrally by MPCA.
                            Fees and DA are computed automatically by the Unified Budget Engine from the Match Calendar — no numbers to enter here.
                            (Managers · Coaches · Trainers · Physios are selected by each Division as part of squad selection.)
                        </div>
                    </div>
                </div>

                {/* MPCA-only assign form — pure assignment, no days/fees */}
                {isMPCA && (
                    <div className="grid md:grid-cols-[1.5fr_1fr_1.5fr_auto] gap-2 items-end" data-testid="mo-assign-form">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Match Official</div>
                            <select className="input-heritage !py-1.5" value={form.official_id} onChange={(e) => setForm({ ...form, official_id: e.target.value })} data-testid="mo-official-select">
                                <option value="">— pick a person —</option>
                                {officials.filter((o) => ROLE_SET.has(o.role)).map((o) => (
                                    <option key={o.id} value={o.id}>{o.full_name}{o.grade ? ` · ${o.grade}` : ""}{o.role ? ` · ${o.role}` : ""}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Role</div>
                            <select className="input-heritage !py-1.5" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="mo-role-select">
                                {ROLE_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                            </select>
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

            {/* Assignments list — pure roster (no days/fees/DA/totals) */}
            <div className="bulletin-card p-4" data-testid="mo-list-card">
                <div className="overline mb-2">Assigned Officials ({assignments.length})</div>
                {assignments.length === 0 && (
                    <div className="text-[11px] text-mpca-gray-dark italic" data-testid="mo-empty">
                        No match officials assigned yet. Use the form above to build the tournament roster.
                    </div>
                )}
                {assignments.length > 0 && (
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="border-b border-mpca-brass/40 text-mpca-gray-dark uppercase text-[9px] tracking-widest">
                                <th className="text-left py-1">Name</th>
                                <th className="text-left py-1">Role</th>
                                <th className="text-left py-1">Body</th>
                                <th className="text-left py-1">Notes</th>
                                <th className="text-left py-1">Status</th>
                                {isMPCA && <th className="text-right py-1"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {assignments.map((a) => {
                                const status = a.acceptance_status || "Pending";
                                const pillCls =
                                    status === "Accepted" ? "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/50"
                                    : status === "Rejected" ? "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40"
                                    : "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40";
                                return (
                                    <tr key={a.id} className="border-b border-mpca-brass/20" data-testid={`mo-row-${a.id}`}>
                                        <td className="py-1.5 font-serif text-mpca-green-dark">
                                            {a.official_name}
                                            {status === "Rejected" && a.rejection_reason && (
                                                <div className="text-[10px] text-mpca-oxblood italic mt-0.5">Reason: {a.rejection_reason}</div>
                                            )}
                                        </td>
                                        <td className="py-1.5">{a.role}</td>
                                        <td className="py-1.5 text-mpca-gray-dark">{a.body_id || "—"}</td>
                                        <td className="py-1.5 text-mpca-gray-dark text-[10px] italic">{a.notes || ""}</td>
                                        <td className="py-1.5">
                                            <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${pillCls}`} data-testid={`mo-status-${a.id}`}>{status}</span>
                                        </td>
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
                <div className="mt-3 pt-3 border-t border-mpca-brass/20 text-[10px] text-mpca-brass italic">
                    Fees + DA for these officials are computed automatically by the Unified Budget Engine based on the Match Calendar (per-match assignment × match days). No manual entry needed here.
                </div>
            </div>
        </div>
    );
};

export default MatchOfficialsPanel;
