import { useEffect, useState } from "react";
import { Plus, Star, X, Trash2, Calendar, Award, Save } from "lucide-react";
import { addMembershipAssignment, removeMembershipAssignment, updateMembershipAssignment, fetchMemberCategories } from "@/lib/api";

const emptyForm = {
    category: "",
    role: "",
    committee: "",
    start_date: "",
    end_date: "",
    is_primary: false,
    term_ref: "",
    notes: "",
};

const isCurrent = (a) => {
    if (!a.end_date) return true;
    try { return new Date(a.end_date) >= new Date(); } catch (_) { return true; }
};

const fmt = (d) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch (_) { return d; }
};

const MembershipAssignments = ({ member, canManage, onChange }) => {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [subCats, setSubCats] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        fetchMemberCategories({ active_only: true }).then(setSubCats).catch(() => setSubCats([]));
    }, []);

    const assignments = member.memberships || [];
    const current = assignments.filter(isCurrent);
    const past = assignments.filter((a) => !isCurrent(a));

    const startAdd = () => {
        setForm(emptyForm);
        setEditingId(null);
        setErr(null);
        setShowForm(true);
    };

    const startEdit = (a) => {
        setForm({
            category: a.category || "",
            role: a.role || "",
            committee: a.committee || "",
            start_date: a.start_date || "",
            end_date: a.end_date || "",
            is_primary: !!a.is_primary,
            term_ref: a.term_ref || "",
            notes: a.notes || "",
        });
        setEditingId(a.id);
        setErr(null);
        setShowForm(true);
    };

    const handleSave = async () => {
        setBusy(true);
        setErr(null);
        try {
            const payload = { ...form };
            Object.keys(payload).forEach((k) => {
                if (payload[k] === "" && k !== "category") payload[k] = null;
            });
            const updated = editingId
                ? await updateMembershipAssignment(member.id, editingId, payload)
                : await addMembershipAssignment(member.id, payload);
            onChange?.(updated);
            setShowForm(false);
            setEditingId(null);
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (aid) => {
        if (!window.confirm("End & remove this assignment from the record? (History is preserved via end_date if you'd rather retire it.)")) return;
        try {
            const updated = await removeMembershipAssignment(member.id, aid);
            onChange?.(updated);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        }
    };

    return (
        <div className="bulletin-card p-7" data-testid="positions-held-card">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="overline">Positions & Assignments</div>
                    <h3 className="font-serif text-2xl text-mpca-green-dark leading-tight mt-1">Positions Held</h3>
                </div>
                {canManage && !showForm && (
                    <button className="btn-heritage-ghost !py-1.5 !px-3" onClick={startAdd} data-testid="add-assignment-btn">
                        <Plus size={13} strokeWidth={1.5} /> Add
                    </button>
                )}
            </div>

            {showForm && canManage && (
                <div className="border border-mpca-brass/40 bg-mpca-parchment/40 p-5 mb-6 relative" data-testid="assignment-form">
                    <button onClick={() => { setShowForm(false); setEditingId(null); }} className="absolute top-3 right-3 text-mpca-brass hover:text-mpca-oxblood">
                        <X size={16} strokeWidth={1.5} />
                    </button>
                    <div className="overline mb-3">{editingId ? "Edit assignment" : "New assignment"}</div>
                    <div className="grid md:grid-cols-2 gap-3">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Category *</div>
                            <select
                                className="input-heritage"
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                                data-testid="assign-category-select"
                            >
                                <option value="">— Choose category —</option>
                                {subCats.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Role / Designation</div>
                            <input
                                className="input-heritage"
                                value={form.role}
                                onChange={(e) => setForm({ ...form, role: e.target.value })}
                                placeholder="e.g. Vice President, Member"
                                data-testid="assign-role-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Committee (optional)</div>
                            <input
                                className="input-heritage"
                                value={form.committee}
                                onChange={(e) => setForm({ ...form, committee: e.target.value })}
                                placeholder="e.g. Managing Committee, Selection Committee"
                                data-testid="assign-committee-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Term Reference</div>
                            <input
                                className="input-heritage font-mono"
                                value={form.term_ref}
                                onChange={(e) => setForm({ ...form, term_ref: e.target.value })}
                                placeholder="e.g. AGM-2024"
                                data-testid="assign-term-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Start Date</div>
                            <input
                                type="date"
                                className="input-heritage font-mono"
                                value={form.start_date || ""}
                                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                                data-testid="assign-start-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">End Date (leave blank = lifetime / active)</div>
                            <input
                                type="date"
                                className="input-heritage font-mono"
                                value={form.end_date || ""}
                                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                                data-testid="assign-end-input"
                            />
                        </label>
                        <label className="block md:col-span-2">
                            <div className="overline text-[9px] mb-1">Notes</div>
                            <textarea
                                className="input-heritage min-h-[60px]"
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                data-testid="assign-notes-input"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-mpca-charcoal md:col-span-2">
                            <input
                                type="checkbox"
                                checked={form.is_primary}
                                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                                data-testid="assign-primary-toggle"
                            />
                            Mark as <strong>Primary</strong> — this label appears on the identity card, fees, and register list.
                        </label>
                    </div>
                    {err && (
                        <div className="mt-3 text-xs text-mpca-oxblood bg-mpca-oxblood/10 border border-mpca-oxblood/40 p-2" data-testid="assign-error">
                            {typeof err === "string" ? err : JSON.stringify(err)}
                        </div>
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            className="btn-heritage-primary"
                            onClick={handleSave}
                            disabled={busy || !form.category}
                            data-testid="save-assignment-btn"
                        >
                            <Save size={13} strokeWidth={1.5} /> {busy ? "Saving…" : editingId ? "Update" : "Add Assignment"}
                        </button>
                    </div>
                </div>
            )}

            {assignments.length === 0 ? (
                <div className="text-center py-8 text-mpca-gray-dark italic font-serif text-sm" data-testid="no-assignments">
                    No additional assignments recorded. {canManage && "Click Add to record a role, committee or category."}
                </div>
            ) : (
                <>
                    {current.length > 0 && (
                        <div className="mb-5" data-testid="current-assignments">
                            <div className="overline text-[9px] mb-3">Currently Held ({current.length})</div>
                            <ul className="space-y-2">
                                {current.map((a) => (
                                    <AssignmentRow key={a.id} a={a} canManage={canManage} onEdit={startEdit} onRemove={handleRemove} />
                                ))}
                            </ul>
                        </div>
                    )}
                    {past.length > 0 && (
                        <div data-testid="past-assignments">
                            <div className="overline text-[9px] mb-3">Past — Tenure History ({past.length})</div>
                            <ul className="space-y-2 opacity-70">
                                {past.map((a) => (
                                    <AssignmentRow key={a.id} a={a} canManage={canManage} onEdit={startEdit} onRemove={handleRemove} past />
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const AssignmentRow = ({ a, canManage, onEdit, onRemove, past }) => (
    <li className="border border-mpca-brass/25 bg-white/60 p-3 flex flex-wrap items-start gap-3" data-testid={`assignment-row-${a.id}`}>
        <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="font-serif text-lg text-mpca-green-dark">{a.category}</span>
                {a.is_primary && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-mpca-brass font-mono">
                        <Star size={11} strokeWidth={1.5} /> Primary
                    </span>
                )}
                {past && <span className="text-[10px] uppercase tracking-wider text-mpca-gray-dark font-mono">Ended</span>}
            </div>
            {(a.role || a.committee) && (
                <div className="text-sm text-mpca-charcoal mt-1 flex items-center gap-2 flex-wrap">
                    {a.role && <span>{a.role}</span>}
                    {a.committee && <><span className="text-mpca-brass">·</span><span className="italic font-serif">{a.committee}</span></>}
                </div>
            )}
            <div className="text-[11px] text-mpca-gray-dark mt-1 flex items-center gap-3 flex-wrap font-mono">
                <span className="inline-flex items-center gap-1"><Calendar size={11} strokeWidth={1.5} /> {fmt(a.start_date)} — {fmt(a.end_date)}</span>
                {a.term_ref && <span className="inline-flex items-center gap-1"><Award size={11} strokeWidth={1.5} /> {a.term_ref}</span>}
            </div>
            {a.notes && <div className="text-xs italic text-mpca-gray-dark mt-1 font-serif">{a.notes}</div>}
        </div>
        {canManage && (
            <div className="flex gap-1">
                <button className="btn-heritage-ghost !py-1 !px-2 !text-[11px]" onClick={() => onEdit(a)} data-testid={`edit-assignment-${a.id}`}>Edit</button>
                <button className="btn-heritage-ghost !py-1 !px-2 !text-mpca-oxblood" onClick={() => onRemove(a.id)} data-testid={`remove-assignment-${a.id}`}>
                    <Trash2 size={11} strokeWidth={1.5} />
                </button>
            </div>
        )}
    </li>
);

export default MembershipAssignments;
