import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, AtSign, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * M39 · Discussion Thread component (reused by tournament tab + global inbox)
 *
 * Props:
 *   threadId  · string  (already resolved by parent)
 *   height    · css height override (e.g. "70vh")
 */
const DiscussionThread = ({ threadId, height = "60vh" }) => {
    const { persona } = useAuth();
    const [messages, setMessages] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [body, setBody] = useState("");
    const [mentions, setMentions] = useState([]);
    const [showPicker, setShowPicker] = useState(false);
    const [err, setErr] = useState("");
    const endRef = useRef(null);

    const load = async () => {
        try {
            const { data } = await api.get(`/discussions/${threadId}/messages`);
            setMessages(data || []);
            setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } finally { setLoading(false); }
    };
    useEffect(() => { if (threadId) load(); /* eslint-disable-next-line */ }, [threadId]);
    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/discussions/mentions/candidates");
                setCandidates(data || []);
            } catch { setCandidates([]); }
        })();
    }, []);

    const post = async () => {
        if (!body.trim() || posting) return;
        setPosting(true); setErr("");
        try {
            await api.post(`/discussions/${threadId}/messages`, { body: body.trim(), mentions });
            setBody(""); setMentions([]);
            await load();
        } catch (e) {
            setErr(e?.response?.data?.detail || e.message);
        } finally { setPosting(false); }
    };

    const filteredCandidates = useMemo(() => {
        const at = body.lastIndexOf("@");
        if (at < 0) return [];
        const q = body.slice(at + 1).toLowerCase();
        if (q.includes(" ")) return [];
        return candidates.filter((c) => c.name.toLowerCase().includes(q) || (c.post_name || "").toLowerCase().includes(q)).slice(0, 8);
    }, [body, candidates]);

    const addMention = (c) => {
        const at = body.lastIndexOf("@");
        const newBody = (at < 0 ? body : body.slice(0, at)) + `@${c.name} `;
        setBody(newBody);
        setMentions((m) => [...m, { persona_id: c.persona_id, name: c.name, body_code: c.body_code }]);
        setShowPicker(false);
    };

    return (
        <div className="bulletin-card flex flex-col" style={{ height }} data-testid="discussion-thread">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3" data-testid="discussion-messages">
                {loading ? <div className="text-mpca-brass text-xs flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading…</div> : messages.length === 0 ? (
                    <div className="text-mpca-gray-dark text-[11px] italic text-center py-10">No messages yet. Be the first to write.</div>
                ) : messages.map((m) => {
                    const mine = (m.author_name || "").trim().toLowerCase() === (persona?.name || "").trim().toLowerCase();
                    return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
                            <div className={`max-w-lg p-3 border ${mine ? "border-mpca-oxblood bg-mpca-oxblood/5" : "border-mpca-brass/30 bg-mpca-parchment/40"}`}>
                                <div className="text-[10px] uppercase tracking-widest text-mpca-brass mb-1">
                                    {m.author_name || "Unknown"}{m.author_body_code && ` · ${m.author_body_code}`}
                                </div>
                                <div className="text-[13px] text-mpca-green-dark whitespace-pre-wrap">{m.body}</div>
                                {(m.mentions || []).length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {m.mentions.map((mn, i) => (
                                            <span key={i} className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-mpca-brass/10 text-mpca-brass border border-mpca-brass/30 flex items-center gap-1">
                                                <AtSign size={9} /> {mn.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="text-[9px] text-mpca-gray-dark mt-1 text-right">
                                    {new Date(m.posted_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>

            {/* Composer */}
            {err && (
                <div className="mx-5 mb-2 text-[10px] text-mpca-oxblood flex items-center gap-1" data-testid="discussion-err">
                    <ShieldAlert size={11} /> {err}
                </div>
            )}
            <div className="border-t border-mpca-brass/20 p-3 relative" data-testid="discussion-composer">
                <div className="flex gap-2 items-end">
                    <textarea
                        value={body}
                        rows={2}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); }
                            if (e.key === "@") setShowPicker(true);
                            if (e.key === "Escape") setShowPicker(false);
                        }}
                        onChange={(e) => { setBody(e.target.value); if (e.target.value.slice(-1) === "@") setShowPicker(true); }}
                        placeholder="Type your message. Use @ to tag someone. Cmd/Ctrl+Enter to post."
                        className="input-heritage !py-2 !text-xs flex-1 min-h-0 resize-y"
                        data-testid="discussion-input"
                    />
                    <button
                        onClick={post}
                        disabled={!body.trim() || posting}
                        className="text-[11px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-2 flex items-center gap-1 disabled:opacity-40 shrink-0"
                        data-testid="discussion-post-btn"
                    >
                        {posting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Post
                    </button>
                </div>
                {showPicker && filteredCandidates.length > 0 && (
                    <div className="absolute bottom-full left-3 mb-1 bg-mpca-ivory border-2 border-mpca-brass/40 shadow-lg max-h-52 overflow-y-auto z-10 min-w-[300px]" data-testid="mention-picker">
                        {filteredCandidates.map((c, i) => (
                            <button
                                key={`${c.persona_id}-${i}`}
                                onClick={() => addMention(c)}
                                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-mpca-parchment flex items-center gap-2"
                                data-testid={`mention-cand-${i}`}
                            >
                                <AtSign size={10} className="text-mpca-brass" />
                                <span className="font-serif text-mpca-green-dark">{c.name}</span>
                                <span className="text-[9px] text-mpca-gray-dark">{c.post_name} · {c.body_code}</span>
                            </button>
                        ))}
                    </div>
                )}
                {mentions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1" data-testid="mention-pills">
                        {mentions.map((m, i) => (
                            <span key={i} className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-mpca-brass/10 text-mpca-brass border border-mpca-brass/30 flex items-center gap-1">
                                <AtSign size={9} /> {m.name}
                                <button onClick={() => setMentions((mm) => mm.filter((_, ix) => ix !== i))} className="ml-1 text-mpca-oxblood">×</button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DiscussionThread;
