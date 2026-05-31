import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchVendors, createVendor, updateVendor, blacklistVendor, unblacklistVendor, deleteVendor,
} from "@/lib/api";
import { Users, Plus, ShieldAlert, ShieldCheck, Trash2, Pencil, X, MapPin } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const CATEGORIES = ["Hotel", "Travel", "Material", "Infra", "Catering", "Printing", "Services", "Other"];

const CAT_TONE = {
    Hotel: "active", Travel: "active", Material: "pending", Infra: "pending",
    Catering: "lapsed", Printing: "lapsed", Services: "lapsed", Other: "lapsed",
};

const Pill = ({ tone, label, testId }) => (
    <span className={"pill pill-" + tone} data-testid={testId}>{label}</span>
);

// ────────── Vendor form ──────────
const VendorForm = ({ open, onClose, onSaved, persona, initial }) => {
    const blank = {
        name: "", category: "Hotel", gstin: "", pan: "",
        contact_name: "", contact_phone: "", contact_email: "",
        address_line: "", city: "", state: "Madhya Pradesh", pincode: "",
        bank_account_no: "", bank_ifsc: "", notes: "",
    };
    const [form, setForm] = useState(initial || blank);
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) setForm(initial || blank); /* eslint-disable-next-line */ }, [open, initial]);
    if (!open) return null;

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = { ...form, body_id: persona.body_code || "MPCA" };
            const saved = initial
                ? await updateVendor(initial.id, payload)
                : await createVendor(payload);
            onSaved(saved);
            onClose();
        } catch (err) {
            alert(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="vendor-form-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between sticky top-0 z-10">
                    <div>
                        <div className="overline !text-mpca-gold-light">Vendor Master · {initial ? "Edit" : "New"}</div>
                        <div className="font-serif text-2xl mt-1">{initial ? "Edit Vendor" : "Empanel New Vendor"}</div>
                    </div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl" data-testid="vendor-form-close">×</button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Vendor Name *</label>
                            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-heritage" data-testid="vendor-name" />
                        </div>
                        <div>
                            <label className="label-heritage">Category *</label>
                            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input-heritage" data-testid="vendor-category">
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">GSTIN</label>
                            <input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} className="input-heritage" data-testid="vendor-gstin" placeholder="22AAAAA0000A1Z5" />
                        </div>
                        <div>
                            <label className="label-heritage">PAN</label>
                            <input value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))} className="input-heritage" data-testid="vendor-pan" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="label-heritage">Contact Name</label>
                            <input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} className="input-heritage" data-testid="vendor-contact-name" />
                        </div>
                        <div>
                            <label className="label-heritage">Phone</label>
                            <input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} className="input-heritage" data-testid="vendor-contact-phone" />
                        </div>
                        <div>
                            <label className="label-heritage">Email</label>
                            <input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} className="input-heritage" data-testid="vendor-contact-email" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Address</label>
                        <input value={form.address_line} onChange={(e) => setForm((f) => ({ ...f, address_line: e.target.value }))} className="input-heritage" data-testid="vendor-address" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="label-heritage">City</label>
                            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="input-heritage" data-testid="vendor-city" />
                        </div>
                        <div>
                            <label className="label-heritage">State</label>
                            <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} className="input-heritage" data-testid="vendor-state" />
                        </div>
                        <div>
                            <label className="label-heritage">Pincode</label>
                            <input value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} className="input-heritage" data-testid="vendor-pincode" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Bank A/C No</label>
                            <input value={form.bank_account_no} onChange={(e) => setForm((f) => ({ ...f, bank_account_no: e.target.value }))} className="input-heritage" data-testid="vendor-bank-ac" />
                        </div>
                        <div>
                            <label className="label-heritage">IFSC</label>
                            <input value={form.bank_ifsc} onChange={(e) => setForm((f) => ({ ...f, bank_ifsc: e.target.value }))} className="input-heritage" data-testid="vendor-ifsc" />
                        </div>
                    </div>
                    <div>
                        <label className="label-heritage">Notes</label>
                        <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-heritage" data-testid="vendor-notes" />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost" data-testid="vendor-cancel">Cancel</button>
                    <button type="submit" disabled={busy || !form.name.trim()} className="btn-heritage-primary" data-testid="vendor-save">
                        {busy ? "Saving…" : (initial ? "Save Changes" : "Empanel Vendor")}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ────────── Blacklist dialog ──────────
const BlacklistDialog = ({ vendor, onClose, onDone }) => {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    if (!vendor) return null;
    const submit = async () => {
        setBusy(true);
        try {
            const updated = await blacklistVendor(vendor.id, reason || "(no reason given)");
            onDone(updated);
            onClose();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="blacklist-dialog">
            <div className="bg-mpca-ivory border-2 border-mpca-oxblood max-w-md w-full">
                <div className="bg-mpca-oxblood text-mpca-ivory px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">Vendor Master</div>
                        <div className="font-serif text-2xl mt-1">Blacklist Vendor</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl">×</button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-mpca-gray-dark">
                        Blacklisting <span className="font-semibold text-mpca-oxblood">{vendor.name}</span> will block all future bills against this vendor until un-blacklisted.
                    </p>
                    <div>
                        <label className="label-heritage">Reason *</label>
                        <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="input-heritage" data-testid="blacklist-reason" placeholder="e.g. Quality failure on 3 consecutive orders" />
                    </div>
                </div>
                <div className="bg-mpca-cream px-6 py-4 flex justify-end gap-3 border-t border-mpca-brass/40">
                    <button onClick={onClose} className="btn-heritage-outline">Cancel</button>
                    <button onClick={submit} disabled={!reason.trim() || busy} className="btn-heritage-solid bg-mpca-oxblood hover:bg-mpca-oxblood/90 border-mpca-oxblood" data-testid="blacklist-confirm">
                        {busy ? "Blacklisting…" : "Confirm Blacklist"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ────────── Page ──────────
export default function Vendors() {
    const { persona } = useAuth();
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterCat, setFilterCat] = useState("All");
    const [search, setSearch] = useState("");
    const [includeBL, setIncludeBL] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [blacklisting, setBlacklisting] = useState(null);

    const reload = async () => {
        setLoading(true);
        try {
            const params = { include_blacklisted: includeBL };
            if (filterCat !== "All") params.category = filterCat;
            if (search.trim()) params.search = search.trim();
            const data = await fetchVendors(params);
            setVendors(data);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [filterCat, includeBL]);

    const canEdit = persona && ["president", "secretary", "treasurer"].includes(persona.id);

    const totals = useMemo(() => {
        const out = { total: vendors.length, active: 0, blacklisted: 0, by_cat: {} };
        for (const v of vendors) {
            if (v.is_blacklisted) out.blacklisted += 1; else out.active += 1;
            out.by_cat[v.category] = (out.by_cat[v.category] || 0) + 1;
        }
        return out;
    }, [vendors]);

    const handleDelete = async (v) => {
        if (!window.confirm(`Delete vendor ${v.name}? This will fail if any bills exist.`)) return;
        try {
            await deleteVendor(v.id);
            reload();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        }
    };

    const handleUnBL = async (v) => {
        if (!window.confirm(`Remove ${v.name} from blacklist?`)) return;
        try {
            await unblacklistVendor(v.id);
            reload();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        }
    };

    return (
        <div className="space-y-8" data-testid="vendors-page">
            <div className="flex items-center justify-between">
                <div>
                    <div className="overline">Financial · Procurement</div>
                    <h1 className="font-serif text-4xl text-mpca-navy mt-1">Vendor Master</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Empanelled vendor directory across Hotels, Travel, Material, Infrastructure, Catering, Printing and Services. Bills can only be raised against an active (non-blacklisted) vendor.
                    </p>
                </div>
                {canEdit && (
                    <button onClick={() => { setEditing(null); setFormOpen(true); }} className="btn-heritage-primary flex items-center gap-2" data-testid="empanel-vendor-btn">
                        <Plus className="w-4 h-4" /> Empanel Vendor
                    </button>
                )}
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border-l-4 border-mpca-navy bg-mpca-cream/70 p-4">
                    <div className="overline">Total Empanelled</div>
                    <div className="font-serif text-3xl text-mpca-navy mt-1" data-testid="stat-total">{totals.total}</div>
                </div>
                <div className="border-l-4 border-mpca-green-dark bg-mpca-cream/70 p-4">
                    <div className="overline">Active</div>
                    <div className="font-serif text-3xl text-mpca-green-dark mt-1" data-testid="stat-active">{totals.active}</div>
                </div>
                <div className="border-l-4 border-mpca-oxblood bg-mpca-cream/70 p-4">
                    <div className="overline">Blacklisted</div>
                    <div className="font-serif text-3xl text-mpca-oxblood mt-1" data-testid="stat-blacklisted">{totals.blacklisted}</div>
                </div>
                <div className="border-l-4 border-mpca-saffron bg-mpca-cream/70 p-4">
                    <div className="overline">Categories</div>
                    <div className="font-serif text-3xl text-mpca-saffron mt-1" data-testid="stat-categories">{Object.keys(totals.by_cat).length}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4 border-b border-mpca-brass/30 pb-4">
                <div>
                    <label className="label-heritage">Category</label>
                    <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="input-heritage" data-testid="filter-category">
                        <option value="All">All</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label-heritage">Search</label>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reload()} placeholder="Name / GSTIN / Vendor No." className="input-heritage w-72" data-testid="vendor-search" />
                </div>
                <button onClick={reload} className="btn-heritage-ghost" data-testid="apply-filters">Apply</button>
                <label className="flex items-center gap-2 text-sm text-mpca-gray-dark cursor-pointer ml-auto">
                    <input type="checkbox" checked={includeBL} onChange={(e) => setIncludeBL(e.target.checked)} data-testid="show-blacklisted-toggle" />
                    Show blacklisted
                </label>
            </div>

            {loading ? (
                <CricketLoader label="Loading vendors…" />
            ) : vendors.length === 0 ? (
                <div className="text-center py-16 text-mpca-gray-dark" data-testid="empty-vendors">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    No vendors match this filter.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {vendors.map((v) => (
                        <div key={v.id} className={`border-2 ${v.is_blacklisted ? "border-mpca-oxblood bg-mpca-oxblood/5" : "border-mpca-brass/40 bg-mpca-ivory"} p-5 space-y-3 transition-colors`} data-testid={`vendor-card-${v.id}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="overline">{v.vendor_no}</div>
                                    <h3 className="font-serif text-xl text-mpca-navy mt-1 truncate">{v.name}</h3>
                                </div>
                                <Pill tone={CAT_TONE[v.category] || "lapsed"} label={v.category} testId={`cat-${v.id}`} />
                            </div>
                            {v.is_blacklisted && (
                                <div className="bg-mpca-oxblood/10 border-l-2 border-mpca-oxblood text-mpca-oxblood text-xs p-2 flex items-start gap-2" data-testid={`bl-banner-${v.id}`}>
                                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span><strong>Blacklisted:</strong> {v.blacklist_reason || "—"}</span>
                                </div>
                            )}
                            <div className="text-sm text-mpca-gray-dark space-y-1">
                                {v.gstin && <div><span className="overline mr-2">GSTIN</span> <span className="font-mono">{v.gstin}</span></div>}
                                {v.contact_name && <div><span className="overline mr-2">Contact</span> {v.contact_name} {v.contact_phone && <span className="text-mpca-gray-dark/70">· {v.contact_phone}</span>}</div>}
                                {v.city && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {v.city}{v.state && `, ${v.state}`}</div>}
                            </div>
                            {canEdit && (
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-mpca-brass/30">
                                    <button onClick={() => { setEditing(v); setFormOpen(true); }} className="btn-heritage-ghost flex items-center gap-1 text-xs" data-testid={`edit-vendor-${v.id}`}>
                                        <Pencil className="w-3 h-3" /> Edit
                                    </button>
                                    {v.is_blacklisted ? (
                                        <button onClick={() => handleUnBL(v)} className="btn-heritage-ghost flex items-center gap-1 text-xs text-mpca-green-dark" data-testid={`unbl-${v.id}`}>
                                            <ShieldCheck className="w-3 h-3" /> Un-Blacklist
                                        </button>
                                    ) : (
                                        <button onClick={() => setBlacklisting(v)} className="btn-heritage-ghost flex items-center gap-1 text-xs text-mpca-oxblood" data-testid={`bl-${v.id}`}>
                                            <ShieldAlert className="w-3 h-3" /> Blacklist
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(v)} className="btn-heritage-ghost flex items-center gap-1 text-xs ml-auto" data-testid={`delete-vendor-${v.id}`}>
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <VendorForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => reload()} persona={persona || {}} initial={editing} />
            <BlacklistDialog vendor={blacklisting} onClose={() => setBlacklisting(null)} onDone={() => reload()} />
        </div>
    );
}
