import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    LayoutDashboard,
    Users,
    FileText,
    Calendar,
    Vote,
    Receipt,
    Landmark,
    Trophy,
    AlertTriangle,
    Sparkles,
    LogOut,
    ChevronRight,
    BookOpen,
} from "lucide-react";

const PRIMARY_NAV = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, phase: 1 },
    { to: "/members", label: "Membership Register", icon: Users, phase: 1 },
    { to: "/meetings", label: "AGM & Meetings", icon: Calendar, phase: 2 },
    { to: "/elections", label: "Elections", icon: Vote, phase: 2 },
    { to: "/disclosures", label: "Public Disclosures", icon: FileText, phase: 1 },
];

const FUTURE_NAV = [
    { label: "Fees & Subscriptions", icon: Receipt, phase: 3 },
    { label: "Bank Operations", icon: Landmark, phase: 3 },
    { label: "Player Registration", icon: Trophy, phase: 4 },
    { label: "Grievance Redressal", icon: AlertTriangle, phase: 4 },
    { label: "Constitution Library", icon: BookOpen, phase: 5 },
    { label: "AI Assistant", icon: Sparkles, phase: 5 },
];

const MPCACrest = ({ className = "" }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" strokeWidth={1.25}>
        <circle cx="32" cy="32" r="30" stroke="currentColor" />
        <circle cx="32" cy="32" r="24" stroke="currentColor" strokeOpacity="0.5" />
        {/* Stumps */}
        <line x1="26" y1="22" x2="26" y2="42" stroke="currentColor" />
        <line x1="32" y1="22" x2="32" y2="42" stroke="currentColor" />
        <line x1="38" y1="22" x2="38" y2="42" stroke="currentColor" />
        {/* Bails */}
        <line x1="24" y1="22" x2="34" y2="22" stroke="currentColor" />
        <line x1="30" y1="22" x2="40" y2="22" stroke="currentColor" />
        {/* Ball */}
        <circle cx="46" cy="38" r="3" stroke="currentColor" fill="currentColor" fillOpacity="0.4" />
        {/* Seam */}
        <path d="M 43 38 Q 46 36 49 38" stroke="currentColor" fill="none" />
    </svg>
);

const AppLayout = ({ children }) => {
    const { persona, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="min-h-screen flex bg-mpca-ivory" data-testid="app-layout">
            {/* Sidebar */}
            <aside
                className="w-72 bg-mpca-green-dark text-mpca-ivory flex-shrink-0 flex flex-col"
                data-testid="app-sidebar"
                style={{
                    backgroundImage:
                        "linear-gradient(180deg, var(--mpca-green-dark) 0%, #0a1e15 100%)",
                }}
            >
                {/* Brand */}
                <div className="px-6 pt-8 pb-6 border-b border-mpca-brass/20">
                    <div className="flex items-center gap-3">
                        <MPCACrest className="w-11 h-11 text-mpca-brass" />
                        <div>
                            <div className="font-serif text-xl text-mpca-ivory leading-none">
                                MPCA
                            </div>
                            <div className="overline text-[9px] mt-1.5 text-mpca-gold-light/70">
                                Est. 1956 · BCCI Affiliated
                            </div>
                        </div>
                    </div>
                </div>

                {/* Persona card */}
                {persona && (
                    <div className="px-6 py-5 border-b border-mpca-brass/20 bg-black/20">
                        <div className="overline text-[9px] text-mpca-gold-light/60 mb-2">
                            Signed In As
                        </div>
                        <div className="font-serif text-lg text-mpca-ivory leading-tight">
                            {persona.honorific} {persona.name}
                        </div>
                        <div className="text-[11px] tracking-wide text-mpca-gold-light/80 mt-1">
                            {persona.post}
                        </div>
                    </div>
                )}

                {/* Primary nav */}
                <nav className="flex-1 px-4 py-6 overflow-y-auto">
                    <div className="overline text-[9px] text-mpca-gold-light/50 mb-3 px-2">
                        Phases I & II — Live
                    </div>
                    <ul className="space-y-0.5 mb-8">
                        {PRIMARY_NAV.map((item) => (
                            <li key={item.to}>
                                <NavLink
                                    to={item.to}
                                    data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                                    className={({ isActive }) =>
                                        `group flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-300 border-l-2 ${
                                            isActive
                                                ? "bg-mpca-brass/10 text-mpca-gold-light border-mpca-brass"
                                                : "text-mpca-ivory/70 border-transparent hover:bg-white/5 hover:text-mpca-ivory hover:border-mpca-brass/40"
                                        }`
                                    }
                                >
                                    <item.icon size={16} strokeWidth={1.5} />
                                    <span className="tracking-wide">{item.label}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>

                    <div className="overline text-[9px] text-mpca-gold-light/50 mb-3 px-2">
                        Roadmap — Coming Soon
                    </div>
                    <ul className="space-y-0.5">
                        {FUTURE_NAV.map((item) => (
                            <li key={item.label}>
                                <div
                                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-mpca-ivory/40 cursor-not-allowed select-none"
                                    data-testid={`nav-future-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                                >
                                    <item.icon size={16} strokeWidth={1.5} />
                                    <span className="tracking-wide flex-1">{item.label}</span>
                                    <span className="text-[9px] tracking-[0.2em] uppercase text-mpca-brass/50">
                                        P{item.phase}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Logout */}
                <div className="px-4 py-5 border-t border-mpca-brass/20">
                    <button
                        onClick={handleLogout}
                        data-testid="logout-btn"
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-mpca-ivory/80 hover:text-mpca-oxblood hover:bg-white/5 transition-colors duration-300"
                    >
                        <span className="flex items-center gap-3">
                            <LogOut size={16} strokeWidth={1.5} />
                            <span className="tracking-wide">Sign Out</span>
                        </span>
                        <ChevronRight size={14} strokeWidth={1.5} />
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-y-auto" data-testid="app-main">
                {children}
            </main>
        </div>
    );
};

export default AppLayout;
