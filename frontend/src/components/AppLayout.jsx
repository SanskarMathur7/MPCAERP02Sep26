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
    UserCheck,
    ShieldCheck,
} from "lucide-react";

const DASHBOARD_LINK = { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard };
const ORG_LINK = { to: "/org", label: "Organisation", icon: Landmark };

// ═══════════════════════════════════════════════════════════════════
// User-requested MVP nav — active tabs.
// Everything else is present but disabled under "Coming Soon", keeping
// the original groupings visible so nothing looks abandoned.
// ═══════════════════════════════════════════════════════════════════

const NAV_DOMAINS = [
    {
        domain: "Secretarial",
        items: [
            { to: "/members", label: "Membership Register", icon: Users },
            { to: "/meetings", label: "AGM & Meetings", icon: Calendar },
            { to: "/disclosures", label: "Disclosures", icon: FileText },
        ],
    },
    {
        domain: "Operations",
        items: [
            { to: "/tournaments", label: "MPCA Tournament Calendar", icon: TrophyIcon },
            { to: "/venues", label: "Venues & Grounds", icon: MapPinIcon },
            { to: "/match-officials", label: "Match Officials", icon: ShieldCheck },
            { to: "/selection-funnel", label: "Selection Funnel", icon: Users },
        ],
    },
];

// Coming Soon — grouped by same domain labels as before so the roadmap
// stays visible to stakeholders. Routes still exist in App.js and can be
// reached by URL, but the nav treats them as future work.
const COMING_SOON_DOMAINS = [
    {
        domain: "Secretarial",
        items: [
            { label: "Elections", icon: Vote },
        ],
    },
    {
        domain: "Financial",
        items: [
            { label: "Budget Ledger", icon: Coins },
            { label: "Budget vs Actual", icon: Coins },
            { label: "Tournament Budgets", icon: Wallet },
            { label: "Division Grants", icon: HandCoins },
            { label: "Grant Claims", icon: HandCoins },
            { label: "General Ledger", icon: BookOpen },
            { label: "AI Rulebook", icon: BookOpen },
            { label: "Audit Log", icon: BookOpen },
            { label: "Procurement", icon: ShoppingCart },
            { label: "Purchase Orders", icon: ShoppingCart },
            { label: "Vendor Master", icon: Users },
            { label: "Vendor KYC", icon: UserCheck },
            { label: "Vendor Bills", icon: FileCheck },
            { label: "Fees & Subscriptions", icon: Receipt },
            { label: "Bank Operations", icon: Landmark },
            { label: "Financial Powers", icon: Scale },
        ],
    },
    {
        domain: "Operations",
        items: [
            { label: "Player Register", icon: TrophyIcon },
            { label: "Fixtures & Rankings", icon: Calendar },
        ],
    },
    {
        domain: "Assets & HR",
        items: [
            { label: "Asset Register", icon: Landmark },
            { label: "Employees & Payroll", icon: Users },
        ],
    },
    {
        domain: "Governance",
        items: [
            { label: "Document Manager", icon: FileCheck },
            { label: "Compliance Register", icon: ShieldCheck },
        ],
    },
    {
        domain: "Future Modules",
        items: [
            { label: "Team Officials", icon: Trophy },
            { label: "Grievance Redressal", icon: AlertTriangle },
            { label: "Constitution Library", icon: BookOpen },
            { label: "Registrar Assistant", icon: Sparkles },
        ],
    },
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
                            {/* Defensive: strip a leading honorific from name so we never render 'Shri Shri …' */}
                            {(() => {
                                const h = persona.honorific || "";
                                const n = persona.name || "";
                                const alreadyPrefixed = h && n.toLowerCase().startsWith(h.toLowerCase());
                                return alreadyPrefixed ? n : `${h} ${n}`.trim();
                            })()}
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
                        <li>
                            <NavLink
                                to={ORG_LINK.to}
                                data-testid="nav-organisation"
                                className={({ isActive }) =>
                                    `group flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-300 border-l-2 ${
                                        isActive
                                            ? "bg-mpca-brass/10 text-mpca-gold-light border-mpca-brass"
                                            : "text-mpca-ivory/70 border-transparent hover:bg-white/5 hover:text-mpca-ivory hover:border-mpca-brass/40"
                                    }`
                                }
                            >
                                <ORG_LINK.icon size={16} strokeWidth={1.5} />
                                <span className="tracking-wide">{ORG_LINK.label}</span>
                                <span className="ml-auto text-[9px] font-mono text-mpca-brass/70 tracking-widest">10·54</span>
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

                    <div className="border-t border-mpca-brass/15 pt-4">
                        <div className="overline text-[9px] !text-mpca-gold-light/70 mb-3 px-2">
                            Coming Soon
                        </div>
                        {COMING_SOON_DOMAINS.map((group) => (
                            <div key={`cs-${group.domain}`} className="mb-4">
                                <div
                                    className="text-[8px] tracking-[0.2em] uppercase text-mpca-gold-light/40 mb-1.5 px-3"
                                    data-testid={`nav-coming-domain-${group.domain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                                >
                                    {group.domain}
                                </div>
                                <ul className="space-y-0.5">
                                    {group.items.map((item) => (
                                        <li key={item.label}>
                                            <div
                                                className="flex items-center gap-3 px-3 py-2 text-[13px] text-mpca-ivory/40 cursor-not-allowed select-none"
                                                data-testid={`nav-future-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                                                title="Coming soon"
                                            >
                                                <item.icon size={14} strokeWidth={1.5} />
                                                <span className="tracking-wide flex-1">{item.label}</span>
                                                <span className="text-[8px] tracking-widest uppercase text-mpca-brass/50">Soon</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
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
