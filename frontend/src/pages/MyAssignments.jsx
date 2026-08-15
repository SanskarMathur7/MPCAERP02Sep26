import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, ClipboardEdit, FileText, ShieldCheck, Loader2, Landmark, FilePenLine, ExternalLink } from "lucide-react";
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
        paid: acc.paid + (r.da_form_status === "Paid" ? (r.da_paid_amount_inr || 0) : 0),
        approvedPending: acc.approvedPending + (r.da_form_status === "Approved" ? (r.da_total_claim_inr || 0) : 0),
    }), { fee: 0, da: 0, pending: 0, accepted: 0, paid: 0, approvedPending: 0 });

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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6" data-testid="my-assignments-kpis">
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
                <div className="bulletin-card p-3" data-testid="kpi-approved-pending">
                    <div className="text-[10px] text-mpca-oxblood uppercase">Approved · Awaiting Payment</div>
                    <div className="font-mono text-2xl text-mpca-oxblood">{fmt(totals.approvedPending)}</div>
                </div>
                <div className="bulletin-card p-3" data-testid="kpi-paid">
                    <div className="text-[10px] text-mpca-navy uppercase">Total Paid</div>
                    <div className="font-mono text-2xl text-mpca-navy">{fmt(totals.paid)}</div>
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
                                <th className="text-center py-2 px-3">Assignment</th>
                                <th className="text-center py-2 px-3">DA Form</th>
                                <th className="text-center py-2 px-3">Payment</th>
                                <th className="text-right py-2 px-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((a) => {
                                const status = a.acceptance_status || "Pending";
                                const daStatus = a.da_form_status;  // Draft/Submitted/Approved/Rejected/Paid/null
                                const pillCls =
                                    status === "Accepted" ? "bg-mpca-green-dark text-mpca-ivory"
                                    : status === "Rejected" ? "bg-mpca-oxblood text-mpca-ivory"
                                    : "bg-mpca-brass text-mpca-ivory animate-pulse";
                                const daPill = (() => {
                                    if (!daStatus) return { text: "Not Started", cls: "bg-mpca-gray-dark/20 text-mpca-gray-dark" };
                                    if (daStatus === "Draft") return { text: "Draft", cls: "bg-mpca-brass/30 text-mpca-brass" };
                                    if (daStatus === "Submitted") return { text: "Submitted", cls: "bg-mpca-oxblood/20 text-mpca-oxblood" };
                                    if (daStatus === "Approved") return { text: "Approved", cls: "bg-mpca-green-dark/20 text-mpca-green-dark" };
                                    if (daStatus === "Rejected") return { text: "Rejected", cls: "bg-mpca-oxblood text-mpca-ivory" };
                                    if (daStatus === "Paid") return { text: "Paid", cls: "bg-mpca-navy text-mpca-ivory" };
                                    return { text: daStatus, cls: "bg-mpca-gray-dark/20 text-mpca-gray-dark" };
                                })();
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
                                            {daStatus === "Rejected" && a.da_rejection_reason && (
                                                <div className="text-[10px] text-mpca-oxblood italic mt-0.5">DA returned — {a.da_rejection_reason}</div>
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
                                        <td className="py-3 px-3 text-center">
                                            <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 ${daPill.cls}`} data-testid={`ma-da-status-${a.id}`}>{daPill.text}</span>
                                            {a.da_ref && (
                                                <div className="text-[9px] text-mpca-gray-dark font-mono mt-0.5">{a.da_ref}</div>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-center">
                                            {daStatus === "Paid" ? (
                                                <div className="inline-flex flex-col items-center gap-0.5" data-testid={`ma-payment-${a.id}`}>
                                                    <span className="text-[11px] font-mono font-semibold text-mpca-navy">{fmt(a.da_paid_amount_inr)}</span>
                                                    <span className="text-[9px] font-mono text-mpca-gray-dark">
                                                        <Landmark size={9} className="inline mr-0.5" />
                                                        {a.da_payment_mode || "—"} · {a.da_payment_ref || "—"}
                                                    </span>
                                                    {a.da_paid_at && (
                                                        <span className="text-[9px] italic text-mpca-gray-dark">{new Date(a.da_paid_at).toLocaleDateString("en-IN")}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] italic text-mpca-gray-dark">—</span>
                                            )}
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
                                            {status === "Accepted" && !daStatus && (
                                                <Link
                                                    to={`/tournaments/${a.tournament_id}?open=my-da`}
                                                    className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2.5 py-1 hover:opacity-90 inline-flex items-center gap-1"
                                                    data-testid={`ma-submit-da-${a.id}`}
                                                >
                                                    <ClipboardEdit size={11} /> Fill DA Form
                                                </Link>
                                            )}
                                            {status === "Accepted" && (daStatus === "Draft" || daStatus === "Rejected") && (
                                                <Link
                                                    to={`/tournaments/${a.tournament_id}?open=my-da`}
                                                    className="text-[10px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-2.5 py-1 hover:opacity-90 inline-flex items-center gap-1"
                                                    data-testid={`ma-continue-da-${a.id}`}
                                                >
                                                    <FilePenLine size={11} /> Continue
                                                </Link>
                                            )}
                                            {status === "Accepted" && daStatus === "Submitted" && (
                                                <Link
                                                    to={`/tournaments/${a.tournament_id}?open=my-da`}
                                                    className="text-[10px] uppercase tracking-widest border border-mpca-brass text-mpca-brass px-2.5 py-1 hover:bg-mpca-brass/10 inline-flex items-center gap-1"
                                                    data-testid={`ma-view-da-${a.id}`}
                                                >
                                                    <ExternalLink size={11} /> View
                                                </Link>
                                            )}
                                            {status === "Accepted" && (daStatus === "Approved" || daStatus === "Paid") && a.da_form_id && (
                                                <Link
                                                    to={`/match-official-da/${a.da_form_id}/voucher`}
                                                    className="text-[10px] uppercase tracking-widest bg-mpca-navy text-mpca-ivory px-2.5 py-1 hover:opacity-90 inline-flex items-center gap-1"
                                                    data-testid={`ma-voucher-${a.id}`}
                                                >
                                                    <FileText size={11} /> Voucher
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
