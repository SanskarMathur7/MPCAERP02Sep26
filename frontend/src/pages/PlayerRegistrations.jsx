import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    UserPlus, Plus, Copy, Loader2, Check, X, Inbox, ExternalLink, ShieldAlert,
    RotateCcw, CheckCircle2, XCircle, Send, Mail, Phone, Calendar, ChevronRight,
    Sparkles, FileText, Upload, Edit3, History, AlertTriangle, ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSeason } from "@/context/SeasonContext";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";
import RegistrationAmendModal from "@/components/RegistrationAmendModal";
import DocumentPreview from "@/components/DocumentPreview";
import { REGISTRATION_DOC_SPEC, isDocApplicable } from "@/lib/registrationDocs";

const STATUS_TONE = {
    Submitted: "bg-mpca-navy/15 text-mpca-navy border-mpca-navy/40",
    Division_Approved: "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40",
    Approved: "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40",
    Rejected: "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/40",
    Returned: "bg-amber-100 text-amber-800 border-amber-300",
};

const publicUrlFor = (token) => `${window.location.origin}/register/player/${token}`;

// M39q · Register display style — SURNAME first, then given names.
// Prefer explicit surname/first_name when the split form was used; fall back to
// splitting full_name on whitespace so legacy records still render.
const registerName = (pd) => {
    if (!pd) return "";
    const sn = (pd.surname || "").trim();
    const fn = (pd.first_name || "").trim();
    if (sn || fn) return `${sn.toUpperCase()} ${fn}`.trim();
    const full = (pd.full_name || "").trim();
    if (!full) return "";
    const parts = full.split(/\s+/);
    if (parts.length < 2) return full;
    return `${parts[parts.length - 1].toUpperCase()} ${parts.slice(0, -1).join(" ")}`;
};

/**
 * Sprint M35 · Player Registration Campaigns
 * ──────────────────────────────────────────
 * Two tabs:
 *  · Campaigns — MPCA/Division open a season-scoped campaign, share the public
 *    URL, and optionally seed per-player invites.
 *  · Inbox    — every Submitted registration flowing in from the public form.
 *    Owner (or MPCA) can Approve (auto-creates a Player), Reject, or Return.
 */
const PlayerRegistrations = () => {
    const { persona } = useAuth();
    const { season } = useSeason();
    const [tab, setTab] = useState("campaigns");
    const [campaigns, setCampaigns] = useState([]);
    const [regs, setRegs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNew, setShowNew] = useState(false);
    const [activeInvites, setActiveInvites] = useState(null);   // {campaign, invites}

    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    const load = async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const [{ data: camps }, { data: rows }] = await Promise.all([
                api.get("/player-registration-campaigns"),
                api.get("/player-registrations"),
            ]);
            setCampaigns(camps || []);
            setRegs(rows || []);
        } catch (_) { setCampaigns([]); setRegs([]); }
        finally { if (!silent) setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const pendingCount = regs.filter((r) => r.status === "Submitted").length;

    const copyLink = async (token) => {
        try {
            await navigator.clipboard.writeText(publicUrlFor(token));
            alert("Public registration URL copied to clipboard.");
        } catch (_) { alert(publicUrlFor(token)); }
    };

    if (loading) return <div className="p-16"><CricketLoader label="Loading player registrations…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-[1400px] mx-auto" data-testid="player-registrations-page">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
                <div>
                    <div className="overline">Membership · Season Registrations</div>
                    <h1 className="font-serif text-3xl md:text-4xl text-mpca-green-dark mt-2 leading-tight">Player Registrations</h1>
                    <p className="text-[11px] text-mpca-gray-dark mt-2 max-w-2xl">
                        Open a season-scoped campaign, share the public URL (or per-player invites), and review incoming registrations in the inbox. Approved rows automatically create a Player under {isMPCA ? "the chosen body" : myBody} + {season || "current cycle"}.
                    </p>
                </div>
                <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="pr-new-campaign-btn">
                    <Plus size={14} /> {isMPCA ? "New Campaign" : "Request Campaign"}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-mpca-brass/30 mb-6">
                <button onClick={() => setTab("campaigns")} className={`px-4 py-2 text-[11px] uppercase tracking-widest font-mono ${tab === "campaigns" ? "border-b-2 border-mpca-oxblood text-mpca-oxblood" : "text-mpca-gray-dark"}`} data-testid="pr-tab-campaigns">
                    Campaigns · {campaigns.length}
                </button>
                <button onClick={() => setTab("inbox")} className={`px-4 py-2 text-[11px] uppercase tracking-widest font-mono flex items-center gap-2 ${tab === "inbox" ? "border-b-2 border-mpca-oxblood text-mpca-oxblood" : "text-mpca-gray-dark"}`} data-testid="pr-tab-inbox">
                    <Inbox size={12} /> Inbox · {regs.length}
                    {pendingCount > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-mpca-oxblood text-mpca-ivory">{pendingCount} pending</span>
                    )}
                </button>
            </div>

            {tab === "campaigns" && <CampaignsList campaigns={campaigns} onCopy={copyLink} onOpen={setActiveInvites} onChanged={load} persona={persona} />}
            {tab === "inbox" && <RegistrationsInbox regs={regs} campaigns={campaigns} onChanged={load} persona={persona} />}

            {showNew && (
                <NewCampaignDialog persona={persona} season={season} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />
            )}
            {activeInvites && (
                <InvitesDialog campaign={activeInvites} onClose={() => setActiveInvites(null)} onCopy={copyLink} onChanged={load} />
            )}
        </div>
    );
};

// ─────────────── Campaigns List ───────────────

const CampaignsList = ({ campaigns, onCopy, onOpen, onChanged, persona }) => {
    const isMPCA = persona?.body_type === "State";
    if (!campaigns.length) return (
        <div className="py-16 text-center border border-dashed border-mpca-brass/30 text-[11px] italic text-mpca-gray-dark" data-testid="pr-campaigns-empty">
            No campaigns yet. Click &quot;{isMPCA ? "New Campaign" : "Request Campaign"}&quot; to open your first season registration window.
        </div>
    );

    // MPCA-116 · Approve / Reject request handlers (MPCA-only).
    const approveReq = async (cid) => {
        try { await api.post(`/player-registration-campaigns/${cid}/approve-request`); onChanged?.(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    const rejectReq = async (cid) => {
        const reason = window.prompt("Reason for rejecting this campaign request?");
        if (!reason || !reason.trim()) return;
        try { await api.post(`/player-registration-campaigns/${cid}/reject-request`, { reason: reason.trim() }); onChanged?.(); }
        catch (e) { alert(e?.response?.data?.detail || e.message); }
    };
    // MPCA-Feb2026 · End / Resume a campaign — flips is_active. When false
    // the public link + invite tokens all return HTTP 410 (Gone).
    const toggleActive = async (c) => {
        const nextActive = !c.is_active;
        const verb = nextActive ? "Resume this campaign — the public URL will start accepting submissions again?" : "End this campaign now? The public URL will stop accepting new submissions immediately (existing registrations are preserved).";
        if (!window.confirm(verb)) return;
        try {
            await api.patch(`/player-registration-campaigns/${c.id}`, { is_active: nextActive });
            onChanged?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    return (
        <div className="bulletin-card divide-y divide-mpca-brass/15" data-testid="pr-campaigns-list">
            {campaigns.map((c) => {
                const expiring = c.expires_on && new Date(c.expires_on) < new Date();
                const status = c.request_status || "Approved";
                const isPending = status === "Pending";
                const isRejected = status === "Rejected";
                const isApproved = status === "Approved";
                return (
                    <div key={c.id} className="grid grid-cols-12 items-center gap-3 px-5 py-4" data-testid={`pr-campaign-${c.id}`}>
                        <div className="col-span-4 min-w-0">
                            <div className="font-serif text-lg text-mpca-green-dark truncate">{c.title}</div>
                            <div className="text-[10px] text-mpca-brass font-mono mt-0.5">
                                {c.body_code} · {c.cycle_code}{c.expires_on ? ` · expires ${c.expires_on}` : ""}
                            </div>
                            {/* MPCA-116 · Approval status line */}
                            <div className="text-[10px] mt-1">
                                {isPending && <span className="text-mpca-brass italic">⏳ Awaiting MPCA approval — public link disabled.</span>}
                                {isRejected && <span className="text-mpca-oxblood italic" data-testid={`pr-rejected-reason-${c.id}`}>✗ Rejected: {c.rejection_reason || "(no reason)"}</span>}
                                {isApproved && c.approved_by && <span className="text-mpca-green-dark/70">✓ Approved by {c.approved_by}</span>}
                            </div>
                        </div>
                        <div className="col-span-4 grid grid-cols-4 gap-2 text-center text-[10px] font-mono">
                            <div><div className="text-mpca-gray-dark">Invited</div><div className="text-mpca-green-dark text-base">{c.invited_count}</div></div>
                            <div><div className="text-mpca-gray-dark">Received</div><div className="text-mpca-navy text-base">{c.submitted_count}</div></div>
                            <div><div className="text-mpca-gray-dark">Approved</div><div className="text-mpca-green-dark text-base">{c.approved_count}</div></div>
                            <div><div className="text-mpca-gray-dark">Rejected</div><div className="text-mpca-oxblood text-base">{c.rejected_count}</div></div>
                        </div>
                        <div className="col-span-4 flex flex-wrap justify-end gap-1">
                            <span
                                className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${
                                    isPending ? "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40"
                                    : isRejected ? "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40"
                                    : expiring ? "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40"
                                    : c.is_active ? "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40"
                                    : "bg-mpca-brass/20 text-mpca-brass border-mpca-brass/40"
                                }`}
                                data-testid={`pr-campaign-status-${c.id}`}
                            >
                                {isPending ? "Pending" : isRejected ? "Rejected" : (expiring ? "Expired" : c.is_active ? "Active" : "Paused")}
                            </span>
                            {/* MPCA-116 · Public-link controls only when Approved */}
                            {isApproved && (
                                <>
                                    <button onClick={() => onCopy(c.public_token)} className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors inline-flex items-center gap-1" data-testid={`pr-copy-${c.id}`}>
                                        <Copy size={10} /> Copy public URL
                                    </button>
                                    <button onClick={() => onOpen(c)} className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors inline-flex items-center gap-1" data-testid={`pr-invites-${c.id}`}>
                                        <UserPlus size={10} /> Invites
                                    </button>
                                    <a href={publicUrlFor(c.public_token)} target="_blank" rel="noreferrer" className="text-[10px] uppercase tracking-widest px-2 py-1 text-mpca-gray-dark hover:text-mpca-green-dark inline-flex items-center gap-1" data-testid={`pr-preview-${c.id}`}>
                                        <ExternalLink size={10} /> Preview
                                    </a>
                                    {/* MPCA-Feb2026 · Active toggle — MPCA or the owning body can end/resume the campaign at any point. */}
                                    <button
                                        onClick={() => toggleActive(c)}
                                        className={`text-[10px] uppercase tracking-widest px-2 py-1 border inline-flex items-center gap-1 transition-colors ${
                                            c.is_active
                                                ? "border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory"
                                                : "border-mpca-green-dark text-mpca-green-dark hover:bg-mpca-green-dark hover:text-mpca-ivory"
                                        }`}
                                        title={c.is_active ? "End this campaign — public URL stops accepting submissions" : "Resume this campaign — public URL becomes live again"}
                                        data-testid={`pr-toggle-active-${c.id}`}
                                    >
                                        {c.is_active ? "End Campaign" : "Resume"}
                                    </button>
                                </>
                            )}
                            {/* MPCA-116 · MPCA-only Approve / Reject buttons for Pending requests */}
                            {isMPCA && isPending && (
                                <>
                                    <button onClick={() => approveReq(c.id)} className="text-[10px] uppercase tracking-widest px-2 py-1 bg-mpca-green-dark text-mpca-ivory hover:opacity-90 inline-flex items-center gap-1" data-testid={`pr-approve-req-${c.id}`}>
                                        Approve
                                    </button>
                                    <button onClick={() => rejectReq(c.id)} className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors inline-flex items-center gap-1" data-testid={`pr-reject-req-${c.id}`}>
                                        Reject
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ─────────────── Registrations Inbox ───────────────

const RegistrationsInbox = ({ regs, campaigns, onChanged, persona }) => {
    const [filter, setFilter] = useState("Submitted");
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);
    const [amendOpen, setAmendOpen] = useState(false);   // MPCA-153 · inline amend modal

    const filtered = useMemo(() => filter === "all" ? regs : regs.filter((r) => r.status === filter), [regs, filter]);

    const doAction = async (rid, action, arg = null) => {
        // M38i · '_refresh' pseudo-action → just re-fetch the row (used after AI review)
        if (action === "_refresh") {
            try {
                const { data } = await api.get(`/player-registrations/${rid}`);
                setSelected(data);
                onChanged?.();
            } catch { /* silent */ }
            return;
        }
        // MPCA-153 · Amend via inline modal — no more prompt() driving field names
        if (action === "edit") {
            setAmendOpen(true);
            return;
        }
        // MPCA-153 · Doc upload is now inside the amend modal — legacy no-op
        if (action === "upload-doc") {
            setAmendOpen(true);
            return;
        }
        setBusy(true);
        try {
            // M39n · Two-stage endpoints use `remark` field; legacy /reject uses `note`
            const body = ["division-approve", "mpca-approve", "return-to-player"].includes(action)
                ? { remark: arg, actor_name: persona?.name }
                : { reviewer_name: persona?.name, note: arg };
            const { data } = await api.post(`/player-registrations/${rid}/${action}`, body);
            setSelected(data);
            onChanged?.();
            const verb = action.replace(/-/g, " ");
            alert(`Registration · ${verb} complete.`);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-3">
                {["Submitted", "Division_Approved", "Approved", "Returned", "Rejected", "all"].map((s) => (
                    <button key={s} onClick={() => setFilter(s)} className={`text-[10px] uppercase tracking-widest px-3 py-1 border ${filter === s ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-brass/40 text-mpca-brass"}`} data-testid={`pr-filter-${s}`}>
                        {s === "all" ? "All" : s.replace(/_/g, " ")} · {s === "all" ? regs.length : regs.filter((r) => r.status === s).length}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-mpca-brass/30 text-[11px] italic text-mpca-gray-dark" data-testid="pr-inbox-empty">
                    Nothing to show for this filter yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 bulletin-card divide-y divide-mpca-brass/15 max-h-[600px] overflow-y-auto" data-testid="pr-inbox-list">
                        {filtered.map((r) => {
                            const camp = campaigns.find((c) => c.id === r.campaign_id);
                            const active = selected?.id === r.id;
                            return (
                                <button key={r.id} onClick={() => setSelected(r)} className={`w-full text-left px-4 py-3 ${active ? "bg-mpca-parchment" : "hover:bg-mpca-parchment/50"}`} data-testid={`pr-inbox-row-${r.id}`}>
                                    <div className="font-serif text-sm text-mpca-green-dark truncate">{registerName(r.player_data)}</div>
                                    <div className="text-[10px] text-mpca-brass font-mono truncate">{r.body_code} · {r.cycle_code} · {r.player_data?.role}</div>
                                    <div className="mt-1 flex items-center justify-between">
                                        <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_TONE[r.status]}`}>{r.status}</span>
                                        <span className="text-[9px] text-mpca-gray-dark">{r.submitted_at?.slice(0, 10)}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="lg:col-span-2">
                        {selected ? (
                            <RegistrationDetail reg={selected} campaigns={campaigns} onAction={doAction} busy={busy} />
                        ) : (
                            <div className="bulletin-card p-10 text-center text-[11px] italic text-mpca-gray-dark">Select a registration on the left to review.</div>
                        )}
                    </div>
                </div>
            )}
            {/* MPCA-153 · Inline amend modal */}
            {amendOpen && selected && (
                <RegistrationAmendModal
                    registration={selected}
                    persona={persona}
                    onClose={() => setAmendOpen(false)}
                    onSaved={async () => {
                        setAmendOpen(false);
                        try {
                            const { data } = await api.get(`/player-registrations/${selected.id}`);
                            setSelected(data);
                        } catch { /* silent */ }
                        // Silent list refresh — do NOT unmount RegistrationsInbox
                        // (keeps the review drawer visible with the updated data).
                        onChanged?.({ silent: true });
                    }}
                />
            )}
        </div>
    );
};

const RegistrationDetail = ({ reg, campaigns, onAction, busy }) => {
    const { persona } = useAuth();
    const camp = campaigns.find((c) => c.id === reg.campaign_id);
    const pd = reg.player_data || {};
    const isMPCA = persona?.body_type === "State";
    const isHomeDiv = persona && (
        persona.body_code === reg.body_code ||
        persona.body_code === pd?.preferred_division_code
    );
    const canDivisionApprove = isHomeDiv && ["Submitted", "Returned"].includes(reg.status);
    const canMPCAApprove = isMPCA && ["Submitted", "Returned", "Division_Approved"].includes(reg.status);
    const canReturn = (isHomeDiv || isMPCA) && !["Approved", "Rejected"].includes(reg.status);
    const canEdit = (isHomeDiv || isMPCA) && !["Approved", "Rejected"].includes(reg.status);
    const ai = reg.ai_summary;
    const aiFull = reg.ai_full_report;                                  // M39p · Batch B/C report card
    const [aiBusy, setAiBusy] = useState(false);
    const [aiFullBusy, setAiFullBusy] = useState(false);

    const runAiReview = async () => {
        setAiBusy(true);
        try {
            await api.post(`/player-registrations/${reg.id}/ai-review`);
            // Signal parent to refresh
            onAction(reg.id, "_refresh");
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setAiBusy(false); }
    };

    const runAiFullReview = async () => {
        setAiFullBusy(true);
        try {
            await api.post(`/player-registrations/${reg.id}/ai-full-review`);
            onAction(reg.id, "_refresh");
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setAiFullBusy(false); }
    };

    return (
        <div className="bulletin-card" data-testid="pr-inbox-detail">
            <div className="px-5 py-3 border-b border-mpca-brass/20 flex items-start justify-between gap-3">
                <div>
                    <div className="overline">{camp?.title || reg.campaign_id}</div>
                    <div className="font-serif text-2xl text-mpca-green-dark mt-1" data-testid="pr-detail-name">{registerName(pd)}</div>
                    <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-mpca-brass font-mono">
                        <span>{reg.body_code}</span><span>·</span><span>{reg.cycle_code}</span>
                        <span>·</span><span>Role: {pd.role?.replace(/_/g, " ")}</span>
                        <span>·</span><span>Category: {pd.category?.replace(/_/g, " ")}</span>
                        {pd.preferred_division_code && (<><span>·</span><span>Host Div: {pd.preferred_division_code}</span></>)}
                    </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                <button
                    onClick={runAiReview}
                    disabled={aiBusy}
                    title="Run Gemini KYC verification on uploaded documents"
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass text-mpca-brass hover:bg-mpca-brass/10 flex items-center gap-1 disabled:opacity-40 shrink-0"
                    data-testid="pr-ai-review-btn"
                >
                    <Sparkles size={11} className={aiBusy ? "animate-pulse" : ""} /> {aiBusy ? "Reviewing…" : (ai ? "Re-run AI" : "AI Review")}
                </button>
                <button
                    onClick={runAiFullReview}
                    disabled={aiFullBusy}
                    title="Deep OCR — Aadhaar, PAN, Birth Cert QR, marksheets, cheque, cross-doc name match"
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood/10 flex items-center gap-1 disabled:opacity-40 shrink-0"
                    data-testid="pr-ai-full-review-btn"
                >
                    <Sparkles size={11} className={aiFullBusy ? "animate-pulse" : ""} /> {aiFullBusy ? "Deep scan…" : (aiFull ? "Re-run Deep AI" : "Deep AI")}
                </button>
                </div>
            </div>

            {/* M38i · AI KYC verdict summary — visible after AI review has run */}
            {ai && (
                <div className={`mx-5 mt-4 p-3 border-2 ${
                    ai.overall_verdict === "Recommend_Approve" ? "border-mpca-green-dark bg-mpca-green-dark/5" :
                    ai.overall_verdict === "Recommend_Reject" ? "border-mpca-oxblood bg-mpca-oxblood/5" :
                    "border-mpca-brass bg-mpca-gold-light/10"
                }`} data-testid="pr-ai-summary">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Sparkles size={12} className={ai.overall_verdict === "Recommend_Approve" ? "text-mpca-green-dark" : ai.overall_verdict === "Recommend_Reject" ? "text-mpca-oxblood" : "text-mpca-brass"} />
                        <span className={`font-serif text-base ${ai.overall_verdict === "Recommend_Approve" ? "text-mpca-green-dark" : ai.overall_verdict === "Recommend_Reject" ? "text-mpca-oxblood" : "text-mpca-brass"}`} data-testid="pr-ai-verdict">{(ai.overall_verdict || "").replace(/_/g, " ")}</span>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                            {ai.docs_verified} / {ai.docs_total} docs verified · avg confidence {Math.round((ai.overall_confidence || 0) * 100)}%
                        </span>
                    </div>
                    {(ai.critical_issues || []).length > 0 && (
                        <ul className="mt-2 space-y-0.5" data-testid="pr-ai-critical">
                            {ai.critical_issues.map((c, i) => <li key={i} className="text-[10px] text-mpca-oxblood">⚠ {c}</li>)}
                        </ul>
                    )}
                    {(ai.advisory_notes || []).filter(Boolean).length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                            {ai.advisory_notes.filter(Boolean).map((a, i) => <li key={i} className="text-[10px] text-mpca-brass italic">· {a}</li>)}
                        </ul>
                    )}
                    <div className="text-right text-[9px] text-mpca-gray-dark mt-1">
                        {ai.validated_at && new Date(ai.validated_at).toLocaleString("en-IN")}
                        {ai.validated_by && <> · {ai.validated_by}</>}
                    </div>
                </div>
            )}

            {/* M39p · Deep AI Report Card (Batch B/C) */}
            {aiFull && (
                <div className={`mx-5 mt-4 p-3 border-2 ${
                    aiFull.verdict === "Recommend_Approve" ? "border-mpca-green-dark bg-mpca-green-dark/5" :
                    aiFull.verdict === "Recommend_Reject" ? "border-mpca-oxblood bg-mpca-oxblood/5" :
                    "border-mpca-brass bg-mpca-gold-light/10"
                }`} data-testid="pr-ai-full-card">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Sparkles size={12} className={aiFull.verdict === "Recommend_Approve" ? "text-mpca-green-dark" : aiFull.verdict === "Recommend_Reject" ? "text-mpca-oxblood" : "text-mpca-brass"} />
                        <span className={`font-serif text-base ${aiFull.verdict === "Recommend_Approve" ? "text-mpca-green-dark" : aiFull.verdict === "Recommend_Reject" ? "text-mpca-oxblood" : "text-mpca-brass"}`} data-testid="pr-ai-full-verdict">Deep AI · {(aiFull.verdict || "").replace(/_/g, " ")}</span>
                        <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">
                            confidence {Math.round((aiFull.overall_confidence || 0) * 100)}%
                            {typeof aiFull.age_computed === "number" && <> · age {aiFull.age_computed}</>}
                            {aiFull.pan_required && <> · PAN required</>}
                        </span>
                    </div>
                    {(aiFull.critical_issues || []).length > 0 && (
                        <ul className="mt-2 space-y-0.5" data-testid="pr-ai-full-critical">
                            {aiFull.critical_issues.map((c, i) => <li key={i} className="text-[11px] text-mpca-oxblood">⚠ {c}</li>)}
                        </ul>
                    )}
                    {(aiFull.warnings || []).length > 0 && (
                        <ul className="mt-1 space-y-0.5" data-testid="pr-ai-full-warnings">
                            {aiFull.warnings.map((w, i) => <li key={i} className="text-[11px] text-mpca-brass">· {w}</li>)}
                        </ul>
                    )}
                    {(aiFull.info || []).length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                            {aiFull.info.map((n, i) => <li key={i} className="text-[10px] text-mpca-green-dark italic">✓ {n}</li>)}
                        </ul>
                    )}
                    {aiFull.aadhaar_duplicate_of && (
                        <div className="mt-2 text-[10px] font-mono text-mpca-oxblood">
                            Aadhaar duplicate of registration {aiFull.aadhaar_duplicate_of.slice(0, 8)}
                        </div>
                    )}
                    <div className="text-right text-[9px] text-mpca-gray-dark mt-1">
                        {aiFull.validated_at && new Date(aiFull.validated_at).toLocaleString("en-IN")}
                        {aiFull.model && <> · {aiFull.model}</>}
                    </div>
                </div>
            )}
            <div className="p-5 grid grid-cols-2 gap-4 text-[12px]">
                <Field label="DOB" value={pd.dob} />
                <Field label="Gender" value={pd.gender} />
                <Field label="Batting" value={pd.batting_style} />
                <Field label="Bowling" value={pd.bowling_style} />
                <Field label="Mobile" value={pd.mobile} icon={Phone} />
                <Field label="Email" value={pd.email} icon={Mail} />
                <Field label="Host Division" value={pd.preferred_division_code} />
                <Field label="Aadhaar" value={pd.aadhaar_no ? `••••${pd.aadhaar_no.slice(-4)}` : null} />
                <Field label="Guardian" value={pd.guardian_name} />
                <Field label="Address" value={pd.address} span={2} />
                <Field label="Consent" value={pd.consent ? "Yes" : "No"} />
                <Field label="Bank IFSC" value={pd.bank_ifsc} />
            </div>
            {/* Attachments — inline PREVIEWS (no download). Shows every doc slot
                that carries a URL PLUS any player-supplied Other Documents. */}
            {(() => {
                const specDocs = REGISTRATION_DOC_SPEC.filter((s) => isDocApplicable(s, pd) && pd[s.field]);
                const otherDocs = Array.isArray(pd.other_docs) ? pd.other_docs.filter((o) => o && o.url) : [];
                if (specDocs.length === 0 && otherDocs.length === 0) return null;
                return (
                    <div className="px-5 py-3 border-t border-mpca-brass/20">
                        <div className="overline mb-2">Attachments · Preview only</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {specDocs.map((s) => (
                                <DocumentPreview
                                    key={s.field}
                                    url={pd[s.field]}
                                    name={s.label}
                                    hideExport
                                    renderTrigger={(openPreview) => (
                                        <button
                                            type="button"
                                            onClick={openPreview}
                                            className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors inline-flex items-center gap-1 text-left truncate"
                                            data-testid={`pr-doc-preview-${s.field}`}
                                        >
                                            <ExternalLink size={9} /> <span className="truncate">{s.label}</span>
                                        </button>
                                    )}
                                />
                            ))}
                            {otherDocs.map((o, i) => (
                                <DocumentPreview
                                    key={`other-${i}`}
                                    url={o.url}
                                    name={o.label || `Other Doc ${i + 1}`}
                                    hideExport
                                    renderTrigger={(openPreview) => (
                                        <button
                                            type="button"
                                            onClick={openPreview}
                                            className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-oxblood/40 text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors inline-flex items-center gap-1 text-left truncate"
                                            data-testid={`pr-doc-preview-other-${i}`}
                                        >
                                            <ExternalLink size={9} /> <span className="truncate">Other · {o.label || `Doc ${i + 1}`}</span>
                                        </button>
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                );
            })()}
            {reg.division_remark && (
                <div className="px-5 py-3 border-t border-mpca-brass/20 bg-mpca-brass/5" data-testid="division-remark-banner">
                    <div className="overline mb-1 text-mpca-brass">Division Remark · {reg.division_reviewed_by || "—"}{reg.division_reviewed_at ? ` · ${reg.division_reviewed_at.slice(0, 10)}` : ""}</div>
                    <div className="text-[11px] text-mpca-charcoal italic">{reg.division_remark}</div>
                </div>
            )}
            {reg.mpca_remark && (
                <div className="px-5 py-3 border-t border-mpca-brass/20 bg-emerald-50" data-testid="mpca-remark-banner">
                    <div className="overline mb-1 text-emerald-800">MPCA Remark {reg.mpca_shortcut_used ? "(Shortcut — Division bypassed)" : ""} · {reg.mpca_reviewed_by || "—"}{reg.mpca_reviewed_at ? ` · ${reg.mpca_reviewed_at.slice(0, 10)}` : ""}</div>
                    <div className="text-[11px] text-mpca-charcoal italic">{reg.mpca_remark}</div>
                </div>
            )}
            {reg.return_reason && reg.status === "Returned" && (
                <div className="px-5 py-3 border-t border-mpca-brass/20 bg-amber-50" data-testid="return-reason-banner">
                    <div className="overline mb-1 text-amber-800">Returned to Player</div>
                    <div className="text-[11px] text-mpca-charcoal italic">{reg.return_reason}</div>
                </div>
            )}

            {(canDivisionApprove || canMPCAApprove || canReturn || canEdit) && (
                <div className="border-t border-mpca-brass/20 px-5 py-3 bg-mpca-parchment/50 flex flex-wrap gap-2 justify-end" data-testid="pr-detail-actions">
                    {canEdit && (
                        <button onClick={() => onAction(reg.id, "edit")} disabled={busy} className="text-[11px] uppercase tracking-widest border border-mpca-navy text-mpca-navy px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-edit-btn">
                            <Edit3 size={11} /> Amend Data
                        </button>
                    )}
                    {canEdit && (
                        <button onClick={() => onAction(reg.id, "upload-doc")} disabled={busy} className="text-[11px] uppercase tracking-widest border border-mpca-brass text-mpca-brass px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-upload-doc-btn">
                            <Upload size={11} /> Upload Doc on Behalf
                        </button>
                    )}
                    {canDivisionApprove && (
                        <button onClick={() => { const n = window.prompt("Division approval remark (required):"); if (n) onAction(reg.id, "division-approve", n); }} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-brass text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-div-approve-btn">
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Division Approve
                        </button>
                    )}
                    {canMPCAApprove && (
                        <button onClick={() => {
                            const shortcut = reg.status !== "Division_Approved";
                            if (shortcut && !window.confirm("⚠️ Division has NOT approved this yet. MPCA-Approve will BYPASS the Division stage. Continue?")) return;
                            const n = window.prompt("MPCA approval remark (required):"); if (n) onAction(reg.id, "mpca-approve", n);
                        }} disabled={busy} className={`text-[11px] uppercase tracking-widest ${reg.status === "Division_Approved" ? "bg-mpca-green-dark" : "bg-mpca-oxblood"} text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40`} data-testid="pr-mpca-approve-btn">
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            {reg.status === "Division_Approved" ? "MPCA Approve · Create Player" : "MPCA Shortcut Approve"}
                            {reg.status !== "Division_Approved" && <AlertTriangle size={11} />}
                        </button>
                    )}
                    {/* MPCA-153 · "Return to Player" removed — amendments happen inline via the modal above */}
                    {/* Feb-2026 · Send back to Division for missing docs.
                        MPCA persona only, visible when reg is with MPCA
                        (Division_Approved / Submitted / Under_MPCA_Review).
                        Reuses the existing /return-to-player endpoint which
                        already accepts MPCA callers — the semantic label
                        matches what MPCA actually wants: bounce the row back
                        to the Division for a missing document. */}
                    {isMPCA && !["Approved", "Rejected"].includes(reg.status) && (
                        <button
                            onClick={() => {
                                const n = window.prompt(
                                    "Send this registration back to the Division. Please list the missing / incorrect document(s) so they know what to fix:",
                                );
                                if (n && n.trim()) onAction(reg.id, "return-to-player", n.trim());
                            }}
                            disabled={busy}
                            className="text-[11px] uppercase tracking-widest border border-mpca-brass text-mpca-brass px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"
                            data-testid="pr-return-to-division-btn"
                            title="Bounce this registration back to the home Division to fix missing documents"
                        >
                            <ArrowLeft size={11} /> Send back to Division
                        </button>
                    )}
                    {canReturn && (
                        <button onClick={() => { const n = window.prompt("Rejection reason (required):"); if (n) onAction(reg.id, "reject", n); }} disabled={busy} className="text-[11px] uppercase tracking-widest border border-mpca-oxblood text-mpca-oxblood px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-reject-btn">
                            <XCircle size={11} /> Reject
                        </button>
                    )}
                </div>
            )}

            {(reg.audit_events || []).length > 0 && (
                <div className="border-t border-mpca-brass/20 px-5 py-3" data-testid="audit-trail-section">
                    <div className="overline flex items-center gap-1 mb-2"><History size={10} /> Audit Trail · {reg.audit_events.length} events</div>
                    <ol className="space-y-1 text-[11px]">
                        {reg.audit_events.slice().reverse().map((e) => (
                            <li key={e.id} className="flex items-start gap-2" data-testid={`audit-${e.id}`}>
                                <span className="text-mpca-brass font-mono shrink-0">{e.timestamp?.slice(11, 16)}</span>
                                <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 border border-mpca-brass/30 text-mpca-brass shrink-0">{e.event.replace(/_/g, " ")}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-mpca-charcoal truncate">{e.actor_name || "—"}{e.actor_body_id ? ` · ${e.actor_body_id}` : ""}</div>
                                    {e.note && <div className="text-mpca-gray-dark italic">{e.note}</div>}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            {reg.status === "Approved" && reg.linked_player_id && (
                <div className="border-t border-mpca-brass/20 px-5 py-3 text-[11px] text-mpca-green-dark">
                    Player created →{" "}
                    <Link to={`/players/${reg.linked_player_id}`} className="text-mpca-oxblood hover:underline inline-flex items-center gap-1">
                        Open Player Profile <ChevronRight size={11} />
                    </Link>
                </div>
            )}
        </div>
    );
};

const Field = ({ label, value, span = 1, icon: Icon }) => (
    <div className={span === 2 ? "col-span-2" : ""}>
        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-0.5 flex items-center gap-1">
            {Icon && <Icon size={9} />} {label}
        </div>
        <div className="text-mpca-green-dark font-serif">{value || "—"}</div>
    </div>
);

// ─────────────── New Campaign dialog ───────────────

const NewCampaignDialog = ({ persona, season, onClose, onSaved }) => {
    const [title, setTitle] = useState(`Season ${season || "2026-27"} Registrations`);
    const [bodyCode, setBodyCode] = useState(persona?.body_code || "MPCA");
    const [expiresOn, setExpiresOn] = useState("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr("");
        try {
            await api.post("/player-registration-campaigns", {
                body_code: bodyCode, cycle_code: season || "2026-27", title, expires_on: expiresOn || null, notes, created_by: persona?.name,
            });
            onSaved?.();
        } catch (ex) { setErr(ex?.response?.data?.detail || ex.message); }
        finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid="pr-new-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full my-12">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div className="font-serif text-xl">New Registration Campaign</div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl"><X /></button>
                </div>
                <div className="p-5 space-y-3">
                    {err && <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2 flex items-center gap-2"><ShieldAlert size={11} /> {err}</div>}
                    <label className="block">
                        <span className="overline text-[9px]">Title</span>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input-heritage !py-1.5 !text-xs mt-1" data-testid="pr-new-title" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="overline text-[9px]">Body</span>
                            <input value={bodyCode} onChange={(e) => setBodyCode(e.target.value)} required className="input-heritage font-mono !py-1.5 !text-xs mt-1" data-testid="pr-new-body" />
                        </label>
                        <label className="block">
                            <span className="overline text-[9px]">Cycle</span>
                            <input value={season || "2026-27"} disabled className="input-heritage font-mono !py-1.5 !text-xs mt-1" data-testid="pr-new-cycle" />
                        </label>
                    </div>
                    <label className="block">
                        <span className="overline text-[9px]">Expires on (defaults to end of season)</span>
                        <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="pr-new-expires" />
                    </label>
                    <label className="block">
                        <span className="overline text-[9px]">Notes</span>
                        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="pr-new-notes" />
                    </label>
                </div>
                <div className="border-t border-mpca-brass/20 px-5 py-3 flex justify-end gap-2 bg-mpca-parchment">
                    <button type="button" onClick={onClose} className="text-[11px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40 text-mpca-gray-dark">Cancel</button>
                    <button type="submit" disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-new-save-btn">
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create Campaign
                    </button>
                </div>
            </form>
        </div>
    );
};

// ─────────────── Invites dialog ───────────────

const InvitesDialog = ({ campaign, onClose, onCopy, onChanged }) => {
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bulk, setBulk] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        const { data } = await api.get(`/player-registration-campaigns/${campaign.id}/invites`);
        setInvites(data || []);
        setLoading(false);
    };
    useEffect(() => { load(); }, [campaign.id]);

    const submitBulk = async () => {
        const rows = bulk.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
            const [name, contact] = l.split(",").map((s) => (s || "").trim());
            const looksEmail = (contact || "").includes("@");
            return { prefill_name: name, prefill_email: looksEmail ? contact : null, prefill_phone: !looksEmail ? contact : null };
        });
        if (!rows.length) return alert("Paste at least one row.");
        setBusy(true);
        try {
            await api.post(`/player-registration-campaigns/${campaign.id}/invites`, { invites: rows });
            setBulk("");
            await load();
            onChanged?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid="pr-invites-dialog">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-3xl w-full my-12">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">{campaign.body_code} · {campaign.cycle_code}</div>
                        <div className="font-serif text-xl mt-1">Invites · {campaign.title}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl"><X /></button>
                </div>
                <div className="p-5">
                    <div className="border border-mpca-brass/30 bg-mpca-parchment p-3 mb-4">
                        <div className="overline text-[9px] mb-2">Bulk add invites (one per line: <b>Name, email OR phone</b>)</div>
                        <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="Rohit Kumar, rohit@example.com&#10;Suresh Rane, 9876543210" className="input-heritage !py-1.5 !text-xs" data-testid="pr-invites-bulk-input" />
                        <button onClick={submitBulk} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 mt-2" data-testid="pr-invites-bulk-btn">
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Create invites
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-[11px] italic text-mpca-gray-dark py-6 text-center"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading…</div>
                    ) : invites.length === 0 ? (
                        <div className="py-8 text-center text-[11px] italic text-mpca-gray-dark" data-testid="pr-invites-empty">
                            No individual invites yet. Anyone with the public URL can still register.
                        </div>
                    ) : (
                        <div className="divide-y divide-mpca-brass/15 border border-mpca-brass/20 max-h-72 overflow-y-auto" data-testid="pr-invites-list">
                            {invites.map((inv) => (
                                <div key={inv.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-mpca-green-dark truncate">{inv.prefill_name || "(unnamed)"}</div>
                                        <div className="text-[9px] text-mpca-brass font-mono truncate">{inv.prefill_email || inv.prefill_phone || "no contact"}</div>
                                    </div>
                                    <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_TONE[inv.status] || "border-mpca-brass/40 text-mpca-brass"}`}>{inv.status}</span>
                                    <button onClick={() => onCopy(inv.token)} className="text-[9px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors inline-flex items-center gap-1">
                                        <Copy size={9} /> Copy link
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlayerRegistrations;
