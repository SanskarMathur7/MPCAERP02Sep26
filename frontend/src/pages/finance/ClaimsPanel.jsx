import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Loader2, Send, PackageOpen, FileSignature,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmt, StatusPill } from "./financeShared";

/** M39z.c/d/e/f · Reimbursement Claim workflow inside the Finance Console.
 *
 * Behaviour depends on the persona × tournament ownership matrix:
 *
 *   · MPCA persona                              → sees every claim (State scope).
 *   · Division on MPCA-owned tournament         → raises own claim → MPCA.
 *   · Division on Division-owned (self-hosted)  → reviews incoming District
 *                                                 claims, consolidates them
 *                                                 into a master → MPCA.
 *   · District on Division-hosted tournament    → raises claim → parent Div.
 *   · District on MPCA-owned tournament         → not allowed (backend 403).
 */
export const ClaimsPanel = ({ tournament, persona }) => {
    const [claims, setClaims] = useState([]);
    const [incomingChildren, setIncomingChildren] = useState([]);   // District claims routed to my Division
    const [consolidatorPreview, setConsolidatorPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [previewSummary, setPreviewSummary] = useState(null);
    const navigate = useNavigate();
    const isMPCA = persona?.body_type === "State";
    const isDivision = persona?.body_type === "Division";
    const isDistrict = persona?.body_type === "District";
    const myBody = persona?.body_code;
    // M39z.e · Tournament ownership drives the whole flow.
    const host = tournament?.host_body_id || "MPCA";
    const iAmHostDivision = isDivision && host === myBody;

    const load = useCallback(async () => {
        try {
            const params = { tournament_id: tournament.id };
            if (!isMPCA && myBody) params.body_id = myBody;
            const { data } = await api.get("/reimbursement-claims", { params });
            setClaims(data || []);

            if (!isMPCA && myBody && (!data || data.length === 0)) {
                try {
                    const { data: s } = await api.get(`/tournaments/${tournament.id}/spent-by-head`, { params: { body_id: myBody } });
                    setPreviewSummary(s);
                } catch { /* ignore */ }
            }

            // Only meaningful when this Division actually HOSTS the tournament.
            if (isDivision && myBody && iAmHostDivision) {
                try {
                    const { data: kids } = await api.get("/reimbursement-claims", {
                        params: { tournament_id: tournament.id, route_to_body_id: myBody },
                    });
                    setIncomingChildren(kids || []);
                } catch { setIncomingChildren([]); }
                try {
                    const { data: cp } = await api.get("/reimbursement-claims/consolidator/preview", {
                        params: { tournament_id: tournament.id, division_body_id: myBody, fiscal_cycle: tournament.fiscal_cycle || "2025-26" },
                    });
                    setConsolidatorPreview(cp);
                } catch { setConsolidatorPreview(null); }
            }
        } catch { setClaims([]); }
        finally { setLoading(false); }
    }, [tournament.id, tournament.fiscal_cycle, isMPCA, isDivision, iAmHostDivision, myBody]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    const startDraft = async () => {
        if (!myBody) return;
        setBusy(true);
        try {
            // MPCA-235 · When the Division has TWO approved budgets on this tournament
            // (Host + Visitor across pools), ask which one this claim covers so
            // Invoice/Extras/DA aggregation stays scoped.
            let scoped = {};
            const { data: appr } = await api.get("/tournament-budgets", {
                params: { tournament_id: tournament.id, body_id: myBody, status: "Approved" },
            }).catch(() => ({ data: [] }));
            if ((appr || []).length > 1) {
                const opts = appr.map((b, i) => `${i + 1}. ${b.budget_no} · ${b.pool_name || "—"} · ${b.role_flavour || "—"} · ₹${Number(b.total_ceiling_inr || 0).toLocaleString("en-IN")}`).join("\n");
                const pick = window.prompt(
                    `This tournament has ${appr.length} separate budgets for ${myBody}. Which one does this Reimbursement Claim cover?\n\n${opts}\n\nEnter the number (1 or 2)…`,
                    "1"
                );
                const idx = Number(pick) - 1;
                if (!Number.isFinite(idx) || idx < 0 || idx >= appr.length) { setBusy(false); return; }
                const picked = appr[idx];
                scoped = {
                    budget_id: picked.id,
                    pool_id: picked.pool_id || null,
                    pool_name: picked.pool_name || null,
                    role_flavour: picked.role_flavour || null,
                };
            } else if ((appr || []).length === 1) {
                const only = appr[0];
                scoped = {
                    budget_id: only.id,
                    pool_id: only.pool_id || null,
                    pool_name: only.pool_name || null,
                    role_flavour: only.role_flavour || null,
                };
            }
            await api.post("/reimbursement-claims", {
                tournament_id: tournament.id,
                body_id: myBody,
                fiscal_cycle: tournament.fiscal_cycle,
                scheme_code: tournament.scheme_code,
                claimed_by: persona?.name,
                notes: `Auto-drafted from Finance Console by ${persona?.name || myBody}${scoped.pool_name ? ` · ${scoped.pool_name} · ${scoped.role_flavour}` : ""}`,
                ...scoped,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const uploadSigned = async (claim, file) => {
        if (!file) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("body_id", myBody || "");
            fd.append("uploaded_by", persona?.name || myBody || "");
            fd.append("related_type", "reimbursement_claim");
            fd.append("related_id", claim.id);
            const { data: up } = await api.post("/uploads", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            await api.post(`/reimbursement-claims/${claim.id}/signed-pdf`, {
                signed_pdf_url: up.url,
                uploaded_by: persona?.name || myBody,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const submitClaim = async (claim) => {
        const target = claim.is_master ? "MPCA" : (isDistrict ? `your parent Division (${persona?.parent_body_code || "Division"})` : "MPCA");
        if (!window.confirm(`Submit ${claim.claim_ref} to ${target}?\n\nMake sure the signed PDF is uploaded — the reviewer cannot process an unsigned claim.`)) return;
        setBusy(true);
        try {
            await api.post(`/reimbursement-claims/${claim.id}/submit`, {
                actor_name: persona?.name, actor_role: persona?.post, actor_body_id: myBody,
                notes: "Submitted via Finance Console",
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const reviewChild = async (child, action) => {
        let approved_amount_inr = null;
        let notes = null;
        if (action === "approve") {
            const proposed = window.prompt(
                `Approve ${child.claim_ref} from ${child.body_name}?\n\nEligible ₹${Math.round(child.summary?.eligible_total_inr || 0).toLocaleString("en-IN")}.\nEnter approved amount (blank = full eligible):`,
                Math.round(child.summary?.eligible_total_inr || 0)
            );
            if (proposed === null) return;
            approved_amount_inr = proposed.trim() === "" ? undefined : parseFloat(proposed);
        } else {
            notes = window.prompt("Reason for rejection?");
            if (!notes) return;
        }
        setBusy(true);
        try {
            const url = `/reimbursement-claims/${child.id}/${action}`;
            await api.post(url, {
                actor_name: persona?.name || myBody, actor_role: persona?.post || "Division_Secretary", actor_body_id: myBody,
                approved_amount_inr, notes,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const consolidate = async () => {
        if (!consolidatorPreview || (consolidatorPreview.approved_child_count || 0) === 0) return;
        if (!window.confirm(
            `Consolidate ${consolidatorPreview.approved_child_count} Approved District claim(s) totalling `
            + `₹${Math.round(consolidatorPreview.roll_up_total_inr || 0).toLocaleString("en-IN")} into your Division master claim?\n\n`
            + `After consolidation you'll need to upload the signed master PDF and submit to MPCA.`
        )) return;
        setBusy(true);
        try {
            await api.post("/reimbursement-claims/consolidate", {
                tournament_id: tournament.id,
                division_body_id: myBody,
                fiscal_cycle: tournament.fiscal_cycle || "2025-26",
                actor_name: persona?.name || myBody,
                actor_role: persona?.post,
            });
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    if (loading) return (
        <div className="py-8 text-center text-[11px] text-mpca-charcoal/80" data-testid="claims-loading">
            <Loader2 className="animate-spin inline mr-1" size={12} /> Loading claims…
        </div>
    );

    const pendingDistrictReviews = incomingChildren.filter((c) => c.status === "Submitted" && !c.parent_claim_id);
    const approvedNotConsolidated = incomingChildren.filter((c) => c.status === "Approved" && !c.parent_claim_id);

    return (
        <div className="space-y-5" data-testid="claims-panel">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="overline text-[10px] font-semibold text-mpca-oxblood">Reimbursement Claim</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1 font-semibold">
                        {isMPCA ? `${claims.length} claim(s) across bodies` : `Your body (${myBody})`}
                    </div>
                    <p className="text-[11px] text-mpca-charcoal/80 mt-1 max-w-2xl">
                        {isDistrict
                            ? "Once your invoices / DA are uploaded, raise a Reimbursement Claim — it goes to your parent Division (this tournament's host) for review, then rolls up to MPCA as part of the Division master."
                            : isDivision && iAmHostDivision
                                ? "You are hosting this tournament. Review each District's claim (approve / approve-with-variation / reject), then tap Consolidate to roll every Approved District claim + your own admin spend into a single master claim, then submit that upward to MPCA to reclaim."
                                : isDivision
                                    ? "Raise your Reimbursement Claim for this MPCA-hosted tournament — it goes to MPCA for review. Districts do not participate here."
                                    : "Divisions submit consolidated master claims here; each master rolls up their own spend + every Approved District claim under them."}
                    </p>
                </div>
                {!isMPCA && claims.length === 0 && (
                    <button
                        onClick={startDraft}
                        disabled={busy}
                        className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood hover:bg-mpca-oxblood/90 px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
                        data-testid="claims-start-draft-btn"
                    >
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <FileSignature size={11} />}
                        Start Claim Draft
                    </button>
                )}
            </div>

            {/* Preview head-wise tally BEFORE a claim exists — helps the Division decide when to raise it */}
            {!isMPCA && claims.length === 0 && previewSummary && (
                <div className="border-2 border-mpca-brass/40 bg-mpca-parchment/40 p-4" data-testid="claims-preview">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="overline text-[9px] font-semibold text-mpca-oxblood">Live tally · before you draft</div>
                        <div className="text-[11px] text-mpca-charcoal/80">
                            Invoiced <strong className="text-mpca-navy font-mono">{fmt(previewSummary.invoiced_total_inr)}</strong>
                            <span className="mx-2 text-mpca-brass">·</span>
                            Eligible <strong className="text-mpca-green-dark font-mono">{fmt(previewSummary.eligible_total_inr)}</strong>
                            {previewSummary.over_budget_inr > 0 && (
                                <span className="ml-2 text-mpca-oxblood text-[10px]">
                                    (₹{Math.round(previewSummary.over_budget_inr).toLocaleString("en-IN")} over budget)
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Division-only: Incoming District Claims for review — only visible when I host the tournament */}
            {isDivision && iAmHostDivision && (pendingDistrictReviews.length > 0 || approvedNotConsolidated.length > 0) && (
                <IncomingDistrictClaims
                    pending={pendingDistrictReviews}
                    approvedNotConsolidated={approvedNotConsolidated}
                    consolidatorPreview={consolidatorPreview}
                    busy={busy}
                    onReview={reviewChild}
                    onConsolidate={consolidate}
                    onOpen={(cid) => navigate(`/reimbursement-claims/${cid}`)}
                />
            )}

            {claims.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-mpca-brass/40 text-[11px] text-mpca-charcoal/80 italic" data-testid="claims-empty">
                    {isMPCA
                        ? "No divisions have submitted a claim yet for this tournament."
                        : (previewSummary?.invoiced_total_inr || 0) > 0
                            ? <>Ready to raise your claim. Click <strong className="text-mpca-oxblood">Start Claim Draft</strong> above to auto-compute the summary.</>
                            : "Once you've uploaded invoices / DA forms, come back here to raise your Reimbursement Claim."}
                </div>
            ) : (
                <div className="divide-y divide-mpca-brass/25">
                    {claims.map((c) => (
                        <ClaimRow
                            key={c.id}
                            claim={c}
                            isMPCA={isMPCA}
                            busy={busy}
                            onUploadSigned={(f) => uploadSigned(c, f)}
                            onSubmit={() => submitClaim(c)}
                            onOpen={() => navigate(`/reimbursement-claims/${c.id}`)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// M39z.d · Bold oxblood-bordered card that only the tournament-hosting
// Division sees. Lists pending District claims for review with Approve /
// Reject / Open actions, and once at least one is approved shows a
// "Consolidate N · ₹X" button that rolls them up into the Division master.
const IncomingDistrictClaims = ({ pending, approvedNotConsolidated, consolidatorPreview, busy, onReview, onConsolidate, onOpen }) => (
    <div className="border-2 border-mpca-oxblood/50 bg-mpca-oxblood/5 p-4" data-testid="district-review-panel">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
                <div className="overline text-[10px] font-semibold text-mpca-oxblood">Incoming District Claims</div>
                <div className="font-serif text-mpca-green-dark font-semibold mt-0.5">
                    {pending.length} awaiting review
                    {approvedNotConsolidated.length > 0 && ` · ${approvedNotConsolidated.length} approved · ready to consolidate`}
                </div>
            </div>
            {approvedNotConsolidated.length > 0 && (
                <button
                    onClick={onConsolidate}
                    disabled={busy}
                    className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood hover:bg-mpca-oxblood/90 px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
                    data-testid="claims-consolidate-btn"
                >
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <PackageOpen size={11} />}
                    Consolidate {approvedNotConsolidated.length} · ₹{Math.round(consolidatorPreview?.roll_up_total_inr || 0).toLocaleString("en-IN")}
                </button>
            )}
        </div>

        {pending.length > 0 && (
            <div className="divide-y divide-mpca-oxblood/20 border border-mpca-oxblood/25 bg-mpca-ivory mb-3">
                {pending.map((c) => (
                    <div key={c.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs" data-testid={`district-claim-${c.id}`}>
                        <div className="col-span-4 min-w-0">
                            <div className="font-mono text-[10px] text-mpca-charcoal/70 truncate">{c.claim_ref}</div>
                            <div className="font-serif text-sm text-mpca-green-dark truncate font-semibold">{c.body_name || c.body_id}</div>
                        </div>
                        <div className="col-span-3 text-right font-mono">
                            <div className="text-sm text-mpca-oxblood font-semibold">{fmt(c.summary?.eligible_total_inr || 0)}</div>
                            <div className="text-[10px] text-mpca-charcoal/70">Eligible</div>
                        </div>
                        <div className="col-span-5 flex justify-end gap-1.5">
                            <button onClick={() => onReview(c, "approve")} disabled={busy}
                                className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-green-dark hover:bg-mpca-green-dark/90 px-2.5 py-1.5"
                                data-testid={`district-approve-${c.id}`}>
                                Approve
                            </button>
                            <button onClick={() => onReview(c, "reject")} disabled={busy}
                                className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood hover:bg-mpca-oxblood/90 px-2.5 py-1.5"
                                data-testid={`district-reject-${c.id}`}>
                                Reject
                            </button>
                            <button onClick={() => onOpen(c.id)}
                                className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2.5 py-1.5 border-2 border-mpca-oxblood transition-colors">
                                Open
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
        {approvedNotConsolidated.length > 0 && (
            <div className="text-[10px] text-mpca-charcoal/75 mt-2">
                Approved &amp; awaiting rollup: {approvedNotConsolidated.map((c) => `${c.body_name || c.body_id} (₹${Math.round(c.approved_amount_inr || 0).toLocaleString("en-IN")})`).join(", ")}
            </div>
        )}
    </div>
);

// One-row renderer with inline sign-upload + submit actions (used by ClaimsPanel).
const ClaimRow = ({ claim, isMPCA, busy, onUploadSigned, onSubmit, onOpen }) => {
    const c = claim;
    const isDraft = c.status === "Draft" || c.status === "Rejected";
    const hasSigned = !!c.signed_pdf_url;
    const isDistrictClaim = (c.body_id || "").startsWith("DIST-");
    const submitTargetLabel = isDistrictClaim ? "Division" : "MPCA";
    return (
        <div className="py-3" data-testid={`claims-row-${c.id}`}>
            <div className="grid grid-cols-12 items-center gap-3 text-xs">
                <div className="col-span-3 min-w-0">
                    <div className="font-mono text-[10px] text-mpca-charcoal/70 truncate">
                        {c.claim_ref}
                        {c.is_master && <span className="ml-2 text-[9px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood px-1.5 py-0.5">Master</span>}
                        {c.parent_claim_id && <span className="ml-2 text-[9px] font-semibold uppercase tracking-widest text-mpca-brass border border-mpca-brass/50 px-1 py-0.5">Rolled up</span>}
                    </div>
                    <div className="font-serif text-sm text-mpca-green-dark truncate mt-0.5 font-semibold">
                        {c.body_name || c.body_id}
                    </div>
                    {c.is_master && (c.child_claim_ids || []).length > 0 && (
                        <div className="text-[10px] text-mpca-charcoal/70 mt-0.5">
                            + {c.child_claim_ids.length} District claim{c.child_claim_ids.length === 1 ? "" : "s"} inside
                        </div>
                    )}
                </div>
                <div className="col-span-3">
                    <StatusPill status={c.status === "Approved" ? "Approved" : c.status === "Rejected" ? "Rejected" : c.status === "Under_Review" ? "Submitted" : c.status === "Submitted" ? "Submitted" : "Draft"} />
                    <div className="text-[10px] text-mpca-charcoal/80 mt-1">
                        {(c.status || "").replace(/_/g, " ")}
                        {c.route_to_body_id && c.status === "Submitted" && ` · reviewer ${c.route_to_body_id}`}
                    </div>
                </div>
                <div className="col-span-3 text-right font-mono">
                    <div className="text-sm text-mpca-oxblood font-semibold">{fmt(c.summary?.eligible_total_inr || c.summary?.invoiced_total_inr || 0)}</div>
                    {c.approved_amount_inr > 0 && (
                        <div className="text-[10px] text-mpca-green-dark font-semibold">Approved {fmt(c.approved_amount_inr)}</div>
                    )}
                </div>
                <div className="col-span-3 text-right flex justify-end gap-1.5 flex-wrap">
                    {!isMPCA && (isDraft || c.status === "Submitted") && (
                        <a
                            href={`/reimbursement-claims/${c.id}/division-form`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-semibold uppercase tracking-widest text-mpca-navy hover:text-mpca-parchment hover:bg-mpca-navy px-2.5 py-1.5 border-2 border-mpca-navy transition-colors"
                            data-testid={`claims-division-pdf-${c.id}`}
                            title="Open on Division letterhead for signing"
                        >
                            Print PDF
                        </a>
                    )}
                    <button onClick={onOpen}
                        className="text-[10px] font-semibold uppercase tracking-widest text-mpca-oxblood hover:text-mpca-parchment hover:bg-mpca-oxblood px-2.5 py-1.5 border-2 border-mpca-oxblood transition-colors"
                        data-testid={`claims-open-${c.id}`}>
                        Open detail
                    </button>
                </div>
            </div>

            {/* Inline draft-workflow strip — only when the claim is in Draft/Rejected and viewer is the owning body */}
            {!isMPCA && isDraft && (
                <div className="mt-3 border-2 border-mpca-brass/30 bg-mpca-parchment/40 p-3 flex items-center gap-3 flex-wrap" data-testid={`claim-draft-strip-${c.id}`}>
                    <div className="text-[11px] text-mpca-charcoal/85 flex-1 min-w-[200px]">
                        {hasSigned
                            ? <>Signed PDF uploaded on {new Date(c.signed_pdf_uploaded_at || Date.now()).toLocaleDateString("en-IN")} — ready to submit to <strong className="text-mpca-oxblood">{submitTargetLabel}</strong>.</>
                            : <>Click <strong>Print PDF</strong> above to open the letter on {c.body_name || c.body_id} letterhead, get it signed by Secretary + Treasurer, then upload below.</>}
                    </div>
                    {hasSigned && c.signed_pdf_url && (
                        <a href={c.signed_pdf_url} target="_blank" rel="noreferrer"
                            className="text-[10px] font-semibold uppercase tracking-widest text-mpca-green-dark hover:underline">
                            View signed PDF
                        </a>
                    )}
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-green-dark hover:bg-mpca-green-dark/90 px-2.5 py-1.5 cursor-pointer">
                        {hasSigned ? "Replace signed PDF" : "Upload signed PDF"}
                        <input
                            type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                            disabled={busy}
                            onChange={(e) => onUploadSigned(e.target.files?.[0])}
                            data-testid={`claims-upload-signed-${c.id}`}
                        />
                    </label>
                    <button
                        onClick={onSubmit}
                        disabled={busy || !hasSigned}
                        className="text-[10px] font-semibold uppercase tracking-widest text-mpca-parchment bg-mpca-oxblood hover:bg-mpca-oxblood/90 px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                        title={hasSigned ? `Submit to ${submitTargetLabel}` : "Upload signed PDF first"}
                        data-testid={`claims-submit-${c.id}`}
                    >
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        Submit to {submitTargetLabel}
                    </button>
                </div>
            )}

            {/* Head-wise summary (Sanctioned/Spent/Eligible) — always visible when it's been computed */}
            {(c.summary?.heads || []).length > 0 && (
                <div className="mt-3 border border-mpca-brass/30 bg-mpca-ivory" data-testid={`claim-heads-${c.id}`}>
                    <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-mpca-brass/10 border-b border-mpca-brass/25">
                        <div className="col-span-5 overline text-[9px] font-semibold text-mpca-green-dark">Head</div>
                        <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Sanctioned</div>
                        <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Spent</div>
                        <div className="col-span-2 text-right overline text-[9px] font-semibold text-mpca-green-dark">Eligible</div>
                        <div className="col-span-1 text-right overline text-[9px] font-semibold text-mpca-green-dark">Over</div>
                    </div>
                    {(c.summary.heads || []).map((h) => {
                        const isExtra = (h.head || "").startsWith("Extra ");
                        return (
                            <div key={h.head} className={`grid grid-cols-12 gap-2 px-3 py-1 text-[11px] border-b border-mpca-brass/15 last:border-b-0 ${isExtra ? "bg-mpca-oxblood/8" : ""}`}>
                                <div className={`col-span-5 ${isExtra ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal"}`}>
                                    {h.head}
                                    {isExtra && <span className="ml-2 text-[8px] font-semibold uppercase tracking-wider text-mpca-parchment bg-mpca-oxblood px-1 py-0.5">Extra</span>}
                                    {h.unmatched && <span className="ml-2 text-[8px] font-semibold uppercase tracking-wider text-mpca-brass border border-mpca-brass/50 px-1 py-0.5">Unmatched</span>}
                                </div>
                                <div className="col-span-2 text-right font-mono">{fmt(h.limit_inr)}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-navy">{fmt(h.spent_inr)}</div>
                                <div className="col-span-2 text-right font-mono text-mpca-green-dark font-semibold">{fmt(h.eligible_inr)}</div>
                                <div className={`col-span-1 text-right font-mono ${h.over_inr > 0 ? "text-mpca-oxblood font-bold" : "text-mpca-charcoal/40"}`}>
                                    {h.over_inr > 0 ? fmt(h.over_inr) : "—"}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
