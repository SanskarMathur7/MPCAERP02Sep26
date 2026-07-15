import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const AIAssistantPanel = () => {
    const { persona } = useAuth();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: "assistant", text: `Namaste! I'm the MPCA Grants Assistant. Ask me anything about which grants your body can claim, required documents, eligibility conditions, or scheme dependencies.` }
    ]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [sessionId] = useState(() => `ai-${Date.now()}`);
    const scrollRef = useRef(null);

    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, open]);

    // Only visible to Div/Dist personas
    if (!persona || !["division-secretary", "district-secretary"].includes(persona.id)) return null;

    const send = async () => {
        if (!input.trim() || busy) return;
        const userMsg = input.trim();
        setMessages((m) => [...m, { role: "user", text: userMsg }]);
        setInput("");
        setBusy(true);
        try {
            const { data } = await api.post("/ai-assistant/chat", { session_id: sessionId, message: userMsg });
            setMessages((m) => [...m, { role: "assistant", text: data.reply || "(no reply)" }]);
        } catch (e) {
            setMessages((m) => [...m, { role: "assistant", text: `Error: ${e?.response?.data?.detail || e.message}` }]);
        } finally { setBusy(false); }
    };

    return (
        <>
            {/* Floating trigger button */}
            {!open && (
                <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-mpca-oxblood text-mpca-ivory shadow-lg hover:scale-105 transition-transform flex items-center justify-center" data-testid="ai-assistant-fab">
                    <Sparkles size={24} />
                </button>
            )}

            {/* Panel */}
            {open && (
                <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[92vw] h-[560px] max-h-[85vh] bulletin-card p-0 shadow-2xl flex flex-col" data-testid="ai-assistant-panel">
                    <div className="p-4 border-b border-mpca-brass/20 flex items-center justify-between bg-mpca-oxblood text-mpca-ivory">
                        <div>
                            <div className="overline text-[9px] !text-mpca-gold-light">MPCA · AI Grants Assistant</div>
                            <div className="font-serif text-lg">Ask about grants</div>
                        </div>
                        <button onClick={() => setOpen(false)} data-testid="ai-close-btn"><X size={18} /></button>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="ai-messages">
                        {messages.map((m, i) => (
                            <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : ""}`}>
                                <div className={`inline-block p-3 max-w-[85%] ${m.role === "user" ? "bg-mpca-green-dark text-mpca-ivory" : "bg-mpca-cream/60 text-mpca-green-dark"}`}>
                                    <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                                </div>
                            </div>
                        ))}
                        {busy && (
                            <div className="text-sm text-mpca-brass italic">AI is thinking...</div>
                        )}
                    </div>

                    <div className="p-3 border-t border-mpca-brass/20">
                        <div className="flex gap-2 mb-2 flex-wrap">
                            {[
                                "What grants am I eligible for?",
                                "Documents for Scheme 1-A?",
                                "How do I claim Ground Maintenance subsidy?",
                            ].map((q) => (
                                <button key={q} onClick={() => setInput(q)} className="text-[10px] px-2 py-1 border border-mpca-brass/40 text-mpca-brass hover:bg-mpca-cream" data-testid={`quick-${q.slice(0, 10)}`}>
                                    {q}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input className="input-heritage flex-1 text-sm" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask a question..." data-testid="ai-input" />
                            <button className="btn-heritage-primary" onClick={send} disabled={!input.trim() || busy} data-testid="ai-send-btn"><Send size={12} /></button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AIAssistantPanel;
