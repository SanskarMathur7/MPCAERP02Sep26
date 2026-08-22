import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import NeedsReworkBell from "@/components/NeedsReworkBell";

// Iter 114 · greeting + live clock live in the topbar so every page has them
const DL_INK = "#0E1F1B", DL_INK2 = "#1E332C", DL_GOLD = "#B88328", DL_MUTED = "#4C5750", DL_EMERALD = "#0D3B2E", DL_PAPER = "#FAF4E5", DL_RULE = "rgba(14,31,27,0.12)";
const TopbarGreeting = ({ persona }) => {
    if (!persona) return <div />;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = persona?.name?.split(" ").slice(-1)[0] || persona?.name || "";
    return (
        <div data-testid="topbar-greeting" className="inline-flex items-center gap-2 px-4 h-[38px] rounded-full"
            style={{ background: DL_PAPER, border: `1.5px solid rgba(184,131,40,0.35)` }}>
            <Sparkles size={15} strokeWidth={2.5} style={{ color: DL_GOLD }} />
            <span style={{ color: DL_INK2, fontWeight: 700, fontSize: 14 }}>{greeting},</span>
            <span style={{ color: DL_INK, fontWeight: 800, fontSize: 14, fontFamily: "'Playfair Display', Georgia, serif" }}>
                {persona?.honorific || ""} {firstName}
            </span>
        </div>
    );
};
const TopbarClock = () => {
    const [now, setNow] = useState(new Date());
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
    return (
        <div data-testid="topbar-clock" className="inline-flex items-center gap-3 px-4 h-[38px] rounded-md"
            style={{ background: DL_PAPER, border: `1.5px solid rgba(184,131,40,0.35)` }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "0.18em", color: DL_MUTED, textTransform: "uppercase", fontWeight: 700 }}>
                    {now.toLocaleDateString("en-IN", { weekday: "short" })}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: DL_INK, fontFamily: "'Playfair Display', Georgia, serif" }}>
                    {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
            </div>
            <div style={{ width: 1, height: 24, background: DL_RULE }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "0.18em", color: DL_EMERALD, textTransform: "uppercase", fontWeight: 700 }}>● Live</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: DL_INK, letterSpacing: "0.06em" }}>
                    {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </span>
            </div>
        </div>
    );
};
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
const INBOX_LINK = { to: "/discussions", label: "Inbox", icon: FileText };

// ═══════════════════════════════════════════════════════════════════
// Iter 110 · Reorganised nav — 5 sections for office bearers +
// dedicated System Administration section for the sys-admin persona.
// Office bearers can VIEW masters via direct URL but cannot EDIT them
// (backend enforces via SYSTEM_CONFIG / WORKFLOW_MANAGE / RBAC_MANAGE).
// ═══════════════════════════════════════════════════════════════════

const NAV_DOMAINS = [
    {
        domain: "Dashboard",
        items: [
            { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { to: "/action-center", label: "Action Items", icon: AlertTriangle },
            { to: "/discussions", label: "Inbox", icon: FileText },
        ],
    },
    {
        domain: "Tournaments",
        items: [
            { to: "/tournaments", label: "Tournaments", icon: TrophyIcon },
            { to: "/tournament-calendar", label: "Tournament Calendar", icon: Calendar },
            { to: "/venues", label: "Grounds", icon: MapPinIcon },
            { to: "/match-officials", label: "Match Officials", icon: ShieldCheck, state_only: true },
            { to: "/da-review", label: "DA Review Inbox", icon: FileCheck, state_only: true },
        ],
    },
    {
        domain: "Grants",
        items: [
            // Iter 123c — Two-tab flow for BOTH MPCA and Division Secretaries:
            //   1. MPCA Schemes Register  → browse published schemes, Division hits "Claim" from here.
            //   2. Grant Claims           → your own claims + status (MPCA sees every division's claims).
            { to: "/schemes", label: "MPCA Schemes Register", icon: BookOpen },
            { to: "/grant-claims", label: "Grant Claims", icon: HandCoins },
            // Reimbursement Claims — tournament reimbursement matrix, separate module.
            { to: "/reimbursement-claims", label: "Reimbursement Claims", icon: Receipt },
        ],
    },
    {
        domain: "Players",
        items: [
            { to: "/players", label: "Player Register", icon: Users },
            { to: "/player-registrations", label: "Season Onboarding", icon: Users },
        ],
    },
    {
        domain: "Governance",
        items: [
            { to: "/org", label: "Organisation", icon: Landmark },
            { to: "/members", label: "Members", icon: Users },
            { to: "/meetings", label: "AGM & Meetings", icon: Calendar },
            { to: "/events", label: "Event Calendar", icon: Calendar },
            { to: "/disclosures", label: "Disclosures", icon: FileText },
        ],
    },
    {
        domain: "System Administration",
        sys_admin_only: true,
        items: [
            { to: "/sysadmin/analytics", label: "System Analytics", icon: LayoutDashboard },
            { to: "/access-control", label: "Access Control (RBAC)", icon: Shield },
            { to: "/mc-admin", label: "Maker-Checker Console", icon: ShieldCheck },
            { to: "/sysadmin/eligibility-rules", label: "Eligibility Rules", icon: ShieldCheck },
            { to: "/tournament-master", label: "Tournament Registry", icon: BookOpen },
            { to: "/tournament-wiring", label: "Tournament Wiring", icon: BookOpen },
            { to: "/rate-cards", label: "Rate Cards", icon: BookOpen },
        ],
    },
];

// Match Official persona sees a simplified nav
const OFFICIAL_NAV_DOMAINS = [
    {
        domain: "My Portal",
        items: [
            { to: "/my-assignments", label: "My Assignments", icon: ShieldCheck },
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
                {collapsed ? (
                    <div className="px-2 pt-4 pb-4 border-b-2 border-mpca-oxblood flex flex-col items-center gap-2">
                        <img
                            src="/brand/mpca-logo.png"
                            alt="MPCA"
                            className="w-9 h-9 object-contain shrink-0"
                            style={{ filter: "brightness(0) saturate(100%) invert(72%) sepia(56%) saturate(388%) hue-rotate(2deg) brightness(94%) contrast(90%)" }}
                        />
                        <button
                            onClick={() => setCollapsed(false)}
                            data-testid="sidebar-collapse-btn"
                            title="Expand sidebar"
                            className="w-full flex items-center justify-center p-1.5 rounded text-mpca-gold-light/80 hover:text-mpca-gold-light hover:bg-white/10 border border-mpca-brass/30 hover:border-mpca-brass transition-colors"
                        >
                            <ChevronsRight size={16} />
                        </button>
                    </div>
                ) : (
                    <div className="px-4 pt-6 pb-6 border-b-2 border-mpca-oxblood flex items-center gap-3">
                        <img
                            src="/brand/mpca-logo.png"
                            alt="MPCA"
                            className="w-12 h-12 object-contain ml-1 shrink-0"
                            style={{ filter: "brightness(0) saturate(100%) invert(72%) sepia(56%) saturate(388%) hue-rotate(2deg) brightness(94%) contrast(90%)" }}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="font-serif text-[22px] text-mpca-ivory leading-none">
                                MPCA · ERP
                            </div>
                        </div>
                        <button
                            onClick={() => setCollapsed(true)}
                            data-testid="sidebar-collapse-btn"
                            title="Collapse sidebar"
                            className="ml-auto shrink-0 p-1.5 text-mpca-gold-light/60 hover:text-mpca-gold-light hover:bg-white/5 transition-colors"
                        >
                            <ChevronsLeft size={14} />
                        </button>
                    </div>
                )}

                {/* Persona / Tenant card — hidden when collapsed */}
                {persona && !collapsed && (
                    <div className="px-6 py-5 border-b border-mpca-brass/20 bg-black/30">
                        <div className="overline text-[14px] !text-mpca-gold-light/80 mb-2 font-bold tracking-widest">
                            Signed In As
                        </div>
                        <div className="font-serif text-[22px] text-mpca-ivory leading-tight mt-1">
                            {/* Defensive: strip a leading honorific from name so we never render 'Shri Shri …' */}
                            {(() => {
                                const h = persona.honorific || "";
                                const n = persona.name || "";
                                const alreadyPrefixed = h && n.toLowerCase().startsWith(h.toLowerCase());
                                return alreadyPrefixed ? n : `${h} ${n}`.trim();
                            })()}
                        </div>
                        <div className="text-[15px] tracking-wide text-mpca-gold-light/90 mt-2 font-semibold">
                            {persona.post}
                        </div>
                        {persona.body_name && (
                            <div className="mt-3 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-mpca-oxblood" />
                                <span className="text-[12px] tracking-[0.2em] uppercase text-mpca-brass font-bold">
                                    {persona.body_type} · {persona.body_name}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Primary nav */}
                <nav className={`sidebar-scroll flex-1 ${collapsed ? "px-2" : "px-4"} py-6 overflow-y-scroll`}>
                    {(persona?.id === "match-official" ? OFFICIAL_NAV_DOMAINS : NAV_DOMAINS)
                        .filter((group) => {
                            // Iter 110 · System Administration section only for sys-admin persona.
                            if (group.sys_admin_only) {
                                return persona?.id === "system-administrator" || persona?.role === "sys_admin";
                            }
                            return true;
                        })
                        // Hide the whole domain if every item inside is state-only and the persona isn't State
                        .filter((group) => {
                            if (persona?.body_type === "State") return true;
                            return (group.items || []).some((it) => !it.state_only);
                        })
                        .map((group) => (
                        <div key={group.domain} className="mb-6" data-testid={`nav-group-${group.domain.toLowerCase().replace(/\s+/g, "-")}`}>
                            {!collapsed && (
                                <div
                                    className="overline text-[14px] font-bold !text-mpca-gold-light/85 mb-3 px-2 tracking-[0.28em]"
                                    data-testid={`nav-domain-${group.domain.toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                    {group.domain}
                                </div>
                            )}
                            <ul className="space-y-0.5">
                                {group.items
                                    .filter((item) => !item.state_only || persona?.body_type === "State")
                                    .map((item) => (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                                            className={({ isActive }) =>
                                                `group flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-3 text-[17px] font-semibold transition-all duration-300 border-l-2 ${
                                                    isActive
                                                        ? "bg-mpca-brass/10 text-mpca-gold-light border-mpca-brass"
                                                        : "text-mpca-ivory/85 border-transparent hover:bg-white/5 hover:text-mpca-ivory hover:border-mpca-brass/40"
                                                }`
                                            }
                                            title={collapsed ? item.label : undefined}
                                        >
                                            <item.icon size={20} strokeWidth={1.75} />
                                            {!collapsed && <span className="tracking-wide ml-3">{item.label}</span>}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {/* MPCA-122 · "Coming Soon" section hidden — tabs
                        without functional routes clutter the nav. When
                        modules go live they are added to NAV_DOMAINS above. */}
                    {false && persona?.id !== "match-official" && !collapsed && (
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
                <div className={`${collapsed ? "px-2" : "px-4"} py-5 border-t border-mpca-brass/20`}>
                    <button
                        onClick={handleLogout}
                        data-testid="logout-btn"
                        title={collapsed ? "Sign Out" : undefined}
                        className={`w-full flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-3"} py-2.5 text-sm text-mpca-ivory/80 hover:text-mpca-oxblood hover:bg-white/5 transition-colors duration-300`}
                    >
                        <span className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
                            <LogOut size={16} strokeWidth={1.5} />
                            {!collapsed && <span className="tracking-wide">Sign Out</span>}
                        </span>
                        {!collapsed && <ChevronRight size={14} strokeWidth={1.5} />}
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-y-auto" data-testid="app-main">
                <div className="sticky top-0 z-30 bg-mpca-cream/95 backdrop-blur-sm border-b border-mpca-brass/20 px-6 py-3 flex items-center justify-between gap-3" data-testid="app-topbar">
                    <TopbarGreeting persona={persona} />
                    <div className="flex items-center gap-3">
                        <TopbarClock />
                        <NeedsReworkBell />
                        <SeasonSwitcher />
                    </div>
                </div>
                {/* M39m · Consistent page gutter — every page inherits a comfortable
                    left/right margin so content is never flush against the sidebar. */}
                <div className="px-6 md:px-10 pt-6 pb-16" data-testid="app-content">
                    {children}
                </div>
            </main>
            <AIAssistantPanel />
        </div>
    );
};

export default AppLayout;
