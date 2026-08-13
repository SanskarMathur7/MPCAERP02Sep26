import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";

/**
 * M37 · Squad Nomination Form (printable)
 * ────────────────────────────────────────
 * Division/District downloads this page → hits Ctrl+P → saves as PDF → gets
 * it signed by Division office bearers → scans & re-uploads via the
 * `Upload Signed Copy` button in the squad workflow strip.
 */
const SquadNominationForm = () => {
    const { id } = useParams();
    const [squad, setSquad] = useState(null);
    const [tournament, setTournament] = useState(null);
    const [players, setPlayers] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data: sq } = await api.get(`/squads/${id}`);
                setSquad(sq);
                const { data: t } = await api.get(`/tournaments/${sq.tournament_id}`);
                setTournament(t);
                // Fetch player details for members (parallel individual fetches — small squad ≤ 25)
                const ids = (sq.members || []).map((m) => m.player_id).filter(Boolean);
                if (ids.length) {
                    const results = await Promise.all(
                        ids.map((pid) => api.get(`/players/${pid}`).then((r) => r.data).catch(() => null)),
                    );
                    setPlayers(Object.fromEntries(results.filter(Boolean).map((p) => [p.id, p])));
                }
            } finally { setLoading(false); }
        })();
    }, [id]);

    if (loading) return <CricketLoader label="Preparing nomination form…" />;
    if (!squad || !tournament) return <div className="p-16 text-center">Squad not found</div>;

    const members = squad.members || [];
    const captain = members.find((m) => m.is_captain);
    const off = squad.match_officials || {};

    return (
        <div className="min-h-screen bg-white text-black px-8 md:px-16 py-10 max-w-4xl mx-auto print:px-0 print:py-4" data-testid="squad-nomination-form">
            <div className="flex items-center justify-between print:hidden mb-6">
                <div className="text-[11px] text-gray-500">Preview · Ctrl+P → Save as PDF → Sign → Upload back to MPCA ERP</div>
                <button onClick={() => window.print()} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-white px-4 py-2 flex items-center gap-1" data-testid="nomination-print-btn">
                    <Printer size={12} /> Print / Save as PDF
                </button>
            </div>

            {/* Header · MPCA official letterhead */}
            <div className="text-center border-b-4 border-double border-black pb-4 mb-6">
                <div className="flex items-center justify-center gap-4 mb-2">
                    <img src="/assets/mpca-logo.png" alt="Madhya Pradesh Cricket Association"
                         className="w-20 h-24 object-contain" />
                    <div>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Madhya Pradesh</h1>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Cricket Association</h1>
                        <div className="text-[10px] italic mt-1">(Affiliated to the Board of Control for Cricket in India)</div>
                        <div className="text-[9px] uppercase tracking-widest mt-0.5">Holkar Stadium, Race Course Road, Indore — 452001 · Madhya Pradesh</div>
                    </div>
                </div>
                <div className="text-[9px] uppercase tracking-widest mt-3">Form FMPCA · SQ-01</div>
                <div className="font-serif text-lg mt-1 border-t border-b border-black py-1 uppercase tracking-widest">Squad Nomination Form</div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] mb-6">
                <Field label="Tournament" value={tournament.name} />
                <Field label="Tournament No." value={tournament.tournament_no} />
                <Field label="Fiscal Cycle" value={tournament.fiscal_cycle} />
                <Field label="Category / Age Group" value={`${tournament.setup_meta?.category || "—"} · ${tournament.setup_meta?.age_group || "—"}`} />
                <Field label="Format" value={tournament.format} />
                <Field label="Nominating Body" value={squad.body_id} />
                <Field label="Team Name" value={squad.team_name} />
                <Field label="Captain" value={captain ? captain.full_name : "—"} />
            </div>

            {/* Players */}
            <h3 className="font-serif text-lg border-b border-black mb-2">Squad of {members.length} Players</h3>
            <table className="w-full text-[11px] border-collapse mb-6">
                <thead>
                    <tr className="border-y border-black">
                        <th className="text-left py-1 px-2 w-8">#</th>
                        <th className="text-left py-1 px-2">Player Name</th>
                        <th className="text-left py-1 px-2">MPCA ID</th>
                        <th className="text-left py-1 px-2">Role</th>
                        <th className="text-left py-1 px-2">DoB</th>
                        <th className="text-left py-1 px-2">Jersey</th>
                        <th className="text-left py-1 px-2 w-32">Signature</th>
                    </tr>
                </thead>
                <tbody>
                    {members.map((m, i) => {
                        const p = players[m.player_id] || {};
                        return (
                            <tr key={m.player_id} className="border-b border-gray-300">
                                <td className="py-1.5 px-2 align-top">{i + 1}</td>
                                <td className="py-1.5 px-2 align-top">
                                    {m.full_name || p.full_name}
                                    {m.is_captain && <span className="ml-2 text-[9px] uppercase tracking-widest">(Captain)</span>}
                                    {m.is_keeper && !m.is_captain && <span className="ml-2 text-[9px] uppercase tracking-widest">(WK)</span>}
                                </td>
                                <td className="py-1.5 px-2 align-top font-mono">{p.player_id || m.mpca_id || "—"}</td>
                                <td className="py-1.5 px-2 align-top">{(m.role || p.role || "").replace(/_/g, " ")}</td>
                                <td className="py-1.5 px-2 align-top font-mono">{p.date_of_birth || m.date_of_birth || "—"}</td>
                                <td className="py-1.5 px-2 align-top">{m.jersey_no || "—"}</td>
                                <td className="py-1.5 px-2 align-top">&nbsp;</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* MPCA-106 · Only Team Manager / Head Coach / Trainer / Physio.
                Umpires, scorer and match referee are assigned centrally by
                MPCA (Match Officials module) — not printed on the Division
                nomination form. */}
            <h3 className="font-serif text-lg border-b border-black mb-2">Team Officials</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] mb-6">
                <OffLine label="Team Manager" value={off.manager} />
                <OffLine label="Head Coach" value={off.coach} />
                <OffLine label="Trainer" value={off.trainer} />
                <OffLine label="Physio" value={off.physio} />
            </div>

            {/* Declaration */}
            <div className="border border-black p-3 text-[11px] mb-8">
                <b>DECLARATION —</b> We hereby declare that the above-named players are eligible to represent <b>{squad.body_id}</b> in the said tournament and have been selected as per the MPCA selection guidelines. All players have valid MPCA registrations and requisite documentation on record. Any subsequent replacement will be intimated to MPCA in writing.
            </div>

            {/* Signatures — MPCA-107 · President removed from Division-side
                squad approvals. Only Selection Committee Chairman + Hon.
                Secretary sign off the nomination. */}
            <div className="grid grid-cols-2 gap-6 mt-16">
                <SigBlock title="Selection Committee Chairman" />
                <SigBlock title="Hon. Secretary" body={squad.body_id} />
            </div>

            <div className="mt-16 text-center text-[9px] uppercase tracking-widest text-gray-500 print:hidden">
                MPCA ERP · Generated {new Date().toLocaleString("en-IN")} · This is a preview — sign the printed copy and upload back
            </div>
        </div>
    );
};

const Field = ({ label, value }) => (
    <div className="border-b border-dotted border-gray-500 py-1">
        <span className="text-[9px] uppercase tracking-widest text-gray-600">{label}</span>
        <div className="font-serif">{value || "—"}</div>
    </div>
);
const OffLine = ({ label, value }) => (
    <div className="flex items-baseline gap-2 border-b border-dotted border-gray-500 py-1">
        <span className="text-[9px] uppercase tracking-widest text-gray-600 w-24 shrink-0">{label}</span>
        <span className="font-serif">{value || "—"}</span>
    </div>
);
const SigBlock = ({ title, body }) => (
    <div className="text-center">
        <div className="border-t border-black pt-1 text-[10px] uppercase tracking-widest">{title}</div>
        {body && <div className="text-[9px] text-gray-600 mt-0.5">{body}</div>}
    </div>
);

export default SquadNominationForm;
