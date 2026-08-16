import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Circle, ArrowRight, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useWiringOwnerMatch } from "@/lib/useWiring";

/**
 * Sprint M30 · Tournament Status Stepper
 * ──────────────────────────────────────
 * Compact horizontal stepper rendered under the tournament header on
 * TournamentDetail. Shows the lifecycle (Draft → Awaiting_Approval → Upcoming
 * → Squad_Selection → In_Progress → Completed) with the current step
 * highlighted plus a "Pending With Me" strip that lists items MPCA (or the
 * current persona) must act on next.
 */

const STEPS = [
    { key: "Draft", label: "Draft", hint: "Basics + participants being set." },
    { key: "Awaiting_Approval", label: "Awaiting Approval", hint: "MPCA to sanction." },
    { key: "Upcoming", label: "Upcoming", hint: "Sanctioned · Squad selection window opens next." },
    { key: "Squad_Selection", label: "Squad Selection", hint: "Squads being finalised by each participating body." },
    { key: "In_Progress", label: "In Progress", hint: "Matches under way." },
    { key: "Completed", label: "Completed", hint: "Closure letter + reimbursements pending." },
];

const KIND_ICON = {
    squad_review: "SR", squad_pick: "SP",
    budget_approval: "BA", claim_review: "CR",
    tournament_approval: "TA", tournament_submit: "TS",
    input_vars: "IV", closure_letter: "CL",
};

const TournamentStatusStepper = ({ tournament, persona, onAction }) => {
    const [pending, setPending] = useState({ items: [], count: 0 });
    const [loading, setLoading] = useState(false);
    const [advancing, setAdvancing] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/pending-actions`);
            setPending(data);
        } catch (_) { setPending({ items: [], count: 0 }); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [tournament.id, tournament.status]);

    const status = tournament.status || "Draft";
    const activeIdx = STEPS.findIndex((s) => s.key === status);

    // Compute next-step advance action
    const advance = async (kind) => {
        setAdvancing(true);
        try {
            if (kind === "submit") {
                await api.post(`/tournaments/${tournament.id}/submit-for-approval`, null, {
                    params: {
                        actor_name: persona?.name || "MPCA",
                        actor_body_id: persona?.body_code || "MPCA",
                        actor_post: persona?.post || "Secretary",
                    },
                });
            } else if (kind === "approve") {
                await api.post(`/tournaments/${tournament.id}/approve`, null, {
                    params: {
                        actor_name: persona?.name || "MPCA",
                        actor_body_id: persona?.body_code || "MPCA",
                        actor_post: persona?.post || "Hon. Secretary",
                    },
                });
            } else if (kind === "open_selection") {
                await api.post(`/tournaments/${tournament.id}/status/Squad_Selection`);
            } else if (kind === "start_play") {
                await api.post(`/tournaments/${tournament.id}/status/In_Progress`);
            } else if (kind === "complete") {
                await api.post(`/tournaments/${tournament.id}/status/Completed`);
            }
            onAction?.();
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setAdvancing(false); }
    };

    // MPCA-243 · Ship 3 · Persona-driven "advance" affordance is now
    // wiring-driven. For Division-owned tournaments (Inter-District, School,
    // Club, Camp), the Division/District Secretary drives the stepper. For
    // MPCA-owned tournaments (BCCI, Inter-Division), only State personas do.
    const isMPCA = persona?.body_type === "State";
    const wiringOwnsCreation = useWiringOwnerMatch(tournament?.id, "tournament_creation", persona);
    const canAdvance = isMPCA || (wiringOwnsCreation === true);
    const advanceMap = {
        Draft: { label: "Submit for Approval", kind: "submit" },
        Awaiting_Approval: { label: "Approve Tournament", kind: "approve" },
        Upcoming: { label: "Open Squad Selection", kind: "open_selection" },
        Squad_Selection: { label: "Start Tournament", kind: "start_play" },
        In_Progress: { label: "Mark Completed", kind: "complete" },
    };
    const nextAdvance = canAdvance ? advanceMap[status] : null;

    // Persona-filtered pending items
    const myItems = pending.items.filter((it) => {
        if (persona?.body_type === "State") return it.waiting_on === "MPCA";
        return it.waiting_on === persona?.body_code;
    });

    return (
        <div className="border border-mpca-brass/30 bg-mpca-parchment/40 mb-5" data-testid="tournament-status-stepper">
            {/* ─── Stepper ─── */}
            <div className="px-5 py-3 border-b border-mpca-brass/20 overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max">
                    {STEPS.map((step, idx) => {
                        const done = idx < activeIdx || status === "Completed";
                        const current = idx === activeIdx;
                        const upcoming = idx > activeIdx;
                        return (
                            <div key={step.key} className="flex items-center gap-2">
                                <div className={`flex items-center gap-2 px-2.5 py-1 ${
                                    current ? "bg-mpca-oxblood text-mpca-ivory" :
                                    done ? "text-mpca-green-dark" :
                                    "text-mpca-gray-dark"
                                }`} title={step.hint} data-testid={`stepper-step-${step.key}`}>
                                    {done ? <CheckCircle2 size={13} /> : current ? <Clock size={13} /> : <Circle size={13} />}
                                    <span className={`text-[10px] uppercase tracking-widest font-mono ${current ? "font-bold" : ""}`}>
                                        {step.label}
                                    </span>
                                </div>
                                {idx < STEPS.length - 1 && <ArrowRight size={11} className={upcoming ? "text-mpca-gray-light" : "text-mpca-brass"} />}
                            </div>
                        );
                    })}
                    {nextAdvance && (
                        <button
                            onClick={() => {
                                if (window.confirm(`${nextAdvance.label} — proceed?`)) advance(nextAdvance.kind);
                            }}
                            disabled={advancing}
                            className="ml-3 text-[10px] uppercase tracking-widest bg-mpca-gold-light text-mpca-green-dark px-3 py-1.5 border border-mpca-gold-light hover:bg-mpca-gold transition-colors disabled:opacity-40 flex items-center gap-1"
                            data-testid="stepper-advance-btn"
                        >
                            {nextAdvance.label} <ArrowRight size={11} />
                        </button>
                    )}
                </div>
            </div>

            {/* ─── Pending With Me ─── */}
            <div className="px-5 py-3">
                <div className="flex items-center gap-2 mb-2">
                    <div className="overline">
                        {persona?.body_type === "State" ? "Pending With MPCA" : `Pending With ${persona?.body_code || "You"}`}
                    </div>
                    <span className="text-[10px] font-mono text-mpca-oxblood" data-testid="stepper-pending-count">
                        {loading ? "…" : `${myItems.length} item${myItems.length === 1 ? "" : "s"}`}
                    </span>
                </div>
                {myItems.length === 0 ? (
                    <div className="text-[11px] italic text-mpca-gray-dark flex items-center gap-1" data-testid="stepper-pending-empty">
                        <Info size={11} /> Nothing pending on your side right now.
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2" data-testid="stepper-pending-list">
                        {myItems.map((it) => (
                            <Link
                                key={`${it.kind}-${it.record_id}`}
                                to={it.deep_link}
                                className="text-[11px] px-2 py-1 border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors flex items-center gap-2"
                                data-testid={`stepper-pending-item-${it.kind}`}
                                title={`${it.label} · click to open`}
                            >
                                <span className="font-mono text-[9px] uppercase tracking-widest border border-current px-1">{KIND_ICON[it.kind] || "!"}</span>
                                <span className="font-serif">{it.label}</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TournamentStatusStepper;
