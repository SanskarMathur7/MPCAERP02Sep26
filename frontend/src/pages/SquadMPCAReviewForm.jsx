import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";

/**
 * MPCA-127 + MPCA-142 · MPCA Review Print
 * ────────────────────────────────────────
 * Printable letterhead PDF that lists every nominated player with the MPCA
 * reviewer's per-player Approved / Rejected decision + reason. MPCA officers
 * sign this before finalising the whole squad; the signed copy is handed
 * back to the Division as the official approval record.
 */
const SquadMPCAReviewForm = () => {
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
                const ids = (sq.members || []).concat(sq.dropped_members || []).map((m) => m.player_id).filter(Boolean);
                if (ids.length) {
                    const results = await Promise.all(
                        ids.map((pid) => api.get(`/players/${pid}`).then((r) => r.data).catch(() => null)),
                    );
                    setPlayers(Object.fromEntries(results.filter(Boolean).map((p) => [p.id, p])));
                }
            } finally { setLoading(false); }
        })();
    }, [id]);

    if (loading) return <CricketLoader label="Preparing MPCA review sheet…" />;
    if (!squad || !tournament) return <div className="p-16 text-center">Squad not found</div>;

    // Merge live roster + archived-rejected list; annotate each with the MPCA
    // decision. If the squad has already been Approved, `dropped_members`
    // holds the rejected roster; pre-approval, everyone still lives in
    // `members` and their status comes from `member_decisions`.
    const decisionMap = Object.fromEntries((squad.member_decisions || []).map((d) => [d.player_id, d]));
    const rowsRaw = [
        ...(squad.members || []).map((m) => ({ m, archived: false })),
        ...(squad.dropped_members || []).map((m) => ({ m, archived: true })),
    ];
    const rows = rowsRaw.map(({ m, archived }) => {
        const dec = decisionMap[m.player_id];
        return {
            m,
            player: players[m.player_id] || {},
            decision: dec?.decision || (archived ? "Rejected" : "—"),
            reason: dec?.reason || "",
            decidedBy: dec?.decided_by || "",
            decidedAt: dec?.decided_at || "",
        };
    });
    const approvedCount = rows.filter((r) => r.decision === "Approved").length;
    const rejectedCount = rows.filter((r) => r.decision === "Rejected").length;
    const pendingCount = rows.filter((r) => r.decision === "—").length;

    return (
        <div className="min-h-screen bg-white text-black px-8 md:px-16 py-10 max-w-4xl mx-auto print:px-0 print:py-4" data-testid="squad-mpca-review-form">
            <div className="flex items-center justify-between print:hidden mb-6">
                <div className="text-[11px] text-gray-500">MPCA Review · Ctrl+P → Save as PDF → Sign → Upload back → Approve Whole List</div>
                <button onClick={() => window.print()} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-white px-4 py-2 flex items-center gap-1" data-testid="mpca-review-print-btn">
                    <Printer size={12} /> Print / Save as PDF
                </button>
            </div>

            {/* Letterhead */}
            <div className="text-center border-b-4 border-double border-black pb-4 mb-6">
                <div className="flex items-center justify-center gap-4 mb-2">
                    <div className="w-16 h-16 rounded-full border-2 border-black flex items-center justify-center text-[9px] text-center leading-tight font-serif">
                        MPCA<br/>EST<br/>1957
                    </div>
                    <div>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Madhya Pradesh</h1>
                        <h1 className="font-serif text-3xl uppercase tracking-widest">Cricket Association</h1>
                        <div className="text-[10px] italic mt-1">(Affiliated to the Board of Control for Cricket in India)</div>
                        <div className="text-[9px] uppercase tracking-widest mt-0.5">Holkar Stadium, Race Course Road, Indore — 452001 · Madhya Pradesh</div>
                    </div>
                </div>
                <div className="text-[9px] uppercase tracking-widest mt-3">Form FMPCA · SQ-02</div>
                <div className="font-serif text-lg mt-1 border-t border-b border-black py-1 uppercase tracking-widest">MPCA Squad Review · Per-Player Decisions</div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] mb-6">
                <Field label="Tournament" value={tournament.name} />
                <Field label="Tournament No." value={tournament.tournament_no} />
                <Field label="Fiscal Cycle" value={tournament.fiscal_cycle} />
                <Field label="Category / Age Group" value={`${tournament.setup_meta?.category || "—"} · ${tournament.setup_meta?.age_group || "—"}`} />
                <Field label="Nominating Body" value={squad.body_id} />
                <Field label="Team Name" value={squad.team_name} />
                <Field label="Nominated" value={String(rows.length)} />
                <Field label="Approved · Rejected · Pending" value={`${approvedCount} · ${rejectedCount} · ${pendingCount}`} />
            </div>

            {/* Players table with MPCA decisions */}
            <h3 className="font-serif text-lg border-b border-black mb-2">Player Review · {rows.length} Players</h3>
            <table className="w-full text-[10.5px] border-collapse mb-6">
                <thead>
                    <tr className="border-y border-black">
                        <th className="text-left py-1 px-2 w-6">#</th>
                        <th className="text-left py-1 px-2">Player</th>
                        <th className="text-left py-1 px-2 w-24">MPCA ID</th>
                        <th className="text-left py-1 px-2 w-20">Role</th>
                        <th className="text-left py-1 px-2 w-24">DoB</th>
                        <th className="text-left py-1 px-2 w-24">Decision</th>
                        <th className="text-left py-1 px-2">Reason / Note</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ m, player, decision, reason }, i) => (
                        <tr key={m.player_id + i} className={"border-b border-gray-300 " + (decision === "Rejected" ? "bg-gray-50" : "")}>
                            <td className="py-1.5 px-2 align-top">{i + 1}</td>
                            <td className="py-1.5 px-2 align-top">
                                {m.full_name || player.full_name}
                                {m.is_captain && <span className="ml-1 text-[9px] uppercase">(C)</span>}
                                {m.is_keeper && !m.is_captain && <span className="ml-1 text-[9px] uppercase">(WK)</span>}
                            </td>
                            <td className="py-1.5 px-2 align-top font-mono">{player.player_id || m.player_no || "—"}</td>
                            <td className="py-1.5 px-2 align-top">{(m.role || player.role || "").replace(/_/g, " ")}</td>
                            <td className="py-1.5 px-2 align-top font-mono">{player.date_of_birth || "—"}</td>
                            <td className={"py-1.5 px-2 align-top font-semibold " + (decision === "Approved" ? "text-green-700" : decision === "Rejected" ? "text-red-700" : "text-gray-500")}>
                                {decision === "Approved" ? "✓ APPROVED" : decision === "Rejected" ? "✗ REJECTED" : "PENDING"}
                            </td>
                            <td className="py-1.5 px-2 align-top text-[10px] italic">{reason || (decision === "—" ? "— not yet reviewed —" : "—")}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {squad.review_note && (
                <div className="border border-black p-3 text-[11px] mb-6">
                    <b>MPCA Reviewer&apos;s Overall Note:</b> {squad.review_note}
                </div>
            )}

            {/* Declaration */}
            <div className="border border-black p-3 text-[11px] mb-8">
                <b>MPCA DECISION —</b> The Selection Committee of the Madhya Pradesh Cricket Association has reviewed the players nominated by <b>{squad.body_id}</b> for <b>{tournament.name}</b>. Only players marked <b>APPROVED</b> above form the final squad. Rejected players remain on record with the stated reason.
            </div>

            {/* MPCA signature block */}
            <div className="grid grid-cols-3 gap-6 mt-16">
                <SigBlock title="Chairman · Selection Committee" body="MPCA" />
                <SigBlock title="Hon. Secretary" body="MPCA" />
                <SigBlock title="President" body="MPCA" />
            </div>

            <div className="mt-16 text-center text-[9px] uppercase tracking-widest text-gray-500 print:hidden">
                MPCA ERP · Generated {new Date().toLocaleString("en-IN")} · Print → Sign → Upload back to close the loop
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
const SigBlock = ({ title, body }) => (
    <div className="text-center">
        <div className="h-16" />
        <div className="border-t border-black pt-1 text-[10px] uppercase tracking-widest">{title}</div>
        {body && <div className="text-[9px] text-gray-600 mt-0.5">{body}</div>}
    </div>
);

export default SquadMPCAReviewForm;
