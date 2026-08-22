/**
 * Signed-PDF Upload Modal — Feb 2026 · replaces the legacy window.prompt()
 * flow for "paste a signed PDF URL". Single-file drag-and-drop dropzone
 * scoped to PDF only, streams to /api/uploads, then hands the returned
 * upload URL to the caller so it can POST to the appropriate signed-upload
 * endpoint (grant-claims, tournament-closure, etc.).
 */
import { useRef, useState, useEffect } from "react";
import { Upload, FileText, X, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

const MAX_BYTES = 20 * 1024 * 1024;

const fmtSize = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

/**
 * Props:
 *  - open (bool)
 *  - onClose ()
 *  - title (string)        e.g. "Upload Signed Submission PDF"
 *  - description (string)  short helper copy shown under the title
 *  - metadata (object)     { body_id, uploaded_by, related_type, related_id }
 *  - onUploaded ({ url, original_name, size_bytes, mime_type, id }) => Promise|void
 *                          Called AFTER a successful /api/uploads roundtrip.
 *                          The parent can chain the signed-upload API call
 *                          here. If the callback throws, the error is shown
 *                          inline and the modal stays open.
 *  - testidPrefix (string, optional) default "signed-pdf-upload"
 */
export const SignedPdfUploadModal = ({
    open,
    onClose,
    title,
    description,
    metadata = {},
    onUploaded,
    testidPrefix = "signed-pdf-upload",
}) => {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [picked, setPicked] = useState(null);   // browser File object (pre-upload preview)

    // Reset on open/close
    useEffect(() => {
        if (!open) {
            setDragging(false);
            setUploading(false);
            setError(null);
            setPicked(null);
            if (inputRef.current) inputRef.current.value = "";
        }
    }, [open]);

    if (!open) return null;

    const doUpload = async (file) => {
        setError(null);
        if (file.type !== "application/pdf") {
            setError(`Only PDF files are accepted. Got: ${file.type || "unknown"}`);
            return;
        }
        if (file.size > MAX_BYTES) {
            setError(`File exceeds ${MAX_BYTES / 1024 / 1024} MB cap (${fmtSize(file.size)}).`);
            return;
        }
        setPicked(file);
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            if (metadata.body_id) fd.append("body_id", metadata.body_id);
            if (metadata.uploaded_by) fd.append("uploaded_by", metadata.uploaded_by);
            if (metadata.related_type) fd.append("related_type", metadata.related_type);
            if (metadata.related_id) fd.append("related_id", metadata.related_id);
            // Iter 123j · Use the shared axios `api` instance so the JWT
            // Authorization header auto-attaches via the request interceptor.
            // Raw `fetch` here caused every upload to fail with 401 Not authenticated.
            const { data: record } = await api.post("/uploads", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            await onUploaded?.(record);
            onClose?.();
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || "Upload failed");
            setPicked(null);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) doUpload(f);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${testidPrefix}-title`}
            data-testid={testidPrefix}
        >
            <div className="bg-mpca-parchment w-full max-w-lg border-2 border-mpca-brass shadow-2xl">
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-mpca-brass/40 bg-mpca-ivory">
                    <div className="flex items-start gap-3">
                        <ShieldCheck size={22} strokeWidth={1.5} className="text-mpca-green-dark mt-0.5 flex-shrink-0" />
                        <div>
                            <h2 id={`${testidPrefix}-title`} className="font-serif text-lg text-mpca-green-dark leading-snug">
                                {title || "Upload Signed PDF"}
                            </h2>
                            {description && (
                                <p className="text-[11px] text-mpca-gray-dark italic mt-1">{description}</p>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="text-mpca-gray-dark hover:text-mpca-oxblood transition-colors"
                        data-testid={`${testidPrefix}-close-btn`}
                    >
                        <X size={18} strokeWidth={1.5} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-3">
                    <div
                        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => !uploading && inputRef.current && inputRef.current.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (!uploading && (e.key === "Enter" || e.key === " ")) inputRef.current && inputRef.current.click(); }}
                        data-testid={`${testidPrefix}-dropzone`}
                        className={
                            "relative border-2 border-dashed transition-colors px-6 py-10 text-center " +
                            (uploading ? "cursor-wait " : "cursor-pointer ") +
                            (dragging
                                ? "border-mpca-oxblood bg-mpca-oxblood/5"
                                : "border-mpca-brass/40 hover:border-mpca-brass bg-mpca-ivory/40")
                        }
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }}
                            className="hidden"
                            data-testid={`${testidPrefix}-input`}
                        />
                        {uploading ? (
                            <div className="flex flex-col items-center gap-2 text-mpca-oxblood">
                                <Loader2 size={22} className="animate-spin" strokeWidth={1.5} />
                                <div className="text-sm">Uploading{picked ? ` — ${picked.name}` : "…"}</div>
                                {picked && <div className="text-[10px] text-mpca-gray-dark">{fmtSize(picked.size)}</div>}
                            </div>
                        ) : picked ? (
                            <div className="flex flex-col items-center gap-2 text-mpca-green-dark">
                                <FileText size={22} strokeWidth={1.5} />
                                <div className="text-sm font-semibold">{picked.name}</div>
                                <div className="text-[10px] text-mpca-gray-dark">{fmtSize(picked.size)}</div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <Upload size={22} strokeWidth={1.5} className="text-mpca-brass" />
                                <div className="text-sm text-mpca-green-dark">
                                    <strong>Click to upload</strong> or drag &amp; drop
                                </div>
                                <div className="text-[10px] text-mpca-gray-dark">PDF only · max 20 MB</div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div
                            data-testid={`${testidPrefix}-error`}
                            className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 text-mpca-oxblood px-3 py-2 text-xs"
                        >
                            {error}
                        </div>
                    )}

                    <p className="text-[10px] text-mpca-gray-dark leading-relaxed">
                        The file is stored on the MPCA server (private) and linked to this record.
                        You can replace it any time before the next lifecycle step is triggered.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-mpca-brass/40 bg-mpca-ivory flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={uploading}
                        className="border border-mpca-gray-dark text-mpca-gray-dark px-4 py-1.5 text-[11px] uppercase tracking-widest hover:bg-mpca-gray-dark hover:text-mpca-ivory transition-colors disabled:opacity-50"
                        data-testid={`${testidPrefix}-cancel-btn`}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignedPdfUploadModal;
