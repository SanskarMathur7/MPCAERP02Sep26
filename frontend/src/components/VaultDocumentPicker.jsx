import { useEffect, useState } from "react";
import { Archive, FileText, X, Loader2, Search, ArrowRight, Upload } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Sprint M33 · Vault Document Picker
 * ──────────────────────────────────
 * Reusable picker used in every downstream form (Grant Claims, Reimbursement
 * Claims, Vendor KYC etc.). Renders a "Choose from Vault" button that opens
 * a modal listing the body's saved documents. Falls back to standard file
 * upload when the doc isn't already in the vault.
 *
 * Props:
 *   - bodyCode: which body's vault to search
 *   - docKind (optional): filter by kind ("GST_Certificate" etc.)
 *   - onPick(doc): callback with the selected vault doc (contains file_url,
 *                  file_name, doc_kind, metadata, etc.)
 *   - triggerLabel: button label (defaults to "Pick from Vault")
 */
const VaultDocumentPicker = ({ bodyCode, docKind, onPick, triggerLabel = "Pick from Vault", disabled = false, testId = "vault-picker" }) => {
    const [open, setOpen] = useState(false);
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState("");

    useEffect(() => {
        if (!open || !bodyCode) return;
        (async () => {
            setLoading(true);
            try {
                const params = {};
                if (docKind) params.doc_kind = docKind;
                const { data } = await api.get(`/bodies/${bodyCode}/documents`, { params });
                setDocs(data || []);
            } catch (_) { setDocs([]); }
            finally { setLoading(false); }
        })();
    }, [open, bodyCode, docKind]);

    const filtered = docs.filter((d) => !q || d.label.toLowerCase().includes(q.toLowerCase()) || (d.doc_no || "").toLowerCase().includes(q.toLowerCase()));

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={disabled || !bodyCode}
                className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors inline-flex items-center gap-1 disabled:opacity-40"
                data-testid={`${testId}-trigger`}
                title="Choose an already-uploaded document from your Data Warehouse"
            >
                <Archive size={11} /> {triggerLabel}
            </button>

            {open && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid={`${testId}-dialog`}>
                    <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full my-12">
                        <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                            <div>
                                <div className="overline !text-mpca-gold-light">{bodyCode} · Data Warehouse</div>
                                <div className="font-serif text-xl mt-1">Pick a Document</div>
                            </div>
                            <button onClick={() => setOpen(false)} className="text-mpca-gold-light text-2xl" data-testid={`${testId}-close`}><X /></button>
                        </div>
                        <div className="p-5">
                            <div className="relative mb-4">
                                <Search size={12} className="absolute left-3 top-2.5 text-mpca-brass" />
                                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by label or document no…" className="input-heritage font-mono !py-1.5 pl-9" data-testid={`${testId}-search`} />
                            </div>

                            {loading ? (
                                <div className="py-10 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading vault…</div>
                            ) : filtered.length === 0 ? (
                                <div className="py-10 text-center border border-dashed border-mpca-brass/30" data-testid={`${testId}-empty`}>
                                    <div className="text-[11px] text-mpca-gray-dark italic mb-3">
                                        {docs.length === 0
                                            ? `No documents in ${bodyCode}'s vault yet${docKind ? ` (kind: ${docKind.replace(/_/g, " ")})` : ""}.`
                                            : "No matching documents in the vault."}
                                    </div>
                                    <div className="text-[10px] text-mpca-brass">
                                        Tip: open the body detail page and use the Add Document button to build the vault.
                                    </div>
                                </div>
                            ) : (
                                <div className="max-h-96 overflow-y-auto border border-mpca-brass/30" data-testid={`${testId}-list`}>
                                    {filtered.map((d) => (
                                        <button
                                            type="button"
                                            key={d.id}
                                            onClick={() => { onPick?.(d); setOpen(false); }}
                                            className="w-full text-left grid grid-cols-12 items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-mpca-brass/15 hover:bg-mpca-parchment transition-colors"
                                            data-testid={`${testId}-item-${d.id}`}
                                        >
                                            <FileText size={13} className="col-span-1 text-mpca-brass" />
                                            <div className="col-span-8 min-w-0">
                                                <div className="font-serif text-sm text-mpca-green-dark truncate">{d.label}</div>
                                                <div className="text-[10px] text-mpca-brass font-mono truncate">
                                                    {(d.doc_kind || "").replace(/_/g, " ")}{d.doc_no ? ` · ${d.doc_no}` : ""}
                                                </div>
                                            </div>
                                            <div className="col-span-3 flex justify-end">
                                                <ArrowRight size={12} className="text-mpca-brass" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 text-[10px] text-mpca-gray-dark italic flex items-center gap-1">
                                <Upload size={10} /> Or close this dialog and use the regular file input if the document is not in the vault yet.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default VaultDocumentPicker;
