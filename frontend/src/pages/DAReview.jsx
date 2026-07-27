import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldAlert, ChevronRight, Filter, ClipboardEdit } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import MatchOfficialDAPanel from "@/components/MatchOfficialDAPanel";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

/**
 * M37 · DA Review Portal for Division / MPCA
 * ──────────────────────────────────────────
 * Lists all Match Official DA forms across tournaments visible to the caller's
 * body-scope. Reviewers can inline-approve/reject each DA + see any scheme
 * ⚠️ compliance flags stamped at submit. Approved DAs automatically become
 * line items on the next Reimbursement Claim from Division → MPCA — there is
 * no separate MPCA approval for DA forms (rolled up into the consolidated
 * claim by design).
 */
const STATUSES = ["All", "Submitted", "Approved", "Rejected", "Draft", "Paid"];
const STATUS_TONE = {
    Draft: "border-mpca-gray-dark text-mpca-gray-dark",
    Submitted: "border-mpca-brass text-mpca-brass",
    Approved: "border-mpca-green-dark text-mpca-green-dark",
    Rejected: "border-mpca-oxblood text-mpca-oxblood",
    Paid: "border-mpca-green-dark bg-mpca-green-dark text-mpca-ivory",
};

const DAReview = () => {
    const { persona } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("Submitted");
    const [openId, setOpenId] = useState(null);
    const [busy, setBusy] = useState(false);

    const canReview = persona?.body_type === "State" || persona?.body_type === "Division" || persona?.body_type === "District";

    const load = async () => {
        setLoading(true);
        try {
            const params = statusFilter !== "All" ? { status: statusFilter } : {};
            const { data } = await api.get("/match-official-da", { params });
            setRows(data || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

    const totals = useMemo(() => {
        const grouped = { Submitted: 0, Approved: 0, Rejected: 0 };
        let flaggedCount = 0;
        rows.forEach((r) => {
            if (grouped[r.status] !== undefined) grouped[r.status] += 1;
            if ((r.compliance_flags || []).length > 0) flaggedCount += 1;
        });
        return { ...grouped, flaggedCount, total: rows.length };
    }, [rows]);

    const approve = async (id) => {
        setBusy(true);
        try {
            await api.post(`/match-official-da/${id}/approve`, null, { params: { actor_name: persona?.name || "MPCA", actor_body_id: persona?.body_code || "MPCA" } });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };
    const reject = async (id) => {
        const reason = window.prompt("Rejection reason (required):");
        if (!reason || !reason.trim()) return;
        setBusy(true);
        try {
            await api.post(`/match-official-da/${id}/reject`, null, { params: { actor_name: persona?.name || "MPCA", reason, actor_body_id: persona?.body_code || "MPCA" } });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    if (loading) return <CricketLoader label="Loading DA forms…" />;

    // Detail view — rich panel with viewerBadges enabled
    if (openId) {
        const row = rows.find((r) => r.id === openId);
        return (
            <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="da-review-detail">
                <button onClick={() => { setOpenId(null); load(); }} className="btn-heritage-ghost mb-4" data-testid="da-review-back">
                    ← Back to DA review inbox
                </button>
                <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
                    <div>
                        <div className="overline">DA Review</div>
                        <h1 className="font-serif text-3xl text-mpca-green-dark mt-1">{row?.official_name} · {row?.tournament_name}</h1>
                    </div>
                    {canReview && row?.status === "Submitted" && (
                        <div className="flex gap-2">
                            <button onClick={() => approve(row.id)} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-4 py-2 flex items-center gap-1 disabled:opacity-40" data-testid="da-detail-approve"><CheckCircle2 size={12} /> Approve</button>
                            <button onClick={() => reject(row.id)} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-2 flex items-center gap-1 disabled:opacity-40" data-testid="da-detail-reject"><XCircle size={12} /> Reject</button>
                        </div>
                    )}
                </div>
                <MatchOfficialDAPanel tournamentId={row?.tournament_id} formId={openId} readOnly viewerBadges />
            </div>
        );
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="da-review-page">
            <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
                <div>
                    <div className="overline">Division / MPCA</div>
                    <h1 className="font-serif text-4xl text-mpca-green-dark mt-1">DA Review Inbox</h1>
                    <p className="text-[12px] text-mpca-gray-dark mt-2 max-w-2xl">
                        Review Match Official T.A. / D.A. claim forms for tournaments in your scope. Approved DA forms auto-attach to the next consolidated Reimbursement Claim from your body to MPCA — there is no separate MPCA approval step for DA forms.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter size={12} className="text-mpca-brass" />
                    {STATUSES.map((s) => (
                        <button key={s} onClick={() => setStatusFilter(s)} className={`text-[10px] uppercase tracking-widest px-3 py-1 border ${statusFilter === s ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass/10"}`} data-testid={`da-review-filter-${s.toLowerCase()}`}>{s}</button>
                    ))}
                </div>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="da-review-stats">
                <Stat label="Pending Review" value={totals.Submitted} tone="brass" />
                <Stat label="Approved" value={totals.Approved} tone="green" />
                <Stat label="Rejected" value={totals.Rejected} tone="oxblood" />
                <Stat label="With scheme flags ⚠" value={totals.flaggedCount} tone="oxblood" testId="stat-flagged" />
            </div>

            {rows.length === 0 ? (
                <div className="bulletin-card p-16 text-center">
                    <ClipboardEdit className="mx-auto text-mpca-brass mb-4" size={36} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No DA forms in this state.</div>
                    <p className="text-[11px] text-mpca-gray-dark mt-2">Match officials will submit their T.A. / D.A. forms after officiating. Their submissions will appear here for your review.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((r) => (
                        <div key={r.id} className="bulletin-card p-4" data-testid={`da-review-row-${r.id}`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <button onClick={() => setOpenId(r.id)} className="text-left flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="font-mono text-[10px] text-mpca-brass">{r.da_ref}</div>
                                        <span className={`inline-block text-[9px] uppercase tracking-widest px-2 py-0.5 border ${STATUS_TONE[r.status] || ""}`}>{r.status}</span>
                                        {(r.compliance_flags || []).length > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest px-2 py-0.5 border border-mpca-oxblood text-mpca-oxblood" data-testid={`da-flag-${r.id}`}>
                                                <ShieldAlert size={10} /> {r.compliance_flags.length} scheme flag{r.compliance_flags.length > 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>
                                    <div className="font-serif text-lg text-mpca-green-dark mt-1">{r.official_name} · <span className="text-[13px] text-mpca-brass">{r.official_role}</span></div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-0.5">{r.tournament_name} · {r.days || 0} days × {fmt(r.da_rate_inr)} · Total <b className="font-mono text-mpca-green-dark">{fmt(r.total_inr)}</b></div>
                                </button>
                                <div className="flex items-center gap-2">
                                    {canReview && r.status === "Submitted" && (
                                        <>
                                            <button onClick={() => approve(r.id)} disabled={busy} className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-mpca-green-dark text-mpca-ivory flex items-center gap-1 disabled:opacity-40" data-testid={`da-approve-${r.id}`}><CheckCircle2 size={11} /> Approve</button>
                                            <button onClick={() => reject(r.id)} disabled={busy} className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-oxblood text-mpca-oxblood flex items-center gap-1 disabled:opacity-40" data-testid={`da-reject-${r.id}`}><XCircle size={11} /> Reject</button>
                                        </>
                                    )}
                                    <button onClick={() => setOpenId(r.id)} className="text-[10px] uppercase tracking-widest text-mpca-brass flex items-center gap-1" data-testid={`da-view-${r.id}`}>Open <ChevronRight size={11} /></button>
                                </div>
                            </div>
                            {(r.compliance_flags || []).length > 0 && (
                                <div className="mt-2 border-l-2 border-mpca-oxblood pl-2 space-y-0.5">
                                    {r.compliance_flags.map((f, i) => (
                                        <div key={i} className="text-[10px] text-mpca-oxblood italic">⚠ {f.note}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const Stat = ({ label, value, tone = "brass", testId }) => (
    <div className="bulletin-card p-3" data-testid={testId}>
        <div className="overline">{label}</div>
        <div className={`font-serif text-3xl mt-1 ${tone === "green" ? "text-mpca-green-dark" : tone === "oxblood" ? "text-mpca-oxblood" : "text-mpca-brass"}`}>{value}</div>
    </div>
);

export default DAReview;
