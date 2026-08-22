/**
 * MPCA-257 · Grant Claim Summary (PDF-ready view)
 * ────────────────────────────────────────────────
 * Same visual language as TournamentSchedulePDF and TournamentClosurePDF —
 * MPCA ERP branding, serif title, monospace meta line, numbered black-and-
 * white sections, and a "Print / Save as PDF" toolbar. Replaces the legacy
 * reportlab-generated grant summary PDF so every artefact (schedule ·
 * closure · grant summary) shares one consistent format.
 *
 * Route: /grant-claims/:id/summary?variant=submission|approval
 * Data pulled: /grant-claims/:id (claim), /bodies (body-name lookup),
 * /reimbursement-schemes (scheme label).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Printer, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const fmtDate = (s) => (s ? new Date(String(s).length > 10 ? s : s + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const INR = (n) => `\u20B9${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

export default function GrantClaimSummaryPDF() {
    const { id } = useParams();
    const [sp] = useSearchParams();
    const variant = sp.get("variant") || "submission";     // "submission" | "approval"
    const [claim, setClaim]     = useState(null);
    const [bodiesMap, setBM]    = useState({});
    const [schemesMap, setSM]   = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [cRes, bRes, sRes] = await Promise.all([
                    api.get(`/grant-claims/${id}`),
                    api.get("/bodies").catch(() => ({ data: [] })),
                    api.get("/reimbursement-schemes").catch(() => ({ data: [] })),
                ]);
                setClaim(cRes.data);
                const bm = {}; (bRes.data || []).forEach((b) => { bm[b.code] = b.name; });
                setBM(bm);
                const sm = {}; (sRes.data || []).forEach((s) => { sm[s.code] = s.name || s.title; });
                setSM(sm);
            } finally { setLoading(false); }
        })();
    }, [id]);

    const docs = useMemo(() => (claim?.documents || []), [claim]);
    const extraDocs = useMemo(() => (claim?.extra_documents || []), [claim]);

    if (loading || !claim) {
        return <div className="flex items-center justify-center h-64 text-mpca-brass"><Loader2 className="animate-spin" size={16} /> Loading grant summary…</div>;
    }

    const isApproval  = variant === "approval";
    const heading     = isApproval ? "Grant Approval Summary" : "Grant Submission Summary";
    const bodyName    = bodiesMap[claim.body_id]  || claim.body_id;
    const schemeName  = schemesMap[claim.scheme_code] || claim.scheme_code;

    return (
        <div className="max-w-[900px] mx-auto p-8 bg-white text-black font-serif print:p-4" data-testid="grant-claim-pdf">
            <div className="print:hidden mb-4 flex items-center justify-between border-b-2 border-black pb-2">
                <div className="text-sm">
                    <span className="uppercase tracking-widest text-[10px] text-gray-500">MPCA ERP · {heading}</span>
                </div>
                <button onClick={() => window.print()} data-testid="grant-print-btn"
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest bg-black text-white px-3 py-1.5 hover:bg-gray-800">
                    <Printer size={12} /> Print / Save as PDF
                </button>
            </div>

            <div className="text-center mb-4 border-b border-black pb-3">
                <div className="text-[9px] uppercase tracking-[0.3em] mb-1">Madhya Pradesh Cricket Association · Since 1957</div>
                <div className="text-[10px] uppercase tracking-[0.25em] mb-2 text-gray-700">{heading}</div>
                <h1 className="text-3xl font-bold" data-testid="grant-title">Scheme {claim.scheme_code} · {schemeName}</h1>
                <div className="text-[11px] mt-1 flex gap-3 justify-center flex-wrap">
                    <span>Claim No. <b>{claim.claim_ref}</b></span>
                    <span>·</span>
                    <span>Cycle <b>{claim.fiscal_cycle}</b></span>
                    <span>·</span>
                    <span>Status <b>{claim.status}</b></span>
                </div>
                <div className="text-[11px] mt-1">
                    <b>{bodyName}</b> <span className="text-gray-600">({claim.body_id})</span>
                </div>
            </div>

            {/* 1. Claim Details */}
            <h3 className="text-lg border-b border-black mb-2 mt-6">1. Claim Details</h3>
            <table className="w-full text-[11px] border-collapse mb-4" data-testid="grant-details-table">
                <tbody>
                    <tr className="border-b border-gray-300"><td className="py-1 pr-2 w-1/3">Scheme</td><td className="py-1 pr-2"><b>{claim.scheme_code}</b> · {schemeName}</td></tr>
                    <tr className="border-b border-gray-300"><td className="py-1 pr-2">Fiscal Cycle</td><td className="py-1 pr-2">{claim.fiscal_cycle}</td></tr>
                    <tr className="border-b border-gray-300"><td className="py-1 pr-2">Claiming Body</td><td className="py-1 pr-2"><b>{bodyName}</b> · {claim.body_id}</td></tr>
                    <tr className="border-b border-gray-300"><td className="py-1 pr-2">Claim Amount</td><td className="py-1 pr-2 font-mono"><b>{INR(claim.claimed_amount_inr)}</b></td></tr>
                    {claim.approved_amount_inr != null && <tr className="border-b border-gray-300"><td className="py-1 pr-2">Approved Amount</td><td className="py-1 pr-2 font-mono"><b>{INR(claim.approved_amount_inr)}</b></td></tr>}
                    <tr className="border-b border-gray-300"><td className="py-1 pr-2">Submitted</td><td className="py-1 pr-2">{fmtDate(claim.submitted_at)} {claim.submitted_by && `· by ${claim.submitted_by}`}</td></tr>
                    {claim.approved_at && <tr className="border-b border-gray-300"><td className="py-1 pr-2">Approved</td><td className="py-1 pr-2">{fmtDate(claim.approved_at)} {claim.approved_by && `· by ${claim.approved_by}`}</td></tr>}
                </tbody>
            </table>

            {/* 2. Purpose */}
            {claim.purpose_of_claim && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-6">2. Purpose of Claim</h3>
                    <p className="text-[11px] leading-relaxed mb-4 whitespace-pre-wrap">{claim.purpose_of_claim}</p>
                </>
            )}

            {/* 3. Supporting Documents */}
            {docs.length > 0 && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-6">3. Supporting Documents &middot; {docs.length}</h3>
                    <table className="w-full text-[11px] border-collapse mb-4" data-testid="grant-docs-table">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="text-left py-1 pr-2 w-6">#</th>
                                <th className="text-left py-1 pr-2">Required Document</th>
                                <th className="text-left py-1 pr-2">Filename</th>
                                <th className="text-left py-1 pr-2 w-20">Signed</th>
                                <th className="text-left py-1 pr-2 w-24">AI Verified</th>
                                <th className="text-right py-1 pr-2 w-14">Conf%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {docs.map((d, i) => {
                                // Iter 123m · "Signed" column tells MPCA whether the AI
                                // detected a signature and/or an official stamp on the doc.
                                // sig = any signature; stamp = any seal.
                                const sig = d.signature_detected;
                                const stamp = d.stamp_detected;
                                let signedCell = "—";
                                if (sig && stamp) signedCell = "Signed + Stamped";
                                else if (sig) signedCell = "Signed";
                                else if (stamp) signedCell = "Stamped only";
                                else if (d.ai_verified === true && sig === undefined) signedCell = "n/a";
                                else if (sig === false && stamp === false) signedCell = "Not signed";
                                return (
                                    <tr key={d.id || i} className="border-b border-gray-300">
                                        <td className="py-1 pr-2">{i + 1}</td>
                                        <td className="py-1 pr-2"><b>{d.required_label || d.label || d.doc_key || "—"}</b></td>
                                        <td className="py-1 pr-2 text-gray-700">{d.filename || "—"}</td>
                                        <td className="py-1 pr-2 text-[10.5px]">
                                            {signedCell}
                                            {d.signed_by && <div className="text-[9px] text-gray-500 italic mt-0.5">by {d.signed_by}</div>}
                                        </td>
                                        <td className="py-1 pr-2">{d.ai_verified ? "Yes" : "—"}</td>
                                        <td className="py-1 pr-2 text-right font-mono">{d.ai_confidence != null ? `${Math.round(Number(d.ai_confidence) * 100)}%` : "—"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}

            {/* Iter 123h · Section 4 (AI Cross-Document Verification) removed — the
                AI verdict is already visible per-row in the "AI Verified / Conf%"
                columns in section 3, and users found the standalone AI section
                added no additional signal to the printed submission packet. */}

            {/* Iter 125 · Optional Supporting Documents — Division-attached
                Quotations / MOUs / additional evidence beyond the scheme's
                required docs. Mirrors the required-docs table columns so MPCA
                sees the AI verdict on ALL uploaded evidence in one printout. */}
            {extraDocs.length > 0 && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-6">3b. Optional Supporting Documents &middot; {extraDocs.length}</h3>
                    <table className="w-full text-[11px] border-collapse mb-4" data-testid="grant-extra-docs-table">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="text-left py-1 pr-2 w-6">#</th>
                                <th className="text-left py-1 pr-2">Description</th>
                                <th className="text-left py-1 pr-2">Filename</th>
                                <th className="text-left py-1 pr-2 w-20">Signed</th>
                                <th className="text-left py-1 pr-2 w-24">AI Verified</th>
                                <th className="text-right py-1 pr-2 w-14">Conf%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {extraDocs.map((d, i) => {
                                const sig = d.signature_detected;
                                const stamp = d.stamp_detected;
                                let signedCell = "—";
                                if (sig && stamp) signedCell = "Signed + Stamped";
                                else if (sig) signedCell = "Signed";
                                else if (stamp) signedCell = "Stamped only";
                                else if (d.ai_verified === true && sig === undefined) signedCell = "n/a";
                                else if (sig === false && stamp === false) signedCell = "Not signed";
                                return (
                                    <tr key={d.doc_id || i} className="border-b border-gray-300">
                                        <td className="py-1 pr-2">{i + 1}</td>
                                        <td className="py-1 pr-2"><b>{d.description || "—"}</b></td>
                                        <td className="py-1 pr-2 text-gray-700">{d.filename || "—"}</td>
                                        <td className="py-1 pr-2 text-[10.5px] whitespace-nowrap">
                                            {signedCell}
                                            {d.signed_by && <div className="text-[9px] text-gray-500 italic mt-0.5 whitespace-normal">by {d.signed_by}</div>}
                                        </td>
                                        <td className="py-1 pr-2">{d.ai_verified === true ? "Yes" : d.ai_verified === false ? "No" : "—"}</td>
                                        <td className="py-1 pr-2 text-right font-mono">{d.ai_confidence != null ? `${Math.round(Number(d.ai_confidence) * 100)}%` : "—"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}

            {/* 4. Approval / Rejection (approval variant only) */}
            {isApproval && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-6">4. MPCA Decision</h3>
                    <p className="text-[11px] leading-relaxed mb-4">
                        This claim is approved for <b>{INR(claim.approved_amount_inr ?? claim.claimed_amount_inr)}</b> against scheme <b>{claim.scheme_code}</b> ({schemeName}) for fiscal cycle <b>{claim.fiscal_cycle}</b>.
                        {claim.approval_notes && <> <br /><br />{claim.approval_notes}</>}
                    </p>
                </>
            )}

            {/* Signature block */}
            <div className="mt-10 grid grid-cols-2 gap-8 text-[11px]">
                {isApproval ? (
                    <>
                        <div>
                            <div className="border-t border-black pt-1"><b>Hon. Secretary, MPCA</b></div>
                            <div className="text-[10px] text-gray-600 mt-0.5">Date: __________________</div>
                        </div>
                        <div>
                            <div className="border-t border-black pt-1"><b>Hon. Treasurer, MPCA</b></div>
                            <div className="text-[10px] text-gray-600 mt-0.5">Date: __________________</div>
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <div className="border-t border-black pt-1"><b>Division / District Secretary</b></div>
                            <div className="text-[10px] text-gray-600 mt-0.5">{bodyName} · Date: __________________</div>
                        </div>
                        <div>
                            <div className="border-t border-black pt-1"><b>Division / District Treasurer</b></div>
                            <div className="text-[10px] text-gray-600 mt-0.5">Date: __________________</div>
                        </div>
                    </>
                )}
            </div>

            <div className="mt-6 pt-3 border-t border-black text-[9px] uppercase tracking-widest flex justify-between text-gray-600">
                <span>MPCA ERP · {heading} · {claim.claim_ref}</span>
                <span>Generated {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>

            <style>{`@media print { @page { size: A4; margin: 12mm 10mm; } h3 { break-after: avoid; } table { break-inside: avoid; } }`}</style>
        </div>
    );
}
