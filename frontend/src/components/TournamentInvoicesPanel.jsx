import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Loader2, ArrowRight, Upload, FileText } from "lucide-react";
import { api } from "@/lib/api";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const STATUS_TONE = {
    Draft: "bg-mpca-brass/25 text-mpca-green-dark border-mpca-brass",
    Submitted: "bg-mpca-navy/20 text-mpca-navy border-mpca-navy/60",
    Approved: "bg-mpca-green-dark/25 text-mpca-green-dark border-mpca-green-dark",
    Rejected: "bg-mpca-oxblood/20 text-mpca-oxblood border-mpca-oxblood/60",
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
        <div className="border border-mpca-brass/40 bg-mpca-ivory p-5" data-testid="panel-tournament-invoices">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                    <div className="overline text-[10px] font-semibold text-mpca-oxblood flex items-center gap-2"><Receipt size={12} /> Invoices + DA Forms</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1 font-semibold">
                        {totals.count} invoice{totals.count === 1 ? "" : "s"} · {fmt(totals.amount)}
                    </div>
                </div>
                {/* M39z.c · Prominent Upload button — Divisions land here after
                    sanction so they can immediately upload vendor bills. */}
                <Link to={`/tournaments/${tournament.id}/finance?tab=invoices`} className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood hover:bg-mpca-oxblood/90 px-3 py-2 inline-flex items-center gap-1.5" data-testid="ti-open-full-btn">
                    <Upload size={11} /> Upload Invoice / DA <ArrowRight size={10} />
                </Link>
            </div>

            {loading ? (
                <div className="py-8 text-center text-[11px] text-mpca-charcoal/80"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading…</div>
            ) : invoices.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-mpca-brass/40 text-[11px] text-mpca-charcoal/80 italic" data-testid="ti-empty">
                    No invoices uploaded yet for this tournament{isMPCA ? "" : " (from your body)"}. Click <strong className="text-mpca-oxblood">Upload Invoice / DA</strong> above to add vendor bills or match-official DA forms.
                </div>
            ) : (
                <div className="divide-y divide-mpca-brass/25" data-testid="ti-list">
                    {invoices.slice(0, 15).map((inv) => (
                        <div key={inv.id} className="grid grid-cols-12 items-center gap-3 py-2 text-xs" data-testid={`ti-row-${inv.id}`}>
                            <div className="col-span-4 min-w-0">
                                <div className="font-serif text-mpca-green-dark truncate flex items-center gap-1 font-semibold">
                                    <FileText size={10} className="text-mpca-oxblood" /> {inv.invoice_no || inv.vendor_name || "—"}
                                </div>
                                <div className="text-[10px] font-mono text-mpca-charcoal/80 truncate">{inv.head || inv.category || ""}</div>
                            </div>
                            <div className="col-span-3 text-[10px] text-mpca-charcoal/80 truncate">{inv.vendor_name || inv.participant_body_code || ""}</div>
                            <div className="col-span-2">
                                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 border-2 ${STATUS_TONE[inv.status] || "bg-mpca-brass/25 text-mpca-green-dark border-mpca-brass"}`}>
                                    {inv.status || "—"}
                                </span>
                            </div>
                            <div className="col-span-3 text-right font-mono text-mpca-oxblood font-semibold">{fmt(inv.amount_inr)}</div>
                        </div>
                    ))}
                    {invoices.length > 15 && (
                        <div className="pt-3 text-[10px] text-center text-mpca-charcoal/80 italic">
                            + {invoices.length - 15} more · open the Full Finance Screen for the complete list.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TournamentInvoicesPanel;
