import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileText } from "lucide-react";
import { api, API_BASE } from "@/lib/api";

/**
 * TournamentSchemeBadge · Feb 2026
 * ─────────────────────────────────
 * Compact pill that shows the active cricketing season + governing scheme
 * code(s) + a live link to the season's SIGNED master PDF.
 *
 * • Shows one pill for single-scheme tournaments (Inter-School, camp, BCCI).
 * • Shows two pills for two-scheme tournaments (Inter-Div: 2-D + 2-C,
 *   Inter-District: 2-B + 2-C) so hosts and visiting bodies both see the
 *   rate card driving their budget.
 * • The "View signed master →" link is a DYNAMIC lookup of
 *   /schemes/season-activation?fiscal_cycle=… — after any mid-year revision
 *   + re-upload cycle, tournaments auto-pick up the LATEST signed PDF with
 *   no per-tournament stamping needed.
 */
const TournamentSchemeBadge = ({ tournament }) => {
    const [activation, setActivation] = useState(null);
    const fc = tournament?.fiscal_cycle;

    useEffect(() => {
        if (!fc) return;
        let alive = true;
        api.get("/schemes/season-activation", {
            params: { fiscal_cycle: fc },
            headers: { "X-Season-Optout": "1" }, // don't double-inject the season param
        })
            .then(({ data }) => { if (alive) setActivation(data); })
            .catch(() => { /* silent — no signed PDF yet */ });
        return () => { alive = false; };
    }, [fc]);

    if (!tournament) return null;

    const hostCode = tournament.host_scheme_code || tournament.scheme_code;
    const visitCode = tournament.visiting_scheme_code;
    const twoSchemes = visitCode && visitCode !== hostCode;
    const signedUrl = activation?.is_active && activation?.signed_pdf_url
        ? `${API_BASE.replace(/\/api$/, "")}${activation.signed_pdf_url}`
        : null;

    return (
        <div className="flex flex-wrap items-center gap-2 mt-1" data-testid="tournament-scheme-badge">
            {fc && (
                <span
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest bg-mpca-navy/10 text-mpca-navy px-2 py-0.5 rounded"
                    title="Cricketing season · rate card lock-in"
                    data-testid="scheme-badge-season"
                >
                    Season · {fc}
                </span>
            )}
            {hostCode && (
                <Link
                    to={`/schemes?scheme=${hostCode}`}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest bg-mpca-green-dark/10 text-mpca-green-dark px-2 py-0.5 rounded hover:bg-mpca-green-dark/20"
                    title="Governing scheme for the HOST body's budget"
                    data-testid="scheme-badge-host"
                >
                    {twoSchemes ? "Host · " : "Scheme · "}{hostCode}
                    <ExternalLink size={10} />
                </Link>
            )}
            {twoSchemes && (
                <Link
                    to={`/schemes?scheme=${visitCode}`}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest bg-mpca-oxblood/10 text-mpca-oxblood px-2 py-0.5 rounded hover:bg-mpca-oxblood/20"
                    title="Governing scheme for VISITING bodies' claims"
                    data-testid="scheme-badge-visitor"
                >
                    Visitor · {visitCode}
                    <ExternalLink size={10} />
                </Link>
            )}
            {signedUrl && (
                <a
                    href={signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-mpca-brass hover:text-mpca-oxblood underline underline-offset-2"
                    title={`Signed master PDF for ${fc}${activation?.signed_by ? ` · ${activation.signed_by}` : ""}`}
                    data-testid="scheme-badge-signed-pdf"
                >
                    <FileText size={11} />
                    View {fc} Signed Master
                </a>
            )}
            {!signedUrl && fc && activation && !activation.is_active && (
                <span
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-mpca-oxblood"
                    title="Schemes not yet activated for this season — MPCA must upload the signed master PDF"
                    data-testid="scheme-badge-not-activated"
                >
                    <FileText size={11} />
                    Signed master pending
                </span>
            )}
        </div>
    );
};

export default TournamentSchemeBadge;
