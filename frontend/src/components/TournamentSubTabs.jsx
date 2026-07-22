import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Info, Users, Wallet, Receipt, ShieldCheck, Calendar as CalendarIcon } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Sticky tab strip rendered at the top of every /tournaments/:id/* screen.
 * Provides one-click access to every tournament sub-workflow (Overview,
 * Squad, Budget & Finance, Reimbursement Claim, Match Officials, Camps).
 *
 * Extra metadata (claim id, camps count) is fetched lazily so the strip
 * can deep-link straight to the record instead of a filtered list.
 */
const TABS = [
    { key: "overview", to: (id) => `/tournaments/${id}`, label: "Overview", icon: Info },
    { key: "squad", to: (id) => `/tournaments/${id}/selection`, label: "Squad Selection", icon: Users },
    { key: "finance", to: (id) => `/tournaments/${id}/finance`, label: "Budget & Finance", icon: Wallet },
    { key: "claim", to: (id, meta) => (meta.claim_id ? `/reimbursement-claims/${meta.claim_id}` : `/tournaments/${id}/finance`), label: "Reimbursement", icon: Receipt },
    { key: "officials", to: (id) => `/tournaments/${id}/finance?tab=officials`, label: "Match Officials", icon: ShieldCheck },
    { key: "camps", to: () => `/camps`, label: "Camps", icon: CalendarIcon },
];

const TournamentSubTabs = ({ tournamentId, active }) => {
    const location = useLocation();
    const [meta, setMeta] = useState({ claim_id: null });

    useEffect(() => {
        if (!tournamentId) return;
        (async () => {
            try {
                const claims = await api
                    .get("/reimbursement-claims", { params: { tournament_id: tournamentId } })
                    .then((r) => r.data)
                    .catch(() => []);
                if (Array.isArray(claims) && claims.length > 0) {
                    setMeta({ claim_id: claims[0].id });
                }
            } catch (_) { /* non-fatal */ }
        })();
    }, [tournamentId]);

    // Auto-detect active tab from location if not passed explicitly
    const path = location.pathname;
    const search = location.search || "";
    const resolvedActive = active || (() => {
        if (/\/selection$/.test(path)) return "squad";
        if (/\/finance/.test(path) && /tab=officials/.test(search)) return "officials";
        if (/\/finance/.test(path)) return "finance";
        if (/^\/reimbursement-claims\//.test(path)) return "claim";
        if (/^\/camps/.test(path)) return "camps";
        return "overview";
    })();

    return (
        <div className="sticky top-0 z-30 bg-mpca-ivory/95 backdrop-blur border-b border-mpca-brass/30 -mx-8 md:-mx-12 px-8 md:px-12 mb-6" data-testid="tournament-subtabs">
            <div className="flex items-center gap-1 overflow-x-auto max-w-7xl mx-auto py-2">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const to = tab.to(tournamentId, meta);
                    const isActive = tab.key === resolvedActive;
                    return (
                        <Link
                            key={tab.key}
                            to={to}
                            className={`flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold border-b-2 whitespace-nowrap transition-colors ${isActive ? "border-mpca-oxblood text-mpca-oxblood" : "border-transparent text-mpca-green-dark hover:text-mpca-oxblood hover:border-mpca-brass/40"}`}
                            data-testid={`tournament-subtab-${tab.key}`}
                        >
                            <Icon size={13} strokeWidth={1.5} /> {tab.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default TournamentSubTabs;
