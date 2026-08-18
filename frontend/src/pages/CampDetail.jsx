import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Calendar, Users, IndianRupee, Info, FileText, Loader2, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";

/**
 * MPCA-252 · Camp Detail page.
 *
 * A single camp's home — for Coaching / Vacation / Pre-Tournament / Selection
 * camps. Division / District (owner body) can update dates, venue, and
 * planned-participant count. MPCA sees the same page in read-only aggregate
 * mode. Reciprocal-visitors management stays on the parent Tournament page
 * (Pre-Tournament Camps panel) since it is a fleet operation.
 *
 * MPCA-254 · Ship B — If the camp has been migrated to a first-class
 * tournament (`migrated_to_tournament_id` set), redirect immediately to
 * the tournament detail page so users don't get the legacy form.
 */
const CampDetail = () => {
    const { cid } = useParams();
    const navigate = useNavigate();
    const { persona } = useAuth();
    const [camp, setCamp] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({});

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/camps/${cid}`);
            // MPCA-254 · Ship B — Migrated camps live in db.tournaments now.
            if (data?.migrated_to_tournament_id) {
                navigate(`/tournaments/${data.migrated_to_tournament_id}`, { replace: true });
                return;
            }
            setCamp(data);
            setForm({
                start_date: data.start_date || "",
                end_date:   data.end_date || "",
                venue:      data.venue || "",
                planned_participants: data.planned_participants || 0,
                notes:      data.notes || "",
            });
        } catch (e) { console.warn(e); setCamp(null); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [cid]);   // eslint-disable-line react-hooks/exhaustive-deps

    const isOwner = persona?.body_code === camp?.body_id || persona?.body_type === "State";
    const canEdit = isOwner && ["Draft", "Documents_Pending", "Sent_To_Division"].includes(camp?.status || "Draft");

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await api.patch(`/camps/${cid}`, {
                ...form,
                planned_participants: parseInt(form.planned_participants) || 0,
            });
            setCamp(data);
        } catch (e) { alert(e?.response?.data?.detail || e.message); }
        finally { setSaving(false); }
    };

    if (loading) return <CricketLoader label="Loading camp..." />;
    if (!camp) return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-4xl mx-auto text-center">
            <h1 className="font-serif text-3xl text-mpca-oxblood mb-4">Camp not found</h1>
            <Link to="/camps" className="text-mpca-brass underline text-sm">← Back to Camps</Link>
        </div>
    );

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-5xl mx-auto space-y-6" data-testid="camp-detail-page">
            <div>
                <Link to="/camps" className="text-[11px] text-mpca-brass hover:text-mpca-oxblood inline-flex items-center gap-1 mb-2" data-testid="back-to-camps">
                    <ArrowLeft size={12} /> Back to Camps
                </Link>
                <div className="overline">Camp · {camp.camp_no}</div>
                <h1 className="font-serif text-4xl text-mpca-green-dark mt-2 leading-tight" data-testid="camp-name">
                    {camp.body_name || camp.body_id} · {camp.camp_type?.replace(/_/g, " ")}
                </h1>
                {camp.inter_division_tournament_id && (
                    <div className="text-[11px] text-mpca-brass mt-1">
                        Linked to <Link to={`/tournaments/${camp.inter_division_tournament_id}`} className="underline">{camp.inter_division_tournament_name || "parent tournament"}</Link>
                    </div>
                )}
                <div className="text-[10px] text-mpca-gray-dark mt-1 font-mono uppercase tracking-widest">
                    Status: {camp.status} · Scheme: {camp.scheme_code}{camp.auto_created_from_tournament ? " · Auto-created" : ""}
                </div>
            </div>

            <div className="border border-mpca-brass/30 bg-mpca-ivory p-5">
                <div className="overline text-[9px] mb-3">Camp Details</div>
                {!canEdit ? (
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
                        <div><dt className="text-mpca-brass text-[10px] uppercase tracking-widest">Dates</dt><dd className="mt-1"><Calendar size={12} className="inline mr-1" />{camp.start_date || "—"} → {camp.end_date || "—"}</dd></div>
                        <div><dt className="text-mpca-brass text-[10px] uppercase tracking-widest">Venue</dt><dd className="mt-1"><MapPin size={12} className="inline mr-1" />{camp.venue || "—"}</dd></div>
                        <div><dt className="text-mpca-brass text-[10px] uppercase tracking-widest">Planned Participants</dt><dd className="mt-1"><Users size={12} className="inline mr-1" />{camp.planned_participants || 0}</dd></div>
                        <div><dt className="text-mpca-brass text-[10px] uppercase tracking-widest">Budget</dt><dd className="mt-1"><IndianRupee size={12} className="inline mr-1" />{camp.budget_total_inr ? Math.round(camp.budget_total_inr).toLocaleString("en-IN") : "Auto (from scheme)"}</dd></div>
                        {camp.notes && <div className="md:col-span-2"><dt className="text-mpca-brass text-[10px] uppercase tracking-widest">Notes</dt><dd className="mt-1 whitespace-pre-wrap">{camp.notes}</dd></div>}
                    </dl>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="text-[11px]"><div className="text-mpca-brass uppercase tracking-widest mb-1">Start Date</div><input type="date" className="input-heritage w-full" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="camp-start-date" /></label>
                        <label className="text-[11px]"><div className="text-mpca-brass uppercase tracking-widest mb-1">End Date</div><input type="date" className="input-heritage w-full" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="camp-end-date" /></label>
                        <label className="text-[11px] md:col-span-2"><div className="text-mpca-brass uppercase tracking-widest mb-1">Venue</div><input type="text" className="input-heritage w-full" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} data-testid="camp-venue" /></label>
                        <label className="text-[11px]"><div className="text-mpca-brass uppercase tracking-widest mb-1">Planned Participants</div><input type="number" min={0} className="input-heritage w-full" value={form.planned_participants} onChange={(e) => setForm({ ...form, planned_participants: e.target.value })} data-testid="camp-planned-participants" /></label>
                        <label className="text-[11px] md:col-span-2"><div className="text-mpca-brass uppercase tracking-widest mb-1">Notes</div><textarea rows={3} className="input-heritage w-full" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="camp-notes" /></label>
                        <div className="md:col-span-2 flex justify-end">
                            <button onClick={save} disabled={saving} className="btn-heritage-primary" data-testid="save-camp-btn">
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {saving ? "Saving…" : "Save Camp"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {(camp.reciprocal_visitors || []).length > 0 && (
                <div className="border border-mpca-brass/30 bg-mpca-ivory p-5" data-testid="reciprocal-visitors-panel">
                    <div className="overline text-[9px] mb-2">Reciprocal Visitors · {camp.reciprocal_visitors.length}</div>
                    <div className="flex flex-wrap gap-2">
                        {camp.reciprocal_visitors.map((v) => (
                            <span key={v.body_id} className="text-[11px] bg-mpca-navy text-mpca-gold-light px-2 py-1">{v.body_name || v.body_id}</span>
                        ))}
                    </div>
                    <div className="text-[10px] text-mpca-gray-dark mt-2 italic">
                        <Info size={9} className="inline mr-1" /> Add / remove visitors from the parent tournament&apos;s Pre-Tournament Camps panel.
                    </div>
                </div>
            )}

            <div className="text-[11px] text-mpca-gray-dark">
                <FileText size={11} className="inline mr-1" />
                All finance flows for this camp (budget, invoices, DA claims, reimbursement) live under the parent Inter-Divisional tournament&apos;s Finance Console. Budget is driven by the <b>Master Rate Card</b> (Pre-Tournament Camp × format) — scheme 3-D is not used.
            </div>
        </div>
    );
};

export default CampDetail;
