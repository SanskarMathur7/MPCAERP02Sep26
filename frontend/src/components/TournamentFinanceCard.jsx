import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Wallet, Send, Check, ShieldCheck, RotateCcw, ArrowRight, AlertTriangle,
    Sparkles, Upload, FileCheck2, HandCoins, ScrollText, CheckCircle2, Clock,
} from "lucide-react";
import { api } from "@/lib/api";

/** M39t · Consolidated Finance Panel
 * -------------------------------------
 * Single card on the Tournament Workspace that folds all six finance-related
 * boxes (Input Variables, Budget & Extras, Invoices + DA Forms, Financial
 * Summary, MPCA Receipts, Closure Letter) into ONE role-scoped action card.
 * Shows the caller *exactly* what they need to do next, plus a jump link to
 * the full Finance Console.
 */

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

// Priority-ordered action derivations. First match wins.
// M39z.g · `isOrganiser` grants MPCA-equivalent affordances to the tournament's
// host body — Divisions on Inter-District / Clubs they host get the same
// prepare-send-sanction card MPCA gets on Inter-Divisional tournaments.
const deriveAction = (matrix, persona, tournament) => {
    const isState = persona?.body_type === "State";
    const myBody = persona?.body_code;
    const hostBody = tournament?.host_body_id || "MPCA";
    const isOrganiser = isState || (myBody && myBody === hostBody);
    const organiserLabel = hostBody === "MPCA" ? "MPCA" : hostBody;
    const rows = matrix?.rows || [];

    // Nothing prepared yet
    if (!rows.some((r) => r.budget_id)) {
        if (isOrganiser) {
            if (!matrix?.input_vars_set) {
                return { icon: Sparkles, tone: "brass",
                    title: "Set input variables & prepare budgets",
                    detail: "Open the Finance Console, enter the tournament's IVs, then prepare the Host + Visitor budgets.",
                    cta: "Prepare Budgets" };
            }
            return { icon: Sparkles, tone: "brass",
                title: "Prepare budgets for all participants",
                detail: `${rows.length} bodies waiting for a budget from ${organiserLabel}.`,
                cta: "Open Finance Console" };
        }
        return { icon: Clock, tone: "gray",
            title: `Awaiting ${organiserLabel} to prepare budgets`,
            detail: `You'll be notified when ${organiserLabel} sends your budget for acceptance.`,
            cta: "Open Finance Console" };
    }

    // Non-organiser view — check own budget
    if (!isOrganiser) {
        const myRow = rows.find((r) => r.body_code === myBody);
        if (myRow) {
            const s = myRow.budget_status;
            if (s === "Sent_To_Division") {
                return { icon: Check, tone: "oxblood",
                    title: `Accept your budget · ${fmt(myRow.budget_total_inr)}`,
                    detail: `${organiserLabel} has sent you a budget. Review, then Accept or Request Revision.`,
                    cta: "Review & Respond" };
            }
            if (s === "Accepted_By_Division") {
                return { icon: Clock, tone: "navy",
                    title: `Awaiting ${organiserLabel} final sanction`,
                    detail: `You accepted ${fmt(myRow.budget_total_inr)}. ${organiserLabel} will sanction shortly.`,
                    cta: "View Status" };
            }
            if (s === "Revision_Requested") {
                return { icon: Clock, tone: "brass",
                    title: `Revision requested — awaiting ${organiserLabel}`,
                    detail: `${organiserLabel} will revise and re-send your budget.`,
                    cta: "View Status" };
            }
            if (s === "Approved") {
                if (!myRow.claim_id) {
                    return { icon: Upload, tone: "green",
                        title: `Upload invoices · ${fmt(myRow.approved_total_inr || myRow.budget_total_inr)} sanctioned`,
                        detail: "Budget sanctioned. Start uploading vendor invoices and DA forms.",
                        cta: "Upload Invoices" };
                }
                if (["Draft", "Rejected"].includes(myRow.claim_status)) {
                    return { icon: FileCheck2, tone: "green",
                        title: "Submit reimbursement claim",
                        detail: `Consolidate invoices + DA + extras into a signed claim.`,
                        cta: "Open Claim" };
                }
                if (["Submitted", "Under_Review"].includes(myRow.claim_status)) {
                    return { icon: Clock, tone: "navy",
                        title: `Claim submitted — awaiting ${organiserLabel} review`,
                        detail: `${organiserLabel} is processing your reimbursement claim.`,
                        cta: "View Claim" };
                }
                if (myRow.claim_status === "Approved") {
                    return { icon: HandCoins, tone: "green",
                        title: `Claim approved · ${fmt(myRow.claim_approved_inr || 0)}`,
                        detail: `Awaiting disbursement from ${organiserLabel}.`,
                        cta: "View Claim" };
                }
            }
        }
    }

    // Organiser view — pick the most urgent action
    if (isOrganiser) {
        const drafts = rows.filter((r) => r.budget_status === "Draft").length;
        const accepted = rows.filter((r) => r.budget_status === "Accepted_By_Division").length;
        const revisions = rows.filter((r) => r.budget_status === "Revision_Requested").length;
        const sent = rows.filter((r) => r.budget_status === "Sent_To_Division").length;
        if (revisions > 0) {
            return { icon: AlertTriangle, tone: "oxblood",
                title: `${revisions} revision request${revisions > 1 ? "s" : ""} pending`,
                detail: "One or more participants have asked for changes. Revise IVs and re-send.",
                cta: "Review Revisions" };
        }
        if (accepted > 0) {
            return { icon: ShieldCheck, tone: "green",
                title: `${accepted} budget${accepted > 1 ? "s" : ""} awaiting your sanction`,
                detail: "Participants have accepted — grant final sanction to unlock spending.",
                cta: "Sanction Budgets" };
        }
        if (drafts > 0) {
            return { icon: Send, tone: "brass",
                title: `${drafts} draft${drafts > 1 ? "s" : ""} ready to send`,
                detail: "Send prepared budgets to participants for their acceptance.",
                cta: "Send Drafts" };
        }
        if (sent > 0) {
            return { icon: Clock, tone: "gray",
                title: `Waiting on ${sent} participant${sent > 1 ? "s" : ""} to respond`,
                detail: "Budgets sent — participants will Accept or Request Revision.",
                cta: "View Status" };
        }
        const claimsInReview = rows.filter((r) => ["Submitted", "Under_Review"].includes(r.claim_status)).length;
        if (claimsInReview > 0) {
            return { icon: FileCheck2, tone: "navy",
                title: `${claimsInReview} reimbursement claim${claimsInReview > 1 ? "s" : ""} to review`,
                detail: "Approve or reject participant reimbursement claims.",
                cta: "Review Claims" };
        }
    }

    return { icon: CheckCircle2, tone: "green",
        title: "All finance actions up to date",
        detail: "Nothing pending on your side right now.",
        cta: "Open Finance Console" };
};

const TONE_STYLES = {
    brass:    { border: "border-mpca-brass",       bg: "bg-mpca-gold-light/20",    text: "text-mpca-brass",       btn: "bg-mpca-brass text-mpca-parchment hover:bg-mpca-brass/90" },
    oxblood:  { border: "border-mpca-oxblood",     bg: "bg-mpca-oxblood/5",        text: "text-mpca-oxblood",     btn: "bg-mpca-oxblood text-mpca-parchment hover:bg-mpca-oxblood/90" },
    green:    { border: "border-mpca-green-dark",  bg: "bg-mpca-green-dark/5",     text: "text-mpca-green-dark",  btn: "bg-mpca-green-dark text-mpca-parchment hover:bg-mpca-green-dark/90" },
    navy:     { border: "border-mpca-navy",        bg: "bg-mpca-navy/5",           text: "text-mpca-navy",        btn: "bg-mpca-navy text-mpca-parchment hover:bg-mpca-navy/90" },
    gray:     { border: "border-mpca-gray",        bg: "bg-mpca-parchment",        text: "text-mpca-gray-dark",   btn: "bg-mpca-gray-dark text-mpca-parchment hover:bg-mpca-gray-dark/90" },
};

const TournamentFinanceCard = ({ tournament, persona }) => {
    const navigate = useNavigate();
    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let stop = false;
        (async () => {
            try {
                const { data } = await api.get(`/tournaments/${tournament.id}/finance/matrix`);
                if (!stop) setMatrix(data);
            } catch {
                if (!stop) setMatrix({ rows: [] });
            } finally {
                if (!stop) setLoading(false);
            }
        })();
        return () => { stop = true; };
    }, [tournament.id]);

    if (loading) {
        return (
            <div className="col-span-2 md:col-span-4 bulletin-card p-5 border-l-4 border-mpca-brass/40 animate-pulse" data-testid="tf-card-loading">
                <div className="h-4 bg-mpca-brass/10 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-mpca-brass/10 rounded w-1/2"></div>
            </div>
        );
    }

    const rows = matrix?.rows || [];
    const isState = persona?.body_type === "State";
    const isOrganiser = isState || (persona?.body_code && persona.body_code === (tournament?.host_body_id || "MPCA"));
    const action = deriveAction(matrix, persona, tournament);
    const tone = TONE_STYLES[action.tone] || TONE_STYLES.brass;
    const Icon = action.icon;

    // Progress mini-stats
    const totalBudget = rows.reduce((s, r) => s + (r.budget_total_inr || 0), 0);
    const sanctionedTotal = rows.reduce((s, r) => s + (r.approved_total_inr || 0), 0);
    const spentTotal = rows.reduce((s, r) => s + (r.invoice_total_inr || 0) + (r.extras_total_inr || 0), 0);
    const budgetsSanctioned = rows.filter((r) => r.budget_status === "Approved").length;

    return (
        <div className={`col-span-2 md:col-span-4 bulletin-card p-0 border-l-4 ${tone.border}`} data-testid="tf-card">
            <div className={`p-5 ${tone.bg}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                        <div className={`p-2 border-2 ${tone.border} bg-mpca-parchment shrink-0`}>
                            <Icon className={tone.text} size={20} />
                        </div>
                        <div>
                            <div className="overline flex items-center gap-2 mb-0.5">
                                <Wallet size={11} /> Finance · Action for {isOrganiser && !isState ? `${persona?.body_code} (organiser)` : (isState ? "MPCA" : (persona?.body_code || "you"))}
                                {matrix?.multi_pool && (
                                    <span className="text-[9px] uppercase tracking-widest bg-mpca-navy/10 text-mpca-navy px-1.5 py-0.5 border border-mpca-navy/30">
                                        Multi-pool · {matrix.pools?.length || 0} pools
                                    </span>
                                )}
                            </div>
                            <div className={`font-serif text-lg ${tone.text}`} data-testid="tf-card-title">
                                {action.title}
                            </div>
                            <p className="text-xs text-mpca-charcoal mt-1 max-w-2xl" data-testid="tf-card-detail">
                                {action.detail}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate(`/tournaments/${tournament.id}/finance`)}
                        className={`px-4 py-2 text-[11px] uppercase tracking-widest font-semibold ${tone.btn} flex items-center gap-2 shrink-0`}
                        data-testid="tf-card-cta"
                    >
                        {action.cta}
                        <ArrowRight size={12} />
                    </button>
                </div>
            </div>

            {/* Mini stat strip */}
            {rows.some((r) => r.budget_id) && (
                <div className="grid grid-cols-2 md:grid-cols-4 border-t border-mpca-brass/20 divide-x divide-mpca-brass/20 text-xs" data-testid="tf-card-stats">
                    <Stat label="Proposed" value={fmt(totalBudget)} />
                    <Stat label="Sanctioned" value={fmt(sanctionedTotal)} tone="green" />
                    <Stat label="Spent" value={fmt(spentTotal)} />
                    <Stat label="Sanctioned bodies" value={`${budgetsSanctioned} / ${rows.length}`} tone="brass" />
                </div>
            )}
        </div>
    );
};

const Stat = ({ label, value, tone }) => (
    <div className="px-4 py-2.5">
        <div className="text-[9px] uppercase tracking-widest text-mpca-gray-dark">{label}</div>
        <div className={`font-serif text-sm ${tone === "green" ? "text-mpca-green-dark" : tone === "brass" ? "text-mpca-brass" : "text-mpca-charcoal"}`}>
            {value}
        </div>
    </div>
);

export default TournamentFinanceCard;
