import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CheckCircle2, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import MatchOfficialDAPanel from "@/components/MatchOfficialDAPanel";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

/**
 * Match Official portal · list of DA forms across all tournaments they officiated.
 * Click a row → opens the rich MatchOfficialDAPanel inline for editing / viewing.
 * Sprint M36 replaced the flat 4-field editor with the physical-form-accurate panel.
 */
const MyDAForms = () => {
    const { persona } = useAuth();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/match-official-da`, { params: { official_name: persona?.name } });
            setForms(data || []);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    if (loading) return <CricketLoader label="Loading DA forms..." />;

    // Detail view — inline rich panel
    if (openId) {
        const f = forms.find((x) => x.id === openId);
        return (
            <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto" data-testid="my-da-form-detail">
                <button className="btn-heritage-ghost mb-4" onClick={() => { setOpenId(null); load(); }} data-testid="da-back-to-list">
                    <ChevronLeft size={14} /> Back to my DA forms
                </button>
                <div className="mb-4">
                    <div className="overline">Match Official Portal</div>
                    <h1 className="font-serif text-3xl text-mpca-green-dark mt-1">DA Form · {f?.tournament_name}</h1>
                </div>
                <MatchOfficialDAPanel tournamentId={f?.tournament_id} formId={openId} onChange={load} />
            </div>
        );
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-4xl mx-auto" data-testid="my-da-forms-page">
            <div className="mb-6">
                <div className="overline">Match Official Portal</div>
                <h1 className="font-serif text-4xl text-mpca-green-dark mt-3">My DA / TA Forms</h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                    Fill your Travel + Daily Allowance claim for tournaments you officiated. Every form mirrors the MPCA physical claim form (FMPCA 037) — attach tickets, hotel bills, and misc receipts inline. Submitted forms go to Division / MPCA for review.
                </p>
            </div>

            {forms.length === 0 ? (
                <div className="bulletin-card p-16 text-center">
                    <CheckCircle2 className="mx-auto text-mpca-brass mb-4" size={36} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No DA forms yet.</div>
                    <p className="text-[11px] text-mpca-gray-dark mt-2">Open a tournament you officiated and use the <b>My DA / TA Form</b> box to start a claim.</p>
                    <Link to="/tournaments" className="btn-heritage-primary mt-4 inline-flex" data-testid="da-goto-tournaments">Go to Tournaments</Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {forms.map((f) => (
                        <button key={f.id} onClick={() => setOpenId(f.id)} className="bulletin-card p-5 w-full text-left hover:bg-mpca-cream/30 transition-colors flex items-center justify-between gap-4" data-testid={`da-row-${f.id}`}>
                            <div>
                                <div className="font-mono text-[10px] text-mpca-brass">{f.da_ref}</div>
                                <div className="font-serif text-xl text-mpca-green-dark mt-0.5">{f.tournament_name}</div>
                                <div className="text-[11px] text-mpca-gray-dark">{f.official_role} · Rate ₹{f.da_rate_inr || 0}/day · Total {fmt(f.total_inr)}</div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 border ${f.status === "Approved" ? "border-mpca-green-dark text-mpca-green-dark" : f.status === "Rejected" ? "border-mpca-oxblood text-mpca-oxblood" : f.status === "Submitted" ? "border-mpca-brass text-mpca-brass" : f.status === "Paid" ? "border-mpca-green-dark bg-mpca-green-dark text-mpca-ivory" : "border-mpca-gray-dark text-mpca-gray-dark"}`} data-testid={`da-status-${f.id}`}>{f.status}</span>
                                <ChevronRight size={16} className="text-mpca-brass" />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyDAForms;
