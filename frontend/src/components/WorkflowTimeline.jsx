/**
 * WorkflowTimeline · reusable — renders any `approval_chain[]` in the ERP.
 * Give it either the raw chain or a workflow_key + record and it draws
 * a heritage-styled vertical timeline.
 */
import { ChevronRight, CheckCircle2, RotateCcw, X, Send, Gavel, Signature } from "lucide-react";

const ACTION_META = {
    Submit:    { color: "text-mpca-oxblood",       icon: Send },
    Review:    { color: "text-mpca-brass",         icon: ChevronRight },
    Approve:   { color: "text-mpca-green-dark",    icon: CheckCircle2 },
    Approved:  { color: "text-mpca-green-dark",    icon: CheckCircle2 },
    Authorise: { color: "text-mpca-green-dark",    icon: Signature },
    Disburse:  { color: "text-mpca-green-dark",    icon: Gavel },
    Reject:    { color: "text-mpca-oxblood",       icon: X },
    Rejected:  { color: "text-mpca-oxblood",       icon: X },
    Send_Back: { color: "text-mpca-brass",         icon: RotateCcw },
    Sanctioned:{ color: "text-mpca-green-dark",    icon: CheckCircle2 },
    Submitted: { color: "text-mpca-oxblood",       icon: Send },
};

const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const Entry = ({ e, isFirst, isLast }) => {
    // Accept both new ChainEntry (stage_label, action, timestamp) and legacy ApprovalStep (stage, decision, decided_on).
    const label = e.stage_label || e.stage || "—";
    const action = e.action || e.decision || "—";
    const time = e.timestamp || e.decided_on;
    const actor = e.actor_name || "—";
    const post = e.actor_role || e.actor_post;
    const body = e.actor_body_id;
    const note = e.note || e.notes;
    const meta = ACTION_META[action] || { color: "text-mpca-charcoal" };
    const Icon = meta.icon;
    return (
        <li className="pl-6 relative pb-4">
            <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full ring-4 ring-mpca-ivory ${isLast ? "bg-mpca-oxblood" : "bg-mpca-green-dark"}`} />
            <div className="flex items-baseline gap-2 flex-wrap">
                {Icon && <Icon size={12} className={meta.color} />}
                <span className="font-serif text-mpca-green-dark uppercase tracking-wider text-xs">{label}</span>
                <span className={`text-[10px] font-mono uppercase tracking-widest ${meta.color}`}>{String(action).replace(/_/g, " ")}</span>
                <span className="text-[10px] font-mono text-mpca-brass ml-auto">{fmt(time)}</span>
            </div>
            <div className="text-[11px] text-mpca-charcoal mt-1">
                {actor}{post ? ` · ${post}` : ""}{body ? ` · ${body}` : ""}
            </div>
            {note && <div className="text-[11px] italic text-mpca-gray-dark mt-1">{note}</div>}
            {e.document_url && (
                <a href={e.document_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-mpca-oxblood underline mt-1 inline-block">
                    View document
                </a>
            )}
        </li>
    );
};

export const WorkflowTimeline = ({ chain = [], reverse = true, emptyText = "No actions recorded yet.", testId = "workflow-timeline" }) => {
    if (!chain || chain.length === 0) {
        return <div className="p-6 border border-mpca-brass/30 text-center text-mpca-gray-dark italic font-serif text-sm" data-testid={`${testId}-empty`}>{emptyText}</div>;
    }
    const ordered = reverse ? [...chain].reverse() : chain;
    return (
        <ol className="relative border-l-2 border-mpca-brass/40 ml-3 space-y-1" data-testid={testId}>
            {ordered.map((e, i) => (
                <Entry key={i} e={e} isFirst={i === 0} isLast={i === ordered.length - 1} />
            ))}
        </ol>
    );
};

export default WorkflowTimeline;
