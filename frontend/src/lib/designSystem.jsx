/**
 * MPCA ERP · Shared Design System (Feb 2026)
 * ────────────────────────────────────────────
 * Delhigence-inspired palette · Nunito bold · embossed cards.
 * Import { DL, embossedCard, Pill, StatTile, FilterChip, PageEyebrow,
 * PrimaryButton, SearchInput, SortHeader } from "@/lib/designSystem".
 */
import { Search, ArrowUp, ArrowDown, ArrowUpDown, Plus } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════
// Tokens
// ═════════════════════════════════════════════════════════════════════
export const DL = {
    fontDisplay: "'Nunito', system-ui, sans-serif",
    fontBody:    "'Nunito', system-ui, sans-serif",
    fontMono:    "'IBM Plex Mono', ui-monospace, monospace",

    ivory:      "#F5EFE6",
    paper:      "#FBF8F1",
    paperEdge:  "#EDE5D3",
    ink:        "#0E1F1B",
    ink2:       "#1F2E28",
    ink3:       "#2E3B34",
    muted:      "#4C5750",
    rule:       "rgba(14, 31, 27, 0.16)",
    ruleStrong: "rgba(14, 31, 27, 0.32)",
    emerald:    "#0D3B2E",
    emeraldSoft:"rgba(13, 59, 46, 0.10)",
    gold:       "#B88328",
    danger:     "#8B1F1F",
};

// ═════════════════════════════════════════════════════════════════════
// Embossed card style (4-layer shadow + subtle gradient)
// ═════════════════════════════════════════════════════════════════════
export const embossedCard = (extra = {}) => ({
    background: `linear-gradient(180deg, ${DL.paper} 0%, ${DL.paperEdge} 100%)`,
    borderRadius: "6px",
    border: `1px solid ${DL.ruleStrong}`,
    boxShadow: [
        "inset 0 1px 0 rgba(255,255,255,0.85)",
        "inset 0 -1px 0 rgba(14,31,27,0.06)",
        "0 20px 40px -22px rgba(14,31,27,0.28)",
        "0 4px 10px -4px rgba(14,31,27,0.08)",
    ].join(", "),
    ...extra,
});

// ═════════════════════════════════════════════════════════════════════
// Small primitives
// ═════════════════════════════════════════════════════════════════════
export const PageShell = ({ children, testid = "ds-page-shell" }) => (
    <div
        className="page-enter min-h-screen"
        data-testid={testid}
        style={{ backgroundColor: DL.ivory, fontFamily: DL.fontBody, color: DL.ink }}
    >
        <div className="px-8 md:px-12 py-8 max-w-[1280px] mx-auto">{children}</div>
    </div>
);

export const PageEyebrow = ({ title, meta, rightAction, links = [] }) => (
    <div className="mb-8 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-baseline gap-4 flex-wrap">
            <span className="text-[24px] uppercase tracking-[0.16em] font-black" style={{ fontFamily: DL.fontMono, color: DL.ink }}>
                / {title}
            </span>
            {meta && (
                <span className="text-[18px] uppercase tracking-[0.22em] font-semibold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>
                    {meta}
                </span>
            )}
            {links.map((l) => (
                <a
                    key={l.href}
                    href={l.href}
                    className="text-[17px] uppercase tracking-[0.22em] font-bold underline underline-offset-4"
                    style={{ fontFamily: DL.fontMono, color: DL.emerald }}
                    data-testid={l.testid}
                >
                    {l.label} →
                </a>
            ))}
        </div>
        {rightAction}
    </div>
);

export const PrimaryButton = ({ children, onClick, testid, icon: Icon }) => (
    <button
        onClick={onClick}
        data-testid={testid}
        className="group inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-bold transition-all"
        style={{
            backgroundColor: DL.emerald,
            color: DL.paper,
            boxShadow: "0 14px 30px -14px rgba(13, 59, 46, 0.55), inset 0 1px 0 rgba(255,255,255,0.15)",
            fontFamily: DL.fontBody,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = DL.ink; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = DL.emerald; }}
    >
        {Icon ? <Icon size={18} strokeWidth={2.75} className="transition-transform group-hover:rotate-90" /> : <Plus size={18} strokeWidth={2.75} className="transition-transform group-hover:rotate-90" />}
        {children}
    </button>
);

export const Pill = ({ tone = "lapsed", label, testId }) => {
    const styleMap = {
        active:    { bg: DL.emerald,             fg: DL.paper, ring: "none" },
        pending:   { bg: "transparent",           fg: DL.ink,   ring: `1.5px solid ${DL.ruleStrong}` },
        suspended: { bg: DL.danger,               fg: DL.paper, ring: "none" },
        lapsed:    { bg: "rgba(14,31,27,0.08)",   fg: DL.ink2,  ring: "none" },
        saffron:   { bg: DL.gold,                 fg: DL.paper, ring: "none" },
        maroon:    { bg: "#5c1420",               fg: DL.paper, ring: "none" },
    };
    const s = styleMap[tone] || styleMap.lapsed;
    return (
        <span
            data-testid={testId}
            style={{ backgroundColor: s.bg, color: s.fg, border: s.ring === "none" ? "none" : s.ring, fontFamily: DL.fontMono, letterSpacing: "0.14em", fontWeight: 700 }}
            className="inline-flex items-center px-3 py-1 text-[11px] uppercase whitespace-nowrap rounded-full"
        >
            {label}
        </span>
    );
};

export const StatTile = ({ label, value, sub, testid }) => (
    <div
        className="px-5 py-4"
        style={embossedCard()}
        data-testid={testid || ("ds-stat-" + label.toLowerCase().replace(/\s+/g, "-"))}
    >
        <div className="text-[12px] uppercase tracking-[0.18em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.ink2 }}>{label}</div>
        <div className="mt-1.5 text-[36px] leading-none tracking-tight" style={{ fontFamily: DL.fontDisplay, color: DL.ink, fontWeight: 800 }}>
            {value}
        </div>
        {sub && <div className="text-[12.5px] mt-1.5 leading-snug font-semibold" style={{ color: DL.ink2 }}>{sub}</div>}
    </div>
);

export const FilterChip = ({ active, onClick, testid, children }) => (
    <button
        onClick={onClick}
        data-testid={testid}
        className="px-4 py-2 text-[12px] uppercase tracking-[0.16em] transition-all rounded-full"
        style={{
            backgroundColor: active ? DL.emerald : "transparent",
            color: active ? DL.paper : DL.ink,
            border: active ? `1.5px solid ${DL.emerald}` : `1.5px solid ${DL.ruleStrong}`,
            fontFamily: DL.fontMono,
            fontWeight: active ? 700 : 600,
            boxShadow: active ? "0 8px 20px -12px rgba(13,59,46,0.5)" : "none",
        }}
    >
        {children}
    </button>
);

export const SearchInput = ({ value, onChange, placeholder = "Search…", testid, width = 260 }) => (
    <div
        className="inline-flex items-center gap-2 px-4 h-[38px] rounded-full transition-colors"
        style={{
            border: `1.5px solid ${DL.ruleStrong}`,
            backgroundColor: DL.paper,
            width,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(14,31,27,0.05)",
        }}
    >
        <Search size={16} strokeWidth={2.75} style={{ color: DL.ink }} />
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            data-testid={testid}
            className="flex-1 bg-transparent outline-none text-[13px] font-bold placeholder:font-semibold placeholder:text-[#4C5750]"
            style={{ color: DL.ink, fontFamily: DL.fontBody }}
        />
        {value && (
            <button
                onClick={() => onChange("")}
                data-testid={testid ? `${testid}-clear` : undefined}
                className="text-[13px] font-bold w-5 h-5 rounded-full inline-flex items-center justify-center transition-colors"
                style={{ color: DL.paper, backgroundColor: DL.ink2, fontFamily: DL.fontMono }}
            >
                ×
            </button>
        )}
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Sort header — click to cycle asc→desc→off
// ═════════════════════════════════════════════════════════════════════
export const SortHeader = ({ columns, sortBy, sortDir, onSort, testidPrefix = "ds-sort" }) => (
    <div
        className="px-6 py-3 flex items-center gap-4 rounded-full mb-3"
        style={{
            backgroundColor: DL.paper,
            border: `1.5px solid ${DL.ruleStrong}`,
        }}
        data-testid={`${testidPrefix}-bar`}
    >
        <span className="text-[10.5px] uppercase tracking-[0.2em] font-bold" style={{ fontFamily: DL.fontMono, color: DL.muted }}>
            Sort by
        </span>
        {columns.map((c) => {
            const active = sortBy === c.key;
            const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return (
                <button
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    data-testid={`${testidPrefix}-${c.key}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-[11.5px] uppercase tracking-[0.16em] rounded-full transition-colors"
                    style={{
                        backgroundColor: active ? DL.emeraldSoft : "transparent",
                        color: active ? DL.emerald : DL.ink2,
                        fontFamily: DL.fontMono,
                        fontWeight: 700,
                    }}
                >
                    {c.label}
                    <Icon size={13} strokeWidth={2.5} style={{ opacity: active ? 1 : 0.4 }} />
                </button>
            );
        })}
    </div>
);
