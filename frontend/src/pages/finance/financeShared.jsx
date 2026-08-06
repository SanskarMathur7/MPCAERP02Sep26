/** M39z.f · Shared finance helpers extracted from TournamentFinanceConsole
 *  ──────────────────────────────────────────────────────────────────────
 *  fmt · STATUS_META · StatusPill are used by every finance sub-panel; put
 *  them here once so the console can shrink and the panels stop cross-
 *  referencing back into the parent file.
 */

export const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

export const STATUS_META = {
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

export const StatusPill = ({ status }) => {
    const m = STATUS_META[status || "None"] || STATUS_META["None"];
    return (
        <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] uppercase tracking-widest font-semibold ${m.tone}`}
              data-testid={`fc-status-${status || "none"}`}>
            {m.label}
        </span>
    );
};
