import { useEffect, useState } from "react";
import { X, ExternalLink, FileText, Image as ImageIcon, Download } from "lucide-react";
import { openAuthedFile, api } from "@/lib/api";

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
 *
 * Feb-2026 · Upload URLs land as `/api/uploads/<uuid>` with NO extension,
 * so URL-suffix sniffing is unreliable. When the URL doesn't carry a
 * recognisable suffix we fall back to a HEAD request and read the
 * `Content-Type` response header. Result cached in local state.
 */
const isImageByUrl = (url = "") => /\.(png|jpe?g|gif|webp|heic|heif|bmp)($|\?)/i.test(url);
const isPdfByUrl = (url = "") => /\.pdf($|\?)/i.test(url);

const DocumentPreview = ({ url, name, triggerLabel, renderTrigger, hideExport = false }) => {
    const [open, setOpen] = useState(false);
    const [sniffedType, setSniffedType] = useState(null);
    const [imgFailed, setImgFailed] = useState(false);
    const [iframeFailed, setIframeFailed] = useState(false);
    // Iter 123z · The upload URL is JWT-gated, so <a href>, <img src> and
    // <iframe src> can't hit it. We fetch the bytes via axios (interceptor
    // attaches the Bearer token), stash them as an object URL and hand that
    // to the browser. Revoked on close so memory doesn't leak.
    const [blobUrl, setBlobUrl] = useState(null);
    useEffect(() => {
        if (!open || !url) return;
        let cancelled = false;
        let localBlobUrl = null;
        (async () => {
            try {
                let path = url;
                try { const u = new URL(url, window.location.origin); path = u.pathname + u.search; } catch {}
                path = path.replace(/^\/api/, "");
                const res = await api.get(path, { responseType: "blob" });
                if (cancelled) return;
                localBlobUrl = URL.createObjectURL(res.data);
                setBlobUrl(localBlobUrl);
                // Content-type sniff from the blob itself
                const t = res.data.type || "";
                if (t.startsWith("image/")) setSniffedType("image");
                else if (t === "application/pdf") setSniffedType("pdf");
                else if (!t) setSniffedType("other");
                else setSniffedType("other");
            } catch {
                if (!cancelled) setSniffedType("other");
            }
        })();
        return () => {
            cancelled = true;
            if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
            setBlobUrl(null);
        };
    }, [open, url]);

    const download = async () => {
        try { await openAuthedFile(url); } catch (e) { alert(e.message || "Download failed"); }
    };

    // Iter 123z · HEAD-sniff removed — blob load in the effect above populates
    // sniffedType from the actual response type. Keeps unauthenticated 401s
    // from ever being displayed as a broken preview.

    if (!url) return null;

    const isImage = isImageByUrl(url) || sniffedType === "image";
    const isPdf = isPdfByUrl(url) || sniffedType === "pdf";
    const stillSniffing = !isImage && !isPdf && sniffedType === null;
    // Attempted render order: image → iframe → unsupported
    const showImage = isImage || (sniffedType === null && !imgFailed);
    const showIframe = !showImage && (isPdf || (sniffedType === null && imgFailed && !iframeFailed));

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
                {isImage ? <ImageIcon size={11} /> : <FileText size={11} />}
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
                                {isImage ? <ImageIcon size={14} /> : <FileText size={14} />}
                                <span className="font-serif truncate">{name || "Document"}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {!hideExport && (
                                    <>
                                        <button type="button" onClick={() => openAuthedFile(url)} className="text-[10px] uppercase tracking-widest text-mpca-gold-light hover:text-mpca-ivory inline-flex items-center gap-1" data-testid="doc-preview-newtab">
                                            <ExternalLink size={11} /> New Tab
                                        </button>
                                        <button type="button" onClick={download} className="text-[10px] uppercase tracking-widest text-mpca-gold-light hover:text-mpca-ivory inline-flex items-center gap-1" data-testid="doc-preview-download">
                                            <Download size={11} /> Download
                                        </button>
                                    </>
                                )}
                                <button onClick={() => setOpen(false)} className="text-mpca-gold-light hover:text-mpca-ivory" data-testid="doc-preview-close">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-mpca-charcoal/5">
                            {showImage && blobUrl ? (
                                <img
                                    src={blobUrl}
                                    alt={name || ""}
                                    className="max-w-full max-h-[80vh] mx-auto"
                                    data-testid="doc-preview-image"
                                    onError={() => setImgFailed(true)}
                                />
                            ) : showIframe && blobUrl ? (
                                <iframe
                                    src={hideExport ? `${blobUrl}#toolbar=0&navpanes=0` : blobUrl}
                                    title={name || "PDF"}
                                    className="w-full h-[80vh] border-0"
                                    data-testid="doc-preview-iframe"
                                    onError={() => setIframeFailed(true)}
                                />
                            ) : (stillSniffing || !blobUrl) ? (
                                <div className="p-12 text-center">
                                    <FileText className="mx-auto mb-4 text-mpca-brass animate-pulse" size={48} strokeWidth={1} />
                                    <div className="font-serif text-lg text-mpca-green-dark">Loading preview…</div>
                                </div>
                            ) : (
                                <div className="p-12 text-center">
                                    <FileText className="mx-auto mb-4 text-mpca-brass" size={48} strokeWidth={1} />
                                    <div className="font-serif text-lg text-mpca-green-dark">Inline preview not supported for this file type.</div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-2 mb-4">Use the Download button below to save it locally.</div>
                                    <button type="button" onClick={download} className="btn-heritage-primary inline-flex items-center gap-1" data-testid="doc-preview-download-fallback">
                                        <Download size={12} /> Download File
                                    </button>
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
