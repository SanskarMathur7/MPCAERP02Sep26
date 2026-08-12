import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, Edit3, X, Save, Sparkles, ChevronRight, IndianRupee, Lock, CheckCircle2, Upload, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSeason } from "@/context/SeasonContext";
import CricketLoader from "@/components/CricketLoader";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const SCHEME_TYPES = ["All", "Annual_Grant", "Reimbursement", "Camp", "Award", "Welfare", "Infrastructure", "Revenue_Share"];

// Sprint M15 · Tournament-specific schemes (handled by Tournament Reimbursement Matrix, not Grant Claims)
const TOURNAMENT_SCHEME_CODES = new Set([
    "2-A", "2-B", "2-C", "2-D", "2-E",      // Tournament reimbursement schemes
    "3-C", "3-D",                           // Reciprocal & Pre-tournament camps (tied to tournaments)
    "9-BCCI",                               // BCCI hosting
]);
const isTournamentScheme = (s) => s && (TOURNAMENT_SCHEME_CODES.has(s.scheme_code) || s.scheme_type === "Reimbursement" || (s.frequency || "").toLowerCase().includes("tournament"));

const SchemesMaster = () => {
    const { persona } = useAuth();
    const { season } = useSeason();
    const [schemes, setSchemes] = useState([]);
    const [recos, setRecos] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("All");
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(null);
    const [activation, setActivation] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const isMPCA = persona?.body_type === "State";
    const canEdit = isMPCA;
    const isActivated = !!activation?.is_active;

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: s }, { data: r }, { data: act }] = await Promise.all([
                api.get("/reimbursement-schemes", { params: { active_only: false, fiscal_cycle: season } }),
                api.get("/schemes-recommendations").catch(() => ({ data: null })),
                api.get("/schemes/season-activation", { params: { fiscal_cycle: season } }),
            ]);
            setSchemes(s || []);
            setRecos(r);
            setActivation(act);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [season]);

    // Feb-2026 · Deep-link — when arriving from a Tournament Basics /
    // Finance Console badge via /schemes?scheme=X-Y, auto-open that scheme
    // in the detail pane so the user lands directly on the source of truth.
    const [searchParams] = useSearchParams();
    useEffect(() => {
        const target = searchParams.get("scheme");
        if (!target || schemes.length === 0) return;
        const match = schemes.find((s) => s.scheme_code === target);
        if (match) setSelected(match);
    }, [searchParams, schemes]);

    const uploadSignedPdf = async (file) => {
        if (!file) return;
        if (file.type !== "application/pdf") { alert("Please upload a PDF."); return; }
        setUploading(true);
        try {
            // 1. Upload the file to /uploads
            const form = new FormData();
            form.append("file", file);
            form.append("body_id", persona?.body_code || "MPCA");
            form.append("uploaded_by", persona?.name || "MPCA");
            form.append("related_type", "scheme_activation");
            form.append("related_id", season);
            const { data: rec } = await api.post("/uploads", form, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            // 2. Register the activation
            await api.post("/schemes/season-activation", {
                fiscal_cycle: season,
                signed_pdf_url: rec.url,
                signed_by: persona?.name,
                notes: `Signed master PDF uploaded ${new Date().toLocaleDateString("en-IN")}.`,
            });
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const resetActivation = async () => {
        if (!window.confirm(`Deactivate schemes for ${season}? Divisions won't be able to create new claims or tournaments until you re-upload a signed PDF.`)) return;
        try {
            await api.post("/schemes/season-activation/reset", null, { params: { fiscal_cycle: season } });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const downloadExport = () => {
        // MPCA-Feb2026 · Print-to-PDF the full scheme dossier (Members'
        // signing copy). Every scheme now renders as its own card with
        // description, budget heads, REQUIRED DOCUMENTS and ELIGIBILITY
        // CONDITIONS — matching the on-screen detail panel so office
        // bearers can sign against exactly what Divisions will apply for.
        const w = window.open("", "_blank");
        if (!w) return;
        const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        const sortedSchemes = [...schemes].sort((a, b) => (a.scheme_code || "").localeCompare(b.scheme_code || ""));
        const cards = sortedSchemes.map((s) => `
            <section class="scheme">
                <div class="hdr">
                    <span class="code">${esc(s.scheme_code)}</span>
                    <span class="name">${esc(s.name)}</span>
                    <span class="badges">
                        <span class="badge">${esc((s.scheme_type || "").replace(/_/g, " "))}</span>
                        ${s.frequency ? `<span class="badge">${esc(s.frequency)}</span>` : ""}
                        ${s.is_active === false ? `<span class="badge inactive">Inactive</span>` : ""}
                    </span>
                </div>
                ${s.description ? `<div class="desc">${esc(s.description)}</div>` : ""}
                ${(s.eligible_bodies || []).length ? `<div class="meta"><b>Eligible bodies:</b> ${esc(s.eligible_bodies.join(", "))}</div>` : ""}
                ${(s.categories || []).length ? `<div class="meta"><b>Categories:</b> ${esc(s.categories.join(", "))}</div>` : ""}
                ${(s.heads || []).length ? `
                    <div class="section-title">Budget Heads (${s.heads.length})</div>
                    <table class="heads">
                        <thead><tr><th>Head</th><th>Unit</th><th>Rate</th></tr></thead>
                        <tbody>
                            ${s.heads.map((h) => `<tr>
                                <td>${esc(h.label)}</td>
                                <td>${esc((h.unit || "").replace(/_/g, " "))}</td>
                                <td class="rate">${esc(h.rate_display || (h.rate_inr ? `\u20B9${Number(h.rate_inr).toLocaleString("en-IN")}` : "—"))}</td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                ` : ""}
                ${(s.required_documents || []).length ? `
                    <div class="section-title">Required Documents (${s.required_documents.length})</div>
                    <ul class="bullets">
                        ${s.required_documents.map((d) => `<li>${esc(d)}</li>`).join("")}
                    </ul>
                ` : ""}
                ${(s.conditions || []).length ? `
                    <div class="section-title">Eligibility Conditions (${s.conditions.length})</div>
                    <ul class="bullets">
                        ${s.conditions.map((c) => `<li>${esc(c)}</li>`).join("")}
                    </ul>
                ` : ""}
            </section>
        `).join("");
        w.document.write(`<!doctype html><html><head><title>MPCA Schemes Register · ${esc(season)}</title>
            <style>
                @page { size: A4; margin: 18mm 14mm 20mm 14mm; }
                body { font-family: 'Georgia', 'Times New Roman', serif; padding: 0; color: #1a1a1a; font-size: 11px; line-height: 1.45; }
                h1 { color: #0f2818; font-size: 24px; margin: 0 0 4px; }
                .cover-sub { color: #a67c3a; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 24px; border-bottom: 2px solid #a67c3a; padding-bottom: 12px; }
                .toc { margin-bottom: 32px; page-break-after: always; }
                .toc h2 { font-size: 14px; color: #7c1e26; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 12px; }
                .toc-row { display: flex; justify-content: space-between; border-bottom: 1px dotted #d4c9b5; padding: 4px 0; }
                .toc-row .c { font-family: 'Courier New', monospace; color: #7c1e26; margin-right: 12px; min-width: 60px; }

                .scheme { break-inside: avoid; page-break-inside: avoid; margin-bottom: 20px; border: 1px solid #d4c9b5; padding: 12px 14px; background: #faf7f0; }
                .hdr { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid #d4c9b5; padding-bottom: 6px; margin-bottom: 8px; }
                .hdr .code { font-family: 'Courier New', monospace; color: #7c1e26; font-weight: bold; font-size: 13px; }
                .hdr .name { font-size: 14px; color: #0f2818; font-weight: bold; flex: 1; }
                .hdr .badges { display: flex; gap: 4px; }
                .badge { background: #a67c3a; color: #fff; padding: 2px 6px; font-size: 8px; text-transform: uppercase; letter-spacing: 1px; }
                .badge.inactive { background: #7c1e26; }
                .desc { color: #444; font-style: italic; margin: 6px 0; }
                .meta { font-size: 10px; color: #555; margin: 2px 0; }
                .meta b { color: #0f2818; }

                .section-title { color: #a67c3a; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin: 10px 0 4px; font-weight: bold; }
                table.heads { width: 100%; border-collapse: collapse; margin-top: 2px; }
                table.heads th, table.heads td { border: 1px solid #d4c9b5; padding: 4px 6px; text-align: left; font-size: 10px; vertical-align: top; }
                table.heads th { background: #f5efe3; color: #0f2818; text-transform: uppercase; letter-spacing: 1px; font-size: 9px; }
                table.heads td.rate { font-family: 'Courier New', monospace; text-align: right; color: #7c1e26; font-weight: bold; white-space: nowrap; }

                ul.bullets { margin: 4px 0 4px 20px; padding: 0; }
                ul.bullets li { margin: 2px 0; }

                .sig { margin-top: 40px; padding-top: 20px; border-top: 2px solid #0f2818; display: flex; justify-content: space-between; page-break-inside: avoid; }
                .sig div { border-top: 1px solid #1a1a1a; padding-top: 6px; width: 30%; font-size: 10px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
                .footer-note { margin-top: 24px; font-size: 9px; color: #555; font-style: italic; text-align: center; }
            </style></head><body>
            <h1>MPCA Schemes Register</h1>
            <div class="cover-sub">Master Reimbursement / Grant / Camp Schemes · Season ${esc(season)} · ${sortedSchemes.length} schemes</div>

            <div class="toc">
                <h2>Table of Contents</h2>
                ${sortedSchemes.map((s) => `<div class="toc-row"><span><span class="c">${esc(s.scheme_code)}</span>${esc(s.name)}</span><span>${esc((s.scheme_type || "").replace(/_/g, " "))}</span></div>`).join("")}
            </div>

            ${cards}

            <div class="sig">
                <div>President</div>
                <div>Hon. Secretary</div>
                <div>Hon. Treasurer</div>
            </div>
            <div class="footer-note">
                By signing above, the office bearers approve the ${sortedSchemes.length} schemes listed for Season ${esc(season)}
                including all budget heads, required documents and eligibility conditions.
                Any mid-year revision will require a fresh signature and re-upload to the ERP.
            </div>
            <script>window.onload = () => window.print();</script>
            </body></html>`);
        w.document.close();
    };

    const filtered = useMemo(() => {
        let list = schemes;
        if (filter !== "All") list = list.filter((s) => s.scheme_type === filter);
        return list;
    }, [schemes, filter]);

    const startEdit = (s) => setEditing({ ...s, conditions: [...(s.conditions || [])], required_documents: [...(s.required_documents || [])] });

    const saveEdit = async () => {
        try {
            const revision_note = window.prompt(
                "Briefly describe why this scheme is being revised (goes into the audit log).",
                "Mid-year revision — MPCA Managing Committee resolution",
            );
            if (revision_note === null) return; // user cancelled
            const patch = {
                name: editing.name, description: editing.description,
                heads: editing.heads,
                conditions: editing.conditions, required_documents: editing.required_documents,
                is_active: editing.is_active,
                revision_note,
            };
            await api.put(`/reimbursement-schemes/${editing.scheme_code}`, patch, {
                params: { fiscal_cycle: season },
            });
            setEditing(null);
            setSelected(null);
            await load();
            alert(
                `Scheme ${patch.name ? "" : ""}revised.\n\n` +
                `Season ${season} has been DEACTIVATED automatically.\n` +
                `Next steps:\n` +
                `  1. Click "Export PDF" to download the updated master.\n` +
                `  2. Get it re-signed by the office bearers.\n` +
                `  3. Click "Upload Signed" to re-activate the season.\n\n` +
                `Existing tournaments already created keep their frozen budgets — this only blocks NEW tournaments/claims until re-activation.`,
            );
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading) return <CricketLoader label="Loading schemes..." />;

    const cur = editing || selected;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="schemes-master-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Financial · MPCA Master Document</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">MPCA Schemes Register</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        {isMPCA
                            ? "Full catalogue of MPCA reimbursement, grant, camp, and welfare schemes from the Master Document. As MPCA, you can edit any scheme."
                            : "Read-only catalogue of MPCA schemes available to your body. Click any scheme to see full details, budget heads, required documents, and eligibility conditions."}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Feb-2026 · "Total Potential" pill removed — the number
                        was based on an unrealised heuristic ceiling, not
                        actual claims, and confused office bearers. */}
                </div>
            </div>

            {/* M39c · Season activation banner */}
            <div className={`mb-5 border p-4 flex items-start gap-3 ${isActivated ? "border-emerald-300 bg-emerald-50" : "border-mpca-oxblood bg-mpca-oxblood/5"}`} data-testid="activation-banner">
                <div className="pt-0.5">
                    {isActivated ? <CheckCircle2 className="text-emerald-700" size={20} /> : <Lock className="text-mpca-oxblood" size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className={`font-serif text-sm ${isActivated ? "text-emerald-900" : "text-mpca-oxblood"}`}>
                        {isActivated ? `Schemes ACTIVATED · Season ${season}` : `Schemes NOT ACTIVATED · Season ${season}`}
                    </div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1 leading-relaxed">
                        {isActivated ? (
                            <>
                                Divisions may create new grant claims and tournaments for this season.
                                {activation?.signed_by && <> Signed by <strong>{activation.signed_by}</strong>{activation?.signed_at ? ` · ${new Date(activation.signed_at).toLocaleDateString("en-IN")}` : ""}.</>}
                                {activation?.bootstrap && <span className="ml-1 text-mpca-brass">(Bootstrap · re-upload the signed PDF anytime to formalize.)</span>}
                            </>
                        ) : activation?.deactivation_reason ? (
                            <>
                                <strong className="text-mpca-oxblood">Deactivated after a mid-year revision.</strong> {activation.deactivation_reason}
                                {" "}Re-download the master PDF, get it re-signed by the office bearers, and re-upload here.
                                <span className="block mt-1">No new tournaments or grant claims can be created for {season} until this is done.</span>
                            </>
                        ) : (
                            <>
                                Before the season can start, MPCA must (1) edit the schemes, (2) download the master PDF, (3) get it signed by office bearers, (4) re-upload it here.
                                No new tournaments or grant claims can be created for {season} until this is done.
                            </>
                        )}
                    </div>
                    {activation?.signed_pdf_url && (
                        <a href={`${API_BASE.replace(/\/api$/, "")}${activation.signed_pdf_url}`} target="_blank" rel="noreferrer"
                           className="inline-block text-[10px] uppercase tracking-widest text-mpca-oxblood mt-2 hover:underline" data-testid="view-signed-pdf">
                            View signed PDF →
                        </a>
                    )}
                </div>
                {isMPCA && (
                    <div className="flex flex-col gap-2 shrink-0">
                        <button onClick={downloadExport} className="btn-heritage-secondary" data-testid="download-schemes-pdf">
                            <Download size={12} /> Export PDF
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-heritage-primary disabled:opacity-60" data-testid="upload-signed-pdf-btn">
                            <Upload size={12} /> {uploading ? "Uploading…" : isActivated ? "Re-upload Signed" : "Upload Signed PDF"}
                        </button>
                        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                               onChange={(e) => uploadSignedPdf(e.target.files?.[0])} data-testid="signed-pdf-input" />
                        {isActivated && !activation?.bootstrap && (
                            <button onClick={resetActivation} className="text-[10px] uppercase tracking-widest text-mpca-oxblood/70 hover:text-mpca-oxblood inline-flex items-center gap-1" data-testid="reset-activation-btn">
                                <RefreshCw size={10} /> Deactivate
                            </button>
                        )}
                    </div>
                )}
                {!isMPCA && !isActivated && (
                    <div className="shrink-0 text-[10px] uppercase tracking-widest text-mpca-oxblood inline-flex items-center gap-1">
                        <AlertTriangle size={12} /> Awaiting MPCA
                    </div>
                )}
            </div>

            {/* Filter chips */}
            <div className="flex gap-1 mb-5 flex-wrap">
                {SCHEME_TYPES.map((t) => {
                    const cnt = t === "All" ? schemes.length : schemes.filter((s) => s.scheme_type === t).length;
                    return (
                        <button key={t} onClick={() => setFilter(t)}
                            className={`px-3 py-1.5 text-[11px] uppercase tracking-widest border ${filter === t ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-brass/40 text-mpca-green-dark"}`}
                            data-testid={`filter-${t}`}>
                            {t.replace(/_/g, " ")} <span className="opacity-70 ml-1">({cnt})</span>
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
                {/* Left column: scheme list */}
                <div className="space-y-2" data-testid="scheme-list">
                    {filtered.map((s) => {
                        const reco = recos?.recommendations?.find((r) => r.scheme_code === s.scheme_code);
                        const isTrn = isTournamentScheme(s);
                        return (
                            <button key={s.scheme_code} onClick={() => { setSelected(s); setEditing(null); }}
                                className={`w-full text-left p-3 border transition-colors ${cur?.scheme_code === s.scheme_code ? "border-mpca-oxblood bg-mpca-cream/40" : "border-mpca-brass/30 hover:bg-mpca-cream/30"}`}
                                data-testid={`scheme-row-${s.scheme_code}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] text-mpca-brass">Scheme {s.scheme_code}</span>
                                            {reco?.state === "already_claimed" && <span className="text-[9px] uppercase text-mpca-green-dark tracking-widest">Claimed</span>}
                                            {isTrn && <span className="text-[9px] uppercase text-mpca-brass tracking-widest">Tournament</span>}
                                        </div>
                                        <div className="font-serif text-sm text-mpca-green-dark mt-0.5">{s.name}</div>
                                        <div className="text-[10px] text-mpca-gray-dark mt-1">
                                            <span className="capitalize">{(s.scheme_type || "").replace(/_/g, " ")}</span> · {s.frequency} · {(s.eligible_bodies || []).join("/")}
                                        </div>
                                    </div>
                                    {!isMPCA && !isTrn ? (
                                        <Link
                                            to={`/grant-claims/new?scheme=${s.scheme_code}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="shrink-0 text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-2.5 py-1.5 hover:bg-mpca-burgundy-dark inline-flex items-center gap-1"
                                            data-testid={`claim-row-${s.scheme_code}`}
                                        >
                                            <IndianRupee size={10} /> Claim
                                        </Link>
                                    ) : (
                                        <ChevronRight size={14} className="text-mpca-brass shrink-0" />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Right column: detail / edit */}
                <div className="bulletin-card p-6 sticky top-6 h-fit" data-testid="scheme-detail">
                    {!cur ? (
                        <div className="text-center py-12">
                            <BookOpen className="mx-auto text-mpca-brass mb-3" size={32} />
                            <div className="font-serif text-lg text-mpca-green-dark">Select a scheme to view details</div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-start justify-between gap-4 mb-3">
                                <div>
                                    <div className="overline text-[9px]">Scheme {cur.scheme_code} · {(cur.scheme_type || "").replace(/_/g, " ")}</div>
                                    {editing ? (
                                        <input className="input-heritage font-serif text-xl mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="edit-name" />
                                    ) : (
                                        <h2 className="font-serif text-2xl text-mpca-green-dark mt-1" data-testid="detail-name">{cur.name}</h2>
                                    )}
                                    <div className="text-[10px] text-mpca-gray-dark mt-1">
                                        Frequency: {cur.frequency} · Eligible: {(cur.eligible_bodies || []).join(", ")}
                                    </div>
                                </div>
                                {canEdit && !editing && (
                                    <button className="btn-heritage-secondary" onClick={() => startEdit(cur)} data-testid="edit-scheme-btn"><Edit3 size={12} /> Edit</button>
                                )}
                                {editing && (
                                    <div className="flex gap-2">
                                        <button className="btn-heritage-secondary" onClick={() => setEditing(null)}><X size={12} /> Cancel</button>
                                        <button className="btn-heritage-primary" onClick={saveEdit} data-testid="save-scheme-btn"><Save size={12} /> Save</button>
                                    </div>
                                )}
                            </div>
                            {editing ? (
                                <textarea rows={3} className="input-heritage text-sm mb-4" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} data-testid="edit-desc" />
                            ) : (
                                <p className="text-sm text-mpca-gray-dark mb-4">{cur.description}</p>
                            )}

                            {/* Budget heads — editable when MPCA in edit mode */}
                            <div className="mb-4">
                                <div className="overline text-[9px] mb-2">Budget Heads ({(cur.heads || []).length})</div>
                                <div className="space-y-1">
                                    {(cur.heads || []).map((h, i) => (
                                        editing ? (
                                            <div key={i} className="grid grid-cols-[1fr_100px_120px_auto] gap-2 items-center border-b border-mpca-brass/10 pb-1.5 pt-1" data-testid={`edit-head-${i}`}>
                                                <input
                                                    className="input-heritage text-[11px] !py-1"
                                                    value={h.label || ""}
                                                    onChange={(e) => {
                                                        const arr = [...editing.heads];
                                                        arr[i] = { ...arr[i], label: e.target.value };
                                                        setEditing({ ...editing, heads: arr });
                                                    }}
                                                    placeholder="Label"
                                                    data-testid={`edit-head-label-${i}`}
                                                />
                                                <input
                                                    type="number"
                                                    className="input-heritage text-[11px] !py-1 font-mono"
                                                    value={h.rate_inr ?? 0}
                                                    onChange={(e) => {
                                                        const arr = [...editing.heads];
                                                        arr[i] = { ...arr[i], rate_inr: parseFloat(e.target.value) || 0 };
                                                        setEditing({ ...editing, heads: arr });
                                                    }}
                                                    placeholder="₹"
                                                    data-testid={`edit-head-rate-${i}`}
                                                />
                                                <input
                                                    className="input-heritage text-[10px] !py-1"
                                                    value={h.rate_display || ""}
                                                    onChange={(e) => {
                                                        const arr = [...editing.heads];
                                                        arr[i] = { ...arr[i], rate_display: e.target.value };
                                                        setEditing({ ...editing, heads: arr });
                                                    }}
                                                    placeholder="Display (e.g. ₹5,000 / day)"
                                                    data-testid={`edit-head-display-${i}`}
                                                />
                                                <button
                                                    onClick={() => setEditing({ ...editing, heads: editing.heads.filter((_, j) => j !== i) })}
                                                    className="text-mpca-oxblood text-xs px-1"
                                                    title="Remove this head"
                                                    data-testid={`remove-head-${i}`}
                                                >×</button>
                                            </div>
                                        ) : (
                                            <div key={i} className="flex justify-between text-xs border-b border-mpca-brass/10 pb-1">
                                                <div className="text-mpca-green-dark">{h.label}</div>
                                                <div className="font-mono text-mpca-brass shrink-0 ml-3">{h.rate_display || fmt(h.rate_inr)}</div>
                                            </div>
                                        )
                                    ))}
                                </div>
                                {editing && (
                                    <button
                                        className="text-[10px] text-mpca-brass mt-2 uppercase tracking-widest"
                                        onClick={() => setEditing({
                                            ...editing,
                                            heads: [...(editing.heads || []), { code: `NEW_HEAD_${(editing.heads || []).length + 1}`, label: "New head", unit: "lump", rate_inr: 0, rate_display: "" }],
                                        })}
                                        data-testid="add-head-btn"
                                    >
                                        + Add budget head
                                    </button>
                                )}
                            </div>

                            {/* Revision history — audit trail of every mid-year edit */}
                            {!editing && (cur.revision_history || []).length > 0 && (
                                <div className="mb-4 border-t border-mpca-brass/20 pt-3" data-testid="revision-history-block">
                                    <div className="overline text-[9px] mb-2">Revision History ({cur.revision_history.length})</div>
                                    <div className="space-y-1.5">
                                        {[...cur.revision_history].reverse().map((r, i) => (
                                            <div key={i} className="text-[10px] text-mpca-gray-dark border-l-2 border-mpca-brass/40 pl-2" data-testid={`revision-${r.version}`}>
                                                <div>
                                                    <span className="font-mono text-mpca-oxblood">v{r.version}</span>
                                                    <span className="mx-1.5 text-mpca-brass">·</span>
                                                    <span>{new Date(r.changed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                                                    <span className="mx-1.5 text-mpca-brass">·</span>
                                                    <span>{r.changed_by}</span>
                                                </div>
                                                <div className="italic mt-0.5">{r.note}</div>
                                                {r.changed_fields?.length > 0 && (
                                                    <div className="text-mpca-brass mt-0.5">Fields: {r.changed_fields.join(", ")}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Required docs */}
                            {(cur.required_documents || []).length > 0 && (
                                <div className="mb-4">
                                    <div className="overline text-[9px] mb-2">Required Documents ({cur.required_documents.length})</div>
                                    <ul className="text-[11px] text-mpca-gray-dark list-disc pl-4 space-y-0.5">
                                        {cur.required_documents.map((d, i) => (
                                            editing ? (
                                                <li key={i} className="flex items-start gap-1">
                                                    <input className="input-heritage flex-1 text-[11px] py-0.5" value={d} onChange={(e) => {
                                                        const arr = [...editing.required_documents];
                                                        arr[i] = e.target.value;
                                                        setEditing({ ...editing, required_documents: arr });
                                                    }} />
                                                    <button onClick={() => setEditing({ ...editing, required_documents: editing.required_documents.filter((_, j) => j !== i) })} className="text-mpca-oxblood text-xs">×</button>
                                                </li>
                                            ) : <li key={i}>{d}</li>
                                        ))}
                                    </ul>
                                    {editing && <button className="text-[10px] text-mpca-brass mt-2 uppercase tracking-widest" onClick={() => setEditing({ ...editing, required_documents: [...editing.required_documents, "New document..."] })}>+ Add doc</button>}
                                </div>
                            )}

                            {/* Conditions */}
                            {(cur.conditions || []).length > 0 && (
                                <div className="mb-4">
                                    <div className="overline text-[9px] mb-2">Eligibility Conditions ({cur.conditions.length})</div>
                                    <ul className="text-[11px] text-mpca-gray-dark list-disc pl-4 space-y-0.5">
                                        {cur.conditions.map((c, i) => (
                                            editing ? (
                                                <li key={i} className="flex items-start gap-1">
                                                    <input className="input-heritage flex-1 text-[11px] py-0.5" value={c} onChange={(e) => {
                                                        const arr = [...editing.conditions];
                                                        arr[i] = e.target.value;
                                                        setEditing({ ...editing, conditions: arr });
                                                    }} />
                                                    <button onClick={() => setEditing({ ...editing, conditions: editing.conditions.filter((_, j) => j !== i) })} className="text-mpca-oxblood text-xs">×</button>
                                                </li>
                                            ) : <li key={i}>{c}</li>
                                        ))}
                                    </ul>
                                    {editing && <button className="text-[10px] text-mpca-brass mt-2 uppercase tracking-widest" onClick={() => setEditing({ ...editing, conditions: [...editing.conditions, "New condition..."] })}>+ Add condition</button>}
                                </div>
                            )}

                            {/* Claim button for Div/Dist — only for non-tournament schemes.
                                Tournament schemes (2-* series, 3-C, 3-D, 9-BCCI) are handled
                                exclusively via the Tournament Reimbursement Matrix. */}
                            {!isMPCA && !editing && !isTournamentScheme(cur) && (
                                <Link to={`/grant-claims/new?scheme=${cur.scheme_code}`} className="btn-heritage-primary inline-flex mt-2" data-testid="claim-scheme-btn">
                                    <IndianRupee size={12} /> Claim under this scheme
                                </Link>
                            )}
                            {!isMPCA && isTournamentScheme(cur) && (
                                <div className="mt-2 p-3 border border-mpca-brass/30 bg-mpca-cream/40 text-[11px] text-mpca-gray-dark">
                                    <span className="font-semibold text-mpca-green-dark">Tournament scheme · read-only.</span> Claims under this scheme flow through the Tournament Reimbursement Matrix — create a tournament with scheme <span className="font-mono">{cur.scheme_code}</span> assigned, then upload invoices and submit at completion.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SchemesMaster;
