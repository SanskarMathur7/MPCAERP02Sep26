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
// Slide 1 · Live login (iframe · fire signals animate live)
// ═════════════════════════════════════════════════════════════════════
const SlideLive = () => {
    // Same-origin iframe → hide the login page's own scrollbar so the
    // frame looks like a clean product shot, not a browser inside a browser.
    const hideIframeScrollbar = (e) => {
        try {
            const doc = e.target.contentDocument;
            if (doc) {
                if (doc.body) doc.body.style.overflow = "hidden";
                if (doc.documentElement) doc.documentElement.style.overflow = "hidden";
                // WebKit scrollbar suppression
                const style = doc.createElement("style");
                style.textContent = `::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}html,body{scrollbar-width:none!important;-ms-overflow-style:none!important;}`;
                doc.head?.appendChild(style);
            }
        } catch { /* cross-origin — ignore */ }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-16 relative">
            {/* Corner marks — subtle brand crop, gives an editorial edge */}
            <CornerMarks />

            <div className="mb-4 flex items-center gap-3" style={{
                fontFamily: DL.fontMono, fontSize: 12, letterSpacing: "0.34em",
                color: gold, fontWeight: 700, textTransform: "uppercase",
            }}>
                <span style={{ width: 28, height: 1, background: gold, opacity: 0.7 }} />
                MPCA · ERP
                <span style={{ width: 28, height: 1, background: gold, opacity: 0.7 }} />
            </div>

            <h1 className="text-center mb-3" style={{
                fontFamily: DL.fontDisplay, fontWeight: 800,
                fontSize: "clamp(48px, 6.2vw, 92px)", lineHeight: 1,
                letterSpacing: "-0.02em", color: paper,
            }}>
                One platform. <span style={{ color: gold }}>Every workflow.</span>
            </h1>

            <p className="text-center mb-9 max-w-2xl" style={{
                fontFamily: DL.fontBody, fontStyle: "italic",
                fontSize: "clamp(16px, 1.35vw, 20px)",
                color: "rgba(245,239,230,0.62)",
            }}>
                Built for MPCA · Divisions · Players
            </p>

            {/* Live iframe — no scrollbar, no chrome, just the login page. */}
            <div style={{
                width: "min(78vw, 1180px)",
                aspectRatio: "16/9",
                borderRadius: 12, overflow: "hidden",
                background: "#0b1d18",
                boxShadow: "0 40px 90px -25px rgba(0,0,0,0.75), 0 12px 28px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(184,131,40,0.22)",
                position: "relative",
            }}>
                <iframe
                    src="/login"
                    title="MPCA ERP Login"
                    data-testid="login-live-iframe"
                    scrolling="no"
                    onLoad={hideIframeScrollbar}
                    style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                    loading="eager"
                />
                {/* Soft gold vignette on top so any residual browser edge blends with the deck */}
                <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    boxShadow: `inset 0 0 90px rgba(184,131,40,0.10)`,
                }} />
            </div>
        </div>
    );
};

// Editorial corner marks — thin gold brackets at the four corners of the slide.
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
const CaptionSlide = ({ eyebrow, headline, sub, footnote }) => (
    <div className="w-full h-full flex flex-col justify-center px-6 md:px-24">
        <div className="mb-4" style={{ fontFamily: DL.fontMono, fontSize: 13, letterSpacing: "0.34em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
            {eyebrow}
        </div>
        <h1 style={{
            fontFamily: DL.fontDisplay, fontWeight: 800,
            fontSize: "clamp(52px, 6.4vw, 96px)", lineHeight: 1.02,
            letterSpacing: "-0.02em", color: paper, maxWidth: 1400,
        }}>
            {headline}
        </h1>
        {sub && (
            <p className="mt-6" style={{
                fontFamily: DL.fontBody, fontStyle: "italic",
                fontSize: "clamp(20px, 1.7vw, 28px)",
                color: gold, maxWidth: 1200, lineHeight: 1.4,
            }}>
                {sub}
            </p>
        )}
        {footnote && (
            <div className="mt-10" style={{ fontFamily: DL.fontMono, fontSize: 13, letterSpacing: "0.28em", color: "rgba(245,239,230,0.55)", fontWeight: 600, textTransform: "uppercase" }}>
                {footnote}
            </div>
        )}
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Screenshot slides — near-full-bleed, minimal chrome
// ═════════════════════════════════════════════════════════════════════
const ScreenshotSlide = ({ src, caption }) => (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-12 py-6">
        <div className="w-full flex items-center justify-center" style={{ maxHeight: "82vh" }}>
            <img
                src={src}
                alt=""
                style={{
                    maxWidth: "100%", maxHeight: "82vh", height: "auto",
                    display: "block", objectFit: "contain",
                    borderRadius: 6,
                    boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
                    border: `2px solid ${gold}`,
                    background: paper,
                }}
                data-testid="screenshot-img"
            />
        </div>
        {caption && (
            <div className="mt-4 text-center" style={{ fontFamily: DL.fontMono, fontSize: 13, letterSpacing: "0.24em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
                {caption}
            </div>
        )}
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Final promise
// ═════════════════════════════════════════════════════════════════════
const SlideClose = () => (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 md:px-16 text-center">
        <div className="mb-6" style={{ fontFamily: DL.fontMono, fontSize: 13, letterSpacing: "0.34em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
            The Promise
        </div>
        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(44px, 5.6vw, 84px)", color: paper, lineHeight: 1.04, letterSpacing: "-0.02em" }}>
            Simpler for players.
        </div>
        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(44px, 5.6vw, 84px)", color: gold, lineHeight: 1.04, letterSpacing: "-0.02em" }}>
            Faster for divisions.
        </div>
        <div style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "clamp(44px, 5.6vw, 84px)", color: paper, lineHeight: 1.04, letterSpacing: "-0.02em" }}>
            Cleaner for MPCA.
        </div>
        <div className="mt-14" style={{ fontFamily: DL.fontMono, fontSize: 14, letterSpacing: "0.34em", color: gold, fontWeight: 700, textTransform: "uppercase" }}>
            Thank you · Questions welcome
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// Deck spec — 8 slides
// ═════════════════════════════════════════════════════════════════════
const SLIDES = [
    // 1 · Live login opener
    { render: () => <SlideLive /> },

    // 2 · Players caption
    { render: () => (
        <CaptionSlide
            eyebrow="Players"
            headline={<>One link. Documents up.<br /><span style={{ color: gold }}>Registered on the spot.</span></>}
            sub="No queues. No office visits. Everything happens in the player's own hands."
        />
    )},
    // 3 · Players screenshot
    { render: () => <ScreenshotSlide src="/deck-screenshots/public_reg_docs_first.png" caption="The player's registration link" /> },

    // 4 · Players AI caption
    { render: () => (
        <CaptionSlide
            eyebrow="Players · AI Check"
            headline={<>If anything is off,<br /><span style={{ color: gold }}>the player is told.</span></>}
            sub="AI reads every document, flags any issue, and lets the player fix it right away."
        />
    )},
    // 5 · Players AI screenshot (flagged, not fraud)
    { render: () => <ScreenshotSlide src="/deck-screenshots/player_ai_flagged.png" caption="AI · Flagged for Review · cites the exact issue" /> },

    // 6 · Grants caption
    { render: () => (
        <CaptionSlide
            eyebrow="Grants"
            headline={<>Every eligible scheme.<br /><span style={{ color: gold }}>One click to claim.</span></>}
            sub="Divisions see every scheme they qualify for, with the exact documents required."
        />
    )},
    // 7 · Grants screenshot (Division Secretary view · Claim buttons)
    { render: () => <ScreenshotSlide src="/deck-screenshots/schemes_division.png" caption="Division Secretary · Schemes Register · Claim buttons" /> },

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
            `}</style>

            {/* Slim gold progress bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.08)", zIndex: 5 }}>
                <div data-testid="launch-progress" style={{
                    width: `${progress}%`, height: "100%", background: gold,
                    transition: "width 320ms cubic-bezier(0.22,1,0.36,1)",
                    boxShadow: `0 0 12px ${gold}`,
                }} />
            </div>

            {/* Slide counter + exit (top-right) */}
            <div style={{ position: "absolute", top: 18, right: 22, display: "flex", gap: 14, alignItems: "center", zIndex: 5 }}>
                <span data-testid="launch-counter"
                    style={{ fontFamily: DL.fontMono, fontSize: 12, letterSpacing: "0.28em", color: gold, fontWeight: 700, opacity: 0.7 }}>
                    {String(slide + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
                <Link to="/dashboard" data-testid="launch-exit" title="Exit deck"
                    style={{ color: gold, opacity: 0.55, transition: "opacity 200ms" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.55}>
                    <X size={20} strokeWidth={2} />
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
