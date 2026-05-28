// MPCA Emblem — SVG re-creation of the official Madhya Pradesh Cricket Association mark.
// Composition (as on the official logo, ref: Wikipedia):
//   • Top: chhatra (Indian royal parasol / umbrella) — symbol of governance & shelter
//   • Centre: stylised sunburst — concentric rings + radiating rays — symbol of vitality
// Renders in `currentColor` so it can be tinted via Tailwind text-* utilities
// to match BCCI Navy, Saffron, Marigold, Ivory, etc.

export const MpcaEmblem = ({ className = "", title = "MPCA Emblem" }) => (
    <svg
        viewBox="0 0 120 140"
        className={className}
        fill="none"
        stroke="currentColor"
        role="img"
        aria-label={title}
    >
        <title>{title}</title>

        {/* CHHATRA — royal parasol (top) */}
        {/* Finial spike */}
        <line x1="60" y1="6" x2="60" y2="18" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="60" cy="6" r="1.8" fill="currentColor" />

        {/* Canopy — three nested arcs */}
        <path d="M 28 40 Q 60 12 92 40" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M 32 40 Q 60 20 88 40" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
        <path d="M 36 40 Q 60 26 84 40" strokeWidth="1.0" strokeLinecap="round" opacity="0.65" />

        {/* Canopy ribs */}
        <line x1="60" y1="18" x2="40" y2="40" strokeWidth="1" opacity="0.7" />
        <line x1="60" y1="18" x2="50" y2="40" strokeWidth="1" opacity="0.7" />
        <line x1="60" y1="18" x2="60" y2="40" strokeWidth="1" opacity="0.7" />
        <line x1="60" y1="18" x2="70" y2="40" strokeWidth="1" opacity="0.7" />
        <line x1="60" y1="18" x2="80" y2="40" strokeWidth="1" opacity="0.7" />

        {/* Canopy fringe — small drops */}
        {[28, 36, 44, 52, 60, 68, 76, 84, 92].map((x) => (
            <line key={x} x1={x} y1="40" x2={x} y2="44" strokeWidth="1.2" strokeLinecap="round" />
        ))}

        {/* SUNBURST — centre */}
        {/* Rays — 16 evenly distributed */}
        {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i * Math.PI * 2) / 16;
            const cx = 60;
            const cy = 92;
            const r1 = 28;
            const r2 = 36;
            const x1 = cx + Math.cos(angle) * r1;
            const y1 = cy + Math.sin(angle) * r1;
            const x2 = cx + Math.cos(angle) * r2;
            const y2 = cy + Math.sin(angle) * r2;
            return (
                <line
                    key={i}
                    x1={x1.toFixed(2)}
                    y1={y1.toFixed(2)}
                    x2={x2.toFixed(2)}
                    y2={y2.toFixed(2)}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                />
            );
        })}

        {/* Concentric rings */}
        <circle cx="60" cy="92" r="24" strokeWidth="1.8" />
        <circle cx="60" cy="92" r="18" strokeWidth="1.2" opacity="0.8" />
        <circle cx="60" cy="92" r="12" strokeWidth="1.0" opacity="0.65" />
        <circle cx="60" cy="92" r="6" fill="currentColor" />

        {/* Base line under sunburst */}
        <line x1="22" y1="128" x2="98" y2="128" strokeWidth="1" opacity="0.4" />
    </svg>
);

// Official MPCA PNG (downloaded from Wikipedia). Use this on public-facing surfaces
// (landing hero, public verify page, member portal) where authenticity matters.
export const MpcaLogoMark = ({ className = "", alt = "Madhya Pradesh Cricket Association" }) => (
    <img
        src="/assets/mpca-logo.png"
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
    />
);

export default MpcaEmblem;
