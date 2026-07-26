import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Loader2, ArrowRight, Upload, FileText } from "lucide-react";
import { api } from "@/lib/api";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const STATUS_TONE = {
    Draft: "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40",
    Submitted: "bg-mpca-navy/15 text-mpca-navy border-mpca-navy/40",
    Approved: "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40",
    Rejected: "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/40",
};

/**
 * Sprint M32 · Tournament Invoices Panel (inline)
 * ──────────────────────────────────────────────
 * Compact invoices + DA-form roll-up for THIS tournament, scoped by persona.
 * Replaces the redirect to /tournaments/:tid/finance?tab=officials — the
 * invoice creation / review flow stays available via the "Full Finance Screen"
 * deep-link at the top-right.
 */
const TournamentInvoicesPanel = ({ tournament, persona }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const params = { tournament_id: tournament.id };
                if (!isMPCA && myBody) params.participant_body_code = myBody;
                const { data } = await api.get("/tournament-invoices", { params });
                setInvoices(data || []);
            } catch (_) { setInvoices([]); }
            finally { setLoading(false); }
        })();
    }, [tournament.id, isMPCA, myBody]);

    const totals = invoices.reduce((acc, inv) => {
        acc.count += 1;
        acc.amount += (inv.amount_inr || 0);
        return acc;
    }, { count: 0, amount: 0 });

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="panel-tournament-invoices">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="overline text-[9px] flex items-center gap-2"><Receipt size={11} /> Invoices + DA Forms</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        {totals.count} invoice{totals.count === 1 ? "" : "s"} · {fmt(totals.amount)}
                    </div>
                </div>
                <Link to={`/tournaments/${tournament.id}/finance?tab=officials`} className="text-[10px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood inline-flex items-center gap-1" data-testid="ti-open-full-btn">
                    <Upload size={11} /> Upload · Full Screen <ArrowRight size={10} />
                </Link>
            </div>

            {loading ? (
                <div className="py-8 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading…</div>
            ) : invoices.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-mpca-brass/30 text-[11px] text-mpca-gray-dark italic" data-testid="ti-empty">
                    No invoices uploaded yet for this tournament{isMPCA ? "" : " (from your body)"}. Use the Full Screen link above to upload vendor bills or match-official DA forms.
                </div>
            ) : (
                <div className="divide-y divide-mpca-brass/15" data-testid="ti-list">
                    {invoices.slice(0, 15).map((inv) => (
                        <div key={inv.id} className="grid grid-cols-12 items-center gap-3 py-2 text-xs" data-testid={`ti-row-${inv.id}`}>
                            <div className="col-span-4 min-w-0">
                                <div className="font-serif text-mpca-green-dark truncate flex items-center gap-1">
                                    <FileText size={10} className="text-mpca-brass" /> {inv.invoice_no || inv.vendor_name || "—"}
                                </div>
                                <div className="text-[9px] font-mono text-mpca-brass truncate">{inv.head || inv.category || ""}</div>
                            </div>
                            <div className="col-span-3 text-[10px] text-mpca-gray-dark truncate">{inv.vendor_name || inv.participant_body_code || ""}</div>
                            <div className="col-span-2">
                                <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_TONE[inv.status] || "bg-mpca-brass/10 text-mpca-brass border-mpca-brass/40"}`}>
                                    {inv.status || "—"}
                                </span>
                            </div>
                            <div className="col-span-3 text-right font-mono text-mpca-oxblood">{fmt(inv.amount_inr)}</div>
                        </div>
                    ))}
                    {invoices.length > 15 && (
                        <div className="pt-3 text-[10px] text-center text-mpca-gray-dark italic">
                            + {invoices.length - 15} more · open the Full Finance Screen for the complete list.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TournamentInvoicesPanel;
