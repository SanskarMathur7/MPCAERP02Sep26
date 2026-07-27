import { useEffect, useState } from "react";
import { MessageSquare, Plus, X, Loader2, ShieldAlert } from "lucide-react";
import { api, fetchBodies } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CricketLoader from "@/components/CricketLoader";
import DiscussionThread from "@/components/DiscussionThread";

/**
 * M39 · MPCA / Division inbox
 * MPCA can open a conversation with ANY division; a division can only
 * converse with MPCA (server enforces RBAC).
 */
const Discussions = () => {
    const { persona } = useAuth();
    const [threads, setThreads] = useState([]);
    const [bodies, setBodies] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(false);
    const [pick, setPick] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    const isMPCA = persona?.body_type === "State" || persona?.body_code === "MPCA";

    const load = async () => {
        setLoading(true);
        try {
            const [t, b] = await Promise.all([
                api.get("/discussions/inbox/threads").then((r) => r.data).catch(() => []),
                fetchBodies().catch(() => []),
            ]);
            setThreads(t || []);
            setBodies(b || []);
            if (!selected && (t || []).length) setSelected(t[0]);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const openThread = async () => {
        setErr("");
        if (!pick) return;
        setBusy(true);
        try {
            const { data } = await api.post("/discussions/inbox/open", { other_body_code: pick });
            setDialog(false); setPick("");
            await load();
            setSelected(data);
        } catch (e) { setErr(e?.response?.data?.detail || e.message); }
        finally { setBusy(false); }
    };

    if (loading) return <CricketLoader label="Loading discussions…" />;

    // Options for the "new conversation" picker:
    // MPCA persona → all Division / District bodies · Div/Dist persona → only MPCA
    const pickOptions = isMPCA
        ? bodies.filter((b) => b.body_type === "Division" || b.body_type === "District")
        : bodies.filter((b) => b.code === "MPCA");

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-6xl mx-auto" data-testid="discussions-page">
            <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="overline">Communication</div>
                    <h1 className="font-serif text-4xl text-mpca-green-dark mt-1">Discussions</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        {isMPCA ? "Open a conversation with any Division / District office." : "Direct line to MPCA state office. Tag any office bearer with @."}
                    </p>
                </div>
                <button className="btn-heritage-primary" onClick={() => setDialog(true)} data-testid="new-thread-btn"><Plus size={12} /> New Conversation</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4 bulletin-card overflow-hidden">
                    <div className="px-4 py-2 border-b border-mpca-brass/20 text-[10px] uppercase tracking-widest text-mpca-brass flex items-center gap-1">
                        <MessageSquare size={12} /> {threads.length} conversation(s)
                    </div>
                    {threads.length === 0 ? (
                        <div className="p-8 text-center text-[11px] italic text-mpca-gray-dark">No conversations yet.</div>
                    ) : (
                        <div className="divide-y divide-mpca-brass/15" data-testid="threads-list">
                            {threads.map((t) => (
                                <button key={t.id} onClick={() => setSelected(t)} className={`w-full text-left px-4 py-3 hover:bg-mpca-parchment/40 ${selected?.id === t.id ? "bg-mpca-cream/60" : ""}`} data-testid={`thread-${t.id}`}>
                                    <div className="font-serif text-[13px] text-mpca-green-dark truncate">{t.title}</div>
                                    <div className="text-[10px] text-mpca-gray-dark mt-0.5">
                                        {t.message_count || 0} messages{t.last_message_at ? ` · ${new Date(t.last_message_at).toLocaleDateString("en-IN")}` : ""}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="md:col-span-8">
                    {selected ? (
                        <>
                            <div className="mb-2 text-[10px] uppercase tracking-widest text-mpca-brass">{selected.title}</div>
                            <DiscussionThread threadId={selected.id} height="70vh" />
                        </>
                    ) : (
                        <div className="bulletin-card p-16 text-center text-[12px] italic text-mpca-gray-dark">Pick a conversation on the left or start a new one.</div>
                    )}
                </div>
            </div>

            {/* New Conversation dialog */}
            {dialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDialog(false)} data-testid="new-thread-dialog">
                    <div className="bg-mpca-ivory border-2 border-mpca-oxblood p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-3">
                            <div className="font-serif text-xl text-mpca-green-dark">New Conversation</div>
                            <button onClick={() => setDialog(false)}><X size={14} /></button>
                        </div>
                        {err && <div className="text-[10px] text-mpca-oxblood flex items-center gap-1 mb-2"><ShieldAlert size={11} /> {err}</div>}
                        <label className="block mb-3">
                            <div className="overline mb-1">To</div>
                            <select value={pick} onChange={(e) => setPick(e.target.value)} className="input-heritage !py-1.5 !text-xs" data-testid="new-thread-body">
                                <option value="">— Select recipient —</option>
                                {pickOptions.map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
                            </select>
                        </label>
                        {!isMPCA && <div className="text-[10px] text-mpca-brass italic mb-3">Divisions can only converse with MPCA. Inter-division conversations are disabled by policy.</div>}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDialog(false)} className="text-[11px] uppercase tracking-widest px-3 py-1.5 border border-mpca-brass/40">Cancel</button>
                            <button onClick={openThread} disabled={!pick || busy} className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1 disabled:opacity-40" data-testid="new-thread-open-btn">
                                {busy ? <Loader2 size={11} className="animate-spin" /> : "Open"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Discussions;
