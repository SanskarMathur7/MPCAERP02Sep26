import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, ClipboardEdit, FileText, ShieldCheck, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// Simple ₹ formatter — matches other finance surfaces.
const fmt = (v) => "₹" + Math.round(Number(v || 0)).toLocaleString("en-IN");

/**
 * MPCA-133+ · Match-Official Portal.
 *
 * Lists every tournament assignment addressed to the logged-in Match
 * Official (`persona.body_type === "External"` + role `match-official`).
 * Fee + DA totals are shown upfront (informed decision). Accept / Reject on
 * Pending rows; Reject prompts for a reason. Once Accepted, a "Submit DA"
 * link jumps to the tournament's DA form.
 */
const MyAssignments = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(null); // aid being updated
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true); setErr("");
        try {
            const r = await api.get("/match-officials/me/assignments");
            setRows(r.data?.assignments || []);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const accept = async (a) => {
        setBusy(a.id); setErr("");
        try {
            await api.post(`/tournaments/${a.tournament_id}/match-officials/${a.id}/accept`);
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(null); }
    };

    const reject = async (a) => {
        const reason = window.prompt("Reason for rejecting this assignment?");
        if (!reason || !reason.trim()) return;
        setBusy(a.id); setErr("");
        try {
            await api.post(`/tournaments/${a.tournament_id}/match-officials/${a.id}/reject`, { reason: reason.trim() });
            await load();
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(null); }
    };

    const totals = rows.reduce((acc, r) => ({
        fee: acc.fee + (r.fee_total_inr || 0),
        da: acc.da + (r.da_total_inr || 0),
        pending: acc.pending + (r.acceptance_status === "Pending" ? 1 : 0),
        accepted: acc.accepted + (r.acceptance_status === "Accepted" ? 1 : 0),
    }), { fee: 0, da: 0, pending: 0, accepted: 0 });

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-8" data-testid="my-assignments-page">
            <div className="flex items-center gap-3 mb-6">
                <ShieldCheck size={22} className="text-mpca-oxblood" />
                <div>
                    <div className="overline text-[10px] text-mpca-brass">Match Official Portal</div>
                    <h1 className="font-serif text-3xl text-mpca-green-dark">My Assignments</h1>
                    <div className="text-[11px] text-mpca-gray-dark italic">
                        Signed in as <b>{persona?.name || "—"}</b>. Fees + DA below are the MPCA standard rates and will be paid centrally on completion.
                    </div>
                </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="my-assignments-kpis">
                <div className="bulletin-card p-3">
                    <div className="text-[10px] text-mpca-gray-dark uppercase">Total Assignments</div>
                    <div className="font-mono text-2xl text-mpca-green-dark">{rows.length}</div>
                </div>
                <div className="bulletin-card p-3">
                    <div className="text-[10px] text-mpca-brass uppercase">Awaiting Response</div>
                    <div className="font-mono text-2xl text-mpca-brass">{totals.pending}</div>
                </div>
                <div className="bulletin-card p-3">
                    <div className="text-[10px] text-mpca-green-dark uppercase">Accepted</div>
                    <div className="font-mono text-2xl text-mpca-green-dark">{totals.accepted}</div>
                </div>
                <div className="bulletin-card p-3">
                    <div className="text-[10px] text-mpca-oxblood uppercase">Total Earning (Accepted)</div>
                    <div className="font-mono text-2xl text-mpca-oxblood">{fmt(rows.filter(r => r.acceptance_status === "Accepted").reduce((s, r) => s + (r.grand_total_inr || 0), 0))}</div>
                </div>
            </div>

            {loading && <div className="flex items-center gap-2 text-mpca-gray-dark text-sm py-8"><Loader2 className="animate-spin" size={14} /> Loading…</div>}
            {err && <div className="text-[11px] text-mpca-oxblood font-mono mb-3" data-testid="my-assignments-error">{err}</div>}
            {!loading && rows.length === 0 && (
                <div className="py-16 text-center border border-dashed border-mpca-brass/30 text-[12px] italic text-mpca-gray-dark" data-testid="my-assignments-empty">
                    You have no assignments yet. MPCA will notify you when you&apos;re posted to a tournament.
                </div>
            )}

            {!loading && rows.length > 0 && (
                <div className="bulletin-card p-0 overflow-hidden" data-testid="my-assignments-list">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="border-b-2 border-mpca-brass/40 text-mpca-gray-dark uppercase text-[9px] tracking-widest bg-mpca-parchment/50">
                                <th className="text-left py-2 px-3">Tournament</th>
                                <th className="text-left py-2 px-3">Role</th>
                                <th className="text-right py-2 px-3">Days</th>
                                <th className="text-right py-2 px-3">Fee</th>
                                <th className="text-right py-2 px-3">DA</th>
                                <th className="text-right py-2 px-3">Total</th>
                                <th className="text-center py-2 px-3">Status</th>
                                <th className="text-right py-2 px-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((a) => {
                                const status = a.acceptance_status || "Pending";
                                const pillCls =
                                    status === "Accepted" ? "bg-mpca-green-dark text-mpca-ivory"
                                    : status === "Rejected" ? "bg-mpca-oxblood text-mpca-ivory"
                                    : "bg-mpca-brass text-mpca-ivory animate-pulse";
                                return (
                                    <tr key={a.id} className="border-b border-mpca-brass/15 hover:bg-mpca-parchment/30" data-testid={`ma-row-${a.id}`}>
                                        <td className="py-3 px-3">
                                            <Link to={`/tournaments/${a.tournament_id}`} className="font-serif text-mpca-green-dark hover:text-mpca-oxblood">
                                                {a.tournament_name || a.tournament_id}
                                            </Link>
                                            {a.notes && <div className="text-[10px] text-mpca-gray-dark italic mt-0.5">{a.notes}</div>}
                                            {status === "Rejected" && a.rejection_reason && (
                                                <div className="text-[10px] text-mpca-oxblood italic mt-0.5">Rejected — {a.rejection_reason}</div>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-mpca-charcoal">{a.role}</td>
                                        <td className="py-3 px-3 text-right font-mono">{a.days}</td>
                                        <td className="py-3 px-3 text-right font-mono">{fmt(a.fee_total_inr)}</td>
                                        <td className="py-3 px-3 text-right font-mono">{fmt(a.da_total_inr)}</td>
                                        <td className="py-3 px-3 text-right font-mono font-semibold text-mpca-oxblood">{fmt(a.grand_total_inr)}</td>
                                        <td className="py-3 px-3 text-center">
                                            <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 ${pillCls}`} data-testid={`ma-status-${a.id}`}>{status}</span>
                                        </td>
                                        <td className="py-3 px-3 text-right">
                                            {status === "Pending" && (
                                                <div className="inline-flex gap-1">
                                                    <button
                                                        onClick={() => accept(a)}
                                                        disabled={busy === a.id}
                                                        className="text-[10px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-2.5 py-1 hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1"
                                                        data-testid={`ma-accept-${a.id}`}
                                                    >
                                                        <CheckCircle2 size={11} /> Accept
                                                    </button>
                                                    <button
                                                        onClick={() => reject(a)}
                                                        disabled={busy === a.id}
                                                        className="text-[10px] uppercase tracking-widest border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors px-2.5 py-1 disabled:opacity-40 inline-flex items-center gap-1"
                                                        data-testid={`ma-reject-${a.id}`}
                                                    >
                                                        <XCircle size={11} /> Reject
                                                    </button>
                                                </div>
                                            )}
                                            {status === "Accepted" && (
                                                <Link
                                                    to={`/tournaments/${a.tournament_id}?open=my-da`}
                                                    className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2.5 py-1 hover:opacity-90 inline-flex items-center gap-1"
                                                    data-testid={`ma-submit-da-${a.id}`}
                                                >
                                                    <ClipboardEdit size={11} /> Submit DA
                                                </Link>
                                            )}
                                            {status === "Rejected" && (
                                                <span className="text-[10px] italic text-mpca-gray-dark">MPCA will re-post</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-6 text-[10px] text-mpca-gray-dark italic flex items-center gap-1.5" data-testid="my-assignments-note">
                <FileText size={11} /> Fees and DA are set centrally by MPCA and paid on tournament closure. Contact MPCA Secretariat for scheduling conflicts.
            </div>
        </div>
    );
};

export default MyAssignments;
