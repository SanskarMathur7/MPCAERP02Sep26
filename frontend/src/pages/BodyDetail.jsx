import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    fetchBody,
    fetchBodySummary,
    fetchBodyChildrenActivity,
    fetchMembers,
} from "@/lib/api";
import {
    ArrowLeft,
    Landmark,
    Building2,
    MapPin,
    Users,
    Coins,
    ArrowUpRight,
    Award,
    CalendarClock,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import BodyDocumentsVault from "@/components/BodyDocumentsVault";
import { useAuth } from "@/context/AuthContext";

const ICON_BY_TYPE = { BCCI: Landmark, State: Landmark, Division: Building2, District: MapPin };
const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const isCurrent = (a) => !a.end_date || new Date(a.end_date) >= new Date();

const BodyDetail = () => {
    const { code } = useParams();
    const { persona } = useAuth();
    const [body, setBody] = useState(null);
    const [summary, setSummary] = useState(null);
    const [activity, setActivity] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            setLoading(true);
            try {
                const [b, s, act] = await Promise.all([
                    fetchBody(code),
                    fetchBodySummary(code),
                    fetchBodyChildrenActivity(code).catch(() => null),
                ]);
                if (!alive) return;
                setBody(b);
                setSummary(s);
                setActivity(act);
                // Scope members by body type:
                //  · State (MPCA) → member_type=MPCA
                //  · Division      → division_body_id=code (all districts under it)
                //  · District      → body_id=code
                let params;
                if (b.body_type === "State") params = { member_type: "MPCA" };
                else if (b.body_type === "Division") params = { division_body_id: code };
                else params = { body_id: code };
                const mems = await fetchMembers(params).catch(() => []);
                if (alive) setMembers(mems);
            } finally {
                if (alive) setLoading(false);
            }
        };
        load();
        return () => { alive = false; };
    }, [code]);

    if (loading) {
        return <div className="p-16"><CricketLoader label={`Reading ${code} …`} size="lg" /></div>;
    }
    if (!body) {
        return (
            <div className="p-16 text-center">
                <div className="font-serif text-3xl text-mpca-green-dark">Body not found.</div>
                <Link to="/org" className="btn-heritage-secondary mt-6 inline-flex">Back to Org Tree</Link>
            </div>
        );
    }

    const Icon = ICON_BY_TYPE[body.body_type] || MapPin;
    const officers = members.filter((m) => {
        const active = (m.memberships || []).filter(isCurrent);
        if (active.some((a) => (a.category === "Office Bearer") || (a.role || "").toLowerCase().match(/president|secretary|treasurer|vice/))) return true;
        return (m.role || "").toLowerCase().match(/president|secretary|treasurer|vice/);
    });

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="body-detail-page">
            <Link to="/org" className="btn-heritage-ghost mb-6 inline-flex" data-testid="back-to-org">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Organisation Tree
            </Link>

            {/* Header */}
            <div className="border border-mpca-brass/40 p-8 md:p-10 mb-8 relative"
                style={{ backgroundImage: "linear-gradient(135deg, var(--mpca-ivory) 0%, var(--mpca-parchment) 100%)" }}>
                <div className="flex flex-wrap items-start gap-6">
                    <div className="w-20 h-20 border-2 border-mpca-brass/60 flex items-center justify-center bg-mpca-parchment shrink-0">
                        <Icon size={36} strokeWidth={1.2} className="text-mpca-brass" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="overline">{body.body_type === "State" ? "MPCA · Headquarters" : `${body.body_type} · ${body.parent_code || ""}`}</div>
                        <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-2 leading-tight">{body.name}</h1>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <span className="font-mono text-[11px] tracking-[0.2em] text-mpca-brass px-3 py-1 border border-mpca-brass/40">{body.code}</span>
                            {body.seat && <span className="text-xs text-mpca-charcoal">Seat: <strong>{body.seat}</strong></span>}
                            {body.founded_year && <span className="text-xs text-mpca-charcoal">Est. {body.founded_year}</span>}
                            {body.annual_grant_inr > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-mpca-brass"><Coins size={11} /> {fmtINR(body.annual_grant_inr)}/yr</span>
                            )}
                        </div>
                        {body.parent_code && (
                            <div className="mt-2 text-xs text-mpca-gray-dark">
                                Reports to <Link to={`/org/${body.parent_code}`} className="text-mpca-brass hover:underline font-mono">{body.parent_code}</Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary stats */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8" data-testid="body-stats">
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-4">
                        <div className="overline text-[9px]">Direct children</div>
                        <div className="font-serif text-3xl text-mpca-green-dark">{summary.direct_children_count}</div>
                    </div>
                    {body.body_type !== "District" && (
                        <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-4">
                            <div className="overline text-[9px]">Districts under</div>
                            <div className="font-serif text-3xl text-mpca-green-dark">{summary.district_count}</div>
                        </div>
                    )}
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-4">
                        <div className="overline text-[9px]">Members on roll</div>
                        <div className="font-serif text-3xl text-mpca-green-dark">{members.length}</div>
                    </div>
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-4">
                        <div className="overline text-[9px]">Annual grant outlay</div>
                        <div className="font-serif text-3xl text-mpca-green-dark">{fmtINR(summary.total_annual_grant_inr_to_children)}</div>
                    </div>
                </div>
            )}

            <div className="crest-divider mb-8" />

            {/* Officers */}
            <div className="bulletin-card p-7 mb-8" data-testid="body-officers">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="overline">Office Bearers</div>
                        <h3 className="font-serif text-2xl text-mpca-green-dark mt-1">Hon. Secretary · Treasurer · Committee</h3>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">{officers.length} bearers</span>
                </div>
                {officers.length === 0 ? (
                    <div className="py-8 text-center text-mpca-gray-dark italic font-serif text-sm" data-testid="no-officers">
                        No office bearers recorded for {body.code} yet. Enrol members via the Membership Register and mark their assignments.
                    </div>
                ) : (
                    <ul className="grid md:grid-cols-2 gap-3">
                        {officers.map((m) => (
                            <li key={m.id} className="border border-mpca-brass/25 bg-white/60 p-4" data-testid={`officer-${m.uid}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-lg text-mpca-green-dark leading-tight">{m.name}</div>
                                        <div className="text-xs text-mpca-brass mt-0.5">{m.role || "Member"}</div>
                                        <div className="text-[11px] text-mpca-gray-dark mt-1 truncate">{m.email || m.phone || "—"}</div>
                                    </div>
                                    <Link to={`/members/${m.id}`} className="btn-heritage-ghost !py-1 !px-2 !text-[10px] shrink-0">Open</Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Children activity — for non-district bodies */}
            {activity && (activity.children || []).length > 0 && (
                <div className="bulletin-card p-7 mb-8" data-testid="body-children-activity">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="overline">Children · Activity Snapshot</div>
                            <h3 className="font-serif text-2xl text-mpca-green-dark mt-1">
                                {body.body_type === "State" ? "The 10 Divisions" : "Constituent Districts"}
                            </h3>
                        </div>
                    </div>
                    <div className="grid gap-3">
                        {activity.children.map((c) => (
                            <Link
                                to={`/org/${c.code}`}
                                key={c.code}
                                className="border border-mpca-brass/20 bg-white/60 p-4 hover:bg-mpca-parchment/60 transition grid grid-cols-12 gap-3 items-center"
                                data-testid={`child-${c.code}`}
                            >
                                <div className="col-span-4">
                                    <div className="font-serif text-lg text-mpca-green-dark">{c.name}</div>
                                    <div className="text-[10px] font-mono text-mpca-brass mt-0.5">{c.code}</div>
                                </div>
                                <div className="col-span-2 text-center">
                                    <div className="overline text-[9px]">Members</div>
                                    <div className="font-serif text-xl text-mpca-charcoal">{c.members_count ?? 0}</div>
                                </div>
                                <div className="col-span-2 text-center">
                                    <div className="overline text-[9px]">Claims Pending</div>
                                    <div className={`font-serif text-xl ${(c.claims_pending || 0) > 0 ? "text-mpca-oxblood" : "text-mpca-charcoal"}`}>
                                        {c.claims_pending ?? 0}
                                    </div>
                                </div>
                                <div className="col-span-2 text-center">
                                    <div className="overline text-[9px]">Disbursed FY</div>
                                    <div className="font-serif text-lg font-mono text-mpca-green-dark">{fmtINR(c.disbursed_ytd || 0)}</div>
                                </div>
                                <div className="col-span-2 text-right text-mpca-brass">
                                    <ArrowUpRight size={16} strokeWidth={1.5} className="ml-auto" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Members roster */}
            <div className="bulletin-card p-7" data-testid="body-members-roster">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="overline">Roster</div>
                        <h3 className="font-serif text-2xl text-mpca-green-dark mt-1">Members on Roll</h3>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">{members.length} total</span>
                </div>
                {members.length === 0 ? (
                    <div className="py-8 text-center text-mpca-gray-dark italic font-serif text-sm" data-testid="no-members">
                        No members scoped to <span className="font-mono text-mpca-brass">{body.code}</span> yet. Bulk-upload the district's roster from the Membership Register.
                    </div>
                ) : (
                    <ul className="divide-y divide-mpca-brass/15">
                        {members.slice(0, 40).map((m) => (
                            <li key={m.id} className="py-3 flex items-center gap-3 hover:bg-mpca-parchment/50 transition">
                                <span className="font-mono text-[10px] tracking-wider text-mpca-brass w-32 shrink-0">{m.uid}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-serif text-base text-mpca-green-dark leading-tight truncate">{m.name}</div>
                                    <div className="text-[11px] text-mpca-gray-dark truncate">{m.role || m.category}{m.email ? " · " + m.email : ""}</div>
                                </div>
                                <Link to={`/members/${m.id}`} className="btn-heritage-ghost !py-1 !px-2 !text-[10px]">Open</Link>
                            </li>
                        ))}
                        {members.length > 40 && (
                            <li className="py-4 text-center text-xs text-mpca-gray-dark italic">Showing 40 of {members.length} · Refine via Members search.</li>
                        )}
                    </ul>
                )}
            </div>

            {/* Sprint M33 · Body Data Warehouse (per-body document vault) */}
            <BodyDocumentsVault body={body} persona={persona} />
        </div>
    );
};

export default BodyDetail;
