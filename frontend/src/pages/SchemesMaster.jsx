import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Edit3, X, Save, Sparkles, ChevronRight, IndianRupee } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const SCHEME_TYPES = ["All", "Annual_Grant", "Reimbursement", "Camp", "Award", "Welfare", "Infrastructure", "Revenue_Share"];

const SchemesMaster = () => {
    const { persona } = useAuth();
    const [schemes, setSchemes] = useState([]);
    const [recos, setRecos] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("All");
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(null);

    const isMPCA = persona?.body_type === "State";
    const canEdit = isMPCA;

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: s }, { data: r }] = await Promise.all([
                api.get("/reimbursement-schemes", { params: { active_only: false } }),
                api.get("/schemes-recommendations").catch(() => ({ data: null })),
            ]);
            setSchemes(s || []);
            setRecos(r);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        let list = schemes;
        if (filter !== "All") list = list.filter((s) => s.scheme_type === filter);
        return list;
    }, [schemes, filter]);

    const startEdit = (s) => setEditing({ ...s, conditions: [...(s.conditions || [])], required_documents: [...(s.required_documents || [])] });

    const saveEdit = async () => {
        try {
            const patch = {
                name: editing.name, description: editing.description,
                scheme_type: editing.scheme_type, eligible_bodies: editing.eligible_bodies,
                categories: editing.categories, heads: editing.heads,
                conditions: editing.conditions, required_documents: editing.required_documents,
                frequency: editing.frequency, is_active: editing.is_active,
            };
            await api.patch(`/reimbursement-schemes/${editing.scheme_code}`, patch);
            setEditing(null);
            setSelected(null);
            await load();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    if (loading) return <CricketLoader label="Loading schemes..." />;

    const cur = editing || selected;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="schemes-master-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Financial · MPCA Master Document</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">MPCA Schemes Register</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        {isMPCA
                            ? "Full catalogue of MPCA reimbursement, grant, camp, and welfare schemes from the Master Document. As MPCA, you can edit any scheme."
                            : "Read-only catalogue of MPCA schemes available to your body. Click any scheme to see full details, budget heads, required documents, and eligibility conditions."}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {recos && (
                        <div className="bulletin-card px-4 py-3 text-right">
                            <div className="overline text-[9px]">Total Potential (FY 25-26)</div>
                            <div className="font-serif text-2xl text-mpca-oxblood" data-testid="total-potential">{fmt(recos.total_potential_inr)}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Filter chips */}
            <div className="flex gap-1 mb-5 flex-wrap">
                {SCHEME_TYPES.map((t) => {
                    const cnt = t === "All" ? schemes.length : schemes.filter((s) => s.scheme_type === t).length;
                    return (
                        <button key={t} onClick={() => setFilter(t)}
                            className={`px-3 py-1.5 text-[11px] uppercase tracking-widest border ${filter === t ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "border-mpca-brass/40 text-mpca-green-dark"}`}
                            data-testid={`filter-${t}`}>
                            {t.replace(/_/g, " ")} <span className="opacity-70 ml-1">({cnt})</span>
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
                {/* Left column: scheme list */}
                <div className="space-y-2" data-testid="scheme-list">
                    {filtered.map((s) => {
                        const reco = recos?.recommendations?.find((r) => r.scheme_code === s.scheme_code);
                        return (
                            <button key={s.scheme_code} onClick={() => { setSelected(s); setEditing(null); }}
                                className={`w-full text-left p-3 border transition-colors ${cur?.scheme_code === s.scheme_code ? "border-mpca-oxblood bg-mpca-cream/40" : "border-mpca-brass/30 hover:bg-mpca-cream/30"}`}
                                data-testid={`scheme-row-${s.scheme_code}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] text-mpca-brass">Scheme {s.scheme_code}</span>
                                            {reco?.state === "already_claimed" && <span className="text-[9px] uppercase text-mpca-green-dark tracking-widest">Claimed</span>}
                                        </div>
                                        <div className="font-serif text-sm text-mpca-green-dark mt-0.5">{s.name}</div>
                                        <div className="text-[10px] text-mpca-gray-dark mt-1">
                                            <span className="capitalize">{(s.scheme_type || "").replace(/_/g, " ")}</span> · {s.frequency} · {(s.eligible_bodies || []).join("/")}
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-mpca-brass shrink-0" />
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Right column: detail / edit */}
                <div className="bulletin-card p-6 sticky top-6 h-fit" data-testid="scheme-detail">
                    {!cur ? (
                        <div className="text-center py-12">
                            <BookOpen className="mx-auto text-mpca-brass mb-3" size={32} />
                            <div className="font-serif text-lg text-mpca-green-dark">Select a scheme to view details</div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-start justify-between gap-4 mb-3">
                                <div>
                                    <div className="overline text-[9px]">Scheme {cur.scheme_code} · {(cur.scheme_type || "").replace(/_/g, " ")}</div>
                                    {editing ? (
                                        <input className="input-heritage font-serif text-xl mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="edit-name" />
                                    ) : (
                                        <h2 className="font-serif text-2xl text-mpca-green-dark mt-1" data-testid="detail-name">{cur.name}</h2>
                                    )}
                                    <div className="text-[10px] text-mpca-gray-dark mt-1">
                                        Frequency: {cur.frequency} · Eligible: {(cur.eligible_bodies || []).join(", ")}
                                    </div>
                                </div>
                                {canEdit && !editing && (
                                    <button className="btn-heritage-secondary" onClick={() => startEdit(cur)} data-testid="edit-scheme-btn"><Edit3 size={12} /> Edit</button>
                                )}
                                {editing && (
                                    <div className="flex gap-2">
                                        <button className="btn-heritage-secondary" onClick={() => setEditing(null)}><X size={12} /> Cancel</button>
                                        <button className="btn-heritage-primary" onClick={saveEdit} data-testid="save-scheme-btn"><Save size={12} /> Save</button>
                                    </div>
                                )}
                            </div>
                            {editing ? (
                                <textarea rows={3} className="input-heritage text-sm mb-4" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} data-testid="edit-desc" />
                            ) : (
                                <p className="text-sm text-mpca-gray-dark mb-4">{cur.description}</p>
                            )}

                            {/* Budget heads */}
                            <div className="mb-4">
                                <div className="overline text-[9px] mb-2">Budget Heads ({(cur.heads || []).length})</div>
                                <div className="space-y-1">
                                    {(cur.heads || []).map((h, i) => (
                                        <div key={i} className="flex justify-between text-xs border-b border-mpca-brass/10 pb-1">
                                            <div className="text-mpca-green-dark">{h.label}</div>
                                            <div className="font-mono text-mpca-brass shrink-0 ml-3">{h.rate_display || fmt(h.rate_inr)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Required docs */}
                            {(cur.required_documents || []).length > 0 && (
                                <div className="mb-4">
                                    <div className="overline text-[9px] mb-2">Required Documents ({cur.required_documents.length})</div>
                                    <ul className="text-[11px] text-mpca-gray-dark list-disc pl-4 space-y-0.5">
                                        {cur.required_documents.map((d, i) => (
                                            editing ? (
                                                <li key={i} className="flex items-start gap-1">
                                                    <input className="input-heritage flex-1 text-[11px] py-0.5" value={d} onChange={(e) => {
                                                        const arr = [...editing.required_documents];
                                                        arr[i] = e.target.value;
                                                        setEditing({ ...editing, required_documents: arr });
                                                    }} />
                                                    <button onClick={() => setEditing({ ...editing, required_documents: editing.required_documents.filter((_, j) => j !== i) })} className="text-mpca-oxblood text-xs">×</button>
                                                </li>
                                            ) : <li key={i}>{d}</li>
                                        ))}
                                    </ul>
                                    {editing && <button className="text-[10px] text-mpca-brass mt-2 uppercase tracking-widest" onClick={() => setEditing({ ...editing, required_documents: [...editing.required_documents, "New document..."] })}>+ Add doc</button>}
                                </div>
                            )}

                            {/* Conditions */}
                            {(cur.conditions || []).length > 0 && (
                                <div className="mb-4">
                                    <div className="overline text-[9px] mb-2">Eligibility Conditions ({cur.conditions.length})</div>
                                    <ul className="text-[11px] text-mpca-gray-dark list-disc pl-4 space-y-0.5">
                                        {cur.conditions.map((c, i) => (
                                            editing ? (
                                                <li key={i} className="flex items-start gap-1">
                                                    <input className="input-heritage flex-1 text-[11px] py-0.5" value={c} onChange={(e) => {
                                                        const arr = [...editing.conditions];
                                                        arr[i] = e.target.value;
                                                        setEditing({ ...editing, conditions: arr });
                                                    }} />
                                                    <button onClick={() => setEditing({ ...editing, conditions: editing.conditions.filter((_, j) => j !== i) })} className="text-mpca-oxblood text-xs">×</button>
                                                </li>
                                            ) : <li key={i}>{c}</li>
                                        ))}
                                    </ul>
                                    {editing && <button className="text-[10px] text-mpca-brass mt-2 uppercase tracking-widest" onClick={() => setEditing({ ...editing, conditions: [...editing.conditions, "New condition..."] })}>+ Add condition</button>}
                                </div>
                            )}

                            {/* Claim button for Div/Dist */}
                            {!isMPCA && !editing && (
                                <Link to={`/grant-claims/new?scheme=${cur.scheme_code}`} className="btn-heritage-primary inline-flex mt-2" data-testid="claim-scheme-btn">
                                    <IndianRupee size={12} /> Claim under this scheme
                                </Link>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SchemesMaster;
