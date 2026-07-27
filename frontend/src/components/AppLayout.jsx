import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
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
    ChevronsLeft,
    ChevronsRight,
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
    Shield,
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
        domain: "Financial",
        items: [
            { to: "/schemes", label: "MPCA Schemes Register", icon: BookOpen },
            { to: "/grant-claims", label: "Grant Claims", icon: HandCoins },
        ],
    },
    {
        domain: "Operations",
        items: [
            { to: "/tournaments", label: "Tournaments", icon: TrophyIcon },
            { to: "/tournament-calendar", label: "Tournament Calendar", icon: Calendar },
            { to: "/venues", label: "Venues & Grounds", icon: MapPinIcon },
            { to: "/players", label: "Player Register", icon: Users },
            { to: "/player-registrations", label: "Season Onboarding", icon: Users },
            { to: "/match-officials", label: "Match Officials", icon: ShieldCheck },
            { to: "/da-review", label: "DA Review Inbox", icon: FileCheck },
        ],
    },
    {
        domain: "Governance",
        // Only President / Secretary / Sys-Admin see this — filter applied in render.
        state_only: true,
        rbac_admin_only: true,
        items: [
            { to: "/access-control", label: "Access Control (RBAC)", icon: Shield },
        ],
    },
];

// Match Official persona sees a simplified nav
const OFFICIAL_NAV_DOMAINS = [
    {
        domain: "My Portal",
        items: [
            { to: "/my-da-forms", label: "My DA / TA Forms", icon: FileCheck },
        ],
    },
    {
        domain: "Reference",
        items: [
            { to: "/tournament-calendar", label: "Tournament Calendar", icon: TrophyIcon },
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
import SeasonSwitcher from "@/components/SeasonSwitcher";
import AIAssistantPanel from "@/components/AIAssistantPanel";

const AppLayout = ({ children }) => {
    const { persona, logout } = useAuth();
    const navigate = useNavigate();
    // M38e · Persistable sidebar collapse
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem("sidebar:collapsed") === "1"; }
        catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0"); }
        catch { /* no-op */ }
    }, [collapsed]);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="h-screen flex bg-mpca-ivory overflow-hidden" data-testid="app-layout">
            {/* Sidebar · independent scroll · collapsible */}
            <aside
                className={`${collapsed ? "w-16" : "w-72"} bg-mpca-green-dark text-mpca-ivory flex-shrink-0 flex flex-col h-full transition-[width] duration-300`}
                data-testid="app-sidebar"
                data-collapsed={collapsed ? "1" : "0"}
                style={{
                    backgroundImage:
                        "linear-gradient(180deg, var(--mpca-green-dark) 0%, #0a1e15 100%)",
                }}
            >
                {/* Brand + collapse toggle */}
                <div className="px-4 pt-6 pb-6 border-b-2 border-mpca-oxblood flex items-center gap-2">
                    <MPCACrest className={`${collapsed ? "w-9 h-9 mx-auto" : "w-11 h-11 ml-2"} text-mpca-brass shrink-0`} />
                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <div className="font-serif text-xl text-mpca-ivory leading-none">
                                MPCA · ERP
                            </div>
                            <div className="overline text-[9px] mt-1.5 !text-mpca-gold-light/80">
                                BCCI Affiliated · Est. 1957
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setCollapsed((c) => !c)}
                        data-testid="sidebar-collapse-btn"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className={`${collapsed ? "" : "ml-auto"} shrink-0 p-1.5 text-mpca-gold-light/60 hover:text-mpca-gold-light hover:bg-white/5 transition-colors`}
                    >
                        {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
                    </button>
                </div>

                {/* Persona / Tenant card — hidden when collapsed */}
                {persona && !collapsed && (
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
                    {persona?.id !== "match-official" && (
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
                                {!collapsed && <span className="tracking-wide">{DASHBOARD_LINK.label}</span>}
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
                                title={collapsed ? ORG_LINK.label : undefined}
                            >
                                <ORG_LINK.icon size={16} strokeWidth={1.5} />
                                {!collapsed && <>
                                    <span className="tracking-wide">{ORG_LINK.label}</span>
                                    <span className="ml-auto text-[9px] font-mono text-mpca-brass/70 tracking-widest">10·54</span>
                                </>}
                            </NavLink>
                        </li>
                    </ul>
                    )}

                    {(persona?.id === "match-official" ? OFFICIAL_NAV_DOMAINS : NAV_DOMAINS)
                        .filter((group) => {
                            // Governance / RBAC visible only to President, Secretary, Sys Admin (Q3a)
                            if (group.rbac_admin_only) {
                                return persona?.body_type === "State" && ["president", "secretary", "system-administrator"].includes(persona?.id);
                            }
                            return true;
                        })
                        .map((group) => (
                        <div key={group.domain} className="mb-6">
                            {!collapsed && (
                                <div
                                    className="overline text-[9px] !text-mpca-gold-light/70 mb-3 px-2"
                                    data-testid={`nav-domain-${group.domain.toLowerCase()}`}
                                >
                                    {group.domain}
                                </div>
                            )}
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
                                            title={collapsed ? item.label : undefined}
                                        >
                                            <item.icon size={16} strokeWidth={1.5} />
                                            {!collapsed && <span className="tracking-wide">{item.label}</span>}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {persona?.id !== "match-official" && !collapsed && (
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
                    )}
                </nav>

                {/* Logout */}
                <div className="px-4 py-5 border-t border-mpca-brass/20">
                    <button
                        onClick={handleLogout}
                        data-testid="logout-btn"
                        title={collapsed ? "Sign Out" : undefined}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-mpca-ivory/80 hover:text-mpca-oxblood hover:bg-white/5 transition-colors duration-300"
                    >
                        <span className="flex items-center gap-3">
                            <LogOut size={16} strokeWidth={1.5} />
                            {!collapsed && <span className="tracking-wide">Sign Out</span>}
                        </span>
                        {!collapsed && <ChevronRight size={14} strokeWidth={1.5} />}
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-y-auto" data-testid="app-main">
                <div className="sticky top-0 z-30 bg-mpca-cream/95 backdrop-blur-sm border-b border-mpca-brass/20 px-6 py-2 flex items-center justify-end gap-3" data-testid="app-topbar">
                    <SeasonSwitcher />
                </div>
                {children}
            </main>
            <AIAssistantPanel />
        </div>
    );
};

export default AppLayout;
