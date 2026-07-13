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
    Scale,
    HandCoins,
    Coins,
    ShoppingCart,
    Trophy as TrophyIcon,
    FileCheck,
    Wallet,
    MapPin as MapPinIcon,
} from "lucide-react";

const DASHBOARD_LINK = { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard };

const NAV_DOMAINS = [
    {
        domain: "Secretarial",
        items: [
            { to: "/members", label: "Membership Register", icon: Users },
            { to: "/meetings", label: "AGM & Meetings", icon: Calendar },
            { to: "/elections", label: "Elections", icon: Vote },
            { to: "/disclosures", label: "Disclosures", icon: FileText },
        ],
    },
    {
        domain: "Financial",
        items: [
            { to: "/budgets", label: "Budget Ledger", icon: Coins },
            { to: "/budget-vs-actual", label: "Budget vs Actual", icon: Coins },
            { to: "/tournament-budgets", label: "Tournament Budgets", icon: Wallet },
            { to: "/division-grants", label: "Division Grants", icon: HandCoins },
            { to: "/claims", label: "Grant Claims", icon: HandCoins },
            { to: "/ledger", label: "General Ledger", icon: BookOpen },
            { to: "/rulebook", label: "AI Rulebook", icon: BookOpen },
            { to: "/audit-log", label: "Audit Log", icon: BookOpen },
            { to: "/procurement", label: "Procurement", icon: ShoppingCart },
            { to: "/vendors", label: "Vendor Master", icon: Users },
            { to: "/vendor-bills", label: "Vendor Bills", icon: FileCheck },
            { to: "/fees", label: "Fees & Subscriptions", icon: Receipt },
            { to: "/bank", label: "Bank Operations", icon: Landmark },
            { to: "/financial-powers", label: "Financial Powers", icon: Scale },
        ],
    },
    {
        domain: "Operations",
        items: [
            { to: "/players", label: "Player Register", icon: TrophyIcon },
            { to: "/selection", label: "Selection Funnel", icon: Users },
            { to: "/tournaments", label: "Tournaments", icon: TrophyIcon },
            { to: "/fixtures", label: "Fixtures & Rankings", icon: Calendar },
            { to: "/venues", label: "Venues & Grounds", icon: MapPinIcon },
        ],
    },
];

const COMING_SOON = [
    { label: "Match Officials", icon: Trophy },
    { label: "Team Officials", icon: Trophy },
    { label: "Grievance Redressal", icon: AlertTriangle },
    { label: "Constitution Library", icon: BookOpen },
    { label: "Registrar Assistant", icon: Sparkles },
];

import { MpcaEmblem as MPCACrest } from "@/components/MpcaEmblem";
import NotificationBell from "@/components/NotificationBell";

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
                <div className="px-6 pt-8 pb-6 border-b-2 border-mpca-oxblood">
                    <div className="flex items-center gap-3">
                        <MPCACrest className="w-11 h-11 text-mpca-brass" />
                        <div>
                            <div className="font-serif text-xl text-mpca-ivory leading-none">
                                MPCA · ERP
                            </div>
                            <div className="overline text-[9px] mt-1.5 !text-mpca-gold-light/80">
                                BCCI Affiliated · Est. 1957
                            </div>
                        </div>
                    </div>
                </div>

                {/* Persona / Tenant card */}
                {persona && (
                    <div className="px-6 py-5 border-b border-mpca-brass/20 bg-black/30">
                        <div className="flex items-start justify-between gap-3">
                            <div className="overline text-[9px] !text-mpca-gold-light/70 mb-2">
                                Signed In As
                            </div>
                            <div className="flex items-center gap-2">
                                <NotificationBell />
                                <button
                                    onClick={() => navigate("/login")}
                                    data-testid="switch-persona-btn"
                                    className="text-[9px] tracking-[0.2em] uppercase text-mpca-gold-light/70 hover:text-mpca-gold-light border border-mpca-brass/40 hover:border-mpca-brass px-2 py-1 transition-colors"
                                    title="Switch persona"
                                >
                                    Switch
                                </button>
                            </div>
                        </div>
                        <div className="font-serif text-lg text-mpca-ivory leading-tight">
                            {persona.honorific} {persona.name}
                        </div>
                        <div className="text-[11px] tracking-wide text-mpca-gold-light/85 mt-1">
                            {persona.post}
                        </div>
                        {persona.body_name && (
                            <div className="mt-3 flex items-center gap-2">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-mpca-oxblood" />
                                <span className="text-[10px] tracking-[0.2em] uppercase text-mpca-brass font-semibold">
                                    {persona.body_type} · {persona.body_name}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Primary nav */}
                <nav className="flex-1 px-4 py-6 overflow-y-auto">
                    <ul className="space-y-0.5 mb-6">
                        <li>
                            <NavLink
                                to={DASHBOARD_LINK.to}
                                data-testid="nav-dashboard"
                                className={({ isActive }) =>
                                    `group flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-300 border-l-2 ${
                                        isActive
                                            ? "bg-mpca-brass/10 text-mpca-gold-light border-mpca-brass"
                                            : "text-mpca-ivory/70 border-transparent hover:bg-white/5 hover:text-mpca-ivory hover:border-mpca-brass/40"
                                    }`
                                }
                            >
                                <DASHBOARD_LINK.icon size={16} strokeWidth={1.5} />
                                <span className="tracking-wide">{DASHBOARD_LINK.label}</span>
                            </NavLink>
                        </li>
                    </ul>

                    {NAV_DOMAINS.map((group) => (
                        <div key={group.domain} className="mb-6">
                            <div
                                className="overline text-[9px] !text-mpca-gold-light/70 mb-3 px-2"
                                data-testid={`nav-domain-${group.domain.toLowerCase()}`}
                            >
                                {group.domain}
                            </div>
                            <ul className="space-y-0.5">
                                {group.items.map((item) => (
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
                        </div>
                    ))}

                    <div className="overline text-[9px] !text-mpca-gold-light/70 mb-3 px-2">
                        Coming Soon
                    </div>
                    <ul className="space-y-0.5">
                        {COMING_SOON.map((item) => (
                            <li key={item.label}>
                                <div
                                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-mpca-ivory/45 cursor-not-allowed select-none"
                                    data-testid={`nav-future-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                                >
                                    <item.icon size={16} strokeWidth={1.5} />
                                    <span className="tracking-wide flex-1">{item.label}</span>
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
