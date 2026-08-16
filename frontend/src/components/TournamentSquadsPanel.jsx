import { useEffect, useState } from "react";
import { Loader2, Users, ShieldCheck, ShieldAlert, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

/**
 * Sprint M28 · Squads panel on the Tournament Workspace
 * ─────────────────────────────────────────────────────
 * Lists one card per participating Division/District showing the state of
 * their squad — Draft / Submitted / Approved, member count, warnings. MPCA
 * Secretary gets a bird's-eye view; each body's Secretary can drill into
 * their squad detail page to add players.
 *
 * MPCA-242 · The section header and status pills are wiring-driven: when the
 * tournament's `squad_approval.flag != "M"`, MPCA does not approve — the copy
 * reflects "lock" instead of "review/approve", and Approved shows as LOCKED.
 */
const STATUS_TONE = {
    Draft: "bg-mpca-brass/20 text-mpca-brass",
    Submitted: "bg-mpca-navy/20 text-mpca-navy",
    Awaiting_MPCA_Approval: "bg-mpca-navy/20 text-mpca-navy",
    Under_Review: "bg-mpca-navy/20 text-mpca-navy",
    Approved: "bg-mpca-green-dark/15 text-mpca-green-dark",
    Rejected: "bg-mpca-oxblood/15 text-mpca-oxblood",
};

const TournamentSquadsPanel = ({ tournament, persona, canManage, onChange: _onChange }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    // MPCA-242 · Read the wiring's squad_approval.flag so header + status pills
    // stay aligned with the governance intent. "M" → MPCA approves; otherwise
    // squad locks locally with no MPCA step.
    const [approvalFlag, setApprovalFlag] = useState(null);

    useEffect(() => {
        let alive = true;
        api.get(`/tournaments/${tournament.id}/wiring-status`)
            .then(r => {
                if (!alive) return;
                const step = (r.data.steps || []).find(s => s.key === "squad_approval");
                setApprovalFlag(step?.flag ?? null);
            })
            .catch(() => { if (alive) setApprovalFlag(null); });
        return () => { alive = false; };
    }, [tournament.id]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setErr("");
            try {
                const { data: participants } = await api.get(`/tournaments/${tournament.id}/participants`);
                const results = await Promise.all(
                    (participants || []).map(async (p) => {
                        // Prefer the /finance drill-down (also returns squad) — one call vs two.
                        try {
                            const { data } = await api.get(`/tournaments/${tournament.id}/participants/${p.body_code}/finance`);
                            return { participant: p, squad: data.squad || null };
                        } catch {
                            return { participant: p, squad: null };
                        }
                    })
                );
                if (!cancelled) setRows(results);
            } catch (e) {
                if (!cancelled) setErr(e?.response?.data?.detail || e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tournament.id]);

    if (loading) return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-8 flex items-center gap-2 text-xs text-mpca-brass" data-testid="squads-loading">
            <Loader2 className="animate-spin" size={12} /> Loading squads…
        </div>
    );

    if (rows.length === 0) return (
        <div className="border border-dashed border-mpca-brass/40 bg-mpca-ivory px-4 py-8 text-center text-[11px] text-mpca-gray-dark" data-testid="squads-empty">
            No participants yet — set up Division Pools in the Tournament Basics panel first, then each participating body will get a squad slot here.
        </div>
    );

    const submittedCount = rows.filter((r) => r.squad && ["Submitted", "Awaiting_MPCA_Approval", "Under_Review", "Approved"].includes(r.squad.submission_status)).length;
    const approvedCount = rows.filter((r) => r.squad?.submission_status === "Approved").length;
    // MPCA-242 · Wiring-driven copy — "M" means MPCA approves; otherwise the
    // Division/District self-locks and there is no MPCA review step.
    const mpcaApproves = approvalFlag === "M";
    const approvedLabel = mpcaApproves ? "Approved" : "Locked";

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-4" data-testid="panel-squads">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <div className="overline text-[9px]">MPCA Multi-Body Squads</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        Squads · {rows.length} bodies · {submittedCount} {mpcaApproves ? "submitted" : "locked"} · {approvedCount} {mpcaApproves ? "approved" : "final"}
                    </div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl" data-testid="squads-panel-subheader">
                        {mpcaApproves ? (
                            <>One card per participating Division/District. Each body&apos;s Secretary builds their own squad; MPCA reviews and approves. Cards flip to &quot;Approved&quot; once selection is locked.</>
                        ) : (
                            <>One card per participating Division/District. Each body&apos;s Secretary builds and locks their own squad — MPCA sees the roster in real time but does not approve for this tournament type per the wiring.</>
                        )}
                    </div>
                </div>
            </div>

            {err && <div className="text-[10px] text-mpca-oxblood bg-mpca-oxblood/5 px-2 py-1 border border-mpca-oxblood/30" data-testid="squads-error">{err}</div>}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="squads-grid">
                {rows.map(({ participant, squad }) => {
                    const isMine = persona?.body_code === participant.body_code;
                    const status = squad?.submission_status || "Not_Started";
                    const memberCount = squad ? (squad.members || []).length : 0;
                    const warnings = squad?.eligibility_warnings?.length || 0;
                    return (
                        <div key={participant.body_code} className="border border-mpca-brass/30 bg-white p-3 space-y-2" data-testid={`squad-card-${participant.body_code}`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="font-serif text-sm text-mpca-green-dark leading-tight">{participant.body_name}</div>
                                    <div className="text-[9px] font-mono text-mpca-brass">
                                        {participant.body_code} · {participant.role} · {participant.pool_name || "—"}
                                    </div>
                                </div>
                                {isMine && <span className="text-[8px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-1.5 py-0.5">yours</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 ${STATUS_TONE[status] || "bg-mpca-gray-dark/15 text-mpca-gray-dark"}`}>
                                    {status === "Approved" ? approvedLabel.toUpperCase() : status.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] font-mono text-mpca-charcoal">
                                    <Users size={10} className="inline" /> {memberCount}/{tournament.max_squad_size || 18}
                                </span>
                                {warnings > 0 && (
                                    <span className="text-[10px] text-mpca-oxblood inline-flex items-center gap-0.5">
                                        <ShieldAlert size={10} /> {warnings}
                                    </span>
                                )}
                                {status === "Approved" && warnings === 0 && (
                                    <span className="text-[10px] text-mpca-green-dark inline-flex items-center gap-0.5">
                                        <ShieldCheck size={10} />
                                    </span>
                                )}
                            </div>
                            {squad ? (
                                <Link
                                    to={`/squads/${squad.id}`}
                                    className="text-[10px] uppercase tracking-widest text-mpca-oxblood hover:underline inline-flex items-center gap-1"
                                    data-testid={`squad-open-${participant.body_code}`}
                                >
                                    Open squad <ChevronRight size={10} />
                                </Link>
                            ) : (
                                <div className="text-[10px] text-mpca-gray-dark italic">
                                    Squad not started {(isMine || canManage) && (
                                        <Link to={`/tournaments/${tournament.id}/squads/new?body=${participant.body_code}`} className="text-mpca-oxblood not-italic hover:underline">
                                            — start it
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TournamentSquadsPanel;
