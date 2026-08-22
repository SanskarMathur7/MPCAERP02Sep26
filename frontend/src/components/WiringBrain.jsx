/**
 * MPCA Governance Controller · The Wiring Brain (Feb 2026 · Iter 102 · Interactive)
 * ─────────────────────────────────────────────────────────────────────────────────
 * A living SVG diagram of the MPCA governance matrix. Doubles as the login-page
 * left panel — engaging enough to hold a user while they open their password
 * manager.
 *
 * Interactions:
 *   · Auto-fire is ON by default at 500 ms cadence — multiple concurrent gold
 *     signals travel type → step → outcome, giving a "brain lit up" feel.
 *   · Click the "▶ Fire · auto" pill to pause auto-fire; a "Fire a signal"
 *     button then lets the user manually fire one at a time.
 *   · Hover ANY type or step node — all edges wired to that node light up in
 *     gold, and the node's own halo pulses. Mouse-out fades everything back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Zap } from "lucide-react";
import { DL } from "@/lib/designSystem";

const TYPES = [
    { id: "bcci",         label: "BCCI",             y: 90,  owner: "m" },
    { id: "interdiv",     label: "Inter Division",   y: 175, owner: "m" },
    { id: "camp",         label: "Pre-Tour Camp",    y: 260, owner: "d" },
    { id: "district",     label: "Inter District",   y: 345, owner: "d" },
    { id: "interschool",  label: "Inter-School",     y: 430, owner: "d" },
    { id: "interclub",    label: "Inter-Club (A)",   y: 515, owner: "d" },
    { id: "coaching",     label: "Coaching Camp",    y: 600, owner: "d" },
    { id: "vacation",     label: "Vacation Camp",    y: 685, owner: "d" },
];

const STEPS = [
    { id: "creation",   label: "Tournament Creation", y: 55 },
    { id: "pool",       label: "Pool (Basics)",       y: 120 },
    { id: "officials",  label: "Match Official Posting", y: 185 },
    { id: "squad",      label: "Squad",               y: 250 },
    { id: "sq_approve", label: "Squad Approval",      y: 315 },
    { id: "calendar",   label: "Match Calendar",      y: 400 },
    { id: "budget",     label: "Unified Budget",      y: 465 },
    { id: "finance",    label: "Finance Console",     y: 555 },
    { id: "closure",    label: "Tournament Closure",  y: 620 },
    { id: "visibility", label: "MPCA Visibility",     y: 685 },
];

const OUTCOMES = [
    { id: "mpca", label: "MPCA acts",     y: 215, tone: "m" },
    { id: "div",  label: "Division acts", y: 355, tone: "d" },
    { id: "auto", label: "Automatic",     y: 495, tone: "a" },
    { id: "na",   label: "Not applicable", y: 635, tone: "n" },
];

const IN_EDGES = [
    ["bcci", "creation", "m"], ["bcci", "pool", "m"], ["bcci", "officials", "m"], ["bcci", "squad", "m"], ["bcci", "calendar", "m"], ["bcci", "budget", "m"], ["bcci", "finance", "m"], ["bcci", "closure", "m"],
    ["interdiv", "creation", "m"], ["interdiv", "pool", "m"], ["interdiv", "squad", "d"], ["interdiv", "sq_approve", "m"], ["interdiv", "calendar", "m"], ["interdiv", "budget", "m"], ["interdiv", "finance", "m"], ["interdiv", "closure", "m"],
    ["camp", "squad", "d"], ["camp", "budget", "d"], ["camp", "finance", "d"], ["camp", "closure", "d"],
    ["district", "creation", "d"], ["district", "pool", "d"], ["district", "squad", "d"], ["district", "calendar", "d"], ["district", "budget", "d"], ["district", "finance", "d"], ["district", "closure", "d"],
    ["interschool", "creation", "d"], ["interschool", "squad", "d"], ["interschool", "budget", "d"], ["interschool", "finance", "d"], ["interschool", "closure", "d"],
    ["interclub", "creation", "d"], ["interclub", "squad", "d"], ["interclub", "budget", "d"], ["interclub", "finance", "d"], ["interclub", "closure", "d"],
    ["coaching", "creation", "d"], ["coaching", "squad", "d"], ["coaching", "budget", "d"], ["coaching", "finance", "d"],
    ["vacation", "creation", "d"], ["vacation", "squad", "d"], ["vacation", "budget", "d"], ["vacation", "finance", "d"],
];

const OUT_EDGES = [
    ["creation", "mpca", "m"], ["creation", "div", "d"], ["creation", "auto", "a"],
    ["pool", "mpca", "m"], ["pool", "div", "d"],
    ["officials", "mpca", "m"], ["officials", "div", "d"], ["officials", "na", "n"],
    ["squad", "mpca", "m"], ["squad", "div", "d"],
    ["sq_approve", "mpca", "m"], ["sq_approve", "na", "n"],
    ["calendar", "mpca", "m"], ["calendar", "div", "d"],
    ["budget", "mpca", "m"], ["budget", "div", "d"],
    ["finance", "mpca", "m"], ["finance", "div", "d"],
    ["closure", "mpca", "m"], ["closure", "div", "d"],
    ["visibility", "mpca", "m"], ["visibility", "div", "d"],
];

const TYPE_X = 165;
const STEP_X = 435;
const OUT_X  = 725;
// Feb 2026 · Iter 103 — calmer cadence for a "brain, breathing" feel.
// 1400ms between fires keeps the diagram legible; each pulse's total
// travel is 3.6s (1.8s per hop) with cubic ease-in-out for smooth motion.
const AUTO_INTERVAL_MS = 1400;
const PULSE_HOP_MS = 1800;
const PULSE_TOTAL_MS = PULSE_HOP_MS * 2;
const MAX_CONCURRENT_PULSES = 3;

const typeById = (id) => TYPES.find(t => t.id === id);
const stepById = (id) => STEPS.find(s => s.id === id);
const outById  = (id) => OUTCOMES.find(o => o.id === id);

const ownerColor = (o) => o === "m" ? DL.gold : o === "a" ? "#5FA3E0" : o === "n" ? "#7A6B4E" : "#C9A45F";

// Cubic ease-in-out — matches CSS cubic-bezier(0.42, 0, 0.58, 1)
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

let pulseSeq = 0;

export default function WiringBrain() {
    // Each pulse carries its own startTime — the RAF loop below drives their
    // positions frame-by-frame so new pulses added mid-cycle animate correctly
    // (SMIL `begin="0s"` is document-relative and would treat late-mount pulses
    // as already-completed, which broke continuous flow).
    const [pulses, setPulses] = useState([]);
    const [now, setNow] = useState(() => performance.now());
    const [autoFire, setAutoFire] = useState(true);
    const [hoveredType, setHoveredType] = useState(null);
    const [hoveredStep, setHoveredStep] = useState(null);
    const pulsesRef = useRef(pulses);
    pulsesRef.current = pulses;

    // RAF loop — one setNow per frame drives smooth interpolation of every
    // active pulse. Runs continuously (cheap: only 3 max concurrent pulses).
    useEffect(() => {
        let raf;
        const loop = () => {
            setNow(performance.now());
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Sweeper — drops finished pulses from state every 400ms
    useEffect(() => {
        const iv = setInterval(() => {
            const t = performance.now();
            setPulses(prev => {
                const kept = prev.filter(p => t - p.startTime <= PULSE_TOTAL_MS + 100);
                return kept.length === prev.length ? prev : kept;
            });
        }, 400);
        return () => clearInterval(iv);
    }, []);

    const firePulse = useCallback((typeId = null, stepId = null) => {
        let candidates = IN_EDGES;
        if (typeId) candidates = candidates.filter(e => e[0] === typeId);
        if (stepId) candidates = candidates.filter(e => e[1] === stepId);
        if (!candidates.length) candidates = IN_EDGES;
        const inE = candidates[Math.floor(Math.random() * candidates.length)];
        const outs = OUT_EDGES.filter(e => e[0] === inE[1]);
        const outE = outs[Math.floor(Math.random() * outs.length)] || OUT_EDGES[0];
        const key = ++pulseSeq;
        setPulses(prev => [...prev, { key, t: inE[0], s: inE[1], o: outE[1], owner: inE[2], startTime: performance.now() }]);
    }, []);

    useEffect(() => {
        if (!autoFire) return undefined;
        // Fire once immediately when auto-fire flips on
        firePulse();
        const iv = setInterval(() => {
            // Cap concurrent pulses so the flow stays legible & calm
            if (pulsesRef.current.length < MAX_CONCURRENT_PULSES) firePulse();
        }, AUTO_INTERVAL_MS);
        return () => clearInterval(iv);
    }, [autoFire, firePulse]);

    // Highlight edge if it touches the hovered node OR is currently pulsing
    const isEdgeActive = useCallback((tId, sId) => {
        if (hoveredType && hoveredType === tId) return true;
        if (hoveredStep && hoveredStep === sId) return true;
        return pulses.some(p => p.t === tId && p.s === sId);
    }, [pulses, hoveredType, hoveredStep]);
    const isOutEdgeActive = useCallback((sId, oId) => {
        if (hoveredStep && hoveredStep === sId) return true;
        return pulses.some(p => p.s === sId && p.o === oId);
    }, [pulses, hoveredStep]);

    const edgeStyle = (owner, active) => ({
        stroke: active ? ownerColor(owner) : `rgba(200,180,138,${owner === "m" ? 0.28 : 0.11})`,
        strokeWidth: active ? 2 : 1,
        fill: "none",
        transition: "stroke 240ms ease, stroke-width 240ms ease",
        cursor: "default",
    });

    return (
        <div style={{
            position: "relative",
            width: "100%", height: "100%",
            background: `radial-gradient(ellipse at 30% 40%, ${DL.emerald} 0%, ${DL.ink} 55%, ${DL.ink2} 100%)`,
            overflow: "hidden",
        }}>
            {/* dot-grid overlay */}
            <div aria-hidden style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                backgroundImage: "radial-gradient(rgba(184,131,40,0.08) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
                opacity: 0.6,
            }} />

            <div style={{
                position: "absolute", top: 60, left: 32, zIndex: 3,
                color: DL.gold, opacity: 0.85,
                fontFamily: DL.fontMono, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.24em", textTransform: "uppercase",
            }} data-testid="brain-eyebrow">
                / wired cricket decisions
            </div>
            <div style={{
                position: "absolute", top: 88, left: 32, zIndex: 3, color: DL.paper,
                fontFamily: DL.fontDisplay, fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em",
                maxWidth: 420, lineHeight: 1.1,
            }}>
                MPCA&apos;s AI-Based ERP
            </div>

            {/* Control pills — top-right of brain panel */}
            <div style={{
                position: "absolute", top: 24, right: 24, zIndex: 4, display: "flex", gap: 8, alignItems: "center",
            }} data-testid="brain-controls">
                <button
                    type="button"
                    onClick={() => setAutoFire(v => !v)}
                    data-testid="brain-toggle-auto"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.18em] transition-all"
                    style={{
                        backgroundColor: autoFire ? DL.gold : "rgba(14,31,27,0.55)",
                        color: autoFire ? DL.ink : DL.gold,
                        border: `1px solid ${DL.gold}`,
                        fontFamily: DL.fontMono,
                        fontWeight: 700,
                        backdropFilter: "blur(8px)",
                    }}
                    title={autoFire ? "Pause auto-fire" : "Resume auto-fire"}
                >
                    {autoFire ? <Pause size={11} strokeWidth={2.5} /> : <Play size={11} strokeWidth={2.5} />}
                    {autoFire ? "Live" : "Paused"}
                </button>
                <button
                    type="button"
                    onClick={() => firePulse()}
                    data-testid="brain-fire-signal"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.18em] transition-all"
                    style={{
                        backgroundColor: "rgba(14,31,27,0.55)",
                        color: DL.paper,
                        border: `1px solid ${DL.gold}`,
                        fontFamily: DL.fontMono,
                        fontWeight: 700,
                        backdropFilter: "blur(8px)",
                        cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = DL.gold; e.currentTarget.style.color = DL.ink; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(14,31,27,0.55)"; e.currentTarget.style.color = DL.paper; }}
                    title="Fire one signal now"
                >
                    <Zap size={11} strokeWidth={2.5} />
                    Fire a signal
                </button>
            </div>

            {/* live SVG diagram */}
            <svg
                viewBox="0 0 860 780"
                preserveAspectRatio="xMidYMid meet"
                style={{ position: "absolute", inset: 0, top: 200, width: "100%", height: "calc(100% - 240px)", zIndex: 1 }}
                aria-label="MPCA Governance wiring brain"
                onMouseLeave={() => { setHoveredType(null); setHoveredStep(null); }}
            >
                {/* Phase bands — outlines only, no labels */}
                <g opacity={0.12}>
                    <rect x={STEP_X - 130} y={30}  width={260} height={310} rx={12} fill="none" stroke={DL.gold} strokeDasharray="2 4" />
                    <rect x={STEP_X - 130} y={370} width={260} height={125}  rx={12} fill="none" stroke={DL.gold} strokeDasharray="2 4" />
                    <rect x={STEP_X - 130} y={525} width={260} height={185} rx={12} fill="none" stroke={DL.gold} strokeDasharray="2 4" />
                </g>

                {/* Type → Step edges */}
                <g>
                    {IN_EDGES.map(([tId, sId, owner], i) => {
                        const t = typeById(tId), s = stepById(sId);
                        const active = isEdgeActive(tId, sId);
                        const d = `M${TYPE_X + 18},${t.y} C${(TYPE_X + STEP_X) / 2},${t.y} ${(TYPE_X + STEP_X) / 2},${s.y} ${STEP_X - 18},${s.y}`;
                        return <path key={`in-${i}`} d={d} style={edgeStyle(owner, active)} />;
                    })}
                </g>
                {/* Step → Outcome edges */}
                <g>
                    {OUT_EDGES.map(([sId, oId, tone], i) => {
                        const s = stepById(sId), o = outById(oId);
                        const active = isOutEdgeActive(sId, oId);
                        const d = `M${STEP_X + 18},${s.y} C${(STEP_X + OUT_X) / 2},${s.y} ${(STEP_X + OUT_X) / 2},${o.y} ${OUT_X - 18},${o.y}`;
                        return <path key={`out-${i}`} d={d} style={edgeStyle(tone, active)} />;
                    })}
                </g>

                {/* Type nodes — hoverable */}
                <g>
                    {TYPES.map(t => {
                        const hovered = hoveredType === t.id;
                        const active = hovered || pulses.some(p => p.t === t.id);
                        return (
                            <g
                                key={t.id}
                                transform={`translate(${TYPE_X},${t.y})`}
                                onMouseEnter={() => setHoveredType(t.id)}
                                onMouseLeave={() => setHoveredType(null)}
                                onClick={() => firePulse(t.id)}
                                style={{ cursor: "pointer" }}
                                data-testid={`brain-type-${t.id}`}
                            >
                                {/* larger invisible hit target */}
                                <circle r={22} fill="transparent" />
                                {hovered && <circle r={18} fill={DL.gold} opacity={0.15} />}
                                <circle r={active ? 12 : 8} fill={t.owner === "m" ? DL.gold : "#C9A45F"} opacity={active ? 1 : 0.85} style={{ transition: "r 300ms ease, opacity 300ms ease" }} />
                                <circle r={4} fill={DL.paper} opacity={0.9} />
                                <text x={-24} y={4} textAnchor="end" fill={DL.paper} fontFamily={DL.fontBody} fontSize={11.5} fontWeight={hovered ? 800 : 700} style={{ transition: "font-weight 240ms" }}>{t.label}</text>
                            </g>
                        );
                    })}
                </g>

                {/* Step nodes — hoverable */}
                <g>
                    {STEPS.map(s => {
                        const hovered = hoveredStep === s.id;
                        const active = hovered || pulses.some(p => p.s === s.id);
                        return (
                            <g
                                key={s.id}
                                transform={`translate(${STEP_X},${s.y})`}
                                onMouseEnter={() => setHoveredStep(s.id)}
                                onMouseLeave={() => setHoveredStep(null)}
                                onClick={() => firePulse(null, s.id)}
                                style={{ cursor: "pointer" }}
                                data-testid={`brain-step-${s.id}`}
                            >
                                <circle r={22} fill="transparent" />
                                {hovered && <circle r={20} fill={DL.gold} opacity={0.18} />}
                                <circle r={active ? 15 : 10} fill={DL.emerald} stroke={DL.gold} strokeWidth={active ? 2 : 1} opacity={active ? 1 : 0.9} style={{ transition: "r 300ms ease" }} />
                                <circle r={5} fill={DL.paper} opacity={active ? 1 : 0.5} />
                                <text x={20} y={2} fill={DL.paper} fontFamily={DL.fontBody} fontSize={11} fontWeight={hovered ? 800 : 500} style={{ transition: "font-weight 240ms" }}>{s.label}</text>
                            </g>
                        );
                    })}
                </g>

                {/* Outcome nodes */}
                <g>
                    {OUTCOMES.map(o => {
                        const active = pulses.some(p => p.o === o.id);
                        return (
                            <g key={o.id} transform={`translate(${OUT_X},${o.y})`}>
                                <circle r={active ? 14 : 10} fill={ownerColor(o.tone)} opacity={active ? 1 : 0.9} style={{ transition: "r 300ms ease" }} />
                                <circle r={5} fill={DL.paper} opacity={0.9} />
                                <text x={20} y={4} fill={DL.paper} fontFamily={DL.fontBody} fontSize={11.5} fontWeight={700}>{o.label}</text>
                            </g>
                        );
                    })}
                </g>

                {/* All active pulses — positions computed each RAF frame */}
                {pulses.map(p => {
                    const tNode = typeById(p.t), sNode = stepById(p.s), oNode = outById(p.o);
                    if (!tNode || !sNode || !oNode) return null;
                    const age = now - p.startTime;
                    if (age < 0 || age > PULSE_TOTAL_MS) return null;

                    let x1, y1, x2, y2, hopProgress;
                    if (age < PULSE_HOP_MS) {
                        hopProgress = age / PULSE_HOP_MS;
                        x1 = TYPE_X + 18; y1 = tNode.y;
                        x2 = STEP_X - 18; y2 = sNode.y;
                    } else {
                        hopProgress = (age - PULSE_HOP_MS) / PULSE_HOP_MS;
                        x1 = STEP_X + 18; y1 = sNode.y;
                        x2 = OUT_X - 18;  y2 = oNode.y;
                    }
                    const eased = easeInOut(hopProgress);
                    const cx = x1 + (x2 - x1) * eased;
                    const cy = y1 + (y2 - y1) * eased;
                    // Opacity envelope: fade-in over first 15%, hold, fade-out over last 15%
                    let op = 0.9;
                    if (hopProgress < 0.15) op = (hopProgress / 0.15) * 0.9;
                    else if (hopProgress > 0.85) op = ((1 - hopProgress) / 0.15) * 0.9;

                    return (
                        <circle
                            key={p.key}
                            cx={cx}
                            cy={cy}
                            r={3.5}
                            fill={DL.gold}
                            opacity={op}
                            style={{ filter: `drop-shadow(0 0 6px ${DL.gold})` }}
                        />
                    );
                })}
            </svg>

            {/* Minimal live indicator — bottom-left, no data points */}
            <div style={{
                position: "absolute", bottom: 22, left: 32, zIndex: 3,
                color: DL.gold, opacity: 0.6, fontFamily: DL.fontMono, fontSize: 9,
                textTransform: "uppercase", letterSpacing: "0.24em",
            }} data-testid="brain-live-count">
                {autoFire ? "Live · signals flowing" : pulses.length > 0 ? "Draining…" : "Idle · fire to see it flow"}
            </div>
        </div>
    );
}
