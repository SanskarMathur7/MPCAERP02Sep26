import { useState } from "react";
import { X, Upload, Download, FileCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { bulkUploadMembers, downloadBulkTemplate } from "@/lib/api";

const MemberBulkUploadModal = ({ open, onClose, onDone }) => {
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState(null);
    const [err, setErr] = useState(null);

    if (!open) return null;

    const handleTemplate = async () => {
        try {
            const t = await downloadBulkTemplate();
            const blob = new Blob([t.content], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = t.filename || "mpca_members_template.csv";
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        }
    };

    const handleUpload = async (dryRun) => {
        if (!file) return;
        setBusy(true);
        setErr(null);
        setReport(null);
        try {
            const r = await bulkUploadMembers(file, dryRun);
            setReport({ ...r, dry_run: dryRun });
            if (!dryRun && r.inserted > 0) onDone?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" data-testid="bulk-upload-modal">
            <div
                className="w-full max-w-2xl bg-mpca-ivory border border-mpca-brass/40 shadow-2xl relative"
                style={{ backgroundImage: "linear-gradient(135deg, var(--mpca-ivory) 0%, var(--mpca-parchment) 100%)" }}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-mpca-brass hover:text-mpca-oxblood transition"
                    data-testid="close-modal-btn"
                >
                    <X size={20} strokeWidth={1.5} />
                </button>

                <div className="p-8 border-b border-mpca-brass/30">
                    <div className="overline">Article V · Bulk Enrolment</div>
                    <h2 className="font-serif text-3xl text-mpca-green-dark mt-2">Upload Members via CSV</h2>
                    <p className="text-mpca-gray-dark text-sm mt-2">
                        Upload a CSV file to enrol multiple members at once. Required columns:{" "}
                        <code className="font-mono text-xs text-mpca-oxblood">name, category, address</code>. All other columns are optional.
                    </p>
                </div>

                <div className="p-8 space-y-5">
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handleTemplate}
                            className="btn-heritage-ghost"
                            data-testid="download-template-btn"
                        >
                            <Download size={14} strokeWidth={1.5} /> Download CSV Template
                        </button>
                    </div>

                    <label
                        className="block border-2 border-dashed border-mpca-brass/50 py-10 px-6 text-center cursor-pointer hover:bg-mpca-parchment/50 transition"
                        data-testid="file-drop-zone"
                    >
                        <Upload className="mx-auto text-mpca-brass mb-2" size={28} strokeWidth={1.5} />
                        <div className="font-serif text-lg text-mpca-green-dark">
                            {file ? file.name : "Choose a CSV file"}
                        </div>
                        <div className="text-xs text-mpca-gray-dark mt-1">
                            {file ? `${(file.size / 1024).toFixed(1)} KB` : "Click to browse — up to 5 MB"}
                        </div>
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(e) => {
                                setFile(e.target.files?.[0] || null);
                                setReport(null);
                                setErr(null);
                            }}
                            data-testid="csv-file-input"
                        />
                    </label>

                    {err && (
                        <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-3 text-sm text-mpca-oxblood flex items-start gap-2" data-testid="upload-error">
                            <AlertTriangle size={16} strokeWidth={1.5} />
                            <span>{typeof err === "string" ? err : JSON.stringify(err)}</span>
                        </div>
                    )}

                    {report && (
                        <div className="border border-mpca-brass/40 bg-white/60 p-5" data-testid="upload-report">
                            <div className="flex items-center justify-between mb-3">
                                <div className="font-serif text-lg text-mpca-green-dark flex items-center gap-2">
                                    {report.dry_run ? <FileCheck size={16} className="text-mpca-brass" /> : <CheckCircle2 size={16} className="text-mpca-green" />}
                                    {report.dry_run ? "Dry-run summary" : "Enrolment complete"}
                                </div>
                                <span className="font-mono text-[11px] text-mpca-gray-dark">
                                    {report.total_rows} rows scanned
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="border border-mpca-brass/30 p-3">
                                    <div className="overline text-[9px]">Inserted</div>
                                    <div className="font-serif text-2xl text-mpca-green-dark" data-testid="inserted-count">{report.inserted}</div>
                                </div>
                                <div className="border border-mpca-brass/30 p-3">
                                    <div className="overline text-[9px]">Skipped</div>
                                    <div className="font-serif text-2xl text-mpca-oxblood" data-testid="skipped-count">{report.skipped}</div>
                                </div>
                                <div className="border border-mpca-brass/30 p-3">
                                    <div className="overline text-[9px]">Total</div>
                                    <div className="font-serif text-2xl text-mpca-charcoal">{report.total_rows}</div>
                                </div>
                            </div>
                            {report.errors?.length > 0 && (
                                <div className="max-h-40 overflow-y-auto border-t border-mpca-brass/20 pt-3">
                                    <div className="overline mb-2 text-[9px]">Row-level notes</div>
                                    <ul className="space-y-1 text-xs">
                                        {report.errors.map((e, i) => (
                                            <li key={i} className="text-mpca-gray-dark">
                                                <span className="font-mono text-mpca-oxblood">Row {e.row}</span> · {e.name} · {e.reason}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-mpca-brass/20">
                        <button
                            className="btn-heritage-ghost"
                            onClick={() => handleUpload(true)}
                            disabled={!file || busy}
                            data-testid="dry-run-btn"
                        >
                            <FileCheck size={14} strokeWidth={1.5} /> Dry-run
                        </button>
                        <button
                            className="btn-heritage-primary"
                            onClick={() => handleUpload(false)}
                            disabled={!file || busy}
                            data-testid="confirm-upload-btn"
                        >
                            <Upload size={14} strokeWidth={1.5} /> {busy ? "Uploading…" : "Enrol Members"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MemberBulkUploadModal;
