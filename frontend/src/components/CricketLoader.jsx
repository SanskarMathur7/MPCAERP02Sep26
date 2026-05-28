// CricketLoader — Stumps + Bails + Whizzing Ball
// Three navy stumps with two marigold bails on top. A small red cricket ball
// whizzes in from the right and clatters past the wicket, knocking the bails
// in sequence (right bail at ~41 %, left bail at ~59 %), then resets.
// Pure SVG + CSS — animations defined in /app/frontend/src/index.css.

const SIZE_MAP = {
    sm: { w: 70, h: 56 },
    md: { w: 120, h: 96 },
    lg: { w: 170, h: 136 },
};

const Stumps = ({ width, height }) => (
    <svg
        viewBox="0 0 120 96"
        width={width}
        height={height}
        className="stumps-svg"
        aria-hidden="true"
    >
        <defs>
            {/* Subtle leather gradient for the ball */}
            <radialGradient id="sl-ball" cx="35%" cy="30%" r="65%">
                <stop offset="0%"   stopColor="#d44141" />
                <stop offset="55%"  stopColor="#9a1818" />
                <stop offset="100%" stopColor="#4d0606" />
            </radialGradient>
            {/* Wood-grain gradient for the bails */}
            <linearGradient id="sl-bail" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#f7d57a" />
                <stop offset="55%"  stopColor="#e9b949" />
                <stop offset="100%" stopColor="#a8800f" />
            </linearGradient>
            {/* Wood gradient for the stumps */}
            <linearGradient id="sl-stump" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#0a1f3d" />
                <stop offset="50%"  stopColor="#1a3866" />
                <stop offset="100%" stopColor="#0a1f3d" />
            </linearGradient>
        </defs>

        {/* Ground line — dashed crease */}
        <line
            x1="6" y1="88" x2="114" y2="88"
            stroke="#0a1f3d" strokeOpacity="0.30"
            strokeWidth="1" strokeDasharray="3 3"
        />
        {/* Shadow below stumps */}
        <ellipse
            cx="60" cy="89" rx="32" ry="1.6"
            fill="#0a1f3d" fillOpacity="0.18"
        />

        {/* Stumps — three vertical bars with tapered tops */}
        <g>
            <path d="M 39 28 L 41 28 L 42 88 L 38 88 Z" fill="url(#sl-stump)" />
            <path d="M 59 28 L 61 28 L 62 88 L 58 88 Z" fill="url(#sl-stump)" />
            <path d="M 79 28 L 81 28 L 82 88 L 78 88 Z" fill="url(#sl-stump)" />
            {/* Stump tops — small caps */}
            <circle cx="40" cy="28" r="2" fill="#0a1f3d" />
            <circle cx="60" cy="28" r="2" fill="#0a1f3d" />
            <circle cx="80" cy="28" r="2" fill="#0a1f3d" />
        </g>

        {/* Bails — two short wood pegs resting across the stump tops */}
        <g>
            <rect
                className="bail bail-left"
                x="38" y="23" width="22" height="3.2" rx="1.6"
                fill="url(#sl-bail)"
                stroke="#7a5a08" strokeWidth="0.4"
            />
            <rect
                className="bail bail-right"
                x="60" y="23" width="22" height="3.2" rx="1.6"
                fill="url(#sl-bail)"
                stroke="#7a5a08" strokeWidth="0.4"
            />
        </g>

        {/* Cricket ball — whizzes right→left and back via SMIL */}
        <circle
            r="3.6"
            fill="url(#sl-ball)"
            stroke="#3d0606" strokeWidth="0.4"
        >
            <animate
                attributeName="cx"
                values="130; -12; 130"
                keyTimes="0; 0.70; 1"
                dur="1.7s"
                repeatCount="indefinite"
            />
            <animate
                attributeName="cy"
                values="60; 58; 60; 62; 60"
                keyTimes="0; 0.3; 0.5; 0.7; 1"
                dur="1.7s"
                repeatCount="indefinite"
            />
            {/* Tiny seam stitch — appears as the ball passes the stumps */}
        </circle>
    </svg>
);

const CricketLoader = ({
    label = "Loading…",
    size = "md",
    className = "",
    testId = "cricket-loader",
}) => {
    const { w, h } = SIZE_MAP[size] || SIZE_MAP.md;
    return (
        <div
            className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`}
            data-testid={testId}
            role="status"
            aria-live="polite"
        >
            <Stumps width={w} height={h} />
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
export { Stumps };
