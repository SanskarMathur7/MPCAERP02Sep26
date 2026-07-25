import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";
import {
    Shield, Users as UsersIcon, ScrollText, Plus, Save, Trash2, X, Search,
    CheckSquare, Square, Loader2, ShieldCheck, ShieldAlert,
} from "lucide-react";

const inputCls = "input-heritage !py-1.5 !text-xs";

// The 3 personas who can edit RBAC (Q3a)
const RBAC_ADMIN_PERSONA_IDS = ["president", "secretary", "system-administrator"];
const isRbacAdmin = (persona) => persona && RBAC_ADMIN_PERSONA_IDS.includes(persona.id) && persona.body_type === "State";


const RolesTab = ({ roles, catalog, onRefresh, persona }) => {
    const [selected, setSelected] = useState(roles[0] || null);
    const [pendingPerms, setPendingPerms] = useState(new Set());
    const [pendingDescription, setPendingDescription] = useState("");
    const [saving, setSaving] = useState(false);
    const [q, setQ] = useState("");

    useEffect(() => {
        if (selected) {
            setPendingPerms(new Set(selected.permissions || []));
            setPendingDescription(selected.description || "");
        }
    }, [selected]);

    const dirty = useMemo(() => {
        if (!selected) return false;
        const before = new Set(selected.permissions || []);
        if (before.size !== pendingPerms.size) return true;
        for (const p of before) if (!pendingPerms.has(p)) return true;
        if ((selected.description || "") !== pendingDescription) return true;
        return false;
    }, [selected, pendingPerms, pendingDescription]);

    const togglePerm = (perm) => {
        setPendingPerms((prev) => {
            const next = new Set(prev);
            if (next.has(perm)) next.delete(perm); else next.add(perm);
            return next;
        });
    };

    const toggleModule = (module, actions, allSet) => {
        setPendingPerms((prev) => {
            const next = new Set(prev);
            for (const a of actions) {
                const p = `${module}.${a}`;
                if (allSet) next.delete(p); else next.add(p);
            }
            return next;
        });
    };

    const save = async () => {
        setSaving(true);
        try {
            await api.patch(`/rbac/roles/${selected.id}`, {
                permissions: Array.from(pendingPerms),
                description: pendingDescription,
            });
            onRefresh();
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setSaving(false); }
    };

    const filteredRoles = roles.filter((r) =>
        !q || (r.name + " " + r.description + " " + r.body_scope).toLowerCase().includes(q.toLowerCase())
    );

    if (!catalog) return <div className="p-8 text-center text-mpca-gray-dark italic">Loading permission catalog…</div>;

    const scopeTone = (scope) => scope === "State" ? "bg-mpca-oxblood text-mpca-ivory"
        : scope === "Division" ? "bg-mpca-brass text-mpca-green-dark"
        : scope === "District" ? "bg-mpca-green-dark text-mpca-ivory"
        : "bg-mpca-parchment text-mpca-green-dark";

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="rbac-roles-tab">
            {/* Role list */}
            <div className="md:col-span-1 space-y-2">
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-2.5 text-mpca-gray-dark" />
                    <input placeholder="Search roles…" className={`${inputCls} pl-7`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="rbac-role-search" />
                </div>
                {filteredRoles.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                        <button key={r.id} onClick={() => setSelected(r)}
                            className={`w-full text-left p-3 border transition-colors ${active ? "border-mpca-oxblood bg-mpca-cream/40" : "border-mpca-brass/30 hover:bg-mpca-cream/30"}`}
                            data-testid={`rbac-role-row-${r.id}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                    <div className="font-serif text-sm text-mpca-green-dark">{r.name}</div>
                                    <div className="text-[10px] text-mpca-gray-dark mt-0.5">{r.description}</div>
                                </div>
                                <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 ${scopeTone(r.body_scope)}`}>{r.body_scope}</span>
                            </div>
                            <div className="text-[10px] font-mono text-mpca-brass mt-1">{r.permissions.length} permissions</div>
                        </button>
                    );
                })}
            </div>

            {/* Permission matrix */}
            <div className="md:col-span-2 border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="rbac-role-detail">
                {!selected ? (
                    <div className="text-center py-10 text-mpca-gray-dark italic">Select a role from the left to view its permissions.</div>
                ) : (
                    <>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="overline text-[9px]">Role · {selected.body_scope}</div>
                                <div className="font-serif text-2xl text-mpca-green-dark mt-1">{selected.name}</div>
                                <textarea
                                    value={pendingDescription}
                                    onChange={(e) => setPendingDescription(e.target.value)}
                                    disabled={!isRbacAdmin(persona)}
                                    className="w-full input-heritage !text-xs mt-2"
                                    rows={2}
                                    data-testid="rbac-role-desc"
                                />
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-2xl text-mpca-oxblood" data-testid="rbac-role-perm-count">{pendingPerms.size}</div>
                                <div className="text-[10px] uppercase tracking-widest text-mpca-brass">of {Object.values(catalog.modules).reduce((s, arr) => s + arr.length, 0)} perms</div>
                            </div>
                        </div>

                        <div className="mt-5 space-y-1.5">
                            {Object.entries(catalog.modules).map(([module, actions]) => {
                                const modulePerms = actions.map((a) => `${module}.${a}`);
                                const allSet = modulePerms.every((p) => pendingPerms.has(p));
                                const someSet = modulePerms.some((p) => pendingPerms.has(p));
                                return (
                                    <div key={module} className="border border-mpca-brass/20" data-testid={`rbac-module-${module}`}>
                                        <div className="grid grid-cols-8 gap-2 px-3 py-2 items-center bg-mpca-parchment/40 border-b border-mpca-brass/10">
                                            <button
                                                onClick={() => toggleModule(module, actions, allSet)}
                                                disabled={!isRbacAdmin(persona)}
                                                className="col-span-2 flex items-center gap-2 text-left disabled:cursor-not-allowed"
                                                data-testid={`rbac-toggle-module-${module}`}
                                            >
                                                {allSet ? <CheckSquare size={13} className="text-mpca-oxblood" strokeWidth={2} />
                                                    : someSet ? <Square size={13} className="text-mpca-brass" strokeWidth={2} />
                                                    : <Square size={13} className="text-mpca-gray-dark" strokeWidth={1.2} />}
                                                <span className="font-serif text-sm text-mpca-green-dark capitalize">{module.replace(/_/g, " ")}</span>
                                            </button>
                                            <div className="col-span-6 flex flex-wrap gap-1.5">
                                                {actions.map((a) => {
                                                    const p = `${module}.${a}`;
                                                    const on = pendingPerms.has(p);
                                                    return (
                                                        <button
                                                            key={a}
                                                            onClick={() => togglePerm(p)}
                                                            disabled={!isRbacAdmin(persona)}
                                                            className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border transition-all disabled:cursor-not-allowed ${on ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "bg-transparent text-mpca-gray-dark border-mpca-brass/30 hover:border-mpca-oxblood"}`}
                                                            data-testid={`rbac-perm-${module}-${a}`}
                                                        >
                                                            {a.replace(/_/g, " ")}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {isRbacAdmin(persona) && (
                            <div className="flex justify-end mt-5 pt-4 border-t border-mpca-brass/20 gap-3 items-center">
                                {dirty && <span className="text-[10px] text-mpca-oxblood uppercase tracking-widest">Unsaved changes</span>}
                                <button onClick={save} disabled={!dirty || saving}
                                    className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"
                                    data-testid="rbac-save-role-btn">
                                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Role
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};


const UsersTab = ({ users, roles, onRefresh, persona }) => {
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ display_name: "", honorific: "Shri", email: "", phone: "", role_id: "", body_code: "MPCA", body_type: "State", is_active: true });
    const [editingId, setEditingId] = useState(null);
    const [busy, setBusy] = useState(false);

    const submitCreate = async () => {
        if (!form.display_name || !form.role_id) return alert("Name and role are required.");
        setBusy(true);
        try {
            await api.post("/rbac/users", form);
            setCreating(false);
            setForm({ display_name: "", honorific: "Shri", email: "", phone: "", role_id: "", body_code: "MPCA", body_type: "State", is_active: true });
            onRefresh();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    const patchUser = async (uid, patch) => {
        try {
            await api.patch(`/rbac/users/${uid}`, patch);
            onRefresh();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const deleteUser = async (uid, name) => {
        if (!window.confirm(`Delete user ${name}?`)) return;
        try {
            await api.delete(`/rbac/users/${uid}`);
            onRefresh();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
    };

    const roleName = (rid) => roles.find((r) => r.id === rid)?.name || rid;

    return (
        <div className="space-y-4" data-testid="rbac-users-tab">
            <div className="flex items-center justify-between">
                <div className="text-[11px] font-mono text-mpca-brass uppercase tracking-widest" data-testid="rbac-user-count">
                    {users.length} users · {users.filter((u) => u.is_active).length} active
                </div>
                {isRbacAdmin(persona) && (
                    <button onClick={() => setCreating(true)} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1" data-testid="rbac-add-user-btn">
                        <Plus size={11} /> Add User
                    </button>
                )}
            </div>

            {creating && (
                <div className="border border-mpca-oxblood/40 bg-mpca-parchment/30 p-4" data-testid="rbac-user-create-form">
                    <div className="overline text-[9px] mb-2">Add User</div>
                    <div className="grid grid-cols-4 gap-2">
                        <input placeholder="Full name" className={inputCls} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} data-testid="rbac-user-name" />
                        <input placeholder="Email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="rbac-user-email" />
                        <input placeholder="Phone" className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                        <select className={inputCls} value={form.role_id} onChange={(e) => {
                            const r = roles.find((x) => x.id === e.target.value);
                            setForm({ ...form, role_id: e.target.value, body_type: r?.body_scope === "Any" ? "State" : (r?.body_scope || "State") });
                        }} data-testid="rbac-user-role">
                            <option value="">Select role…</option>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.body_scope})</option>)}
                        </select>
                        <input placeholder="Body code (e.g. MPCA, DIV-IND)" className={inputCls} value={form.body_code} onChange={(e) => setForm({ ...form, body_code: e.target.value.toUpperCase() })} data-testid="rbac-user-body" />
                        <select className={inputCls} value={form.body_type} onChange={(e) => setForm({ ...form, body_type: e.target.value })}>
                            <option>State</option>
                            <option>Division</option>
                            <option>District</option>
                            <option>Any</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <button onClick={() => setCreating(false)} className="text-[10px] uppercase tracking-widest text-mpca-gray-dark px-3 py-1.5"><X size={11} className="inline mr-1" /> Cancel</button>
                        <button onClick={submitCreate} disabled={busy} className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 disabled:opacity-40" data-testid="rbac-user-save-btn">
                            {busy ? <Loader2 size={11} className="inline animate-spin mr-1" /> : <Save size={11} className="inline mr-1" />} Save User
                        </button>
                    </div>
                </div>
            )}

            <div className="border border-mpca-brass/30 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                    <div className="col-span-3">Name</div>
                    <div className="col-span-3">Role</div>
                    <div className="col-span-2">Body</div>
                    <div className="col-span-2">Contact</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-1 text-right">Actions</div>
                </div>
                {users.map((u) => {
                    const editing = editingId === u.id;
                    return (
                        <div key={u.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center border-b border-mpca-brass/10 text-xs" data-testid={`rbac-user-row-${u.id}`}>
                            <div className="col-span-3">
                                <div className="font-serif text-mpca-green-dark">{u.honorific ? u.honorific + " " : ""}{u.display_name}</div>
                                {u.persona_id && <div className="text-[9px] font-mono text-mpca-brass">{u.persona_id}</div>}
                            </div>
                            <div className="col-span-3">
                                {editing ? (
                                    <select className={inputCls} value={u.role_id} onChange={(e) => patchUser(u.id, { role_id: e.target.value })}>
                                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                ) : (
                                    <span className="text-mpca-oxblood">{roleName(u.role_id)}</span>
                                )}
                            </div>
                            <div className="col-span-2 font-mono text-[10px] text-mpca-brass">{u.body_code} <span className="text-mpca-gray-dark">·</span> {u.body_type}</div>
                            <div className="col-span-2 text-[10px] text-mpca-gray-dark">{u.email || u.phone || "—"}</div>
                            <div className="col-span-1">
                                <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 ${u.is_active ? "bg-mpca-green-dark text-mpca-ivory" : "bg-mpca-parchment text-mpca-gray-dark border border-mpca-brass/30"}`} data-testid={`rbac-user-status-${u.id}`}>
                                    {u.is_active ? "Active" : "Inactive"}
                                </span>
                            </div>
                            <div className="col-span-1 text-right">
                                {isRbacAdmin(persona) && (
                                    <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => setEditingId(editing ? null : u.id)} className="text-[9px] uppercase text-mpca-brass hover:text-mpca-oxblood" data-testid={`rbac-user-edit-${u.id}`}>
                                            {editing ? "Done" : "Edit"}
                                        </button>
                                        <button onClick={() => patchUser(u.id, { is_active: !u.is_active })} className="text-[9px] uppercase text-mpca-brass hover:text-mpca-oxblood" data-testid={`rbac-user-toggle-${u.id}`}>
                                            {u.is_active ? "Deactivate" : "Activate"}
                                        </button>
                                        {!u.persona_id && (
                                            <button onClick={() => deleteUser(u.id, u.display_name)} className="text-mpca-oxblood/70 hover:text-mpca-oxblood" data-testid={`rbac-user-delete-${u.id}`}>
                                                <Trash2 size={11} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


const AuditLogTab = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/rbac/audit-log", { params: { limit: 200 } });
                setEvents(r.data || []);
            } finally { setLoading(false); }
        })();
    }, []);

    if (loading) return <div className="py-10 text-center text-[11px] text-mpca-gray-dark"><Loader2 size={14} className="inline animate-spin mr-1" /> Loading audit log…</div>;

    return (
        <div className="border border-mpca-brass/30 overflow-hidden" data-testid="rbac-audit-log">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-mpca-green-dark text-mpca-gold-light text-[9px] uppercase tracking-widest">
                <div className="col-span-2">Timestamp</div>
                <div className="col-span-2">Actor</div>
                <div className="col-span-2">Action</div>
                <div className="col-span-2">Entity</div>
                <div className="col-span-4">Changes</div>
            </div>
            {events.length === 0 ? (
                <div className="py-8 text-center text-[11px] text-mpca-gray-dark italic" data-testid="rbac-audit-empty">
                    No audit events yet. Approvals and RBAC changes will appear here.
                </div>
            ) : events.map((e, i) => (
                <div key={e.id || i} className="grid grid-cols-12 gap-2 px-4 py-2 items-start border-b border-mpca-brass/10 text-[11px]" data-testid={`rbac-audit-row-${i}`}>
                    <div className="col-span-2 font-mono text-[10px] text-mpca-brass">{new Date(e.at).toLocaleString("en-IN")}</div>
                    <div className="col-span-2">
                        <div className="text-mpca-green-dark">{e.actor_name || "—"}</div>
                        <div className="text-[9px] text-mpca-gray-dark">{e.actor_role || ""} · {e.actor_body || ""}</div>
                    </div>
                    <div className="col-span-2 font-mono text-mpca-oxblood text-[10px]">{e.action}</div>
                    <div className="col-span-2 font-mono text-mpca-brass text-[10px] break-all">{e.entity}</div>
                    <div className="col-span-4 text-[10px] text-mpca-gray-dark font-mono break-words">
                        {e.changes && Object.keys(e.changes).length > 0 ? JSON.stringify(e.changes).slice(0, 220) : (e.reason || "")}
                    </div>
                </div>
            ))}
        </div>
    );
};


const AccessControl = () => {
    const { persona } = useAuth();
    const [tab, setTab] = useState("users");
    const [roles, setRoles] = useState([]);
    const [users, setUsers] = useState([]);
    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const [r, u, c] = await Promise.all([
                api.get("/rbac/roles").then((res) => res.data).catch(() => []),
                api.get("/rbac/users").then((res) => res.data).catch(() => []),
                api.get("/rbac/permission-catalog").then((res) => res.data).catch(() => null),
            ]);
            setRoles(r || []);
            setUsers(u || []);
            setCatalog(c);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    if (!isRbacAdmin(persona) && persona?.body_type !== "State") {
        return (
            <div className="p-16 text-center" data-testid="rbac-forbidden">
                <ShieldAlert size={40} className="mx-auto text-mpca-oxblood" strokeWidth={1.2} />
                <h1 className="font-serif text-3xl text-mpca-green-dark mt-4">Access Restricted</h1>
                <p className="text-mpca-gray-dark mt-2 max-w-md mx-auto">
                    The Access Control console is restricted to the MPCA President, Hon. Secretary and System Administrator.
                </p>
            </div>
        );
    }

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading Access Control…" /></div>;

    const canEdit = isRbacAdmin(persona);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="rbac-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Governance · Access Control</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Role-Based Access Control
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-3xl">
                        {canEdit
                            ? "Manage who can do what across MPCA, its Divisions and Districts. Every role change is recorded in the audit log."
                            : "Read-only view of the current MPCA access control matrix. Edits are restricted to the President, Secretary and System Administrator."}
                    </p>
                </div>
                <div className="text-right">
                    <div className="overline text-[9px]">Signed in as</div>
                    <div className="font-serif text-lg text-mpca-oxblood mt-0.5">{persona?.name}</div>
                    <div className="text-[10px] font-mono text-mpca-brass uppercase">{persona?.post}</div>
                </div>
            </div>

            <div className="crest-divider mb-6" />

            {/* Tab strip */}
            <div className="flex items-center gap-1 border-b border-mpca-brass/30 mb-6" data-testid="rbac-tabs">
                {[
                    ["users", "Users", UsersIcon],
                    ["roles", "Roles & Permissions", Shield],
                    ["audit", "Audit Log", ScrollText],
                ].map(([k, label, Icon]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold border-b-2 transition-colors ${tab === k ? "border-mpca-oxblood text-mpca-oxblood" : "border-transparent text-mpca-green-dark hover:text-mpca-oxblood"}`}
                        data-testid={`rbac-tab-${k}`}>
                        <Icon size={13} strokeWidth={1.5} /> {label}
                    </button>
                ))}
            </div>

            {tab === "users" && <UsersTab users={users} roles={roles} onRefresh={load} persona={persona} />}
            {tab === "roles" && <RolesTab roles={roles} catalog={catalog} onRefresh={load} persona={persona} />}
            {tab === "audit" && <AuditLogTab />}
        </div>
    );
};

export default AccessControl;
