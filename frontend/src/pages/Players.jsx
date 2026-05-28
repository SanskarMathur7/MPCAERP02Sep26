import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchPlayers, fetchPlayerStats, createPlayer, checkPlayerEligibility, approvePlayer, disqualifyPlayer, reinstatePlayer,
} from "@/lib/api";
import {
    User as UserIcon, Plus, Trophy, ShieldAlert, ShieldCheck, ChevronRight, Filter, X, Award, CheckCircle2, AlertTriangle, BadgeCheck, Ban,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const ageYears = (dob) => {
    if (!dob) return "—";
    const d = new Date(dob);
    const t = new Date();
    let a = t.getFullYear() - d.getFullYear();
    if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a -= 1;
    return a;
};

const CATEGORY_META = {
    Local_MP:     { label: "Local-MP",      tone: "active",    icon: BadgeCheck },
    Born_Outside: { label: "Born-Outside",  tone: "pending",   icon: UserIcon },
    Guest:        { label: "Guest",          tone: "suspended", icon: ShieldAlert },
};
const STATUS_META = {
    Active:      { label: "Active",       tone: "active" },
    Pending:     { label: "Pending Approval", tone: "pending" },
    Suspended:   { label: "Suspended",    tone: "suspended" },
    Banned:      { label: "Banned",       tone: "suspended" },
    Transferred: { label: "Transferred",  tone: "lapsed" },
    Retired:     { label: "Retired",      tone: "lapsed" },
};
const ROLE_LABEL = {
    Batter: "Batter", Bowler: "Bowler", All_Rounder: "All-Rounder", Wicket_Keeper: "Wicket-Keeper",
};

const Pill = ({ tone, label, testId, icon: Icon }) => (
    <span className={"pill pill-" + tone} data-testid={testId}>
        {Icon && <Icon size={11} strokeWidth={2} />}
        {label}
    </span>
);

const StatTile = ({ icon: Icon, label, value, sub, accent = "navy" }) => {
    const c = { navy: "text-mpca-green-dark", saffron: "text-mpca-oxblood", marigold: "text-mpca-gold", maroon: "text-mpca-burgundy-dark" }[accent];
    return (
        <div className="bulletin-card p-6 border-0 rounded-none" data-testid={"player-stat-" + label.toLowerCase().replace(/\s+/g, "-")}>
            <Icon className={c + " mb-3"} size={20} strokeWidth={1.25} />
            <div className="overline">{label}</div>
            <div className="font-serif text-3xl text-mpca-green-dark mt-2 leading-none">{value}</div>
            {sub && <div className="text-[11px] text-mpca-gray-dark mt-2">{sub}</div>}
        </div>
    );
};

const NewPlayerDialog = ({ open, persona, bodies, onClose, onCreated }) => {
    const initial = {
        body_id: persona?.body_type === "District" ? persona.body_code : "",
        full_name: "", father_name: "", date_of_birth: "", place_of_birth: "",
        address_district: "", domicile_state: "Madhya Pradesh",
        category: "Local_MP", role: "Batter", batting_style: "Right_Hand", bowling_style: "None",
        contact_phone: "", contact_email: "",
        guardian_name: "", guardian_phone: "",
        tw3_verified: false,
    };
    const [form, setForm] = useState(initial);
    const [eligibility, setEligibility] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    if (!open) return null;
    const districtBodies = bodies.filter((b) => b.body_type === "District");

    const runCheck = async () => {
        setError(null);
        try {
            const e = await checkPlayerEligibility({ ...form });
            setEligibility(e);
        } catch (e) {
            setError(e?.response?.data?.detail || e.message);
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const p = await createPlayer(form);
            onCreated(p);
            setForm(initial);
            setEligibility(null);
        } catch (e) {
            setError(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 overflow-y-auto" data-testid="new-player-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-2xl w-full my-8">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">Player Module · Registration</div>
                        <div className="font-serif text-2xl mt-1">New Player Entry</div>
                    </div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl"><X /></button>
                </div>
                <div className="p-6 space-y-5">
                    {/* Identity */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Registering District *</label>
                            <select required value={form.body_id} onChange={(e) => setForm((f) => ({ ...f, body_id: e.target.value }))} className="input-heritage" data-testid="np-body">
                                <option value="">— Select district —</option>
                                {districtBodies.map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Full Name *</label>
                            <input required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="input-heritage" data-testid="np-name" />
                        </div>
                        <div>
                            <label className="label-heritage">Father's Name</label>
                            <input value={form.father_name} onChange={(e) => setForm((f) => ({ ...f, father_name: e.target.value }))} className="input-heritage" data-testid="np-father" />
                        </div>
                        <div>
                            <label className="label-heritage">Date of Birth *</label>
                            <input required type="date" value={form.date_of_birth} onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))} className="input-heritage" data-testid="np-dob" />
                        </div>
                        <div>
                            <label className="label-heritage">Place of Birth</label>
                            <input value={form.place_of_birth} onChange={(e) => setForm((f) => ({ ...f, place_of_birth: e.target.value }))} className="input-heritage" data-testid="np-pob" />
                        </div>
                        <div>
                            <label className="label-heritage">Address District (MP)</label>
                            <input value={form.address_district} onChange={(e) => setForm((f) => ({ ...f, address_district: e.target.value }))} className="input-heritage" data-testid="np-addr-dist" />
                        </div>
                    </div>

                    {/* Category, Role, Style */}
                    <div className="border-t border-mpca-brass/30 pt-5">
                        <div className="overline mb-3">Eligibility Category · Cricket Profile</div>
                        <div className="grid sm:grid-cols-3 gap-4">
                            <div>
                                <label className="label-heritage">Category *</label>
                                <select required value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input-heritage" data-testid="np-cat">
                                    <option value="Local_MP">Local-MP (born &amp; domiciled)</option>
                                    <option value="Born_Outside">Born-Outside (5-yr MP residency)</option>
                                    <option value="Guest">Guest (TW3 maturity required)</option>
                                </select>
                            </div>
                            <div>
                                <label className="label-heritage">Domicile State</label>
                                <input value={form.domicile_state} onChange={(e) => setForm((f) => ({ ...f, domicile_state: e.target.value }))} className="input-heritage" data-testid="np-domicile" />
                            </div>
                            <div>
                                <label className="label-heritage">Role *</label>
                                <select required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input-heritage" data-testid="np-role">
                                    {["Batter", "Bowler", "All_Rounder", "Wicket_Keeper"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label-heritage">Batting</label>
                                <select value={form.batting_style} onChange={(e) => setForm((f) => ({ ...f, batting_style: e.target.value }))} className="input-heritage" data-testid="np-bat">
                                    <option value="Right_Hand">Right-Hand</option>
                                    <option value="Left_Hand">Left-Hand</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="label-heritage">Bowling</label>
                                <select value={form.bowling_style} onChange={(e) => setForm((f) => ({ ...f, bowling_style: e.target.value }))} className="input-heritage" data-testid="np-bowl">
                                    <option value="None">None</option>
                                    <option value="Right_Arm_Fast">Right-Arm Fast</option>
                                    <option value="Right_Arm_Medium">Right-Arm Medium</option>
                                    <option value="Right_Arm_Off_Spin">Right-Arm Off-Spin</option>
                                    <option value="Right_Arm_Leg_Spin">Right-Arm Leg-Spin</option>
                                    <option value="Left_Arm_Fast">Left-Arm Fast</option>
                                    <option value="Left_Arm_Medium">Left-Arm Medium</option>
                                    <option value="Left_Arm_Orthodox">Left-Arm Orthodox</option>
                                    <option value="Left_Arm_Chinaman">Left-Arm Chinaman</option>
                                </select>
                            </div>
                        </div>
                        {form.category === "Guest" && (
                            <label className="flex items-center gap-2 mt-3 text-sm text-mpca-charcoal" data-testid="np-tw3-label">
                                <input type="checkbox" checked={form.tw3_verified} onChange={(e) => setForm((f) => ({ ...f, tw3_verified: e.target.checked }))} data-testid="np-tw3" />
                                TW3 (Tanner-Whitehouse) maturity panel has cleared this player.
                            </label>
                        )}
                    </div>

                    {/* Contact */}
                    <div className="border-t border-mpca-brass/30 pt-5">
                        <div className="overline mb-3">Contact</div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <label className="label-heritage">Phone</label>
                                <input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} className="input-heritage" data-testid="np-phone" />
                            </div>
                            <div>
                                <label className="label-heritage">Email</label>
                                <input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} className="input-heritage" data-testid="np-email" />
                            </div>
                            {ageYears(form.date_of_birth) < 18 && form.date_of_birth && (
                                <>
                                    <div>
                                        <label className="label-heritage">Guardian Name (Minor)</label>
                                        <input value={form.guardian_name} onChange={(e) => setForm((f) => ({ ...f, guardian_name: e.target.value }))} className="input-heritage" data-testid="np-gname" />
                                    </div>
                                    <div>
                                        <label className="label-heritage">Guardian Phone</label>
                                        <input value={form.guardian_phone} onChange={(e) => setForm((f) => ({ ...f, guardian_phone: e.target.value }))} className="input-heritage" data-testid="np-gphone" />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Eligibility check result */}
                    {eligibility && (
                        <div className={"border p-4 text-sm " + (eligibility.ok ? "border-mpca-green-dark/40 bg-mpca-green-dark/5" : "border-mpca-oxblood/50 bg-mpca-oxblood/5")} data-testid="np-eligibility-result">
                            <div className="flex items-center gap-2 font-serif mb-2">
                                {eligibility.ok ? <CheckCircle2 size={16} className="text-mpca-green-dark" /> : <AlertTriangle size={16} className="text-mpca-oxblood" />}
                                <span className={eligibility.ok ? "text-mpca-green-dark" : "text-mpca-oxblood"}>
                                    {eligibility.ok ? "Eligibility looks fine" : "Eligibility issues"} · age {eligibility.age_years}
                                </span>
                            </div>
                            <ul className="text-xs text-mpca-charcoal list-disc list-inside space-y-1">
                                {eligibility.notes.map((n, i) => <li key={i}>{n}</li>)}
                            </ul>
                        </div>
                    )}
                    {error && (
                        <div className="border border-mpca-oxblood/50 bg-mpca-oxblood/5 text-mpca-oxblood p-3 text-sm" data-testid="np-error">
                            {error}
                        </div>
                    )}
                </div>
                <div className="px-6 pb-5 flex items-center justify-end gap-3 border-t border-mpca-brass/20 pt-4">
                    <button type="button" onClick={onClose} disabled={busy} className="btn-heritage-ghost" data-testid="np-cancel">Cancel</button>
                    <button type="button" onClick={runCheck} disabled={busy || !form.full_name || !form.date_of_birth} className="btn-heritage-secondary" data-testid="np-check">
                        Check Eligibility
                    </button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="np-create">
                        <UserIcon size={14} /> {busy ? "Saving…" : "Register Player"}
                    </button>
                </div>
            </form>
        </div>
    );
};

const DetailDrawer = ({ player, persona, onClose, onApprove, onSuspend, onReinstate }) => {
    if (!player) return null;
    const catMeta = CATEGORY_META[player.category];
    const stMeta = STATUS_META[player.status];
    const isOwner = persona && (persona.body_code === player.body_id || persona.body_type === "State");
    return (
        <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" data-testid="player-drawer">
            <div className="bg-mpca-ivory w-full max-w-2xl h-full overflow-y-auto border-l-2 border-mpca-brass">
                <div className="bg-mpca-green-dark text-mpca-ivory px-7 py-6 border-b-4 border-mpca-oxblood relative">
                    <button onClick={onClose} className="absolute top-4 right-5 text-mpca-gold-light hover:text-mpca-oxblood text-2xl" data-testid="player-drawer-close">×</button>
                    <div className="overline !text-mpca-gold-light font-mono">{player.player_id}</div>
                    <div className="font-serif text-3xl mt-2 leading-tight">{player.full_name}</div>
                    {player.father_name && <div className="text-sm text-mpca-gold-light/85 mt-1">s/o {player.father_name}</div>}
                    <div className="text-sm text-mpca-gold-light/85 mt-3">{player.body_id} · {ROLE_LABEL[player.role]} · age {ageYears(player.date_of_birth)}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Pill tone={catMeta.tone} label={catMeta.label} icon={catMeta.icon} testId={"player-cat-" + player.category} />
                        <Pill tone={stMeta.tone} label={stMeta.label} testId={"player-status-" + player.status} />
                    </div>
                </div>
                <div className="p-7 space-y-6">
                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                        <div><div className="overline">DOB</div><div className="font-mono text-mpca-charcoal">{fmtDate(player.date_of_birth)}</div></div>
                        <div><div className="overline">Place of Birth</div><div className="text-mpca-charcoal">{player.place_of_birth || "—"}</div></div>
                        <div><div className="overline">Domicile State</div><div className="text-mpca-charcoal">{player.domicile_state}</div></div>
                        <div><div className="overline">Address District</div><div className="text-mpca-charcoal">{player.address_district || "—"}</div></div>
                        <div><div className="overline">Batting</div><div className="text-mpca-charcoal">{player.batting_style?.replace("_", "-")}</div></div>
                        <div><div className="overline">Bowling</div><div className="text-mpca-charcoal">{player.bowling_style?.replace(/_/g, "-")}</div></div>
                        <div><div className="overline">Phone</div><div className="font-mono text-mpca-charcoal">{player.contact_phone || "—"}</div></div>
                        <div><div className="overline">Email</div><div className="font-mono text-mpca-charcoal text-xs">{player.contact_email || "—"}</div></div>
                        {player.guardian_name && (
                            <div className="sm:col-span-2"><div className="overline">Guardian</div><div className="text-mpca-charcoal">{player.guardian_name} · {player.guardian_phone || "—"}</div></div>
                        )}
                    </div>

                    {player.category === "Guest" && (
                        <div className={"border p-3 text-sm " + (player.tw3_verified ? "border-mpca-green-dark/40 bg-mpca-green-dark/5 text-mpca-green-dark" : "border-mpca-oxblood/50 bg-mpca-oxblood/5 text-mpca-oxblood")}>
                            {player.tw3_verified ? "✓ TW3 maturity verified by panel." : "⚠ TW3 not yet verified — guest registration cannot be cleared."}
                        </div>
                    )}

                    {player.eligibility_notes?.length > 0 && (
                        <div>
                            <div className="overline mb-2">Eligibility Validator · At Registration</div>
                            <ul className="text-xs text-mpca-charcoal list-disc list-inside space-y-1 border border-mpca-brass/30 p-3">
                                {player.eligibility_notes.map((n, i) => <li key={i}>{n}</li>)}
                            </ul>
                        </div>
                    )}

                    {player.disqualifications?.length > 0 && (
                        <div>
                            <div className="overline mb-2 !text-mpca-burgundy-dark">Disqualifications · Sanctions</div>
                            {player.disqualifications.map((d, i) => (
                                <div key={i} className="border border-mpca-burgundy-dark/40 bg-mpca-burgundy-dark/5 p-3 mb-2" data-testid={"player-dq-" + i}>
                                    <div className="font-serif text-base text-mpca-burgundy-dark">{d.kind.replace(/_/g, " ")}</div>
                                    <div className="text-xs text-mpca-charcoal mt-1">{d.reason}</div>
                                    <div className="text-[10px] text-mpca-gray-dark mt-2 font-mono">
                                        Imposed by {d.imposed_by} on {fmtDate(d.imposed_on)}
                                        {d.expires_on && ` · expires ${fmtDate(d.expires_on)}`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {isOwner && (
                        <div className="pt-5 border-t border-mpca-brass/30">
                            <div className="overline mb-3">Actions</div>
                            <div className="flex flex-wrap gap-3">
                                {player.status === "Pending" && (
                                    <button onClick={() => onApprove(player)} className="btn-heritage-primary" data-testid="player-approve">
                                        <CheckCircle2 size={14} /> Approve Registration
                                    </button>
                                )}
                                {player.status === "Active" && (
                                    <button onClick={() => onSuspend(player)} className="btn-heritage-secondary" data-testid="player-suspend">
                                        <Ban size={14} /> Suspend / Add Sanction
                                    </button>
                                )}
                                {player.status === "Suspended" && (
                                    <button onClick={() => onReinstate(player)} className="btn-heritage-primary" data-testid="player-reinstate">
                                        <ShieldCheck size={14} /> Reinstate to Active
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SuspendDialog = ({ open, player, onClose, onDone }) => {
    const [form, setForm] = useState({ kind: "Two_Year_Ban", reason: "", imposed_by: "MPCA", imposed_on: new Date().toISOString().slice(0, 10), expires_on: "" });
    const [busy, setBusy] = useState(false);
    if (!open || !player) return null;
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const u = await disqualifyPlayer(player.id, {
                kind: form.kind,
                reason: form.reason.trim(),
                imposed_by: form.imposed_by.trim(),
                imposed_on: form.imposed_on,
                expires_on: form.expires_on || null,
            });
            onDone(u);
        } catch (e) {
            alert(e?.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" data-testid="suspend-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-burgundy-dark max-w-lg w-full">
                <div className="bg-mpca-burgundy-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood">
                    <div className="overline !text-mpca-gold-light">Sanction</div>
                    <div className="font-serif text-2xl mt-1">Suspend {player.full_name}</div>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="label-heritage">Sanction Type *</label>
                        <select required value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} className="input-heritage" data-testid="sus-kind">
                            <option value="Two_Year_Ban">2-Year Ban</option>
                            <option value="Lifetime_Ban">Lifetime Ban</option>
                            <option value="Division_Penalty">Division Penalty (₹50K)</option>
                            <option value="Age_Misrepresentation">Age Misrepresentation</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="label-heritage">Reason *</label>
                        <textarea required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="input-heritage" data-testid="sus-reason" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-heritage">Imposed By</label>
                            <input value={form.imposed_by} onChange={(e) => setForm((f) => ({ ...f, imposed_by: e.target.value }))} className="input-heritage" data-testid="sus-by" />
                        </div>
                        <div>
                            <label className="label-heritage">Imposed On *</label>
                            <input required type="date" value={form.imposed_on} onChange={(e) => setForm((f) => ({ ...f, imposed_on: e.target.value }))} className="input-heritage" data-testid="sus-on" />
                        </div>
                        <div className="col-span-2">
                            <label className="label-heritage">Expires On (leave blank for indefinite)</label>
                            <input type="date" value={form.expires_on} onChange={(e) => setForm((f) => ({ ...f, expires_on: e.target.value }))} className="input-heritage" data-testid="sus-exp" />
                        </div>
                    </div>
                </div>
                <div className="px-6 pb-5 flex items-center justify-end gap-3">
                    <button type="button" onClick={onClose} className="btn-heritage-ghost" data-testid="sus-cancel">Cancel</button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary !bg-mpca-burgundy-dark" data-testid="sus-confirm">
                        <Ban size={14} /> {busy ? "Imposing…" : "Impose Sanction"}
                    </button>
                </div>
            </form>
        </div>
    );
};

const Players = () => {
    const { persona } = useAuth();
    const [players, setPlayers] = useState([]);
    const [stats, setStats] = useState(null);
    const [bodies, setBodies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [suspendTarget, setSuspendTarget] = useState(null);

    const load = async () => {
        const [p, s] = await Promise.all([fetchPlayers(), fetchPlayerStats()]);
        setPlayers(p);
        setStats(s);
    };
    useEffect(() => {
        (async () => {
            try {
                await load();
                // Pre-fetch bodies list (used for the registration dropdown)
                const { fetchBodies } = await import("@/lib/api");
                setBodies(await fetchBodies());
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        let r = players;
        if (filter === "mine" && persona) {
            if (persona.body_type === "District") r = r.filter((p) => p.body_id === persona.body_code);
            else if (persona.body_type === "Division") r = r.filter((p) => p.body_id.endsWith(persona.body_code.slice(-3)));
            // State sees all
        } else if (["Local_MP", "Born_Outside", "Guest"].includes(filter)) {
            r = r.filter((p) => p.category === filter);
        } else if (["Active", "Pending", "Suspended"].includes(filter)) {
            r = r.filter((p) => p.status === filter);
        }
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            r = r.filter((p) => p.full_name.toLowerCase().includes(s) || p.player_id.toLowerCase().includes(s));
        }
        return r;
    }, [players, filter, search, persona]);

    const canCreate = persona && (persona.body_type === "District" || persona.body_type === "State");

    if (loading) return <div className="p-16" data-testid="players-loading"><CricketLoader size="lg" label="Loading the player register…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="players-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Phase IV · M1 Player Management</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Player Register
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The single source of truth for every cricketer playing under the MPCA flag —
                        Local-MP · Born-Outside · Guest. Eligibility validated at the point of entry.
                    </p>
                </div>
                {canCreate && (
                    <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="new-player-btn">
                        <Plus size={14} /> Register a Player
                    </button>
                )}
            </div>

            <div className="crest-divider mb-10" />

            {stats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-10" data-testid="player-stats">
                    <StatTile icon={UserIcon} label="Total Players" value={stats.total_players} sub="All bodies · all categories" accent="navy" />
                    <StatTile icon={CheckCircle2} label="Active" value={stats.active_players} sub="Eligible to be selected" accent="marigold" />
                    <StatTile icon={AlertTriangle} label="Pending" value={stats.pending_players} sub="Awaiting approval" accent="saffron" />
                    <StatTile icon={Ban} label="Suspended" value={stats.suspended_players} sub="Disqualifications active" accent="maroon" />
                </div>
            )}

            {/* Category breakdown */}
            {stats?.by_category && (
                <div className="grid grid-cols-3 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-10">
                    {Object.entries(stats.by_category).map(([k, v]) => (
                        <div key={k} className="bulletin-card p-5 border-0 rounded-none" data-testid={"category-tile-" + k}>
                            <div className="overline">{CATEGORY_META[k]?.label || k}</div>
                            <div className="font-serif text-3xl text-mpca-green-dark mt-2 leading-none">{v}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter & search */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <Filter size={12} className="text-mpca-gray-dark" />
                {[
                    ["all", "All"],
                    ["mine", "My Scope"],
                    ["Active", "Active"],
                    ["Pending", "Pending"],
                    ["Suspended", "Suspended"],
                    ["Local_MP", "Local-MP"],
                    ["Born_Outside", "Born-Outside"],
                    ["Guest", "Guest"],
                ].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setFilter(k)}
                        data-testid={"player-filter-" + k}
                        className={"px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] font-semibold border transition-colors " + (filter === k ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark" : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:bg-mpca-parchment")}
                    >
                        {label}
                    </button>
                ))}
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or MPCA Player ID…"
                    className="ml-auto bg-transparent border-b border-mpca-gray/40 px-2 py-1 text-sm font-mono focus:outline-none focus:border-mpca-oxblood w-72"
                    data-testid="player-search"
                />
            </div>

            <div className="bulletin-card overflow-hidden" data-testid="player-list">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No players match this filter.</div>
                ) : (
                    filtered.map((p) => {
                        const cm = CATEGORY_META[p.category];
                        const sm = STATUS_META[p.status];
                        return (
                            <button key={p.id} onClick={() => setSelected(p)} className="ledger-row w-full text-left flex flex-wrap items-center gap-4 px-6 py-4" data-testid={"player-row-" + p.player_id.replace(/\//g, "-")}>
                                <div className="w-9 h-9 rounded-full bg-mpca-green-dark text-mpca-gold-light flex items-center justify-center font-serif text-sm shrink-0">
                                    {p.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                                </div>
                                <div className="font-mono text-[10px] text-mpca-brass tracking-wider w-32">{p.player_id}</div>
                                <div className="flex-1 min-w-[200px]">
                                    <div className="font-serif text-lg text-mpca-green-dark leading-tight">{p.full_name}</div>
                                    <div className="text-[11px] text-mpca-gray-dark mt-1">
                                        {p.body_id} · {ROLE_LABEL[p.role]} · age {ageYears(p.date_of_birth)} · {p.batting_style?.replace("_", "-")}{p.bowling_style && p.bowling_style !== "None" ? " / " + p.bowling_style.replace(/_/g, "-") : ""}
                                    </div>
                                </div>
                                <Pill tone={cm.tone} label={cm.label} icon={cm.icon} testId={"row-cat-" + p.category} />
                                <Pill tone={sm.tone} label={sm.label} testId={"row-status-" + p.status} />
                                <ChevronRight size={14} className="text-mpca-gray" />
                            </button>
                        );
                    })
                )}
            </div>

            <NewPlayerDialog
                open={showNew}
                persona={persona}
                bodies={bodies}
                onClose={() => setShowNew(false)}
                onCreated={async (p) => { setShowNew(false); await load(); setSelected(p); }}
            />
            <DetailDrawer
                player={selected}
                persona={persona}
                onClose={() => setSelected(null)}
                onApprove={async (p) => { try { const u = await approvePlayer(p.id); setSelected(u); await load(); } catch (e) { alert(e?.response?.data?.detail || e.message); } }}
                onSuspend={(p) => setSuspendTarget(p)}
                onReinstate={async (p) => { try { const u = await reinstatePlayer(p.id); setSelected(u); await load(); } catch (e) { alert(e?.response?.data?.detail || e.message); } }}
            />
            <SuspendDialog
                open={!!suspendTarget}
                player={suspendTarget}
                onClose={() => setSuspendTarget(null)}
                onDone={async (u) => { setSuspendTarget(null); setSelected(u); await load(); }}
            />
        </div>
    );
};

export default Players;
