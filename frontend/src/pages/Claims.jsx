import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    fetchClaims, fetchClaimsStats,
    submitClaim, recommendClaim, sanctionClaim, disburseClaim, rejectClaim, returnClaim,
} from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";
import {
    HandCoins, Plus, ChevronRight, Coins, CheckCircle2, Clock, XCircle, AlertTriangle,
    ArrowUpRight, Building2, Landmark, MapPin,
} from "lucide-react";

const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const STATUS_META = {
    Draft:                 { label: "Draft",                tone: "lapsed",   icon: Clock },
    Submitted:             { label: "Submitted",            tone: "pending",  icon: ArrowUpRight },
    Division_Recommended:  { label: "Division Recommended", tone: "pending",  icon: ArrowUpRight },
    MPCA_Sanctioned:       { label: "MPCA Sanctioned",      tone: "active",   icon: CheckCircle2 },
    Disbursed:             { label: "Disbursed",            tone: "active",   icon: CheckCircle2 },
    Rejected:              { label: "Rejected",             tone: "suspended", icon: XCircle },
    Returned:              { label: "Returned",             tone: "suspended", icon: AlertTriangle },
};

const CATEGORY_LABEL = {
    Annual_Grant: "Annual Grant",
    Tournament_Expense: "Tournament Expense",
    Infrastructure: "Infrastructure",
    Honorarium: "Honorarium",
    Special_Sanction: "Special Sanction",
};

// Decides which workflow actions a persona may perform on a given claim.
// Rules:
//   - District persona can submit/return their own Draft/Returned claims
//   - Division persona of parent_body_id can recommend/return/reject Submitted claims
//   - MPCA Treasurer/Secretary/President can sanction Division_Recommended, disburse Sanctioned, reject any non-terminal
const allowedActions = (persona, claim) => {
    if (!persona) return [];
    const acts = [];
    const isStateOfficer = persona.body_type === "State";
    const isMpcaTreasurer = isStateOfficer && /Treasurer/i.test(persona.post || "");
    const isMpcaSecretary = isStateOfficer && /Secretary/i.test(persona.post || "");
    const isMpcaPresident = isStateOfficer && /President/i.test(persona.post || "");

    if (claim.status === "Draft" || claim.status === "Returned") {
        if (persona.body_code === claim.body_id) acts.push("submit");
    }
    if (claim.status === "Submitted") {
        if (persona.body_type === "Division" && persona.body_code === claim.parent_body_id) {
            acts.push("recommend", "return", "reject");
        }
        if (isMpcaTreasurer || isMpcaSecretary || isMpcaPresident) {
            // MPCA can also see Submitted but cannot recommend; can reject.
            acts.push("reject");
        }
    }
    if (claim.status === "Division_Recommended") {
        if (isMpcaTreasurer || isMpcaPresident) acts.push("sanction");
        if (isMpcaTreasurer || isMpcaSecretary || isMpcaPresident) acts.push("return", "reject");
    }
    if (claim.status === "MPCA_Sanctioned") {
        if (isMpcaTreasurer) acts.push("disburse");
        if (isMpcaTreasurer || isMpcaPresident) acts.push("reject");
    }
    return Array.from(new Set(acts));
};

const ACTION_META = {
    submit:    { label: "Submit to Division", api: submitClaim,   colour: "btn-heritage-primary" },
    recommend: { label: "Recommend",          api: recommendClaim, colour: "btn-heritage-primary" },
    sanction:  { label: "Sanction",           api: sanctionClaim,  colour: "btn-heritage-primary" },
    disburse:  { label: "Disburse",           api: disburseClaim,  colour: "btn-heritage-primary" },
    reject:    { label: "Reject",             api: rejectClaim,    colour: "btn-heritage-secondary" },
    return:    { label: "Return",             api: returnClaim,    colour: "btn-heritage-secondary" },
};

const Pill = ({ status }) => {
    const meta = STATUS_META[status] || STATUS_META.Draft;
    const Icon = meta.icon;
    return (
        <span className={"pill pill-" + meta.tone} data-testid={"claim-pill-" + status}>
            <Icon size={11} strokeWidth={2} />
            {meta.label}
        </span>
    );
};

const StatTile = ({ icon: Icon, label, value, sub, accent = "navy" }) => {
    const accentClass = {
        navy: "text-mpca-green-dark",
        saffron: "text-mpca-oxblood",
        marigold: "text-mpca-gold",
        maroon: "text-mpca-burgundy-dark",
    }[accent];
    return (
        <div className="bulletin-card p-6 border-0 rounded-none" data-testid={"claim-stat-" + label.toLowerCase().replace(/\s+/g, "-")}>
            <Icon className={accentClass + " mb-4"} size={20} strokeWidth={1.25} />
            <div className="overline">{label}</div>
            <div className="font-serif text-3xl text-mpca-green-dark mt-2 leading-none">{value}</div>
            {sub && <div className="text-[11px] text-mpca-gray-dark mt-2">{sub}</div>}
        </div>
    );
};

const ActionDialog = ({ open, action, claim, persona, onClose, onDone }) => {
    const [notes, setNotes] = useState("");
    const [coPost, setCoPost] = useState("");
    const [coName, setCoName] = useState("");
    const [busy, setBusy] = useState(false);
    if (!open || !action) return null;
    const meta = ACTION_META[action];

    // 2-signatory needed only on Disburse > ₹50,000
    const needsCoSig = action === "disburse" && (claim?.amount_inr || 0) > 50000;

    const handleConfirm = async () => {
        if (needsCoSig && (!coPost.trim() || !coName.trim())) {
            alert("Disbursement above ₹50,000 requires both co-signatory post and name.");
            return;
        }
        setBusy(true);
        try {
            await meta.api(claim.id, {
                actor_post: persona.post,
                actor_name: persona.name,
                actor_body_id: persona.body_code,
                notes: notes.trim() || null,
                co_signatory_post: needsCoSig ? coPost.trim() : null,
                co_signatory_name: needsCoSig ? coName.trim() : null,
            });
            onDone();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
            setNotes("");
            setCoPost("");
            setCoName("");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="claim-action-dialog">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood">
                    <div className="overline !text-mpca-gold-light">Workflow · Action</div>
                    <div className="font-serif text-2xl mt-1">{meta.label}</div>
                </div>
                <div className="p-6 space-y-5">
                    <div>
                        <div className="text-sm text-mpca-charcoal mb-1">{claim.claim_no} · {claim.title}</div>
                        <div className="font-serif text-xl text-mpca-green-dark">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(claim.amount_inr || 0)}</div>
                    </div>

                    {needsCoSig && (
                        <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 p-3" data-testid="co-signatory-section">
                            <div className="overline !text-mpca-oxblood mb-2">Two-Signatory Required (Art. 28(v) · &gt;₹50,000)</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label-heritage">Co-Signatory Post</label>
                                    <input
                                        value={coPost}
                                        onChange={(e) => setCoPost(e.target.value)}
                                        placeholder="Hon. Secretary"
                                        className="input-heritage"
                                        data-testid="co-sig-post"
                                    />
                                </div>
                                <div>
                                    <label className="label-heritage">Co-Signatory Name</label>
                                    <input
                                        value={coName}
                                        onChange={(e) => setCoName(e.target.value)}
                                        placeholder="Shri Sanjay Jagdale"
                                        className="input-heritage"
                                        data-testid="co-sig-name"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="label-heritage">Remarks / Notes</label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Optional — note any conditions or references for the audit trail."
                            className="input-heritage !border-mpca-gray/40 !p-2"
                            data-testid="claim-action-notes"
                        />
                    </div>
                </div>
                <div className="px-6 pb-5 flex items-center justify-end gap-3">
                    <button onClick={onClose} disabled={busy} data-testid="claim-action-cancel" className="btn-heritage-ghost">
                        Cancel
                    </button>
                    <button onClick={handleConfirm} disabled={busy} data-testid="claim-action-confirm" className={meta.colour}>
                        {busy ? "Working…" : "Confirm · " + meta.label}
                    </button>
                </div>
            </div>
        </div>
    );
};

const DetailDrawer = ({ claim, persona, onClose, onAction }) => {
    if (!claim) return null;
    const acts = allowedActions(persona, claim);
    return (
        <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" data-testid="claim-detail-drawer">
            <div className="bg-mpca-ivory w-full max-w-2xl h-full overflow-y-auto border-l-2 border-mpca-brass">
                <div className="bg-mpca-green-dark text-mpca-ivory px-7 py-6 border-b-4 border-mpca-oxblood relative">
                    <button onClick={onClose} data-testid="claim-drawer-close" className="absolute top-4 right-5 text-mpca-gold-light hover:text-mpca-oxblood text-2xl">×</button>
                    <div className="overline !text-mpca-gold-light">{claim.claim_no} · {claim.fiscal_cycle}</div>
                    <div className="font-serif text-3xl mt-2 leading-tight">{claim.title}</div>
                    <div className="text-sm text-mpca-gold-light/85 mt-3">{CATEGORY_LABEL[claim.category]} · From <strong>{claim.body_id}</strong></div>
                    <div className="font-serif text-4xl text-mpca-gold-light mt-4">{fmtINR(claim.amount_inr)}</div>
                    <div className="mt-4"><Pill status={claim.status} /></div>
                </div>

                <div className="p-7">
                    {claim.description && (
                        <div className="mb-7">
                            <div className="overline mb-2">Description</div>
                            <p className="text-sm text-mpca-charcoal leading-relaxed">{claim.description}</p>
                        </div>
                    )}

                    {Array.isArray(claim.supporting_doc_urls) && claim.supporting_doc_urls.length > 0 && (
                        <div className="mb-7" data-testid="claim-attachments">
                            <div className="overline mb-3">Attachments · {claim.supporting_doc_urls.length}</div>
                            <ul className="space-y-1.5">
                                {claim.supporting_doc_urls.map((u, idx) => {
                                    const base = process.env.REACT_APP_BACKEND_URL;
                                    const href = u.startsWith("http") ? u : `${base}${u}`;
                                    const name = (u.split("/").pop() || `Document ${idx + 1}`).slice(0, 60);
                                    return (
                                        <li key={u}>
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                data-testid={"claim-attachment-" + idx}
                                                className="flex items-center gap-2 text-xs text-mpca-oxblood hover:underline border border-mpca-brass/30 px-3 py-2"
                                            >
                                                <span className="font-mono text-[10px] text-mpca-brass">DOC-{String(idx + 1).padStart(2, "0")}</span>
                                                <span className="truncate">{name}</span>
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    <div className="overline mb-3">Approval Trail · Maker-Checker</div>
                    {claim.approval_chain.length === 0 ? (
                        <div className="text-sm italic text-mpca-gray-dark border border-dashed border-mpca-brass/40 p-4">
                            No actions taken yet. Claim is still in {claim.status}.
                        </div>
                    ) : (
                        <ol className="relative border-l-2 border-mpca-brass/40 pl-6 space-y-5">
                            {claim.approval_chain.map((step, idx) => (
                                <li key={idx} className="relative" data-testid={"claim-chain-step-" + idx}>
                                    <span className="absolute -left-[33px] top-1 w-4 h-4 rounded-full bg-mpca-oxblood border-2 border-mpca-ivory" />
                                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                                        <div className="font-serif text-base text-mpca-green-dark">
                                            {step.stage.replace(/_/g, " ")} · <span className="text-mpca-oxblood">{step.decision}</span>
                                        </div>
                                        <div className="text-[10px] tracking-[0.15em] uppercase text-mpca-gray-dark font-mono">
                                            {fmtDate(step.timestamp)}
                                        </div>
                                    </div>
                                    <div className="text-xs text-mpca-charcoal">
                                        <strong>{step.actor_post}</strong>{step.actor_name && " · " + step.actor_name} <span className="text-mpca-gray-dark">({step.actor_body_id})</span>
                                    </div>
                                    {step.notes && (
                                        <div className="mt-2 text-xs italic text-mpca-gray-dark bg-mpca-parchment/60 p-2 border-l-2 border-mpca-brass/50">
                                            "{step.notes}"
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}

                    {acts.length > 0 ? (
                        <div className="mt-8 pt-6 border-t border-mpca-brass/30">
                            <div className="overline mb-3">Available Actions · As {persona.honorific} {persona.name}</div>
                            <div className="flex flex-wrap gap-3">
                                {acts.map((a) => (
                                    <button
                                        key={a}
                                        onClick={() => onAction(a)}
                                        data-testid={"claim-act-" + a}
                                        className={ACTION_META[a].colour}
                                    >
                                        {ACTION_META[a].label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-8 pt-6 border-t border-mpca-brass/30">
                            <div className="overline">No Actions Available</div>
                            <p className="text-xs text-mpca-gray-dark mt-2">
                                {persona?.body_type === "Public"
                                    ? "Public personas cannot act on workflow."
                                    : "This persona has no actions for the current claim stage. Your scope: " + (persona?.body_type || "—") + " · " + (persona?.body_code || "—") + "."}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Claims = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [claims, setClaims] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState(null);
    const [actionOpen, setActionOpen] = useState(null);

    const load = async () => {
        const [c, s] = await Promise.all([fetchClaims(), fetchClaimsStats()]);
        setClaims(c);
        setStats(s);
    };

    useEffect(() => {
        (async () => {
            try {
                await load();
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        if (filter === "all") return claims;
        if (filter === "my-queue") {
            if (!persona) return [];
            // Queue logic:
            //   District persona — claims they originated (status not yet terminal)
            //   Division persona — claims awaiting their recommendation
            //   State persona — claims awaiting MPCA action
            if (persona.body_type === "District") {
                return claims.filter((c) => c.body_id === persona.body_code);
            }
            if (persona.body_type === "Division") {
                return claims.filter((c) => c.parent_body_id === persona.body_code && c.status === "Submitted");
            }
            if (persona.body_type === "State") {
                return claims.filter((c) => ["Division_Recommended", "MPCA_Sanctioned"].includes(c.status));
            }
            return claims;
        }
        return claims.filter((c) => c.status === filter);
    }, [claims, filter, persona]);

    const handleActionDone = async () => {
        setActionOpen(null);
        await load();
        // re-fetch the selected claim if open
        if (selected) {
            const fresh = (await fetchClaims()).find((c) => c.id === selected.id);
            setSelected(fresh || null);
        }
    };

    if (loading) {
        return <div className="p-16" data-testid="claims-loading"><CricketLoader size="lg" label="Loading the claims register…" /></div>;
    }

    const canCreate = persona && (persona.body_type === "District" || persona.body_type === "State");

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="claims-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article XIV · Grant Claims</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Grant Claims Register
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The District → Division → MPCA flow per Constitution Art. 28(v).
                        Every approval signed, every cheque traced.
                    </p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => navigate("/claims/new")}
                        className="btn-heritage-primary"
                        data-testid="new-claim-btn"
                    >
                        <Plus size={14} strokeWidth={2} />
                        Raise a New Claim
                    </button>
                )}
            </div>

            <div className="crest-divider mb-10" />

            {/* Stats */}
            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-12" data-testid="claims-stats">
                    <StatTile icon={HandCoins}   label="Total Claims"      value={stats.total_claims}                  sub="All cycles · all stages"                          accent="navy" />
                    <StatTile icon={Clock}        label="Pending Approval"  value={stats.pending_claims}                sub={fmtINR(stats.amount_in_flight_inr) + " in-flight"} accent="saffron" />
                    <StatTile icon={CheckCircle2} label="Disbursed"         value={stats.disbursed_claims}              sub={fmtINR(stats.amount_disbursed_inr) + " released"}  accent="marigold" />
                    <StatTile icon={XCircle}      label="Rejected"          value={stats.rejected_claims}               sub="Returned without disbursal"                          accent="maroon" />
                </div>
            )}

            {/* Filter tabs */}
            <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="claims-filters">
                {[
                    ["all",                  "All Claims"],
                    ["my-queue",             persona?.body_type === "District" ? "My Claims" : persona?.body_type === "Division" ? "Awaiting My Recommendation" : persona?.body_type === "State" ? "Awaiting MPCA Action" : "My Queue"],
                    ["Draft",                "Draft"],
                    ["Submitted",            "Submitted"],
                    ["Division_Recommended", "Division Recommended"],
                    ["MPCA_Sanctioned",      "MPCA Sanctioned"],
                    ["Disbursed",            "Disbursed"],
                    ["Rejected",             "Rejected"],
                ].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setFilter(k)}
                        data-testid={"claims-filter-" + k}
                        className={
                            "px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold border transition-colors " +
                            (filter === k
                                ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:bg-mpca-parchment")
                        }
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Claims table */}
            <div className="bulletin-card overflow-hidden" data-testid="claims-list">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">
                        No claims match this filter.
                    </div>
                ) : (
                    filtered.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => setSelected(c)}
                            data-testid={"claim-row-" + c.claim_no}
                            className="ledger-row w-full text-left flex flex-wrap items-center gap-4 px-6 py-4"
                        >
                            <div className="font-mono text-[10px] text-mpca-brass tracking-wider w-28">
                                {c.claim_no}
                            </div>
                            <div className="flex-1 min-w-[280px]">
                                <div className="font-serif text-lg text-mpca-green-dark leading-tight flex items-center gap-2">
                                    {c.title}
                                    {c.is_overdue && (
                                        <span
                                            data-testid={"claim-overdue-flag-" + c.claim_no}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-mpca-oxblood text-white text-[9px] tracking-wider uppercase font-semibold"
                                            title={c.due_at ? `SLA due ${new Date(c.due_at).toLocaleString()}` : "Overdue"}
                                        >
                                            <AlertTriangle size={9} strokeWidth={2} />
                                            Overdue
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] text-mpca-gray-dark mt-1 flex items-center gap-2">
                                    {c.body_id.startsWith("DIV") ? <Building2 size={11} /> : c.body_id.startsWith("DIST") ? <MapPin size={11} /> : <Landmark size={11} />}
                                    {c.body_id}
                                    <span>·</span>
                                    {CATEGORY_LABEL[c.category]}
                                </div>
                            </div>
                            <div className="font-serif text-xl text-mpca-green-dark whitespace-nowrap">
                                {fmtINR(c.amount_inr)}
                            </div>
                            <Pill status={c.status} />
                            <ChevronRight size={14} className="text-mpca-gray" />
                        </button>
                    ))
                )}
            </div>

            <DetailDrawer
                claim={selected}
                persona={persona}
                onClose={() => setSelected(null)}
                onAction={(a) => setActionOpen(a)}
            />
            <ActionDialog
                open={!!actionOpen}
                action={actionOpen}
                claim={selected}
                persona={persona}
                onClose={() => setActionOpen(null)}
                onDone={handleActionDone}
            />
        </div>
    );
};

export default Claims;
