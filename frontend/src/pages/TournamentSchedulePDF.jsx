/**
 * MPCA-231 · Tournament Match Schedule (PDF-ready view)
 * ─────────────────────────────────────────────────────
 * A print-optimised, single-page tournament schedule that MPCA can share with
 * anyone (Divisions, umpires' association, media). Includes: tournament meta,
 * pool structure, every match with dates × teams × officials × pax, and a
 * "print" call-to-action that leverages the browser's native "Save as PDF".
 *
 * Route: /tournaments/:id/schedule
 * Data:
 *   - /tournaments/:id       (name, category, dates, pools, hosts)
 *   - /tournaments/:id/matches  (label, stage, teams, dates, officials, pax)
 *   - /match-officials       (id → full_name lookup for officials_ids resolution)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const fmtDate = (s) => (s ? new Date(s + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function TournamentSchedulePDF() {
    const { id } = useParams();
    const [t, setT] = useState(null);
    const [matches, setMatches] = useState([]);
    const [officialsMap, setOfficialsMap] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [tRes, mRes, oRes] = await Promise.all([
                    api.get(`/tournaments/${id}`),
                    api.get(`/tournaments/${id}/matches`),
                    api.get("/match-officials"),
                ]);
                setT(tRes.data);
                setMatches(mRes.data || []);
                const map = {};
                (oRes.data || []).forEach((o) => { map[o.id] = o.full_name; });
                setOfficialsMap(map);
            } finally { setLoading(false); }
        })();
    }, [id]);

    const nameOf = (idsArr) => (idsArr || []).map((oid) => officialsMap[oid] || oid).join(", ") || "—";

    const grouped = useMemo(() => {
        const g = { League: [], Knockouts: [], Other: [] };
        const sortedMatches = [...matches].sort((a, b) => (a.match_date || a.from_date || "9999") > (b.match_date || b.from_date || "9999") ? 1 : -1);
        sortedMatches.forEach((m) => {
            const stage = m.stage || "";
            if (stage === "League" || stage === "Pool") g.League.push(m);
            else if (stage === "Knockouts" || stage === "Semi Final" || stage === "Final") g.Knockouts.push(m);
            else g.Other.push(m);
        });
        return g;
    }, [matches]);

    if (loading || !t) {
        return <div className="flex items-center justify-center h-64 text-mpca-brass"><Loader2 className="animate-spin" size={16} /> Loading schedule…</div>;
    }

    const pools = [
        ...(t.setup_meta?.division_pools || []),
        ...(t.setup_meta?.district_pools || []),
    ];

    return (
        <div className="max-w-[900px] mx-auto p-8 bg-white text-black font-serif print:p-4" data-testid="tournament-schedule-pdf">
            {/* Screen-only toolbar */}
            <div className="print:hidden mb-4 flex items-center justify-between border-b-2 border-black pb-2">
                <div className="text-sm">
                    <span className="uppercase tracking-widest text-[10px] text-gray-500">MPCA ERP · Match Schedule</span>
                </div>
                <button onClick={() => window.print()} data-testid="schedule-print-btn"
                    className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest bg-black text-white px-3 py-1.5 hover:bg-gray-800">
                    <Printer size={12} /> Print / Save as PDF
                </button>
            </div>

            {/* Header */}
            <div className="text-center mb-4 border-b border-black pb-3">
                <div className="text-[9px] uppercase tracking-[0.3em] mb-1">Madhya Pradesh Cricket Association · Since 1957</div>
                <h1 className="text-3xl font-bold" data-testid="schedule-title">{t.name}</h1>
                <div className="text-[11px] mt-1 flex gap-3 justify-center flex-wrap">
                    <span>Tournament No. <b>{t.tournament_no}</b></span>
                    <span>·</span>
                    <span>{t.setup_meta?.category || "—"} · {t.setup_meta?.age_group || "—"}</span>
                    <span>·</span>
                    <span>{t.format}</span>
                    <span>·</span>
                    <span>Fiscal <b>{t.fiscal_cycle}</b></span>
                </div>
                <div className="text-[11px] mt-1">
                    <b>{fmtDate(t.start_date)}</b> → <b>{fmtDate(t.end_date)}</b> · Host <b>{t.host_body_id}</b>
                </div>
            </div>

            {/* Pools */}
            {pools.length > 0 && (
                <>
                    <h3 className="text-lg border-b border-black mb-2 mt-4">1. Pool Structure</h3>
                    <table className="w-full text-[11px] border-collapse mb-4" data-testid="schedule-pools-table">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="text-left py-1 pr-2">Pool</th>
                                <th className="text-left py-1 pr-2">Host</th>
                                <th className="text-left py-1 pr-2">Participating Divisions / Districts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pools.map((p, i) => (
                                <tr key={i} className="border-b border-gray-300">
                                    <td className="py-1 pr-2 font-bold">{p.name}</td>
                                    <td className="py-1 pr-2">{p.host_division_code || p.host_district_code || "—"}</td>
                                    <td className="py-1 pr-2 font-mono text-[10px]">{(p.division_codes || p.district_codes || []).join(", ")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Match Schedule */}
            <h3 className="text-lg border-b border-black mb-2 mt-4">2. Match Schedule</h3>
            {["League", "Knockouts", "Other"].map((stageName) => {
                const rows = grouped[stageName];
                if (!rows.length) return null;
                return (
                    <div key={stageName} className="mb-5" data-testid={`schedule-stage-${stageName}`}>
                        <div className="text-[10px] font-bold uppercase tracking-widest bg-black text-white px-2 py-1 inline-block mb-1">{stageName} · {rows.length} match(es)</div>
                        <table className="w-full text-[10px] border-collapse mb-2">
                            <thead>
                                <tr className="border-b border-black bg-gray-100">
                                    <th className="text-left py-1 pr-1 w-8">#</th>
                                    <th className="text-left py-1 pr-1 w-16">Label</th>
                                    <th className="text-left py-1 pr-1">Fixture</th>
                                    <th className="text-left py-1 pr-1 w-20">From</th>
                                    <th className="text-left py-1 pr-1 w-20">To</th>
                                    <th className="text-center py-1 pr-1 w-8">MD</th>
                                    <th className="text-center py-1 pr-1 w-10">Pax</th>
                                    <th className="text-left py-1 pr-1">Umpires</th>
                                    <th className="text-left py-1 pr-1">Scorer / Selector / Observer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((m, idx) => {
                                    const oi = m.officials_ids || {};
                                    return (
                                        <tr key={m.id} className="border-b border-gray-300 align-top" data-testid={`schedule-match-${m.id}`}>
                                            <td className="py-1 pr-1 font-mono">{idx + 1}</td>
                                            <td className="py-1 pr-1">{m.label || m.round || "—"}</td>
                                            <td className="py-1 pr-1 font-bold">{m.home_team || "?"} <span className="font-normal text-gray-500">v</span> {m.away_team || "?"}</td>
                                            <td className="py-1 pr-1 font-mono">{fmtDate(m.match_date || m.from_date)}</td>
                                            <td className="py-1 pr-1 font-mono">{fmtDate(m.to_date || m.match_date || m.from_date)}</td>
                                            <td className="text-center py-1 pr-1 font-mono">{m.days || 1}</td>
                                            <td className="text-center py-1 pr-1 font-mono">{(m.squad ?? 18) * 2 + (m.other_pax || 0)}</td>
                                            <td className="py-1 pr-1">{nameOf(oi.umpires)}</td>
                                            <td className="py-1 pr-1 text-[9px]">
                                                <div><b>Sc:</b> {nameOf(oi.scorers)}</div>
                                                <div><b>Se:</b> {nameOf(oi.selectors)}</div>
                                                <div><b>Ob:</b> {nameOf(oi.observers)}</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })}

            {/* Footer */}
            <div className="mt-8 pt-3 border-t-2 border-black text-[9px] text-gray-600 flex justify-between">
                <span>Generated on {new Date().toLocaleString("en-IN")}</span>
                <span>MPCA ERP · Official Match Schedule</span>
                <span>Page 1</span>
            </div>

            {/* Print CSS */}
            <style>{`
                @media print {
                    body { background: white !important; }
                    .print\\:hidden { display: none !important; }
                    .print\\:p-4 { padding: 1rem !important; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    thead { display: table-header-group; }
                }
            `}</style>
        </div>
    );
}
