import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    UserPlus, Plus, Copy, Loader2, Check, X, Inbox, ExternalLink, ShieldAlert,
    RotateCcw, CheckCircle2, XCircle, Send, Mail, Phone, Calendar, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSeason } from "@/context/SeasonContext";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";

const STATUS_TONE = {
    Submitted: "bg-mpca-navy/15 text-mpca-navy border-mpca-navy/40",
    Approved: "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40",
    Rejected: "bg-mpca-oxblood/15 text-mpca-oxblood border-mpca-oxblood/40",
    Returned: "bg-mpca-brass/15 text-mpca-brass border-mpca-brass/40",
};

const publicUrlFor = (token) => `${window.location.origin}/register/player/${token}`;

/**
 * Sprint M35 · Player Registration Campaigns
 * ──────────────────────────────────────────
 * Two tabs:
 *  · Campaigns — MPCA/Division open a season-scoped campaign, share the public
 *    URL, and optionally seed per-player invites.
 *  · Inbox    — every Submitted registration flowing in from the public form.
 *    Owner (or MPCA) can Approve (auto-creates a Player), Reject, or Return.
 */
const PlayerRegistrations = () => {
    const { persona } = useAuth();
    const { cycle } = useSeason();
    const [tab, setTab] = useState("campaigns");
    const [campaigns, setCampaigns] = useState([]);
    const [regs, setRegs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNew, setShowNew] = useState(false);
    const [activeInvites, setActiveInvites] = useState(null);   // {campaign, invites}

    const isMPCA = persona?.body_type === "State";
    const myBody = persona?.body_code;

    const load = async () => {
        setLoading(true);
        try {
            const [{ data: camps }, { data: rows }] = await Promise.all([
                api.get("/player-registration-campaigns"),
                api.get("/player-registrations"),
            ]);
            setCampaigns(camps || []);
            setRegs(rows || []);
        } catch (_) { setCampaigns([]); setRegs([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const pendingCount = regs.filter((r) => r.status === "Submitted").length;

    const copyLink = async (token) => {
        try {
            await navigator.clipboard.writeText(publicUrlFor(token));
            alert("Public registration URL copied to clipboard.");
        } catch (_) { alert(publicUrlFor(token)); }
    };

    if (loading) return <div className="p-16"><CricketLoader label="Loading player registrations…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-[1400px] mx-auto" data-testid="player-registrations-page">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
                <div>
                    <div className="overline">Membership · Season Registrations</div>
                    <h1 className="font-serif text-3xl md:text-4xl text-mpca-green-dark mt-2 leading-tight">Player Registrations</h1>
                    <p className="text-[11px] text-mpca-gray-dark mt-2 max-w-2xl">
                        Open a season-scoped campaign, share the public URL (or per-player invites), and review incoming registrations in the inbox. Approved rows automatically create a Player under {isMPCA ? "the chosen body" : myBody} + {cycle || "current cycle"}.
                    </p>
                </div>
                <button onClick={() => setShowNew(true)} className="btn-heritage-primary" data-testid="pr-new-campaign-btn">
                    <Plus size={14} /> New Campaign
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-mpca-brass/30 mb-6">
                <button onClick={() => setTab("campaigns")} className={`px-4 py-2 text-[11px] uppercase tracking-widest font-mono ${tab === "campaigns" ? "border-b-2 border-mpca-oxblood text-mpca-oxblood" : "text-mpca-gray-dark"}`} data-testid="pr-tab-campaigns">
                    Campaigns · {campaigns.length}
                </button>
                <button onClick={() => setTab("inbox")} className={`px-4 py-2 text-[11px] uppercase tracking-widest font-mono flex items-center gap-2 ${tab === "inbox" ? "border-b-2 border-mpca-oxblood text-mpca-oxblood" : "text-mpca-gray-dark"}`} data-testid="pr-tab-inbox">
                    <Inbox size={12} /> Inbox · {regs.length}
                    {pendingCount > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-mpca-oxblood text-mpca-ivory">{pendingCount} pending</span>
                    )}
                </button>
            </div>

            {tab === "campaigns" && <CampaignsList campaigns={campaigns} onCopy={copyLink} onOpen={setActiveInvites} onChanged={load} persona={persona} />}
            {tab === "inbox" && <RegistrationsInbox regs={regs} campaigns={campaigns} onChanged={load} persona={persona} />}

            {showNew && (
                <NewCampaignDialog persona={persona} cycle={cycle} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />
            )}
            {activeInvites && (
                <InvitesDialog campaign={activeInvites} onClose={() => setActiveInvites(null)} onCopy={copyLink} onChanged={load} />
            )}
        </div>
    );
};

// ─────────────── Campaigns List ───────────────

const CampaignsList = ({ campaigns, onCopy, onOpen, onChanged, persona }) => {
    if (!campaigns.length) return (
        <div className="py-16 text-center border border-dashed border-mpca-brass/30 text-[11px] italic text-mpca-gray-dark" data-testid="pr-campaigns-empty">
            No campaigns yet. Click "New Campaign" to open your first season registration window.
        </div>
    );
    return (
        <div className="bulletin-card divide-y divide-mpca-brass/15" data-testid="pr-campaigns-list">
            {campaigns.map((c) => {
                const expiring = c.expires_on && new Date(c.expires_on) < new Date();
                return (
                    <div key={c.id} className="grid grid-cols-12 items-center gap-3 px-5 py-4" data-testid={`pr-campaign-${c.id}`}>
                        <div className="col-span-4 min-w-0">
                            <div className="font-serif text-lg text-mpca-green-dark truncate">{c.title}</div>
                            <div className="text-[10px] text-mpca-brass font-mono mt-0.5">
                                {c.body_code} · {c.cycle_code}{c.expires_on ? ` · expires ${c.expires_on}` : ""}
                            </div>
                        </div>
                        <div className="col-span-4 grid grid-cols-4 gap-2 text-center text-[10px] font-mono">
                            <div><div className="text-mpca-gray-dark">Invited</div><div className="text-mpca-green-dark text-base">{c.invited_count}</div></div>
                            <div><div className="text-mpca-gray-dark">Received</div><div className="text-mpca-navy text-base">{c.submitted_count}</div></div>
                            <div><div className="text-mpca-gray-dark">Approved</div><div className="text-mpca-green-dark text-base">{c.approved_count}</div></div>
                            <div><div className="text-mpca-gray-dark">Rejected</div><div className="text-mpca-oxblood text-base">{c.rejected_count}</div></div>
                        </div>
                        <div className="col-span-4 flex flex-wrap justify-end gap-1">
                            <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${expiring ? "bg-mpca-oxblood/10 text-mpca-oxblood border-mpca-oxblood/40" : c.is_active ? "bg-mpca-green-dark/15 text-mpca-green-dark border-mpca-green-dark/40" : "bg-mpca-brass/20 text-mpca-brass border-mpca-brass/40"}`}>
                                {expiring ? "Expired" : c.is_active ? "Active" : "Paused"}
                            </span>
                            <button onClick={() => onCopy(c.public_token)} className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors inline-flex items-center gap-1" data-testid={`pr-copy-${c.id}`}>
                                <Copy size={10} /> Copy public URL
                            </button>
                            <button onClick={() => onOpen(c)} className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors inline-flex items-center gap-1" data-testid={`pr-invites-${c.id}`}>
                                <UserPlus size={10} /> Invites
                            </button>
                            <a href={publicUrlFor(c.public_token)} target="_blank" rel="noreferrer" className="text-[10px] uppercase tracking-widest px-2 py-1 text-mpca-gray-dark hover:text-mpca-green-dark inline-flex items-center gap-1" data-testid={`pr-preview-${c.id}`}>
                                <ExternalLink size={10} /> Preview
                            </a>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ─────────────── Registrations Inbox ───────────────

const RegistrationsInbox = ({ regs, campaigns, onChanged, persona }) => {
    const [filter, setFilter] = useState("Submitted");
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);

    const filtered = useMemo(() => filter === "all" ? regs : regs.filter((r) => r.status === filter), [regs, filter]);

    const doAction = async (rid, action, note = null) => {
        setBusy(true);
        try {
            const { data } = await api.post(`/player-registrations/${rid}/${action}`, { reviewer_name: persona?.name, note });
            setSelected(data);
            onChanged?.();
            alert(`Registration ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned"}.`);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-3">
                {["Submitted", "Approved", "Rejected", "Returned", "all"].map((s) => (
                    <button key={s} onClick={() => setFilter(s)} className={`text-[10px] uppercase tracking-widest px-3 py-1 border ${filter === s ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood" : "border-mpca-brass/40 text-mpca-brass"}`} data-testid={`pr-filter-${s}`}>
                        {s === "all" ? "All" : s} · {s === "all" ? regs.length : regs.filter((r) => r.status === s).length}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-mpca-brass/30 text-[11px] italic text-mpca-gray-dark" data-testid="pr-inbox-empty">
                    Nothing to show for this filter yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 bulletin-card divide-y divide-mpca-brass/15 max-h-[600px] overflow-y-auto" data-testid="pr-inbox-list">
                        {filtered.map((r) => {
                            const camp = campaigns.find((c) => c.id === r.campaign_id);
                            const active = selected?.id === r.id;
                            return (
                                <button key={r.id} onClick={() => setSelected(r)} className={`w-full text-left px-4 py-3 ${active ? "bg-mpca-parchment" : "hover:bg-mpca-parchment/50"}`} data-testid={`pr-inbox-row-${r.id}`}>
                                    <div className="font-serif text-sm text-mpca-green-dark truncate">{r.player_data?.full_name}</div>
                                    <div className="text-[10px] text-mpca-brass font-mono truncate">{r.body_code} · {r.cycle_code} · {r.player_data?.role}</div>
                                    <div className="mt-1 flex items-center justify-between">
                                        <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_TONE[r.status]}`}>{r.status}</span>
                                        <span className="text-[9px] text-mpca-gray-dark">{r.submitted_at?.slice(0, 10)}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="lg:col-span-2">
                        {selected ? (
                            <RegistrationDetail reg={selected} campaigns={campaigns} onAction={doAction} busy={busy} />
                        ) : (
                            <div className="bulletin-card p-10 text-center text-[11px] italic text-mpca-gray-dark">Select a registration on the left to review.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const RegistrationDetail = ({ reg, campaigns, onAction, busy }) => {
    const camp = campaigns.find((c) => c.id === reg.campaign_id);
    const pd = reg.player_data || {};
    const isPending = reg.status === "Submitted" || reg.status === "Returned";
    return (
        <div className="bulletin-card" data-testid="pr-inbox-detail">
            <div className="px-5 py-3 border-b border-mpca-brass/20">
                <div className="overline">{camp?.title || reg.campaign_id}</div>
                <div className="font-serif text-2xl text-mpca-green-dark mt-1" data-testid="pr-detail-name">{pd.full_name}</div>
                <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-mpca-brass font-mono">
                    <span>{reg.body_code}</span><span>·</span><span>{reg.cycle_code}</span>
                    <span>·</span><span>Role: {pd.role?.replace(/_/g, " ")}</span>
                    <span>·</span><span>Category: {pd.category?.replace(/_/g, " ")}</span>
                </div>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 text-[12px]">
                <Field label="DOB" value={pd.dob} />
                <Field label="Gender" value={pd.gender} />
                <Field label="Batting" value={pd.batting_style} />
                <Field label="Bowling" value={pd.bowling_style} />
                <Field label="Mobile" value={pd.mobile} icon={Phone} />
                <Field label="Email" value={pd.email} icon={Mail} />
                <Field label="Home District" value={pd.home_district_code} />
                <Field label="Aadhaar" value={pd.aadhaar_no ? `••••${pd.aadhaar_no.slice(-4)}` : null} />
                <Field label="Guardian" value={pd.guardian_name} />
                <Field label="Address" value={pd.address} span={2} />
                <Field label="Consent" value={pd.consent ? "Yes" : "No"} />
                <Field label="Bank IFSC" value={pd.bank_ifsc} />
            </div>
            {(pd.photo_url || pd.aadhaar_url || pd.address_proof_url || pd.birth_cert_url) && (
                <div className="px-5 py-3 border-t border-mpca-brass/20">
                    <div className="overline mb-2">Attachments</div>
                    <div className="flex flex-wrap gap-2">
                        {[["Photo", pd.photo_url], ["Aadhaar", pd.aadhaar_url], ["Address Proof", pd.address_proof_url], ["Birth Cert.", pd.birth_cert_url]].filter(([, u]) => u).map(([label, url]) => (
                            <a key={label} href={url} target="_blank" rel="noreferrer" className="text-[10px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors inline-flex items-center gap-1">
                                <ExternalLink size={9} /> {label}
                            </a>
                        ))}
                    </div>
                </div>
            )}
            {reg.review_note && (
                <div className="px-5 py-3 border-t border-mpca-brass/20 text-[11px]">
                    <span className="overline mr-1">Note</span> {reg.review_note}
                </div>
            )}
            {isPending && (
                <div className="border-t border-mpca-brass/20 px-5 py-3 bg-mpca-parchment/50 flex flex-wrap gap-2 justify-end" data-testid="pr-detail-actions">
                    <button onClick={() => onAction(reg.id, "approve", window.prompt("Optional note:"))} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-green-dark text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-approve-btn">
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Approve → create Player
                    </button>
                    <button onClick={() => { const n = window.prompt("Return reason (required):"); if (n) onAction(reg.id, "return", n); }} disabled={busy} className="text-[11px] uppercase tracking-widest border border-mpca-brass text-mpca-brass px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-return-btn">
                        <RotateCcw size={11} /> Return for edits
                    </button>
                    <button onClick={() => { const n = window.prompt("Rejection reason (required):"); if (n) onAction(reg.id, "reject", n); }} disabled={busy} className="text-[11px] uppercase tracking-widest border border-mpca-oxblood text-mpca-oxblood px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-reject-btn">
                        <XCircle size={11} /> Reject
                    </button>
                </div>
            )}
            {reg.status === "Approved" && reg.linked_player_id && (
                <div className="border-t border-mpca-brass/20 px-5 py-3 text-[11px] text-mpca-green-dark">
                    Player created →{" "}
                    <Link to={`/players/${reg.linked_player_id}`} className="text-mpca-oxblood hover:underline inline-flex items-center gap-1">
                        Open Player Profile <ChevronRight size={11} />
                    </Link>
                </div>
            )}
        </div>
    );
};

const Field = ({ label, value, span = 1, icon: Icon }) => (
    <div className={span === 2 ? "col-span-2" : ""}>
        <div className="text-[9px] uppercase tracking-widest text-mpca-brass mb-0.5 flex items-center gap-1">
            {Icon && <Icon size={9} />} {label}
        </div>
        <div className="text-mpca-green-dark font-serif">{value || "—"}</div>
    </div>
);

// ─────────────── New Campaign dialog ───────────────

const NewCampaignDialog = ({ persona, cycle, onClose, onSaved }) => {
    const [title, setTitle] = useState(`Season ${cycle || "2025-26"} Registrations`);
    const [bodyCode, setBodyCode] = useState(persona?.body_code || "MPCA");
    const [expiresOn, setExpiresOn] = useState("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr("");
        try {
            await api.post("/player-registration-campaigns", {
                body_code: bodyCode, cycle_code: cycle || "2025-26", title, expires_on: expiresOn || null, notes, created_by: persona?.name,
            });
            onSaved?.();
        } catch (ex) { setErr(ex?.response?.data?.detail || ex.message); }
        finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid="pr-new-dialog">
            <form onSubmit={submit} className="bg-mpca-ivory border-2 border-mpca-brass max-w-lg w-full my-12">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div className="font-serif text-xl">New Registration Campaign</div>
                    <button type="button" onClick={onClose} className="text-mpca-gold-light text-2xl"><X /></button>
                </div>
                <div className="p-5 space-y-3">
                    {err && <div className="border border-mpca-oxblood/40 bg-mpca-oxblood/5 text-mpca-oxblood text-[11px] px-3 py-2 flex items-center gap-2"><ShieldAlert size={11} /> {err}</div>}
                    <label className="block">
                        <span className="overline text-[9px]">Title</span>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input-heritage !py-1.5 !text-xs mt-1" data-testid="pr-new-title" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="overline text-[9px]">Body</span>
                            <input value={bodyCode} onChange={(e) => setBodyCode(e.target.value)} required className="input-heritage font-mono !py-1.5 !text-xs mt-1" data-testid="pr-new-body" />
                        </label>
                        <label className="block">
                            <span className="overline text-[9px]">Cycle</span>
                            <input value={cycle || "2025-26"} disabled className="input-heritage font-mono !py-1.5 !text-xs mt-1" />
                        </label>
                    </div>
                    <label className="block">
                        <span className="overline text-[9px]">Expires on (defaults to end of season)</span>
                        <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="pr-new-expires" />
                    </label>
                    <label className="block">
                        <span className="overline text-[9px]">Notes</span>
                        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-heritage !py-1.5 !text-xs mt-1" data-testid="pr-new-notes" />
                    </label>
                </div>
                <div className="border-t border-mpca-brass/20 px-5 py-3 flex justify-end gap-2 bg-mpca-parchment">
                    <button type="button" onClick={onClose} className="text-[11px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40 text-mpca-gray-dark">Cancel</button>
                    <button type="submit" disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-4 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="pr-new-save-btn">
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create Campaign
                    </button>
                </div>
            </form>
        </div>
    );
};

// ─────────────── Invites dialog ───────────────

const InvitesDialog = ({ campaign, onClose, onCopy, onChanged }) => {
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bulk, setBulk] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        const { data } = await api.get(`/player-registration-campaigns/${campaign.id}/invites`);
        setInvites(data || []);
        setLoading(false);
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaign.id]);

    const submitBulk = async () => {
        const rows = bulk.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
            const [name, contact] = l.split(",").map((s) => (s || "").trim());
            const looksEmail = (contact || "").includes("@");
            return { prefill_name: name, prefill_email: looksEmail ? contact : null, prefill_phone: !looksEmail ? contact : null };
        });
        if (!rows.length) return alert("Paste at least one row.");
        setBusy(true);
        try {
            await api.post(`/player-registration-campaigns/${campaign.id}/invites`, { invites: rows });
            setBulk("");
            await load();
            onChanged?.();
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-6 overflow-y-auto" data-testid="pr-invites-dialog">
            <div className="bg-mpca-ivory border-2 border-mpca-brass max-w-3xl w-full my-12">
                <div className="bg-mpca-green-dark text-mpca-ivory px-6 py-4 border-b-4 border-mpca-oxblood flex items-center justify-between">
                    <div>
                        <div className="overline !text-mpca-gold-light">{campaign.body_code} · {campaign.cycle_code}</div>
                        <div className="font-serif text-xl mt-1">Invites · {campaign.title}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light text-2xl"><X /></button>
                </div>
                <div className="p-5">
                    <div className="border border-mpca-brass/30 bg-mpca-parchment p-3 mb-4">
                        <div className="overline text-[9px] mb-2">Bulk add invites (one per line: <b>Name, email OR phone</b>)</div>
                        <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="Rohit Kumar, rohit@example.com&#10;Suresh Rane, 9876543210" className="input-heritage !py-1.5 !text-xs" data-testid="pr-invites-bulk-input" />
                        <button onClick={submitBulk} disabled={busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 mt-2" data-testid="pr-invites-bulk-btn">
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Create invites
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-[11px] italic text-mpca-gray-dark py-6 text-center"><Loader2 size={12} className="inline animate-spin mr-1" /> Loading…</div>
                    ) : invites.length === 0 ? (
                        <div className="py-8 text-center text-[11px] italic text-mpca-gray-dark" data-testid="pr-invites-empty">
                            No individual invites yet. Anyone with the public URL can still register.
                        </div>
                    ) : (
                        <div className="divide-y divide-mpca-brass/15 border border-mpca-brass/20 max-h-72 overflow-y-auto" data-testid="pr-invites-list">
                            {invites.map((inv) => (
                                <div key={inv.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-mpca-green-dark truncate">{inv.prefill_name || "(unnamed)"}</div>
                                        <div className="text-[9px] text-mpca-brass font-mono truncate">{inv.prefill_email || inv.prefill_phone || "no contact"}</div>
                                    </div>
                                    <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_TONE[inv.status] || "border-mpca-brass/40 text-mpca-brass"}`}>{inv.status}</span>
                                    <button onClick={() => onCopy(inv.token)} className="text-[9px] uppercase tracking-widest px-2 py-1 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors inline-flex items-center gap-1">
                                        <Copy size={9} /> Copy link
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlayerRegistrations;
