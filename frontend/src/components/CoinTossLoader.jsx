// CoinTossLoader — Ceremonial spinning gold coin for the sign-in transition.
// True 3D rotation around Y axis using `transform-style: preserve-3d`.
// One side: MPCA wordmark on a marigold-gold disc.
// Other side: the founding year "1957" with a subtle laurel.
// Lift on the highest spin = the coin "is tossed" before settling.

const CoinTossLoader = ({
    label = "Tossing the coin…",
    sublabel = null,
    onDark = true,
    testId = "coin-toss-loader",
}) => {
    const labelClass = onDark ? "text-mpca-ivory/95" : "text-mpca-gray-dark";
    const sublabelClass = onDark ? "text-mpca-gold-light/75" : "text-mpca-gray";

    return (
        <div
            className="flex flex-col items-center justify-center gap-6"
            data-testid={testId}
            role="status"
            aria-live="polite"
        >
            <div className="coin-toss-stage">
                <div className="coin-toss-coin">
                    {/* HEADS — MPCA wordmark */}
                    <div className="coin-face coin-face-heads">
                        <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
                            <defs>
                                <radialGradient id="coin-h" cx="35%" cy="28%" r="70%">
                                    <stop offset="0%"   stopColor="#fff4cf" />
                                    <stop offset="45%"  stopColor="#e9b949" />
                                    <stop offset="85%"  stopColor="#a8800f" />
                                    <stop offset="100%" stopColor="#5c3f00" />
                                </radialGradient>
                            </defs>
                            <circle cx="40" cy="40" r="38" fill="url(#coin-h)" stroke="#3d2800" strokeWidth="0.8" />
                            {/* Reeded edge — fine radial ticks just inside the rim */}
                            <g stroke="#5c3f00" strokeOpacity="0.55" strokeWidth="0.6">
                                {Array.from({ length: 36 }).map((_, i) => {
                                    const a = (i * Math.PI * 2) / 36;
                                    const r1 = 33.5, r2 = 36.5;
                                    return (
                                        <line
                                            key={i}
                                            x1={40 + Math.cos(a) * r1}
                                            y1={40 + Math.sin(a) * r1}
                                            x2={40 + Math.cos(a) * r2}
                                            y2={40 + Math.sin(a) * r2}
                                        />
                                    );
                                })}
                            </g>
                            <circle cx="40" cy="40" r="31" fill="none" stroke="#5c3f00" strokeOpacity="0.4" strokeWidth="0.5" />
                            {/* MPCA wordmark */}
                            <text
                                x="40" y="38" textAnchor="middle"
                                fontFamily="Cormorant Garamond, serif"
                                fontSize="15"
                                fontWeight="700"
                                fill="#3d2800"
                                letterSpacing="1"
                            >
                                MPCA
                            </text>
                            <text
                                x="40" y="50" textAnchor="middle"
                                fontFamily="Cormorant Garamond, serif"
                                fontSize="5"
                                letterSpacing="2"
                                fill="#5c3f00"
                            >
                                CRICKET ASSOCIATION
                            </text>
                            {/* Two tiny laurel sprigs */}
                            <path d="M 22 56 Q 28 60 34 56" stroke="#5c3f00" strokeWidth="0.7" fill="none" />
                            <path d="M 46 56 Q 52 60 58 56" stroke="#5c3f00" strokeWidth="0.7" fill="none" />
                        </svg>
                    </div>

                    {/* TAILS — Est. 1957 */}
                    <div className="coin-face coin-face-tails">
                        <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
                            <defs>
                                <radialGradient id="coin-t" cx="35%" cy="28%" r="70%">
                                    <stop offset="0%"   stopColor="#fff4cf" />
                                    <stop offset="45%"  stopColor="#d4a338" />
                                    <stop offset="85%"  stopColor="#8a6209" />
                                    <stop offset="100%" stopColor="#4a2f00" />
                                </radialGradient>
                            </defs>
                            <circle cx="40" cy="40" r="38" fill="url(#coin-t)" stroke="#3d2800" strokeWidth="0.8" />
                            <g stroke="#5c3f00" strokeOpacity="0.55" strokeWidth="0.6">
                                {Array.from({ length: 36 }).map((_, i) => {
                                    const a = (i * Math.PI * 2) / 36;
                                    const r1 = 33.5, r2 = 36.5;
                                    return (
                                        <line
                                            key={i}
                                            x1={40 + Math.cos(a) * r1}
                                            y1={40 + Math.sin(a) * r1}
                                            x2={40 + Math.cos(a) * r2}
                                            y2={40 + Math.sin(a) * r2}
                                        />
                                    );
                                })}
                            </g>
                            <circle cx="40" cy="40" r="31" fill="none" stroke="#5c3f00" strokeOpacity="0.4" strokeWidth="0.5" />
                            <text
                                x="40" y="30" textAnchor="middle"
                                fontFamily="Cormorant Garamond, serif"
                                fontSize="5"
                                letterSpacing="3"
                                fill="#5c3f00"
                            >
                                EST
                            </text>
                            <text
                                x="40" y="50" textAnchor="middle"
                                fontFamily="Cormorant Garamond, serif"
                                fontSize="18"
                                fontWeight="700"
                                fill="#3d2800"
                            >
                                1957
                            </text>
                            {/* Crossed bats */}
                            <g stroke="#5c3f00" strokeWidth="1" strokeLinecap="round" fill="none">
                                <path d="M 25 60 L 40 70" />
                                <path d="M 55 60 L 40 70" />
                            </g>
                        </svg>
                    </div>
                </div>
            </div>

            {label && (
                <div className="text-center space-y-1">
                    <div className={`font-serif text-base md:text-lg tracking-wide ${labelClass}`}>
                        {label}
                    </div>
                    {sublabel && (
                        <div className={`text-[11px] uppercase tracking-[0.22em] ${sublabelClass}`}>
                            {sublabel}
                        </div>
                    )}
                </div>
            )}
            <span className="sr-only">{label}</span>
        </div>
    );
};

export default CoinTossLoader;
