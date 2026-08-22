import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import {
    Send, Check, RotateCcw, Sparkles, AlertTriangle, Users, Building2,
    ArrowRight, CheckCircle2, Circle, Loader2, ShieldCheck, PackageOpen,
    Calculator, Wallet, ClipboardCheck, ChevronRight, MessagesSquare,
    Receipt, Activity, HandCoins, ScrollText, ClipboardEdit, LayoutGrid,
    Gavel, FileSignature, Lock, LockOpen, RadioTower, Info,
} from "lucide-react";
import { api } from "@/lib/api";
import FinanceSummaryByBodyPanel from "./finance/FinanceSummaryByBodyPanel";
import { useAuth } from "@/context/AuthContext";
import { useWiringOwnerMatch, useWiringStep } from "@/lib/useWiring";
import DivisionCampFinancePanel from "@/components/DivisionCampFinancePanel";
import CricketLoader from "@/components/CricketLoader";
import TournamentBudgetsPanel from "@/components/TournamentBudgetsPanel";
import TournamentSchemeBadge from "@/components/TournamentSchemeBadge";
import MatchOfficialDAPanel from "@/components/MatchOfficialDAPanel";
import FinanceMatchOfficialsDAPaymentsPanel from "@/pages/finance/FinanceMatchOfficialsDAPaymentsPanel";
import {
    TournamentReceiptsPanel, FinancialSummaryPanel, ClosureLetterPanel,
} from "@/components/TournamentWorkspacePanels";
import { ExtraExpenseTab, InvoicesTab } from "@/pages/TournamentOps";
import { fmt, StatusPill } from "./finance/financeShared";
import { MatrixRow, PoolGroup } from "./finance/MatrixRow";
import { DivisionBudgetCard } from "./finance/DivisionBudgetCard";
import { ClaimsPanel } from "./finance/ClaimsPanel";

const UNIFIED_SCOPES = new Set([
    "Inter_Divisional", "Inter_District", "BCCI",
    "Championship", "Pre_Tournament_Camp",
]);
const INR = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

/** M39r · Tournament Finance Console
 * ────────────────────────────────────
 * MPCA-owned budget flow. One console for both MPCA and Divisions with
 * role-scoped affordances. Replaces the fragmented submit/approve dance with
 * a clear status matrix and inline actions.
 *
 * M39z.f · The heavy sub-components (MatrixRow, PoolGroup, DivisionBudgetCard,
 * ClaimsPanel + ClaimRow + IncomingDistrictClaims) live in `./finance/*.jsx`
 * so this file can stay a manageable orchestrator (~530 lines instead of 1450).
 */

const TournamentFinanceConsole = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { persona } = useAuth();
    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [tournament, setTournament] = useState(null);
    const [schemeSpec, setSchemeSpec] = useState(null);
    const [visitorSchemeSpec, setVisitorSchemeSpec] = useState(null);
    const [ivDraft, setIvDraft] = useState({});
    const [poolIvDrafts, setPoolIvDrafts] = useState({});        // M39s · per-pool IV overrides
    const [activePoolTab, setActivePoolTab] = useState(null);    // M39s · currently editing pool
    const [preview, setPreview] = useState(null);
    const [activeTab, setActiveTab] = useState("pipeline");   // M39u · tabbed sections
    // MPCA-124 · honour ?tab=X in URL so external links open the right panel
    // (e.g. Upload Invoice / DA button from Workspace summary opens Invoices tab).
    useEffect(() => {
        const t = searchParams.get("tab");
        if (t && ["pipeline", "budgets", "extras", "invoices", "da", "actuals", "claims", "receipts", "closure"].includes(t)) {
            setActiveTab(t);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);
    // M39y · Divisions land straight on Budgets & Extras since Pipeline is MPCA-only.
    // MPCA-133-nit · but only if the URL didn't already deep-link to a specific tab.
    useEffect(() => {
        const urlTab = searchParams.get("tab");
        if (urlTab) return;   // URL already picked a tab — respect it
        if (persona?.body_type && persona.body_type !== "State" && activeTab === "pipeline") {
            setActiveTab("budgets");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persona?.body_type]);
    const [perBodyOverrides, setPerBodyOverrides] = useState({});   // M39w · MPCA per-body head overrides
    const [showOverrides, setShowOverrides] = useState(true);  // Sprint FIN-CustomHead · default OPEN so MPCA sets the budget straight-away
    // MPCA-120 · District filter for Division supervisors.
    const [districtScope, setDistrictScope] = useState("all");

    // M39z.g / M39z.h · `isMPCA` grants organiser-level rights (Prepare / Send
    // / Sanction, Pipeline tab, revision-review strip). Applied to:
    //   · State (MPCA) — always
    //   · Host body of the tournament (Division on their Inter-District,
    //     District on their intra-district, etc.)
    //   · Parent Division when a child District is the host (Division supervises
    //     District-hosted tournaments under it)
    const isState = persona?.body_type === "State";
    const isDistrict = persona?.body_type === "District";
    const myBody = persona?.body_code;
    const hostBody = tournament?.host_body_id;
    const isHostBody = myBody && hostBody && myBody === hostBody;
    const isParentDivOfHostDist =
        persona?.body_type === "Division"
        && myBody?.startsWith("DIV-")
        && (hostBody || "").startsWith("DIST-")
        && (hostBody || "").endsWith(`-${myBody.slice(-3)}`);
    // MPCA-243 · Ship 2 · Wiring-aware finance owner elevation. If wiring
    // says `finance_console.owner == "Division"` and the caller is Division/
    // District, they get the aggregate view (mirrors the backend's
    // `is_wiring_owner` fallback in finance_console.py).
    const wiringFinanceOwner = useWiringOwnerMatch(id, "finance_console", persona);
    const isMPCA = isState || isHostBody || isParentDivOfHostDist || wiringFinanceOwner === true;
    // Feb 2026 · Fix C · Detect Division-owned budget wiring — used to hide the
    // MPCA-side console entirely for State personas on Pre-Camp / Inter-District
    // / Inter-School / Inter-Club (A-Grade) / Periodical Coaching / Vacation
    // Camp tournaments. Division personas keep full access.
    const unifiedBudgetCell = useWiringStep(id, "unified_budget");
    const isDivisionOwnedBudget = useMemo(() => {
        if (!unifiedBudgetCell) return false;
        const app = unifiedBudgetCell.approver;
        // Wiring stores absent approver as either Python None (→ null) or the
        // literal string "None" (legacy seed). Normalise both to falsy.
        const noApprover = app === null || app === undefined || app === "" || app === "None";
        return unifiedBudgetCell.owner === "Division" && noApprover;
    }, [unifiedBudgetCell]);

    const [accessDenied, setAccessDenied] = useState(null);

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
            const pools = mRes.data?.pools || [];
            const firstPoolId = pools.find((p) => p.pool_id)?.pool_id;
            setActivePoolTab(firstPoolId || null);
            if (tRes.data?.scheme_code) {
                try {
                    const hostCode = tRes.data.host_scheme_code || tRes.data.scheme_code;
                    const { data: spec } = await api.get(`/schemes/${hostCode}/input-spec`);
                    setSchemeSpec(spec);
                } catch { /* scheme without a backend spec is OK */ }
            }
            // MPCA-Feb2026 · Load the visiting scheme spec too when the
            // tournament uses two schemes (Inter-Div: host 2-D + visiting 2-C).
            if (tRes.data?.visiting_scheme_code
                && tRes.data.visiting_scheme_code !== (tRes.data.host_scheme_code || tRes.data.scheme_code)) {
                try {
                    const { data: vSpec } = await api.get(`/schemes/${tRes.data.visiting_scheme_code}/input-spec`);
                    setVisitorSchemeSpec(vSpec);
                } catch { /* no-op */ }
            }
        } catch (e) {
            // M39z.e · graceful access-denied card instead of blank/dev-overlay
            if (e?.response?.status === 403) {
                setAccessDenied(e.response.data?.detail || "You do not have access to this tournament.");
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    // Live compute preview whenever IV draft changes (MPCA-only prep step)
    // In multi-pool tournaments, preview reflects the currently-selected pool tab.
    // MPCA-Feb2026 · When the tournament has `visiting_scheme_code` (Inter-
    // Divisional / Inter-District), compute TWO previews — one for the host
    // scheme, one for the visitor scheme — and stash both. Falls back to a
    // single preview + legacy keyword split for older tournaments.
    useEffect(() => {
        if (!isMPCA || !tournament?.scheme_code) return;
        const ivsToUse = activePoolTab ? (poolIvDrafts[activePoolTab] || ivDraft) : ivDraft;
        if (!ivsToUse || Object.keys(ivsToUse).length === 0) return;
        const t = setTimeout(async () => {
            try {
                const hostCode = tournament.host_scheme_code || tournament.scheme_code;
                const visitCode = tournament.visiting_scheme_code;
                const fc = tournament.fiscal_cycle;
                const params = fc ? { fiscal_cycle: fc } : {};
                if (visitCode && visitCode !== hostCode) {
                    const [hostRes, visRes] = await Promise.all([
                        api.post(`/schemes/${hostCode}/compute-budget`, { inputs: ivsToUse }, { params }),
                        api.post(`/schemes/${visitCode}/compute-budget`, { inputs: ivsToUse }, { params }),
                    ]);
                    setPreview({
                        host_preview: hostRes.data,
                        visitor_preview: visRes.data,
                        head_allocations: hostRes.data.head_allocations,  // legacy fallback
                        total_ceiling_inr: hostRes.data.total_ceiling_inr,
                    });
                } else {
                    const { data } = await api.post(`/schemes/${tournament.scheme_code}/compute-budget`, { inputs: ivsToUse }, { params });
                    setPreview(data);
                }
            } catch { setPreview(null); }
        }, 400);
        return () => clearTimeout(t);
    }, [ivDraft, poolIvDrafts, activePoolTab, tournament?.scheme_code, tournament?.host_scheme_code, tournament?.visiting_scheme_code, isMPCA]);

    if (loading) return <CricketLoader label="Loading finance console…" />;
    if (accessDenied) return (
        <div className="max-w-2xl mx-auto p-8 mt-12 bulletin-card border-l-4 border-mpca-oxblood" data-testid="fc-access-denied">
            <div className="overline text-[10px] font-semibold text-mpca-oxblood">Access denied</div>
            <div className="font-serif text-2xl text-mpca-green-dark mt-2">You cannot view this tournament</div>
            <p className="text-sm text-mpca-charcoal mt-3 leading-relaxed">{accessDenied}</p>
            <p className="text-[11px] text-mpca-charcoal/70 mt-4 italic">
                If this looks wrong, ask MPCA to check your parent Division mapping in the bodies register.
            </p>
        </div>
    );
    if (!matrix) return <div className="p-8 text-mpca-oxblood">Tournament not found.</div>;

    if (isDivisionOwnedBudget && persona?.body_type === "State") {
        return (
            <div className="max-w-2xl mx-auto p-8 mt-12 bulletin-card border-l-4 border-mpca-brass" data-testid="fc-division-owned-notice">
                <div className="flex items-start gap-4">
                    <Info size={22} strokeWidth={1.5} className="text-mpca-brass mt-1 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="overline text-[10px] font-semibold text-mpca-brass">MPCA has no budget role here</div>
                        <div className="font-serif text-2xl text-mpca-green-dark mt-2">Division-owned budget lifecycle</div>
                        <p className="text-sm text-mpca-charcoal mt-4 leading-relaxed">
                            <strong>{tournament?.name}</strong> is a <em>Division-run</em> tournament. Per the current wiring,
                            the Division owns the budget end-to-end — they self-prepare, self-sanction, upload invoices
                            as the tournament progresses, and finally submit a single Reimbursement Claim to MPCA.
                        </p>
                        <p className="text-sm text-mpca-charcoal mt-3 leading-relaxed">
                            You will see this tournament&apos;s financial activity <strong>only when the Division submits
                            the Reimbursement Claim</strong> — visit the Grant Claims page to review incoming submissions.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <Link to="/grant-claims" className="btn-heritage-primary" data-testid="fc-goto-grant-claims">
                                Open Grant Claims →
                            </Link>
                            <Link to={`/tournaments/${id}`} className="btn-heritage-secondary" data-testid="fc-goto-tournament">
                                Back to tournament overview
                            </Link>
                        </div>
                        <div className="mt-6 border-t border-mpca-brass/30 pt-4">
                            <div className="overline text-[9px] text-mpca-gray-dark">Applies to</div>
                            <p className="text-[11px] text-mpca-gray-dark italic mt-1 leading-relaxed">
                                Pre-Tournament Camp · Inter-District · Inter-School · Inter-Club (A-Grade) ·
                                Periodical Coaching Camp · Vacation Camp
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const rows = matrix.rows || [];
    const pools = matrix.pools || [];
    const isMultiPool = matrix.multi_pool;
    // Feb 2026 · Fix D + E · Division-side camp finance panel — the primary
    // interaction surface for host-Division personas on Division-owned
    // tournaments. Drives Prepare → Lock → Upload → Submit → Awaiting →
    // Reimbursed. The regular Console below still renders for invoice
    // management / advanced views.
    const showDivisionCampPanel = isDivisionOwnedBudget
        && persona?.body_type === "Division"
        && tournament?.host_body_id === persona?.body_code;
    // MPCA-120 · Division supervising Districts sees a District filter at
    // the top of the Console. When "all" (default), everything renders
    // consolidated across every District row visible to them. When a
    // specific District is picked, matrix rows filter to that District.
    const districtRows = rows.filter((r) => (r.body_code || "").startsWith("DIST-"));
    const canFilterByDistrict = persona?.body_type === "Division" && districtRows.length > 1;
    const filteredRows = (districtScope === "all" || !canFilterByDistrict)
        ? rows
        : rows.filter((r) => r.body_code === districtScope || r.role === "Host");
    const hostRow = filteredRows.find((r) => r.role === "Host");
    const visitorRows = filteredRows.filter((r) => r.role !== "Host");
    const anyBudgetsExist = filteredRows.some((r) => r.budget_id);
    const anyDrafts = filteredRows.some((r) => r.budget_status === "Draft");
    const anyAccepted = filteredRows.some((r) => r.budget_status === "Accepted_By_Division");
    const anyRevision = filteredRows.some((r) => r.budget_status === "Revision_Requested");
    const myRow = !isMPCA ? rows.find((r) => r.body_code === myBody) : null;
    // MPCA-234 · A Division that's Host in one pool AND Visitor in another
    // has TWO independent budgets on the same tournament — render both as
    // separate cards so the Division picks the right one at invoice-upload time.
    const myRows = !isMPCA ? rows.filter((r) => r.body_code === myBody) : [];

    // M39s · Rows grouped by pool for the matrix + prepare UI
    const rowsByPool = pools.map((p) => ({
        pool: p,
        rows: filteredRows.filter((r) => r.pool_id === p.pool_id),
    }));

    const prepareBudgets = async () => {
        setBusy(true);
        try {
            // MPCA-226 · Prefer the Unified Budget engine for tournament types
            // with a Rate Card — Inter_Divisional / Inter_District / BCCI /
            // Championship / Pre_Tournament_Camp. Legacy scheme-calc runs only
            // for Inter_School / Inter_Club / Invitational / etc.
            const UNIFIED_SCOPES = new Set([
                "Inter_Divisional", "Inter_District", "BCCI",
                "Championship", "Pre_Tournament_Camp",
            ]);
            if (UNIFIED_SCOPES.has(tournament?.scope)) {
                const body = { prepared_by_name: persona?.name || persona?.id };
                if (Object.keys(perBodyOverrides).length) body.per_body_head_overrides = perBodyOverrides;
                const { data } = await api.post(`/tournaments/${id}/finance/prepare-budgets-unified`, body);
                await load();
                alert(`Prepared ${data.created_count} budget(s) from Unified Budget (${data.source}). ${data.replaced_count} replaced, ${data.skipped_count} skipped.`);
                return;
            }
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
            + "Need something not in this budget? File it via the Extras tab after accepting."
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

    // Iter 123r · Division "Request Revision" flow retired. The regime is:
    // MPCA authors → Division reviews & Accepts → Extras route handles
    // additional spend. Endpoint kept in the backend for legacy claim
    // reconciliation but no longer exposed in the UI.

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
                        <span>{rows.length} participating {rows.length === 1 ? "body" : "bodies"}</span>
                    </div>
                    <TournamentSchemeBadge tournament={tournament} />
                </div>
                <div className="text-[10px] uppercase tracking-widest">
                    <span className="px-2 py-1 bg-mpca-green-dark/10 text-mpca-green-dark border border-mpca-green-dark/30">
                        You are viewing as · {isState ? "MPCA (State)" : (isMPCA ? `${myBody} (organiser)` : (myBody || persona?.body_type))}
                    </span>
                </div>
            </div>

            {/* Feb 2026 · Fix D + E · Division-side camp finance driver */}
            {showDivisionCampPanel && (
                <DivisionCampFinancePanel tournament={tournament} persona={persona} />
            )}

            {/* Iter 126 · Body-wise financial summary — surfaces advance vs
                MPCA-approved vs remaining outstanding per Division so MPCA
                and the treasurer can spot pending payments at a glance. */}
            <FinanceSummaryByBodyPanel tournamentId={id} personaBodyType={persona?.body_type} />

            {/* MPCA-230 · Unified Budget → Finance Console linkage.
                For tournaments covered by the Unified Budget engine, replace
                the legacy scheme-based PreparePanel with a compact link panel
                that surfaces lock state + drift alerts and calls the unified
                prepare endpoint. Legacy PreparePanel stays for other scopes. */}
            {isMPCA && UNIFIED_SCOPES.has(tournament?.scope) && (
                <UnifiedBudgetLinkPanel
                    tournament={tournament}
                    anyBudgetsExist={anyBudgetsExist}
                    busy={busy}
                    onPrepare={prepareBudgets}
                    onRefresh={load}
                />
            )}

            {/* Prepare panel — MPCA-only, shown when no budgets have been prepared yet */}
            {isMPCA && !anyBudgetsExist && !UNIFIED_SCOPES.has(tournament?.scope) && (
                <PreparePanel
                    tournament={tournament}
                    schemeSpec={schemeSpec}
                    visitorSchemeSpec={visitorSchemeSpec}
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
                    {!UNIFIED_SCOPES.has(tournament?.scope) && (
                        <button onClick={() => { setIvDraft(matrix.input_variables || {}); prepareBudgets(); }}
                            disabled={busy}
                            className="ml-auto text-[11px] text-mpca-brass hover:text-mpca-oxblood underline"
                            data-testid="fc-reprepare-btn">
                            Re-prepare from current IVs
                        </button>
                    )}
                </div>
            )}

            {/* Division-side · Two independent budget cards (one per pool) when
                the Division participates in multiple pools of the same tournament. */}
            {!isMPCA && myRows.length > 0 && (
                <div className="space-y-4 mb-4" data-testid="my-budgets-list">
                    {myRows.length > 1 && (
                        <div className="border-l-4 border-mpca-oxblood bg-mpca-oxblood/5 px-4 py-2 text-[11px] text-mpca-oxblood" data-testid="my-budgets-multi-hint">
                            <b>Two separate budgets under the same tournament.</b> Each pool has its own budget with a distinct ceiling. When you upload an invoice, pick the budget & head that matches the actual spend so MPCA can reconcile correctly.
                        </div>
                    )}
                    {myRows.map((r, i) => (
                        <div key={r.budget_id || i} data-testid={`my-budget-card-${r.pool_id || i}`}>
                            {myRows.length > 1 && (
                                <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-1 flex items-center gap-2">
                                    <span className="bg-mpca-brass/10 px-2 py-0.5 border border-mpca-brass/30">Budget {i + 1} of {myRows.length}</span>
                                    <span>Pool: <b>{r.pool_name || "—"}</b> · Role: <b>{r.role}</b></span>
                                </div>
                            )}
                            <DivisionBudgetCard
                                row={r}
                                onAccept={() => divisionAccept(r.budget_id)}
                                busy={busy}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* MPCA-120 · District Scope filter for Division supervisors
                (visible when the Division sees more than one District row on
                the matrix, e.g. an Inter-District tournament hosted by a
                Division). Consolidated view is the default. */}
            {canFilterByDistrict && (
                <div className="mb-4 flex items-center gap-3 flex-wrap border-l-4 border-mpca-brass bg-mpca-brass/8 px-4 py-3" data-testid="fc-district-filter">
                    <div className="overline text-[9px] text-mpca-oxblood font-semibold">Division Supervisor · District Scope</div>
                    <select
                        className="input-heritage !py-1 !text-xs !w-auto"
                        value={districtScope}
                        onChange={(e) => setDistrictScope(e.target.value)}
                        data-testid="fc-district-filter-select"
                    >
                        <option value="all">All Districts · Consolidated ({districtRows.length})</option>
                        {districtRows.map((r) => (
                            <option key={r.body_code} value={r.body_code}>{r.body_name || r.body_code}</option>
                        ))}
                    </select>
                    <div className="text-[10px] text-mpca-charcoal/80 italic">
                        {districtScope === "all"
                            ? "Showing rolled-up totals across every District you supervise. Pick a District above to drill in."
                            : `Filtered to ${districtScope}. Reimbursement claims from this District will consolidate into your Division master when you approve them.`}
                    </div>
                </div>
            )}

            {/* MPCA-201 · Tournament-wide financial summary for MPCA */}
            {isMPCA && matrix?.rows?.length > 0 && (() => {
                const totals = matrix.rows.reduce((acc, r) => ({
                    approved: acc.approved + Number(r.approved_total_inr || 0),
                    proposed: acc.proposed + Number(r.budget_total_inr || 0),
                    spent: acc.spent + Number(r.invoice_total_inr || 0),
                    extras: acc.extras + Number(r.extras_total_inr || 0),
                    claim_approved: acc.claim_approved + Number(r.claim_approved_inr || 0),
                }), { approved: 0, proposed: 0, spent: 0, extras: 0, claim_approved: 0 });
                const remaining = Math.max(totals.approved + totals.extras - totals.spent, 0);
                const tiles = [
                    { label: "Approved Budget", value: totals.approved, tone: "text-mpca-green-dark", testid: "fc-tile-approved" },
                    { label: "Extras Approved", value: totals.extras, tone: "text-mpca-brass", testid: "fc-tile-extras" },
                    { label: "Total Spent", value: totals.spent, tone: "text-mpca-navy", testid: "fc-tile-spent" },
                    { label: "Remaining", value: remaining, tone: remaining === 0 && totals.spent > 0 ? "text-mpca-oxblood" : "text-mpca-green-dark", testid: "fc-tile-remaining" },
                    { label: "Claims Approved", value: totals.claim_approved, tone: "text-mpca-oxblood", testid: "fc-tile-claim-approved" },
                ];
                return (
                    <div className="mb-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="fc-mpca-summary">
                        {tiles.map((t) => (
                            <div key={t.label} className="bulletin-card p-3 border-l-4 border-mpca-oxblood/60" data-testid={t.testid}>
                                <div className="overline text-[9px]">{t.label}</div>
                                <div className={`font-mono text-lg font-semibold mt-1 ${t.tone}`}>{fmt(t.value)}</div>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* M39u · Section tabs (visible when budgets exist, OR for
                Districts who never get their own budget row — they still
                need Claims/Invoices/Extras tabs to submit upward).
                M39z.e · Also show for Division personas viewing a tournament
                they HOST — they act as MPCA there so they need every tab
                even before budgets exist. */}
            {(anyBudgetsExist || isDistrict || (persona?.body_type === "Division" && tournament?.host_body_id === persona?.body_code)) && (
                <div className="mb-4 flex items-center gap-1 border-b border-mpca-brass/30 overflow-x-auto no-scrollbar" data-testid="fc-tabs">
                    {[
                        { id: "pipeline",  label: "Pipeline",         icon: LayoutGrid,    show: isMPCA },
                        { id: "budgets",   label: "Budgets",          icon: Wallet,        show: true },
                        { id: "extras",    label: "Extras",           icon: Gavel,         show: true },
                        { id: "invoices",  label: "Invoices",         icon: Receipt,       show: true },
                        { id: "da",        label: "DA / TA Forms",    icon: ClipboardEdit, show: isMPCA },
                        // Iter 123t · "Actuals vs Budget" hidden per user feedback — the panel's
                        // auto-rolled-up numbers were confusing (users couldn't trace where each
                        // amount came from). Keep the route + component around so we can revive
                        // it once every source (invoices, extras, DA, claims) links back visibly.
                        // { id: "actuals",   label: "Actuals vs Budget",icon: Activity,      show: isMPCA },
                        { id: "claims",    label: "Reimbursement Claim", icon: FileSignature, show: true },
                        { id: "receipts",  label: "MPCA Receipts",    icon: HandCoins,     show: isMPCA },
                        { id: "closure",   label: "Closure Letter",   icon: ScrollText,    show: isMPCA },
                    ].filter((t) => t.show).map((t) => {
                        const Icon = t.icon;
                        const active = activeTab === t.id;
                        return (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className={`px-3 py-2.5 text-[10.5px] uppercase tracking-widest font-semibold flex items-center gap-1.5 border-b-2 shrink-0 transition-colors whitespace-nowrap ${
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
                                            onRevise={undefined}
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
                                        onRevise={undefined}
                                        busy={busy} />}
                                    {visitorRows.map((r) => (
                                        <MatrixRow key={r.body_code} r={r} isMPCA={isMPCA} myBody={myBody}
                                            onSend={() => sendOne(r.budget_id)}
                                            onSanction={() => sanctionOne(r.budget_id)}
                                            onAccept={() => divisionAccept(r.budget_id)}
                                            onRevise={undefined}
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
                    {["Inter_Divisional", "Inter_District", "BCCI", "Championship", "Pre_Tournament_Camp"].includes(tournament?.scope) && (
                        <div className="mb-3 flex items-center gap-2 flex-wrap" data-testid="fc-unified-engine-banner">
                            <span className="text-[10px] font-semibold uppercase tracking-widest bg-mpca-oxblood/10 text-mpca-oxblood px-2 py-0.5 border border-mpca-oxblood/30 inline-flex items-center gap-1"
                                  data-testid="fc-unified-engine-badge"
                                  title="Budgets on this tournament are sourced from the Unified Budget engine — math comes from the Match Calendar × Rate Card, not from scheme_calc.">
                                Unified Budget engine
                                {tournament?.unified_budget_snapshot?.is_locked && (
                                    <span className="ml-1 border-l border-mpca-oxblood/30 pl-1">
                                        🔒 v{tournament.unified_budget_snapshot.locked_version}
                                    </span>
                                )}
                            </span>
                            <span className="text-[10px] italic text-mpca-gray-dark">
                                Legacy scheme calculators (2-B / 2-D) are deprecated for this scope.
                            </span>
                        </div>
                    )}
                    <TournamentBudgetsPanel tournament={tournament} persona={persona} onChange={load} hideConsoleLinks />
                </div>
            )}
            {activeTab === "extras" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-extras-panel">
                    <ExtraExpenseTab tournament={tournament} persona={persona} onChanged={load} />
                </div>
            )}
            {activeTab === "invoices" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-invoices-panel">
                    {/* MPCA-124 · Full upload UI (AI-extract + head allocation
                        + review) — was a read-only summary before. */}
                    <InvoicesTab tournament={tournament} persona={persona} onChanged={load} />
                </div>
            )}
            {activeTab === "da" && (
                <div className="bulletin-card p-4" data-testid="fc-tab-da-panel">
                    <FinanceMatchOfficialsDAPaymentsPanel tournament={tournament} />
                    <details className="mt-6 border-t border-mpca-brass/20 pt-4">
                        <summary className="text-[11px] uppercase tracking-widest text-mpca-brass cursor-pointer hover:text-mpca-oxblood" data-testid="fc-da-legacy-toggle">
                            Legacy · Single-Form editor (view / assist an official)
                        </summary>
                        <div className="mt-4">
                            <MatchOfficialDAPanel tournamentId={id} onChange={load} />
                        </div>
                    </details>
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

            {/* M39z.h · Legacy Finance view removed — the console now has
                every tab (Invoices, Extras, DA/TA, Actuals, Claims) inline. */}
        </div>
    );
};

// ─────────────────── Prepare Panel (MPCA) ───────────────────

const PreparePanel = ({ tournament, schemeSpec, visitorSchemeSpec, ivDraft, setIvDraft, poolIvDrafts, setPoolIvDrafts, activePoolTab, setActivePoolTab, pools, isMultiPool, preview, hostCount, visitorCount, rows, perBodyOverrides, setPerBodyOverrides, showOverrides, setShowOverrides, onPrepare, busy }) => {
    const inputVars = schemeSpec?.input_variables || [];
    const visitorInputVars = visitorSchemeSpec?.input_variables || [];

    // MPCA-Feb2026 · Prefer server-computed dual previews (host_preview /
    // visitor_preview). For legacy single-scheme tournaments (Inter-School,
    // Inter-Club, camps, BCCI) we fall back to the keyword split.
    let hostHeads, visitorHeads;
    if (preview?.host_preview && preview?.visitor_preview) {
        hostHeads = preview.host_preview.head_allocations || [];
        visitorHeads = preview.visitor_preview.head_allocations || [];
    } else {
        const VISITOR_KEYWORDS = ["travel", "da", "ta", "food", "stay", "hotel", "lodging", "boarding", "meal", "conveyance", "transport", "contingency"];
        const isVisitorHead = (label) => {
            const l = ` ${(label || "").toLowerCase()} `;
            return VISITOR_KEYWORDS.some((k) => l.includes(k));
        };
        const heads = preview?.head_allocations || [];
        hostHeads = heads.filter((h) => !isVisitorHead(h.head));
        visitorHeads = heads.filter((h) => isVisitorHead(h.head));
    }
    const heads = preview?.head_allocations || [];
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
            <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Calculator size={16} className="text-mpca-brass" />
                <div className="overline">Step 1 · Prepare Budgets</div>
                {["Inter_Divisional", "Inter_District", "BCCI", "Championship", "Pre_Tournament_Camp"].includes(tournament?.scope) && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest bg-mpca-oxblood/10 text-mpca-oxblood px-2 py-0.5 border border-mpca-oxblood/30 inline-flex items-center gap-1"
                          data-testid="fc-unified-engine-badge"
                          title="This tournament uses the Unified Budget engine — math comes from Match Calendar × Rate Card, not from scheme_calc.">
                        Unified Budget engine
                        {tournament?.unified_budget_snapshot?.is_locked && (
                            <span className="ml-1 border-l border-mpca-oxblood/30 pl-1">
                                🔒 v{tournament.unified_budget_snapshot.locked_version}
                            </span>
                        )}
                    </span>
                )}
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
                <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-green-dark mb-2 flex items-center gap-2">
                    <span>Input Variables</span>
                    {schemeSpec?.scheme_code && (
                        <span className="font-mono text-[9px] bg-mpca-brass/15 text-mpca-oxblood px-1.5 py-0.5 rounded normal-case tracking-normal" data-testid="fc-host-iv-badge">
                            Host · {schemeSpec.scheme_code}
                        </span>
                    )}
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
                {/* MPCA-Feb2026 · Visitor scheme input variables — shown only
                    when the tournament uses two schemes (Inter-Div: 2-D host
                    + 2-C visiting, Inter-District: 2-B + 2-C). */}
                {visitorInputVars.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-mpca-brass/30">
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-mpca-oxblood mb-2 flex items-center gap-2">
                            <span>Visitor Input Variables</span>
                            {visitorSchemeSpec?.scheme_code && (
                                <span className="font-mono text-[9px] bg-mpca-oxblood/15 text-mpca-oxblood px-1.5 py-0.5 rounded normal-case tracking-normal" data-testid="fc-visitor-iv-badge">
                                    Visitor · {visitorSchemeSpec.scheme_code}
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {visitorInputVars.map((v) => (
                                <label key={`vis-${v.key || v.name}`} className="block">
                                    <div className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood mb-1">
                                        {v.label || v.key || v.name}{v.unit && <span className="text-mpca-gray-dark ml-1">({v.unit})</span>}
                                    </div>
                                    <input
                                        type={typeof v.default === "string" ? "text" : "number"}
                                        value={activePoolIvs[v.key || v.name] ?? v.default ?? 0}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            const val = typeof v.default === "string" ? raw : (parseFloat(raw) || 0);
                                            setActivePoolIv(v.key || v.name, val);
                                        }}
                                        className="input-heritage !py-1.5 !text-xs"
                                        data-testid={`fc-iv-${v.key || v.name}`}
                                    />
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Two-panel preview: Host vs Visitors */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <BudgetPreviewPanel
                    title={isMultiPool && currentPool ? `Host Budget · ${currentPool.pool_name}` : "Host Budget"}
                    subtitle={<>
                        {isMultiPool && currentPool
                            ? `Host: ${currentPool.host_body_name || currentPool.host_body_code || "TBD"}`
                            : `${hostCount} host body`}
                        {preview?.host_preview?.scheme_code && (
                            <span className="ml-2 font-mono text-[10px] uppercase bg-mpca-brass/15 text-mpca-oxblood px-1.5 py-0.5 rounded" data-testid="fc-host-scheme-badge">
                                {preview.host_preview.scheme_code} · {preview.host_preview.scheme_name}
                            </span>
                        )}
                    </>}
                    icon={Building2}
                    heads={hostHeads}
                    total={hostTotal}
                    tone="green"
                />
                <BudgetPreviewPanel
                    title={isMultiPool && currentPool ? `Visitor Budget · ${currentPool.pool_name}` : "Visitor Budget (per body)"}
                    subtitle={<>
                        {isMultiPool && currentPool
                            ? `× ${Math.max(0, currentPool.member_count - 1)} visitors in this pool`
                            : `× ${visitorCount} visiting bodies`}
                        {preview?.visitor_preview?.scheme_code && (
                            <span className="ml-2 font-mono text-[10px] uppercase bg-mpca-brass/15 text-mpca-oxblood px-1.5 py-0.5 rounded" data-testid="fc-visitor-scheme-badge">
                                {preview.visitor_preview.scheme_code} · {preview.visitor_preview.scheme_name}
                            </span>
                        )}
                    </>}
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

            {/* M39w · Per-body head editor — MPCA overrides scheme values.
                UX: One card per body; heads listed vertically as rows with
                an amount input on the right (user request). Row shows
                scheme placeholder in gray; the override input flips to
                oxblood the moment MPCA types a number. */}
            {showOverrides && heads.length > 0 && (
                <div className="mt-4 border-2 border-mpca-navy/40 bg-mpca-navy/5 p-4" data-testid="fc-overrides-panel">
                    <div className="flex items-center gap-2 mb-3">
                        <ClipboardCheck className="text-mpca-navy" size={14} />
                        <div className="font-serif text-mpca-navy font-semibold">Edit head amounts per body</div>
                        <span className="text-[10px] text-mpca-gray-dark">Scheme-computed values shown as placeholder — override any cell to change that body&apos;s allocation.</span>
                    </div>
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {rows.map((r) => {
                            const roleHeads = r.role === "Host" ? heads : heads.filter((h) => {
                                const l = ` ${h.head.toLowerCase()} `;
                                return ["travel", "da", "ta", "food", "stay", "hotel", "lodging", "boarding", "meal", "conveyance", "transport", "contingency"].some((k) => l.includes(k));
                            });
                            const bodyOv = perBodyOverrides[r.body_code] || {};
                            const schemeHeadLabels = new Set(roleHeads.map((h) => h.head));
                            // Any override key that is NOT a scheme head is a MPCA-added custom row.
                            const customRows = Object.entries(bodyOv).filter(([k]) => !schemeHeadLabels.has(k));
                            const rowTotal = roleHeads.reduce((s, h) => s + (Number(bodyOv[h.head] ?? h.limit_inr) || 0), 0)
                                            + customRows.reduce((s, [, v]) => s + (Number(v) || 0), 0);
                            const hasOverride = Object.keys(bodyOv).length > 0;
                            return (
                                <div
                                    key={r.body_code}
                                    className={`bulletin-card p-3 ${hasOverride ? "border-mpca-navy" : ""}`}
                                    data-testid={`fc-override-card-${r.body_code}`}
                                >
                                    <div className="flex items-center justify-between border-b border-mpca-brass/30 pb-2 mb-2">
                                        <div className="min-w-0">
                                            <div className="font-serif text-sm text-mpca-green-dark truncate" title={r.body_name}>{r.body_name || r.body_code}</div>
                                            <div className="text-[10px] font-mono text-mpca-brass mt-0.5">{r.body_code} · <span className="uppercase">{r.role}</span></div>
                                        </div>
                                        {hasOverride && (
                                            <button
                                                type="button"
                                                onClick={() => setPerBodyOverrides((d) => { const next = { ...d }; delete next[r.body_code]; return next; })}
                                                className="text-[9px] uppercase tracking-widest text-mpca-oxblood hover:underline"
                                                title="Reset all overrides + custom rows for this body back to scheme defaults"
                                                data-testid={`fc-override-reset-${r.body_code}`}
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        {roleHeads.map((h) => {
                                            const val = bodyOv[h.head];
                                            const isOver = val !== undefined && val !== "";
                                            return (
                                                <div key={h.head} className="grid grid-cols-[1fr_120px] gap-2 items-center">
                                                    <label className="text-[11px] text-mpca-charcoal truncate" title={h.head}>{h.head}</label>
                                                    <input
                                                        type="number"
                                                        placeholder={String(Math.round(h.limit_inr))}
                                                        value={val ?? ""}
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
                                                        className={`text-right font-mono text-[11px] px-1.5 py-1 border ${isOver ? "border-mpca-navy text-mpca-oxblood font-semibold" : "border-mpca-brass/30 text-mpca-charcoal"} bg-mpca-parchment focus:outline-none focus:border-mpca-navy`}
                                                        data-testid={`fc-override-${r.body_code}-${h.head.slice(0, 12)}`}
                                                    />
                                                </div>
                                            );
                                        })}
                                        {/* Sprint FIN-CustomHead · MPCA-added custom rows (persist as keys not present in scheme heads) */}
                                        {customRows.map(([label, amt]) => (
                                            <div key={label} className="grid grid-cols-[1fr_120px_16px] gap-2 items-center" data-testid={`fc-custom-row-${r.body_code}-${label.slice(0, 12)}`}>
                                                <label className="text-[11px] text-mpca-oxblood truncate italic" title={`Custom head added by MPCA · ${label}`}>+ {label}</label>
                                                <input
                                                    type="number"
                                                    value={amt}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setPerBodyOverrides((d) => {
                                                            const next = { ...d };
                                                            const bodyMap = { ...(next[r.body_code] || {}) };
                                                            if (v === "" || v === null) delete bodyMap[label];
                                                            else bodyMap[label] = parseFloat(v) || 0;
                                                            if (Object.keys(bodyMap).length) next[r.body_code] = bodyMap;
                                                            else delete next[r.body_code];
                                                            return next;
                                                        });
                                                    }}
                                                    className="text-right font-mono text-[11px] px-1.5 py-1 border border-mpca-oxblood/60 text-mpca-oxblood font-semibold bg-mpca-parchment focus:outline-none focus:border-mpca-oxblood"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setPerBodyOverrides((d) => {
                                                        const next = { ...d };
                                                        const bodyMap = { ...(next[r.body_code] || {}) };
                                                        delete bodyMap[label];
                                                        if (Object.keys(bodyMap).length) next[r.body_code] = bodyMap;
                                                        else delete next[r.body_code];
                                                        return next;
                                                    })}
                                                    className="text-mpca-oxblood hover:text-mpca-oxblood/70"
                                                    title="Remove this custom head"
                                                    data-testid={`fc-custom-row-remove-${r.body_code}-${label.slice(0, 8)}`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add-row form */}
                                    <AddCustomHeadForm bodyCode={r.body_code} onAdd={(headName, amount) => {
                                        setPerBodyOverrides((d) => {
                                            const next = { ...d };
                                            const bodyMap = { ...(next[r.body_code] || {}) };
                                            // Don't clobber an existing scheme head or existing custom head with same label.
                                            if (schemeHeadLabels.has(headName) || bodyMap[headName] !== undefined) {
                                                return next;
                                            }
                                            bodyMap[headName] = amount;
                                            next[r.body_code] = bodyMap;
                                            return next;
                                        });
                                    }} />

                                    <div className="mt-2 pt-2 border-t border-mpca-brass/30 flex items-center justify-between text-[11px]">
                                        <span className="text-mpca-gray-dark uppercase tracking-widest text-[9px]">Body Total</span>
                                        <span className="font-mono text-mpca-oxblood font-semibold">{fmt(rowTotal)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// Sprint FIN-CustomHead · Tiny inline form used inside every per-body card
// to let MPCA add a completely new expense head (label + amount) that isn't
// part of the scheme master — useful for one-off Division-specific costs
// (e.g. "Referee travel — chartered bus", "Ground preparation — extra roll").
const AddCustomHeadForm = ({ bodyCode, onAdd }) => {
    const [open, setOpen] = useState(false);
    const [head, setHead] = useState("");
    const [amount, setAmount] = useState("");
    const disabled = !head.trim() || !(parseFloat(amount) > 0);
    const submit = () => {
        if (disabled) return;
        onAdd(head.trim(), parseFloat(amount));
        setHead(""); setAmount(""); setOpen(false);
    };
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 w-full text-[10px] uppercase tracking-widest text-mpca-navy hover:text-mpca-oxblood border border-dashed border-mpca-navy/40 hover:border-mpca-oxblood py-1.5 flex items-center justify-center gap-1"
                data-testid={`fc-add-head-btn-${bodyCode}`}
            >
                + Add Head
            </button>
        );
    }
    return (
        <div className="mt-2 border border-mpca-navy/40 bg-mpca-navy/5 p-2 space-y-1.5" data-testid={`fc-add-head-form-${bodyCode}`}>
            <input
                type="text"
                autoFocus
                placeholder="Expense head (e.g. Chartered Bus)"
                value={head}
                onChange={(e) => setHead(e.target.value)}
                className="w-full text-[11px] px-1.5 py-1 border border-mpca-brass/40 bg-mpca-parchment focus:outline-none focus:border-mpca-navy"
                data-testid={`fc-add-head-label-${bodyCode}`}
            />
            <div className="grid grid-cols-[1fr_60px_60px] gap-1.5">
                <input
                    type="number"
                    placeholder="Amount ₹"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                    className="text-right font-mono text-[11px] px-1.5 py-1 border border-mpca-brass/40 bg-mpca-parchment focus:outline-none focus:border-mpca-navy"
                    data-testid={`fc-add-head-amt-${bodyCode}`}
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={disabled}
                    className="text-[10px] uppercase tracking-widest bg-mpca-navy text-mpca-parchment disabled:opacity-30 disabled:cursor-not-allowed"
                    data-testid={`fc-add-head-save-${bodyCode}`}
                >
                    Add
                </button>
                <button
                    type="button"
                    onClick={() => { setOpen(false); setHead(""); setAmount(""); }}
                    className="text-[10px] uppercase tracking-widest border border-mpca-brass/50 text-mpca-brass"
                >
                    Cancel
                </button>
            </div>
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

export default TournamentFinanceConsole;


// ─────────────────────────────────────────────────────────────
// MPCA-230 · Unified Budget Link Panel
// ─────────────────────────────────────────────────────────────
// Replaces the legacy scheme-based PreparePanel for tournaments covered by
// the Unified Budget engine. Shows lock state, drift alerts, and calls the
// prepare-budgets-unified endpoint. No input variables required — the math
// lives in the Unified Budget compute engine (Match Calendar × Rate Card).
function UnifiedBudgetLinkPanel({ tournament, anyBudgetsExist, busy, onPrepare, onRefresh }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        if (!tournament?.id) return;
        setLoading(true); setErr(null);
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/unified-budget/status`);
            setStatus(data);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setLoading(false); }
    }, [tournament?.id]);
    useEffect(() => { load(); }, [load, tournament?.unified_budget_snapshot?.locked_version]);

    if (loading && !status) {
        return (
            <div className="bulletin-card p-4 mb-6 text-center text-mpca-brass text-sm flex items-center gap-2 justify-center" data-testid="fc-unified-link-loading">
                <Loader2 size={14} className="animate-spin" /> Reading Unified Budget state…
            </div>
        );
    }

    const isLocked = !!status?.is_locked;
    const hasDrift = !!status?.has_drift;
    const liveGrand = Number(status?.live_grand_total || 0);
    const lockedGrand = Number(status?.locked_grand_total || 0);
    const delta = Number(status?.delta_inr || 0);
    const workspaceUrl = `/tournaments/${tournament.id}`;

    return (
        <div className="bulletin-card p-6 mb-6" data-testid="fc-unified-link-panel">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Wallet size={16} className="text-mpca-oxblood" />
                <div className="overline">Step 1 · Budget Source</div>
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest bg-mpca-oxblood/10 text-mpca-oxblood px-2 py-0.5 border border-mpca-oxblood/30 inline-flex items-center gap-1" data-testid="fc-unified-engine-badge">
                    Unified Budget engine
                </span>
                {isLocked && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest bg-mpca-green-dark/10 text-mpca-green-dark px-2 py-0.5 border border-mpca-green-dark/30 inline-flex items-center gap-1" data-testid="fc-locked-chip">
                        <Lock size={10} /> v{status?.locked_version}
                    </span>
                )}
                {hasDrift && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2 py-0.5 inline-flex items-center gap-1 animate-pulse" data-testid="fc-drift-chip">
                        <AlertTriangle size={10} /> Budget out-of-sync · re-lock
                    </span>
                )}
                <span className="text-[10px] italic text-mpca-gray-dark ml-auto">
                    Legacy scheme calculators (2-B / 2-D) are deprecated for this scope.
                </span>
            </div>

            <h2 className="font-serif text-2xl text-mpca-green-dark mb-1">
                {!isLocked && "Compute + lock the Unified Budget first"}
                {isLocked && !hasDrift && "Budget is locked — ready to send to Divisions"}
                {isLocked && hasDrift && "Budget drifted from the locked snapshot"}
            </h2>
            <p className="text-sm text-mpca-gray-dark mb-4">
                {!isLocked && (<>Open the <b>Tournament Workspace</b> → <b>Unified Budget</b> setup box, verify the Match Calendar × Rate Card × Officials math, then click <b>Lock Budget</b>. The locked snapshot is what Divisions will see and claim against.</>)}
                {isLocked && !hasDrift && (<>The locked snapshot is <b>{INR(lockedGrand)}</b>. Click <b>Prepare Division Budgets</b> to materialise one Draft per body (Host + Visitors) from the locked head allocations. Divisions receive them on Send.</>)}
                {isLocked && hasDrift && (<>Live compute now reads <b>{INR(liveGrand)}</b> vs locked <b>{INR(lockedGrand)}</b> (Δ <b>{delta >= 0 ? "+" : ""}{INR(delta)}</b>). This usually means a cost driver changed (KO team names replaced, rate card edited, fixture dates moved). Go to the Unified Budget panel, click <b>Unlock</b>, then <b>Lock</b> again to freeze the new snapshot before re-issuing to Divisions.</>)}
            </p>

            {err && (
                <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-3 text-xs text-mpca-oxblood mb-3" data-testid="fc-unified-err">{err}</div>
            )}

            {/* Snapshot summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="border border-mpca-brass/30 bg-white px-4 py-3">
                    <div className="overline text-[9px]">Live compute</div>
                    <div className="font-mono text-xl text-mpca-charcoal">{INR(liveGrand)}</div>
                    <div className="text-[9px] text-mpca-gray-dark">Match Calendar × Rate Card × Officials</div>
                </div>
                <div className={`border px-4 py-3 ${isLocked ? "border-mpca-green-dark/40 bg-mpca-green-dark/5" : "border-mpca-brass/30 bg-mpca-parchment/40"}`}>
                    <div className="overline text-[9px]">Locked snapshot</div>
                    <div className="font-mono text-xl text-mpca-green-dark">{isLocked ? INR(lockedGrand) : "—"}</div>
                    <div className="text-[9px] text-mpca-gray-dark">
                        {isLocked ? `v${status?.locked_version} · ${status?.locked_at ? new Date(status.locked_at).toLocaleString("en-IN") : ""}` : "Not locked yet"}
                    </div>
                </div>
                <div className={`border px-4 py-3 ${hasDrift ? "border-mpca-oxblood bg-mpca-oxblood/5 animate-pulse" : "border-mpca-brass/30 bg-white"}`}>
                    <div className="overline text-[9px]">Drift</div>
                    <div className={`font-mono text-xl ${hasDrift ? "text-mpca-oxblood" : "text-mpca-charcoal"}`}>
                        {hasDrift ? `${delta >= 0 ? "+" : ""}${INR(delta)}` : "None"}
                    </div>
                    <div className="text-[9px] text-mpca-gray-dark">
                        {hasDrift ? "Locked ≠ Live · re-lock recommended" : "Locked matches live"}
                    </div>
                </div>
                <div className="border border-mpca-brass/30 bg-white px-4 py-3">
                    <div className="overline text-[9px]">Divisions ready</div>
                    <div className="font-mono text-xl text-mpca-charcoal">
                        {(status?.live_by_body || []).filter((b) => b.body_code !== "MPCA" && b.total > 0).length}
                    </div>
                    <div className="text-[9px] text-mpca-gray-dark">bodies with non-zero total</div>
                </div>
            </div>

            <div className="flex gap-3 flex-wrap items-center">
                <Link to={workspaceUrl}
                    className="text-[11px] uppercase tracking-widest border border-mpca-brass text-mpca-brass px-3 py-2 hover:bg-mpca-brass/10 flex items-center gap-1.5"
                    data-testid="fc-goto-unified-btn">
                    <RadioTower size={12} /> Open Unified Budget panel
                </Link>
                {isLocked && !anyBudgetsExist && (
                    <button onClick={onPrepare} disabled={busy}
                        className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-2 hover:bg-mpca-oxblood/90 flex items-center gap-1.5 disabled:opacity-40"
                        data-testid="fc-prepare-unified-btn">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Prepare Division Budgets from v{status?.locked_version}
                    </button>
                )}
                {isLocked && anyBudgetsExist && !hasDrift && (
                    <div className="text-[11px] text-mpca-green-dark flex items-center gap-1.5" data-testid="fc-in-sync-note">
                        <CheckCircle2 size={12} /> Division budgets in sync with locked snapshot
                    </div>
                )}
                {hasDrift && anyBudgetsExist && (
                    <button onClick={onPrepare} disabled={busy}
                        className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-2 hover:bg-mpca-oxblood/90 flex items-center gap-1.5 disabled:opacity-40 animate-pulse"
                        data-testid="fc-reprepare-drift-btn">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Re-prepare from new lock
                    </button>
                )}
                <button onClick={load} className="text-[11px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood underline ml-auto"
                    data-testid="fc-status-refresh">
                    <RotateCcw size={10} className="inline mr-1" /> Refresh state
                </button>
            </div>
        </div>
    );
}

