/**
 * MPCA-258 · InvoicePreviewModal
 * ─────────────────────────────
 * Read-only invoice detail modal for MPCA reviewers. Opened from the
 * "Attached Invoices" list on the reimbursement-claim detail page (and
 * elsewhere). Shows every field on the invoice — meta, head allocations,
 * grant eligibility, and a link to open the raw signed file if the
 * uploader attached one.
 */
import { X, FileText, ExternalLink } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const fmt = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (s) => (s ? new Date(String(s).length > 10 ? s : s + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const Row = ({ label, value, mono }) => (
    <div className="grid grid-cols-3 gap-3 py-1.5 border-b border-mpca-brass/10 text-[12px]">
        <div className="text-[10px] uppercase tracking-widest text-mpca-brass">{label}</div>
        <div className={`col-span-2 ${mono ? "font-mono" : "font-serif"} text-mpca-charcoal`}>{value ?? "—"}</div>
    </div>
);

export default function InvoicePreviewModal({ invoice, bodyName, onClose }) {
    if (!invoice) return null;
    const allocs = invoice.allocations || [];
    const eligibility = invoice.grant_eligibility || {};
    const overBudget = Number(eligibility.over_budget_amount_inr || 0);
    const fileHref = invoice.file_url
        ? (invoice.file_url.startsWith("http") ? invoice.file_url : `${BACKEND_URL}${invoice.file_url}`)
        : null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-16 pb-8 px-4" onClick={onClose} data-testid="invoice-preview-modal">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-3xl w-full max-h-[86vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 bg-mpca-oxblood text-mpca-ivory px-5 py-3 flex items-center justify-between">
                    <div>
                        <div className="text-[9px] uppercase tracking-[0.3em] opacity-80">Invoice Preview</div>
                        <div className="font-serif text-xl mt-0.5">{invoice.invoice_ref}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-ivory hover:text-mpca-gold-light" data-testid="invoice-preview-close">
                        <X size={20} />
                    </button>
                </div>

                {/* Meta */}
                <div className="px-5 py-4 border-b border-mpca-brass/20">
                    <Row label="Vendor"          value={<b>{invoice.vendor_name}</b>} />
                    <Row label="Invoice No."     value={invoice.invoice_no} mono />
                    <Row label="Invoice Date"    value={fmtDate(invoice.invoice_date)} />
                    <Row label="Body / Division" value={bodyName ? `${bodyName} (${invoice.body_id})` : invoice.body_id} />
                    <Row label="Tournament"      value={invoice.tournament_id} mono />
                    <Row label="Status"          value={invoice.status || "—"} />
                    <Row label="Created by"      value={invoice.created_by} />
                    <Row label="Created at"      value={fmtDate(invoice.created_at)} />
                    {invoice.notes && <Row label="Notes" value={invoice.notes} />}
                </div>

                {/* Amounts */}
                <div className="px-5 py-4 border-b border-mpca-brass/20">
                    <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-2">Amounts</div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="border border-mpca-brass/30 p-3">
                            <div className="text-[9px] uppercase tracking-widest text-mpca-brass">Amount</div>
                            <div className="font-mono text-lg text-mpca-charcoal">{fmt(invoice.amount_inr)}</div>
                        </div>
                        <div className="border border-mpca-brass/30 p-3">
                            <div className="text-[9px] uppercase tracking-widest text-mpca-brass">GST</div>
                            <div className="font-mono text-lg text-mpca-charcoal">{fmt(invoice.gst_inr)}</div>
                        </div>
                        <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 p-3">
                            <div className="text-[9px] uppercase tracking-widest text-mpca-oxblood">Total</div>
                            <div className="font-mono text-lg text-mpca-oxblood">{fmt(invoice.total_inr)}</div>
                        </div>
                    </div>
                </div>

                {/* Head allocations */}
                <div className="px-5 py-4 border-b border-mpca-brass/20">
                    <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-2">Budget Head Allocation ({allocs.length})</div>
                    {allocs.length === 0 ? (
                        <div className="text-[12px] italic text-mpca-gray-dark">
                            Legacy single-head invoice · <span className="font-mono">{invoice.budget_head_code || "—"}</span>
                        </div>
                    ) : (
                        <table className="w-full text-[12px]">
                            <thead>
                                <tr className="border-b border-mpca-brass/40">
                                    <th className="text-left py-1 text-[10px] uppercase tracking-widest text-mpca-brass">Head</th>
                                    <th className="text-left py-1 text-[10px] uppercase tracking-widest text-mpca-brass">Head Code</th>
                                    <th className="text-right py-1 text-[10px] uppercase tracking-widest text-mpca-brass">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocs.map((a, i) => (
                                    <tr key={i} className="border-b border-mpca-brass/10">
                                        <td className="py-1.5">{a.head_label || "—"}</td>
                                        <td className="py-1.5 font-mono text-[11px]">{a.head_code || "—"}</td>
                                        <td className="py-1.5 text-right font-mono">{fmt(a.amount_inr)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Grant eligibility */}
                {(eligibility.eligible_amount_inr != null || overBudget) && (
                    <div className="px-5 py-4 border-b border-mpca-brass/20">
                        <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-2">Grant Eligibility Check</div>
                        <Row label="Eligible amount" value={<span className="font-mono">{fmt(eligibility.eligible_amount_inr)}</span>} />
                        {overBudget > 0 && (
                            <Row
                                label="Over-budget"
                                value={<span className="font-mono text-mpca-oxblood"><b>{fmt(overBudget)}</b> · exceeds head cap</span>}
                            />
                        )}
                    </div>
                )}

                {/* Signed file link */}
                <div className="px-5 py-4 flex items-center justify-between gap-3">
                    {fileHref ? (
                        <a
                            href={fileHref}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1.5"
                            data-testid="invoice-preview-open-file"
                        >
                            <FileText size={13} /> Open signed invoice file <ExternalLink size={11} />
                        </a>
                    ) : (
                        <span className="text-[11px] italic text-mpca-gray-dark">No signed file attached to this invoice record.</span>
                    )}
                    <button
                        onClick={onClose}
                        className="text-[11px] uppercase tracking-widest border border-mpca-brass/60 text-mpca-brass hover:bg-mpca-parchment/60 px-3 py-1.5"
                        data-testid="invoice-preview-close-btn"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
