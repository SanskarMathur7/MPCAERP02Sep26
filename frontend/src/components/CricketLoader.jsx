// CricketLoader — themed loading indicator for the MPCA ERP.
// A spinning cricket ball (red leather, white seam stitches) with a tagline.
// Three sizes: sm (28px), md (52px, default), lg (88px).

const SIZE_MAP = {
    sm: 28,
    md: 52,
    lg: 88,
};

const CricketBall = ({ px = 52 }) => {
    // Real cricket ball:
    //   • Two leather hemispheres meeting at a prominent raised seam
    //   • Stitches run PERPENDICULAR to the seam (crossing it), not along it
    //   • Each stitch is a short hash mark; ~24 around the visible half of the equator
    //   • The seam itself is a darker recessed band with a thin highlight above (lit ridge)
    //   • Light comes from upper-left → highlight at ~28% / 28%
    const STITCH_COUNT = 24;
    const startX = 8;
    const endX = 92;
    const step = (endX - startX) / (STITCH_COUNT - 1);

    return (
        <svg
            viewBox="0 0 100 100"
            width={px}
            height={px}
            className="cricket-loader-ball"
            aria-hidden="true"
        >
            <defs>
                {/* Cherry-red leather */}
                <radialGradient id="cb-leather" cx="34%" cy="28%" r="78%">
                    <stop offset="0%"   stopColor="#e35353" />
                    <stop offset="35%"  stopColor="#b32222" />
                    <stop offset="75%"  stopColor="#691010" />
                    <stop offset="100%" stopColor="#330505" />
                </radialGradient>
                {/* Specular highlight — small, upper-left */}
                <radialGradient id="cb-hilite" cx="28%" cy="22%" r="18%">
                    <stop offset="0%"   stopColor="#ffe5e5" stopOpacity="0.85" />
                    <stop offset="45%"  stopColor="#ffe5e5" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#ffe5e5" stopOpacity="0" />
                </radialGradient>
                {/* Bottom shading — gives weight */}
                <radialGradient id="cb-rim" cx="50%" cy="62%" r="60%">
                    <stop offset="68%"  stopColor="#000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
                </radialGradient>
                {/* Seam band — a darker recessed groove */}
                <linearGradient id="cb-seam" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%"   stopColor="#290303" stopOpacity="0" />
                    <stop offset="30%"  stopColor="#290303" stopOpacity="0.55" />
                    <stop offset="50%"  stopColor="#1a0202" stopOpacity="0.85" />
                    <stop offset="70%"  stopColor="#290303" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#290303" stopOpacity="0" />
                </linearGradient>
                {/* Clip to sphere */}
                <clipPath id="cb-clip">
                    <circle cx="50" cy="50" r="46" />
                </clipPath>
            </defs>

            {/* Ball body */}
            <circle cx="50" cy="50" r="46" fill="url(#cb-leather)" />

            <g clipPath="url(#cb-clip)">
                {/* SEAM — a wide darker band (gives the raised-stitched look) */}
                <rect x="0" y="46" width="100" height="8" fill="url(#cb-seam)" />
                {/* Top-of-seam highlight — thin bright line where light catches the ridge */}
                <line
                    x1="6" y1="46.6" x2="94" y2="46.6"
                    stroke="#ffb38a"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    opacity="0.7"
                />
                {/* Subtle dark groove just below the highlight (depth) */}
                <line
                    x1="6" y1="48.4" x2="94" y2="48.4"
                    stroke="#000"
                    strokeWidth="0.4"
                    strokeLinecap="round"
                    opacity="0.55"
                />

                {/* PERPENDICULAR STITCHES — cross the seam top→bottom */}
                {Array.from({ length: STITCH_COUNT }).map((_, i) => {
                    const x = startX + i * step;
                    // Slight alternating tilt for hand-sewn realism
                    const tilt = (i % 2 === 0) ? 0.6 : -0.6;
                    return (
                        <line
                            key={`s-${i}`}
                            x1={x - tilt}
                            y1="45.2"
                            x2={x + tilt}
                            y2="54.8"
                            stroke="#f6efdc"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Knot dots at each stitch end — adds hand-sewn texture */}
                {Array.from({ length: STITCH_COUNT }).map((_, i) => {
                    const x = startX + i * step;
                    return (
                        <g key={`k-${i}`}>
                            <circle cx={x} cy="45.0" r="0.55" fill="#f6efdc" />
                            <circle cx={x} cy="55.0" r="0.55" fill="#f6efdc" />
                        </g>
                    );
                })}
            </g>

            {/* Specular highlight on top of stitches */}
            <circle cx="50" cy="50" r="46" fill="url(#cb-hilite)" />
            {/* Bottom darkening */}
            <circle cx="50" cy="50" r="46" fill="url(#cb-rim)" />

            {/* Outer rim outline */}
            <circle
                cx="50" cy="50" r="46"
                fill="none"
                stroke="#0d0202"
                strokeOpacity="0.7"
                strokeWidth="0.7"
            />
        </svg>
    );
};

const CricketLoader = ({
    label = "Loading…",
    size = "md",
    className = "",
    testId = "cricket-loader",
}) => {
    const px = SIZE_MAP[size] || SIZE_MAP.md;
    return (
        <div
            className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`}
            data-testid={testId}
            role="status"
            aria-live="polite"
        >
            <div className="cricket-loader-shell relative" style={{ width: px, height: px }}>
                <CricketBall px={px} />
                {/* Bounce shadow */}
                <div className="cricket-loader-shadow" />
            </div>
            {label && (
                <div className="font-serif text-mpca-gray-dark text-sm md:text-base tracking-wide italic">
                    {label}
                </div>
            )}
            <span className="sr-only">{label}</span>
        </div>
    );
};

export default CricketLoader;
export { CricketBall };
