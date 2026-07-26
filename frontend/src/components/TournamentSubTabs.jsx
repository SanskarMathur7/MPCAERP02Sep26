import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Info, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * Sticky tab strip rendered at the top of every /tournaments/:id/* screen.
 *
 * M31 · Trimmed to Overview + Squad Selection only. Every other workflow
 * (Budget & Finance, Reimbursement, Match Officials, Camps) is reachable
 * from the setup-box grid on the Overview screen — a duplicate tab strip
 * bloated the UI and confused users about what was "top-level".
 */
const TABS = [
    { key: "overview", to: (id) => `/tournaments/${id}`, label: "Overview", icon: Info },
    { key: "squad", to: (id, meta) => meta.squad_url || `/tournaments/${id}/selection`, label: "Squad Selection", icon: Users },
];

const TournamentSubTabs = ({ tournamentId, active }) => {
    const location = useLocation();
    const { persona } = useAuth();
    const [meta, setMeta] = useState({ squad_url: null });

    useEffect(() => {
        if (!tournamentId) return;
        (async () => {
            try {
                let squadUrl = null;
                if (persona?.body_type === "Division" || persona?.body_type === "District") {
                    const squads = await api.get(`/tournaments/${tournamentId}/squads`).then((r) => r.data).catch(() => []);
                    const mine = (squads || []).find((s) => s.body_id === persona.body_code);
                    squadUrl = mine ? `/squads/${mine.id}` : `/tournaments/${tournamentId}/squads/new?body=${persona.body_code}`;
                }
                setMeta({ squad_url: squadUrl });
            } catch (_) { /* non-fatal */ }
        })();
    }, [tournamentId, persona?.body_code, persona?.body_type]);

    // Auto-detect active tab from location if not passed explicitly
    const path = location.pathname;
    const resolvedActive = active || (() => {
        if (/\/selection$/.test(path)) return "squad";
        if (/^\/squads\//.test(path)) return "squad";
        if (/\/squads\/new/.test(path)) return "squad";
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
