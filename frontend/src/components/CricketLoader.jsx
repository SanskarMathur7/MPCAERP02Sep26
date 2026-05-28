// CricketLoader — themed loading indicator for the MPCA ERP.
// A spinning cricket ball (red leather, white seam stitches) with a tagline.
// Three sizes: sm (28px), md (52px, default), lg (88px).

const SIZE_MAP = {
    sm: 28,
    md: 52,
    lg: 88,
};

const CricketBall = ({ px = 52 }) => {
    // Cricket ball anatomy:
    //   • Cherry-red leather (4 quarters → here rendered as a sphere with a clear equator)
    //   • One prominent horizontal seam at the equator
    //   • TWO parallel dense rows of white V-shaped stitches along the seam (~20 each)
    // SVG uses a 100×100 viewBox with the ball circle r=46 at (50,50).
    const STITCH_COUNT = 20;
    const stitches = Array.from({ length: STITCH_COUNT });
    // Stitches span horizontally from x≈10 to x≈90 (clipped by the sphere)
    const startX = 12;
    const endX = 88;
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
                {/* Cherry-red leather — radial gradient for sphere illusion */}
                <radialGradient id="cb-leather" cx="38%" cy="32%" r="72%">
                    <stop offset="0%"  stopColor="#d44141" />
                    <stop offset="40%" stopColor="#a51d1d" />
                    <stop offset="80%" stopColor="#6a0e0e" />
                    <stop offset="100%" stopColor="#3d0606" />
                </radialGradient>
                {/* Specular highlight */}
                <radialGradient id="cb-hilite" cx="32%" cy="26%" r="20%">
                    <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
                    <stop offset="60%"  stopColor="#ffffff" stopOpacity="0.10" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                {/* Lower rim shading — keeps the bottom feeling weighty */}
                <radialGradient id="cb-rim" cx="50%" cy="60%" r="55%">
                    <stop offset="70%"  stopColor="#000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
                </radialGradient>
                {/* Clip path = ball circle, so stitches don't poke outside */}
                <clipPath id="cb-clip">
                    <circle cx="50" cy="50" r="46" />
                </clipPath>
            </defs>

            {/* Ball body */}
            <circle cx="50" cy="50" r="46" fill="url(#cb-leather)" />
            <circle cx="50" cy="50" r="46" fill="url(#cb-hilite)" />
            <circle cx="50" cy="50" r="46" fill="url(#cb-rim)" />

            {/* SEAM + STITCHES — clipped to the sphere */}
            <g clipPath="url(#cb-clip)">
                {/* The seam itself — slim ridge across the equator */}
                <line
                    x1="4" y1="50" x2="96" y2="50"
                    stroke="#3d0606"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                />
                <line
                    x1="4" y1="49.4" x2="96" y2="49.4"
                    stroke="#ffd9b8"
                    strokeWidth="0.4"
                    strokeLinecap="round"
                    opacity="0.55"
                />

                {/* Upper stitch row — short diagonal V's leaning right */}
                {stitches.map((_, i) => {
                    const cx = startX + i * step;
                    return (
                        <line
                            key={`u-${i}`}
                            x1={cx - 1.4}
                            y1="46.4"
                            x2={cx + 1.4}
                            y2="49.4"
                            stroke="#f5f1e4"
                            strokeWidth="0.95"
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Lower stitch row — mirror diagonal V's leaning left */}
                {stitches.map((_, i) => {
                    const cx = startX + i * step;
                    return (
                        <line
                            key={`l-${i}`}
                            x1={cx - 1.4}
                            y1="53.6"
                            x2={cx + 1.4}
                            y2="50.6"
                            stroke="#f5f1e4"
                            strokeWidth="0.95"
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Tiny shadow under the seam to make it feel raised */}
                <line
                    x1="4" y1="51.2" x2="96" y2="51.2"
                    stroke="#000"
                    strokeWidth="0.4"
                    strokeLinecap="round"
                    opacity="0.35"
                />
            </g>

            {/* Outer rim outline */}
            <circle
                cx="50" cy="50" r="46"
                fill="none"
                stroke="#1a0303"
                strokeOpacity="0.55"
                strokeWidth="0.6"
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
