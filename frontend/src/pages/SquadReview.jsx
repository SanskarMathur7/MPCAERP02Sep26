import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, Sparkles, ThumbsUp, ThumbsDown, Users, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const scoreColor = (s) => s >= 70 ? "text-mpca-green-dark" : s >= 50 ? "text-mpca-brass" : "text-mpca-oxblood";

const SquadReview = () => {
    const { sid } = useParams();
    const navigate = useNavigate();
    const { persona } = useAuth();
    const [verdict, setVerdict] = useState(null);
    const [loading, setLoading] = useState(true);
    const [askingAI, setAskingAI] = useState(false);
    const [showFullSelected, setShowFullSelected] = useState(false);
    const [showFullRecommended, setShowFullRecommended] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/squads/${sid}/recommendation`);
            setVerdict(data);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [sid]);

    const askAI = async () => {
        setAskingAI(true);
        try {
            const { data } = await api.post(`/squads/${sid}/ai-second-opinion`);
            setVerdict(data);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setAskingAI(false); }
    };

    if (loading || !verdict) return <CricketLoader label="Analysing squad..." />;

    const selectedShow = showFullSelected ? verdict.selected : verdict.selected.slice(0, 8);
    const recShow = showFullRecommended ? verdict.recommended : verdict.recommended.slice(0, 8);
    const selectedIds = new Set(verdict.selected.map((r) => r.player_id));
    const recommendedIds = new Set(verdict.recommended.map((r) => r.player_id));

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="squad-review-page">
            <button className="text-[11px] text-mpca-brass uppercase tracking-widest mb-4 flex items-center gap-1" onClick={() => navigate(-1)}>
                <ArrowLeft size={12} /> Back
            </button>

            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Squad Review · AI Verdict</div>
                    <h1 className="font-serif text-4xl text-mpca-green-dark mt-3 leading-tight" data-testid="squad-review-title">
                        {verdict.team_name}
                    </h1>
                    <div className="text-[11px] mt-2 text-mpca-gray-dark">
                        Tournament: <span className="text-mpca-green-dark">{verdict.tournament_name}</span> · Algorithm: <span className="font-mono">{verdict.algorithm}</span>
                    </div>
                </div>
                <button className="btn-heritage-primary" onClick={askAI} disabled={askingAI} data-testid="ask-ai-btn">
                    <Sparkles size={12} /> {askingAI ? "Consulting Gemini..." : "Ask AI for Second Opinion"}
                </button>
            </div>

            {/* Scorecard strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bulletin-card p-4" data-testid="stat-quality">
                    <div className="overline text-[9px]">Quality Score</div>
                    <div className={`font-serif text-3xl mt-1 ${scoreColor(verdict.quality_score)}`}>{verdict.quality_score}<span className="text-sm text-mpca-gray-dark">/100</span></div>
                    <div className="text-[10px] text-mpca-gray-dark mt-1">Selected vs AI's XV</div>
                </div>
                <div className="bulletin-card p-4" data-testid="stat-overlap">
                    <div className="overline text-[9px]">Overlap</div>
                    <div className={`font-serif text-3xl mt-1 ${verdict.overlap_pct >= 70 ? "text-mpca-green-dark" : "text-mpca-oxblood"}`}>{verdict.overlap_pct}%</div>
                    <div className="text-[10px] text-mpca-gray-dark mt-1">With AI XV</div>
                </div>
                <div className="bulletin-card p-4" data-testid="stat-kyc">
                    <div className="overline text-[9px]">KYC Gaps</div>
                    <div className={`font-serif text-3xl mt-1 ${verdict.kyc_gaps_total === 0 ? "text-mpca-green-dark" : "text-mpca-oxblood"}`}>{verdict.kyc_gaps_total}</div>
                    <div className="text-[10px] text-mpca-gray-dark mt-1">Docs pending / disqual.</div>
                </div>
                <div className="bulletin-card p-4" data-testid="stat-bias">
                    <div className="overline text-[9px]">Body Spread</div>
                    <div className={`font-serif text-3xl mt-1 ${verdict.bias?.top_body_pct >= 70 ? "text-mpca-oxblood" : "text-mpca-green-dark"}`}>{verdict.bias?.top_body_pct}%</div>
                    <div className="text-[10px] text-mpca-gray-dark mt-1">From {verdict.bias?.top_body}</div>
                </div>
            </div>

            {/* AI notes */}
            {verdict.ai_notes?.length > 0 && (
                <div className="bulletin-card p-4 mb-6 border-l-4 border-mpca-brass" data-testid="ai-notes">
                    <div className="overline text-[9px] mb-3 flex items-center gap-1"><Info size={11} /> AI Observations</div>
                    <ul className="text-sm text-mpca-green-dark space-y-1.5">
                        {verdict.ai_notes.map((n, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="text-mpca-brass shrink-0">→</span>
                                <span>{n}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Gemini second opinion */}
            {verdict.ai_second_opinion && (
                <div className="bulletin-card p-4 mb-6 border-l-4 border-mpca-oxblood bg-mpca-cream/30" data-testid="gemini-opinion">
                    <div className="overline text-[9px] mb-3 flex items-center gap-1"><Sparkles size={11} /> Gemini Second Opinion</div>
                    {verdict.ai_second_opinion.error ? (
                        <div className="text-xs text-mpca-oxblood">{verdict.ai_second_opinion.error}</div>
                    ) : (
                        <div className="text-sm text-mpca-green-dark whitespace-pre-wrap leading-relaxed">{verdict.ai_second_opinion.text}</div>
                    )}
                </div>
            )}

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Selected */}
                <div className="bulletin-card p-0 overflow-hidden" data-testid="selected-column">
                    <div className="p-3 bg-mpca-oxblood text-mpca-ivory">
                        <div className="overline text-[9px] !text-mpca-gold-light">Division's Selection ({verdict.selected.length})</div>
                        <div className="text-sm mt-1">Avg score: <span className="font-mono">{verdict.avg_selected_score}</span></div>
                    </div>
                    <div>
                        {selectedShow.map((r, i) => {
                            const inAI = recommendedIds.has(r.player_id);
                            return (
                                <div key={r.player_id} className={`p-3 border-b border-mpca-brass/10 ${inAI ? "bg-mpca-green-dark/5" : ""}`} data-testid={`selected-row-${i}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-serif text-sm text-mpca-green-dark">{r.full_name}</span>
                                                {inAI && <CheckCircle2 size={12} className="text-mpca-green-dark" title="Also in AI XV" />}
                                            </div>
                                            <div className="text-[10px] text-mpca-gray-dark">
                                                <span className="font-mono">{r.player_display_id}</span> · {r.role} · {r.body_id}
                                            </div>
                                            {r.kyc_gaps.length > 0 && (
                                                <div className="mt-1 text-[10px] text-mpca-oxblood flex items-start gap-1">
                                                    <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                                                    <span>{r.kyc_gaps.join(" · ")}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className={`font-mono text-sm shrink-0 ${scoreColor(r.score)}`}>{r.score}</div>
                                    </div>
                                </div>
                            );
                        })}
                        {verdict.selected.length > 8 && (
                            <button className="w-full py-2 text-[10px] text-mpca-brass uppercase tracking-widest border-t border-mpca-brass/10" onClick={() => setShowFullSelected(!showFullSelected)} data-testid="toggle-selected">
                                {showFullSelected ? "Show less" : `Show all ${verdict.selected.length}`}
                            </button>
                        )}
                    </div>
                </div>

                {/* Recommended */}
                <div className="bulletin-card p-0 overflow-hidden" data-testid="recommended-column">
                    <div className="p-3 bg-mpca-green-dark text-mpca-ivory">
                        <div className="overline text-[9px] !text-mpca-gold-light">AI-Recommended XV ({verdict.recommended.length})</div>
                        <div className="text-sm mt-1">Avg score: <span className="font-mono">{verdict.avg_recommended_score}</span></div>
                    </div>
                    <div>
                        {recShow.map((r, i) => {
                            const inSel = selectedIds.has(r.player_id);
                            return (
                                <div key={r.player_id} className={`p-3 border-b border-mpca-brass/10 ${!inSel ? "bg-mpca-brass/5" : ""}`} data-testid={`recommended-row-${i}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-serif text-sm text-mpca-green-dark">{r.full_name}</span>
                                                {!inSel && <span className="text-[9px] uppercase text-mpca-oxblood tracking-wider font-semibold">Missed</span>}
                                            </div>
                                            <div className="text-[10px] text-mpca-gray-dark">
                                                <span className="font-mono">{r.player_display_id}</span> · {r.role} · {r.body_id}
                                            </div>
                                            <div className="mt-1 text-[10px] text-mpca-brass">{r.reason}</div>
                                        </div>
                                        <div className={`font-mono text-sm shrink-0 ${scoreColor(r.score)}`}>{r.score}</div>
                                    </div>
                                </div>
                            );
                        })}
                        {verdict.recommended.length > 8 && (
                            <button className="w-full py-2 text-[10px] text-mpca-brass uppercase tracking-widest border-t border-mpca-brass/10" onClick={() => setShowFullRecommended(!showFullRecommended)} data-testid="toggle-recommended">
                                {showFullRecommended ? "Show less" : `Show all ${verdict.recommended.length}`}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="text-[10px] text-mpca-gray-dark flex flex-wrap gap-4 mb-6">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-mpca-green-dark/20 inline-block"></span> Also in AI XV</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-mpca-brass/10 inline-block"></span> Missed by Selection</span>
                <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-mpca-oxblood" /> KYC Gap</span>
            </div>

            {/* Role mix + bias breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bulletin-card p-4" data-testid="role-mix-card">
                    <div className="overline text-[9px] mb-3">Role Balance</div>
                    <div className="grid grid-cols-5 gap-2 text-center">
                        {[
                            ["batter", "Batters"], ["all_rounder", "All-R"], ["keeper", "Keepers"], ["pace", "Pace"], ["spin", "Spin"],
                        ].map(([k, l]) => (
                            <div key={k}>
                                <div className={`font-serif text-2xl ${(verdict.role_mix[k] || 0) === 0 ? "text-mpca-oxblood" : "text-mpca-green-dark"}`}>{verdict.role_mix[k] || 0}</div>
                                <div className="text-[9px] uppercase tracking-widest text-mpca-gray-dark">{l}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bulletin-card p-4" data-testid="bias-card">
                    <div className="overline text-[9px] mb-3">Body Spread</div>
                    <div className="space-y-1">
                        {Object.entries(verdict.bias?.spread || {}).map(([body, count]) => {
                            const pct = Math.round(count * 100 / verdict.selected.length);
                            return (
                                <div key={body} className="text-xs">
                                    <div className="flex justify-between mb-0.5">
                                        <span className="text-mpca-green-dark">{body}</span>
                                        <span className="font-mono text-mpca-gray-dark">{count} · {pct}%</span>
                                    </div>
                                    <div className="h-1 bg-mpca-brass/15">
                                        <div className={`h-full ${pct >= 70 ? "bg-mpca-oxblood" : "bg-mpca-green-dark"}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {verdict.bias?.warning && (
                        <div className="mt-3 text-[10px] text-mpca-oxblood flex items-start gap-1">
                            <AlertTriangle size={10} className="shrink-0 mt-0.5" /> {verdict.bias.warning}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SquadReview;
