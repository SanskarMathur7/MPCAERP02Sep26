/**
 * Ledger page · Sprint 1 · P3.6 + P3.7
 * Running-balance ledger projected from vouchers with Excel/PDF export.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchLedger, ledgerExportUrl, fetchVouchers, fetchVoucherStats } from "@/lib/api";
import { BookOpen, FileSpreadsheet, FileText, Filter, TrendingUp, TrendingDown, Wallet, Download } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => {
    if (n == null) return "—";
    const v = Number(n);
    const s = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Math.abs(v));
    return (v < 0 ? "-₹" : "₹") + s;
};

const KPI = ({ label, value, icon: Icon, tone = "green", testid }) => {
    const toneMap = { green: "text-mpca-green-dark", oxblood: "text-mpca-oxblood", brass: "text-mpca-brass" };
    return (
        <div className="bulletin-card p-5" data-testid={testid}>
            <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
            <div className={`font-serif text-2xl leading-none ${toneMap[tone]}`}>{value}</div>
            <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
        </div>
    );
};

const Ledger = () => {
    const { persona } = useAuth();
    const [bodyId, setBodyId] = useState(persona?.body_code || "MPCA");
    const [fy, setFy] = useState("2026-27");
    const [ledger, setLedger] = useState(null);
    const [vouchers, setVouchers] = useState([]);
    const [voucherStats, setVoucherStats] = useState(null);
    const [tab, setTab] = useState("ledger");
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const [l, v, vs] = await Promise.all([
                fetchLedger({ body_id: bodyId, fiscal_cycle: fy }),
                fetchVouchers({ fiscal_cycle: fy }),
                fetchVoucherStats({ fiscal_cycle: fy }),
            ]);
            setLedger(l);
            setVouchers(v);
            setVoucherStats(vs);
        } catch (e) {
            console.error(e);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [bodyId, fy]);

    if (loading && !ledger) return <div className="p-16"><CricketLoader size="lg" label="Reading the ledger…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="ledger-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><BookOpen size={12} /> Sprint 1 · Finance Rails</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">General Ledger</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Running balance across all posted vouchers · Excel & PDF exports · fiscal-year scoped.
                    </p>
                </div>
                <div className="flex gap-2">
                    <a
                        href={ledgerExportUrl(bodyId, fy, "xlsx")}
                        className="btn-heritage-secondary" data-testid="export-xlsx"
                    >
                        <FileSpreadsheet size={14} /> Excel
                    </a>
                    <a
                        href={ledgerExportUrl(bodyId, fy, "pdf")}
                        className="btn-heritage-secondary" data-testid="export-pdf"
                    >
                        <FileText size={14} /> PDF
                    </a>
                </div>
            </div>

            <div className="crest-divider mb-8" />

            <div className="flex gap-3 items-end mb-6" data-testid="ledger-filters">
                <div>
                    <label className="label-heritage">Body</label>
                    <input value={bodyId} onChange={(e) => setBodyId(e.target.value)} className="input-heritage w-40" data-testid="input-body-id" />
                </div>
                <div>
                    <label className="label-heritage">Fiscal Cycle</label>
                    <select value={fy} onChange={(e) => setFy(e.target.value)} className="input-heritage" data-testid="input-fy">
                        <option value="2024-25">2024-25</option>
                        <option value="2025-26">2025-26</option>
                        <option value="2026-27">2026-27</option>
                    </select>
                </div>
                <button onClick={load} className="btn-heritage-secondary" data-testid="reload-ledger">
                    <Filter size={12} /> Refresh
                </button>
            </div>

            {ledger && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KPI label="Opening Balance" value={fmtINR(ledger.opening_balance_inr)} icon={Wallet} testid="kpi-opening" />
                    <KPI label="Total Debits" value={fmtINR(ledger.totals.debit_inr)} icon={TrendingDown} tone="oxblood" testid="kpi-debit" />
                    <KPI label="Total Credits" value={fmtINR(ledger.totals.credit_inr)} icon={TrendingUp} testid="kpi-credit" />
                    <KPI label="Closing Balance" value={fmtINR(ledger.totals.closing_balance_inr)} icon={Wallet} tone={ledger.totals.closing_balance_inr < 0 ? "oxblood" : "green"} testid="kpi-closing" />
                </div>
            )}

            <div className="flex gap-1 mb-4 border-b border-mpca-brass/30">
                {[["ledger", "Ledger"], ["vouchers", `Vouchers · ${vouchers.length}`]].map(([k, l]) => (
                    <button
                        key={k}
                        onClick={() => setTab(k)}
                        data-testid={`tab-${k}`}
                        className={"px-4 py-2 text-xs tracking-widest uppercase border-b-2 -mb-px " +
                            (tab === k ? "border-mpca-oxblood text-mpca-green-dark" :
                                "border-transparent text-mpca-gray-dark hover:text-mpca-charcoal")}
                    >{l}</button>
                ))}
            </div>

            {tab === "ledger" && ledger && (
                <div className="bulletin-card overflow-hidden" data-testid="ledger-body">
                    {ledger.rows.length === 0 ? (
                        <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No ledger entries for this body / cycle yet.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                                <tr>
                                    {["Date", "Voucher No.", "Type", "Particulars", "Ref", "Debit", "Credit", "Balance"].map((h) => (
                                        <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-mpca-brass/20 bg-mpca-parchment/40">
                                    <td colSpan={7} className="px-3 py-2 text-[11px] italic text-mpca-gray-dark text-right">Opening Balance</td>
                                    <td className="px-3 py-2 font-mono text-mpca-green-dark">{fmtINR(ledger.opening_balance_inr)}</td>
                                </tr>
                                {ledger.rows.map((r, i) => (
                                    <tr key={i} className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/30" data-testid={`ledger-row-${i}`}>
                                        <td className="px-3 py-2 font-mono text-[11px]">{r.date}</td>
                                        <td className="px-3 py-2 font-mono text-[11px] text-mpca-brass">{r.voucher_no}</td>
                                        <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-mpca-charcoal">{r.voucher_type}</td>
                                        <td className="px-3 py-2 text-[11px] text-mpca-charcoal max-w-[300px] truncate" title={r.particulars}>{r.particulars}</td>
                                        <td className="px-3 py-2 text-[10px] font-mono text-mpca-brass">{r.linked_ref_code || ""}</td>
                                        <td className="px-3 py-2 font-mono text-mpca-oxblood">{r.debit_inr ? fmtINR(r.debit_inr) : ""}</td>
                                        <td className="px-3 py-2 font-mono text-mpca-green-deep">{r.credit_inr ? fmtINR(r.credit_inr) : ""}</td>
                                        <td className="px-3 py-2 font-mono text-mpca-green-dark font-medium">{fmtINR(r.running_balance_inr)}</td>
                                    </tr>
                                ))}
                                <tr className="border-t-2 border-mpca-brass/50 bg-mpca-gold-light/20">
                                    <td colSpan={5} className="px-3 py-2.5 font-serif text-mpca-green-dark">Totals</td>
                                    <td className="px-3 py-2.5 font-mono text-mpca-oxblood font-bold">{fmtINR(ledger.totals.debit_inr)}</td>
                                    <td className="px-3 py-2.5 font-mono text-mpca-green-deep font-bold">{fmtINR(ledger.totals.credit_inr)}</td>
                                    <td className="px-3 py-2.5 font-mono text-mpca-green-dark font-bold">{fmtINR(ledger.totals.closing_balance_inr)}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tab === "vouchers" && (
                <div className="bulletin-card overflow-hidden" data-testid="vouchers-body">
                    {voucherStats && (
                        <div className="grid grid-cols-3 border-b border-mpca-brass/30 divide-x divide-mpca-brass/20">
                            <div className="p-4 text-center">
                                <div className="overline">Payments</div>
                                <div className="font-serif text-xl text-mpca-oxblood mt-1">{fmtINR(voucherStats.payment_inr)}</div>
                                <div className="text-[10px] text-mpca-gray-dark">{voucherStats.by_type?.Payment || 0} entries</div>
                            </div>
                            <div className="p-4 text-center">
                                <div className="overline">Receipts</div>
                                <div className="font-serif text-xl text-mpca-green-deep mt-1">{fmtINR(voucherStats.receipt_inr)}</div>
                                <div className="text-[10px] text-mpca-gray-dark">{voucherStats.by_type?.Receipt || 0} entries</div>
                            </div>
                            <div className="p-4 text-center">
                                <div className="overline">Journal</div>
                                <div className="font-serif text-xl text-mpca-brass mt-1">{fmtINR(voucherStats.journal_inr)}</div>
                                <div className="text-[10px] text-mpca-gray-dark">{voucherStats.by_type?.Journal || 0} entries</div>
                            </div>
                        </div>
                    )}
                    {vouchers.length === 0 ? (
                        <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No vouchers posted this cycle yet.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                                <tr>
                                    {["Voucher No.", "Date", "Type", "Body", "Particulars", "Amount", "Status"].map((h) => (
                                        <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {vouchers.map((v) => (
                                    <tr key={v.id} className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/30" data-testid={`voucher-row-${v.id}`}>
                                        <td className="px-3 py-2 font-mono text-[11px] text-mpca-brass">{v.voucher_no}</td>
                                        <td className="px-3 py-2 font-mono text-[11px]">{v.date}</td>
                                        <td className="px-3 py-2 text-[10px] uppercase tracking-widest">{v.voucher_type}</td>
                                        <td className="px-3 py-2 text-[11px] text-mpca-green-dark">{v.body_id}</td>
                                        <td className="px-3 py-2 text-[11px] text-mpca-charcoal max-w-[280px] truncate" title={v.particulars}>{v.particulars}</td>
                                        <td className="px-3 py-2 font-mono text-mpca-green-dark">{fmtINR(v.amount_inr)}</td>
                                        <td className="px-3 py-2">
                                            <span className={"px-2 py-0.5 text-[9px] tracking-widest uppercase " +
                                                (v.status === "Posted" ? "bg-mpca-green-deep/15 text-mpca-green-deep" :
                                                 v.status === "Cancelled" ? "bg-mpca-oxblood/15 text-mpca-oxblood" :
                                                                            "bg-mpca-brass/15 text-mpca-brass")}>
                                                {v.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

export default Ledger;
