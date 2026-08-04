import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
    Send, Check, RotateCcw, Sparkles, AlertTriangle, Users, Building2,
    ArrowRight, CheckCircle2, Circle, Loader2, ShieldCheck, PackageOpen,
    Calculator, Wallet, ClipboardCheck, ChevronRight, MessagesSquare,
    Receipt, Activity, HandCoins, ScrollText, ClipboardEdit, LayoutGrid,
    Gavel, FileSignature,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import TournamentBudgetsPanel from "@/components/TournamentBudgetsPanel";
import TournamentInvoicesPanel from "@/components/TournamentInvoicesPanel";
import MatchOfficialDAPanel from "@/components/MatchOfficialDAPanel";
import {
    TournamentReceiptsPanel, FinancialSummaryPanel, ClosureLetterPanel,
} from "@/components/TournamentWorkspacePanels";
import { ExtraExpenseTab } from "@/pages/TournamentOps";

/** M39r · Tournament Finance Console
 * ────────────────────────────────────
 * MPCA-owned budget flow. One console for both MPCA and Divisions with
 * role-scoped affordances. Replaces the fragmented submit/approve dance with
 * a clear status matrix and inline actions.
 */

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const STATUS_META = {
    "None":                  { label: "Not prepared",       tone: "bg-mpca-gray-light text-mpca-gray-dark border-mpca-gray/30" },
    "Draft":                 { label: "Draft · not sent",   tone: "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40" },
    "Sent_To_Division":      { label: "Awaiting Division",  tone: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40" },
    // M39z · legacy transitional state — new acceptances go straight to Approved.
    "Accepted_By_Division":  { label: "Accepted · awaits sanction", tone: "bg-mpca-navy/10 text-mpca-navy border-mpca-navy/40" },
    "Revision_Requested":    { label: "Revision requested", tone: "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/50" },
    "Approved":              { label: "Sanctioned",         tone: "bg-mpca-green-dark/10 text-mpca-green-dark border-mpca-green-dark/40" },
    "Submitted":             { label: "Legacy · pending",   tone: "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40" },
    "Returned":              { label: "Returned",           tone: "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40" },
    "Rejected":              { label: "Rejected",           tone: "bg-mpca-gray/20 text-mpca-gray-dark border-mpca-gray/40" },
};

const StatusPill = ({ status }) => {
    const m = STATUS_META[status || "None"] || STATUS_META["None"];
    return (
        <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] uppercase tracking-widest font-semibold ${m.tone}`}
              data-testid={`fc-status-${status || "none"}`}>
            {m.label}
        </span>
    );
};

const TournamentFinanceConsole = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { persona } = useAuth();
    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [tournament, setTournament] = useState(null);
    const [schemeSpec, setSchemeSpec] = useState(null);
    const [ivDraft, setIvDraft] = useState({});
    const [poolIvDrafts, setPoolIvDrafts] = useState({});        // M39s · per-pool IV overrides
    const [activePoolTab, setActivePoolTab] = useState(null);    // M39s · currently editing pool
    const [preview, setPreview] = useState(null);
    const [activeTab, setActiveTab] = useState("pipeline");   // M39u · tabbed sections
    // M39y · Divisions land straight on Budgets & Extras since Pipeline is MPCA-only.
    useEffect(() => {
        if (persona?.body_type && persona.body_type !== "State" && activeTab === "pipeline") {
            setActiveTab("budgets");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persona?.body_type]);
    const [perBodyOverrides, setPerBodyOverrides] = useState({});   // M39w · MPCA per-body head overrides
    const [showOverrides, setShowOverrides] = useState(false);

    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    const load = useCallback(async () => {
        try {
            const [tRes, mRes] = await Promise.all([
                api.get(`/tournaments/${id}`),
                api.get(`/tournaments/${id}/finance/matrix`),
            ]);
            setTournament(tRes.data);
            setMatrix(mRes.data);
            setIvDraft(mRes.data?.input_variables || {});
            setPoolIvDrafts(mRes.data?.pool_input_variables || {});
            // Default active pool = the first pool (if multi-pool)
            const pools = mRes.data?.pools || [];
            const firstPoolId = pools.find((p) => p.pool_id)?.pool_id;
            setActivePoolTab(firstPoolId || null);
            // Load scheme input spec if scheme code present
            if (tRes.data?.scheme_code) {
                try {
                    const { data: spec } = await api.get(`/schemes/${tRes.data.scheme_code}/input-spec`);
                    setSchemeSpec(spec);
                } catch { /* scheme without a backend spec is OK */ }
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    // Live compute preview whenever IV draft changes (MPCA-only prep step)
    // In multi-pool tournaments, preview reflects the currently-selected pool tab.
    useEffect(() => {
        if (!isMPCA || !tournament?.scheme_code) return;
        const ivsToUse = activePoolTab ? (poolIvDrafts[activePoolTab] || ivDraft) : ivDraft;
        if (!ivsToUse || Object.keys(ivsToUse).length === 0) return;
        const t = setTimeout(async () => {
            try {
                const { data } = await api.post(`/schemes/${tournament.scheme_code}/compute-budget`, { inputs: ivsToUse });
                setPreview(data);
            } catch { setPreview(null); }
        }, 400);
        return () => clearTimeout(t);
    }, [ivDraft, poolIvDrafts, activePoolTab, tournament?.scheme_code, isMPCA]);

    if (loading) return <CricketLoader label="Loading finance console…" />;
    if (!matrix) return <div className="p-8 text-mpca-oxblood">Tournament not found.</div>;

    const rows = matrix.rows || [];
    const pools = matrix.pools || [];
    const isMultiPool = matrix.multi_pool;
    const hostRow = rows.find((r) => r.role === "Host");
    const visitorRows = rows.filter((r) => r.role !== "Host");
    const anyBudgetsExist = rows.some((r) => r.budget_id);
    const anyDrafts = rows.some((r) => r.budget_status === "Draft");
    const anyAccepted = rows.some((r) => r.budget_status === "Accepted_By_Division");
    const anyRevision = rows.some((r) => r.budget_status === "Revision_Requested");
    const myRow = !isMPCA ? rows.find((r) => r.body_code === myBody) : null;

    // M39s · Rows grouped by pool for the matrix + prepare UI
    const rowsByPool = pools.map((p) => ({
        pool: p,
        rows: rows.filter((r) => r.pool_id === p.pool_id),
    }));

    const prepareBudgets = async () => {
        setBusy(true);
        try {
            const body = { prepared_by_name: persona?.name || persona?.id };
            if (isMultiPool) {
                if (!Object.keys(poolIvDrafts).length) { alert("Enter input variables for each pool first."); setBusy(false); return; }
                body.pool_input_variables = poolIvDrafts;
                if (Object.keys(ivDraft).length) body.input_variables = ivDraft;
            } else {
                if (!Object.keys(ivDraft).length) { alert("Enter input variables first."); setBusy(false); return; }
                body.input_variables = ivDraft;
            }
            if (Object.keys(perBodyOverrides).length) body.per_body_head_overrides = perBodyOverrides;
            const { data } = await api.post(`/tournaments/${id}/finance/prepare-budgets`, body);
            await load();
            alert(`Prepared ${data.created_count} budget(s) across ${data.pool_count || 1} pool(s). ${data.replaced_count} replaced, ${data.skipped_count} skipped.`);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    const sendAll = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/tournaments/${id}/finance/send-budgets`, {
                actor_name: persona?.name || persona?.id,
                actor_post: persona?.id,
            });
            await load();
            alert(`Sent ${data.sent_count} budget(s) to Divisions.`);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const sendOne = async (budget_id) => {
        setBusy(true);
        try {
            await api.post(`/tournaments/${id}/finance/send-budgets`, {
                actor_name: persona?.name || persona?.id,
                actor_post: persona?.id,
                only_budget_ids: [budget_id],
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const sanctionOne = async (budget_id) => {
        if (!window.confirm("Grant final sanction on this budget? Spending will unlock for the Division.")) return;
        setBusy(true);
        try {
            await api.post(`/tournament-budgets/${budget_id}/sanction`, {
                actor_name: persona?.name || persona?.id,
                actor_post: persona?.id,
                actor_body_id: persona?.body_code || "MPCA",
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const divisionAccept = async (budget_id) => {
        if (!window.confirm(
            "Accept this budget?\n\n"
            + "Since MPCA prepared this budget for you, accepting will sanction "
            + "it immediately — invoices and DA/TA claims will unlock right away.\n\n"
            + "If any figure looks wrong, tap Request Revision instead."
        )) return;
        setBusy(true);
        try {
            await api.post(`/tournament-budgets/${budget_id}/division-accept`, {
                actor_name: persona?.name || persona?.id,
                actor_post: persona?.id,
                actor_body_id: persona?.body_code,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const divisionRequestRevision = async (budget_id) => {
        const reason = window.prompt("Reason for revision request (required):");
        if (!reason || reason.trim().length < 3) return;
        setBusy(true);
        try {
            await api.post(`/tournament-budgets/${budget_id}/request-revision`, {
                actor_name: persona?.name || persona?.id,
                actor_post: persona?.id,
                actor_body_id: persona?.body_code,
                reason: reason.trim(),
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="page-enter px-6 md:px-10 py-8 max-w-7xl mx-auto" data-testid="finance-console-page">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <button onClick={() => navigate(`/tournaments/${id}`)} className="text-[11px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood">
                        ← Back to Tournament
                    </button>
                    <div className="overline mt-1">Finance Console</div>
                    <h1 className="font-serif text-3xl text-mpca-green-dark mt-1" data-testid="fc-title">{matrix.tournament_name}</h1>
                    <div className="text-[11px] text-mpca-gray-dark mt-1 flex items-center gap-2 flex-wrap">
                        {matrix.scheme_code && <span className="font-mono bg-mpca-brass/15 px-2 py-0.5">Scheme {matrix.scheme_code}</span>}
                        <span>· Fiscal cycle {matrix.fiscal_cycle}</span>
                        <span>· {rows.length} participating {rows.length === 1 ? "body" : "bodies"}</span>
                    </div>
                </div>
                <div className="text-[10px] uppercase tracking-widest">
                    <span className="px-2 py-1 bg-mpca-green-dark/10 text-mpca-green-dark border border-mpca-green-dark/30">
                        You are viewing as · {isMPCA ? "MPCA (State)" : (myBody || persona?.body_type)}
                    </span>
                </div>
            </div>

            {/* Prepare panel — MPCA-only, shown when no budgets have been prepared yet */}
            {isMPCA && !anyBudgetsExist && (
                <PreparePanel
                    tournament={tournament}
                    schemeSpec={schemeSpec}
                    ivDraft={ivDraft}
                    setIvDraft={setIvDraft}
                    poolIvDrafts={poolIvDrafts}
                    setPoolIvDrafts={setPoolIvDrafts}
                    activePoolTab={activePoolTab}
                    setActivePoolTab={setActivePoolTab}
                    pools={pools}
                    isMultiPool={isMultiPool}
                    preview={preview}
                    hostCount={rows.filter((r) => r.role === "Host").length}
                    visitorCount={rows.filter((r) => r.role !== "Host").length}
                    rows={rows}
                    perBodyOverrides={perBodyOverrides}
                    setPerBodyOverrides={setPerBodyOverrides}
                    showOverrides={showOverrides}
                    setShowOverrides={setShowOverrides}
                    onPrepare={prepareBudgets}
                    busy={busy}
                />
            )}

            {/* Batch actions strip — MPCA only, when budgets exist */}
            {isMPCA && anyBudgetsExist && (anyDrafts || anyAccepted || anyRevision) && (
                <div className="bulletin-card p-4 mb-6 flex items-center gap-3 flex-wrap" data-testid="fc-batch-actions">
                    <div className="text-[11px] uppercase tracking-widest text-mpca-gray-dark">Batch actions:</div>
                    {anyDrafts && (
                        <button onClick={sendAll} disabled={busy}
                            className="btn-heritage-secondary flex items-center gap-1.5 text-xs" data-testid="fc-send-all-btn">
                            <Send size={12} /> Send all Drafts to Divisions
                        </button>
                    )}
                    {anyRevision && (
                        <div className="text-[11px] text-mpca-oxblood flex items-center gap-1">
                            <AlertTriangle size={12} /> {rows.filter((r) => r.budget_status === "Revision_Requested").length} revision request(s) — see rows below.
                        </div>
                    )}
                    {anyAccepted && (
                        <div className="text-[11px] text-mpca-navy flex items-center gap-1">
                            <ShieldCheck size={12} /> {rows.filter((r) => r.budget_status === "Accepted_By_Division").length} legacy budget(s) still awaiting manual sanction — new acceptances auto-sanction.
                        </div>
                    )}
                    <button onClick={() => { setIvDraft(matrix.input_variables || {}); prepareBudgets(); }}
                        disabled={busy}
                        className="ml-auto text-[11px] text-mpca-brass hover:text-mpca-oxblood underline"
                        data-testid="fc-reprepare-btn">
                        Re-prepare from current IVs
                    </button>
                </div>
            )}

            {/* Division-side · My budget card */}
            {!isMPCA && myRow && (
                <DivisionBudgetCard
                    row={myRow}
                    onAccept={() => divisionAccept(myRow.budget_id)}
                    onRequestRevision={() => divisionRequestRevision(myRow.budget_id)}
                    busy={busy}
                />
            )}

            {/* M39u · Section tabs (visible only when budgets exist) */}
            {anyBudgetsExist && (
                <div className="mb-4 flex items-center gap-1 border-b border-mpca-brass/30 overflow-x-auto" data-testid="fc-tabs">
                    {[
                        { id: "pipeline",  label: "Pipeline",         icon: LayoutGrid,    show: isMPCA },
                        { id: "budgets",   label: "Budgets",          icon: Wallet,        show: true },
                        { id: "extras",    label: "Extras",           icon: Gavel,         show: true },
                        { id: "invoices",  label: "Invoices",         icon: Receipt,       show: true },
                        { id: "da",        label: "DA / TA Forms",    icon: ClipboardEdit, show: true },
                        { id: "actuals",   label: "Actuals vs Budget",icon: Activity,      show: true },
                        { id: "claims",    label: "Reimbursement Claim", icon: FileSignature, show: true },
                        { id: "receipts",  label: "MPCA Receipts",    icon: HandCoins,     show: isMPCA },
                        { id: "closure",   label: "Closure Letter",   icon: ScrollText,    show: isMPCA },
                    ].filter((t) => t.show).map((t) => {
                        const Icon = t.icon;
                        const active = activeTab === t.id;
                        return (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className={`px-4 py-2.5 text-[11px] uppercase tracking-widest font-semibold flex items-center gap-2 border-b-2 shrink-0 transition-colors ${
                                    active
                                        ? "border-mpca-oxblood text-mpca-oxblood"
                                        : "border-transparent text-mpca-gray-dark hover:text-mpca-green-dark"
                                }`}
                                data-testid={`fc-tab-${t.id}`}>
                                <Icon size={12} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Tab: Pipeline (status matrix) — MPCA-only */}
            {activeTab === "pipeline" && isMPCA && (
            <div className="bulletin-card overflow-hidden" data-testid="fc-matrix">
                <div className="px-5 py-3 border-b border-mpca-brass/20 flex items-center justify-between">
                    <div>
                        <div className="overline">Status Matrix</div>
                        <div className="font-serif text-lg text-mpca-green-dark">Per-body pipeline</div>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                        {rows.length} row(s)
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs" data-testid="fc-matrix-table">
                        <thead>
                            <tr className="bg-mpca-parchment border-b border-mpca-brass/30 text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                                <th className="text-left px-3 py-2">Body</th>
                                <th className="text-left px-3 py-2">Role</th>
                                <th className="text-left px-3 py-2">Budget Status</th>
                                <th className="text-right px-3 py-2">Proposed ₹</th>
                                <th className="text-right px-3 py-2">Sanctioned ₹</th>
                                <th className="text-right px-3 py-2">Spent ₹</th>
                                <th className="text-left px-3 py-2">Claim</th>
                                <th className="text-left px-3 py-2">Next Action</th>
                                <th className="text-right px-3 py-2">·</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isMultiPool ? (
                                // Grouped rendering: one pool subsection at a time
                                rowsByPool.map(({ pool, rows: poolRows }) => {
                                    const pHost = poolRows.find((r) => r.role === "Host");
                                    const pVisitors = poolRows.filter((r) => r.role !== "Host");
                                    return (
                                        <PoolGroup
                                            key={pool.pool_id || "main"}
                                            pool={pool}
                                            hostRow={pHost}
                                            visitorRows={pVisitors}
                                            isMPCA={isMPCA}
                                            myBody={myBody}
                                            onSend={(bid) => sendOne(bid)}
                                            onSanction={(bid) => sanctionOne(bid)}
                                            onAccept={(bid) => divisionAccept(bid)}
                                            onRevise={(bid) => divisionRequestRevision(bid)}
                                            busy={busy}
                                        />
                                    );
                                })
                            ) : (
                                <>
                                    {hostRow && <MatrixRow r={hostRow} isMPCA={isMPCA} myBody={myBody}
                                        onSend={() => sendOne(hostRow.budget_id)}
                                        onSanction={() => sanctionOne(hostRow.budget_id)}
                                        onAccept={() => divisionAccept(hostRow.budget_id)}
                                        onRevise={() => divisionRequestRevision(hostRow.budget_id)}
                                        busy={busy} />}
                                    {visitorRows.map((r) => (
                                        <MatrixRow key={r.body_code} r={r} isMPCA={isMPCA} myBody={myBody}
                                            onSend={() => sendOne(r.budget_id)}
                                            onSanction={() => sanctionOne(r.budget_id)}
                                            onAccept={() => divisionAccept(r.budget_id)}
                                            onRevise={() => divisionRequestRevision(r.budget_id)}
                                            busy={busy} />
                                    ))}
                                </>
                            )}
                            {rows.length === 0 && (
                                <tr><td colSpan={9} className="px-3 py-8 text-center text-mpca-gray-dark">
                                    No participating bodies yet. Add participants (Host + Visitors) via the tournament&apos;s Participants Matrix.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* M39u · Reusable panels for each tab */}
            {activeTab === "budgets" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-budgets-panel">
                    <TournamentBudgetsPanel tournament={tournament} persona={persona} onChange={load} />
                </div>
            )}
            {activeTab === "extras" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-extras-panel">
                    <ExtraExpenseTab tournament={tournament} persona={persona} onChanged={load} />
                </div>
            )}
            {activeTab === "invoices" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-invoices-panel">
                    <TournamentInvoicesPanel tournament={tournament} persona={persona} />
                </div>
            )}
            {activeTab === "da" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-da-panel">
                    <MatchOfficialDAPanel tournamentId={id} onChange={load} />
                </div>
            )}
            {activeTab === "actuals" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-actuals-panel">
                    <FinancialSummaryPanel tournament={tournament} />
                </div>
            )}
            {activeTab === "claims" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-claims-panel">
                    <ClaimsPanel tournament={tournament} persona={persona} />
                </div>
            )}
            {activeTab === "receipts" && isMPCA && (
                <div className="bulletin-card p-4" data-testid="fc-tab-receipts-panel">
                    <TournamentReceiptsPanel tournament={tournament} canEdit={true} />
                </div>
            )}
            {activeTab === "closure" && isMPCA && (
                <div className="bulletin-card p-4" data-testid="fc-tab-closure-panel">
                    <ClosureLetterPanel tournament={tournament} persona={persona} canGenerate={true} />
                </div>
            )}

            {/* Legacy link — for records already in old submit/approve flow */}
            <div className="mt-6 text-center">
                <Link to={`/tournaments/${id}/finance/legacy`} className="text-[11px] text-mpca-brass hover:text-mpca-oxblood underline" data-testid="fc-legacy-link">
                    Open legacy Finance view (invoices, extras, claim submission)
                </Link>
            </div>
        </div>
    );
};

// ─────────────────── Prepare Panel (MPCA) ───────────────────

const PreparePanel = ({ tournament, schemeSpec, ivDraft, setIvDraft, poolIvDrafts, setPoolIvDrafts, activePoolTab, setActivePoolTab, pools, isMultiPool, preview, hostCount, visitorCount, rows, perBodyOverrides, setPerBodyOverrides, showOverrides, setShowOverrides, onPrepare, busy }) => {
    const inputVars = schemeSpec?.input_variables || [];

    // Split preview heads into host-flavour vs visitor-flavour (mirrors backend)
    const VISITOR_KEYWORDS = ["travel", "da", "ta", "food", "stay", "hotel", "lodging", "boarding", "meal", "conveyance", "transport", "contingency"];
    const isVisitorHead = (label) => {
        const l = ` ${(label || "").toLowerCase()} `;
        return VISITOR_KEYWORDS.some((k) => l.includes(k));
    };
    const heads = preview?.head_allocations || [];
    const hostHeads = heads.filter((h) => !isVisitorHead(h.head));
    const visitorHeads = heads.filter((h) => isVisitorHead(h.head));
    const hostTotal = hostHeads.reduce((s, h) => s + (h.limit_inr || 0), 0);
    const visitorTotal = visitorHeads.reduce((s, h) => s + (h.limit_inr || 0), 0);

    // Per-pool completeness — every real pool must have at least one IV set
    const activePoolIvs = isMultiPool
        ? (poolIvDrafts[activePoolTab] || {})
        : ivDraft;
    const allPoolsFilled = isMultiPool
        ? pools.filter((p) => p.pool_id).every((p) => Object.keys(poolIvDrafts[p.pool_id] || {}).length > 0)
        : Object.keys(ivDraft).length > 0;
    const canPrepare = tournament?.scheme_code && heads.length > 0 && hostCount > 0 && allPoolsFilled;

    if (!tournament?.scheme_code) {
        return (
            <div className="bulletin-card p-6 mb-6 border-l-4 border-mpca-oxblood" data-testid="fc-no-scheme">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="text-mpca-oxblood shrink-0" size={20} />
                    <div>
                        <div className="font-serif text-lg text-mpca-oxblood">No scheme assigned</div>
                        <p className="text-sm text-mpca-gray-dark mt-1">
                            Pick a reimbursement scheme (e.g. 2-B for Inter-Divisional) on the tournament setup before you can prepare budgets.
                        </p>
                        <Link to={`/tournaments/${tournament?.id}`} className="mt-3 inline-block btn-heritage-secondary text-xs">Open Tournament Setup →</Link>
                    </div>
                </div>
            </div>
        );
    }

    const setActivePoolIv = (name, value) => {
        if (isMultiPool) {
            setPoolIvDrafts((d) => ({
                ...d,
                [activePoolTab]: { ...(d[activePoolTab] || {}), [name]: value },
            }));
        } else {
            setIvDraft((d) => ({ ...d, [name]: value }));
        }
    };

    const currentPool = isMultiPool ? pools.find((p) => p.pool_id === activePoolTab) : null;

    return (
        <div className="bulletin-card p-6 mb-6" data-testid="fc-prepare-panel">
            <div className="flex items-center gap-2 mb-1">
                <Calculator size={16} className="text-mpca-brass" />
                <div className="overline">Step 1 · Prepare Budgets</div>
                {isMultiPool && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest bg-mpca-navy/10 text-mpca-navy px-2 py-0.5 border border-mpca-navy/30"
                          data-testid="fc-multi-pool-badge">
                        Multi-pool · {pools.filter((p) => p.pool_id).length} pools
                    </span>
                )}
            </div>
            <h2 className="font-serif text-2xl text-mpca-green-dark">MPCA prepares the budget for this tournament</h2>
            <p className="text-sm text-mpca-gray-dark mt-1">
                {isMultiPool
                    ? "This tournament has multiple pools with different hosts. Set separate input variables for each pool below (tabs). Each pool's Host budget (full scheme allocation) and Visitor budgets (travel + DA + stay) are computed separately."
                    : <>Set the input variables below. The Host budget (full scheme allocation) and Visitor budgets (travel + DA + stay) will be computed <b>separately, no split</b>. Review the two panels, then click Prepare — Drafts get created, ready to send to each Division.</>
                }
            </p>

            {/* Pool tab strip (only for multi-pool) */}
            {isMultiPool && (
                <div className="mt-4 flex items-center gap-2 flex-wrap border-b border-mpca-brass/30 pb-2" data-testid="fc-pool-tabs">
                    {pools.filter((p) => p.pool_id).map((p) => {
                        const filled = Object.keys(poolIvDrafts[p.pool_id] || {}).length > 0;
                        const active = p.pool_id === activePoolTab;
                        return (
                            <button
                                key={p.pool_id}
                                onClick={() => setActivePoolTab(p.pool_id)}
                                className={`px-3 py-1.5 text-[11px] uppercase tracking-widest font-semibold border-2 ${
                                    active
                                        ? "bg-mpca-green-dark text-mpca-parchment border-mpca-green-dark"
                                        : filled
                                        ? "bg-mpca-parchment text-mpca-green-dark border-mpca-green-dark/40"
                                        : "bg-mpca-parchment text-mpca-brass border-mpca-brass/40"
                                }`}
                                data-testid={`fc-pool-tab-${p.pool_id}`}
                            >
                                {p.pool_name}
                                <span className="ml-2 text-[9px] opacity-70">
                                    ({p.member_count} bodies · Host {p.host_body_name || "TBD"})
                                </span>
                                {filled && <Check size={10} className="inline ml-1" />}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* IV editor for active pool (or global) */}
            <div className="mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-2">
                    Input Variables
                    {isMultiPool && currentPool && (
                        <span className="ml-2 text-mpca-navy">· {currentPool.pool_name}</span>
                    )}
                </div>
                {inputVars.length === 0 ? (
                    <div className="text-[11px] text-mpca-gray-dark">This scheme uses defaults — no editable IVs. Click Prepare to proceed.</div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {inputVars.map((v) => (
                            <label key={v.key || v.name} className="block">
                                <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-1">
                                    {v.label || v.key || v.name}{v.unit && <span className="text-mpca-gray-dark ml-1">({v.unit})</span>}
                                </div>
                                <input
                                    type="number"
                                    value={activePoolIvs[v.key || v.name] ?? v.default ?? 0}
                                    onChange={(e) => setActivePoolIv(v.key || v.name, parseFloat(e.target.value) || 0)}
                                    className="input-heritage !py-1.5 !text-xs"
                                    data-testid={`fc-iv-${v.key || v.name}`}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Two-panel preview: Host vs Visitors */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <BudgetPreviewPanel
                    title={isMultiPool && currentPool ? `Host Budget · ${currentPool.pool_name}` : "Host Budget"}
                    subtitle={isMultiPool && currentPool
                        ? `Host: ${currentPool.host_body_name || currentPool.host_body_code || "TBD"}`
                        : `${hostCount} host body`}
                    icon={Building2}
                    heads={hostHeads}
                    total={hostTotal}
                    tone="green"
                />
                <BudgetPreviewPanel
                    title={isMultiPool && currentPool ? `Visitor Budget · ${currentPool.pool_name}` : "Visitor Budget (per body)"}
                    subtitle={isMultiPool && currentPool
                        ? `× ${Math.max(0, currentPool.member_count - 1)} visitors in this pool`
                        : `× ${visitorCount} visiting bodies`}
                    icon={Users}
                    heads={visitorHeads}
                    total={visitorTotal}
                    tone="brass"
                />
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[11px] text-mpca-gray-dark">
                    {isMultiPool
                        ? `Fill IVs on every pool tab. ${pools.filter((p) => p.pool_id && Object.keys(poolIvDrafts[p.pool_id] || {}).length > 0).length} / ${pools.filter((p) => p.pool_id).length} pools filled.`
                        : <>Total outlay if all budgets sanctioned: <b className="text-mpca-oxblood">{fmt(hostTotal + visitorTotal * visitorCount)}</b></>
                    }
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowOverrides(!showOverrides)}
                        disabled={heads.length === 0}
                        className="text-[10px] uppercase tracking-widest px-3 py-1.5 border-2 border-mpca-navy text-mpca-navy hover:bg-mpca-navy/10 flex items-center gap-1.5 disabled:opacity-40"
                        data-testid="fc-toggle-overrides-btn"
                    >
                        <ClipboardCheck size={12} />
                        {showOverrides ? "Hide" : "Edit"} heads per body
                        {Object.keys(perBodyOverrides).length > 0 && <span className="ml-1 px-1.5 bg-mpca-navy text-mpca-parchment text-[9px] font-mono">{Object.keys(perBodyOverrides).length}</span>}
                    </button>
                    <button
                        onClick={onPrepare}
                        disabled={!canPrepare || busy}
                        className="btn-heritage flex items-center gap-2 disabled:opacity-40"
                        data-testid="fc-prepare-btn"
                    >
                        {busy ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                        Prepare {isMultiPool ? "All Pools" : "Budgets"}
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>

            {/* M39w · Per-body head editor — MPCA overrides scheme values */}
            {showOverrides && heads.length > 0 && (
                <div className="mt-4 border-2 border-mpca-navy/40 bg-mpca-navy/5 p-4" data-testid="fc-overrides-panel">
                    <div className="flex items-center gap-2 mb-3">
                        <ClipboardCheck className="text-mpca-navy" size={14} />
                        <div className="font-serif text-mpca-navy font-semibold">Edit head amounts per body</div>
                        <span className="text-[10px] text-mpca-gray-dark">Scheme-computed values shown as placeholder — override any cell to change that body&apos;s allocation.</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-mpca-parchment border-b-2 border-mpca-navy/40 text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                                    <th className="text-left px-2 py-1.5 sticky left-0 bg-mpca-parchment">Body</th>
                                    {heads.map((h) => (
                                        <th key={h.head} className="text-right px-2 py-1.5 min-w-[110px]">
                                            {h.head.length > 20 ? h.head.slice(0, 18) + "…" : h.head}
                                        </th>
                                    ))}
                                    <th className="text-right px-2 py-1.5 border-l border-mpca-navy/30">Total ₹</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const roleHeads = r.role === "Host" ? heads : heads.filter((h) => {
                                        const l = ` ${h.head.toLowerCase()} `;
                                        return ["travel", "da", "ta", "food", "stay", "hotel", "lodging", "boarding", "meal", "conveyance", "transport", "contingency"].some((k) => l.includes(k));
                                    });
                                    const bodyOv = perBodyOverrides[r.body_code] || {};
                                    const rowTotal = heads.reduce((s, h) => {
                                        if (!roleHeads.some((rh) => rh.head === h.head)) return s;
                                        return s + (bodyOv[h.head] ?? h.limit_inr);
                                    }, 0);
                                    return (
                                        <tr key={r.body_code} className="border-b border-mpca-navy/15 hover:bg-mpca-parchment/50">
                                            <td className="px-2 py-1.5 font-serif text-mpca-green-dark sticky left-0 bg-inherit">
                                                {r.body_name || r.body_code}
                                                <span className="ml-2 text-[9px] uppercase text-mpca-brass">{r.role}</span>
                                            </td>
                                            {heads.map((h) => {
                                                const applicable = roleHeads.some((rh) => rh.head === h.head);
                                                if (!applicable) return <td key={h.head} className="px-2 py-1 text-right text-[10px] text-mpca-gray-dark/50">—</td>;
                                                return (
                                                    <td key={h.head} className="px-2 py-1 text-right">
                                                        <input
                                                            type="number"
                                                            placeholder={String(Math.round(h.limit_inr))}
                                                            value={bodyOv[h.head] ?? ""}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                setPerBodyOverrides((d) => {
                                                                    const next = { ...d };
                                                                    const bodyMap = { ...(next[r.body_code] || {}) };
                                                                    if (v === "" || v === null) delete bodyMap[h.head];
                                                                    else bodyMap[h.head] = parseFloat(v) || 0;
                                                                    if (Object.keys(bodyMap).length) next[r.body_code] = bodyMap;
                                                                    else delete next[r.body_code];
                                                                    return next;
                                                                });
                                                            }}
                                                            className="w-full text-right font-mono text-[11px] px-1 py-0.5 border border-mpca-brass/30 bg-mpca-parchment focus:outline-none focus:border-mpca-navy"
                                                            data-testid={`fc-override-${r.body_code}-${h.head.slice(0, 12)}`}
                                                        />
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 py-1 text-right font-mono text-mpca-oxblood font-semibold border-l border-mpca-navy/30">
                                                {fmt(rowTotal)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const BudgetPreviewPanel = ({ title, subtitle, icon: Icon, heads, total, tone }) => {
    const border = tone === "green" ? "border-mpca-green-dark/40" : "border-mpca-brass/40";
    const bg = tone === "green" ? "bg-mpca-green-dark/5" : "bg-mpca-gold-light/20";
    const text = tone === "green" ? "text-mpca-green-dark" : "text-mpca-brass";
    return (
        <div className={`border-2 ${border} ${bg} p-4`} data-testid={`fc-preview-${tone}`}>
            <div className="flex items-center gap-2 mb-1">
                <Icon size={16} className={text} />
                <div className={`font-serif text-base ${text}`}>{title}</div>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-mpca-gray-dark mb-3">{subtitle}</div>
            {heads.length === 0 ? (
                <div className="text-xs text-mpca-gray-dark italic">No heads. Adjust IVs above.</div>
            ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                    {heads.map((h, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                            <span className="text-mpca-charcoal truncate">{h.head}</span>
                            <span className="font-mono text-mpca-green-dark">{fmt(h.limit_inr)}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="mt-3 pt-2 border-t border-mpca-brass/30 flex justify-between text-sm font-semibold">
                <span className={text}>Total</span>
                <span className="font-mono text-mpca-oxblood">{fmt(total)}</span>
            </div>
        </div>
    );
};

// ─────────────────── Pool Group (multi-pool matrix) ───────────────────

const PoolGroup = ({ pool, hostRow, visitorRows, isMPCA, myBody, onSend, onSanction, onAccept, onRevise, busy }) => {
    const memberCount = (hostRow ? 1 : 0) + visitorRows.length;
    return (
        <>
            <tr className="bg-mpca-navy/5 border-y-2 border-mpca-navy/30" data-testid={`fc-pool-group-${pool.pool_id || "main"}`}>
                <td colSpan={9} className="px-3 py-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-serif text-mpca-navy font-semibold text-base">{pool.pool_name || "Main"}</span>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                            Host: {pool.host_body_name || pool.host_body_code || "TBD"}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                            · {memberCount} {memberCount === 1 ? "body" : "bodies"}
                        </span>
                        <span className="ml-auto text-[10px] uppercase tracking-widest text-mpca-oxblood font-mono">
                            Pool total: {fmt(pool.budget_total_inr)}
                            {pool.approved_total_inr > 0 && <> · Sanctioned {fmt(pool.approved_total_inr)}</>}
                        </span>
                    </div>
                </td>
            </tr>
            {hostRow && <MatrixRow r={hostRow} isMPCA={isMPCA} myBody={myBody}
                onSend={() => onSend(hostRow.budget_id)}
                onSanction={() => onSanction(hostRow.budget_id)}
                onAccept={() => onAccept(hostRow.budget_id)}
                onRevise={() => onRevise(hostRow.budget_id)}
                busy={busy} />}
            {visitorRows.map((r) => (
                <MatrixRow key={r.body_code + (r.pool_id || "")} r={r} isMPCA={isMPCA} myBody={myBody}
                    onSend={() => onSend(r.budget_id)}
                    onSanction={() => onSanction(r.budget_id)}
                    onAccept={() => onAccept(r.budget_id)}
                    onRevise={() => onRevise(r.budget_id)}
                    busy={busy} />
            ))}
        </>
    );
};

// ─────────────────── Matrix Row ───────────────────

const MatrixRow = ({ r, isMPCA, myBody, onSend, onSanction, onAccept, onRevise, busy }) => {
    const isMine = myBody === r.body_code;
    const canDivisionAct = !isMPCA && isMine && r.budget_status === "Sent_To_Division";
    const canSend = isMPCA && r.budget_status === "Draft";
    const canSanction = isMPCA && r.budget_status === "Accepted_By_Division";
    const isRevision = isMPCA && r.budget_status === "Revision_Requested";

    return (
        <tr className={`border-b border-mpca-brass/15 hover:bg-mpca-parchment/40 ${isMine ? "bg-mpca-gold-light/10" : ""}`}
            data-testid={`fc-row-${r.body_code}`}>
            <td className="px-3 py-3 font-serif text-mpca-green-dark">
                <div>{r.body_name}</div>
                <div className="text-[9px] font-mono text-mpca-gray-dark">{r.body_code}</div>
            </td>
            <td className="px-3 py-3">
                <span className={`text-[10px] uppercase tracking-widest font-semibold ${r.role === "Host" ? "text-mpca-green-dark" : "text-mpca-brass"}`}>
                    {r.role}
                </span>
            </td>
            <td className="px-3 py-3">
                <StatusPill status={r.budget_status} />
                {r.revision_reason && (
                    <div className="text-[9px] text-mpca-oxblood mt-1 italic truncate max-w-[180px]" title={r.revision_reason}>
                        &ldquo;{r.revision_reason.slice(0, 60)}{r.revision_reason.length > 60 ? '…' : ''}&rdquo;
                    </div>
                )}
            </td>
            <td className="px-3 py-3 text-right font-mono text-mpca-charcoal">
                {r.budget_total_inr > 0 ? fmt(r.budget_total_inr) : "—"}
            </td>
            <td className="px-3 py-3 text-right font-mono">
                {r.approved_total_inr ? (
                    <span className="text-mpca-green-dark">{fmt(r.approved_total_inr)}</span>
                ) : <span className="text-mpca-gray-dark">—</span>}
            </td>
            <td className="px-3 py-3 text-right font-mono text-mpca-gray-dark">
                {(r.invoice_total_inr + r.extras_total_inr + r.da_total_inr) > 0
                    ? fmt(r.invoice_total_inr + r.extras_total_inr + r.da_total_inr)
                    : "—"}
                {r.invoice_count > 0 && <div className="text-[9px] text-mpca-gray-dark">{r.invoice_count} invoices</div>}
            </td>
            <td className="px-3 py-3">
                {r.claim_status ? (
                    <div>
                        <StatusPill status={r.claim_status === "Approved" ? "Approved" : "Submitted"} />
                        <div className="text-[9px] font-mono text-mpca-gray-dark mt-1">{r.claim_ref}</div>
                    </div>
                ) : <span className="text-mpca-gray-dark text-[11px]">—</span>}
            </td>
            <td className="px-3 py-3">
                <div className="text-[10px] uppercase tracking-widest text-mpca-oxblood">→ {r.next_action_for?.waiting_on}</div>
                <div className="text-[11px] text-mpca-charcoal">{r.next_action_for?.action}</div>
            </td>
            <td className="px-3 py-3 text-right whitespace-nowrap">
                {canSend && (
                    <button onClick={onSend} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-brass/15 text-mpca-brass border border-mpca-brass/40 hover:bg-mpca-brass/25 mr-1"
                        data-testid={`fc-send-${r.body_code}`}>
                        <Send size={10} className="inline mr-1" />Send
                    </button>
                )}
                {canSanction && (
                    <button onClick={onSanction} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-green-dark/10 text-mpca-green-dark border border-mpca-green-dark/40 hover:bg-mpca-green-dark/20 mr-1"
                        data-testid={`fc-sanction-${r.body_code}`}>
                        <ShieldCheck size={10} className="inline mr-1" />Sanction
                    </button>
                )}
                {isRevision && (
                    <span className="text-[10px] text-mpca-oxblood mr-1">Edit IVs above & re-prepare</span>
                )}
                {canDivisionAct && (
                    <>
                        <button onClick={onAccept} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-green-dark/10 text-mpca-green-dark border border-mpca-green-dark/40 hover:bg-mpca-green-dark/20 mr-1"
                            data-testid={`fc-accept-${r.body_code}`}>
                            <Check size={10} className="inline mr-1" />Accept &amp; Sanction
                        </button>
                        <button onClick={onRevise} disabled={busy} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-oxblood/10 text-mpca-oxblood border border-mpca-oxblood/40 hover:bg-mpca-oxblood/20"
                            data-testid={`fc-revise-${r.body_code}`}>
                            <RotateCcw size={10} className="inline mr-1" />Revise
                        </button>
                    </>
                )}
                {r.budget_id && (
                    <Link to={`/tournament-budgets/${r.budget_id}`} className="ml-1 inline-block text-mpca-brass hover:text-mpca-oxblood" title="Open budget detail"
                        data-testid={`fc-view-${r.body_code}`}>
                        <ChevronRight size={14} />
                    </Link>
                )}
            </td>
        </tr>
    );
};

// ─────────────────── Division Budget Card (self-view) ───────────────────

const DivisionBudgetCard = ({ row, onAccept, onRequestRevision, busy }) => {
    if (!row.budget_id) {
        return (
            <div className="bulletin-card p-6 mb-6 border-l-4 border-mpca-gray/40" data-testid="fc-div-nobudget">
                <div className="flex items-center gap-2">
                    <PackageOpen size={20} className="text-mpca-gray-dark" />
                    <div>
                        <div className="font-serif text-lg text-mpca-gray-dark">No budget yet</div>
                        <p className="text-sm text-mpca-gray-dark">MPCA has not prepared a budget for your role in this tournament yet. Check back after MPCA prepares it.</p>
                    </div>
                </div>
            </div>
        );
    }
    const canAct = row.budget_status === "Sent_To_Division";
    const isAwaitingSanction = row.budget_status === "Accepted_By_Division";   // legacy transitional
    const isRevisionRequested = row.budget_status === "Revision_Requested";
    const isSanctioned = row.budget_status === "Approved";

    return (
        <div className={`bulletin-card p-6 mb-6 border-l-4 ${
            canAct ? "border-mpca-oxblood" : isSanctioned ? "border-mpca-green-dark" : "border-mpca-brass"
        }`} data-testid="fc-div-budget-card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="overline">Your Budget · {row.role}</div>
                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">{fmt(row.budget_total_inr)}</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1">{row.budget_no}</div>
                    <div className="mt-2"><StatusPill status={row.budget_status} /></div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                    {canAct && (
                        <>
                            <button onClick={onAccept} disabled={busy}
                                className="btn-heritage flex items-center gap-2" data-testid="fc-div-accept-btn">
                                <Check size={14} /> Accept &amp; Sanction
                            </button>
                            <button onClick={onRequestRevision} disabled={busy}
                                className="btn-heritage-secondary flex items-center gap-2 !border-mpca-oxblood !text-mpca-oxblood"
                                data-testid="fc-div-revise-btn">
                                <RotateCcw size={14} /> Request Revision
                            </button>
                            <div className="text-[10px] text-mpca-gray-dark max-w-[220px] text-right leading-tight italic">
                                MPCA authored this budget — accepting sanctions it immediately and unlocks spending.
                            </div>
                        </>
                    )}
                    {isAwaitingSanction && (
                        <div className="text-[11px] text-mpca-navy max-w-[220px] text-right italic">
                            Legacy state · this budget was accepted under the old flow and is awaiting MPCA&apos;s manual sanction.
                        </div>
                    )}
                    {isRevisionRequested && <div className="text-[11px] text-mpca-oxblood">MPCA notified · awaiting revision</div>}
                    {isSanctioned && (
                        <div className="text-[11px] text-mpca-green-dark flex items-center gap-1">
                            <CheckCircle2 size={12} /> Sanctioned · you may now upload invoices, DA/TA & claims
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TournamentFinanceConsole;

// ─────────────────── Reimbursement Claims Panel ───────────────────
// M39z.c · Inline claim workflow — Divisions can create, view the head-wise
// summary, upload the signed PDF, and submit to MPCA without leaving the
// Finance Console. MPCA sees a scoped list of every claim + Open action.
const ClaimsPanel = ({ tournament, persona }) => {
    const [claims, setClaims] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [previewSummary, setPreviewSummary] = useState(null);   // spent-by-head preview when no claim yet
    const navigate = useNavigate();
    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    const load = useCallback(async () => {
        try {
            const params = { tournament_id: tournament.id };
            if (!isMPCA && myBody) params.body_id = myBody;
            const { data } = await api.get("/reimbursement-claims", { params });
            setClaims(data || []);
            // Preview: pull the live tally so Divisions can see the eligible amount before drafting.
            if (!isMPCA && myBody && (!data || data.length === 0)) {
                try {
                    const { data: s } = await api.get(`/tournaments/${tournament.id}/spent-by-head`, { params: { body_id: myBody } });
                    setPreviewSummary(s);
                } catch { /* ignore */ }
            }
        } catch { setClaims([]); }
        finally { setLoading(false); }
    }, [tournament.id, isMPCA, myBody]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    const startDraft = async () => {
        if (!myBody) return;
        setBusy(true);
        try {
            await api.post("/reimbursement-claims", {
                tournament_id: tournament.id,
                body_id: myBody,
                fiscal_cycle: tournament.fiscal_cycle,
                scheme_code: tournament.scheme_code,
                claimed_by: persona?.name,
                notes: `Auto-drafted from Finance Console by ${persona?.name || myBody}`,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const uploadSigned = async (claim, file) => {
        if (!file) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("body_id", myBody || "");
            fd.append("uploaded_by", persona?.name || myBody || "");
            fd.append("related_type", "reimbursement_claim");
            fd.append("related_id", claim.id);
            const { data: up } = await api.post("/uploads", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            await api.post(`/reimbursement-claims/${claim.id}/signed-pdf`, {
                signed_pdf_url: up.url,
                uploaded_by: persona?.name || myBody,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const submitClaim = async (claim) => {
        if (!window.confirm(`Submit ${claim.claim_ref} to MPCA for reimbursement?\n\nMake sure the signed PDF is uploaded — MPCA cannot process an unsigned claim.`)) return;
        setBusy(true);
        try {
            await api.post(`/reimbursement-claims/${claim.id}/submit`, {
                actor_name: persona?.name, actor_role: persona?.post, actor_body_id: myBody,
                notes: "Submitted via Finance Console",
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    if (loading) return (
        <div className="py-8 text-center text-[11px] text-mpca-charcoal/80" data-testid="claims-loading">
            <Loader2 className="animate-spin inline mr-1" size={12} /> Loading claims…
        </div>
    );

    return (
        <div className="space-y-5" data-testid="claims-panel">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="overline text-[10px] font-semibold text-mpca-oxblood">Reimbursement Claim</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1 font-semibold">
                        {isMPCA ? `${claims.length} claim(s) across bodies` : `Your body (${myBody})`}
                    </div>
                    <p className="text-[11px] text-mpca-charcoal/80 mt-1 max-w-2xl">
                        Once the tournament wraps up and every invoice / DA is uploaded, raise a Reimbursement
                        Claim. The system auto-computes a head-wise summary (Sanctioned vs Spent vs Eligible),
                        you download the summary PDF, get it signed by the Secretary + Treasurer, upload it back
                        and submit to MPCA — all in this panel.
                    </p>
                </div>
                {!isMPCA && claims.length === 0 && (
                    <button
                        onClick={startDraft}
                        disabled={busy}
                        className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood hover:bg-mpca-oxblood/90 px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
                        data-testid="claims-start-draft-btn"
                    >
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <FileSignature size={11} />}
                        Start Claim Draft
                    </button>
                )}
            </div>

            {/* Preview head-wise tally BEFORE a claim exists — helps the Division decide when to raise it */}
            {!isMPCA && claims.length === 0 && previewSummary && (
                <div className="border-2 border-mpca-brass/40 bg-mpca-parchment/40 p-4" data-testid="claims-preview">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="overline text-[9px] font-semibold text-mpca-oxblood">Live tally · before you draft</div>
                        <div className="text-[11px] text-mpca-charcoal/80">
                            Invoiced <strong className="text-mpca-navy font-mono">{fmt(previewSummary.invoiced_total_inr)}</strong>
                            <span className="mx-2 text-mpca-brass">·</span>
                            Eligible <strong className="text-mpca-green-dark font-mono">{fmt(previewSummary.eligible_total_inr)}</strong>
                            {previewSummary.over_budget_inr > 0 && (
                                <span className="ml-2 text-mpca-oxblood text-[10px]">
                                    (₹{Math.round(previewSummary.over_budget_inr).toLocaleString("en-IN")} over budget)
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {claims.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-mpca-brass/40 text-[11px] text-mpca-charcoal/80 italic" data-testid="claims-empty">
                    {isMPCA
                        ? "No divisions have submitted a claim yet for this tournament."
                        : (previewSummary?.invoiced_total_inr || 0) > 0
                            ? <>Ready to raise your claim. Click <strong className="text-mpca-oxblood">Start Claim Draft</strong> above to auto-compute the summary.</>
                            : "Once you've uploaded invoices / DA forms, come back here to raise your Reimbursement Claim."}
                </div>
            ) : (
                <div className="divide-y divide-mpca-brass/25">
                    {claims.map((c) => (
                        <ClaimRow
                            key={c.id}
                            claim={c}
                            isMPCA={isMPCA}
                            busy={busy}
                            onUploadSigned={(f) => uploadSigned(c, f)}
                            onSubmit={() => submitClaim(c)}
                            onOpen={() => navigate(`/reimbursement-claims/${c.id}`)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// One-row renderer with inline sign-upload + submit actions (used by ClaimsPanel).
const ClaimRow = ({ claim, isMPCA, busy, onUploadSigned, onSubmit, onOpen }) => {
    const c = claim;
    const isDraft = c.status === "Draft" || c.status === "Rejected";
    const hasSigned = !!c.signed_pdf_url;
    return (
        <div className="py-3" data-testid={`claims-row-${c.id}`}>
            <div className="grid grid-cols-12 items-center gap-3 text-xs">
                <div className="col-span-3 min-w-0">
                    <div className="font-mono text-[10px] text-mpca-charcoal/70 truncate">{c.claim_ref}</div>
                    <div className="font-serif text-sm text-mpca-green-dark truncate mt-0.5 font-semibold">
                        {c.body_name || c.body_id}
                    </div>
                </div>
                <div className="col-span-3">
                    <StatusPill status={c.status === "Approved" ? "Approved" : c.status === "Rejected" ? "Rejected" : c.status === "Under_Review" ? "Submitted" : c.status === "Submitted" ? "Submitted" : "Draft"} />
                    <div className="text-[10px] text-mpca-charcoal/80 mt-1">
                        {(c.status || "").replace(/_/g, " ")}
                    </div>
                </div>
                <div className="col-span-3 text-right font-mono">
                    <div className="text-sm text-mpca-oxblood font-semibold">{fmt(c.summary?.eligible_total_inr || c.summary?.invoiced_total_inr || 0)}</div>
                    {c.approved_amount_inr > 0 && (
                        <div className="text-[10px] text-mpca-green-dark font-semibold">Approved {fmt(c.approved_amount_inr)}</div>
                    )}
                </div>
                <div className="col-span-3 text-right flex justify-end gap-1.5 flex-wrap">
                    <button onClick={onOpen}
                        className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2.5 py-1.5 border-2 border-mpca-oxblood transition-colors"
                        data-testid={`claims-open-${c.id}`}>
                        Open detail
                    </button>
                </div>
            </div>

            {/* Inline draft-workflow strip — only when the claim is in Draft/Rejected and viewer is the owning body */}
            {!isMPCA && isDraft && (
                <div className="mt-3 border-2 border-mpca-brass/30 bg-mpca-parchment/40 p-3 flex items-center gap-3 flex-wrap" data-testid={`claim-draft-strip-${c.id}`}>
                    <div className="text-[11px] text-mpca-charcoal/85 flex-1 min-w-[200px]">
                        {hasSigned
                            ? <>Signed PDF uploaded on {new Date(c.signed_pdf_uploaded_at || Date.now()).toLocaleDateString("en-IN")} — ready to submit.</>
                            : <>Download the summary PDF from <em>Open detail</em>, get it signed by the Secretary + Treasurer, then upload below.</>}
                    </div>
                    {hasSigned && c.signed_pdf_url && (
                        <a href={c.signed_pdf_url} target="_blank" rel="noreferrer"
                            className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark hover:underline">
                            View signed PDF
                        </a>
                    )}
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-green-dark hover:bg-mpca-green-dark/90 px-2.5 py-1.5 cursor-pointer">
                        {hasSigned ? "Replace signed PDF" : "Upload signed PDF"}
                        <input
                            type="file" accept="application/pdf" className="hidden"
                            disabled={busy}
                            onChange={(e) => onUploadSigned(e.target.files?.[0])}
                            data-testid={`claims-upload-signed-${c.id}`}
                        />
                    </label>
                    <button
                        onClick={onSubmit}
                        disabled={busy || !hasSigned}
                        className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood hover:bg-mpca-oxblood/90 px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                        title={hasSigned ? "Submit to MPCA" : "Upload signed PDF first"}
                        data-testid={`claims-submit-${c.id}`}
                    >
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        Submit to MPCA
                    </button>
                </div>
            )}

            {/* Head-wise summary (Sanctioned/Spent/Eligible) — always visible when it's been computed */}
            {(c.summary?.heads || []).length > 0 && (
                <div className="mt-3 border border-mpca-brass/30 bg-mpca-ivory" data-testid={`claim-heads-${c.id}`}>
                    <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-mpca-brass/10 border-b border-mpca-brass/25">
                        <div className="col-span-5 overline text-[9px] font-semibold text-mpca-green-dark">Head</div>
                        <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Sanctioned</div>
                        <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Spent</div>
                        <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Eligible</div>
                        <div className="col-span-1 text-right overline text-[9px] font-semibold text-mpca-green-dark">Over</div>
                    </div>
                    {(c.summary.heads || []).map((h) => {
                        const isExtra = (h.head || "").startsWith("Extra ");
                        return (
                            <div key={h.head} className={`grid grid-cols-12 gap-2 px-3 py-1 text-[11px] border-b border-mpca-brass/15 last:border-b-0 ${isExtra ? "bg-mpca-oxblood/8" : ""}`}>
                                <div className={`col-span-5 ${isExtra ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal"}`}>
                                    {h.head}
                                    {isExtra && <span className="ml-2 text-[8px] font-semibold uppercase tracking-wider text-mpca-parchment bg-mpca-oxblood px-1 py-0.5">Extra</span>}
                                    {h.unmatched && <span className="ml-2 text-[8px] font-semibold uppercase tracking-wider text-mpca-brass border border-mpca-brass/50 px-1 py-0.5">Unmatched</span>}
                                </div>
                                <div className="col-span-2 text-right font-mono">{fmt(h.limit_inr)}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-navy">{fmt(h.spent_inr)}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-green-dark font-semibold">{fmt(h.eligible_inr)}</div>
                                <div className={`col-span-1 text-right font-mono ${h.over_inr > 0 ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal/40"}`}>
                                    {h.over_inr > 0 ? fmt(h.over_inr) : "—"}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
