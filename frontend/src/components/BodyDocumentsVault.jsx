import { useEffect, useMemo, useState } from "react";
import {
    Archive, Upload, Plus, FileText, X, Loader2, ShieldCheck, ShieldAlert,
    Trash2, Edit3, Eye, Download, FileCheck, AlertTriangle, Search,
} from "lucide-react";
import { api } from "@/lib/api";

const DOC_KINDS = [
    { code: "GST_Certificate", label: "GST Certificate", icon: FileCheck, fields: ["GSTIN"] },
    { code: "PAN_Card", label: "PAN Card", icon: FileCheck, fields: ["PAN"] },
    { code: "Bank_Account", label: "Bank Account", icon: FileText, fields: ["Bank name", "Account no.", "IFSC", "Branch"] },
    { code: "Balance_Sheet", label: "Balance Sheet", icon: FileText, fields: ["Year"] },
    { code: "Profit_Loss", label: "Profit & Loss", icon: FileText, fields: ["Year"] },
    { code: "Audit_Report", label: "Audit Report", icon: FileText, fields: ["Year", "Auditor"] },
    { code: "Constitution_Bye_Laws", label: "Constitution / Bye-laws", icon: FileText, fields: [] },
    { code: "MOA_AOA", label: "MOA / AOA", icon: FileText, fields: [] },
    { code: "Registration_Certificate", label: "Registration Cert.", icon: FileCheck, fields: ["Reg. no."] },
    { code: "Board_Resolution", label: "Board Resolution", icon: FileText, fields: ["Date"] },
    { code: "Address_Proof", label: "Address Proof", icon: FileText, fields: [] },
    { code: "Insurance_Policy", label: "Insurance Policy", icon: FileText, fields: ["Policy no.", "Insurer"] },
    { code: "Other", label: "Other", icon: FileText, fields: [] },
];

const KIND_MAP = Object.fromEntries(DOC_KINDS.map((k) => [k.code, k]));
const ESSENTIAL = ["GST_Certificate", "PAN_Card", "Bank_Account", "Constitution_Bye_Laws"];

const fmtBytes = (b) => {
    if (!b) return "";
    const kb = b / 1024;
    return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

/**
 * Sprint M33 · Body Data Warehouse
 * ─────────────────────────────────
 * Per-body document vault embedded on the body detail page. Owning body can
 * read + write; MPCA sees read-only view of every vault beneath. Documents
 * can be selected from here in any downstream flow (Grant Claims,
 * Reimbursement Claims, Vendor KYC) via <VaultDocumentPicker>.
 */
const BodyDocumentsVault = ({ body, persona }) => {
    const [docs, setDocs] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingDoc, setEditingDoc] = useState(null);
    const [q, setQ] = useState("");
    const [kindFilter, setKindFilter] = useState("all");

    const canEdit = persona?.body_code === body.code;
    const canRead = canEdit
        || persona?.body_code === body.parent_code
        || persona?.body_type === "State"
        || persona?.body_code === "BCCI";

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: list }, { data: sum }] = await Promise.all([
                api.get(`/bodies/${body.code}/documents`),
                api.get(`/bodies/${body.code}/documents/kinds/summary`),
            ]);
            setDocs(list || []);
            setSummary(sum);
        } catch (_) { setDocs([]); setSummary(null); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (canRead) load(); else setLoading(false); }, [body.code, canRead]);

    const filtered = useMemo(() => {
        return docs
            .filter((d) => kindFilter === "all" || d.doc_kind === kindFilter)
            .filter((d) => !q || d.label.toLowerCase().includes(q.toLowerCase()) || (d.doc_no || "").toLowerCase().includes(q.toLowerCase()));
    }, [docs, kindFilter, q]);

    const handleDelete = async (docId) => {
        if (!window.confirm("Archive this document? It will be hidden but recoverable.")) return;
        try {
            await api.delete(`/bodies/${body.code}/documents/${docId}`);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (!canRead) {
        return (
            <section className="mt-10 bulletin-card p-8 text-center" data-testid="vault-forbidden">
                <ShieldAlert size={22} className="text-mpca-brass mx-auto mb-2" />
                <div className="font-serif text-lg text-mpca-green-dark">Data Warehouse is private</div>
                <div className="text-[11px] text-mpca-gray-dark mt-1">Only members of {body.code}, its parent body, or MPCA may view this vault.</div>
            </section>
        );
    }

    return (
        <section className="mt-10" data-testid="body-documents-vault">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                    <div className="overline flex items-center gap-2"><Archive size={11} /> Data Warehouse</div>
                    <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">Documents · {body.name}</h2>
                    <p className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl">
                        {canEdit
                            ? "Upload official documents (GST, PAN, bank details, financial statements) once here — they'll be pickable from every downstream form (scheme claims, reimbursements, vendor KYC) without re-uploading."
                            : `You are viewing ${body.code}'s vault in read-only mode. Only members of ${body.code} may add or edit documents.`}
                    </p>
                </div>
                {summary && (
                    <div className="text-right">
                        <div className="overline">Essentials</div>
                        <div className={`font-serif text-2xl mt-1 ${summary.essential_filled === summary.essential_total ? "text-mpca-green-dark" : "text-mpca-oxblood"}`} data-testid="vault-essential-count">
                            {summary.essential_filled} / {summary.essential_total}
                        </div>
                        {summary.essential_missing.length > 0 && (
                            <div className="text-[9px] text-mpca-brass uppercase tracking-widest mt-1">
                                Missing: {summary.essential_missing.map((k) => KIND_MAP[k]?.label).join(" · ")}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Kind counts strip */}
            {summary && Object.keys(summary.counts || {}).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4" data-testid="vault-kind-summary">
                    {DOC_KINDS.filter((k) => summary.counts[k.code]).map((k) => (
                        <button key={k.code} onClick={() => setKindFilter(kindFilter === k.code ? "all" : k.code)} className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${kindFilter === k.code ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "bg-mpca-parchment text-mpca-brass border-mpca-brass/40"}`} data-testid={`vault-kind-chip-${k.code}`}>
                            {k.label} · {summary.counts[k.code]}
                        </button>
                    ))}
                    {kindFilter !== "all" && (
                        <button onClick={() => setKindFilter("all")} className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors" data-testid="vault-kind-clear">
                            <X size={9} className="inline" /> Clear filter
                        </button>
                    )}
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search size={12} className="absolute left-3 top-2.5 text-mpca-brass" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by label or document no…" className="input-heritage !py-1.5 !text-xs pl-9" data-testid="vault-search" />
                </div>
                {canEdit && (
                    <button onClick={() => { setEditingDoc(null); setShowForm(true); }} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1" data-testid="vault-add-btn">
                        <Plus size={12} /> Add Document
                    </button>
                )}
            </div>

            {/* List */}
            {loading ? (
                <div className="py-10 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading vault…</div>
            ) : filtered.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-mpca-brass/30 text-[11px] text-mpca-gray-dark italic" data-testid="vault-empty">
                    {docs.length === 0
                        ? (canEdit ? "The vault is empty. Add your first document above — GST, PAN and Bank Account are the most-needed." : `${body.code} has not uploaded any documents yet.`)
                        : "No documents match the current filters."}
                </div>
            ) : (
                <div className="bulletin-card divide-y divide-mpca-brass/15" data-testid="vault-list">
                    {filtered.map((d) => {
                        const Kind = KIND_MAP[d.doc_kind] || KIND_MAP.Other;
                        const KindIcon = Kind.icon;
                        const isEssential = ESSENTIAL.includes(d.doc_kind);
                        return (
                            <div key={d.id} className="grid grid-cols-12 items-center gap-3 px-5 py-3" data-testid={`vault-doc-${d.id}`}>
                                <div className="col-span-1"><KindIcon size={18} className={isEssential ? "text-mpca-oxblood" : "text-mpca-brass"} /></div>
                                <div className="col-span-4 min-w-0">
                                    <div className="font-serif text-sm text-mpca-green-dark truncate flex items-center gap-1">
                                        {d.label}
                                        {isEssential && <span className="text-[8px] uppercase tracking-widest bg-mpca-oxblood/10 text-mpca-oxblood border border-mpca-oxblood/40 px-1">Essential</span>}
                                    </div>
                                    <div className="text-[10px] text-mpca-brass font-mono truncate">{Kind.label}{d.doc_no ? ` · ${d.doc_no}` : ""}</div>
                                </div>
                                <div className="col-span-3 text-[10px] text-mpca-gray-dark truncate">
                                    {Object.entries(d.metadata || {}).slice(0, 2).map(([k, v]) => (
                                        <div key={k}><span className="uppercase tracking-widest">{k}:</span> {String(v)}</div>
                                    ))}
                                </div>
                                <div className="col-span-2 text-[10px] text-mpca-gray-dark font-mono">
                                    {d.expires_on && <div className={new Date(d.expires_on) < new Date() ? "text-mpca-oxblood" : "text-mpca-gray-dark"}>
                                        {new Date(d.expires_on) < new Date() ? "Expired " : "Expires "}
                                        {d.expires_on.slice(0, 10)}
                                    </div>}
                                    {d.file_url && <div>{fmtBytes(d.size_bytes)}</div>}
                                </div>
                                <div className="col-span-2 flex justify-end gap-1">
                                    {d.file_url && (
                                        <a href={d.file_url} target="_blank" rel="noreferrer" className="text-mpca-brass hover:text-mpca-oxblood" data-testid={`vault-view-${d.id}`} title="View / download">
                                            <Eye size={13} />
                                        </a>
                                    )}
                                    {canEdit && (
                                        <>
                                            <button onClick={() => { setEditingDoc(d); setShowForm(true); }} className="text-mpca-brass hover:text-mpca-oxblood" data-testid={`vault-edit-${d.id}`} title="Edit">
                                                <Edit3 size={13} />
                                            </button>
                                            <button onClick={() => handleDelete(d.id)} className="text-mpca-burgundy-dark hover:text-mpca-oxblood" data-testid={`vault-delete-${d.id}`} title="Archive">
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showForm && (
                <BodyDocumentForm
                    bodyCode={body.code}
                    initial={editingDoc}
                    persona={persona}
                    onClose={() => { setShowForm(false); setEditingDoc(null); }}
                    onSaved={() => { setShowForm(false); setEditingDoc(null); load(); }}
                />
            )}
        </section>
    );
};

// ─────────── Add / Edit Document Modal ───────────

const BodyDocumentForm = ({ bodyCode, initial, persona, onClose, onSaved }) => {
    const [kind, setKind] = useState(initial?.doc_kind || "GST_Certificate");
    const [label, setLabel] = useState(initial?.label || "");
    const [docNo, setDocNo] = useState(initial?.doc_no || "");
    const [metadata, setMetadata] = useState(initial?.metadata || {});
    const [issuedOn, setIssuedOn] = useState(initial?.issued_on || "");
    const [expiresOn, setExpiresOn] = useState(initial?.expires_on || "");
    const [notes, setNotes] = useState(initial?.notes || "");
    const [file, setFile] = useState(null);
    const [fileInfo, setFileInfo] = useState(
        initial?.file_url ? { url: initial.file_url, name: initial.file_name, size: initial.size_bytes, mime: initial.mime_type } : null
    );
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const kindConf = KIND_MAP[kind] || KIND_MAP.Other;

    const handleFile = async (f) => {
        if (!f) return;
        setBusy(true); setErr("");
        try {
            const form = new FormData();
            form.append("file", f);
            form.append("body_id", bodyCode);
            form.append("uploaded_by", persona?.name || "");
            form.append("related_type", "body_document");
            const { data } = await api.post("/uploads", form, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setFileInfo({ url: data.url, name: data.original_name, size: data.size_bytes, mime: data.mime_type });
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const save = async (e) => {
        e.preventDefault();
        if (!label.trim()) return setErr("Label is required.");
        setBusy(true); setErr("");
        try {
            const body = {
                doc_kind: kind,
                label: label.trim(),
                doc_no: docNo.trim() || null,
                metadata,
                issued_on: issuedOn || null,
                expires_on: expiresOn || null,
                notes: notes.trim() || null,
                uploaded_by: persona?.name,
                file_url: fileInfo?.url,
                file_name: fileInfo?.name,
                size_bytes: fileInfo?.size,
                mime_type: fileInfo?.mime,
            };
            if (initial) {
                await api.patch(`/bodies/${bodyCode}/documents/${initial.id}`, body);
            } else {
                await api.post(`/bodies/${bodyCode}/documents`, body);
            }
            onSaved?.();
        } catch (e2) { setErr(e2?.response?.data?.detail || e2.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid="vault-form-dialog">
            <form onSubmit={save} className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full my-12">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">{bodyCode} · Data Warehouse</div>
                        <div className="font-serif text-xl mt-1">{initial ? "Edit Document" : "Add Document"}</div>
                    </div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl" data-testid="vault-form-close"><X /></button>
                </div>

                <div className="p-5 space-y-3">
                    {err && (
                        <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2 flex items-center gap-2" data-testid="vault-form-error">
                            <AlertTriangle size={11} /> {err}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="overline text-[9px]">Document kind</span>
                            <select value={kind} onChange={(e) => setKind(e.target.value)} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="vault-form-kind">
                                {DOC_KINDS.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="overline text-[9px]">Document no. (GSTIN / PAN / A/C etc.)</span>
                            <input value={docNo} onChange={(e) => setDocNo(e.target.value)} className="input-heritage font-mono !py-1.5 !text-xs mt-1" data-testid="vault-form-doc-no" />
                        </label>
                    </div>

                    <label className="block">
                        <span className="overline text-[9px]">Label / Title</span>
                        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`e.g. ${bodyCode} ${kindConf.label}`} required className="input-heritage !py-1.5 !text-xs mt-1" data-testid="vault-form-label" />
                    </label>

                    {/* Structured metadata based on kind */}
                    {kindConf.fields.length > 0 && (
                        <div className="border border-mpca-brass/30 bg-mpca-parchment p-3">
                            <div className="overline text-[9px] mb-2">Extra Fields</div>
                            <div className="grid grid-cols-2 gap-2">
                                {kindConf.fields.map((f) => (
                                    <label key={f} className="block">
                                        <span className="text-[9px] uppercase tracking-widest text-mpca-brass">{f}</span>
                                        <input
                                            value={metadata[f] ?? ""}
                                            onChange={(e) => setMetadata({ ...metadata, [f]: e.target.value })}
                                            className="input-heritage !py-1 !text-xs mt-0.5"
                                            data-testid={`vault-form-meta-${f.replace(/[^a-z0-9]/gi, "").toLowerCase()}`}
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="overline text-[9px]">Issued on</span>
                            <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="vault-form-issued" />
                        </label>
                        <label className="block">
                            <span className="overline text-[9px]">Expires on</span>
                            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="vault-form-expires" />
                        </label>
                    </div>

                    <label className="block">
                        <span className="overline text-[9px]">File (PDF, image, DOCX, XLSX — max 20 MB)</span>
                        <div className="mt-1 border border-mpca-brass/30 bg-mpca-parchment p-3">
                            {fileInfo ? (
                                <div className="flex items-center justify-between gap-2 text-[11px]" data-testid="vault-form-file-preview">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText size={13} className="text-mpca-brass shrink-0" />
                                        <span className="truncate">{fileInfo.name}</span>
                                        <span className="text-mpca-gray-dark shrink-0">{fmtBytes(fileInfo.size)}</span>
                                    </div>
                                    <button type="button" onClick={() => { setFileInfo(null); setFile(null); }} className="text-mpca-oxblood text-[10px] uppercase tracking-widest">Remove</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-[11px]">
                                    <Upload size={13} className="text-mpca-brass" />
                                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={(e) => { setFile(e.target.files[0]); handleFile(e.target.files[0]); }} className="text-[11px]" data-testid="vault-form-file" />
                                    {busy && <Loader2 size={11} className="animate-spin" />}
                                </div>
                            )}
                        </div>
                    </label>

                    <label className="block">
                        <span className="overline text-[9px]">Notes</span>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="vault-form-notes" />
                    </label>
                </div>

                <div className="border-t border-mpca-brass/20 px-5 py-3 flex justify-end gap-2 bg-mpca-parchment">
                    <button type="button" onClick={onClose} className="text-[11px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40 text-mpca-gray-dark">Cancel</button>
                    <button type="submit" disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="vault-form-save-btn">
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                        {initial ? "Save changes" : "Add to Vault"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default BodyDocumentsVault;
