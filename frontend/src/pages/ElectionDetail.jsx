import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchElection, fetchCandidates, castVote, concludeElection, addCandidate, fetchMembers, updateElection } from "@/lib/api";
import { ArrowLeft, Vote as VoteIcon, Calendar, User, Trophy, CheckCircle2, Award } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const STATUS_PILL = {
    Announced: "pill-pending",
    Nominations_Open: "pill-active",
    Nominations_Closed: "pill-pending",
    Voting_Open: "pill-active",
    Concluded: "pill-lapsed",
    Cancelled: "pill-suspended",
};

const ElectionDetail = () => {
    const { id } = useParams();
    const [election, setElection] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [voterUid, setVoterUid] = useState("");
    const [voteMsg, setVoteMsg] = useState({ type: "", text: "" });
    const [showNominate, setShowNominate] = useState(false);
    const [nominateUid, setNominateUid] = useState("");
    const [nominateManifesto, setNominateManifesto] = useState("");

    const load = async () => {
        const [e, c, m] = await Promise.all([fetchElection(id), fetchCandidates(id), fetchMembers()]);
        setElection(e);
        setCandidates(c);
        setMembers(m);
    };

    useEffect(() => {
        (async () => {
            try {
                await load();
            } finally {
                setLoading(false);
            }
        })();
    }, [id]); // eslint-disable-line

    const totalVotes = useMemo(
        () => candidates.reduce((acc, c) => acc + c.votes_received, 0),
        [candidates]
    );

    const handleVote = async (candidateId) => {
        if (!voterUid.trim()) {
            setVoteMsg({ type: "error", text: "Please enter your Member UID to vote." });
            return;
        }
        try {
            const r = await castVote(id, {
                election_id: id,
                candidate_id: candidateId,
                voter_uid: voterUid.trim(),
            });
            setVoteMsg({ type: "success", text: `Vote recorded for ${r.candidate}. Thank you.` });
            setVoterUid("");
            await load();
        } catch (err) {
            setVoteMsg({ type: "error", text: err.response?.data?.detail || err.message });
        }
    };

    const handleConclude = async () => {
        if (!window.confirm("Conclude the election and declare the winner based on current votes?")) return;
        await concludeElection(id);
        await load();
    };

    const handleNominate = async (e) => {
        e.preventDefault();
        try {
            await addCandidate(id, {
                election_id: id,
                member_uid: nominateUid.trim(),
                member_name: "",
                manifesto: nominateManifesto,
                status: "Accepted",
            });
            setNominateUid("");
            setNominateManifesto("");
            setShowNominate(false);
            await load();
        } catch (err) {
            alert(err.response?.data?.detail || err.message);
        }
    };

    const advance = async (status) => {
        const updated = await updateElection(id, { ...election, status });
        setElection(updated);
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading…" /></div>;
    if (!election) return <div className="p-16 text-center font-serif text-2xl">Election not found.</div>;

    const isVotingOpen = election.status === "Voting_Open";
    const isNominationOpen = election.status === "Nominations_Open" || election.status === "Announced";
    const isConcluded = election.status === "Concluded";

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="election-detail-page">
            <Link to="/elections" className="btn-heritage-ghost mb-6 inline-flex" data-testid="election-back">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Elections
            </Link>

            <div className="border border-mpca-brass/40 p-10 mb-10 bg-gradient-to-br from-mpca-ivory to-mpca-parchment relative" data-testid="election-header">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="overline">Election · Post of {election.post}</div>
                        <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                            {election.title}
                        </h1>
                    </div>
                    <span className={`pill ${STATUS_PILL[election.status]}`}>{election.status.replace(/_/g, " ")}</span>
                </div>
                <div className="grid md:grid-cols-4 gap-6 mt-8 pt-6 border-t border-mpca-brass/20">
                    <div>
                        <div className="overline">Electoral Officer</div>
                        <div className="mt-2 flex items-center gap-2 text-mpca-charcoal text-sm">
                            <User size={14} className="text-mpca-brass" strokeWidth={1.5} />
                            {election.electoral_officer}
                        </div>
                    </div>
                    <div>
                        <div className="overline">Nominations</div>
                        <div className="mt-2 text-mpca-charcoal text-sm font-mono">
                            {new Date(election.nomination_open_date).toLocaleDateString("en-GB")} → {new Date(election.nomination_close_date).toLocaleDateString("en-GB")}
                        </div>
                    </div>
                    <div>
                        <div className="overline">Voting Date</div>
                        <div className="mt-2 flex items-center gap-2 text-mpca-charcoal text-sm">
                            <Calendar size={14} className="text-mpca-brass" strokeWidth={1.5} />
                            {new Date(election.voting_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                    </div>
                    <div>
                        <div className="overline">Tenure · Cooling</div>
                        <div className="mt-2 text-mpca-charcoal text-sm font-mono">{election.tenure_years} yrs · {election.cooling_period_years} yrs</div>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-mpca-brass/20 flex flex-wrap items-center justify-end gap-3">
                    {election.status === "Announced" && (
                        <button onClick={() => advance("Nominations_Open")} className="btn-heritage-secondary" data-testid="open-nominations">Open Nominations</button>
                    )}
                    {election.status === "Nominations_Open" && (
                        <button onClick={() => advance("Nominations_Closed")} className="btn-heritage-secondary" data-testid="close-nominations">Close Nominations</button>
                    )}
                    {election.status === "Nominations_Closed" && (
                        <button onClick={() => advance("Voting_Open")} className="btn-heritage-primary" data-testid="open-voting">Open Voting</button>
                    )}
                    {isVotingOpen && (
                        <button onClick={handleConclude} className="btn-heritage-primary" data-testid="conclude-election">
                            <Trophy size={14} strokeWidth={1.5} /> Conclude & Declare
                        </button>
                    )}
                </div>
            </div>

            {/* Voting widget (only when voting open) */}
            {isVotingOpen && (
                <div className="bulletin-card p-8 mb-10 bg-mpca-parchment/50" data-testid="voting-panel">
                    <div className="flex items-center gap-2 mb-2">
                        <VoteIcon className="text-mpca-oxblood" size={20} strokeWidth={1.5} />
                        <div className="overline">Cast Your Vote</div>
                    </div>
                    <h3 className="font-serif text-2xl text-mpca-green-dark mb-4">Polling is currently open.</h3>
                    <p className="text-sm text-mpca-charcoal mb-5 max-w-2xl">
                        Enter your MPCA Member UID below, then click the "Vote" button next
                        to your chosen candidate. Each member may cast one vote in this election.
                    </p>
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[240px]">
                            <label className="label-heritage">Voter Member UID</label>
                            <input
                                type="text"
                                value={voterUid}
                                onChange={(e) => setVoterUid(e.target.value.toUpperCase())}
                                placeholder="e.g. MPCA-IND-0003"
                                className="input-heritage font-mono"
                                data-testid="voter-uid"
                            />
                        </div>
                        {voteMsg.text && (
                            <div
                                className={`text-sm italic flex-1 ${voteMsg.type === "success" ? "text-mpca-green-dark" : "text-mpca-oxblood"}`}
                                data-testid="vote-msg"
                            >
                                {voteMsg.text}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Candidates */}
            <div className="flex items-end justify-between mb-6">
                <div>
                    <div className="overline">Candidates</div>
                    <h2 className="font-serif text-3xl text-mpca-green-dark mt-1">Standing for Election</h2>
                </div>
                {isNominationOpen && (
                    <button onClick={() => setShowNominate(!showNominate)} className="btn-heritage-secondary" data-testid="nominate-toggle">
                        Nominate
                    </button>
                )}
            </div>

            {showNominate && isNominationOpen && (
                <form onSubmit={handleNominate} className="bulletin-card p-6 mb-6 space-y-4 bg-mpca-parchment/50" data-testid="nominate-form">
                    <div>
                        <label className="label-heritage">Member to Nominate (UID) *</label>
                        <select required value={nominateUid} onChange={(e) => setNominateUid(e.target.value)} className="input-heritage" data-testid="nominate-uid">
                            <option value="">— Select a member —</option>
                            {members.filter((m) => m.status === "Active").map((m) => (
                                <option key={m.uid} value={m.uid}>{m.uid} · {m.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label-heritage">Manifesto / Statement (optional)</label>
                        <textarea value={nominateManifesto} onChange={(e) => setNominateManifesto(e.target.value)} className="input-heritage" rows={3} />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setShowNominate(false)} className="btn-heritage-ghost">Cancel</button>
                        <button type="submit" className="btn-heritage-primary" data-testid="nominate-submit">Record Nomination</button>
                    </div>
                </form>
            )}

            {candidates.length === 0 ? (
                <div className="bulletin-card px-8 py-12 text-center text-mpca-gray-dark italic font-serif">
                    No nominations on file.
                </div>
            ) : (
                <div className="space-y-4">
                    {candidates.map((c) => {
                        const pct = totalVotes > 0 ? (c.votes_received / totalVotes) * 100 : 0;
                        const isWinner = c.status === "Elected";
                        return (
                            <div
                                key={c.id}
                                className={`bulletin-card p-6 ${isWinner ? "border-mpca-gold !border-2" : ""}`}
                                data-testid={`candidate-${c.id}`}
                            >
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 border border-mpca-brass flex items-center justify-center font-serif text-xl text-mpca-green-dark bg-mpca-parchment">
                                            {c.member_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                                        </div>
                                        <div>
                                            <div className="font-serif text-xl text-mpca-green-dark leading-tight">{c.member_name}</div>
                                            <div className="font-mono text-[10px] text-mpca-brass tracking-widest">{c.member_uid}</div>
                                        </div>
                                        {isWinner && (
                                            <span className="pill !bg-mpca-gold/20 !text-mpca-green-dark !border-mpca-gold">
                                                <Award size={11} strokeWidth={1.5} /> Elected
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {isConcluded && (
                                            <div className="text-right">
                                                <div className="font-serif text-3xl text-mpca-green-dark leading-none">{c.votes_received}</div>
                                                <div className="overline mt-1">votes</div>
                                            </div>
                                        )}
                                        {isVotingOpen && (
                                            <button
                                                onClick={() => handleVote(c.id)}
                                                className="btn-heritage-primary"
                                                data-testid={`vote-${c.id}`}
                                            >
                                                <CheckCircle2 size={14} strokeWidth={1.5} /> Vote
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {c.manifesto && (
                                    <p className="text-sm text-mpca-charcoal italic font-serif mt-4 pt-4 border-t border-mpca-brass/15 leading-relaxed">
                                        "{c.manifesto}"
                                    </p>
                                )}
                                {(isVotingOpen || isConcluded) && totalVotes > 0 && (
                                    <div className="mt-4">
                                        <div className="h-[3px] bg-mpca-brass/15 relative">
                                            <div
                                                className={`absolute inset-y-0 left-0 transition-all duration-1000 ${isWinner ? "bg-mpca-gold" : "bg-mpca-green-dark"}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <div className="text-[10px] text-mpca-gray-dark mt-1 font-mono">{pct.toFixed(1)}% of polled</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="mt-10 text-xs text-mpca-gray-dark italic font-serif text-center">
                Total votes polled: <span className="font-mono text-mpca-charcoal">{totalVotes}</span> · Eligible voters: <span className="font-mono text-mpca-charcoal">{election.eligible_voters_count}</span>
            </div>
        </div>
    );
};

export default ElectionDetail;
