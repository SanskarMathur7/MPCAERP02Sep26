import { useState } from "react";
import { X, ExternalLink, FileText, Image as ImageIcon, Download } from "lucide-react";

/**
 * MPCA-129 · Inline Document Preview.
 *
 * Opens a modal that renders the document in-place instead of forcing a
 * download. Supports PDF (via <iframe>), images (<img>), and offers an
 * "Open in new tab" + "Download" fallback for anything else.
 *
 *   <DocumentPreview
 *       url="/api/uploads/xyz.pdf"
 *       name="Agenda.pdf"
 *       triggerLabel="Preview"           // optional text on the trigger
 *   />
 *
 * Pass `renderTrigger` to plug your own trigger element (button, link, row)
 * and get an `openPreview()` callback.
 */
const isImage = (url = "") => /\.(png|jpe?g|gif|webp|heic|heif|bmp)($|\?)/i.test(url);
const isPdf = (url = "") => /\.pdf($|\?)/i.test(url);

const DocumentPreview = ({ url, name, triggerLabel, renderTrigger, hideExport = false }) => {
    const [open, setOpen] = useState(false);
    if (!url) return null;

    const openPreview = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        setOpen(true);
    };

    const Trigger = renderTrigger
        ? renderTrigger(openPreview)
        : (
            <button
                type="button"
                onClick={openPreview}
                className="inline-flex items-center gap-1 text-[11px] text-mpca-oxblood hover:underline"
                data-testid={`doc-preview-open-${name || url}`}
            >
                {isImage(url) ? <ImageIcon size={11} /> : <FileText size={11} />}
                {triggerLabel || name || "Preview"}
            </button>
        );

    return (
        <>
            {Trigger}
            {open && (
                <div
                    className="fixed inset-0 z-[100] bg-mpca-charcoal/70 backdrop-blur-sm flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setOpen(false)}
                    data-testid="doc-preview-modal"
                >
                    <div
                        className="bg-mpca-parchment border-4 border-mpca-oxblood shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-2 border-b-2 border-mpca-brass bg-mpca-green-dark text-mpca-ivory">
                            <div className="flex items-center gap-2 min-w-0">
                                {isImage(url) ? <ImageIcon size={14} /> : <FileText size={14} />}
                                <span className="font-serif truncate">{name || "Document"}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {!hideExport && (
                                    <>
                                        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] uppercase tracking-widest text-mpca-gold-light hover:text-mpca-ivory inline-flex items-center gap-1" data-testid="doc-preview-newtab">
                                            <ExternalLink size={11} /> New Tab
                                        </a>
                                        <a href={url} download className="text-[10px] uppercase tracking-widest text-mpca-gold-light hover:text-mpca-ivory inline-flex items-center gap-1" data-testid="doc-preview-download">
                                            <Download size={11} /> Download
                                        </a>
                                    </>
                                )}
                                <button onClick={() => setOpen(false)} className="text-mpca-gold-light hover:text-mpca-ivory" data-testid="doc-preview-close">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-mpca-charcoal/5">
                            {isImage(url) ? (
                                <img src={url} alt={name || ""} className="max-w-full max-h-[80vh] mx-auto" data-testid="doc-preview-image" />
                            ) : isPdf(url) ? (
                                <iframe src={hideExport ? `${url}#toolbar=0&navpanes=0` : url} title={name || "PDF"} className="w-full h-[80vh] border-0" data-testid="doc-preview-iframe" />
                            ) : (
                                <div className="p-12 text-center">
                                    <FileText className="mx-auto mb-4 text-mpca-brass" size={48} strokeWidth={1} />
                                    <div className="font-serif text-lg text-mpca-green-dark">Inline preview not supported for this file type.</div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-2">Use &quot;New Tab&quot; or &quot;Download&quot; from the toolbar above.</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DocumentPreview;
