import { useEffect, useState } from "react";
import { Loader2, Users, ShieldCheck, ShieldAlert, ChevronRight, Upload, RotateCcw, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { SignedPdfUploadModal } from "./SignedPdfUploadModal";

/**
 * Sprint M28 · Squads panel on the Tournament Workspace
 * ─────────────────────────────────────────────────────
 * Lists one card per participating Division/District showing the state of
 * their squad — Draft / Submitted / Approved, member count, warnings. MPCA
 * Secretary gets a bird's-eye view; each body's Secretary can drill into
 * their squad detail page to add players.
 *
 * MPCA-242 · The section header and status pills are wiring-driven: when the
 * tournament's `squad_approval.flag != "M"`, MPCA does not approve — the copy
 * reflects "lock" instead of "review/approve", and Approved shows as LOCKED.
 */
const STATUS_TONE = {
    Draft: "bg-mpca-brass/20 text-mpca-brass",
    Submitted: "bg-mpca-navy/20 text-mpca-navy",
    Awaiting_MPCA_Approval: "bg-mpca-navy/20 text-mpca-navy",
    Under_Review: "bg-mpca-navy/20 text-mpca-navy",
    Approved: "bg-mpca-green-dark/15 text-mpca-green-dark",
    Rejected: "bg-mpca-oxblood/15 text-mpca-oxblood",
};

const TournamentSquadsPanel = ({ tournament, persona, canManage, onChange: _onChange }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    // MPCA-242 · Read the wiring's squad_approval.flag so header + status pills
    // stay aligned with the governance intent. "M" → MPCA approves; otherwise
    // squad locks locally with no MPCA step.
    const [approvalFlag, setApprovalFlag] = useState(null);
    // MPCA-260 · Ship P1 — Read the wiring's squad step (owner + mode).  When
    // owner=MPCA + mode=Manual_PDF (BCCI family), the panel must show a
    // SINGLE MPCA-uploads-signed-PDF card — not one card per participating
    // body — because per wiring the roster is a manual signed sheet, not
    // built from the player register per division.
    const [squadStep, setSquadStep] = useState(null);
    // Iter 108e · Local state for the MPCA-signed PDF upload modal + the
    // freshly-uploaded URL so the card flips to "Uploaded" without a full
    // tournament refetch.
    const [pdfModalOpen, setPdfModalOpen] = useState(false);
    const [pdfUrlLocal, setPdfUrlLocal] = useState(null);
    const [parsedLocal, setParsedLocal] = useState(null);
    const [parsing, setParsing] = useState(false);
    const [parseErr, setParseErr] = useState("");

    useEffect(() => {
        let alive = true;
        api.get(`/tournaments/${tournament.id}/wiring-status`)
            .then(r => {
                if (!alive) return;
                const steps = r.data.steps || [];
                setApprovalFlag(steps.find(s => s.key === "squad_approval")?.flag ?? null);
                setSquadStep(steps.find(s => s.key === "squad") ?? null);
            })
            .catch(() => { if (alive) { setApprovalFlag(null); setSquadStep(null); } });
        return () => { alive = false; };
    }, [tournament.id]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setErr("");
            try {
                const { data: participants } = await api.get(`/tournaments/${tournament.id}/participants`);
                const results = await Promise.all(
                    (participants || []).map(async (p) => {
                        // Prefer the /finance drill-down (also returns squad) — one call vs two.
                        try {
                            const { data } = await api.get(`/tournaments/${tournament.id}/participants/${p.body_code}/finance`);
                            return { participant: p, squad: data.squad || null };
                        } catch {
                            return { participant: p, squad: null };
                        }
                    })
                );
                if (!cancelled) setRows(results);
            } catch (e) {
                if (!cancelled) setErr(e?.response?.data?.detail || e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tournament.id]);

    if (loading) return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-8 flex items-center gap-2 text-xs text-mpca-brass" data-testid="squads-loading">
            <Loader2 className="animate-spin" size={12} /> Loading squads…
        </div>
    );

    if (rows.length === 0) return (
        <div className="border border-dashed border-mpca-brass/40 bg-mpca-ivory px-4 py-8 text-center text-[11px] text-mpca-gray-dark" data-testid="squads-empty">
            No participants yet — set up Division Pools in the Tournament Basics panel first, then each participating body will get a squad slot here.
        </div>
    );

    // MPCA-260 · Ship P1 — Wiring says squad is MPCA-uploaded signed PDF
    // (BCCI family). Skip the per-body grid entirely and render a single
    // upload card. Existing squads (if any) still show below for audit.
    const mpcaSignedPdfMode =
        squadStep?.owner === "MPCA" && squadStep?.mode === "Manual_PDF";

    if (mpcaSignedPdfMode) {
        const anySquad = rows.find(r => r.squad)?.squad;
        const url = pdfUrlLocal || anySquad?.signed_squad_url || tournament.mpca_signed_squad_url;
        const canUpload = canManage && persona?.body_type === "State";
        const parsed = parsedLocal || tournament.parsed_signed_squad;
        const roleTone = (role) => (
            role === "Batter" ? "bg-mpca-green-deep/10 text-mpca-green-deep border-mpca-green-deep/40" :
            role === "Bowler" ? "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40" :
            role === "All-rounder" ? "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/50" :
            role === "WK" ? "bg-slate-100 text-slate-700 border-slate-300" :
            "bg-mpca-gray-dark/10 text-mpca-gray-dark border-mpca-gray-dark/30"
        );

        const runParse = async () => {
            setParsing(true); setParseErr("");
            try {
                const { data } = await api.post(`/tournaments/${tournament.id}/parse-signed-squad`);
                setParsedLocal(data);
            } catch (e) {
                setParseErr(e?.response?.data?.detail || e.message || "AI reader failed");
            } finally {
                setParsing(false);
            }
        };
        return (
            <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-4" data-testid="panel-squads-manual-pdf">
                <div>
                    <div className="overline text-[9px]">MPCA Signed Squad</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">Squad · Manual PDF (uploaded by MPCA)</div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl">
                        Per wiring, for BCCI-family tournaments MPCA uploads the signed squad sheet.
                        Individual divisions do <b>not</b> build squads for this tournament in the ERP —
                        the roster arrives as a signed team-list PDF from the state.
                    </div>
                </div>

                {/* PDF status + upload / replace / AI-read controls */}
                <div className="border border-dashed border-mpca-brass/40 bg-white p-4">
                    {url ? (
                        <div className="flex items-start justify-between gap-4 flex-wrap" data-testid="squad-manual-pdf-uploaded">
                            <div className="text-[12px] flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-mpca-green-dark/50 bg-mpca-green-dark/5 text-mpca-green-dark shrink-0">Uploaded</span>
                                <a href={url.startsWith("http") ? url : `${process.env.REACT_APP_BACKEND_URL}${url}`} target="_blank" rel="noreferrer" className="text-mpca-oxblood underline break-all">{url}</a>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button type="button" onClick={runParse} disabled={parsing}
                                        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold px-3 py-1.5 border border-mpca-brass/50 text-mpca-brass hover:bg-mpca-brass/5 disabled:opacity-60"
                                        data-testid="mpca-signed-squad-parse-btn">
                                    {parsing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} {parsed ? "Re-read with AI" : "Read with AI"}
                                </button>
                                {canUpload && (
                                    <button type="button" onClick={() => setPdfModalOpen(true)}
                                            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold px-3 py-1.5 border border-mpca-brass/50 text-mpca-brass hover:bg-mpca-brass/5"
                                            data-testid="mpca-signed-squad-replace-btn">
                                        <RotateCcw size={11} /> Replace
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start justify-between gap-4 flex-wrap" data-testid="squad-manual-pdf-empty">
                            <div className="text-[12px] italic text-mpca-gray-dark flex-1 min-w-0">
                                No signed squad uploaded yet. When MPCA finalises the roster, upload the signed PDF here — the URL will be stored against this tournament for closure archival.
                            </div>
                            {canUpload ? (
                                <button type="button" onClick={() => setPdfModalOpen(true)}
                                        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-bold px-4 py-2 bg-mpca-green-dark text-white hover:bg-mpca-green-dark/90 shrink-0"
                                        data-testid="mpca-signed-squad-upload-btn">
                                    <Upload size={12} /> Upload Signed PDF
                                </button>
                            ) : (
                                <div className="text-[10px] uppercase tracking-widest text-mpca-gray-dark/70 shrink-0" data-testid="mpca-signed-squad-upload-locked">MPCA-HQ only</div>
                            )}
                        </div>
                    )}
                    {parseErr && <div className="mt-2 text-[10.5px] text-mpca-oxblood" data-testid="parse-err">{parseErr}</div>}
                </div>

                {/* ─── Iter 108f · Squad summary card ────────────────── */}
                {parsed && (
                    <div className="border border-mpca-brass/30 bg-white" data-testid="squad-summary-card">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-mpca-brass/20 bg-mpca-ivory">
                            <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-mpca-green-dark">
                                Squad Summary · AI-read
                            </div>
                            <div className="flex items-center gap-3 text-[10.5px] font-mono">
                                {parsed.captain && <span><b>C</b> {parsed.captain}</span>}
                                {parsed.vice_captain && <span><b>VC</b> {parsed.vice_captain}</span>}
                                <span className="px-2 py-0.5 border border-mpca-brass/40 bg-mpca-brass/10 text-mpca-brass">
                                    {(parsed.players || []).length} players · conf {Math.round((parsed.confidence || 0) * 100)}%
                                </span>
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 p-3" data-testid="squad-summary-players">
                            {(parsed.players || []).map((p, i) => (
                                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border border-mpca-brass/20 bg-mpca-ivory/40">
                                    <span className="w-5 text-[10px] font-mono text-mpca-gray-dark">{i + 1}</span>
                                    <span className="flex-1 text-[12px] font-semibold text-mpca-charcoal truncate" title={p.name}>{p.name}</span>
                                    {p.jersey && <span className="text-[9.5px] font-mono text-mpca-gray-dark">#{p.jersey}</span>}
                                    <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${roleTone(p.role)}`}>{p.role}</span>
                                    {p.name === parsed.captain && <span className="text-[8.5px] font-bold text-mpca-oxblood">C</span>}
                                    {p.name === parsed.vice_captain && <span className="text-[8.5px] font-bold text-mpca-brass">VC</span>}
                                </div>
                            ))}
                        </div>
                        <div className="px-4 py-2 border-t border-mpca-brass/20 text-[10px] text-mpca-gray-dark">
                            Last read {parsed.parsed_at?.substring(0, 19).replace("T", " ") || "just now"}
                            {parsed.parsed_by && <> · by {parsed.parsed_by}</>}
                        </div>
                    </div>
                )}

                <SignedPdfUploadModal
                    open={pdfModalOpen}
                    onClose={() => setPdfModalOpen(false)}
                    title={url ? "Replace MPCA Signed Squad PDF" : "Upload MPCA Signed Squad PDF"}
                    description="Single PDF · signed team-list from the state. Max 20 MB."
                    metadata={{
                        related_type: "tournament_signed_squad",
                        related_id: tournament.id,
                        body_id: "MPCA",
                        uploaded_by: persona?.id || persona?.name || "mpca-hq",
                    }}
                    onUploaded={async ({ url: newUrl }) => {
                        await api.patch(`/tournaments/${tournament.id}`, {
                            mpca_signed_squad_url: newUrl,
                            mpca_signed_squad_uploaded_at: new Date().toISOString(),
                        });
                        setPdfUrlLocal(newUrl);
                        setPdfModalOpen(false);
                        setParsedLocal(null);   // stale → let the user Re-read
                        // Auto-fire the AI read so the summary card populates immediately
                        setTimeout(runParse, 300);
                        if (_onChange) _onChange();
                    }}
                    testidPrefix="mpca-signed-squad-modal"
                />
            </div>
        );
    }

    const submittedCount = rows.filter((r) => r.squad && ["Submitted", "Awaiting_MPCA_Approval", "Under_Review", "Approved"].includes(r.squad.submission_status)).length;
    const approvedCount = rows.filter((r) => r.squad?.submission_status === "Approved").length;
    // MPCA-242 · Wiring-driven copy — "M" means MPCA approves; otherwise the
    // Division/District self-locks and there is no MPCA review step.
    const mpcaApproves = approvalFlag === "M";
    const approvedLabel = mpcaApproves ? "Approved" : "Locked";

    return (
        <div className="border border-mpca-brass/30 bg-mpca-ivory p-5 space-y-4" data-testid="panel-squads">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <div className="overline text-[9px]">MPCA Multi-Body Squads</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">
                        Squads · {rows.length} bodies · {submittedCount} {mpcaApproves ? "submitted" : "locked"} · {approvedCount} {mpcaApproves ? "approved" : "final"}
                    </div>
                    <div className="text-[11px] text-mpca-gray-dark mt-1 max-w-2xl" data-testid="squads-panel-subheader">
                        {mpcaApproves ? (
                            <>One card per participating Division/District. Each body&apos;s Secretary builds their own squad; MPCA reviews and approves. Cards flip to &quot;Approved&quot; once selection is locked.</>
                        ) : (
                            <>One card per participating Division/District. Each body&apos;s Secretary builds and locks their own squad — MPCA sees the roster in real time but does not approve for this tournament type per the wiring.</>
                        )}
                    </div>
                </div>
            </div>

            {err && <div className="text-[10px] text-mpca-oxblood bg-mpca-oxblood/5 px-2 py-1 border border-mpca-oxblood/30" data-testid="squads-error">{err}</div>}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="squads-grid">
                {rows.map(({ participant, squad }) => {
                    const isMine = persona?.body_code === participant.body_code;
                    const status = squad?.submission_status || "Not_Started";
                    const memberCount = squad ? (squad.members || []).length : 0;
                    const warnings = squad?.eligibility_warnings?.length || 0;
                    return (
                        <div key={participant.body_code} className="border border-mpca-brass/30 bg-white p-3 space-y-2" data-testid={`squad-card-${participant.body_code}`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="font-serif text-sm text-mpca-green-dark leading-tight">{participant.body_name}</div>
                                    <div className="text-[9px] font-mono text-mpca-brass">
                                        {participant.body_code} · {participant.role} · {participant.pool_name || "—"}
                                    </div>
                                </div>
                                {isMine && <span className="text-[8px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-1.5 py-0.5">yours</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 ${STATUS_TONE[status] || "bg-mpca-gray-dark/15 text-mpca-gray-dark"}`}>
                                    {status === "Approved" ? approvedLabel.toUpperCase() : status.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] font-mono text-mpca-charcoal">
                                    <Users size={10} className="inline" /> {memberCount}/{tournament.max_squad_size || 18}
                                </span>
                                {warnings > 0 && (
                                    <span className="text-[10px] text-mpca-oxblood inline-flex items-center gap-0.5">
                                        <ShieldAlert size={10} /> {warnings}
                                    </span>
                                )}
                                {status === "Approved" && warnings === 0 && (
                                    <span className="text-[10px] text-mpca-green-dark inline-flex items-center gap-0.5">
                                        <ShieldCheck size={10} />
                                    </span>
                                )}
                            </div>
                            {squad ? (
                                <Link
                                    to={`/squads/${squad.id}`}
                                    className="text-[10px] uppercase tracking-widest text-mpca-oxblood hover:underline inline-flex items-center gap-1"
                                    data-testid={`squad-open-${participant.body_code}`}
                                >
                                    Open squad <ChevronRight size={10} />
                                </Link>
                            ) : (
                                <div className="text-[10px] text-mpca-gray-dark italic">
                                    Squad not started {(isMine || canManage) && (
                                        <Link to={`/tournaments/${tournament.id}/squads/new?body=${participant.body_code}`} className="text-mpca-oxblood not-italic hover:underline">
                                            — start it
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TournamentSquadsPanel;
