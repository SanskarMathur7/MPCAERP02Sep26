import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, X, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const API = process.env.REACT_APP_BACKEND_URL;
const POLL_MS = 20000; // 20s

const SEV_ICON = {
    info: Info,
    warning: AlertTriangle,
    critical: AlertCircle,
};
const SEV_COLOR = {
    info: "text-mpca-gold-light",
    warning: "text-mpca-brass",
    critical: "text-mpca-oxblood",
};

function timeAgo(iso) {
    try {
        const then = new Date(iso).getTime();
        const diff = Math.max(0, Date.now() - then);
        const m = Math.floor(diff / 60000);
        if (m < 1) return "just now";
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const d = Math.floor(h / 24);
        return `${d}d ago`;
    } catch (_) {
        return "";
    }
}

export const NotificationBell = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const ref = useRef(null);

    const targetQS = useCallback(() => {
        if (!persona || !persona.id) return null;
        const params = new URLSearchParams({ recipient_role_id: persona.id });
        if (persona.body_code) params.append("recipient_body_id", persona.body_code);
        return params.toString();
    }, [persona]);

    const fetchUnread = useCallback(async () => {
        const qs = targetQS();
        if (!qs) return;
        try {
            const r = await fetch(`${API}/api/notifications/stats?${qs}`);
            if (r.ok) {
                const d = await r.json();
                setUnread(d.unread || 0);
            }
        } catch (_) { /* swallow */ }
    }, [targetQS]);

    const fetchList = useCallback(async () => {
        const qs = targetQS();
        if (!qs) return;
        setLoading(true);
        try {
            const r = await fetch(`${API}/api/notifications?${qs}&limit=30`);
            if (r.ok) setItems(await r.json());
        } finally {
            setLoading(false);
        }
    }, [targetQS]);

    // Poll for unread count
    useEffect(() => {
        if (!persona || !persona.id) return;
        fetchUnread();
        const t = setInterval(fetchUnread, POLL_MS);
        return () => clearInterval(t);
    }, [persona, fetchUnread]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const togglePanel = async () => {
        const next = !open;
        setOpen(next);
        if (next) await fetchList();
    };

    const handleItemClick = async (n) => {
        // mark as read
        try {
            await fetch(`${API}/api/notifications/${n.id}/read`, { method: "POST" });
        } catch (_) { /* swallow */ }
        setOpen(false);
        fetchUnread();
        if (n.link) navigate(n.link);
    };

    const markAllRead = async () => {
        const qs = targetQS();
        if (!qs) return;
        try {
            await fetch(`${API}/api/notifications/mark-all-read?${qs}`, { method: "POST" });
            await fetchUnread();
            await fetchList();
        } catch (_) { /* swallow */ }
    };

    if (!persona || !persona.id) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={togglePanel}
                data-testid="notification-bell-btn"
                className="relative w-8 h-8 flex items-center justify-center border border-mpca-brass/40 hover:border-mpca-brass text-mpca-gold-light/80 hover:text-mpca-gold-light transition-colors"
                title="Notifications"
            >
                <Bell size={14} strokeWidth={1.5} />
                {unread > 0 && (
                    <span
                        data-testid="notification-unread-badge"
                        className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-mpca-oxblood text-white text-[10px] font-semibold flex items-center justify-center rounded-full"
                    >
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div
                    data-testid="notification-panel"
                    className="absolute left-full top-0 ml-3 w-80 max-h-[480px] bg-mpca-ivory text-mpca-green-dark shadow-2xl border border-mpca-brass/30 z-50 flex flex-col"
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-mpca-brass/30 bg-mpca-green-dark/95 text-mpca-ivory">
                        <div className="overline text-[10px] !text-mpca-gold-light/90">
                            Notifications {unread > 0 && `· ${unread} unread`}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={markAllRead}
                                data-testid="notification-mark-all-read"
                                className="text-[10px] tracking-wide uppercase text-mpca-gold-light/70 hover:text-mpca-gold-light"
                                title="Mark all as read"
                            >
                                Mark all
                            </button>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-mpca-gold-light/70 hover:text-mpca-gold-light"
                                aria-label="Close"
                            >
                                <X size={14} strokeWidth={1.5} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="px-4 py-8 text-center text-[12px] text-mpca-green-dark/60">
                                Loading…
                            </div>
                        ) : items.length === 0 ? (
                            <div
                                className="px-4 py-10 text-center text-[12px] text-mpca-green-dark/60"
                                data-testid="notification-empty"
                            >
                                No notifications yet.
                            </div>
                        ) : (
                            <ul className="divide-y divide-mpca-brass/20">
                                {items.map((n) => {
                                    const Icon = SEV_ICON[n.severity] || Info;
                                    const color = SEV_COLOR[n.severity] || SEV_COLOR.info;
                                    return (
                                        <li key={n.id}>
                                            <button
                                                onClick={() => handleItemClick(n)}
                                                data-testid={`notification-item-${n.id}`}
                                                className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-mpca-brass/5 transition-colors ${
                                                    n.read ? "opacity-60" : ""
                                                }`}
                                            >
                                                <Icon size={14} strokeWidth={1.5} className={`mt-0.5 ${color}`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-semibold leading-tight">
                                                        {n.title}
                                                    </div>
                                                    <div className="text-[11px] text-mpca-green-dark/70 mt-0.5 truncate">
                                                        {n.message}
                                                    </div>
                                                    <div className="text-[10px] text-mpca-green-dark/50 mt-1 tracking-wide uppercase">
                                                        {timeAgo(n.created_at)}
                                                    </div>
                                                </div>
                                                {!n.read && (
                                                    <span className="w-2 h-2 rounded-full bg-mpca-oxblood mt-1.5 flex-shrink-0" />
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
