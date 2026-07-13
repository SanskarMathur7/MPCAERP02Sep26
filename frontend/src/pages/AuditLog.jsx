/**
 * AuditLog page · Sprint 0
 * Shows the immutable audit log with filters by module + record id.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchAuditLog, fetchWorkflows } from "@/lib/api";
import { Filter, Search, ScrollText, Loader2, ExternalLink } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const MODULE_META = {
    extra_expense:   { label: "Extra Expense",       tone: "pending" },
    tournament_plan: { label: "Tournament Plan",     tone: "active" },
    player:          { label: "Player Review",       tone: "lapsed" },
    invoice:         { label: "Invoice",             tone: "pending" },
    grant:           { label: "Grant",               tone: "active" },
    voucher:         { label: "Voucher",             tone: "lapsed" },
};

const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const AuditLog = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [moduleFilter, setModuleFilter] = useState("");
    const [recordFilter, setRecordFilter] = useState("");
    const [search, setSearch] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (moduleFilter) params.module = moduleFilter;
            if (recordFilter) params.record_id = recordFilter;
            params.limit = 200;
            const data = await fetchAuditLog(params);
            setRows(data);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [moduleFilter, recordFilter]);

    const filtered = useMemo(() => {
        if (!search) return rows;
        const q = search.toLowerCase();
        return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }, [rows, search]);

    const moduleOptions = useMemo(() => {
        const set = new Set(rows.map((r) => r.module).filter(Boolean));
        return Array.from(set).sort();
    }, [rows]);

    if (loading && rows.length === 0) return <div className="p-16"><CricketLoader size="lg" label="Loading audit log…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="audit-log-page">
            <div className="mb-8">
                <div className="overline flex items-center gap-2"><ScrollText size={12} /> Immutable Audit Log</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Every action, forever recorded.</h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                    Append-only ledger of every workflow action across the ERP · queryable by module, record, or free text.
                </p>
            </div>

            <div className="crest-divider mb-8" />

            <div className="flex flex-wrap gap-3 items-end mb-6" data-testid="audit-filters">
                <div>
                    <label className="label-heritage">Module</label>
                    <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="input-heritage" data-testid="audit-module-filter">
                        <option value="">All modules</option>
                        {[...new Set([...Object.keys(MODULE_META), ...moduleOptions])].sort().map((m) => (
                            <option key={m} value={m}>{MODULE_META[m]?.label || m}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label-heritage">Record ID</label>
                    <input value={recordFilter} onChange={(e) => setRecordFilter(e.target.value)} placeholder="uuid or ref" className="input-heritage" data-testid="audit-record-filter" />
                </div>
                <div className="flex-1 min-w-[220px]">
                    <label className="label-heritage">Search</label>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-mpca-brass" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="actor, action, notes…" className="input-heritage pl-9" data-testid="audit-search" />
                    </div>
                </div>
                <button onClick={load} className="btn-heritage-secondary" data-testid="audit-refresh">
                    <Filter size={12} /> Reload
                </button>
            </div>

            <div className="text-sm text-mpca-gray-dark mb-3" data-testid="audit-count">
                Showing <span className="font-mono text-mpca-green-dark">{filtered.length}</span> of {rows.length} events {loading && <Loader2 size={12} className="animate-spin inline ml-2" />}
            </div>

            <div className="bulletin-card overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No audit events yet — take an action on any module to see it appear here.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="audit-table">
                            <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                                <tr>
                                    {["Time", "Module", "Action", "Actor", "Record", "Details"].map((h) => (
                                        <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-mpca-brass">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r) => (
                                    <tr key={r.id} className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/30" data-testid={`audit-row-${r.id}`}>
                                        <td className="px-4 py-3 font-mono text-[10px] whitespace-nowrap">{fmt(r.timestamp)}</td>
                                        <td className="px-4 py-3">
                                            <span className="pill pill-lapsed text-[10px]">{MODULE_META[r.module]?.label || r.module}</span>
                                        </td>
                                        <td className="px-4 py-3 font-mono uppercase tracking-wider text-[11px] text-mpca-oxblood">{r.action}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-mpca-charcoal">{r.actor_name}</div>
                                            {(r.actor_role || r.actor_body_id) && (
                                                <div className="text-[10px] text-mpca-gray-dark">{r.actor_role || "—"} · {r.actor_body_id || "—"}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-mpca-brass max-w-[180px] truncate" title={r.record_id}>{r.record_id?.slice(0, 12)}…</td>
                                        <td className="px-4 py-3 text-[11px] text-mpca-gray-dark">
                                            {r.details && Object.keys(r.details).length > 0 ? (
                                                <div className="space-y-0.5">
                                                    {Object.entries(r.details).map(([k, v]) => (
                                                        <div key={k}><span className="font-mono text-mpca-brass">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}</div>
                                                    ))}
                                                </div>
                                            ) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditLog;
