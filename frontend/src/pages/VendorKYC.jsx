/**
 * VendorKYC page · Sprint 2 · P4.0
 * Vendor KYC lifecycle dashboard + verify/reject actions.
 * Not_Started → Docs_Submitted → KYC_Verified (1yr) → Expired
 *                            ↘ Rejected
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchVendors, fetchKycSummary, kycAction } from "@/lib/api";
import {
    UserCheck, ShieldCheck, ShieldAlert, ShieldX, Clock, X, CheckCircle2, Ban,
    Filter, FileText, Building2,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const KYC_STYLE = {
    Not_Started:      { bg: "bg-mpca-brass/10",      tx: "text-mpca-brass",      icon: ShieldAlert, label: "Not Started" },
    Docs_Submitted:   { bg: "bg-mpca-navy/10",       tx: "text-mpca-navy",       icon: FileText,     label: "Docs Submitted" },
    KYC_Verified:     { bg: "bg-mpca-green-dark/15", tx: "text-mpca-green-dark", icon: ShieldCheck,  label: "Verified" },
    Rejected:         { bg: "bg-mpca-oxblood/15",    tx: "text-mpca-oxblood",    icon: ShieldX,      label: "Rejected" },
    Expired:          { bg: "bg-mpca-gold-light/25", tx: "text-mpca-gold-dark",  icon: Clock,        label: "Expired" },
};

const KpiTile = ({ label, value, icon: Icon, tone = "green", testid }) => {
    const toneMap = { green: "text-mpca-green-dark", oxblood: "text-mpca-oxblood", brass: "text-mpca-brass", gold: "text-mpca-gold-dark" };
    return (
        <div className="bulletin-card p-5" data-testid={testid}>
            <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
            <div className={`font-serif text-3xl ${toneMap[tone]}`}>{value}</div>
            <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
        </div>
    );
};

const VendorKYC = () => {
    const { persona } = useAuth();
    const [vendors, setVendors] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [drawer, setDrawer] = useState(null);
    const [actionOpen, setActionOpen] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [v, s] = await Promise.all([fetchVendors(), fetchKycSummary()]);
            setVendors(v);
            setSummary(s);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        if (filter === "all") return vendors;
        if (filter === "expiring") {
            const soon = new Set((summary?.expiring_30d || []).map(x => x.id));
            return vendors.filter(v => soon.has(v.id));
        }
        return vendors.filter(v => (v.kyc_status || "Not_Started") === filter);
    }, [vendors, filter, summary]);

    const handleAction = async (action, extra = {}) => {
        if (!actionOpen) return;
        setBusy(true);
        try {
            const payload = {
                actor_name: persona ? `${persona.honorific} ${persona.name}` : "MPCA Accounts",
                actor_role: persona?.role_id || "mpca_accounts",
                ...extra,
            };
            await kycAction(actionOpen.vendor.id, action, payload);
            await load();
            setActionOpen(null);
            setDrawer(null);
        } catch (e) {
            alert("Action failed: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading vendor KYC…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="vendor-kyc-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><UserCheck size={12} /> Sprint 2 · Vendor KYC</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Vendor KYC Register</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Verification lifecycle for every empanelled vendor · GST · PAN · Bank verification · 12-month expiry.
                    </p>
                </div>
            </div>

            <div className="crest-divider mb-8" />

            {summary && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Total Vendors" value={summary.total_vendors} icon={Building2} tone="brass" testid="kpi-total" />
                    <KpiTile label="KYC Verified" value={summary.ready_for_transactions} icon={ShieldCheck} testid="kpi-verified" />
                    <KpiTile label="Awaiting Verify" value={summary.by_status?.Docs_Submitted || 0} icon={FileText} tone="brass" testid="kpi-awaiting" />
                    <KpiTile label="Expiring in 30d" value={(summary.expiring_30d || []).length} icon={Clock} tone="oxblood" testid="kpi-expiring" />
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center mb-6" data-testid="kyc-filters">
                <Filter size={12} className="text-mpca-brass" />
                {["all", "Not_Started", "Docs_Submitted", "KYC_Verified", "expiring", "Rejected", "Expired"].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        data-testid={`kyc-filter-${f}`}
                        className={"px-3 py-1 text-[10px] tracking-widest uppercase border transition-colors " +
                            (filter === f ? "bg-mpca-green-dark text-white border-mpca-green-dark" :
                                "bg-white text-mpca-charcoal border-mpca-brass/30 hover:border-mpca-brass")}>
                        {f === "expiring" ? "Expiring 30d" : (KYC_STYLE[f]?.label || f.replace(/_/g, " "))}
                    </button>
                ))}
            </div>

            <div className="bulletin-card overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No vendors match this filter.</div>
                ) : (
                    <table className="w-full text-sm" data-testid="kyc-table">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Vendor No.", "Name", "Category", "GSTIN", "KYC Status", "Expires", "TDS %", ""].map((h) => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((v) => {
                                const st = KYC_STYLE[v.kyc_status || "Not_Started"] || KYC_STYLE.Not_Started;
                                const Icon = st.icon;
                                return (
                                    <tr key={v.id} onClick={() => setDrawer(v)}
                                        className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40 cursor-pointer"
                                        data-testid={`kyc-row-${v.id}`}>
                                        <td className="px-4 py-3 font-mono text-[11px] text-mpca-charcoal">{v.vendor_no}</td>
                                        <td className="px-4 py-3 text-mpca-green-dark">{v.name}</td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[11px]">{v.category}</td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-mpca-gray-dark">{v.gstin || "—"}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-widest uppercase ${st.bg} ${st.tx}`}>
                                                <Icon size={10} /> {st.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-[11px] font-mono text-mpca-gray-dark">
                                            {v.kyc_expires_at ? new Date(v.kyc_expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-mpca-charcoal">{v.kyc_status === "KYC_Verified" && v.tds_applicable ? `${v.tds_rate_pct || 2}%` : "—"}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button className="text-[10px] tracking-widest uppercase text-mpca-brass hover:text-mpca-oxblood" data-testid={`kyc-view-${v.id}`}>View →</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {drawer && <KycDrawer vendor={drawer} onClose={() => setDrawer(null)} onAction={(a) => setActionOpen({ action: a, vendor: drawer })} persona={persona} />}
            {actionOpen && <KycActionDialog action={actionOpen.action} vendor={actionOpen.vendor} onClose={() => setActionOpen(null)} onSubmit={handleAction} busy={busy} />}
        </div>
    );
};

const KycDrawer = ({ vendor, onClose, onAction, persona }) => {
    const st = KYC_STYLE[vendor.kyc_status || "Not_Started"] || KYC_STYLE.Not_Started;
    const canVerify = vendor.kyc_status === "Docs_Submitted" && persona?.body_type === "State";
    const canReject = vendor.kyc_status === "Docs_Submitted" && persona?.body_type === "State";

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-2xl bg-mpca-ivory h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="kyc-drawer">
                <div className="border-b border-mpca-brass/40 px-6 py-5 flex justify-between items-start gap-4 bg-mpca-parchment">
                    <div>
                        <div className="overline">{vendor.category}</div>
                        <div className="font-mono text-[11px] text-mpca-brass mt-1">{vendor.vendor_no}</div>
                        <h2 className="font-serif text-2xl text-mpca-green-dark mt-2">{vendor.name}</h2>
                        <div className="mt-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-widest uppercase ${st.bg} ${st.tx}`}>
                                {st.label}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} data-testid="close-kyc-drawer"><X size={20} /></button>
                </div>
                <div className="px-6 py-5 space-y-5">
                    <div className="grid grid-cols-2 gap-4 text-[12px]">
                        <div><div className="overline">GSTIN</div><div className="font-mono mt-1 text-mpca-charcoal">{vendor.gstin || "—"}</div></div>
                        <div><div className="overline">PAN</div><div className="font-mono mt-1 text-mpca-charcoal">{vendor.pan || "—"}</div></div>
                        <div><div className="overline">Bank A/C</div><div className="font-mono mt-1 text-mpca-charcoal">{vendor.bank_account_no || "—"}</div></div>
                        <div><div className="overline">IFSC</div><div className="font-mono mt-1 text-mpca-charcoal">{vendor.bank_ifsc || "—"}</div></div>
                        <div><div className="overline">MSME Registered</div><div className="mt-1 text-mpca-charcoal">{vendor.msme_registered ? `Yes · ${vendor.msme_udyam_no || ""}` : "No"}</div></div>
                        <div><div className="overline">Contact</div><div className="mt-1 text-mpca-charcoal text-[11px]">{vendor.contact_name || "—"}{vendor.contact_phone && ` · ${vendor.contact_phone}`}</div></div>
                    </div>

                    {vendor.kyc_status === "KYC_Verified" && (
                        <div className="bg-mpca-green-dark/10 border border-mpca-green-dark/30 px-4 py-3 text-[11px] text-mpca-green-dark" data-testid="verified-block">
                            <div className="uppercase tracking-widest text-[10px] mb-1">KYC Verified</div>
                            <div>Verified by <b>{vendor.kyc_verified_by}</b> · TDS <b>{vendor.tds_rate_pct}%</b> · Expires <b>{vendor.kyc_expires_at && new Date(vendor.kyc_expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</b></div>
                        </div>
                    )}
                    {vendor.kyc_status === "Rejected" && vendor.kyc_rejected_reason && (
                        <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/30 px-4 py-3 text-[11px] text-mpca-oxblood" data-testid="rejected-block">
                            <div className="uppercase tracking-widest text-[10px] mb-1">Rejected</div>
                            <div className="italic">&ldquo;{vendor.kyc_rejected_reason}&rdquo;</div>
                        </div>
                    )}

                    {(vendor.kyc_docs || []).length > 0 && (
                        <div>
                            <div className="overline mb-2">KYC Documents ({vendor.kyc_docs.length})</div>
                            <div className="border border-mpca-brass/30 divide-y divide-mpca-brass/20">
                                {vendor.kyc_docs.map((d, i) => (
                                    <div key={i} className="flex items-center justify-between px-3 py-2 text-[11px]" data-testid={`kyc-doc-${i}`}>
                                        <div className="flex items-center gap-2">
                                            <FileText size={12} className="text-mpca-brass" />
                                            <span className="text-mpca-charcoal capitalize">{d.doc_type.replace(/_/g, " ")}</span>
                                            {d.verified && <CheckCircle2 size={12} className="text-mpca-green-deep" />}
                                        </div>
                                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-mpca-brass hover:text-mpca-oxblood text-[10px] uppercase tracking-widest">View →</a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {(canVerify || canReject) && (
                        <div className="border-t border-mpca-brass/30 pt-4 flex gap-2" data-testid="kyc-actions">
                            {canVerify && (
                                <button onClick={() => onAction("verify")} className="btn-heritage-primary" data-testid="action-verify">
                                    <CheckCircle2 size={12} /> Verify KYC
                                </button>
                            )}
                            {canReject && (
                                <button onClick={() => onAction("reject")} className="btn-heritage-secondary text-mpca-oxblood" data-testid="action-reject">
                                    <Ban size={12} /> Reject
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const KycActionDialog = ({ action, vendor, onClose, onSubmit, busy }) => {
    const [note, setNote] = useState("");
    const [tdsRate, setTdsRate] = useState(vendor.tds_rate_pct || 2);
    const [validityMonths, setValidityMonths] = useState(12);
    const needsNote = action === "reject";

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="kyc-action-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment">
                    <div className="overline">KYC Action · {action}</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">{vendor.name}</div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {action === "verify" && (
                        <>
                            <div>
                                <label className="label-heritage">TDS Rate (%)</label>
                                <input type="number" step="0.1" min="0" max="10" value={tdsRate} onChange={(e) => setTdsRate(parseFloat(e.target.value))} className="input-heritage" data-testid="input-tds-rate" />
                                <div className="text-[10px] text-mpca-gray-dark mt-1">Typical: 2% (u/s 194C contractual) · 10% (u/s 194J professional).</div>
                            </div>
                            <div>
                                <label className="label-heritage">Validity (months)</label>
                                <input type="number" min="1" max="24" value={validityMonths} onChange={(e) => setValidityMonths(parseInt(e.target.value, 10))} className="input-heritage" data-testid="input-validity" />
                            </div>
                        </>
                    )}
                    <div>
                        <label className="label-heritage">Note {needsNote ? "(required)" : "(optional)"}</label>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input-heritage" placeholder={needsNote ? "Reason for rejection…" : "Optional context…"} data-testid="input-kyc-note" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button disabled={busy || (needsNote && !note)}
                                onClick={() => onSubmit(action, {
                                    note,
                                    ...(action === "verify" ? { tds_rate_pct: tdsRate, validity_months: validityMonths, tds_applicable: true } : {}),
                                })}
                                className="btn-heritage-primary" data-testid="confirm-kyc-action">
                            {busy ? "Working…" : "Confirm"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VendorKYC;
