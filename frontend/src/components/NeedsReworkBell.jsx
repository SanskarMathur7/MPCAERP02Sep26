/**
 * NeedsReworkBell.jsx — Iter 109 · Inbox bell for M&C rework items.
 *
 * Polls /api/mc/inbox/needs-rework. Shows an unread count badge when > 0.
 * Click opens a dropdown listing the buckets (per workflow) + items.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Bell } from "lucide-react";

export default function NeedsReworkBell() {
    const [data, setData] = useState({ count: 0, buckets: [] });
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/mc/inbox/needs-rework");
            setData(data || { count: 0, buckets: [] });
        } catch { /* silent — bell simply hides */ }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 60000); // 1-min poll
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => {
        const onDoc = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const count = data.count || 0;

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                data-testid="needs-rework-bell"
                onClick={() => setOpen(o => !o)}
                aria-label={`Needs rework: ${count}`}
                style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: 6, position: "relative", display: "inline-flex",
                    color: count > 0 ? "#8B1F1F" : "#4C5750",
                }}
            >
                <Bell size={18} />
                {count > 0 && (
                    <span
                        data-testid="needs-rework-count"
                        style={{
                            position: "absolute", top: 0, right: 0,
                            background: "#8B1F1F", color: "#fff",
                            fontSize: 10, fontWeight: 800,
                            borderRadius: 999, padding: "2px 5px",
                            minWidth: 16, textAlign: "center", lineHeight: 1,
                        }}>
                        {count > 99 ? "99+" : count}
                    </span>
                )}
            </button>

            {open && (
                <div
                    data-testid="needs-rework-panel"
                    style={{
                        position: "absolute", right: 0, top: 40, zIndex: 50,
                        width: 360, maxHeight: 440, overflowY: "auto",
                        background: "#fff", border: "1px solid rgba(14,31,27,0.2)",
                        borderRadius: 6, boxShadow: "0 24px 42px -18px rgba(14,31,27,0.35)",
                        padding: 14, fontFamily: "'Nunito', system-ui, sans-serif",
                    }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Needs rework</div>
                    <div style={{ fontSize: 12, color: "#4C5750", marginBottom: 10 }}>
                        Items returned to you for correction.
                    </div>
                    {count === 0 ? (
                        <div style={{ fontSize: 13, color: "#4C5750", padding: 12, textAlign: "center" }}>
                            All clear — nothing pending rework.
                        </div>
                    ) : (
                        data.buckets.map(b => (
                            <div key={b.workflow_key} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#0D3B2E", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                                    {b.workflow_label} ({b.count})
                                </div>
                                {b.items.slice(0, 5).map(i => (
                                    <div
                                        key={i.id}
                                        data-testid={`rework-item-${i.id}`}
                                        style={{
                                            padding: "6px 8px", borderRadius: 3,
                                            background: "rgba(184,131,40,0.10)",
                                            borderLeft: "3px solid #B88328",
                                            marginBottom: 4, fontSize: 12,
                                        }}>
                                        <div style={{ fontWeight: 700, color: "#0E1F1B" }}>{i.name}</div>
                                        <div style={{ fontSize: 10, color: "#4C5750", fontFamily: "'IBM Plex Mono', monospace" }}>{i.id}</div>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
