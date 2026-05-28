// CricketLoader — themed loading indicator for the MPCA ERP.
// Uses a real photograph of a Dukes cricket ball (from Wikimedia Commons,
// CC BY-SA 3.0). The ball bounces with a squash-on-impact effect; shadow
// puddle blurs and shrinks at the apex for parallax.

const SIZE_MAP = {
    sm: 32,
    md: 60,
    lg: 96,
};

const CricketBall = ({ px = 60 }) => (
    <img
        src="/assets/cricket-ball.png"
        alt=""
        width={px}
        height={px}
        className="cricket-loader-ball"
        loading="eager"
        decoding="async"
        draggable={false}
    />
);

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
