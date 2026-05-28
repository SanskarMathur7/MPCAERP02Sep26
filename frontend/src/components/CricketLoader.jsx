// CricketLoader — themed loading indicator for the MPCA ERP.
// A spinning cricket ball (red leather, white seam stitches) with a tagline.
// Three sizes: sm (28px), md (52px, default), lg (88px).

const SIZE_MAP = {
    sm: 28,
    md: 52,
    lg: 88,
};

const CricketBall = ({ px = 52 }) => {
    const stroke = Math.max(1, px / 26);
    const stitchLen = px / 11;
    const stitchGap = px / 8.5;
    // 5 stitches above seam + 5 below seam
    const stitches = Array.from({ length: 5 });
    return (
        <svg
            viewBox="0 0 100 100"
            width={px}
            height={px}
            className="cricket-loader-ball"
            aria-hidden="true"
        >
            {/* Leather body — radial gradient for sphere illusion */}
            <defs>
                <radialGradient id="leather" cx="38%" cy="34%" r="70%">
                    <stop offset="0%" stopColor="#c43a3a" />
                    <stop offset="55%" stopColor="#8b1a1a" />
                    <stop offset="100%" stopColor="#4d0d0d" />
                </radialGradient>
                <radialGradient id="hilite" cx="32%" cy="28%" r="22%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="url(#leather)" />
            <circle cx="50" cy="50" r="46" fill="url(#hilite)" />

            {/* Seam — single curving line + parallel stitches */}
            <path
                d="M 8 50 Q 50 30, 92 50"
                stroke="#fdf6e3"
                strokeWidth={stroke * 0.55}
                fill="none"
                opacity="0.9"
            />
            {/* Top stitches */}
            {stitches.map((_, i) => {
                const x = 22 + i * 14;
                const y = 50 - 13 + Math.sin((i + 1) * 0.6) * 1.2;
                return (
                    <line
                        key={`t-${i}`}
                        x1={x - stitchLen / 2}
                        y1={y}
                        x2={x + stitchLen / 2}
                        y2={y - 3}
                        stroke="#fdf6e3"
                        strokeWidth={stroke * 0.7}
                        strokeLinecap="round"
                    />
                );
            })}
            {/* Bottom stitches */}
            {stitches.map((_, i) => {
                const x = 22 + i * 14;
                const y = 50 + 8 + Math.cos((i + 1) * 0.6) * 1.2;
                return (
                    <line
                        key={`b-${i}`}
                        x1={x - stitchLen / 2}
                        y1={y}
                        x2={x + stitchLen / 2}
                        y2={y + 3}
                        stroke="#fdf6e3"
                        strokeWidth={stroke * 0.7}
                        strokeLinecap="round"
                    />
                );
            })}
            {/* Subtle rim shadow */}
            <circle cx="50" cy="50" r="46" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
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
