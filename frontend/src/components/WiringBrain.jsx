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
import { Play, Pause, Zap, RotateCcw, Sparkles } from "lucide-react";
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
    // Pulses are React state (added on fire, removed on sweep) — but their
    // per-frame position/opacity is written directly to the SVG circles via
    // refs. This keeps the whole diagram (edges, nodes, labels) out of the
    // React reconciler at 60fps; only pulse add/remove and hover trigger a
    // re-render.
    const [pulses, setPulses] = useState([]);
    const [autoFire, setAutoFire] = useState(true);
    const [hoveredType, setHoveredType] = useState(null);
    const [hoveredStep, setHoveredStep] = useState(null);
    // Iter 116 — first-time coach mark. Persists in localStorage so repeat
    // visitors don't get nagged.
    const [coachVisible, setCoachVisible] = useState(false);
    const setCoachDismissed = useCallback(() => {
        setCoachVisible(false);
        try { window.localStorage.setItem("mpca_brain_coach_seen", "1"); } catch (_) { /* ignore */ }
    }, []);
    useEffect(() => {
        try {
            if (window.localStorage.getItem("mpca_brain_coach_seen") === "1") return;
        } catch (_) { /* ignore */ }
        const showT = setTimeout(() => setCoachVisible(true), 1600);
        const hideT = setTimeout(() => setCoachDismissed(), 8000);
        return () => { clearTimeout(showT); clearTimeout(hideT); };
    }, [setCoachDismissed]);
    const pulsesRef = useRef(pulses);
    pulsesRef.current = pulses;
    // Map<pulseKey, SVGCircleElement>
    const pulseElsRef = useRef(new Map());

    // RAF loop — writes cx/cy/opacity directly to each pulse's <circle>.
    // No setState, so React does not reconcile per frame.
    useEffect(() => {
        let raf;
        const loop = () => {
            const t = performance.now();
            for (const p of pulsesRef.current) {
                const el = pulseElsRef.current.get(p.key);
                if (!el) continue;
                const tNode = typeById(p.t), sNode = stepById(p.s), oNode = outById(p.o);
                if (!tNode || !sNode || !oNode) continue;
                const age = t - p.startTime;
                if (age < 0 || age > PULSE_TOTAL_MS) continue;

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
                let op = 0.9;
                if (hopProgress < 0.15) op = (hopProgress / 0.15) * 0.9;
                else if (hopProgress > 0.85) op = ((1 - hopProgress) / 0.15) * 0.9;

                el.setAttribute("cx", cx);
                el.setAttribute("cy", cy);
                el.setAttribute("opacity", op);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Sweeper — drops finished pulses from state every 400ms and releases refs
    useEffect(() => {
        const iv = setInterval(() => {
            const t = performance.now();
            setPulses(prev => {
                const kept = prev.filter(p => t - p.startTime <= PULSE_TOTAL_MS + 100);
                if (kept.length === prev.length) return prev;
                // Release refs for dropped pulses
                const keptKeys = new Set(kept.map(p => p.key));
                for (const key of pulseElsRef.current.keys()) {
                    if (!keptKeys.has(key)) pulseElsRef.current.delete(key);
                }
                return kept;
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
        // Iter 116 — Declutter: resting edges are barely-visible whispers so
        // the diagram reads clean at rest; pulse + hover still pop them bright.
        stroke: active ? ownerColor(owner) : `rgba(200,180,138,${owner === "m" ? 0.09 : 0.05})`,
        strokeWidth: active ? 2 : 0.75,
        fill: "none",
        transition: "stroke 240ms ease, stroke-width 240ms ease, opacity 240ms ease",
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

            {/* ── Corner trim marks · institutional-blueprint detail ── */}
            <svg aria-hidden width="18" height="18" style={{ position: "absolute", top: 18, left: 18, zIndex: 3, opacity: 0.55 }}>
                <path d="M0 0 L18 0 M0 0 L0 18" stroke={DL.gold} strokeWidth="1.25" fill="none" />
            </svg>
            <svg aria-hidden width="18" height="18" style={{ position: "absolute", top: 18, right: 18, zIndex: 3, opacity: 0.55 }}>
                <path d="M0 0 L18 0 M18 0 L18 18" stroke={DL.gold} strokeWidth="1.25" fill="none" />
            </svg>
            <svg aria-hidden width="18" height="18" style={{ position: "absolute", bottom: 18, left: 18, zIndex: 3, opacity: 0.55 }}>
                <path d="M0 18 L18 18 M0 0 L0 18" stroke={DL.gold} strokeWidth="1.25" fill="none" />
            </svg>
            <svg aria-hidden width="18" height="18" style={{ position: "absolute", bottom: 18, right: 18, zIndex: 3, opacity: 0.55 }}>
                <path d="M0 18 L18 18 M18 0 L18 18" stroke={DL.gold} strokeWidth="1.25" fill="none" />
            </svg>

            {/* ── Compact brand mark · logo + short wordmark, top-left ── */}
            <div style={{
                position: "absolute", top: 34, left: 40, zIndex: 3,
                display: "flex", alignItems: "center", gap: 12,
            }} data-testid="brain-brand-lockup">
                <img
                    src="/brand/mpca-logo.png"
                    alt="MPCA emblem"
                    style={{
                        width: 44, height: 44, objectFit: "contain",
                        filter: "brightness(0) saturate(100%) invert(72%) sepia(56%) saturate(388%) hue-rotate(2deg) brightness(94%) contrast(90%)",
                        opacity: 0.9,
                    }}
                />
                <span style={{
                    color: DL.gold, opacity: 0.9,
                    fontFamily: DL.fontMono, fontSize: 13, fontWeight: 800,
                    letterSpacing: "0.28em", textTransform: "uppercase",
                }}>
                    MPCA · ERP
                </span>
            </div>

            {/* Control chips — top-right · icon-only trio (play/pause · fire · reset) */}
            <div style={{
                position: "absolute", top: 34, right: 24, zIndex: 4, display: "flex", gap: 8, alignItems: "center",
            }} data-testid="brain-controls">
                <IconChip
                    onClick={() => setAutoFire(v => !v)}
                    testid="brain-toggle-auto"
                    title={autoFire ? "Pause auto-fire" : "Resume auto-fire"}
                    active={autoFire}
                >
                    {autoFire ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
                </IconChip>
                <IconChip
                    onClick={() => { setCoachDismissed(); firePulse(); }}
                    testid="brain-fire-signal"
                    title="Fire one signal now"
                >
                    <Zap size={15} strokeWidth={2.5} />
                </IconChip>
                <IconChip
                    onClick={() => setPulses([])}
                    testid="brain-reset"
                    title="Clear all pulses"
                >
                    <RotateCcw size={15} strokeWidth={2.5} />
                </IconChip>
            </div>

            {/* live SVG diagram */}
            <svg
                viewBox="0 0 860 780"
                preserveAspectRatio="xMidYMid meet"
                style={{ position: "absolute", inset: 0, top: 96, width: "100%", height: "calc(100% - 130px)", zIndex: 1 }}
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
                    {TYPES.map((t, idx) => {
                        const hovered = hoveredType === t.id;
                        const active = hovered || pulses.some(p => p.t === t.id);
                        const haloClass = `d${(idx % 6) + 1}`;
                        return (
                            <g
                                key={t.id}
                                transform={`translate(${TYPE_X},${t.y})`}
                                onMouseEnter={() => setHoveredType(t.id)}
                                onMouseLeave={() => setHoveredType(null)}
                                onClick={() => { setCoachDismissed(); firePulse(t.id); }}
                                style={{ cursor: "pointer" }}
                                data-testid={`brain-type-${t.id}`}
                            >
                                {/* larger invisible hit target */}
                                <circle r={22} fill="transparent" />
                                {/* Iter 116 · Breathing halo — subtle "I'm alive" */}
                                <circle
                                    className={`brain-halo ${haloClass}`}
                                    r={12}
                                    fill="none"
                                    stroke={DL.gold}
                                    strokeWidth={1.25}
                                    opacity={0}
                                />
                                {hovered && <circle r={18} fill={DL.gold} opacity={0.22} />}
                                <circle
                                    r={hovered ? 13 : active ? 12 : 8}
                                    fill={t.owner === "m" ? DL.gold : "#C9A45F"}
                                    opacity={active ? 1 : 0.85}
                                    style={{ transition: "r 240ms cubic-bezier(0.22,1,0.36,1), opacity 300ms ease", filter: hovered ? `drop-shadow(0 0 8px ${DL.gold})` : "none" }}
                                />
                                <circle r={4} fill={DL.paper} opacity={0.9} />
                                <text x={-28} y={6} textAnchor="end" fill={DL.paper} fontFamily={DL.fontBody} fontSize={19} fontWeight={hovered ? 800 : 700} style={{ transition: "font-weight 240ms" }}>{t.label}</text>
                            </g>
                        );
                    })}
                </g>

                {/* Step nodes — hoverable */}
                <g>
                    {STEPS.map((s, idx) => {
                        const hovered = hoveredStep === s.id;
                        const active = hovered || pulses.some(p => p.s === s.id);
                        const haloClass = `d${(idx % 6) + 1}`;
                        return (
                            <g
                                key={s.id}
                                transform={`translate(${STEP_X},${s.y})`}
                                onMouseEnter={() => setHoveredStep(s.id)}
                                onMouseLeave={() => setHoveredStep(null)}
                                onClick={() => { setCoachDismissed(); firePulse(null, s.id); }}
                                style={{ cursor: "pointer" }}
                                data-testid={`brain-step-${s.id}`}
                            >
                                <circle r={22} fill="transparent" />
                                <circle
                                    className={`brain-halo ${haloClass}`}
                                    r={12}
                                    fill="none"
                                    stroke={DL.gold}
                                    strokeWidth={1.25}
                                    opacity={0}
                                />
                                {hovered && <circle r={20} fill={DL.gold} opacity={0.24} />}
                                <circle
                                    r={hovered ? 16 : active ? 15 : 10}
                                    fill={DL.emerald}
                                    stroke={DL.gold}
                                    strokeWidth={active ? 2 : 1}
                                    opacity={active ? 1 : 0.9}
                                    style={{ transition: "r 240ms cubic-bezier(0.22,1,0.36,1)", filter: hovered ? `drop-shadow(0 0 8px ${DL.gold})` : "none" }}
                                />
                                <circle r={5} fill={DL.paper} opacity={active ? 1 : 0.5} />
                                <text x={24} y={5} fill={DL.paper} fontFamily={DL.fontBody} fontSize={18.5} fontWeight={hovered ? 800 : 600} style={{ transition: "font-weight 240ms" }}>{s.label}</text>
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
                                <text x={24} y={6} fill={DL.paper} fontFamily={DL.fontBody} fontSize={19} fontWeight={700}>{o.label}</text>
                            </g>
                        );
                    })}
                </g>

                {/* All active pulses — refs let the RAF loop mutate cx/cy/opacity
                    directly, so this <circle> array is stable between renders. */}
                {pulses.map(p => {
                    const tNode = typeById(p.t);
                    if (!tNode) return null;
                    return (
                        <circle
                            key={p.key}
                            ref={el => {
                                if (el) pulseElsRef.current.set(p.key, el);
                                else pulseElsRef.current.delete(p.key);
                            }}
                            cx={TYPE_X + 18}
                            cy={tNode.y}
                            r={3.5}
                            fill={DL.gold}
                            opacity={0}
                            style={{ filter: `drop-shadow(0 0 6px ${DL.gold})` }}
                        />
                    );
                })}
            </svg>

            {/* Iter 116 — First-time coach mark: gold pill near center-bottom
                that dismisses on click or after 8s. Encourages first tap. */}
            {coachVisible && (
                <div
                    onClick={setCoachDismissed}
                    data-testid="brain-coach-mark"
                    className="brain-coach-in"
                    style={{
                        position: "absolute", bottom: 72, left: "50%", transform: "translateX(-50%)",
                        zIndex: 5, display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 16px", borderRadius: 999,
                        background: `linear-gradient(135deg, ${DL.gold} 0%, #A0731F 100%)`,
                        color: DL.ink, fontFamily: DL.fontMono, fontSize: 12, fontWeight: 800,
                        letterSpacing: "0.18em", textTransform: "uppercase",
                        boxShadow: "0 16px 30px -12px rgba(184,131,40,0.55), 0 2px 8px rgba(14,31,27,0.35)",
                        cursor: "pointer",
                    }}
                >
                    <Sparkles size={13} strokeWidth={2.5} />
                    Tap any node to fire a signal
                </div>
            )}

            {/* Anchor stamp — bottom-right (behind trim mark) */}
            <div style={{
                position: "absolute", bottom: 24, right: 48, zIndex: 3,
                color: DL.gold, opacity: 0.55, fontFamily: DL.fontMono, fontSize: 12,
                textTransform: "uppercase", letterSpacing: "0.28em",
            }} data-testid="brain-stamp">
                MPCA · Est. 1957
            </div>

            {/* Breathing halo + coach-mark animations */}
            <style>{`
                @keyframes brainBreathe {
                    0%, 100% { opacity: 0; r: 12; }
                    50%      { opacity: 0.42; r: 20; }
                }
                @keyframes brainCoachIn {
                    0% { opacity: 0; transform: translate(-50%, 8px); }
                    100% { opacity: 1; transform: translate(-50%, 0); }
                }
                .brain-coach-in { animation: brainCoachIn 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
                .brain-halo    { animation: brainBreathe 2400ms ease-in-out infinite; transform-origin: center; }
                .brain-halo.d1 { animation-delay: 0ms; }
                .brain-halo.d2 { animation-delay: 400ms; }
                .brain-halo.d3 { animation-delay: 800ms; }
                .brain-halo.d4 { animation-delay: 1200ms; }
                .brain-halo.d5 { animation-delay: 1600ms; }
                .brain-halo.d6 { animation-delay: 2000ms; }
            `}</style>
        </div>
    );
}

// Small icon-only chip used by the top-right controls (play/pause · fire · reset).
const IconChip = ({ onClick, testid, title, active = false, children }) => (
    <button
        type="button"
        onClick={onClick}
        data-testid={testid}
        title={title}
        aria-label={title}
        className="inline-flex items-center justify-center rounded-full transition-all"
        style={{
            width: 32, height: 32,
            backgroundColor: active ? DL.gold : "rgba(14,31,27,0.55)",
            color: active ? DL.ink : DL.gold,
            border: `1px solid ${DL.gold}`,
            backdropFilter: "blur(8px)",
            cursor: "pointer",
        }}
        onMouseEnter={(e) => {
            if (active) return;
            e.currentTarget.style.backgroundColor = DL.gold;
            e.currentTarget.style.color = DL.ink;
        }}
        onMouseLeave={(e) => {
            if (active) return;
            e.currentTarget.style.backgroundColor = "rgba(14,31,27,0.55)";
            e.currentTarget.style.color = DL.gold;
        }}
    >
        {children}
    </button>
);
