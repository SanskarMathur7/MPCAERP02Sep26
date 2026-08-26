/**
 * /launch-presentation — MPCA ERP · Auditorium Deck (Iter 131d)
 * ─────────────────────────────────────────────────────────────
 * Feb 2026 · Rewritten for large-screen auditorium display:
 *   - Alternating pattern: bold caption slide → full-bleed screenshot slide
 *   - Minimal text, huge impactful headlines (auditorium readability)
 *   - Simple arrow-only nav (no pill buttons cluttering the UI)
 *   - Slide 1 embeds the live login page as an iframe so the fire signals
 *     actually animate during the pitch (not a static screenshot)
 *   - Grants slides use the Division Secretary view (Claim buttons visible)
 *   - Player slide shows the "Flagged for Review" verdict, not "Fraud"
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, X } from "lucide-react";
import { DL } from "@/lib/designSystem";

const emerald   = DL.emerald;
const emeraldBg = `linear-gradient(155deg, ${DL.emerald} 0%, ${DL.ink} 100%)`;
const gold      = DL.gold;
const paper     = DL.paper;

// ═════════════════════════════════════════════════════════════════════
// Slide 1 · Cover (MASS-audience welcome — logo hero, big welcome line)
// ═════════════════════════════════════════════════════════════════════
const SlideCover = () => (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-16 relative"
         data-testid="cover-slide">
        <CornerMarks />

        {/* MPCA emblem — the hero of a mass-audience cover */}
        <div style={{
            position: "relative", marginBottom: 44,
            filter: "drop-shadow(0 24px 40px rgba(0,0,0,0.45))",
            animation: "coverPulse 4s ease-in-out infinite",
        }}>
            <img
                src="/assets/mpca-logo.png"
                alt="MPCA emblem"
                data-testid="cover-emblem"
                style={{
                    width: "clamp(160px, 18vw, 240px)",
                    height: "auto",
                    display: "block",
                    background: paper,
                    padding: 14,
                    borderRadius: 8,
                    border: `2px solid ${gold}`,
                }}
            />
            {/* Soft gold aura around the emblem */}
            <div style={{
                position: "absolute", inset: -30, borderRadius: "50%",
                background: `radial-gradient(circle, ${gold}22 0%, transparent 60%)`,
                zIndex: -1, filter: "blur(20px)",
            }} />
        </div>

        {/* Association name — the pride line */}
        <div style={{
            fontFamily: DL.fontMono, fontSize: "clamp(18px, 1.8vw, 22px)",
            letterSpacing: "0.32em", color: gold, fontWeight: 700,
            textTransform: "uppercase", marginBottom: 20, textAlign: "center",
        }} data-testid="cover-association">
            Madhya Pradesh Cricket Association
        </div>

        {/* Big welcome */}
        <h1 className="text-center" style={{
            fontFamily: DL.fontDisplay, fontWeight: 800,
            fontSize: "clamp(64px, 8vw, 132px)", lineHeight: 0.98,
            letterSpacing: "-0.03em", color: paper, marginBottom: 20,
        }} data-testid="cover-welcome">
            Welcome.
        </h1>

        {/* Golden second line */}
        <div className="text-center" style={{
            fontFamily: DL.fontDisplay, fontWeight: 700,
            fontSize: "clamp(28px, 3.4vw, 52px)", lineHeight: 1.1,
            letterSpacing: "-0.01em", color: gold, marginBottom: 40,
            maxWidth: 1200,
        }} data-testid="cover-tagline">
            To your association&apos;s new home online.
        </div>

        {/* Season badge */}
        <div style={{
            fontFamily: DL.fontMono, fontSize: "clamp(20px, 1.8vw, 24px)",
            letterSpacing: "0.34em", color: paper, fontWeight: 700,
            textTransform: "uppercase", padding: "12px 32px",
            border: `2px solid ${gold}`, borderRadius: 4,
            background: "rgba(184,131,40,0.10)",
        }} data-testid="cover-season">
            Season 2026 – 27
        </div>
    </div>
);

// Editorial corner marks — thin gold brackets at the four corners.
const CornerMarks = () => {
    const size = 34, thick = 2, colour = gold, off = 30;
    const arm = { position: "absolute", background: colour, opacity: 0.55 };
    return (
        <>
            {/* Top-left */}
            <div style={{ position: "absolute", top: off, left: off, width: size, height: size, pointerEvents: "none" }}>
                <div style={{ ...arm, top: 0, left: 0, width: size, height: thick }} />
                <div style={{ ...arm, top: 0, left: 0, width: thick, height: size }} />
            </div>
            {/* Top-right */}
            <div style={{ position: "absolute", top: off, right: off, width: size, height: size, pointerEvents: "none" }}>
                <div style={{ ...arm, top: 0, right: 0, width: size, height: thick }} />
                <div style={{ ...arm, top: 0, right: 0, width: thick, height: size }} />
            </div>
            {/* Bottom-left */}
            <div style={{ position: "absolute", bottom: off, left: off, width: size, height: size, pointerEvents: "none" }}>
                <div style={{ ...arm, bottom: 0, left: 0, width: size, height: thick }} />
                <div style={{ ...arm, bottom: 0, left: 0, width: thick, height: size }} />
            </div>
            {/* Bottom-right */}
            <div style={{ position: "absolute", bottom: off, right: off, width: size, height: size, pointerEvents: "none" }}>
                <div style={{ ...arm, bottom: 0, right: 0, width: size, height: thick }} />
                <div style={{ ...arm, bottom: 0, right: 0, width: thick, height: size }} />
            </div>
        </>
    );
};

// ═════════════════════════════════════════════════════════════════════
// Caption slides — bold, single-message, auditorium-first
// ═════════════════════════════════════════════════════════════════════
const CaptionSlide = ({ eyebrow, headline, sub }) => (
    <div className="w-full h-full flex flex-col justify-center px-6 md:px-24">
        <div className="mb-6" style={{
            fontFamily: DL.fontMono, fontSize: "clamp(18px, 1.4vw, 22px)",
            letterSpacing: "0.34em", color: gold, fontWeight: 700,
            textTransform: "uppercase",
        }}>
            {eyebrow}
        </div>
        <h1 style={{
            fontFamily: DL.fontDisplay, fontWeight: 800,
            fontSize: "clamp(56px, 6.8vw, 104px)", lineHeight: 1.02,
            letterSpacing: "-0.02em", color: paper, maxWidth: 1500,
        }}>
            {headline}
        </h1>
        {sub && (
            <p className="mt-8" style={{
                fontFamily: DL.fontBody, fontStyle: "italic",
                fontSize: "clamp(24px, 2.0vw, 34px)",
                color: gold, maxWidth: 1300, lineHeight: 1.35,
            }}>
                {sub}
            </p>
        )}
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Screenshot slides — near-full-bleed, minimal chrome, no small caption
// ═════════════════════════════════════════════════════════════════════
const ScreenshotSlide = ({ src }) => (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-12 py-6">
        <div className="w-full flex items-center justify-center">
            <img
                src={src}
                alt=""
                style={{
                    maxWidth: "100%", maxHeight: "86vh", height: "auto",
                    display: "block", objectFit: "contain",
                    borderRadius: 8,
                    boxShadow: "0 40px 90px -20px rgba(0,0,0,0.7)",
                    border: `2px solid ${gold}`,
                    background: paper,
                }}
                data-testid="screenshot-img"
            />
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Final promise — no small text
// ═════════════════════════════════════════════════════════════════════
const SlideClose = () => (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-16 text-center">
        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(48px, 6vw, 92px)", color: paper, lineHeight: 1.04, letterSpacing: "-0.02em" }}>
            Simpler for players.
        </div>
        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(48px, 6vw, 92px)", color: gold, lineHeight: 1.04, letterSpacing: "-0.02em" }}>
            Faster for divisions.
        </div>
        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(48px, 6vw, 92px)", color: paper, lineHeight: 1.04, letterSpacing: "-0.02em" }}>
            Cleaner for MPCA.
        </div>
        <div className="mt-16" style={{
            fontFamily: DL.fontMono, fontSize: "clamp(18px, 1.5vw, 22px)",
            letterSpacing: "0.34em", color: gold, fontWeight: 700,
            textTransform: "uppercase",
        }}>
            Thank you
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Deck spec — 8 slides
// ═════════════════════════════════════════════════════════════════════
const SLIDES = [
    // 1 · Mass-audience cover — logo + welcome, no product screenshot
    { render: () => <SlideCover /> },

    // 2 · Players caption
    { render: () => (
        <CaptionSlide
            eyebrow="Players"
            headline={<>One link. Documents up.<br /><span style={{ color: gold }}>Registered on the spot.</span></>}
            sub="No queues. No office visits. Everything happens in the player's own hands."
        />
    )},
    // 3 · Players screenshot
    { render: () => <ScreenshotSlide src="/deck-screenshots/public_reg_docs_first.png" /> },

    // 4 · Players AI caption
    { render: () => (
        <CaptionSlide
            eyebrow="Players · AI Check"
            headline={<>If anything is off,<br /><span style={{ color: gold }}>the player is told.</span></>}
            sub="AI reads every document, flags any issue, and lets the player fix it right away."
        />
    )},
    // 5 · Players AI screenshot
    { render: () => <ScreenshotSlide src="/deck-screenshots/player_ai_flagged.png" /> },

    // 6 · Grants caption
    { render: () => (
        <CaptionSlide
            eyebrow="Grants"
            headline={<>Every eligible scheme.<br /><span style={{ color: gold }}>One click to claim.</span></>}
            sub="Divisions see every scheme they qualify for, with the exact documents required."
        />
    )},
    // 7 · Grants screenshot
    { render: () => <ScreenshotSlide src="/deck-screenshots/schemes_division.png" /> },

    // 8 · Close
    { render: () => <SlideClose /> },
];

// ═════════════════════════════════════════════════════════════════════
// Deck shell
// ═════════════════════════════════════════════════════════════════════
export default function LaunchPresentation() {
    const [slide, setSlide] = useState(0);
    const total = SLIDES.length;

    const next = useCallback(() => setSlide((s) => Math.min(total - 1, s + 1)), [total]);
    const prev = useCallback(() => setSlide((s) => Math.max(0, s - 1)), []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
            else if (e.key >= "1" && e.key <= "8") setSlide(Math.min(total - 1, Number(e.key) - 1));
            else if (e.key === "0") setSlide(total - 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [next, prev, total]);

    const current = useMemo(() => SLIDES[slide], [slide]);
    const progress = ((slide + 1) / total) * 100;
    const Render = current.render;

    return (
        <div className="fixed inset-0" data-testid="launch-presentation-page"
            style={{ background: emeraldBg, color: paper, fontFamily: DL.fontBody, overflow: "hidden" }}>

            <style>{`
                @keyframes fadeInSlide { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: none; } }
                .slide-fade { animation: fadeInSlide 500ms cubic-bezier(0.22,1,0.36,1) both; }
                @keyframes coverPulse {
                    0%, 100% { transform: scale(1); }
                    50%      { transform: scale(1.035); }
                }
            `}</style>

            {/* Slim gold progress bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.08)", zIndex: 5 }}>
                <div data-testid="launch-progress" style={{
                    width: `${progress}%`, height: "100%", background: gold,
                    transition: "width 320ms cubic-bezier(0.22,1,0.36,1)",
                    boxShadow: `0 0 12px ${gold}`,
                }} />
            </div>

            {/* Exit only (counter removed — was too small for auditorium display) */}
            <div style={{ position: "absolute", top: 22, right: 26, display: "flex", gap: 14, alignItems: "center", zIndex: 5 }}>
                <span data-testid="launch-counter" aria-label={`Slide ${slide + 1} of ${total}`} style={{ display: "none" }}>
                    {String(slide + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
                <Link to="/dashboard" data-testid="launch-exit" title="Exit deck"
                    style={{ color: gold, opacity: 0.4, transition: "opacity 200ms" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}>
                    <X size={22} strokeWidth={2} />
                </Link>
            </div>

            {/* Slide surface */}
            <div key={slide} className="slide-fade absolute inset-0" data-testid={`launch-slide-${slide}`}>
                <Render />
            </div>

            {/* Simple arrow nav — sides of screen, minimal footprint */}
            <ArrowNav onClick={prev} disabled={slide === 0} side="left" testid="launch-prev">
                <ArrowLeft size={24} strokeWidth={2.2} />
            </ArrowNav>
            <ArrowNav onClick={next} disabled={slide === total - 1} side="right" testid="launch-next">
                <ArrowRight size={24} strokeWidth={2.2} />
            </ArrowNav>
        </div>
    );
}

// Minimal side arrow — no pill, no text, no clutter. Just an arrow.
const ArrowNav = ({ onClick, disabled, side, children, testid }) => (
    <button
        onClick={onClick} disabled={disabled} data-testid={testid}
        aria-label={side === "left" ? "Previous slide" : "Next slide"}
        style={{
            position: "absolute",
            top: "50%",
            [side]: 18,
            transform: "translateY(-50%)",
            width: 44, height: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: gold,
            background: "transparent",
            border: `1px solid rgba(184,131,40,0.25)`,
            borderRadius: "50%",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.15 : 0.55,
            transition: "opacity 220ms, background 220ms, border-color 220ms",
            zIndex: 5,
        }}
        onMouseEnter={(e) => {
            if (disabled) return;
            e.currentTarget.style.opacity = 1;
            e.currentTarget.style.background = "rgba(184,131,40,0.12)";
            e.currentTarget.style.borderColor = "rgba(184,131,40,0.7)";
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.opacity = disabled ? "0.15" : "0.55";
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(184,131,40,0.25)";
        }}
    >
        {children}
    </button>
);
