import { useRef, useState } from "react";
import { Upload, FileText, X, Loader2, CheckCircle2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const ALLOWED_HINT = "PDF, JPEG, PNG, WebP, DOCX, XLSX · max 20 MB";

const fmtSize = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const iconFor = (mime) => {
    if (mime && mime.startsWith("image/")) return null; // we render a thumbnail instead
    return FileText;
};

/**
 * Multi-file upload with drag-drop + click-to-pick.
 * `value` is an array of UploadRecord objects (id, url, original_name, ...).
 * onChange receives the next array.
 */
export const FileUpload = ({
    value = [],
    onChange,
    metadata = {},                 // { body_id, uploaded_by, related_type, related_id }
    accept = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.doc,.xls",
    maxFiles = 10,
    label = "Supporting Documents",
    testidPrefix = "file-upload",
}) => {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);

    const handleFiles = async (files) => {
        if (!files || files.length === 0) return;
        if (value.length + files.length > maxFiles) {
            setError(`Max ${maxFiles} files allowed.`);
            return;
        }
        setError(null);
        setUploading(true);
        const uploaded = [];
        try {
            for (const file of files) {
                const fd = new FormData();
                fd.append("file", file);
                if (metadata.body_id) fd.append("body_id", metadata.body_id);
                if (metadata.uploaded_by) fd.append("uploaded_by", metadata.uploaded_by);
                if (metadata.related_type) fd.append("related_type", metadata.related_type);
                if (metadata.related_id) fd.append("related_id", metadata.related_id);
                const res = await fetch(`${API}/api/uploads`, {
                    method: "POST",
                    body: fd,
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.detail || `Upload failed (${res.status})`);
                }
                uploaded.push(await res.json());
            }
            onChange([...value, ...uploaded]);
        } catch (e) {
            setError(e.message || "Upload failed");
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(Array.from(e.dataTransfer.files));
    };

    const removeAt = (idx) => {
        const next = value.slice();
        next.splice(idx, 1);
        onChange(next);
    };

    return (
        <div className="space-y-3" data-testid={testidPrefix}>
            {label && <label className="label-heritage block">{label}</label>}

            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current && inputRef.current.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current && inputRef.current.click(); }}
                data-testid={`${testidPrefix}-dropzone`}
                className={
                    "relative cursor-pointer border-2 border-dashed transition-colors px-6 py-8 text-center " +
                    (dragging
                        ? "border-mpca-oxblood bg-mpca-oxblood/5"
                        : "border-mpca-brass/40 hover:border-mpca-brass bg-mpca-ivory/40")
                }
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple
                    onChange={(e) => handleFiles(Array.from(e.target.files || []))}
                    className="hidden"
                    data-testid={`${testidPrefix}-input`}
                />
                {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-mpca-oxblood">
                        <Loader2 size={20} className="animate-spin" strokeWidth={1.5} />
                        <div className="text-sm">Uploading…</div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <Upload size={20} strokeWidth={1.5} className="text-mpca-brass" />
                        <div className="text-sm text-mpca-green-dark">
                            <strong>Click to upload</strong> or drag &amp; drop
                        </div>
                        <div className="text-[10px] text-mpca-gray-dark">{ALLOWED_HINT}</div>
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

            {value.length > 0 && (
                <ul className="space-y-2" data-testid={`${testidPrefix}-list`}>
                    {value.map((f, idx) => {
                        const Icon = iconFor(f.mime_type);
                        return (
                            <li
                                key={f.id || f.url}
                                data-testid={`${testidPrefix}-item-${idx}`}
                                className="flex items-center gap-3 px-3 py-2 bg-mpca-ivory border border-mpca-brass/30"
                            >
                                <CheckCircle2 size={14} strokeWidth={1.5} className="text-mpca-oxblood flex-shrink-0" />
                                {Icon ? (
                                    <Icon size={14} strokeWidth={1.5} className="text-mpca-green-dark flex-shrink-0" />
                                ) : (
                                    <img
                                        src={`${API}${f.url}`}
                                        alt={f.original_name}
                                        className="w-6 h-6 object-cover border border-mpca-brass/30"
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <a
                                        href={`${API}${f.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-semibold text-mpca-green-dark hover:text-mpca-oxblood truncate block"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {f.original_name}
                                    </a>
                                    <div className="text-[10px] text-mpca-gray-dark">
                                        {fmtSize(f.size_bytes)} · {f.mime_type}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); removeAt(idx); }}
                                    data-testid={`${testidPrefix}-remove-${idx}`}
                                    className="text-mpca-gray-dark hover:text-mpca-oxblood"
                                    aria-label="Remove"
                                >
                                    <X size={14} strokeWidth={1.5} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default FileUpload;
