/**
 * DMS page · Sprint 4 · P7.1-P7.2
 * Document management: folders, tags, expiry reminders, archive.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchDocuments, fetchDmsSummary, fetchDocumentsExpiring, createDocument, archiveDocument,
} from "@/lib/api";
import {
    FolderClosed, FileText, Search, Filter, Plus, X, Clock, ShieldAlert,
    Archive, ExternalLink, Tag,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const FOLDER_OPTS = ["Legal", "Statutory", "Financial", "HR", "Contracts", "Board", "Vendor_KYC", "Asset_Docs", "Other"];

const FOLDER_STYLE = {
    Legal:       { bg: "bg-mpca-brass/15",       tx: "text-mpca-brass" },
    Statutory:   { bg: "bg-mpca-oxblood/10",     tx: "text-mpca-oxblood" },
    Financial:   { bg: "bg-mpca-green-dark/15",  tx: "text-mpca-green-dark" },
    HR:          { bg: "bg-mpca-navy/10",        tx: "text-mpca-navy" },
    Contracts:   { bg: "bg-mpca-gold-light/25",  tx: "text-mpca-gold-dark" },
    Board:       { bg: "bg-mpca-green-deep/15",  tx: "text-mpca-green-deep" },
    Vendor_KYC:  { bg: "bg-mpca-brass/10",       tx: "text-mpca-brass" },
    Asset_Docs:  { bg: "bg-mpca-brass/10",       tx: "text-mpca-brass" },
    Other:       { bg: "bg-mpca-gray-dark/10",   tx: "text-mpca-gray-dark" },
};

const KpiTile = ({ label, value, sub, icon: Icon, tone = "green", testid }) => {
    const toneMap = { green: "text-mpca-green-dark", oxblood: "text-mpca-oxblood", brass: "text-mpca-brass", gold: "text-mpca-gold-dark" };
    return (
        <div className="bulletin-card p-5" data-testid={testid}>
            <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
            <div className={`font-serif text-3xl ${toneMap[tone]}`}>{value}</div>
            <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
            {sub && <div className="text-[10px] text-mpca-gray-dark mt-1">{sub}</div>}
        </div>
    );
};

const DMS = () => {
    const { persona } = useAuth();
    const [docs, setDocs] = useState([]);
    const [summary, setSummary] = useState(null);
    const [expiring, setExpiring] = useState(null);
    const [loading, setLoading] = useState(true);
    const [folder, setFolder] = useState("all");
    const [search, setSearch] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [d, s, e] = await Promise.all([
                fetchDocuments(), fetchDmsSummary(), fetchDocumentsExpiring(60),
            ]);
            setDocs(d); setSummary(s); setExpiring(e);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        let out = docs;
        if (folder !== "all") out = out.filter(d => d.folder === folder);
        if (search) {
            const q = search.toLowerCase();
            out = out.filter(d =>
                (d.filename || "").toLowerCase().includes(q) ||
                (d.doc_type || "").toLowerCase().includes(q) ||
                (d.tags || []).some(t => (t || "").toLowerCase().includes(q))
            );
        }
        return out;
    }, [docs, folder, search]);

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading document library…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="dms-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><FolderClosed size={12} /> Sprint 4 · Governance</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Document Manager</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Cross-body document library with folder taxonomy, expiry reminders, and cross-linking to source modules (vendor KYC · asset docs · board records).
                    </p>
                </div>
                <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="upload-doc-btn">
                    <Plus size={14} /> Upload Document
                </button>
            </div>

            <div className="crest-divider mb-8" />

            {summary && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Total Documents" value={summary.total} sub={`${Object.keys(summary.by_folder).length} folders`} icon={FileText} testid="kpi-total" />
                    <KpiTile label="Active" value={summary.by_status?.Active || 0} icon={FileText} tone="green" testid="kpi-active" />
                    <KpiTile label="Expiring in 30d" value={summary.expiring_30d || 0} icon={Clock} tone="gold" testid="kpi-expiring" />
                    <KpiTile label="Expired" value={summary.by_status?.Expired || 0} sub="Renewal overdue" icon={ShieldAlert} tone="oxblood" testid="kpi-expired" />
                </div>
            )}

            {expiring && ((expiring.expired?.length || 0) + (expiring.expiring?.length || 0)) > 0 && (
                <div className="bulletin-card mb-8 p-5 border-2 border-mpca-oxblood/40" data-testid="expiry-alert">
                    <div className="flex items-center gap-2 mb-3">
                        <ShieldAlert size={16} className="text-mpca-oxblood" />
                        <h3 className="font-serif text-lg text-mpca-oxblood">Attention — documents needing renewal</h3>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                        {[...(expiring.expired || []), ...(expiring.expiring || [])].slice(0, 6).map((d) => (
                            <div key={d.id} className="flex items-center justify-between text-[11px] border-b border-mpca-brass/15 py-1.5">
                                <div className="flex-1 min-w-0">
                                    <div className="text-mpca-charcoal truncate">{d.filename}</div>
                                    <div className="text-mpca-gray-dark text-[10px]">{d.doc_type}</div>
                                </div>
                                <div className={"text-[10px] tracking-widest uppercase font-mono " + (d.days_left < 0 ? "text-mpca-oxblood" : "text-mpca-brass")}>
                                    {d.days_left < 0 ? `Expired ${-d.days_left}d ago` : `${d.days_left}d left`}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-3 items-center mb-5" data-testid="dms-filters">
                <div className="flex items-center gap-1.5 bg-white border border-mpca-brass/30 px-3 py-1.5">
                    <Search size={12} className="text-mpca-brass" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} className="outline-none text-[12px] w-56 bg-transparent" placeholder="Filename, tag, type…" data-testid="input-search" />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Filter size={12} className="text-mpca-brass" />
                    {["all", ...FOLDER_OPTS].map((f) => (
                        <button key={f} onClick={() => setFolder(f)} data-testid={`folder-${f}`}
                            className={"px-3 py-1 text-[10px] tracking-widest uppercase border transition-colors " +
                                (folder === f ? "bg-mpca-green-dark text-white border-mpca-green-dark" :
                                    "bg-white text-mpca-charcoal border-mpca-brass/30 hover:border-mpca-brass")}>
                            {f.replace(/_/g, " ")}
                        </button>
                    ))}
                </div>
                <span className="ml-auto text-[10px] text-mpca-gray-dark">{filtered.length} of {docs.length}</span>
            </div>

            <div className="bulletin-card overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No documents match this filter.</div>
                ) : (
                    <table className="w-full text-sm" data-testid="doc-table">
                        <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                            <tr>
                                {["Doc No.", "Folder", "Filename", "Type", "Tags", "Expiry", "Status", ""].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((d) => {
                                const fst = FOLDER_STYLE[d.folder] || FOLDER_STYLE.Other;
                                return (
                                    <tr key={d.id} onClick={() => setSelected(d)} className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40 cursor-pointer" data-testid={`doc-row-${d.id}`}>
                                        <td className="px-4 py-3 font-mono text-[10px] text-mpca-brass">{d.doc_no}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase ${fst.bg} ${fst.tx}`}>
                                                {d.folder?.replace(/_/g, " ")}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[12px] max-w-[280px] truncate">{d.filename}</td>
                                        <td className="px-4 py-3 text-mpca-charcoal text-[11px]">{d.doc_type}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                                                {(d.tags || []).slice(0, 2).map((t, i) => (
                                                    <span key={i} className="text-[9px] px-1.5 py-0.5 bg-mpca-parchment border border-mpca-brass/20 text-mpca-brass truncate max-w-[80px]">{t}</span>
                                                ))}
                                                {(d.tags || []).length > 2 && <span className="text-[9px] text-mpca-gray-dark">+{d.tags.length - 2}</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-mpca-gray-dark">
                                            {d.expiry_date ? d.expiry_date.slice(0, 10) : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={"px-2 py-0.5 text-[10px] tracking-widest uppercase " +
                                                (d.status === "Active" ? "bg-mpca-green-dark/15 text-mpca-green-dark" :
                                                 d.status === "Expired" ? "bg-mpca-oxblood/15 text-mpca-oxblood" :
                                                                          "bg-mpca-brass/15 text-mpca-brass")}>
                                                {d.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                               className="text-mpca-brass hover:text-mpca-oxblood text-[10px]" data-testid={`open-${d.id}`}>
                                                <ExternalLink size={12} className="inline" />
                                            </a>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && <DocDrawer doc={selected} onClose={() => setSelected(null)}
                                     onArchive={async () => {
                                         setBusy(true);
                                         try { await archiveDocument(selected.id, "Archived from UI"); await load(); setSelected(null); }
                                         finally { setBusy(false); }
                                     }} busy={busy} />}
            {showNew && <NewDocDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} persona={persona} />}
        </div>
    );
};

const DocDrawer = ({ doc, onClose, onArchive, busy }) => {
    const fst = FOLDER_STYLE[doc.folder] || FOLDER_STYLE.Other;
    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-xl bg-mpca-ivory h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="doc-drawer">
                <div className="border-b border-mpca-brass/40 px-6 py-5 flex justify-between items-start gap-4 bg-mpca-parchment">
                    <div>
                        <div className="overline">{doc.doc_type}</div>
                        <div className="font-mono text-[11px] text-mpca-brass mt-1">{doc.doc_no}</div>
                        <h2 className="font-serif text-xl text-mpca-green-dark mt-2 break-words">{doc.filename}</h2>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase ${fst.bg} ${fst.tx}`}>
                                {doc.folder?.replace(/_/g, " ")}
                            </span>
                            <span className={"px-2 py-0.5 text-[10px] tracking-widest uppercase " +
                                (doc.status === "Active" ? "bg-mpca-green-dark/15 text-mpca-green-dark" :
                                 doc.status === "Expired" ? "bg-mpca-oxblood/15 text-mpca-oxblood" :
                                                            "bg-mpca-brass/15 text-mpca-brass")}>
                                {doc.status}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} data-testid="close-doc-drawer"><X size={20} /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-[11px]">
                        <div><div className="overline">Uploaded By</div><div className="mt-1 text-mpca-charcoal">{doc.uploaded_by || "—"}</div></div>
                        <div><div className="overline">Uploaded At</div><div className="mt-1 font-mono text-mpca-charcoal">{doc.uploaded_at?.slice(0, 10)}</div></div>
                        <div><div className="overline">Expiry</div><div className="mt-1 font-mono text-mpca-charcoal">{doc.expiry_date?.slice(0, 10) || "—"}</div></div>
                        <div><div className="overline">Body</div><div className="mt-1 font-mono text-mpca-charcoal">{doc.body_id}</div></div>
                    </div>

                    {doc.related_module && (
                        <div className="bg-mpca-parchment/40 border border-mpca-brass/30 px-4 py-3 text-[11px]">
                            <div className="overline mb-1">Linked to</div>
                            <div className="text-mpca-charcoal capitalize">{doc.related_module}: <span className="font-mono">{doc.related_code || doc.related_id}</span></div>
                        </div>
                    )}

                    {(doc.tags || []).length > 0 && (
                        <div>
                            <div className="overline mb-2 flex items-center gap-1"><Tag size={11} /> Tags</div>
                            <div className="flex flex-wrap gap-2">
                                {doc.tags.map((t, i) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 bg-mpca-parchment border border-mpca-brass/25 text-mpca-brass">{t}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {doc.notes && (
                        <div><div className="overline mb-1">Notes</div><div className="text-[11px] text-mpca-charcoal italic">{doc.notes}</div></div>
                    )}
                    <div className="border-t border-mpca-brass/30 pt-4 flex justify-between">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn-heritage-secondary" data-testid="open-external">
                            <ExternalLink size={12} /> Open Document
                        </a>
                        {doc.status !== "Archived" && (
                            <button disabled={busy} onClick={onArchive} className="btn-heritage-secondary text-mpca-oxblood" data-testid="archive-btn">
                                <Archive size={12} /> Archive
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const NewDocDialog = ({ onClose, onCreated, persona }) => {
    const [form, setForm] = useState({
        folder: "Statutory", filename: "", url: "", doc_type: "",
        expiry_date: "", tags: "", notes: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
            await createDocument({
                folder: form.folder,
                filename: form.filename,
                url: form.url,
                doc_type: form.doc_type,
                expiry_date: form.expiry_date || undefined,
                tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
                notes: form.notes || undefined,
                uploaded_by: persona ? `${persona.honorific} ${persona.name}` : "MPCA Accounts",
            });
            onCreated();
        } catch (e) {
            setErr(e.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg" onClick={(e) => e.stopPropagation()} data-testid="new-doc-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment flex justify-between items-center">
                    <div><div className="overline">Upload Document</div><div className="font-serif text-lg text-mpca-green-dark mt-1">Register in DMS</div></div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Folder</label>
                            <select value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} className="input-heritage" data-testid="input-folder">
                                {FOLDER_OPTS.map(f => <option key={f}>{f}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Doc Type</label>
                            <input required value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} className="input-heritage" placeholder="e.g. GST Registration" data-testid="input-doc-type" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Filename</label>
                        <input required value={form.filename} onChange={(e) => setForm({ ...form, filename: e.target.value })} className="input-heritage" placeholder="e.g. GST_Certificate_2026.pdf" data-testid="input-filename" />
                    </div>
                    <div>
                        <label className="label-heritage">URL (external link)</label>
                        <input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="input-heritage" placeholder="https://…" data-testid="input-url" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Expiry Date (optional)</label>
                            <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className="input-heritage" data-testid="input-expiry" />
                        </div>
                        <div>
                            <label className="label-heritage">Tags (comma-separated)</label>
                            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="input-heritage" placeholder="e.g. GST, statutory" data-testid="input-tags" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Notes (optional)</label>
                        <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-heritage" data-testid="input-notes" />
                    </div>
                    {err && <div className="text-mpca-oxblood text-sm" data-testid="new-doc-error">{err}</div>}
                    <div className="flex justify-end gap-3 pt-2 border-t border-mpca-brass/20">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="submit-new-doc">
                            {busy ? "Saving…" : "Register"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DMS;
