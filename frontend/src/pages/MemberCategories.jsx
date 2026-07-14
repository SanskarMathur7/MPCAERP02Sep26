import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Tag, Save, Trash2, X } from "lucide-react";
import {
    fetchMemberCategories,
    createMemberCategory,
    updateMemberCategory,
    deleteMemberCategory,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

const BASE_CATEGORIES = ["Individual", "Institutional", "Honorary", "Patron"];
const APPLIES_OPTIONS = ["Both", "MPCA", "Division"];

const emptyForm = {
    name: "",
    code: "",
    description: "",
    applies_to: "Both",
    base_category: "Individual",
    fee_amount_inr: "",
    display_order: 100,
    active: true,
};

const MemberCategories = () => {
    const { isOfficeBearer } = useAuth();
    const [cats, setCats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // category id being edited
    const [form, setForm] = useState(emptyForm);
    const [showNew, setShowNew] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchMemberCategories();
            setCats(data);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                ...form,
                fee_amount_inr: form.fee_amount_inr === "" ? null : Number(form.fee_amount_inr),
                display_order: Number(form.display_order) || 100,
            };
            if (editing) {
                await updateMemberCategory(editing, payload);
            } else {
                await createMemberCategory(payload);
            }
            setForm(emptyForm);
            setEditing(null);
            setShowNew(false);
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (cat) => {
        setEditing(cat.id);
        setForm({
            name: cat.name || "",
            code: cat.code || "",
            description: cat.description || "",
            applies_to: cat.applies_to || "Both",
            base_category: cat.base_category || "Individual",
            fee_amount_inr: cat.fee_amount_inr ?? "",
            display_order: cat.display_order ?? 100,
            active: cat.active !== false,
        });
        setShowNew(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this category? Existing members retain their sub_category text.")) return;
        try {
            await deleteMemberCategory(id);
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        }
    };

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="member-categories-page">
            <Link to="/members" className="btn-heritage-ghost mb-6 inline-flex" data-testid="back-to-members">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Register
            </Link>

            <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
                <div>
                    <div className="overline">Article V.2 · Category Ledger</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-2 leading-tight">
                        Member Categories
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Configure the sub-categories under which members are enrolled — e.g. Life Member,
                        Annual Member, Office Bearer, District Association, School, etc.
                    </p>
                </div>
                {isOfficeBearer && (
                    <button
                        className="btn-heritage-primary"
                        onClick={() => { setEditing(null); setForm(emptyForm); setShowNew(true); }}
                        data-testid="new-category-btn"
                    >
                        <Plus size={14} strokeWidth={1.5} /> New Category
                    </button>
                )}
            </div>

            <div className="crest-divider mb-8" />

            {showNew && isOfficeBearer && (
                <div className="bulletin-card p-6 mb-8 relative" data-testid="category-form">
                    <button
                        onClick={() => { setShowNew(false); setEditing(null); setForm(emptyForm); }}
                        className="absolute top-3 right-3 text-mpca-brass hover:text-mpca-oxblood"
                    >
                        <X size={18} strokeWidth={1.5} />
                    </button>
                    <div className="overline mb-2">{editing ? "Edit" : "New"} Category</div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Name *</div>
                            <input
                                className="input-heritage"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. Life Member"
                                data-testid="cat-name-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Short Code</div>
                            <input
                                className="input-heritage font-mono"
                                value={form.code}
                                onChange={(e) => setForm({ ...form, code: e.target.value })}
                                placeholder="e.g. LM"
                                data-testid="cat-code-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Applies to</div>
                            <select
                                className="input-heritage"
                                value={form.applies_to}
                                onChange={(e) => setForm({ ...form, applies_to: e.target.value })}
                                data-testid="cat-applies-select"
                            >
                                {APPLIES_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Base Category (constitutional)</div>
                            <select
                                className="input-heritage"
                                value={form.base_category}
                                onChange={(e) => setForm({ ...form, base_category: e.target.value })}
                                data-testid="cat-base-select"
                            >
                                {BASE_CATEGORIES.map((o) => <option key={o}>{o}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Fee (₹, optional)</div>
                            <input
                                type="number"
                                className="input-heritage font-mono"
                                value={form.fee_amount_inr}
                                onChange={(e) => setForm({ ...form, fee_amount_inr: e.target.value })}
                                data-testid="cat-fee-input"
                            />
                        </label>
                        <label className="block">
                            <div className="overline text-[9px] mb-1">Display Order</div>
                            <input
                                type="number"
                                className="input-heritage font-mono"
                                value={form.display_order}
                                onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                                data-testid="cat-order-input"
                            />
                        </label>
                        <label className="block md:col-span-2">
                            <div className="overline text-[9px] mb-1">Description</div>
                            <textarea
                                className="input-heritage min-h-[70px]"
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                data-testid="cat-desc-input"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-mpca-charcoal">
                            <input
                                type="checkbox"
                                checked={form.active}
                                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                                data-testid="cat-active-toggle"
                            />
                            Active — available in enrolment forms
                        </label>
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                        <button
                            className="btn-heritage-primary"
                            onClick={handleSave}
                            disabled={!form.name || saving}
                            data-testid="save-cat-btn"
                        >
                            <Save size={14} strokeWidth={1.5} /> {saving ? "Saving…" : editing ? "Update" : "Create"}
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <CricketLoader label="Loading categories…" />
            ) : cats.length === 0 ? (
                <div className="text-center py-20 bulletin-card" data-testid="cats-empty">
                    <Tag className="mx-auto text-mpca-brass mb-4" size={36} strokeWidth={1} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No categories configured yet.</div>
                    <p className="text-mpca-gray-dark text-sm mt-2">Add categories such as Life Member, Annual Member, Office Bearer, etc.</p>
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-mpca-green-dark text-mpca-gold-light border-b border-mpca-brass/40">
                        <div className="col-span-3 overline !text-mpca-gold-light">Name</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Code</div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Applies to</div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Base</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Fee</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Order</div>
                        <div className="col-span-2 overline !text-mpca-gold-light text-right">Actions</div>
                    </div>
                    {cats.map((c) => (
                        <div key={c.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-mpca-brass/15" data-testid={`cat-row-${c.code || c.name}`}>
                            <div className="col-span-3">
                                <div className="font-serif text-lg text-mpca-green-dark">{c.name}</div>
                                {c.description && <div className="text-[11px] text-mpca-gray-dark italic mt-0.5">{c.description}</div>}
                            </div>
                            <div className="col-span-1 font-mono text-[11px] text-mpca-brass">{c.code}</div>
                            <div className="col-span-2 text-xs">
                                <span className={`pill ${c.applies_to === "MPCA" ? "pill-active" : c.applies_to === "Division" ? "pill-pending" : "pill-lapsed"}`}>
                                    {c.applies_to}
                                </span>
                            </div>
                            <div className="col-span-2 text-sm text-mpca-charcoal">{c.base_category}</div>
                            <div className="col-span-1 font-mono text-xs text-mpca-charcoal">
                                {c.fee_amount_inr != null ? `₹${Number(c.fee_amount_inr).toLocaleString("en-IN")}` : "—"}
                            </div>
                            <div className="col-span-1 font-mono text-xs text-mpca-gray-dark">{c.display_order}</div>
                            <div className="col-span-2 flex justify-end gap-2">
                                {isOfficeBearer && (
                                    <>
                                        <button className="btn-heritage-ghost !py-1 !px-2" onClick={() => handleEdit(c)} data-testid={`edit-cat-${c.code || c.name}`}>Edit</button>
                                        <button className="btn-heritage-ghost !py-1 !px-2 !text-mpca-oxblood" onClick={() => handleDelete(c.id)} data-testid={`delete-cat-${c.code || c.name}`}>
                                            <Trash2 size={12} strokeWidth={1.5} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!isOfficeBearer && (
                <div className="mt-6 text-xs text-mpca-gray-dark italic font-serif">
                    Read-only view · Only office bearers may create or modify categories.
                </div>
            )}
        </div>
    );
};

export default MemberCategories;
